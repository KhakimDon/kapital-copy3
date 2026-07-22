// Date helpers for the calendar views. All rendering is in LOCAL time; the
// API speaks RFC3339 (UTC) — `new Date(iso)` handles the conversion.

export const DAY_MS = 86_400_000;

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);

/** Monday-first start of week (the local convention). */
export function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(startOfDay(d), -day);
}

export const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const hhmm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** The 42-cell (6×7, Monday-first) grid that shows a month. */
export function monthGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Does [s1,e1) overlap the day `d`? */
export function onDay(s: Date, e: Date, d: Date): boolean {
  const ds = startOfDay(d).getTime();
  return s.getTime() < ds + DAY_MS && e.getTime() > ds;
}

/** Compare helper for chip ordering: all-day first, then by start. */
export function chipOrder(a: { allDay: boolean; startsAt: string }, b: { allDay: boolean; startsAt: string }) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return a.startsAt.localeCompare(b.startsAt);
}
