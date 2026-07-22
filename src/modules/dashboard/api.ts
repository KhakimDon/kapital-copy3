import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// ---- types (inline, mirror backend dashboard_service shape) ----------------

export type CurrencyRate = {
  code: string;
  rate: number | null;
  delta: number | null;
  date: string | null;
};

export type CurrencyBlock = {
  usd: CurrencyRate | null;
  eur: CurrencyRate | null;
  rub: CurrencyRate | null;
};

export type RatingBlock = {
  inn?: string | null;
  rating?: string | null;
  rating_points?: number | null;
  rating_color?: string | null;
  debt?: number | null;
  advance?: number | null;
};

export type DocumentsBlock = {
  total: number;
  pending: number;
  signed: number;
  rejected: number;
};

export type BankBlock = {
  total_balance: number;
  accounts: number;
  banks: number;
};

export type DashboardOverview = {
  company_id: number;
  currency: CurrencyBlock;
  rating: RatingBlock;
  documents: DocumentsBlock;
  bank: BankBlock;
};

// ---- recent docs -----------------------------------------------------------

export type RecentDoc = {
  doc_id: string | null;
  doctype: string | null;
  doctype_label: string;
  doc_date: string | null;
  doc_status: number | null;
  partner_name: string;
  partner_tin: string | null;
  total_sum: number | null;
  is_creator: boolean;
};

export type RecentDocsBlock = {
  items: RecentDoc[];
  total: number;
};

// ---- tax notices -----------------------------------------------------------

export type TaxNoticeItem = {
  pkey: string | null;
  mail_type: string | null;
  title: string;
  registered_num: string | null;
  registered_at: string | null;
  unread: boolean;
};

export type TaxNoticesBlock = {
  unread: number;
  actionable: number;
  needs_attention?: number;
  total: number;
  items: TaxNoticeItem[];
};

// ---- tax schedule (global) -------------------------------------------------

export type TaxScheduleItem = {
  key: string;
  label: string;
  type: "monthly" | "quarterly";
  deadline: string;          // YYYY-MM-DD
  days_remaining: number;
  period_label: string;
  severity: "over" | "red" | "yellow" | "normal";
};

export type TaxScheduleBlock = {
  items: TaxScheduleItem[];
};

// ---- unconfirmed provodka --------------------------------------------------

export type UnconfirmedProvodkaBlock = {
  total_new: number;
  available: boolean;
};

// ---- expiring keys ---------------------------------------------------------

export type ExpiringKey = {
  id: number | string | null;
  owner_name: string;
  tin: string;
  valid_to: string;
  days_remaining: number;
  severity: "over" | "red" | "yellow" | "normal";
};

export type ExpiringKeysBlock = {
  items: ExpiringKey[];
  total: number;
};

// ---- debtors ---------------------------------------------------------------

export type DebtorRow = {
  name: string;
  inn: string;
  debt: number;
};

export type DebtorsBlock = {
  items: DebtorRow[];
  total: number;
  available: boolean;
};

// ---- currency archive ------------------------------------------------------

export type CurrencyPoint = {
  date: string;
  rate: number;
};

export type CurrencyArchiveBlock = {
  points: CurrencyPoint[];
  min: number | null;
  max: number | null;
  avg: number | null;
  days: number;
};

// ---- tax status ------------------------------------------------------------

export type TaxStatusItem = {
  id: string;
  label: string;
  status: "submitted" | "late" | "not_submitted" | "penalty" | "unknown" | "none";
  reports: number;
};

export type TaxStatusBlock = {
  period: { year: number; month: number } | null;
  items: TaxStatusItem[];
};

const BASE = "/dashboard";

// ---- queries ---------------------------------------------------------------

export function useDashboardCurrency() {
  return useQuery<CurrencyBlock>({
    queryKey: ["dashboard", "currency"],
    queryFn: async () => (await api.get(`${BASE}/currency`)).data,
    staleTime: 300_000,
  });
}

export function useDashboardOverview(companyId: number | null) {
  return useQuery<DashboardOverview>({
    queryKey: ["dashboard", "overview", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/overview`)).data,
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useDashboardRecentDocs(companyId: number | null, limit = 5) {
  return useQuery<RecentDocsBlock>({
    queryKey: ["dashboard", "recent-docs", companyId, limit],
    queryFn: async () =>
      (
        await api.get(`${BASE}/companies/${companyId}/recent-docs`, {
          params: { limit },
        })
      ).data,
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useDashboardTaxNotices(companyId: number | null, limit = 3) {
  return useQuery<TaxNoticesBlock>({
    queryKey: ["dashboard", "tax-notices", companyId, limit],
    queryFn: async () =>
      (
        await api.get(`${BASE}/companies/${companyId}/tax-notices`, {
          params: { limit },
        })
      ).data,
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useDashboardTaxSchedule() {
  return useQuery<TaxScheduleBlock>({
    queryKey: ["dashboard", "tax-schedule"],
    queryFn: async () => (await api.get(`${BASE}/tax-schedule`)).data,
    staleTime: 30 * 60_000,
  });
}

export function useDashboardUnconfirmedProvodka(companyId: number | null) {
  return useQuery<UnconfirmedProvodkaBlock>({
    queryKey: ["dashboard", "unconfirmed-provodka", companyId],
    queryFn: async () =>
      (
        await api.get(
          `${BASE}/companies/${companyId}/unconfirmed-provodka`
        )
      ).data,
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useDashboardExpiringKeys(companyId: number | null, withinDays = 60) {
  return useQuery<ExpiringKeysBlock>({
    queryKey: ["dashboard", "expiring-keys", companyId, withinDays],
    queryFn: async () =>
      (
        await api.get(`${BASE}/companies/${companyId}/expiring-keys`, {
          params: { within_days: withinDays, limit: 8 },
        })
      ).data,
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

export function useDashboardDebtors(companyId: number | null, limit = 10) {
  return useQuery<DebtorsBlock>({
    queryKey: ["dashboard", "debtors", companyId, limit],
    queryFn: async () =>
      (
        await api.get(`${BASE}/companies/${companyId}/debtors`, {
          params: { limit },
        })
      ).data,
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}

export function useDashboardCurrencyArchive(days = 7) {
  return useQuery<CurrencyArchiveBlock>({
    queryKey: ["dashboard", "currency-archive", days],
    queryFn: async () =>
      (await api.get(`${BASE}/currency-archive`, { params: { days } })).data,
    staleTime: 30 * 60_000,
  });
}

export function useDashboardTaxStatus(companyId: number | null) {
  return useQuery<TaxStatusBlock>({
    queryKey: ["dashboard", "tax-status", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/tax-status`)).data,
    enabled: !!companyId,
    staleTime: 5 * 60_000,
  });
}
