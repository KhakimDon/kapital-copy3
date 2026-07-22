// Telegram-surface SETTINGS panel — a fidelity port of Telegram Web A's
// `left/settings/*`. A header strip (back + title, plus edit/⋮ on the main
// screen), a top self-profile block, then grouped `Island` cards of rows exactly
// like the real client. The DOM + class names mirror the originals
// (`.left-header`, `.settings-main-scroll`, `.Island`, `.IslandTitle`,
// `.ListItem`, `.Radio`, `.Checkbox`, `.RangeSlider`, `.settings-item__current-value`);
// styling is ported in `tgweb-settings.css` (scoped to `.tg-surface`).
//
// This is a CORPORATE SHARED TG account, so the account-level Telegram settings
// (privacy rules, sessions, 2FA, blocked users, folders, stickers) are meaningless
// here. Those rows stay as FAITHFUL-LOOKING placeholders that open an honest
// "not available on this surface" panel — never a fake backend call. What IS
// meaningful is LOCAL: appearance (theme, wallpaper + custom colour/blur, text
// size), send-shortcut, notifications and performance — all wired to the local
// `tg-settings` store (settings-store.ts) plus the app-wide theme / time-format
// stores, reflecting immediately.
import { useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  AtSign,
  Bell,
  ChevronRight,
  Database,
  Folder,
  Image as ImageIcon,
  Languages,
  Lock,
  LogOut,
  MonitorSmartphone,
  MoreVertical,
  Pencil,
  Phone,
  RotateCcw,
  Settings as SettingsIcon,
  Sticker,
  Upload,
  Zap,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useMe } from "@/shared/api/me";
import { useTheme, type Theme } from "@/shared/store/theme";
import { usePrefs, type TimeFormat } from "@/shared/store/prefs";
import { ChatAvatar } from "../avatar";
import { TgAvatar } from "./tg-avatar";
import { useTgAccounts, useTgDialogs, useTgPeer, type TgAccount } from "./api";
import {
  TG_TEXT_SIZE_MAX,
  TG_TEXT_SIZE_MIN,
  TG_WALLPAPERS,
  TG_WP_SWATCHES,
  useTgSettings,
  type TgAnimationLevel,
  type TgWallpaper,
} from "./settings-store";
import "./tgweb-settings.css";

type Tr = (k: string, d: string) => string;

// The internal screen stack (main list ⇄ a sub-panel), mirroring the real
// client's `SettingsScreens` switch. `placeholder` carries the row's title/icon
// so honest "not available" panels reuse one component.
type Screen =
  | { kind: "main" }
  | { kind: "general" }
  | { kind: "background" }
  | { kind: "notifications" }
  | { kind: "performance" }
  | { kind: "editProfile" }
  | { kind: "placeholder"; title: string; icon: LucideIcon };

const BIO_MAX_LENGTH = 70;

const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

// ── labels ─────────────────────────────────────────────────────────────────────
function wallpaperLabel(w: TgWallpaper, tr: Tr): string {
  switch (w) {
    case "default": return tr("wpDefault", "Standart");
    case "solid": return tr("wpSolid", "Bir rangli");
    case "ocean": return tr("wpOcean", "Dengiz");
    case "sunset": return tr("wpSunset", "Shom");
    case "forest": return tr("wpForest", "O'rmon");
    case "custom": return tr("wpCustom", "Tanlangan rang");
  }
}

// Native language names for the "Language" row's current value.
const LANG_NATIVE: Record<string, string> = {
  uz: "O'zbekcha",
  uz_Cyrl: "Ўзбекча",
  ru: "Русский",
  en: "English",
};

/** An account whose textual status reads connected/authorized (green in the
 *  admin list). Used to pick which account backs the profile block. */
function isConnected(status: string): boolean {
  const s = (status || "").toLowerCase();
  return ["active", "ok", "online", "connected", "ready", "authorized"].some((k) => s.includes(k));
}

// ── ported primitives (Island / ListItem / Radio / Checkbox / RangeSlider) ──────
function Island({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("Island", className)}>{children}</div>;
}

/** A single row — `.ListItem > .ListItem-button` with a leading icon, a label,
 *  and an optional trailing value and/or chevron. Non-clickable rows pass
 *  `isStatic`. */
function ListRow({
  icon: Icon,
  label,
  value,
  chevron = false,
  onClick,
  narrow = true,
  isStatic = false,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  chevron?: boolean;
  onClick?: () => void;
  narrow?: boolean;
  isStatic?: boolean;
  disabled?: boolean;
}) {
  const clickable = !isStatic && !disabled && !!onClick;
  return (
    <div className={cn("ListItem", narrow && "narrow", (isStatic || disabled) && "is-static", disabled && "disabled")}>
      <div
        className="ListItem-button"
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? onClick : undefined}
        onKeyDown={
          clickable
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick!();
                }
              }
            : undefined
        }
      >
        <Icon className="ListItem-main-icon" strokeWidth={1.75} />
        <span className="ListItem-label">{label}</span>
        {value != null && <span className="settings-item__current-value">{value}</span>}
        {chevron && <ChevronRight className="ListItem-chevron" strokeWidth={2} />}
      </div>
    </div>
  );
}

/** A `.Radio` row (real `<input type="radio">` visually replaced by the
 *  `.Radio-main` ring, ported from ui/Radio.scss). */
function Radio({
  name,
  value,
  checked,
  label,
  subLabel,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  label: string;
  subLabel?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className={cn("Radio", subLabel && "withSubLabel")}>
      <input type="radio" name={name} value={value} checked={checked} onChange={() => onChange(value)} />
      <div className="Radio-main">
        <span className="label">{label}</span>
        {subLabel && <span className="subLabel">{subLabel}</span>}
      </div>
    </label>
  );
}

function RadioGroup({
  name,
  options,
  selected,
  onChange,
}: {
  name: string;
  options: { value: string; label: string; subLabel?: string }[];
  selected: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="radio-group">
      {options.map((o) => (
        <Radio
          key={o.value}
          name={name}
          value={o.value}
          checked={o.value === selected}
          label={o.label}
          subLabel={o.subLabel}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

/** A `.Checkbox` row (real `<input type="checkbox">`, visually the ported
 *  square from ui/Checkbox.scss). */
function CheckRow({
  label,
  subLabel,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  subLabel?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={cn("Checkbox", disabled && "disabled", subLabel && "withSubLabel")}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <div className="Checkbox-main">
        <span className="label">{label}</span>
        {subLabel && <span className="subLabel">{subLabel}</span>}
      </div>
    </label>
  );
}

/** The Telegram `.RangeSlider` — a native range input with a custom fill track,
 *  optional stepped labels (`options`) or a numeric value readout. */
function RangeSlider({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  options,
  renderValue,
  onChange,
}: {
  label?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  renderValue?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const hi = options ? options.length - 1 : max;
  const lo = options ? 0 : min;
  const pct = ((value - lo) / (hi - lo || 1)) * 100;
  return (
    <div className="RangeSlider">
      {(label || (!options && renderValue)) && (
        <div className="slider-top-row">
          {label && <span className="label">{label}</span>}
          {!options && <span className="value">{renderValue ? renderValue(value) : value}</span>}
        </div>
      )}
      <div className="slider-main">
        <div className="slider-fill-track" style={{ width: `${pct}%` }} />
        <input
          type="range"
          className="RangeSlider__input"
          min={lo}
          max={hi}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
        />
        {options && (
          <div className="slider-options">
            {options.map((o, i) => (
              <div
                key={o}
                className={cn("slider-option", i === value && "active")}
                onClick={() => onChange(i)}
              >
                {o}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Read-only, floating-label field (ported from ui/InputText / ui/TextArea) —
 *  the corporate profile can't be edited from this surface, so every field is a
 *  faithful display of the current value. */
function FieldText({
  id,
  label,
  value,
  multiline = false,
  maxLength,
}: {
  id: string;
  label: string;
  value: string;
  multiline?: boolean;
  maxLength?: number;
}) {
  return (
    <div className={cn("input-group", "touched", !value && "empty")}>
      {multiline ? (
        <textarea id={id} className="form-control" value={value} rows={3} readOnly placeholder=" " />
      ) : (
        <input id={id} className="form-control" value={value} readOnly placeholder=" " />
      )}
      <label htmlFor={id}>{label}</label>
      {maxLength != null && <div className="input-max-length">{`${value.length}/${maxLength}`}</div>}
    </div>
  );
}

// ── header ──────────────────────────────────────────────────────────────────────
/** The ⋮ header menu — a compact `.Menu` bubble carrying the single "Log out"
 *  action, matching SettingsHeader's DropdownMenu. Closes on outside-click / Esc. */
function HeaderMenu({ tr, onLogout }: { tr: Tr; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        className={cn("header-button", open && "active")}
        aria-label={tr("more", "Yana")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical className="size-6" strokeWidth={2} />
      </button>
      {open && (
        <div role="menu" className="Menu compact fluid absolute right-0 top-full z-30 mt-1">
          <div className="bubble">
            <button
              type="button"
              role="menuitem"
              className="MenuItem compact destructive"
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
            >
              <LogOut className="icon" />
              {tr("logOut", "Chiqish")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack: () => void;
  right?: React.ReactNode;
}) {
  return (
    <div className="left-header secondary">
      <button type="button" className="header-button" onClick={onBack} aria-label={title}>
        <ArrowLeft className="size-6" strokeWidth={2} />
      </button>
      <h3>{title}</h3>
      {right}
    </div>
  );
}

// ── self-profile block (centered avatar, name, status) ─────────────────────────
function SelfProfile({
  account,
  accountId,
  selfPeerId,
  name,
  phone,
  username,
  avatarImg,
  avatarSeed,
  connected,
  tr,
}: {
  account: TgAccount | null;
  /** Connected account id + its self ("Saved Messages") peer id — used to load the
   *  real profile photo via the auth'd blob endpoint. */
  accountId?: number | null;
  selfPeerId?: number | null;
  name: string;
  phone: string | null;
  username: string | null;
  avatarImg: string | null;
  avatarSeed: string;
  connected: boolean;
  tr: Tr;
}) {
  const em = "—";
  // A connected corporate account IS the live Telegram user → show Telegram's own
  // self-status wording ("в сети" / online), not the bridge's "connected".
  const statusText = account
    ? connected
      ? tr("online", "onlayn")
      : account.status || tr("notConnected", "ulanmagan")
    : tr("thisDevice", "shu qurilma");
  return (
    <div className="settings-selfProfile">
      <div className="SettingsProfileInfo">
        {accountId != null && selfPeerId != null ? (
          <TgAvatar accountId={accountId} peerId={selfPeerId} name={name} size={112} />
        ) : (
          <ChatAvatar seed={avatarSeed} name={name} src={avatarImg} size={112} />
        )}
        <div className="title">{name}</div>
        <div className={cn("status", account && connected && "online")}>{statusText}</div>
      </div>
      <Island>
        <ListRow isStatic icon={Phone} label={tr("phone", "Telefon")} value={phone ?? em} />
        <ListRow
          isStatic
          icon={AtSign}
          label={tr("username", "Foydalanuvchi nomi")}
          value={username ? `@${username}` : em}
        />
      </Island>
    </div>
  );
}

// ── appearance widgets (functional, wired to the store) ────────────────────────
/** Swatch grid — one tile per wallpaper preset. Each tile reuses the real
 *  wallpaper CSS by wrapping a `.tg-wallpaper` inside a `.tg-surface` carrying
 *  the preset's data-attribute, so the tile IS the wallpaper at thumbnail size. */
function WallpaperPicker({
  value,
  onChange,
  tr,
}: {
  value: TgWallpaper;
  onChange: (w: TgWallpaper) => void;
  tr: Tr;
}) {
  return (
    <div className="grid grid-cols-5 gap-2 p-2">
      {TG_WALLPAPERS.map((w) => {
        const active = w === value;
        return (
          <button
            key={w}
            type="button"
            onClick={() => onChange(w)}
            aria-pressed={active}
            title={wallpaperLabel(w, tr)}
            className="group flex flex-col items-center gap-1 rounded-lg p-1 transition-colors hover:bg-[var(--color-chat-hover)]"
          >
            <span
              className={cn(
                "tg-surface block aspect-square w-full overflow-hidden rounded-lg ring-2 transition-shadow",
                active ? "ring-[var(--color-primary)]" : "ring-transparent",
              )}
              data-tg-wallpaper={w}
            >
              <span className="tg-wallpaper block size-full" />
            </span>
            <span
              className={cn(
                "w-full truncate text-center text-[11px] leading-tight",
                active ? "text-[var(--color-primary)]" : "text-[var(--color-text-secondary)]",
              )}
            >
              {wallpaperLabel(w, tr)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Live preview — the selected wallpaper + text size rendered with a pair of
 *  real `.tg-bubble` elements, so the settings show their effect in place. */
function Preview({
  wallpaper,
  textSize,
  tr,
}: {
  wallpaper: TgWallpaper;
  textSize: number;
  tr: Tr;
}) {
  return (
    <div
      className="tg-surface overflow-hidden rounded-2xl border border-[var(--color-borders)]"
      data-tg-wallpaper={wallpaper}
      data-tg-textsize={textSize}
    >
      <div className="tg-wallpaper flex flex-col gap-1.5 p-3">
        <div className="tg-bubble tg-bubble--in tg-bubble--tail leading-snug">
          <div className="tg-text-body px-2.5 pb-1.5 pt-1">
            <span className="tg-text">{tr("previewIn", "Namuna xabari")}</span>
          </div>
        </div>
        <div className="self-end">
          <div className="tg-bubble tg-bubble--out tg-bubble--tail leading-snug">
            <div className="tg-text-body px-2.5 pb-1.5 pt-1">
              <span className="tg-text">{tr("previewOut", "Ko'rinish shunday")}</span>
              <span className="tg-meta tg-meta--inline">12:00</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── sub-screens ────────────────────────────────────────────────────────────────
/** GENERAL / Appearance — text size, chat-background link, theme, time format,
 *  keyboard send. Mirrors reference `SettingsGeneral`. */
function GeneralScreen({ go, tr }: { go: (kind: "background") => void; tr: Tr }) {
  const bubbleTextSize = useTgSettings((s) => s.bubbleTextSize);
  const setBubbleTextSize = useTgSettings((s) => s.setBubbleTextSize);
  const wallpaper = useTgSettings((s) => s.wallpaper);
  const sendOnEnter = useTgSettings((s) => s.sendOnEnter);
  const setSendOnEnter = useTgSettings((s) => s.setSendOnEnter);

  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const timeFormat = usePrefs((s) => s.timeFormat);
  const setTimeFormat = usePrefs((s) => s.setTimeFormat);

  return (
    <div className="settings-menuSection">
      <div className="IslandTitle">{tr("settings", "Sozlamalar")}</div>
      <Island>
        <RangeSlider
          label={tr("textSize", "Matn o'lchami")}
          min={TG_TEXT_SIZE_MIN}
          max={TG_TEXT_SIZE_MAX}
          value={bubbleTextSize}
          renderValue={(v) => `${v}px`}
          onChange={setBubbleTextSize}
        />
        <ListRow
          icon={ImageIcon}
          label={tr("chatBackground", "Chat foni")}
          chevron
          onClick={() => go("background")}
        />
      </Island>

      <div className="IslandTitle">{tr("theme", "Mavzu")}</div>
      <Island>
        <RadioGroup
          name="tg-theme"
          selected={theme}
          onChange={(v) => setTheme(v as Theme)}
          options={[
            { value: "light", label: tr("themeLight", "Yorug'") },
            { value: "dark", label: tr("themeDark", "Qorong'i") },
            { value: "system", label: tr("themeSystem", "Tizim") },
          ]}
        />
      </Island>

      <div className="IslandTitle">{tr("timeFormat", "Vaqt formati")}</div>
      <Island>
        <RadioGroup
          name="tg-timeformat"
          selected={timeFormat}
          onChange={(v) => setTimeFormat(v as TimeFormat)}
          options={[
            { value: "12h", label: tr("timeFormat12", "12 soatlik") },
            { value: "24h", label: tr("timeFormat24", "24 soatlik") },
          ]}
        />
      </Island>

      <div className="IslandTitle">{tr("keyboard", "Klaviatura")}</div>
      <Island>
        <RadioGroup
          name="tg-send"
          selected={sendOnEnter ? "enter" : "ctrl-enter"}
          onChange={(v) => setSendOnEnter(v === "enter")}
          options={[
            {
              value: "enter",
              label: tr("sendEnter", "Enter tugmasi bilan yuborish"),
              subLabel: tr("sendEnterHint", "Yangi qator — Shift + Enter"),
            },
            {
              value: "ctrl-enter",
              label: IS_MAC
                ? tr("sendCmdEnter", "⌘ + Enter bilan yuborish")
                : tr("sendCtrlEnter", "Ctrl + Enter bilan yuborish"),
              subLabel: tr("sendCtrlEnterHint", "Yangi qator — Enter"),
            },
          ]}
        />
      </Island>

      <div className="IslandTitle">{tr("preview", "Ko'rinish namunasi")}</div>
      <Preview wallpaper={wallpaper} textSize={bubbleTextSize} tr={tr} />
    </div>
  );
}

/** CHAT BACKGROUND — presets, custom solid colour (+ swatches), blur, upload
 *  (coming soon) and reset. Mirrors reference `SettingsGeneralBackground`. */
function BackgroundScreen({ tr }: { tr: Tr }) {
  const wallpaper = useTgSettings((s) => s.wallpaper);
  const setWallpaper = useTgSettings((s) => s.setWallpaper);
  const wallpaperColor = useTgSettings((s) => s.wallpaperColor);
  const setWallpaperColor = useTgSettings((s) => s.setWallpaperColor);
  const wallpaperBlur = useTgSettings((s) => s.wallpaperBlur);
  const setWallpaperBlur = useTgSettings((s) => s.setWallpaperBlur);
  const bubbleTextSize = useTgSettings((s) => s.bubbleTextSize);

  return (
    <div className="settings-menuSection">
      <div className="IslandTitle">{tr("chatBackground", "Chat foni")}</div>
      <Island>
        <WallpaperPicker value={wallpaper} onChange={setWallpaper} tr={tr} />
      </Island>

      <div className="IslandTitle">{tr("solidColor", "Bir rangli fon")}</div>
      <Island>
        <div className="settings-color-row">
          <label className="settings-color-swatch settings-color-input" title={tr("pickColor", "Rang tanlash")}>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(wallpaperColor) ? wallpaperColor : "#d5dbe3"}
              onChange={(e) => setWallpaperColor(e.currentTarget.value)}
            />
          </label>
          {TG_WP_SWATCHES.map((c) => {
            const active = wallpaper === "custom" && wallpaperColor.toLowerCase() === c.toLowerCase();
            return (
              <button
                key={c}
                type="button"
                className={cn("settings-color-swatch", active && "active")}
                style={{ backgroundColor: c }}
                aria-pressed={active}
                aria-label={c}
                onClick={() => setWallpaperColor(c)}
              />
            );
          })}
        </div>
      </Island>

      <Island>
        <ListRow icon={Upload} label={tr("uploadImage", "Rasm yuklash")} value={tr("comingSoon", "tez orada")} disabled />
        <ListRow
          icon={RotateCcw}
          label={tr("resetDefault", "Standart holatga qaytarish")}
          onClick={() => {
            setWallpaper("default");
            setWallpaperBlur(false);
          }}
        />
        <CheckRow
          label={tr("blurred", "Fonni xiralashtirish")}
          checked={wallpaperBlur}
          onChange={setWallpaperBlur}
        />
      </Island>

      <div className="IslandTitle">{tr("preview", "Ko'rinish namunasi")}</div>
      <Preview wallpaper={wallpaper} textSize={bubbleTextSize} tr={tr} />
    </div>
  );
}

/** NOTIFICATIONS — web/offline/sound, per-peer-type mute + previews, misc.
 *  Mirrors reference `SettingsNotifications`. These are honest LOCAL prefs
 *  (sound genuinely gates the incoming-message chime in messenger/page.tsx). */
function NotificationsScreen({ tr }: { tr: Tr }) {
  const s = useTgSettings();
  const enabledLabel = (on: boolean) =>
    on ? tr("notifEnabled", "Yoqilgan") : tr("notifDisabled", "O'chirilgan");

  return (
    <div className="settings-menuSection">
      <div className="IslandTitle">{tr("notifWeb", "Brauzer bildirishnomalari")}</div>
      <Island>
        <CheckRow
          label={tr("notifWeb", "Brauzer bildirishnomalari")}
          subLabel={enabledLabel(s.hasWebNotifications)}
          checked={s.hasWebNotifications}
          onChange={s.setHasWebNotifications}
        />
        <CheckRow
          label={tr("notifOffline", "Fon (offline) bildirishnomalar")}
          subLabel={enabledLabel(s.hasPushNotifications)}
          checked={s.hasPushNotifications}
          disabled={!s.hasWebNotifications}
          onChange={s.setHasPushNotifications}
        />
        <CheckRow label={tr("sound", "Ovoz")} checked={s.soundOn} onChange={s.setSoundOn} />
      </Island>

      <div className="IslandTitle">{tr("notifPrivate", "Shaxsiy suhbatlar")}</div>
      <Island>
        <CheckRow
          label={tr("notifForPrivate", "Shaxsiy suhbatlar uchun")}
          subLabel={enabledLabel(s.notifyPrivate)}
          checked={s.notifyPrivate}
          onChange={s.setNotifyPrivate}
        />
        <CheckRow
          label={tr("messagePreview", "Xabar matni ko'rinishi")}
          checked={s.previewPrivate}
          disabled={!s.notifyPrivate}
          onChange={s.setPreviewPrivate}
        />
      </Island>

      <div className="IslandTitle">{tr("notifGroups", "Guruhlar")}</div>
      <Island>
        <CheckRow
          label={tr("notifForGroups", "Guruhlar uchun")}
          subLabel={enabledLabel(s.notifyGroups)}
          checked={s.notifyGroups}
          onChange={s.setNotifyGroups}
        />
        <CheckRow
          label={tr("messagePreview", "Xabar matni ko'rinishi")}
          checked={s.previewGroups}
          disabled={!s.notifyGroups}
          onChange={s.setPreviewGroups}
        />
      </Island>

      <div className="IslandTitle">{tr("notifChannels", "Kanallar")}</div>
      <Island>
        <CheckRow
          label={tr("notifForChannels", "Kanallar uchun")}
          subLabel={enabledLabel(s.notifyChannels)}
          checked={s.notifyChannels}
          onChange={s.setNotifyChannels}
        />
        <CheckRow
          label={tr("messagePreview", "Xabar matni ko'rinishi")}
          checked={s.previewChannels}
          disabled={!s.notifyChannels}
          onChange={s.setPreviewChannels}
        />
      </Island>

      <div className="IslandTitle">{tr("notifOther", "Boshqa")}</div>
      <Island>
        <CheckRow
          label={tr("contactJoined", "Kontakt Telegramga qo'shildi")}
          checked={s.contactJoined}
          onChange={s.setContactJoined}
        />
        <CheckRow
          label={tr("pinnedMessages", "Qadalgan xabarlar")}
          checked={s.pinnedMessages}
          onChange={s.setPinnedMessages}
        />
      </Island>

      <div className="IslandDescription">
        {tr(
          "notifHint",
          "Bildirishnoma sozlamalari faqat shu brauzerda saqlanadi. Ovoz — kelgan xabar signalini boshqaradi.",
        )}
      </div>
    </div>
  );
}

/** Animation-slider positions (Low → Medium → High) mapped to the persisted
 *  `animationLevel`: Lowest = `none`, Medium = `reduced`, Highest = `full`.
 *  The workspace stamps that level as `data-tg-anim` and tg-anim.css gates on it. */
const TG_ANIM_ORDER: readonly TgAnimationLevel[] = ["none", "reduced", "full"];

/** PERFORMANCE / Animations — level slider + interface/media autoplay toggles.
 *  Mirrors reference `SettingsPerformance`. */
function PerformanceScreen({ tr }: { tr: Tr }) {
  const animationLevel = useTgSettings((s) => s.animationLevel);
  const setAnimationLevel = useTgSettings((s) => s.setAnimationLevel);
  const interfaceAnimations = useTgSettings((s) => s.interfaceAnimations);
  const setInterfaceAnimations = useTgSettings((s) => s.setInterfaceAnimations);
  const autoplayStickers = useTgSettings((s) => s.autoplayStickers);
  const setAutoplayStickers = useTgSettings((s) => s.setAutoplayStickers);
  const autoplayGifs = useTgSettings((s) => s.autoplayGifs);
  const setAutoplayGifs = useTgSettings((s) => s.setAutoplayGifs);

  return (
    <div className="settings-menuSection">
      <div className="IslandTitle">{tr("animations", "Animatsiyalar")}</div>
      <Island>
        <RangeSlider
          options={[
            tr("perfLow", "Past"),
            tr("perfMedium", "O'rta"),
            tr("perfHigh", "Yuqori"),
          ]}
          value={Math.max(0, TG_ANIM_ORDER.indexOf(animationLevel))}
          onChange={(v) => setAnimationLevel(TG_ANIM_ORDER[v] ?? "full")}
        />
      </Island>
      <div className="IslandDescription">
        {tr("perfHint", "Kuchsizroq qurilmalarda animatsiyalar darajasini pasaytiring.")}
      </div>

      <div className="IslandTitle">{tr("perfDetails", "Batafsil")}</div>
      <Island>
        <CheckRow
          label={tr("interfaceAnimations", "Interfeys animatsiyalari")}
          checked={interfaceAnimations}
          onChange={setInterfaceAnimations}
        />
        <CheckRow
          label={tr("autoplayStickers", "Stikerlarni avto-ijro etish")}
          checked={autoplayStickers}
          onChange={setAutoplayStickers}
        />
        <CheckRow
          label={tr("autoplayGifs", "GIF-larni avto-ijro etish")}
          checked={autoplayGifs}
          onChange={setAutoplayGifs}
        />
      </Island>
    </div>
  );
}

/** EDIT PROFILE — read-only display of the signed-in identity. The shared
 *  corporate Telegram profile is owned centrally, so nothing here is editable;
 *  a note makes that explicit. Mirrors reference `SettingsEditProfile` DOM. */
function EditProfileScreen({
  name,
  firstName,
  lastName,
  bio,
  username,
  avatarImg,
  avatarSeed,
  tr,
}: {
  name: string;
  firstName: string;
  lastName: string;
  bio: string;
  username: string;
  avatarImg: string | null;
  avatarSeed: string;
  tr: Tr;
}) {
  return (
    <div className="settings-menuSection">
      <div className="settings-content-header">
        <ChatAvatar seed={avatarSeed} name={name} src={avatarImg} size={96} />
      </div>
      <Island>
        <div className="settings-input">
          <FieldText id="tg-first-name" label={tr("firstName", "Ism")} value={firstName} />
          <FieldText id="tg-last-name" label={tr("lastName", "Familiya")} value={lastName} />
          <FieldText id="tg-bio" label={tr("bio", "Bio")} value={bio} multiline maxLength={BIO_MAX_LENGTH} />
        </div>
      </Island>
      <div className="IslandDescription">
        {tr("bioHint", "Bio haqingizda bir necha so'z — bu yerda faqat ko'rsatiladi.")}
      </div>

      <div className="IslandTitle">{tr("username", "Foydalanuvchi nomi")}</div>
      <Island>
        <div className="settings-input">
          <FieldText id="tg-username" label={tr("username", "Foydalanuvchi nomi")} value={username ? `@${username}` : ""} />
        </div>
      </Island>
      <div className="IslandDescription">
        {tr(
          "editProfileNote",
          "Bu ulushli korporativ Telegram hisobi — profil ma'lumotlarini bu yerdan o'zgartirib bo'lmaydi. Ular hisob egasi tomonidan boshqariladi.",
        )}
      </div>
    </div>
  );
}

/** Honest panel for account-level settings the corporate bridge can't do. */
function PlaceholderScreen({ icon: Icon, tr }: { icon: LucideIcon; tr: Tr }) {
  return (
    <div className="settings-menuSection">
      <Island>
        <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <Icon className="size-10 text-[var(--color-text-secondary)] opacity-60" strokeWidth={1.5} />
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
            {tr("corpUnavailable", "Bu sozlama ushbu korporativ Telegram hisobida mavjud emas.")}
          </p>
        </div>
      </Island>
    </div>
  );
}

// ── main list ──────────────────────────────────────────────────────────────────
function MainScreen({
  profile,
  langNative,
  go,
  openPlaceholder,
  tr,
}: {
  profile: React.ReactNode;
  langNative: string;
  go: (kind: "general" | "notifications" | "performance") => void;
  openPlaceholder: (title: string, icon: LucideIcon) => void;
  tr: Tr;
}) {
  return (
    <>
      {profile}
      <div className="settings-menuSection">
        <Island>
          <ListRow icon={SettingsIcon} label={tr("secGeneral", "Umumiy sozlamalar")} chevron onClick={() => go("general")} />
          <ListRow icon={Zap} label={tr("secAnimations", "Animatsiyalar")} chevron onClick={() => go("performance")} />
          <ListRow icon={Bell} label={tr("secNotifications", "Bildirishnomalar")} chevron onClick={() => go("notifications")} />
          <ListRow
            icon={Database}
            label={tr("secData", "Ma'lumotlar va xotira")}
            chevron
            onClick={() => openPlaceholder(tr("secData", "Ma'lumotlar va xotira"), Database)}
          />
          <ListRow
            icon={Lock}
            label={tr("secPrivacy", "Maxfiylik va xavfsizlik")}
            chevron
            onClick={() => openPlaceholder(tr("secPrivacy", "Maxfiylik va xavfsizlik"), Lock)}
          />
          <ListRow
            icon={Folder}
            label={tr("secFolders", "Chat papkalari")}
            chevron
            onClick={() => openPlaceholder(tr("secFolders", "Chat papkalari"), Folder)}
          />
          <ListRow
            icon={MonitorSmartphone}
            label={tr("secDevices", "Qurilmalar")}
            chevron
            onClick={() => openPlaceholder(tr("secDevices", "Qurilmalar"), MonitorSmartphone)}
          />
          <ListRow
            icon={Languages}
            label={tr("secLanguage", "Til")}
            value={langNative}
            chevron
            onClick={() => openPlaceholder(tr("secLanguage", "Til"), Languages)}
          />
          <ListRow
            icon={Sticker}
            label={tr("secStickers", "Stikerlar va emoji")}
            chevron
            onClick={() => openPlaceholder(tr("secStickers", "Stikerlar va emoji"), Sticker)}
          />
        </Island>
      </div>
    </>
  );
}

export function TgSettings({
  onClose,
  onLogout,
  preferMe = false,
}: {
  onClose: () => void;
  onLogout?: () => void;
  /** Force the AIBA-user profile at the top instead of the corporate TG account —
   *  used when these settings are opened from the INTERNAL messenger (the app's own
   *  chat), where "me" is the signed-in employee, not the shared Telegram account. */
  preferMe?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const tr: Tr = (k, d) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const [screen, setScreen] = useState<Screen>({ kind: "main" });

  // Profile block source: the connected corporate account if there is one, else
  // the signed-in AIBA user. `preferMe` forces the AIBA user (internal messenger).
  const accounts = useTgAccounts().data ?? [];
  const account = preferMe
    ? null
    : accounts.find((a) => isConnected(a.status)) ?? accounts[0] ?? null;
  const me = useMe().data;

  // The corporate account's OWN Telegram profile (photo + @username) lives on its
  // "Saved Messages" self peer — the account row carries neither. Resolve it so the
  // settings header shows the real avatar + username instead of initials + "—".
  const selfDialogs = useTgDialogs(account?.id ?? null).data ?? [];
  const selfChatId = selfDialogs.find((d) => d.isSelf)?.chatId ?? null;
  const selfPeer = useTgPeer(account?.id ?? null, selfChatId).data;
  const selfUsername = selfPeer?.kind === "user" ? selfPeer.username : null;

  const meFirst = me?.profile?.firstName ?? "";
  const meLast = me?.profile?.lastName ?? "";
  const meName = [meFirst, meLast].filter(Boolean).join(" ");
  const name = account?.title || meName || me?.username || tr("account", "Hisob");
  const phone = account?.phone ?? me?.phone ?? null;
  const username = account ? selfUsername : me?.username ?? null;
  const avatarImg = account ? null : me?.avatar ?? null;
  const avatarSeed = account ? `tg-acc:${account.id}` : me?.username || name;
  const connected = account ? isConnected(account.status) : false;

  const langNative = LANG_NATIVE[i18n.language] ?? i18n.language;

  const title =
    screen.kind === "main"
      ? tr("settings", "Sozlamalar")
      : screen.kind === "general"
        ? tr("secGeneral", "Umumiy sozlamalar")
        : screen.kind === "background"
          ? tr("chatBackground", "Chat foni")
          : screen.kind === "notifications"
            ? tr("secNotifications", "Bildirishnomalar")
            : screen.kind === "performance"
              ? tr("secAnimations", "Animatsiyalar")
              : screen.kind === "editProfile"
                ? tr("editProfile", "Profilni tahrirlash")
                : screen.title;

  const onBack = () => {
    if (screen.kind === "main") onClose();
    else if (screen.kind === "background") setScreen({ kind: "general" });
    else setScreen({ kind: "main" });
  };

  const headerRight =
    screen.kind === "main" ? (
      <div className="settings-header-actions">
        <button
          type="button"
          className="header-button"
          aria-label={tr("editProfile", "Profilni tahrirlash")}
          onClick={() => setScreen({ kind: "editProfile" })}
        >
          <Pencil className="size-5" strokeWidth={2} />
        </button>
        {onLogout && <HeaderMenu tr={tr} onLogout={onLogout} />}
      </div>
    ) : undefined;

  return (
    <div className="tg-surface Settings">
      <SettingsHeader title={title} onBack={onBack} right={headerRight} />
      <div className="settings-main-scroll">
        {screen.kind === "main" && (
          <MainScreen
            profile={
              <SelfProfile
                account={account}
                accountId={account?.id ?? null}
                selfPeerId={selfChatId}
                name={name}
                phone={phone}
                username={username}
                avatarImg={avatarImg}
                avatarSeed={avatarSeed}
                connected={connected}
                tr={tr}
              />
            }
            langNative={langNative}
            go={(kind) => setScreen({ kind })}
            openPlaceholder={(placeholderTitle, icon) => setScreen({ kind: "placeholder", title: placeholderTitle, icon })}
            tr={tr}
          />
        )}
        {screen.kind === "general" && <GeneralScreen go={(kind) => setScreen({ kind })} tr={tr} />}
        {screen.kind === "background" && <BackgroundScreen tr={tr} />}
        {screen.kind === "notifications" && <NotificationsScreen tr={tr} />}
        {screen.kind === "performance" && <PerformanceScreen tr={tr} />}
        {screen.kind === "editProfile" && (
          <EditProfileScreen
            name={name}
            firstName={meFirst}
            lastName={meLast}
            bio={me?.profile?.about ?? ""}
            username={me?.username ?? ""}
            avatarImg={avatarImg}
            avatarSeed={avatarSeed}
            tr={tr}
          />
        )}
        {screen.kind === "placeholder" && <PlaceholderScreen icon={screen.icon} tr={tr} />}
      </div>
    </div>
  );
}
