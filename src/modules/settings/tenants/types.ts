/**
 * Tenant types for the superadmin Tenants management UI.
 * Backend: /api/v2/admin/tenants/*
 */

export type TenantPlacement = "dedicated" | "shared" | "local";

export type TenantModule = { slug: string; name: string };

export type Tenant = {
  id: number;
  slug: string;
  name: string;
  status: string;
  placement: TenantPlacement;
  max_companies: number;
  max_keys: number;
  expiry_at: string | null;
  created_at: string;
  /** Module slugs the superadmin has hidden for this tenant. */
  disabled_modules?: string[];
};

/** Live per-tenant DB counts — any may be null when the tenant DB is unreachable. */
export type TenantCounts = {
  companies: number | null;
  keys: number | null;
  users: number | null;
};

/**
 * Server connection info for a dedicated tenant DB, as returned by the backend.
 * The password is NEVER exposed. `configured` is false when no dsn is set.
 */
export type TenantConnection = {
  configured: boolean;
  host: string | null;
  port: number | null;
  database: string | null;
  username: string | null;
};

export type TenantDetail = Tenant & {
  counts: TenantCounts;
  connection?: TenantConnection;
};

/** POST /admin/tenants/:id/test result — live reachability probe of the DSN. */
export type TenantTestResult = {
  reachable: boolean;
  has_km_schema?: boolean;
  companies?: number | null;
  connection?: TenantConnection;
  error?: string;
};

export type TenantsList = {
  items: Tenant[];
  count: number;
};

/** POST /admin/tenants body. dsn REQUIRED when placement === "dedicated". */
export type TenantCreate = {
  slug: string;
  name: string;
  placement: TenantPlacement;
  dsn?: string;
  max_companies: number;
  max_keys: number;
  expiry_at?: string | null;
};

/** PATCH /admin/tenants/:id body. expiry_at: ISO to set, null to clear. */
export type TenantUpdate = Partial<{
  name: string;
  status: string;
  dsn: string;
  max_companies: number;
  max_keys: number;
  expiry_at: string | null;
}>;

export type TenantsListParams = {
  q?: string;
  status?: string;
  /** true → fetch ONLY archived tenants (the Arxiv view). */
  archived?: boolean;
};

/** GET /admin/tenants/:id/companies → items */
export type TenantCompanyRow = {
  id: number;
  name: string;
  inn: string | null;
  is_active: boolean;
};

/** GET /admin/tenants/:id/keys → items */
export type TenantKeyRow = {
  id: number;
  name: string;
  validation_status: string | null;
  company_name: string | null;
};

/** GET /admin/tenants/:id/users → items */
export type TenantUserRow = {
  uid: string;
  display_name: string | null;
  email: string | null;
  is_admin: boolean;
  is_active: boolean;
  last_login_at: string | null;
};

/** POST /admin/tenants/:id/users body. */
export type TenantUserCreate = {
  username: string;
  password: string;
  display_name?: string;
  email?: string;
  is_admin?: boolean;
};

/** Paginated-ish sub-resource list envelope used by tenant sub-resources. */
export type TenantSubList<T> = {
  items: T[];
  count: number;
};
