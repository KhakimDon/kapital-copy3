/**
 * TenantDetailPage — superadmin view of a single tenant.
 *
 * Route: /settings/tenants/:id
 *
 * Layout mirrors the Company detail page: DetailPage shell with a left ~380px
 * sidebar of <DetailCard>/<DetailRow> info cards (identity, limits,
 * server/connection + live test, onboarding checklist) and a right viewer with
 * <Tabs> — Kompaniyalar / Kalitlar / Foydalanuvchilar (with live counts).
 *
 * The Foydalanuvchilar tab can create an admin user in the tenant DB.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  Building2, KeyRound, Loader2, Pencil, Users, Ban, Trash2,
  Server, CheckCircle2, Circle, XCircle, PlugZap, UserPlus,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { DetailCard, DetailPage, DetailRow } from "@/components/ui/detail-page";
import { ErrorState, FadeIn } from "@/components/ui/reveal";

import {
  useTenant, useSuspendTenant, useArchiveTenant, useUpdateTenant, useTestTenant, usePurgeTenant, useBootstrapTenant,
  useTenantCompanies, useTenantKeys, useTenantUsers, useCreateTenantUser,
  useModulesCatalog, useSetDisabledModules,
} from "./api";
import { apiErrorText } from "./error";
import { useUrlState } from "@/shared/hooks/use-url-state";
import type {
  TenantDetail, TenantTestResult, TenantUserCreate,
} from "./types";

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleString("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const STATUS_VARIANT: Record<string, "success" | "danger" | "muted"> = {
  active: "success",
  suspended: "danger",
};

type TabKey = "companies" | "keys" | "users";

export function TenantDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const tenantId = id ? Number(id) : null;

  const { data: tenant, isLoading, isError, refetch } = useTenant(tenantId);
  const suspend = useSuspendTenant();
  const archive = useArchiveTenant();
  const purge = usePurgeTenant();
  const bootstrap = useBootstrapTenant();
  const update = useUpdateTenant(tenantId ?? 0);
  const test = useTestTenant();

  const [tabRaw, setTab] = useUrlState("tab", "companies");
  const tab = tabRaw as TabKey;

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeMsg, setPurgeMsg] = useState<string | null>(null);
  const [bootstrapMsg, setBootstrapMsg] = useState<string | null>(null);
  const [suspendErr, setSuspendErr] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<TenantTestResult | null>(null);

  const runTest = async () => {
    if (tenantId == null) return;
    setTestResult(null);
    try {
      const res = await test.mutateAsync(tenantId);
      setTestResult(res);
    } catch (e) {
      setTestResult({ reachable: false, error: apiErrorText(e) });
    }
  };

  const doSuspend = async () => {
    if (tenantId == null) return;
    setSuspendErr(null);
    try {
      await suspend.mutateAsync(tenantId);
      setConfirmOpen(false);
      refetch();
    } catch (e) {
      setSuspendErr(apiErrorText(e));
    }
  };

  const doActivate = async () => {
    if (tenantId == null) return;
    try {
      await update.mutateAsync({ status: "active" });
      refetch();
    } catch {
      /* surfaced via the update mutation; status badge stays suspended */
    }
  };

  const doArchive = async () => {
    if (tenantId == null) return;
    setSuspendErr(null);
    try {
      await archive.mutateAsync(tenantId);
      setArchiveOpen(false);
      navigate("/settings/tenants");
    } catch (e) {
      setSuspendErr(apiErrorText(e));
    }
  };

  // Run the canonical DDL bootstrap against the tenant's DB. Safe to hit
  // repeatedly — every CREATE is IF NOT EXISTS. Surfaces success/failure
  // as a short banner over the sidebar so the operator sees it landed.
  const doBootstrap = async () => {
    if (tenantId == null) return;
    setBootstrapMsg(null);
    try {
      const res = await bootstrap.mutateAsync(tenantId);
      setBootstrapMsg(`Sxema o'rnatildi (${res.slug}) ✓`);
      refetch();
      setTimeout(() => setBootstrapMsg(null), 4000);
    } catch (e) {
      setBootstrapMsg(apiErrorText(e));
    }
  };

  // Hard-delete: control row gone + local placement DB/role dropped. Slug
  // is freed for reuse. Non-recoverable, hence the confirm dialog.
  const doPurge = async () => {
    if (tenantId == null) return;
    setPurgeMsg(null);
    try {
      const res = await purge.mutateAsync(tenantId);
      setPurgeOpen(false);
      // brief flash before we bail out — helps the operator confirm the
      // server actually dropped the DB.
      const parts = [
        `Tenant '${res.slug}' butunlay o'chirildi`,
        res.dropped.database ? "DB drop ✓" : null,
        res.dropped.role ? "role drop ✓" : null,
      ].filter(Boolean).join(" · ");
      setPurgeMsg(parts);
      setTimeout(() => navigate("/settings/tenants"), 1200);
    } catch (e) {
      setSuspendErr(apiErrorText(e));
    }
  };

  const sidebar = isLoading
    ? <SidebarSkeleton />
    : tenant
      ? (
        <FadeIn className="space-y-3">
          <Sidebar
            tenant={tenant}
            testResult={testResult}
            onEdit={() => navigate(`/settings/tenants/${tenant.id}/edit`)}
            onSuspend={() => { setSuspendErr(null); setConfirmOpen(true); }}
            onActivate={doActivate}
            onArchive={() => { setSuspendErr(null); setArchiveOpen(true); }}
            onPurge={() => { setSuspendErr(null); setPurgeMsg(null); setPurgeOpen(true); }}
            onBootstrap={doBootstrap}
            bootstrapping={bootstrap.isPending}
            bootstrapMsg={bootstrapMsg}
            onTest={runTest}
            testing={test.isPending}
          />
        </FadeIn>
      )
      : null;

  if (!isLoading && (isError || !tenant)) {
    return (
      <DetailPage backTo="/settings/tenants" backLabel={t("modules.settings.tenants.title", { defaultValue: "Tenantlar" })} sidebar={null}>
        <div className="p-6">
          <ErrorState onRetry={() => refetch()} />
        </div>
      </DetailPage>
    );
  }

  const counts = tenant?.counts;

  return (
    <DetailPage backTo="/settings/tenants" backLabel={t("modules.settings.tenants.title", { defaultValue: "Tenantlar" })} sidebar={sidebar}>
      <div className="p-6 space-y-6">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <div className="border-b border-border">
            <TabsList className="bg-transparent h-auto p-0 rounded-none gap-0 flex-wrap">
              <TabsTrigger
                value="companies"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 text-sm gap-1.5"
              >
                <Building2 className="size-4" />
                {t("modules.settings.tenants.counts.companies", { defaultValue: "Kompaniyalar" })}
                {counts?.companies != null && <Badge variant="muted">{counts.companies}</Badge>}
              </TabsTrigger>
              <TabsTrigger
                value="keys"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 text-sm gap-1.5"
              >
                <KeyRound className="size-4" />
                {t("modules.settings.tenants.counts.keys", { defaultValue: "Kalitlar" })}
                {counts?.keys != null && <Badge variant="muted">{counts.keys}</Badge>}
              </TabsTrigger>
              <TabsTrigger
                value="users"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 text-sm gap-1.5"
              >
                <Users className="size-4" />
                {t("modules.settings.tenants.counts.users", { defaultValue: "Foydalanuvchilar" })}
                {counts?.users != null && <Badge variant="muted">{counts.users}</Badge>}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="companies" className="mt-6">
            {tenantId != null && <CompaniesTab tenantId={tenantId} />}
          </TabsContent>
          <TabsContent value="keys" className="mt-6">
            {tenantId != null && <KeysTab tenantId={tenantId} />}
          </TabsContent>
          <TabsContent value="users" className="mt-6">
            {tenantId != null && <UsersTab tenantId={tenantId} />}
          </TabsContent>
        </Tabs>
      </div>

      {tenant && (
        <Dialog open={confirmOpen} onOpenChange={(v) => !v && setConfirmOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("modules.settings.tenants.suspendTitle", { defaultValue: "Tenantni to'xtatish" })}</DialogTitle>
              <DialogDescription>
                {t("modules.settings.tenants.suspendHint", {
                  defaultValue: "{{name}} tenanti to'xtatiladi (suspended).",
                  name: tenant.name,
                })}
              </DialogDescription>
            </DialogHeader>
            {suspendErr && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive break-words">
                {suspendErr}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={suspend.isPending}>
                {t("common.cancel", { defaultValue: "Bekor qilish" })}
              </Button>
              <Button variant="destructive" onClick={doSuspend} disabled={suspend.isPending}>
                {suspend.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
                {t("modules.settings.tenants.suspend", { defaultValue: "To'xtatish" })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {tenant && (
        <Dialog open={archiveOpen} onOpenChange={(v) => !v && setArchiveOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("modules.settings.tenants.archiveTitle", { defaultValue: "Tenantni arxivlash" })}</DialogTitle>
              <DialogDescription>
                {t("modules.settings.tenants.archiveHint", {
                  defaultValue: "{{name}} arxivga qo'shiladi: ma'lumotlar (korxonalar/kalitlar) saqlanadi, lekin ro'yxatda ko'rinmaydi. Keyin Arxivdan chiqarish mumkin.",
                  name: tenant.name,
                })}
              </DialogDescription>
            </DialogHeader>
            {suspendErr && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive break-words">
                {suspendErr}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setArchiveOpen(false)} disabled={archive.isPending}>
                {t("common.cancel", { defaultValue: "Bekor qilish" })}
              </Button>
              <Button variant="destructive" onClick={doArchive} disabled={archive.isPending}>
                {archive.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
                {t("modules.settings.tenants.archive", { defaultValue: "Arxivga qo'shish" })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {tenant && (
        <Dialog open={purgeOpen} onOpenChange={(v) => !v && setPurgeOpen(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t("modules.settings.tenants.purgeTitle", { defaultValue: "Tenantni butunlay o'chirish" })}
              </DialogTitle>
              <DialogDescription>
                {t("modules.settings.tenants.purgeHint", {
                  defaultValue:
                    "{{name}} to'liq o'chiriladi: control.tenants qatori, DB va (lokal placement bo'lsa) rol. Slug qayta ishlatish uchun bo'shatiladi. Bu amalni bekor qilib bo'lmaydi.",
                  name: tenant.name,
                })}
              </DialogDescription>
            </DialogHeader>
            {suspendErr && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive break-words">
                {suspendErr}
              </div>
            )}
            {purgeMsg && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 break-words">
                {purgeMsg}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPurgeOpen(false)} disabled={purge.isPending}>
                {t("common.cancel", { defaultValue: "Bekor qilish" })}
              </Button>
              <Button variant="destructive" onClick={doPurge} disabled={purge.isPending}>
                {purge.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
                {t("modules.settings.tenants.purge", { defaultValue: "Butunlay o'chirish (server bilan)" })}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DetailPage>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <>
      <DetailCard>
        <div className="flex flex-col items-center gap-2.5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </DetailCard>
      {Array.from({ length: 3 }).map((_, i) => (
        <DetailCard key={i}>
          <Skeleton className="h-6 w-full" />
        </DetailCard>
      ))}
    </>
  );
}

function Sidebar({
  tenant, testResult, onEdit, onSuspend, onActivate, onArchive, onPurge, onBootstrap, bootstrapping, bootstrapMsg, onTest, testing,
}: {
  tenant: TenantDetail;
  testResult: TenantTestResult | null;
  onEdit: () => void;
  onSuspend: () => void;
  onActivate: () => void;
  onArchive: () => void;
  onPurge: () => void;
  onBootstrap: () => void;
  bootstrapping: boolean;
  bootstrapMsg: string | null;
  onTest: () => void;
  testing: boolean;
}) {
  const { t } = useTranslation();
  const isSuspended = tenant.status === "suspended";
  const isArchived = tenant.status === "archived";

  return (
    <>
      {/* Identity card */}
      <DetailCard>
        <div className="flex flex-col items-center text-center gap-2">
          <div className="text-lg font-semibold leading-tight text-foreground">{tenant.name}</div>
          <div className="font-mono text-xs text-muted-foreground">{tenant.slug}</div>
          <Badge variant={STATUS_VARIANT[tenant.status] ?? "muted"}>
            {t(`modules.settings.tenants.status.${tenant.status}`, { defaultValue: tenant.status })}
          </Badge>
          <div className="flex items-center gap-2 mt-2 w-full">
            {!isArchived && (
              <Button variant="outline" size="sm" className="flex-1" onClick={onEdit}>
                <Pencil className="size-4 mr-1" />{t("common.edit", { defaultValue: "Tahrirlash" })}
              </Button>
            )}
            {(isSuspended || isArchived) ? (
              <Button variant="outline" size="sm" className="flex-1 text-emerald-600" onClick={onActivate}>
                <Ban className="size-4 mr-1" />
                {isArchived
                  ? t("modules.settings.tenants.unarchive", { defaultValue: "Arxivdan chiqarish" })
                  : t("modules.settings.tenants.activate", { defaultValue: "Faollashtirish" })}
              </Button>
            ) : (
              <Button variant="outline" size="sm" className="flex-1 text-destructive" onClick={onSuspend}>
                <Ban className="size-4 mr-1" />
                {t("modules.settings.tenants.suspend", { defaultValue: "To'xtatish" })}
              </Button>
            )}
          </div>
          {!isArchived && (
            <Button variant="ghost" size="sm" className="w-full mt-1 text-destructive" onClick={onArchive}>
              <Trash2 className="size-4 mr-1" />
              {t("modules.settings.tenants.archive", { defaultValue: "Arxivga qo'shish" })}
            </Button>
          )}
          <Button
            variant="ghost" size="sm"
            className="w-full mt-1 text-destructive border border-destructive/40 hover:bg-destructive/10"
            onClick={onPurge}
          >
            <Trash2 className="size-4 mr-1" />
            {t("modules.settings.tenants.purge", {
              defaultValue: "Butunlay o'chirish (server bilan)",
            })}
          </Button>
        </div>
      </DetailCard>

      {/* Limits */}
      <DetailCard title={t("modules.settings.tenants.limitsCard", { defaultValue: "Limitlar" })}>
        <dl>
          <DetailRow
            k={t("modules.settings.tenants.fields.maxCompanies", { defaultValue: "Maks. kompaniyalar" })}
            v={String(tenant.max_companies)}
          />
          <DetailRow
            k={t("modules.settings.tenants.fields.maxKeys", { defaultValue: "Maks. kalitlar" })}
            v={String(tenant.max_keys)}
          />
          <DetailRow
            k={t("modules.settings.tenants.fields.expiry", { defaultValue: "Amal qiladi" })}
            v={fmtDate(tenant.expiry_at)}
          />
          <DetailRow
            k={t("modules.settings.tenants.fields.placement", { defaultValue: "Joylashuv" })}
            v={t(`modules.settings.tenants.placement.${tenant.placement}`, {
              defaultValue: tenant.placement === "dedicated" ? "Alohida" : "Umumiy",
            })}
          />
        </dl>
      </DetailCard>

      {/* Server / connection + test */}
      <DetailCard
        title={
          <span className="flex items-center gap-1.5">
            <Server className="size-4 text-muted-foreground" />
            {t("modules.settings.tenants.connectionCard", { defaultValue: "Server / ulanish" })}
          </span>
        }
        action={
          <div className="flex gap-1">
            <Button variant="outline" size="sm" onClick={onTest} disabled={testing}>
              {testing
                ? <Loader2 className="size-4 mr-1 animate-spin" />
                : <PlugZap className="size-4 mr-1" />}
              {t("modules.settings.tenants.testConnection", { defaultValue: "Test ulanish" })}
            </Button>
            <Button variant="outline" size="sm" onClick={onBootstrap} disabled={bootstrapping}
                    title={t("modules.settings.tenants.bootstrapHint", { defaultValue: "Serverga barcha jadval + migratsiyalarni idempotent qo'llash" })}>
              {bootstrapping
                ? <Loader2 className="size-4 mr-1 animate-spin" />
                : <Server className="size-4 mr-1" />}
              {t("modules.settings.tenants.bootstrap", { defaultValue: "Migratsiya" })}
            </Button>
          </div>
        }
      >
        {bootstrapMsg && (
          <div className="mb-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 break-words">
            {bootstrapMsg}
          </div>
        )}
        <dl>
          <DetailRow
            k={t("modules.settings.tenants.fields.host", { defaultValue: "Host / Server IP" })}
            v={tenant.connection?.host ?? "—"} mono
          />
          <DetailRow
            k={t("modules.settings.tenants.fields.port", { defaultValue: "Port" })}
            v={tenant.connection?.port != null ? String(tenant.connection.port) : "—"} mono
          />
          <DetailRow
            k={t("modules.settings.tenants.fields.database", { defaultValue: "Ma'lumotlar bazasi" })}
            v={tenant.connection?.database ?? "—"} mono
          />
          <DetailRow
            k={t("modules.settings.tenants.fields.username", { defaultValue: "Foydalanuvchi" })}
            v={tenant.connection?.username ?? "—"} mono
          />
        </dl>

        {testResult && (
          <div className="mt-3">
            {testResult.reachable ? (
              <div className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-success">
                  <CheckCircle2 className="size-4" />
                  {t("modules.settings.tenants.reachable", { defaultValue: "Ulandi ✓" })}
                </div>
                <div className="text-muted-foreground text-xs">
                  {t("modules.settings.tenants.kmSchema", { defaultValue: "km sxema" })}:{" "}
                  {testResult.has_km_schema
                    ? t("common.yes", { defaultValue: "bor" })
                    : t("common.no", { defaultValue: "yo'q" })}
                  {" · "}
                  {t("modules.settings.tenants.counts.companies", { defaultValue: "Korxonalar" })}:{" "}
                  {testResult.companies ?? "—"}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm space-y-1">
                <div className="flex items-center gap-1.5 font-medium text-destructive">
                  <XCircle className="size-4" />
                  {t("modules.settings.tenants.unreachable", { defaultValue: "Ulanmadi" })}
                </div>
                {testResult.error && (
                  <div className="text-destructive break-words font-mono text-xs">{testResult.error}</div>
                )}
              </div>
            )}
          </div>
        )}
      </DetailCard>

      {/* Onboarding checklist */}
      <DetailCard title={t("modules.settings.tenants.onboardingCard", { defaultValue: "Onboarding (0 dan)" })}>
        <ol className="space-y-3">
          <Step
            done
            label={t("modules.settings.tenants.onboard.registered", { defaultValue: "Ro'yxatga olindi" })}
          />
          <Step
            done={testResult?.reachable === true}
            label={t("modules.settings.tenants.onboard.dbConn", { defaultValue: "DB ulanishi" })}
            note={testResult?.reachable === true
              ? undefined
              : t("modules.settings.tenants.onboard.dbConnNote", { defaultValue: "Test bosing" })}
          />
          <Step
            done={testResult?.has_km_schema === true}
            label={t("modules.settings.tenants.onboard.schema", { defaultValue: "Sxema o'rnatilgan (km)" })}
            note={testResult?.has_km_schema === true
              ? undefined
              : t("modules.settings.tenants.onboard.schemaNote", {
                  defaultValue: "Yangi DB'da: alembic migratsiyalarni shu DSN bilan ishlatib sxema yarating",
                })}
          />
          <Step
            done={(testResult?.companies ?? tenant.counts.companies ?? 0) > 0}
            label={t("modules.settings.tenants.onboard.data", { defaultValue: "Ma'lumot yuklangan" })}
            note={(testResult?.companies ?? tenant.counts.companies ?? 0) > 0
              ? undefined
              : t("modules.settings.tenants.onboard.dataNote", {
                  defaultValue: "KM manbadan ETL bilan tenant ma'lumotini yuklang",
                })}
          />
        </ol>
      </DetailCard>

      {/* Modules visibility — superadmin toggles which modules this tenant sees */}
      <ModulesCard tenantId={tenant.id} initial={tenant.disabled_modules ?? []} />
    </>
  );
}

function ModulesCard({ tenantId, initial }: { tenantId: number; initial: string[] }) {
  const { t } = useTranslation();
  const { data: catalog, isLoading } = useModulesCatalog();
  const save = useSetDisabledModules(tenantId);
  // Sets are easier to toggle; remap initial whenever the server payload changes.
  const [disabled, setDisabled] = useState<Set<string>>(() => new Set(initial));
  useEffect(() => { setDisabled(new Set(initial)); }, [initial]);
  const dirty = useMemo(() => {
    const a = [...disabled].sort(); const b = [...initial].sort();
    return a.length !== b.length || a.some((x, i) => x !== b[i]);
  }, [disabled, initial]);
  const toggle = (slug: string) => setDisabled((s) => {
    const n = new Set(s); n.has(slug) ? n.delete(slug) : n.add(slug); return n;
  });
  const submit = async () => {
    try { await save.mutateAsync([...disabled]); } catch { /* server error surfaces in save.error */ }
  };
  return (
    <DetailCard title={t("modules.settings.tenants.modulesCard", { defaultValue: "Modullar" })}>
      <p className="text-xs text-muted-foreground mb-2">
        {t("modules.settings.tenants.modulesHint", {
          defaultValue: "Belgilanмаganlarni tenantda nav'dan yashirilади.",
        })}
      </p>
      {isLoading ? (
        <div className="space-y-2">{[0,1,2,3,4].map((i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
      ) : (
        <>
          <ul className="space-y-1.5 max-h-72 overflow-auto pr-1">
            {(catalog ?? []).map((m) => {
              const enabled = !disabled.has(m.slug);
              return (
                <li key={m.slug} className="flex items-center gap-2">
                  <Checkbox id={`mod-${m.slug}`} checked={enabled} onCheckedChange={() => toggle(m.slug)} />
                  <label htmlFor={`mod-${m.slug}`} className="text-sm cursor-pointer flex-1 select-none">
                    {m.name}
                    <span className="ml-1 text-[10px] text-muted-foreground font-mono">{m.slug}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
            <span className="text-xs text-muted-foreground">
              {t("modules.settings.tenants.modulesCount", {
                defaultValue: "Yoqilgan: {{on}}/{{total}}",
                on: (catalog?.length ?? 0) - disabled.size,
                total: catalog?.length ?? 0,
              })}
            </span>
            <Button size="sm" disabled={!dirty || save.isPending} onClick={submit}>
              {save.isPending ? "…" : t("common.save", { defaultValue: "Saqlash" })}
            </Button>
          </div>
        </>
      )}
    </DetailCard>
  );
}

function Step({ done, label, note }: { done: boolean; label: string; note?: string }) {
  return (
    <li className="flex items-start gap-2.5">
      {done
        ? <CheckCircle2 className="size-5 text-success shrink-0 mt-0.5" />
        : <Circle className="size-5 text-muted-foreground/40 shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <div className={`text-sm ${done ? "font-medium" : ""}`}>{label}</div>
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </div>
    </li>
  );
}

// ── Companies tab ──────────────────────────────────────────────────────────

function TableShell({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-border bg-card overflow-x-auto">{children}</div>;
}

function EmptyRow({ colSpan, icon: Icon, label }: { colSpan: number; icon: React.ComponentType<{ className?: string }>; label: string }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-16">
        <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
          <div className="size-14 rounded-full bg-muted grid place-items-center">
            <Icon className="size-7 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium text-foreground">{label}</div>
        </div>
      </TableCell>
    </TableRow>
  );
}

function SkeletonRows({ rows, cols }: { rows: number; cols: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
          {Array.from({ length: cols }).map((__, j) => (
            <TableCell key={j}><Skeleton className="h-3.5 w-24" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

function CompaniesTab({ tenantId }: { tenantId: number }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useTenantCompanies(tenantId);
  const items = data?.items ?? [];

  if (!isLoading && isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <TableShell>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("modules.settings.tenants.companies.name", { defaultValue: "Nom" })}</TableHead>
            <TableHead>INN</TableHead>
            <TableHead>{t("modules.settings.tenants.columns.status", { defaultValue: "Holat" })}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <SkeletonRows rows={6} cols={3} />
          ) : items.length === 0 ? (
            <EmptyRow colSpan={3} icon={Building2} label={t("modules.settings.tenants.empty.companies", { defaultValue: "Kompaniyalar yo'q" })} />
          ) : (
            items.map((c, i) => (
              <TableRow
                key={c.id}
                className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              >
                <TableCell className="font-medium">{c.name || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{c.inn || "—"}</TableCell>
                <TableCell>
                  <Badge variant={c.is_active ? "success" : "muted"}>
                    {c.is_active
                      ? t("modules.settings.tenants.status.active", { defaultValue: "Faol" })
                      : t("modules.settings.tenants.status.inactive", { defaultValue: "Faol emas" })}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableShell>
  );
}

// ── Keys tab ───────────────────────────────────────────────────────────────

function KeysTab({ tenantId }: { tenantId: number }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useTenantKeys(tenantId);
  const items = data?.items ?? [];

  if (!isLoading && isError) return <ErrorState onRetry={() => refetch()} />;

  return (
    <TableShell>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("modules.settings.tenants.keys.name", { defaultValue: "Nom" })}</TableHead>
            <TableHead>{t("modules.settings.tenants.keys.company", { defaultValue: "Kompaniya" })}</TableHead>
            <TableHead>{t("modules.settings.tenants.columns.status", { defaultValue: "Holat" })}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <SkeletonRows rows={6} cols={3} />
          ) : items.length === 0 ? (
            <EmptyRow colSpan={3} icon={KeyRound} label={t("modules.settings.tenants.empty.keys", { defaultValue: "Kalitlar yo'q" })} />
          ) : (
            items.map((k, i) => (
              <TableRow
                key={k.id}
                className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              >
                <TableCell className="font-medium">{k.name || "—"}</TableCell>
                <TableCell>{k.company_name || "—"}</TableCell>
                <TableCell>{k.validation_status || "—"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableShell>
  );
}

// ── Users tab ──────────────────────────────────────────────────────────────

function UsersTab({ tenantId }: { tenantId: number }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch } = useTenantUsers(tenantId);
  const items = data?.items ?? [];
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <UserPlus className="size-4 mr-1" />
          {t("modules.settings.tenants.users.createAdmin", { defaultValue: "Admin user yaratish" })}
        </Button>
      </div>

      {!isLoading && isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("modules.settings.tenants.users.username", { defaultValue: "Username" })}</TableHead>
                <TableHead>{t("modules.settings.tenants.users.name", { defaultValue: "Ism" })}</TableHead>
                <TableHead>{t("modules.settings.tenants.users.email", { defaultValue: "Email" })}</TableHead>
                <TableHead>{t("modules.settings.tenants.users.role", { defaultValue: "Rol" })}</TableHead>
                <TableHead>{t("modules.settings.tenants.columns.status", { defaultValue: "Holat" })}</TableHead>
                <TableHead>{t("modules.settings.tenants.users.lastLogin", { defaultValue: "Oxirgi kirish" })}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <SkeletonRows rows={6} cols={6} />
              ) : items.length === 0 ? (
                <EmptyRow colSpan={6} icon={Users} label={t("modules.settings.tenants.empty.users", { defaultValue: "Foydalanuvchilar yo'q" })} />
              ) : (
                items.map((u, i) => (
                  <TableRow
                    key={u.uid}
                    className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <TableCell className="font-mono text-xs">{u.uid}</TableCell>
                    <TableCell className="font-medium">{u.display_name || "—"}</TableCell>
                    <TableCell>{u.email || "—"}</TableCell>
                    <TableCell>
                      {u.is_admin
                        ? <Badge variant="info">{t("modules.settings.tenants.users.admin", { defaultValue: "Admin" })}</Badge>
                        : <Badge variant="muted">{t("modules.settings.tenants.users.member", { defaultValue: "Foydalanuvchi" })}</Badge>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.is_active ? "success" : "muted"}>
                        {u.is_active
                          ? t("modules.settings.tenants.status.active", { defaultValue: "Faol" })
                          : t("modules.settings.tenants.status.inactive", { defaultValue: "Faol emas" })}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{fmtDateTime(u.last_login_at)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableShell>
      )}

      <CreateUserDialog
        tenantId={tenantId}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => refetch()}
      />
    </div>
  );
}

function CreateUserDialog({
  tenantId, open, onOpenChange, onCreated,
}: {
  tenantId: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const create = useCreateTenantUser(tenantId);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setUsername(""); setPassword(""); setDisplayName(""); setEmail("");
    setIsAdmin(true); setErr(null);
  };

  const close = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const submit = async () => {
    setErr(null);
    if (!username.trim() || !password) {
      setErr(t("modules.settings.tenants.users.requiredErr", { defaultValue: "Username va parol majburiy" }));
      return;
    }
    const body: TenantUserCreate = {
      username: username.trim(),
      password,
      is_admin: isAdmin,
    };
    if (displayName.trim()) body.display_name = displayName.trim();
    if (email.trim()) body.email = email.trim();
    try {
      await create.mutateAsync(body);
      onCreated();
      close(false);
    } catch (e) {
      setErr(apiErrorText(e));
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("modules.settings.tenants.users.createTitle", { defaultValue: "Admin user yaratish" })}</DialogTitle>
          <DialogDescription>
            {t("modules.settings.tenants.users.createHint", { defaultValue: "Tenant bazasida yangi foydalanuvchi yaratiladi." })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label={t("modules.settings.tenants.users.username", { defaultValue: "Username" })}>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" />
          </Field>
          <Field label={t("modules.settings.tenants.users.password", { defaultValue: "Parol" })}>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </Field>
          <Field label={t("modules.settings.tenants.users.name", { defaultValue: "Ism" })}>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </Field>
          <Field label={t("modules.settings.tenants.users.emailOptional", { defaultValue: "Email (ixtiyoriy)" })}>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
          </Field>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox checked={isAdmin} onCheckedChange={(v) => setIsAdmin(v === true)} />
            {t("modules.settings.tenants.users.adminRight", { defaultValue: "Admin huquqi" })}
          </label>

          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive break-words">
              {err}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)} disabled={create.isPending}>
            {t("common.cancel", { defaultValue: "Bekor qilish" })}
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
            {t("common.create", { defaultValue: "Yaratish" })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
