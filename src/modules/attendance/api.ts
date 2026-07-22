import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type {
  AttendanceMatrix, AttendanceDetail, AttendanceEventRow,
  TerminalRow, TerminalUserRow, SuggestResult, RotationResult,
  ManualRotationList, ManualRotationIn,
} from "./types";

const BASE = "/attendance";

export function useAttendance(companyId: number | null, dateFrom: string, dateTo: string) {
  return useQuery<AttendanceMatrix>({
    queryKey: ["attendance", companyId, dateFrom, dateTo],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/attendance`,
        { params: { date_from: dateFrom, date_to: dateTo } })).data,
    enabled: !!companyId,
    staleTime: 15_000,
  });
}

export function useAttendanceDetail(
  companyId: number | null, employeeId: number | null, dateFrom: string, dateTo: string,
) {
  return useQuery<AttendanceDetail>({
    queryKey: ["attendance", "detail", companyId, employeeId, dateFrom, dateTo],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/attendance/${employeeId}`,
        { params: { date_from: dateFrom, date_to: dateTo } })).data,
    enabled: !!companyId && !!employeeId,
  });
}

export function useAttendanceEvents(companyId: number | null) {
  return useQuery<AttendanceEventRow[]>({
    queryKey: ["attendance", "events", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/attendance/events`, { params: { limit: 300 } })).data,
    enabled: !!companyId,
    staleTime: 15_000,
  });
}

export function useTerminals(companyId: number | null) {
  return useQuery<TerminalRow[]>({
    queryKey: ["attendance", "terminals", companyId],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/terminals`)).data,
    enabled: !!companyId, staleTime: 15_000,
  });
}

export function useTerminalUsers(companyId: number | null) {
  return useQuery<TerminalUserRow[]>({
    queryKey: ["attendance", "terminal-users", companyId],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/terminal-users`)).data,
    enabled: !!companyId, staleTime: 15_000,
  });
}

export function useTerminalSuggestions(companyId: number | null, tuId: number | null) {
  return useQuery<SuggestResult>({
    queryKey: ["attendance", "suggest", companyId, tuId],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/terminal-users/${tuId}/suggestions`)).data,
    enabled: !!companyId && !!tuId,
  });
}

export function useLinkTerminalUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; tuId: number; employee_id: number }) =>
      (await api.post(`${BASE}/companies/${v.companyId}/terminal-users/${v.tuId}/link`, { employee_id: v.employee_id })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
  });
}

export function useUnlinkTerminalUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; tuId: number }) =>
      (await api.delete(`${BASE}/companies/${v.companyId}/terminal-users/${v.tuId}/link`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
  });
}

export function useRotation(companyId: number | null, dateStr: string) {
  return useQuery<RotationResult>({
    queryKey: ["attendance", "rotation", companyId, dateStr],
    queryFn: async () => (await api.get(`${BASE}/companies/${companyId}/rotation`, { params: { date: dateStr } })).data,
    enabled: !!companyId, staleTime: 15_000,
  });
}

export function useMarkAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: {
      companyId: number; employee_id: number; date: string;
      check_in?: string; check_out?: string;
    }) =>
      (await api.post(`${BASE}/companies/${v.companyId}/attendance/mark`, {
        employee_id: v.employee_id, date: v.date,
        check_in: v.check_in || null, check_out: v.check_out || null,
      })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance"] }),
  });
}

// ---- manual rotation CRUD (Назначенные ротации) --------------------------

export function useManualRotations(companyId: number | null) {
  return useQuery<ManualRotationList>({
    queryKey: ["attendance", "manual-rotations", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/rotation/manual`)).data,
    enabled: !!companyId, staleTime: 15_000,
  });
}

export function useSaveManualRotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; id?: number; body: ManualRotationIn }) => {
      const url = `${BASE}/companies/${v.companyId}/rotation/manual${v.id ? "/" + v.id : ""}`;
      return (v.id ? await api.put(url, v.body) : await api.post(url, v.body)).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance", "manual-rotations"] }),
  });
}

export function useDeleteManualRotation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { companyId: number; id: number }) =>
      (await api.delete(`${BASE}/companies/${v.companyId}/rotation/manual/${v.id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance", "manual-rotations"] }),
  });
}
