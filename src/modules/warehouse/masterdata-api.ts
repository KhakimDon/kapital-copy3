import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

const base = (companyId: number) => `/warehouse/companies/${companyId}`;

// ── Types (inline — do not edit shared types) ────────────────────────────────
export type Supplier = {
  id: number;
  company_id: number;
  name: string;
  inn: string | null;
  phone: string | null;
  bank_account: string | null;
  mfo: string | null;
  purpose_code: string | null;
  last_used_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type SupplierPayload = {
  name: string;
  inn?: string | null;
  phone?: string | null;
  bank_account?: string | null;
  mfo?: string | null;
  purpose_code?: string | null;
};

export type SyncResult = {
  added: number;
  skipped_existing: number;
  skipped_no_data: number;
  total_seen: number;
  note?: string;
};

export type Branch = {
  id: number;
  company_id: number;
  name: string;
  address: string | null;
  created_by_uid: string | null;
  employees_count: number;
  created_at: string | null;
  updated_at: string | null;
  employees?: number[];
  employees_detail?: { id: number; full_name: string }[];
};

export type BranchPayload = { name: string; address?: string | null };

export type PickEmployee = { id: number; full_name: string; position: string | null };

export type FieldType = "text" | "number" | "select";
export type TemplateField = {
  key?: string;
  label: string;
  type: FieldType;
  unit?: string;
  required?: boolean;
  options?: string[];
};

export type ItemTemplate = {
  id: number;
  company_id: number;
  name: string;
  category: string | null;
  fields_schema: TemplateField[];
  created_at: string | null;
  updated_at: string | null;
};

export type TemplatePayload = {
  name: string;
  category?: string | null;
  fields_schema: TemplateField[];
};

// ── Suppliers ────────────────────────────────────────────────────────────────
export function useSuppliers(companyId: number, q: string) {
  return useQuery<Supplier[]>({
    queryKey: ["wh", "suppliers", companyId, q],
    queryFn: async () =>
      (await api.get(`${base(companyId)}/suppliers`, { params: q ? { q } : {} })).data,
    enabled: !!companyId,
    staleTime: 15_000,
  });
}

export function useSaveSupplier(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id?: number; payload: SupplierPayload }) =>
      v.id
        ? (await api.put(`${base(companyId)}/suppliers/${v.id}`, v.payload)).data
        : (await api.post(`${base(companyId)}/suppliers`, v.payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wh", "suppliers", companyId] }),
  });
}

export function useDeleteSupplier(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`${base(companyId)}/suppliers/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wh", "suppliers", companyId] }),
  });
}

export function useSyncSuppliers(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      (await api.post(`${base(companyId)}/suppliers/sync`)).data as SyncResult,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wh", "suppliers", companyId] }),
  });
}

// ── Branches ───────────────────────────────────────────────────────────────
export function useBranches(companyId: number) {
  return useQuery<Branch[]>({
    queryKey: ["wh", "branches", companyId],
    queryFn: async () => (await api.get(`${base(companyId)}/branches`)).data,
    enabled: !!companyId,
    staleTime: 15_000,
  });
}

export function useBranch(companyId: number, branchId: number | null) {
  return useQuery<Branch>({
    queryKey: ["wh", "branch", companyId, branchId],
    queryFn: async () => (await api.get(`${base(companyId)}/branches/${branchId}`)).data,
    enabled: !!companyId && !!branchId,
  });
}

export function useSaveBranch(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id?: number; payload: BranchPayload }) =>
      v.id
        ? (await api.put(`${base(companyId)}/branches/${v.id}`, v.payload)).data
        : (await api.post(`${base(companyId)}/branches`, v.payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wh", "branches", companyId] }),
  });
}

export function useDeleteBranch(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`${base(companyId)}/branches/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wh", "branches", companyId] }),
  });
}

export function useEmployeesPick(companyId: number, enabled = true) {
  return useQuery<PickEmployee[]>({
    queryKey: ["wh", "employees-pick", companyId],
    queryFn: async () => (await api.get(`${base(companyId)}/employees-pick`)).data,
    enabled: !!companyId && enabled,
    staleTime: 60_000,
  });
}

export function useAttachEmployee(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { branchId: number; employeeId: number }) =>
      (await api.post(`${base(companyId)}/branches/${v.branchId}/employees`, {
        employee_id: v.employeeId,
      })).data,
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["wh", "branch", companyId, v.branchId] });
      qc.invalidateQueries({ queryKey: ["wh", "branches", companyId] });
    },
  });
}

export function useDetachEmployee(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { branchId: number; employeeId: number }) =>
      (await api.delete(`${base(companyId)}/branches/${v.branchId}/employees/${v.employeeId}`)).data,
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["wh", "branch", companyId, v.branchId] });
      qc.invalidateQueries({ queryKey: ["wh", "branches", companyId] });
    },
  });
}

// ── Item templates ───────────────────────────────────────────────────────────
export function useTemplates(companyId: number, q: string) {
  return useQuery<ItemTemplate[]>({
    queryKey: ["wh", "templates", companyId, q],
    queryFn: async () =>
      (await api.get(`${base(companyId)}/templates`, { params: q ? { q } : {} })).data,
    enabled: !!companyId,
    staleTime: 15_000,
  });
}

export function useSaveTemplate(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id?: number; payload: TemplatePayload }) =>
      v.id
        ? (await api.put(`${base(companyId)}/templates/${v.id}`, v.payload)).data
        : (await api.post(`${base(companyId)}/templates`, v.payload)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wh", "templates", companyId] }),
  });
}

export function useDeleteTemplate(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.delete(`${base(companyId)}/templates/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["wh", "templates", companyId] }),
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function errDetail(e: unknown): string {
  const r = (e as { response?: { data?: { detail?: unknown; message?: string; error?: string } } })
    .response?.data;
  const d = r?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return r?.message || r?.error || "Xatolik yuz berdi";
}
