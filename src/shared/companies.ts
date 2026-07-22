import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { Company } from "@/shared/store/company";

type ListResp = { items: Company[]; count: number };

export function useMyCompanies() {
  return useQuery<ListResp>({
    queryKey: ["my-companies"],
    queryFn: async () => (await api.get<ListResp>("/me/companies")).data,
    staleTime: 5 * 60_000,
  });
}
