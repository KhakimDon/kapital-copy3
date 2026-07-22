/**
 * <Can perm="keys.export" company={id}>…</Can> — render children only if the
 * current user holds the permission (optionally scoped to a company). Thin
 * wrapper over `usePerm()` for the common conditional-render case.
 */
import type { ReactNode } from "react";
import { usePerm } from "@/shared/api/authz";

export function Can({
  perm,
  company,
  anyScope,
  fallback = null,
  children,
}: {
  perm: string;
  company?: number | string | null;
  /** Check the permission in ANY scope instead of a specific company. */
  anyScope?: boolean;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can, canAny } = usePerm();
  const ok = anyScope ? canAny(perm) : can(perm, company);
  return <>{ok ? children : fallback}</>;
}
