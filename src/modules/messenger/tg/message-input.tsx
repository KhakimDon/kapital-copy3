// Rich contentEditable message input — a faithful port of Telegram Web A's
// `middle/composer/MessageInput.tsx`. Replaces the plain `<textarea>` with a
// `contentEditable` div (`#editable-message-text`) that renders formatting LIVE
// as you type or apply it: bold/italic/underline/strike/monospace shown inline,
// spoiler as the tiled-dot texture, links as coloured spans, custom emoji as
// inline glyph spans.
//
// The DOM is the source of truth (the div is uncontrolled — React never renders
// its children); the parent composer talks to it through an imperative handle
// (see `TgMessageInputHandle`). At send time `getFormatted()` serialises the
// live DOM → `{ text, entities }` (UTF-16 offsets, matching the backend
// `TgEntity`). Typed/pasted markdown markers (`**b**`, `` `c` ``, `||s||`,
// `[t](url)`, …) are ALSO honoured at serialise time via the reference's
// `parseMarkdown` HTML pass, so the previous wave's markdown→entity path keeps
// working. Editing a message loads its text+entities back as styled DOM
// (`setFormatted`).
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { tgCustomEmojiUrl, type TgEntity } from "./api";
import type { FormatKind } from "./text-formatter";
import { AnimatedSticker } from "./animated-sticker";
import { useTgCustomEmoji } from "./media";

// ── the imperative surface the composer drives ────────────────────────────────
export type TgMessageInputHandle = {
  /** Focus the editable and place the caret at the end. */
  focus: () => void;
  /** Empty the input (and show the placeholder again). */
  clear: () => void;
  /** True when there is no visible text. */
  isEmpty: () => boolean;
  /** The current visible plain text (markers kept verbatim; used for @mention). */
  getPlainText: () => string;
  /** Serialise the live DOM → clean text + MTProto entities (send/edit path). */
  getFormatted: () => { text: string; entities: TgEntity[] };
  /** Load text (+ optional entities) back in as styled DOM (edit prefill). */
  setFormatted: (text: string, entities?: TgEntity[] | null) => void;
  /** Insert plain text at the caret (emoji picker / paste). */
  insertText: (s: string) => void;
  /** Delete the selection, else one char before the caret (symbol-menu ⌫). */
  deleteBackward: () => void;
  /** Toggle a format on the current selection, rendered as real DOM. */
  applyFormat: (kind: FormatKind, url?: string) => void;
  /** True when a non-empty selection sits inside the input. */
  hasSelection: () => boolean;
  /** UTF-16 caret offset within the visible plain text (for @mention). */
  getCaretOffset: () => number;
  /** Replace `count` code units before the caret with `insert` (@mention pick). */
  replaceBeforeCaret: (count: number, insert: string) => void;
  /** Insert a custom-emoji sticker as an inline atomic node at the caret. */
  insertCustomEmoji: (documentId: string, fallback: string) => void;
};

type Props = {
  placeholder: string;
  /** Scopes the auth'd blob fetch for inline custom-emoji stickers. */
  accountId: number;
  /** Fires on every content change with the current visible plain text. */
  onUpdate: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onPaste: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  /** Fires when the selection may have changed (mouse/keyboard/after a format). */
  onSelectionChange: () => void;
};

// ── entity ↔ DOM mapping ──────────────────────────────────────────────────────

/** Entity types we can round-trip through the input DOM (others → plain text). */
const BUILDABLE = new Set<TgEntity["type"]>([
  "bold", "italic", "underline", "strike", "spoiler",
  "code", "pre", "blockquote", "textUrl", "customEmoji",
]);
/** `data-entity-type` values we trust verbatim on a node. */
const KNOWN_ENTITY_TYPES = new Set<string>([
  "bold", "italic", "underline", "strike", "spoiler", "code", "pre",
  "blockquote", "url", "textUrl", "mention", "mentionName", "hashtag",
  "botCommand", "email", "phone", "cashtag", "customEmoji",
]);

/** Map a live DOM element to the entity type it represents (or undefined). */
function entityTypeOf(el: HTMLElement): TgEntity["type"] | undefined {
  const dt = el.dataset.entityType;
  if (dt && KNOWN_ENTITY_TYPES.has(dt)) return dt as TgEntity["type"];
  if (el.dataset.documentId) return "customEmoji";
  switch (el.tagName) {
    case "B": case "STRONG": return "bold";
    case "I": case "EM": return "italic";
    case "U": case "INS": return "underline";
    case "S": case "STRIKE": case "DEL": return "strike";
    case "CODE": return "code";
    case "PRE": return "pre";
    case "BLOCKQUOTE": return "blockquote";
    case "A": return "textUrl";
    default: break;
  }
  if (el.classList.contains("spoiler")) return "spoiler";
  return undefined;
}

// ── html helpers ──────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// ── inline custom-emoji sticker (input) ───────────────────────────────────────
// A custom emoji inside the editable is an ATOMIC, non-editable node: the browser
// treats a `contenteditable="false"` inline element as one unit — the caret steps
// over it and backspace deletes it whole. The node itself only carries the
// identity (`data-document-id`) + the fallback glyph (`data-alt`) the serialiser
// needs; the VISUAL (image / video / TGS lottie) is a React subtree portaled into
// it, reusing the same auth'd-blob + AnimatedSticker primitives as the bubble
// renderer (entities.tsx). The host is created EMPTY so the portal owns its only
// children (no double-render); CSS reserves ~1.25em so there's no reflow before
// React mounts. Matches the reference's `.custom-emoji` class + `data-document-id`
// / `data-entity-type` (the reference uses an <img> host + a canvas overlay for
// animation; we host a React subtree instead so TGS/webm animate natively).
const CE_HOST_CLASS = "custom-emoji";

type CeHost = { el: HTMLElement; documentId: string; fallback: string; key: string };

/** HTML for one empty atomic custom-emoji host — the React visual portals in. */
function customEmojiHostHtml(documentId: string, fallback: string): string {
  return (
    `<span class="${CE_HOST_CLASS}" data-entity-type="customEmoji"` +
    ` data-document-id="${escapeAttr(documentId)}" data-alt="${escapeAttr(fallback)}"` +
    ` contenteditable="false"></span>`
  );
}

/** The sticker visual for an inline custom emoji — mirrors entities.tsx's bubble
 *  renderer, reusing `useTgCustomEmoji` (auth'd blob + kind) and `AnimatedSticker`
 *  (TGS lottie). The fallback glyph shows while loading and if the fetch fails, so
 *  a custom emoji never renders blank. */
function InputCustomEmoji({
  accountId,
  documentId,
  fallback,
}: {
  accountId: number;
  documentId: string;
  fallback: string;
}) {
  const { res } = useTgCustomEmoji(tgCustomEmojiUrl(accountId, documentId));
  if (!res) return <span className="tg-input-emoji-fallback">{fallback}</span>;
  if (res.kind === "tgs") return <AnimatedSticker tgsUrl={res.url} size={20} className="tg-input-emoji-media" />;
  if (res.kind === "webm")
    return <video className="tg-input-emoji-media" src={res.url} autoPlay loop muted playsInline />;
  return <img className="tg-input-emoji-media" src={res.url} alt={fallback} draggable={false} />;
}

// ── markdown normalisation (reference `parseMarkdown`, adapted to our markers) ──
// Converts markdown markers still present as PLAIN text into real tags, and
// normalises Enter markup (<div>/<br>) into literal newlines — so the DOM walk
// afterwards only ever sees entity tags + text. Live-formatted tags already in
// the html are left untouched (they carry no markers).
function normalizeMarkdown(html: string): string {
  let s = html;
  s = s.replace(/&nbsp;/g, " ");
  // Enter markup → newlines
  s = s.replace(/<div><br[^>]*><\/div>/g, "\n");
  s = s.replace(/<br[^>]*>/g, "\n");
  s = s.replace(/<\/div>\s*<div>/g, "\n");
  s = s.replace(/<div[^>]*>/g, "\n");
  s = s.replace(/<\/div>/g, "");
  s = s.replace(/<\/p>\s*<p[^>]*>/g, "\n");
  s = s.replace(/<p[^>]*>/g, "\n");
  s = s.replace(/<\/p>/g, "");
  // links: [label](url)
  s = s.replace(/\[([^\]\n]+)]\(([^)\s]+)\)/g, (_m, label: string, link: string) => {
    const url = /^[a-z][\w+.-]*:\/\//i.test(link)
      ? link
      : link.includes("@")
        ? `mailto:${link}`
        : `https://${link}`;
    return `<a href="${escapeAttr(url)}" class="text-entity-link">${label}</a>`;
  });
  // fenced + inline code (guarded so markers inside code/pre are left alone)
  s = s.replace(/^`{3}(.*?)[\n\r](.*?[\n\r]?)`{3}/gms, '<pre data-language="$1">$2</pre>');
  s = s.replace(/^`{3}[\n\r]?(.*?)[\n\r]?`{3}/gms, "<pre>$1</pre>");
  s = s.replace(/[`]{3}([^`]+)[`]{3}/g, "<pre>$1</pre>");
  s = s.replace(
    /(?!<(code|pre)[^<]*|<\/)[`]{1}([^`\n]+)[`]{1}(?![^<]*<\/(code|pre)>)/g,
    '<code class="text-entity-code">$2</code>',
  );
  // the previous wave's symmetric markers
  s = s.replace(/(?!<(code|pre)[^<]*|<\/)[*]{2}([^*\n]+)[*]{2}(?![^<]*<\/(code|pre)>)/g, "<b>$2</b>");
  s = s.replace(/(?!<(code|pre)[^<]*|<\/)[_]{2}([^_\n]+)[_]{2}(?![^<]*<\/(code|pre)>)/g, "<i>$2</i>");
  s = s.replace(/(?!<(code|pre)[^<]*|<\/)[~]{2}([^~\n]+)[~]{2}(?![^<]*<\/(code|pre)>)/g, "<s>$2</s>");
  s = s.replace(/(?!<(code|pre)[^<]*|<\/)[+]{2}([^+\n]+)[+]{2}(?![^<]*<\/(code|pre)>)/g, "<u>$2</u>");
  s = s.replace(
    /(?!<(code|pre)[^<]*|<\/)[|]{2}([^|\n]+)[|]{2}(?![^<]*<\/(code|pre)>)/g,
    '<span class="spoiler" data-entity-type="spoiler">$2</span>',
  );
  return s;
}

// ── DOM → { text, entities } ──────────────────────────────────────────────────
function walkToEntities(root: Node): { text: string; entities: TgEntity[] } {
  let text = "";
  const entities: TgEntity[] = [];
  const visit = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.nodeValue ?? "";
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      if (el.tagName === "BR") {
        text += "\n";
        return;
      }
      const type = entityTypeOf(el);
      if (type === "customEmoji") {
        const alt = el.getAttribute("alt") || el.dataset.alt || el.textContent || "";
        const start = text.length;
        text += alt;
        entities.push({ type, offset: start, length: alt.length, documentId: el.dataset.documentId ?? null });
        return;
      }
      if (el.tagName === "DIV" || el.tagName === "P") {
        if (text.length && !text.endsWith("\n")) text += "\n";
        visit(el);
        return;
      }
      const start = text.length;
      visit(el);
      const end = text.length;
      if (type && end > start) {
        const e: TgEntity = { type, offset: start, length: end - start };
        if (type === "textUrl") e.url = el.getAttribute("href") || "";
        if (type === "pre" && el.dataset.language) e.language = el.dataset.language;
        entities.push(e);
      }
    });
  };
  visit(root);
  return { text, entities };
}

/** Trim leading/trailing whitespace and shift/clamp entity offsets to match. */
function trimFormatted(text: string, entities: TgEntity[]): { text: string; entities: TgEntity[] } {
  const leading = text.length - text.replace(/^\s+/, "").length;
  const finalText = text.replace(/\s+$/, "").slice(leading);
  const out: TgEntity[] = [];
  for (const e of entities) {
    let offset = e.offset - leading;
    let length = e.length;
    if (offset < 0) {
      length += offset;
      offset = 0;
    }
    if (offset + length > finalText.length) length = finalText.length - offset;
    if (length > 0) out.push({ ...e, offset, length });
  }
  return { text: finalText, entities: out };
}

/** Serialise input HTML → clean text + entities (markdown markers honoured). */
function parseInputHtml(html: string): { text: string; entities: TgEntity[] } {
  if (!html) return { text: "", entities: [] };
  const body = new DOMParser().parseFromString(normalizeMarkdown(html), "text/html").body;
  const { text, entities } = walkToEntities(body);
  return trimFormatted(text.replace(/\u200B+/g, ""), entities);
}

// ── { text, entities } → styled HTML (edit prefill) ───────────────────────────
function wrapTag(type: TgEntity["type"], inner: string, e: TgEntity): string {
  switch (type) {
    case "bold": return `<b>${inner}</b>`;
    case "italic": return `<i>${inner}</i>`;
    case "underline": return `<u>${inner}</u>`;
    case "strike": return `<s>${inner}</s>`;
    case "code": return `<code class="text-entity-code">${inner}</code>`;
    case "pre": return `<pre>${inner}</pre>`;
    case "blockquote": return `<blockquote>${inner}</blockquote>`;
    case "spoiler": return `<span class="spoiler" data-entity-type="spoiler">${inner}</span>`;
    case "textUrl": return `<a href="${escapeAttr(e.url || "")}" class="text-entity-link">${inner}</a>`;
    default: return inner;
  }
}

function buildInputHtml(text: string, entities?: TgEntity[] | null): string {
  if (!text) return "";
  const usable = (entities ?? []).filter((e) => BUILDABLE.has(e.type) && e.length > 0);
  if (usable.length === 0) return escapeHtml(text);

  const len = text.length;
  const clamp = (n: number) => Math.max(0, Math.min(len, n));
  const bounds = new Set<number>([0, len]);
  for (const e of usable) {
    bounds.add(clamp(e.offset));
    bounds.add(clamp(e.offset + e.length));
  }
  const points = Array.from(bounds).sort((a, b) => a - b);

  let html = "";
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (b <= a) continue;
    const slice = text.slice(a, b);
    // Covering entities, outermost (longest) first.
    const covering = usable
      .filter((e) => e.offset <= a && e.offset + e.length >= b)
      .sort((p, q) => q.length - p.length);

    const ce = covering.find((e) => e.type === "customEmoji" && e.documentId);
    let inner = ce && ce.documentId
      ? customEmojiHostHtml(ce.documentId, slice)
      : escapeHtml(slice);

    // Wrap innermost → outermost (skip the already-rendered custom emoji).
    for (let c = covering.length - 1; c >= 0; c--) {
      const e = covering[c];
      if (e.type === "customEmoji") continue;
      inner = wrapTag(e.type, inner, e);
    }
    html += inner;
  }
  return html;
}

// ── raw visible-text extraction (mention / caret / emptiness) ──────────────────
function extractPlainText(node: Node | null): string {
  if (!node) return "";
  let text = "";
  const visit = (n: Node) => {
    n.childNodes.forEach((c) => {
      if (c.nodeType === Node.TEXT_NODE) {
        text += c.nodeValue ?? "";
        return;
      }
      if (c.nodeType !== Node.ELEMENT_NODE) return;
      const el = c as HTMLElement;
      if (el.tagName === "BR") {
        text += "\n";
        return;
      }
      if (el.dataset.documentId) {
        text += el.getAttribute("alt") || el.dataset.alt || el.textContent || "";
        return;
      }
      if (el.tagName === "DIV" || el.tagName === "P") {
        if (text.length && !text.endsWith("\n")) text += "\n";
        visit(el);
        return;
      }
      visit(el);
    });
  };
  visit(node);
  return text;
}

// ── component ─────────────────────────────────────────────────────────────────
export const TgMessageInput = forwardRef<TgMessageInputHandle, Props>(
  function TgMessageInput({ placeholder, accountId, onUpdate, onKeyDown, onPaste, onSelectionChange }, ref) {
    const editableRef = useRef<HTMLDivElement | null>(null);
    const savedRange = useRef<Range | null>(null);
    const [isEmpty, setIsEmpty] = useState(true);

    // Custom-emoji stickers live in the editable as atomic `contenteditable=false`
    // host spans; their VISUALS are React subtrees portaled into each host. This
    // list mirrors the hosts currently in the DOM — reconciled after every mutation
    // (`syncCustomEmojis`) so React mounts/unmounts one portal per host.
    const [ceHosts, setCeHosts] = useState<CeHost[]>([]);
    const ceKeySeq = useRef(0);

    // ── selection bookkeeping ──────────────────────────────────────────────────
    // Remember the last caret/selection inside the field (collapsed or not) so a
    // symbol-menu emoji / ⌫ lands where the caret was, and the link control can
    // restore the selection after focus moves to its URL field.
    const saveSelection = () => {
      const el = editableRef.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) return;
      const r = sel.getRangeAt(0);
      if (el.contains(r.commonAncestorContainer)) savedRange.current = r.cloneRange();
    };
    const restoreSelection = () => {
      const r = savedRange.current;
      const sel = window.getSelection();
      if (!r || !sel) return false;
      sel.removeAllRanges();
      sel.addRange(r);
      return true;
    };

    const placeCaretEnd = () => {
      const el = editableRef.current;
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    };

    // If the browser left a stray <br> after the field was emptied, wipe it so
    // the placeholder shows and serialisation stays clean (reference SAFARI_BR).
    const normalizeEmpty = () => {
      const el = editableRef.current;
      if (!el) return;
      const empty = extractPlainText(el).length === 0;
      if (empty && el.innerHTML !== "") el.innerHTML = "";
      return empty;
    };

    // Reconcile the portal list with the custom-emoji hosts currently in the DOM.
    // Called after every mutation path (typing, insert, paste, delete, format,
    // prefill, clear). Cheap + idempotent: it stamps each host with a stable key +
    // `contenteditable="false"`, then bails out (returns the same array ref, so no
    // re-render) when the host set is unchanged — safe to call on every keystroke.
    const syncCustomEmojis = useCallback(() => {
      const el = editableRef.current;
      if (!el) {
        setCeHosts((prev) => (prev.length ? [] : prev));
        return;
      }
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(`.${CE_HOST_CLASS}[data-document-id]`));
      const next: CeHost[] = nodes.map((node) => {
        if (node.getAttribute("contenteditable") !== "false") node.setAttribute("contenteditable", "false");
        let key = node.dataset.ceKey;
        if (!key) {
          key = `ce${ceKeySeq.current++}`;
          node.dataset.ceKey = key;
        }
        return {
          el: node,
          documentId: node.dataset.documentId ?? "",
          // data-alt is authoritative (the portal's rendered media has no text).
          fallback: node.getAttribute("alt") || node.dataset.alt || node.textContent || "",
          key,
        };
      });
      setCeHosts((prev) =>
        prev.length === next.length && prev.every((p, i) => p.el === next[i].el && p.documentId === next[i].documentId)
          ? prev
          : next,
      );
    }, []);

    const notifyUpdate = () => {
      const el = editableRef.current;
      const plain = extractPlainText(el);
      setIsEmpty(plain.length === 0);
      syncCustomEmojis();
      onUpdate(plain);
    };

    // ── live formatting on the selection (real DOM, execCommand) ────────────────
    const currentSelectionInside = (): Range | null => {
      const el = editableRef.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) return null;
      const r = sel.getRangeAt(0);
      return el.contains(r.commonAncestorContainer) ? r : null;
    };

    /** Element of `kind` wrapping the current selection, or null. */
    const ancestorOfKind = (kind: "strike" | "mono" | "spoiler"): HTMLElement | null => {
      const el = editableRef.current;
      const r = currentSelectionInside();
      if (!el || !r) return null;
      let cur: Node | null = r.commonAncestorContainer;
      if (cur.nodeType === Node.TEXT_NODE) cur = cur.parentElement;
      while (cur && cur instanceof HTMLElement && cur !== el) {
        const t = cur.tagName;
        if (kind === "strike" && (t === "S" || t === "STRIKE" || t === "DEL")) return cur;
        if (kind === "mono" && t === "CODE") return cur;
        if (kind === "spoiler" && (cur.classList.contains("spoiler") || cur.dataset.entityType === "spoiler")) return cur;
        cur = cur.parentElement;
      }
      return null;
    };

    const unwrap = (el: HTMLElement) => {
      const parent = el.parentNode;
      if (!parent) return;
      while (el.firstChild) parent.insertBefore(el.firstChild, el);
      parent.removeChild(el);
    };

    const selectedInnerHtml = (): string => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return "";
      const tmp = document.createElement("div");
      tmp.appendChild(sel.getRangeAt(0).cloneContents());
      return tmp.innerHTML;
    };

    const wrapWith = (open: string, close: string) => {
      document.execCommand("insertHTML", false, `${open}${selectedInnerHtml()}${close}`);
    };

    const toggleWrap = (kind: "strike" | "mono" | "spoiler") => {
      const existing = ancestorOfKind(kind);
      if (existing) {
        unwrap(existing);
        return;
      }
      if (kind === "strike") wrapWith("<s>", "</s>");
      else if (kind === "mono") wrapWith('<code class="text-entity-code">', "</code>");
      else wrapWith('<span class="spoiler" data-entity-type="spoiler">', "</span>");
    };

    const insertLink = (rawUrl?: string) => {
      const link = (rawUrl ?? "").trim();
      const href = /^[a-z][\w+.-]*:\/\//i.test(link) ? link : link ? `https://${link}` : "https://";
      const inner = selectedInnerHtml();
      if (!inner) return;
      document.execCommand("insertHTML", false, `<a href="${escapeAttr(href)}" class="text-entity-link">${inner}</a>`);
    };

    const applyFormat = (kind: FormatKind, url?: string) => {
      const el = editableRef.current;
      if (!el) return;
      el.focus();
      // Use the live selection if it's a real range inside the input; otherwise
      // (e.g. focus moved to the link URL field) restore the saved one.
      const live = currentSelectionInside();
      if (!live || live.collapsed || !live.toString()) restoreSelection();

      const r = currentSelectionInside();
      const collapsed = !r || r.collapsed || !r.toString();
      if (kind !== "link" && collapsed) return;

      try {
        document.execCommand("styleWithCSS", false, "false");
      } catch {
        /* not supported — tags are the default anyway */
      }

      switch (kind) {
        case "bold": document.execCommand("bold"); break;
        case "italic": document.execCommand("italic"); break;
        case "underline": document.execCommand("underline"); break;
        case "strike": toggleWrap("strike"); break;
        case "mono": toggleWrap("mono"); break;
        case "spoiler": toggleWrap("spoiler"); break;
        case "link": insertLink(url); break;
      }
      savedRange.current = null;
      normalizeEmpty();
      notifyUpdate();
      onSelectionChange();
    };

    // ── imperative handle ───────────────────────────────────────────────────────
    useImperativeHandle(ref, (): TgMessageInputHandle => ({
      focus: () => {
        editableRef.current?.focus();
        placeCaretEnd();
      },
      clear: () => {
        const el = editableRef.current;
        if (el) el.innerHTML = "";
        savedRange.current = null;
        setIsEmpty(true);
        syncCustomEmojis();
        onUpdate("");
      },
      isEmpty: () => extractPlainText(editableRef.current).length === 0,
      getPlainText: () => extractPlainText(editableRef.current),
      getFormatted: () => {
        const el = editableRef.current;
        return el ? parseInputHtml(el.innerHTML) : { text: "", entities: [] };
      },
      setFormatted: (text, entities) => {
        const el = editableRef.current;
        if (!el) return;
        el.innerHTML = buildInputHtml(text, entities);
        savedRange.current = null;
        setIsEmpty(text.length === 0);
        syncCustomEmojis();
        onUpdate(extractPlainText(el));
      },
      insertText: (s) => {
        const el = editableRef.current;
        if (!el || !s) return;
        el.focus();
        // Land at the caret the field had before focus moved to the symbol menu.
        if (!currentSelectionInside() && !restoreSelection()) placeCaretEnd();
        document.execCommand("insertText", false, s);
        savedRange.current = null;
        notifyUpdate();
      },
      deleteBackward: () => {
        const el = editableRef.current;
        if (!el) return;
        el.focus();
        if (!currentSelectionInside() && !restoreSelection()) placeCaretEnd();
        document.execCommand("delete");
        savedRange.current = null;
        notifyUpdate();
      },
      applyFormat,
      hasSelection: () => {
        const r = currentSelectionInside();
        return !!r && !r.collapsed && r.toString().trim().length > 0;
      },
      getCaretOffset: () => {
        const el = editableRef.current;
        const sel = window.getSelection();
        if (!el || !sel || sel.rangeCount === 0) return extractPlainText(el).length;
        const r = sel.getRangeAt(0);
        if (!el.contains(r.endContainer)) return extractPlainText(el).length;
        const pre = document.createRange();
        pre.selectNodeContents(el);
        pre.setEnd(r.endContainer, r.endOffset);
        const tmp = document.createElement("div");
        tmp.appendChild(pre.cloneContents());
        return extractPlainText(tmp).length;
      },
      replaceBeforeCaret: (count, insert) => {
        const el = editableRef.current;
        const sel = window.getSelection();
        if (!el || !sel || sel.rangeCount === 0) return;
        el.focus();
        const r = sel.getRangeAt(0);
        const node = r.endContainer;
        const offset = r.endOffset;
        if (node.nodeType === Node.TEXT_NODE && offset >= count) {
          const range = document.createRange();
          range.setStart(node, offset - count);
          range.setEnd(node, offset);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        document.execCommand("insertText", false, insert);
        notifyUpdate();
      },
      insertCustomEmoji: (documentId, fallback) => {
        const el = editableRef.current;
        if (!el || !documentId) return;
        el.focus();
        // Land at the caret the field had before focus moved to the picker.
        if (!currentSelectionInside() && !restoreSelection()) placeCaretEnd();
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        // Range-based insert (mirrors the reference `insertHtmlInSelection`) so the
        // caret lands AFTER the atomic node — execCommand can leave it before it.
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const frag = range.createContextualFragment(customEmojiHostHtml(documentId, fallback || ""));
        const last = frag.lastChild;
        range.insertNode(frag);
        if (last) {
          range.setStartAfter(last);
          range.setEndAfter(last);
          sel.removeAllRanges();
          sel.addRange(range);
        }
        savedRange.current = null;
        notifyUpdate();
      },
    }));

    // ── DOM events ──────────────────────────────────────────────────────────────
    const handleInput = () => {
      normalizeEmpty();
      notifyUpdate();
    };
    const handleKeyUp = () => {
      saveSelection();
      onSelectionChange();
    };
    const handleMouseUp = () => {
      saveSelection();
      onSelectionChange();
    };

    return (
      <div className="input-scroller custom-scroll">
        <div className="input-scroller-content">
          <div
            ref={editableRef}
            id="editable-message-text"
            className="form-control"
            contentEditable
            role="textbox"
            dir="auto"
            spellCheck
            aria-label={placeholder}
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={onKeyDown}
            onKeyUp={handleKeyUp}
            onMouseUp={handleMouseUp}
            onPaste={onPaste}
          />
          {isEmpty && <span className="placeholder-text">{placeholder}</span>}
        </div>
        {/* One portal per inline custom-emoji host — rendered INTO the atomic span
            that lives in the (otherwise uncontrolled) editable DOM. */}
        {ceHosts.map((h) =>
          createPortal(
            <InputCustomEmoji accountId={accountId} documentId={h.documentId} fallback={h.fallback} />,
            h.el,
            h.key,
          ),
        )}
      </div>
    );
  },
);
