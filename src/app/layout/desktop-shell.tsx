import { useEffect } from "react";
import { Briefcase } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTabs } from "@/shared/store/tabs";
import { navMap } from "@/shared/store/tab-nav";
import { useHeartbeat } from "@/shared/api/authz";
import { useTheme } from "@/shared/store/theme";
import { ENTRY_URL } from "@/shared/entry-url";
import { TabsHost } from "./tabs-host";
import { PoweredByAiba } from "./aiba-logo";

/**
 * Оболочка mini-app «Аналитика бизнеса» внутри ДБО Kapital Business:
 * фиксированный хидер банка (72px) + сайдбар банка (240px) — статичный
 * макет ДБО, в котором работает только пункт «Аналитика бизнеса» (наше
 * приложение). Контент — светлый (#F3F4F6), карточки белые, акцент #7000FF.
 */
export function DesktopShell() {
  const tabs = useTabs((s) => s.tabs);
  const open = useTabs((s) => s.open);
  const openNew = useTabs((s) => s.openNew);
  const setActive = useTabs((s) => s.setActive);
  const setTheme = useTheme((s) => s.setTheme);

  // Presence ping while logged in.
  useHeartbeat();

  // Mini-app ДБО всегда светлый.
  useEffect(() => {
    setTheme("light");
  }, [setTheme]);

  // Seed the first tab from the entry URL (deep links still work).
  useEffect(() => {
    const full = ENTRY_URL;
    const p = full.split("?")[0];
    if (tabs.length === 0) {
      open(p.startsWith("/") ? full : "/");
    } else if (p.startsWith("/") && full !== "/") {
      const exact = useTabs.getState().tabs.find((t) => t.path === full);
      if (exact) setActive(exact.id);
      else openNew(full);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
        <KbHeader />
        <div className="flex min-h-0 flex-1">
          <KbSidebar />
          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 flex-col">
              <TabsHost />
            </div>
          </main>
        </div>
      </div>
      {/* «Работает на AIBA» — язычок-вкладка, торчит снизу справа поверх всего */}
      <div className="fixed bottom-0 right-8 z-50">
        <PoweredByAiba />
      </div>
    </TooltipProvider>
  );
}

/** Фиксированный хидер ДБО (72px, белый): uzum business | KAPITALBANK. */
function KbHeader() {
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between bg-white px-6">
      {/* Кобренд-лого (официальный SVG: uzum | KAPITALBANK) */}
      <div className="flex items-center gap-5">
        <img src="/kb-logo.svg" alt="uzum business | KAPITALBANK" className="h-6 w-auto select-none" draggable={false} />
        {/* Статус операционного дня */}
        <span className="flex items-center gap-2 rounded-2xl bg-[#EFFADC] px-4 py-2.5 text-[15px] font-medium text-[#101010]">
          <span className="flex size-[18px] items-center justify-center rounded-full bg-[#09B849] text-[11px] font-bold text-white">✓</span>
          Опер. день открыт
        </span>
      </div>

      {/* Аккаунт организации (фиксированная компания пилота) */}
      <button
        type="button"
        className="flex items-center gap-3 rounded-2xl px-2 py-1.5 transition-colors hover:bg-[#F3F4F6]"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-[#F0F1F3]">
          <Briefcase className="size-5 text-[#101010]" />
        </span>
        <span className="min-w-0 text-left leading-tight">
          <span className="block max-w-[240px] truncate text-[16px] font-bold text-[#101010]">OOO «BARAKA SAVDO»</span>
          <span className="block text-[13px] text-[#83888B]">ИНН 305123456 • МФО 00450</span>
        </span>
      </button>
    </header>
  );
}

type KbNavItem = {
  label: string;
  active?: boolean; // «Аналитика бизнеса» — наш mini-app
};
type KbNavSection = { title?: string; items: KbNavItem[] };

// Пункты ДБО из макета — текстовые, без иконок.
const KB_NAV: KbNavSection[] = [
  {
    items: [
      { label: "Главная" },
      { label: "Сервисы" },
      { label: "Аналитика бизнеса", active: true },
    ],
  },
  {
    title: "ПЛАТЕЖИ",
    items: [
      { label: "Новый платёж" },
      { label: "Шаблоны" },
      { label: "На подписании" },
      { label: "В истории" },
      { label: "Будущие платежи" },
    ],
  },
  {
    title: "ПРОДУКТЫ",
    items: [{ label: "Счета и карты" }, { label: "Депозиты" }],
  },
  {
    title: "ЗАРПЛАТНЫЙ ПРОЕКТ",
    items: [{ label: "Ведомость" }],
  },
  {
    title: "ДРУГОЕ",
    items: [
      { label: "Выписки" },
      { label: "Справочники" },
      { label: "Контракты" },
      { label: "Картотека и требования" },
      { label: "Настройки" },
    ],
  },
];

/**
 * Сайдбар ДБО (240px, белый). Статичный макет банка: кликабелен только пункт
 * «Аналитика бизнеса» — он возвращает на главный экран mini-app.
 */
function KbSidebar() {
  const goAnalytics = () => {
    const s = useTabs.getState();
    const launcher = s.tabs.find((t) => t.path.split("?")[0] === "/");
    if (launcher) {
      useTabs.setState({ tabs: [launcher], activeId: launcher.id });
    } else if (s.activeId) {
      const nav = navMap.get(s.activeId);
      if (nav) nav("/");
      else s.setPath(s.activeId, "/");
      useTabs.setState({ tabs: s.tabs.filter((t) => t.id === s.activeId) });
    }
  };

  return (
    <aside className="flex w-[240px] shrink-0 flex-col overflow-y-auto border-r border-[#EDEEF0] bg-white py-4">
      {KB_NAV.map((section, si) => (
        <div key={si} className="px-4 pb-2">
          {section.title && (
            <div className="px-4 pb-1.5 pt-4 text-[12px] font-medium tracking-[0.04em] text-[#9DA4A8]">
              {section.title}
            </div>
          )}
          {section.items.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.active ? goAnalytics : undefined}
              className={cn(
                "block w-full rounded-2xl px-4 py-2.5 text-left text-[16px] transition-colors",
                item.active
                  ? "bg-[var(--kb-accent-soft)] font-medium text-primary"
                  : "cursor-default text-[#101010]",
              )}
            >
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}

