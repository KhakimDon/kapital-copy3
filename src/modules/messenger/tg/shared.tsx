// Shared pure helpers for the Telegram surface — imported by chat-list,
// message-list/bubble, header and composer so the port stays DRY. No component
// here owns state; these are formatting + color + linkify utilities lifted to a
// stable module that every ported piece can depend on.
import type { TgDialogKind } from "./api";
import { Hash, User, Users } from "lucide-react";
import i18n from "@/shared/i18n";

/** The active app locale as a BCP-47 tag for Intl date/time formatting, so month
 *  and weekday names follow the language chosen IN THE APP (not the browser's).
 *  `uz_Cyrl` → `uz-Cyrl`; uz / ru / en pass through. Falls back to `uz`. */
export function dateLocale(): string {
  return (i18n.language || "uz").replace(/_/g, "-");
}

// Deterministic per-sender name colour — ported from Telegram Web A's peer-colour
// system (`getPeerColorKey` → `getPeerIdDividend(peer.id) % N`, styled by the
// `.peer-color-N` → `--color-peer-N` vars). We can't receive a peer's *server*
// colour, so we reproduce the default assignment: the raw numeric peer id modulo
// the palette size (a per-digit modulo so 64-bit ids never lose precision), with
// a char-code hash fallback for name-only seeds.
//
// The palette itself is the 14-colour set (classic 7 + 7 extended), defined
// theme-aware as `--color-peer-0..13` in tgweb-message.css; `senderColor` returns
// a `var(--color-peer-N, <hex>)` so it stays correct in light/dark and still has
// a safe literal fallback anywhere the var can't resolve.
export const PEER_COLOR_COUNT = 14;

/** Classic 7-hue fallback (also the literal fallback baked into `senderColor`). */
export const SENDER_COLORS = [
  "#e17076", "#eda86c", "#a695e7", "#7bc862", "#6ec9cb", "#65aadd", "#ee7aae",
  "#e0699e", "#65aadd", "#6fb06f", "#e8ad61", "#b48bf2", "#5cb9c9", "#e57a7a",
];

/** Big-int-safe `Number(seed) % m` for a pure-digit string (leading `-` ok);
 *  returns -1 when the seed isn't a plain integer id. */
function digitStringMod(seed: string, m: number): number {
  let s = seed;
  if (s.startsWith("-")) s = s.slice(1);
  if (s.length === 0) return -1;
  let r = 0;
  for (let i = 0; i < s.length; i++) {
    const d = s.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return -1;
    r = (r * 10 + d) % m;
  }
  return r;
}

/** Palette index for a seed — numeric peer id (Telegram-style modulo) when the
 *  seed is a plain id, else a stable char-code hash of the string. */
export function peerColorIndex(seed: string): number {
  const byId = digitStringMod(seed, PEER_COLOR_COUNT);
  if (byId >= 0) return byId;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  return h % PEER_COLOR_COUNT;
}

export function senderColor(seed: string): string {
  const i = peerColorIndex(seed);
  return `var(--color-peer-${i}, ${SENDER_COLORS[i]})`;
}

/** RFC3339 → HH:MM (guards empty / invalid → ""). */
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
}

/** RFC3339 → chat-list style short stamp: HH:MM today, weekday this week,
 *  else DD.MM.YY. Guards invalid → "". */
export function fmtDialogTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit" });
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 7) return d.toLocaleDateString(dateLocale(), { weekday: "short" });
  return d.toLocaleDateString(dateLocale(), { day: "2-digit", month: "2-digit", year: "2-digit" });
}

/** RFC3339 → a date-separator label ("Today" / "Yesterday" / "12 July"). */
export function fmtDateSep(iso: string | null | undefined, tr: (k: string, d: string) => string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return tr("today", "Bugun");
  if (days === 1) return tr("yesterday", "Kecha");
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(dateLocale(), { day: "numeric", month: "long", ...(sameYear ? {} : { year: "numeric" }) });
}

/** Whether two ISO timestamps fall on different calendar days (for separators). */
export function isNewDay(prev: string | null | undefined, cur: string | null | undefined): boolean {
  if (!cur) return false;
  const c = new Date(cur);
  if (isNaN(c.getTime())) return false;
  if (!prev) return true;
  const p = new Date(prev);
  if (isNaN(p.getTime())) return true;
  return p.toDateString() !== c.toDateString();
}

export function KindGlyph({ kind, className }: { kind: TgDialogKind; className?: string }) {
  if (kind === "channel") return <Hash className={className} />;
  if (kind === "group") return <Users className={className} />;
  return <User className={className} />;
}

// URL matcher for linkifying plain text (trailing punctuation trimmed).
const URL_RE = /(https?:\/\/[^\s<]+)/g;

/** Turn http(s) URLs in plain text into clickable links. Non-URL runs are pushed
 *  as raw strings — React escapes them, so this is XSS-safe. */
export function linkify(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    const idx = m.index;
    let url = m[0];
    const trail = url.match(/[.,;:!?)\]]+$/);
    if (trail) url = url.slice(0, url.length - trail[0].length);
    if (!url) continue;
    if (idx > last) out.push(text.slice(last, idx));
    out.push(
      <a
        key={idx}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-[var(--tg-link)] underline underline-offset-2 hover:brightness-110"
      >
        {url}
      </a>,
    );
    last = idx + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Short human label for a media kind, used in chat-list previews ("📷 Photo"). */
export function mediaPreviewLabel(
  type: string | undefined,
  tr: (k: string, d: string) => string,
): string | null {
  switch (type) {
    case "photo": return tr("mPhoto", "Rasm");
    case "document": return tr("mFile", "Fayl");
    case "location": return tr("mLocation", "Manzil");
    case "webpage": return tr("mLink", "Havola");
    default: return null;
  }
}
