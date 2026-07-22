import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

const BASE = "/bank";

// ── Types (inline — do not edit shared types.ts) ─────────────────────────────
export type Employee = {
  employeeCode?: string;
  fio?: string;
  maskedCard?: string;
  generalStateName?: string;
  cardStateName?: string;
};

export type EmployeesResp = {
  items: Employee[];
  total?: number;
  no_kapitalbank: boolean;
};

export type SalaryApp = {
  id?: number | string;
  subtopicDescription?: string;
  stateDescription?: string;
  createdAt?: string;
};

export type SalaryAppsResp = {
  items: SalaryApp[];
  no_kapitalbank?: boolean;
};

// ── Reads ────────────────────────────────────────────────────────────────────
export function useEmployees(
  companyId: number | null,
  page: number,
  pageSize: number,
  enabled = true,
) {
  return useQuery<EmployeesResp>({
    queryKey: ["bank", "employees", companyId, page, pageSize],
    queryFn: async () =>
      (
        await api.get(`${BASE}/companies/${companyId}/employees`, {
          params: { page, page_size: pageSize },
        })
      ).data,
    enabled: !!companyId && enabled,
    staleTime: 20_000,
  });
}

export function useSalaryApplications(companyId: number | null, enabled = true) {
  return useQuery<SalaryAppsResp>({
    queryKey: ["bank", "salary-apps", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/salary-applications`)).data,
    enabled: !!companyId && enabled,
    staleTime: 20_000,
  });
}

// ── Writes (Kapitalbank mutations) ───────────────────────────────────────────
export type AddEmployeePayload = {
  fullName: string;
  cardNumber: string;
  pinflOrPassport: string;
};
export type ChangeCardPayload = { employeeCode: string; newCardNumber: string };
export type DeletePayload = { employeeCode: string };

export function useAddEmployee(companyId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: AddEmployeePayload) =>
      (await api.post(`${BASE}/companies/${companyId}/employees`, payload)).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["bank", "employees", companyId] }),
  });
}

export function useChangeCard(companyId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ChangeCardPayload) =>
      (
        await api.post(
          `${BASE}/companies/${companyId}/employees/change-card`,
          payload,
        )
      ).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["bank", "employees", companyId] }),
  });
}

export function useDeleteEmployee(companyId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: DeletePayload) =>
      (
        await api.post(`${BASE}/companies/${companyId}/employees/delete`, payload)
      ).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["bank", "employees", companyId] }),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function empState(e: Employee): string {
  return (e.generalStateName || e.cardStateName || "").trim();
}

export function isActive(state: string): boolean {
  const s = state.toLowerCase();
  return s.includes("актив") || s.includes("active");
}

export function isPending(state: string): boolean {
  const s = state.toLowerCase();
  return s.includes("pending") || s.includes("обработк") || s.includes("ожидан");
}

/** Read an axios error's upstream `detail` for inline display. */
export function errDetail(e: unknown): string {
  const r = (e as { response?: { data?: { detail?: string; message?: string; error?: string } } })
    .response?.data;
  return r?.detail || r?.message || r?.error || "Xatolik yuz berdi";
}
