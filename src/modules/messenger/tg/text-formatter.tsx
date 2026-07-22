// Composer text-formatting — a faithful port of Telegram Web A's TextFormatter
// (middle/composer/TextFormatter.tsx): the floating selection toolbar.
//
// The toolbar now drives the RICH contentEditable input (message-input.tsx):
// each button toggles a format on the LIVE selection, rendered as real styled
// DOM (`<b>`, `<span class="spoiler">`, …) via the input's `applyFormat` handle —
// so the user SEES the formatting, and it serialises to MTProto entities on send.
//
// The pure string helpers below remain as the SEMANTIC BASE + fallback: the
// markdown markers Telegram uses
//   **bold**   __italic__   ++underline++   ~~strike~~   `mono`   ||spoiler||
//   [text](url)  → a text-url link
// are still converted to entities on paste / programmatic / null-handle paths.
//
// Exports: the toolbar component (`TgTextFormatter`) + the pure helpers
// `applyFormatToValue` (wrap a plain-string selection) + `parseMarkdownEntities`
// (marker → clean text + entities) + `stripMarkdown` (marker → clean text, for
// previews). The composer wires the toolbar's `onFormat` to the input handle.
import { Fragment, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bold,
  Check,
  Code2,
  EyeOff,
  Italic,
  Link as LinkIcon,
  Strikethrough,
  Underline,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { TgEntity } from "./api";

export type FormatKind =
  | "bold" | "italic" | "underline" | "strike" | "mono" | "spoiler" | "link";

/** Symmetric wrap markers (open === close). `link` is handled separately. */
const MARKER: Record<Exclude<FormatKind, "link">, string> = {
  bold: "**",
  italic: "__",
  underline: "++",
  strike: "~~",
  mono: "`",
  spoiler: "||",
};

/** Marker → entity type (the backend TgEntity variants). */
const MARKER_ENTITY: Record<string, TgEntity["type"]> = {
  "**": "bold",
  __: "italic",
  "++": "underline",
  "~~": "strike",
  "||": "spoiler",
  "`": "code",
};

// Longest-first so `**` is tried before `*`-adjacent single chars and `||`
// before a lone `|`. Backtick (mono / code) is raw — no nested parsing inside.
const SYMMETRIC = ["**", "__", "++", "~~", "||", "`"] as const;

export type FormatResult = { value: string; selStart: number; selEnd: number };

/**
 * Wrap `value`'s [selStart,selEnd) selection with `kind`'s markers (or, for a
 * collapsed selection, insert the empty marker pair and place the caret inside).
 * Toggles OFF when the selection is already tightly wrapped by the same marker.
 * Returns the next value + the selection to restore (the inner text stays
 * selected so formats can be stacked, like Telegram).
 */
export function applyFormatToValue(
  value: string,
  selStart: number,
  selEnd: number,
  kind: FormatKind,
  url?: string,
): FormatResult {
  const selected = value.slice(selStart, selEnd);

  if (kind === "link") {
    const link = (url ?? "").trim();
    if (!selected) return { value, selStart, selEnd };
    const wrap = `[${selected}](${link || "https://"})`;
    return {
      value: value.slice(0, selStart) + wrap + value.slice(selEnd),
      // keep the visible label selected
      selStart: selStart + 1,
      selEnd: selStart + 1 + selected.length,
    };
  }

  const mark = MARKER[kind];
  const len = mark.length;

  // Toggle off: selection already surrounded by this exact marker.
  if (
    value.slice(selStart - len, selStart) === mark &&
    value.slice(selEnd, selEnd + len) === mark
  ) {
    return {
      value: value.slice(0, selStart - len) + selected + value.slice(selEnd + len),
      selStart: selStart - len,
      selEnd: selEnd - len,
    };
  }

  const next = value.slice(0, selStart) + mark + selected + mark + value.slice(selEnd);
  return {
    value: next,
    selStart: selStart + len,
    selEnd: selStart + len + selected.length,
  };
}

const LINK_RE = /^\[([^\]\n]*)\]\(([^)\s]+)\)/;

/**
 * Convert the composer's markdown markers into clean text + MTProto entities
 * (UTF-16 offset/length, matching the backend's `TgEntity`). Unbalanced markers
 * are left verbatim, so a stray `**` or `C++` never eats the message. Nesting
 * (e.g. `**__x__**`) is resolved recursively; `` `code` `` is raw (no nesting).
 */
export function parseMarkdownEntities(input: string): {
  text: string;
  entities: TgEntity[];
} {
  let text = "";
  const entities: TgEntity[] = [];
  let i = 0;

  while (i < input.length) {
    // [label](url) → text-url link
    const rest = input.slice(i);
    const link = LINK_RE.exec(rest);
    if (link) {
      const label = link[1];
      const offset = text.length;
      text += label;
      entities.push({ type: "textUrl", offset, length: label.length, url: link[2] });
      i += link[0].length;
      continue;
    }

    let matched = false;
    for (const mark of SYMMETRIC) {
      if (!input.startsWith(mark, i)) continue;
      const close = input.indexOf(mark, i + mark.length);
      if (close === -1 || close === i + mark.length) break; // no close / empty → literal

      const innerRaw = input.slice(i + mark.length, close);
      const offset = text.length;

      if (mark === "`") {
        // code is raw — no nested markers inside
        text += innerRaw;
        entities.push({ type: "code", offset, length: innerRaw.length });
      } else {
        const nested = parseMarkdownEntities(innerRaw);
        text += nested.text;
        entities.push({ type: MARKER_ENTITY[mark], offset, length: nested.text.length });
        for (const e of nested.entities) entities.push({ ...e, offset: e.offset + offset });
      }
      i = close + mark.length;
      matched = true;
      break;
    }
    if (matched) continue;

    text += input[i];
    i += 1;
  }

  return { text, entities };
}

/** Marker → clean text only (drops entities) — for a faithful edit-strip preview. */
export function stripMarkdown(input: string): string {
  return parseMarkdownEntities(input).text;
}

/**
 * The floating format toolbar shown above the input while text is selected.
 * Buttons wrap the selection (bold / italic / underline / strike / monospace /
 * spoiler); the link button reveals a small URL field. Mirrors the reference's
 * `.TextFormatter` DOM (buttons row + `.TextFormatter-link-control`).
 */
export function TgTextFormatter({
  style,
  autoLink = false,
  onFormat,
  onClose,
  tr,
}: {
  style?: React.CSSProperties;
  /** Open straight into the link sub-control (Ctrl/Cmd+K entry). */
  autoLink?: boolean;
  onFormat: (kind: FormatKind, url?: string) => void;
  onClose: () => void;
  tr: (k: string, d: string) => string;
}) {
  const [linkOpen, setLinkOpen] = useState(autoLink);
  const [linkUrl, setLinkUrl] = useState("");
  const linkInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (linkOpen) linkInputRef.current?.focus();
  }, [linkOpen]);

  const confirmLink = () => {
    onFormat("link", linkUrl);
    onClose();
  };

  const BUTTONS: { kind: FormatKind; icon: typeof Bold; key: string; d: string }[] = [
    { kind: "spoiler", icon: EyeOff, key: "fmtSpoiler", d: "Spoiler" },
    { kind: "bold", icon: Bold, key: "fmtBold", d: "Qalin" },
    { kind: "italic", icon: Italic, key: "fmtItalic", d: "Kursiv" },
    { kind: "underline", icon: Underline, key: "fmtUnderline", d: "Tagi chizilgan" },
    { kind: "strike", icon: Strikethrough, key: "fmtStrike", d: "O'chirilgan" },
    { kind: "mono", icon: Code2, key: "fmtMono", d: "Monoshrift" },
  ];

  return (
    <div
      className={cn("TextFormatter", linkOpen && "link-control-shown")}
      style={style}
      // Don't let a toolbar click steal focus / collapse the textarea selection.
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="TextFormatter-buttons">
        {BUTTONS.map(({ kind, icon: Icon, key, d }, idx) => (
          <Fragment key={kind}>
            <button
              type="button"
              className="TextFormatter-button"
              title={tr(key, d)}
              aria-label={tr(key, d)}
              // Keep the toolbar up so styles can be stacked (bold + italic …);
              // it closes when the selection collapses or on Esc.
              onClick={() => onFormat(kind)}
            >
              <Icon className="size-5" />
            </button>
            {idx === 0 && <div className="TextFormatter-divider" />}
          </Fragment>
        ))}
        <div className="TextFormatter-divider" />
        <button
          type="button"
          className="TextFormatter-button"
          title={tr("fmtLink", "Havola")}
          aria-label={tr("fmtLink", "Havola")}
          onClick={() => setLinkOpen(true)}
        >
          <LinkIcon className="size-5" />
        </button>
      </div>

      <div className="TextFormatter-link-control">
        <div className="TextFormatter-buttons">
          <button
            type="button"
            className="TextFormatter-button"
            title={tr("back", "Orqaga")}
            aria-label={tr("back", "Orqaga")}
            onClick={() => setLinkOpen(false)}
          >
            <ArrowLeft className="size-5" />
          </button>
          <div className="TextFormatter-divider" />
          <input
            ref={linkInputRef}
            className="TextFormatter-link-url-input"
            type="text"
            inputMode="url"
            autoComplete="off"
            value={linkUrl}
            placeholder={tr("fmtEnterUrl", "URL kiriting")}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmLink();
              }
            }}
          />
          <div className={cn("TextFormatter-link-url-confirm", linkUrl && "shown")}>
            <div className="TextFormatter-divider" />
            <button
              type="button"
              className="TextFormatter-button color-primary"
              title={tr("save", "Saqlash")}
              aria-label={tr("save", "Saqlash")}
              onClick={confirmLink}
            >
              <Check className="size-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
