// Autotasks — recurring templates that mint board cards on a schedule.
//
// Where automations react to a board write, autotasks react to TIME: a ticker
// on the server sweeps every minute and fires whatever is due. Templates are
// COMPANY-scoped and each one names its own target project, so a single list
// can fan work out across several boards.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

/** `regular` fires on a fixed schedule. `ai` is reserved for the
 *  context-analysing variant (AI Studio) and is not executed yet. */
export type AutotaskKind = "regular" | "ai";

export type ScheduleType = "daily" | "weekly" | "monthly" | "yearly";

export type AutotaskSchedule = {
  type: ScheduleType;
  /** "HH:MM" in the template's local time. */
  time: string;
  /** weekly: ISO weekdays, 1 = Monday … 7 = Sunday. Empty ⇒ every day. */
  weekdays?: number[];
  /** monthly/yearly: day of month (clamped to the month's length). */
  day?: number;
  /** yearly: 1–12. */
  month?: number;
};

/** The card each firing stamps out. `title` falls back to the template name. */
export type AutotaskCard = {
  title?: string;
  description?: string;
  priority?: string;
  type?: string;
  assigneeIds?: string[];
  labels?: string[];
  /** Due date = firing date + this many days. Omit for no due date. */
  dueInDays?: number | null;
};

export type Autotask = {
  id: string;
  projectId: string;
  columnId?: string | null;
  name: string;
  kind: AutotaskKind;
  enabled: boolean;
  schedule: AutotaskSchedule;
  card: AutotaskCard;
  /** Minutes east of UTC; 300 = Asia/Tashkent (no DST, so a fixed offset is exact). */
  utcOffsetMin: number;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
};

export type AutotaskRun = {
  slot: string | null;
  cardId: string | null;
  cardTitle: string | null;
  cardSeq: number | null;
  status: string;
  error: string | null;
  createdAt: string | null;
};

const key = (companyId: number | undefined) => ["tasks", "autotasks", companyId] as const;
const runsKey = (companyId: number | undefined, id: string) =>
  ["tasks", "autotasks", companyId, id, "runs"] as const;

/** Every template in the company (newest first). */
export function useAutotasks(companyId: number | undefined) {
  return useQuery({
    queryKey: key(companyId),
    enabled: !!companyId,
    queryFn: async () =>
      (await api.get<{ items: Autotask[] }>(`/tasks/board/${companyId}/autotasks`)).data.items,
  });
}

/** Upsert (PUT) — id is client-minted for new templates. */
export function useSaveAutotask(companyId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (a: Autotask) =>
      (await api.put<Autotask>(`/tasks/board/${companyId}/autotasks/${a.id}`, {
        projectId: a.projectId,
        columnId: a.columnId || null,
        name: a.name,
        kind: a.kind,
        enabled: a.enabled,
        schedule: a.schedule,
        card: a.card,
        utcOffsetMin: a.utcOffsetMin,
      })).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(companyId) }),
  });
}

export function useDeleteAutotask(companyId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/tasks/board/${companyId}/autotasks/${id}`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(companyId) }),
  });
}

/** Recent firings of one template (newest slot first). */
export function useAutotaskRuns(companyId: number | undefined, id: string | null) {
  return useQuery({
    queryKey: runsKey(companyId, id ?? ""),
    enabled: !!companyId && !!id,
    queryFn: async () =>
      (await api.get<{ items: AutotaskRun[] }>(
        `/tasks/board/${companyId}/autotasks/${id}/runs`,
      )).data.items,
  });
}

/** Fire a template immediately, ignoring its schedule. */
export function useRunAutotask(companyId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.post<{ ok: boolean }>(`/tasks/board/${companyId}/autotasks/${id}/run`, {})).data,
    onSuccess: (_d, id) => {
      void qc.invalidateQueries({ queryKey: key(companyId) });
      void qc.invalidateQueries({ queryKey: runsKey(companyId, id) });
    },
  });
}
