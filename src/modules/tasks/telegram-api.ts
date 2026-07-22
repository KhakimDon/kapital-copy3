// Telegram group notifications for the task board (Jira "Telegram Connector"
// model): tenant-admin-managed bots + a per-project binding (bot + group chat
// id + event filters). Sending happens server-side on every board mutation.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

export type TelegramBot = {
  id: string;
  name: string;
  username: string;
  createdBy: string;
  createdAt?: string | null;
};

export type TelegramEvents = {
  created?: boolean;
  moved?: boolean;
  completed?: boolean;
  assigned?: boolean;
  commented?: boolean;
  updated?: boolean;
  deleted?: boolean;
};

export type TelegramConfig = {
  botId: string;
  chatId: string;
  threadId?: string | null;
  events: TelegramEvents;
  enabled: boolean;
};

/** Registered bots (no tokens) — everyone can list, only admins mutate. */
export function useTelegramBots() {
  return useQuery({
    queryKey: ["tasks", "telegram", "bots"],
    queryFn: async () =>
      (await api.get<{ items: TelegramBot[] }>("/tasks/telegram/bots")).data.items,
    staleTime: 30_000,
  });
}

export function useAddTelegramBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { token: string; name?: string }) =>
      (await api.post("/tasks/telegram/bots", body)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks", "telegram", "bots"] }),
  });
}

export function useDeleteTelegramBot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/tasks/telegram/bots/${id}`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["tasks", "telegram", "bots"] }),
  });
}

/** The project's binding (null when not set up). */
export function useTelegramConfig(companyId: number | undefined, projectId: string | undefined) {
  return useQuery({
    queryKey: ["tasks", "telegram", "config", companyId, projectId],
    enabled: !!companyId && !!projectId,
    queryFn: async () =>
      (await api.get<{ config: TelegramConfig | null }>(
        `/tasks/telegram/config/${companyId}/${projectId}`,
      )).data.config,
  });
}

export function useSaveTelegramConfig(companyId: number | undefined, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TelegramConfig) =>
      (await api.put(`/tasks/telegram/config/${companyId}/${projectId}`, body)).data,
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["tasks", "telegram", "config", companyId, projectId] }),
  });
}

export function useDeleteTelegramConfig(companyId: number | undefined, projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.delete(`/tasks/telegram/config/${companyId}/${projectId}`)).data,
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: ["tasks", "telegram", "config", companyId, projectId] }),
  });
}

/** Fire a test message at a bot+chat pair. Throws with the Telegram error. */
export function useTelegramTest() {
  return useMutation({
    mutationFn: async (body: { botId: string; chatId: string; threadId?: string | null }) =>
      (await api.post("/tasks/telegram/test", body)).data,
  });
}
