/**
 * UserViewPage — read-only detail for a KM user.
 *
 * Route: /keys/admin/users/:id
 *
 * Shows the profile (username, name, user-type, status, contacts, presence)
 * plus the assigned RBAC roles and companies (from grants). A header offers a
 * back link to the users list and an Edit button → /users/:id/edit.
 */
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil } from "lucide-react";
import { useTabs } from "@/shared/store/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/reveal";
import { useRoles, useUserGrants } from "@/shared/api/authz";
import { useKmUser, type KmUser } from "../api";
import { Section } from "./form-bits";

const ONLINE_MS = 12 * 60 * 1000;

function isOnline(u: KmUser) {
  if (!u.last_seen) return false;
  const ms = new Date(u.last_seen).getTime();
  return !Number.isNaN(ms) && Date.now() - ms < ONLINE_MS;
}

function fmtDateTime(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("ru-RU", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
}

const ROLE_VARIANT: Record<string, "danger" | "info" | "muted"> = {
  admin: "danger", client: "info", user: "muted",
};

/** A read-only label + value pair, matching the form-page Field spacing. */
function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

export function UserViewPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const { id } = useParams();
  const userId = id ? Number(id) : null;

  const { data: user, isLoading } = useKmUser(userId);
  const { data: grants } = useUserGrants(userId);
  const { data: roles } = useRoles();

  const setTabTitle = useTabs((s) => s.setTitle);
  useEffect(() => {
    setTabTitle(loc.pathname + loc.search, user?.username || t("modules.keys.admin.users"));
  }, [user?.username, t, loc.pathname, loc.search, setTabTitle]);

  const roleNameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roles ?? []) m.set(r.key, r.name);
    return m;
  }, [roles]);

  const roleNames = useMemo(() => {
    const keys = new Set((grants ?? []).map((g) => g.role_key));
    return [...keys].map((k) => roleNameByKey.get(k) ?? k);
  }, [grants, roleNameByKey]);

  const companies = useMemo(() => {
    const set = new Set<string>();
    for (const g of grants ?? []) {
      if (g.scope_type === "company" && g.company_name) set.add(g.company_name);
    }
    return [...set];
  }, [grants]);

  if (isLoading || !user) {
    return (
      <div className="p-2 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");

  return (
    <FadeIn className="max-w-2xl mx-auto space-y-4 pb-4">
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <Button variant="ghost" size="icon" onClick={() => nav("/keys/admin?tab=users")} title="←">
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{user.username}</h1>
          {fullName && <p className="text-sm text-muted-foreground truncate">{fullName}</p>}
        </div>
        <Button variant="outline" onClick={() => nav(`/keys/admin/users/${user.id}/edit`)}>
          <Pencil className="size-4 mr-1" />{t("common.edit")}
        </Button>
      </div>

      <Section title={t("modules.keys.admin.secAccount")}>
        <Info label={t("modules.keys.admin.username")}>
          <span className="font-medium">{user.username}</span>
        </Info>
        <Info label={t("modules.keys.admin.fullName")}>{fullName || "—"}</Info>
        <Info label={t("modules.keys.admin.userType")}>
          <Badge variant={ROLE_VARIANT[user.role] ?? "muted"}>
            {t(`modules.keys.roles.${user.role}`, user.role)}
          </Badge>
        </Info>
        <Info label={t("modules.keys.admin.status")}>
          <Badge variant={user.is_active ? "success" : "danger"}>
            {user.is_active
              ? t("modules.keys.activeFlag.active")
              : t("modules.keys.activeFlag.inactive")}
          </Badge>
        </Info>
        <Info label={t("modules.keys.fields.email")}>{user.email || "—"}</Info>
        <Info label={t("modules.keys.fields.phone")}>
          <span className="font-mono">{user.phone || "—"}</span>
        </Info>
        <Info label={t("modules.keys.admin.lastSeen")}>
          {isOnline(user) ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-success" />
              {t("modules.keys.admin.online")}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {fmtDateTime(user.last_seen ?? user.last_login)}
            </span>
          )}
        </Info>
      </Section>

      <Section title={t("modules.access.assignments.title")}>
        <Info label={t("modules.access.assignments.roles")}>
          {roleNames.length ? (
            <div className="flex flex-wrap gap-1">
              {roleNames.map((n) => <Badge key={n} variant="info">{n}</Badge>)}
            </div>
          ) : <span className="text-muted-foreground">—</span>}
        </Info>
        <Info label={t("modules.keys.admin.userCompanies")}>
          {companies.length ? (
            <div className="flex flex-wrap gap-1">
              {companies.map((c) => <Badge key={c} variant="muted">{c}</Badge>)}
            </div>
          ) : <span className="text-muted-foreground">—</span>}
        </Info>
      </Section>
    </FadeIn>
  );
}
