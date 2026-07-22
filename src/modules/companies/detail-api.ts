/**
 * Company detail page hooks — orchestrator-only. Each tab below the dashboard
 * reuses its own module's existing hooks (keys/documents/employees/soliq/onec);
 * this file only adds the small "sidebar aggregator" call so the detail page
 * can paint its left column and dashboard cards in one round-trip.
 */
import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// ── Inline types (kept here per orchestrator file ownership) ────────────────

export type CompanyRecord = {
  id?: number;
  name?: string | null;
  inn?: string | null;
  legal_form?: string | null;
  is_active?: boolean | null;
  chat2_company_id?: string | null;
  keys_count?: number | null;
  created_at?: string | null;
  director_name?: string | null;
  accountant_name?: string | null;
  phone?: string | null;
  address?: string | null;
  bank_account?: string | null;
  bank_name?: string | null;
  bank_mfo?: string | null;
};

export type CompanyEnrich = {
  rating?: string | null;
  rating_points?: number | null;
  rating_color?: string | null;
  debt?: number | null;
  advance?: number | null;
};

export type CompanyOverview = {
  company: CompanyRecord;
  enrich: CompanyEnrich | null;
  keys_count: number | null;
  docs_total: number | null;
  employees_count: number | null;
  bank_balance: number | null;
  bank_accounts_count: number | null;
  director: string | null;
};

// ── Hooks ───────────────────────────────────────────────────────────────────

export function useCompanyDetail(companyId: number | null) {
  return useQuery<CompanyRecord>({
    queryKey: ["companies", "one", companyId],
    queryFn: async () => (await api.get(`/companies/${companyId}`)).data,
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useCompanyOverviewSummary(companyId: number | null) {
  return useQuery<CompanyOverview>({
    queryKey: ["companies", "overview", companyId],
    queryFn: async () => (await api.get(`/companies/${companyId}/overview`)).data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}
