// Right info/profile panel for the INTERNAL messenger — a Telegram-Web-A-styled
// port that mirrors the TG surface's `tg/chat-info.tsx` 1:1 in DOM + classes:
// a `.RightColumn` with a kind-titled `.RightHeader`, a big centred `.ProfileInfo`
// (jumbo avatar + name + subtitle), a Notifications toggle `.Island`, a
// `.ChatExtra` info card, the shared-media `.Tab` strip (Members / Media / Files /
// Links for groups; Media / Files / Links for dms) and a real MEMBERS list built
// straight from `chat.members` (no extra fetch). Styling is the shared
// `./tg/tgweb-profile.css` (scoped under `.tg-surface`, resolved by the ancestor
// the panel is mounted in — see page.tsx).
//
// Everything the old panel could do is preserved and rewired into the new layout:
//   • mute / unmute            → the Notifications switch (optimistic useMuteChat)
//   • add member (admin/owner) → an accent row atop the Members tab + user search
//   • remove member            → a hover ✕ on each removable member row
//   • member → profile         → clicking a member opens their profile sub-view
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  AtSign,
  Bell,
  Check,
  Copy,
  Image as ImageIcon,
  Link as LinkIcon,
  Loader2,
  Paperclip,
  Phone,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  chatDisplayTitle,
  chatPartner,
  useAddMembers,
  useDebounced,
  useMuteChat,
  useRemoveMember,
  useUserSearch,
  type Chat,
  type ChatMember,
} from "./api";
import { ChatAvatar } from "./avatar";
// Shared animated emoji-status renderer (from the sibling tg/ surface).
import { TgEmojiStatus } from "./tg/tg-emoji-status";
import "./tg/tgweb-profile.css";

type Tr = (k: string, d: string) => string;

const EM = "—";

// ── panel chrome ─────────────────────────────────────────────────────────────

/** The `.RightColumn` shell: a `.RightHeader` strip (leading close/back button +
 *  title) over the scrolling `.Profile` body. `onBack` swaps the ✕ for a ← (used
 *  by the member profile sub-view). */
function PanelChrome({
  title,
  onClose,
  onBack,
  tr,
  children,
}: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  tr: Tr;
  children: React.ReactNode;
}) {
  return (
    <div className="RightColumn">
      <div className="RightHeader">
        <button
          type="button"
          className="Button close-button"
          onClick={onBack ?? onClose}
          aria-label={onBack ? tr("back", "Orqaga") : tr("close", "Yopish")}
        >
          {onBack ? <ArrowLeft className="size-6" /> : <X className="size-6" />}
        </button>
        <h3 className="title">{title}</h3>
      </div>
      <div className="Profile">{children}</div>
    </div>
  );
}

/** ProfileInfo — the big centred block: jumbo avatar + name (+ "you" marker) +
 *  a status line (member count / @username / role). */
function ProfileInfoBlock({
  seed,
  name,
  image,
  group,
  subtitle,
  you,
  emojiStatus,
  tr,
}: {
  seed: string;
  name: string;
  image?: string | null;
  group?: boolean;
  subtitle: string;
  you?: boolean;
  /** Animated custom-emoji status shown after the name (defensive: rendered only
   *  when the peer/member carries one). */
  emojiStatus?: { documentId: string } | null;
  tr: Tr;
}) {
  return (
    <div className="ProfileInfo">
      <ChatAvatar seed={seed} name={name} image={image} size={120} group={group} className="Avatar" />
      <div className="info">
        <div className="fullName title">
          <span className="fullName-text">{name}</span>
          {emojiStatus?.documentId && (
            <TgEmojiStatus
              accountId={0}
              documentId={emojiStatus.documentId}
              size={22}
              className="ml-1 inline-block shrink-0 align-middle"
            />
          )}
          {you && (
            <span className="text-[var(--color-text-secondary)]" style={{ fontWeight: 400 }}>
              ({tr("you", "Siz")})
            </span>
          )}
        </div>
        <div className="status">{subtitle}</div>
      </div>
    </div>
  );
}

/** A single `.ChatExtra` info row: leading icon + value/label, plus an optional
 *  trailing action (copy). */
function InfoRow({
  icon,
  label,
  value,
  muted,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  muted?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="ListItem multiline narrow">
      <div className="ListItem-button">
        {icon}
        <div className="multiline-item">
          <span className={muted ? "title placeholder" : "title"}>{value}</span>
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
      className={copied ? "secondary-icon copied" : "secondary-icon"}
      onClick={copy}
      aria-label={tr("copy", "Nusxalash")}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </button>
  );
}

/** Username row (always real). */
function UsernameRow({ username, tr }: { username: string; tr: Tr }) {
  return (
    <InfoRow
      icon={<AtSign className="ListItem-main-icon" />}
      label={tr("username", "Foydalanuvchi nomi")}
      value={`@${username}`}
      action={<CopyButton value={`@${username}`} tr={tr} />}
    />
  );
}

/** Phone row — resolved from the user directory (members carry no phone); an
 *  honest muted "—" while it loads or when the directory has none. */
function PhoneRow({ username, tr }: { username: string; tr: Tr }) {
  const users = useUserSearch(username);
  const phone = (users.data ?? []).find((u) => u.username === username)?.phone ?? null;
  return (
    <InfoRow
      icon={<Phone className="ListItem-main-icon" />}
      label={tr("phone", "Telefon")}
      value={phone ?? EM}
      muted={!phone}
    />
  );
}

/** Notifications island — a bell row whose Switch is wired to mute/unmute.
 *  `enabled` = notifications ON = NOT muted. The row is a <label> so a click
 *  anywhere toggles. */
function NotificationsIsland({
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
    <div className="ChatExtra">
      <div className="Island">
        <div className="ListItem toggle-item">
          <label htmlFor={id} className="ListItem-button toggle-button">
            <Bell className="ListItem-main-icon" />
            <span className="toggle-label">{tr("notifications", "Bildirishnomalar")}</span>
            <Switch id={id} className="toggle-switch" checked={enabled} onCheckedChange={onToggle} />
          </label>
        </div>
      </div>
    </div>
  );
}

// ── members tab (groups) ──────────────────────────────────────────────────────

const roleWord = (role: string, tr: Tr): string =>
  role === "owner" ? tr("roleOwner", "egasi") : role === "admin" ? tr("roleAdmin", "admin") : "";

/** The Members tab body: an "add member" accent row (owner/admin only, opening a
 *  user-search popover) followed by the real member rows (avatar + name + role
 *  badge + a hover ✕ to remove). Clicking a row opens that member's profile. */
function MembersTab({
  chat,
  me,
  canManage,
  onView,
  tr,
}: {
  chat: Chat;
  me: string | null | undefined;
  canManage: boolean;
  onView: (m: ChatMember) => void;
  tr: Tr;
}) {
  const addMembers = useAddMembers();
  const removeMember = useRemoveMember();
  const [q, setQ] = useState("");
  const users = useUserSearch(useDebounced(q, 300));
  const memberSet = new Set(chat.members.map((m) => m.username));
  const candidates = (users.data ?? []).filter((u) => !memberSet.has(u.username));

  return (
    <div className="members-list">
      {canManage && (
        <Popover onOpenChange={(o) => !o && setQ("")}>
          <PopoverTrigger asChild>
            <button type="button" className="member-row w-full text-left">
              <span
                className="member-avatar grid place-items-center text-white"
                style={{ background: "var(--color-primary)" }}
              >
                <UserPlus className="size-5" />
              </span>
              <div className="member-info">
                <span className="member-name" style={{ color: "var(--color-primary)" }}>
                  {tr("addMember", "Qo'shish")}
                </span>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-72 p-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr("searchUsers", "Foydalanuvchi qidirish")}
              className="mb-1.5 h-9 w-full rounded-full bg-muted px-3.5 text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
            <div className="max-h-64 overflow-y-auto">
              {users.isLoading && (
                <div className="flex justify-center py-3">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {candidates.map((u) => (
                <button
                  key={u.username}
                  type="button"
                  disabled={addMembers.isPending}
                  onClick={() => addMembers.mutate({ chatId: chat.id, usernames: [u.username] })}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                >
                  <ChatAvatar seed={u.username} name={u.name} size={32} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{u.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
                  </span>
                </button>
              ))}
              {q.trim() && !users.isLoading && candidates.length === 0 && (
                <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {tr("noUsers", "Topilmadi")}
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      )}

      {chat.members.map((m) => (
        <div
          key={m.username}
          role="button"
          tabIndex={0}
          onClick={() => onView(m)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onView(m);
            }
          }}
          className="member-row group"
        >
          <ChatAvatar seed={m.username} name={m.name} src={m.avatar} size={44} className="member-avatar" />
          <div className="member-info">
            <span className="member-name">
              {m.name}
              {m.emojiStatus?.documentId && (
                <TgEmojiStatus
                  accountId={0}
                  documentId={m.emojiStatus.documentId}
                  size={18}
                  className="ml-1 inline-block shrink-0 align-middle"
                />
              )}
              {m.username === me && (
                <span className="ml-1 text-[var(--color-text-secondary)]" style={{ fontWeight: 400 }}>
                  ({tr("you", "Siz")})
                </span>
              )}
            </span>
            <span className="member-status">@{m.username}</span>
          </div>
          {m.role === "owner" ? (
            <span className="member-badge owner">{roleWord("owner", tr)}</span>
          ) : m.role === "admin" ? (
            <span className="member-badge admin">{roleWord("admin", tr)}</span>
          ) : null}
          {canManage && m.username !== me && m.role !== "owner" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeMember.mutate({ chatId: chat.id, username: m.username });
              }}
              className="ml-1 grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
              aria-label={tr("removeMember", "Chiqarish")}
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── shared-media tabs ─────────────────────────────────────────────────────────

type TabId = "members" | "media" | "files" | "links";
type MediaTabId = Exclude<TabId, "members">;

/** Honest empty state for a media tab (the internal chat has no media index). */
function MediaEmpty({ id, tr }: { id: MediaTabId; tr: Tr }) {
  const map: Record<MediaTabId, { icon: React.ReactNode; text: string }> = {
    media: { icon: <ImageIcon className="size-9" />, text: tr("mediaEmpty", "Media yo'q") },
    files: { icon: <Paperclip className="size-9" />, text: tr("filesEmpty", "Fayllar yo'q") },
    links: { icon: <LinkIcon className="size-9" />, text: tr("linksEmpty", "Havolalar yo'q") },
  };
  const e = map[id];
  return (
    <div className="content emptyList">
      <span className="empty-icon">{e.icon}</span>
      <p className="empty-text">{e.text}</p>
    </div>
  );
}

/** The Members / Media / Files / Links strip (Members only + active by default for
 *  groups) with the `.platform` underline, and the active tab's body. */
function ProfileTabs({
  showMembers,
  members,
  tr,
}: {
  showMembers: boolean;
  /** The Members tab body (groups only); null for dms. */
  members: React.ReactNode;
  tr: Tr;
}) {
  const [active, setActive] = useState<TabId>(showMembers ? "members" : "media");
  const tabs: { id: TabId; label: string }[] = [
    ...(showMembers ? [{ id: "members" as const, label: tr("membersTitle", "A'zolar") }] : []),
    { id: "media", label: tr("tabMedia", "Media") },
    { id: "files", label: tr("tabFiles", "Fayllar") },
    { id: "links", label: tr("tabLinks", "Havolalar") },
  ];

  return (
    <>
      <div className="shared-media-tabs">
        <div className="TabList" role="tablist">
          {tabs.map((t) => (
            <div
              key={t.id}
              role="tab"
              tabIndex={0}
              aria-selected={t.id === active}
              className={t.id === active ? "Tab Tab--active" : "Tab"}
              onClick={() => setActive(t.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setActive(t.id);
                }
              }}
            >
              <span className="Tab_inner">{t.label}</span>
              <span className="platform" />
            </div>
          ))}
        </div>
      </div>
      <div className="shared-media">
        {active === "members" ? members : <MediaEmpty id={active} tr={tr} />}
      </div>
    </>
  );
}

// ── panel ─────────────────────────────────────────────────────────────────────

export function InfoPanel({
  chat,
  me,
  onClose,
}: {
  chat: Chat;
  me: string | null | undefined;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tr: Tr = (k, d) => t(`modules.messenger.${k}`, { defaultValue: d });

  const mute = useMuteChat();

  const isGroup = chat.kind === "group";
  const title = chatDisplayTitle(chat, me);
  const partner = chatPartner(chat, me);
  const myRole = chat.members.find((m) => m.username === me)?.role ?? "member";
  const canManage = myRole === "owner" || myRole === "admin";

  // Single-member profile sub-view (tap a group member → their profile).
  const [viewUser, setViewUser] = useState<ChatMember | null>(null);

  // ── member profile sub-view ─────────────────────────────────────────────────
  if (viewUser) {
    const isMe = viewUser.username === me;
    const role = roleWord(viewUser.role, tr);
    return (
      <PanelChrome
        title={tr("userInfo", "Foydalanuvchi")}
        onClose={onClose}
        onBack={() => setViewUser(null)}
        tr={tr}
      >
        <div className="profile-info">
          <ProfileInfoBlock
            seed={viewUser.username}
            name={viewUser.name}
            image={viewUser.avatar}
            subtitle={role || `@${viewUser.username}`}
            you={isMe}
            emojiStatus={viewUser.emojiStatus}
            tr={tr}
          />
          <div className="ChatExtra">
            <div className="Island">
              <UsernameRow username={viewUser.username} tr={tr} />
              <PhoneRow username={viewUser.username} tr={tr} />
            </div>
          </div>
        </div>

        <ProfileTabs showMembers={false} members={null} tr={tr} />
      </PanelChrome>
    );
  }

  // ── chat info (group / dm) ───────────────────────────────────────────────────
  const subtitle = isGroup
    ? `${chat.members.length} ${tr("members", "a'zo")}`
    : partner
      ? `@${partner.username}`
      : "";

  return (
    <PanelChrome
      title={isGroup ? tr("groupInfo", "Guruh ma'lumoti") : tr("userInfo", "Foydalanuvchi")}
      onClose={onClose}
      tr={tr}
    >
      <div className="profile-info">
        <ProfileInfoBlock
          seed={isGroup ? chat.id : (partner?.username ?? chat.id)}
          name={title}
          image={isGroup ? chat.avatar : (chat.avatar ?? partner?.avatar)}
          group={isGroup}
          subtitle={subtitle}
          emojiStatus={isGroup ? null : partner?.emojiStatus}
          tr={tr}
        />

        <NotificationsIsland
          enabled={!chat.muted}
          onToggle={(on) => mute.mutate({ chatId: chat.id, muted: !on })}
          tr={tr}
        />

        <div className="ChatExtra">
          <div className="Island">
            {isGroup ? (
              <InfoRow
                icon={<Users className="ListItem-main-icon" />}
                label={tr("membersTitle", "A'zolar")}
                value={<span className="tabular-nums">{chat.members.length}</span>}
              />
            ) : partner ? (
              <>
                <UsernameRow username={partner.username} tr={tr} />
                <PhoneRow username={partner.username} tr={tr} />
              </>
            ) : null}
          </div>
        </div>
      </div>

      <ProfileTabs
        showMembers={isGroup}
        members={
          isGroup ? (
            <MembersTab chat={chat} me={me} canManage={canManage} onView={setViewUser} tr={tr} />
          ) : null
        }
        tr={tr}
      />
    </PanelChrome>
  );
}
