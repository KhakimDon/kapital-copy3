import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type {
  EmployeesPage, Employee, EmployeeIn, EmployeeEvent,
  PayrollResult, Department, DepartmentIn, Schedule, ScheduleAssignment,
  PayrollRunDetail, LeaveRow, PremiumRow, DeductionRow, TimesheetRow, HolidayRow,
  RuleRow, ChangeLogRow, DismissIn,
} from "./types";

const BASE = "/employees";

export function useEmployee(companyId: number | null, id: number | null) {
  return useQuery<Employee>({
    queryKey: ["employees", "one", companyId, id],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/employees/${id}`)).data,
    enabled: !!companyId && !!id,
  });
}

export function useEmployeeEvents(companyId: number | null, id: number | null) {
  return useQuery<EmployeeEvent[]>({
    queryKey: ["employees", "events", companyId, id],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/employees/${id}/events`)).data,
    enabled: !!companyId && !!id,
    staleTime: 30_000,
  });
}

export function useEmployees(
  companyId: number | null,
  params: { status?: string; search?: string; department?: string },
) {
  return useQuery<EmployeesPage>({
    queryKey: ["employees", "list", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/employees`, { params })).data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

export function usePayroll(companyId: number | null, year: number, month: number) {
  return useQuery<PayrollResult>({
    queryKey: ["employees", "payroll", companyId, year, month],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/payroll`, { params: { year, month } })).data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; body: EmployeeIn }) =>
      (await api.post(`${BASE}/companies/${v.companyId}/employees`, v.body)).data as Employee,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; id: number; body: EmployeeIn }) =>
      (await api.put(`${BASE}/companies/${v.companyId}/employees/${v.id}`, v.body)).data as Employee,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useDismissEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; id: number; body?: DismissIn }) =>
      (await api.post(`${BASE}/companies/${v.companyId}/employees/${v.id}/dismiss`,
        v.body ?? {})).data as Employee,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; id: number }) =>
      (await api.delete(`${BASE}/companies/${v.companyId}/employees/${v.id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

// ---- departments -----------------------------------------------------------
export function useDepartments(companyId: number | null) {
  return useQuery<Department[]>({
    queryKey: ["employees", "departments", companyId],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/departments`)).data,
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useSaveDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; id?: number; body: DepartmentIn }) => {
      const url = `${BASE}/companies/${v.companyId}/departments${v.id ? "/" + v.id : ""}`;
      return (await api[v.id ? "put" : "post"](url, v.body)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useDeleteDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; id: number }) =>
      (await api.delete(`${BASE}/companies/${v.companyId}/departments/${v.id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

// ---- schedules -------------------------------------------------------------
export function useSchedules(companyId: number | null) {
  return useQuery<Schedule[]>({
    queryKey: ["employees", "schedules", companyId],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/schedules`)).data,
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

type ScheduleBody = Partial<Omit<Schedule, "id" | "employee_count" | "exists_in_1c">> & {
  name: string; work_start: string; work_end: string; workdays: number[];
};
export function useSaveSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; id?: number; body: ScheduleBody }) => {
      const url = `${BASE}/companies/${v.companyId}/schedules${v.id ? "/" + v.id : ""}`;
      return (await api[v.id ? "put" : "post"](url, v.body)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useDeleteSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; id: number }) =>
      (await api.delete(`${BASE}/companies/${v.companyId}/schedules/${v.id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useAssignSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; id: number; employee_ids: number[]; effective_from?: string }) =>
      (await api.post(`${BASE}/companies/${v.companyId}/schedules/${v.id}/assign`,
        { employee_ids: v.employee_ids, effective_from: v.effective_from })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

export function useScheduleAssignments(companyId: number | null) {
  return useQuery<ScheduleAssignment[]>({
    queryKey: ["employees", "schedule-assignments", companyId],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/schedule-assignments`)).data,
    enabled: !!companyId, staleTime: 30_000,
  });
}

// ---- write/action mutations (surface 409 in nc-read mode) ------------------
// One generic hook: POST/PUT/DELETE an arbitrary employees-module path. The UI
// passes the method, path suffix and body; errors (incl. 409) propagate to the
// caller's onError so the operator sees the cloud-write-blocked message.
type HttpMethod = "post" | "put" | "delete";
export function useEmpAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; method?: HttpMethod; path: string; body?: unknown; timeout?: number }) => {
      const url = `${BASE}/companies/${v.companyId}/${v.path}`;
      const m = v.method ?? "post";
      // mehnat sync calls ride a slow OneID+EDS chain — caller can extend
      // past the 30s client default.
      const cfg = v.timeout ? { timeout: v.timeout } : undefined;
      if (m === "delete") return (await api.delete(url, cfg)).data;
      return (await api[m](url, v.body ?? {}, cfg)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["employees"] }),
  });
}

// ---- Oylik suite -----------------------------------------------------------
function usePeriod<T>(key: string, path: string, companyId: number | null, year: number, month: number) {
  return useQuery<T>({
    queryKey: ["employees", key, companyId, year, month],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/${path}`, { params: { year, month } })).data,
    enabled: !!companyId, staleTime: 30_000,
  });
}
export const usePayrollRun = (c: number | null, y: number, m: number) =>
  usePeriod<PayrollRunDetail>("payroll-run", "payroll/run", c, y, m);
export const useLeaves = (c: number | null, y: number, m: number) =>
  usePeriod<LeaveRow[]>("leaves", "leaves", c, y, m);
export const usePremiums = (c: number | null, y: number, m: number) =>
  usePeriod<PremiumRow[]>("premiums", "premiums", c, y, m);
export const useDeductions = (c: number | null, y: number, m: number) =>
  usePeriod<DeductionRow[]>("deductions", "deductions", c, y, m);
export const useTimesheet = (c: number | null, y: number, m: number) =>
  usePeriod<TimesheetRow[]>("timesheet", "timesheet", c, y, m);

export function useHolidays(companyId: number | null, year: number) {
  return useQuery<HolidayRow[]>({
    queryKey: ["employees", "holidays", companyId, year],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/holidays`, { params: { year } })).data,
    enabled: !!companyId, staleTime: 60_000,
  });
}

// ---- AI Rules + ChangeLog --------------------------------------------------
export function useRules(companyId: number | null) {
  return useQuery<RuleRow[]>({
    queryKey: ["employees", "rules", companyId],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/rules`)).data,
    enabled: !!companyId, staleTime: 30_000,
  });
}
export function useChangelog(companyId: number | null, limit = 100) {
  return useQuery<ChangeLogRow[]>({
    queryKey: ["employees", "changelog", companyId, limit],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/changelog`, { params: { limit } })).data,
    enabled: !!companyId, staleTime: 30_000,
  });
}
