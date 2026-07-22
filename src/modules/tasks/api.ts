import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type {
  TaskListResp, MembersResp, CommentsResp, AttachmentsResp, StatsResp,
  Task, TaskPriority, TaskStatus,
} from "./types";

const BASE = "/tasks";

// ── Board / tasks ─────────────────────────────────────────────────────────────
export function useTasks(companyId: number | null) {
  return useQuery<TaskListResp>({
    queryKey: ["tasks", "list", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/tasks`)).data,
    enabled: !!companyId,
    refetchInterval: 5000, // poll like the NC board (peer/AI-driven changes)
    refetchIntervalInBackground: false,
    staleTime: 2000,
  });
}

// Single-task fetch for the detail-page route. The board still drives mass
// reads; this hook is only used when the user lands directly on /tasks/:id
// (refresh / bookmark) and we need the row before the list query resolves.
export function useTask(companyId: number | null, taskId: string | null) {
  return useQuery<Task>({
    queryKey: ["tasks", "one", companyId, taskId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/tasks/${taskId}`)).data,
    enabled: !!companyId && !!taskId,
    staleTime: 2000,
  });
}

export function useMembers(companyId: number | null) {
  return useQuery<MembersResp>({
    queryKey: ["tasks", "members", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/members`)).data,
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useTaskStats(companyId: number | null) {
  return useQuery<StatsResp>({
    queryKey: ["tasks", "stats", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/stats`)).data,
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

// ── Comments / attachments (per open task) ────────────────────────────────────
export function useComments(companyId: number | null, taskId: string | null) {
  return useQuery<CommentsResp>({
    queryKey: ["tasks", "comments", companyId, taskId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/tasks/${taskId}/comments`)).data,
    enabled: !!companyId && !!taskId,
  });
}

export function useAttachments(companyId: number | null, taskId: string | null) {
  return useQuery<AttachmentsResp>({
    queryKey: ["tasks", "attachments", companyId, taskId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/tasks/${taskId}/attachments`)).data,
    enabled: !!companyId && !!taskId,
  });
}

export const downloadAttachmentUrl = (companyId: number, taskId: string, attachmentId: string) =>
  `/api/v2${BASE}/companies/${companyId}/tasks/${taskId}/attachments/${attachmentId}/download`;

// ── Mutations ─────────────────────────────────────────────────────────────────
export type CreateTaskBody = {
  id?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  assignee_user_id?: string | null;
  due_at?: string | null;
};

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation<Task, Error, { companyId: number; body: CreateTaskBody }>({
    mutationFn: async ({ companyId, body }) =>
      (await api.post(`${BASE}/companies/${companyId}/tasks`, body)).data,
    onSuccess: (_d, { companyId }) =>
      qc.invalidateQueries({ queryKey: ["tasks", "list", companyId] }),
  });
}

export type UpdateTaskBody = Partial<{
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee_user_id: string | null;
  due_at: string | null;
  sort_order: number;
}>;

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation<Task, Error, { companyId: number; taskId: string; body: UpdateTaskBody; version?: number }>({
    mutationFn: async ({ companyId, taskId, body, version }) =>
      (await api.patch(`${BASE}/companies/${companyId}/tasks/${taskId}`, body, {
        headers: version != null ? { "If-Match": String(version) } : undefined,
      })).data,
    onSuccess: (_d, { companyId }) =>
      qc.invalidateQueries({ queryKey: ["tasks", "list", companyId] }),
  });
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation<void, Error, { companyId: number; taskId: string; version?: number }>({
    mutationFn: async ({ companyId, taskId, version }) => {
      await api.delete(`${BASE}/companies/${companyId}/tasks/${taskId}`, {
        headers: version != null ? { "If-Match": String(version) } : undefined,
      });
    },
    onSuccess: (_d, { companyId }) =>
      qc.invalidateQueries({ queryKey: ["tasks", "list", companyId] }),
  });
}

export function useAddComment() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { companyId: number; taskId: string; body: string }>({
    mutationFn: async ({ companyId, taskId, body }) =>
      (await api.post(`${BASE}/companies/${companyId}/tasks/${taskId}/comments`, { body })).data,
    onSuccess: (_d, { companyId, taskId }) => {
      qc.invalidateQueries({ queryKey: ["tasks", "comments", companyId, taskId] });
      qc.invalidateQueries({ queryKey: ["tasks", "list", companyId] });
    },
  });
}

export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation<void, Error, { companyId: number; taskId: string; commentId: string }>({
    mutationFn: async ({ companyId, commentId }) => {
      await api.delete(`${BASE}/companies/${companyId}/comments/${commentId}`);
    },
    onSuccess: (_d, { companyId, taskId }) =>
      qc.invalidateQueries({ queryKey: ["tasks", "comments", companyId, taskId] }),
  });
}

export function useUploadAttachment() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { companyId: number; taskId: string; file: File }>({
    mutationFn: async ({ companyId, taskId, file }) => {
      // Raw-body upload (backend has no python-multipart) — name + mime in headers.
      const buf = await file.arrayBuffer();
      return (await api.post(
        `${BASE}/companies/${companyId}/tasks/${taskId}/attachments`,
        buf,
        {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-Filename": encodeURIComponent(file.name),
            "X-Content-Type": file.type || "application/octet-stream",
          },
        },
      )).data;
    },
    onSuccess: (_d, { companyId, taskId }) => {
      qc.invalidateQueries({ queryKey: ["tasks", "attachments", companyId, taskId] });
      qc.invalidateQueries({ queryKey: ["tasks", "list", companyId] });
    },
  });
}

export function useDeleteAttachment() {
  const qc = useQueryClient();
  return useMutation<void, Error, { companyId: number; taskId: string; attachmentId: string }>({
    mutationFn: async ({ companyId, attachmentId }) => {
      await api.delete(`${BASE}/companies/${companyId}/attachments/${attachmentId}`);
    },
    onSuccess: (_d, { companyId, taskId }) =>
      qc.invalidateQueries({ queryKey: ["tasks", "attachments", companyId, taskId] }),
  });
}
