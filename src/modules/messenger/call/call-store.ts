// Active-call state machine for the messenger (voice + video over LiveKit).
// A single global zustand store — there is at most one live call at a time, so
// this doubles as the "am I busy?" guard the WS handler consults on `call.ring`.
//
// State machine:
//   idle ──startOutgoing──▶ outgoing ──markAccepted──▶ active ──reset──▶ idle
//   idle ──receiveIncoming▶ incoming ──setConnecting─▶ connecting ──markConnected──▶ active
//   (any) ──setError──▶ error ──reset──▶ idle
//
// Who connects to LiveKit when (see call-overlay): the CALLER connects as soon
// as startOutgoing lands a token (status=outgoing, ringback plays) so they are
// ready the instant the peer accepts; the CALLEE has no token until they accept
// (POST /accept → setConnecting), so it connects only in `connecting`.
import { create } from "zustand";

export type CallStatus =
  | "idle"
  | "incoming"
  | "outgoing"
  | "connecting"
  | "active"
  | "error";

export type CallKind = "audio" | "video";

export type CallPeer = { name: string; avatar?: string | null };

/** POST /calls (caller) and POST /calls/:id/accept (callee) token payloads. */
export type CallToken = { room: string; token: string; url: string; kind: CallKind };

type StartOutgoing = {
  callId: string;
  chatId: string;
  room: string;
  token: string;
  url: string;
  kind: CallKind;
  peer: CallPeer;
  isGroup: boolean;
};

type ReceiveIncoming = {
  callId: string;
  chatId: string;
  room: string;
  kind: CallKind;
  peer: CallPeer;
  isGroup: boolean;
};

type CallState = {
  status: CallStatus;
  callId: string | null;
  chatId: string | null;
  kind: CallKind;
  /** LiveKit room name. */
  room: string | null;
  /** LiveKit ws URL — null for the callee until they accept. */
  url: string | null;
  /** Room JWT — null for the callee until they accept. */
  token: string | null;
  peer: CallPeer | null;
  isGroup: boolean;
  /** epoch ms when the media session became active (for the duration timer). */
  startedAt: number | null;
  minimized: boolean;
  error: string | null;

  // ── transitions ────────────────────────────────────────────────────────────
  /** Caller: POST /calls returned; we hold a token → connect immediately. */
  startOutgoing: (p: StartOutgoing) => void;
  /** Callee: a `call.ring` arrived while idle. */
  receiveIncoming: (p: ReceiveIncoming) => void;
  /** Callee: POST /accept returned our token → begin connecting. */
  setConnecting: (p: CallToken) => void;
  /** Caller: `call.accepted` arrived → the peer picked up. */
  markAccepted: () => void;
  /** The LiveKit room finished connecting (advances connecting→active only). */
  markConnected: () => void;
  setMinimized: (v: boolean) => void;
  setError: (msg: string) => void;
  /** Full teardown back to idle (hangup / reject / ended / missed / close). */
  reset: () => void;
};

const IDLE = {
  status: "idle" as CallStatus,
  callId: null,
  chatId: null,
  kind: "audio" as CallKind,
  room: null,
  url: null,
  token: null,
  peer: null,
  isGroup: false,
  startedAt: null,
  minimized: false,
  error: null,
};

export const useCallStore = create<CallState>((set, get) => ({
  ...IDLE,

  startOutgoing: (p) =>
    set({
      status: "outgoing",
      callId: p.callId,
      chatId: p.chatId,
      room: p.room,
      token: p.token,
      url: p.url,
      kind: p.kind,
      peer: p.peer,
      isGroup: p.isGroup,
      startedAt: null,
      minimized: false,
      error: null,
    }),

  receiveIncoming: (p) =>
    set({
      status: "incoming",
      callId: p.callId,
      chatId: p.chatId,
      room: p.room,
      token: null,
      url: null,
      kind: p.kind,
      peer: p.peer,
      isGroup: p.isGroup,
      startedAt: null,
      minimized: false,
      error: null,
    }),

  setConnecting: (p) =>
    set({ status: "connecting", room: p.room, token: p.token, url: p.url, kind: p.kind }),

  markAccepted: () => {
    const s = get();
    if (s.status === "outgoing" || s.status === "connecting") {
      set({ status: "active", startedAt: s.startedAt ?? Date.now() });
    }
  },

  markConnected: () => {
    const s = get();
    if (s.status === "connecting") {
      set({ status: "active", startedAt: s.startedAt ?? Date.now() });
    }
  },

  setMinimized: (v) => set({ minimized: v }),

  setError: (msg) => set({ status: "error", error: msg, minimized: false }),

  reset: () => set({ ...IDLE }),
}));
