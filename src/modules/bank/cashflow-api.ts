import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

const BASE = "/bank";

// ── Inferred report shapes (render DEFENSIVELY — any missing key is fine) ─────
export type CashflowCounterparty = {
  name?: string | null;
  inn?: string | null;
  amount?: string | number | null;
  fx_amount?: string | number | null;
  fx_currency?: string | null;
};
export type CashflowSubBucket = {
  purpose_code?: string | null;
  counterparties?: CashflowCounterparty[] | null;
};
export type CashflowArticle = {
  key?: string | null;
  label?: string | null;
  direction?: "in" | "out" | string | null;
  total?: string | number | null;
  sub_buckets?: CashflowSubBucket[] | null;
};
export type CashflowTotals = {
  opening?: string | number | null;
  closing?: string | number | null;
  income?: string | number | null;
  expense?: string | number | null;
};
export type CashflowPerebroska = {
  count?: number | null;
  total?: string | number | null;
};
export type CashflowPayload = {
  articles?: CashflowArticle[] | null;
  totals?: CashflowTotals | null;
  perebroska?: CashflowPerebroska | null;
};

// A report row as returned by the bank service (subset we rely on).
export type CashflowReport = {
  report_id?: string | null;
  id?: string | null;
  status?: string | null;        // queued | running | done | failed
  stage?: string | null;         // logging_in | fetching_accounts | …
  current_account?: string | null;
  accounts_total?: number | null;
  accounts_done?: number | null;
  error_message?: string | null;
  payload?: CashflowPayload | null;
  company_id?: string | null;
  subscription_id?: string | null;
  date?: string | null;
  [k: string]: unknown;
};

export type FindReportResp = { report: CashflowReport | null };

// Subscription shape (subset) — reused from the subscriptions endpoint.
export type BankSubscription = {
  id: string;
  bank_type?: string | null;
  bank_name?: string | null;
  status?: string | null;
  is_deleted?: boolean | null;
  user_id?: string | null;
};

export const reportId = (r?: CashflowReport | null): string | null =>
  (r?.report_id || r?.id) as string | null;

// ── Hooks ────────────────────────────────────────────────────────────────────
export function useCashflowSubscriptions(companyId: number | null) {
  return useQuery<{ items: BankSubscription[] }>({
    queryKey: ["bank", "cashflow", "subs", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/subscriptions`)).data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

export function useFindCachedReport(
  companyId: number | null,
  subscriptionId: string | null,
  date: string,
  enabled: boolean
) {
  return useQuery<FindReportResp>({
    queryKey: ["bank", "cashflow", "find", companyId, subscriptionId, date],
    queryFn: async () =>
      (
        await api.get(`${BASE}/companies/${companyId}/cashflow/reports`, {
          params: { subscription_id: subscriptionId, date },
        })
      ).data,
    enabled: enabled && !!companyId && !!subscriptionId && !!date,
    staleTime: 0,
  });
}

export function useCreateReport(companyId: number | null) {
  return useMutation<
    CashflowReport,
    unknown,
    { subscription_id: string; date: string; force?: boolean }
  >({
    mutationFn: async (body) =>
      (await api.post(`${BASE}/companies/${companyId}/cashflow/reports`, body)).data,
  });
}

// Single report poll (used as SSE fallback / progress source).
export async function fetchReport(
  companyId: number,
  id: string
): Promise<CashflowReport> {
  return (await api.get(`${BASE}/companies/${companyId}/cashflow/reports/${id}`)).data;
}
