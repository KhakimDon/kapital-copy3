import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/shared/i18n";
import * as Icons from "lucide-react";
import {
  Bell, Building2, Check, ChevronDown, ChevronRight, Globe, LogOut, Search, Sun, Moon, Monitor,
  BellOff, Settings, UserRound, UserPlus, MessageSquare, CalendarClock, Flame, Plug, BookOpen, Smartphone,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useMe } from "@/shared/api/me";
import { useNotifications, useMarkNotificationsRead, type NotificationItem } from "@/shared/api/notifications";
import { SourceIcon } from "@/shared/notifications/icon-map";
import { ADMIN_ITEMS, SUPERADMIN_ITEMS, type NavLeaf } from "./nav-config";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMyCompanies } from "@/shared/companies";
import { useCompany } from "@/shared/store/company";
import { useAuth } from "@/shared/store/auth";
import { useTheme, type Theme } from "@/shared/store/theme";
import { useWallpaper, WALLPAPERS } from "@/shared/store/wallpaper";
import { usePrefs, type TimeFormat } from "@/shared/store/prefs";
import { useTabs } from "@/shared/store/tabs";
import { TabStrip } from "./tab-strip";

// Over the wallpaper we tint chrome controls by opacity, not a fixed grey.
const railBtn =
  "relative flex size-9 items-center justify-center rounded-lg text-white/75 transition-colors hover:bg-white/10 hover:text-white [&_svg]:size-[18px]";

/** Control-Center glyph (Apple "switch.2" — two stacked toggles), inline so it
 *  inherits currentColor and themes with the rail. */
function SwitchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18.9844 18.4668" fill="currentColor" className={className} aria-hidden="true">
      <path d="M4.17969 18.4375L14.4434 18.4375C16.7578 18.4375 18.623 16.8164 18.623 14.4238C18.623 12.0312 16.7578 10.4102 14.4434 10.4102L4.17969 10.4102C1.86523 10.4102 0 12.0312 0 14.4238C0 16.8164 1.86523 18.4375 4.17969 18.4375ZM11.6113 16.9434C10.166 16.9434 9.00391 15.9277 9.00391 14.4141C9.00391 12.9102 10.166 11.8945 11.6113 11.8945L14.5996 11.8945C16.0547 11.8945 17.207 12.9102 17.207 14.4238C17.207 15.9277 16.0547 16.9434 14.5996 16.9434Z" />
      <path d="M4.60938 8.90625L14.0137 8.90625C16.5625 8.90625 18.623 7.10938 18.623 4.45312C18.623 1.79688 16.5625 0 14.0137 0L4.60938 0C2.06055 0 0 1.79688 0 4.45312C0 7.10938 2.06055 8.90625 4.60938 8.90625ZM4.60938 7.43164C2.91016 7.43164 1.5332 6.23047 1.5332 4.45312C1.5332 2.67578 2.91016 1.47461 4.60938 1.47461L14.0137 1.47461C15.7129 1.47461 17.0898 2.67578 17.0898 4.45312C17.0898 6.23047 15.7129 7.43164 14.0137 7.43164Z" />
      <path d="M4.60938 6.76758L7.45117 6.76758C8.7793 6.76758 9.84375 5.83008 9.84375 4.45312C9.84375 3.06641 8.7793 2.12891 7.45117 2.12891L4.60938 2.12891C3.28125 2.12891 2.2168 3.06641 2.2168 4.44336C2.2168 5.83008 3.28125 6.76758 4.60938 6.76758Z" />
    </svg>
  );
}

/** Window topbar: Chrome tabs (left) + global controls (right).
 *  Пилот P26015: одна фиксированная компания, без bell/настроек/профиля. */
export function Topbar() {
  return (
    <div className="flex items-end gap-2 px-2 pt-2">
      <TabStrip />
      <div className="mb-1.5 flex shrink-0 items-center gap-1 self-center pl-1">
        <CompanyBadge />
      </div>
    </div>
  );
}

/** Фиксированная компания пилота — статичный бейдж, смена невозможна. */
export function CompanyBadge() {
  const current = useCompany((s) => s.current);
  const setCurrent = useCompany((s) => s.setCurrent);
  const { data } = useMyCompanies();
  const single = data?.items?.[0] ?? null;

  useEffect(() => {
    if (single && (!current || current.id !== single.id)) setCurrent(single);
  }, [single, current, setCurrent]);

  const shown = current ?? single;
  return (
    <div className="flex h-9 max-w-[260px] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm text-white">
      <Building2 className="size-4 shrink-0 text-sky-300" />
      <span className="truncate">{shown?.name ?? "—"}</span>
    </div>
  );
}

export function CompanyPickerDark() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const current = useCompany((s) => s.current);
  const setCurrent = useCompany((s) => s.setCurrent);
  const openTab = useTabs((s) => s.open);
  const { data, isLoading } = useMyCompanies();

  // With exactly one company there's nothing to pick — clicking the trigger
  // switches to it and navigates straight to that company's page, no dropdown.
  const single = (data?.items?.length === 1 ? data.items[0] : null);

  // …and if nothing is selected yet, auto-select that single company so the
  // user never has to click it just to get started.
  useEffect(() => {
    if (single && !current) setCurrent(single);
  }, [single, current, setCurrent]);

  const filtered = useMemo(() => {
    const items = data?.items ?? [];
    if (!q.trim()) return items;
    const needle = q.trim().toLowerCase();
    return items.filter(
      (c) => (c.name ?? "").toLowerCase().includes(needle) || (c.inn ?? "").includes(needle),
    );
  }, [data, q]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        // Single company: intercept the open request — switch to it and navigate
        // to its page instead of opening the dropdown (pointer + keyboard).
        if (next && single) {
          if (current?.id !== single.id) setCurrent(single);
          openTab(`/companies/${single.id}`);
          return;
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 max-w-[220px] items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm text-white transition-colors hover:bg-white/10"
        >
          <Building2 className="size-4 shrink-0 text-sky-300" />
          <span className="truncate">
            {current ? current.name : <span className="text-white/50">{t("company.select")}</span>}
          </span>
          {!single && <ChevronDown className="size-4 shrink-0 opacity-60" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex max-h-[60vh] w-[420px] flex-col p-0">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("company.placeholderSearch")}
              className="pl-8"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="space-y-2 p-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {q ? t("company.notFound") : t("company.empty")}
            </div>
          )}
          {!isLoading && filtered.map((c) => {
            const active = current?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { setCurrent(c); setOpen(false); setQ(""); }}
                className={cn(
                  "flex w-full items-center gap-2 border-b px-3 py-2 text-left last:border-b-0 hover:bg-black/5 dark:hover:bg-white/10",
                  active && "bg-black/[0.06] dark:bg-white/10",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.inn ?? "—"}</div>
                </div>
                {active && <Check className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
        {data && (
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            {filtered.length} / {data.count} {t("company.countSuffix")}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// Relative "N min/hour/day ago" for a timestamp.
function relTime(iso: string | null, t: ReturnType<typeof useTranslation>["t"]): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const min = Math.floor(ms / 60_000);
  if (min < 1) return t("notif.now", { defaultValue: "hozir" });
  if (min < 60) return t("notif.minAgo", { defaultValue: "{{n}} daq oldin", n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("notif.hourAgo", { defaultValue: "{{n}} soat oldin", n: hr });
  return t("notif.dayAgo", { defaultValue: "{{n}} kun oldin", n: Math.floor(hr / 24) });
}

export function Notifications() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const openTab = useTabs((s) => s.open);
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const line = (n: (typeof items)[number]) => {
    const actor = n.actor || t("notif.someone", { defaultValue: "Kimdir" });
    const task = n.taskTitle || t("notif.aTask", { defaultValue: "vazifa" });
    const msg: Record<string, string> = {
      assigned: t("notif.assigned", { defaultValue: "{{actor}} sizni tayinladi: {{task}}", actor, task }),
      removed: t("notif.removed", { defaultValue: "{{actor}} sizni vazifadan olib tashladi: {{task}}", actor, task }),
      watcher: t("notif.watcher", { defaultValue: "{{actor}} sizni kuzatuvchi qildi: {{task}}", actor, task }),
      escalated: t("notif.escalated", { defaultValue: "{{actor}} muhimlikni oshirdi: {{task}}", actor, task }),
      completed: t("notif.completed", { defaultValue: "Bajarildi: {{task}}", task }),
      subtask: t("notif.subtask", { defaultValue: "Kichik vazifa bajarildi: {{task}}", task }),
      commented: t("notif.commented", { defaultValue: "{{actor}} izoh qoldirdi: {{task}}", actor, task }),
      mentioned: t("notif.mentioned", { defaultValue: "{{actor}} sizni eslatdi: {{task}}", actor, task }),
      due: t("notif.due", { defaultValue: "Muddat yaqin: {{task}}", task }),
      updated: t("notif.updated", { defaultValue: "{{actor}} vazifani o'zgartirdi: {{task}}", actor, task }),
    };
    return msg[n.kind ?? ""] ?? msg.updated;
  };
  // New-shape notifications carry their own title/body/icon/link. Legacy task
  // notifications don't — fall back to the composed `line()` + kind tile.
  const isNew = (n: NotificationItem) => !!(n.title || n.icon || n.link);
  const iconOf = (kind: string) =>
    kind === "assigned" || kind === "watcher" || kind === "removed" ? <UserPlus />
      : kind === "completed" || kind === "subtask" ? <Check />
      : kind === "commented" || kind === "mentioned" ? <MessageSquare />
      : kind === "due" ? <CalendarClock />
      : kind === "escalated" ? <Flame />
      : <Bell />;
  const toneOf = (kind: string) =>
    kind === "completed" || kind === "subtask" ? "bg-emerald-500/15 text-emerald-500"
      : kind === "escalated" || kind === "due" ? "bg-amber-500/15 text-amber-500"
      : kind === "commented" || kind === "mentioned" ? "bg-violet-500/15 text-violet-500"
      : "bg-sky-500/15 text-sky-500";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={railBtn} aria-label="notifications">
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full border-2 border-transparent bg-rose-500 bg-clip-padding px-1 text-[10px] font-bold leading-none text-white tabular-nums shadow-[0_1px_3px_rgba(0,0,0,0.35)]">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2.5">
          <span className="text-sm font-semibold">{t("notif.title", { defaultValue: "Bildirishnomalar" })}</span>
          {unread > 0 && (
            <button type="button" onClick={() => markRead.mutate(undefined)} className="text-[11px] font-medium text-primary hover:underline">
              {t("notif.markAll", { defaultValue: "Hammasini o'qildi" })}
            </button>
          )}
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-muted-foreground">
              <BellOff className="size-6 opacity-40" />
              {t("notif.empty", { defaultValue: "Bildirishnoma yo'q" })}
            </div>
          ) : (
            items.map((n) => {
              const fresh = isNew(n);
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (n.link) openTab(n.link);
                    else if (n.taskId) openTab(`/tasks?card=${n.taskId}`);
                    markRead.mutate(n.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                    !n.isRead && "bg-primary/[0.04]",
                  )}
                >
                  {fresh ? (
                    <SourceIcon source={n.icon || n.module} className="mt-0.5 size-8 [&_svg]:size-4" />
                  ) : (
                    <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4", toneOf(n.kind ?? ""))}>
                      {iconOf(n.kind ?? "")}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-snug text-foreground">
                      {fresh ? n.title : line(n)}
                    </div>
                    {fresh && n.body && (
                      <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{n.body}</div>
                    )}
                    <div className="mt-0.5 text-xs text-muted-foreground">{relTime(n.createdAt, t)}</div>
                  </div>
                  {!n.isRead && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-sky-500" />}
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

const THEME_OPTS: { value: Theme; icon: typeof Sun; key: string; fallback: string }[] = [
  { value: "light", icon: Sun, key: "theme.light", fallback: "Yorug'" },
  { value: "dark", icon: Moon, key: "theme.dark", fallback: "Qorong'i" },
  { value: "system", icon: Monitor, key: "theme.system", fallback: "Tizim" },
];

const LANGS: { value: string; label: string }[] = [
  { value: "uz", label: "O'zbekcha" },
  { value: "uz_Cyrl", label: "Ўзбекча" },
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
];

// macOS Control-Center grouped sub-card.
function CcCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-black/[0.04] p-1.5 dark:bg-white/[0.06]", className)}>
      {children}
    </div>
  );
}

function CcTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("px-1 pb-1.5 pt-0.5 text-[11px] font-semibold text-muted-foreground", className)}>
      {children}
    </div>
  );
}

// Language picker as a hover flyout. Opens to the left (the profile menu sits at
// the screen's right edge); Radix flips the side automatically if it won't fit.
function LanguageFlyout() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openNow = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen(true);
  };
  const closeSoon = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 140);
  };
  const current = LANGS.find((l) => l.value === i18n.language);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
          className={cn(
            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
            open ? "bg-black/5 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/10",
          )}
        >
          <span className="flex items-center gap-2">
            <Globe className="size-4 text-muted-foreground" />
            {t("nav.language", { defaultValue: "Til" })}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {current?.label}
            <ChevronRight className="size-3.5" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={6}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        className="w-44 p-1"
      >
        {LANGS.map((l) => {
          const on = i18n.language === l.value;
          return (
            <button
              key={l.value}
              type="button"
              onClick={() => { void setLanguage(l.value); setOpen(false); }}
              className={cn(
                "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                on ? "bg-primary/10 text-primary" : "hover:bg-black/5 dark:hover:bg-white/10",
              )}
            >
              <span className="truncate">{l.label}</span>
              {on && <Check className="size-3.5 shrink-0" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function navIcon(name: string) {
  return (
    (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ??
    Icons.Square
  );
}

// Settings — moved out of the left rail into the profile menu. A hover flyout
// (opens to the left, like the language one) listing the admin / superadmin
// settings pages; each opens as a tab.
function SettingsFlyout({ onNavigate }: { onNavigate: () => void }) {
  const { t } = useTranslation();
  const openApp = useTabs((s) => s.open);
  const { data: me } = useMe();
  const isSuperadmin = !!me?.is_superadmin;
  const isAdmin = !!me?.is_admin;
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openNow = () => { if (timer.current) clearTimeout(timer.current); setOpen(true); };
  const closeSoon = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 140); };
  const go = (to: string) => { openApp(to); setOpen(false); onNavigate(); };
  const label = (e: NavLeaf) => (e.labelKey ? t(e.labelKey, { defaultValue: e.title }) : e.title);

  // This flyout hosts ONLY admin tooling (ADMIN_ITEMS + superadmin control
  // plane). Theme/language/wallpaper live in the profile menu itself, so an
  // ordinary user has nothing here — hide the whole entry for them.
  if (!isAdmin && !isSuperadmin) return null;

  const Row = ({ leaf }: { leaf: NavLeaf }) => {
    const Icon = navIcon(leaf.icon);
    return (
      <button
        type="button"
        onClick={() => go(leaf.to)}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{label(leaf)}</span>
      </button>
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
          className={cn(
            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
            open ? "bg-black/5 dark:bg-white/10" : "hover:bg-black/5 dark:hover:bg-white/10",
          )}
        >
          <span className="flex items-center gap-2">
            <Settings className="size-4 text-muted-foreground" />
            {t("nav.settings", { defaultValue: "Sozlamalar" })}
          </span>
          <ChevronRight className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        align="start"
        sideOffset={6}
        onMouseEnter={openNow}
        onMouseLeave={closeSoon}
        className="max-h-[70vh] w-60 overflow-y-auto p-1"
      >
        {isSuperadmin && (
          <>
            <div className="px-2 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("nav.superadmin", { defaultValue: "Superadmin" })}
            </div>
            {SUPERADMIN_ITEMS.map((l) => <Row key={l.key} leaf={l} />)}
            <div className="my-1 h-px bg-border" />
          </>
        )}
        {ADMIN_ITEMS.filter((l) => !l.adminOnly || me?.is_admin).map((l) => <Row key={l.key} leaf={l} />)}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Control Center — the settings half of the old profile menu: admin tooling,
 * theme, language and wallpaper. Sits to the LEFT of the user avatar (its
 * trigger is the "switch.2" control-center glyph → SlidersHorizontal). The
 * personal items (profile/MCP/guide/shell-switch/logout) stay in
 * [`UserMenuDark`].
 */
export function ControlCenterDark() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const showAdminSettings = !!(me?.is_admin || me?.is_superadmin);
  const theme = useTheme((s) => s.theme);
  const setTheme = useTheme((s) => s.setTheme);
  const wallpaperId = useWallpaper((s) => s.id);
  const setWallpaper = useWallpaper((s) => s.setWallpaper);
  const timeFormat = usePrefs((s) => s.timeFormat);
  const setTimeFormat = usePrefs((s) => s.setTimeFormat);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={railBtn} title={t("nav.settings", { defaultValue: "Sozlamalar" })}>
          <SwitchIcon className="!size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 p-2">
        {/* Settings (admin tooling) — only for admins/superadmins */}
        {showAdminSettings && (
          <CcCard>
            <SettingsFlyout onNavigate={() => setOpen(false)} />
          </CcCard>
        )}

        {/* Theme — Control-Center style circular toggles */}
        <CcCard>
          <CcTitle>{t("theme.label", { defaultValue: "Mavzu" })}</CcTitle>
          <div className="grid grid-cols-3 gap-1">
            {THEME_OPTS.map(({ value, icon: Icon, key, fallback }) => {
              const on = theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full transition-colors [&_svg]:size-[18px]",
                      on ? "bg-sky-500 text-white shadow-sm" : "bg-black/10 text-foreground dark:bg-white/15",
                    )}
                  >
                    <Icon />
                  </span>
                  <span className={cn("text-[11px]", on ? "font-medium text-foreground" : "text-muted-foreground")}>
                    {t(key, { defaultValue: fallback })}
                  </span>
                </button>
              );
            })}
          </div>
        </CcCard>

        {/* Language */}
        <CcCard>
          <LanguageFlyout />
        </CcCard>

        {/* Time format — 24-hour vs AM/PM (drives the calendar clock display) */}
        <CcCard>
          <CcTitle>{t("prefs.timeFormat", { defaultValue: "Vaqt formati" })}</CcTitle>
          <div className="grid grid-cols-2 gap-1">
            {([["24h", "24"], ["12h", "AM/PM"]] as [TimeFormat, string][]).map(([val, label]) => {
              const on = timeFormat === val;
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => setTimeFormat(val)}
                  className={cn(
                    "rounded-lg py-1.5 text-xs font-medium transition-colors",
                    on
                      ? "bg-sky-500 text-white shadow-sm"
                      : "bg-black/10 text-foreground hover:bg-black/15 dark:bg-white/15 dark:hover:bg-white/20",
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </CcCard>

        {/* Wallpaper */}
        <CcCard>
          <CcTitle className="px-1">{t("wallpaper.title", { defaultValue: "Fon rasmi" })}</CcTitle>
          <div className="grid grid-cols-5 gap-1.5">
            {WALLPAPERS.map((w) => (
              <button
                key={w.id}
                type="button"
                onClick={() => setWallpaper(w.id)}
                className={cn(
                  "relative h-9 overflow-hidden rounded-lg bg-cover bg-center ring-2 transition",
                  wallpaperId === w.id ? "ring-sky-500" : "ring-transparent hover:ring-black/15 dark:hover:ring-white/25",
                )}
                style={{ backgroundImage: w.css }}
                title={w.name}
              >
                {wallpaperId === w.id && (
                  <span className="absolute right-0.5 top-0.5 flex size-3.5 items-center justify-center rounded-full bg-sky-500 text-white">
                    <Check className="size-2.5" />
                  </span>
                )}
              </button>
            ))}
          </div>
        </CcCard>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Profile dropdown — the PERSONAL half: profile, MCP, guide, shell switch and
 * sign-out. Settings/theme/language/wallpaper moved to [`ControlCenterDark`].
 */
export function UserMenuDark() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const username = useAuth((s) => s.username);
  const logout = useAuth((s) => s.logout);
  const resetTabs = useTabs((s) => s.reset);
  const openTab = useTabs((s) => s.open);
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 items-center gap-1 rounded-lg pl-1 pr-1.5 text-white transition-colors hover:bg-white/10"
        >
          {me?.avatar ? (
            <img src={me.avatar} alt="" className="size-7 rounded-full object-cover" />
          ) : (
            <span className="flex size-7 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-xs font-semibold text-white">
              {(username ?? "?").slice(0, 2).toUpperCase()}
            </span>
          )}
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-1 p-2">
        {/* Identity */}
        <div className="flex items-center gap-2.5 px-1 pb-1 pt-0.5">
          {me?.avatar ? (
            <img src={me.avatar} alt="" className="size-9 rounded-full object-cover" />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-blue-600 text-xs font-semibold text-white">
              {(username ?? "?").slice(0, 2).toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">{username ?? "—"}</div>
            <div className="text-xs text-muted-foreground">AIBA Cloud</div>
          </div>
        </div>

        {/* Profile — open the profile page (avatar upload lives there) */}
        <button
          type="button"
          onClick={() => { openTab("/me"); setOpen(false); }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          <UserRound className="size-4 text-muted-foreground" />
          {t("me.title", { defaultValue: "Mening profilim" })}
        </button>

        {/* MCP — self-service: connect an AI client to your modules. */}
        <button
          type="button"
          onClick={() => { openTab("/mcp"); setOpen(false); }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Plug className="size-4 text-muted-foreground" />
          {t("mcp.menu", { defaultValue: "MCP" })}
        </button>

        {/* User guide — MD docs shipped with the code, wiki-style reader. */}
        <button
          type="button"
          onClick={() => { openTab("/guide"); setOpen(false); }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          <BookOpen className="size-4 text-muted-foreground" />
          {t("guide.title", { defaultValue: "Qo'llanma" })}
        </button>

        {/* Switch shells (persistent cookie; nginx picks the entry). The same
            menu is reused on mobile, where the item flips direction. */}
        <button
          type="button"
          onClick={() => {
            const toMobile = !(window as { __AIBA_MOBILE__?: boolean }).__AIBA_MOBILE__;
            document.cookie = `aiba_view=${toMobile ? "mobile" : "desktop"};path=/;max-age=31536000`;
            window.location.href = "/";
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Smartphone className="size-4 text-muted-foreground" />
          {(window as { __AIBA_MOBILE__?: boolean }).__AIBA_MOBILE__
            ? t("mobile.desktopVersion", { defaultValue: "Desktop versiya" })
            : t("mobile.mobileVersion", { defaultValue: "Mobil versiya" })}
        </button>

        <div className="my-1 h-px bg-border" />

        {/* Sign out */}
        <button
          type="button"
          onClick={() => { setOpen(false); resetTabs(); logout(); }}
          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
        >
          <LogOut className="size-4" /> {t("auth.logout")}
        </button>
      </PopoverContent>
    </Popover>
  );
}
