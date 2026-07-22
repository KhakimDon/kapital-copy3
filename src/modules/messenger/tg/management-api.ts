// Telegram bridge — GROUP/CHANNEL MANAGEMENT API.
//
// Read + write hooks for the management right-column (admins, permissions,
// invite links, join requests, chat info). Mirrors the backend
// `/messenger/tg/accounts/:id/chats/:chatId/*` management routes. These are a
// SEPARATE hooks file from the shared `./api.ts` on purpose — the management
// surface is additive and every reader here is DEFENSIVE: the backend endpoints
// are being built in parallel, so a missing/failing route (404/500 before it
// ships) resolves to an honest empty/loading state (no throw, no retry, no
// toast) and the panel keeps its placeholders. Write actions POST best-effort
// and surface a "coming soon" toast when the endpoint isn't there yet
// (see `isTgNotImplemented`).
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { api } from "@/shared/api/client";

const BASE = "/messenger/tg";

// ── types (backend contract) ────────────────────────────────────────────────

/** The admin-rights bitmap for a group/channel administrator. Every flag is
 *  optional + additive so an older backend that omits some keys still parses. */
export type TgAdminRights = {
  changeInfo?: boolean;
  postMessages?: boolean;
  editMessages?: boolean;
  deleteMessages?: boolean;
  banUsers?: boolean;
  inviteUsers?: boolean;
  pinMessages?: boolean;
  manageCall?: boolean;
  addAdmins?: boolean;
  anonymous?: boolean;
};

/** The ordered set of admin-right keys, with the label + which chat kinds show
 *  it (mirrors ManageGroupAdminRights' checkbox list). */
export const ADMIN_RIGHT_KEYS: (keyof TgAdminRights)[] = [
  "changeInfo",
  "postMessages",
  "editMessages",
  "deleteMessages",
  "banUsers",
  "inviteUsers",
  "pinMessages",
  "manageCall",
  "addAdmins",
  "anonymous",
];

/** One administrator row from `GET …/admins`. */
export type TgAdmin = {
  id: number;
  name: string;
  rank?: string | null;
  isOwner: boolean;
  rights: TgAdminRights;
};

/** The default member permissions for a group/channel. Each flag is
 *  ALLOWED = true (the checkbox is checked when the member may do it). */
export type TgDefaultRights = {
  sendMessages?: boolean;
  sendMedia?: boolean;
  sendStickers?: boolean;
  sendPolls?: boolean;
  embedLinks?: boolean;
  inviteUsers?: boolean;
  pinMessages?: boolean;
  changeInfo?: boolean;
};

/** Ordered default-permission keys (mirrors ManageGroupPermissions). */
export const PERMISSION_KEYS: (keyof TgDefaultRights)[] = [
  "sendMessages",
  "sendMedia",
  "sendStickers",
  "sendPolls",
  "embedLinks",
  "inviteUsers",
  "pinMessages",
  "changeInfo",
];

/** `GET …/permissions`. */
export type TgPermissions = {
  defaultRights: TgDefaultRights;
  /** Slow-mode interval in seconds (0/undefined = off). */
  slowMode?: number | null;
};

/** One exported invite link from `GET …/invites`. */
export type TgInvite = {
  link: string;
  revoked: boolean;
  usage: number;
  usageLimit?: number | null;
  /** Unix seconds. */
  expireDate?: number | null;
  /** OPTIONAL extras a richer backend may send (additive). */
  title?: string | null;
  isPermanent?: boolean;
  requested?: number | null;
};

/** One pending join request from `GET …/join-requests`. */
export type TgJoinRequest = {
  id: number;
  name: string;
  about?: string | null;
  /** Unix seconds. */
  date: number;
};

// ── query keys ──────────────────────────────────────────────────────────────

export const tgAdminsKey = (a: number, c: number) => ["tg", "admins", a, c] as const;
export const tgPermsKey = (a: number, c: number) => ["tg", "perms", a, c] as const;
export const tgInvitesKey = (a: number, c: number) => ["tg", "invites", a, c] as const;
export const tgJoinReqKey = (a: number, c: number) => ["tg", "joinReq", a, c] as const;

// ── defensive readers ───────────────────────────────────────────────────────
// Every reader swallows errors → an empty/undefined result, never retries, and
// never refetches on focus. When the endpoint lands the data lights up with no
// client change.

/** Administrators (owner first). `[]` until the backend ships `…/admins`. */
export function useTgAdmins(accountId: number | null, chatId: number | null, enabled = true) {
  return useQuery({
    queryKey: tgAdminsKey(accountId ?? 0, chatId ?? 0),
    queryFn: async (): Promise<TgAdmin[]> => {
      try {
        const r = await api.get<{ items?: TgAdmin[] }>(
          `${BASE}/accounts/${accountId}/chats/${chatId}/admins`,
        );
        return r.data?.items ?? [];
      } catch {
        return [];
      }
    },
    enabled: enabled && accountId != null && chatId != null,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/** Default member permissions. `undefined` until `…/permissions` ships. */
export function useTgPermissions(accountId: number | null, chatId: number | null, enabled = true) {
  return useQuery({
    queryKey: tgPermsKey(accountId ?? 0, chatId ?? 0),
    queryFn: async (): Promise<TgPermissions | null> => {
      try {
        const r = await api.get<TgPermissions>(
          `${BASE}/accounts/${accountId}/chats/${chatId}/permissions`,
        );
        return r.data ?? null;
      } catch {
        return null;
      }
    },
    enabled: enabled && accountId != null && chatId != null,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/** Exported invite links. `[]` until `…/invites` ships. */
export function useTgInvites(accountId: number | null, chatId: number | null, enabled = true) {
  return useQuery({
    queryKey: tgInvitesKey(accountId ?? 0, chatId ?? 0),
    queryFn: async (): Promise<TgInvite[]> => {
      try {
        const r = await api.get<{ items?: TgInvite[] }>(
          `${BASE}/accounts/${accountId}/chats/${chatId}/invites`,
        );
        return r.data?.items ?? [];
      } catch {
        return [];
      }
    },
    enabled: enabled && accountId != null && chatId != null,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/** Pending join requests. `[]` until `…/join-requests` ships. */
export function useTgJoinRequests(accountId: number | null, chatId: number | null, enabled = true) {
  return useQuery({
    queryKey: tgJoinReqKey(accountId ?? 0, chatId ?? 0),
    queryFn: async (): Promise<TgJoinRequest[]> => {
      try {
        const r = await api.get<{ items?: TgJoinRequest[] }>(
          `${BASE}/accounts/${accountId}/chats/${chatId}/join-requests`,
        );
        return r.data?.items ?? [];
      } catch {
        return [];
      }
    },
    enabled: enabled && accountId != null && chatId != null,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

// ── write actions ───────────────────────────────────────────────────────────
// These POST best-effort. They do NOT swallow errors — the caller inspects the
// error with `isTgNotImplemented` and, when the route isn't there yet, shows a
// "coming soon" toast (optimistic local UI stays). On success we invalidate the
// matching reader so the confirmed server state flows back in.

/** True when an error means "the backend route isn't implemented yet" — a
 *  missing response (network/blocked) or a 404/405/501. The management writes
 *  fall back to a "coming soon" toast on these. */
export function isTgNotImplemented(err: unknown): boolean {
  const e = err as AxiosError | undefined;
  const status = e?.response?.status;
  return status === undefined || status === 404 || status === 405 || status === 501;
}

/** Save an administrator's rights (+ optional custom rank). POST `…/admins/:id`. */
export function useSetTgAdminRights() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      accountId: number;
      chatId: number;
      userId: number;
      rights: TgAdminRights;
      rank?: string | null;
    }) =>
      (
        await api.post<{ ok: boolean }>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/admins/${p.userId}`,
          { rights: p.rights, rank: p.rank ?? null },
        )
      ).data,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: tgAdminsKey(p.accountId, p.chatId) }),
  });
}

/** Dismiss an administrator (clear all rights). POST `…/admins/:id/dismiss`. */
export function useDismissTgAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { accountId: number; chatId: number; userId: number }) =>
      (
        await api.post<{ ok: boolean }>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/admins/${p.userId}/dismiss`,
          {},
        )
      ).data,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: tgAdminsKey(p.accountId, p.chatId) }),
  });
}

/** Save the default member permissions. POST `…/permissions` with the backend's
 *  `{ rights }` shape — the same default-rights keys the reader returns under
 *  `defaultRights` (ALLOWED = true). */
export function useSetTgPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      accountId: number;
      chatId: number;
      defaultRights: TgDefaultRights;
    }) =>
      (
        await api.post<{ ok: boolean }>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/permissions`,
          { rights: p.defaultRights },
        )
      ).data,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: tgPermsKey(p.accountId, p.chatId) }),
  });
}

/** Create a new invite link. POST `…/invites` → `{ link }`. Optional
 *  title / expiry / usage-limit ride along only when set (a bare call creates a
 *  default link); on success the invite list is invalidated so the new link
 *  flows back in. */
export function useCreateTgInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      accountId: number;
      chatId: number;
      title?: string;
      expireDate?: number | null;
      usageLimit?: number | null;
    }) =>
      (
        await api.post<{ link: string }>(`${BASE}/accounts/${p.accountId}/chats/${p.chatId}/invites`, {
          title: p.title,
          expireDate: p.expireDate,
          usageLimit: p.usageLimit,
        })
      ).data,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: tgInvitesKey(p.accountId, p.chatId) }),
  });
}

/** Revoke an invite link. POST `…/invites/revoke`. */
export function useRevokeTgInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { accountId: number; chatId: number; link: string }) =>
      (
        await api.post<{ ok: boolean }>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/invites/revoke`,
          { link: p.link },
        )
      ).data,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: tgInvitesKey(p.accountId, p.chatId) }),
  });
}

/** Accept or dismiss a single join request. POST `…/join-requests/:userId` with
 *  `{ approve }`. */
export function useAnswerTgJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      accountId: number;
      chatId: number;
      userId: number;
      approved: boolean;
    }) =>
      (
        await api.post<{ ok: boolean }>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/join-requests/${p.userId}`,
          { approve: p.approved },
        )
      ).data,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: tgJoinReqKey(p.accountId, p.chatId) }),
  });
}

/** Accept or dismiss EVERY pending join request by fanning out over the per-user
 *  route (`…/join-requests/:userId`, `{ approve }`) — the backend contract has no
 *  bulk endpoint, so this composes the one that exists, which means "accept/dismiss
 *  all" lights up the moment the per-user route ships. Rejects (→ coming-soon) if
 *  the route isn't there yet. */
export function useAnswerAllTgJoinRequests() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      accountId: number;
      chatId: number;
      userIds: number[];
      approved: boolean;
    }) => {
      await Promise.all(
        p.userIds.map((userId) =>
          api.post<{ ok: boolean }>(
            `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/join-requests/${userId}`,
            { approve: p.approved },
          ),
        ),
      );
      return { ok: true };
    },
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: tgJoinReqKey(p.accountId, p.chatId) }),
  });
}

/** Save the chat title + description. POST `…/info`. Invalidates the shared peer
 *  query so the info panel/header pick up the new title/about. */
export function useSaveTgChatInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { accountId: number; chatId: number; title: string; about: string }) =>
      (
        await api.post<{ ok: boolean }>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/info`,
          { title: p.title, about: p.about },
        )
      ).data,
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: ["tg", "peer", p.accountId, p.chatId] });
      void qc.invalidateQueries({ queryKey: ["tg", "dialogs", p.accountId] });
    },
  });
}

/** Set the chat privacy type (public username or private). POST `…/chat-type`. */
export function useSetTgChatType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      accountId: number;
      chatId: number;
      isPublic: boolean;
      username?: string;
    }) =>
      (
        await api.post<{ ok: boolean }>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/chat-type`,
          { isPublic: p.isPublic, username: p.username ?? null },
        )
      ).data,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: ["tg", "peer", p.accountId, p.chatId] }),
  });
}

/** Set which reactions members may use. POST `…/reactions` with
 *  `{ mode, emojis? }` — `emojis` is the allow-list that applies when
 *  `mode: "some"` (omitted otherwise). */
export function useSetTgReactions() {
  return useMutation({
    mutationFn: async (p: {
      accountId: number;
      chatId: number;
      mode: "all" | "some" | "none";
      emojis?: string[];
    }) =>
      (
        await api.post<{ ok: boolean }>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/reactions`,
          { mode: p.mode, emojis: p.emojis },
        )
      ).data,
  });
}
