/**
 * CompanyDetailPage — full-page (NOT a sheet/drawer) cloud-parity rebuild of
 * cloud-os/apps/aiba_integration company-detail (template + js + css).
 *
 * Layout: DetailPage (left 380px sidebar of <DetailCard>s + right viewer).
 * Tabs inside the viewer = 7 sections from the cloud sidebar:
 *   Dashboard · Keys · Documents · Soliq · Akt sverka · 1C · Xodimlar
 *
 * Each tab is an orchestrator that reuses an existing per-module hook from
 * the keys / documents / employees / soliq / onec modules. We never
 * re-implement business logic here — only render small tables/cards on top
 * of the cloud's exact data shapes.
 */
import { useEffect, useState } from "react";
import { useUrlState } from "@/shared/hooks/use-url-state";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Banknote,
  Briefcase,
  Building2,
  Copy,
  FileText,
  KeyRound,
  Landmark,
  Receipt,
  RefreshCw,
  Scale,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DetailCard, DetailPage, DetailRow } from "@/components/ui/detail-page";
import { FadeIn, ErrorState } from "@/components/ui/reveal";

import { useCompany } from "@/shared/store/company";
import { RatingTag } from "@/shared/rating";
import { useCompanyOverviewSummary, type CompanyOverview } from "./detail-api";

// Reuse per-module hooks — do NOT duplicate their endpoints.
import { useCompanyKeys, type SignKey, type KeyStatus } from "@/modules/keys/api";
import { useDocuments } from "@/modules/documents/api";
import { useEmployees } from "@/modules/employees/api";
import {
  useCompanyOverview as useSoliqCompanyOverview,
  useReconciliation,
} from "@/modules/soliq/api";
import { useCounterparties } from "@/modules/onec/api";

// ── helpers ────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c",
  "#16a34a", "#0891b2", "#4f46e5", "#059669",
];

function avatarColor(name?: string | null) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = (name || "").charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function firstLetter(str?: string | null) {
  const m = (str || "").match(/[a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ]/);
  return m ? m[0] : "";
}

function avatarInitial(name?: string | null) {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  const letters = words.map(firstLetter).filter(Boolean);
  return letters.length >= 2
    ? (letters[0] + letters[1]).toUpperCase()
    : (letters[0] || "?").toUpperCase();
}

function capitalize(str?: string | null) {
  if (!str) return "";
  return str.replace(/\S+/g, (word) => {
    let foundFirst = false;
    return word
      .split("")
      .map((ch) => {
        if (/[a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ]/.test(ch)) {
          if (!foundFirst) {
            foundFirst = true;
            return ch.toUpperCase();
          }
          return ch.toLowerCase();
        }
        return ch;
      })
      .join("");
  });
}

const fmtSum = (v: number | string | null | undefined) => {
  if (v == null) return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? "—" : n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
};

const fmtMoney = (v: number | string | null | undefined) => {
  if (v == null) return "0";
  const n = typeof v === "number" ? v : parseFloat(v);
  return isNaN(n) ? "0" : n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const fmtDate = (s?: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString("ru-RU");
};

// ── Doctype labels (mirror cloud company-detail5.js DOC_TYPES) ─────────────

const useDocTypeLabels = (): Record<string, string> => {
  const { t } = useTranslation();
  return {
    "002": t("modules.companies.docTypes.002"),
    "008": t("modules.companies.docTypes.008"),
    "005": t("modules.companies.docTypes.005"),
    "006": t("modules.companies.docTypes.006"),
    "007": t("modules.companies.docTypes.007"),
    "000": t("modules.companies.docTypes.000"),
    "010": t("modules.companies.docTypes.010"),
    "075": t("modules.companies.docTypes.075"),
    "041": t("modules.companies.docTypes.041"),
    "052": t("modules.companies.docTypes.052"),
    "054": t("modules.companies.docTypes.054"),
  };
};

const useDocStatusLabel = () => {
  const { t } = useTranslation();
  return (s?: number | null) => {
    if (s == null) return { label: "—", variant: "muted" as const };
    if ([3, 33, 180].includes(s)) return { label: t("modules.companies.docStatus.signed"), variant: "success" as const };
    if ([4, 130, 150, 170, 190].includes(s)) return { label: t("modules.companies.docStatus.rejected"), variant: "danger" as const };
    if ([5, 120].includes(s)) return { label: t("modules.companies.docStatus.deleted"), variant: "muted" as const };
    if ([0, 55].includes(s)) return { label: t("modules.companies.docStatus.draft"), variant: "muted" as const };
    return { label: t("modules.companies.docStatus.awaiting"), variant: "warning" as const };
  };
};

const useKeyStatusBadge = () => {
  const { t } = useTranslation();
  return (s: KeyStatus) => {
    if (s === "active") return { label: t("modules.companies.keyStatus.active"), variant: "success" as const };
    if (s === "expiring") return { label: t("modules.companies.keyStatus.expiring"), variant: "warning" as const };
    return { label: t("modules.companies.keyStatus.expired"), variant: "danger" as const };
  };
};

// ── Component ──────────────────────────────────────────────────────────────

const TAB_DEFS = [
  { key: "dashboard", icon: Activity },
  { key: "keys", icon: KeyRound },
  { key: "documents", icon: FileText },
  { key: "taxes", icon: Scale },
  { key: "reconciliation", icon: Receipt },
  { key: "onec", icon: Briefcase },
  { key: "employees", icon: Users },
] as const;

type TabKey = (typeof TAB_DEFS)[number]["key"];

export function CompanyDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const companyId = Number(id);
  const navigate = useNavigate();
  const setCurrent = useCompany((s) => s.setCurrent);

  const TABS = TAB_DEFS.map((tb) => ({
    ...tb,
    label: t(`modules.companies.detailTabs.${tb.key}`),
  }));

  // Active sub-tab is navigational → URL so refresh/deep-link reopens it.
  const [tabRaw, setTab] = useUrlState("tab", "dashboard");
  const tab = tabRaw as TabKey;

  const { data: overview, isLoading, refetch, isFetching } = useCompanyOverviewSummary(companyId);

  // Keep the global "current company" store in sync with the detail page.
  // This makes the existing module pages (which read from useCompany.current)
  // act on the company the operator is looking at, exactly like the cloud's
  // sidebar selector does.
  useEffect(() => {
    if (overview?.company?.id) {
      setCurrent({
        id: overview.company.id,
        name: overview.company.name || "",
        inn: overview.company.inn || undefined,
        chat2_company_id: overview.company.chat2_company_id || undefined,
      });
    }
  }, [overview?.company?.id, overview?.company?.name, overview?.company?.inn, overview?.company?.chat2_company_id, setCurrent]);

  // Sidebar (loading → skeleton; error/no-data → empty so it never hangs).
  const sidebar = isLoading
    ? <SidebarSkeleton />
    : overview
      ? <FadeIn className="space-y-3"><Sidebar overview={overview} /></FadeIn>
      : null;

  return (
    <DetailPage backTo="/companies" backLabel={t("modules.companies.title")} sidebar={sidebar}>
      <div className="p-6 space-y-6">
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-tight">
              {isLoading
                ? <Skeleton className="h-8 w-72" />
                : <span className="inline-block animate-in fade-in-0 duration-300">{capitalize(overview?.company?.name) || t("modules.companies.detail.fallbackTitle", { id: companyId })}</span>}
            </h1>
            {!isLoading && (
              <p className="text-sm text-muted-foreground mt-0.5 animate-in fade-in-0 duration-300">
                {[overview?.company?.legal_form, overview?.company?.inn ? `INN: ${overview.company.inn}` : null]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`size-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            {t("modules.companies.actions.refresh")}
          </Button>
        </div>

        {/* 7-tab nav */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <div className="border-b border-border">
            <TabsList className="bg-transparent h-auto p-0 rounded-none gap-0 flex-wrap">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.key}
                  value={t.key}
                  className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 text-sm gap-1.5"
                >
                  <t.icon className="size-4" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="mt-6">
            <DashboardTab overview={overview} loading={isLoading} onRetry={() => refetch()} companyId={companyId} />
          </TabsContent>
          <TabsContent value="keys" className="mt-6">
            <KeysTab companyId={companyId} />
          </TabsContent>
          <TabsContent value="documents" className="mt-6">
            <DocumentsTab companyId={companyId} />
          </TabsContent>
          <TabsContent value="taxes" className="mt-6">
            <TaxesTab companyId={companyId} />
          </TabsContent>
          <TabsContent value="reconciliation" className="mt-6">
            <ReconciliationTab companyId={companyId} />
          </TabsContent>
          <TabsContent value="onec" className="mt-6">
            <OnecTab companyId={companyId} />
          </TabsContent>
          <TabsContent value="employees" className="mt-6">
            <EmployeesTab companyId={companyId} navigate={navigate} />
          </TabsContent>
        </Tabs>
      </div>
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
      {Array.from({ length: 4 }).map((_, i) => (
        <DetailCard key={i}>
          <Skeleton className="h-6 w-full" />
        </DetailCard>
      ))}
    </>
  );
}

function Sidebar({ overview }: { overview: CompanyOverview }) {
  const { t } = useTranslation();
  const company = overview.company;
  const enrich = overview.enrich;

  return (
    <>
      {/* Header card — avatar + name + legal form/inn */}
      <DetailCard>
        <div className="flex flex-col items-center text-center gap-2">
          <div
            className="size-16 rounded-xl grid place-items-center text-white text-xl font-bold"
            style={{ background: avatarColor(company.name) }}
          >
            {avatarInitial(company.name)}
          </div>
          <div className="font-semibold text-foreground leading-tight">
            {capitalize(company.name) || "—"}
          </div>
          <div className="text-xs text-muted-foreground">
            {company.legal_form || "—"}
          </div>
          {company.inn && (
            <div className="font-mono text-xs text-muted-foreground">
              INN: {company.inn}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-1">
            <Badge variant={company.is_active ? "success" : "muted"}>
              {company.is_active ? t("modules.companies.status.active") : t("modules.companies.status.inactive")}
            </Badge>
            <Badge variant="info">{t("modules.companies.badges.current")}</Badge>
          </div>
        </div>
      </DetailCard>

      {/* Rating / Debt / Advance */}
      <DetailCard title={<span className="flex items-center gap-1.5"><Activity className="size-4 text-muted-foreground" /> {t("modules.companies.sidebar.ratingBlock")}</span>}>
        <dl>
          <DetailRow
            k={t("modules.companies.columns.rating")}
            v={enrich?.rating
              ? <RatingTag rating={enrich.rating} points={enrich.rating_points} />
              : null}
          />
          <DetailRow
            k={t("modules.companies.columns.debt")}
            v={enrich?.debt != null
              ? <span className={Number(enrich.debt) > 0 ? "text-destructive font-semibold tabular-nums" : "tabular-nums"}>{fmtSum(enrich.debt)}</span>
              : null}
            mono
          />
          <DetailRow
            k={t("modules.companies.fields.advance")}
            v={enrich?.advance != null
              ? <span className={Number(enrich.advance) > 0 ? "text-success font-semibold tabular-nums" : "tabular-nums"}>{fmtSum(enrich.advance)}</span>
              : null}
            mono
          />
        </dl>
      </DetailCard>

      {/* Bank balances summary */}
      <DetailCard title={<span className="flex items-center gap-1.5"><Banknote className="size-4 text-muted-foreground" /> {t("modules.companies.sidebar.bankBlock")}</span>}>
        <dl>
          <DetailRow
            k={t("modules.companies.fields.bankAccounts")}
            v={overview.bank_accounts_count != null ? String(overview.bank_accounts_count) : null}
          />
          <DetailRow
            k={t("modules.companies.fields.totalBalance")}
            v={overview.bank_balance != null
              ? <span className="tabular-nums font-semibold">{fmtSum(overview.bank_balance)}</span>
              : null}
            mono
          />
        </dl>
      </DetailCard>

      {/* Documents summary */}
      <DetailCard title={<span className="flex items-center gap-1.5"><FileText className="size-4 text-muted-foreground" /> {t("modules.companies.detailTabs.documents")}</span>}>
        <dl>
          <DetailRow k={t("modules.companies.fields.total")} v={overview.docs_total != null ? String(overview.docs_total) : t("modules.companies.sidebar.goToDocs")} />
        </dl>
      </DetailCard>

      {/* Keys summary */}
      <DetailCard title={<span className="flex items-center gap-1.5"><KeyRound className="size-4 text-muted-foreground" /> {t("modules.companies.sidebar.keysBlock")}</span>}>
        <dl>
          <DetailRow k={t("modules.companies.detailTabs.keys")} v={overview.keys_count != null ? String(overview.keys_count) : null} />
          <DetailRow k={t("modules.companies.detailTabs.employees")} v={overview.employees_count != null ? String(overview.employees_count) : null} />
          <DetailRow k={t("modules.companies.fields.director")} v={overview.director ? capitalize(overview.director) : null} />
        </dl>
      </DetailCard>
    </>
  );
}

// ── Dashboard tab (overview cards) ────────────────────────────────────────

function StatCard({
  label, value, tone = "default", icon, currency,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "success" | "danger" | "warning" | "info";
  icon?: React.ReactNode;
  currency?: string;
}) {
  const toneCls =
    tone === "success" ? "text-success"
    : tone === "danger" ? "text-destructive"
    : tone === "warning" ? "text-warning"
    : tone === "info" ? "text-info"
    : "text-foreground";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        {icon} {label}
      </div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${toneCls}`}>
        {value}{currency && <span className="ml-1 text-xs text-muted-foreground font-normal">{currency}</span>}
      </div>
    </div>
  );
}

function DashboardTab({
  overview, loading, onRetry, companyId,
}: {
  overview: CompanyOverview | undefined;
  loading: boolean;
  onRetry: () => void;
  companyId: number;
}) {
  const { t } = useTranslation();
  // Tax stats — best-effort via soliq overview (same backend the soliq tab uses).
  const { data: soliqOverview } = useSoliqCompanyOverview(companyId);
  const stats = soliqOverview?.stats as Record<string, number | string> | undefined;

  // loading → skeleton; not-loading-but-no-data (fetch failed) → error + retry
  // (never hang on the skeleton).
  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
      </div>
    );
  }
  if (!overview) return <ErrorState onRetry={onRetry} />;

  const company = overview.company;
  const enrich = overview.enrich;

  // Cards — top: reyting/qarz/avans/balans/keys/docs/employees, bottom: tax stats
  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label={t("modules.companies.columns.rating")}
          icon={<Activity className="size-3.5" />}
          value={enrich?.rating || "—"}
          tone={enrich && enrich.rating_points != null ? (enrich.rating_points >= 60 ? "success" : enrich.rating_points >= 40 ? "warning" : "danger") : "default"}
        />
        <StatCard
          label={t("modules.companies.columns.debt")}
          icon={<Scale className="size-3.5" />}
          value={fmtSum(enrich?.debt)}
          tone={enrich?.debt != null && Number(enrich.debt) > 0 ? "danger" : "default"}
          currency={t("modules.companies.units.som")}
        />
        <StatCard
          label={t("modules.companies.fields.advance")}
          icon={<Scale className="size-3.5" />}
          value={fmtSum(enrich?.advance)}
          tone={enrich?.advance != null && Number(enrich.advance) > 0 ? "success" : "default"}
          currency={t("modules.companies.units.som")}
        />
        <StatCard
          label={t("modules.companies.sidebar.bankBlock")}
          icon={<Banknote className="size-3.5" />}
          value={overview.bank_balance != null ? fmtSum(overview.bank_balance) : "—"}
          tone="default"
          currency={t("modules.companies.units.som")}
        />
        <StatCard
          label={t("modules.companies.detailTabs.keys")}
          icon={<KeyRound className="size-3.5" />}
          value={overview.keys_count != null ? overview.keys_count : "—"}
        />
        <StatCard
          label={t("modules.companies.detailTabs.employees")}
          icon={<Users className="size-3.5" />}
          value={overview.employees_count != null ? overview.employees_count : "—"}
        />
        <StatCard
          label={t("modules.companies.fields.bankAccounts")}
          icon={<Landmark className="size-3.5" />}
          value={overview.bank_accounts_count != null ? overview.bank_accounts_count : "—"}
        />
        <StatCard
          label={t("modules.companies.fields.director")}
          icon={<Briefcase className="size-3.5" />}
          value={overview.director ? capitalize(overview.director) : "—"}
        />
      </div>

      {/* Soliq stats strip (only when soliq overview reports them) */}
      {stats && (
        <div>
          <h3 className="text-sm font-medium mb-2 text-foreground">{t("modules.companies.sections.soliqStatus")}</h3>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard
              label={t("modules.companies.fields.totalDebt")}
              icon={<Scale className="size-3.5" />}
              value={fmtMoney(stats.final_debt)}
              tone={Number(stats.final_debt) > 0 ? "danger" : "default"}
              currency={t("modules.companies.units.som")}
            />
            <StatCard
              label={t("modules.companies.fields.calculated")}
              icon={<Activity className="size-3.5" />}
              value={fmtMoney(stats.calculated_tax_amount)}
              tone="info"
              currency={t("modules.companies.units.som")}
            />
            <StatCard
              label={t("modules.companies.fields.paid")}
              icon={<Receipt className="size-3.5" />}
              value={fmtMoney(stats.total_paid)}
              tone="success"
              currency={t("modules.companies.units.som")}
            />
            <StatCard
              label={t("modules.companies.fields.penalty")}
              icon={<Scale className="size-3.5" />}
              value={fmtMoney(stats.surcharge)}
              tone={Number(stats.surcharge) > 0 ? "warning" : "default"}
              currency={t("modules.companies.units.som")}
            />
            <StatCard
              label={t("modules.companies.fields.overpayment")}
              icon={<Banknote className="size-3.5" />}
              value={fmtMoney(stats.current_overpayment)}
              tone={Number(stats.current_overpayment) > 0 ? "success" : "default"}
              currency={t("modules.companies.units.som")}
            />
          </div>
        </div>
      )}

      {/* Rekvizitlar (mirrors cloud Dashboard requisites block) */}
      <RekvCard company={company} />
    </div>
  );
}

function RekvCard({ company }: { company: CompanyOverview["company"] }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);

  function buildText(lang: "uz" | "ru") {
    const lines: string[] = [];
    lines.push(company.name || "");
    const labels = lang === "ru"
      ? { inn: "ИНН", acct: "Р/с", bank: "Банк", mfo: "МФО", addr: "Адрес", phone: "Тел", dir: "Директор" }
      : { inn: "INN", acct: "H/r", bank: "Bank", mfo: "MFO", addr: "Manzil", phone: "Tel", dir: "Direktor" };
    if (company.inn) lines.push(`${labels.inn}: ${company.inn}`);
    if (company.bank_account) lines.push(`${labels.acct}: ${company.bank_account}`);
    if (company.bank_name) lines.push(`${labels.bank}: ${company.bank_name}`);
    if (company.bank_mfo) lines.push(`${labels.mfo}: ${company.bank_mfo}`);
    if (company.address) lines.push(`${labels.addr}: ${company.address}`);
    if (company.phone) lines.push(`${labels.phone}: ${company.phone}`);
    if (company.director_name) lines.push(`${labels.dir}: ${capitalize(company.director_name)}`);
    return lines.filter(Boolean).join("\n");
  }

  const uz = buildText("uz");
  const ru = buildText("ru");

  async function copy(text: string, tag: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* no-op */
    }
  }

  return (
    <div>
      <h3 className="text-sm font-medium mb-2 text-foreground">{t("modules.companies.sections.requisites")}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {[
          { tag: "uz", title: t("modules.companies.langs.latin"), body: uz },
          { tag: "ru", title: t("modules.companies.langs.russian"), body: ru },
        ].map((c) => (
          <div key={c.tag} className="rounded-lg border border-border bg-card overflow-hidden">
            <pre className="p-4 text-sm font-mono whitespace-pre-wrap text-foreground">
              {c.body || "—"}
            </pre>
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-border bg-muted/40 text-xs">
              <span className="text-muted-foreground">{c.title}</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => copy(c.body, c.tag)}
                disabled={!c.body}
              >
                <Copy className="size-3.5 mr-1" />
                {copied === c.tag ? t("modules.companies.actions.copied") : t("modules.companies.actions.copy")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Keys tab ───────────────────────────────────────────────────────────────

function KeysTab({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const keyStatusBadge = useKeyStatusBadge();
  const { data: keys, isLoading } = useCompanyKeys(companyId);

  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("modules.companies.keys.name")}</TableHead>
            <TableHead>{t("modules.companies.keys.owner")}</TableHead>
            <TableHead>{t("modules.companies.keys.serial")}</TableHead>
            <TableHead>INN/PINFL</TableHead>
            <TableHead>{t("modules.companies.columns.status")}</TableHead>
            <TableHead>{t("modules.companies.keys.activeCol")}</TableHead>
            <TableHead>{t("modules.companies.keys.validFrom")}</TableHead>
            <TableHead>{t("modules.companies.keys.validTo")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
              </TableRow>
            ))
          ) : !keys || keys.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={8} className="py-16">
                <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                  <div className="size-14 rounded-full bg-muted grid place-items-center">
                    <KeyRound className="size-7 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-medium text-foreground">{t("modules.companies.empty.keys")}</div>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            keys.map((k: SignKey, i) => {
              const s = keyStatusBadge(k.status);
              return (
                <TableRow
                  key={k.id}
                  className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <TableCell>{k.name || "—"}</TableCell>
                  <TableCell>{k.owner_name || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{k.serial || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {k.tin ? `INN: ${k.tin}` : k.pinfl ? `PINFL: ${k.pinfl}` : "—"}
                  </TableCell>
                  <TableCell><Badge variant={s.variant}>{s.label}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={k.is_aiba_active ? "success" : "danger"}>
                      {k.is_aiba_active ? t("modules.companies.boolean.yes") : t("modules.companies.boolean.no")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{fmtDate(k.valid_from)}</TableCell>
                  <TableCell className="font-mono text-xs">{fmtDate(k.valid_to)}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Documents tab ──────────────────────────────────────────────────────────

function DocumentsTab({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const DOC_TYPE_LABELS = useDocTypeLabels();
  const docStatusLabel = useDocStatusLabel();
  const [owner, setOwner] = useState<0 | 1>(0);
  const [skip, setSkip] = useState(0);
  const limit = 25;
  const { data, isLoading } = useDocuments(companyId, { owner, skip, limit });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const currentPage = Math.floor(skip / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-3">
      {/* Direction tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        {[
          { k: 0, label: t("modules.companies.docs.incoming") },
          { k: 1, label: t("modules.companies.docs.outgoing") },
        ].map((d) => (
          <Button
            key={d.k}
            variant="ghost"
            size="sm"
            onClick={() => { setOwner(d.k as 0 | 1); setSkip(0); }}
            className={`h-auto rounded-none px-4 py-2 border-b-2 -mb-px hover:bg-transparent ${
              owner === d.k
                ? "border-primary font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {d.label}
          </Button>
        ))}
        <div className="ml-auto text-xs text-muted-foreground">
          {t("modules.companies.fields.total")}: <strong className="text-foreground">{total}</strong>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("modules.companies.docs.document")}</TableHead>
              <TableHead>{t("modules.companies.docs.partner")}</TableHead>
              <TableHead>{t("modules.companies.docs.kind")}</TableHead>
              <TableHead>{t("modules.companies.columns.status")}</TableHead>
              <TableHead>{t("modules.companies.docs.date")}</TableHead>
              <TableHead className="text-right">{t("modules.companies.docs.amount")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell>
                    <div className="space-y-1.5"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-2.5 w-20" /></div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-2.5 w-16" /></div>
                  </TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <FileText className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.companies.empty.documents")}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((d, i) => {
                const si = docStatusLabel(d.doc_status);
                return (
                  <TableRow
                    key={d.id || d.doc_id || Math.random()}
                    className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <TableCell>
                      <div className="font-medium">{d.name || d.doc_id || "—"}</div>
                      {d.doc_id && <div className="text-[10px] text-muted-foreground font-mono">{d.doc_id}</div>}
                    </TableCell>
                    <TableCell>
                      <div>{d.partner_name || "—"}</div>
                      {d.partner_tin && <div className="text-xs text-muted-foreground font-mono">{d.partner_tin}</div>}
                    </TableCell>
                    <TableCell>{DOC_TYPE_LABELS[d.doctype || ""] || d.doctype || "—"}</TableCell>
                    <TableCell><Badge variant={si.variant}>{si.label}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{fmtDate(d.doc_date)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtSum(d.total_sum)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <Button
            variant="outline" size="sm"
            disabled={skip === 0}
            onClick={() => setSkip(Math.max(0, skip - limit))}
          >{t("modules.companies.actions.prev")}</Button>
          <span className="text-muted-foreground">{t("modules.companies.pagination.summary", { current: currentPage, totalPages, total })}</span>
          <Button
            variant="outline" size="sm"
            disabled={skip + limit >= total}
            onClick={() => setSkip(skip + limit)}
          >{t("modules.companies.actions.next")}</Button>
        </div>
      )}
    </div>
  );
}

// ── Soliq / taxes tab ──────────────────────────────────────────────────────

function TaxesTab({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const { data: overview, isLoading } = useSoliqCompanyOverview(companyId);

  if (isLoading) {
    return <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
    </div>;
  }

  if (!overview) {
    return <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground animate-in fade-in-0 duration-300">
      {t("modules.companies.empty.taxes")}
    </div>;
  }

  const stats = overview.stats as Record<string, number | string>;
  const profile = overview.profile as Record<string, unknown>;
  const taxModeRaw = (profile?.tax_mode_name as Record<string, string> | undefined) || null;
  const taxMode = taxModeRaw
    ? taxModeRaw.name_uz_latn || taxModeRaw.name_ru || taxModeRaw.name_en || "—"
    : null;

  return (
    <div className="space-y-6 animate-in fade-in-0 duration-300">
      {/* Soliq profile snapshot */}
      <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">{t("modules.companies.taxes.soliqLabel")}</span>
          <Badge variant="muted">{overview.type?.toUpperCase() || "—"}</Badge>
        </div>
        {taxMode && (
          <div className="flex items-center gap-2">
            <Scale className="size-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t("modules.companies.taxes.regimeLabel")}</span>
            <Badge variant="info">{taxMode}</Badge>
          </div>
        )}
        <div className="ml-auto">
          <Button asChild variant="outline" size="sm">
            <a href={`/soliq/company/${companyId}`}>{t("modules.companies.taxes.detailLink")}</a>
          </Button>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard
          label={t("modules.companies.fields.totalDebt")}
          icon={<Scale className="size-3.5" />}
          value={fmtMoney(stats?.final_debt)}
          tone={Number(stats?.final_debt) > 0 ? "danger" : "default"}
          currency={t("modules.companies.units.som")}
        />
        <StatCard
          label={t("modules.companies.fields.calculated")}
          icon={<Activity className="size-3.5" />}
          value={fmtMoney(stats?.calculated_tax_amount)}
          tone="info"
          currency={t("modules.companies.units.som")}
        />
        <StatCard
          label={t("modules.companies.fields.paid")}
          icon={<Receipt className="size-3.5" />}
          value={fmtMoney(stats?.total_paid)}
          tone="success"
          currency={t("modules.companies.units.som")}
        />
        <StatCard
          label={t("modules.companies.fields.penalty")}
          icon={<Scale className="size-3.5" />}
          value={fmtMoney(stats?.surcharge)}
          tone={Number(stats?.surcharge) > 0 ? "warning" : "default"}
          currency={t("modules.companies.units.som")}
        />
        <StatCard
          label={t("modules.companies.fields.overpayment")}
          icon={<Banknote className="size-3.5" />}
          value={fmtMoney(stats?.current_overpayment)}
          tone={Number(stats?.current_overpayment) > 0 ? "success" : "default"}
          currency={t("modules.companies.units.som")}
        />
      </div>
    </div>
  );
}

// ── Akt sverka tab (Tax reconciliation summary) ───────────────────────────

function ReconciliationTab({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const year = new Date().getFullYear();
  const { data, isLoading } = useReconciliation(companyId, { year });

  const items = data?.items ?? [];

  // Aggregate by tax type (cloud: merge by na2_code).
  type Row = {
    label: string;
    open: number;
    charged: number;
    paid: number;
    debt: number;
    advance: number;
    penalty: number;
  };
  const byCode: Record<string, Row> = {};
  const order: string[] = [];
  for (const it of items) {
    const code = String(it.na2_code || "");
    if (!byCode[code]) {
      // Runtime na2_name can be a string OR a {name_uz_latn,name_ru,…} object
      // (the schema is loose on the server side); narrow defensively.
      const tn = it.na2_name as unknown;
      let label = code;
      if (typeof tn === "string") {
        label = tn;
      } else if (tn && typeof tn === "object") {
        const o = tn as Record<string, string>;
        label = o.name_uz_latn || o.name_ru || o.name_en || code;
      }
      byCode[code] = {
        label, open: 0, charged: 0, paid: 0, debt: 0, advance: 0, penalty: 0,
      };
      order.push(code);
    }
    const r = byCode[code];
    r.open += Number(it.saldo_nachalo_ned || 0);
    r.charged += Number(it.nach_itogo || it.nach_rachet || 0);
    r.paid += Number(it.uploch_itogo || 0);
    r.debt += Number(it.total_debt || 0);
    r.advance += Number(it.total_over_payment || 0);
    r.penalty += Number(it.nach_penya || it.saldo_tek_pen || 0);
  }
  const rows = order.map((c) => byCode[c]);
  const totals = rows.reduce(
    (acc, r) => ({
      open: acc.open + r.open,
      charged: acc.charged + r.charged,
      paid: acc.paid + r.paid,
      debt: acc.debt + r.debt,
      advance: acc.advance + r.advance,
      penalty: acc.penalty + r.penalty,
    }),
    { open: 0, charged: 0, paid: 0, debt: 0, advance: 0, penalty: 0 },
  );

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("modules.companies.reconciliation.taxType")}</TableHead>
              <TableHead className="text-right">{t("modules.companies.reconciliation.openingBalance")}</TableHead>
              <TableHead className="text-right">{t("modules.companies.fields.calculated")}</TableHead>
              <TableHead className="text-right">{t("modules.companies.fields.paid")}</TableHead>
              <TableHead className="text-right">{t("modules.companies.columns.debt")}</TableHead>
              <TableHead className="text-right">{t("modules.companies.fields.advance")}</TableHead>
              <TableHead className="text-right">{t("modules.companies.fields.penalty")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Receipt className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.companies.empty.reconciliation")}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              <>
                {rows.map((r, i) => (
                  <TableRow
                    key={r.label}
                    className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtSum(r.open)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtSum(r.charged)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtSum(r.paid)}</TableCell>
                    <TableCell className={`text-right font-mono tabular-nums ${r.debt > 0 ? "text-destructive font-semibold" : ""}`}>{fmtSum(r.debt)}</TableCell>
                    <TableCell className={`text-right font-mono tabular-nums ${r.advance > 0 ? "text-success font-semibold" : ""}`}>{fmtSum(r.advance)}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">{fmtSum(r.penalty)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-border font-semibold hover:bg-transparent">
                  <TableCell>{t("modules.companies.reconciliation.totals")}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtSum(totals.open)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtSum(totals.charged)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtSum(totals.paid)}</TableCell>
                  <TableCell className={`text-right font-mono tabular-nums ${totals.debt > 0 ? "text-destructive" : ""}`}>{fmtSum(totals.debt)}</TableCell>
                  <TableCell className={`text-right font-mono tabular-nums ${totals.advance > 0 ? "text-success" : ""}`}>{fmtSum(totals.advance)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtSum(totals.penalty)}</TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── 1C tab ─────────────────────────────────────────────────────────────────

function OnecTab({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const { data, isLoading } = useCounterparties(companyId);

  if (isLoading) {
    return (
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>#</TableHead>
              <TableHead>{t("modules.companies.onec.counterparty")}</TableHead>
              <TableHead className="text-right">{t("modules.companies.onec.sales")}</TableHead>
              <TableHead className="text-right">{t("modules.companies.onec.purchases")}</TableHead>
              <TableHead className="text-right">{t("modules.companies.onec.balance")}</TableHead>
              <TableHead>{t("modules.companies.columns.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                <TableCell><Skeleton className="h-3.5 w-5" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (!data || !data.connected) {
    return <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground animate-in fade-in-0 duration-300">
      {t("modules.companies.empty.onecDisconnected")}
    </div>;
  }

  const rows = data.counterparties || [];
  const display = rows.slice(0, 50);
  const onecColSpan = data.hasPaymentData ? 9 : 7;

  return (
    <div className="space-y-3 animate-in fade-in-0 duration-300">
      {/* Summary tiles */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard
          label={t("modules.companies.onec.receivable")}
          icon={<Scale className="size-3.5" />}
          value={fmtSum(data.totalReceivable)}
          tone="success"
          currency={t("modules.companies.units.som")}
        />
        <StatCard
          label={t("modules.companies.onec.payable")}
          icon={<Scale className="size-3.5" />}
          value={fmtSum(data.totalPayable)}
          tone="danger"
          currency={t("modules.companies.units.som")}
        />
        <StatCard
          label={t("modules.companies.onec.net")}
          icon={<Banknote className="size-3.5" />}
          value={fmtSum(data.netPosition)}
          tone={data.netPosition >= 0 ? "success" : "danger"}
          currency={t("modules.companies.units.som")}
        />
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>#</TableHead>
              <TableHead>{t("modules.companies.onec.counterparty")}</TableHead>
              <TableHead className="text-right">{t("modules.companies.onec.sales")}</TableHead>
              <TableHead className="text-right">{t("modules.companies.onec.purchases")}</TableHead>
              {data.hasPaymentData && <TableHead className="text-right">{t("modules.companies.onec.paymentIn")}</TableHead>}
              {data.hasPaymentData && <TableHead className="text-right">{t("modules.companies.onec.paymentOut")}</TableHead>}
              <TableHead className="text-right">{t("modules.companies.onec.balance")}</TableHead>
              <TableHead>{t("modules.companies.columns.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {display.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={onecColSpan} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Briefcase className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.companies.empty.counterparties")}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : display.map((cp, i) => {
              const bal = Number(cp.netBalance || 0);
              return (
                <TableRow
                  key={cp.code || cp.name || i}
                  className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{cp.name}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtSum(cp.sales)}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{fmtSum(cp.purchases)}</TableCell>
                  {data.hasPaymentData && <TableCell className="text-right font-mono tabular-nums">{fmtSum(cp.paymentsIn)}</TableCell>}
                  {data.hasPaymentData && <TableCell className="text-right font-mono tabular-nums">{fmtSum(cp.paymentsOut)}</TableCell>}
                  <TableCell className={`text-right font-mono tabular-nums font-semibold ${bal > 0 ? "text-success" : bal < 0 ? "text-destructive" : ""}`}>
                    {fmtSum(bal)}
                  </TableCell>
                  <TableCell>
                    {bal > 0 ? <Badge variant="success">{t("modules.companies.onec.debtor")}</Badge>
                      : bal < 0 ? <Badge variant="danger">{t("modules.companies.onec.creditor")}</Badge>
                      : <Badge variant="muted">{t("modules.companies.onec.reconciled")}</Badge>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {rows.length > display.length && (
        <div className="text-center text-sm text-muted-foreground">
          {t("modules.companies.onec.moreCounterparties", { extra: rows.length - display.length, total: rows.length })}
        </div>
      )}
    </div>
  );
}

// ── Employees tab ──────────────────────────────────────────────────────────

function EmployeesTab({
  companyId, navigate,
}: {
  companyId: number;
  navigate: (path: string) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useEmployees(companyId, {});

  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      {!isLoading && items.length > 0 && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">{t("modules.companies.fields.total")}: <strong className="text-foreground">{data?.count ?? items.length}</strong></div>
          <Button variant="outline" size="sm" onClick={() => navigate("/employees")}>
            {t("modules.companies.actions.allEmployees")}
          </Button>
        </div>
      )}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{t("modules.companies.employees.fio")}</TableHead>
              <TableHead>{t("modules.companies.employees.position")}</TableHead>
              <TableHead>{t("modules.companies.employees.phone")}</TableHead>
              <TableHead>{t("modules.companies.columns.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Users className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.companies.empty.employees")}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((e, i) => (
                <TableRow
                  key={e.id}
                  className="cursor-pointer animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  onClick={() => navigate(`/employees/${e.id}`)}
                >
                  <TableCell className="font-medium">{e.full_name || "—"}</TableCell>
                  <TableCell>{e.position || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{e.phone || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={e.status === "active" ? "success" : "muted"}>
                      {e.status === "active" ? t("modules.companies.status.active") : t("modules.companies.employees.fired")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
