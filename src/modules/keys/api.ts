import {
  keepPreviousData, useMutation, useQueries, useQuery, useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// ── Types (inline) ───────────────────────────────────────────────────────────
export type KeyCompany = {
  id: number;
  name: string;
  inn: string;
  legal_form: string;
  director_name: string;
  keys_count: number;
  is_active: boolean;
  created_at: string | null;
};

// Detail-page shape (superset of list shape — adds info-card fields).
// Mirrors cloud js/company-detail.js renderInfo() reads.
export type KeyCompanyDetail = KeyCompany & {
  oked: string;
  accountant_name: string;
  email: string;
  phone: string;
  address: string;
  registration_date: string | null;
  bank_name: string;
  bank_mfo: string;
  bank_account: string;
  tg_group_id: string;
  responsible_employee: {
    username: string;
    full_name: string;
    email: string;
  } | null;
};

export type KeyStatus = "active" | "expiring" | "expired";

export type SignKey = {
  id: number;
  owner_name: string;
  tin: string;
  pinfl: string;
  serial: string;
  valid_from: string | null;
  valid_to: string | null;
  status: KeyStatus;
  is_aiba_active: boolean;
  organization: string;
  name: string;
  created_at: string | null;
  // es-key-connector certificate UUID — used by mehnat sync for EDS signing
  connector_certificate_id: string;
};

// ── Queries ──────────────────────────────────────────────────────────────────
export function useKeyCompanies() {
  return useQuery({
    queryKey: ["keys", "companies"],
    queryFn: async () => (await api.get<KeyCompany[]>("/keys/companies")).data,
  });
}

export function useKeyCompany(companyId: number | null) {
  return useQuery({
    queryKey: ["keys", "company", companyId],
    enabled: companyId != null,
    queryFn: async () =>
      (await api.get<KeyCompanyDetail>(`/keys/companies/${companyId}`)).data,
  });
}

export function useCompanyKeys(companyId: number | null) {
  return useQuery({
    queryKey: ["keys", "company", companyId, "keys"],
    enabled: companyId != null,
    queryFn: async () =>
      (await api.get<SignKey[]>(`/keys/companies/${companyId}/keys`)).data,
  });
}

// ── Admin (KM proxy) ─────────────────────────────────────────────────────────
// Raw KM shapes — _eskey_to_dict / UserSerializer on the KM side.

export type AdminKey = {
  id: number;
  name: string;
  password: string;
  company_id: number | null;
  validation_status: string | null;
  is_aiba_active: boolean;
  connector_certificate_id: string | null;
  attached_user_ids: number[];
  file: string | null;
  created_at: string | null;
};

export type KmUser = {
  id: number;
  username: string;
  email: string;
  role: string;
  first_name: string;
  last_name: string;
  // Present only on KM instances whose UserSerializer was enriched (read-only).
  phone?: string;
  is_active?: boolean;
  date_joined?: string;
  // Presence timestamps (ISO) — populated by the enriched admin users endpoint.
  last_seen?: string | null;
  last_login?: string | null;
};

export type CompanyWrite = Partial<{
  name: string;
  inn: string;
  oked: string;
  legal_form: string;
  registration_date: string;
  address: string;
  phone: string;
  email: string;
  director_name: string;
  director_phone: string;
  director_tg_id: string;
  accountant_name: string;
  bank_name: string;
  bank_mfo: string;
  bank_account: string;
  tg_group_id: string;
  bot_url: string;
  is_active: boolean;
}>;

/** KM legal-form choices (core.Company.LEGAL_FORM_CHOICES) for the select. */
export const LEGAL_FORMS: readonly (readonly [string, string])[] = [
  ["MChJ", "MChJ (МЧЖ/ООО)"],
  ["AJ", "AJ (АЖ/АО)"],
  ["YaTT", "YaTT (ЯТТ/ИП)"],
  ["XK", "XK (ХК)"],
  ["QK MChJ", "QK MChJ (ҚК МЧЖ)"],
  ["NNT", "NNT (ННТ)"],
  ["NTM", "NTM (НТМ)"],
  ["Individual", "Individual (Жисмоний шахс)"],
  ["Self-employed", "Self-employed (Ўз-ўзини банд қилган)"],
];

export function useCompanyResponsible(companyId: number | null) {
  return useQuery({
    queryKey: ["keys", "company", companyId, "responsible"],
    enabled: companyId != null,
    queryFn: async () => (await api.get<number[]>(`/keys/companies/${companyId}/responsible`)).data,
  });
}

export function useSetCompanyResponsible() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, userIds }: { companyId: number; userIds: number[] }) =>
      (await api.put(`/keys/companies/${companyId}/responsible`, { user_ids: userIds })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keys"] }),
  });
}

/**
 * The user↔company link is a company-side M2M in KM (no user-centric endpoint),
 * so to edit it FROM the user we read every company's responsible list and write
 * back the ones that change. `useResponsibleByCompany` fetches them all (sharing
 * cache with per-company responsible queries); `useSetUserCompanies` diffs+PUTs.
 */
export function useResponsibleByCompany(companyIds: number[]) {
  const results = useQueries({
    queries: companyIds.map((id) => ({
      queryKey: ["keys", "company", id, "responsible"] as const,
      queryFn: async () => (await api.get<number[]>(`/keys/companies/${id}/responsible`)).data,
      staleTime: 30_000,
    })),
  });
  const byCompany = new Map<number, number[]>();
  results.forEach((r, i) => { if (r.data) byCompany.set(companyIds[i], r.data); });
  return {
    byCompany,
    isLoading: companyIds.length > 0 && results.some((r) => r.isLoading),
    isReady: results.every((r) => r.isSuccess),
  };
}

export function useSetUserCompanies() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, byCompany, add, remove }: {
      userId: number; byCompany: Map<number, number[]>; add: number[]; remove: number[];
    }) => {
      for (const cid of add) {
        const set = new Set(byCompany.get(cid) ?? []); set.add(userId);
        await api.put(`/keys/companies/${cid}/responsible`, { user_ids: [...set] });
      }
      for (const cid of remove) {
        const set = new Set(byCompany.get(cid) ?? []); set.delete(userId);
        await api.put(`/keys/companies/${cid}/responsible`, { user_ids: [...set] });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keys"] }),
  });
}

/** Everything under ["keys"] — companies list, company detail, key lists. */
function useInvalidateKeys() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["keys"] });
}

export function useAdminKey(keyId: number | null) {
  return useQuery({
    queryKey: ["keys", "admin", "key", keyId],
    enabled: keyId != null,
    queryFn: async () => (await api.get<AdminKey>(`/keys/admin/keys/${keyId}`)).data,
  });
}

export function useKmUsers(enabled: boolean) {
  return useQuery({
    queryKey: ["keys", "admin", "users"],
    enabled,
    staleTime: 60_000,
    queryFn: async () => (await api.get<KmUser[]>("/keys/admin/users")).data,
  });
}

export function useKmUser(userId: number | null) {
  return useQuery({
    queryKey: ["keys", "admin", "user", userId],
    enabled: userId != null,
    queryFn: async () => (await api.get<KmUser>(`/keys/admin/users/${userId}`)).data,
  });
}

export function useCreateKey() {
  const invalidate = useInvalidateKeys();
  return useMutation({
    mutationFn: async (input: { file: File; name: string; password: string; company: number }) => {
      const fd = new FormData();
      fd.append("file", input.file);
      fd.append("name", input.name);
      fd.append("password", input.password);
      fd.append("company", String(input.company));
      // PFX parse + KM-side cert sync is slow — give it the same 60s the backend allows
      return (await api.post<AdminKey>("/keys/admin/keys", fd, { timeout: 90_000 })).data;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateKey() {
  const invalidate = useInvalidateKeys();
  return useMutation({
    mutationFn: async ({ keyId, ...patch }: {
      keyId: number;
      name?: string;
      password?: string;
      validation_status?: string;
      company?: number;
      attached_user_ids?: number[];
    }) => (await api.patch<AdminKey>(`/keys/admin/keys/${keyId}`, patch, { timeout: 90_000 })).data,
    onSuccess: invalidate,
  });
}

export function useDeleteKey() {
  const invalidate = useInvalidateKeys();
  return useMutation({
    mutationFn: async (keyId: number) => api.delete(`/keys/admin/keys/${keyId}`),
    onSuccess: invalidate,
  });
}

export type KmUserCreate = {
  username: string;
  password: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  role?: string;
  is_active?: boolean;
};

export function useCreateKmUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: KmUserCreate) =>
      (await api.post<KmUser>("/keys/admin/users", body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keys", "admin", "users"] }),
  });
}

export function useCreateCompany() {
  const invalidate = useInvalidateKeys();
  return useMutation({
    mutationFn: async (body: CompanyWrite) =>
      (await api.post<KeyCompanyDetail>("/keys/companies", body)).data,
    onSuccess: invalidate,
  });
}

export function useUpdateCompany() {
  const invalidate = useInvalidateKeys();
  return useMutation({
    mutationFn: async ({ companyId, ...body }: CompanyWrite & { companyId: number }) =>
      (await api.patch<KeyCompanyDetail>(`/keys/companies/${companyId}`, body)).data,
    onSuccess: invalidate,
  });
}

export function useDeleteCompany() {
  const invalidate = useInvalidateKeys();
  return useMutation({
    mutationFn: async (companyId: number) => api.delete(`/keys/companies/${companyId}`),
    onSuccess: invalidate,
  });
}

// ── Admin: all-keys list (KM admin surface) ──────────────────────────────────

export function useAdminKeys(enabled = true) {
  return useQuery({
    queryKey: ["keys", "admin", "keys"],
    enabled,
    queryFn: async () => (await api.get<AdminKey[]>("/keys/admin/keys")).data,
  });
}

// ── Admin: user update / delete (create lives in useCreateKmUser) ─────────────

export type KmUserUpdate = Partial<{
  username: string;
  password: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
  role: string;
  is_active: boolean;
}>;

export function useUpdateKmUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, ...patch }: KmUserUpdate & { userId: number }) =>
      (await api.patch<KmUser>(`/keys/admin/users/${userId}`, patch)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keys", "admin", "users"] }),
  });
}

export function useDeleteKmUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: number) => api.delete(`/keys/admin/users/${userId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["keys", "admin", "users"] }),
  });
}

// ── Logs (KM ActivityLog) ────────────────────────────────────────────────────

export type ActivityLog = {
  id: number;
  username: string;
  service: string;
  service_display: string;
  action: string;
  action_display: string;
  resource_type: string;
  resource_id: string;
  description: string;
  metadata: Record<string, unknown>;
  ip_address: string;
  user_agent: string;
  timestamp: string;
};

export type LogsPage = {
  logs: ActivityLog[];
  total: number;
  page: number;
  page_size: number;
};

export type LogsFilter = {
  service?: string;
  action?: string;
  resource_type?: string;
  username?: string;
  days?: number;
  page?: number;
  page_size?: number;
};

export function useActivityLogs(filter: LogsFilter) {
  return useQuery({
    queryKey: ["keys", "admin", "logs", filter],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await api.get<LogsPage>("/keys/admin/logs", { params: filter })).data,
  });
}

// ── Webvisor (session recordings + rrweb events) ─────────────────────────────

export type WebvisorSession = {
  id: string;
  username: string | null;
  user_full_name: string | null;
  domain: string;
  ip_address: string | null;
  device_type: string;
  browser: string;
  os: string;
  started_at: string | null;
  duration_seconds: number | null;
  has_events: boolean;
};

export type WebvisorPage = {
  sessions: WebvisorSession[];
  total: number;
  page: number;
  page_size: number;
};

export type WebvisorEventsResp = {
  session_id: string;
  domain: string;
  started_at: string | null;
  duration_seconds: number | null;
  count: number;
  events: unknown[];
};

export function useWebvisorSessions(filter: {
  domain?: string; username?: string; days?: number; page?: number; page_size?: number;
}) {
  return useQuery({
    queryKey: ["keys", "admin", "webvisor", filter],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await api.get<WebvisorPage>("/keys/admin/webvisor", { params: filter })).data,
  });
}

export function useWebvisorEvents(sessionId: string | null) {
  return useQuery({
    queryKey: ["keys", "admin", "webvisor", "events", sessionId],
    enabled: sessionId != null,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      (await api.get<WebvisorEventsResp>(`/keys/admin/webvisor/${sessionId}/events`)).data,
  });
}
