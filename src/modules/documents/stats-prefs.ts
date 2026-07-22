// Per-browser VIEW preferences for the Documents → Reports ("Hisobotlar") view.
// These are purely LOCAL display choices (which status groups render, row
// density, which bottom sections are shown) — they never touch the backend, so
// like messenger/tg/settings-store.ts they're persisted to localStorage
// (key `docs-stats-prefs`). The view header's "Vid" dropdown reads/writes them.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Row density: `compact` shows only status + name + amount; `detailed` adds the
 *  document date, sent/signed date and the counterparty (+ TIN) columns. */
export type StatsDensity = "compact" | "detailed";

/** The three status groups whose visibility the user can toggle. */
export type ToggleableStatus = "signed" | "pending" | "rejected";

export type StatsPrefsState = {
  // ── status-group visibility ────────────────────────────────────────────────
  signed: boolean;
  pending: boolean;
  rejected: boolean;
  // ── row density ────────────────────────────────────────────────────────────
  density: StatsDensity;
  // ── bottom sections ────────────────────────────────────────────────────────
  showDeadline: boolean;
  showRecent: boolean;

  // ── setters ────────────────────────────────────────────────────────────────
  setStatus: (key: ToggleableStatus, value: boolean) => void;
  setDensity: (density: StatsDensity) => void;
  setShowDeadline: (value: boolean) => void;
  setShowRecent: (value: boolean) => void;
};

export const useStatsPrefs = create<StatsPrefsState>()(
  persist(
    (set) => ({
      // status visibility — signed/pending on, rejected off by default.
      signed: true,
      pending: true,
      rejected: false,
      // density — the richer view is the default (matches the legacy layout).
      density: "detailed",
      // bottom sections — deadline on, recently-accepted off by default.
      showDeadline: true,
      showRecent: false,

      setStatus: (key, value) => set({ [key]: value } as Pick<StatsPrefsState, ToggleableStatus>),
      setDensity: (density) => set({ density }),
      setShowDeadline: (showDeadline) => set({ showDeadline }),
      setShowRecent: (showRecent) => set({ showRecent }),
    }),
    {
      name: "docs-stats-prefs",
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
