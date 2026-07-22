// Telegram bridge — chat header, ported 1:1 from Telegram Web A's MiddleHeader.
// Renders the real client's floating rounded "island": a centered pill (no
// borders, `--shadow-pane`) holding an optional mobile back button, the
// `.ChatInfo` cluster (2.5rem Avatar + `.info` with an h3 title, an emoji-status /
// verified badge, and a `.status`/`.typing-status` subtitle), and the
// `.HeaderActions` right cluster of round translucent icon Buttons (call + video +
// search + more). Directly under it floats the pinned-messages bar (TgPinnedBar).
//
// Reference: src/components/middle/MiddleHeader.tsx (+ MiddleHeader.scss),
// HeaderActions.tsx, HeaderMenuContainer.tsx (the "⋯" menu), MiddleHeaderPanes.tsx
// + panes/HeaderPinnedMessage.tsx, and the common PrivateChatInfo/GroupChatInfo
// `.info` DOM. We keep the AIBA data contract: the subtitle is a REAL status
// (online / last-seen / member+online count) from the peer endpoint, the live
// "typing…" hint (animated dots, cycled across typers), or an optional connection
// status ("connecting…"/"updating…", top priority) — the bridge never fabricates
// presence. Non-wired menu entries surface a "coming soon" toast; the common ones
// (view info, mute/unmute, search, mark-read) are wired to their real actions.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  BadgeCheck,
  Ban,
  Bell,
  BellOff,
  CheckCheck,
  CheckSquare,
  Eraser,
  Flag,
  Info,
  LogOut,
  MoreVertical,
  Phone,
  Search,
  Star,
  Trash2,
  UserPlus,
  Video,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import { useMe } from "@/shared/api/me";
import { TgAvatar } from "./tg-avatar";
import { TgEmojiStatus } from "./tg-emoji-status";
import {
  useMarkTgRead,
  useTgMuteChat,
  useTgPeer,
  type TgDialog,
  type TgDialogKind,
  type TgPeerDetail,
} from "./api";
import { fmtDialogTime } from "./shared";
import { typingKey, useTgTyping } from "./typing-store";
import { TgPinnedBar } from "./pinned-bar";
import { TgGrantDialog } from "./grant-dialog";
import "./tgweb-middle.css";

type Tr = (k: string, d: string) => string;

function kindLabel(kind: TgDialogKind, tr: Tr): string {
  if (kind === "channel") return tr("kindChannel", "Kanal");
  if (kind === "group") return tr("kindGroup", "Guruh");
  return tr("kindUser", "Foydalanuvchi");
}

/** Group a plain integer with thin spaces ("1 234", "56 789") like Telegram. */
function groupDigits(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Drop a trailing ellipsis / dots so we can append our own animated dots without
 *  doubling them (the localized "typing…" / "Updating…" strings carry a static
 *  ellipsis that we replace with the live `TypingDots`). */
function stripDots(s: string): string {
  return s.replace(/[.…]+$/u, "");
}

// Fuzzy last-seen tokens the backend returns instead of a concrete timestamp.
const LAST_SEEN_FALLBACK: Record<string, string> = {
  recently: "yaqinda",
  lastWeek: "o'tgan hafta",
  lastMonth: "o'tgan oy",
};

/** Human "last seen …" from an ISO datetime or a fuzzy token. */
function lastSeenLabel(v: string, tr: Tr): string {
  const fuzzy = LAST_SEEN_FALLBACK[v];
  const when = fuzzy ? tr(`lastSeen_${v}`, fuzzy) : fmtDialogTime(v);
  return tr("lastSeenAt", "oxirgi faollik {{when}}").replace("{{when}}", when);
}

/** Real subtitle from peer detail. `online` accents the whole line (a user who's
 *  online); `extra` is the accented ", N online" segment appended after a group's
 *  member count. `null` falls back to the bare kind label. */
function detailSubtitle(
  detail: TgPeerDetail | undefined,
  kind: TgDialogKind,
  tr: Tr,
): { text: string; online: boolean; extra?: string } | null {
  if (!detail) return null;
  if (detail.kind === "user") {
    if (detail.online) return { text: tr("online", "onlayn"), online: true };
    if (detail.lastSeen) return { text: lastSeenLabel(detail.lastSeen, tr), online: false };
    return null;
  }
  if (detail.membersCount != null) {
    const text =
      kind === "channel"
        ? tr("subscribersCount", "{{n}} obunachi").replace("{{n}}", groupDigits(detail.membersCount))
        : tr("membersCount", "{{n}} a'zo").replace("{{n}}", groupDigits(detail.membersCount));
    const online = detail.onlineCount;
    const extra =
      online != null && online > 0
        ? `, ${tr("membersOnline", "{{n}} onlayn").replace("{{n}}", groupDigits(online))}`
        : undefined;
    return { text, online: false, extra };
  }
  return null;
}

/** The animated "…" that trails a typing / connecting status (three blinking
 *  dots inheriting the line's color). */
function TypingDots() {
  return (
    <span className="tg-typing-dots" aria-hidden="true">
      <span className="tg-typing-dot" />
      <span className="tg-typing-dot" />
      <span className="tg-typing-dot" />
    </span>
  );
}

export function TgChatHeader({
  accountId,
  chatId,
  dialog,
  onBack,
  onOpenInfo,
  searchOpen,
  onSearchOpenChange,
  connectionStatus,
}: {
  accountId: number;
  chatId: number;
  dialog: TgDialog | null;
  onBack?: () => void;
  onOpenInfo?: () => void;
  /** In-chat search toggle — shared with TgMessageList via chat-pane. */
  searchOpen?: boolean;
  onSearchOpenChange?: (open: boolean) => void;
  /** OPTIONAL connection status ("connecting…" / "updating…"). When set it takes
   *  priority over presence + typing and renders with animated dots. The bridge
   *  can feed it from the WS link state later; unset today → nothing extra shows. */
  connectionStatus?: string | null;
}) {
  const { t } = useTranslation();
  const tr: Tr = (k, d) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const markRead = useMarkTgRead();
  const muteChat = useTgMuteChat();
  const peerQ = useTgPeer(accountId, chatId);
  // Grant-access is admin-only — opens the corporate ACL dialog for this chat.
  const isAdmin = !!useMe().data?.is_admin;
  const [grantOpen, setGrantOpen] = useState(false);
  // Custom emoji-status document id (premium OR collectible/gift) — prefer the
  // dialog's, fall back to the freshly-fetched peer detail (users only).
  const emojiStatusDoc =
    dialog?.emojiStatus?.documentId ??
    (peerQ.data?.kind === "user" ? peerQ.data.emojiStatus?.documentId : undefined);
  // Fall back to the freshly-fetched peer detail when the chat isn't in the
  // dialog list yet (e.g. opening someone's personal channel we're not subscribed
  // to) — so the header still shows the real name + the right kind, not a blank.
  const title = dialog?.title || peerQ.data?.name || "";
  const kind: TgDialogKind = dialog?.kind ?? peerQ.data?.kind ?? "user";
  const isUser = kind === "user";
  // Calls are 1:1 only (reference: `canCall = isUserId(chat.id) && !isChatWithSelf`).
  const canCall = isUser && !dialog?.isSelf;

  // Real status subtitle (last-seen / members+online) from the peer endpoint,
  // falling back to the bare kind label while loading / when unavailable.
  const status = detailSubtitle(peerQ.data, kind, tr);

  // Live "typing…" — set by the WS handler (page.tsx) into the typing store.
  const typers = useTgTyping((s) => s.byChat[typingKey(accountId, chatId)]);
  const active = (typers ?? []).filter((e) => e.until > Date.now());
  const names = active.map((e) => e.name).filter((n): n is string => Boolean(n));
  const multi = !isUser && names.length > 1;

  // Cycle the shown typer's name across multiple typers (every ~2.2s). The
  // interval's re-render also naturally expires stale entries via the filter above.
  const [cyc, setCyc] = useState(0);
  useEffect(() => {
    if (!multi) return;
    const id = window.setInterval(() => setCyc((c) => c + 1), 2200);
    return () => window.clearInterval(id);
  }, [multi, names.length]);

  const typingBase = active.length
    ? !isUser && names.length
      ? tr("typingName", "{{name}} yozmoqda…").replace("{{name}}", names[cyc % names.length])
      : tr("typing", "yozmoqda…")
    : null;

  // Priority: connection status → typing → presence/members → kind label.
  const connClean = connectionStatus ? stripDots(connectionStatus) : null;
  const typingClean = typingBase ? stripDots(typingBase) : null;

  // Lightweight "coming soon" toast for the not-yet-wired menu entries + call
  // buttons (mirrors the message-bubble callback flash). Cleared on unmount.
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
  }, []);
  const flash = (m: string) => {
    setNote(m);
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 3200);
  };
  const notReady = () => flash(tr("comingSoon", "Tez orada qo'shiladi"));

  const toggleMute = () => {
    if (!dialog) return;
    muteChat.mutate({ accountId, chatId, muted: !dialog.muted });
  };
  const toggleSearch = () => onSearchOpenChange?.(!searchOpen);

  return (
    <>
      <div className="MiddleHeader">
        {onBack && (
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
        )}

        {/* .ChatInfo — avatar + title/status; the whole cluster opens chat info */}
        <button type="button" className="ChatInfo" onClick={onOpenInfo}>
          <TgAvatar
            className="Avatar"
            accountId={accountId}
            peerId={chatId}
            name={title || "?"}
            size={40}
            group={!isUser}
          />
          <div className="info">
            <div className="title">
              <h3>{title || tr("chat", "Suhbat")}</h3>
              {/* Verified / emoji-status / premium / scam / fake (defensive: each
                  is an OPTIONAL field). An animated custom emoji-status — premium
                  OR collectible/gift — replaces the static premium star. */}
              {dialog?.verified && (
                <BadgeCheck
                  className="title-badge title-badge--verified"
                  aria-label={tr("verified", "Tasdiqlangan")}
                />
              )}
              {emojiStatusDoc ? (
                <TgEmojiStatus
                  accountId={accountId}
                  documentId={emojiStatusDoc}
                  size={22}
                  className="title-badge title-badge--emoji-status"
                />
              ) : (
                dialog?.premium && !dialog?.verified && (
                  <Star
                    className="title-badge title-badge--premium"
                    aria-label={tr("premium", "Premium")}
                  />
                )
              )}
              {dialog?.scam && <span className="title-tag title-tag--scam">{tr("scam", "SCAM")}</span>}
              {dialog?.fake && <span className="title-tag title-tag--fake">{tr("fake", "FAKE")}</span>}
            </div>

            {connClean ? (
              <span className="status">
                {connClean}
                <TypingDots />
              </span>
            ) : typingClean ? (
              <span className="typing-status">
                {typingClean}
                <TypingDots />
              </span>
            ) : (
              <span className={cn("status", status?.online && "online")}>
                {status?.text ?? kindLabel(kind, tr)}
                {status?.extra && <span className="status-online">{status.extra}</span>}
              </span>
            )}
          </div>
        </button>

        {/* .HeaderActions — right-side icon Buttons */}
        <div className="HeaderActions">
          {/* Voice + video call — 1:1 only (UI now, wiring later → toast). */}
          {canCall && (
            <>
              <button
                type="button"
                className="Button"
                onClick={notReady}
                aria-label={tr("voiceCall", "Ovozli qo'ng'iroq")}
                title={tr("voiceCall", "Ovozli qo'ng'iroq")}
              >
                <Phone className="size-6" />
              </button>
              <button
                type="button"
                className="Button"
                onClick={notReady}
                aria-label={tr("videoCall", "Video qo'ng'iroq")}
                title={tr("videoCall", "Video qo'ng'iroq")}
              >
                <Video className="size-6" />
              </button>
            </>
          )}

          <button
            type="button"
            className={cn("Button", searchOpen && "activated")}
            onClick={toggleSearch}
            aria-pressed={!!searchOpen}
            aria-label={tr("search", "Qidirish")}
            title={tr("search", "Qidirish")}
          >
            <Search className="size-6" />
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="Button" aria-label={tr("more", "Yana")}>
                <MoreVertical className="size-6" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => onOpenInfo?.()}>
                <Info className="mr-2 size-4" />
                {tr("viewInfo", "Ma'lumotni ko'rish")}
              </DropdownMenuItem>

              {isAdmin && (
                <DropdownMenuItem onClick={() => setGrantOpen(true)}>
                  <UserPlus className="mr-2 size-4" />
                  {tr("grantAccess", "Ruxsat berish")}
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onClick={toggleSearch}>
                <Search className="mr-2 size-4" />
                {tr("search", "Qidirish")}
              </DropdownMenuItem>

              {canCall && (
                <>
                  <DropdownMenuItem onClick={notReady}>
                    <Video className="mr-2 size-4" />
                    {tr("videoCall", "Video qo'ng'iroq")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={notReady}>
                    <Phone className="mr-2 size-4" />
                    {tr("voiceCall", "Ovozli qo'ng'iroq")}
                  </DropdownMenuItem>
                </>
              )}

              {dialog && !dialog.isSelf && (
                <DropdownMenuItem onClick={toggleMute} disabled={muteChat.isPending}>
                  {dialog.muted ? (
                    <>
                      <Bell className="mr-2 size-4" />
                      {tr("unmute", "Ovozni yoqish")}
                    </>
                  ) : (
                    <>
                      <BellOff className="mr-2 size-4" />
                      {tr("mute", "Ovozsiz qilish")}
                    </>
                  )}
                </DropdownMenuItem>
              )}

              <DropdownMenuItem onClick={notReady}>
                <CheckSquare className="mr-2 size-4" />
                {tr("selectMessages", "Xabarlarni tanlash")}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => markRead.mutate({ accountId, chatId })}
                disabled={markRead.isPending}
              >
                <CheckCheck className="mr-2 size-4" />
                {tr("markRead", "O'qilgan deb belgilash")}
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuItem
                onClick={notReady}
                className="text-destructive focus:text-destructive"
              >
                <Eraser className="mr-2 size-4" />
                {tr("clearHistory", "Tarixni tozalash")}
              </DropdownMenuItem>

              {isUser ? (
                <DropdownMenuItem
                  onClick={notReady}
                  className="text-destructive focus:text-destructive"
                >
                  <Ban className="mr-2 size-4" />
                  {tr("blockUser", "Bloklash")}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  onClick={notReady}
                  className="text-destructive focus:text-destructive"
                >
                  <Flag className="mr-2 size-4" />
                  {tr("reportChat", "Shikoyat qilish")}
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                onClick={notReady}
                className="text-destructive focus:text-destructive"
              >
                {isUser ? (
                  <>
                    <Trash2 className="mr-2 size-4" />
                    {tr("deleteChat", "Suhbatni o'chirish")}
                  </>
                ) : kind === "channel" ? (
                  <>
                    <LogOut className="mr-2 size-4" />
                    {tr("leaveChannel", "Kanalni tark etish")}
                  </>
                ) : (
                  <>
                    <LogOut className="mr-2 size-4" />
                    {tr("leaveGroup", "Guruhni tark etish")}
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Pinned-messages bar — a second floating island directly below the header.
          Renders nothing until the backend supplies pins (defensive reader). */}
      <TgPinnedBar accountId={accountId} chatId={chatId} />

      {note && (
        <div className="tg-toast" role="status">
          {note}
        </div>
      )}

      {/* Grant-access dialog — opened from the header ⋮ menu (admin only). */}
      {isAdmin && grantOpen && (
        <TgGrantDialog
          accountId={accountId}
          chatId={chatId}
          onClose={() => setGrantOpen(false)}
        />
      )}
    </>
  );
}
