/**
 * KeyCompanyPage — full-page (NOT Sheet/Dialog) cloud-parity rebuild of
 * cloud-os/apps/aiba_keys company-detail (templates/company-detail.php + js/company-detail.js + css/company-detail.css).
 *
 * Layout: DetailPage (left 380px sidebar with hero+info cards + right viewer with tabs).
 * Tabs mirror cloud:
 *   Kalitlar (keys grid table: Egasi / INN-PINFL / Seriya / Amal qiladi / Holat)
 *   Ma'lumot (info grid: Kompaniya / Kontaktlar / Bank cards — cloud renderInfo())
 *
 * Route: /keys/companies/:id  → backTo /keys (Kompaniyalar list).
 * Backend reuse: existing useKeyCompany + useCompanyKeys hooks; no new endpoints.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  Building2, KeyRound, Info, Phone, Landmark,
  ShieldCheck, ShieldAlert, ShieldX, RefreshCw, Search,
  Plus, Pencil, Trash2, Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DetailCard, DetailPage, DetailRow } from "@/components/ui/detail-page";
import { ErrorState } from "@/components/ui/reveal";
import { useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";

import { useCompany } from "@/shared/store/company";
import { useMe } from "@/shared/api/me";
import {
  useKeyCompany, useCompanyKeys, useDeleteKey, useDeleteCompany,
  type KeyCompanyDetail, type KeyStatus, type SignKey,
} from "./api";
import {
  CompanyFormDialog, ConfirmDialog, KeyFormDialog, KeyUsersDialog, apiErrorText,
} from "./admin-dialogs";

// ── helpers (mirror cloud js/company-detail.js) ─────────────────────────────

const AVATAR_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c",
  "#16a34a", "#0891b2", "#4f46e5", "#059669",
];

function avatarColor(name?: string | null) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = (name || "").charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function avatarInitial(name?: string | null) {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_META: Record<KeyStatus, { labelKey: string; variant: "success" | "warning" | "danger"; icon: React.ReactNode }> = {
  active: { labelKey: "modules.keys.keyStatus.active", variant: "success", icon: <ShieldCheck className="size-3.5" /> },
  expiring: { labelKey: "modules.keys.keyStatus.expiring", variant: "warning", icon: <ShieldAlert className="size-3.5" /> },
  expired: { labelKey: "modules.keys.keyStatus.expired", variant: "danger", icon: <ShieldX className="size-3.5" /> },
};

const STATUS_FILTERS: [string, string][] = [
  ["all", "modules.keys.statusFilters.all"],
  ["active", "modules.keys.keyStatus.active"],
  ["expiring", "modules.keys.keyStatus.expiring"],
  ["expired", "modules.keys.keyStatus.expired"],
];

function StatusChip({ status }: { status: KeyStatus }) {
  const { t } = useTranslation();
  const m = STATUS_META[status] ?? STATUS_META.active;
  return (
    <Badge variant={m.variant} className="gap-1">
      {m.icon}
      {t(m.labelKey)}
    </Badge>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

const TABS = [
  { key: "keys", labelKey: "modules.keys.tabs.keys", icon: KeyRound },
  { key: "info", labelKey: "modules.keys.tabs.info", icon: Info },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export function KeyCompanyPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const companyId = Number(id);
  const setCurrent = useCompany((s) => s.setCurrent);

  const [tabRaw, setTabRaw] = useUrlState("tab", "keys");
  const tab = tabRaw as TabKey;
  const setTab = (v: TabKey) => setTabRaw(v);
  const [companyEditOpen, setCompanyEditOpen] = useState(false);
  const [companyDeleteOpen, setCompanyDeleteOpen] = useState(false);
  const [companyDeleteError, setCompanyDeleteError] = useState<string | null>(null);

  const { data: me } = useMe();
  const isAdmin = !!me?.is_admin;
  const deleteCompany = useDeleteCompany();

  const { data: company, isLoading, refetch, isFetching } = useKeyCompany(companyId);

  const onDeleteCompany = async () => {
    setCompanyDeleteError(null);
    try {
      await deleteCompany.mutateAsync(companyId);
      setCompanyDeleteOpen(false);
      navigate("/keys?list=1");
    } catch (e) {
      setCompanyDeleteError(apiErrorText(e));
    }
  };

  // Sync the global "current company" store so the rest of the app
  // (sidebar selector, other module pages) acts on the company we're viewing.
  useEffect(() => {
    if (company?.id) {
      setCurrent({
        id: company.id,
        name: company.name || "",
        inn: company.inn || undefined,
      });
    }
  }, [company?.id, company?.name, company?.inn, setCurrent]);

  // Sidebar: loading → skeleton; error/no-data → empty (the main content area
  // shows the ErrorState + retry, so the sidebar never hangs on the skeleton).
  const sidebar = isLoading
    ? <SidebarSkeleton />
    : company
      ? <Sidebar company={company} />
      : null;

  return (
    <DetailPage backTo="/keys?list=1" backLabel={t("modules.keys.companies")} sidebar={sidebar}>
      <div className="p-6 space-y-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-tight">
              {isLoading
                ? <Skeleton className="h-8 w-72" />
                : <span className="inline-block animate-in fade-in-0 duration-300">{company?.name || t("modules.keys.companyNumber", { id: companyId })}</span>}
            </h1>
            {!isLoading && (
              <p className="text-sm text-muted-foreground mt-0.5 animate-in fade-in-0 duration-300">
                {[company?.legal_form, company?.inn ? `INN: ${company.inn}` : null]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" onClick={() => setCompanyEditOpen(true)}>
                  <Pencil className="size-4 mr-1" />
                  {t("modules.keys.admin.editCompany")}
                </Button>
                <Button
                  variant="outline" size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => { setCompanyDeleteError(null); setCompanyDeleteOpen(true); }}
                >
                  <Trash2 className="size-4 mr-1" />
                  {t("common.delete")}
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`size-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              {t("modules.keys.actions.refresh")}
            </Button>
          </div>
        </div>

        {/* 2-tab nav (mirrors cloud .aiba-tabs) */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <div className="border-b border-border">
            <TabsList className="bg-transparent h-auto p-0 rounded-none gap-0 flex-wrap">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.key}
                  value={tab.key}
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 text-sm gap-1.5"
                >
                  <tab.icon className="size-4" />
                  {t(tab.labelKey)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="keys" className="mt-6">
            <KeysTab companyId={companyId} isAdmin={isAdmin} />
          </TabsContent>
          <TabsContent value="info" className="mt-6">
            <InfoTab company={company} loading={isLoading} onRetry={() => refetch()} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Admin dialogs — company edit + delete confirm */}
      <CompanyFormDialog
        open={companyEditOpen}
        onOpenChange={setCompanyEditOpen}
        company={company ?? null}
      />
      <ConfirmDialog
        open={companyDeleteOpen}
        onOpenChange={setCompanyDeleteOpen}
        title={t("modules.keys.admin.deleteCompany")}
        description={t("modules.keys.admin.deleteCompanyHint", { name: company?.name ?? "" })}
        onConfirm={onDeleteCompany}
        busy={deleteCompany.isPending}
        error={companyDeleteError}
      />
    </DetailPage>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <>
      <DetailCard>
        <div className="flex flex-col items-center gap-2.5">
          <Skeleton className="size-16 rounded-xl" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
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

function Sidebar({ company }: { company: KeyCompanyDetail }) {
  const { t } = useTranslation();
  return (
    <>
      {/* Hero card — avatar + name + legal_form + inn pill + status */}
      <DetailCard>
        <div className="flex flex-col items-center text-center gap-2">
          <div
            className="size-16 rounded-xl grid place-items-center text-white text-xl font-bold"
            style={{ background: avatarColor(company.name) }}
          >
            {avatarInitial(company.name)}
          </div>
          <div className="font-semibold text-foreground leading-tight">
            {company.name || "—"}
          </div>
          {company.legal_form && (
            <div className="text-xs text-muted-foreground">
              {company.legal_form}
            </div>
          )}
          {company.inn && (
            <div className="font-mono text-xs text-muted-foreground bg-muted rounded px-2 py-0.5 mt-1">
              INN: {company.inn}
            </div>
          )}
          <Badge variant={company.is_active ? "success" : "muted"} className="mt-1">
            {company.is_active ? t("modules.keys.activeFlag.active") : t("modules.keys.activeFlag.inactive")}
          </Badge>
        </div>
      </DetailCard>

      {/* Keys count card */}
      <DetailCard title={<span className="flex items-center gap-1.5"><KeyRound className="size-4 text-muted-foreground" /> {t("modules.keys.tabs.keys")}</span>}>
        <dl>
          <DetailRow k={t("modules.keys.fields.totalKeys")} v={<span className="font-semibold text-foreground">{company.keys_count}</span>} />
          <DetailRow k={t("modules.keys.fields.director")} v={company.director_name || null} />
        </dl>
      </DetailCard>

      {/* Contacts card (cloud "Контакты" block — keeps essentials) */}
      <DetailCard title={<span className="flex items-center gap-1.5"><Phone className="size-4 text-muted-foreground" /> {t("modules.keys.sections.contacts")}</span>}>
        <dl>
          <DetailRow k={t("modules.keys.fields.email")} v={company.email || null} />
          <DetailRow k={t("modules.keys.fields.phone")} v={company.phone || null} mono />
          <DetailRow k={t("modules.keys.fields.address")} v={company.address || null} />
        </dl>
      </DetailCard>

      {/* Bank card (cloud "Банк" block) */}
      <DetailCard title={<span className="flex items-center gap-1.5"><Landmark className="size-4 text-muted-foreground" /> {t("modules.keys.sections.bank")}</span>}>
        <dl>
          <DetailRow k={t("modules.keys.fields.bankName")} v={company.bank_name || null} />
          <DetailRow k={t("modules.keys.fields.mfo")} v={company.bank_mfo || null} mono />
          <DetailRow k={t("modules.keys.fields.bankAccount")} v={company.bank_account || null} mono />
        </dl>
      </DetailCard>
    </>
  );
}

// ── Keys tab ───────────────────────────────────────────────────────────────

const dim = <span className="text-muted-foreground">—</span>;

function KeysTab({ companyId, isAdmin }: { companyId: number; isAdmin: boolean }) {
  const { t } = useTranslation();
  const [qInput, q, setQInput] = useUrlSearch("q");
  const [status, setStatus] = useUrlState("status", "all");

  // Admin dialog state
  const [formOpen, setFormOpen] = useState(false);
  const [editKey, setEditKey] = useState<SignKey | null>(null);
  const [usersKeyId, setUsersKeyId] = useState<number | null>(null);
  const [deleteKey, setDeleteKey] = useState<SignKey | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const del = useDeleteKey();

  const { data: keys, isLoading, isError } = useCompanyKeys(companyId);

  const onDelete = async () => {
    if (!deleteKey) return;
    setDeleteError(null);
    try {
      await del.mutateAsync(deleteKey.id);
      setDeleteKey(null);
    } catch (e) {
      setDeleteError(apiErrorText(e));
    }
  };

  const filtered = useMemo(() => {
    let rows: SignKey[] = keys ?? [];
    if (status !== "all") rows = rows.filter((k) => k.status === status);
    const term = q.trim().toLowerCase();
    if (term) {
      rows = rows.filter((k) =>
        [k.owner_name, k.tin, k.pinfl, k.serial, k.organization]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(term)),
      );
    }
    return rows;
  }, [keys, q, status]);

  const counts = useMemo(() => {
    const c = { active: 0, expiring: 0, expired: 0 };
    (keys ?? []).forEach((k) => {
      c[k.status as keyof typeof c] = (c[k.status as keyof typeof c] ?? 0) + 1;
    });
    return c;
  }, [keys]);

  return (
    <div className="space-y-4">
      {/* Stat chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs">
          {t("modules.keys.stats.total")}: <strong>{keys?.length ?? 0}</strong>
        </Badge>
        <Badge variant="success" className="gap-1.5 px-2.5 py-1 text-xs">
          <ShieldCheck className="size-3.5" /> {t("modules.keys.keyStatus.active")}: {counts.active}
        </Badge>
        <Badge variant="warning" className="gap-1.5 px-2.5 py-1 text-xs">
          <ShieldAlert className="size-3.5" /> {t("modules.keys.keyStatus.expiring")}: {counts.expiring}
        </Badge>
        <Badge variant="danger" className="gap-1.5 px-2.5 py-1 text-xs">
          <ShieldX className="size-3.5" /> {t("modules.keys.stats.expired")}: {counts.expired}
        </Badge>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={t("modules.keys.keysSearchPlaceholder")}
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {t(l)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isAdmin && (
          <Button size="sm" className="ml-auto" onClick={() => { setEditKey(null); setFormOpen(true); }}>
            <Plus className="size-4 mr-1" />
            {t("modules.keys.admin.addKey")}
          </Button>
        )}
      </div>

      {/* Table — cloud column order: Egasi / INN-PINFL / Seriya / Amal qiladi / Holat */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("modules.keys.keysColumns.owner")}</TableHead>
              <TableHead>{t("modules.keys.keysColumns.innPinfl")}</TableHead>
              <TableHead>{t("modules.keys.keysColumns.serial")}</TableHead>
              <TableHead>{t("modules.keys.keysColumns.validTo")}</TableHead>
              <TableHead className="text-right">{t("modules.keys.keysColumns.status")}</TableHead>
              {isAdmin && <TableHead className="w-28" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-7 rounded-full shrink-0" />
                      <div className="space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-2.5 w-20" /></div>
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-5 w-16 rounded-full ml-auto" /></TableCell>
                  {isAdmin && <TableCell className="text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>}
                </TableRow>
              ))}

            {!isLoading && isError && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={isAdmin ? 6 : 5} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <KeyRound className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.keys.loadKeysError")}</div>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={isAdmin ? 6 : 5} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <KeyRound className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {keys && keys.length > 0
                        ? t("modules.keys.noKeysFilter")
                        : t("modules.keys.noKeysCompany")}
                    </div>
                    {(q.trim() || status !== "all") && (
                      <Button variant="outline" size="sm" onClick={() => { setQInput(""); setStatus("all"); }}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              !isError &&
              filtered.map((k, i) => (
                <TableRow
                  key={k.id}
                  className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <KeyRound className="size-3.5" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{k.owner_name || "—"}</div>
                        {k.organization && (
                          <div className="text-xs text-muted-foreground truncate">{k.organization}</div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">
                      {k.tin ? <div>INN: {k.tin}</div> : null}
                      {k.pinfl ? <div className="text-muted-foreground">PINFL: {k.pinfl}</div> : null}
                      {!k.tin && !k.pinfl ? dim : null}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{k.serial || dim}</TableCell>
                  <TableCell className="text-sm">{fmtDate(k.valid_to)}</TableCell>
                  <TableCell className="text-right">
                    <StatusChip status={k.status} />
                  </TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost" size="sm" className="size-8 p-0"
                          title={t("modules.keys.admin.editKey")}
                          onClick={() => { setEditKey(k); setFormOpen(true); }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm" className="size-8 p-0"
                          title={t("modules.keys.admin.keyUsers")}
                          onClick={() => setUsersKeyId(k.id)}
                        >
                          <Users className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="size-8 p-0 text-destructive hover:text-destructive"
                          title={t("common.delete")}
                          onClick={() => { setDeleteError(null); setDeleteKey(k); }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>

      {/* Admin dialogs */}
      {isAdmin && (
        <>
          <KeyFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            companyId={companyId}
            editKey={editKey}
          />
          <KeyUsersDialog
            open={usersKeyId != null}
            onOpenChange={(v) => { if (!v) setUsersKeyId(null); }}
            keyId={usersKeyId}
          />
          <ConfirmDialog
            open={deleteKey != null}
            onOpenChange={(v) => { if (!v) setDeleteKey(null); }}
            title={t("modules.keys.admin.deleteKey")}
            description={t("modules.keys.admin.deleteKeyHint", { name: deleteKey?.owner_name || deleteKey?.name || "" })}
            onConfirm={onDelete}
            busy={del.isPending}
            error={deleteError}
          />
        </>
      )}
    </div>
  );
}

// ── Info tab — cloud renderInfo() 3-section grid ───────────────────────────

function InfoTab({
  company, loading, onRetry,
}: {
  company: KeyCompanyDetail | undefined;
  loading: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  // loading → skeleton; not-loading-but-no-data (fetch failed) → error + retry
  // (never hang on the skeleton).
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    );
  }
  if (!company) return <ErrorState onRetry={onRetry} />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in-0 duration-300">
      {/* Company card */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-border">
          <Building2 className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{t("modules.keys.sections.company")}</h3>
        </div>
        <dl>
          <DetailRow k={t("modules.keys.fields.name")} v={company.name || null} />
          <DetailRow k={t("modules.keys.fields.inn")} v={company.inn || null} mono />
          <DetailRow k={t("modules.keys.fields.legalForm")} v={company.legal_form || null} />
          <DetailRow k={t("modules.keys.fields.oked")} v={company.oked || null} mono />
          <DetailRow k={t("modules.keys.fields.director")} v={company.director_name || null} />
          <DetailRow k={t("modules.keys.fields.accountant")} v={company.accountant_name || null} />
          <DetailRow k={t("modules.keys.fields.registrationDate")} v={fmtDate(company.registration_date)} />
          <DetailRow k={t("modules.keys.fields.createdAt")} v={fmtDate(company.created_at)} />
          <DetailRow
            k={t("modules.keys.fields.status")}
            v={
              <Badge variant={company.is_active ? "success" : "muted"}>
                {company.is_active ? t("modules.keys.activeFlag.active") : t("modules.keys.activeFlag.inactive")}
              </Badge>
            }
          />
        </dl>
      </div>

      {/* Contacts card */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-border">
          <Phone className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{t("modules.keys.sections.contacts")}</h3>
        </div>
        <dl>
          <DetailRow k={t("modules.keys.fields.email")} v={company.email || null} />
          <DetailRow k={t("modules.keys.fields.phone")} v={company.phone || null} mono />
          <DetailRow k={t("modules.keys.fields.address")} v={company.address || null} />
        </dl>
        {company.responsible_employee && (
          <div className="mt-3 pt-3 border-t border-border">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5 font-medium">
              {t("modules.keys.fields.responsibleEmployee")}
            </div>
            <dl>
              <DetailRow
                k={t("modules.keys.fields.firstName")}
                v={
                  company.responsible_employee.full_name ||
                  company.responsible_employee.username ||
                  null
                }
              />
              <DetailRow k={t("modules.keys.fields.email")} v={company.responsible_employee.email || null} />
            </dl>
          </div>
        )}
      </div>

      {/* Bank card */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-border">
          <Landmark className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{t("modules.keys.sections.bank")}</h3>
        </div>
        <dl>
          <DetailRow k={t("modules.keys.fields.bankName")} v={company.bank_name || null} />
          <DetailRow k={t("modules.keys.fields.mfo")} v={company.bank_mfo || null} mono />
          <DetailRow k={t("modules.keys.fields.bankAccount")} v={company.bank_account || null} mono />
        </dl>
      </div>
    </div>
  );
}
