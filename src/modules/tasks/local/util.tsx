import type { Card, Member, Project } from "./model";

// ── ids / keys ────────────────────────────────────────────────────────────────
export const uid = (): string =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

export const cardKey = (project: Project | undefined, card: Pick<Card, "seq">): string =>
  project ? `${project.key}-${card.seq}` : `#${card.seq}`;

// ── avatars / colours ───────────────────────────────────────────────────────
const COLORS = [
  "#f97316", "#0ea5e9", "#10b981", "#a855f7", "#ec4899",
  "#eab308", "#3b82f6", "#14b8a6", "#ef4444", "#8b5cf6",
];
export function colorFor(seed?: string | null): string {
  let h = 0;
  const s = String(seed || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
}
export const initials = (name?: string | null): string => {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

/**
 * Resolve a board user id (`me:<username>`) to a Member. The roster comes from
 * the company's chat2 members, but a card can reference someone outside it —
 * e.g. a tenant admin who created/assigned it via the UI or MCP. Rather than
 * render a nameless "?" avatar (which made such tasks look ownerless while the
 * API/MCP correctly reported the user), fall back to the bare username so the
 * board matches what the backend actually stores.
 */
export function resolveMember(members: Member[], id?: string | null): Member | null {
  if (!id) return null;
  return (
    members.find((m) => m.id === id) ?? {
      id,
      name: id.replace(/^me:/, ""),
      avatar: null,
      color: null,
      role: null,
    }
  );
}

export function MemberAvatar({
  member,
  size = 24,
  ring = false,
}: {
  member?: Member | null;
  size?: number;
  ring?: boolean;
}) {
  const px = `${size}px`;
  const name = member?.name;
  const cls = `rounded-full inline-flex items-center justify-center shrink-0 ${ring ? "ring-2 ring-background" : ""}`;
  if (member?.avatar)
    return (
      <img
        src={member.avatar}
        alt={name || ""}
        title={name || ""}
        className={`object-cover ${cls}`}
        style={{ width: px, height: px }}
      />
    );
  return (
    <span
      className={`${cls} text-white font-medium`}
      style={{
        width: px,
        height: px,
        fontSize: size * 0.4,
        background: member?.color || colorFor(name),
      }}
      title={name || ""}
    >
      {initials(name)}
    </span>
  );
}

// ── dates ─────────────────────────────────────────────────────────────────────
export const todayISO = (): string => new Date().toISOString().slice(0, 10);

/** yyyy-mm-dd (or full ISO) → local Date at midnight. */
export function parseDay(iso?: string | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export const fmtDay = (iso?: string | null): string => (iso || "").slice(0, 10);

/** Exact local date+time — "dd.MM.yyyy HH:mm" — for the relative-time hover tooltip. */
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Whole days between two dates (b - a), ignoring time. */
export function daysBetween(a: Date, b: Date): number {
  const ms = 24 * 60 * 60 * 1000;
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((b0 - a0) / ms);
}

/** Days a card has spent in its current column (>= 0). */
export function daysInColumn(card: Card): number {
  const entered = parseDay(card.columnEnteredAt);
  if (!entered) return 0;
  return Math.max(0, daysBetween(entered, new Date()));
}

export function dueMeta(due?: string | null): { label: string; tone: "overdue" | "today" | "soon" | "normal" } | null {
  const d = parseDay(due);
  if (!d) return null;
  const delta = daysBetween(new Date(), d);
  const label = fmtDay(due);
  if (delta < 0) return { label, tone: "overdue" };
  if (delta === 0) return { label, tone: "today" };
  if (delta <= 2) return { label, tone: "soon" };
  return { label, tone: "normal" };
}

/** "3 kun oldin" style — coarse relative time, locale-agnostic numerals. */
export function relTime(iso: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const d = parseDay(iso) ?? new Date(iso);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return t("modules.tasks.time.now", { defaultValue: "hozir" });
  const min = Math.floor(sec / 60);
  if (min < 60) return t("modules.tasks.time.min", { defaultValue: "{{n}} daq oldin", n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("modules.tasks.time.hour", { defaultValue: "{{n}} soat oldin", n: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t("modules.tasks.time.day", { defaultValue: "{{n}} kun oldin", n: day });
  const mon = Math.floor(day / 30);
  if (mon < 12) return t("modules.tasks.time.month", { defaultValue: "{{n}} oy oldin", n: mon });
  return t("modules.tasks.time.year", { defaultValue: "{{n}} yil oldin", n: Math.floor(mon / 12) });
}

// Month grid (6 weeks) for the calendar view — Monday-first.
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const startDow = (first.getDay() + 6) % 7; // Mon=0
  const start = new Date(year, month, 1 - startDow);
  return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}
