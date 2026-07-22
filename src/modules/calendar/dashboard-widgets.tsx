// Dashboard widget contributed by the Calendar module: the coming week's events
// merged with tasks due, sorted by time. Consumed by the dashboard registry.
import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCompany } from "@/shared/store/company";
import { Badge } from "@/components/ui/badge";
import {
  WidgetCard,
  EmptyRow,
  ListSkeleton,
  type WidgetDef,
} from "@/modules/dashboard/widget-kit";
import { useEvents, useTasksDue } from "./api";

type Row = { id: string; title: string; at: string; kind: "event" | "task" };

function CalendarWidget() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? undefined;
  const { from, to } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);
  const eventsQ = useEvents(companyId, from, to);
  const tasksQ = useTasksDue(companyId, from, to);

  const rows: Row[] = useMemo(() => {
    const ev: Row[] = (eventsQ.data ?? []).map((e) => ({
      id: `e:${e.id}`,
      title: e.title,
      at: e.startsAt,
      kind: "event",
    }));
    const tk: Row[] = (tasksQ.data ?? [])
      .filter((task) => !task.done)
      .map((task) => ({ id: `t:${task.id}`, title: task.title, at: task.due, kind: "task" as const }));
    return [...ev, ...tk].sort((a, b) => a.at.localeCompare(b.at)).slice(0, 6);
  }, [eventsQ.data, tasksQ.data]);

  const loading = eventsQ.isLoading || tasksQ.isLoading;
  const fmt = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <WidgetCard
      title={t("modules.dashboard.widget.calendar", { defaultValue: "Kalendar" })}
      icon={<CalendarClock className="size-4" />}
      footer={
        <Link to="/calendar" className="hover:underline">
          {t("modules.dashboard.footer.goToCalendar", { defaultValue: "Kalendarga o'tish" })}
        </Link>
      }
    >
      {!companyId ? (
        <EmptyRow text={t("modules.dashboard.pickCompany", { defaultValue: "Kompaniyani tanlang" })} />
      ) : loading ? (
        <ListSkeleton rows={4} />
      ) : !rows.length ? (
        <EmptyRow text={t("modules.dashboard.empty.noEvents", { defaultValue: "Yaqin kunlarda tadbir yo'q" })} />
      ) : (
        <ul className="space-y-1.5 animate-in fade-in-0 duration-300">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium text-foreground">{r.title}</div>
                <div className="truncate text-muted-foreground">{fmt(r.at)}</div>
              </div>
              <Badge variant={r.kind === "task" ? "warning" : "info"}>
                {r.kind === "task"
                  ? t("modules.dashboard.labels.task", { defaultValue: "Vazifa" })
                  : t("modules.dashboard.labels.event", { defaultValue: "Tadbir" })}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

export const WIDGETS: WidgetDef[] = [
  {
    type: "calendar",
    module: "calendar",
    titleKey: "modules.dashboard.widget.calendar",
    title: "Kalendar",
    icon: CalendarClock,
    defaultColspan: 1,
    Component: CalendarWidget,
  },
];
