// Telegram bridge — LEFT column. Renders a corporate TG account's dialogs
// (useTgDialogs) as pixel-faithful Telegram-Web-A chat rows, ported 1:1 from the
// reference component DOM + SCSS (Chat / ListItem / ChatBadge / LastMessageMeta /
// LeftMainHeader / ChatFolders). The visual layer lives in tgweb-left.css (scoped
// under `.tg-surface`); this file only wires OUR data + behaviour: a search pill
// that filters client-side, a static "Barchasi / Suhbatlar" folder strip, and a
// per-row context menu (right-click / long-press / hover "⋯") with mark-read,
// pin, mute, archive and delete — all backed by the existing TG mutations.
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArchiveRestore,
  ArrowLeft,
  AtSign,
  BarChart3,
  Bell,
  BellOff,
  CheckCheck,
  CircleDot,
  Contact,
  File as FileIcon,
  Film,
  Forward,
  Heart,
  Image as ImageIcon,
  KeyRound,
  Link as LinkIcon,
  MapPin,
  Mic,
  MoreVertical,
  Music,
  Pin,
  PinOff,
  Play,
  Reply,
  Search,
  Sticker,
  Trash2,
  UserPlus,
  Video,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useMe } from "@/shared/api/me";
import { TgAvatar } from "./tg-avatar";
import { TgEmojiStatus } from "./tg-emoji-status";
import { useProfileIntent } from "./profile-intent";
// Telegram Stories hidden for now — see the commented-out ribbon below.
// import { TgStoryRibbon } from "./story-ribbon";
import { fmtDialogTime } from "./shared";
import { TgSearchPanel } from "./search-panel";
import { TgGrantDialog } from "./grant-dialog";
import { typingKey, useTgTyping } from "./typing-store";
import "./tgweb-left.css";
import "./tgweb-menu.css";
import {
  useMarkTgRead,
  useMarkTgUnread,
  useTgArchiveChat,
  useTgDeleteChat,
  useTgDialogs,
  useTgMuteChat,
  useTgPinChat,
  type TgDialog,
} from "./api";

type MediaType = NonNullable<TgDialog["lastMediaType"]>;
// Preview icon per media kind (ported from the reference MessageSummary glyphs).
// Partial: the union is wider than the backend currently fills, so lookups fall
// back defensively (see `previewText` below) for any value without an entry.
const MEDIA_ICON: Partial<Record<MediaType, React.ComponentType<{ className?: string }>>> = {
  photo: ImageIcon,
  video: Video,
  gif: Film,
  audio: Music,
  voice: Mic,
  sticker: Sticker,
  document: FileIcon,
  location: MapPin,
  venue: MapPin,
  contact: Contact,
  poll: BarChart3,
  webpage: LinkIcon,
  round: Video,
};
// Fallback preview label when a media message carries no caption text.
const MEDIA_FALLBACK: Partial<Record<MediaType, string>> = {
  photo: "Rasm",
  video: "Video",
  gif: "GIF",
  audio: "Audio",
  voice: "Ovozli xabar",
  sticker: "Stiker",
  document: "Fayl",
  location: "Manzil",
  venue: "Manzil",
  contact: "Kontakt",
  poll: "So'rovnoma",
  webpage: "Havola",
  round: "Video xabar",
};
// Video-ish kinds get the small play-overlay preview concept instead of a glyph.
const VIDEO_TYPES: ReadonlySet<MediaType> = new Set(["video", "gif", "round"]);

type Tr = (k: string, d: string) => string;
// How the menu anchors to its trigger: cursor / long-press = top-left at the
// point; the hover "⋯" button = top-right at the point (opens leftward).
type MenuAlign = "left" | "right";
type MenuState = {
  x: number;
  y: number;
  chatId: number;
  unread: number;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  align: MenuAlign;
};

export function TgChatList({
  accountId,
  activeChatId,
  onSelect,
  headerLeading,
}: {
  accountId: number;
  activeChatId: number | null;
  onSelect: (chatId: number) => void;
  /** Rendered at the left of the search header — the real Telegram LeftMainHeader
   *  has a hamburger menu here (we hang the AIBA switch/admin/settings off it). */
  headerLeading?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const tr: Tr = (k, d) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const dialogsQ = useTgDialogs(accountId);
  const markRead = useMarkTgRead();
  const markUnread = useMarkTgUnread();
  const pinChat = useTgPinChat();
  const muteChat = useTgMuteChat();
  const archiveChat = useTgArchiveChat();
  const deleteChat = useTgDeleteChat();
  // Grant-access is admin-only (employees have no Telegram of their own — they
  // only work the corporate chats an admin opens to them).
  const isAdmin = !!useMe().data?.is_admin;
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  // The search overlay latches open on focus and stays open on blur (like the
  // real client) — only the back arrow / Escape / picking a result closes it.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchActive = searchOpen || search.trim().length > 0;
  const closeSearch = () => {
    setSearch("");
    setSearchOpen(false);
    setSearchFocused(false);
    searchInputRef.current?.blur();
  };
  // Static folder strip — our backend has no folders, so "All" always wins and
  // "Chats" shows the same list (faithful look, no-op behaviour).
  const [folder, setFolder] = useState<"all" | "chats">("all");
  // Row context menu — anchor + target chat while open.
  const [menu, setMenu] = useState<MenuState | null>(null);
  // "Grant access" dialog — the chat whose access we're opening (admin only).
  const [grantChatId, setGrantChatId] = useState<number | null>(null);

  // The plain dialog list (rendered only while the search overlay is closed —
  // once the user searches, TgSearchPanel owns the filtering client-side).
  const dialogs = dialogsQ.data ?? [];

  return (
    <div className="tgweb-left">
      {/* search header — LeftMainHeader: leading hamburger slot (morphs into a
          back arrow while searching) + rounded search pill with a clear button */}
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
          headerLeading
        )}
        <div className={cn("SearchInput", searchFocused && "has-focus")}>
          <span className="icon-container-left">
            <Search className="search-icon size-[1.375rem]" />
          </span>
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
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
                setSearch("");
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
          filtered results). Otherwise the normal folder strip + dialog rows. */}
      {searchActive ? (
        <TgSearchPanel
          accountId={accountId}
          dialogs={dialogsQ.data ?? []}
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

          {/* rows */}
          <div className="chat-list">
            {/* Telegram Stories — HIDDEN for now (product decision). Commented out
                so the component never mounts → its `useTgStories` query never fires
                → NO /stories API request. Re-enable by uncommenting when needed. */}
            {/* <TgStoryRibbon accountId={accountId} /> */}
            {dialogsQ.isLoading ? (
              <TgSkeleton />
            ) : dialogs.length === 0 ? (
              <div className="chat-list-empty">{tr("noDialogs", "Suhbatlar yo'q")}</div>
            ) : (
              dialogs.map((d: TgDialog) => (
                <TgRow
                  key={d.chatId}
                  dialog={d}
                  accountId={accountId}
                  active={d.chatId === activeChatId}
                  emptyLabel={tr("noMessages", "—")}
                  menuLabel={tr("moreActions", "Amallar")}
                  tr={tr}
                  onClick={() => onSelect(d.chatId)}
                  onMenu={(x, y, align) =>
                    setMenu({
                      x,
                      y,
                      align,
                      chatId: d.chatId,
                      unread: d.unread,
                      pinned: !!d.pinned,
                      muted: !!d.muted,
                      archived: !!d.archived,
                    })
                  }
                />
              ))
            )}
          </div>
        </>
      )}

      {/* row context menu — all actions wired */}
      {menu && (
        <TgRowMenu
          x={menu.x}
          y={menu.y}
          align={menu.align}
          unread={menu.unread}
          pinned={menu.pinned}
          muted={menu.muted}
          archived={menu.archived}
          isAdmin={isAdmin}
          tr={tr}
          onClose={() => setMenu(null)}
          onGrant={() => setGrantChatId(menu.chatId)}
          onMarkRead={() => markRead.mutate({ accountId, chatId: menu.chatId })}
          onMarkUnread={() => markUnread.mutate({ accountId, chatId: menu.chatId })}
          onTogglePin={() =>
            pinChat.mutate({ accountId, chatId: menu.chatId, pinned: !menu.pinned })
          }
          onToggleMute={() =>
            muteChat.mutate({ accountId, chatId: menu.chatId, muted: !menu.muted })
          }
          onToggleArchive={() =>
            archiveChat.mutate({ accountId, chatId: menu.chatId, archived: !menu.archived })
          }
          onDelete={() => deleteChat.mutate({ accountId, chatId: menu.chatId })}
        />
      )}

      {/* Grant-access dialog — opened from a row's context menu (admin only). */}
      {isAdmin && grantChatId != null && (
        <TgGrantDialog
          accountId={accountId}
          chatId={grantChatId}
          onClose={() => setGrantChatId(null)}
        />
      )}
    </div>
  );
}

// ── one dialog row (Chat + ListItem DOM) ─────────────────────────────────────
// The context menu opens three ways: desktop hover "⋯" button, right-click, and
// touch long-press. The row is a div[role=button] (not a <button>) so the "⋯"
// can be a real nested button without invalid interactive nesting.

function TgRow({
  dialog: d,
  accountId,
  active,
  emptyLabel,
  menuLabel,
  tr,
  onClick,
  onMenu,
}: {
  dialog: TgDialog;
  accountId: number;
  active: boolean;
  emptyLabel: string;
  menuLabel: string;
  tr: Tr;
  onClick: () => void;
  onMenu: (x: number, y: number, align: MenuAlign) => void;
}) {
  // Preview prefix: "Siz:" for our own last message, else "{sender}:" in groups.
  const prefix = d.lastOut
    ? tr("youPrefix", "Siz: ")
    : d.kind !== "user" && d.lastSenderName
      ? `${d.lastSenderName}: `
      : "";
  const MediaIcon = d.lastMediaType ? MEDIA_ICON[d.lastMediaType] : undefined;
  const isVideoPreview = d.lastMediaType ? VIDEO_TYPES.has(d.lastMediaType) : false;
  const mediaLabel = d.lastMediaType
    ? tr(`media_${d.lastMediaType}`, MEDIA_FALLBACK[d.lastMediaType] ?? d.lastMediaType)
    : "";
  const previewText = d.lastMessage || mediaLabel || emptyLabel;
  const isEmptyPreview = !d.lastMessage && !mediaLabel;
  const time = fmtDialogTime(d.lastDate);

  // Live "typing…" for THIS row — same store the chat header subscribes to. When
  // someone is typing it replaces the last-message line with a colored, animated
  // hint (typing wins over a draft, a draft wins over the plain preview).
  const typers = useTgTyping((s) => s.byChat[typingKey(accountId, d.chatId)]);
  const typingActive = (typers ?? []).filter((e) => e.until > Date.now());
  const typingName = typingActive[0]?.name;
  const typingLabel = typingActive.length
    ? d.kind !== "user" && typingName
      ? tr("typingName", "{{name}} yozmoqda…").replace("{{name}}", typingName)
      : tr("typing", "yozmoqda…")
    : null;
  const draft = d.draft?.trim() ? d.draft : null;
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };
  const onTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (!touch) return;
    const { clientX, clientY } = touch;
    clearLongPress();
    longPressRef.current = setTimeout(() => onMenu(clientX, clientY, "left"), 450);
  };

  // Hover "⋯": anchor the menu to the button's bottom-right so it opens leftward.
  const openFromButton = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    onMenu(r.right, r.bottom + 4, "right");
  };

  return (
    <div
      className={cn("Chat", d.kind === "user" ? "private" : "group", active && "selected")}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(e.clientX, e.clientY, "left");
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={clearLongPress}
      onTouchMove={clearLongPress}
      onTouchCancel={clearLongPress}
    >
      {/* desktop hover action — opens the same context menu (md+ only) */}
      <button
        type="button"
        aria-label={menuLabel}
        title={menuLabel}
        className="row-menu-btn"
        onClick={openFromButton}
        onContextMenu={(e) => {
          e.preventDefault();
          openFromButton(e);
        }}
      >
        <MoreVertical className="size-[18px]" />
      </button>

      <div className="ListItem-button">
        {/* material ripple on press (ported from the reference RippleEffect) */}
        <RowRipple />
        <div className="status status-clickable">
          <div
            className="avatar-wrapper"
            role="button"
            tabIndex={-1}
            aria-label={tr("openProfile", "Profilni ochish")}
            onClick={(e) => {
              // Tapping the avatar opens the chat AND its profile panel (Telegram);
              // stop the row's own click so the chat isn't opened twice.
              e.stopPropagation();
              useProfileIntent.getState().open(d.chatId);
              onClick();
            }}
          >
            <TgAvatar
              accountId={accountId}
              peerId={d.chatId}
              name={d.title || "?"}
              size={54}
              group={d.kind !== "user"}
            />
            {/* online presence dot — private chats only, drawn defensively */}
            {d.kind === "user" && d.online && (
              <span className="avatar-online avatar-online-shown" aria-hidden="true" />
            )}
          </div>
        </div>

        <div className="info">
          <div className="info-row">
            <div className="title">
              <h3 dir="auto" className="fullName">
                {d.title}
              </h3>
              {/* peer badges (verified / scam·fake / emoji-status·premium) — data
                  on TgDialog. An animated custom emoji-status (premium OR
                  collectible/gift) replaces the static premium star. */}
              {d.verified && <VerifiedIcon />}
              {(d.scam || d.fake) && (
                <FakeBadge kind={d.scam ? "scam" : "fake"} tr={tr} />
              )}
              {d.emojiStatus?.documentId ? (
                <TgEmojiStatus
                  accountId={accountId}
                  documentId={d.emojiStatus.documentId}
                  size={18}
                  className="chat-title-emoji-status"
                />
              ) : (
                d.premium && <PremiumStar />
              )}
              {/* Access marker — this chat is opened to N AIBA users (admin ACL). */}
              {typeof d.grantCount === "number" && d.grantCount > 0 && (
                <span
                  className="chat-grant-icon"
                  title={tr("grantedToCount", "{{n}} kishiga ochilgan").replace(
                    "{{n}}",
                    String(d.grantCount),
                  )}
                  aria-label={tr("grantedToCount", "{{n}} kishiga ochilgan").replace(
                    "{{n}}",
                    String(d.grantCount),
                  )}
                >
                  <KeyRound className="size-[14px]" />
                </span>
              )}
            </div>
            {d.muted && (
              <span className="chat-muted-icon" aria-label={tr("muted", "Ovozsiz")}>
                <BellOff className="size-[1.125rem]" />
              </span>
            )}
            <div className="separator" />
            {time && (
              <div className="LastMessageMeta">
                {d.lastOut && (
                  <span className="MessageOutgoingStatus">
                    <CheckCheck className="size-[1.0625rem]" />
                  </span>
                )}
                <span className="time">{time}</span>
              </div>
            )}
          </div>

          <div className="subtitle">
            {typingLabel ? (
              <p dir="auto" className="last-message typing-status">
                <span className="typing-dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
                <span className="last-message-summary">{typingLabel}</span>
              </p>
            ) : draft ? (
              <p dir="auto" className="last-message">
                <span className="draft">{tr("draftPrefix", "Qoralama: ")}</span>
                <span className="last-message-summary">{draft}</span>
              </p>
            ) : (
              <p dir="auto" className={cn("last-message", isEmptyPreview && "last-message--empty")}>
                {prefix && <span className="sender-name">{prefix}</span>}
                {d.lastForwarded && <Forward className="chat-prefix-icon" />}
                {d.lastStoryReply && <Reply className="chat-prefix-icon" />}
                {isVideoPreview ? (
                  <span className="media-preview" aria-hidden="true">
                    <Play className="icon-play" />
                  </span>
                ) : (
                  MediaIcon && <MediaIcon className="chat-prefix-icon" />
                )}
                <span className="last-message-summary">{previewText}</span>
              </p>
            )}
            <RowBadge
              unread={d.unread}
              muted={!!d.muted}
              pinned={!!d.pinned}
              mention={d.mentionCount ?? 0}
              reaction={d.reactionCount ?? 0}
              unreadMark={!!d.unreadMark}
              tr={tr}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── material ripple (ported 1:1 from the reference ui/RippleEffect) ───────────
// Listens for a left-button mousedown on its parent (`.ListItem-button`), spawns
// a wave sized to half the row width at the click point, then removes it once the
// 700ms animation (see tgweb-left.css `@keyframes tg-ripple`) has run.
function RowRipple() {
  const ref = useRef<HTMLSpanElement | null>(null);
  const keyRef = useRef(0);
  const [ripples, setRipples] = useState<{ x: number; y: number; size: number; key: number }[]>([]);

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const rect = parent.getBoundingClientRect();
      const size = parent.offsetWidth / 2;
      const key = keyRef.current++;
      setRipples((prev) => [
        ...prev,
        { x: e.clientX - rect.left - size / 2, y: e.clientY - rect.top - size / 2, size, key },
      ]);
      window.setTimeout(() => setRipples((prev) => prev.filter((r) => r.key !== key)), 700);
    };
    parent.addEventListener("mousedown", onDown);
    return () => parent.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <span ref={ref} className="ripple-container" aria-hidden="true">
      {ripples.map((r) => (
        <span
          key={r.key}
          className="ripple-wave"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
    </span>
  );
}

// ── peer title badges (ported from VerifiedIcon / StarIcon / FakeIcon) ────────

/** The blue verification seal + white checkmark (reference VerifiedIcon SVG). */
function VerifiedIcon() {
  return (
    <svg className="VerifiedIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12.3 2.9c.1.1.2.1.3.2.7.6 1.3 1.1 2 1.7.3.2.6.4.9.4.9.1 1.7.2 2.6.2.5 0 .6.1.7.7.1.9.1 1.8.2 2.6 0 .4.2.7.4 1 .6.7 1.1 1.3 1.7 2 .3.4.3.5 0 .8-.5.6-1.1 1.3-1.6 1.9-.3.3-.5.7-.5 1.2-.1.8-.2 1.7-.2 2.5 0 .4-.2.5-.6.6-.8 0-1.6.1-2.5.2-.5 0-1 .2-1.4.5-.6.5-1.3 1.1-1.9 1.6-.3.3-.5.3-.8 0-.7-.6-1.4-1.2-2-1.8-.3-.2-.6-.4-.9-.4-.9-.1-1.8-.2-2.7-.2-.4 0-.5-.2-.6-.5 0-.9-.1-1.7-.2-2.6 0-.4-.2-.8-.4-1.1-.6-.6-1.1-1.3-1.6-2-.4-.4-.3-.5 0-1 .6-.6 1.1-1.3 1.7-1.9.3-.3.4-.6.4-1 0-.8.1-1.6.2-2.5 0-.5.1-.6.6-.6.9-.1 1.7-.1 2.6-.2.4 0 .7-.2 1-.4.7-.6 1.4-1.2 2.1-1.7.1-.2.3-.3.5-.2z"
        style={{ fill: "var(--color-fill)" }}
      />
      <path
        d="M16.4 10.1l-.2.2-5.4 5.4c-.1.1-.2.2-.4 0l-2.6-2.6c-.2-.2-.1-.3 0-.4.2-.2.5-.6.7-.6.3 0 .5.4.7.6l1.1 1.1c.2.2.3.2.5 0l4.3-4.3c.2-.2.4-.3.6 0 .1.2.3.3.4.5.2 0 .3.1.3.1z"
        style={{ fill: "var(--color-checkmark)" }}
      />
    </svg>
  );
}

/** The Telegram Premium gradient star (reference StarIcon PremiumStarIcon SVG). */
function PremiumStar() {
  const gid = `tg-star-${useId().replace(/:/g, "")}`;
  return (
    <i className="StarIcon" aria-hidden="true">
      <svg width="14" height="15" viewBox="0 0 14 15" fill="none">
        <defs>
          <linearGradient id={gid} x1="3" y1="63.5" x2="84.1" y2="-1.3" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6B93FF" />
            <stop offset="0.439" stopColor="#976FFF" />
            <stop offset="1" stopColor="#E46ACE" />
          </linearGradient>
        </defs>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M6.63869 12.1902L3.50621 14.1092C3.18049 14.3087 2.75468 14.2064 2.55515 13.8807C2.45769 13.7216 2.42864 13.5299 2.47457 13.3491L2.95948 11.4405C3.13452 10.7515 3.60599 10.1756 4.24682 9.86791L7.6642 8.22716C7.82352 8.15067 7.89067 7.95951 7.81418 7.80019C7.75223 7.67116 7.61214 7.59896 7.47111 7.62338L3.66713 8.28194C2.89387 8.41581 2.1009 8.20228 1.49941 7.69823L0.297703 6.69116C0.00493565 6.44581 -0.0335059 6.00958 0.211842 5.71682C0.33117 5.57442 0.502766 5.48602 0.687982 5.47153L4.35956 5.18419C4.61895 5.16389 4.845 4.99974 4.94458 4.75937L6.36101 1.3402C6.5072 0.987302 6.91179 0.819734 7.26469 0.965925C7.43413 1.03612 7.56876 1.17075 7.63896 1.3402L9.05539 4.75937C9.15496 4.99974 9.38101 5.16389 9.6404 5.18419L13.3322 5.47311C13.713 5.50291 13.9975 5.83578 13.9677 6.2166C13.9534 6.39979 13.8667 6.56975 13.7269 6.68896L10.9114 9.08928C10.7131 9.25826 10.6267 9.52425 10.6876 9.77748L11.5532 13.3733C11.6426 13.7447 11.414 14.1182 11.0427 14.2076C10.8642 14.2506 10.676 14.2208 10.5195 14.1249L7.36128 12.1902C7.13956 12.0544 6.8604 12.0544 6.63869 12.1902Z"
          fill={`url(#${gid})`}
        />
      </svg>
    </i>
  );
}

/** The bordered red "scam"/"fake" pill (reference FakeIcon). */
function FakeBadge({ kind, tr }: { kind: "scam" | "fake"; tr: Tr }) {
  return (
    <span className="FakeIcon">
      {kind === "scam" ? tr("scamBadge", "scam") : tr("fakeBadge", "fake")}
    </span>
  );
}

// ── ChatBadge — reaction / mention / unread badges (or a pinned glyph) ────────
// Ports the reference ChatBadge cluster: a flex `.badge-wrapper` holding, in the
// reference's importance order, a red heart reaction badge, a green "@" mention
// badge and the unread count — muted greys the reaction + count (never the
// mention). The pinned glyph shows only when there is nothing unread to display.
// mention / reaction counts come from OPTIONAL TgDialog fields, so a backend that
// doesn't send them yet simply renders the unread-or-pinned badge as before.
function RowBadge({
  unread,
  muted,
  pinned,
  mention,
  reaction,
  unreadMark,
  tr,
}: {
  unread: number;
  muted: boolean;
  pinned: boolean;
  mention: number;
  reaction: number;
  unreadMark: boolean;
  tr: Tr;
}) {
  const hasReaction = reaction > 0;
  const hasMention = mention > 0;
  const hasUnread = unread > 0;
  // A chat manually "marked as unread" (0 real unread) shows a plain unread DOT.
  const showUnreadDot = unreadMark && !hasUnread;

  if (hasReaction || hasMention || hasUnread || showUnreadDot) {
    return (
      <div className="badge-wrapper">
        {hasReaction && (
          <div
            className={cn("badge reaction round", muted && "muted")}
            aria-label={tr("reactions", "Reaksiyalar")}
          >
            <Heart className="badge-icon" />
          </div>
        )}
        {hasMention && (
          <div className="badge mention round" aria-label={tr("mentions", "Eslatmalar")}>
            <AtSign className="badge-icon" />
          </div>
        )}
        {hasUnread && (
          <div className={cn("badge unread", muted && "muted")}>
            {unread > 99 ? "99+" : unread}
          </div>
        )}
        {showUnreadDot && (
          <div
            className={cn("badge unread badge-unread-dot", muted && "muted")}
            aria-label={tr("markUnread", "O'qilmagan deb belgilash")}
          />
        )}
      </div>
    );
  }
  if (pinned) {
    return (
      <div className="badge pinned" aria-label={tr("pinned", "Mahkamlangan")}>
        <Pin className="badge-icon" />
      </div>
    );
  }
  return null;
}

// ── loading skeleton (mirrors the row metrics) ───────────────────────────────

function TgSkeleton() {
  return (
    <div className="tgweb-skeleton animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skl-row">
          <div className="skl-avatar" />
          <div className="skl-lines">
            <div className="skl-bar w-2/5" />
            <div className="skl-bar w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── row context menu (portal, clamped to viewport) ───────────────────────────
// A faithful port of the real Telegram Web A chat-row context menu: the plain
// compact <Menu> that ListItem renders for its `contextActions` — same DOM +
// class names as the reference (`.Menu.compact` → `.bubble menu-container` →
// `.MenuItem.compact` rows with a leading `.icon`, plus a `.MenuSeparator`
// before the destructive Delete). Styling comes from the shared tgweb-menu.css
// (ported ui/Menu.scss + ui/MenuItem.scss + ui/MenuSeparator.module.scss).
//
// It renders through a portal to <body>, so the portal wrapper carries the
// `tg-surface` class itself: that both matches the scoped `.tg-surface .Menu…`
// selectors AND resolves the real `--color-*` tokens (defined on `.tg-surface`).
// Item order mirrors the reference useChatContextActions among the actions we
// support: Mark as read → Pin → Mute → Archive → (separator) Delete.

function TgRowMenu({
  x,
  y,
  align,
  unread,
  pinned,
  muted,
  archived,
  isAdmin,
  tr,
  onClose,
  onGrant,
  onMarkRead,
  onMarkUnread,
  onTogglePin,
  onToggleMute,
  onToggleArchive,
  onDelete,
}: {
  x: number;
  y: number;
  align: MenuAlign;
  unread: number;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  isAdmin: boolean;
  tr: Tr;
  onClose: () => void;
  onGrant: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onTogglePin: () => void;
  onToggleMute: () => void;
  onToggleArchive: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // offsetWidth/Height are the untransformed layout box — measuring these keeps
    // the clamp accurate while the open animation scales the element.
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const pad = 8;
    // "right" align (hover ⋯ button) opens leftward from the anchor point.
    let left = align === "right" ? x - width : x;
    let top = y;
    if (left + width + pad > window.innerWidth) left = window.innerWidth - width - pad;
    if (left < pad) left = pad;
    if (top + height + pad > window.innerHeight) top = Math.max(pad, y - height);
    if (top < pad) top = pad;
    setPos({ left, top });
  }, [x, y, align]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // Wrap an action so it fires then closes the menu.
  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };
  const confirmDelete = tr(
    "deleteConfirm",
    "Bu suhbatni o'chirasizmi? Kanal/guruhdan chiqiladi, shaxsiy chatda tarix tozalanadi.",
  );

  return createPortal(
    <div
      className="tg-surface fixed inset-0 z-[60]"
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
        className={cn(
          "Menu compact in-portal ListItem-context-menu msg-menu-in absolute",
          align === "right" ? "origin-top-right" : "origin-top-left",
        )}
      >
        <div role="presentation" className="bubble menu-container custom-scroll">
          {/* grant access — corporate ACL, admin only (opens the grant dialog) */}
          {isAdmin && (
            <>
              <MenuItem icon={UserPlus} onClick={run(onGrant)}>
                {tr("grantAccess", "Ruxsat berish")}
              </MenuItem>
              <div className="MenuSeparator" />
            </>
          )}
          {/* mark read — only when there's something to clear; otherwise the
              inverse "mark as unread" (reference useChatContextActions) */}
          {unread > 0 ? (
            <MenuItem icon={CheckCheck} onClick={run(onMarkRead)}>
              {tr("markRead", "O'qilgan deb belgilash")}
            </MenuItem>
          ) : (
            <MenuItem icon={CircleDot} onClick={run(onMarkUnread)}>
              {tr("markUnread", "O'qilmagan deb belgilash")}
            </MenuItem>
          )}
          <MenuItem icon={pinned ? PinOff : Pin} onClick={run(onTogglePin)}>
            {pinned ? tr("unpin", "Mahkamlashni bekor qilish") : tr("pin", "Mahkamlash")}
          </MenuItem>
          <MenuItem icon={muted ? Bell : BellOff} onClick={run(onToggleMute)}>
            {muted ? tr("unmute", "Ovozni yoqish") : tr("mute", "Ovozsiz")}
          </MenuItem>
          <MenuItem icon={archived ? ArchiveRestore : Archive} onClick={run(onToggleArchive)}>
            {archived ? tr("unarchive", "Arxivdan chiqarish") : tr("archive", "Arxivlash")}
          </MenuItem>
          <div className="MenuSeparator" />
          <MenuItem
            icon={Trash2}
            destructive
            onClick={() => {
              if (window.confirm(confirmDelete)) onDelete();
              onClose();
            }}
          >
            {tr("delete", "O'chirish")}
          </MenuItem>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// A single `.MenuItem` row — Telegram Web A's compact menu item (icon + label).
function MenuItem({
  icon: Icon,
  children,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <div
      role="menuitem"
      tabIndex={0}
      className={cn("MenuItem compact", destructive && "destructive")}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <Icon className="icon" />
      {children}
    </div>
  );
}
