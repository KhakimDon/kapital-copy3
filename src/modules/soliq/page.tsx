import { useMemo, useState } from "react";
import { useUrlNumber, useUrlState } from "@/shared/hooks/use-url-state";
import { SoliqCompanyDetailBody } from "./company-detail";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";
import {
  RefreshCcw, ChevronRight, ChevronDown, ChevronUp, ChevronsUpDown, Inbox,
} from "lucide-react";
import { useTaxGrid } from "./api";
import { TAX_COLUMNS, type TaxGridRow } from "./types";
import { deriveReportStatuses, derivePaymentSums, deriveFilialRows } from "./tax-grid-derive";
import { PeriodNav } from "./components/period-nav";
import { ColumnToggle, useHiddenCols } from "./components/column-toggle";
import {
  DebtCell, AdvanceCell, RatingBadge, TaxStatusBadge, PaySumCell,
} from "./components/status-cell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type GridMode = "reports" | "payments";
type TFn = (key: string, opts?: Record<string, unknown>) => string;

// Column tooltips mirror cloud profiles.php th[title].
const META_COL_KEYS = [
  { key: "debt", labelKey: "modules.soliq.meta.debt", tipKey: "modules.soliq.meta.debtTip" },
  { key: "advance", labelKey: "modules.soliq.meta.advance", tipKey: "modules.soliq.meta.advanceTip" },
  { key: "rating", labelKey: "modules.soliq.meta.rating", tipKey: "modules.soliq.meta.ratingTip" },
  { key: "letters", labelKey: "modules.soliq.meta.letters", tipKey: "modules.soliq.meta.lettersTip" },
  { key: "didox", labelKey: "modules.soliq.meta.didox", tipKey: "modules.soliq.meta.didoxTip" },
  { key: "turnover", labelKey: "modules.soliq.meta.turnover", tipKey: "modules.soliq.meta.turnoverTip" },
  { key: "k2", labelKey: "modules.soliq.meta.k2", tipKey: "modules.soliq.meta.k2Tip" },
];

const TAX_TIP_KEYS: Record<string, string> = {
  tax_fix: "modules.soliq.taxes.tax_fix",
  tax_oborot: "modules.soliq.taxes.tax_oborot",
  tax_nds: "modules.soliq.taxes.tax_nds",
  tax_profit: "modules.soliq.taxes.tax_profit",
  tax_ndfl: "modules.soliq.taxes.tax_ndfl",
  tax_soc: "modules.soliq.taxes.tax_soc",
  tax_akciz: "modules.soliq.taxes.tax_akciz",
  tax_itpark: "modules.soliq.taxes.tax_itpark",
  tax_property: "modules.soliq.taxes.tax_property",
  tax_land: "modules.soliq.taxes.tax_land",
  tax_transport: "modules.soliq.taxes.tax_transport",
  tax_water: "modules.soliq.taxes.tax_water",
};

// 7-item status legend (reports mode) — mirrors cloud tax-legend.
const STATUS_LEGEND_KEYS = [
  { dot: "bg-success", labelKey: "modules.soliq.legend.paid" },
  { dot: "bg-warning", labelKey: "modules.soliq.legend.late" },
  { dot: "bg-destructive", labelKey: "modules.soliq.legend.notSubmitted" },
  { dot: "bg-destructive ring-2 ring-destructive/40", labelKey: "modules.soliq.legend.failed" },
  { dot: "bg-warning", labelKey: "modules.soliq.legend.penalty" },
  { dot: "bg-warning", labelKey: "modules.soliq.legend.submittedNotPaid" },
  { dot: "bg-muted-foreground/40", labelKey: "modules.soliq.legend.noData" },
];

type SortKey = "company" | "debt" | "turnover";

function relativeAge(iso: string | null | undefined, t: TFn): { label: string; state: "fresh" | "aging" | "stale" } | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 0) return null;
  const sec = Math.round(ms / 1000);
  let human: string;
  if (sec < 60) human = t("modules.soliq.page.justNow");
  else if (sec < 3600) human = t("modules.soliq.page.minutesAgo", { n: Math.round(sec / 60) });
  else if (sec < 86400) human = t("modules.soliq.page.hoursAgo", { n: Math.round(sec / 3600) });
  else human = t("modules.soliq.page.daysAgo", { n: Math.round(sec / 86400) });
  const state = sec > 1800 ? "stale" : sec > 600 ? "aging" : "fresh";
  return { label: t("modules.soliq.page.updatedAgo", { ago: human }), state };
}

const PAGE_SIZE = 50;

export function SoliqPage() {
  const { t } = useTranslation();
  const now = new Date();
  // Navigational / query state lives in the URL (deep-link + Back/Forward).
  const [year, setYearNum] = useUrlNumber("year", now.getFullYear());
  const [month, setMonthNum] = useUrlNumber("month", now.getMonth() + 1);
  const [modeRaw, setModeRaw] = useUrlState("mode", "reports");
  const [sortKeyRaw, setSortKeyRaw] = useUrlState("sort", "company");
  const [sortDirRaw, setSortDirRaw] = useUrlState("dir", "asc");
  const [page, setPage] = useUrlNumber("page", 1);
  const mode = modeRaw as GridMode;
  const sortKey = sortKeyRaw as SortKey;
  const sortDir = sortDirRaw as "asc" | "desc";
  const setYear = (y: number) => { setYearNum(y); setPage(1); };
  const setMonth = (m: number) => { setMonthNum(m); setPage(1); };
  const setMode = (m: GridMode) => setModeRaw(m);
  const setSortKey = (k: SortKey) => setSortKeyRaw(k);
  const setSortDir = (d: "asc" | "desc") => setSortDirRaw(d);
  // `force` is a transient refresh nonce, not navigational → keep it local.
  const [force, setForce] = useState(false);
  // Карточка компании открывается МОДАЛКОЙ (стиль ДБО), не отдельной страницей.
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);

  const META_COLS = useMemo(
    () => META_COL_KEYS.map((c) => ({ key: c.key, label: t(c.labelKey), tip: t(c.tipKey) })),
    [t]
  );
  const STATUS_LEGEND = useMemo(
    () => STATUS_LEGEND_KEYS.map((l) => ({ dot: l.dot, label: t(l.labelKey) })),
    [t]
  );

  const [hiddenTax, toggleTax] = useHiddenCols("aiba.soliq.taxgrid.hiddenTax");
  const [hiddenMeta, toggleMeta] = useHiddenCols("aiba.soliq.taxgrid.hiddenMeta");

  const { data, isLoading, error, refetch, isFetching } = useTaxGrid(year, month, force);

  const taxCols = useMemo(
    () => TAX_COLUMNS.filter((c) => !hiddenTax.has(c.key)),
    [hiddenTax]
  );
  const metaCols = useMemo(
    () => META_COLS.filter((c) => !hiddenMeta.has(c.key)),
    [hiddenMeta]
  );

  const sortedRows = useMemo(() => {
    const rows = data?.rows ? [...data.rows] : [];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "company")
        return dir * (a.company_name ?? "").localeCompare(b.company_name ?? "");
      if (sortKey === "debt")
        return dir * (Number(a.debt ?? 0) - Number(b.debt ?? 0));
      return dir * (Number(a.turnover_percent ?? 0) - Number(b.turnover_percent ?? 0));
    });
    return rows;
  }, [data?.rows, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "company" ? "asc" : "desc"); }
  };

  const freshness = relativeAge(data?.synced_at, t);

  return (
    <TooltipProvider delayDuration={200}>
    <div className="space-y-4">
      {/* Строка 1: заголовок слева · бейджи (снэпшот/свежесть) + «Обновить» справа */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">{t("modules.soliq.page.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("modules.soliq.page.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data?.source === "snapshot" ? (
            <Badge variant="info">{t("modules.soliq.page.snapshot")}</Badge>
          ) : (
            <Badge variant="success" className="gap-1">
              <span className="size-1.5 rounded-full bg-success" /> {t("modules.soliq.page.live")}
            </Badge>
          )}
          {/* Snapshot freshness pill */}
          {freshness && (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
              freshness.state === "stale" ? "border-destructive/40 bg-destructive/10 text-destructive"
              : freshness.state === "aging" ? "border-warning/40 text-warning"
              : "text-muted-foreground"}`}>
              <span className={`size-1.5 rounded-full ${
                freshness.state === "stale" ? "bg-destructive"
                : freshness.state === "aging" ? "bg-warning" : "bg-success"}`} />
              {freshness.label}
            </span>
          )}
          {isFetching && <span className="text-xs text-muted-foreground">{t("modules.soliq.page.refreshing")}</span>}
          <Button variant="outline" size="sm" onClick={() => { setForce(true); refetch().finally(() => setForce(false)); }}
                  disabled={isFetching}>
            <RefreshCcw className={`size-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            {t("modules.soliq.actions.refresh")}
          </Button>
        </div>
      </div>

      {/* Строка 2: Отчёты/Платежи слева · календарь по центру · колонки справа */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Сегмент-переключатель в стиле Chips (B2B Components): активный чёрный */}
        <div className="inline-flex gap-1.5">
          {(["reports", "payments"] as GridMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                mode === m
                  ? "bg-[#101010] text-white"
                  : "bg-[#F0F1F3] text-[#101010] hover:bg-[#E4E6E9]"
              }`}
            >
              {m === "reports" ? t("modules.soliq.page.modeReports") : t("modules.soliq.page.modePayments")}
            </button>
          ))}
        </div>
        <div className="mx-auto">
          <PeriodNav year={year} month={month}
                     onChange={(y, m) => { setYear(y); setMonth(m); setPage(1); }} />
        </div>
        <ColumnToggle groups={[
          { title: t("modules.soliq.page.groupMain"), columns: META_COLS, hidden: hiddenMeta, onToggle: toggleMeta },
          { title: t("modules.soliq.page.groupTaxes"), columns: TAX_COLUMNS, hidden: hiddenTax, onToggle: toggleTax },
        ]} />
      </div>

      {/* Long-fetch progress bar */}
      {isFetching && (
        <div className="h-1 w-full overflow-hidden rounded bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded bg-primary" />
        </div>
      )}

      {/* Status legend (reports mode) */}
      {mode === "reports" && (
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap text-xs text-muted-foreground">
          {STATUS_LEGEND.map((l) => (
            <span key={l.label} className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-full ${l.dot}`} /> {l.label}
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {t("modules.soliq.page.errorPrefix")}: {String(error)}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="[&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:font-medium hover:bg-transparent">
              <SortHead className="sticky left-0 bg-card z-10 min-w-[240px]" align="left"
                        active={sortKey === "company"} dir={sortDir}
                        onClick={() => toggleSort("company")}>{t("modules.soliq.grid.company")}</SortHead>
              <TableHead className="min-w-[110px]">{t("modules.soliq.grid.inn")}</TableHead>
              {metaCols.map((c) => {
                const sortable = c.key === "debt" || c.key === "turnover";
                const sk: SortKey | null = c.key === "debt" ? "debt" : c.key === "turnover" ? "turnover" : null;
                return sortable && sk ? (
                  <SortHead key={c.key} tip={c.tip} active={sortKey === sk} dir={sortDir}
                            onClick={() => toggleSort(sk)}>{c.label}</SortHead>
                ) : (
                  <ThTip key={c.key} tip={c.tip}>{c.label}</ThTip>
                );
              })}
              {taxCols.map((c) => (
                <ThTip key={c.key} tip={TAX_TIP_KEYS[c.key] ? t(TAX_TIP_KEYS[c.key]) : undefined} className="text-center">{c.label}</ThTip>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell className="sticky left-0 bg-card z-10">
                    <div className="flex items-center gap-1.5 pl-[22px]">
                      <div className="space-y-1.5"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-2.5 w-20" /></div>
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                  {metaCols.map((c) => (
                    <TableCell key={c.key} className="text-right"><Skeleton className="h-3.5 w-12 ml-auto" /></TableCell>
                  ))}
                  {taxCols.map((c) => (
                    <TableCell key={c.key}><Skeleton className="size-5 rounded-full mx-auto" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : sortedRows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={2 + metaCols.length + taxCols.length} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Inbox className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.soliq.page.noData")}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row, i) => (
                <Row key={row.inn} row={row} mode={mode} metaCols={metaCols} taxCols={taxCols} index={i}
                     onOpen={(id) => setOpenCompanyId(String(id))} />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Карточка компании — модалка в стиле B2B Components */}
      <Dialog open={!!openCompanyId} onOpenChange={(o) => !o && setOpenCompanyId(null)}>
        <DialogContent className="max-w-[960px]">
          <DialogTitle className="sr-only">{t("modules.soliq.nav.grid")}</DialogTitle>
          {openCompanyId && <SoliqCompanyDetailBody companyId={openCompanyId} />}
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {sortedRows.length > PAGE_SIZE && (
        <div className="flex items-center gap-2 justify-end text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage(page - 1)}>‹</Button>
          <span className="text-muted-foreground">
            {t("modules.soliq.page.pageOf", { page, total: pageCount })} · {t("modules.soliq.page.companyCount", { count: sortedRows.length })}
          </span>
          <Button variant="outline" size="sm" disabled={page >= pageCount}
                  onClick={() => setPage(page + 1)}>›</Button>
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

function ThTip({ tip, children, className }: {
  tip?: string; children: React.ReactNode; className?: string;
}) {
  const head = (
    <TableHead className={`text-right whitespace-nowrap ${className ?? ""}`}>{children}</TableHead>
  );
  if (!tip) return head;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{head}</TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

function SortHead({ active, dir, onClick, children, tip, align = "right", className }: {
  active: boolean; dir: "asc" | "desc"; onClick: () => void;
  children: React.ReactNode; tip?: string; align?: "left" | "right"; className?: string;
}) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  const inner = (
    <TableHead className={`whitespace-nowrap cursor-pointer select-none ${
      align === "right" ? "text-right" : ""} ${className ?? ""}`} onClick={onClick}>
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {children}
        <Icon className={`size-3.5 ${active ? "" : "opacity-40"}`} />
      </span>
    </TableHead>
  );
  if (!tip) return inner;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

const fullIdx = (key: string) => TAX_COLUMNS.findIndex((t) => t.key === key);

function Row({
  row, mode, metaCols, taxCols, index, onOpen,
}: {
  row: TaxGridRow;
  mode: GridMode;
  metaCols: { key: string; label: string; tip: string }[];
  taxCols: typeof TAX_COLUMNS;
  index: number;
  onOpen: (companyKey: string) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  // Derived arrays are aligned to the full TAX_COLUMNS order; index by key.
  const cells = useMemo(
    () => (mode === "reports" ? deriveReportStatuses(row.reports, row.payments) : null),
    [mode, row.reports, row.payments]
  );
  const sums = useMemo(
    () => (mode === "payments" ? derivePaymentSums(row.payments) : null),
    [mode, row.payments]
  );
  // Per-filial split is reports-only (payments aren't region-split upstream).
  const filials = useMemo(
    () => (mode === "reports" ? deriveFilialRows(row.reports ?? [], row.regions ?? []) : []),
    [mode, row.reports, row.regions]
  );
  const hasFilials = filials.length > 0;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
        style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
        onClick={() => onOpen(row.id != null ? String(row.id) : (row.company_uuid || row.inn))}
      >
        <TableCell className="sticky left-0 bg-card z-10 max-w-[280px]">
          <div className="flex items-start gap-1.5">
            {hasFilials ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                className="mt-0.5 size-4 shrink-0 text-muted-foreground hover:bg-transparent hover:text-foreground"
                title={t("modules.soliq.grid.filialCount", { count: filials.length })}
              >
                {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </Button>
            ) : <span className="w-4 shrink-0" />}
            <div className="min-w-0">
              <div className="font-medium truncate">{row.company_name ?? "—"}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                {row.tax_mode_name?.ru ?? row.tax_mode_name?.uz ?? ""}
                {row.is_vat_payer && <Badge variant="info" className="text-[10px] px-1 py-0">{t("modules.soliq.grid.vat")}</Badge>}
              </div>
            </div>
          </div>
        </TableCell>
        <TableCell className="tabular-nums text-xs">{row.inn}</TableCell>

        {metaCols.map((c) => (
          <TableCell key={c.key} className="text-right whitespace-nowrap">
            {c.key === "debt" && <DebtCell value={row.debt} />}
            {c.key === "advance" && <AdvanceCell value={row.advance} />}
            {c.key === "rating" && <RatingBadge rating={row.rating} points={row.rating_points} />}
            {c.key === "letters" && (
              row.unread_mail_count ? (
                <Badge variant="warning">{row.unread_mail_count}</Badge>
              ) : <span className="text-muted-foreground">0</span>
            )}
            {c.key === "didox" && (
              <span className="text-muted-foreground">{row.didox_docs_count ?? "—"}</span>
            )}
            {c.key === "turnover" && (
              // Turnover % is only meaningful for NON-VAT (oborot-tax) payers —
              // the 1 mlrd→VAT threshold doesn't apply once a firm is on QQS/НДС.
              row.is_vat_payer
                ? <span className="text-muted-foreground" title={t("modules.soliq.meta.vatNoLimit", { defaultValue: "QQS to'lovchi — aylanma limiti qo'llanmaydi" })}>—</span>
                : row.turnover_percent != null
                  ? <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`cursor-help ${Number(row.turnover_percent) > 80 ? "text-destructive" : ""}`}>
                          {Number(row.turnover_percent).toFixed(0)}%
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="text-xs space-y-0.5">
                          <div>{t("modules.soliq.meta.turnover", { defaultValue: "Aylanma" })}: <b>{Number(row.ytd_turnover ?? 0).toLocaleString("ru-RU")}</b> {t("modules.soliq.labels.soms", { defaultValue: "so'm" })}</div>
                          <div>{t("common.limit", { defaultValue: "Limit" })}: <b>{Number(row.turnover_limit ?? 0).toLocaleString("ru-RU")}</b> {t("modules.soliq.labels.soms", { defaultValue: "so'm" })}</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  : <span className="text-muted-foreground">—</span>
            )}
            {c.key === "k2" && <DebtCell value={row.bank_kartoteka_2} />}
          </TableCell>
        ))}

        {taxCols.map((c) => {
          const i = fullIdx(c.key);
          return (
            <TableCell key={c.key} className="text-center whitespace-nowrap">
              {mode === "reports" && cells
                ? <TaxStatusBadge cell={cells[i]} />
                : <PaySumCell value={sums ? sums[i] : null} />}
            </TableCell>
          );
        })}
      </TableRow>

      {expanded && filials.map((f) => (
        <TableRow key={f.key} className="bg-muted/30">
          <TableCell className="sticky left-0 bg-muted/30 z-10 max-w-[280px]">
            <div className="flex items-center gap-1.5 pl-6 text-xs">
              <span className="truncate text-muted-foreground">{f.label}</span>
              {f.isDefault && <Badge variant="muted" className="text-[10px] px-1 py-0">{t("modules.soliq.grid.main")}</Badge>}
            </div>
          </TableCell>
          <TableCell />
          {metaCols.map((c) => (
            <TableCell key={c.key} className="text-right whitespace-nowrap">
              {c.key === "debt" && <DebtCell value={f.debt} />}
              {c.key === "advance" && <AdvanceCell value={f.advance} />}
            </TableCell>
          ))}
          {taxCols.map((c) => (
            <TableCell key={c.key} className="text-center whitespace-nowrap">
              <TaxStatusBadge cell={f.cells[fullIdx(c.key)]} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}
