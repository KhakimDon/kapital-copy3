/**
 * KmAdminPage — the single Key-Manager control panel.
 *
 * One admin-only hub that absorbs the KM (es-key-connector) Django admin's five
 * sections so everything is managed from aiba-next:
 *   Keys · Companies · Users · Logs · Webvisor
 *
 * Reads/writes proxy through /api/v2/keys/* to KM, so KM's signal chain
 * (Chat2 / Didox / Soliq / Nextcloud) keeps firing on every write. Admin-gated
 * (require_admin on the backend too — this is just the UI guard).
 */
import { useMemo, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useUrlState } from "@/shared/hooks/use-url-state";
import { useTabs } from "@/shared/store/tabs";
import {
  KeyRound, Building2, Users, ScrollText, MonitorPlay, Usb,
  Plus, Pencil, Trash2, RefreshCw, UserPlus, Link2, ArrowLeft, ShieldCheck,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ModuleShell, type ModuleSection } from "@/components/ui/module-shell";
import { Highlight } from "@/components/ui/highlight";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import { useMe } from "@/shared/api/me";
import { api } from "@/shared/api/client";
import { useRoles, useAssignments } from "@/shared/api/authz";
import {
  useKeyCompanies, useAdminKeys, useKmUsers,
  useDeleteCompany, useDeleteKey, useDeleteKmUser,
  type KeyCompany, type AdminKey, type KmUser, type SignKey,
} from "../api";
import {
  KeyFormDialog, KeyUsersDialog, CompanyUsersDialog, ConfirmDialog, apiErrorText,
} from "../admin-dialogs";
import { LogsTab } from "./logs-tab";
import { WebvisorTab } from "./webvisor-tab";
import { ResourcesTab } from "./resources-tab";
import { BankKeysPanel } from "../bank/bank-keys-page";
import { AccessAdminPage } from "@/modules/access/access-page";
import { McpAdminPage } from "@/modules/mcp/admin-page";
import { Globe, Plug } from "lucide-react";

// Org items first, then the Key-Manager group — grouped items stay contiguous
// so the rail can draw one label above each group (see `sections` below).
// `bank-keys` sits in the KM group next to `keys` — both are signing hardware.
const TABS = ["companies", "users", "invite", "access", "mcp", "keys", "bank-keys", "resources", "logs", "webvisor"] as const;
type TabKey = (typeof TABS)[number];

const TAB_ICON: Record<TabKey, React.ComponentType<{ className?: string }>> = {
  keys: KeyRound, "bank-keys": Usb, companies: Building2, users: Users, invite: UserPlus,
  access: ShieldCheck, mcp: Plug, resources: Globe, logs: ScrollText, webvisor: MonitorPlay,
};

const TAB_GROUP: Record<TabKey, "org" | "km"> = {
  companies: "org", users: "org", invite: "org", access: "org", mcp: "org",
  keys: "km", "bank-keys": "km", resources: "km", logs: "km", webvisor: "km",
};

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

const ONLINE_MS = 12 * 60 * 1000;

function isOnline(u: KmUser) {
  if (!u.last_seen) return false;
  const ms = new Date(u.last_seen).getTime();
  return !Number.isNaN(ms) && Date.now() - ms < ONLINE_MS;
}

// Compact relative last-seen (falls back to last_login, then a short date).
function lastSeenText(u: KmUser, never: string) {
  const s = u.last_seen ?? u.last_login;
  if (!s) return never;
  const ms = new Date(s).getTime();
  if (Number.isNaN(ms)) return never;
  const min = Math.floor((Date.now() - ms) / 60_000);
  if (min < 60) return `${Math.max(min, 1)}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  return fmtDate(s);
}

export function KmAdminPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const loc = useLocation();
  const { tab: pathTab } = useParams<{ tab?: string }>();
  const { data: me, isLoading: meLoading } = useMe();
  const [tabRaw, setTabRaw] = useUrlState("tab", "keys");
  // Active tab from the /settings/<tab> path segment when present, else the
  // ?tab query (the /keys/admin entry).
  const inSettings = loc.pathname.startsWith("/settings");
  const seg = inSettings ? loc.pathname.split("/").filter(Boolean).pop() : undefined;
  const tabSource = seg ?? pathTab ?? tabRaw;
  const tab = (TABS.includes(tabSource as TabKey) ? tabSource : "keys") as TabKey;
  const onTab = (v: string) => (inSettings ? navigate(`/settings/${v}`) : setTabRaw(v));

  // Give this tab a human title (e.g. «Key Manager (Компании)») instead of the
  // raw «/keys/admin…» path the shell falls back to.
  const setTabTitle = useTabs((s) => s.setTitle);
  useEffect(() => {
    const base = t("modules.keys.admin.title", { defaultValue: "Key Manager" }).split("—")[0].trim();
    const sectionLabel = t(`modules.keys.admin.tabs.${tab}`, { defaultValue: tab === "invite" ? "AIBA user" : tab === "mcp" ? "MCP" : tab });
    setTabTitle(loc.pathname + loc.search, `${base} (${sectionLabel})`);
  }, [tab, t, loc.pathname, loc.search, setTabTitle]);

  if (meLoading) return <div className="p-6"><Skeleton className="h-8 w-48" /></div>;
  if (!me?.is_admin) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <ShieldCheck className="size-10 mx-auto text-muted-foreground" />
        <h2 className="text-lg font-semibold">{t("modules.keys.admin.adminOnly")}</h2>
        <Button variant="outline" onClick={() => navigate("/keys")}>
          <ArrowLeft className="size-4 mr-1" />{t("common.back")}
        </Button>
      </div>
    );
  }

  const groupLabel: Record<"org" | "km", string> = {
    org: t("modules.keys.admin.groupOrg"),
    km: t("modules.keys.admin.groupKeyManager"),
  };
  const sections: ModuleSection[] = TABS.map((k) => {
    const Icon = TAB_ICON[k];
    const group = TAB_GROUP[k];
    return {
      key: k,
      label: t(`modules.keys.admin.tabs.${k}`, { defaultValue: k === "invite" ? "AIBA user" : k === "mcp" ? "MCP" : k }),
      icon: <Icon className="size-4 shrink-0" />,
      menuTo: inSettings ? `/settings/${k}` : `/keys/admin?tab=${k}`,
      group,
      groupLabel: groupLabel[group],
    };
  });

  const content =
    tab === "keys" ? <KeysTab /> :
    tab === "bank-keys" ? <BankKeysPanel /> :
    tab === "companies" ? <CompaniesTab /> :
    tab === "users" ? <UsersTab /> :
    tab === "invite" ? <InviteTab /> :
    tab === "access" ? <AccessAdminPage /> :
    tab === "mcp" ? <McpAdminPage /> :
    tab === "resources" ? <ResourcesTab /> :
    tab === "logs" ? <LogsTab /> :
    <WebvisorTab />;

  return (
    <ModuleShell
      title={t("modules.keys.admin.title")}
      icon={
        <span className="flex items-center gap-1.5">
          <button
            onClick={() => navigate(inSettings ? "/" : "/keys")}
            title={t("common.back")}
            className="-ml-1 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
          <ShieldCheck className="size-6 text-primary" />
        </span>
      }
      subtitle={t(`modules.keys.admin.tabs.${tab}`, { defaultValue: tab === "invite" ? "AIBA user" : tab === "mcp" ? "MCP" : tab })}
      sections={sections}
      active={tab}
      onSelect={onTab}
    >
      <div className="animate-in fade-in-0 duration-300">{content}</div>
    </ModuleShell>
  );
}

// ── AIBA invite users tab ────────────────────────────────────────────────────
// The AIBA account(s) every created/synced company is attached to as owner
// (KM `core.AibaInviteUser`). The first one's phone is used as `owner_phone`.
type InviteUser = { id: number; phone: string; name: string | null; aiba_user_id: string | null; created_at: string | null };

function InviteTab() {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<InviteUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ items: InviteUser[] }>("/keys/admin/invite-users");
      setCurrent(data.items?.[0] ?? null);
    } catch { /* leave empty */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (phone.trim().length < 5) { setErr(t("modules.keys.admin.invitePhoneBad", { defaultValue: "Telefon raqami noto'g'ri" })); return; }
    setBusy(true); setErr(null);
    try {
      await api.post("/keys/admin/invite-users", { phone: phone.trim(), name: name.trim() || null });
      setEditing(false); setPhone(""); setName(""); await load();
    } catch (e) { setErr(apiErrorText(e)); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!current) return;
    try { await api.delete(`/keys/admin/invite-users/${current.id}`); await load(); } catch (e) { setErr(apiErrorText(e)); }
  };
  const startEdit = () => { setPhone(current?.phone ?? ""); setName(current?.name ?? ""); setEditing(true); };

  const showForm = !current || editing;

  return (
    <div className="space-y-4 max-w-xl">
      <p className="text-sm text-muted-foreground">
        {t("modules.keys.admin.inviteHint", { defaultValue: "Bitta AIBA foydalanuvchisi — yaratilgan/sync qilingan barcha korxonalar uning egaligiga (owner) biriktiriladi. Telefoni AIBA'да owner sifatида ishlatiladi." })}
      </p>

      {loading ? (
        <Skeleton className="h-24 w-full" />
      ) : showForm ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="text-sm font-medium">{current ? t("modules.keys.admin.inviteEdit", { defaultValue: "AIBA user'ни o'zgartirish" }) : t("modules.keys.admin.inviteSet", { defaultValue: "AIBA user belgilash" })}</div>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={t("modules.keys.admin.invitePhone", { defaultValue: "Telefon (+998...)" })} />
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("modules.keys.admin.inviteName", { defaultValue: "Ism (ixtiyoriy)" })} />
          {err && <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{err}</div>}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? "…" : t("common.save", { defaultValue: "Saqlash" })}
            </Button>
            {current && <Button size="sm" variant="outline" onClick={() => { setEditing(false); setErr(null); }}>{t("common.cancel", { defaultValue: "Bekor qilish" })}</Button>}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-full bg-primary/10 grid place-items-center text-primary"><UserPlus className="size-5" /></div>
            <div>
              <div className="font-medium">{current!.name || t("modules.keys.admin.inviteName", { defaultValue: "Ism" })}</div>
              <div className="font-mono text-sm text-muted-foreground">{current!.phone}</div>
              {current!.aiba_user_id && <div className="font-mono text-[11px] text-muted-foreground">AIBA: {current!.aiba_user_id}</div>}
            </div>
          </div>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" className="size-8" title={t("common.edit", { defaultValue: "O'zgartirish" })} onClick={startEdit}>
              <Pencil className="size-4" />
            </Button>
            <Button size="icon" variant="ghost" className="size-8 text-destructive" title={t("common.delete", { defaultValue: "O'chirish" })} onClick={remove}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Companies tab ────────────────────────────────────────────────────────────

function CompaniesTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: companies, isLoading, isFetching, refetch } = useKeyCompanies();
  const del = useDeleteCompany();
  const [q, setQ] = useState("");
  const [delTarget, setDelTarget] = useState<KeyCompany | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [usersFor, setUsersFor] = useState<KeyCompany | null>(null);

  const doSync = async (id: number) => {
    setSyncing(id);
    setSyncMsg(null);
    try {
      const { data } = await api.post<{ ok: boolean; already?: boolean; gated?: boolean; message?: string; soliq_warning?: string }>(
        `/keys/admin/companies/${id}/sync`,
      );
      const base =
        data.already ? t("modules.keys.admin.syncAlready", { defaultValue: "Allaqachon AIBA'da bor ✓" })
        : data.gated ? (data.message ?? "KM_NATIVE_SIDEFX o'chiq")
        : t("modules.keys.admin.syncOk", { defaultValue: "AIBA'ga sync qilindi ✓" });
      // Soliq is best-effort on the AIBA side; show a non-fatal warning if it failed.
      setSyncMsg(data.soliq_warning ? `${base}  ⚠️ Soliq: ${data.soliq_warning}` : base);
      refetch();
    } catch (e) {
      setSyncMsg(apiErrorText(e));
    } finally {
      setSyncing(null);
    }
  };

  const term = q.trim().toLowerCase();
  const rows = (companies ?? []).filter((c) =>
    !term || [c.name, c.inn, c.director_name].filter(Boolean).some((v) => v.toLowerCase().includes(term)));

  const doDelete = async () => {
    if (!delTarget) return;
    setDelErr(null);
    try { await del.mutateAsync(delTarget.id); setDelTarget(null); }
    catch (e) { setDelErr(apiErrorText(e)); }
  };

  return (
    <div className="space-y-3">
      <Toolbar q={q} setQ={setQ} placeholder={t("modules.keys.companySearchPlaceholder")}
        refetch={refetch} isFetching={isFetching}
        action={<Button size="sm" onClick={() => navigate("/keys/admin/companies/new")}>
          <Plus className="size-4 mr-1" />{t("modules.keys.admin.addCompany")}</Button>}
        count={rows.length} />

      {syncMsg && (
        <div className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-foreground flex items-center justify-between">
          <span>{syncMsg}</span>
          <button className="text-muted-foreground hover:text-foreground" onClick={() => setSyncMsg(null)}>×</button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("modules.keys.columns.company")}</TableHead>
            <TableHead>{t("modules.keys.columns.inn")}</TableHead>
            <TableHead className="text-center">{t("modules.keys.columns.keys")}</TableHead>
            <TableHead className="text-center">{t("modules.keys.columns.status")}</TableHead>
            <TableHead>{t("modules.keys.columns.created")}</TableHead>
            <TableHead className="w-28 text-right">{t("modules.keys.admin.actions")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <SkeletonRows widths={["w-40", "w-24", "w-10", "w-16", "w-20", "w-16"]} aligns={[undefined, undefined, "center", "center", undefined, "right"]} />}
            {!isLoading && rows.length === 0 && (
              <EmptyRow cols={6} icon={Building2} text={t("modules.keys.noCompanies")} onClear={term ? () => setQ("") : undefined} />
            )}
            {!isLoading && rows.map((c, i) => (
              <TableRow
                key={c.id}
                className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              >
                <TableCell className="font-medium cursor-pointer hover:text-primary"
                  onClick={() => navigate(`/keys/companies/${c.id}`)}>
                  {c.name || "—"}
                  {c.legal_form && <span className="text-xs text-muted-foreground"> · {c.legal_form}</span>}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{c.inn || "—"}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={c.keys_count > 0 ? "success" : "muted"} className="gap-1">
                    <KeyRound className="size-3" />{c.keys_count ?? 0}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={c.is_active ? "success" : "danger"}>
                    {c.is_active ? t("modules.keys.activeFlag.active") : t("modules.keys.activeFlag.inactive")}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(c.created_at)}</TableCell>
                <TableCell className="text-right">
                  <RowActions
                    onEdit={() => navigate(`/keys/admin/companies/${c.id}/edit`)}
                    onDelete={() => { setDelErr(null); setDelTarget(c); }}
                    onSync={() => doSync(c.id)}
                    onUsers={() => setUsersFor(c)}
                    syncing={syncing === c.id} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog open={delTarget != null} onOpenChange={(v) => !v && setDelTarget(null)}
        title={t("modules.keys.admin.deleteCompany")}
        description={t("modules.keys.admin.deleteCompanyHint", { name: delTarget?.name ?? "" })}
        onConfirm={doDelete} busy={del.isPending} error={delErr} />

      <CompanyUsersDialog
        open={usersFor != null}
        onOpenChange={(v) => !v && setUsersFor(null)}
        companyId={usersFor?.id ?? null}
        companyName={usersFor?.name} />
    </div>
  );
}

// ── Users tab ────────────────────────────────────────────────────────────────

const ROLE_VARIANT: Record<string, "danger" | "info" | "muted"> = {
  admin: "danger", client: "info", user: "muted",
};

function UsersTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: users, isLoading, isFetching, refetch } = useKmUsers(true);
  const { data: assignments } = useAssignments();
  const { data: roles } = useRoles();
  const del = useDeleteKmUser();
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [delTarget, setDelTarget] = useState<KmUser | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);

  // role_key → display name (for the RBAC role badges + filter labels).
  const roleNameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roles ?? []) m.set(r.key, r.name);
    return m;
  }, [roles]);

  // user_id → { assigned RBAC role_keys, distinct company names } from grants.
  const infoByUser = useMemo(() => {
    const m = new Map<number, { roleKeys: Set<string>; companies: string[] }>();
    for (const a of assignments ?? []) {
      const roleKeys = new Set<string>();
      const companies = new Set<string>();
      for (const g of a.grants) {
        roleKeys.add(g.role_key);
        if (g.scope_type === "company" && g.company_name) companies.add(g.company_name);
      }
      m.set(a.user_id, { roleKeys, companies: [...companies] });
    }
    return m;
  }, [assignments]);

  const never = t("modules.keys.admin.never");
  const term = q.trim().toLowerCase();
  const rows = (users ?? []).filter((u) => {
    if (roleFilter !== "all" && !infoByUser.get(u.id)?.roleKeys.has(roleFilter)) return false;
    if (!term) return true;
    const info = infoByUser.get(u.id);
    const roleNames = [...(info?.roleKeys ?? [])].map((k) => roleNameByKey.get(k) ?? k);
    const hay = [
      u.username, u.first_name, u.last_name,
      t(`modules.keys.roles.${u.role}`, u.role),
      ...roleNames,
      ...(info?.companies ?? []),
    ];
    return hay.some((v) => v && String(v).toLowerCase().includes(term));
  });

  const doDelete = async () => {
    if (!delTarget) return;
    setDelErr(null);
    try { await del.mutateAsync(delTarget.id); setDelTarget(null); }
    catch (e) { setDelErr(apiErrorText(e)); }
  };

  return (
    <div className="space-y-3">
      <Toolbar q={q} setQ={setQ} placeholder={t("modules.keys.admin.userSearchAll")}
        refetch={refetch} isFetching={isFetching}
        filter={
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t("modules.keys.admin.permissionFilter")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("modules.keys.admin.permissionFilter")}</SelectItem>
              {(roles ?? []).map((r) => (
                <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
        action={<Button size="sm" onClick={() => navigate("/keys/admin/users/new")}>
          <UserPlus className="size-4 mr-1" />{t("modules.keys.admin.addUser")}</Button>}
        count={rows.length} />

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("modules.keys.admin.username")}</TableHead>
            <TableHead>{t("modules.keys.admin.fullName")}</TableHead>
            <TableHead className="text-center">{t("modules.keys.admin.userType")}</TableHead>
            <TableHead>{t("modules.access.assignments.roles")}</TableHead>
            <TableHead>{t("modules.keys.admin.userCompanies")}</TableHead>
            <TableHead className="text-center">{t("modules.keys.columns.status")}</TableHead>
            <TableHead>{t("modules.keys.admin.lastSeen")}</TableHead>
            <TableHead className="w-28 text-right">{t("modules.keys.admin.actions")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <SkeletonRows widths={["w-24", "w-32", "w-16", "w-24", "w-32", "w-16", "w-16", "w-16"]} aligns={[undefined, undefined, "center", undefined, undefined, "center", undefined, "right"]} />}
            {!isLoading && rows.length === 0 && (
              <EmptyRow cols={8} icon={Users} text={t("modules.keys.admin.noUsers")} onClear={term ? () => setQ("") : undefined} />
            )}
            {!isLoading && rows.map((u, i) => {
              const info = infoByUser.get(u.id);
              const roleNames = [...(info?.roleKeys ?? [])].map((k) => roleNameByKey.get(k) ?? k);
              const companies = info?.companies ?? [];
              return (
              <TableRow
                key={u.id}
                className="cursor-pointer animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                onClick={() => navigate(`/keys/admin/users/${u.id}`)}
              >
                <TableCell className="font-medium"><Highlight text={u.username} query={term} /></TableCell>
                <TableCell className="text-muted-foreground">
                  {[u.first_name, u.last_name].filter(Boolean).join(" ")
                    ? <Highlight text={[u.first_name, u.last_name].filter(Boolean).join(" ")} query={term} />
                    : "—"}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={ROLE_VARIANT[u.role] ?? "muted"}>
                    <Highlight text={t(`modules.keys.roles.${u.role}`, u.role)} query={term} /></Badge>
                </TableCell>
                <TableCell>
                  {roleNames.length ? (
                    <div className="flex flex-wrap gap-1">
                      {roleNames.map((n) => <Badge key={n} variant="info"><Highlight text={n} query={term} /></Badge>)}
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {companies.length ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {companies.slice(0, 3).map((c) => <Badge key={c} variant="muted"><Highlight text={c} query={term} /></Badge>)}
                      {companies.length > 3 && <Badge variant="muted">+{companies.length - 3}</Badge>}
                    </div>
                  ) : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={u.is_active ? "success" : "danger"}>
                    {u.is_active ? t("modules.keys.activeFlag.active") : t("modules.keys.activeFlag.inactive")}</Badge>
                </TableCell>
                <TableCell>
                  {isOnline(u) ? (
                    <span className="inline-flex items-center gap-1.5 text-sm">
                      <span className="size-2 rounded-full bg-success" />
                      {t("modules.keys.admin.online")}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">{lastSeenText(u, never)}</span>
                  )}
                </TableCell>
                <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                  <RowActions
                    onEdit={() => navigate(`/keys/admin/users/${u.id}/edit`)}
                    onDelete={() => { setDelErr(null); setDelTarget(u); }} />
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog open={delTarget != null} onOpenChange={(v) => !v && setDelTarget(null)}
        title={t("modules.keys.admin.deleteUser")}
        description={t("modules.keys.admin.deleteUserHint", { name: delTarget?.username ?? "" })}
        onConfirm={doDelete} busy={del.isPending} error={delErr} />
    </div>
  );
}

// ── Keys tab (all keys across companies) ─────────────────────────────────────

function KeysTab() {
  const { t } = useTranslation();
  const { data: keys, isLoading, isFetching, refetch } = useAdminKeys(true);
  const { data: companies } = useKeyCompanies();
  const del = useDeleteKey();
  const [q, setQ] = useState("");
  const [addCompany, setAddCompany] = useState<string>("");
  const [addOpen, setAddOpen] = useState(false);
  const [editKey, setEditKey] = useState<AdminKey | null>(null);
  const [usersKey, setUsersKey] = useState<number | null>(null);
  const [delTarget, setDelTarget] = useState<AdminKey | null>(null);
  const [delErr, setDelErr] = useState<string | null>(null);

  const companyName = useMemo(() => {
    const m = new Map<number, string>();
    for (const c of companies ?? []) m.set(c.id, c.name);
    return m;
  }, [companies]);

  const term = q.trim().toLowerCase();
  const rows = (keys ?? []).filter((k) =>
    !term || [k.name, k.company_id != null ? companyName.get(k.company_id) : ""]
      .filter(Boolean).some((v) => String(v).toLowerCase().includes(term)));

  const doDelete = async () => {
    if (!delTarget) return;
    setDelErr(null);
    try { await del.mutateAsync(delTarget.id); setDelTarget(null); }
    catch (e) { setDelErr(apiErrorText(e)); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <SearchBox q={q} setQ={setQ} placeholder={t("modules.keys.admin.keySearch")} />
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Select value={addCompany} onValueChange={setAddCompany}>
            <SelectTrigger className="w-52"><SelectValue placeholder={t("modules.keys.admin.pickCompany")} /></SelectTrigger>
            <SelectContent>
              {(companies ?? []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name || `#${c.id}`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" disabled={!addCompany} onClick={() => setAddOpen(true)}>
            <Plus className="size-4 mr-1" />{t("modules.keys.admin.addKey")}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>{t("modules.keys.admin.keyName")}</TableHead>
            <TableHead>{t("modules.keys.columns.company")}</TableHead>
            <TableHead className="text-center">{t("modules.keys.admin.users")}</TableHead>
            <TableHead className="text-center">{t("modules.keys.columns.status")}</TableHead>
            <TableHead>{t("modules.keys.columns.created")}</TableHead>
            <TableHead className="w-36 text-right">{t("modules.keys.admin.actions")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading && <SkeletonRows widths={["w-28", "w-32", "w-10", "w-16", "w-20", "w-20"]} aligns={[undefined, undefined, "center", "center", undefined, "right"]} />}
            {!isLoading && rows.length === 0 && (
              <EmptyRow cols={6} icon={KeyRound} text={t("modules.keys.admin.noKeys")} onClear={term ? () => setQ("") : undefined} />
            )}
            {!isLoading && rows.map((k, i) => (
              <TableRow
                key={k.id}
                className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              >
                <TableCell className="font-mono text-xs">{k.name || "—"}</TableCell>
                <TableCell className="text-sm">
                  {k.company_id != null ? (companyName.get(k.company_id) || `#${k.company_id}`)
                    : <span className="text-muted-foreground">{t("modules.keys.admin.noCompany")}</span>}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant="muted" className="gap-1"><Users className="size-3" />{k.attached_user_ids?.length ?? 0}</Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={k.is_aiba_active ? "success" : "muted"}>
                    {k.is_aiba_active ? t("modules.keys.activeFlag.active") : (k.validation_status || t("modules.keys.activeFlag.inactive"))}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{fmtDate(k.created_at)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button size="icon" variant="ghost" className="size-8" title={t("modules.keys.admin.keyUsers")}
                      onClick={() => setUsersKey(k.id)}><Link2 className="size-4" /></Button>
                    <Button size="icon" variant="ghost" className="size-8" title={t("common.edit")}
                      onClick={() => setEditKey(k)}><Pencil className="size-4" /></Button>
                    <Button size="icon" variant="ghost" className="size-8 text-destructive" title={t("common.delete")}
                      onClick={() => { setDelErr(null); setDelTarget(k); }}><Trash2 className="size-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create (company chosen in toolbar) */}
      {addCompany && (
        <KeyFormDialog open={addOpen} onOpenChange={setAddOpen} companyId={Number(addCompany)} />
      )}
      {/* Edit (rename / repassword) — KeyFormDialog only reads id+name in edit mode */}
      <KeyFormDialog
        open={editKey != null}
        onOpenChange={(v) => !v && setEditKey(null)}
        companyId={editKey?.company_id ?? 0}
        editKey={editKey ? ({ id: editKey.id, name: editKey.name } as SignKey) : null} />
      <KeyUsersDialog open={usersKey != null} onOpenChange={(v) => !v && setUsersKey(null)} keyId={usersKey} />
      <ConfirmDialog open={delTarget != null} onOpenChange={(v) => !v && setDelTarget(null)}
        title={t("modules.keys.admin.deleteKey")}
        description={t("modules.keys.admin.deleteKeyHint", { name: delTarget?.name ?? "" })}
        onConfirm={doDelete} busy={del.isPending} error={delErr} />
    </div>
  );
}

// ── shared bits ──────────────────────────────────────────────────────────────

function SearchBox({ q, setQ, placeholder }: { q: string; setQ: (v: string) => void; placeholder: string }) {
  return (
    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="w-64" />
  );
}

function Toolbar({
  q, setQ, placeholder, refetch, isFetching, action, count, filter,
}: {
  q: string; setQ: (v: string) => void; placeholder: string;
  refetch: () => void; isFetching: boolean; action: React.ReactNode; count: number;
  filter?: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <SearchBox q={q} setQ={setQ} placeholder={placeholder} />
      <Button variant="outline" size="sm" onClick={refetch} disabled={isFetching}>
        <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
      </Button>
      {filter}
      <span className="text-xs text-muted-foreground">{t("modules.keys.admin.count", { count })}</span>
      <div className="ml-auto">{action}</div>
    </div>
  );
}

function RowActions({ onEdit, onDelete, onSync, onUsers, syncing }: {
  onEdit: () => void; onDelete: () => void;
  onSync?: () => void; onUsers?: () => void; syncing?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-end gap-1">
      {onUsers && (
        <Button size="icon" variant="ghost" className="size-8" title={t("modules.keys.admin.usersSection", { defaultValue: "Foydalanuvchilar" })} onClick={onUsers}>
          <Users className="size-4" />
        </Button>
      )}
      {onSync && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2 gap-1 text-xs text-primary"
          disabled={syncing}
          title={t("modules.keys.admin.syncAiba", { defaultValue: "AIBA bilan sync" })}
          onClick={onSync}
        >
          <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
          <span>{t("modules.keys.admin.syncAibaShort", { defaultValue: "AIBA sync" })}</span>
        </Button>
      )}
      <Button size="icon" variant="ghost" className="size-8" title={t("common.edit")} onClick={onEdit}>
        <Pencil className="size-4" />
      </Button>
      <Button size="icon" variant="ghost" className="size-8 text-destructive" title={t("common.delete")} onClick={onDelete}>
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

// Column-shaped skeleton rows. `widths` gives each column its own Skeleton
// width so the loading state mirrors the real columns; the swap to data is
// seamless (gentle pulse + fade-in). `aligns` optionally centers/right-aligns.
function SkeletonRows({ widths, aligns }: { widths: string[]; aligns?: (string | undefined)[] }) {
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
          {widths.map((w, j) => {
            const a = aligns?.[j];
            return (
              <TableCell key={j} className={a === "center" ? "text-center" : a === "right" ? "text-right" : undefined}>
                <Skeleton className={`h-4 ${w} ${a === "center" ? "mx-auto" : a === "right" ? "ml-auto" : ""}`} />
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}

function EmptyRow({
  cols, text, icon: Icon, onClear,
}: {
  cols: number; text: string;
  icon: React.ComponentType<{ className?: string }>;
  onClear?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={cols} className="py-16">
        <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
          <div className="size-14 rounded-full bg-muted grid place-items-center">
            <Icon className="size-7 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium text-foreground">{text}</div>
          {onClear && (
            <Button variant="outline" size="sm" onClick={onClear}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
