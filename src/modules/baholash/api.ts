import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type {
  Meta, CompanyItem, FirmResult, EvaluateResponse, EvaluatePayload,
  SalaryResult, SavedEvaluation,
} from "./types";

const BASE = "/baholash";

// ── Reference data ────────────────────────────────────────────────────────────
export function useMeta() {
  return useQuery<Meta>({
    queryKey: ["baholash", "meta"],
    queryFn: async () => (await api.get(`${BASE}/meta`)).data,
    staleTime: 10 * 60_000,
  });
}

// ── Companies ─────────────────────────────────────────────────────────────────
export function useCompanies(enabled: boolean) {
  return useQuery<CompanyItem[]>({
    queryKey: ["baholash", "companies"],
    queryFn: async () => (await api.get(`${BASE}/companies`)).data,
    enabled,
    staleTime: 60_000,
  });
}

// ── Firm inputs ───────────────────────────────────────────────────────────────
export function useFirmById(id: number | null) {
  return useQuery<FirmResult>({
    queryKey: ["baholash", "firm", id],
    queryFn: async () => (await api.get(`${BASE}/firm/${id}`)).data,
    enabled: !!id,
    staleTime: 30_000,
    retry: false,
  });
}

export function useFirmByInn(inn: string | null, name: string) {
  return useQuery<FirmResult>({
    queryKey: ["baholash", "firm-by-inn", inn],
    queryFn: async () =>
      (await api.get(`${BASE}/firm-by-inn`, { params: { inn, name } })).data,
    enabled: !!inn,
    staleTime: 30_000,
    retry: false,
  });
}

// ── ESP key upload (raw bytes + password header — no multipart) ───────────────
export type KeyUploadResult = { ok: boolean; inn?: string; name?: string; error?: string };
export function useUploadKey() {
  return useMutation<KeyUploadResult, unknown, { file: File; password: string }>({
    mutationFn: async ({ file, password }) => {
      const buf = await file.arrayBuffer();
      const r = await api.post(`${BASE}/key/upload`, buf, {
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Key-Password": password,
        },
      });
      return r.data;
    },
  });
}

// ── Evaluate ──────────────────────────────────────────────────────────────────
export function useEvaluate() {
  const qc = useQueryClient();
  return useMutation<EvaluateResponse, unknown, EvaluatePayload>({
    mutationFn: async (payload) => (await api.post(`${BASE}/evaluate`, payload)).data,
    onSuccess: (_d, vars) => {
      if (vars.save) qc.invalidateQueries({ queryKey: ["baholash", "evaluations"] });
    },
  });
}

// ── Salary ────────────────────────────────────────────────────────────────────
export function useSalary(params: { total_ball: number; collection_pct: number; bonus_pct: number }) {
  return useQuery<SalaryResult>({
    queryKey: ["baholash", "salary", params],
    queryFn: async () => (await api.get(`${BASE}/salary`, { params })).data,
    staleTime: 0,
  });
}

// ── Saved evaluations ─────────────────────────────────────────────────────────
export function useEvaluations(enabled: boolean) {
  return useQuery<SavedEvaluation[]>({
    queryKey: ["baholash", "evaluations"],
    queryFn: async () => (await api.get(`${BASE}/evaluations`)).data,
    enabled,
    staleTime: 15_000,
  });
}

export function useDeleteEvaluation() {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, unknown, number>({
    mutationFn: async (id) => (await api.post(`${BASE}/evaluations/${id}/delete`, {})).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["baholash", "evaluations"] }),
  });
}
