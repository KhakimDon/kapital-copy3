import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

/** AI actions offered by the wiki selection toolbar. The prompt for each is
 *  built server-side so the OpenAI token never leaves the backend. */
export type AiAction =
  | "improve" | "fix" | "shorten" | "lengthen" | "explain"
  | "translate_ru" | "translate_uz" | "translate_en";

/** Whether AI is configured (an OpenAI token is set on the backend). */
export function useAiStatus() {
  return useQuery({
    queryKey: ["ai", "status"],
    queryFn: async () => (await api.get<{ enabled: boolean }>("/ai/status")).data,
    staleTime: 60_000,
    retry: false,
  });
}

export function useWikiAi() {
  const status = useAiStatus();
  const run = async (action: AiAction, text: string): Promise<string> => {
    const { data } = await api.post<{ output: string }>("/ai/wiki", { action, text });
    return data.output;
  };
  return { enabled: status.data?.enabled ?? false, run };
}

// ── admin config (OpenAI token) ──────────────────────────────────────────────
export type AiSettings = { has_token: boolean; model: string };

export function useAiSettings(enabled: boolean) {
  return useQuery({
    queryKey: ["ai", "settings"],
    enabled,
    queryFn: async () => (await api.get<AiSettings>("/admin/ai/settings")).data,
    retry: false,
  });
}

export function useSaveAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { token?: string; model?: string }) =>
      (await api.put<AiSettings>("/admin/ai/settings", body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai", "settings"] });
      qc.invalidateQueries({ queryKey: ["ai", "status"] });
    },
  });
}
