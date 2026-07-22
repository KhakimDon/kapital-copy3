// Dashboard widgets contributed by the Tasks module: the caller's assigned
// tasks and their recent task notifications. Consumed by the dashboard registry.
import { ListTodo, Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCompany } from "@/shared/store/company";
import { useMe } from "@/shared/api/me";
import { Badge } from "@/components/ui/badge";
import { useNotifications } from "@/shared/api/notifications";
import {
  WidgetCard,
  EmptyRow,
  ListSkeleton,
  type WidgetDef,
} from "@/modules/dashboard/widget-kit";
import { useTasks } from "./api";
import { PRIORITY_VARIANT, type Task, type TaskPriority } from "./types";

// ── my_tasks ─────────────────────────────────────────────────────────────────

function MyTasksWidget() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;
  const me = useMe();
  const q = useTasks(companyId);
  const myId = me.data?.user_id ?? null;
  const mine = (q.data?.items ?? []).filter(
    (task: Task) =>
      myId != null &&
      task.assignee_user_id === myId &&
      task.status !== "done" &&
      task.status !== "archived",
  );
  return (
    <WidgetCard
      title={t("modules.dashboard.widget.my_tasks", { defaultValue: "Mening vazifalarim" })}
      icon={<ListTodo className="size-4" />}
      footer={
        <Link to="/tasks" className="hover:underline">
          {t("modules.dashboard.footer.allTasks", { defaultValue: "Barcha vazifalar" })}
        </Link>
      }
    >
      {!companyId ? (
        <EmptyRow text={t("modules.dashboard.pickCompany", { defaultValue: "Kompaniyani tanlang" })} />
      ) : q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : !mine.length ? (
        <EmptyRow text={t("modules.dashboard.empty.noTasks", { defaultValue: "Sizga vazifa biriktirilmagan" })} />
      ) : (
        <>
          <div className="mb-2 text-2xl font-semibold tabular-nums leading-tight">{mine.length}</div>
          <ul className="space-y-1.5 animate-in fade-in-0 duration-300">
            {mine.slice(0, 5).map((task: Task) => (
              <li key={task.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex-1 min-w-0 truncate font-medium text-foreground">{task.title}</span>
                <Badge variant={PRIORITY_VARIANT[task.priority as TaskPriority] ?? "muted"}>
                  {t(`modules.tasks.priority.${task.priority}`, { defaultValue: task.priority })}
                </Badge>
              </li>
            ))}
          </ul>
        </>
      )}
    </WidgetCard>
  );
}

// ── notifications ────────────────────────────────────────────────────────────

function NotificationsWidget() {
  const { t } = useTranslation();
  const q = useNotifications();
  const items = q.data?.items ?? [];
  const unread = q.data?.unread ?? 0;
  // Group by kind for the summary chips.
  const byKind = items.reduce<Record<string, number>>((acc, n) => {
    // New-shape notifications have no `kind`; group them by source (`icon`).
    const key = n.kind ?? n.icon ?? "system";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <WidgetCard
      title={t("modules.dashboard.widget.notifications", { defaultValue: "Bildirishnomalar" })}
      icon={<Bell className="size-4" />}
      footer={
        <Link to="/tasks" className="hover:underline">
          {t("modules.dashboard.footer.allTasks", { defaultValue: "Barcha vazifalar" })}
        </Link>
      }
    >
      {q.isLoading ? (
        <ListSkeleton rows={3} />
      ) : !items.length ? (
        <EmptyRow text={t("modules.dashboard.empty.noNotifs", { defaultValue: "Bildirishnoma yo'q" })} />
      ) : (
        <>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums leading-tight">{unread}</span>
            <span className="text-xs text-muted-foreground">
              {t("modules.dashboard.labels.unread", { defaultValue: "o'qilmagan" })}
            </span>
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {Object.entries(byKind).map(([kind, n]) => (
              <Badge key={kind} variant="info">
                {t(`modules.dashboard.notifKind.${kind}`, { defaultValue: kind })}: {n}
              </Badge>
            ))}
          </div>
          <ul className="space-y-1.5 animate-in fade-in-0 duration-300">
            {items.slice(0, 4).map((n) => (
              <li key={n.id} className="text-xs">
                <div className={`truncate ${n.isRead ? "text-muted-foreground" : "font-medium text-foreground"}`}>
                  {n.title || n.taskTitle || t(`modules.dashboard.notifKind.${n.kind}`, { defaultValue: n.kind ?? "system" })}
                </div>
                {(n.body || n.actor) && <div className="truncate text-muted-foreground">{n.body || n.actor}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
    </WidgetCard>
  );
}

export const WIDGETS: WidgetDef[] = [
  {
    type: "my_tasks",
    module: "tasks",
    titleKey: "modules.dashboard.widget.my_tasks",
    title: "Mening vazifalarim",
    icon: ListTodo,
    defaultColspan: 1,
    Component: MyTasksWidget,
  },
  {
    type: "notifications",
    module: "tasks",
    titleKey: "modules.dashboard.widget.notifications",
    title: "Bildirishnomalar",
    icon: Bell,
    defaultColspan: 1,
    Component: NotificationsWidget,
  },
];
