import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { TxPage, TxSummary, AccountsResp, PendingResp } from "./types";

const BASE = "/bank";

export type TxParams = {
  date_from?: string; date_to?: string; account_ids?: string;
  direction?: string; search?: string; skip?: number; limit?: number;
};

export function useBankTransactions(companyId: number | null, params: TxParams) {
  return useQuery<TxPage>({
    queryKey: ["bank", "tx", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/transactions`, { params })).data,
    enabled: !!companyId, staleTime: 20_000,
  });
}

export function useTxSummary(companyId: number | null, params: Omit<TxParams, "skip" | "limit">) {
  return useQuery<TxSummary>({
    queryKey: ["bank", "tx-summary", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/transactions/summary`, { params })).data,
    enabled: !!companyId, staleTime: 20_000,
  });
}

export function useBankAccounts(companyId: number | null) {
  return useQuery<AccountsResp>({
    queryKey: ["bank", "accounts", companyId],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/accounts`)).data,
    enabled: !!companyId, staleTime: 30_000,
  });
}

// Count of transactions for one account. POC's /transactions returns `total`
// alongside the page so we just ask for limit=1 and read it. Cached per
// (company, account) so the Hisoblar list doesn't re-fetch on each render.
export function useAccountTxCount(companyId: number | null, accountId: string | null) {
  return useQuery<{ total: number }>({
    queryKey: ["bank", "account-tx-count", companyId, accountId],
    enabled: !!companyId && !!accountId,
    queryFn: async () => {
      const r = await api.get(`${BASE}/companies/${companyId}/transactions`, {
        params: { account_ids: accountId, limit: 1 },
      });
      return { total: Number(r.data?.total ?? 0) };
    },
    staleTime: 30_000,
  });
}

export function usePendingPayments(companyId: number | null) {
  return useQuery<PendingResp>({
    queryKey: ["bank", "pending", companyId],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/pending-payments`, { params: { limit: 100 } })).data,
    enabled: !!companyId, staleTime: 30_000,
  });
}
