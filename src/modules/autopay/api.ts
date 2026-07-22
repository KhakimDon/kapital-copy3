import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

const BASE = "/autopay";

// Small helper: surface the FastAPI / poc error detail string in the toast.
export function autopayErrDetail(e: unknown): string {
  const r = (e as { response?: { data?: { detail?: unknown; message?: string; error?: string } } })
    .response?.data;
  const d = r?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return r?.message || r?.error || "Saqlash xatoligi yuz berdi";
}

export type AutopaySchedule = {
  id: number;
  user_id: string;
  company_eskey_id: number | null;
  company_chat2_id: string | null;
  company_name: string | null;
  company_inn: string | null;
  name: string;
  payment_type: string | null;
  payment_type_label: string;
  sender_branch: string | null;
  sender_account_number: string | null;
  card_number: string | null;
  receiver_branch: string | null;
  receiver_account_number: string | null;
  receiver_name: string | null;
  receiver_inn_or_pinfl: string | null;
  payment_purpose: string | null;
  payment_purpose_code: string | null;
  amount: number;
  interval_type: string | null;
  interval_label: string;
  day_of_month: number | null;
  day_of_week: number | null;
  is_active: boolean;
  last_run_at: number | null;
  next_run_at: number | null;
  created_at: number | null;
  updated_at: number | null;
  category: string;
  category_label: string;
  document_type: string | null;
  budget_inn: string | null;
  budget_name: string | null;
  budget_account_number: string | null;
  description: string | null;
  employees_json: string | null;
  processing_started_at: number | null;
  last_error_at: number | null;
  retry_count: number;
  recurrence_json: string | null;
  occurrences_fired: number;
  skip_weekends: boolean;
  timezone: string | null;
  bank_provider: string | null;
  bank_provider_label: string;
};

export type AutopayHistoryEntry = {
  id: number;
  schedule_id: number | null;
  status: string;
  payment_id: string | null;
  payment_number: string | null;
  error_message: string | null;
  company_inn: string | null;
  company_name: string | null;
  company_chat2_id: string | null;
  receiver_inn: string | null;
  receiver_name: string | null;
  schedule_name: string | null;
  payment_type: string | null;
  payment_type_label: string;
  amount: number;
  payment_purpose: string | null;
  created_at: number | null;
  payroll_id: string | null;
  employee_count: number | null;
  raw_response: string | null;
  category: string | null;
  category_label: string;
  document_type: string | null;
  bank_provider: string | null;
  bank_provider_label: string;
};

export type AutopayHistoryPage = {
  items: AutopayHistoryEntry[];
  total: number;
  skip: number;
  limit: number;
};

export function useAutopaySchedules(companyId: number | null) {
  return useQuery<AutopaySchedule[]>({
    queryKey: ["autopay", "schedules", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/schedules`)).data,
    enabled: !!companyId,
    staleTime: 15_000,
  });
}

export function useAutopaySchedule(scheduleId: number | null) {
  return useQuery<AutopaySchedule>({
    queryKey: ["autopay", "schedule", scheduleId],
    queryFn: async () =>
      (await api.get(`${BASE}/schedules/${scheduleId}`)).data,
    enabled: !!scheduleId,
  });
}

export type AutopayHistoryParams = {
  status?: string;
  skip?: number;
  limit?: number;
};

export function useAutopayHistory(
  companyId: number | null,
  params: AutopayHistoryParams = {},
) {
  return useQuery<AutopayHistoryPage>({
    queryKey: ["autopay", "history", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/history`, { params })).data,
    enabled: !!companyId,
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}

export function useAutopayHistoryEntry(historyId: number | null) {
  return useQuery<AutopayHistoryEntry>({
    queryKey: ["autopay", "history-entry", historyId],
    queryFn: async () =>
      (await api.get(`${BASE}/history/${historyId}`)).data,
    enabled: !!historyId,
  });
}

// ============================================================================
// WRITES — create / update / delete / toggle / run-now
// ============================================================================
//
// Mirrors the cloud-os autopay-form.js `collect()` payload shape. All fields
// are optional on the wire — the backend's CATEGORY matrix applies sensible
// defaults from `category`, and RecurrenceEngine validates recurrence_json.

// Canonical recurrence rule shape (mirrors RecurrenceEngine in cloud-os).
export type RecurrenceRule = {
  freq: "once" | "daily" | "weekly" | "monthly" | "yearly" | "custom";
  interval?: number;
  byDay?: string[]; // MO, TU, …
  bySetPos?: number | null; // 1..4 or -1
  byMonthDay?: number[];
  byMonth?: number[];
  hour?: number;
  minute?: number;
  timezone?: string;
  startDate?: string | null;
  endMode?: "never" | "until" | "count";
  until?: string | null;
  count?: number | null;
  skipWeekends?: boolean;
  targetDate?: string | null;
};

// Payroll roster row — provider-aware shape.
export type PayrollRowKB = {
  employeeCode: string;
  fio?: string;
  inn?: string;
  amount: number;
};
export type PayrollRowIY = {
  card_number: string;
  name: string;
  pinfl: string;
  amount: number;
};
export type PayrollRow = PayrollRowKB | PayrollRowIY;

// Inline body for create/update — every field optional; backend fills defaults.
export type ScheduleWriteBody = {
  company_eskey_id?: number;
  company_chat2_id?: string;
  company_name?: string;
  company_inn?: string;
  name?: string;
  category?: string;
  document_type?: string;
  payment_type?: string;
  bank_provider?: string;
  sender_branch?: string;
  sender_account_number?: string;
  card_number?: string;
  receiver_branch?: string;
  receiver_account_number?: string;
  receiver_name?: string;
  receiver_inn_or_pinfl?: string;
  payment_purpose?: string;
  payment_purpose_code?: string;
  budget_inn?: string;
  budget_name?: string;
  budget_account_number?: string;
  description?: string;
  // employees_json is sent as a JSON STRING (matches the cloud's column type).
  employees_json?: string | null;
  amount?: number;
  interval_type?: string;
  day_of_month?: number;
  day_of_week?: number;
  is_active?: boolean;
  recurrence_json?: RecurrenceRule | null;
  skip_weekends?: boolean;
  timezone?: string;
};

export type ScheduleWriteResult =
  | { id: number; status: "created" }
  | { status: "updated" | "deleted" | "noop" | "queued"; is_active?: boolean; note?: string };

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation<ScheduleWriteResult, unknown, ScheduleWriteBody>({
    mutationFn: async (body) =>
      (await api.post(`${BASE}/schedules`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopay"] }),
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation<ScheduleWriteResult, unknown, { id: number; body: ScheduleWriteBody }>({
    mutationFn: async ({ id, body }) =>
      (await api.put(`${BASE}/schedules/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopay"] }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation<{ status: string }, unknown, number>({
    mutationFn: async (id) =>
      (await api.delete(`${BASE}/schedules/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopay"] }),
  });
}

export function useToggleSchedule() {
  const qc = useQueryClient();
  return useMutation<{ status: string; is_active: boolean }, unknown, number>({
    mutationFn: async (id) =>
      (await api.post(`${BASE}/schedules/${id}/toggle`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopay"] }),
  });
}

// Run-now: returns {status:"queued", note?:"dispatcher unavailable"} when the
// cloud-os dispatcher isn't reachable from the poc. Never throws on dispatcher
// unreachable — only on 404 / network error.
export function useRunSchedule() {
  const qc = useQueryClient();
  return useMutation<{ status: string; note?: string; next_run_at?: number; error?: string }, unknown, number>({
    mutationFn: async (id) =>
      (await api.post(`${BASE}/schedules/${id}/run`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["autopay"] }),
  });
}

// Pure compute: post a recurrence rule, get the next N firing timestamps.
// Cheap; no DB. Used by ScheduleForm's preview panel.
export type RecurrencePreviewResp = {
  occurrences: number[];
  exhausted: boolean;
  timezone: string;
};

export function useRecurrencePreview() {
  return useMutation<RecurrencePreviewResp, unknown, { recurrence_json: RecurrenceRule; limit?: number; from?: number }>({
    mutationFn: async (body) =>
      (await api.post(`${BASE}/recurrence/preview`, body)).data,
  });
}
