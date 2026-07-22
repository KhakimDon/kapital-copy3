import { useCallback, useEffect, useMemo, useRef } from "react";
import { create } from "zustand";
import { useAuth } from "@/shared/store/auth";
import { useTasksStore, type RemoteEvent } from "./local/store";

// ─────────────────────────────────────────────────────────────────────────────
// Realtime board socket. Connects to the backend board WS per company, applies
// every mutation message through the store's REMOTE-APPLY actions (which never
// re-broadcast), and mirrors presence snapshots into a tiny presence store.
// The socket is opened once at the board level and stays mounted across drawer
// open/close so `sendViewing` can report which card the user is looking at.
// ─────────────────────────────────────────────────────────────────────────────

export type PresenceUser = {
  /** username (matches auth.username) */
  id: string;
  name: string;
  /** the card this user currently has open, or null */
  card: string | null;
};

type PresenceState = {
  users: PresenceUser[];
  setUsers: (users: PresenceUser[]) => void;
  clear: () => void;
};

/** Latest presence snapshot (server sends a FULL list each time → replace). */
export const usePresenceStore = create<PresenceState>((set) => ({
  users: [],
  setUsers: (users) => set({ users }),
  clear: () => set({ users: [] }),
}));

/** The OTHER users (not me) currently viewing `cardId`. */
export function useCardViewers(cardId: string | null): PresenceUser[] {
  const users = usePresenceStore((s) => s.users);
  const username = useAuth((s) => s.username);
  return useMemo(
    () => (cardId ? users.filter((u) => u.card === cardId && u.id !== username) : []),
    [users, username, cardId],
  );
}

// Build the WS URL from the current origin (the axios client talks to a
// same-origin `/api/v2`, so the socket lives on the same host). Scheme follows
// the page protocol: wss on https, ws on http.
function boardSocketUrl(companyId: number, token: string): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws/tasks/board/${companyId}?token=${encodeURIComponent(token)}`;
}

const MIN_BACKOFF = 1000;
const MAX_BACKOFF = 5000;

/**
 * Open the board socket for `companyId`. Returns `sendViewing(cardId)` which the
 * drawer calls when a card opens (`cardId`) / closes (`null`). Auto-reconnects
 * with 1s→5s backoff, and closes + reconnects when the company changes.
 */
export function useBoardSocket(companyId: number | null): (cardId: string | null) => void {
  const applyRemote = useTasksStore((s) => s.applyRemote);
  const setUsers = usePresenceStore((s) => s.setUsers);
  const clearPresence = usePresenceStore((s) => s.clear);

  const wsRef = useRef<WebSocket | null>(null);
  const viewingRef = useRef<string | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(MIN_BACKOFF);
  const closedRef = useRef(false);

  const sendViewing = useCallback((cardId: string | null) => {
    viewingRef.current = cardId;
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "viewing", card: cardId }));
    }
  }, []);

  useEffect(() => {
    if (companyId == null) return;
    closedRef.current = false;

    const clearReconnect = () => {
      if (reconnectRef.current) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
    };

    const scheduleReconnect = () => {
      if (closedRef.current) return;
      clearReconnect();
      reconnectRef.current = setTimeout(connect, backoffRef.current);
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
    };

    function connect() {
      if (closedRef.current) return;
      // Guard against a duplicate socket (React StrictMode double-invoke).
      if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

      const token = useAuth.getState().token;
      if (!token) {
        // Not authenticated yet — retry shortly.
        scheduleReconnect();
        return;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(boardSocketUrl(companyId!, token));
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = MIN_BACKOFF;
        // Re-report the card we're looking at (survives a reconnect).
        if (viewingRef.current != null) {
          ws.send(JSON.stringify({ type: "viewing", card: viewingRef.current }));
        }
      };

      ws.onmessage = (ev) => {
        let msg: unknown;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }
        if (!msg || typeof (msg as { type?: unknown }).type !== "string") return;
        const m = msg as { type: string; users?: PresenceUser[] };
        if (m.type === "presence") {
          setUsers(Array.isArray(m.users) ? m.users : []);
          return;
        }
        applyRemote(msg as RemoteEvent);
      };

      ws.onerror = () => {
        // Let onclose drive the reconnect.
        try {
          ws.close();
        } catch {
          /* noop */
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        scheduleReconnect();
      };
    }

    connect();

    return () => {
      closedRef.current = true;
      clearReconnect();
      backoffRef.current = MIN_BACKOFF;
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        // Detach handlers so an intentional close doesn't schedule a reconnect.
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
      clearPresence();
    };
  }, [companyId, applyRemote, setUsers, clearPresence]);

  return sendViewing;
}
