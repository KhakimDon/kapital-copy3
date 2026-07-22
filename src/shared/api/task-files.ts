import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

export type TaskFilePolicy = {
  /** Allowed file extensions (lowercase, no dot). Empty = allow everything. */
  extensions: string[];
  /** Max upload size in MB. */
  maxMb: number;
};

export const DEFAULT_FILE_POLICY: TaskFilePolicy = {
  extensions: ["jpg", "jpeg", "png", "gif", "webp", "pdf", "doc", "docx", "xls", "xlsx", "csv", "txt", "zip"],
  maxMb: 25,
};

/** Allowed task-attachment types + size cap (superadmin-managed). Any user reads. */
export function useFilePolicy() {
  return useQuery({
    queryKey: ["tasks", "file-policy"],
    queryFn: async () => (await api.get<TaskFilePolicy>("/tasks/file-policy")).data,
    staleTime: 5 * 60_000,
    placeholderData: DEFAULT_FILE_POLICY,
  });
}

export function useUpdateFilePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: TaskFilePolicy) => (await api.put<TaskFilePolicy>("/tasks/file-policy", p)).data,
    onSuccess: (data) => qc.setQueryData(["tasks", "file-policy"], data),
  });
}

/** Validate a File against the policy → error message (localized keys) or null. */
export function checkFile(file: File, policy: TaskFilePolicy | undefined): "type" | "size" | null {
  const p = policy ?? DEFAULT_FILE_POLICY;
  if (p.maxMb > 0 && file.size > p.maxMb * 1024 * 1024) return "size";
  if (p.extensions.length > 0) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!p.extensions.includes(ext)) return "type";
  }
  return null;
}
