// Telegram bridge — RIGHT column info/profile panel, a fidelity port of Telegram
// Web A's `right/Profile.tsx` (+ RightColumn / RightHeader / ProfileInfo /
// ChatExtra / MemberList / SharedMedia). The DOM hierarchy and class names mirror
// the reference 1:1 — a `.RightColumn` aside, a `.RightHeader` strip (close +
// kind-titled header + a management pencil for admins), a `.Profile` scroll body
// with a big centred `.ProfileInfo` (jumbo avatar + name + emoji-status/badges +
// status), an optional `ProfileChannel` card, a `.ChatExtra` `.Island` of info
// rows, the `.shared-media-tabs` strip (Members / Media / Files / Links / Music /
// GIFs / Voice) and, below it, the real members list or the paginated shared
// media grids (see `./shared-media`). All styling lives in `./tgweb-profile.css`.
//
// Two exports share the same chrome and helpers:
//   • `TgChatInfo`    — info for the OPEN chat (user / bot / group / channel).
//   • `TgUserProfile` — a person/bot the user clicked in a group.
//
// Both drill into nested profiles WITHOUT touching the chat-pane: a member row or
// the personal-channel card opens the target as a nested `TgUserProfile` /
// `TgChatInfo` (a local `nested` state), and — for a manageable group/channel — a
// header pencil swaps the whole panel for the lazily-loaded `<TgManagement>`.
import {
  Component,
  lazy,
  Suspense,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  AtSign,
  BadgeCheck,
  Bell,
  Bookmark,
  Check,
  ChevronLeft,
  Copy,
  Info,
  Loader2,
  MessageSquare,
  Pencil,
  Phone,
  QrCode,
  Star,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useToastStore } from "@/shared/notifications/store";
import { useMe } from "@/shared/api/me";
import { Switch } from "@/components/ui/switch";
import { ChatAvatar } from "../avatar";
import { fmtDialogTime } from "./shared";
import { TgAvatar } from "./tg-avatar";
import { AnimatedSticker } from "./animated-sticker";
import { renderEntities } from "./entities";
import { useTgCustomEmoji } from "./media";
import { SharedMediaPanel, type SharedMediaTab } from "./shared-media";
import { TgGrantDialog } from "./grant-dialog";
import {
  tgCustomEmojiUrl,
  useChatGrants,
  useRemoveTgGrant,
  useTgMembers,
  useTgMuteChat,
  useTgPeer,
  type TgDialog,
  type TgDialogKind,
  type TgMember,
  type TgPeerDetail,
} from "./api";
import "./tgweb-profile.css";

type Tr = (k: string, d: string) => string;
type TgUserDetail = Extract<TgPeerDetail, { kind: "user" }>;
type TgChatDetail = Extract<TgPeerDetail, { kind: "group" | "channel" }>;

/** Peer flag badges shown next to the name. */
type BadgeFlags = { verified?: boolean; scam?: boolean; fake?: boolean; premium?: boolean };

/** A nested profile the panel drills into (a member, or a personal channel). */
type Nested =
  | { kind: "user"; id: number | null; name: string }
  | { kind: "chat"; dialog: TgDialog };

const EM = "—";

/** Format a raw MSISDN the Telegram way: `+998 90 805 59 95` for UZ numbers,
 *  a bare `+<digits>` for everything else (Telegram uses libphonenumber; this
 *  covers the app's dominant country and never mangles others). */
function fmtPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("998") && d.length === 12) {
    return `+998 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10, 12)}`;
  }
  return `+${d}`;
}

// Fuzzy last-seen tokens the backend returns instead of a concrete timestamp.
const LAST_SEEN_FALLBACK: Record<string, string> = {
  recently: "yaqinda",
  lastWeek: "o'tgan hafta",
  lastMonth: "o'tgan oy",
};

/** Human presence line for a user/member: "online" or "last seen …". */
function presenceLine(p: { online?: boolean; lastSeen?: string | null }, tr: Tr): string | null {
  if (p.online) return tr("online", "onlayn");
  if (p.lastSeen) {
    const fuzzy = LAST_SEEN_FALLBACK[p.lastSeen];
    const when = fuzzy ? tr(`lastSeen_${p.lastSeen}`, fuzzy) : fmtDialogTime(p.lastSeen);
    return tr("lastSeenAt", "oxirgi faollik {{when}}").replace("{{when}}", when);
  }
  return null;
}

/** Member/subscriber count line for a group/channel ("128 members"). */
function membersText(count: number | null, kind: TgDialogKind, tr: Tr): string {
  if (count == null) return kind === "channel" ? tr("kindChannel", "Kanal") : tr("kindGroup", "Guruh");
  const word = kind === "channel" ? tr("subscribersWord", "obunachi") : tr("membersWord", "a'zo");
  return `${count} ${word}`;
}

/** Header title by kind, matching the real client. */
function headerTitle(kind: TgDialogKind, isBot: boolean, tr: Tr): string {
  if (kind === "channel") return tr("channelInfo", "Channel Info");
  if (kind === "group") return tr("groupInfo", "Group Info");
  if (isBot) return tr("botInfo", "Bot Info");
  return tr("userInfo", "User Info");
}

/** Push a defensive "coming soon" toast (member "Message" action — opening a DM
 *  isn't wired from the info panel). Reuses the app's macOS-style toast stack. */
function pushComingSoon(tr: Tr) {
  useToastStore.getState().push({
    id: `tg-member-msg-${Date.now()}`,
    title: tr("comingSoon", "Tez orada"),
    body: tr("sendMessage", "Message"),
    icon: "telegram",
    link: "",
    module: "telegram",
    createdAt: new Date().toISOString(),
    isRead: false,
  });
}

// ── management (lazy) ─────────────────────────────────────────────────────────
// The group/channel management screens live in `./management` (a self-routing
// panel with its own RightColumn chrome). It's code-split — loaded only when the
// admin taps the header pencil — and wrapped in a boundary so a load failure
// closes back to the profile instead of crashing the panel.

const TgManagementLazy = lazy(() =>
  import("./management").then((m) => ({ default: m.TgManagement })),
);

class ManagementBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFail();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function ManagementHost({
  accountId,
  chatId,
  kind,
  onClose,
}: {
  accountId: number;
  chatId: number;
  kind: "group" | "channel";
  onClose: () => void;
}) {
  return (
    <ManagementBoundary onFail={onClose}>
      <Suspense
        fallback={
          <aside className="RightColumn">
            <div className="Profile">
              <div className="content emptyList">
                <Loader2 className="size-6 animate-spin" />
              </div>
            </div>
          </aside>
        }
      >
        <TgManagementLazy accountId={accountId} chatId={chatId} kind={kind} onClose={onClose} />
      </Suspense>
    </ManagementBoundary>
  );
}

// ── chrome ────────────────────────────────────────────────────────────────────

/** Panel shell: the right-pinned `.RightColumn` aside, its `.RightHeader` strip
 *  (close/back button + title + optional right-hand tools) and the scrolling
 *  `.Profile` body. */
function PanelChrome({
  title,
  onClose,
  tr,
  children,
  headerAction,
  back,
}: {
  title: string;
  onClose: () => void;
  tr: Tr;
  children: ReactNode;
  /** Right-hand header tools (e.g. the management pencil). */
  headerAction?: ReactNode;
  /** Show a back arrow instead of the close ✕ (nested profiles). */
  back?: boolean;
}) {
  return (
    <aside className="RightColumn">
      <div className="RightHeader">
        <button
          type="button"
          className="Button close-button"
          onClick={onClose}
          aria-label={back ? tr("back", "Orqaga") : tr("close", "Yopish")}
        >
          {back ? <ChevronLeft className="size-6" /> : <X className="size-6" />}
        </button>
        <h3 className="title">{title}</h3>
        {headerAction && <div className="tools">{headerAction}</div>}
      </div>
      <div className="Profile">{children}</div>
    </aside>
  );
}

// ── name badges + emoji status ────────────────────────────────────────────────

/** The animated custom-emoji status shown next to the name (Telegram Premium).
 *  Streams the sticker bytes through the auth'd endpoint and renders the tgs
 *  Lottie / webm / static image; the static premium star stands in while it
 *  loads (and if it can't). */
function EmojiStatus({ accountId, documentId }: { accountId: number; documentId: string }) {
  const { res } = useTgCustomEmoji(tgCustomEmojiUrl(accountId, documentId));
  if (!res) return <Star className="name-badge premium" aria-hidden />;
  return (
    <span className="name-emoji-status" aria-hidden>
      {res.kind === "tgs" ? (
        <AnimatedSticker tgsUrl={res.url} size={22} className="h-full w-full" />
      ) : res.kind === "webm" ? (
        <video src={res.url} autoPlay loop muted playsInline />
      ) : (
        <img src={res.url} alt="" draggable={false} />
      )}
    </span>
  );
}

/** The verified / premium (or emoji-status) / scam / fake badges that sit next to
 *  the name. When an emoji status is present it replaces the static premium star. */
function NameBadges({
  flags,
  emojiStatus,
  accountId,
  tr,
}: {
  flags: BadgeFlags;
  emojiStatus?: { documentId: string } | null;
  accountId: number;
  tr: Tr;
}) {
  return (
    <>
      {flags.verified && (
        <BadgeCheck className="name-badge verified" aria-label={tr("verified", "Verified")} />
      )}
      {emojiStatus?.documentId ? (
        <EmojiStatus accountId={accountId} documentId={emojiStatus.documentId} />
      ) : flags.premium ? (
        <Star className="name-badge premium" aria-label={tr("premium", "Premium")} />
      ) : null}
      {flags.scam && <span className="name-badge-pill">{tr("scam", "SCAM")}</span>}
      {flags.fake && <span className="name-badge-pill">{tr("fake", "FAKE")}</span>}
    </>
  );
}

/** ProfileInfo — the big centred block: jumbo real avatar + name (+ emoji status /
 *  badges) + status line (members count / presence). */
function ProfileInfoBlock({
  accountId,
  peerId,
  name,
  group,
  subtitle,
  online,
  badges,
  emojiStatus,
  tr,
}: {
  accountId: number;
  peerId: number | null;
  name: string;
  group?: boolean;
  subtitle: string;
  online?: boolean;
  badges?: BadgeFlags;
  emojiStatus?: { documentId: string } | null;
  tr: Tr;
}) {
  return (
    <div className="ProfileInfo">
      <TgAvatar
        accountId={accountId}
        peerId={peerId}
        name={name}
        size={120}
        group={group}
        className="Avatar"
      />
      <div className="info">
        <div className="fullName title">
          <span className="fullName-text">{name}</span>
          <NameBadges flags={badges ?? {}} emojiStatus={emojiStatus} accountId={accountId} tr={tr} />
        </div>
        <div className={cn("status", online && "online")}>{subtitle}</div>
      </div>
    </div>
  );
}

// ── info rows ─────────────────────────────────────────────────────────────────

/** A single `.ChatExtra` info row: leading icon + two-line value/label, with an
 *  optional trailing action (copy). Mirrors the reference `ListItem multiline`. */
function InfoRow({
  icon,
  label,
  value,
  muted,
  wrap,
  action,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  /** Render the value in the placeholder colour (for not-yet-available fields). */
  muted?: boolean;
  /** Allow the value to wrap over multiple lines (bio / about). */
  wrap?: boolean;
  action?: ReactNode;
}) {
  return (
    <div className={cn("ListItem multiline narrow", action && "has-ripple")}>
      <div className="ListItem-button">
        {icon}
        <div className="multiline-item">
          <span className={cn("title", wrap && "word-break", muted && "placeholder")}>{value}</span>
          <span className="subtitle">{label}</span>
        </div>
        {action}
      </div>
    </div>
  );
}

/** Copy-to-clipboard button (ListItem secondary-icon) that flips to a check. */
function CopyButton({ value, tr }: { value: string; tr: Tr }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button
      type="button"
      className={cn("secondary-icon", copied && "copied")}
      onClick={copy}
      aria-label={tr("copy", "Nusxalash")}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </button>
  );
}

/** Phone / username / bio rows for a user, in Telegram-A order (Phone → Username →
 *  Bio). The bio renders WITH its entities (bold/link/custom-emoji…), or plain
 *  auto-linkified text when none. Only rows with a value show; while loading, a
 *  single muted placeholder keeps the card from collapsing. */
function UserDetailRows({
  accountId,
  detail,
  tr,
}: {
  accountId: number;
  detail: TgUserDetail | undefined;
  tr: Tr;
}) {
  const phone = fmtPhone(detail?.phone);
  const hasAny = !!(phone || detail?.username || detail?.bio);
  return (
    <>
      {phone && (
        <InfoRow
          icon={<Phone className="ListItem-main-icon" />}
          label={tr("phone", "Telefon")}
          value={phone}
          action={<CopyButton value={phone} tr={tr} />}
        />
      )}
      {detail?.username && (
        <InfoRow
          icon={<AtSign className="ListItem-main-icon" />}
          label={tr("username", "Foydalanuvchi nomi")}
          value={`@${detail.username}`}
          action={<QrCode className="secondary-icon size-4" aria-hidden />}
        />
      )}
      {detail?.bio && (
        <InfoRow
          icon={<Info className="ListItem-main-icon" />}
          label={tr("bio", "Bio")}
          value={renderEntities(detail.bio, detail.bioEntities, "", tr, accountId, `bio-${accountId}`)}
          wrap
        />
      )}
      {/* Loading / genuinely-empty: keep one honest placeholder row. */}
      {!hasAny && (
        <InfoRow
          icon={<AtSign className="ListItem-main-icon" />}
          label={tr("username", "Foydalanuvchi nomi")}
          value={EM}
          muted
        />
      )}
    </>
  );
}

/** About row for a group/channel (member count lives in the status + tab),
 *  rendered with its entities. */
function ChatDetailRows({
  accountId,
  detail,
  tr,
}: {
  accountId: number;
  detail: TgChatDetail | undefined;
  tr: Tr;
}) {
  return (
    <InfoRow
      icon={<Info className="ListItem-main-icon" />}
      label={tr("about", "About")}
      value={
        detail?.about
          ? renderEntities(detail.about, detail.aboutEntities, "", tr, accountId, `about-${accountId}`)
          : EM
      }
      muted={!detail?.about}
      wrap
    />
  );
}

/** Notifications row — a bell row with a real Switch wired to mute/unmute. */
function NotificationsRow({
  enabled,
  onToggle,
  tr,
}: {
  enabled: boolean;
  onToggle: (on: boolean) => void;
  tr: Tr;
}) {
  const id = useId();
  return (
    <div className="ListItem toggle-item">
      <label htmlFor={id} className="ListItem-button toggle-button">
        <Bell className="ListItem-main-icon" />
        <span className="toggle-label">{tr("notifications", "Notifications")}</span>
        <Switch id={id} className="toggle-switch" checked={enabled} onCheckedChange={onToggle} />
      </label>
    </div>
  );
}

/** "Saved Messages" shortcut row (Telegram-A shows it at the bottom of a user's
 *  info card). Opens the account's self-chat when `onOpen` is provided. */
function SavedMessagesRow({ onOpen, tr }: { onOpen?: () => void; tr: Tr }) {
  return (
    <div className={cn("ListItem narrow", onOpen && "has-ripple")}>
      <button type="button" className="ListItem-button" onClick={onOpen} disabled={!onOpen}>
        <Bookmark className="ListItem-main-icon" />
        <span className="toggle-label">{tr("savedMessages", "Saved Messages")}</span>
      </button>
    </div>
  );
}

/** ProfileChannel card — the user's linked personal channel (avatar + title +
 *  subscriber count), an island above the info rows. Clicking opens the channel. */
function ProfileChannelCard({
  accountId,
  channel,
  onOpen,
  tr,
}: {
  accountId: number;
  channel: { chatId: number; title: string; subscribers: number | null };
  onOpen: () => void;
  tr: Tr;
}) {
  return (
    <div className="personalChannel">
      <h3 className="personalChannelTitle">{tr("profileChannel", "Channel")}</h3>
      <span className="personalChannelSubscribers">
        {membersText(channel.subscribers, "channel", tr)}
      </span>
      <div className="Island personalChannelItem has-ripple">
        <button type="button" className="ListItem-button chat-preview" onClick={onOpen}>
          <TgAvatar
            accountId={accountId}
            peerId={channel.chatId}
            name={channel.title}
            size={48}
            group
            className="chat-preview-avatar"
          />
          <div className="chat-preview-info">
            <span className="chat-preview-title">{channel.title}</span>
            <span className="chat-preview-sub">{membersText(channel.subscribers, "channel", tr)}</span>
          </div>
        </button>
      </div>
    </div>
  );
}

// ── access (ACL) island ───────────────────────────────────────────────────────
// One corporate Telegram account is shared; admins grant per-chat access to AIBA
// employees. This `.Island` (titled "Ruxsat · N") lists the AIBA users allowed to
// use THIS chat, each with a read-only / read-write level badge. Everyone with
// access sees the roster; admins additionally get an "open access" row that spawns
// the grant dialog, and a revoke button per row. Hidden entirely when there are no
// grantees and the viewer isn't an admin. Grantees are AIBA accounts keyed by
// username (not TG peers) — rendered with the same `ChatAvatar` monogram the grants
// admin uses, not `TgAvatar` (which needs a TG peer id they don't have).

/** One grantee row: monogram + `@username` + a read-only/write badge, plus a
 *  trash revoke for admins (spinner on the row being removed). Non-clickable
 *  (`ListItem` without `has-ripple`), so it reads as static info. */
function GranteeRow({
  grant,
  accountId,
  isAdmin,
  remove,
  tr,
}: {
  grant: { id: number; username: string; canWrite: boolean };
  accountId: number;
  isAdmin: boolean;
  remove: ReturnType<typeof useRemoveTgGrant>;
  tr: Tr;
}) {
  const removing = remove.isPending && remove.variables?.grantId === grant.id;
  return (
    <div className="ListItem narrow">
      <div className="ListItem-button">
        <ChatAvatar seed={grant.username} name={grant.username} size={40} className="mr-3" />
        <span className="member-name" style={{ flex: 1, minWidth: 0 }}>
          @{grant.username}
        </span>
        <span className={cn("member-badge", grant.canWrite ? "owner" : "admin")}>
          {grant.canWrite ? tr("canWrite", "Yozish") : tr("readOnly", "O'qish")}
        </span>
        {isAdmin && (
          <button
            type="button"
            className="secondary-icon"
            style={{ marginInlineStart: "0.5rem" }}
            disabled={remove.isPending}
            onClick={() => remove.mutate({ accountId, grantId: grant.id })}
            aria-label={tr("revokeAccess", "Ruxsatni bekor qilish")}
          >
            {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          </button>
        )}
      </div>
    </div>
  );
}

/** Access island for the open chat: grantee roster + (admins) an open-access row
 *  that renders `<TgGrantDialog>` and per-row revoke. */
function AccessIsland({
  accountId,
  chatId,
  isAdmin,
  tr,
}: {
  accountId: number;
  chatId: number;
  isAdmin: boolean;
  tr: Tr;
}) {
  const [open, setOpen] = useState(false);
  const grantsQ = useChatGrants(accountId, chatId);
  const remove = useRemoveTgGrant();
  const items = grantsQ.data?.items ?? [];
  const count = items.length;

  // Nothing granted and the viewer can't grant → don't show the section at all.
  if (count === 0 && !isAdmin) return null;

  return (
    <div className="tg-access" style={{ marginTop: "1rem" }}>
      <h3 className="personalChannelTitle" style={{ margin: "0 0 0.375rem 0.5rem" }}>
        {tr("accessTitle", "Ruxsat")}
        {count > 0 ? ` · ${count}` : ""}
      </h3>
      <div className="Island">
        {isAdmin && (
          <div className="ListItem narrow has-ripple">
            <button type="button" className="ListItem-button" onClick={() => setOpen(true)}>
              <UserPlus className="ListItem-main-icon" />
              <span className="toggle-label">{tr("grantAccess", "Ruxsat berish")}</span>
            </button>
          </div>
        )}
        {items.map((g) => (
          <GranteeRow
            key={g.id}
            grant={g}
            accountId={accountId}
            isAdmin={isAdmin}
            remove={remove}
            tr={tr}
          />
        ))}
      </div>
      {open && (
        <TgGrantDialog accountId={accountId} chatId={chatId} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}

// ── members list ────────────────────────────────────────────────────────────

/** A member's avatar: a supplied `avatarUrl` (with a monogram fallback on error)
 *  or the real photo via `TgAvatar` (auth'd blob → monogram). */
function MemberAvatar({ accountId, member }: { accountId: number; member: TgMember }) {
  const [broke, setBroke] = useState(false);
  if (member.avatarUrl && !broke) {
    return (
      <img
        className="member-avatar"
        src={member.avatarUrl}
        alt={member.name}
        onError={() => setBroke(true)}
        draggable={false}
      />
    );
  }
  return (
    <TgAvatar
      accountId={accountId}
      peerId={member.id}
      name={member.name}
      size={44}
      className="member-avatar"
    />
  );
}

/** Per-member context menu (Open profile / Message), portalled + clamped. */
function MemberMenu({
  x,
  y,
  onOpen,
  onMessage,
  onClose,
  tr,
}: {
  x: number;
  y: number;
  onOpen: () => void;
  onMessage: () => void;
  onClose: () => void;
  tr: Tr;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    let left = x;
    let top = y;
    if (left + width + pad > window.innerWidth) left = window.innerWidth - width - pad;
    if (top + height + pad > window.innerHeight) top = Math.max(pad, y - height);
    setPos({ left: Math.max(pad, left), top: Math.max(pad, top) });
  }, [x, y]);

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
        className="member-menu"
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="member-menu-item" onClick={onOpen}>
          <User className="size-4" />
          {tr("openProfile", "Open profile")}
        </button>
        <button type="button" className="member-menu-item" onClick={onMessage}>
          <MessageSquare className="size-4" />
          {tr("sendMessage", "Message")}
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** One member row: avatar + name + presence, with an Owner (accent pill) /
 *  Admin (muted) badge on the right. Click opens the member's profile; a
 *  right-click opens the per-row context menu. */
function MemberRow({
  accountId,
  member,
  onOpen,
  tr,
}: {
  accountId: number;
  member: TgMember;
  onOpen: (m: TgMember) => void;
  tr: Tr;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const status =
    presenceLine(member, tr) ??
    (member.username ? `@${member.username}` : member.isBot ? tr("kindBot", "Bot") : "");
  return (
    <>
      <div
        className="member-row"
        role="button"
        tabIndex={0}
        onClick={() => onOpen(member)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpen(member);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
      >
        <MemberAvatar accountId={accountId} member={member} />
        <div className="member-info">
          <span className="member-name">{member.name}</span>
          {status && (
            <span className={cn("member-status", member.online && "online")}>{status}</span>
          )}
        </div>
        {member.isOwner ? (
          <span className="member-badge owner">{tr("owner", "Owner")}</span>
        ) : member.isAdmin ? (
          <span className="member-badge admin">{tr("admin", "Admin")}</span>
        ) : null}
      </div>
      {menu && (
        <MemberMenu
          x={menu.x}
          y={menu.y}
          onOpen={() => {
            setMenu(null);
            onOpen(member);
          }}
          onMessage={() => {
            setMenu(null);
            pushComingSoon(tr);
          }}
          onClose={() => setMenu(null)}
          tr={tr}
        />
      )}
    </>
  );
}

/** Loading placeholder row (avatar disc + two lines). */
function MemberSkeleton() {
  return (
    <div className="member-row">
      <span className="member-avatar skeleton" />
      <div className="member-info">
        <span className="skeleton-line" style={{ width: "45%" }} />
        <span className="skeleton-line short" style={{ width: "28%" }} />
      </div>
    </div>
  );
}

function MembersList({
  accountId,
  members,
  loading,
  onOpenMember,
  tr,
}: {
  accountId: number;
  members: TgMember[];
  loading: boolean;
  onOpenMember: (m: TgMember) => void;
  tr: Tr;
}) {
  if (loading) {
    return (
      <div className="members-list">
        {Array.from({ length: 7 }, (_, i) => (
          <MemberSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (members.length === 0) {
    return (
      <div className="content emptyList">
        <span className="empty-icon">
          <Users className="size-9" />
        </span>
        <p className="empty-text">{tr("membersEmpty", "No members yet")}</p>
      </div>
    );
  }
  return (
    <div className="members-list">
      {members.map((m) => (
        <MemberRow key={m.id} accountId={accountId} member={m} onOpen={onOpenMember} tr={tr} />
      ))}
    </div>
  );
}

// ── shared-media tabs (+ members) ─────────────────────────────────────────────

type TabId = "members" | SharedMediaTab;

/** The Members / Media / Files / Links / Music / GIFs / Voice strip (Members only
 *  for groups/channels, active by default) with the `.platform` underline, and
 *  the active tab's body. */
function ProfileTabs({
  accountId,
  chatId,
  showMembers,
  members,
  membersLoading,
  onOpenMember,
  tr,
}: {
  accountId: number;
  chatId: number;
  showMembers: boolean;
  members: TgMember[];
  membersLoading: boolean;
  onOpenMember: (m: TgMember) => void;
  tr: Tr;
}) {
  const [active, setActive] = useState<TabId>(showMembers ? "members" : "media");
  const tabs: { id: TabId; label: string }[] = [
    ...(showMembers ? [{ id: "members" as const, label: tr("tabMembers", "Members") }] : []),
    { id: "media", label: tr("tabMedia", "Media") },
    { id: "documents", label: tr("tabFiles", "Fayllar") },
    { id: "links", label: tr("tabLinks", "Havolalar") },
    { id: "audio", label: tr("tabMusic", "Musiqa") },
    { id: "gif", label: tr("tabGifs", "GIF") },
    { id: "voice", label: tr("tabVoice", "Ovozli") },
  ];

  return (
    <>
      <div className="shared-media-tabs">
        <div className="TabList" role="tablist">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              aria-selected={tab.id === active}
              className={cn("Tab", tab.id === active && "Tab--active")}
              onClick={() => setActive(tab.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActive(tab.id);
                }
              }}
            >
              <span className="Tab_inner">{tab.label}</span>
              <span className="platform" />
            </div>
          ))}
        </div>
      </div>
      <div className="shared-media">
        {active === "members" ? (
          <MembersList
            accountId={accountId}
            members={members}
            loading={membersLoading}
            onOpenMember={onOpenMember}
            tr={tr}
          />
        ) : (
          <SharedMediaPanel accountId={accountId} chatId={chatId} tab={active} tr={tr} />
        )}
      </div>
    </>
  );
}

/** Render a nested profile the user drilled into (a member / a personal channel).
 *  Reuses the same two panels — so drilling is unbounded and always consistent. */
function NestedPanel({
  accountId,
  nested,
  onClose,
  onOpenChat,
}: {
  accountId: number;
  nested: Nested;
  onClose: () => void;
  onOpenChat?: (chatId: number) => void;
}) {
  if (nested.kind === "user") {
    return (
      <TgUserProfile
        accountId={accountId}
        id={nested.id}
        name={nested.name}
        onClose={onClose}
        onOpenChat={onOpenChat}
        back
      />
    );
  }
  return (
    <TgChatInfo
      accountId={accountId}
      chatId={nested.dialog.chatId}
      dialog={nested.dialog}
      onClose={onClose}
      onOpenChat={onOpenChat}
      back
    />
  );
}

// ── panels ────────────────────────────────────────────────────────────────────

export function TgChatInfo({
  accountId,
  chatId,
  dialog,
  onClose,
  back,
  onOpenChat,
}: {
  accountId: number;
  chatId: number;
  dialog: TgDialog | null;
  onClose: () => void;
  /** Render a back arrow (this panel is nested inside another profile). */
  back?: boolean;
  /** Open a different conversation (e.g. the profile's personal channel). */
  onOpenChat?: (chatId: number) => void;
}) {
  const { t } = useTranslation();
  const tr: Tr = (k, d) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  // Admin flag gates the grant / revoke affordances on the access island.
  const { data: me } = useMe();
  const isAdmin = !!(me?.is_admin || me?.is_superadmin);

  // Nested profile drill-in (member / personal channel) + management screen.
  const [nested, setNested] = useState<Nested | null>(null);
  const [managing, setManaging] = useState(false);
  useEffect(() => {
    setNested(null);
    setManaging(false);
  }, [chatId]);

  const kind: TgDialogKind = dialog?.kind ?? "user";
  const title = dialog?.title || "?";
  const isUser = kind === "user";
  const isGroupOrChannel = !isUser;

  // Real peer detail (username/phone/bio for a DM; about/members for a chat).
  const detail: TgPeerDetail | undefined = useTgPeer(accountId, chatId).data;
  const userDetail = detail && detail.kind === "user" ? detail : undefined;
  const chatDetail = detail && detail.kind !== "user" ? detail : undefined;
  const isBot = !!userDetail?.isBot;

  // Members (groups/channels only) — feeds both the status count and the tab.
  const membersQ = useTgMembers(accountId, chatId, isGroupOrChannel);
  const members = membersQ.data?.items ?? [];
  const memberCount = chatDetail?.membersCount ?? membersQ.data?.count ?? null;

  // Notifications: reflect the live mute state, but hold an optimistic override
  // from the moment we toggle until the dialog query catches up — so the switch
  // never flickers back between the mutation settling and the list refetching,
  // while still tracking mutes made elsewhere.
  const mute = useTgMuteChat();
  const serverMuted = dialog?.muted ?? false;
  const [pendingMute, setPendingMute] = useState<boolean | null>(null);
  useEffect(() => setPendingMute(null), [chatId]);
  useEffect(() => {
    setPendingMute((p) => (p != null && p === serverMuted ? null : p));
  }, [serverMuted]);
  const muted = pendingMute ?? serverMuted;
  const toggleMute = (on: boolean) => {
    setPendingMute(!on);
    mute.mutate({ accountId, chatId, muted: !on }, { onError: () => setPendingMute(null) });
  };

  const subtitle = isUser
    ? isBot
      ? tr("kindBot", "Bot")
      : (userDetail ? presenceLine(userDetail, tr) : null) ?? tr("kindUser", "Foydalanuvchi")
    : membersText(memberCount, kind, tr);

  const badges: BadgeFlags = {
    verified: dialog?.verified,
    scam: dialog?.scam,
    fake: dialog?.fake,
    premium: dialog?.premium,
  };
  const canManage = isGroupOrChannel && !!chatDetail?.canManage;

  // Nested / management take over the whole panel (all hooks ran above).
  if (nested) {
    return (
      <NestedPanel
        accountId={accountId}
        nested={nested}
        onClose={() => setNested(null)}
        onOpenChat={onOpenChat}
      />
    );
  }
  if (managing && isGroupOrChannel) {
    return (
      <ManagementHost
        accountId={accountId}
        chatId={chatId}
        kind={kind as "group" | "channel"}
        onClose={() => setManaging(false)}
      />
    );
  }

  return (
    <PanelChrome
      title={headerTitle(kind, isBot, tr)}
      onClose={onClose}
      tr={tr}
      back={back}
      headerAction={
        canManage ? (
          <button
            type="button"
            className="Button"
            onClick={() => setManaging(true)}
            aria-label={tr("manage", "Manage")}
          >
            <Pencil className="size-5" />
          </button>
        ) : undefined
      }
    >
      <div className="profile-info">
        <ProfileInfoBlock
          accountId={accountId}
          peerId={chatId}
          name={(isUser && userDetail?.name) || title}
          group={isGroupOrChannel}
          subtitle={subtitle}
          online={isUser && !!userDetail?.online}
          badges={badges}
          emojiStatus={isUser ? userDetail?.emojiStatus : null}
          tr={tr}
        />

        <div className="ChatExtra">
          {isUser && userDetail?.personalChannel && (
            <ProfileChannelCard
              accountId={accountId}
              channel={userDetail.personalChannel}
              onOpen={() => onOpenChat?.(userDetail.personalChannel!.chatId)}
              tr={tr}
            />
          )}
          <div className="Island">
            {isUser ? (
              <>
                <UserDetailRows accountId={accountId} detail={userDetail} tr={tr} />
                <NotificationsRow enabled={!muted} onToggle={toggleMute} tr={tr} />
                <SavedMessagesRow tr={tr} />
              </>
            ) : (
              <>
                <ChatDetailRows accountId={accountId} detail={chatDetail} tr={tr} />
                <NotificationsRow enabled={!muted} onToggle={toggleMute} tr={tr} />
              </>
            )}
          </div>

          <AccessIsland accountId={accountId} chatId={chatId} isAdmin={isAdmin} tr={tr} />
        </div>
      </div>

      <ProfileTabs
        accountId={accountId}
        chatId={chatId}
        showMembers={isGroupOrChannel}
        members={members}
        membersLoading={membersQ.isLoading}
        onOpenMember={(m) => setNested({ kind: "user", id: m.id, name: m.name })}
        tr={tr}
      />
    </PanelChrome>
  );
}

/** Right-side profile panel for a clicked person/bot. `id` + `name` come from the
 *  clicked message; the peer-detail endpoint fills in the real username / phone /
 *  bio, the emoji status, an optional personal channel, and presence. */
export function TgUserProfile({
  accountId,
  id,
  name,
  onClose,
  back,
  onOpenChat,
}: {
  accountId: number;
  id: number | null;
  name: string;
  onClose: () => void;
  /** Render a back arrow (this panel is nested inside another profile). */
  back?: boolean;
  /** Open a different conversation (e.g. the profile's personal channel). */
  onOpenChat?: (chatId: number) => void;
}) {
  const { t } = useTranslation();
  const tr: Tr = (k, d) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const [nested, setNested] = useState<Nested | null>(null);
  useEffect(() => setNested(null), [id]);

  const displayName = name || tr("unknownSender", "Noma'lum");

  const detail: TgPeerDetail | undefined = useTgPeer(accountId, id).data;
  const userDetail = detail && detail.kind === "user" ? detail : undefined;
  const isBot = !!userDetail?.isBot;
  const presence = userDetail ? presenceLine(userDetail, tr) : null;
  const subtitle = isBot ? tr("kindBot", "Bot") : presence ?? tr("kindUser", "Foydalanuvchi");

  if (nested) {
    return (
      <NestedPanel
        accountId={accountId}
        nested={nested}
        onClose={() => setNested(null)}
        onOpenChat={onOpenChat}
      />
    );
  }

  return (
    <PanelChrome
      title={isBot ? tr("botInfo", "Bot Info") : tr("userInfo", "User Info")}
      onClose={onClose}
      tr={tr}
      back={back}
    >
      <div className="profile-info">
        <ProfileInfoBlock
          accountId={accountId}
          peerId={id}
          name={userDetail?.name || displayName}
          subtitle={subtitle}
          online={!!userDetail?.online}
          emojiStatus={userDetail?.emojiStatus}
          tr={tr}
        />
        <div className="ChatExtra">
          {userDetail?.personalChannel && (
            <ProfileChannelCard
              accountId={accountId}
              channel={userDetail.personalChannel}
              onOpen={() => onOpenChat?.(userDetail.personalChannel!.chatId)}
              tr={tr}
            />
          )}
          <div className="Island">
            <UserDetailRows accountId={accountId} detail={userDetail} tr={tr} />
          </div>
        </div>
      </div>

      {/* honest note: this is a TG user, not an AIBA account */}
      <p className="profile-note">
        {tr("senderHint", "Bu Telegram foydalanuvchisi, AIBA hisobi emas.")}
      </p>

      <ProfileTabs
        accountId={accountId}
        chatId={id ?? 0}
        showMembers={false}
        members={[]}
        membersLoading={false}
        onOpenMember={() => {}}
        tr={tr}
      />
    </PanelChrome>
  );
}
