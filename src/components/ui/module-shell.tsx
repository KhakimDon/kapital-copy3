/**
 * In-module layout в стиле ДБО Kapital Business (B2B Components):
 * заголовок страницы (32px bold) + горизонтальные табы-пилюли разделов
 * (активная — чёрная #101010, остальные серые #F0F1F3) + контент.
 * Контент центрирован на 1200px, как на главном экране «Аналитика бизнеса».
 *
 * Sections can be state-driven (active + onSelect) OR route-driven (section.to
 * → NavLink). Mix as needed.
 */
import * as React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ExternalLink, AppWindow, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useTabs } from "@/shared/store/tabs";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type ModuleSection = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  to?: string;            // route-driven section (NavLink)
  end?: boolean;          // exact match for NavLink
  badge?: React.ReactNode;
  /** URL for the right-click "open in new tab / new window" menu. */
  menuTo?: string;
  /** Optional group key — kept for API-compat, в KB-табах не рисуется. */
  group?: string;
  groupLabel?: string;
};

// Underline-табы Kapitalbank: активный — чёрный текст с фиолетовым
// подчёркиванием, неактивные — серые (страница «Сотрудники» в B2B Components).
const itemBase =
  "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent pb-3 pt-1 text-[15px] font-medium transition-colors [&_svg]:hidden";
const itemActive = "border-primary text-[#101010]";
const itemIdle = "text-[#83888B] hover:text-[#101010]";

export function ModuleShell({
  sections,
  active,
  onSelect,
  title,
  icon,
  subtitle,
  actions,
  children,
}: {
  sections: ModuleSection[];
  active?: string;
  onSelect?: (key: string) => void;
  title: string;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const openNewTab = useTabs((s) => s.openNew);
  void icon; // KB-стиль: без иконки в заголовке

  const renderSection = (s: ModuleSection) => {
    const inner = s.to ? (
      <NavLink
        to={s.to}
        end={s.end}
        className={({ isActive }) => cn(itemBase, isActive ? itemActive : itemIdle)}
      >
        <span>{s.label}</span>
        {s.badge}
      </NavLink>
    ) : (
      <button
        type="button"
        onClick={() => onSelect?.(s.key)}
        className={cn(itemBase, active === s.key ? itemActive : itemIdle)}
      >
        <span>{s.label}</span>
        {s.badge}
      </button>
    );
    if (!s.menuTo) return <React.Fragment key={s.key}>{inner}</React.Fragment>;
    return (
      <ContextMenu key={s.key}>
        <ContextMenuTrigger asChild>{inner}</ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem onSelect={() => openNewTab(s.menuTo!)}>
            <ExternalLink />
            {t("nav.openNewTab", { defaultValue: "Открыть в новой вкладке" })}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => window.open(window.location.origin + s.menuTo!, "_blank")}>
            <AppWindow />
            {t("nav.openNewWindow", { defaultValue: "Открыть в новом окне" })}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  return (
    <div className="w-full -mt-4">
      {/* Хлебные крошки (Breadcrumbs из B2B Components): корень — mini-app. */}
      <Breadcrumbs current={title} />
      {/* Единый белый контейнер страницы (как «Сотрудники» в B2B Components) */}
      <div className="rounded-[24px] bg-white p-7">
        {/* Заголовок страницы + действия */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => nav("/")}
              title={t("nav.back", { defaultValue: "Назад" })}
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-[#EDEEF0] text-[#101010] transition-colors hover:bg-[#F3F4F6]"
            >
              <ArrowLeft className="size-5" />
            </button>
            <h1 className="flex items-baseline gap-3 text-[28px] font-bold leading-9 text-[#101010]">
              {title}
              {subtitle && <span className="text-[15px] font-normal text-[#83888B]">{subtitle}</span>}
            </h1>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>

        {/* Underline-табы разделов */}
        {sections.length > 0 && (
          <div className="mb-5 flex items-center gap-6 border-b border-[#EDEEF0]">
            {sections.map((s) => (
              <React.Fragment key={s.key}>{renderSection(s)}</React.Fragment>
            ))}
          </div>
        )}

        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </div>
  );
}

/** Хлебные крошки в стиле B2B Components: серые ссылки › чёрный текущий. */
function Breadcrumbs({ current }: { current: string }) {
  const nav = useNavigate();
  return (
    <nav className="mb-3 flex items-center gap-1.5 px-2 pt-2 text-[14px]">
      <button
        type="button"
        onClick={() => nav("/")}
        className="text-[#83888B] transition-colors hover:text-[#101010]"
      >
        Аналитика бизнеса
      </button>
      <ChevronRight className="size-3.5 text-[#C5C7CA]" />
      <span className="font-medium text-[#101010]">{current}</span>
    </nav>
  );
}
