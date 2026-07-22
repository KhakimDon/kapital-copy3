// Global notifications socket — same reconnect pattern as messenger/ws.ts:
// a single socket while the app shell is mounted, 1s→5s backoff, StrictMode-safe.
// Being connected to THIS socket = "present / active tab". The server pushes:
//   { type: "notification.new",  data: <NotificationItem> }
//   { type: "notification.read", data: { id?: string; all?: boolean } }
// On a new notification we pop a toast AND invalidate the bell query; on a read
// event we just invalidate the bell (another device/tab marked it read).
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/shared/store/auth";
import type { NotificationItem } from "@/shared/api/notifications";
import { useToastStore } from "./store";

type ServerEvent =
  | { type: "notification.new"; data: NotificationItem }
  | { type: "notification.read"; data: { id?: string; all?: boolean } };

function socketUrl(token: string): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws/notifications?token=${encodeURIComponent(token)}`;
}

const MIN_BACKOFF = 1000;
const MAX_BACKOFF = 5000;

/**
 * Open the global notifications socket. Mount ONCE in the authed app shell
 * (desktop-shell / mobile shell). Connects only when a token is present and
 * reconnects with backoff; safe under React StrictMode's double-invoke.
 */
export function useNotificationsSocket(): void {
  const qc = useQueryClient();
  const qcRef = useRef(qc);
  qcRef.current = qc;

  useEffect(() => {
    const push = useToastStore.getState().push;
    const invalidateBell = () =>
      void qcRef.current.invalidateQueries({ queryKey: ["notifications"] });

    let closed = false;
    let ws: WebSocket | null = null;
    let reconnect: ReturnType<typeof setTimeout> | null = null;
    let backoff = MIN_BACKOFF;

    const clearReconnect = () => {
      if (reconnect) {
        clearTimeout(reconnect);
        reconnect = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) return;
      clearReconnect();
      reconnect = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    };

    function connect() {
      if (closed) return;
      // Guard against a duplicate socket (StrictMode double-invoke).
      if (ws && ws.readyState <= WebSocket.OPEN) return;

      const token = useAuth.getState().token;
      if (!token) {
        // Not authed yet — retry later rather than opening an anonymous socket.
        scheduleReconnect();
        return;
      }

      let sock: WebSocket;
      try {
        sock = new WebSocket(socketUrl(token));
      } catch {
        scheduleReconnect();
        return;
      }
      ws = sock;

      sock.onopen = () => {
        backoff = MIN_BACKOFF;
      };

      sock.onmessage = (ev) => {
        let msg: unknown;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }
        if (!msg || typeof (msg as { type?: unknown }).type !== "string") return;
        const event = msg as ServerEvent;
        if (event.type === "notification.new") {
          push(event.data);
          invalidateBell();
        } else if (event.type === "notification.read") {
          invalidateBell();
        }
      };

      sock.onerror = () => {
        try {
          sock.close();
        } catch {
          /* noop */
        }
      };

      sock.onclose = () => {
        if (ws === sock) ws = null;
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      closed = true;
      clearReconnect();
      backoff = MIN_BACKOFF;
      const sock = ws;
      ws = null;
      if (sock) {
        sock.onopen = null;
        sock.onmessage = null;
        sock.onerror = null;
        sock.onclose = null;
        try {
          sock.close();
        } catch {
          /* noop */
        }
      }
    };
  }, []);
}
