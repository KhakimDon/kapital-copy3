// Left column — a pixel-faithful Telegram-Web-A re-skin of the INTERNAL chat
// list. The visual layer is the ported tgweb-left.css (scoped under `.tg-surface`,
// which the parent <aside> already carries); this file only wires OUR data +
// behaviour onto that DOM: a rounded search pill, a static "Barchasi / Suhbatlar"
// folder strip, Chat/ListItem rows (avatar, title, preview, time, ticks, badge)
// and the pencil compose FAB. Data flow + features are unchanged from before —
// this is a visual restyle only.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Menu,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Search,
  Send,
  Settings,
  Trash2,
  UserPlus,
  Users,
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
  fmtListTime,
  useDeleteChat,
  useMarkRead,
  useMuteChat,
  usePinChat,
  type Chat,
} from "./api";
import { ChatAvatar } from "./avatar";
import { previewText } from "./message-bubble";
// Shared animated emoji-status renderer (from the sibling tg/ surface).
import { TgEmojiStatus } from "./tg/tg-emoji-status";
// Notification bell removed from the chat-list header (product decision).
// import { PushToggle } from "./push-toggle";
import { InternalSearchPanel } from "./search-panel";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TgSettings } from "./tg/settings";
import { TgAvatar } from "./tg/tg-avatar";
import { TelegramLogo } from "./tg/telegram-logo";
import type { TgDialog } from "./tg/api";
import "./tg/tgweb-left.css";

/** An outgoing last message is READ once every OTHER member's last-read time is
 *  at/after the message (dm → the one peer; group → all peers). Mirrors the
 *  read-receipt rule in chat-pane.tsx so the list ticks turn blue in sync. */
function isReadByPeers(
  chat: Chat,
  me: string | null | undefined,
  createdAt: string,
): boolean {
  const others = (chat.members ?? []).filter((m) => m.username !== me);
  if (others.length === 0) return false;
  const t = new Date(createdAt).getTime();
  return others.every((m) => !!m.readAt && new Date(m.readAt).getTime() >= t);
}

export function ChatList({
  chats,
  activeId,
  me,
  search,
  onSearch,
  typing,
  onSelect,
  onNewChat,
  onSwitchTg,
  tgChats,
  tgAccountId,
  activeTgChatId,
  onOpenTgChat,
  headerLeading,
}: {
  chats: Chat[];
  activeId: string;
  me: string | null | undefined;
  search: string;
  onSearch: (v: string) => void;
  /** chatId → display name of who is typing right now. */
  typing: Record<string, string>;
  onSelect: (id: string) => void;
  /** Open the new-chat dialog focused on the given tab (default dm). */
  onNewChat: (tab?: "dm" | "group") => void;
  /** When set (Telegram bridge configured), the hamburger offers a switch to
   *  the Telegram surface. */
  onSwitchTg?: () => void;
  /** Corporate-Telegram chats GRANTED to the signed-in user. Employees have no
   *  Telegram of their own, so their granted chats are listed right here. */
  tgChats?: TgDialog[];
  /** Connected corporate TG account id — used to load those chats' real avatars. */
  tgAccountId?: number | null;
  /** The granted Telegram chat currently open in the middle pane (highlights it). */
  activeTgChatId?: number | null;
  /** Open one of those granted Telegram chats (switches to the TG surface). */
  onOpenTgChat?: (chatId: number) => void;
  /** Rendered at the left of the search header — mirrors the TG port's
   *  LeftMainHeader leading slot (before our own hamburger + search pill). */
  headerLeading?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) =>
    t(`modules.messenger.${k}`, { defaultValue: d });

  const [searchFocused, setSearchFocused] = useState(false);
  // The search overlay latches open on focus and stays open on blur (like the
  // real client) — only the back arrow / Escape / picking a result closes it.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchActive = searchOpen || search.trim().length > 0;
  const closeSearch = () => {
    onSearch("");
    setSearchOpen(false);
    setSearchFocused(false);
    searchInputRef.current?.blur();
  };
  // Static folder strip — the internal messenger has no folders, so "All" always
  // wins and "Chats" shows the same list (faithful look, no-op behaviour).
  const [folder, setFolder] = useState<"all" | "chats">("all");

  // Right-click / long-press / hover-"⋯" context menu for a chat row.
  const [menu, setMenu] = useState<{ chat: Chat; x: number; y: number } | null>(
    null,
  );
  // In-messenger Settings panel (ported from the Telegram surface's TgSettings) —
  // appearance / notifications / animations / language, plus the AIBA profile.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Long-press plumbing (touch): fires a menu after ~450ms and suppresses the
  // click that would otherwise open the chat.
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };

  return (
    <div className="tgweb-left relative">
      {/* In-messenger settings (Telegram-faithful): appearance, notifications,
          animations, language + the AIBA profile. Opened from the ☰ menu. */}
      <Sheet open={settingsOpen} onOpenChange={(o) => !o && setSettingsOpen(false)}>
        <SheetContent hideClose className="w-[24rem] max-w-full p-0 sm:max-w-sm">
          <TgSettings preferMe onClose={() => setSettingsOpen(false)} />
        </SheetContent>
      </Sheet>
      {/* search header — LeftMainHeader: leading slot + hamburger + search pill +
          bell. Focusing search latches the overlay open; the leading slot +
          hamburger morph into a back arrow that closes it (mirrors the TG port). */}
      <div className="left-header">
        {searchActive ? (
          <button
            type="button"
            className="left-header-back"
            aria-label={tr("back", "Orqaga")}
            title={tr("back", "Orqaga")}
            onClick={closeSearch}
          >
            <ArrowLeft className="size-6" />
          </button>
        ) : (
          <>
            {headerLeading}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={tr("menu", "Menyu")}
                  className="grid size-10 shrink-0 place-items-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-chat-hover)]"
                >
                  <Menu className="size-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onClick={() => onNewChat("group")}>
                  <Users className="size-4" /> {tr("newGroup", "Yangi guruh")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onNewChat("dm")}>
                  <UserPlus className="size-4" /> {tr("newDm", "Yangi suhbat")}
                </DropdownMenuItem>
                {onSwitchTg && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onSwitchTg}>
                      <Send className="size-4" /> Telegram
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setSettingsOpen(true)}>
                  <Settings className="size-4" /> {tr("settings", "Sozlamalar")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        <div className={cn("SearchInput", searchFocused && "has-focus")}>
          <span className="icon-container-left">
            <Search className="search-icon size-[1.375rem]" />
          </span>
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onFocus={() => {
              setSearchFocused(true);
              setSearchOpen(true);
            }}
            onBlur={() => setSearchFocused(false)}
            placeholder={tr("search", "Qidirish")}
            aria-label={tr("search", "Qidirish")}
          />
          {search && (
            <button
              type="button"
              className="search-clear"
              aria-label={tr("clear", "Tozalash")}
              title={tr("clear", "Tozalash")}
              onClick={() => {
                onSearch("");
                searchInputRef.current?.focus();
              }}
            >
              <X className="size-[1.125rem]" />
            </button>
          )}
        </div>
      </div>

      {/* When the search is focused / has a query, the folder strip + rows are
          replaced by the full Telegram-style search overlay (tabs / recent /
          filtered results). Otherwise the normal folder strip + chat rows. */}
      {searchActive ? (
        <InternalSearchPanel
          chats={chats}
          me={me}
          query={search}
          onPick={onSelect}
          onClose={closeSearch}
        />
      ) : (
        <>
          {/* folder tab strip — ChatFolders / TabList (static "All" / "Chats") */}
          <div className="ChatFolders">
            <div className="TabList" role="tablist">
              <div
                role="tab"
                aria-selected={folder === "all"}
                className={cn("tab", folder === "all" && "active")}
                onClick={() => setFolder("all")}
              >
                {tr("folderAll", "Barchasi")}
              </div>
              <div
                role="tab"
                aria-selected={folder === "chats"}
                className={cn("tab", folder === "chats" && "active")}
                onClick={() => setFolder("chats")}
              >
                {tr("folderChats", "Suhbatlar")}
              </div>
            </div>
          </div>

          {/* rows — pad the bottom so the last row clears the compose FAB */}
          <div className="chat-list" style={{ paddingBottom: "6rem" }}>
            {/* Corporate-Telegram chats GRANTED to me. Employees have no Telegram
                of their own, so the chats opened to them appear right here;
                tapping one opens it on the Telegram surface. */}
            {!!tgChats?.length && onOpenTgChat && (
              <>
                {tgChats.map((d) => (
                  <div
                    key={`tg-${d.chatId}`}
                    className={cn("Chat", activeTgChatId === d.chatId && "selected")}
                    role="button"
                    tabIndex={0}
                    onClick={() => onOpenTgChat(d.chatId)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onOpenTgChat(d.chatId);
                      }
                    }}
                  >
                    <div className="ListItem-button">
                      <div className="status status-clickable">
                        <div className="avatar-wrapper">
                          <TgAvatar
                            accountId={tgAccountId ?? 0}
                            peerId={d.chatId}
                            name={d.title || "?"}
                            size={54}
                            group={d.kind !== "user"}
                          />
                        </div>
                      </div>
                      <div className="info">
                        <div className="info-row">
                          <div className="title">
                            <h3 dir="auto" className="fullName">
                              {d.title}
                            </h3>
                            <span
                              className="ml-1 inline-flex shrink-0 items-center"
                              title={tr("telegramChat", "Telegram")}
                              aria-label={tr("telegramChat", "Telegram")}
                            >
                              <TelegramLogo className="size-[15px]" />
                            </span>
                          </div>
                        </div>
                        <div className="subtitle">
                          <p className="last-message">
                            <span className="last-message-summary">
                              {d.lastMessage ?? ""}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
            {chats.length === 0 ? (
              <div className="chat-list-empty">
                {tr("noChats", "Suhbatlar topilmadi")}
              </div>
            ) : (
              chats.map((chat) => {
                const active = chat.id === activeId;
                const title = chatDisplayTitle(chat, me);
                const partner = chatPartner(chat, me);
                const last = chat.lastMessage;
                const isGroup = chat.kind === "group";
                const who = typing[chat.id];

                // Outgoing tick state: single (delivered) → double blue (read).
                const outgoing = !!last && last.sender === me;
                const read =
                  outgoing && isReadByPeers(chat, me, last!.createdAt);
                const time = fmtListTime(last?.createdAt ?? chat.updatedAt);

                // Preview: "{who} yozmoqda…" while typing, else "{sender}: {preview}"
                // in groups (no prefix in dms), else the empty-chat placeholder.
                const prefix =
                  !who && last && isGroup && last.sender
                    ? `${last.sender === me ? tr("you", "Siz") : last.senderName}: `
                    : "";
                const summary = who
                  ? isGroup
                    ? `${who} ${tr("typing", "yozmoqda…")}`
                    : tr("typing", "yozmoqda…")
                  : last
                    ? previewText(last, tr)
                    : tr("noMessages", "Xabarlar yo'q");
                const isEmptyPreview = !who && !last;

                const openMenuAt = (x: number, y: number) =>
                  setMenu({ chat, x, y });

                return (
                  <div
                    key={chat.id}
                    className={cn(
                      "Chat",
                      isGroup ? "group" : "private",
                      active && "selected",
                    )}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (suppressClickRef.current) {
                        suppressClickRef.current = false;
                        return;
                      }
                      onSelect(chat.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelect(chat.id);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      openMenuAt(e.clientX, e.clientY);
                    }}
                    onTouchStart={(e) => {
                      const tt = e.touches[0];
                      if (!tt) return;
                      const { clientX, clientY } = tt;
                      clearLongPress();
                      longPressRef.current = setTimeout(() => {
                        suppressClickRef.current = true;
                        openMenuAt(clientX, clientY);
                      }, 450);
                    }}
                    onTouchEnd={clearLongPress}
                    onTouchMove={clearLongPress}
                    onTouchCancel={clearLongPress}
                  >
                    {/* desktop hover action — opens the same context menu (md+ only) */}
                    <button
                      type="button"
                      aria-label={tr("msgActions", "Amallar")}
                      title={tr("msgActions", "Amallar")}
                      className="row-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        openMenuAt(r.right, r.bottom + 4);
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const r = e.currentTarget.getBoundingClientRect();
                        openMenuAt(r.right, r.bottom + 4);
                      }}
                    >
                      <MoreVertical className="size-[18px]" />
                    </button>

                    <div className="ListItem-button">
                      <div className="status status-clickable">
                        <div className="avatar-wrapper">
                          <ChatAvatar
                            seed={
                              isGroup ? chat.id : (partner?.username ?? chat.id)
                            }
                            name={title}
                            image={chat.avatar}
                            size={54}
                            group={isGroup}
                          />
                        </div>
                      </div>

                      <div className="info">
                        <div className="info-row">
                          <div className="title">
                            <h3 dir="auto" className="fullName">
                              {title}
                            </h3>
                            {/* animated emoji-status next to a dm peer's name —
                                renders only when the peer carries one (defensive:
                                absent for AIBA-native users today). */}
                            {!isGroup && partner?.emojiStatus?.documentId && (
                              <TgEmojiStatus
                                accountId={0}
                                documentId={partner.emojiStatus.documentId}
                                size={18}
                                className="ml-1 inline-block shrink-0 align-middle"
                              />
                            )}
                          </div>
                          {chat.muted && (
                            <span
                              className="chat-muted-icon"
                              aria-label={tr("mute", "Ovozsiz qilish")}
                            >
                              <BellOff className="size-[1.125rem]" />
                            </span>
                          )}
                          <div className="separator" />
                          {time && (
                            <div className="LastMessageMeta">
                              {outgoing && (
                                <span
                                  className="MessageOutgoingStatus"
                                  style={
                                    read
                                      ? undefined
                                      : { color: "var(--color-text-meta)" }
                                  }
                                >
                                  {read ? (
                                    <CheckCheck className="size-[1.0625rem]" />
                                  ) : (
                                    <Check className="size-[1.0625rem]" />
                                  )}
                                </span>
                              )}
                              <span className="time">{time}</span>
                            </div>
                          )}
                        </div>

                        <div className="subtitle">
                          <p
                            dir="auto"
                            className={cn(
                              "last-message",
                              isEmptyPreview && "last-message--empty",
                            )}
                          >
                            {who ? (
                              <span
                                className="last-message-summary"
                                style={
                                  active
                                    ? undefined
                                    : { color: "var(--color-primary)" }
                                }
                              >
                                {summary}
                              </span>
                            ) : (
                              <>
                                {prefix && (
                                  <span className="sender-name">{prefix}</span>
                                )}
                                <span className="last-message-summary">
                                  {summary}
                                </span>
                              </>
                            )}
                          </p>
                          {chat.unread > 0 ? (
                            <div
                              className={cn(
                                "badge unread",
                                chat.muted && "muted",
                              )}
                            >
                              {chat.unread > 99 ? "99+" : chat.unread}
                            </div>
                          ) : chat.pinned ? (
                            <div
                              className="badge pinned"
                              aria-label={tr("pinned", "Mahkamlangan")}
                            >
                              <Pin className="size-[1.125rem]" />
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {/* new-chat FAB — Telegram's floating round compose pencil */}
      <button
        type="button"
        onClick={() => onNewChat("dm")}
        title={tr("newChat", "Yangi suhbat")}
        aria-label={tr("newChat", "Yangi suhbat")}
        className="absolute bottom-5 right-4 grid size-14 place-items-center rounded-full bg-[var(--color-primary)] text-white shadow-lg transition-[filter,transform] hover:brightness-105 active:scale-95"
      >
        <Pencil className="size-6" />
      </button>

      {/* row context menu (right-click / long-press / hover ⋯) */}
      {menu && (
        <ChatRowMenu
          chat={menu.chat}
          me={me}
          x={menu.x}
          y={menu.y}
          tr={tr}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

// ── row context menu (portal-positioned at the cursor / touch point) ─────────

function ChatRowMenu({
  chat,
  me,
  x,
  y,
  tr,
  onClose,
}: {
  chat: Chat;
  me: string | null | undefined;
  x: number;
  y: number;
  tr: (k: string, d: string) => string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });
  const [confirmDel, setConfirmDel] = useState(false);

  const pin = usePinChat();
  const mute = useMuteChat();
  const markRead = useMarkRead();
  const del = useDeleteChat();

  const myRole = chat.members.find((m) => m.username === me)?.role ?? "member";
  const canDelete = chat.kind === "dm" || myRole === "owner";

  // Clamp into the viewport before paint.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + width + pad > window.innerWidth)
      left = window.innerWidth - width - pad;
    if (left < pad) left = pad;
    if (top + height + pad > window.innerHeight)
      top = Math.max(pad, y - height);
    if (top < pad) top = pad;
    setPos({ left, top });
  }, [x, y]);

  // Close on Escape / scroll / resize.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // handled here — don't also close the open chat
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60]"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={ref}
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={(e) => e.stopPropagation()}
        className="msg-menu-in absolute w-max origin-top-left"
      >
        <div className="min-w-[196px] overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-[14px] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.4)]">
          <MenuRow
            icon={chat.pinned ? PinOff : Pin}
            label={
              chat.pinned
                ? tr("unpin", "Qadaldan yechish")
                : tr("pin", "Qadab qo'yish")
            }
            onClick={run(() =>
              pin.mutate({ chatId: chat.id, pinned: !chat.pinned }),
            )}
          />
          <MenuRow
            icon={chat.muted ? Bell : BellOff}
            label={
              chat.muted
                ? tr("unmute", "Ovozni yoqish")
                : tr("mute", "Ovozsiz qilish")
            }
            onClick={run(() =>
              mute.mutate({ chatId: chat.id, muted: !chat.muted }),
            )}
          />
          {chat.unread > 0 && (
            <MenuRow
              icon={CheckCheck}
              label={tr("markRead", "O'qilgan deb belgilash")}
              onClick={run(() => markRead.mutate(chat.id))}
            />
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparatorLine />
              <MenuRow
                icon={Trash2}
                label={
                  confirmDel
                    ? tr("confirmDelete", "Ishonchingiz komilmi?")
                    : tr("delete", "O'chirish")
                }
                destructive
                onClick={
                  confirmDel
                    ? run(() => del.mutate(chat.id))
                    : (e) => {
                        e?.stopPropagation();
                        setConfirmDel(true);
                      }
                }
              />
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function DropdownMenuSeparatorLine() {
  return <div className="my-1 h-px bg-foreground/[0.08]" />;
}

function MenuRow({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: (e?: React.MouseEvent) => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "hover:bg-foreground/[0.06]",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}
