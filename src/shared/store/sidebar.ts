import { create } from "zustand";
import { persist } from "zustand/middleware";

type SidebarState = {
  /** Collapsed = icon-only rail (labels + big logo hidden). Persisted. */
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
};

/** Left nav rail collapse state — remembers the last choice across sessions. */
export const useSidebar = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
    }),
    { name: "aiba.sidebar" }
  )
);
