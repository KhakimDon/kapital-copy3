import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

const BASE = "/bank";

// ── Types (inline — do not edit shared types.ts) ────────────────────────────
export type Payroll = {
  salaryName?: string | null;
  salaryDesc?: string | null;
  amount?: number | null; // CENTS — divide by 100 for display
  totalEmpl?: number | null;
  state?: string | null;
  stateName?: string | null;
  operationDate?: string | null;
};

export type PayrollsResp = {
  items: Payroll[];
  total: number;
  no_kapitalbank: boolean;
};

// Sender accounts come from the shared accounts endpoint (Kapitalbank only).
export type PayrollAccount = {
  id: string;
  number: string;
  current_balance?: string | number | null;
  bank_type?: string | null;
  bank_name?: string | null;
};
type AccountsResp = { items: PayrollAccount[] };

// Employees come from the employees endpoint (owned by the employees agent —
// we call it over HTTP, never import its module).
export type PayrollEmployeeRow = {
  employeeCode?: string | null;
  code?: string | null;
  fio?: string | null;
  fullName?: string | null;
  name?: string | null;
};
type EmployeesResp = { items: PayrollEmployeeRow[]; no_kapitalbank?: boolean };

export type CreatePayrollEmployee = { employeeCode: string; amount: number };
export type CreatePayrollBody = {
  senderAccountNumber: string;
  description: string;
  employees: CreatePayrollEmployee[];
};
export type CreatePayrollResult = {
  salaryName?: string | null;
  name?: string | null;
  data?: { salaryName?: string | null; name?: string | null } | null;
} & Record<string, unknown>;

// ── Hooks ───────────────────────────────────────────────────────────────────
export function usePayrolls(companyId: number | null, page: number, pageSize: number) {
  return useQuery<PayrollsResp>({
    queryKey: ["bank", "payrolls", companyId, page, pageSize],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/payrolls`, {
        params: { page, page_size: pageSize },
      })).data,
    enabled: !!companyId,
    staleTime: 20_000,
  });
}

export function usePayrollAccounts(companyId: number | null, enabled: boolean) {
  return useQuery<PayrollAccount[]>({
    queryKey: ["bank", "payroll-accounts", companyId],
    queryFn: async () => {
      const resp = (await api.get(`${BASE}/companies/${companyId}/accounts`)).data as AccountsResp;
      return (resp.items ?? []).filter(
        (a) => (a.bank_type ?? "").toLowerCase().includes("kapital"),
      );
    },
    enabled: !!companyId && enabled,
    staleTime: 30_000,
  });
}

export function usePayrollEmployees(companyId: number | null, enabled: boolean) {
  return useQuery<PayrollEmployeeRow[]>({
    queryKey: ["bank", "payroll-employees", companyId],
    queryFn: async () => {
      const resp = (await api.get(`${BASE}/companies/${companyId}/employees`)).data as EmployeesResp;
      return resp.items ?? [];
    },
    enabled: !!companyId && enabled,
    staleTime: 30_000,
  });
}

export function useCreatePayroll(companyId: number | null) {
  const qc = useQueryClient();
  return useMutation<CreatePayrollResult, unknown, CreatePayrollBody>({
    mutationFn: async (body: CreatePayrollBody) =>
      (await api.post(`${BASE}/companies/${companyId}/payrolls`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bank", "payrolls", companyId] });
    },
  });
}

export const empCode = (e: PayrollEmployeeRow) => e.employeeCode ?? e.code ?? "";
export const empName = (e: PayrollEmployeeRow) => e.fio ?? e.fullName ?? e.name ?? "—";
