// Dynamic-dashboard backend contract (v2). The layout drives the whole page:
// the caller's role layout (read-only for users, editable for admins), the
// widget catalog, per-role layouts for the admin editor, saves, and the new
// per-user attendance card. See the finance hooks in ./api.ts for the reused
// widget data.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

const BASE = "/dashboard";

// ── types ─────────────────────────────────────────────────────────────────────

export type CatalogWidget = {
  type: string;
  defaultColspan: number;
  adminOnly: boolean;
};

export type CatalogRole = { key: string; name: string };

export type DashCatalog = {
  widgets: CatalogWidget[];
  roles: CatalogRole[];
};

export type LayoutWidget = {
  id: string;
  type: string;
  colspan: number;
  settings?: Record<string, unknown>;
};

export type DashLayout = {
  role: string;
  widgets: LayoutWidget[];
  editable: boolean;
};

export type RoleLayout = { role: string; widgets: LayoutWidget[] };
export type DashLayouts = { items: RoleLayout[] };

export type Attendance = {
  matched: boolean;
  date: string;
  arrived: string | null; // "HH:MM"
  status: "present" | "late" | "absent" | null;
  lateMinutes: number;
  scheduleStart: string | null; // "HH:MM"
  checkOut: string | null; // "HH:MM"
};

// ── queries ───────────────────────────────────────────────────────────────────

/** Available widget types + role list (drives the admin catalog drawer). */
export function useDashCatalog() {
  return useQuery<DashCatalog>({
    queryKey: ["dashboard", "catalog"],
    queryFn: async () => (await api.get(`${BASE}/catalog`)).data,
    staleTime: 30 * 60_000,
  });
}

/** The caller's own role layout (default template when unset). */
export function useDashLayout() {
  return useQuery<DashLayout>({
    queryKey: ["dashboard", "layout"],
    queryFn: async () => (await api.get(`${BASE}/layout`)).data,
    staleTime: 60_000,
  });
}

/** All per-role layouts — admin editor source (edit any role's layout). */
export function useDashLayouts(enabled: boolean) {
  return useQuery<DashLayouts>({
    queryKey: ["dashboard", "layouts"],
    queryFn: async () => (await api.get(`${BASE}/layouts`)).data,
    enabled,
    staleTime: 60_000,
  });
}

/** Persist one role's widget layout (admin). */
export function useSaveDashLayout() {
  const qc = useQueryClient();
  return useMutation<RoleLayout, Error, { role: string; widgets: LayoutWidget[] }>({
    mutationFn: async ({ role, widgets }) =>
      (await api.put(`${BASE}/layout/${encodeURIComponent(role)}`, { widgets })).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["dashboard", "layout"] });
      void qc.invalidateQueries({ queryKey: ["dashboard", "layouts"] });
    },
  });
}

/** The current user's attendance for today (arrival / lateness / check-out). */
export function useMyAttendance(companyId: number | null) {
  return useQuery<Attendance>({
    queryKey: ["dashboard", "attendance", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/attendance/me`, { params: { company_id: companyId } })).data,
    enabled: !!companyId,
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}
