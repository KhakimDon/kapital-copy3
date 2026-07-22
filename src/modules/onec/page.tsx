import { useMemo, useState } from "react";
import { useUrlSearch } from "@/shared/hooks/use-url-state";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Search, RefreshCw, FileText, GitCompare } from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { ModuleShell, type ModuleSection } from "@/components/ui/module-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useCounterparties,
  type Counterparty,
  type CpStatus,
} from "./api";

// ── helpers ──────────────────────────────────────────────────────────────────

const money = (v: number) =>
  Number(v || 0).toLocaleString("ru-RU", { maximumFractionDigits: 2 });

function signedTone(v: number) {
  if (v > 0) return "text-emerald-600 dark:text-emerald-400";
  if (v < 0) return "text-red-600 dark:text-red-400";
  return "text-muted-foreground";
}

const STATUS_META: Record<
  CpStatus,
  { labelKey: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  debtor: { labelKey: "modules.onec.cpStatus.debtor", variant: "default" },
  creditor: { labelKey: "modules.onec.cpStatus.creditor", variant: "destructive" },
  customer_advance: { labelKey: "modules.onec.cpStatus.customerAdvance", variant: "secondary" },
  supplier_advance: { labelKey: "modules.onec.cpStatus.supplierAdvance", variant: "outline" },
  settled: { labelKey: "modules.onec.cpStatus.settled", variant: "outline" },
};

type TypeTab = "all" | "debtor" | "creditor";

// ── stats tile ────────────────────────────────────────────────────────────────

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${tone ?? "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

// ── list view ─────────────────────────────────────────────────────────────────

function SverkaView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ONEC_SECTIONS: ModuleSection[] = [
    { key: "sverka", label: t("modules.onec.sverka"), icon: <GitCompare className="size-4" />, to: "/onec", end: true },
  ];
  const { data, isLoading, isFetching, refetch } = useCounterparties(companyId);
  const [searchInput, search, setSearch] = useUrlSearch("q");
  const [tab, setTab] = useState<TypeTab>("all");

  const rows = data?.counterparties ?? [];

  const filtered = useMemo(() => {
    let r = rows;
    if (tab === "debtor") r = r.filter((c) => c.customerBalance > 0);
    else if (tab === "creditor") r = r.filter((c) => c.supplierBalance > 0);
    const s = search.trim().toLowerCase();
    if (s)
      r = r.filter(
        (c) => c.name.toLowerCase().includes(s) || c.inn.includes(s)
      );
    return r;
  }, [rows, tab, search]);

  const connected = data?.connected ?? false;

  const tabs: [TypeTab, string, number][] = [
    ["all", t("modules.onec.tabs.all"), rows.length],
    ["debtor", t("modules.onec.tabs.debtors"), data?.debtorCount ?? 0],
    ["creditor", t("modules.onec.tabs.creditors"), data?.creditorCount ?? 0],
  ];

  return (
    <ModuleShell
      title={t("modules.onec.sverka")}
      icon={<GitCompare className="size-6" />}
      sections={ONEC_SECTIONS}
      actions={
        <>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("modules.onec.searchPlaceholder")}
              className="w-64 pl-8"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            title={t("modules.onec.actions.refresh")}
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </>
      }
    >
      {/* stats */}
      {connected && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 animate-in fade-in-0 duration-300">
          <Tile
            label={t("modules.onec.totals.receivable")}
            value={money(data?.totalReceivable ?? 0)}
            tone="text-emerald-600 dark:text-emerald-400"
          />
          <Tile
            label={t("modules.onec.totals.payable")}
            value={money(data?.totalPayable ?? 0)}
            tone="text-red-600 dark:text-red-400"
          />
          <Tile
            label={t("modules.onec.totals.net")}
            value={money(data?.netPosition ?? 0)}
            tone={signedTone(data?.netPosition ?? 0)}
          />
        </div>
      )}

      {/* type tabs */}
      {connected && (
        <div className="flex items-center gap-1 border-b border-border animate-in fade-in-0 duration-300">
          {tabs.map(([k, lbl, cnt]) => (
            <Button
              key={k}
              variant="ghost"
              onClick={() => setTab(k)}
              className={`-mb-px h-auto gap-1.5 rounded-none border-b-2 px-3 py-2 text-sm font-normal transition-colors hover:bg-transparent ${
                tab === k
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {lbl}
              <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">
                {cnt}
              </span>
            </Button>
          ))}
        </div>
      )}

      {/* table / states — not-connected short-circuits (no table); otherwise
          ONE table stays mounted and only the body swaps loading → data →
          empty so the header transition stays smooth. */}
      {!isLoading && connected === false ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center text-muted-foreground animate-in fade-in-0 duration-300">
          <FileText className="mx-auto mb-3 size-8 opacity-50" />
          {t("modules.onec.notConnected")}
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t("modules.onec.columns.counterparty")}</TableHead>
                <TableHead>{t("modules.onec.columns.inn")}</TableHead>
                <TableHead className="text-right">{t("modules.onec.columns.debit")}</TableHead>
                <TableHead className="text-right">{t("modules.onec.columns.credit")}</TableHead>
                <TableHead className="text-right">{t("modules.onec.columns.balance")}</TableHead>
                <TableHead>{t("modules.onec.columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                // Table-shaped skeleton rows mirror the real columns so the
                // swap to data is seamless.
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                    <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-24 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <GitCompare className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.onec.noCounterparties")}</div>
                      {search.trim() && (
                        <Button variant="outline" size="sm" onClick={() => setSearch("")}>
                          {t("common.clear", { defaultValue: "Tozalash" })}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((c: Counterparty, i) => {
                  // Navigate by INN (TIN) when available — clean, copy-pasteable
                  // URLs. Fall back to the 1C internal code for CPs without an
                  // INN (individuals stored as ПИНФЛ-only). The detail page
                  // resolves both variants from the cached list.
                  const slug = c.inn || c.code;
                  return (
                  <TableRow
                    key={c.name + c.inn + c.code}
                    className={`animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300 ${slug ? "cursor-pointer" : "cursor-not-allowed opacity-70"}`}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    onClick={() => {
                      if (slug) navigate(`/onec/counterparties/${encodeURIComponent(slug)}`);
                    }}
                  >
                    <TableCell className="font-medium">{c.name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.inn || (c.code ? `${t("modules.onec.codePrefix")}: ${c.code}` : "—")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                      {c.debit ? money(c.debit) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-red-600 dark:text-red-400">
                      {c.credit ? money(c.credit) : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold tabular-nums ${signedTone(c.balance)}`}
                    >
                      {money(c.balance)}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.statuses.map((s) => (
                          <Badge key={s} variant={STATUS_META[s].variant}>
                            {t(STATUS_META[s].labelKey)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </ModuleShell>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export function OnecPage() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;

  if (!companyId)
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        {t("modules.onec.selectCompany")}
      </div>
    );

  return <SverkaView companyId={companyId} />;
}
