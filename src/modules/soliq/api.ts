import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type {
  ChequesPage,
  CompanyOverview,
  IjaraContractDetail,
  IjaraGridOut,
  IjaraPage,
  MailCategoriesOut,
  MailDetail,
  MailsPage,
  PaymentsPage,
  ReconciliationPage,
  ReportsPage,
  SyncStatus,
  TaxGridOut,
  TaxPaymentDetail,
} from "./types";

const BASE = "/soliq";

// =================== TAX-GRID =================================================

export function useTaxGrid(year: number, month: number, force = false,
                          opts?: Partial<UseQueryOptions<TaxGridOut>>) {
  return useQuery<TaxGridOut>({
    queryKey: ["soliq", "tax-grid", year, month, force],
    queryFn: async () =>
      (await api.get(`${BASE}/tax-grid`, { params: { year, month, force } })).data,
    staleTime: 60_000,
    ...opts,
  });
}

// =================== PER-COMPANY ==============================================

export function useCompanyOverview(companyId: string | number | null) {
  return useQuery<CompanyOverview>({
    queryKey: ["soliq", "overview", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/overview`)).data,
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useReports(
  companyId: string | number | null,
  params: { year: number; status?: string | null; page?: number; per_page?: number },
) {
  return useQuery<ReportsPage>({
    queryKey: ["soliq", "reports", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/reports`, { params })).data,
    enabled: !!companyId,
  });
}

export function usePayments(
  companyId: string | number | null,
  params: { year: number; page?: number; per_page?: number },
) {
  return useQuery<PaymentsPage>({
    queryKey: ["soliq", "payments", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/payments`, { params })).data,
    enabled: !!companyId,
  });
}

export function useReconciliation(
  companyId: string | number | null,
  params: { year: number; ns10_code?: string; ns11_code?: string; request_date?: string },
  enabled = true,
) {
  return useQuery<ReconciliationPage>({
    queryKey: ["soliq", "reconciliation", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/reconciliation`, { params })).data,
    enabled: !!companyId && enabled,
  });
}

export function useReconciliationRegions(companyId: string | number | null) {
  return useQuery({
    queryKey: ["soliq", "recon-regions", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/reconciliation/regions`)).data,
    enabled: !!companyId,
  });
}

export function useReconciliationDates(
  companyId: string | number | null,
  params: { year: number; ns10_code?: string; ns11_code?: string },
) {
  return useQuery({
    queryKey: ["soliq", "recon-dates", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/reconciliation/available-dates`, {
        params,
      })).data,
    enabled: !!companyId,
  });
}

export function useReconciliationSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: string | number; request_date: string }) =>
      (await api.post(
        `${BASE}/companies/${vars.companyId}/reconciliation/sync`,
        null,
        { params: { request_date: vars.request_date } },
      )).data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["soliq", "reconciliation", vars.companyId] });
    },
  });
}

// =================== CHEQUES =================================================

export function useCheques(
  companyId: string | number | null,
  params: Record<string, unknown>,
) {
  return useQuery<ChequesPage>({
    queryKey: ["soliq", "cheques", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/cheques`, { params })).data,
    enabled: !!companyId,
  });
}

export function useChequesSummary(companyId: string | number | null,
                                  params: { date_from?: string; date_to?: string; terminal_id?: string }) {
  return useQuery({
    queryKey: ["soliq", "cheques-summary", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/cheques/summary`, { params })).data,
    enabled: !!companyId,
  });
}

export function useChequesTerminals(companyId: string | number | null) {
  return useQuery({
    queryKey: ["soliq", "cheques-terminals", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/cheques/terminals`)).data,
    enabled: !!companyId,
  });
}

export type DayTotal = {
  date: string;
  count: number;
  cash_total: number;
  card_total: number;
  vat_total: number;
  total: number;
};

export function useChequesDailyTotals(
  companyId: string | number | null,
  params: { date_from?: string; date_to?: string; terminal_id?: string },
) {
  return useQuery<{ days: DayTotal[] }>({
    queryKey: ["soliq", "cheques-daily", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/cheques/daily-totals`, { params })).data,
    enabled: !!companyId,
  });
}

export function useChequesBankDeposit(companyId: string | number | null,
                                      params: { date_from?: string; date_to?: string; terminal_id?: string }) {
  return useQuery<Record<string, unknown>>({
    queryKey: ["soliq", "cheques-bank-deposit", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/cheques/bank-deposit`, { params })).data,
    enabled: !!companyId,
  });
}

export function useChequesExpiredTerminal(companyId: string | number | null) {
  return useQuery<Record<string, unknown>>({
    queryKey: ["soliq", "cheques-expired", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/cheques/has-expired-terminal`)).data,
    enabled: !!companyId,
  });
}

export function useChequesReportTerminals(companyId: string | number | null, checkType: string) {
  return useQuery<{ data?: unknown[]; terminals?: unknown[] }>({
    queryKey: ["soliq", "cheques-report-terminals", companyId, checkType],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/cheques/report-terminals`,
        { params: { check_type: checkType } })).data,
    enabled: !!companyId,
  });
}

export function useChequesSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { companyId: string | number; force_refetch?: boolean }) =>
      (await api.post(`${BASE}/companies/${vars.companyId}/cheques/sync`, null,
        { params: { force_refetch: vars.force_refetch } })).data,
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["soliq", "cheques", vars.companyId] });
    },
  });
}

// =================== MAILS ===================================================

export function useMails(companyId: string | number | null, params: Record<string, unknown>) {
  return useQuery<MailsPage>({
    queryKey: ["soliq", "mails", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/mails`, { params })).data,
    enabled: !!companyId,
  });
}

export function useMailStats(companyId: string | number | null) {
  return useQuery({
    queryKey: ["soliq", "mail-stats", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/mails/stats`)).data,
    enabled: !!companyId,
  });
}

export function useMailCategories(companyId: string | number | null) {
  return useQuery<MailCategoriesOut>({
    queryKey: ["soliq", "mail-categories", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/mails/categories`)).data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

export type MailByCompany = {
  nc_id: number;
  company_name?: string;
  display_name?: string;
  counts: { unread?: number; overdue?: number; stale_unanswered?: number };
};

export function useMailStatsByCompany(enabled = true) {
  return useQuery<{ items: MailByCompany[] }>({
    queryKey: ["soliq", "mail-stats-by-company"],
    queryFn: async () => (await api.get(`${BASE}/mails/stats/by-company`)).data,
    enabled,
    staleTime: 60_000,
  });
}

export function useMailDetail(pkey: string | null, companyId: string | number | null) {
  return useQuery<MailDetail>({
    queryKey: ["soliq", "mail", pkey, companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/mails/${pkey}`, { params: { company_id: companyId } })).data,
    enabled: !!pkey && !!companyId,
  });
}

export function useMailMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pkey: string) =>
      (await api.post(`${BASE}/mails/${pkey}/mark-read`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["soliq", "mails"] });
      qc.invalidateQueries({ queryKey: ["soliq", "mail-stats"] });
    },
  });
}

export function useMailAcceptRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { pkey: string; request_date?: string }) =>
      (await api.post(`${BASE}/mails/${vars.pkey}/accept-requirement`, null,
        { params: vars.request_date ? { request_date: vars.request_date } : {} })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["soliq", "mails"] });
    },
  });
}

export function useMailSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string | number) =>
      (await api.post(`${BASE}/companies/${companyId}/mails/sync`)).data,
    onSuccess: (_d, companyId) => {
      qc.invalidateQueries({ queryKey: ["soliq", "mails", companyId] });
    },
  });
}

// =================== TAX PAYMENTS ============================================

export function useTaxPayments(companyId: string | number | null, params: Record<string, unknown>) {
  return useQuery({
    queryKey: ["soliq", "tax-payments", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/tax-payments`, { params })).data,
    enabled: !!companyId,
  });
}

export function useTaxPaymentDetail(paymentId: string | null) {
  return useQuery<TaxPaymentDetail>({
    queryKey: ["soliq", "tax-payment", paymentId],
    queryFn: async () =>
      (await api.get(`${BASE}/tax-payments/${paymentId}`)).data,
    enabled: !!paymentId,
  });
}

export function useTaxPaymentHistory(paymentId: string | null) {
  return useQuery<{ items?: unknown[]; history?: unknown[] }>({
    queryKey: ["soliq", "tax-payment-history", paymentId],
    queryFn: async () =>
      (await api.get(`${BASE}/tax-payments/${paymentId}/history`)).data,
    enabled: !!paymentId,
  });
}

// =================== IJARA ===================================================

export function useIjaraGrid() {
  return useQuery<IjaraGridOut>({
    queryKey: ["soliq", "ijara-grid"],
    queryFn: async () => (await api.get(`${BASE}/ijara-grid`)).data,
    staleTime: 60_000,
  });
}

export function useIjaraGridSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post(`${BASE}/ijara-grid/sync`)).data,
    onSuccess: () => {
      // grid refresh lags the celery sync; consumer re-fetches on a delay
      qc.invalidateQueries({ queryKey: ["soliq", "ijara-grid"] });
      qc.invalidateQueries({ queryKey: ["soliq", "ijara"] });
    },
  });
}

export function useIjara(params: { company_id?: string | number; section?: string; state?: string;
                                   page?: number; size?: number },
                         enabled = true) {
  return useQuery<IjaraPage>({
    queryKey: ["soliq", "ijara", params],
    queryFn: async () => (await api.get(`${BASE}/ijara`, { params })).data,
    enabled,
  });
}

export function useIjaraContract(contractId: string | null) {
  return useQuery<IjaraContractDetail>({
    queryKey: ["soliq", "ijara-contract", contractId],
    queryFn: async () =>
      (await api.get(`${BASE}/ijara/contracts/${contractId}`)).data,
    enabled: !!contractId,
  });
}

// =================== ADMIN ===================================================

export function useSyncStatus() {
  return useQuery<SyncStatus>({
    queryKey: ["soliq", "sync-status"],
    queryFn: async () => (await api.get(`${BASE}/admin/sync-status`)).data,
    refetchInterval: 30_000,
  });
}

export function useSyncForce() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { year: number; month: number }) =>
      (await api.post(`${BASE}/admin/sync`, null, { params: vars })).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["soliq"] });
    },
  });
}
