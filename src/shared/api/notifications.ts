import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

/** Source key of a notification → drives which app icon/tile is shown. */
export type NotificationSource =
  | "messenger"
  | "telegram"
  | "tasks"
  | "calendar"
  | "mail"
  | "system";

/**
 * The canonical notification shape shared with the backend + the global
 * notifications WebSocket (see `src/shared/notifications/*`).
 *
 * The legacy task-notification fields (`kind`, `taskId`, `taskTitle`, `actor`)
 * stay OPTIONAL for back-compat: older payloads / the tasks dashboard widget
 * still read them, while new payloads carry `title`/`body`/`icon`/`link`.
 */
export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  /** Source app key — "messenger" | "telegram" | "tasks" | ... (see NotificationSource). */
  icon: string;
  /** In-app deep link, e.g. "/messenger?chat=abc" or "/tasks?card=xyz". */
  link: string;
  /** Owning module (usually mirrors `icon`). */
  module: string;
  createdAt: string | null;
  isRead: boolean;
  // ── legacy task-notification fields (optional, back-compat) ──
  kind?: string;
  taskId?: string | null;
  taskTitle?: string | null;
  actor?: string | null;
};

/** @deprecated use {@link NotificationItem}. Kept as an alias for old imports. */
export type TaskNotification = NotificationItem;

export type NotificationsResponse = { items: NotificationItem[]; unread: number };

/** The caller's notifications + unread count. Polled for the bell badge. */
export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => (await api.get<NotificationsResponse>("/notifications")).data,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    placeholderData: { items: [], unread: 0 },
  });
}

/** Mark one (id) or all (no id) notifications read. */
export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id?: string) => (await api.post("/notifications/read", id ? { id } : {})).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
