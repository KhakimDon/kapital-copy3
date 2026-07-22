import { create } from "zustand";
import { persist } from "zustand/middleware";
import { navMap } from "./tab-nav";
import { ENTRY_URL } from "@/shared/entry-url";

/**
 * Open-tabs store for the Chrome-like multi-window shell. Each tab is an
 * independently-mounted route subtree (see TabsHost) so its component state
 * survives tab switches. We persist only {id, path} + activeId — the live
 * label/icon are derived from the path at render time (see tab-title.ts).
 */
export type Tab = { id: string; path: string };

const DEFAULT_PATH = "/";

function newId(): string {
  // Browser crypto — stable, collision-free tab ids.
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `t_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

// Same "module root" → same tab. /companies and /companies/5 share a tab;
// /soliq/... keeps the soliq router in one tab.
export function moduleRoot(path: string): string {
  const clean = path.split("?")[0];
  const seg = clean.split("/").filter(Boolean); // ["m","companies","5"]
  if (seg[0] === "m" && seg[1]) return `/${seg[1]}`;
  return "/" + (seg[0] ?? "");
}

type TabsState = {
  tabs: Tab[];
  activeId: string | null;
  /** Custom tab labels keyed by path (e.g. a document detail sets its own).
   *  In-memory only — re-derived from live data, so never persisted. */
  titles: Record<string, string>;
  /** Where a detail tab was opened FROM (path → the list URL, incl. query), so
   *  its Back can return to that exact list. In-memory only. */
  referrers: Record<string, string>;
  /** Open `path`: focus an existing tab for the same module root, else add a new one. */
  open: (path: string) => void;
  /** Always open a brand-new tab (the "+" button / open-in-new). */
  openNew: (path?: string) => void;
  close: (id: string) => void;
  setActive: (id: string) => void;
  /** Internal navigation inside a tab updates its stored path (for labels + persistence). */
  setPath: (id: string, path: string) => void;
  /** Override a tab's label (by path). Pass "" to clear back to the derived one. */
  setTitle: (path: string, title: string) => void;
  /** Record the list URL a detail tab was opened from (for smart Back). */
  setReferrer: (path: string, referrer: string) => void;
  /** Drag-reorder: move tab `fromId` to sit at `toId`'s position. */
  reorder: (fromId: string, toId: string) => void;
  reset: () => void;
};

export const useTabs = create<TabsState>()(
  persist(
    (set, get) => ({
      tabs: [],
      activeId: null,
      titles: {},
      referrers: {},

      open: (path) => {
        const root = moduleRoot(path);
        const existing = get().tabs.find((t) => moduleRoot(t.path) === root);
        if (existing) {
          // A sub-page target (e.g. /settings/access under the /settings
          // root) routes the existing module tab to it — otherwise clicking a
          // sibling settings item while another is open would silently do nothing.
          // A bare module click (path === its own root) just re-focuses the tab,
          // keeping whatever state it already has. The tab's MemoryRouter reads
          // `path` only at mount, so we navigate it live via navMap.
          // Navigate the existing module tab to a TARGETED open — either a
          // different sub-page (/settings/access under /settings) or a query
          // deep-link (/tasks?card=X, /calendar?date=…). A BARE module click
          // (path === root, no query) just re-focuses, keeping the tab's state.
          const hasTarget = path.split("?")[0] !== root || path.includes("?");
          set({ activeId: existing.id });
          if (hasTarget && existing.path !== path) {
            const nav = navMap.get(existing.id);
            if (nav) nav(path);
            else set((s) => ({ tabs: s.tabs.map((t) => (t.id === existing.id ? { ...t, path } : t)) }));
          }
          return;
        }
        const tab: Tab = { id: newId(), path };
        set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
      },

      openNew: (path = DEFAULT_PATH) => {
        const tab: Tab = { id: newId(), path };
        set((s) => ({ tabs: [...s.tabs, tab], activeId: tab.id }));
      },

      close: (id) =>
        set((s) => {
          const idx = s.tabs.findIndex((t) => t.id === id);
          if (idx === -1) return s;
          const tabs = s.tabs.filter((t) => t.id !== id);
          let activeId = s.activeId;
          if (s.activeId === id) {
            // Focus the neighbour (prefer the one to the right, like Chrome).
            const next = tabs[idx] ?? tabs[idx - 1] ?? null;
            activeId = next?.id ?? null;
          }
          if (tabs.length === 0) {
            const tab: Tab = { id: newId(), path: DEFAULT_PATH };
            return { tabs: [tab], activeId: tab.id };
          }
          return { tabs, activeId };
        }),

      setActive: (id) => set({ activeId: id }),

      setPath: (id, path) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.id === id ? { ...t, path } : t)),
        })),

      setTitle: (path, title) =>
        set((s) => {
          if ((s.titles[path] ?? "") === title) return s;
          const titles = { ...s.titles };
          if (title) titles[path] = title;
          else delete titles[path];
          return { titles };
        }),

      setReferrer: (path, referrer) =>
        set((s) =>
          s.referrers[path] === referrer ? s : { referrers: { ...s.referrers, [path]: referrer } },
        ),

      reorder: (fromId, toId) =>
        set((s) => {
          const from = s.tabs.findIndex((t) => t.id === fromId);
          const to = s.tabs.findIndex((t) => t.id === toId);
          if (from === -1 || to === -1 || from === to) return s;
          const tabs = [...s.tabs];
          const [moved] = tabs.splice(from, 1);
          tabs.splice(to, 0, moved);
          return { tabs };
        }),

      reset: () => set({ tabs: [], activeId: null, titles: {}, referrers: {} }),
    }),
    {
      name: "aiba.tabs",
      // Persist only the tabs + active id; labels are re-derived (see titles).
      partialize: (s) => ({ tabs: s.tabs, activeId: s.activeId }),
    },
  ),
);

/**
 * True when the active tab is the dashboard — the glass surface over the OS
 * wallpaper. Before the first tab is opened (fresh page load) it falls back to
 * the entry URL, so the frosted shell is already on the very first frame and the
 * blur never "pops in" a beat after mount.
 */
export function useDashActive(): boolean {
  return useTabs((s) => {
    const active = s.tabs.find((t) => t.id === s.activeId)?.path;
    const p = (active ?? (s.tabs.length === 0 ? ENTRY_URL : "")).split("?")[0];
    return p === "/dashboard" || p === "/";
  });
}
