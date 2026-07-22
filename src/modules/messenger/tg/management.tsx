// Telegram bridge — RIGHT column GROUP/CHANNEL MANAGEMENT panel, a fidelity port
// of Telegram Web A's `right/management/*` (Management router + ManageGroup /
// ManageChannel / ManageChatAdministrators / ManageGroupAdminRights /
// ManageGroupPermissions / ManageInvites / ManageInvite / ManageJoinRequests /
// ManageChatPrivacyType / ManageReactions). The DOM + class names mirror the
// reference (`.RightColumn` aside, `.RightHeader` strip, `.Management` scroll
// body with `.Island` cards, `.ListItem` rows, `.Checkbox` / `.RadioGroup`
// primitives and a `.FloatingActionButton` save button). The shared right-column
// chrome comes from `tgweb-profile.css`; management-only chrome from
// `tgweb-management.css`.
//
// One entry: `TgManagement({ accountId, chatId, kind, onClose })` — a self-routing
// panel. A back arrow walks a screen stack (main → administrators → admin-rights,
// permissions, invite-links → link-detail, join-requests, edit-info, reactions,
// chat-type); the top-level close fires `onClose`.
//
// Fidelity, honestly: the READ views are fully built (admins with a rights
// summary, permissions checkboxes reflecting the defaults, invite-link list,
// join-request list, edit-info form). Every reader is DEFENSIVE — the backend
// management routes are being built in parallel, so until they answer the panel
// shows honest empty/loading state. WRITE actions POST optimistically and, when
// the endpoint isn't there yet, fall back to a "coming soon" toast (the working
// copy stays) — see `management-api.ts`.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  Ban,
  Check,
  ChevronRight,
  Copy,
  Heart,
  Info,
  Link as LinkIcon,
  Lock,
  Pencil,
  Shield,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useToastStore } from "@/shared/notifications/store";
import { TgAvatar } from "./tg-avatar";
import { useTgDialogs, useTgPeer, type TgDialog, type TgPeerDetail } from "./api";
import {
  ADMIN_RIGHT_KEYS,
  PERMISSION_KEYS,
  isTgNotImplemented,
  useAnswerAllTgJoinRequests,
  useAnswerTgJoinRequest,
  useCreateTgInvite,
  useDismissTgAdmin,
  useRevokeTgInvite,
  useSaveTgChatInfo,
  useSetTgAdminRights,
  useSetTgChatType,
  useSetTgPermissions,
  useSetTgReactions,
  useTgAdmins,
  useTgInvites,
  useTgJoinRequests,
  useTgPermissions,
  type TgAdmin,
  type TgAdminRights,
  type TgDefaultRights,
  type TgInvite,
  type TgJoinRequest,
} from "./management-api";
import "./tgweb-profile.css";
import "./tgweb-management.css";

type Tr = (k: string, d: string) => string;
type Kind = "group" | "channel";
type TgChatDetail = Extract<TgPeerDetail, { kind: "group" | "channel" }>;

const EM = "—";

// ── screen stack ──────────────────────────────────────────────────────────────

type Screen =
  | { name: "main" }
  | { name: "editInfo" }
  | { name: "administrators" }
  | { name: "adminRights"; admin: TgAdmin }
  | { name: "permissions" }
  | { name: "inviteLinks" }
  | { name: "linkDetail"; invite: TgInvite }
  | { name: "joinRequests" }
  | { name: "reactions" }
  | { name: "chatType" };

type Nav = {
  push: (s: Screen) => void;
  back: () => void;
};

/** Toast helpers shared by every write flow. */
type Toasts = {
  /** The endpoint isn't wired yet — surface a friendly "coming soon". */
  comingSoon: () => void;
  saved: () => void;
  /** A real failure (not a missing endpoint). */
  failed: () => void;
};

/** Everything a sub-screen needs, threaded once so the screens stay pure. */
type Ctx = {
  accountId: number;
  chatId: number;
  kind: Kind;
  tr: Tr;
  nav: Nav;
  toasts: Toasts;
};

function pushMgmtToast(title: string, body: string): void {
  useToastStore.getState().push({
    id: `tg-mgmt-${Date.now()}`,
    title,
    body,
    icon: "telegram",
    link: "",
    module: "telegram",
    createdAt: new Date().toISOString(),
    isRead: false,
  });
}

// ── small formatting helpers ───────────────────────────────────────────────────

function fmtInt(n: number | null | undefined): string {
  if (n == null) return EM;
  return n.toLocaleString();
}

/** Unix seconds → short local date (DD.MM.YY), or HH:MM when it's today. */
function fmtUnix(sec: number | null | undefined): string {
  if (!sec) return "";
  const d = new Date(sec * 1000);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ── reusable primitives (Checkbox / Radio / inputs / FAB / section labels) ──────

function Checkbox({
  checked,
  label,
  subLabel,
  disabled,
  onChange,
}: {
  checked: boolean;
  label: React.ReactNode;
  subLabel?: React.ReactNode;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={cn("Checkbox", disabled && "disabled")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="Checkbox-box">
        <Check className="Checkbox-check" />
      </span>
      <span className="Checkbox-content">
        <span className="Checkbox-label">{label}</span>
        {subLabel != null && <span className="Checkbox-subLabel">{subLabel}</span>}
      </span>
    </label>
  );
}

type RadioOption<T extends string> = { value: T; label: string; subLabel?: string; disabled?: boolean };

function RadioGroup<T extends string>({
  name,
  options,
  selected,
  onChange,
}: {
  name: string;
  options: RadioOption<T>[];
  selected: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="RadioGroup" role="radiogroup">
      {options.map((o) => (
        <label key={o.value} className={cn("Radio", o.disabled && "disabled")}>
          <input
            type="radio"
            name={name}
            checked={selected === o.value}
            disabled={o.disabled}
            onChange={() => onChange(o.value)}
          />
          <span className="Radio-circle" />
          <span className="Radio-content">
            <span className="Radio-label">{o.label}</span>
            {o.subLabel && <span className="Radio-subLabel">{o.subLabel}</span>}
          </span>
        </label>
      ))}
    </div>
  );
}

function InputField({
  id,
  label,
  value,
  onChange,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  return (
    <div className={cn("input-group", value && "touched")}>
      <input
        id={id}
        className="form-control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder=" "
        dir="auto"
      />
      <label htmlFor={id}>{label}</label>
    </div>
  );
}

function TextAreaField({
  id,
  label,
  value,
  onChange,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
}) {
  const remaining = maxLength != null ? maxLength - value.length : undefined;
  return (
    <div className={cn("input-group", value && "touched")}>
      <textarea
        id={id}
        className="form-control"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        placeholder=" "
        rows={2}
        dir="auto"
      />
      <label htmlFor={id}>{label}</label>
      {remaining != null && <span className="max-length-indicator">{remaining}</span>}
    </div>
  );
}

function Fab({
  shown,
  disabled,
  onClick,
  label,
}: {
  shown: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className={cn("FloatingActionButton", shown && "shown")}
      disabled={disabled || !shown}
      onClick={onClick}
      aria-label={label}
    >
      <Check className="size-6" />
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="IslandTitle">{children}</h4>;
}

function SectionDescription({ children }: { children: React.ReactNode }) {
  return <p className="IslandDescription">{children}</p>;
}

/** A navigation `.ListItem` row: leading icon + title (+ optional subtitle) + a
 *  trailing count/chevron. Mirrors the reference `ListItem multiline`. */
function NavRow({
  icon,
  title,
  subtitle,
  aside,
  destructive,
  primary,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
  destructive?: boolean;
  primary?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "ListItem",
        onClick && "has-ripple",
        subtitle != null ? "multiline" : "narrow",
        destructive && "destructive",
        primary && "primary",
      )}
    >
      <button type="button" className="ListItem-button" onClick={onClick} disabled={!onClick}>
        <span className="ListItem-main-icon">{icon}</span>
        {subtitle != null ? (
          <div className="multiline-item">
            <span className="title">{title}</span>
            <span className="subtitle">{subtitle}</span>
          </div>
        ) : (
          <span className="single-line">{title}</span>
        )}
        {aside != null ? (
          <span className="row-aside">{aside}</span>
        ) : onClick ? (
          <ChevronRight className="row-chevron size-5" />
        ) : null}
      </button>
    </div>
  );
}

/** Copy-to-clipboard button (flips to a check for ~1.2s). */
function CopyInline({ value, tr }: { value: string; tr: Tr }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn("secondary-icon", copied && "copied")}
      aria-label={tr("copy", "Nusxalash")}
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
    </button>
  );
}

function Spinner() {
  return <span className="management-spinner" role="status" aria-label="loading" />;
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="management-empty">
      <span className="empty-icon">{icon}</span>
      <p className="empty-text">{text}</p>
    </div>
  );
}

// ── label maps ──────────────────────────────────────────────────────────────

/** Admin-right → [i18n key suffix, Uzbek default], and whether it shows for a
 *  given chat kind (mirrors ManageGroupAdminRights' conditionals). */
const ADMIN_RIGHT_LABEL: Record<keyof TgAdminRights, [string, string]> = {
  changeInfo: ["rightChangeInfo", "Ma'lumotni o'zgartirish"],
  postMessages: ["rightPostMessages", "Xabar joylash"],
  editMessages: ["rightEditMessages", "Xabarlarni tahrirlash"],
  deleteMessages: ["rightDeleteMessages", "Xabarlarni o'chirish"],
  banUsers: ["rightBanUsers", "Foydalanuvchilarni cheklash"],
  inviteUsers: ["rightInviteUsers", "Foydalanuvchilarni taklif qilish"],
  pinMessages: ["rightPinMessages", "Xabarlarni qadash"],
  manageCall: ["rightManageCall", "Video suhbatlarni boshqarish"],
  addAdmins: ["rightAddAdmins", "Yangi adminlar qo'shish"],
  anonymous: ["rightAnonymous", "Anonim yozish"],
};

function adminRightVisible(key: keyof TgAdminRights, kind: Kind): boolean {
  if (kind === "channel") return key !== "pinMessages" && key !== "anonymous";
  return key !== "postMessages" && key !== "editMessages";
}

const PERMISSION_LABEL: Record<keyof TgDefaultRights, [string, string]> = {
  sendMessages: ["permSendMessages", "Xabar yuborish"],
  sendMedia: ["permSendMedia", "Media yuborish"],
  sendStickers: ["permSendStickers", "Stiker va GIF yuborish"],
  sendPolls: ["permSendPolls", "So'rovnoma yuborish"],
  embedLinks: ["permEmbedLinks", "Havola qo'shish"],
  inviteUsers: ["permInviteUsers", "Foydalanuvchilarni taklif qilish"],
  pinMessages: ["permPinMessages", "Xabarlarni qadash"],
  changeInfo: ["permChangeInfo", "Guruh ma'lumotini o'zgartirish"],
};

// ── header titles ─────────────────────────────────────────────────────────────

function screenTitle(screen: Screen, kind: Kind, tr: Tr): string {
  switch (screen.name) {
    case "main":
      return kind === "channel" ? tr("manageChannel", "Kanalni boshqarish") : tr("manageGroup", "Guruhni boshqarish");
    case "editInfo":
      return tr("editInfo", "Ma'lumotni tahrirlash");
    case "administrators":
      return tr("administrators", "Administratorlar");
    case "adminRights":
      return tr("editAdmin", "Administratorni tahrirlash");
    case "permissions":
      return tr("permissions", "Ruxsatlar");
    case "inviteLinks":
      return tr("inviteLinks", "Taklif havolalari");
    case "linkDetail":
      return tr("inviteLink", "Taklif havolasi");
    case "joinRequests":
      return tr("memberRequests", "A'zolik so'rovlari");
    case "reactions":
      return tr("reactions", "Reaksiyalar");
    case "chatType":
      return kind === "channel" ? tr("channelType", "Kanal turi") : tr("groupType", "Guruh turi");
  }
}

// ── main overview (ManageGroup / ManageChannel) ─────────────────────────────────

function MainScreen({
  ctx,
  detail,
  title,
  adminCount,
  inviteCount,
  requestCount,
}: {
  ctx: Ctx;
  detail: TgChatDetail | undefined;
  title: string;
  adminCount: number | null;
  inviteCount: number | null;
  requestCount: number | null;
}) {
  const { accountId, chatId, kind, tr, nav } = ctx;
  const isChannel = kind === "channel";
  const memberCount = detail?.membersCount ?? null;
  const membersWord = isChannel ? tr("subscribers", "Obunachilar") : tr("members", "A'zolar");

  return (
    <div className="Management">
      <div className="panel-content custom-scroll">
        {/* centred avatar + name + member count */}
        <div className="ProfileInfo compact">
          <TgAvatar accountId={accountId} peerId={chatId} name={title} size={96} group className="Avatar" />
          <div className="info">
            <div className="fullName title">
              <span className="fullName-text">{title}</span>
            </div>
            <div className="status">
              {memberCount != null
                ? `${fmtInt(memberCount)} ${isChannel ? tr("subscribersWord", "obunachi") : tr("membersWord", "a'zo")}`
                : isChannel
                  ? tr("kindChannel", "Kanal")
                  : tr("kindGroup", "Guruh")}
            </div>
          </div>
        </div>

        <div className="Island">
          <NavRow
            icon={<Pencil className="size-6" />}
            title={tr("editInfo", "Ma'lumotni tahrirlash")}
            subtitle={detail?.about ? detail.about : tr("editInfoHint", "Nom va tavsifni o'zgartirish")}
            onClick={() => nav.push({ name: "editInfo" })}
          />
          <NavRow
            icon={<Lock className="size-6" />}
            title={isChannel ? tr("channelType", "Kanal turi") : tr("groupType", "Guruh turi")}
            subtitle={detail?.about != null || memberCount != null ? tr("private", "Yopiq") : EM}
            onClick={() => nav.push({ name: "chatType" })}
          />
          {!isChannel && (
            <NavRow
              icon={<ShieldCheck className="size-6" />}
              title={tr("permissions", "Ruxsatlar")}
              subtitle={tr("permissionsHint", "Standart a'zo ruxsatlari")}
              onClick={() => nav.push({ name: "permissions" })}
            />
          )}
          <NavRow
            icon={<Heart className="size-6" />}
            title={tr("reactions", "Reaksiyalar")}
            subtitle={tr("reactionsHint", "Qaysi reaksiyalarga ruxsat berilgan")}
            onClick={() => nav.push({ name: "reactions" })}
          />
        </div>

        <div className="Island">
          <NavRow
            icon={<Shield className="size-6" />}
            title={tr("administrators", "Administratorlar")}
            subtitle={adminCount != null ? fmtInt(adminCount) : tr("loading", "Yuklanmoqda…")}
            onClick={() => nav.push({ name: "administrators" })}
          />
          <NavRow
            icon={<LinkIcon className="size-6" />}
            title={tr("inviteLinks", "Taklif havolalari")}
            subtitle={inviteCount != null ? fmtInt(inviteCount) : tr("loading", "Yuklanmoqda…")}
            onClick={() => nav.push({ name: "inviteLinks" })}
          />
          <NavRow
            icon={<UserPlus className="size-6" />}
            title={tr("memberRequests", "A'zolik so'rovlari")}
            subtitle={requestCount != null ? fmtInt(requestCount) : tr("loading", "Yuklanmoqda…")}
            onClick={() => nav.push({ name: "joinRequests" })}
          />
        </div>

        <div className="Island">
          <NavRow
            icon={<Users className="size-6" />}
            title={membersWord}
            subtitle={fmtInt(memberCount)}
          />
        </div>
      </div>
    </div>
  );
}

// ── edit info form (ManageGroup / ManageChannel inline form) ────────────────────

const INFO_MAX_ABOUT = 255;

function EditInfoScreen({ ctx, initialTitle, initialAbout }: { ctx: Ctx; initialTitle: string; initialAbout: string }) {
  const { accountId, chatId, kind, tr, nav, toasts } = ctx;
  const [title, setTitle] = useState(initialTitle);
  const [about, setAbout] = useState(initialAbout);
  const [touched, setTouched] = useState(false);
  const save = useSaveTgChatInfo();

  // Seed once the async initial values arrive, but never clobber the user's edits.
  useEffect(() => {
    if (!touched) {
      setTitle(initialTitle);
      setAbout(initialAbout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTitle, initialAbout]);

  const dirty = touched && title.trim().length > 0;
  const submit = () => {
    save.mutate(
      { accountId, chatId, title: title.trim(), about: about.trim() },
      {
        onSuccess: () => {
          toasts.saved();
          nav.back();
        },
        onError: (err) => (isTgNotImplemented(err) ? toasts.comingSoon() : toasts.failed()),
      },
    );
  };

  return (
    <div className="Management">
      <div className="panel-content custom-scroll">
        <div className="ProfileInfo compact">
          <TgAvatar accountId={accountId} peerId={chatId} name={title || "?"} size={96} group className="Avatar" />
        </div>
        <div className="Island">
          <div className="settings-edit">
            <InputField
              id="tg-mgmt-title"
              label={kind === "channel" ? tr("channelName", "Kanal nomi") : tr("groupName", "Guruh nomi")}
              value={title}
              onChange={(v) => {
                setTitle(v);
                setTouched(true);
              }}
              maxLength={128}
            />
            <TextAreaField
              id="tg-mgmt-about"
              label={tr("description", "Tavsif")}
              value={about}
              onChange={(v) => {
                setAbout(v);
                setTouched(true);
              }}
              maxLength={INFO_MAX_ABOUT}
            />
          </div>
        </div>
        <SectionDescription>
          {tr("editInfoDesc", "Guruh nomi va tavsifi barcha a'zolarga ko'rinadi.")}
        </SectionDescription>
      </div>
      <Fab shown={dirty} disabled={save.isPending} onClick={submit} label={tr("save", "Saqlash")} />
    </div>
  );
}

// ── administrators (ManageChatAdministrators) ───────────────────────────────────

/** Compact "can do" summary for an admin row (first few granted rights). */
function adminSummary(admin: TgAdmin, kind: Kind, tr: Tr): string {
  if (admin.isOwner) return tr("owner", "Egasi");
  const granted = ADMIN_RIGHT_KEYS.filter((k) => adminRightVisible(k, kind) && admin.rights[k]);
  if (granted.length === 0) return tr("admin", "Administrator");
  const labels = granted.slice(0, 3).map((k) => tr(...ADMIN_RIGHT_LABEL[k]));
  const more = granted.length - labels.length;
  return more > 0 ? `${labels.join(", ")} +${more}` : labels.join(", ");
}

function AdministratorsScreen({
  ctx,
  admins,
  loading,
}: {
  ctx: Ctx;
  admins: TgAdmin[];
  loading: boolean;
}) {
  const { accountId, kind, tr, nav } = ctx;
  return (
    <div className="Management">
      <div className="panel-content custom-scroll">
        <SectionDescription>
          {kind === "channel"
            ? tr("adminsDescChannel", "Kanalni boshqarishda yordam beradigan administratorlarni tayinlang.")
            : tr("adminsDescGroup", "Guruhni boshqarishda yordam beradigan administratorlarni tayinlang.")}
        </SectionDescription>
        {loading ? (
          <Spinner />
        ) : admins.length === 0 ? (
          <EmptyState icon={<Shield className="size-9" />} text={tr("adminsEmpty", "Administratorlar yo'q")} />
        ) : (
          <div className="Island">
            <div className="members-list">
              {admins.map((admin) => (
                <div
                  key={admin.id}
                  className="member-row"
                  onClick={() => nav.push({ name: "adminRights", admin })}
                >
                  <TgAvatar accountId={accountId} peerId={admin.id} name={admin.name} size={44} className="member-avatar" />
                  <div className="member-info">
                    <span className="member-name">{admin.name}</span>
                    <span className={cn("member-status", admin.isOwner && "online")}>
                      {adminSummary(admin, kind, tr)}
                    </span>
                  </div>
                  {admin.rank ? <span className="admin-rank">{admin.rank}</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── admin rights (ManageGroupAdminRights) ───────────────────────────────────────

const RANK_MAX = 16;

function AdminRightsScreen({ ctx, admin }: { ctx: Ctx; admin: TgAdmin }) {
  const { accountId, chatId, kind, tr, nav, toasts } = ctx;
  const [rights, setRights] = useState<TgAdminRights>(admin.rights);
  const [rank, setRank] = useState(admin.rank ?? "");
  const [touched, setTouched] = useState(false);
  const save = useSetTgAdminRights();
  const dismiss = useDismissTgAdmin();

  const toggle = (key: keyof TgAdminRights) => {
    setRights((p) => ({ ...p, [key]: !p[key] }));
    setTouched(true);
  };

  const submit = () => {
    save.mutate(
      { accountId, chatId, userId: admin.id, rights, rank: rank.trim() || null },
      {
        onSuccess: () => {
          toasts.saved();
          nav.back();
        },
        onError: (err) => (isTgNotImplemented(err) ? toasts.comingSoon() : toasts.failed()),
      },
    );
  };

  const doDismiss = () => {
    dismiss.mutate(
      { accountId, chatId, userId: admin.id },
      {
        onSuccess: () => {
          toasts.saved();
          nav.back();
        },
        onError: (err) => (isTgNotImplemented(err) ? toasts.comingSoon() : toasts.failed()),
      },
    );
  };

  const dirty = touched && !admin.isOwner;

  return (
    <div className="Management">
      <div className="panel-content custom-scroll">
        <div className="Island">
          <div className="member-row" style={{ cursor: "default" }}>
            <TgAvatar accountId={accountId} peerId={admin.id} name={admin.name} size={44} className="member-avatar" />
            <div className="member-info">
              <span className="member-name">{admin.name}</span>
              <span className="member-status">
                {admin.isOwner ? tr("owner", "Egasi") : tr("admin", "Administrator")}
              </span>
            </div>
          </div>
        </div>

        <SectionTitle>{tr("whatCanAdminDo", "Administrator nimalarni qila oladi")}</SectionTitle>
        <div className="Island">
          {ADMIN_RIGHT_KEYS.filter((k) => adminRightVisible(k, kind)).map((key) => (
            <Checkbox
              key={key}
              checked={Boolean(rights[key])}
              label={tr(...ADMIN_RIGHT_LABEL[key])}
              disabled={admin.isOwner}
              onChange={() => toggle(key)}
            />
          ))}
        </div>

        {kind === "group" && !admin.isOwner && (
          <>
            <SectionTitle>{tr("customTitle", "Maxsus unvon")}</SectionTitle>
            <div className="Island">
              <InputField
                id="tg-mgmt-rank"
                label={tr("customTitle", "Maxsus unvon")}
                value={rank}
                onChange={(v) => {
                  setRank(v);
                  setTouched(true);
                }}
                maxLength={RANK_MAX}
              />
            </div>
            <SectionDescription>
              {tr("customTitleHint", "Bo'sh qoldirilsa \"Administrator\" ko'rinadi.")}
            </SectionDescription>
          </>
        )}

        {!admin.isOwner && (
          <div className="Island">
            <NavRow
              icon={<Ban className="size-6" />}
              title={tr("dismissAdmin", "Administratorlikdan chetlatish")}
              destructive
              onClick={doDismiss}
            />
          </div>
        )}
      </div>
      <Fab shown={dirty} disabled={save.isPending} onClick={submit} label={tr("save", "Saqlash")} />
    </div>
  );
}

// ── permissions (ManageGroupPermissions) ────────────────────────────────────────

function PermissionsScreen({
  ctx,
  defaults,
  loading,
}: {
  ctx: Ctx;
  defaults: TgDefaultRights | null;
  loading: boolean;
}) {
  const { accountId, chatId, tr, nav, toasts } = ctx;
  // Telegram's default is "everything allowed"; a missing key reads as allowed.
  const seed = useMemo<TgDefaultRights>(() => {
    const out: TgDefaultRights = {};
    for (const k of PERMISSION_KEYS) out[k] = defaults?.[k] ?? true;
    return out;
  }, [defaults]);
  const [rights, setRights] = useState<TgDefaultRights>(seed);
  const [touched, setTouched] = useState(false);
  const save = useSetTgPermissions();

  useEffect(() => {
    if (!touched) setRights(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  const toggle = (key: keyof TgDefaultRights) => {
    setRights((p) => ({ ...p, [key]: !p[key] }));
    setTouched(true);
  };

  const submit = () => {
    save.mutate(
      { accountId, chatId, defaultRights: rights },
      {
        onSuccess: () => {
          toasts.saved();
          nav.back();
        },
        onError: (err) => (isTgNotImplemented(err) ? toasts.comingSoon() : toasts.failed()),
      },
    );
  };

  return (
    <div className="Management">
      <div className="panel-content custom-scroll">
        <SectionTitle>{tr("whatMembersCanDo", "A'zolar nimalarni qila oladi")}</SectionTitle>
        {loading ? (
          <Spinner />
        ) : (
          <div className="Island">
            {PERMISSION_KEYS.map((key) => (
              <Checkbox
                key={key}
                checked={Boolean(rights[key])}
                label={tr(...PERMISSION_LABEL[key])}
                onChange={() => toggle(key)}
              />
            ))}
          </div>
        )}
        <SectionDescription>
          {tr("permissionsDesc", "Bu ruxsatlar barcha a'zolarga standart sifatida qo'llanadi.")}
        </SectionDescription>
      </div>
      <Fab shown={touched} disabled={save.isPending} onClick={submit} label={tr("save", "Saqlash")} />
    </div>
  );
}

// ── invite links (ManageInvites) ────────────────────────────────────────────────

function inviteIconClass(inv: TgInvite): string {
  if (inv.revoked) return "link-status-icon-gray";
  if (inv.usageLimit && inv.usage < inv.usageLimit) return "link-status-icon-green";
  if (inv.expireDate && inv.expireDate * 1000 <= Date.now()) return "link-status-icon-red";
  return "link-status-icon-blue";
}

function inviteUsageText(inv: TgInvite, tr: Tr): string {
  const parts: string[] = [];
  if (!inv.revoked && inv.usageLimit && inv.usage < inv.usageLimit) {
    parts.push(tr("canJoin", "{{n}} kishi qo'shila oladi").replace("{{n}}", String(inv.usageLimit - inv.usage)));
  } else if (inv.usage) {
    parts.push(tr("peopleJoined", "{{n}} kishi qo'shildi").replace("{{n}}", String(inv.usage)));
  } else {
    parts.push(tr("noOneJoined", "Hech kim qo'shilmagan"));
  }
  if (inv.revoked) parts.push(tr("revoked", "Bekor qilingan"));
  else if (inv.expireDate) {
    parts.push(
      inv.expireDate * 1000 <= Date.now()
        ? tr("expired", "Muddati tugagan")
        : tr("expiresOn", "Amal qiladi: {{d}}").replace("{{d}}", fmtUnix(inv.expireDate)),
    );
  }
  return parts.join(" • ");
}

function InviteLinksScreen({
  ctx,
  invites,
  loading,
}: {
  ctx: Ctx;
  invites: TgInvite[];
  loading: boolean;
}) {
  const { accountId, chatId, tr, nav, toasts } = ctx;
  const create = useCreateTgInvite();

  const primary = invites.find((i) => i.isPermanent && !i.revoked);
  const active = invites.filter((i) => !i.revoked && i !== primary);
  const revoked = invites.filter((i) => i.revoked);

  const createNew = () => {
    create.mutate(
      { accountId, chatId },
      {
        onSuccess: () => toasts.saved(),
        onError: (err) => (isTgNotImplemented(err) ? toasts.comingSoon() : toasts.failed()),
      },
    );
  };

  return (
    <div className="Management">
      <div className="panel-content custom-scroll">
        <LinkIcon className="section-icon size-12" />
        <SectionDescription>
          {tr("inviteLinksDesc", "Bu havolalar orqali istalgan foydalanuvchi guruhga qo'shila oladi.")}
        </SectionDescription>

        {primary && (
          <>
            <SectionTitle>{tr("permanentLink", "Doimiy havola")}</SectionTitle>
            <div className="Island">
              <div className="invite-primary">
                <span className="invite-link-text">{primary.link}</span>
                <CopyInline value={primary.link} tr={tr} />
              </div>
            </div>
          </>
        )}

        <div className="Island">
          <NavRow
            icon={<LinkIcon className="size-6" />}
            title={tr("createNewLink", "Yangi havola yaratish")}
            primary
            onClick={createNew}
          />
          {loading ? (
            <Spinner />
          ) : active.length === 0 && !primary ? (
            <EmptyState icon={<LinkIcon className="size-9" />} text={tr("noLinks", "Havolalar topilmadi")} />
          ) : (
            active.map((inv) => (
              <div key={inv.link} className="ListItem multiline has-ripple">
                <button type="button" className="ListItem-button" onClick={() => nav.push({ name: "linkDetail", invite: inv })}>
                  <span className={cn("link-status-icon", inviteIconClass(inv))}>
                    <LinkIcon className="size-5" />
                  </span>
                  <div className="multiline-item">
                    <span className="title invite-title">{inv.title || inv.link}</span>
                    <span className="subtitle" dir="auto">{inviteUsageText(inv, tr)}</span>
                  </div>
                  <ChevronRight className="row-chevron size-5" />
                </button>
              </div>
            ))
          )}
        </div>

        {revoked.length > 0 && (
          <>
            <SectionTitle>{tr("revokedLinks", "Bekor qilingan havolalar")}</SectionTitle>
            <div className="Island">
              {revoked.map((inv) => (
                <div key={inv.link} className="ListItem multiline has-ripple">
                  <button type="button" className="ListItem-button" onClick={() => nav.push({ name: "linkDetail", invite: inv })}>
                    <span className={cn("link-status-icon", inviteIconClass(inv))}>
                      <LinkIcon className="size-5" />
                    </span>
                    <div className="multiline-item">
                      <span className="title invite-title">{inv.title || inv.link}</span>
                      <span className="subtitle" dir="auto">{inviteUsageText(inv, tr)}</span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── invite link detail (ManageInviteInfo) ───────────────────────────────────────

function LinkDetailScreen({ ctx, invite }: { ctx: Ctx; invite: TgInvite }) {
  const { accountId, chatId, tr, nav, toasts } = ctx;
  const revoke = useRevokeTgInvite();

  const doRevoke = () => {
    revoke.mutate(
      { accountId, chatId, link: invite.link },
      {
        onSuccess: () => {
          toasts.saved();
          nav.back();
        },
        onError: (err) => (isTgNotImplemented(err) ? toasts.comingSoon() : toasts.failed()),
      },
    );
  };

  return (
    <div className="Management">
      <div className="panel-content custom-scroll">
        <LinkIcon className="section-icon size-12" />
        <div className="Island">
          <div className="link-detail-link">{invite.link}</div>
          <NavRow
            icon={<Copy className="size-6" />}
            title={tr("copyLink", "Havoladan nusxa olish")}
            primary
            onClick={() => {
              void navigator.clipboard?.writeText(invite.link);
              toasts.saved();
            }}
          />
        </div>

        <SectionTitle>{tr("linkUsage", "Foydalanish")}</SectionTitle>
        <div className="Island">
          <div className="ListItem multiline">
            <div className="ListItem-button" style={{ cursor: "default" }}>
              <span className="ListItem-main-icon"><Users className="size-6" /></span>
              <div className="multiline-item">
                <span className="title">{fmtInt(invite.usage)}</span>
                <span className="subtitle">{tr("joinedCount", "Qo'shilganlar")}</span>
              </div>
            </div>
          </div>
          {invite.usageLimit != null && (
            <div className="ListItem multiline">
              <div className="ListItem-button" style={{ cursor: "default" }}>
                <span className="ListItem-main-icon"><Info className="size-6" /></span>
                <div className="multiline-item">
                  <span className="title">{fmtInt(invite.usageLimit)}</span>
                  <span className="subtitle">{tr("usageLimit", "Foydalanish limiti")}</span>
                </div>
              </div>
            </div>
          )}
          {invite.expireDate != null && (
            <div className="ListItem multiline">
              <div className="ListItem-button" style={{ cursor: "default" }}>
                <span className="ListItem-main-icon"><Info className="size-6" /></span>
                <div className="multiline-item">
                  <span className="title">{fmtUnix(invite.expireDate)}</span>
                  <span className="subtitle">{tr("expiryDate", "Amal qilish muddati")}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {!invite.revoked && (
          <div className="Island">
            <NavRow
              icon={<Trash2 className="size-6" />}
              title={tr("revokeLink", "Havolani bekor qilish")}
              destructive
              onClick={doRevoke}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ── join requests (ManageJoinRequests + JoinRequest) ────────────────────────────

function JoinRequestsScreen({
  ctx,
  requests,
  loading,
}: {
  ctx: Ctx;
  requests: TgJoinRequest[];
  loading: boolean;
}) {
  const { accountId, chatId, kind, tr, toasts } = ctx;
  const answer = useAnswerTgJoinRequest();
  const answerAll = useAnswerAllTgJoinRequests();
  // Optimistic removal for this bridge — a request the admin acted on drops out
  // immediately; on a not-yet-wired endpoint we keep the intent and toast.
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const visible = requests.filter((r) => !hidden.has(r.id));

  const act = (userId: number, approved: boolean) => {
    setHidden((s) => new Set(s).add(userId));
    answer.mutate(
      { accountId, chatId, userId, approved },
      {
        onError: (err) => {
          if (isTgNotImplemented(err)) toasts.comingSoon();
          else {
            toasts.failed();
            setHidden((s) => {
              const n = new Set(s);
              n.delete(userId);
              return n;
            });
          }
        },
      },
    );
  };

  const actAll = (approved: boolean) => {
    const ids = visible.map((r) => r.id);
    setHidden((s) => {
      const n = new Set(s);
      ids.forEach((id) => n.add(id));
      return n;
    });
    answerAll.mutate(
      { accountId, chatId, userIds: ids, approved },
      {
        onSuccess: () => toasts.saved(),
        onError: (err) => {
          if (isTgNotImplemented(err)) {
            toasts.comingSoon();
          } else {
            toasts.failed();
            // Real failure → the requests come back (undo the optimistic hide).
            setHidden((s) => {
              const n = new Set(s);
              ids.forEach((id) => n.delete(id));
              return n;
            });
          }
        },
      },
    );
  };

  return (
    <div className="Management">
      <div className="panel-content custom-scroll">
        <UserPlus className="section-icon size-12" />
        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<UserPlus className="size-9" />}
            text={
              kind === "channel"
                ? tr("noRequestsChannel", "Obuna so'rovlari yo'q")
                : tr("noRequestsGroup", "A'zolik so'rovlari yo'q")
            }
          />
        ) : (
          <>
            {visible.length > 1 && (
              <div className="bulk-actions">
                <button type="button" className="tg-btn filled" onClick={() => actAll(true)}>
                  {tr("acceptAll", "Barchasini qabul qilish")}
                </button>
                <button type="button" className="tg-btn" onClick={() => actAll(false)}>
                  {tr("dismissAll", "Barchasini rad etish")}
                </button>
              </div>
            )}
            <div className="Island">
              {visible.map((r) => (
                <div key={r.id} className="JoinRequest">
                  <div className="JoinRequest__top">
                    <div className="JoinRequest__user">
                      <TgAvatar accountId={accountId} peerId={r.id} name={r.name} size={48} />
                      <div className="JoinRequest__user-info">
                        <div className="JoinRequest__user-name">{r.name}</div>
                        {r.about && <div className="JoinRequest__user-subtitle">{r.about}</div>}
                      </div>
                    </div>
                    <div className="JoinRequest__date">{fmtUnix(r.date)}</div>
                  </div>
                  <div className="JoinRequest__buttons">
                    <button type="button" className="tg-btn" onClick={() => act(r.id, true)}>
                      {kind === "channel" ? tr("addToChannel", "Kanalga qo'shish") : tr("addToGroup", "Guruhga qo'shish")}
                    </button>
                    <button type="button" className="tg-btn" onClick={() => act(r.id, false)}>
                      {tr("dismiss", "Rad etish")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── reactions (ManageReactions) ─────────────────────────────────────────────────

/** A curated set of common Telegram reactions for the "some" allow-list. The
 *  bridge exposes no available-reactions reader, so we offer the standard palette
 *  and send the chosen glyphs as `emojis` (mirrors ManageReactions' checkbox
 *  list under "Only allow this reactions"). */
const COMMON_REACTIONS = [
  "👍", "👎", "❤️", "🔥", "🥰", "👏", "😁", "🤔",
  "🎉", "🤩", "🙏", "👌", "😍", "😱", "🤯", "😢",
  "🤣", "💯", "🕊", "🥴", "😐", "🤡", "🌚", "💔",
] as const;

function ReactionsScreen({ ctx }: { ctx: Ctx }) {
  const { accountId, chatId, tr, nav, toasts } = ctx;
  const [mode, setMode] = useState<"all" | "some" | "none">("all");
  const [allowed, setAllowed] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);
  const save = useSetTgReactions();

  const toggleEmoji = (emo: string) => {
    setAllowed((s) => {
      const n = new Set(s);
      if (n.has(emo)) n.delete(emo);
      else n.add(emo);
      return n;
    });
    setTouched(true);
  };

  // A "some" selection with an empty allow-list has nothing to save (mirrors the
  // reference, which keeps the FAB hidden until at least one reaction is picked).
  const canSave = touched && (mode !== "some" || allowed.size > 0);

  const submit = () => {
    save.mutate(
      { accountId, chatId, mode, emojis: mode === "some" ? [...allowed] : undefined },
      {
        onSuccess: () => {
          toasts.saved();
          nav.back();
        },
        onError: (err) => (isTgNotImplemented(err) ? toasts.comingSoon() : toasts.failed()),
      },
    );
  };

  return (
    <div className="Management">
      <div className="panel-content custom-scroll">
        <SectionTitle>{tr("availableReactions", "Mavjud reaksiyalar")}</SectionTitle>
        <div className="Island">
          <RadioGroup
            name="tg-reactions"
            selected={mode}
            onChange={(v) => {
              setMode(v);
              setTouched(true);
            }}
            options={[
              { value: "all", label: tr("allReactions", "Barcha reaksiyalar") },
              { value: "some", label: tr("someReactions", "Ba'zi reaksiyalar") },
              { value: "none", label: tr("noReactions", "Reaksiyalarsiz") },
            ]}
          />
        </div>
        <SectionDescription>
          {mode === "all" && tr("allReactionsInfo", "A'zolar istalgan reaksiyani qo'ya oladi.")}
          {mode === "some" && tr("someReactionsInfo", "Faqat siz tanlagan reaksiyalar ishlaydi.")}
          {mode === "none" && tr("noReactionsInfo", "Bu chatda reaksiyalar o'chirilgan.")}
        </SectionDescription>

        {mode === "some" && (
          <>
            <SectionTitle>{tr("onlyAllowReactions", "Faqat quyidagi reaksiyalar")}</SectionTitle>
            <div className="Island">
              {COMMON_REACTIONS.map((emo) => (
                <Checkbox
                  key={emo}
                  checked={allowed.has(emo)}
                  label={<span className="reaction-emoji">{emo}</span>}
                  onChange={() => toggleEmoji(emo)}
                />
              ))}
            </div>
          </>
        )}
      </div>
      <Fab shown={canSave} disabled={save.isPending} onClick={submit} label={tr("save", "Saqlash")} />
    </div>
  );
}

// ── chat type / privacy (ManageChatPrivacyType) ─────────────────────────────────

function ChatTypeScreen({ ctx }: { ctx: Ctx }) {
  const { accountId, chatId, kind, tr, nav, toasts } = ctx;
  const [type, setType] = useState<"private" | "public">("private");
  const [username, setUsername] = useState("");
  const [touched, setTouched] = useState(false);
  const save = useSetTgChatType();
  const isChannel = kind === "channel";

  const submit = () => {
    save.mutate(
      { accountId, chatId, isPublic: type === "public", username: username.trim() || undefined },
      {
        onSuccess: () => {
          toasts.saved();
          nav.back();
        },
        onError: (err) => (isTgNotImplemented(err) ? toasts.comingSoon() : toasts.failed()),
      },
    );
  };

  return (
    <div className="Management">
      <div className="panel-content custom-scroll">
        <SectionTitle>{isChannel ? tr("channelType", "Kanal turi") : tr("groupType", "Guruh turi")}</SectionTitle>
        <div className="Island">
          <RadioGroup
            name="tg-chat-type"
            selected={type}
            onChange={(v) => {
              setType(v);
              setTouched(true);
            }}
            options={[
              {
                value: "private",
                label: isChannel ? tr("privateChannel", "Yopiq kanal") : tr("privateGroup", "Yopiq guruh"),
                subLabel: tr("privateInfo", "Faqat taklif havolasi orqali qo'shilish mumkin"),
              },
              {
                value: "public",
                label: isChannel ? tr("publicChannel", "Ochiq kanal") : tr("publicGroup", "Ochiq guruh"),
                subLabel: tr("publicInfo", "Foydalanuvchi nomi orqali qidirilar va topilar"),
              },
            ]}
          />
        </div>
        {type === "public" && (
          <>
            <div className="Island">
              <InputField
                id="tg-mgmt-username"
                label={tr("publicLink", "Ommaviy havola (username)")}
                value={username}
                onChange={(v) => {
                  setUsername(v.replace(/[^a-zA-Z0-9_]/g, ""));
                  setTouched(true);
                }}
                maxLength={32}
              />
            </div>
            <SectionDescription>
              {tr("publicLinkHelp", "Foydalanuvchilar bu havola orqali chatni topa oladi.")}
            </SectionDescription>
          </>
        )}
      </div>
      <Fab shown={touched} disabled={save.isPending} onClick={submit} label={tr("save", "Saqlash")} />
    </div>
  );
}

// ── the panel ───────────────────────────────────────────────────────────────

export function TgManagement({
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
  const { t } = useTranslation();
  const tr: Tr = (k, d) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const [stack, setStack] = useState<Screen[]>([{ name: "main" }]);
  const screen = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  const nav: Nav = useMemo(
    () => ({
      push: (s) => setStack((prev) => [...prev, s]),
      back: () => setStack((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev)),
    }),
    [],
  );

  const toasts: Toasts = useMemo(
    () => ({
      comingSoon: () => pushMgmtToast(tr("tgManagement", "Boshqaruv"), tr("comingSoon", "Tez orada qo'shiladi")),
      saved: () => pushMgmtToast(tr("tgManagement", "Boshqaruv"), tr("changesSaved", "O'zgarishlar saqlandi")),
      failed: () => pushMgmtToast(tr("tgManagement", "Boshqaruv"), tr("saveFailed", "Saqlab bo'lmadi")),
    }),
    // tr is derived from the (stable) i18n instance; safe to build once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const ctx: Ctx = { accountId, chatId, kind, tr, nav, toasts };

  // ── data (defensive; each enabled only where a screen needs it) ──
  const activeName = screen.name;
  const wantAdmins = activeName === "main" || activeName === "administrators" || activeName === "adminRights";
  const wantInvites = activeName === "main" || activeName === "inviteLinks" || activeName === "linkDetail";
  const wantRequests = activeName === "main" || activeName === "joinRequests";
  const wantPerms = activeName === "permissions";

  const dialogsQ = useTgDialogs(accountId);
  const dialog: TgDialog | undefined = dialogsQ.data?.find((d) => d.chatId === chatId);
  const title = dialog?.title || tr("untitledChat", "Nomsiz chat");

  const peerQ = useTgPeer(accountId, chatId);
  const detail: TgChatDetail | undefined =
    peerQ.data && peerQ.data.kind !== "user" ? peerQ.data : undefined;

  const adminsQ = useTgAdmins(accountId, chatId, wantAdmins);
  const invitesQ = useTgInvites(accountId, chatId, wantInvites);
  const requestsQ = useTgJoinRequests(accountId, chatId, wantRequests);
  const permsQ = useTgPermissions(accountId, chatId, wantPerms);

  const admins = adminsQ.data ?? [];
  const invites = invitesQ.data ?? [];
  const requests = requestsQ.data ?? [];

  const onHeaderButton = () => (canGoBack ? nav.back() : onClose());

  return (
    <aside className="RightColumn">
      <div className="RightHeader">
        <button
          type="button"
          className="Button close-button"
          onClick={onHeaderButton}
          aria-label={canGoBack ? tr("back", "Orqaga") : tr("close", "Yopish")}
        >
          {canGoBack ? <ArrowLeft className="size-6" /> : <X className="size-6" />}
        </button>
        <h3 className="title">{screenTitle(screen, kind, tr)}</h3>
      </div>

      {screen.name === "main" && (
        <MainScreen
          ctx={ctx}
          detail={detail}
          title={title}
          adminCount={wantAdmins && !adminsQ.isLoading ? admins.length : null}
          inviteCount={wantInvites && !invitesQ.isLoading ? invites.length : null}
          requestCount={wantRequests && !requestsQ.isLoading ? requests.length : null}
        />
      )}
      {screen.name === "editInfo" && (
        <EditInfoScreen ctx={ctx} initialTitle={dialog?.title ?? ""} initialAbout={detail?.about ?? ""} />
      )}
      {screen.name === "administrators" && (
        <AdministratorsScreen ctx={ctx} admins={admins} loading={adminsQ.isLoading} />
      )}
      {screen.name === "adminRights" && <AdminRightsScreen ctx={ctx} admin={screen.admin} />}
      {screen.name === "permissions" && (
        <PermissionsScreen ctx={ctx} defaults={permsQ.data?.defaultRights ?? null} loading={permsQ.isLoading} />
      )}
      {screen.name === "inviteLinks" && (
        <InviteLinksScreen ctx={ctx} invites={invites} loading={invitesQ.isLoading} />
      )}
      {screen.name === "linkDetail" && <LinkDetailScreen ctx={ctx} invite={screen.invite} />}
      {screen.name === "joinRequests" && (
        <JoinRequestsScreen ctx={ctx} requests={requests} loading={requestsQ.isLoading} />
      )}
      {screen.name === "reactions" && <ReactionsScreen ctx={ctx} />}
      {screen.name === "chatType" && <ChatTypeScreen ctx={ctx} />}
    </aside>
  );
}
