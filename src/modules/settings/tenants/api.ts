/**
 * TanStack Query hooks for the superadmin Tenants surface.
 * baseURL already includes /api/v2 → call paths like /admin/tenants.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type {
  Tenant, TenantDetail, TenantsList,
  TenantCreate, TenantUpdate, TenantsListParams, TenantTestResult,
  TenantCompanyRow, TenantKeyRow, TenantUserRow, TenantUserCreate, TenantSubList,
  TenantModule,
} from "./types";

export function useTenants(params: TenantsListParams = {}) {
  return useQuery({
    queryKey: ["tenants", params],
    queryFn: async () =>
      (await api.get<TenantsList>("/admin/tenants", { params })).data,
  });
}

export function useTenant(id: number | null) {
  return useQuery({
    queryKey: ["tenant", id],
    enabled: id != null,
    queryFn: async () =>
      (await api.get<TenantDetail>(`/admin/tenants/${id}`)).data,
  });
}

export function useCreateTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TenantCreate) =>
      (await api.post<Tenant>("/admin/tenants", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

// One-shot legacy-KM import: registers the tenant AND pulls users, companies,
// resources, keys + attach tables from an old KM Postgres in the same call.
// PFX blobs on the daemon filesystem are NOT copied — that's a separate scp
// step in the runbook; km.keys.file_minio_key already carries the filename
// so once the files land in the target daemon's DSKEYS dir the picker
// picks them up automatically.
export type TenantImportBody = TenantCreate & {
  legacy: {
    pg_dsn: string;
    km_enc_key: string;
    activity_days?: number;
  };
  nc?: {
    url: string;
    admin_user?: string;
    admin_pass?: string;
    pg_dsn?: string;
  };
};
export type TenantImportResult = {
  ok: boolean;
  tenant_id: number;
  slug: string;
  stats: {
    users: number;
    companies: number;
    resources: number;
    resource_access: number;
    keys: number;
    eskey_attached_users: number;
    activity_log: number;
  };
};
export function useImportTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TenantImportBody) =>
      (await api.post<TenantImportResult>("/admin/import-tenant", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tenants"] }),
  });
}

export function useUpdateTenant(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TenantUpdate) =>
      (await api.patch<Tenant>(`/admin/tenants/${id}`, body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["tenant", id] });
    },
  });
}

/**
 * Live-test a tenant's DB connection. Opens a real connection server-side and
 * reports reachability + whether the `km` schema exists. Pass the tenant id.
 */
export function useTestTenant() {
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.post<TenantTestResult>(`/admin/tenants/${id}/test`)).data,
  });
}

/** Suspend a tenant (PATCH status=suspended) — temporary, still listed. */
export function useSuspendTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.patch<Tenant>(`/admin/tenants/${id}`, { status: "suspended" })).data,
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["tenant", id] });
    },
  });
}

/** Archive a tenant (DELETE → status=archived) — data preserved, hidden from the
 * main list. Restore via useUpdateTenant({status:"active"}). */
export function useArchiveTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.delete<Tenant>(`/admin/tenants/${id}`)).data,
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["tenant", id] });
    },
  });
}

/** Re-run the canonical bootstrap DDL against an existing tenant's DB. Idempotent
 * — every table is CREATE IF NOT EXISTS. Fixes tenants registered on an older
 * backend that shipped a smaller schema, or catches an existing tenant up to a
 * newly-added table without an admin psql session. */
export function useBootstrapTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.post<{ ok: boolean; slug: string }>(`/admin/tenants/${id}/bootstrap`)).data,
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["tenant", id] });
    },
  });
}

/** Purge a tenant (`DELETE ?purge=true`) — control row is removed and, for
 * placement=local tenants, the auto-provisioned role + DB are dropped from
 * the shared Postgres. Slug becomes free for re-registration. */
export type TenantPurgeResult = {
  ok: boolean;
  slug: string;
  purged: boolean;
  placement: string;
  dropped: { role: boolean; database: boolean };
};
export function usePurgeTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      (await api.delete<TenantPurgeResult>(`/admin/tenants/${id}?purge=true`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
    },
  });
}

/** Companies belonging to a tenant (live read from the tenant DB). */
export function useTenantCompanies(id: number | null) {
  return useQuery({
    queryKey: ["tenant-companies", id],
    enabled: id != null,
    queryFn: async () =>
      (await api.get<TenantSubList<TenantCompanyRow>>(`/admin/tenants/${id}/companies`)).data,
  });
}

/** Sign keys belonging to a tenant. */
export function useTenantKeys(id: number | null) {
  return useQuery({
    queryKey: ["tenant-keys", id],
    enabled: id != null,
    queryFn: async () =>
      (await api.get<TenantSubList<TenantKeyRow>>(`/admin/tenants/${id}/keys`)).data,
  });
}

/** Auth users defined in the tenant DB. */
export function useTenantUsers(id: number | null) {
  return useQuery({
    queryKey: ["tenant-users", id],
    enabled: id != null,
    queryFn: async () =>
      (await api.get<TenantSubList<TenantUserRow>>(`/admin/tenants/${id}/users`)).data,
  });
}

/**
 * Create an admin (or regular) user in the tenant DB.
 * 409 when the tenant DB has no `auth.users` table yet — surface its `detail`.
 */
export function useCreateTenantUser(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: TenantUserCreate) =>
      (await api.post<{ ok: boolean; uid: string; is_admin: boolean }>(
        `/admin/tenants/${id}/users`,
        body,
      )).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenant-users", id] });
      qc.invalidateQueries({ queryKey: ["tenant", id] });
    },
  });
}

/** Catalog of every module the nav exposes — for the per-tenant "Modullar" checklist. */
export function useModulesCatalog() {
  return useQuery({
    queryKey: ["admin-modules"],
    queryFn: async () =>
      (await api.get<{ items: TenantModule[]; count: number }>("/admin/modules")).data.items,
    staleTime: 10 * 60_000,
  });
}

/** Replace this tenant's hidden-module list (superadmin). */
export function useSetDisabledModules(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (disabled_modules: string[]) =>
      (await api.put<{ ok: boolean; disabled_modules: string[] }>(
        `/admin/tenants/${id}/disabled-modules`,
        { disabled_modules },
      )).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tenants"] });
      qc.invalidateQueries({ queryKey: ["tenant", id] });
      qc.invalidateQueries({ queryKey: ["me"] }); // refresh nav for the active session
    },
  });
}
