// Signaling REST for calls (base /api/v2/messenger). These endpoints only ring
// members and mint LiveKit room JWTs — the actual media runs over LiveKit (see
// use-livekit.ts). Both plain async functions (for the WS handler, which can't
// use hooks) and thin react-query mutation wrappers (for components) are given.
import { useMutation } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { CallKind, CallToken } from "./call-store";

const BASE = "/messenger";

/** POST /calls → mints the caller's room + token and rings the other members. */
export type StartCallResult = { callId: string; room: string; token: string; url: string; kind: CallKind };

export async function postStartCall(p: { chatId: string; kind: CallKind }): Promise<StartCallResult> {
  return (await api.post<StartCallResult>(`${BASE}/calls`, { chatId: p.chatId, kind: p.kind })).data;
}

/** POST /calls/:id/accept → the callee's own room token. */
export async function postAcceptCall(callId: string): Promise<CallToken> {
  return (await api.post<CallToken>(`${BASE}/calls/${callId}/accept`, {})).data;
}

export async function postRejectCall(callId: string): Promise<void> {
  await api.post(`${BASE}/calls/${callId}/reject`, {});
}

export async function postEndCall(callId: string): Promise<void> {
  await api.post(`${BASE}/calls/${callId}/end`, {});
}

export type CallInfo = {
  id: string;
  status: string;
  room: string;
  kind: CallKind;
  caller: string;
  participants: string[];
};

export async function getCall(callId: string): Promise<CallInfo> {
  return (await api.get<CallInfo>(`${BASE}/calls/${callId}`)).data;
}

// ── hook wrappers ─────────────────────────────────────────────────────────────

export function useStartCall() {
  return useMutation({ mutationFn: postStartCall });
}

export function useAcceptCall() {
  return useMutation({ mutationFn: postAcceptCall });
}

export function useRejectCall() {
  return useMutation({ mutationFn: postRejectCall });
}

export function useEndCall() {
  return useMutation({ mutationFn: postEndCall });
}
