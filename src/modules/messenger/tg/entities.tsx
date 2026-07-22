// Telegram message-entity renderer — turns (text, entities[]) into styled React
// nodes, the way Telegram Web A renders formatted messages. Entities are inline
// spans (bold / italic / code / links / mentions / spoiler / …) addressed by
// UTF-16 offset+length over the ORIGINAL text (so we render over the raw text,
// never a pre-cleaned copy, or the offsets would drift).
//
// Overlapping entities (e.g. bold+italic, or a link inside a quote) are handled
// by slicing the text at every entity boundary and wrapping each atomic slice
// with all the entities that cover it. Plain (unstyled) slices still get
// auto-linkified and search-highlighted; styled slices get search-highlight only.
import type { CSSProperties, ReactNode } from "react";
import { Spoiler } from "./spoiler";
import { AnimatedSticker } from "./animated-sticker";
import { tgCustomEmojiUrl, type TgEntity } from "./api";
import { useTgCustomEmoji } from "./media";

type Tr = (k: string, d: string) => string;

const URL_RE = /(https?:\/\/[^\s<]+)/g;

/** Wrap query hits in <mark> inside a plain string (case-insensitive). */
function highlight(text: string, query: string, keyBase: string): ReactNode[] {
  const q = query.trim().toLowerCase();
  if (!q) return [text];
  const out: ReactNode[] = [];
  const lower = text.toLowerCase();
  let from = 0;
  let hit = 0;
  let pos = lower.indexOf(q, from);
  while (pos !== -1) {
    if (pos > from) out.push(text.slice(from, pos));
    out.push(
      <mark key={`${keyBase}-hl${hit++}`} className="tg-mark">
        {text.slice(pos, pos + q.length)}
      </mark>,
    );
    from = pos + q.length;
    pos = lower.indexOf(q, from);
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}

/** Auto-linkify a plain string (trailing punctuation trimmed), then highlight. */
function linkifyPlain(text: string, query: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  let i = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    const idx = m.index;
    let url = m[0];
    const trail = url.match(/[.,;:!?)\]]+$/);
    if (trail) url = url.slice(0, url.length - trail[0].length);
    if (!url) continue;
    if (idx > last) out.push(...highlight(text.slice(last, idx), query, `${keyBase}-t${i}`));
    out.push(
      <a
        key={`${keyBase}-a${i}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="tg-link-a break-all underline underline-offset-2 hover:brightness-110"
      >
        {url}
      </a>,
    );
    last = idx + url.length;
    i++;
  }
  if (last < text.length) out.push(...highlight(text.slice(last), query, `${keyBase}-t${i}`));
  return out;
}

/** Split a text run on newlines into nodes with <br/> between lines. */
function withBreaks(nodes: ReactNode[], keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  nodes.forEach((node, ni) => {
    if (typeof node !== "string" || !node.includes("\n")) {
      out.push(node);
      return;
    }
    const parts = node.split("\n");
    parts.forEach((part, pi) => {
      if (part) out.push(part);
      if (pi !== parts.length - 1) out.push(<br key={`${keyBase}-br${ni}-${pi}`} />);
    });
  });
  return out;
}

/** Wrap a slice's inner nodes with one entity's element. */
function wrapEntity(e: TgEntity, inner: ReactNode, key: string, spoilerId: string): ReactNode {
  switch (e.type) {
    case "bold":
      return <b key={key} className="font-semibold">{inner}</b>;
    case "italic":
      return <i key={key}>{inner}</i>;
    case "underline":
      return <u key={key}>{inner}</u>;
    case "strike":
      return <s key={key}>{inner}</s>;
    case "spoiler":
      return <Spoiler key={key} containerId={`sp-${spoilerId}`}>{inner}</Spoiler>;
    case "code":
      return <code key={key} className="tg-code rounded bg-black/10 px-1 py-0.5 font-mono text-[0.9em] dark:bg-white/10">{inner}</code>;
    case "pre":
      return (
        <pre key={key} className="tg-pre my-1 overflow-x-auto rounded-md bg-black/10 p-2 font-mono text-[0.85em] dark:bg-white/10">
          <code>{inner}</code>
        </pre>
      );
    case "blockquote":
      return (
        <blockquote key={key} className="tg-quote my-0.5 border-l-2 border-[var(--tg-primary)] pl-2 opacity-90">
          {inner}
        </blockquote>
      );
    case "url":
      // The slice text IS the url.
      return (
        <a key={key} href={typeof inner === "string" ? inner : undefined} target="_blank" rel="noopener noreferrer"
           className="tg-link-a break-all underline underline-offset-2 hover:brightness-110">{inner}</a>
      );
    case "textUrl":
      return (
        <a key={key} href={e.url ?? undefined} target="_blank" rel="noopener noreferrer"
           className="tg-link-a underline underline-offset-2 hover:brightness-110">{inner}</a>
      );
    case "mention":
    case "mentionName":
    case "hashtag":
    case "cashtag":
    case "botCommand":
      return <span key={key} className="tg-link-a cursor-pointer hover:underline">{inner}</span>;
    case "email":
      return <a key={key} href={`mailto:${typeof inner === "string" ? inner : ""}`} className="tg-link-a underline underline-offset-2">{inner}</a>;
    case "phone":
      return <a key={key} href={`tel:${typeof inner === "string" ? inner : ""}`} className="tg-link-a underline underline-offset-2">{inner}</a>;
    default:
      return <span key={key}>{inner}</span>;
  }
}

/** Entities whose content is verbatim (no auto-linkify inside). */
const RAW_ENTITY = new Set<TgEntity["type"]>(["code", "pre", "url", "email", "phone"]);

// A custom-emoji sticker is sized to the surrounding text (em, so it scales with
// the user's message-text-size setting), inline, and vertically centered — the
// box always holds the fallback glyph until the sticker resolves.
const EMOJI_BOX: CSSProperties = {
  display: "inline-block",
  width: "1.25em",
  height: "1.25em",
  verticalAlign: "middle",
  lineHeight: 1,
  overflow: "hidden",
};

/**
 * One inline Telegram custom emoji. Fetches the sticker bytes through the auth'd
 * blob endpoint (a plain <img src> can't carry the JWT), sniffs the kind, and
 * renders it at ~1.25em in place of the `fallback` unicode char (e.g. "🏦").
 * The `fallback` glyph shows while loading and stays if the sticker can't load,
 * so a message full of custom emoji never renders blank. The blob object-URL is
 * shared via a session cache (keyed by documentId in the url), so repeats of the
 * same emoji hit the network once.
 */
function TgCustomEmoji({
  accountId,
  documentId,
  fallback,
}: {
  accountId: number;
  documentId: string;
  fallback: string;
}) {
  const { res } = useTgCustomEmoji(tgCustomEmojiUrl(accountId, documentId));
  return (
    <span className="tg-custom-emoji" style={EMOJI_BOX} title={fallback}>
      {!res ? (
        <span className="tg-custom-emoji-fallback">{fallback}</span>
      ) : res.kind === "tgs" ? (
        <AnimatedSticker tgsUrl={res.url} size={20} className="tg-custom-emoji-media" />
      ) : res.kind === "webm" ? (
        <video className="tg-custom-emoji-media" src={res.url} autoPlay loop muted playsInline />
      ) : (
        <img className="tg-custom-emoji-media" src={res.url} alt={fallback} draggable={false} />
      )}
    </span>
  );
}

/**
 * Render `text` with inline `entities`, applying a search `query` highlight.
 * Returns React nodes safe to drop into the bubble text body. `accountId` scopes
 * the auth'd fetch for any `customEmoji` entities (inline stickers).
 */
export function renderEntities(
  text: string,
  entities: TgEntity[] | null | undefined,
  query: string,
  tr: Tr,
  accountId: number,
  spoilerId = "0",
): ReactNode[] {
  void tr;
  if (!text) return [];
  if (!entities || entities.length === 0) {
    // No entities → plain linkify + highlight over lines.
    return withBreaks(linkifyPlain(text, query, "p"), "p");
  }

  // Collect all boundary offsets, clamped to the string.
  const len = text.length;
  const bounds = new Set<number>([0, len]);
  for (const e of entities) {
    const a = Math.max(0, Math.min(len, e.offset));
    const b = Math.max(0, Math.min(len, e.offset + e.length));
    bounds.add(a);
    bounds.add(b);
  }
  const points = Array.from(bounds).sort((x, y) => x - y);

  const out: ReactNode[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (b <= a) continue;
    const slice = text.slice(a, b);
    // Entities covering this slice, innermost (shortest) last so it wraps first.
    const covering = entities
      .filter((e) => e.offset <= a && e.offset + e.length >= b)
      .sort((p, q) => q.length - p.length);

    // A custom-emoji entity turns its slice (the fallback glyph) into the inline
    // sticker; everything else keeps the existing text rendering path.
    const customEmoji = covering.find((e) => e.type === "customEmoji" && e.documentId);

    let inner: ReactNode;
    if (customEmoji && customEmoji.documentId) {
      inner = (
        <TgCustomEmoji accountId={accountId} documentId={customEmoji.documentId} fallback={slice} />
      );
    } else {
      const raw = covering.some((e) => RAW_ENTITY.has(e.type));
      inner =
        raw
          ? slice
          : covering.length > 0
            ? highlight(slice, query, `e${i}`)
            : linkifyPlain(slice, query, `e${i}`);
      // apply line breaks inside plain/styled text
      if (typeof inner === "string") inner = withBreaks([inner], `e${i}`);
      else if (Array.isArray(inner)) inner = withBreaks(inner, `e${i}`);
    }

    // wrap by each covering entity, innermost → outermost (the custom-emoji entity
    // is already rendered as the sticker, so skip it here)
    let node: ReactNode = inner;
    covering.forEach((e, ci) => {
      if (e.type === "customEmoji") return;
      node = wrapEntity(e, node, `e${i}-${ci}`, spoilerId);
    });
    out.push(<span key={`seg${i}`}>{node}</span>);
  }
  return out;
}
