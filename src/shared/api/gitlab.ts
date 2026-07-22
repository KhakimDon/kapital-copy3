import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

// ── public pipeline status (any authenticated user) ──────────────────────────

export type PipelineRepo = {
  name: string;
  status: string;
  ref: string;
  web_url: string;
  updated_at: string;
};
export type PipelineStatus = {
  building: boolean;
  repos: PipelineRepo[];
};

/**
 * Aggregate pipeline status across every watched repo. Backend proxies GitLab
 * (tokens stay server-side) and caches briefly, so a short poll is cheap. Used
 * to flip the app logo to the deploy animation while an update is shipping.
 */
export function usePipelineStatus() {
  return useQuery({
    queryKey: ["gitlab", "pipeline-status"],
    queryFn: async () =>
      (await api.get<PipelineStatus>("/gitlab/pipeline-status")).data,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    staleTime: 8_000,
    retry: 1,
    // Never surface an error to the UI — absence of the feature is silent.
    placeholderData: { building: false, repos: [] },
  });
}

// ── superadmin config CRUD ───────────────────────────────────────────────────

export type GitlabRepo = {
  id: number;
  name: string;
  project: string;
  gitlab_url: string;
  ref: string;
  enabled: boolean;
  has_token: boolean;
};
export type GitlabRepoIn = {
  name: string;
  project: string;
  gitlab_url?: string;
  ref?: string;
  token?: string;
  enabled?: boolean;
};

/** Superadmin: list watched repos (tokens never returned — only `has_token`). */
export function useGitlabRepos() {
  return useQuery({
    queryKey: ["gitlab", "repos"],
    queryFn: async () =>
      (await api.get<{ items: GitlabRepo[] }>("/admin/gitlab/repos")).data.items,
    staleTime: 30_000,
  });
}

export function useCreateGitlabRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: GitlabRepoIn) =>
      (await api.post("/admin/gitlab/repos", body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gitlab", "repos"] });
      void qc.invalidateQueries({ queryKey: ["gitlab", "pipeline-status"] });
    },
  });
}

export function useUpdateGitlabRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: GitlabRepoIn & { id: number }) =>
      (await api.put(`/admin/gitlab/repos/${id}`, body)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gitlab", "repos"] });
      void qc.invalidateQueries({ queryKey: ["gitlab", "pipeline-status"] });
    },
  });
}

export function useDeleteGitlabRepo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`/admin/gitlab/repos/${id}`)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["gitlab", "repos"] });
      void qc.invalidateQueries({ queryKey: ["gitlab", "pipeline-status"] });
    },
  });
}

/** True while any watched repo has a pipeline running/pending. */
export function useIsDeploying(): { building: boolean; repos: PipelineRepo[] } {
  const { data } = usePipelineStatus();
  return { building: data?.building ?? false, repos: data?.repos ?? [] };
}
