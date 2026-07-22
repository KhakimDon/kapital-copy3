import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// ── Types ────────────────────────────────────────────────────────────────────
export type AutodocSchedule = {
  id: number;
  company_eskey_id: number | null;
  company_inn: string | null;
  company_name: string | null;
  user_id: string | null;
  name: string;
  doc_type: string;
  doc_type_label: string;
  buyer_tin: string | null;
  buyer_name: string | null;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_sum: number;
  has_vat: boolean;
  vat_rate: number | null;
  interval_type: string;
  interval_label: string;
  day_of_month: number | null;
  day_of_week: number | null;
  is_active: boolean;
  with_act: boolean;
  contract_no: string | null;
  contract_date: string | null;
  factura_no: string | null;
  factura_date: string | null;
  mxik_code: string | null;
  mxik_name: string | null;
  package_code: string | null;
  package_name: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type AutodocHistory = {
  id: number;
  schedule_id: number | null;
  status: string;
  doc_id: string | null;
  error_message: string | null;
  company_inn: string | null;
  company_name: string | null;
  buyer_tin: string | null;
  buyer_name: string | null;
  doc_type: string;
  doc_type_label: string;
  schedule_name: string | null;
  product_name: string | null;
  total_sum: number | null;
  created_at: string | null;
};

export type SchedulesPage = {
  items: AutodocSchedule[];
  total: number;
  active: number;
  inactive: number;
};

export type HistoryPage = {
  items: AutodocHistory[];
  total: number;
  status_counts: Record<string, number>;
};

export type ScheduleDetail = AutodocSchedule & {
  recent_history: AutodocHistory[];
  // Edit-form extras — returned by the detail endpoint only.
  contract_name?: string | null;
  contract_place?: string | null;
  valid_to?: string | null;
  doc_subtype?: number | null;
  origin?: number | null;
  parts_json?: string | null;
};

export type HistoryStatus = "all" | "success" | "error";

// ── Hooks ────────────────────────────────────────────────────────────────────
export function useSchedules(companyId: number) {
  return useQuery<SchedulesPage>({
    queryKey: ["autodoc", "schedules", companyId],
    queryFn: async () =>
      (await api.get(`/autodoc/companies/${companyId}/schedules`)).data,
    enabled: !!companyId,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useSchedule(id: number | null) {
  return useQuery<ScheduleDetail>({
    queryKey: ["autodoc", "schedule", id],
    queryFn: async () => (await api.get(`/autodoc/schedules/${id}`)).data,
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useHistory(
  companyId: number,
  filters: { status: HistoryStatus; skip: number; limit: number }
) {
  return useQuery<HistoryPage>({
    queryKey: ["autodoc", "history", companyId, filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        skip: filters.skip,
        limit: filters.limit,
      };
      if (filters.status !== "all") params.status = filters.status;
      return (
        await api.get(`/autodoc/companies/${companyId}/history`, { params })
      ).data;
    },
    enabled: !!companyId,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function money(v?: number | null): string {
  return v == null ? "—" : Number(v).toLocaleString("ru-RU");
}

export function fmtDateTime(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v.slice(0, 10);
  return d.toLocaleDateString("ru-RU");
}

export function statusMeta(s?: string | null): {
  label: string;
  variant: "success" | "danger" | "muted" | "warning";
} {
  switch ((s || "").toLowerCase()) {
    case "success":
      return { label: "Muvaffaqiyatli", variant: "success" };
    case "error":
      return { label: "Xato", variant: "danger" };
    case "pending":
      return { label: "Kutilmoqda", variant: "warning" };
    default:
      return { label: s || "—", variant: "muted" };
  }
}

export function activeMeta(is_active: boolean): {
  label: string;
  variant: "success" | "muted";
} {
  return is_active
    ? { label: "Faol", variant: "success" }
    : { label: "O'chirilgan", variant: "muted" };
}

// ── Mutations ────────────────────────────────────────────────────────────────
//
// Writes target the local nc_uic snapshot. The cloud-os cron dispatcher
// will pick up the inserted/updated rows on its next tick. Run-now nudges
// `next_run_at` and returns 202 — the response includes
// `note: 'dispatcher unavailable'` to flag the async nature.

export type ScheduleInput = {
  company_eskey_id: number;
  company_inn?: string | null;
  company_name?: string | null;
  name: string;
  doc_type: string;
  buyer_tin?: string | null;
  buyer_name?: string | null;
  product_name?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  mxik_code?: string | null;
  mxik_name?: string | null;
  package_code?: string | null;
  package_name?: string | null;
  factura_no?: string | null;
  factura_date?: string | null;
  contract_no?: string | null;
  contract_date?: string | null;
  contract_place?: string | null;
  contract_name?: string | null;
  valid_to?: string | null;
  has_vat?: boolean;
  vat_rate?: number | null;
  origin?: number | null;
  with_act?: boolean;
  doc_subtype?: number | null;
  pdf_base64?: string | null;
  doc_content?: string | null;
  parts_json?: string | null;
  interval_type?: string;
  day_of_month?: number | null;
  day_of_week?: number | null;
  is_active?: boolean;
};

export type ScheduleMutateResult = {
  ok: boolean;
  id?: number;
  next_run_at?: number | null;
  is_active?: boolean;
  queued_at?: number;
  note?: string;
};

function invalidateSchedules(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["autodoc", "schedules"] });
  qc.invalidateQueries({ queryKey: ["autodoc", "schedule"] });
  qc.invalidateQueries({ queryKey: ["autodoc", "history"] });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation<ScheduleMutateResult, Error, ScheduleInput>({
    mutationFn: async (body) =>
      (await api.post("/autodoc/schedules", body)).data,
    onSuccess: () => invalidateSchedules(qc),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation<
    ScheduleMutateResult,
    Error,
    { id: number; body: Partial<ScheduleInput> }
  >({
    mutationFn: async ({ id, body }) =>
      (await api.put(`/autodoc/schedules/${id}`, body)).data,
    onSuccess: () => invalidateSchedules(qc),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation<ScheduleMutateResult, Error, { id: number }>({
    mutationFn: async ({ id }) =>
      (await api.delete(`/autodoc/schedules/${id}`)).data,
    onSuccess: () => invalidateSchedules(qc),
  });
}

export function useToggleSchedule() {
  const qc = useQueryClient();
  return useMutation<ScheduleMutateResult, Error, { id: number }>({
    mutationFn: async ({ id }) =>
      (await api.post(`/autodoc/schedules/${id}/toggle`)).data,
    onSuccess: () => invalidateSchedules(qc),
  });
}

export function useRunSchedule() {
  const qc = useQueryClient();
  return useMutation<ScheduleMutateResult, Error, { id: number }>({
    mutationFn: async ({ id }) =>
      (await api.post(`/autodoc/schedules/${id}/run`)).data,
    onSuccess: () => invalidateSchedules(qc),
  });
}

// ── Cloud reference ──────────────────────────────────────────────────────────
// The form select options mirror cloud autodoc-form.php + js/autodoc-form.js.
// 002/005/006/007/008 are the core Didox kinds; 000/041/052/054/075 land in
// the "free-form" branch.
export const DOC_TYPE_OPTIONS: { code: string; label: string }[] = [
  { code: "007", label: "Shartnoma" },
  { code: "002", label: "Hisob-faktura" },
  { code: "005", label: "Bajarilgan ishlar dalolatnomasi" },
  { code: "006", label: "Qaytarish hujjati" },
  { code: "008", label: "Reklamatsiya" },
  { code: "041", label: "Avans hisob-faktura" },
  { code: "052", label: "Eksport hisob-faktura" },
  { code: "054", label: "Yo'l varaqasi" },
  { code: "075", label: "Yetkazma akti" },
  { code: "000", label: "Ixtiyoriy hujjat" },
];

export const INTERVAL_OPTIONS: { code: string; label: string }[] = [
  { code: "30s", label: "Har 30 soniyada (test)" },
  { code: "1m", label: "Har minutda (test)" },
  { code: "5m", label: "Har 5 minutda (test)" },
  { code: "10m", label: "Har 10 minutda (test)" },
  { code: "30m", label: "Har 30 minutda (test)" },
  { code: "weekly", label: "Haftalik" },
  { code: "biweekly", label: "2 haftada bir" },
  { code: "monthly", label: "Oylik" },
];

export const WEEKDAY_OPTIONS: { code: number; label: string }[] = [
  { code: 1, label: "Dushanba" },
  { code: 2, label: "Seshanba" },
  { code: 3, label: "Chorshanba" },
  { code: 4, label: "Payshanba" },
  { code: 5, label: "Juma" },
  { code: 6, label: "Shanba" },
  { code: 0, label: "Yakshanba" },
];

// TIN lookup → /api/v2/kontragent/lookup?inn=...
// Service merges soliq + reester + gnk; we only consume the fields the autodoc
// form needs (name, director, bank).
export type KontragentLookup = {
  inn?: string | null;
  name?: string | null;
  short_name?: string | null;
  director?: string | null;
  address?: string | null;
  phone?: string | null;
  mfo?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  oked?: string | null;
  personal_num?: string | null;
  director_pinfl?: string | null;
  [k: string]: unknown;
};

export function useKontragentLookup(inn: string | null) {
  return useQuery<KontragentLookup>({
    queryKey: ["kontragent", "lookup", inn],
    queryFn: async () =>
      (await api.get("/kontragent/lookup", { params: { inn } })).data,
    enabled: !!inn && inn.length >= 9 && inn.length <= 14,
    retry: false,
    staleTime: 60_000,
  });
}
