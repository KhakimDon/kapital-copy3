import { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BookOpen, FolderOpen, Home, ListTodo, Menu } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useCompany } from "@/shared/store/company";
import { useMyCompanies } from "@/shared/companies";
import { useTabs } from "@/shared/store/tabs";
import { useWallpaper, wallpaperCss } from "@/shared/store/wallpaper";
import { TabRoutes } from "@/app/layout/tab-routes";
import { CompanyPickerDark, ControlCenterDark, Notifications, UserMenuDark } from "@/app/layout/topbar";
import { AibaLogo } from "@/app/layout/aiba-logo";
import { MatrixLogo } from "@/app/layout/matrix-logo";
import { useIsDeploying } from "@/shared/api/gitlab";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useNotificationsSocket } from "@/shared/notifications/ws";
import { NotificationsToastHost } from "@/shared/notifications/toast-host";
import { MobileMore } from "./more";

/** Mobile shell — the SAME design language as the desktop: dark wallpaper
 *  backdrop, the web topbar pieces (company pill, bell, profile menu) over it,
 *  a white rounded content "window", and a dark bottom nav echoing the left
 *  rail. Module pages come from the desktop route table (TabRoutes), so every
 *  screen matches the web 1:1. */

export function MobileShell() {
  return (
    // TooltipProvider: module pages (tasks board etc.) use Tooltip and CRASH
    // without it — the desktop shell provides it, so must we.
    <TooltipProvider delayDuration={300}>
      <BrowserRouter>
        <ShellBody />
      </BrowserRouter>
    </TooltipProvider>
  );
}

/** Paths owned by the mobile shell (skip the desktop table there — it also
 *  defines "/"). */
const MOBILE_OWNED = ["/", "/more"];

function ShellBody() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const wallpaperId = useWallpaper((s) => s.id);

  // Instagram-style nav: scrolling DOWN compacts the bar (icons only),
  // scrolling UP (or being near the top) expands it back.
  const [navCompact, setNavCompact] = useState(false);
  const lastY = useRef(0);
  const onScroll = (e: React.UIEvent<HTMLElement>) => {
    const y = e.currentTarget.scrollTop;
    const dy = y - lastY.current;
    if (y < 32) setNavCompact(false);
    else if (dy > 6) setNavCompact(true);
    else if (dy < -6) setNavCompact(false);
    lastY.current = y;
  };

  // Bridge: components written for the desktop tab shell call useTabs.open().
  // On mobile that's just a navigation — watch the store and translate. Only
  // genuine CHANGES navigate (persisted desktop tabs are left untouched).
  const navRef = useRef(navigate);
  navRef.current = navigate;
  useEffect(() => {
    const unsub = useTabs.subscribe((s, prev) => {
      const active = s.tabs.find((t) => t.id === s.activeId);
      const prevActive = prev.tabs.find((t) => t.id === prev.activeId);
      if (active?.path && active.path !== prevActive?.path) {
        navRef.current(active.path);
      }
    });
    return unsub;
  }, []);

  // Auto-pick the first company so company-scoped pages work immediately.
  const current = useCompany((s) => s.current);
  const setCurrent = useCompany((s) => s.setCurrent);
  const { data: companies } = useMyCompanies();
  useEffect(() => {
    if (!current && companies?.items?.length) setCurrent(companies.items[0]);
  }, [current, companies, setCurrent]);

  // Global notifications socket + toast host (shared with the desktop shell).
  useNotificationsSocket();

  const ownPath = MOBILE_OWNED.includes(pathname);

  return (
    <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-background">
      {/* Wallpaper + tint — a TOP band only (behind the header + the content
          sheet's rounded top). The rest of the frame is bg-background, so any
          iOS dvh/toolbar mismatch at the BOTTOM shows white, never the
          wallpaper leaking under the floating nav. */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-cover bg-center"
        style={{ backgroundImage: wallpaperCss(wallpaperId) }}
      />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[#0a1a2e]/35 dark:bg-[#060f1c]/65" />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        {/* Top bar — the web topbar pieces over the wallpaper. */}
        <header className="flex items-center gap-1.5 px-2 py-2">
          <MobileLogo />
          <span className="min-w-0 flex-1" />
          <CompanyPickerDark />
          <Notifications />
          <ControlCenterDark />
          <UserMenuDark />
        </header>

        {/* Content window — white rounded sheet, like the desktop tab box. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-[20px] bg-background">
          <main onScroll={onScroll} className="min-w-0 flex-1 overflow-y-auto p-6 pb-28">
            <ErrorBoundary label={pathname}>
              <Routes>
                {/* Home = the same page the desktop opens first (AI dashboard). */}
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/more" element={<MobileMore />} />
              </Routes>
              {/* Everything else: the full desktop route table. */}
              {!ownPath && <TabRoutes />}
            </ErrorBoundary>
          </main>
        </div>
      </div>

      <BottomNav compact={navCompact} />

      {/* macOS-style notification toasts (top-right, above the mobile frame). */}
      <NotificationsToastHost />
    </div>
  );
}

/** Header logo, deploy-aware (same behavior as the desktop LogoSlot): while a
 *  pipeline is running the static mark swaps to the matrix build-up animation.
 *  Resting state stays the lightweight static SVG (no webm fetch on mobile). */
function MobileLogo() {
  const { building } = useIsDeploying();
  return (
    <span className="grid size-9 shrink-0 place-items-center">
      {building ? <MatrixLogo className="size-8" /> : <AibaLogo className="size-8" />}
    </span>
  );
}

function BottomNav({ compact }: { compact: boolean }) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(k, { defaultValue: d });
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const items = [
    { to: "/dashboard", icon: Home, label: tr("mobile.nav.home", "Asosiy") },
    { to: "/tasks", icon: ListTodo, label: tr("mobile.nav.tasks", "Vazifalar") },
    { to: "/files", icon: FolderOpen, label: tr("mobile.nav.files", "Fayllar") },
    { to: "/wiki", icon: BookOpen, label: tr("mobile.nav.wiki", "Wiki") },
    { to: "/more", icon: Menu, label: tr("mobile.nav.more", "Menyu") },
  ];

  return (
    // Instagram-style liquid-glass tab bar: ICONS ONLY (labels live in the
    // buttons' aria/title), the active icon sits in a soft neutral bubble,
    // and the whole pill shrinks while scrolling down / grows back up.
    <nav
      aria-label="Asosiy menyu"
      className={cn(
        // absolute (NOT fixed): anchored to the app frame. iOS Safari moves
        // the visual viewport when its toolbar collapses, so `fixed` elements
        // can drift off-screen / expose the backdrop — the root never scrolls
        // (main is the scroller), so absolute is already "fixed" visually.
        "liquid-glass absolute inset-x-4 z-50 flex h-[62px] items-stretch overflow-hidden rounded-full",
        "border border-white/40 dark:border-border",
        "transition-transform duration-300 ease-out will-change-transform",
      )}
      style={{
        bottom: "calc(env(safe-area-inset-bottom) + 10px)",
        // Instagram-style: the WHOLE pill scales down on scroll (width and
        // height together), anchored to the bottom edge — not just the icons.
        transform: compact ? "scale(0.84)" : "scale(1)",
        transformOrigin: "50% 100%",
      }}
    >
      {items.map((it) => {
        const active = pathname.startsWith(it.to);
        return (
          <button
            key={it.to}
            type="button"
            onClick={() => navigate(it.to)}
            title={it.label}
            aria-label={it.label}
            className="grid flex-1 place-items-center"
          >
            <span
              className={cn(
                // px-4: bubble = 26px icon + 32px = 58px — must fit a 1/5
                // slot on narrow phones (375 - insets = 343 → 68px/slot);
                // px-6 made it 74px and the edge bubbles got clipped.
                "grid place-items-center rounded-full px-4 py-2 transition-colors duration-300",
                active && "bg-foreground/[0.09] dark:bg-white/[0.14]",
              )}
            >
              <it.icon
                strokeWidth={active ? 2.3 : 1.9}
                className={cn(
                  "size-[26px] transition-colors duration-300",
                  active ? "text-foreground" : "text-foreground/50",
                )}
              />
            </span>
          </button>
        );
      })}
    </nav>
  );
}
