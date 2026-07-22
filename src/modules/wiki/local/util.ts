export const uid = (): string =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

export const nowISO = (): string => new Date().toISOString();

/** Coarse "N min ago" relative time via i18n keys (falls back to uz). */
export function relAgo(iso: string, t: (k: string, o?: Record<string, unknown>) => string): string {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec < 45) return t("modules.wiki.time.now", { defaultValue: "hozir" });
  const min = Math.floor(sec / 60);
  if (min < 60) return t("modules.wiki.time.min", { defaultValue: "{{n}} daq oldin", n: Math.max(1, min) });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("modules.wiki.time.hour", { defaultValue: "{{n}} soat oldin", n: hr });
  const day = Math.floor(hr / 24);
  return t("modules.wiki.time.day", { defaultValue: "{{n}} kun oldin", n: day });
}

/** Exact "dd.MM.yyyy HH:mm" for hover tooltips. */
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const AVATAR_COLORS = ["#f97316", "#0ea5e9", "#10b981", "#a855f7", "#ec4899", "#eab308", "#3b82f6", "#14b8a6"];
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}
export function avatarInitials(name: string): string {
  return name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
}
