import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

export type WikiMember = { id: string; name: string; phone?: string; avatar?: string | null };

/** Company members from AIBA (chat2) — the roster for wiki space access. */
export function useCompanyMembers(companyId: number | null) {
  return useQuery<{ items: WikiMember[] }>({
    queryKey: ["wiki", "members", companyId],
    queryFn: async () => (await api.get(`/tasks/companies/${companyId}/members`)).data,
    enabled: !!companyId,
    staleTime: 60_000,
  });
}
