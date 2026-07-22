// Per-browser user preferences (persisted to localStorage). Kept client-side so
// it needs no backend; the profile dropdown exposes the toggles. Time format
// (24-hour vs AM/PM) drives how the calendar renders clock times.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type TimeFormat = "24h" | "12h";

type PrefsState = {
  timeFormat: TimeFormat;
  setTimeFormat: (f: TimeFormat) => void;
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      timeFormat: "24h",
      setTimeFormat: (timeFormat) => set({ timeFormat }),
    }),
    { name: "aiba-prefs", version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);

/** Format a Date's clock time per the given format. */
export function formatTime(d: Date, fmt: TimeFormat): string {
  const m = String(d.getMinutes()).padStart(2, "0");
  if (fmt === "12h") {
    const ap = d.getHours() < 12 ? "AM" : "PM";
    const h = d.getHours() % 12 || 12;
    return `${h}:${m} ${ap}`;
  }
  return `${String(d.getHours()).padStart(2, "0")}:${m}`;
}

/** Format a whole-hour label (e.g. axis labels) per the given format. */
export function formatHour(h: number, fmt: TimeFormat): string {
  if (fmt === "12h") {
    const ap = h < 12 ? "AM" : "PM";
    return `${h % 12 || 12} ${ap}`;
  }
  return `${String(h).padStart(2, "0")}:00`;
}

/** Hook returning stable time/hour formatters bound to the current preference. */
export function useTimeFmt() {
  const fmt = usePrefs((s) => s.timeFormat);
  return {
    fmt,
    time: (d: Date) => formatTime(d, fmt),
    hour: (h: number) => formatHour(h, fmt),
  };
}
