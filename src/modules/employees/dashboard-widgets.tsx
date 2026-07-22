// Dashboard widgets contributed by the Employees/HR module: the caller's own
// attendance for today (arrival / lateness / check-out) and a small HR KPI
// strip (headcount / on-leave). Consumed by the dashboard registry.
import { Clock, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCompany } from "@/shared/store/company";
import {
  WidgetCard,
  EmptyRow,
  ListSkeleton,
  num,
  type WidgetDef,
} from "@/modules/dashboard/widget-kit";
import { useMyAttendance } from "@/modules/dashboard/dashboard-api";
import { useEmployees } from "./api";

// ── attendance — the new arrival/lateness card ───────────────────────────────

function AttendanceWidget() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;
  const q = useMyAttendance(companyId);
  const a = q.data;

  if (!companyId)
    return (
      <WidgetCard title={t("modules.dashboard.widget.attendance", { defaultValue: "Davomat" })} icon={<Clock className="size-4" />}>
        <EmptyRow text={t("modules.dashboard.pickCompany", { defaultValue: "Kompaniyani tanlang" })} />
      </WidgetCard>
    );

  if (q.isLoading)
    return (
      <WidgetCard title={t("modules.dashboard.widget.attendance", { defaultValue: "Davomat" })} icon={<Clock className="size-4" />}>
        <ListSkeleton rows={3} />
      </WidgetCard>
    );

  if (!a || !a.matched)
    return (
      <WidgetCard title={t("modules.dashboard.widget.attendance", { defaultValue: "Davomat" })} icon={<Clock className="size-4" />}>
        <EmptyRow text={t("modules.dashboard.attendance.noMatch", { defaultValue: "Davomat ma'lumoti topilmadi" })} />
      </WidgetCard>
    );

  const onTime = a.status === "present";
  const late = a.status === "late";
  const absent = a.status === "absent";
  const accent = onTime ? "border-l-success" : late ? "border-l-warning" : "border-l-destructive";
  const pill = onTime
    ? { cls: "bg-success/15 text-success", text: t("modules.dashboard.attendance.present", { defaultValue: "Keldi" }) }
    : late
      ? {
          cls: "bg-warning/15 text-warning",
          text: t("modules.dashboard.attendance.late", {
            defaultValue: "Kechikdi {{n}} daqiqa",
            n: a.lateMinutes,
          }),
        }
      : { cls: "bg-destructive/15 text-destructive", text: t("modules.dashboard.attendance.absent", { defaultValue: "Kelmadi" }) };

  return (
    <WidgetCard
      title={t("modules.dashboard.widget.attendance", { defaultValue: "Davomat" })}
      icon={<Clock className="size-4" />}
      accent={accent}
    >
      <div className="animate-in fade-in-0 duration-300">
        <div className="text-xs text-muted-foreground">
          {t("modules.dashboard.attendance.today", { defaultValue: "Bugun" })}
        </div>
        <div className="text-3xl font-semibold tabular-nums leading-tight">
          {absent ? "—" : a.arrived ?? "—"}
        </div>
        <div className="mt-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${pill.cls}`}>
            {pill.text}
          </span>
        </div>
        <div className="mt-3 space-y-1 text-xs text-muted-foreground">
          {a.scheduleStart && (
            <div>
              {t("modules.dashboard.attendance.scheduleStart", { defaultValue: "Ish boshlanishi" })}: {a.scheduleStart}
            </div>
          )}
          {a.checkOut && (
            <div>
              {t("modules.dashboard.attendance.checkOut", { defaultValue: "Ketish" })}: {a.checkOut}
            </div>
          )}
        </div>
      </div>
    </WidgetCard>
  );
}

// ── hr_kpi — headcount / on-leave mini KPIs ──────────────────────────────────

const ACTIVE_STATUSES = new Set(["active", "working", "hired"]);

function HrKpiWidget() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;
  const q = useEmployees(companyId, {});
  const items = q.data?.items ?? [];
  const total = q.data?.count ?? items.length;
  const active = items.filter((e) => ACTIVE_STATUSES.has((e.status || "").toLowerCase())).length;
  const onLeave = items.filter((e) => {
    const s = (e.status || "").toLowerCase();
    return s.includes("leave") || s.includes("vacation") || s.includes("otpusk");
  }).length;

  return (
    <WidgetCard
      title={t("modules.dashboard.widget.hr_kpi", { defaultValue: "HR ko'rsatkichlari" })}
      icon={<Users className="size-4" />}
      footer={
        <Link to="/employees" className="hover:underline">
          {t("modules.dashboard.footer.goToEmployees", { defaultValue: "Xodimlar" })}
        </Link>
      }
    >
      {!companyId ? (
        <EmptyRow text={t("modules.dashboard.pickCompany", { defaultValue: "Kompaniyani tanlang" })} />
      ) : q.isLoading ? (
        <ListSkeleton rows={3} />
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center animate-in fade-in-0 duration-300">
          <div>
            <div className="text-2xl font-semibold tabular-nums">{num(total)}</div>
            <div className="text-[11px] text-muted-foreground">
              {t("modules.dashboard.hr.headcount", { defaultValue: "Jami" })}
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold tabular-nums text-success">{num(active)}</div>
            <div className="text-[11px] text-muted-foreground">
              {t("modules.dashboard.hr.active", { defaultValue: "Faol" })}
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold tabular-nums text-warning">{num(onLeave)}</div>
            <div className="text-[11px] text-muted-foreground">
              {t("modules.dashboard.hr.onLeave", { defaultValue: "Ta'tilda" })}
            </div>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

export const WIDGETS: WidgetDef[] = [
  {
    type: "attendance",
    module: "attendance",
    titleKey: "modules.dashboard.widget.attendance",
    title: "Davomat",
    icon: Clock,
    defaultColspan: 1,
    Component: AttendanceWidget,
  },
  {
    type: "hr_kpi",
    module: "employees",
    titleKey: "modules.dashboard.widget.hr_kpi",
    title: "HR ko'rsatkichlari",
    icon: Users,
    defaultColspan: 1,
    Component: HrKpiWidget,
  },
];
