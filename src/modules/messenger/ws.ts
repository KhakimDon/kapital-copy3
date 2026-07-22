// Messenger realtime socket — same reconnect pattern as tasks/board-ws.ts:
// single socket per mounted page, 1s→5s backoff, StrictMode-safe. Server
// pushes {type, data} events; the client only ever sends typing pings
// (throttled to one per chat per 3s).
import { useCallback, useEffect, useRef } from "react";
import { useAuth } from "@/shared/store/auth";
import type { Chat, Message } from "./api";
import type { TgMessage } from "./tg/api";

export type ServerEvent =
  | { type: "message.new"; data: Message }
  | { type: "message.edit"; data: Message }
  | { type: "message.delete"; data: { id: string; chatId: string } & Partial<Message> }
  | { type: "chat.upsert"; data: Chat }
  | { type: "read"; data: { chatId: string; username: string } }
  | { type: "typing"; data: { chatId: string; username: string; name?: string } }
  // ── calls (LiveKit signaling; see call/) ──────────────────────────────────
  | {
      type: "call.ring";
      data: {
        callId: string;
        chatId: string;
        room: string;
        kind: "audio" | "video";
        caller: string;
        callerName?: string;
        callerAvatar?: string | null;
      };
    }
  | { type: "call.accepted"; data: { callId: string; username: string } }
  | { type: "call.rejected"; data: { callId: string } }
  | { type: "call.ended"; data: { callId: string } }
  | { type: "call.missed"; data: { callId: string } }
  // Telegram bridge: a new message arrived in a connected TG account's chat
  // (delivered to AIBA users granted access to that chat).
  | { type: "tg.message"; data: { accountId: number; chatId: number; message: TgMessage } }
  // Telegram bridge: someone is typing in a connected TG account's chat
  // (fanned out to the same grantees as tg.message). userId/name may be null.
  | {
      type: "tg.typing";
      data: { accountId: number; chatId: number; userId: number | null; name: string | null };
    }
  // Telegram bridge: a message was edited (full new MessageOut).
  | { type: "tg.edit"; data: { accountId: number; chatId: number; message: TgMessage } }
  // Telegram bridge: message(s) deleted in a chat.
  | { type: "tg.delete"; data: { accountId: number; chatId: number; ids: number[] } }
  // Telegram bridge: our outgoing messages were read up to `maxId` (blue ticks).
  | { type: "tg.read"; data: { accountId: number; chatId: number; maxId: number } }
  // Telegram bridge: a message's reactions changed.
  | {
      type: "tg.reaction";
      data: {
        accountId: number;
        chatId: number;
        msgId: number;
        reactions: { emoji: string; count: number; chosen: boolean }[];
      };
    };

function socketUrl(token: string): string {
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${window.location.host}/ws/messenger?token=${encodeURIComponent(token)}`;
}

const MIN_BACKOFF = 1000;
const MAX_BACKOFF = 5000;
const TYPING_THROTTLE = 3000;

/**
 * Open the messenger socket. `onEvent` receives every parsed server event
 * (identity changes are fine — kept in a ref). Returns `sendTyping(chatId)`.
 */
export function useMessengerSocket(onEvent: (ev: ServerEvent) => void): (chatId: string) => void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoffRef = useRef(MIN_BACKOFF);
  const closedRef = useRef(false);
  const lastTypingRef = useRef<Map<string, number>>(new Map());

  const sendTyping = useCallback((chatId: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const now = Date.now();
    const last = lastTypingRef.current.get(chatId) ?? 0;
    if (now - last < TYPING_THROTTLE) return;
    lastTypingRef.current.set(chatId, now);
    ws.send(JSON.stringify({ type: "typing", chatId }));
  }, []);

  useEffect(() => {
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
        scheduleReconnect();
        return;
      }

      let ws: WebSocket;
      try {
        ws = new WebSocket(socketUrl(token));
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = MIN_BACKOFF;
      };

      ws.onmessage = (ev) => {
        let msg: unknown;
        try {
          msg = JSON.parse(typeof ev.data === "string" ? ev.data : "");
        } catch {
          return;
        }
        if (!msg || typeof (msg as { type?: unknown }).type !== "string") return;
        handlerRef.current(msg as ServerEvent);
      };

      ws.onerror = () => {
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
    };
  }, []);

  return sendTyping;
}
