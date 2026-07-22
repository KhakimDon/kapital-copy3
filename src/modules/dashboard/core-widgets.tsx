// Core dashboard widgets that don't belong to a feature module: a generic
// settings-driven KPI, an AI insights teaser, a files-search digest and an
// activity/audit feed. These degrade to friendly placeholders where there is no
// live data source yet, and are always available (module: "dashboard").
import { Gauge, Sparkles, Search, History } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { WidgetCard, EmptyRow, type WidgetDef, type WidgetProps } from "./widget-kit";

// ── kpi — generic settings-driven metric ─────────────────────────────────────

function KpiWidget({ settings }: WidgetProps) {
  const { t } = useTranslation();
  const label = (settings?.label as string) || t("modules.dashboard.widget.kpi", { defaultValue: "Ko'rsatkich" });
  const value = settings?.value as string | number | undefined;
  return (
    <WidgetCard title={label} icon={<Gauge className="size-4" />}>
      {value == null || value === "" ? (
        <EmptyRow text={t("modules.dashboard.empty.noKpi", { defaultValue: "Qiymat sozlanmagan" })} />
      ) : (
        <div className="text-3xl font-bold tabular-nums leading-tight text-[#101010]">{String(value)}</div>
      )}
    </WidgetCard>
  );
}

// ── brain — AI insights teaser ───────────────────────────────────────────────

function BrainWidget() {
  const { t } = useTranslation();
  return (
    <WidgetCard
      title={t("modules.dashboard.widget.brain", { defaultValue: "AI tahlil" })}
      icon={<Sparkles className="size-4" />}
    >
      <div className="space-y-2 py-2">
        <p className="text-xs text-[#83888B]">
          {t("modules.dashboard.brain.hint", {
            defaultValue: "AIBA yordamchisi moliyaviy holatingiz bo'yicha tavsiyalar beradi.",
          })}
        </p>
        <Link
          to="/dash-old"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#F8F2FF] px-3 py-1.5 text-xs font-medium text-[#7000FF] hover:bg-[#EDE0FF]"
        >
          <Sparkles className="size-3.5" />
          {t("modules.dashboard.brain.ask", { defaultValue: "AI bilan suhbat" })}
        </Link>
      </div>
    </WidgetCard>
  );
}

// ── search_insights — files search digest (placeholder) ──────────────────────

function SearchInsightsWidget() {
  const { t } = useTranslation();
  return (
    <WidgetCard
      title={t("modules.dashboard.widget.search_insights", { defaultValue: "Qidiruv tahlili" })}
      icon={<Search className="size-4" />}
      footer={
        <Link to="/files" className="hover:underline">
          {t("modules.dashboard.footer.goToFiles", { defaultValue: "Fayllarga o'tish" })}
        </Link>
      }
    >
      <EmptyRow text={t("modules.dashboard.empty.comingSoon", { defaultValue: "Tez orada" })} />
    </WidgetCard>
  );
}

// ── audit — recent activity (placeholder) ────────────────────────────────────

function AuditWidget() {
  const { t } = useTranslation();
  return (
    <WidgetCard
      title={t("modules.dashboard.widget.audit", { defaultValue: "So'nggi harakatlar" })}
      icon={<History className="size-4" />}
    >
      <EmptyRow text={t("modules.dashboard.empty.comingSoon", { defaultValue: "Tez orada" })} />
    </WidgetCard>
  );
}

export const WIDGETS: WidgetDef[] = [
  {
    type: "kpi",
    module: "dashboard",
    titleKey: "modules.dashboard.widget.kpi",
    title: "Ko'rsatkich",
    icon: Gauge,
    defaultColspan: 1,
    Component: KpiWidget,
  },
  {
    type: "brain",
    module: "dashboard",
    titleKey: "modules.dashboard.widget.brain",
    title: "AI tahlil",
    icon: Sparkles,
    defaultColspan: 1,
    Component: BrainWidget,
  },
  {
    type: "search_insights",
    module: "files",
    titleKey: "modules.dashboard.widget.search_insights",
    title: "Qidiruv tahlili",
    icon: Search,
    defaultColspan: 1,
    Component: SearchInsightsWidget,
  },
  {
    type: "audit",
    module: "dashboard",
    titleKey: "modules.dashboard.widget.audit",
    title: "So'nggi harakatlar",
    icon: History,
    defaultColspan: 1,
    Component: AuditWidget,
  },
];
