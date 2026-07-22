// Telegram (MTProto) bridge API — corporate TG accounts an admin connects via
// QR, their dialogs/messages, sending (with per-message AIBA-author attribution),
// and the per-group access grants. Mirrors the backend `/messenger/tg/*` routes.
// All types here are the backend contract; keep them in sync with tg.rs.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { api } from "@/shared/api/client";

const BASE = "/messenger/tg";

// ── types ─────────────────────────────────────────────────────────────────────

export type TgAccount = {
  id: number;
  title: string;
  phone: string | null;
  status: string;
};

export type TgDialogKind = "user" | "group" | "channel";

export type TgDialog = {
  chatId: number; // peer id (i64) — stable
  title: string;
  kind: TgDialogKind;
  unread: number;
  lastMessage: string | null;
  lastDate: string | null; // RFC3339 ISO from the backend
  /** True when the top message was sent by us (renders a "Siz:" prefix). */
  lastOut?: boolean;
  /** Display name of the top message's sender (for group previews). */
  lastSenderName?: string | null;
  /** Media tag of the top message, for a preview icon. Widened past the original
   *  4 coarse types; old backends still send the subset, new ones can send more,
   *  and the chat-list maps any unknown value to a defensive fallback. */
  lastMediaType?:
    | "photo" | "video" | "gif" | "audio" | "voice" | "sticker"
    | "document" | "location" | "venue" | "contact" | "poll" | "webpage" | "round"
    | null;
  /** The top message is a forward (renders a forward/share prefix icon). Optional
   *  + additive: the backend fills it later; the row renders nothing when absent. */
  lastForwarded?: boolean;
  /** The top message is a reply to a story (renders a story-reply prefix icon). */
  lastStoryReply?: boolean;
  /** Pinned in the chat list. */
  pinned?: boolean;
  /** Notifications muted for this dialog. */
  muted?: boolean;
  /** Lives in the Archived folder. */
  archived?: boolean;
  /** The account's own "Saved Messages" chat. */
  isSelf?: boolean;
  /** Unread @mentions of us in this dialog → a green "@" badge by the count.
   *  Optional + additive; the row treats a missing/zero value as "no badge". */
  mentionCount?: number;
  /** Unread reactions on our messages here → a red heart badge by the count. */
  reactionCount?: number;
  /** Manually "marked as unread" (messages.markDialogUnread) even with a zero
   *  unread count → an unread DOT on the row, like Telegram. */
  unreadMark?: boolean;
  /** A saved (unsent) draft in this dialog → a red "Draft:" preview prefix. */
  draft?: string;
  /** Private-chat peer is currently online → a green dot on the avatar. */
  online?: boolean;
  /** Peer badges (from the User/Channel flags). */
  verified?: boolean;
  scam?: boolean;
  fake?: boolean;
  premium?: boolean;
  /** Custom emoji-status (premium OR collectible/gift) → animated badge next to
   *  the name in the list, replacing the static premium star. */
  emojiStatus?: { documentId: string } | null;
  /** How many AIBA users are granted access to this chat → a "shared" icon on the
   *  row. 0/absent ⇒ no icon. */
  grantCount?: number;
  /** Whether the CURRENT AIBA user may send here (admins always true; a grantee's
   *  read-only grant ⇒ false → the composer is replaced by a read-only note). */
  canWrite?: boolean;
};

/** A group/channel member (for the profile panel members list). */
export type TgMember = {
  id: number;
  name: string;
  username?: string | null;
  phone?: string | null;
  isBot?: boolean;
  isAdmin?: boolean;
  isOwner?: boolean;
  online?: boolean;
  lastSeen?: string | null;
  avatarUrl?: string | null;
};

/** Media attached to a TG message (Phase-2b). Photo/document bytes are streamed
 *  through the auth'd media endpoint (see `tgMediaUrl`); location carries coords;
 *  webpage/link carries the URL. */
export type TgMediaType =
  | "photo" | "video" | "gif" | "audio" | "voice" | "sticker"
  | "document" | "location" | "venue" | "contact" | "poll" | "webpage" | "other";

export type TgPollOption = { text: string; voters: number };

export type TgMedia = {
  type: TgMediaType;
  name?: string | null;
  size?: number | null;
  mime?: string | null;
  /** dimensions (photo/video/gif/sticker) */
  w?: number | null;
  h?: number | null;
  /** seconds (video/gif/audio/voice) */
  duration?: number | null;
  /** audio metadata */
  title?: string | null;
  performer?: string | null;
  /** voice waveform (0–31 bars) */
  waveform?: number[] | null;
  /** sticker: static webp / tgs Lottie / webm video; + its emoji */
  kind?: "static" | "tgs" | "webm" | null;
  emoji?: string | null;
  /** round video message (bubble) */
  round?: boolean | null;
  /** location / venue */
  lat?: number | null;
  lon?: number | null;
  address?: string | null;
  /** contact */
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  userId?: number | null;
  /** poll */
  question?: string | null;
  options?: TgPollOption[] | null;
  closed?: boolean | null;
  totalVoters?: number | null;
  /** webpage/link */
  url?: string | null;
  siteName?: string | null;
  description?: string | null;
  hasPhoto?: boolean | null;
  /** true when the backend can stream the bytes at tgMediaUrl(...) */
  downloadable?: boolean;
};

/** One inline-keyboard button under a bot message. `callback` buttons carry an
 *  opaque base64 `data` payload to POST back via `useTgCallback`; `url` buttons
 *  carry a link to open. Anything we don't special-case is `"other"`. */
export type TgButton = {
  text: string;
  type: "callback" | "url" | "switchInline" | "other";
  /** base64 payload for a callback button (null otherwise). */
  data: string | null;
  /** link for a url button (null otherwise). */
  url: string | null;
};

/** A bot message's inline keyboard (buttons attached under the message). Only
 *  inline keyboards are surfaced; reply-keyboard markup maps to `null`. */
export type TgReplyMarkup = {
  rows: { buttons: TgButton[] }[];
};

/** A message entity — inline text formatting over a UTF-16 offset/length range
 *  (backend serializes grammers/tl MessageEntity variants). `url` on textUrl,
 *  `userId` on mentionName, `language` on pre. */
export type TgEntity = {
  type:
    | "bold" | "italic" | "underline" | "strike" | "spoiler"
    | "code" | "pre" | "blockquote"
    | "url" | "textUrl" | "mention" | "mentionName"
    | "hashtag" | "botCommand" | "email" | "phone" | "cashtag" | "customEmoji";
  offset: number;
  length: number;
  url?: string | null;
  userId?: number | null;
  language?: string | null;
  /** customEmoji: the sticker document id (fetch via tgCustomEmojiUrl). */
  documentId?: string | null;
};

/** The message this one replies to — a light quote header (msgId + a short
 *  preview of the quoted text / media kind). Null when not a reply. */
export type TgReplyTo = {
  msgId: number;
  senderName?: string | null;
  text?: string | null;
  mediaType?: "photo" | "document" | "location" | "webpage" | null;
};

/** One reaction bucket on a message: the emoji, its total count, and whether we
 *  (the corporate account) chose it. */
export type TgReaction = {
  emoji: string;
  count: number;
  chosen: boolean;
};

/** A service/action message ("pinned a message", "joined", …). When set, `text`
 *  and `media` are empty and the bubble renders as a centered service line. */
export type TgService = {
  kind: string;
  text: string;
};

export type TgMessage = {
  id: number;
  date: string; // RFC3339 ISO
  text: string;
  out: boolean;
  senderId: number | null;
  senderName: string | null;
  /** AIBA username that sent this (our attribution), for outgoing messages. */
  author: string | null;
  media?: TgMedia | null;
  /** Bot inline keyboard attached under the message, or null. */
  replyMarkup?: TgReplyMarkup | null;

  // ── extended fields (all optional; backend fills them, old clients ignore) ──
  /** Set (ISO) when the message was edited. */
  editDate?: string | null;
  /** The quoted message when this is a reply, else null. */
  replyTo?: TgReplyTo | null;
  /** Inline formatting spans over `text`. */
  entities?: TgEntity[] | null;
  /** Album grouping key (i64 as string); messages sharing it render as one album. */
  groupedId?: string | null;
  /** Channel view / forward counters. */
  views?: number | null;
  forwards?: number | null;
  /** Discussion replies / comments count (channel posts + group threads). */
  replies?: number | null;
  /** This message is pinned in the chat. */
  pinned?: boolean;
  /** Forward header (original sender), when the message is forwarded. `fwdPeerId`
   *  (optional) resolves the origin avatar/peer-colour; `kind` drives the
   *  channel/group pictogram. Old backends send only `senderName`. */
  fwdFrom?: {
    senderName: string | null;
    fwdPeerId?: number | null;
    kind?: TgDialogKind | null;
    /** Origin message id inside a channel (for a "go to original post" jump). */
    channelPost?: number | null;
  } | null;
  /** Reaction buckets on this message. */
  reactions?: TgReaction[] | null;
  /** Service/action line; when set, text/media are empty. */
  service?: TgService | null;
  /** Outgoing delivery state (own messages). Absent ⇒ treat as fully delivered
   *  (`read`) so historical messages never regress to a clock/tick. */
  sendingStatus?: "pending" | "sent" | "read" | "failed";
};

/** Auth'd URL that streams a message's photo/document bytes (resolve to a blob
 *  the same way messenger attachments do, since a plain <img src> can't carry
 *  the JWT). */
export function tgMediaUrl(accountId: number, chatId: number, msgId: number): string {
  return `${BASE}/accounts/${accountId}/chats/${chatId}/messages/${msgId}/media`;
}

/** Small thumbnail (video/gif poster) for a message's media. */
export function tgThumbUrl(accountId: number, chatId: number, msgId: number): string {
  return `${tgMediaUrl(accountId, chatId, msgId)}?thumb=1`;
}

/** Streams a custom-emoji sticker's bytes (tgs/webm/webp) for inline rendering. */
export function tgCustomEmojiUrl(accountId: number, documentId: string): string {
  return `${BASE}/accounts/${accountId}/custom-emoji/${documentId}/media`;
}

/** A peer's real profile photo bytes (falls back to a monogram avatar on 404). */
export function tgPeerPhotoUrl(accountId: number, peerId: number): string {
  return `${BASE}/accounts/${accountId}/peers/${peerId}/photo`;
}

export type TgGrant = {
  id: number;
  tgChatId: number;
  username: string;
  /** Read/write (true) vs read-only (false). */
  canWrite: boolean;
};

/** One AIBA user granted access to a SPECIFIC chat (for the profile's Access list). */
export type TgChatGrant = { id: number; username: string; canWrite: boolean };

export type QrStart = { loginId: string; qr: string; expires: number };
export type QrStatus = {
  status: "pending" | "password" | "done" | "error";
  qr?: string;
  accountId?: number;
  title?: string;
  message?: string;
};

// ── query keys ─────────────────────────────────────────────────────────────────

export const TG_CFG_KEY = ["tg", "configured"] as const;
export const TG_ACCOUNTS_KEY = ["tg", "accounts"] as const;
export const tgDialogsKey = (accountId: number) => ["tg", "dialogs", accountId] as const;
export const tgMessagesKey = (accountId: number, chatId: number) =>
  ["tg", "messages", accountId, chatId] as const;
export const tgGrantsKey = (accountId: number) => ["tg", "grants", accountId] as const;

// ── config + accounts ───────────────────────────────────────────────────────────

export function useTgConfigured() {
  return useQuery({
    queryKey: TG_CFG_KEY,
    queryFn: async () => (await api.get<{ configured: boolean }>(`${BASE}/configured`)).data.configured,
    staleTime: 60_000,
  });
}

export function useTgAccounts(enabled = true) {
  return useQuery({
    queryKey: TG_ACCOUNTS_KEY,
    queryFn: async () => (await api.get<{ items: TgAccount[] }>(`${BASE}/accounts`)).data.items,
    enabled,
  });
}

export function useDeleteTgAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.delete(`${BASE}/accounts/${id}`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: TG_ACCOUNTS_KEY }),
  });
}

// ── QR login (admin) ────────────────────────────────────────────────────────────

export async function tgQrStart(): Promise<QrStart> {
  return (await api.post<QrStart>(`${BASE}/qr/start`, {})).data;
}
export async function tgQrStatus(loginId: string): Promise<QrStatus> {
  return (await api.get<QrStatus>(`${BASE}/qr/status`, { params: { loginId } })).data;
}
export async function tgQrPassword(loginId: string, password: string): Promise<QrStatus> {
  return (await api.post<QrStatus>(`${BASE}/qr/password`, { loginId, password })).data;
}

// ── dialogs / messages / send ────────────────────────────────────────────────────

export function useTgDialogs(accountId: number | null) {
  return useQuery({
    queryKey: tgDialogsKey(accountId ?? 0),
    queryFn: async () =>
      (await api.get<{ items: TgDialog[] }>(`${BASE}/accounts/${accountId}/dialogs`)).data.items,
    enabled: accountId != null,
    // Live-ness safety net: the app disables focus-refetch globally, but the TG
    // dialog list should refresh when the user returns to the tab (e.g. after
    // sending from the real Telegram app) even if a WS event was missed.
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });
}

/** How many messages a page fetches. Scrolling up loads older pages via `beforeId`. */
export const TG_PAGE = 40;

type MsgPages = InfiniteData<TgMessage[], number | undefined>;

/** Flatten the infinite pages into one chronological (oldest→newest) list.
 *  Page 0 is the newest block, later pages are progressively older, so we reverse
 *  the page order; each page is already oldest→newest internally. */
function flattenPages(pages: TgMessage[][]): TgMessage[] {
  return pages.slice().reverse().flat();
}

/** Paginated message history for a TG chat. Page 0 = newest `TG_PAGE`; each
 *  `fetchNextPage()` loads the next-older block via `beforeId`. `data` is the
 *  flattened chronological array (via `select`) so consumers keep using it as a
 *  simple list, while `fetchNextPage` / `hasNextPage` / `isFetchingNextPage`
 *  drive the load-older-on-scroll behaviour. */
export function useTgMessages(accountId: number | null, chatId: number | null) {
  return useInfiniteQuery({
    queryKey: tgMessagesKey(accountId ?? 0, chatId ?? 0),
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<{ items: TgMessage[] }>(
          `${BASE}/accounts/${accountId}/chats/${chatId}/messages`,
          { params: { limit: TG_PAGE, beforeId: pageParam ?? undefined } },
        )
      ).data.items,
    // The oldest id of the last (oldest) page seeds the next older fetch; a short
    // page means we've reached the top of history.
    getNextPageParam: (lastPage) =>
      lastPage.length >= TG_PAGE ? lastPage[0]?.id : undefined,
    enabled: accountId != null && chatId != null,
    select: (data) => flattenPages(data.pages),
  });
}

// ── cache mutation helpers for the paginated message store (used by the WS
//    handler in page.tsx and the send/edit/delete flows) ──────────────────────

/** Append a freshly-arrived message to the newest page (dedup by id). */
export function appendTgMessage(qc: QueryClient, accountId: number, chatId: number, msg: TgMessage) {
  qc.setQueryData<MsgPages>(tgMessagesKey(accountId, chatId), (prev) => {
    if (!prev) return prev;
    const pages = prev.pages.slice();
    const first = pages[0] ?? [];
    if (first.some((m) => m.id === msg.id)) {
      // already present → patch in place (e.g. an optimistic → confirmed swap)
      pages[0] = first.map((m) => (m.id === msg.id ? msg : m));
    } else {
      pages[0] = [...first, msg];
    }
    return { ...prev, pages };
  });
}

/** Patch an existing message anywhere in the loaded pages (edit / reaction). */
export function patchTgMessage(
  qc: QueryClient,
  accountId: number,
  chatId: number,
  msgId: number,
  patch: Partial<TgMessage>,
) {
  qc.setQueryData<MsgPages>(tgMessagesKey(accountId, chatId), (prev) => {
    if (!prev) return prev;
    return {
      ...prev,
      pages: prev.pages.map((page) =>
        page.map((m) => (m.id === msgId ? { ...m, ...patch } : m)),
      ),
    };
  });
}

/** Remove messages by id from every loaded page (delete). */
export function removeTgMessages(qc: QueryClient, accountId: number, chatId: number, ids: number[]) {
  const gone = new Set(ids);
  qc.setQueryData<MsgPages>(tgMessagesKey(accountId, chatId), (prev) => {
    if (!prev) return prev;
    return { ...prev, pages: prev.pages.map((page) => page.filter((m) => !gone.has(m.id))) };
  });
}

/** Send a text message. Optional `replyTo` (a message id) and `entities`
 *  (inline formatting) ride along to the extended send endpoint. */
export function useSendTgMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      accountId: number;
      chatId: number;
      text: string;
      replyTo?: number | null;
      entities?: TgEntity[] | null;
      /** Silent send (no recipient notification sound). Additive + opt-in: the
       *  field is only put on the wire when true, so the default body is
       *  unchanged and a backend that doesn't yet support it is unaffected. */
      silent?: boolean;
    }) =>
      (
        await api.post<TgMessage>(`${BASE}/accounts/${p.accountId}/chats/${p.chatId}/send`, {
          text: p.text,
          replyTo: p.replyTo ?? null,
          entities: p.entities ?? null,
          ...(p.silent ? { silent: true } : {}),
        })
      ).data,
    onSuccess: (msg, p) => appendTgMessage(qc, p.accountId, p.chatId, msg),
  });
}

/** Send a media message (photo / document / voice) with an optional caption and
 *  reply. Uploads via multipart to the `send-media` endpoint. */
export function useSendTgMedia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      accountId: number;
      chatId: number;
      file: File | Blob;
      text?: string;
      replyTo?: number | null;
      kind?: "photo" | "document" | "voice";
      /** Silent send. Additive + opt-in: appended only when true. */
      silent?: boolean;
    }) => {
      const fd = new FormData();
      fd.append("file", p.file, (p.file as File).name ?? "file");
      if (p.text) fd.append("text", p.text);
      if (p.replyTo != null) fd.append("replyTo", String(p.replyTo));
      if (p.kind) fd.append("kind", p.kind);
      if (p.silent) fd.append("silent", "1");
      return (
        await api.post<TgMessage>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/send-media`,
          fd,
          { headers: { "Content-Type": "multipart/form-data" } },
        )
      ).data;
    },
    onSuccess: (msg, p) => appendTgMessage(qc, p.accountId, p.chatId, msg),
  });
}

/** Edit an own message's text (+ entities). */
export function useEditTgMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      accountId: number;
      chatId: number;
      msgId: number;
      text: string;
      entities?: TgEntity[] | null;
    }) =>
      (
        await api.post<TgMessage>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/messages/${p.msgId}/edit`,
          { text: p.text, entities: p.entities ?? null },
        )
      ).data,
    onSuccess: (msg, p) => patchTgMessage(qc, p.accountId, p.chatId, p.msgId, msg),
  });
}

/** Delete one or more messages (revoke = for everyone when allowed). */
export function useDeleteTgMessages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { accountId: number; chatId: number; ids: number[]; revoke?: boolean }) =>
      (
        await api.post<{ ok: boolean }>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/messages/delete`,
          { ids: p.ids, revoke: p.revoke ?? true },
        )
      ).data,
    onSuccess: (_d, p) => removeTgMessages(qc, p.accountId, p.chatId, p.ids),
  });
}

/** Set (or clear, with `emoji: null`) our reaction on a message. */
export function useReactTgMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { accountId: number; chatId: number; msgId: number; emoji: string | null }) =>
      (
        await api.post<{ ok: boolean }>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/messages/${p.msgId}/react`,
          { emoji: p.emoji },
        )
      ).data,
    onSuccess: (_d, p) =>
      void qc.invalidateQueries({ queryKey: tgMessagesKey(p.accountId, p.chatId) }),
  });
}

/** Forward one or more messages from this chat to another chat. */
export function useForwardTgMessages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { accountId: number; chatId: number; toChatId: number; ids: number[] }) =>
      (
        await api.post<{ ok: boolean }>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/messages/forward`,
          { toChatId: p.toChatId, ids: p.ids },
        )
      ).data,
    onSuccess: (_d, p) =>
      void qc.invalidateQueries({ queryKey: tgMessagesKey(p.accountId, p.toChatId) }),
  });
}

/** Pin (or unpin) a specific message in the chat. */
export function usePinTgMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { accountId: number; chatId: number; msgId: number; pinned: boolean }) =>
      (
        await api.post<{ ok: boolean }>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/messages/${p.msgId}/pin`,
          { pinned: p.pinned },
        )
      ).data,
    onSuccess: (_d, p) => patchTgMessage(qc, p.accountId, p.chatId, p.msgId, { pinned: p.pinned }),
  });
}

/** Server-side in-chat message search (full history, not just the loaded page). */
export function useTgSearch(accountId: number | null, chatId: number | null, q: string) {
  return useQuery({
    queryKey: ["tg", "search", accountId ?? 0, chatId ?? 0, q] as const,
    queryFn: async () =>
      (
        await api.get<{ items: TgMessage[]; nextBeforeId: number | null }>(
          `${BASE}/accounts/${accountId}/chats/${chatId}/search`,
          { params: { q, limit: TG_PAGE } },
        )
      ).data,
    enabled: accountId != null && chatId != null && q.trim().length > 0,
    staleTime: 30_000,
  });
}

/** Mark a TG chat read up to its latest message (clears the unread badge on TG
 *  and in our dialog list). */
export function useMarkTgRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { accountId: number; chatId: number }) =>
      (await api.post(`${BASE}/accounts/${p.accountId}/chats/${p.chatId}/read`, {})).data,
    onSuccess: (_d, p) =>
      void qc.invalidateQueries({ queryKey: tgDialogsKey(p.accountId) }),
  });
}

/** Mark a TG chat UNREAD (the inverse of `useMarkTgRead`, for the row's "Mark as
 *  unread" action). DEFENSIVE: the backend `/unread` route may not exist yet, so
 *  a failure is swallowed (no toast) and we still refresh the dialog list — once
 *  the endpoint ships this lights up the unread mark with no client change. */
export function useMarkTgUnread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { accountId: number; chatId: number }) => {
      try {
        return (await api.post(`${BASE}/accounts/${p.accountId}/chats/${p.chatId}/unread`, {})).data;
      } catch {
        return { ok: false };
      }
    },
    onSuccess: (_d, p) =>
      void qc.invalidateQueries({ queryKey: tgDialogsKey(p.accountId) }),
  });
}

// ── chat actions: pin / mute / archive / delete ──────────────────────────────────

/** Every chat-action endpoint returns `{ ok }` (best-effort on the backend). We
 *  invalidate the dialog list regardless so the row reflects the real TG state. */
type TgActionResult = { ok: boolean };

function useTgChatAction<V extends { accountId: number; chatId: number }>(
  run: (p: V) => Promise<TgActionResult>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (_d, p) => void qc.invalidateQueries({ queryKey: tgDialogsKey(p.accountId) }),
  });
}

/** Pin (or unpin) a dialog in the chat list. */
export function useTgPinChat() {
  return useTgChatAction(async (p: { accountId: number; chatId: number; pinned: boolean }) =>
    (
      await api.post<TgActionResult>(
        `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/${p.pinned ? "pin" : "unpin"}`,
        {},
      )
    ).data,
  );
}

/** Mute a dialog (forever by default, or until a unix timestamp) or unmute it. */
export function useTgMuteChat() {
  return useTgChatAction(
    async (p: { accountId: number; chatId: number; muted: boolean; until?: number | null }) =>
      (
        p.muted
          ? await api.post<TgActionResult>(
              `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/mute`,
              { until: p.until ?? null },
            )
          : await api.post<TgActionResult>(
              `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/unmute`,
              {},
            )
      ).data,
  );
}

/** Join (subscribe to) a channel / supergroup. Refreshes the peer detail (so the
 *  Join button flips to the composer / read-only bar) and the dialog list (the
 *  joined chat now appears there). */
export function useJoinTgChat() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { accountId: number; chatId: number }) =>
      (await api.post<TgActionResult>(`${BASE}/accounts/${p.accountId}/chats/${p.chatId}/join`, {}))
        .data,
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: tgPeerKey(p.accountId, p.chatId) });
      void qc.invalidateQueries({ queryKey: tgDialogsKey(p.accountId) });
    },
  });
}

/** Archive (or unarchive) a dialog. */
export function useTgArchiveChat() {
  return useTgChatAction(async (p: { accountId: number; chatId: number; archived: boolean }) =>
    (
      await api.post<TgActionResult>(
        `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/${p.archived ? "archive" : "unarchive"}`,
        {},
      )
    ).data,
  );
}

/** Delete/leave a chat: clears history for a user/basic group, leaves a channel. */
export function useTgDeleteChat() {
  return useTgChatAction(async (p: { accountId: number; chatId: number }) =>
    (await api.delete<TgActionResult>(`${BASE}/accounts/${p.accountId}/chats/${p.chatId}`)).data,
  );
}

// ── peer detail (profile panel + header status) ───────────────────────────────────

/** Real detail for a resolved peer. A user carries username/phone/bio + presence;
 *  a group/channel carries about + member count. `lastSeen` is an ISO datetime
 *  when known, else one of the fuzzy tokens `recently`/`lastWeek`/`lastMonth`. */
export type TgPeerDetail =
  | {
      kind: "user";
      /** Full display name (first + last) from getFullUser — the panel title. */
      name?: string | null;
      username: string | null;
      phone: string | null;
      bio: string | null;
      isBot: boolean;
      online: boolean;
      lastSeen: string | null;
      /** Inline formatting spans over `bio` (bold/italic/link/customEmoji/…), so
       *  the profile renders the bio with entities. OPTIONAL + additive: absent →
       *  the bio still renders (plain text is auto-linkified). */
      bioEntities?: TgEntity[] | null;
      /** Animated custom-emoji status shown next to the name (the sticker document
       *  id, fetched via `tgCustomEmojiUrl`). OPTIONAL — absent → the static
       *  premium star is shown instead. */
      emojiStatus?: { documentId: string } | null;
      /** The user's linked personal channel — rendered as the "ProfileChannel"
       *  card above the info rows. OPTIONAL + additive; absent → no card. */
      personalChannel?: { chatId: number; title: string; subscribers: number | null } | null;
    }
  | {
      kind: "group" | "channel";
      /** The group/channel title — the panel heading, and the resolved name for a
       *  forwarded-from origin. OPTIONAL + additive. */
      name?: string | null;
      about: string | null;
      membersCount: number | null;
      /** How many members are online right now (renders the ", N online" segment
       *  next to the member count). OPTIONAL — the header shows the online segment
       *  only when the backend supplies it; absent → just the total is shown. */
      onlineCount?: number | null;
      /** Inline formatting spans over `about`. OPTIONAL + additive (see the user
       *  variant's `bioEntities`). */
      aboutEntities?: TgEntity[] | null;
      /** The connected account can manage this group/channel (is an admin/owner) →
       *  the panel shows the management pencil in its header. OPTIONAL — absent →
       *  no management affordance (safe default). */
      canManage?: boolean;
      /** The account is a member (didn't leave / isn't only previewing). Drives the
       *  Join button vs the composer / read-only bar. OPTIONAL — absent ⇒ assume
       *  joined (safe default for older backends). */
      joined?: boolean;
      /** True for a real broadcast channel (only admins post), false for a
       *  megagroup (members post). OPTIONAL + additive. */
      isBroadcast?: boolean;
      /** The chat's allowed reactions: `"all"`, an explicit emoji list, or null/absent
       *  (→ the reaction picker falls back to a popular default set). */
      availableReactions?: string[] | "all" | null;
    };

export const tgPeerKey = (accountId: number, peerId: number) =>
  ["tg", "peer", accountId, peerId] as const;

/** Fetch real detail for a peer (user profile, or group/channel about+members).
 *  Best-effort on the backend — a resolution failure just leaves the query in an
 *  error state and the UI keeps its honest placeholders. */
export function useTgPeer(accountId: number | null, peerId: number | null) {
  return useQuery({
    queryKey: tgPeerKey(accountId ?? 0, peerId ?? 0),
    queryFn: async () =>
      (await api.get<TgPeerDetail>(`${BASE}/accounts/${accountId}/peers/${peerId}`)).data,
    enabled: accountId != null && peerId != null,
    staleTime: 60_000,
    retry: false,
  });
}

// ── typing + bot callbacks ───────────────────────────────────────────────────────

/** Tell Telegram we're typing in a chat (others see the "typing…" hint).
 *  Fire-and-forget: best-effort on the backend, no cache invalidation. Call it
 *  throttled from the composer as the user types. */
export function useSendTgTyping() {
  return useMutation({
    mutationFn: async (p: { accountId: number; chatId: number }) =>
      (await api.post(`${BASE}/accounts/${p.accountId}/chats/${p.chatId}/typing`, {})).data,
  });
}

/** The answer a bot returns when an inline-keyboard callback button is pressed:
 *  an optional toast `message` (shown as an `alert` when true) or a `url` to open. */
export type TgCallbackAnswer = {
  message: string | null;
  alert: boolean;
  url: string | null;
};

/** Press an inline-keyboard callback button on a bot message. Pass the button's
 *  base64 `data`; returns the bot's answer (toast / alert / url). */
export function useTgCallback() {
  return useMutation({
    mutationFn: async (p: { accountId: number; chatId: number; msgId: number; data: string }) =>
      (
        await api.post<TgCallbackAnswer>(
          `${BASE}/accounts/${p.accountId}/chats/${p.chatId}/messages/${p.msgId}/callback`,
          { data: p.data },
        )
      ).data,
  });
}

// ── grants (admin ACL) ───────────────────────────────────────────────────────────

/** Group/channel members for the profile panel. Best-effort; empty on failure. */
export function useTgMembers(accountId: number | null, chatId: number | null, enabled = true) {
  return useQuery({
    queryKey: ["tg", "members", accountId ?? 0, chatId ?? 0] as const,
    queryFn: async () =>
      (
        await api.get<{ items: TgMember[]; count: number }>(
          `${BASE}/accounts/${accountId}/chats/${chatId}/members`,
          { params: { limit: 200 } },
        )
      ).data,
    enabled: enabled && accountId != null && chatId != null,
    staleTime: 60_000,
    retry: false,
  });
}

export function useTgGrants(accountId: number | null) {
  return useQuery({
    queryKey: tgGrantsKey(accountId ?? 0),
    queryFn: async () =>
      (await api.get<{ items: TgGrant[] }>(`${BASE}/accounts/${accountId}/grants`)).data.items,
    enabled: accountId != null,
  });
}

/** The AIBA users granted access to a SPECIFIC chat (profile "Access" section). */
export const tgChatGrantsKey = (accountId: number, chatId: number) =>
  ["tg", "chat-grants", accountId, chatId] as const;

export function useAddTgGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      accountId: number;
      tgChatId: number;
      username: string;
      canWrite?: boolean;
    }) =>
      (
        await api.post(`${BASE}/accounts/${p.accountId}/grants`, {
          tgChatId: p.tgChatId,
          username: p.username,
          canWrite: p.canWrite ?? true,
        })
      ).data,
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: tgGrantsKey(p.accountId) });
      void qc.invalidateQueries({ queryKey: tgChatGrantsKey(p.accountId, p.tgChatId) });
      void qc.invalidateQueries({ queryKey: tgDialogsKey(p.accountId) });
    },
  });
}

export function useRemoveTgGrant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { accountId: number; grantId: number; tgChatId?: number }) =>
      (await api.delete(`${BASE}/accounts/${p.accountId}/grants/${p.grantId}`)).data,
    onSuccess: (_d, p) => {
      void qc.invalidateQueries({ queryKey: tgGrantsKey(p.accountId) });
      // Prefix-match every per-chat grants query for this account (the revoke
      // caller may not know the chatId), so the profile Access list refetches.
      void qc.invalidateQueries({ queryKey: ["tg", "chat-grants", p.accountId] });
      void qc.invalidateQueries({ queryKey: tgDialogsKey(p.accountId) });
    },
  });
}

/** Grantees of one chat, for the profile's "Access" section. */
export function useChatGrants(accountId: number | null, chatId: number | null) {
  return useQuery({
    queryKey: tgChatGrantsKey(accountId ?? 0, chatId ?? 0),
    queryFn: async () =>
      (
        await api.get<{ items: TgChatGrant[] }>(
          `${BASE}/accounts/${accountId}/chats/${chatId}/grants`,
        )
      ).data,
    enabled: accountId != null && chatId != null,
  });
}

// ── stories (statuslar) ───────────────────────────────────────────────────────
// The Telegram Stories bridge: a ribbon of peers-with-stories and a full-screen
// viewer. Mirrors the backend `/messenger/tg/accounts/:id/stories*` routes. The
// endpoint may not exist until the backend ships, so the reader is DEFENSIVE:
// any error yields zero peers (no toast, no throw) and the ribbon simply hides.

/** One story of a peer — a photo or an autoplay video, with its caption entities.
 *  `media` is null when the backend couldn't resolve the bytes (viewer shows a
 *  neutral placeholder and still auto-advances). Reuses TgEntity / TgMedia. */
export type TgStoryItem = {
  id: number;
  date: number; // unix seconds
  expireDate: number; // unix seconds
  seen: boolean;
  pinned: boolean;
  kind: "photo" | "video";
  caption: string | null;
  entities: TgEntity[];
  media: TgMedia | null;
};

/** A peer that currently has active stories (self or a contact/channel). */
export type TgStoryPeer = {
  peerId: number;
  name: string;
  isSelf: boolean;
  allSeen: boolean;
  items: TgStoryItem[];
};

export const tgStoriesKey = (accountId: number) => ["tg", "stories", accountId] as const;

/** Peers-with-stories for the ribbon. DEFENSIVE: never throws and never surfaces
 *  an error — a missing/failing endpoint (404/500 before the backend ships)
 *  resolves to an empty list, so the ribbon renders nothing and the chat list is
 *  untouched. Cached ~30s; no retry, no focus refetch. */
export function useTgStories(accountId: number) {
  return useQuery({
    queryKey: tgStoriesKey(accountId),
    queryFn: async (): Promise<TgStoryPeer[]> => {
      try {
        const r = await api.get<{ peers?: TgStoryPeer[] }>(`${BASE}/accounts/${accountId}/stories`);
        return r.data?.peers ?? [];
      } catch {
        return [];
      }
    },
    enabled: Number.isFinite(accountId) && accountId > 0,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/** Auth'd URL that streams a story's photo/video bytes — resolve through
 *  `useTgMediaSrc` (a bare <img>/<video src> can't carry the JWT). `thumb` yields
 *  the small poster. Mirrors `tgMediaUrl`'s base-URL construction. */
export function tgStoryMediaUrl(
  accountId: number,
  peerId: number,
  storyId: number,
  thumb = false,
): string {
  return `${BASE}/accounts/${accountId}/stories/${peerId}/${storyId}/media${thumb ? "?thumb=1" : ""}`;
}

/** Best-effort "mark this peer's stories seen up to maxId". Swallows errors — the
 *  ribbon greys the ring optimistically regardless of whether the POST lands. */
export function useMarkTgStorySeen() {
  return useMutation({
    mutationFn: async (p: { accountId: number; peerId: number; maxId: number }) => {
      try {
        return (
          await api.post<{ ok: boolean }>(
            `${BASE}/accounts/${p.accountId}/stories/${p.peerId}/read`,
            { maxId: p.maxId },
          )
        ).data;
      } catch {
        return { ok: false };
      }
    },
  });
}

// ── pinned messages (header pinned-bar) ───────────────────────────────────────
// The chat's pinned messages, shown as a floating bar under the MiddleHeader
// (TgPinnedBar). DEFENSIVE like stories: the backend may not expose `…/pinned`
// yet, so any error (404/500 before it ships) resolves to an empty list and the
// bar renders NOTHING — no toast, no throw, no layout impact.

/** A pinned message preview for the header pinned-bar: the message id (to jump to
 *  in the loaded scrollback), a short text preview, the sender's display name, and
 *  a coarse media tag so a media-only pin still shows a sensible label. */
export type TgPinnedMessage = {
  id: number;
  text: string;
  senderName?: string | null;
  mediaType?: "photo" | "document" | "location" | "webpage" | null;
};

export const tgPinnedKey = (accountId: number, chatId: number) =>
  ["tg", "pinned", accountId, chatId] as const;

/** Pinned messages for a chat (newest first). DEFENSIVE: a missing/failing
 *  endpoint yields an empty list, so the header pinned-bar stays hidden until the
 *  backend ships `…/pinned`. Cached ~30s; no retry, no focus refetch. */
export function useTgPinnedMessages(accountId: number | null, chatId: number | null) {
  return useQuery({
    queryKey: tgPinnedKey(accountId ?? 0, chatId ?? 0),
    queryFn: async (): Promise<TgPinnedMessage[]> => {
      try {
        const r = await api.get<{ items?: TgPinnedMessage[] }>(
          `${BASE}/accounts/${accountId}/chats/${chatId}/pinned`,
        );
        return r.data?.items ?? [];
      } catch {
        return [];
      }
    },
    enabled: accountId != null && chatId != null,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
