import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Icons from "lucide-react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useTabs } from "@/shared/store/tabs";
import { useSidebar } from "@/shared/store/sidebar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { NAV_TOP, ADMIN_ITEMS, SUPERADMIN_ITEMS, type NavLeaf, type NavTop } from "./nav-config";
import { useMe } from "@/shared/api/me";
import { usePerm } from "@/shared/api/authz";
import { useModules } from "@/shared/modules";
import { LogoSlot } from "./logo-slot";

function icon(name: string) {
  return (
    (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ??
    Icons.Square
  );
}

function useLabel() {
  const { t } = useTranslation();
  return (e: { label?: string; title?: string; labelKey?: string }) => {
    const fallback = (e.title ?? e.label) || "";
    return e.labelKey ? t(e.labelKey, { defaultValue: fallback }) : fallback;
  };
}

// The single active leaf is the one whose `to` is the LONGEST prefix of (or
// exactly equal to) the current path — so sibling sub-routes that share a module
// root (e.g. every `/settings/*` tab) resolve to exactly ONE active item
// instead of all lighting up together.
function bestMatch(activePath: string | null, candidates: string[]): string | null {
  if (!activePath) return null;
  const clean = activePath.split("?")[0];
  let best: string | null = null;
  for (const c of candidates) {
    if (!c || c === "#") continue;
    if (clean === c || clean.startsWith(c + "/")) {
      if (!best || c.length > best.length) best = c;
    }
  }
  return best;
}

// A top rail item is active when it owns the currently-active leaf (or is itself
// a direct link to it).
function topActive(top: NavTop, match: string | null): boolean {
  if (!match) return false;
  if (top.to && top.to !== "#") return top.to === match;
  return (top.columns ?? []).some((c) => c.items.some((l) => l.to === match));
}

// Rail item = icon with its label stacked underneath (reference layout).
// Over the photo wallpaper we tint by OPACITY (white at varying alpha), never by
// a fixed grey, so items stay legible on any part of the background.
const railBtn =
  "group relative flex w-full flex-col items-center gap-1 rounded-xl px-1 py-2 text-center text-[10px] font-medium leading-tight text-white transition [&_svg]:size-[22px]";

const ITEM_ACTIVE = "bg-white/10 text-white";
const ITEM_IDLE = "text-white/65 hover:bg-white/10 hover:text-white";
const ITEM_DISABLED = "cursor-default text-white/25";

export function SidebarNav() {
  const { t } = useTranslation();
  const label = useLabel();
  const open = useTabs((s) => s.open);
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const { data: me } = useMe();
  const isSuperadmin = !!me?.is_superadmin;
  const collapsed = useSidebar((s) => s.collapsed);
  const toggleSidebar = useSidebar((s) => s.toggle);

  // Two-axis module gating:
  //   1. superadmin `disabled_modules` — the module is turned OFF for this tenant.
  //   2. RBAC — the user lacks `<slug>.view` for a native module.
  // A leaf shows only when both pass. Superadmin/privileged see everything;
  // non-module leaves (rdp, settings, invite…) are never permission-gated.
  const { canModule, privileged, ready: permReady } = usePerm();
  const { data: modules } = useModules();
  const nativeSlugs = useMemo(
    () => new Set((modules ?? []).filter((m) => m.state === "native").map((m) => m.slug)),
    [modules],
  );
  const navTop = useMemo(() => {
    const hidden = new Set(me?.disabled_modules ?? []);
    const allowed = (slug?: string) => {
      if (!slug) return true;
      if (hidden.has(slug) && !isSuperadmin) return false;
      // RBAC: only gate native modules, and only once perms have loaded
      // (avoid a flash of hidden items while /authz/me is in flight).
      if (privileged || !permReady || !nativeSlugs.has(slug)) return true;
      return canModule(slug);
    };
    return NAV_TOP.flatMap((top) => {
      if (top.columns) {
        const columns = top.columns
          .map((c) => ({ ...c, items: c.items.filter((l) => allowed(l.slug)) }))
          .filter((c) => c.items.length > 0);
        return columns.length ? [{ ...top, columns }] : [];
      }
      return allowed(top.slug) ? [top] : [];
    });
  }, [me?.disabled_modules, isSuperadmin, privileged, permReady, nativeSlugs, canModule]);

  const activePath = tabs.find((x) => x.id === activeId)?.path ?? null;

  // Every navigable target (mega-menu leaves + direct top links + settings
  // flyout items). The active one is the longest-prefix match of the URL.
  const activeMatch = useMemo(() => {
    const candidates: string[] = [];
    for (const top of NAV_TOP) {
      if (top.to) candidates.push(top.to);
      for (const c of top.columns ?? []) for (const l of c.items) candidates.push(l.to);
    }
    for (const l of ADMIN_ITEMS) candidates.push(l.to);
    for (const l of SUPERADMIN_ITEMS) candidates.push(l.to);
    return bestMatch(activePath, candidates);
  }, [activePath]);

  const openTab = (to: string) => {
    open(to);
    setOpenKey(null);
  };

  // Flyout leaf (inside the white mega-menu panel) — icon + title + description,
  // 1:1 with the cloud dropdown.
  const Leaf = ({ leaf }: { leaf: NavLeaf }) => {
    const LeafIcon = icon(leaf.icon);
    const active = leaf.to === activeMatch;
    const soon = !!leaf.disabled;
    const desc = leaf.descKey ? t(leaf.descKey, { defaultValue: leaf.desc ?? "" }) : leaf.desc;
    const inner = (
      <button
        type="button"
        onClick={soon ? undefined : () => openTab(leaf.to)}
        aria-disabled={soon || undefined}
        className={cn(
          "flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left transition-colors",
          soon
            ? "cursor-default opacity-50"
            : active ? "bg-primary/10" : "hover:bg-black/5 dark:hover:bg-white/10",
        )}
      >
        <LeafIcon className={cn("mt-0.5 size-5 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm font-medium leading-tight", active ? "text-primary" : "text-foreground")}>
            {label(leaf)}
          </span>
          {desc && (
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{desc}</span>
          )}
        </span>
      </button>
    );
    if (!soon) return inner;
    return (
      <Tooltip>
        <TooltipTrigger asChild>{inner}</TooltipTrigger>
        <TooltipContent side="right">{t("nav.soon")}</TooltipContent>
      </Tooltip>
    );
  };

  return (
    <nav
      className={cn(
        "flex h-full flex-col items-center gap-1 py-3 transition-[width] duration-200",
        collapsed ? "w-[60px]" : "w-[88px]",
      )}
    >
      {/* Logo — AIBA monogram, no outer container box */}
      <button
        type="button"
        onClick={() => openTab("/dashboard")}
        className="mb-1 flex items-center justify-center"
        aria-label="AIBA"
      >
        <LogoSlot collapsed={collapsed} />
      </button>

      <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {navTop.map((top) => {
          const TopIcon = icon(top.icon);
          const active = topActive(top, activeMatch);
          const topLabel = label(top);

          if (top.disabled) {
            return (
              <Tooltip key={top.key}>
                <TooltipTrigger asChild>
                  <span className={cn(railBtn, ITEM_DISABLED)}>
                    <TopIcon />
                    {!collapsed && <span className="line-clamp-2 w-full">{topLabel}</span>}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">{t("nav.soon")}</TooltipContent>
              </Tooltip>
            );
          }

          // Direct link (no dropdown)
          if (top.to && !top.columns) {
            return (
              <button
                key={top.key}
                type="button"
                onClick={() => openTab(top.to!)}
                className={cn(railBtn, active ? ITEM_ACTIVE : ITEM_IDLE)}
              >
                <TopIcon />
                {!collapsed && <span className="line-clamp-2 w-full">{topLabel}</span>}
              </button>
            );
          }

          // Mega-flyout
          const isOpen = openKey === top.key;
          return (
            <Popover key={top.key} open={isOpen} onOpenChange={(o) => setOpenKey(o ? top.key : null)}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(railBtn, active || isOpen ? ITEM_ACTIVE : ITEM_IDLE)}
                >
                  <TopIcon />
                  {!collapsed && <span className="line-clamp-2 w-full">{topLabel}</span>}
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="right"
                align="start"
                sideOffset={12}
                className="w-auto p-3"
              >
                <div className="px-1 pb-2 text-sm font-semibold text-foreground">{topLabel}</div>
                <div className="flex gap-4">
                  {(top.columns ?? []).map((col) => (
                    <div key={col.key} className="min-w-[240px] max-w-[260px] space-y-0.5">
                      <div className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.5px] text-muted-foreground">
                        {label(col)}
                      </div>
                      {col.items.map((l) => <Leaf key={l.key} leaf={l} />)}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          );
        })}
      </div>

      {/* Collapse toggle — icon-only ↔ full rail. Choice persists (localStorage).
          Settings moved into the profile menu (topbar). */}
      <button
        type="button"
        onClick={toggleSidebar}
        className={cn(railBtn, ITEM_IDLE, "mt-1")}
        aria-label={t(collapsed ? "nav.expand" : "nav.collapse", { defaultValue: collapsed ? "Kengaytirish" : "Yig'ish" })}
        title={t(collapsed ? "nav.expand" : "nav.collapse", { defaultValue: collapsed ? "Kengaytirish" : "Yig'ish" })}
      >
        {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
      </button>
    </nav>
  );
}
