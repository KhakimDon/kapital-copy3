import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { CompaniesPageResp, EnrichMap } from "./types";

export function useCompaniesList() {
  return useQuery<CompaniesPageResp>({
    queryKey: ["companies", "list"],
    queryFn: async () => (await api.get<CompaniesPageResp>("/companies/")).data,
    staleTime: 60_000,
  });
}

export function useCompaniesEnrich(inns: string[]) {
  return useQuery<EnrichMap>({
    queryKey: ["companies", "enrich", inns],
    queryFn: async () =>
      (await api.get<EnrichMap>("/companies/enrich", { params: { inns: inns.join(",") } })).data,
    enabled: inns.length > 0,
    staleTime: 5 * 60_000,
  });
}
