// Messenger module API — tenant-wide chats (dm + group), cursor-paginated
// messages, raw-body uploads and the authenticated attachment→blob-URL cache.
// Realtime updates arrive over the WS (see ws.ts) and are applied to these
// react-query caches through the exported cache mutators.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { api } from "@/shared/api/client";
// Type-only import from the sibling Telegram surface — the internal message model
// reuses the exact `TgEntity` shape so the shared `renderEntities` renderer can
// draw inline formatting / custom emoji when the backend supplies them.
import type { TgEntity } from "./tg/api";

// ── types (backend contract) ─────────────────────────────────────────────────

export type ChatMember = {
  username: string;
  name: string;
  /** "owner" | "admin" | "member" */
  role: string;
  /** Profile avatar (data-URL / http) or null. */
  avatar?: string | null;
  /** This member's last-read time (RFC3339) — drives read receipts. */
  readAt?: string | null;
  /** Animated custom-emoji status shown next to the name (the sticker document
   *  id). OPTIONAL + additive — absent for every AIBA-native user today, so the
   *  status badge simply doesn't render. Mirrors the TG surface's peer
   *  `emojiStatus` so the shared `TgEmojiStatus` renderer lights it up if a
   *  backend ever supplies it. */
  emojiStatus?: { documentId: string } | null;
};

/** One emoji reaction bucket on a message. */
export type Reaction = { emoji: string; count: number; mine: boolean };

export type Attachment = {
  name: string;
  mime: string;
  size: number;
  /** seconds — voice messages only */
  duration?: number;
  /** authenticated download path — resolve via useAttachmentSrc / fetchAttachmentBlob */
  url: string;
  /** When the backend explicitly marks this attachment as a sticker, its render
   *  kind (static webp / tgs Lottie / webm). OPTIONAL — absent → the kind is
   *  detected from the mime/name by `stickerKindOf` (a `.tgs` is unambiguous). */
  stickerKind?: "static" | "tgs" | "webm" | null;
};

/** Detect a Telegram-style sticker attachment. The internal message model has no
 *  `kind:"sticker"`, so a Lottie `.tgs` (or an animated/static sticker) arrives as
 *  `kind:"file"`; this recovers its sticker render-kind from an explicit
 *  `stickerKind` marker (a future backend) or, failing that, the mime/name.
 *  Returns null for every ordinary attachment (photo / document / voice), so a
 *  plain message is never mistaken for a sticker. Only a `.tgs` is auto-detected
 *  (unambiguous — no other file uses it); webm/webp are treated as stickers ONLY
 *  when the backend sets `stickerKind`, so real .webm videos / .webp photos are
 *  never hijacked. */
export function stickerKindOf(
  att: Attachment | null | undefined,
): "static" | "tgs" | "webm" | null {
  if (!att) return null;
  if (att.stickerKind) return att.stickerKind;
  const name = (att.name || "").toLowerCase();
  const mime = (att.mime || "").toLowerCase();
  if (name.endsWith(".tgs") || mime === "application/x-tgsticker") return "tgs";
  return null;
}

export type MessageKind = "text" | "file" | "image" | "voice";

export type Message = {
  id: string;
  chatId: string;
  sender: string;
  senderName: string;
  kind: MessageKind;
  body: string;
  attachment: Attachment | null;
  replyTo: string | null;
  editedAt: string | null;
  createdAt: string;
  deleted: boolean;
  /** Sender profile avatar (for group incoming clusters) or null. */
  senderAvatar?: string | null;
  /** Emoji reactions; absent/empty when none. */
  reactions?: Reaction[];
  /** Inline formatting spans over `body` (bold / italic / link / spoiler /
   *  customEmoji …) — the same shape the TG surface uses. OPTIONAL + additive:
   *  absent → the body renders as before (plain text); present → it's drawn
   *  through the shared `renderEntities` so rich formatting and inline custom
   *  emoji appear. */
  entities?: TgEntity[] | null;
};

export type Chat = {
  id: string;
  kind: "dm" | "group";
  title: string;
  avatar: string | null;
  members: ChatMember[];
  lastMessage: Message | null;
  unread: number;
  muted: boolean;
  /** Caller's pin flag — pinned chats sort first (server-ordered). */
  pinned?: boolean;
  updatedAt: string;
};

export type UserHit = { username: string; name: string; phone: string };

/** Attachment payload for POST /messages (upload result + optional duration). */
export type AttachmentInput = {
  key: string;
  name: string;
  mime: string;
  size: number;
  duration?: number;
};

const BASE = "/messenger";
const CHATS_KEY = ["messenger", "chats"] as const;
const msgsKey = (chatId: string) => ["messenger", "messages", chatId] as const;

export const uid = (): string =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// ── chats ────────────────────────────────────────────────────────────────────

export function useChats() {
  return useQuery({
    queryKey: CHATS_KEY,
    queryFn: async () => (await api.get<{ items: Chat[] }>(`${BASE}/chats`)).data.items,
  });
}

export function useCreateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { kind: "dm" | "group"; title?: string; memberUsernames: string[] }) =>
      (await api.post<Chat>(`${BASE}/chats`, p)).data,
    onSuccess: (chat) => upsertChat(qc, chat),
  });
}

export function useUpdateChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; title?: string; avatar?: string }) =>
      (await api.put(`${BASE}/chats/${p.id}`, { title: p.title, avatar: p.avatar })).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHATS_KEY }),
  });
}

export function useAddMembers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { chatId: string; usernames: string[] }) =>
      (await api.post(`${BASE}/chats/${p.chatId}/members`, { usernames: p.usernames })).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHATS_KEY }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { chatId: string; username: string }) =>
      (await api.delete(`${BASE}/chats/${p.chatId}/members/${encodeURIComponent(p.username)}`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: CHATS_KEY }),
  });
}

export function useMuteChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { chatId: string; muted: boolean }) =>
      (await api.post(`${BASE}/chats/${p.chatId}/mute`, { muted: p.muted })).data,
    onMutate: (p) => patchChat(qc, p.chatId, { muted: p.muted }),
    onError: () => void qc.invalidateQueries({ queryKey: CHATS_KEY }),
  });
}

export function usePinChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { chatId: string; pinned: boolean }) =>
      (await api.post(`${BASE}/chats/${p.chatId}/pin`, { pinned: p.pinned })).data,
    onMutate: (p) => patchChat(qc, p.chatId, { pinned: p.pinned }),
    // Re-pull so the server's pinned-first ordering is authoritative.
    onSettled: () => void qc.invalidateQueries({ queryKey: CHATS_KEY }),
  });
}

/** No DELETE /chats/:id in the contract — used for the owner "delete chat"
 *  menu item anyway; backend 404s until the endpoint lands. */
export function useDeleteChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: string) => (await api.delete(`${BASE}/chats/${chatId}`)).data,
    onSuccess: (_d, chatId) => {
      qc.setQueryData<Chat[]>([...CHATS_KEY], (list) => (list ?? []).filter((c) => c.id !== chatId));
    },
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (chatId: string) => (await api.post(`${BASE}/chats/${chatId}/read`, {})).data,
    onMutate: (chatId) => patchChat(qc, chatId, { unread: 0 }),
  });
}

// ── messages (cursor pagination: newest page first, ?before=<oldest id>) ─────

const PAGE = 50;
type MsgPages = InfiniteData<Message[], string>;

export function useMessages(chatId: string | null) {
  return useInfiniteQuery({
    queryKey: msgsKey(chatId ?? "-"),
    enabled: !!chatId,
    initialPageParam: "",
    queryFn: async ({ pageParam }) =>
      (
        await api.get<{ items: Message[] }>(`${BASE}/chats/${chatId}/messages`, {
          params: { limit: PAGE, ...(pageParam ? { before: pageParam } : {}) },
        })
      ).data.items,
    getNextPageParam: (last) => {
      if (last.length < PAGE) return undefined;
      // Oldest id of the page is the next `before` cursor (order-agnostic).
      const oldest = [...last].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      return oldest?.id;
    },
    staleTime: 60_000,
  });
}

/** Flatten + chronologically sort the infinite pages (dedup by id). */
export function flattenMessages(data: InfiniteData<Message[], unknown> | undefined): Message[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: Message[] = [];
  for (const page of data.pages) {
    for (const m of page) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    }
  }
  out.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return out;
}

export function useSendMessage(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      id?: string;
      kind?: MessageKind;
      body?: string;
      attachment?: AttachmentInput;
      replyTo?: string;
    }) => (await api.post<Message>(`${BASE}/chats/${chatId}/messages`, p)).data,
    onSuccess: (msg) => {
      appendMessage(qc, msg);
      bumpChatPreview(qc, msg, /* incrementUnread */ false);
    },
  });
}

export function useEditMessage(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; body: string }) =>
      (await api.put<Message>(`${BASE}/messages/${p.id}`, { body: p.body })).data,
    onSuccess: (msg, p) =>
      patchMessage(qc, chatId, p.id, msg ?? { body: p.body, editedAt: new Date().toISOString() }),
  });
}

export function useDeleteMessage(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`${BASE}/messages/${id}`)).data,
    onSuccess: (_d, id) => patchMessage(qc, chatId, id, { deleted: true, body: "", attachment: null }),
  });
}

/** Forward a message into another chat. The server creates a fresh Message in
 *  the target chat and broadcasts `message.new` there — we also fold the return
 *  value straight into that chat's caches so the sender sees it immediately. */
export function useForwardMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; toChatId: string }) =>
      (await api.post<Message>(`${BASE}/messages/${p.id}/forward`, { toChatId: p.toChatId })).data,
    onSuccess: (msg) => {
      appendMessage(qc, msg);
      bumpChatPreview(qc, msg, /* incrementUnread */ false);
    },
  });
}

// ── reactions ────────────────────────────────────────────────────────────────

/** Toggle `emoji` in a reactions list (pure). Adds when absent, un-reacts when
 *  already mine, otherwise reacts (count+1). */
export function toggleReactions(list: Reaction[] | undefined, emoji: string): Reaction[] {
  const arr = (list ?? []).map((r) => ({ ...r }));
  const i = arr.findIndex((r) => r.emoji === emoji);
  if (i === -1) return [...arr, { emoji, count: 1, mine: true }];
  const r = arr[i];
  if (r.mine) {
    const count = r.count - 1;
    if (count <= 0) {
      arr.splice(i, 1);
      return arr;
    }
    arr[i] = { ...r, count, mine: false };
    return arr;
  }
  arr[i] = { ...r, count: r.count + 1, mine: true };
  return arr;
}

/** Read one message out of the cursor cache (used for the optimistic react). */
export function findMessage(qc: QueryClient, chatId: string, id: string): Message | undefined {
  const data = qc.getQueryData<MsgPages>([...msgsKey(chatId)]);
  if (!data) return undefined;
  for (const p of data.pages) for (const m of p) if (m.id === id) return m;
  return undefined;
}

/** POST a reaction toggle. Optimistically patches the message's reactions in
 *  cache, then reconciles with the server copy (also echoed over the WS). */
export function useReact(chatId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { messageId: string; emoji: string }) =>
      (await api.post<Message>(`${BASE}/messages/${p.messageId}/react`, { emoji: p.emoji })).data,
    onMutate: (p) => {
      const cur = findMessage(qc, chatId, p.messageId);
      patchMessage(qc, chatId, p.messageId, { reactions: toggleReactions(cur?.reactions, p.emoji) });
    },
    onSuccess: (msg) => patchMessage(qc, chatId, msg.id, msg),
  });
}

// ── in-chat message search ───────────────────────────────────────────────────

export function useChatSearch(chatId: string, q: string) {
  return useQuery({
    queryKey: ["messenger", "search", chatId, q],
    enabled: !!chatId && q.trim().length >= 1,
    queryFn: async () =>
      (await api.get<{ items: Message[] }>(`${BASE}/chats/${chatId}/search`, { params: { q } })).data
        .items,
    staleTime: 15_000,
  });
}

// ── user search ──────────────────────────────────────────────────────────────

/** Tenant user directory search. `includeSelf` opts the CALLER back into the
 *  results — the "new chat" picker leaves it off, but the TG grant dialog turns
 *  it on so an admin can grant a chat to their own AIBA account. */
export function useUserSearch(q: string, includeSelf = false) {
  return useQuery({
    queryKey: ["messenger", "users", q, includeSelf],
    enabled: q.trim().length >= 1,
    queryFn: async () =>
      (
        await api.get<{ items: UserHit[] }>(`${BASE}/users`, {
          params: includeSelf ? { q, includeSelf: true } : { q },
        })
      ).data.items,
    staleTime: 30_000,
  });
}

// ── upload (raw bytes) ───────────────────────────────────────────────────────

export async function uploadFile(
  chatId: string,
  data: Blob,
  name: string,
  mime: string,
): Promise<{ key: string; name: string; mime: string; size: number }> {
  const r = await api.post<{ key: string; name: string; mime: string; size: number }>(
    `${BASE}/upload`,
    data,
    {
      params: { chat_id: chatId, name, mime },
      headers: { "Content-Type": "application/octet-stream" },
      timeout: 300_000,
    },
  );
  return r.data;
}

// ── attachment url → blob URL (needs the auth header, so no plain <img src>) ─

import { useEffect, useState } from "react";

/** Debounce a fast-changing value (search inputs) before it drives a query. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

const urlCache = new Map<string, string>();
const urlInflight = new Map<string, Promise<string>>();

/** attachment.url may be absolute or relative to /api/v2 — normalize for axios. */
const axiosPath = (url: string) =>
  /^https?:\/\//.test(url) ? url : url.startsWith("/api/v2/") ? url.slice("/api/v2".length) : url;

export function fetchAttachmentBlobUrl(url: string): Promise<string> {
  const hit = urlCache.get(url);
  if (hit) return Promise.resolve(hit);
  const pending = urlInflight.get(url);
  if (pending) return pending;
  const p = api
    .get(axiosPath(url), { responseType: "blob", timeout: 300_000 })
    .then((r) => {
      const obj = URL.createObjectURL(r.data as Blob);
      urlCache.set(url, obj);
      urlInflight.delete(url);
      return obj;
    })
    .catch((e) => {
      urlInflight.delete(url);
      throw e;
    });
  urlInflight.set(url, p);
  return p;
}

/** Resolve an authenticated attachment url into a cached blob object-URL. */
export function useAttachmentSrc(url: string | null | undefined): {
  src: string | null;
  loading: boolean;
  failed: boolean;
} {
  const [state, setState] = useState(() =>
    url
      ? { src: urlCache.get(url) ?? null, loading: !urlCache.has(url), failed: false }
      : { src: null, loading: false, failed: false },
  );
  useEffect(() => {
    if (!url) {
      setState({ src: null, loading: false, failed: false });
      return;
    }
    const hit = urlCache.get(url);
    if (hit) {
      setState({ src: hit, loading: false, failed: false });
      return;
    }
    let alive = true;
    setState({ src: null, loading: true, failed: false });
    fetchAttachmentBlobUrl(url).then(
      (u) => alive && setState({ src: u, loading: false, failed: false }),
      () => alive && setState({ src: null, loading: false, failed: true }),
    );
    return () => {
      alive = false;
    };
  }, [url]);
  return state;
}

/** Download an attachment through the auth client and save it under its name. */
export async function downloadAttachment(att: Attachment): Promise<void> {
  const src = await fetchAttachmentBlobUrl(att.url);
  const a = document.createElement("a");
  a.href = src;
  a.download = att.name || "file";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ── voice waveform (decode → normalized peak bars, cached) ───────────────────

const waveformCache = new Map<string, number[]>();
const waveformInflight = new Map<string, Promise<number[]>>();

/** Deterministic pseudo-waveform from a seed — the decode fallback so a bubble
 *  always shows *some* bars. Values in ~[0.15, 1]. */
export function pseudoWaveform(seed: string, buckets = 40): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  const out: number[] = [];
  for (let i = 0; i < buckets; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    out.push(0.15 + ((h >> 8) % 1000) / 1000 * 0.85);
  }
  return out;
}

/** Decode an audio attachment into `buckets` normalized peak bars (0..1),
 *  cached by url+buckets. Rejects when WebAudio can't decode the blob. */
export function decodeWaveform(url: string, buckets = 40): Promise<number[]> {
  const key = `${url}|${buckets}`;
  const hit = waveformCache.get(key);
  if (hit) return Promise.resolve(hit);
  const pending = waveformInflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    const src = await fetchAttachmentBlobUrl(url);
    const buf = await (await fetch(src)).arrayBuffer();
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ac = new Ctx();
    try {
      const audio = await ac.decodeAudioData(buf.slice(0));
      const ch = audio.getChannelData(0);
      const block = Math.max(1, Math.floor(ch.length / buckets));
      const peaks: number[] = [];
      for (let i = 0; i < buckets; i++) {
        let max = 0;
        const start = i * block;
        for (let j = 0; j < block && start + j < ch.length; j++) {
          const v = Math.abs(ch[start + j]);
          if (v > max) max = v;
        }
        peaks.push(max);
      }
      const norm = Math.max(...peaks, 0.0001);
      const out = peaks.map((v) => Math.max(0.08, v / norm));
      waveformCache.set(key, out);
      return out;
    } finally {
      void ac.close().catch(() => {});
      waveformInflight.delete(key);
    }
  })().catch((e) => {
    waveformInflight.delete(key);
    throw e;
  });
  waveformInflight.set(key, p);
  return p;
}

// ── cache mutators (used by mutations above AND the WS event handler) ────────

export function upsertChat(qc: QueryClient, chat: Chat): void {
  qc.setQueryData<Chat[]>([...CHATS_KEY], (list) => {
    const rest = (list ?? []).filter((c) => c.id !== chat.id);
    return [chat, ...rest].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  });
}

export function patchChat(qc: QueryClient, chatId: string, patch: Partial<Chat>): void {
  qc.setQueryData<Chat[]>([...CHATS_KEY], (list) =>
    (list ?? []).map((c) => (c.id === chatId ? { ...c, ...patch } : c)),
  );
}

/** Bump one member's `readAt` in the chats cache — driven by the WS `read`
 *  event so outgoing ticks turn blue live when a peer reads. */
export function patchMemberReadAt(
  qc: QueryClient,
  chatId: string,
  username: string,
  readAt: string,
): void {
  qc.setQueryData<Chat[]>([...CHATS_KEY], (list) =>
    (list ?? []).map((c) =>
      c.id === chatId
        ? { ...c, members: (c.members ?? []).map((m) => (m.username === username ? { ...m, readAt } : m)) }
        : c,
    ),
  );
}

/** Append a message to its chat's cache (dedup by id — covers the WS echo of
 *  our own optimistic sends). No-op when the chat's messages were never loaded. */
export function appendMessage(qc: QueryClient, msg: Message): void {
  qc.setQueryData<MsgPages>([...msgsKey(msg.chatId)], (data) => {
    if (!data || data.pages.length === 0) return data;
    if (data.pages.some((p) => p.some((m) => m.id === msg.id))) {
      // Echo of a known message — replace (server copy wins).
      return {
        ...data,
        pages: data.pages.map((p) => p.map((m) => (m.id === msg.id ? msg : m))),
      };
    }
    const pages = data.pages.slice();
    pages[0] = [...pages[0], msg];
    return { ...data, pages };
  });
}

export function patchMessage(
  qc: QueryClient,
  chatId: string,
  id: string,
  patch: Partial<Message>,
): void {
  qc.setQueryData<MsgPages>([...msgsKey(chatId)], (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((p) => p.map((m) => (m.id === id ? { ...m, ...patch } : m))),
        }
      : data,
  );
  // Keep the list preview honest for edits/deletes of the last message.
  qc.setQueryData<Chat[]>([...CHATS_KEY], (list) =>
    (list ?? []).map((c) =>
      c.id === chatId && c.lastMessage?.id === id
        ? { ...c, lastMessage: { ...c.lastMessage, ...patch } }
        : c,
    ),
  );
}

/** Move the chat to the top with a fresh lastMessage (+unread bump for
 *  messages from others when the chat isn't the one being read). */
export function bumpChatPreview(qc: QueryClient, msg: Message, incrementUnread: boolean): void {
  qc.setQueryData<Chat[]>([...CHATS_KEY], (list) => {
    if (!list) return list;
    const chat = list.find((c) => c.id === msg.chatId);
    if (!chat) return list;
    const next: Chat = {
      ...chat,
      lastMessage: msg,
      updatedAt: msg.createdAt,
      unread: incrementUnread ? chat.unread + 1 : chat.unread,
    };
    return [next, ...list.filter((c) => c.id !== msg.chatId)];
  });
}

// ── formatting helpers ───────────────────────────────────────────────────────

export const fmtTime = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/** Chat-list timestamp: HH:mm today, else dd.MM. */
export const fmtListTime = (iso: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  if (sameDay(d, new Date())) return fmtTime(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const dayKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const fmtSize = (n: number): string => {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
};

export const fmtDuration = (sec: number | undefined): string => {
  const s = Math.max(0, Math.round(sec ?? 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The dm counterpart (the member who is not me). `members` is defaulted so a
 *  partial/optimistic chat never crashes rendering. */
export const chatPartner = (chat: Chat, me: string | null | undefined): ChatMember | null => {
  const members = chat.members ?? [];
  return chat.kind === "dm" ? (members.find((m) => m.username !== me) ?? members[0] ?? null) : null;
};

export const chatDisplayTitle = (chat: Chat, me: string | null | undefined): string =>
  chat.title || chatPartner(chat, me)?.name || (chat.members ?? []).map((m) => m.name).join(", ") || "—";

/** Refetch the full chats list — used on the WS `chat.upsert` signal, which
 *  carries only `{id}` (create / update / member change / delete), so we must
 *  pull the authoritative rows rather than merge a partial object. */
export function invalidateChats(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: CHATS_KEY });
}
