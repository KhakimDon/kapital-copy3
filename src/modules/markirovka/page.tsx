import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlNumber, useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";
import {
  Tag, RefreshCw, Search, ChevronLeft, ChevronRight, Copy, Check,
  FileText, Building2, Calendar, Hash, Package,
} from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  useKizs, money, fmtDate, SOURCE_META, statusMeta,
  type Kiz, type KizFilters,
} from "./api";

const PAGE = 50;

const SOURCE_CHIP_VALUES: KizFilters["source"][] = ["all", "didox", "soliq"];

export function MarkirovkaPage() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;
  const SOURCE_CHIPS: { value: KizFilters["source"]; label: string }[] = SOURCE_CHIP_VALUES.map((v) => ({
    value: v,
    label: v === "all" ? t("modules.markirovka.sources.all") : v === "didox" ? t("modules.markirovka.sources.didox") : t("modules.markirovka.sources.soliq"),
  }));

  const [sourceRaw, setSourceRaw] = useUrlState("source", "all");
  const source = sourceRaw as KizFilters["source"];
  const [dateFrom, setDateFromRaw] = useUrlState("from");
  const [dateTo, setDateToRaw] = useUrlState("to");
  const [qInput, q, setQInput] = useUrlSearch("q");
  const [page, setPage] = useUrlNumber("page", 0);
  const [selected, setSelected] = useState<Kiz | null>(null);

  const filters = useMemo<KizFilters>(
    () => ({
      source,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
      q: q || undefined,
      skip: page * PAGE,
      limit: PAGE,
    }),
    [source, dateFrom, dateTo, q, page]
  );

  const { data, isLoading, isFetching, refetch } = useKizs(companyId ?? 0, filters);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const counts = data?.source_counts ?? { didox: 0, soliq: 0 };
  const pages = Math.max(1, Math.ceil(total / PAGE));

  const setSourceP = (v: KizFilters["source"]) => { setSourceRaw(v); setPage(0); };
  const setDateFrom = (v: string) => { setDateFromRaw(v); setPage(0); };
  const setDateTo = (v: string) => { setDateToRaw(v); setPage(0); };

  function applySearch() {
    setQInput(qInput.trim());
    setPage(0);
  }

  if (!companyId)
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        {t("modules.markirovka.pickCompany")}
      </div>
    );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-end justify-between gap-3 flex-wrap border-b border-border">
        <h1 className="text-2xl font-semibold flex items-center gap-2 pb-2">
          <Tag className="size-6 text-primary" /> {t("modules.markirovka.title")}
        </h1>
        <div className="flex items-center gap-2 pb-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            {t("modules.markirovka.refresh")}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {SOURCE_CHIPS.map((c) => {
            const active = source === c.value;
            const badge =
              c.value === "didox" ? counts.didox
              : c.value === "soliq" ? counts.soliq
              : counts.didox + counts.soliq;
            return (
              <Button
                key={c.value}
                variant="ghost"
                onClick={() => setSourceP(c.value)}
                className={`h-auto gap-1.5 rounded-md border px-3 py-1.5 text-sm font-normal transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-foreground font-medium hover:bg-primary/10"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.label}
                <span className="text-xs text-muted-foreground">{badge}</span>
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <Calendar className="size-4 text-muted-foreground" />
          <DatePicker
            value={dateFrom}
            onChange={(v) => setDateFrom(v)}
            className="h-9 w-[150px]"
          />
          <span className="text-muted-foreground text-sm">—</span>
          <DatePicker
            value={dateTo}
            onChange={(v) => setDateTo(v)}
            className="h-9 w-[150px]"
          />
        </div>

        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applySearch()}
            placeholder={t("modules.markirovka.searchPlaceholder")}
            className="h-9 pl-8"
          />
        </div>
        <Button variant="secondary" size="sm" onClick={applySearch}>
          {t("modules.markirovka.search")}
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[280px]">{t("modules.markirovka.colKizCode")}</TableHead>
              <TableHead>{t("modules.markirovka.colProduct")}</TableHead>
              <TableHead>{t("modules.markirovka.colSupplier")}</TableHead>
              <TableHead>{t("modules.markirovka.colDate")}</TableHead>
              <TableHead>{t("modules.markirovka.colSource")}</TableHead>
              <TableHead className="text-right">{t("modules.markirovka.colQty")}</TableHead>
              <TableHead className="text-right">{t("modules.markirovka.colAmount")}</TableHead>
              <TableHead>{t("modules.markirovka.colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Table-shaped skeleton mirroring the 8 columns — seamless swap to real rows.
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-3.5 w-44" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                  <TableCell>
                    <div className="space-y-1.5"><Skeleton className="h-3.5 w-28" /><Skeleton className="h-2.5 w-16" /></div>
                  </TableCell>
                  <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-12 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Tag className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.markirovka.empty")}</div>
                    <div className="text-xs text-muted-foreground">{t("modules.markirovka.emptyHint")}</div>
                    {(q || source !== "all" || dateFrom || dateTo) && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSourceRaw("all"); setDateFromRaw(""); setDateToRaw("");
                          setQInput(""); setPage(0);
                        }}
                      >
                        {t("common.clear", { defaultValue: "Tozalash" })}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((k, i) => {
                const sm = SOURCE_META[k.source];
                const st = statusMeta(k.status);
                return (
                  <TableRow
                    key={`${k.source}-${k.doc_id}-${k.kiz_code}-${i}`}
                    className="cursor-pointer animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    onClick={() => setSelected(k)}
                  >
                    <TableCell className="font-mono text-xs truncate max-w-[280px]">
                      {k.kiz_code}
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {k.product_name || "—"}
                    </TableCell>
                    <TableCell className="max-w-[200px]">
                      <div className="truncate">{k.supplier_name || "—"}</div>
                      {k.supplier_tin && (
                        <div className="text-xs text-muted-foreground font-mono">
                          {k.supplier_tin}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(k.document_date)}</TableCell>
                    <TableCell>
                      <Badge variant={sm.variant}>{sm.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(k.qty)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(k.total)}</TableCell>
                    <TableCell>
                      <Badge variant={st.variant}>{st.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} / {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 0}
              onClick={() => setPage(Math.max(0, page - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2">
              {page + 1} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <KizDetail kiz={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function KizDetail({ kiz, onClose }: { kiz: Kiz | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const sm = kiz ? SOURCE_META[kiz.source] : null;
  const st = statusMeta(kiz?.status);

  function copy() {
    if (!kiz) return;
    navigator.clipboard?.writeText(kiz.kiz_code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <Sheet open={!!kiz} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Tag className="size-5 text-primary" /> {t("modules.markirovka.detailTitle")}
          </SheetTitle>
        </SheetHeader>
        {kiz && (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div>
              <div className="text-xs text-muted-foreground mb-1">{t("modules.markirovka.colKizCode")}</div>
              <div className="flex items-start gap-2">
                <code className="flex-1 break-all rounded bg-muted px-2 py-1.5 text-xs font-mono">
                  {kiz.kiz_code}
                </code>
                <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={copy}>
                  {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {sm && <Badge variant={sm.variant}>{sm.label}</Badge>}
              <Badge variant={st.variant}>{st.label}</Badge>
            </div>

            <dl className="space-y-3 text-sm">
              <Field icon={<Package className="size-4" />} label={t("modules.markirovka.colProduct")} value={kiz.product_name} />
              <Field
                icon={<Building2 className="size-4" />}
                label={t("modules.markirovka.colSupplier")}
                value={
                  kiz.supplier_name || kiz.supplier_tin
                    ? `${kiz.supplier_name ?? "—"}${kiz.supplier_tin ? ` (${kiz.supplier_tin})` : ""}`
                    : null
                }
              />
              <Field
                icon={<Calendar className="size-4" />}
                label={t("modules.markirovka.colDate")}
                value={fmtDate(kiz.document_date)}
              />
              <Field icon={<Hash className="size-4" />} label={t("modules.markirovka.colQty")} value={money(kiz.qty)} />
              <Field icon={<Hash className="size-4" />} label={t("modules.markirovka.unitPrice")} value={money(kiz.unit_price)} />
              <Field icon={<Hash className="size-4" />} label={t("modules.markirovka.colAmount")} value={money(kiz.total)} />
              <Field
                icon={<FileText className="size-4" />}
                label={t("modules.markirovka.docId")}
                value={kiz.doc_id}
                mono
              />
            </dl>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({
  icon, label, value, mono,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-muted-foreground mt-0.5">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className={`break-words ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</dd>
      </div>
    </div>
  );
}
