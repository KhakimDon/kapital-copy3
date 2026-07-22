/**
 * Client for the RBAC surface (`/api/v2/authz/*`).
 *
 *  - `useMyPermissions()` / `usePerm()` — the caller's effective permissions,
 *    used everywhere to gate UI (`can("keys.export", companyId)`).
 *  - catalog / roles / grants hooks — power the access-admin screens.
 *
 * Permission model: a permission is `<module>.<action>` (e.g. `keys.view`).
 * A user holds permissions at tenant scope (apply to every company) and/or per
 * company. `is_admin` / `is_superadmin` are an allow-all.
 */
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { useAuth } from "@/shared/store/auth";

// ── Presence heartbeat ──────────────────────────────────────────────────────

/**
 * While a token exists, ping `/me/heartbeat` on mount and every 60s so the
 * backend can track last-seen / online presence. Call once from the app shell.
 */
export function useHeartbeat() {
  const token = useAuth((s) => s.token);
  useEffect(() => {
    if (!token) return;
    const ping = () => { api.post("/me/heartbeat").catch(() => {}); };
    ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, [token]);
}

// ── Effective permissions (gating) ────────────────────────────────────────

export type MyPermissions = {
  is_admin: boolean;
  is_superadmin: boolean;
  /** Permissions granted tenant-wide (apply to every company). */
  tenant: string[];
  /** Permissions granted per company: { [companyId]: string[] }. */
  companies: Record<string, string[]>;
};

export function useMyPermissions() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ["authz", "me"],
    queryFn: async () => (await api.get<MyPermissions>("/authz/me")).data,
    enabled: !!token,
    staleTime: 5 * 60_000,
  });
}

export type PermChecker = {
  /** Ready = permissions have loaded. Gate hard hides on `ready` to avoid flicker. */
  ready: boolean;
  /** Admin / superadmin — an allow-all. */
  privileged: boolean;
  /** Holds `perm` for a specific company (or tenant-wide). */
  can: (perm: string, companyId?: number | string | null) => boolean;
  /** Holds `perm` in ANY scope (tenant or any company) — for nav/module gating. */
  canAny: (perm: string) => boolean;
  /** Can access a module at all (`<slug>.view` anywhere). */
  canModule: (slug: string) => boolean;
  data?: MyPermissions;
};

export function usePerm(): PermChecker {
  const { data, isLoading } = useMyPermissions();
  const privileged = !!(data?.is_admin || data?.is_superadmin);

  const can = (perm: string, companyId?: number | string | null) => {
    if (privileged) return true;
    if (!data) return false;
    if (data.tenant.includes(perm)) return true;
    if (companyId != null) {
      const set = data.companies[String(companyId)];
      return !!set && set.includes(perm);
    }
    return false;
  };

  const canAny = (perm: string) => {
    if (privileged) return true;
    if (!data) return false;
    if (data.tenant.includes(perm)) return true;
    return Object.values(data.companies).some((s) => s.includes(perm));
  };

  return {
    ready: !isLoading && !!data,
    privileged,
    can,
    canAny,
    canModule: (slug: string) => canAny(`${slug}.view`),
    data,
  };
}

// ── Catalog + roles + grants (admin) ──────────────────────────────────────

export type PermSpec = {
  key: string;
  module: string;
  action: string;
  dangerous: boolean;
};
/** Per-language label overrides for a module (title + description). */
export type ModuleLabelSet = {
  title?: { uz?: string; ru?: string; en?: string };
  desc?: { uz?: string; ru?: string; en?: string };
};

export type CatalogModule = {
  slug: string;
  title: string;
  state: string;
  permissions: PermSpec[];
  /** Superadmin-authored label overrides, present only when set. */
  labels?: ModuleLabelSet;
};

export function useCatalog() {
  return useQuery({
    queryKey: ["authz", "catalog"],
    queryFn: async () =>
      (await api.get<{ modules: CatalogModule[] }>("/authz/catalog")).data.modules,
    staleTime: 30 * 60_000,
  });
}

// ── Module label overrides (i18n for module titles/descriptions) ────────────

/** The full stored overrides object: `{ [slug]: ModuleLabelSet }`. */
export type ModuleLabels = Record<string, ModuleLabelSet>;

/** Read the stored module-label overrides (admin). May be `{}` when unset. */
export function useModuleLabels() {
  return useQuery({
    queryKey: ["authz", "module-labels"],
    queryFn: async () =>
      (await api.get<ModuleLabels>("/authz/module-labels")).data,
    staleTime: 30 * 60_000,
  });
}

/** Replace the whole overrides object (superadmin). Send the full object. */
export function useSaveModuleLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ModuleLabels) =>
      (await api.put("/authz/module-labels", body)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["authz", "module-labels"] });
      qc.invalidateQueries({ queryKey: ["authz", "catalog"] });
    },
  });
}

/** Map an i18n language code to an override slot key. `uz_Cyrl` → `uz`. */
function overrideLang(lang: string): "uz" | "ru" | "en" | null {
  if (lang === "uz_Cyrl" || lang === "uz") return "uz";
  if (lang === "ru") return "ru";
  if (lang === "en") return "en";
  return null;
}

/** Title override for `mod` in `lang`, or `undefined` if none. */
export function moduleLabel(mod: CatalogModule, lang: string): string | undefined {
  const k = overrideLang(lang);
  return k ? mod.labels?.title?.[k] || undefined : undefined;
}

/** Description override for `mod` in `lang`, or `undefined` if none. */
export function moduleDesc(mod: CatalogModule, lang: string): string | undefined {
  const k = overrideLang(lang);
  return k ? mod.labels?.desc?.[k] || undefined : undefined;
}

export type Role = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  is_system: boolean;
  /** True when the current user may edit/delete this role (own-tenant or superadmin). */
  editable: boolean;
  /** Owning tenant slug, or null for a platform (superadmin-owned) role. */
  tenant: string | null;
  permissions: string[];
};

export function useRoles() {
  return useQuery({
    queryKey: ["authz", "roles"],
    queryFn: async () => (await api.get<{ items: Role[] }>("/authz/roles")).data.items,
  });
}

export type RoleInput = { name: string; description?: string | null; permissions: string[] };

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: RoleInput) =>
      (await api.post<{ id: number; key: string }>("/authz/roles", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["authz", "roles"] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: RoleInput & { id: number }) =>
      (await api.put(`/authz/roles/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["authz", "roles"] }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.delete(`/authz/roles/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["authz", "roles"] }),
  });
}

export type Grant = {
  id: number;
  role_key: string;
  scope_type: "tenant" | "company";
  company_id: number | null;
  company_name: string | null;
};

export function useUserGrants(userId: number | null) {
  return useQuery({
    queryKey: ["authz", "user-grants", userId],
    queryFn: async () =>
      (await api.get<{ items: Grant[] }>(`/authz/users/${userId}/grants`)).data.items,
    enabled: userId != null,
  });
}

export type GrantInput = {
  role_key: string;
  scope_type: "tenant" | "company";
  company_id?: number | null;
};

export function useSetUserGrants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, grants }: { userId: number; grants: GrantInput[] }) =>
      (await api.put(`/authz/users/${userId}/grants`, { grants })).data,
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["authz", "user-grants", v.userId] });
      qc.invalidateQueries({ queryKey: ["authz", "me"] });
      qc.invalidateQueries({ queryKey: ["authz", "assignments"] });
    },
  });
}

// ── Assignments overview (admin) ────────────────────────────────────────────

// Every user who holds at least one role grant, with their grants inlined for
// display. Unlike `useUserGrants`, these grants carry NO `id` — they are
// read-only here; edit a user via `useUserGrants` + `useSetUserGrants`.
export type Assignment = {
  user_id: number;
  username: string;
  first_name: string | null;
  last_name: string | null;
  grants: Grant[];
};

export function useAssignments() {
  return useQuery({
    queryKey: ["authz", "assignments"],
    queryFn: async () =>
      (await api.get<{ items: Assignment[] }>("/authz/assignments")).data.items,
  });
}

export type CompanyGrant = {
  user_id: number;
  username: string;
  role_key: string;
};

export function useCompanyGrants(companyId: number | null) {
  return useQuery({
    queryKey: ["authz", "company-grants", companyId],
    queryFn: async () =>
      (await api.get<{ items: CompanyGrant[] }>(`/authz/companies/${companyId}/grants`)).data.items,
    enabled: companyId != null,
  });
}
