// One Telegram Web A message bubble, ported 1:1 to our stack.
//
// The DOM + classes mirror the reference `Message` component element-for-element
// (`.Message` → `.message-content-wrapper` → `.message-content` → `.text-content`
// / `.MessageMeta` / `.svg-appendix`), styled by the ported `tgweb-message.css`.
//   • own → `.Message.own` (right, `--color-background-own`), incoming → left,
//     `--color-background`;
//   • grouped same-sender messages tighten their stacked corners (`first-in-group`
//     / `last-in-group`) and only the LAST bubble grows the tail (`.has-appendix`
//     + `.svg-appendix`), exactly like Message.scss;
//   • the coloured sender name (`.message-title`) shows once per incoming group,
//     tinted with the peer's colour (14-hue palette, shared.ts);
//   • ALBUMS: messages sharing `groupedId` collapse into ONE bubble whose media is
//     a computed mosaic (calculateAlbumLayout ported below) with a single caption
//     + single meta (Album.tsx / Album.scss);
//   • JUMBO emoji: a 1–3-emoji-only message renders large with no bubble
//     background (getMessageCustomShape + the emoji-only sizing tiers);
//   • the reply quote (`EmbeddedMessage`) shows a media pictogram, a per-sender
//     peer-coloured bar and entity-rendered quote text;
//   • the "forwarded from" header shows the origin avatar + peer colour + a
//     channel/group pictogram;
//   • the meta (views + replies + pinned + edited-time + a 4-state delivery tick,
//     `MessageOutgoingStatus`) floats to the end of the last text line — the
//     classic `.text-content > .MessageMeta` float trick — or overlays media;
//   • right-click / long-press opens the shared context menu.
//
// UNIQUE TO US: the AIBA-author attribution badge ABOVE the bubble. One corporate
// TG account fronts many AIBA users, so every message we sent is labelled with
// the AIBA username that actually wrote it ("via {author}").
import "./tgweb-message.css";
import { useMemo, useRef, useState } from "react";
import {
  Check,
  CheckCheck,
  CircleAlert,
  Clock,
  CornerUpLeft,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  MapPin,
  PenLine,
  Pin,
  Play,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  tgMediaUrl,
  tgThumbUrl,
  useTgCallback,
  useTgPeer,
  type TgButton,
  type TgMessage,
  type TgReplyMarkup,
} from "./api";
import { KindGlyph, fmtTime, linkify, senderColor } from "./shared";
import { renderEntities } from "./entities";
import { TgMediaBody, isBubblelessMedia } from "./message-media";
import { TgBubbleMenu } from "./message-menu";
import { TgMediaViewer } from "./media-viewer";
import { TgAvatar } from "./tg-avatar";
import { fetchTgMediaBlobUrl, useTgMediaSrc } from "./media";
import { useTgChatActions } from "./chat-actions";

type Tr = (k: string, d: string) => string;

export type BubbleGroup = {
  first: boolean;
  last: boolean;
  showAvatar: boolean;
  showSender: boolean;
};

/** The signature Telegram bubble tail ("appendix") — the exact reference SVG
 *  (MessageAppendix.tsx). The `.corner` path inherits the bubble `--background-color`
 *  via tgweb-message.css so it matches incoming/outgoing/light/dark automatically;
 *  the black path behind it is the soft drop-shadow. Shown only on the last bubble
 *  of a group (the `.message-content.has-appendix` gate). */
function MessageAppendix({ isOwn }: { isOwn: boolean }) {
  const path = isOwn
    ? "M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z"
    : "M3 17h6V0c-.193 2.84-.876 5.767-2.05 8.782-.904 2.325-2.446 4.485-4.625 6.48A1 1 0 003 17z";
  return (
    <svg width="9" height="20" className="svg-appendix" aria-hidden>
      <defs>
        <filter
          x="-50%"
          y="-14.7%"
          width="200%"
          height="141.2%"
          filterUnits="objectBoundingBox"
          id="tgMessageAppendix"
        >
          <feOffset dy="1" in="SourceAlpha" result="shadowOffsetOuter1" />
          <feGaussianBlur stdDeviation="1" in="shadowOffsetOuter1" result="shadowBlurOuter1" />
          <feColorMatrix
            values="0 0 0 0 0.0621962482 0 0 0 0 0.138574144 0 0 0 0 0.185037364 0 0 0 0.15 0"
            in="shadowBlurOuter1"
          />
        </filter>
      </defs>
      <g fill="none" fillRule="evenodd">
        <path d={path} fill="#000" filter="url(#tgMessageAppendix)" />
        <path d={path} className="corner" />
      </g>
    </svg>
  );
}

/** Linkify one line, then wrap case-insensitive `query` hits in <mark> for
 *  in-chat search. Highlighting runs only over the plain-string runs linkify
 *  emits, so links stay clickable and React still escapes every string. */
function markLinkify(text: string, query: string, keyBase: string): React.ReactNode[] {
  const nodes = linkify(text);
  const q = query.trim().toLowerCase();
  if (!q) return nodes;
  const out: React.ReactNode[] = [];
  nodes.forEach((node, ni) => {
    if (typeof node !== "string") {
      out.push(node);
      return;
    }
    const lower = node.toLowerCase();
    let from = 0;
    let hit = 0;
    let pos = lower.indexOf(q, from);
    while (pos !== -1) {
      if (pos > from) out.push(node.slice(from, pos));
      out.push(
        <mark key={`${keyBase}-m${ni}-${hit++}`} className="tg-mark">
          {node.slice(pos, pos + q.length)}
        </mark>,
      );
      from = pos + q.length;
      pos = lower.indexOf(q, from);
    }
    if (from < node.length) out.push(node.slice(from));
  });
  return out;
}

/** Render message text the Telegram-Web-A way (ported from its renderText):
 *  split on newlines and join with <br/> (NOT CSS pre-wrap); each line's leading
 *  indentation is preserved as non-breaking spaces while stray runs of spaces
 *  collapse. Runs of 3+ blank lines collapse to one paragraph break, and a
 *  paragraph break renders as a small gap (.tg-para-gap) instead of a full empty
 *  line — so bot messages padded with blank lines never leave a broken hole. */
function renderBody(text: string | null | undefined, query: string): React.ReactNode[] {
  if (!text) return [];
  const clean = text
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // strip zero-width chars / BOM some bots pad with
    .replace(/^[^\S\n]+$/gm, "") // whitespace-only lines → empty
    .replace(/[^\S\n]+$/gm, "") // trim trailing horizontal whitespace per line
    .replace(/\n{3,}/g, "\n\n") // 3+ newlines → one paragraph break
    .trim();
  const paras = clean.split(/\n{2,}/);
  const out: React.ReactNode[] = [];
  paras.forEach((para, pi) => {
    const lines = para.split(/\r\n|\r|\n/);
    lines.forEach((line, li) => {
      const trimmed = line.trimStart();
      const indent = line.length - trimmed.length;
      if (indent > 0) out.push(" ".repeat(indent));
      out.push(...markLinkify(trimmed, query, `p${pi}l${li}`));
      if (li !== lines.length - 1) out.push(<br key={`br-p${pi}l${li}`} />);
    });
    if (pi !== paras.length - 1) out.push(<span key={`pg${pi}`} className="tg-para-gap" />);
  });
  return out;
}

/** Render a bubble body: entity renderer when the message carries inline
 *  formatting spans, else the plain paragraph/linkify renderer. Guards `null`
 *  text (media-only messages carry `text: null`). */
function renderMessageBody(
  text: string | null | undefined,
  entities: TgMessage["entities"],
  query: string,
  tr: Tr,
  accountId: number,
  key: string,
): React.ReactNode[] {
  if (!text) return [];
  return entities && entities.length > 0
    ? renderEntities(text, entities, query, tr, accountId, key)
    : renderBody(text, query);
}

/** Compact view count (1.2K / 3.4M) for channel post meta. */
function fmtViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 ? 1 : 0)}K`;
  return String(n);
}

/** seconds → m:ss (album video badge). Guards null/NaN → "". */
function fmtDurationBadge(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "";
  const total = Math.floor(sec);
  const s = String(total % 60).padStart(2, "0");
  const m = Math.floor(total / 60);
  return `${m}:${s}`;
}

// ── delivery ticks (MessageOutgoingStatus) ──────────────────────────────────────
// The four states of an outgoing message, ported from MessageOutgoingStatus.tsx:
// failed (red !) / pending (clock) / sent (single check) / read (double check).

function MessageOutgoingStatus({ status }: { status: TgSendStatus }) {
  if (status === "failed") {
    return (
      <span className="MessageOutgoingStatus is-failed" aria-label="failed">
        <CircleAlert className="size-4" strokeWidth={2.25} />
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="MessageOutgoingStatus" aria-label="pending">
        <Clock className="size-3.5" strokeWidth={2.5} />
      </span>
    );
  }
  if (status === "sent") {
    return (
      <span className="MessageOutgoingStatus" aria-label="sent">
        <Check className="size-4" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className="MessageOutgoingStatus" aria-label="read">
      <CheckCheck className="size-4" strokeWidth={2.5} />
    </span>
  );
}

type TgSendStatus = NonNullable<TgMessage["sendingStatus"]>;

// ── album mosaic (calculateAlbumLayout, ported) ─────────────────────────────────
// Ported from the reference `helpers/calculateAlbumLayout.ts` (itself a port of
// tdesktop's grouped_layout.cpp): given each item's aspect ratio, it packs the
// media into a mosaic that fills a bubble-width box. Pure geometry — no globals.

type Dim = { x: number; y: number; width: number; height: number };
type LayoutItem = { dimensions: Dim; sides: number };

const AlbumRectPart = { None: 0, Top: 1, Right: 2, Bottom: 4, Left: 8 };
const SPACING = 2;
const MIN_WIDTH = 100;
const MAX_ROW = 3;
const MAX_LAST_ROW = 4;

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const accumulate = (list: number[], init: number) => list.reduce((a, b) => a + b, init);

/** The bubble-width box the mosaic fills — the reference `getAvailableWidth`
 *  (MESSAGE_(OWN_)MAX_WIDTH_REM), capped for our compact surface + viewport. */
function albumMaxWidth(isOwn: boolean): number {
  const remPx = 16;
  const base = Math.min((isOwn ? 30 : 29) * remPx, 24 * remPx);
  if (typeof window !== "undefined") {
    const gutter = isOwn ? 64 : 112; // padding + (incoming) avatar gutter
    return Math.min(base, Math.max(160, window.innerWidth - gutter));
  }
  return base;
}

function getProportions(ratios: number[]): string {
  return ratios.map((r) => (r > 1.2 ? "w" : r < 0.8 ? "n" : "q")).join("");
}
function getAverageRatio(ratios: number[]): number {
  return ratios.reduce((acc, r) => r + acc, 1) / ratios.length;
}
function cropRatios(ratios: number[], averageRatio: number): number[] {
  return ratios.map((r) => (averageRatio > 1.1 ? clampNum(r, 1, 2.75) : clampNum(r, 0.6667, 1)));
}
function containerFromLayout(layout: LayoutItem[]): { width: number; height: number } {
  let width = 0;
  let height = 0;
  for (const { dimensions: d } of layout) {
    width = Math.max(width, d.x + d.width);
    height = Math.max(height, d.y + d.height);
  }
  return { width, height };
}

type LayoutParams = {
  ratios: number[];
  proportions: string;
  averageRatio: number;
  maxWidth: number;
  minWidth: number;
  maxHeight: number;
  spacing: number;
};

function collectLineCounts(remaining: number, maxCounts: number[], current: number[], result: number[][]) {
  if (!maxCounts.length) {
    if (!remaining) result.push([...current]);
    return;
  }
  const [maxCurrent, ...restMax] = maxCounts;
  const maxRest = accumulate(restMax, 0);
  const minCurrent = Math.max(1, remaining - maxRest);
  const maxAllowed = Math.min(maxCurrent, remaining - restMax.length);
  for (let c = minCurrent; c <= maxAllowed; c++) {
    current.push(c);
    collectLineCounts(remaining - c, restMax, current, result);
    current.pop();
  }
}
function buildLineCounts(count: number, maxCounts: number[]): number[][] {
  const res: number[][] = [];
  collectLineCounts(count, maxCounts, [], res);
  return res;
}
function buildBaseLineCounts(count: number, averageRatio: number): number[][] {
  return [
    [MAX_ROW, MAX_ROW],
    [MAX_ROW, averageRatio < 0.85 ? MAX_LAST_ROW : MAX_ROW, MAX_ROW],
    [MAX_ROW, MAX_ROW, MAX_ROW, MAX_LAST_ROW],
  ].flatMap((maxCounts) => buildLineCounts(count, maxCounts));
}
function buildExtendedLineCount(count: number, rowCount: number): number[] | undefined {
  const lineCounts = Array.from({ length: rowCount }, () => 1);
  const maxCounts = Array.from({ length: rowCount }, () => MAX_ROW);
  maxCounts[rowCount - 1] = MAX_LAST_ROW;
  if (count > accumulate(maxCounts, 0)) return undefined;
  let remaining = count - rowCount;
  for (let row = rowCount - 1; row >= 0 && remaining; row--) {
    const added = Math.min(remaining, maxCounts[row] - lineCounts[row]);
    lineCounts[row] += added;
    remaining -= added;
  }
  return lineCounts;
}
function buildExtendedLineCounts(count: number): number[][] {
  const minRowCount = Math.max(5, Math.ceil((count - MAX_LAST_ROW) / MAX_ROW) + 1);
  const maxRowCount = Math.min(count, minRowCount + 2);
  const out: number[][] = [];
  for (let rc = minRowCount; rc <= maxRowCount; rc++) {
    const lc = buildExtendedLineCount(count, rc);
    if (lc) out.push(lc);
  }
  return out;
}

function layoutSingle({ ratios, maxWidth, maxHeight }: LayoutParams): LayoutItem[] {
  const height = Math.round(Math.min(maxWidth / ratios[0], maxHeight));
  return [
    {
      dimensions: { x: 0, y: 0, width: maxWidth, height },
      sides: AlbumRectPart.Left | AlbumRectPart.Top | AlbumRectPart.Right | AlbumRectPart.Bottom,
    },
  ];
}
function layoutComplex(params: LayoutParams): LayoutItem[] {
  const { ratios: original, averageRatio, maxWidth, minWidth, spacing } = params;
  const maxHeight = params.maxHeight || (4 * maxWidth) / 3;
  const ratios = cropRatios(original, averageRatio);
  const count = original.length;
  const result: LayoutItem[] = new Array(count);
  const attempts: { lineCounts: number[]; heights: number[] }[] = [];

  const multiHeight = (offset: number, attemptCount: number) => {
    const slice = ratios.slice(offset, offset + attemptCount);
    return (maxWidth - (attemptCount - 1) * spacing) / accumulate(slice, 0);
  };
  const pushAttempt = (lineCounts: number[]) => {
    const heights: number[] = [];
    let offset = 0;
    lineCounts.forEach((c) => {
      heights.push(multiHeight(offset, c));
      offset += c;
    });
    attempts.push({ lineCounts, heights });
  };

  buildBaseLineCounts(count, averageRatio).forEach(pushAttempt);
  if (!attempts.length) buildExtendedLineCounts(count).forEach(pushAttempt);

  let optimal: { lineCounts: number[]; heights: number[] } | undefined;
  let optimalDiff = 0;
  for (const attempt of attempts) {
    const { heights, lineCounts } = attempt;
    const lineCount = lineCounts.length;
    const totalHeight = accumulate(heights, 0) + spacing * (lineCount - 1);
    const minLineHeight = Math.min(...heights);
    const bad1 = minLineHeight < minWidth ? 1.5 : 1;
    let bad2 = 1;
    for (let line = 1; line !== lineCount; ++line) {
      if (lineCounts[line - 1] > lineCounts[line]) {
        bad2 = 1.5;
        break;
      }
    }
    const diff = Math.abs(totalHeight - maxHeight) * bad1 * bad2;
    if (!optimal || diff < optimalDiff) {
      optimal = attempt;
      optimalDiff = diff;
    }
  }

  const counts = optimal!.lineCounts;
  const heights = optimal!.heights;
  const rowCount = counts.length;
  let index = 0;
  let y = 0;
  for (let row = 0; row !== rowCount; ++row) {
    const colCount = counts[row];
    const height = Math.round(heights[row]);
    let x = 0;
    for (let col = 0; col !== colCount; ++col) {
      const sides =
        (row === 0 ? AlbumRectPart.Top : 0) |
        (row === rowCount - 1 ? AlbumRectPart.Bottom : 0) |
        (col === 0 ? AlbumRectPart.Left : 0) |
        (col === colCount - 1 ? AlbumRectPart.Right : 0);
      const width = col === colCount - 1 ? maxWidth - x : Math.round(ratios[index] * height);
      result[index] = { dimensions: { x, y, width, height }, sides };
      x += width + spacing;
      ++index;
    }
    y += height + spacing;
  }
  return result;
}
function layoutTwo(params: LayoutParams): LayoutItem[] {
  const { ratios, proportions, averageRatio, maxWidth, spacing, maxHeight, minWidth } = params;
  if (proportions === "ww" && averageRatio > 1.4 && ratios[1] - ratios[0] < 0.2) {
    // top / bottom
    const height = Math.round(
      Math.min(maxWidth / ratios[0], Math.min(maxWidth / ratios[1], (maxHeight - spacing) / 2)),
    );
    return [
      { dimensions: { x: 0, y: 0, width: maxWidth, height }, sides: AlbumRectPart.Left | AlbumRectPart.Top | AlbumRectPart.Right },
      { dimensions: { x: 0, y: height + spacing, width: maxWidth, height }, sides: AlbumRectPart.Left | AlbumRectPart.Bottom | AlbumRectPart.Right },
    ];
  }
  if (proportions === "ww" || proportions === "qq") {
    // left / right equal
    const width = (maxWidth - spacing) / 2;
    const height = Math.round(Math.min(width / ratios[0], Math.min(width / ratios[1], maxHeight)));
    return [
      { dimensions: { x: 0, y: 0, width, height }, sides: AlbumRectPart.Top | AlbumRectPart.Left | AlbumRectPart.Bottom },
      { dimensions: { x: width + spacing, y: 0, width, height }, sides: AlbumRectPart.Top | AlbumRectPart.Right | AlbumRectPart.Bottom },
    ];
  }
  // left / right proportional
  const minimalWidth = Math.round(1.5 * minWidth);
  const secondWidth = Math.min(
    Math.round(Math.max(0.4 * (maxWidth - spacing), (maxWidth - spacing) / ratios[0] / (1 / ratios[0] + 1 / ratios[1]))),
    maxWidth - spacing - minimalWidth,
  );
  const firstWidth = maxWidth - secondWidth - spacing;
  const height = Math.min(maxHeight, Math.round(Math.min(firstWidth / ratios[0], secondWidth / ratios[1])));
  return [
    { dimensions: { x: 0, y: 0, width: firstWidth, height }, sides: AlbumRectPart.Top | AlbumRectPart.Left | AlbumRectPart.Bottom },
    { dimensions: { x: firstWidth + spacing, y: 0, width: secondWidth, height }, sides: AlbumRectPart.Top | AlbumRectPart.Right | AlbumRectPart.Bottom },
  ];
}
function layoutThree(params: LayoutParams): LayoutItem[] {
  const { proportions, maxWidth, maxHeight, spacing, ratios, minWidth } = params;
  if (proportions[0] === "n") {
    // left column tall, two stacked on the right
    const firstHeight = maxHeight;
    const thirdHeight = Math.round(
      Math.min((maxHeight - spacing) / 2, (ratios[1] * (maxWidth - spacing)) / (ratios[2] + ratios[1])),
    );
    const secondHeight = firstHeight - thirdHeight - spacing;
    const rightWidth = Math.max(
      minWidth,
      Math.round(Math.min((maxWidth - spacing) / 2, Math.min(thirdHeight * ratios[2], secondHeight * ratios[1]))),
    );
    const leftWidth = Math.min(Math.round(firstHeight * ratios[0]), maxWidth - spacing - rightWidth);
    return [
      { dimensions: { x: 0, y: 0, width: leftWidth, height: firstHeight }, sides: AlbumRectPart.Top | AlbumRectPart.Left | AlbumRectPart.Bottom },
      { dimensions: { x: leftWidth + spacing, y: 0, width: rightWidth, height: secondHeight }, sides: AlbumRectPart.Top | AlbumRectPart.Right },
      { dimensions: { x: leftWidth + spacing, y: secondHeight + spacing, width: rightWidth, height: thirdHeight }, sides: AlbumRectPart.Bottom | AlbumRectPart.Right },
    ];
  }
  // wide top, two side-by-side below
  const firstWidth = maxWidth;
  const firstHeight = Math.round(Math.min(firstWidth / ratios[0], 0.66 * (maxHeight - spacing)));
  const secondWidth = (maxWidth - spacing) / 2;
  const secondHeight = Math.min(
    maxHeight - firstHeight - spacing,
    Math.round(Math.min(secondWidth / ratios[1], secondWidth / ratios[2])),
  );
  const thirdWidth = firstWidth - secondWidth - spacing;
  return [
    { dimensions: { x: 0, y: 0, width: firstWidth, height: firstHeight }, sides: AlbumRectPart.Left | AlbumRectPart.Top | AlbumRectPart.Right },
    { dimensions: { x: 0, y: firstHeight + spacing, width: secondWidth, height: secondHeight }, sides: AlbumRectPart.Bottom | AlbumRectPart.Left },
    { dimensions: { x: secondWidth + spacing, y: firstHeight + spacing, width: thirdWidth, height: secondHeight }, sides: AlbumRectPart.Bottom | AlbumRectPart.Right },
  ];
}
function layoutFour(params: LayoutParams): LayoutItem[] {
  const { proportions, maxWidth, maxHeight, ratios, spacing, minWidth } = params;
  if (proportions[0] === "w") {
    // wide top, three across below
    const w = maxWidth;
    const h0 = Math.round(Math.min(w / ratios[0], 0.66 * (maxHeight - spacing)));
    const h = Math.round((maxWidth - 2 * spacing) / (ratios[1] + ratios[2] + ratios[3]));
    const w0 = Math.max(minWidth, Math.round(Math.min(0.4 * (maxWidth - 2 * spacing), h * ratios[1])));
    const w2 = Math.round(Math.max(Math.max(minWidth, 0.33 * (maxWidth - 2 * spacing)), h * ratios[3]));
    const w1 = w - w0 - w2 - 2 * spacing;
    const h1 = Math.min(maxHeight - h0 - spacing, h);
    return [
      { dimensions: { x: 0, y: 0, width: w, height: h0 }, sides: AlbumRectPart.Left | AlbumRectPart.Top | AlbumRectPart.Right },
      { dimensions: { x: 0, y: h0 + spacing, width: w0, height: h1 }, sides: AlbumRectPart.Bottom | AlbumRectPart.Left },
      { dimensions: { x: w0 + spacing, y: h0 + spacing, width: w1, height: h1 }, sides: AlbumRectPart.Bottom },
      { dimensions: { x: w0 + spacing + w1 + spacing, y: h0 + spacing, width: w2, height: h1 }, sides: AlbumRectPart.Right | AlbumRectPart.Bottom },
    ];
  }
  // tall left, three stacked on the right
  const h = maxHeight;
  const w0 = Math.round(Math.min(h * ratios[0], 0.6 * (maxWidth - spacing)));
  const w = Math.round((maxHeight - 2 * spacing) / (1 / ratios[1] + 1 / ratios[2] + 1 / ratios[3]));
  const h0 = Math.round(w / ratios[1]);
  const h1 = Math.round(w / ratios[2]);
  const h2 = h - h0 - h1 - 2 * spacing;
  const w1 = Math.max(minWidth, Math.min(maxWidth - w0 - spacing, w));
  return [
    { dimensions: { x: 0, y: 0, width: w0, height: h }, sides: AlbumRectPart.Top | AlbumRectPart.Left | AlbumRectPart.Bottom },
    { dimensions: { x: w0 + spacing, y: 0, width: w1, height: h0 }, sides: AlbumRectPart.Top | AlbumRectPart.Right },
    { dimensions: { x: w0 + spacing, y: h0 + spacing, width: w1, height: h1 }, sides: AlbumRectPart.Right },
    { dimensions: { x: w0 + spacing, y: h0 + h1 + 2 * spacing, width: w1, height: h2 }, sides: AlbumRectPart.Bottom | AlbumRectPart.Right },
  ];
}

function calculateAlbumLayout(isOwn: boolean, ratios: number[]): { layout: LayoutItem[]; width: number; height: number } {
  if (!ratios.length) return { layout: [], width: 0, height: 0 };
  const maxWidth = albumMaxWidth(isOwn);
  const params: LayoutParams = {
    ratios,
    proportions: getProportions(ratios),
    averageRatio: getAverageRatio(ratios),
    maxWidth,
    minWidth: MIN_WIDTH,
    maxHeight: maxWidth,
    spacing: SPACING,
  };
  const count = ratios.length;
  const forceCalc = ratios.some((r) => r > 2);
  let layout: LayoutItem[];
  if (count === 1) layout = layoutSingle(params);
  else if (count >= 5 || forceCalc) layout = layoutComplex(params);
  else if (count === 2) layout = layoutTwo(params);
  else if (count === 3) layout = layoutThree(params);
  else layout = layoutFour(params);
  const { width, height } = containerFromLayout(layout);
  return { layout, width, height };
}

/** One cell of an album mosaic — a photo (full bytes) or a video/gif poster
 *  (thumb + play). Clicking opens the shared full-screen viewer. */
function AlbumCell({
  accountId,
  chatId,
  msg,
  dim,
  onOpen,
}: {
  accountId: number;
  chatId: number;
  msg: TgMessage;
  dim: Dim;
  onOpen: (msg: TgMessage) => void;
}) {
  const media = msg.media ?? null;
  const isVideo = media?.type === "video" || media?.type === "gif";
  const downloadable = media?.downloadable !== false;
  const url = isVideo ? tgThumbUrl(accountId, chatId, msg.id) : tgMediaUrl(accountId, chatId, msg.id);
  const { src, loading, failed } = useTgMediaSrc(downloadable ? url : null);
  const dur = fmtDurationBadge(media?.duration);

  return (
    <div
      className="album-item"
      style={{ left: dim.x, top: dim.y, width: dim.width, height: dim.height }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          className="album-item-media"
          draggable={false}
          onClick={() => onOpen(msg)}
        />
      ) : (
        <div className="album-item-ph" onClick={() => downloadable && onOpen(msg)}>
          {loading ? (
            <Loader2 className="size-5 animate-spin text-white/70" />
          ) : (
            <ImageIcon className="size-6 text-white/70" />
          )}
        </div>
      )}
      {isVideo && (
        <span className="album-item-play" aria-hidden>
          <Play className="size-5 translate-x-[1px]" fill="currentColor" />
        </span>
      )}
      {isVideo && dur && <span className="album-item-badge">{dur}</span>}
    </div>
  );
}

/** The mosaic that renders an album's photos/videos as ONE media block, ported
 *  from Album.tsx: a container sized to the computed layout with each item
 *  absolutely positioned. The outer corners round to the bubble (top when there's
 *  no header, bottom when there's no caption). */
function AlbumMosaic({
  album,
  accountId,
  chatId,
  isOwn,
  meta,
  hasCaption,
  roundTop,
}: {
  album: TgMessage[];
  accountId: number;
  chatId: number;
  isOwn: boolean;
  meta?: React.ReactNode;
  hasCaption: boolean;
  roundTop: boolean;
}) {
  const [viewer, setViewer] = useState<{ src: string; kind: "photo" | "video"; name: string } | null>(null);

  const ratios = useMemo(
    () =>
      album.map((m) => {
        const w = m.media?.w ?? 0;
        const h = m.media?.h ?? 0;
        return w > 0 && h > 0 ? w / h : 1;
      }),
    [album],
  );
  const { layout, width, height } = useMemo(() => calculateAlbumLayout(isOwn, ratios), [isOwn, ratios]);

  const openViewer = async (m: TgMessage) => {
    if (m.media?.downloadable === false) return;
    const kind = m.media?.type === "video" || m.media?.type === "gif" ? "video" : "photo";
    try {
      const resolved = await fetchTgMediaBlobUrl(tgMediaUrl(accountId, chatId, m.id));
      setViewer({ src: resolved, kind, name: m.media?.name ?? "" });
    } catch {
      /* leave the mosaic in place if the bytes can't be resolved */
    }
  };

  const round = cn(
    "Album",
    roundTop && "round-top",
    !hasCaption && "round-bottom",
  );

  return (
    <div className={round} style={{ width, height }}>
      {album.map((m, i) => {
        const item = layout[i];
        if (!item) return null;
        return (
          <AlbumCell
            key={m.id}
            accountId={accountId}
            chatId={chatId}
            msg={m}
            dim={item.dimensions}
            onOpen={openViewer}
          />
        );
      })}
      {!hasCaption && meta && (
        <span className="album-meta pointer-events-none absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-[10px] bg-black/45 px-1.5 py-0.5 text-[11px] leading-none text-white">
          {meta}
        </span>
      )}
      {viewer && (
        <TgMediaViewer
          src={viewer.src}
          kind={viewer.kind}
          name={viewer.name}
          onClose={() => setViewer(null)}
        />
      )}
    </div>
  );
}

/** A media group of DOCUMENTS (files) — rendered as a stacked list of file rows,
 *  exactly like real Telegram, instead of the photo/video mosaic (which would
 *  show broken image cells for files). Each row reuses the single-message media
 *  renderer so file icon / name / size / progress / download all match. */
function AlbumFileList({
  album,
  accountId,
  chatId,
  tr,
}: {
  album: TgMessage[];
  accountId: number;
  chatId: number;
  tr: Tr;
}) {
  return (
    <div className="album-files flex flex-col gap-1.5">
      {album.map((m) =>
        m.media ? (
          <TgMediaBody
            key={m.id}
            media={m.media}
            url={tgMediaUrl(accountId, chatId, m.id)}
            tr={tr}
            hasCaption
            roundTop
          />
        ) : null,
      )}
    </div>
  );
}

/** The "Forwarded from …" header. Prefers the header's explicit label (a hidden
 *  account's chosen name, or a signed channel author); otherwise resolves the
 *  origin peer's real name by id (peer-detail endpoint, react-query cached +
 *  deduped) so a plain channel/user forward shows the actual name instead of
 *  "Unknown". Falls back to a neutral "Hidden" only when the origin is genuinely
 *  unresolvable (a privacy-restricted forward). */
function ForwardHeader({
  fwd,
  accountId,
  tr,
}: {
  fwd: NonNullable<TgMessage["fwdFrom"]>;
  accountId: number;
  tr: Tr;
}) {
  // Only hit the peer-detail endpoint when there's an origin id but no label yet.
  const needsName = !fwd.senderName && fwd.fwdPeerId != null;
  const peerQ = useTgPeer(accountId, needsName ? fwd.fwdPeerId! : null);
  const resolvedName = fwd.senderName || peerQ.data?.name || null;
  const label = resolvedName || tr("hiddenSender", "Yashirin");
  return (
    <div className="message-fwd">
      <span className="message-fwd-label">{tr("forwardedFrom", "Yo'naltirildi:")} </span>
      <span className="message-fwd-origin">
        {fwd.fwdPeerId != null && (
          <TgAvatar
            accountId={accountId}
            peerId={fwd.fwdPeerId}
            name={resolvedName ?? "?"}
            size={16}
            className="message-fwd-avatar"
          />
        )}
        {fwd.kind && fwd.kind !== "user" && (
          <KindGlyph kind={fwd.kind} className="message-fwd-icon size-3" />
        )}
        <span
          className="message-fwd-name"
          style={{ color: senderColor(String(fwd.fwdPeerId ?? resolvedName ?? "")) }}
        >
          {label}
        </span>
      </span>
    </div>
  );
}

// ── jumbo emoji ─────────────────────────────────────────────────────────────────
// A message that is only emoji (no other text/formatting) renders large with no
// bubble background, ported from getMessageCustomShape + the emoji-only tiers.

const PICTOGRAPHIC = /\p{Extended_Pictographic}/u;
/** Grapheme-segment `s` (Intl.Segmenter when available, else code points). */
function graphemes(s: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    const seg = new Seg(undefined, { granularity: "grapheme" });
    return Array.from(seg.segment(s), (x) => x.segment);
  }
  return Array.from(s);
}
/** Count of emoji when the message is emoji-ONLY (1–3), else null. Custom-emoji
 *  entities are allowed (they render as inline stickers that scale with the font);
 *  any other formatting or non-emoji grapheme disqualifies it. */
function jumboEmojiCount(text: string | null | undefined, entities: TgMessage["entities"]): number | null {
  if (!text) return null;
  if (entities && entities.length && entities.some((e) => e.type !== "customEmoji")) return null;
  const noWs = text.replace(/\s+/g, "");
  if (!noWs || noWs.length > 24) return null;
  const g = graphemes(noWs);
  if (g.length < 1 || g.length > 3) return null;
  for (const ch of g) {
    if (!PICTOGRAPHIC.test(ch)) return null;
  }
  return g.length;
}
const JUMBO_SIZE_REM: Record<number, number> = { 1: 3.25, 2: 2.75, 3: 2.25 };

// ── media pictogram (reply quote thumbnail / icon) ──────────────────────────────

const REPLY_MEDIA_LABEL: Record<string, string> = {
  photo: "Rasm",
  video: "Video",
  gif: "GIF",
  sticker: "Stiker",
  voice: "Ovozli xabar",
  audio: "Audio",
  document: "Fayl",
  location: "Manzil",
  venue: "Manzil",
  contact: "Kontakt",
  poll: "So'rovnoma",
  webpage: "Havola",
};

/** The pictogram icon for a non-thumbnailable media reply. */
function ReplyMediaIcon({ type }: { type: string }) {
  if (type === "document") return <FileText className="size-4" />;
  if (type === "location" || type === "venue") return <MapPin className="size-4" />;
  return <ImageIcon className="size-4" />;
}

/** The reply-to quote at the top of a bubble (EmbeddedMessage) — a per-sender
 *  peer-coloured bar, an optional media pictogram/thumbnail, the origin name and
 *  the entity-rendered quoted text. Prefers the backend-inlined preview; falls
 *  back to the loaded-message cache (resolveMessage) since same-chat replies often
 *  arrive without inline text. Clicking jumps to the quoted message. */
function ReplyQuote({
  msg,
  accountId,
  chatId,
  tr,
}: {
  msg: TgMessage;
  accountId: number;
  chatId: number;
  tr: Tr;
}) {
  const actions = useTgChatActions();
  const rt = msg.replyTo!;
  const src = actions.resolveMessage(rt.msgId);
  const name =
    rt.senderName || src?.senderName || (src?.out ? tr("you", "Siz") : tr("reply", "Javob"));
  const colorSeed = String(src?.senderId ?? rt.senderName ?? name);
  const barColor = senderColor(colorSeed);

  const mediaType = rt.mediaType || src?.media?.type || null;
  const canThumb =
    !!mediaType &&
    (mediaType === "photo" || mediaType === "video" || mediaType === "gif") &&
    src?.media?.downloadable !== false;
  const thumbUrl = canThumb ? tgThumbUrl(accountId, chatId, rt.msgId) : null;
  const { src: thumbSrc } = useTgMediaSrc(thumbUrl);

  // Prefer the backend preview text; only entity-render when we have the FULL
  // source text (offsets must align to the string we render).
  const fullText = src?.text ?? null;
  const useFull = !rt.text && !!fullText;
  const shownText = rt.text || fullText || "";
  const ents = useFull ? src?.entities ?? null : null;

  let preview: React.ReactNode;
  if (shownText) {
    preview =
      ents && ents.length
        ? renderEntities(shownText, ents, "", tr, accountId, `rq${rt.msgId}`)
        : shownText;
  } else if (mediaType) {
    preview = tr(`media_${mediaType}`, REPLY_MEDIA_LABEL[mediaType] ?? tr("attachment", "Ilova"));
  } else {
    preview = "…";
  }

  const hasPictogram = !!mediaType;

  return (
    <button
      type="button"
      onClick={() => actions.jumpTo(rt.msgId)}
      className={cn("EmbeddedMessage", hasPictogram && "with-thumb")}
      style={{ ["--peer-bar" as string]: barColor }}
    >
      <span className="embedded-bar" aria-hidden />
      {hasPictogram && (
        <span className="embedded-thumb">
          {thumbSrc ? (
            <img src={thumbSrc} alt="" className="h-full w-full object-cover" draggable={false} />
          ) : (
            <span className="grid h-full w-full place-items-center text-white">
              <ReplyMediaIcon type={mediaType!} />
            </span>
          )}
        </span>
      )}
      <span className="message-text">
        <span className="embedded-text-wrapper">{preview}</span>
        <span className="message-title" style={{ color: barColor }}>
          <span className="embedded-sender">{name}</span>
        </span>
      </span>
    </button>
  );
}

/** The reactions row shown under a bubble, ported to the reference `.Reactions`
 *  container + `.message-reaction` pills. Each pill toggles our reaction; the
 *  chosen pill flips to the accent fill via the `.chosen` class. */
function ReactionsRow({ msg }: { msg: TgMessage }) {
  const actions = useTgChatActions();
  const reactions = msg.reactions ?? [];
  if (reactions.length === 0) return null;
  return (
    <div className="Reactions">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => actions.react(msg, r.chosen ? null : r.emoji)}
          className={cn("message-reaction", r.chosen && "chosen")}
        >
          <span className="reaction-emoji">{r.emoji.startsWith("custom:") ? "⭐" : r.emoji}</span>
          {r.count > 0 && <span className="counter tabular-nums">{r.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function TgMessageBubble({
  msg,
  accountId,
  chatId,
  group,
  album,
  tr,
  onSenderClick,
  onOpenProfile,
  query = "",
  activeMatch = false,
}: {
  msg: TgMessage;
  accountId: number;
  chatId: number;
  group: BubbleGroup;
  /** When set (length > 1), the bubble renders these messages as one album
   *  mosaic; `msg` is the album's representative (meta/date/sender/reply). */
  album?: TgMessage[];
  tr: Tr;
  onSenderClick: (x: number, y: number, id: number | null, name: string) => void;
  /** When provided, a sender-name click opens the full profile panel instead of
   *  the lightweight SenderCard popover (wired by the orchestrator). */
  onOpenProfile?: (id: number | null, name: string) => void;
  /** Active in-chat search query — highlights matches inside the text. */
  query?: string;
  /** True when this bubble is the current prev/next search target (emphasised). */
  activeMatch?: boolean;
}) {
  const out = msg.out;

  // Album: collapse N media messages into one bubble. The caption is attached to
  // whichever album member carries text (Telegram allows it on any of them).
  const isAlbum = !!album && album.length > 1;
  const captionMsg = isAlbum ? album!.find((m) => m.text && m.text.trim()) ?? null : null;
  // A media group is EITHER all-visual (photos/videos → mosaic) OR all-documents
  // (files → a stacked file-row list, like real Telegram). Telegram never mixes
  // the two in one group, so "every item is a non-visual document" is a safe test;
  // rendering documents through the photo mosaic yields broken grey image cells.
  const albumIsFiles = isAlbum && album!.every((m) => m.media && !isBubblelessMedia(m.media));

  const media = isAlbum ? null : msg.media ?? null;
  const mediaUrl = tgMediaUrl(accountId, chatId, msg.id);
  const bodyText = isAlbum ? captionMsg?.text ?? "" : msg.text;
  const bodyEntities = isAlbum ? captionMsg?.entities ?? null : msg.entities;
  const hasText = isAlbum ? !!captionMsg : !!msg.text;

  // Jumbo emoji — a 1–3 emoji-only message (no media/album/reply/forward) renders
  // large with no bubble background. Reply/forward keep the normal bubble.
  const jumbo =
    !isAlbum && !media && !msg.replyTo && !msg.fwdFrom
      ? jumboEmojiCount(msg.text, msg.entities)
      : null;

  // Whether anything renders above the media (sender name / forward / reply). When
  // nothing does, the media bleeds to the bubble's top edge (`.at-top`); otherwise
  // it sits below the header with a small gap (`.below-header`).
  const showSenderName = group.showSender && !!msg.senderName;
  const hasAbove = showSenderName || !!msg.fwdFrom || !!msg.replyTo;

  // Visual media (photo/video/gif/sticker) or an album with no caption IS the
  // bubble — it renders edge-to-edge with NO solid background and the meta
  // overlaid, exactly like real Telegram; everything else gets the padded solid
  // bubble. A sticker / jumbo emoji additionally drops the bubble tail. A webpage
  // preview sits BELOW the text, not above it.
  // A file-list album (documents) always sits in the padded solid bubble; only a
  // caption-less VISUAL album bleeds edge-to-edge like a photo/video.
  const visualOnly = isAlbum
    ? !hasText && !albumIsFiles
    : !!media && isBubblelessMedia(media) && !hasText;
  const stickerOnly = media?.type === "sticker" && !hasText;
  const isWebpage = media?.type === "webpage";
  const hasSolid = !visualOnly && !jumbo;
  const noTail = stickerOnly || !!jumbo;

  const body = renderMessageBody(bodyText, bodyEntities, query, tr, accountId, String(msg.id));

  // Context-menu anchor (viewport coords) — null when closed.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };
  const onTouchStart = (e: React.TouchEvent) => {
    const tch = e.touches[0];
    if (!tch) return;
    const { clientX, clientY } = tch;
    clearLongPress();
    longPressRef.current = setTimeout(() => setMenuAt({ x: clientX, y: clientY }), 450);
  };

  const time = fmtTime(msg.date);
  // Views tooltip = views (+ forwards), like MessageMeta.tsx's viewsTitle.
  const viewsTitle =
    msg.views != null && msg.views > 0
      ? `${fmtViews(msg.views)} ${tr("views", "ko'rishlar")}` +
        (msg.forwards ? `\n${fmtViews(msg.forwards)} ${tr("forwards", "ulashishlar")}` : "")
      : undefined;

  // Meta inner = views + replies + pinned + (edited?) time + (outgoing) a 4-state
  // delivery tick — the reference MessageMeta.tsx child order.
  const sendStatus: TgSendStatus = msg.sendingStatus ?? "read";
  const metaInner = time ? (
    <>
      {msg.views != null && msg.views > 0 && (
        <span className="message-views tabular-nums" title={viewsTitle}>
          {fmtViews(msg.views)}
          <Eye className="msg-views-icon size-3.5" />
        </span>
      )}
      {msg.replies != null && msg.replies > 0 && (
        <span className="message-replies tabular-nums">
          <CornerUpLeft className="msg-replies-icon size-3.5" />
          {fmtViews(msg.replies)}
        </span>
      )}
      {msg.pinned && <Pin className="message-pinned size-3" fill="currentColor" />}
      <span className="message-time">
        {msg.editDate ? `${tr("edited", "tahr.")} ` : ""}
        {time}
      </span>
      {out && <MessageOutgoingStatus status={sendStatus} />}
    </>
  ) : null;

  // The meta node overlaid on a media-only visual (photo/video/gif/sticker/album).
  const overlayMeta = visualOnly && metaInner ? metaInner : null;

  // Service / action messages ("pinned a message", "joined", …) render as a
  // centered pill over the wallpaper, not a bubble.
  if (msg.service) {
    return (
      <div className="my-1.5 flex justify-center">
        <span className="tg-pill max-w-[80%] text-center">{msg.service.text || msg.text}</span>
      </div>
    );
  }

  // The media body. Visual-only media (no caption) renders bare (edge-to-edge, no
  // background); everything else bleeds out of the bubble padding via `.media-inner`
  // with text/meta following below. Placed above the text — EXCEPT a webpage
  // preview, which real Telegram renders below the text (see the render slots).
  const albumNode = !isAlbum ? null : albumIsFiles ? (
    <AlbumFileList album={album!} accountId={accountId} chatId={chatId} tr={tr} />
  ) : (
    <AlbumMosaic
      album={album!}
      accountId={accountId}
      chatId={chatId}
      isOwn={out}
      meta={overlayMeta}
      hasCaption={hasText}
      roundTop={!hasAbove}
    />
  );

  const singleMediaNode = media ? (
    <TgMediaBody
      media={media}
      url={mediaUrl}
      tr={tr}
      meta={overlayMeta}
      hasCaption={hasText}
      roundTop={!hasAbove}
    />
  ) : null;

  const innerMedia = albumNode ?? singleMediaNode;
  const mediaNode = innerMedia ? (
    hasSolid ? (
      <div className={cn("media-inner", hasAbove ? "below-header" : "at-top", "with-caption")}>
        {innerMedia}
      </div>
    ) : (
      innerMedia
    )
  ) : null;

  return (
    <div className={cn("flex w-full flex-col", out ? "items-end" : "items-start")}>
      {/* AIBA-author attribution — WHO wrote this through our bridge. */}
      {msg.author && (
        <span
          className={cn(
            "mb-0.5 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none",
            out
              ? "bg-[rgba(var(--tg-primary-rgb),0.15)] text-[var(--tg-primary)]"
              : "bg-[var(--tg-secondary)] text-[var(--tg-text-secondary)]",
          )}
          title={tr("viaAuthorFull", "AIBA orqali yozdi")}
        >
          <PenLine className="size-3 shrink-0" />
          {tr("viaAuthor", "{{author}} orqali").replace("{{author}}", msg.author)}
        </span>
      )}

      <div
        className={cn(
          "Message",
          out && "own",
          group.first && "first-in-group",
          group.last && "last-in-group",
          msg.replyMarkup && "has-inline-buttons",
        )}
      >
        <div className="message-content-wrapper">
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuAt({ x: e.clientX, y: e.clientY });
            }}
            onTouchStart={onTouchStart}
            onTouchEnd={clearLongPress}
            onTouchMove={clearLongPress}
            onTouchCancel={clearLongPress}
            className={cn(
              "message-content",
              hasSolid && "has-solid-background",
              (media || isAlbum) && "media",
              jumbo && "emoji-only",
              group.last && !noTail && "has-appendix",
              activeMatch && "tg-bubble--match",
            )}
          >
            {/* sender name (incoming group messages) — opens the full profile
                panel when the orchestrator wired `onOpenProfile`, else the
                SenderCard popover. */}
            {showSenderName && (
              <button
                type="button"
                onClick={(e) => {
                  if (onOpenProfile) onOpenProfile(msg.senderId, msg.senderName ?? "");
                  else onSenderClick(e.clientX, e.clientY, msg.senderId, msg.senderName ?? "");
                }}
                className="message-title"
                style={{ color: senderColor(String(msg.senderId ?? msg.senderName)) }}
              >
                <span className="sender-title">{msg.senderName}</span>
              </button>
            )}

            {/* forwarded-from header — origin avatar + peer-coloured name + a
                channel/group pictogram; resolves the real name by id when the
                header carries no explicit label. */}
            {msg.fwdFrom && <ForwardHeader fwd={msg.fwdFrom} accountId={accountId} tr={tr} />}

            {/* reply-to quote */}
            {msg.replyTo && <ReplyQuote msg={msg} accountId={accountId} chatId={chatId} tr={tr} />}

            {/* media (above the text) — for everything except a webpage preview,
                which renders below the text further down. */}
            {!isWebpage && mediaNode}

            {/* jumbo emoji — large, no bubble background (custom-shape). */}
            {jumbo && (
              <div
                className="tg-emoji-only-body"
                style={{ fontSize: `${JUMBO_SIZE_REM[jumbo] ?? 2.25}rem` }}
              >
                <span className="tg-emoji-only-text" dir="auto">
                  {body}
                </span>
                {metaInner && (
                  <span className="tg-emoji-only-meta pointer-events-none inline-flex items-center gap-0.5 rounded-[10px] bg-black/40 px-1.5 py-0.5 text-[11px] leading-none text-white">
                    {metaInner}
                  </span>
                )}
              </div>
            )}

            {/* text — the message body with the meta FLOATED to the end of its
                last line (the reference `.text-content > .MessageMeta` trick, in
                tgweb-message.css). */}
            {!jumbo && hasText && (
              <div className="text-content" dir="auto">
                {body}
                {metaInner && <span className="MessageMeta">{metaInner}</span>}
              </div>
            )}

            {/* webpage link-preview — real Telegram renders it BELOW the text. */}
            {isWebpage && mediaNode}

            {/* media-only, non-visual (document / audio / voice / location /
                contact / poll / webpage) — the meta rides a right-aligned inline
                row beneath the body. */}
            {media && !hasText && !visualOnly && metaInner && (
              <div className="tg-meta-inline">
                <span className="MessageMeta">{metaInner}</span>
              </div>
            )}

            {/* signature tail on the last bubble of a same-sender group (not on a
                bare sticker / jumbo emoji — they're transparent, so no tail). */}
            {group.last && !noTail && <MessageAppendix isOwn={out} />}
          </div>
        </div>

        {/* reactions row (under the bubble) */}
        <ReactionsRow msg={msg} />

        {/* bot inline keyboard — attached under the message (callback / url). */}
        {msg.replyMarkup && (
          <TgInlineKeyboard
            markup={msg.replyMarkup}
            accountId={accountId}
            chatId={chatId}
            msgId={msg.id}
            out={out}
          />
        )}
      </div>

      {menuAt && (
        <TgBubbleMenu
          x={menuAt.x}
          y={menuAt.y}
          msg={msg}
          mediaUrl={mediaUrl}
          tr={tr}
          accountId={accountId}
          chatId={chatId}
          onClose={() => setMenuAt(null)}
        />
      )}
    </div>
  );
}

// ── bot inline keyboard ─────────────────────────────────────────────────────────

/** Buttons attached UNDER a bot message. `url` buttons open the link; `callback`
 *  buttons POST their opaque payload back and surface the bot's answer (a toast
 *  message, an alert, or a url to open). switchInline/other are inert for now. */
function TgInlineKeyboard({
  markup,
  accountId,
  chatId,
  msgId,
  out,
}: {
  markup: TgReplyMarkup;
  accountId: number;
  chatId: number;
  msgId: number;
  out: boolean;
}) {
  const cb = useTgCallback();
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (m: string) => {
    setNote(m);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 3200);
  };

  const press = (b: TgButton) => {
    if (b.type === "url" && b.url) {
      window.open(b.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (b.type === "callback" && b.data) {
      cb.mutate(
        { accountId, chatId, msgId, data: b.data },
        {
          onSuccess: (ans) => {
            if (ans.url) window.open(ans.url, "_blank", "noopener,noreferrer");
            else if (ans.message) flash(ans.message);
          },
        },
      );
    }
  };

  return (
    <div className={cn("mt-1 flex w-full max-w-[min(70%,30rem)] flex-col gap-1", out ? "items-end" : "items-start")}>
      {markup.rows.map((row, ri) => (
        <div key={ri} className="flex w-full gap-1">
          {row.buttons.map((b, bi) => {
            const actionable = b.type === "url" || b.type === "callback";
            return (
              <button
                key={bi}
                type="button"
                onClick={() => press(b)}
                disabled={!actionable || cb.isPending}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-medium transition-colors",
                  "bg-[rgba(var(--tg-primary-rgb),0.12)] text-[var(--tg-primary)] hover:bg-[rgba(var(--tg-primary-rgb),0.22)]",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {b.type === "url" && <ExternalLink className="size-3.5 shrink-0" />}
                <span className="truncate">{b.text}</span>
              </button>
            );
          })}
        </div>
      ))}
      {note && <span className="tg-pill mt-1 max-w-full truncate">{note}</span>}
    </div>
  );
}
