// Middle column — header (title / typing / member count), the message scroll
// area (date pills, sender clustering, infinite up-scroll with scroll
// anchoring, stick-to-bottom + unread FAB) and the composer.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDown,
  ArrowLeft,
  Bell,
  BellOff,
  ChevronDown,
  ChevronUp,
  Forward,
  Info,
  Loader2,
  LogOut,
  MoreVertical,
  Phone,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import {
  chatDisplayTitle,
  chatPartner,
  dayKey,
  flattenMessages,
  useChatSearch,
  useDebounced,
  useDeleteChat,
  useDeleteMessage,
  useMarkRead,
  useMessages,
  useMuteChat,
  useReact as useReactMutation,
  useRemoveMember,
  type Chat,
  type Message,
} from "./api";
import { ChatAvatar } from "./avatar";
import { Composer } from "./composer";
import { ForwardDialog } from "./forward-dialog";
import { MessageBubble } from "./message-bubble";
// Shared animated emoji-status renderer (from the sibling tg/ surface).
import { TgEmojiStatus } from "./tg/tg-emoji-status";
import { useStartCall } from "./call/call-api";
import { useCallStore, type CallKind } from "./call/call-store";
// Telegram Web A MiddleHeader "island" styles (ported 1:1) — reused for the
// internal chat header so it matches the tg/ bridge pane exactly.
import "./tg/tgweb-middle.css";

const NEAR_BOTTOM_PX = 150;
const CLUSTER_GAP_MS = 5 * 60_000;

export function ChatPane({
  chat,
  me,
  typingName,
  onBack,
  onToggleInfo,
  sendTyping,
}: {
  chat: Chat;
  me: string | null | undefined;
  /** Who is typing in this chat right now (display name), or null. */
  typingName: string | null;
  onBack: () => void;
  onToggleInfo: () => void;
  sendTyping: (chatId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.${k}`, { defaultValue: d });

  const msgsQ = useMessages(chat.id);
  const messages = useMemo(() => flattenMessages(msgsQ.data), [msgsQ.data]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const markRead = useMarkRead();
  const mute = useMuteChat();
  const removeMember = useRemoveMember();
  const deleteChat = useDeleteChat();
  const deleteMsg = useDeleteMessage(chat.id);
  const react = useReactMutation(chat.id);

  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);

  // Transient bottom toast (e.g. "forwarded"), auto-dismissed.
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHint = useCallback((msg: string) => {
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 2200);
  }, []);
  useEffect(() => () => void (hintTimer.current && clearTimeout(hintTimer.current)), []);

  // ── selection mode + forwarding ─────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // null = closed; otherwise the message ids queued for the forward dialog.
  const [forwardIds, setForwardIds] = useState<string[] | null>(null);

  const toggleSelect = useCallback((m: Message) => {
    setSelectedIds((s) => {
      const next = new Set(s);
      if (next.has(m.id)) next.delete(m.id);
      else next.add(m.id);
      return next;
    });
  }, []);
  const startSelect = useCallback((m: Message) => {
    setSelectMode(true);
    setSelectedIds(new Set([m.id]));
  }, []);
  const exitSelect = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // ── calls (LiveKit; overlay lives at the page root) ──────────────────────────
  const startCall = useStartCall();
  const placeCall = useCallback(
    (kind: CallKind) => {
      // Ignore if a call is already up (busy).
      if (useCallStore.getState().status !== "idle") return;
      const peerMember = chatPartner(chat, me);
      const peer = {
        name: chatDisplayTitle(chat, me),
        avatar: chat.avatar ?? peerMember?.avatar ?? null,
      };
      startCall.mutate(
        { chatId: chat.id, kind },
        {
          onSuccess: (res) =>
            useCallStore.getState().startOutgoing({
              callId: res.callId,
              chatId: chat.id,
              room: res.room,
              token: res.token,
              url: res.url,
              kind: res.kind,
              peer,
              isGroup: chat.kind === "group",
            }),
          onError: () =>
            useCallStore
              .getState()
              .setError(tr("callFailed", "Qo'ng'iroq serveriga ulanib bo'lmadi")),
        },
      );
    },
    [chat, me, startCall, tr],
  );

  // in-chat search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const debouncedSearchQ = useDebounced(searchQ.trim(), 300);
  const searchRes = useChatSearch(searchOpen ? chat.id : "", debouncedSearchQ);
  const searchItems = searchRes.data ?? [];
  const [searchIdx, setSearchIdx] = useState(0);

  // Reset search when the chat changes.
  useEffect(() => {
    setSearchOpen(false);
    setSearchQ("");
    setSearchIdx(0);
  }, [chat.id]);
  useEffect(() => {
    setSearchIdx(0);
  }, [debouncedSearchQ]);
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  // ── scroll plumbing ─────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const [showFab, setShowFab] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const prevLastIdRef = useRef<string | null>(null);
  const prevChatRef = useRef<string | null>(null);
  // Only messages created after this mark animate in (skip the initial load).
  const animateAfterRef = useRef(Date.now());
  // Anchor for up-pagination: remember scrollHeight before older pages render.
  const anchorRef = useRef<{ height: number; top: number } | null>(null);
  const pagesCountRef = useRef(0);

  const scrollToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setNewCount(0);
  }, []);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = fromBottom < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    setShowFab(!near);
    if (near) setNewCount(0);
  };

  // Chat switched → jump to the bottom instantly once messages exist.
  useLayoutEffect(() => {
    if (prevChatRef.current === chat.id) return;
    if (messages.length === 0 && msgsQ.isLoading) return;
    prevChatRef.current = chat.id;
    prevLastIdRef.current = messages[messages.length - 1]?.id ?? null;
    animateAfterRef.current = Date.now() - 500; // small buffer for clock skew
    nearBottomRef.current = true;
    setNewCount(0);
    setReplyTo(null);
    setEditing(null);
    setSelectMode(false);
    setSelectedIds(new Set());
    setForwardIds(null);
    scrollToBottom(false);
  }, [chat.id, messages, msgsQ.isLoading, scrollToBottom]);

  // Older page landed → keep the viewport anchored on the same message.
  useLayoutEffect(() => {
    const pages = msgsQ.data?.pages.length ?? 0;
    if (pages > pagesCountRef.current && anchorRef.current && scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = anchorRef.current.top + (el.scrollHeight - anchorRef.current.height);
      anchorRef.current = null;
    }
    pagesCountRef.current = pages;
  }, [msgsQ.data?.pages.length]);

  // New tail message → stick to bottom (if near) or bump the FAB counter.
  useLayoutEffect(() => {
    const last = messages[messages.length - 1];
    if (!last || prevChatRef.current !== chat.id) return;
    if (prevLastIdRef.current === last.id) return;
    prevLastIdRef.current = last.id;
    if (nearBottomRef.current || last.sender === me) {
      scrollToBottom(true);
    } else {
      setNewCount((c) => c + 1);
    }
  }, [messages, chat.id, me, scrollToBottom]);

  // Top sentinel → fetch older messages.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = sentinelRef.current;
    const root = scrollRef.current;
    if (!node || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (!msgsQ.hasNextPage || msgsQ.isFetchingNextPage || msgsQ.isLoading) return;
        anchorRef.current = { height: root.scrollHeight, top: root.scrollTop };
        void msgsQ.fetchNextPage();
      },
      { root, rootMargin: "200px 0px 0px 0px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [msgsQ, chat.id]);

  // ── read receipts ───────────────────────────────────────────────────────────
  const unread = chat.unread;
  useEffect(() => {
    if (unread > 0 && document.hasFocus()) markRead.mutate(chat.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id, unread, messages.length]);
  useEffect(() => {
    const onFocus = () => {
      if (chat.unread > 0) markRead.mutate(chat.id);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat.id, chat.unread]);

  // ── jump to a replied-to message ────────────────────────────────────────────
  const [flashId, setFlashId] = useState<string | null>(null);
  const jumpTo = (id: string) => {
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-msg-id="${CSS.escape(id)}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlashId(id);
      setTimeout(() => setFlashId((v) => (v === id ? null : v)), 1200);
    }
  };

  // Step through in-chat search results (jump + flash each).
  const gotoResult = (idx: number) => {
    if (searchItems.length === 0) return;
    const n = ((idx % searchItems.length) + searchItems.length) % searchItems.length;
    setSearchIdx(n);
    jumpTo(searchItems[n].id);
  };

  // ── header bits ─────────────────────────────────────────────────────────────
  const title = chatDisplayTitle(chat, me);
  const partner = chatPartner(chat, me);
  const myRole = chat.members.find((m) => m.username === me)?.role ?? "member";
  const canDeleteAny = myRole === "owner" || myRole === "admin";

  // Read receipts: an outgoing message is READ once every OTHER member's
  // last-read time is at/after the message's createdAt (dm → the one peer;
  // group → all peers). readAt updates live via the WS `read` event.
  const otherMembers = useMemo(() => chat.members.filter((m) => m.username !== me), [chat.members, me]);
  const isReadByPeers = useCallback(
    (createdAt: string): boolean => {
      if (otherMembers.length === 0) return false;
      const t = new Date(createdAt).getTime();
      return otherMembers.every((m) => !!m.readAt && new Date(m.readAt).getTime() >= t);
    },
    [otherMembers],
  );

  // How many of the selected messages the current user may actually delete.
  const deletableCount = useMemo(() => {
    let n = 0;
    for (const id of selectedIds) {
      const m = byId.get(id);
      if (m && !m.deleted && (m.sender === me || canDeleteAny)) n++;
    }
    return n;
  }, [selectedIds, byId, me, canDeleteAny]);

  const forwardSelected = () => {
    if (selectedIds.size > 0) setForwardIds([...selectedIds]);
  };
  const deleteSelected = () => {
    for (const id of selectedIds) {
      const m = byId.get(id);
      if (m && !m.deleted && (m.sender === me || canDeleteAny)) deleteMsg.mutate(id);
    }
    exitSelect();
  };

  const subtitle = typingName
    ? chat.kind === "group"
      ? `${typingName} ${tr("typing", "yozmoqda…")}`
      : tr("typing", "yozmoqda…")
    : chat.kind === "group"
      ? `${chat.members.length} ${tr("members", "a'zo")}`
      : tr("lastSeen", "oxirgi faollik");

  const dayLabel = (iso: string): string => {
    const d = new Date(iso);
    const today = new Date();
    const yest = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (dayKey(iso) === dayKey(today.toISOString())) return tr("today", "Bugun");
    if (dayKey(iso) === dayKey(yest.toISOString())) return tr("yesterday", "Kecha");
    const opts: Intl.DateTimeFormatOptions =
      d.getFullYear() === today.getFullYear()
        ? { day: "numeric", month: "long" }
        : { day: "numeric", month: "long", year: "numeric" };
    try {
      // `uz_Cyrl` → `uz-Cyrl` (BCP-47 uses a hyphen); an underscore throws a
      // RangeError and silently fell back to the browser locale (English).
      return d.toLocaleDateString((i18n.language || "uz").replace(/_/g, "-"), opts);
    } catch {
      return d.toLocaleDateString(undefined, opts);
    }
  };

  // ── render list with date pills + clustering ───────────────────────────────
  const rows = useMemo(() => {
    const out: ({ kind: "sep"; label: string; key: string } | {
      kind: "msg";
      msg: Message;
      first: boolean;
      last: boolean;
    })[] = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const prev = messages[i - 1];
      const next = messages[i + 1];
      const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt);
      if (newDay) out.push({ kind: "sep", label: m.createdAt, key: `sep-${dayKey(m.createdAt)}` });
      const first =
        newDay ||
        !prev ||
        prev.sender !== m.sender ||
        new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > CLUSTER_GAP_MS;
      const last =
        !next ||
        next.sender !== m.sender ||
        dayKey(next.createdAt) !== dayKey(m.createdAt) ||
        new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime() > CLUSTER_GAP_MS;
      out.push({ kind: "msg", msg: m, first, last });
    }
    return out;
  }, [messages]);

  return (
    <div className="relative flex h-full min-w-0 flex-1 flex-col">
      {/* header — Telegram Web A MiddleHeader floating island (absolute; messages
          scroll under it, so the scroll area below is padded to clear it) */}
      <div className="MiddleHeader">
        <div className="back-button md:hidden">
          <button
            type="button"
            className="Button"
            onClick={onBack}
            aria-label={tr("back", "Orqaga")}
          >
            <ArrowLeft className="size-6" />
          </button>
        </div>

        {/* .ChatInfo — avatar + title/status; the whole cluster opens chat info */}
        <button type="button" className="ChatInfo" onClick={onToggleInfo}>
          <ChatAvatar
            className="Avatar"
            seed={chat.kind === "dm" ? (partner?.username ?? chat.id) : chat.id}
            name={title}
            image={chat.avatar}
            size={40}
            group={chat.kind === "group"}
          />
          <div className="info">
            <div className="title">
              <h3>{title}</h3>
              {/* animated emoji-status next to a dm peer's name — renders only when
                  the peer carries one (defensive; absent for AIBA users today). */}
              {chat.kind === "dm" && partner?.emojiStatus?.documentId && (
                <TgEmojiStatus
                  accountId={0}
                  documentId={partner.emojiStatus.documentId}
                  size={22}
                  className="title-badge title-badge--emoji-status"
                />
              )}
            </div>
            {typingName ? (
              <span className="typing-status">{subtitle}</span>
            ) : (
              <span className="status">{subtitle}</span>
            )}
          </div>
        </button>

        {/* .HeaderActions — right-side round icon Buttons */}
        <div className="HeaderActions">
          <button
            type="button"
            onClick={() => setSearchOpen((v) => !v)}
            className={cn("Button", searchOpen && "activated")}
            aria-pressed={searchOpen}
            aria-label={tr("search", "Qidirish")}
            title={tr("search", "Qidirish")}
          >
            <Search className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => placeCall("audio")}
            disabled={startCall.isPending}
            className="Button disabled:opacity-50"
            aria-label={tr("call.audioCall", "Ovozli qo'ng'iroq")}
          >
            <Phone className="size-6" />
          </button>
          <button
            type="button"
            onClick={() => placeCall("video")}
            disabled={startCall.isPending}
            className="Button disabled:opacity-50 max-md:hidden"
            aria-label={tr("videoCall", "Video qo'ng'iroq")}
          >
            <Video className="size-6" />
          </button>
          <button
            type="button"
            onClick={onToggleInfo}
            className="Button max-md:hidden"
            aria-label={tr("info", "Ma'lumot")}
          >
            <Info className="size-6" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="Button" aria-label={tr("more", "Yana")}>
                <MoreVertical className="size-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={() => mute.mutate({ chatId: chat.id, muted: !chat.muted })}>
                {chat.muted ? <Bell className="size-4" /> : <BellOff className="size-4" />}
                {chat.muted ? tr("unmute", "Ovozni yoqish") : tr("mute", "Ovozsiz qilish")}
              </DropdownMenuItem>
              {chat.kind === "group" && (
                <DropdownMenuItem
                  onClick={() => {
                    if (me) removeMember.mutate({ chatId: chat.id, username: me }, { onSuccess: onBack });
                  }}
                >
                  <LogOut className="size-4" /> {tr("leaveGroup", "Guruhdan chiqish")}
                </DropdownMenuItem>
              )}
              {myRole === "owner" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => deleteChat.mutate(chat.id, { onSuccess: onBack })}
                  >
                    <Trash2 className="size-4" /> {tr("deleteChat", "Suhbatni o'chirish")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* in-chat search bar (slides down under the header) */}
      {searchOpen && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-background/90 px-3 py-2 backdrop-blur animate-in slide-in-from-top-2 fade-in-0 duration-150">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={searchInputRef}
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                gotoResult(searchIdx + (e.shiftKey ? -1 : 1));
              }
              if (e.key === "Escape") setSearchOpen(false);
            }}
            placeholder={tr("searchInChat", "Suhbatda qidirish")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {debouncedSearchQ && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {searchRes.isLoading
                ? "…"
                : searchItems.length === 0
                  ? tr("noResults", "Topilmadi")
                  : `${searchIdx + 1}/${searchItems.length}`}
            </span>
          )}
          <button
            type="button"
            onClick={() => gotoResult(searchIdx - 1)}
            disabled={searchItems.length === 0}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"
            aria-label={tr("prev", "Oldingi")}
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => gotoResult(searchIdx + 1)}
            disabled={searchItems.length === 0}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-40"
            aria-label={tr("next", "Keyingi")}
          >
            <ChevronDown className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label={tr("close", "Yopish")}
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* messages */}
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto px-4 pb-3 pt-16 md:px-[8%]">
          <div className="flex flex-col">
            <div ref={sentinelRef} className="h-px shrink-0" />
            {msgsQ.isFetchingNextPage && (
              <div className="flex justify-center py-2">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {msgsQ.isLoading ? (
              <div className="grid h-64 place-items-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : messages.length === 0 ? (
              <div className="grid h-64 place-items-center">
                <span className="rounded-full bg-black/35 px-4 py-1.5 text-sm text-white shadow-sm backdrop-blur">
                  {tr("empty", "Xabarlar yo'q. Birinchi bo'lib yozing!")}
                </span>
              </div>
            ) : (
              rows.map((row) =>
                row.kind === "sep" ? (
                  <div key={row.key} className="sticky top-1 z-[5] my-2 flex justify-center">
                    <span className="w-fit rounded-full bg-black/35 px-2.5 py-0.5 text-xs font-medium text-white shadow-sm backdrop-blur">
                      {dayLabel(row.label)}
                    </span>
                  </div>
                ) : (
                  <div
                    key={row.msg.id}
                    data-msg-id={row.msg.id}
                    className={cn(
                      "rounded-xl transition-colors duration-500",
                      flashId === row.msg.id && "bg-[#3390ec]/15",
                      new Date(row.msg.createdAt).getTime() > animateAfterRef.current && "msg-in",
                    )}
                  >
                    <MessageBubble
                      msg={row.msg}
                      mine={row.msg.sender === me}
                      read={row.msg.sender === me && isReadByPeers(row.msg.createdAt)}
                      group={chat.kind === "group"}
                      firstOfCluster={row.first}
                      lastOfCluster={row.last}
                      canDelete={row.msg.sender === me || canDeleteAny}
                      replySource={row.msg.replyTo ? (byId.get(row.msg.replyTo) ?? null) : null}
                      onReply={(m) => {
                        setEditing(null);
                        setReplyTo(m);
                      }}
                      onEdit={(m) => {
                        setReplyTo(null);
                        setEditing(m);
                      }}
                      onDelete={(m) => deleteMsg.mutate(m.id)}
                      onReact={(m, emoji) => react.mutate({ messageId: m.id, emoji })}
                      onJumpTo={jumpTo}
                      onForward={(m) => setForwardIds([m.id])}
                      onStartSelect={startSelect}
                      selectionActive={selectMode}
                      isSelected={selectedIds.has(row.msg.id)}
                      onToggleSelect={toggleSelect}
                    />
                  </div>
                ),
              )
            )}
            <div className="h-2 shrink-0" />
          </div>
        </div>

        {/* scroll-to-bottom FAB */}
        {showFab && (
          <button
            type="button"
            onClick={() => scrollToBottom(true)}
            className="fab-fade-in absolute bottom-4 right-4 grid size-11 place-items-center rounded-full border bg-background text-muted-foreground shadow-lg transition-transform hover:scale-105"
            aria-label={tr("scrollDown", "Pastga")}
          >
            <ArrowDown className="size-5" />
            {newCount > 0 && (
              <span className="absolute -top-1.5 min-w-5 rounded-full bg-[#3390ec] px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white">
                {newCount > 99 ? "99+" : newCount}
              </span>
            )}
          </button>
        )}
      </div>

      {/* composer — or the selection action bar while selecting */}
      {selectMode ? (
        <SelectionBar
          count={selectedIds.size}
          deletableCount={deletableCount}
          onCancel={exitSelect}
          onForward={forwardSelected}
          onDelete={deleteSelected}
          tr={tr}
        />
      ) : (
        <Composer
          chatId={chat.id}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          editing={editing}
          onCancelEdit={() => setEditing(null)}
          onTyping={() => sendTyping(chat.id)}
          onSent={() => scrollToBottom(true)}
        />
      )}

      {/* forward dialog (single message or the whole selection) */}
      <ForwardDialog
        open={forwardIds !== null}
        me={me}
        messageIds={forwardIds ?? []}
        onClose={() => setForwardIds(null)}
        onDone={(_chatId, count) => {
          exitSelect();
          showHint(t("modules.messenger.forwarded", { defaultValue: "Yuborildi", count }));
        }}
      />

      {/* transient toast */}
      {hint && (
        <div className="pointer-events-none absolute bottom-24 left-1/2 z-40 -translate-x-1/2 animate-in fade-in-0 slide-in-from-bottom-2 duration-150">
          <span className="rounded-full bg-black/75 px-4 py-1.5 text-sm text-white shadow-lg backdrop-blur">
            {hint}
          </span>
        </div>
      )}

    </div>
  );
}

// ── selection action bar (replaces the composer while selecting) ─────────────

function SelectionBar({
  count,
  deletableCount,
  onCancel,
  onForward,
  onDelete,
  tr,
}: {
  count: number;
  deletableCount: number;
  onCancel: () => void;
  onForward: () => void;
  onDelete: () => void;
  tr: (k: string, d: string) => string;
}) {
  return (
    <div className="shrink-0 px-4 pb-3 pt-1 md:px-[8%]">
      <div className="flex items-center gap-1 rounded-[18px] bg-background px-2 py-2 shadow-sm">
        <button
          type="button"
          onClick={onCancel}
          className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
          aria-label={tr("cancel", "Bekor qilish")}
        >
          <X className="size-5" />
        </button>
        <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium tabular-nums">
          {count} {tr("selectedSuffix", "tanlandi")}
        </span>
        <button
          type="button"
          onClick={onForward}
          disabled={count === 0}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-[#3390ec] transition-colors hover:bg-[#3390ec]/10 disabled:opacity-40"
        >
          <Forward className="size-4" />
          {tr("forward", "Yo'naltirish")} ({count})
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deletableCount === 0}
          className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-40"
        >
          <Trash2 className="size-4" />
          {tr("delete", "O'chirish")} ({deletableCount})
        </button>
      </div>
    </div>
  );
}
