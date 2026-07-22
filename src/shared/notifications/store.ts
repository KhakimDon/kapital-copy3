import { create } from "zustand";
import type { NotificationItem } from "@/shared/api/notifications";

/**
 * Holds the ACTIVE (currently-visible) toast notifications. The bell keeps the
 * full/persisted history — this store is only the ephemeral macOS-style stack
 * pushed by the notifications socket (see ./ws.ts) and rendered by
 * ./toast-host.tsx. Newest first; capped so a burst can't flood the screen.
 */

/** Hard cap on toasts kept in memory (visible + queued). Oldest fall off. */
const MAX_TOASTS = 8;

type ToastState = {
  toast: NotificationItem[];
  /** Add a notification to the top of the stack (de-duped by id). */
  push: (n: NotificationItem) => void;
  /** Remove one toast by id (does NOT touch the server / bell). */
  dismiss: (id: string) => void;
  /** Clear all active toasts (e.g. on logout). */
  clear: () => void;
};

export const useToastStore = create<ToastState>((set) => ({
  toast: [],
  push: (n) =>
    set((s) => ({
      // Newest on top; drop any existing toast with the same id first so a
      // re-delivered notification doesn't stack twice.
      toast: [n, ...s.toast.filter((t) => t.id !== n.id)].slice(0, MAX_TOASTS),
    })),
  dismiss: (id) => set((s) => ({ toast: s.toast.filter((t) => t.id !== id) })),
  clear: () => set({ toast: [] }),
}));
