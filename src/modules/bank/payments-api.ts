import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

const BASE = "/bank";

// ── Types (inline; do not edit shared types.ts) ──────────────────────────────
export type ConnectBank = {
  id: string;
  name: string;
  bank_type?: string | null;
  is_connected?: boolean | null;
  otp_length?: number | null;
};
export type ConnectBanksResp = { results?: ConnectBank[] } | ConnectBank[];

export type BankSubscription = {
  id: string;
  bank_id?: string | null;
  bank_name?: string | null;
  bank_type?: string | null;
  login?: string | null;
  status?: string | null;
  login_required?: boolean | null;
  is_deleted?: boolean | null;
  last_sync_at?: string | null;
};
export type SubscriptionsResp = { items: BankSubscription[] };

export type BankBranch = { code: string; name: string };
export type BranchesResp = { items: BankBranch[] };

export type PaymentBody = {
  senderBranch: string;
  senderAccountNumber: string;
  receiverBranch: string; // MFO
  receiverAccountNumber: string;
  receiverName?: string;
  receiverInnOrPinfl: string;
  paymentPurpose: string;
  amount: number;
  paymentPurposeCode?: string;
  sender_is_ipak?: boolean;
  subscription_id?: string;
};
export type CardPaymentBody = {
  senderBranch: string;
  senderAccountNumber: string;
  cardNumber: string;
  receiverName: string;
  receiverInnOrPinfl: string; // PINFL 14
  paymentPurpose: string;
  amount: number;
};

export type ValidateLoginResp = {
  session_id?: string;
  next_step?: string;
  confirm_phone?: string;
  success?: boolean;
  message?: string;
};

// Normalize {results:[…]} | [] → ConnectBank[]
export const asBanks = (d?: ConnectBanksResp): ConnectBank[] =>
  Array.isArray(d) ? d : d?.results ?? [];

// ── Queries ──────────────────────────────────────────────────────────────────
export function useConnectBanks(companyId: number | null, enabled = true) {
  return useQuery<ConnectBanksResp>({
    queryKey: ["bank", "connect-banks", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/connect/banks`)).data,
    enabled: !!companyId && enabled,
    staleTime: 60_000,
  });
}

export function useSubscriptions(companyId: number | null) {
  return useQuery<SubscriptionsResp>({
    queryKey: ["bank", "subscriptions", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/subscriptions`)).data,
    enabled: !!companyId,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

export function useBankBranches(companyId: number | null, search: string) {
  return useQuery<BranchesResp>({
    queryKey: ["bank", "branches", companyId, search],
    queryFn: async () =>
      (
        await api.get(`${BASE}/companies/${companyId}/bank-branches`, {
          params: { search_string: search },
        })
      ).data,
    enabled: !!companyId && search.trim().length >= 2,
    staleTime: 60_000,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────--
export function useCreatePayment(companyId: number | null) {
  return useMutation({
    mutationFn: async (body: PaymentBody) =>
      (await api.post(`${BASE}/companies/${companyId}/payments`, body)).data,
  });
}

export function useCreateCardPayment(companyId: number | null) {
  return useMutation({
    mutationFn: async (body: CardPaymentBody) =>
      (await api.post(`${BASE}/companies/${companyId}/card-payments`, body)).data,
  });
}

// Kapitalbank uniquely requires a stable per-(company, bank) device UUID
// on validate-login and subscribe — upstream reads it as `X-Device-Id`.
// We mint once and persist in localStorage so re-connects match the same
// registered device (regenerating would force a new OTP flow each time).
type ConnectBody = {
  bank_id: string;
  login: string;
  password: string;
  device_id?: string;
};

// Bank connect drives a real headless-browser login into the bank portal on
// the service side (Ipak Yo'li's Playwright waits up to 120s), so these two
// calls need far more than the shared client's 30s default — otherwise axios
// aborts long before the bank answers.
const BANK_CONNECT_TIMEOUT = 150_000;

export function useValidateLogin(companyId: number | null) {
  return useMutation<ValidateLoginResp, unknown, ConnectBody>({
    mutationFn: async (body) =>
      (await api.post(`${BASE}/companies/${companyId}/connect/validate-login`, body, {
        timeout: BANK_CONNECT_TIMEOUT,
      })).data,
  });
}

export function useConfirmOtp(companyId: number | null) {
  return useMutation<
    Record<string, unknown>,
    unknown,
    { session_id: string; otp_code: string; device_id?: string }
  >({
    mutationFn: async (body) =>
      (await api.post(`${BASE}/companies/${companyId}/connect/confirm-otp`, body, {
        timeout: BANK_CONNECT_TIMEOUT,
      })).data,
  });
}

export function useSubscribe(companyId: number | null) {
  const qc = useQueryClient();
  return useMutation<Record<string, unknown>, unknown, ConnectBody>({
    mutationFn: async (body) =>
      (await api.post(`${BASE}/companies/${companyId}/connect/subscribe`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank", "subscriptions", companyId] });
      qc.invalidateQueries({ queryKey: ["bank", "connect-banks", companyId] });
    },
  });
}

// Per-sub config: reg_date (start of backfill window), sync_period_days
// (rolling refresh window), auto_scrape_account_numbers (which accounts opt
// into expensive txn iterate). Backed by bank-module's /subs/{uuid}/config.
export type SubConfig = {
  reg_date: string;                    // ISO YYYY-MM-DD
  sync_period_days: number;
  auto_scrape_account_numbers: string[];
};

export function useSubConfig(companyId: number | null, subId: string | null) {
  return useQuery<{ sub_id: number; config: SubConfig }>({
    queryKey: ["bank", "sub-config", companyId, subId],
    enabled: !!companyId && !!subId,
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/subscriptions/${subId}/config`)).data,
  });
}

// Which of this sub's accounts are being scraped right now. Polled while the
// accounts table is open so an opted-in row can show "Yuklanmoqda" for the
// ~1-2 min its Ipak Yo'li scrape actually runs, instead of jumping straight to
// "Aktiv". Best-effort: `[]` on any backend/next-bank hiccup.
export function useScrapeStatus(companyId: number | null, subId: string | null) {
  return useQuery<{ sub_id: number | string; in_progress: string[] }>({
    queryKey: ["bank", "scrape-status", companyId, subId],
    enabled: !!companyId && !!subId,
    // Poll every 4s so the row flips to "Aktiv" within a few seconds of the
    // scrape finishing. Cheap: one small JSON per sub.
    refetchInterval: 4000,
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/subscriptions/${subId}/scrape-status`)).data,
  });
}

export function usePatchSubConfig(companyId: number | null, subId: string | null) {
  const qc = useQueryClient();
  return useMutation<{ sub_id: number; config: SubConfig }, unknown, Partial<SubConfig>>({
    mutationFn: async (patch) =>
      (await api.patch(`${BASE}/companies/${companyId}/subscriptions/${subId}/config`, patch)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank", "sub-config", companyId, subId] });
    },
  });
}

// Kicks off a synchronous one-shot scrape for a single account. Returns once
// the worker has pushed (~1-2 min/account on Ipak Yo'li); show a spinner.
export function useScrapeAccount(companyId: number | null, subId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    { ok: boolean; accounts_pushed?: number; transactions_pushed?: number; error?: string },
    unknown,
    { account_number: string; since?: string }
  >({
    mutationFn: async ({ account_number, since }) =>
      (
        await api.post(
          `${BASE}/companies/${companyId}/subscriptions/${subId}/accounts/${account_number}/scrape`,
          { since: since ?? null },
        )
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank", "accounts", companyId] });
      qc.invalidateQueries({ queryKey: ["bank", "transactions", companyId] });
      qc.invalidateQueries({ queryKey: ["bank", "sub-config", companyId, subId] });
    },
  });
}

export function useDeleteSubscription(companyId: number | null) {
  const qc = useQueryClient();
  return useMutation<Record<string, unknown>, unknown, string>({
    mutationFn: async (subId) =>
      (await api.delete(`${BASE}/companies/${companyId}/subscriptions/${subId}`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank", "subscriptions", companyId] });
      qc.invalidateQueries({ queryKey: ["bank", "connect-banks", companyId] });
    },
  });
}

// Extract a human error message from an axios error of our endpoints.
export function errMessage(e: unknown): string {
  const ax = e as { response?: { data?: unknown; status?: number } };
  const d = ax?.response?.data as Record<string, unknown> | string | undefined;
  if (typeof d === "string" && d) return d;
  if (d && typeof d === "object") {
    const detail = (d as Record<string, unknown>).detail;
    if (typeof detail === "string" && detail) return detail;
    if (detail && typeof detail === "object") {
      const m = (detail as Record<string, unknown>).message ?? (detail as Record<string, unknown>).error;
      if (typeof m === "string" && m) return m;
    }
    const m = (d as Record<string, unknown>).message ?? (d as Record<string, unknown>).error;
    if (typeof m === "string" && m) return m;
  }
  return ax?.response?.status ? `Xatolik (${ax.response.status})` : "Xatolik yuz berdi";
}

// Bank status classification (parity with cloud bank-status.js).
export type StatusKind = "ok" | "syncing" | "reconnect" | "error" | "pending" | "idle" | "gone";
export function classifySub(s: BankSubscription): { kind: StatusKind; label: string } {
  if (s.is_deleted) return { kind: "gone", label: "O'chirilgan" };
  if (s.login_required) return { kind: "reconnect", label: "Qayta ulash" };
  const st = String(s.status || "").toLowerCase();
  if (st === "password_changed" || st === "cancelled") return { kind: "reconnect", label: "Qayta ulash" };
  if (st === "failed") return { kind: "error", label: "Sinxronlash xatosi" };
  if (st === "running") return { kind: "syncing", label: "Sinxronlanmoqda" };
  if (st === "pending") return { kind: "pending", label: "Tayyorlanmoqda" };
  if (s.last_sync_at) return { kind: "ok", label: "Aktiv" };
  return { kind: "idle", label: "Kutilmoqda" };
}
export function dotColor(kind: StatusKind): string {
  if (kind === "ok" || kind === "syncing") return "bg-emerald-500";
  if (kind === "reconnect" || kind === "error") return "bg-red-500";
  if (kind === "pending") return "bg-amber-500";
  return "bg-muted-foreground/40";
}
const BANK_LABELS: Record<string, string> = {
  kapitalbank: "Kapitalbank",
  ipak_yoli: "Ipak Yo'li",
  agrobank: "Agrobank",
  nbu: "NBU",
  ofb: "OFB",
  octobank: "Octobank",
  davrbank: "Davrbank",
  anorbank: "Anorbank",
  aloqabank: "Aloqabank",
  asabank: "Asaka bank",
  ipoteka: "Ipoteka bank",
};
export function bankLabel(s: { bank_name?: string | null; bank_type?: string | null }): string {
  return s.bank_name || BANK_LABELS[String(s.bank_type || "")] || s.bank_type || "—";
}
export function fmtTashkent(value?: string | null): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("ru-RU", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
