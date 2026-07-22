// No-code board automations (Jira Automation model): per-project rules of
// trigger → conditions → actions, evaluated server-side on board mutations.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

export type AutomationTriggerType =
  | "created"
  | "moved"
  | "assigned"
  | "priority"
  | "commented";

export type AutomationTrigger = {
  type: AutomationTriggerType;
  /** created: columnId filter · moved: destination columnId · priority: new priority. */
  to?: string;
  /** moved: source columnId. */
  from?: string;
};

export type AutomationCondField =
  | "priority"
  | "column"
  | "type"
  | "assignee"
  | "label"
  | "title";

export type AutomationCondOp = "is" | "not" | "empty" | "not_empty" | "contains";

export type AutomationCond = {
  field: AutomationCondField;
  op: AutomationCondOp;
  value: string;
};

/** Templates support {{title}}, {{actor}}, {{priority}} placeholders. */
export type AutomationAction =
  | { type: "move"; columnId: string }
  | { type: "assign"; who: "user" | "reporter" | "unassign"; username?: string }
  | { type: "priority"; value: string }
  | { type: "label_add"; value: string }
  | { type: "label_remove"; value: string }
  | { type: "due_shift"; days: number }
  | { type: "comment"; template: string }
  | { type: "notify_watchers" }
  | { type: "telegram"; template: string };

export type AutomationRule = {
  id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  conditions: AutomationCond[];
  actions: AutomationAction[];
  position: number;
};

const key = (companyId: number | undefined, projectId: string | undefined) =>
  ["tasks", "automations", companyId, projectId] as const;

/** All rules of a project, server-ordered by position. */
export function useAutomations(companyId: number | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: key(companyId, projectId),
    enabled: !!companyId && !!projectId,
    queryFn: async () =>
      (await api.get<{ items: AutomationRule[] }>(
        `/tasks/board/${companyId}/automations`,
        { params: { project: projectId } },
      )).data.items,
  });
}

/** Upsert (PUT) a rule — id is client-minted for new rules. */
export function useSaveAutomation(companyId: number | undefined, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: AutomationRule) =>
      (await api.put(`/tasks/board/${companyId}/automations/${rule.id}`, {
        projectId,
        name: rule.name,
        enabled: rule.enabled,
        trigger: rule.trigger,
        conditions: rule.conditions,
        actions: rule.actions,
        position: rule.position,
      })).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(companyId, projectId) }),
  });
}

export function useDeleteAutomation(companyId: number | undefined, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/tasks/board/${companyId}/automations/${id}`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: key(companyId, projectId) }),
  });
}
