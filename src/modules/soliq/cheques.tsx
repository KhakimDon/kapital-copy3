import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCompany } from "@/shared/store/company";
import { useUrlNumber, useUrlState } from "@/shared/hooks/use-url-state";
import {
  useCheques, useChequesSummary, useChequesDailyTotals, useChequesSync,
  useChequesBankDeposit, useChequesExpiredTerminal, useChequesReportTerminals,
  useChequesTerminals,
  type DayTotal,
} from "./api";
import {
  CHECK_TYPES, CHECK_SUB_TYPES,
  type ChequeRow, type ZReportRow, type OfdReportRow, type ReportTerminal,
} from "./types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DateRangePicker, isoToDate, dateToIso, type DateRange,
} from "@/components/ui/date-range-picker";
import {
  RefreshCw, ChevronLeft, ChevronRight, SlidersHorizontal, MoreVertical, AlertTriangle, Receipt, Play,
} from "lucide-react";

// A cheque sync is fire-and-forget on the soliq service; remember the start
// time per company so a refresh keeps showing progress instead of the button.
const SYNC_KEY = (id: string | number) => `soliq:cheques:sync:${id}`;
const SYNC_WINDOW_MS = 10 * 60_000;


type PayMethod = "" | "0" | "1" | "2"; // card_types: 0 cash, 1 qr, 2 card

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), 1);
  const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { from: localIso(first), to: localIso(last) };
}
function localIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayIso(): string { return localIso(new Date()); }

export function SoliqChequesPage() {
  const { t } = useTranslation();
  const company = useCompany((s) => s.current);
  const init = monthRange();

  const [mode, setModeRaw] = useUrlState("tab", "cheques");
  const [dateFrom, setDateFrom] = useUrlState("from", init.from);
  const [dateTo, setDateTo] = useUrlState("to", init.to);
  const [selectedDay, setSelectedDay] = useUrlState("day", todayIso());
  const [terminal, setTerminalRaw] = useUrlState("terminal", "");
  const [payRaw, setPayRaw] = useUrlState("pay", "");
  const [page, setPage] = useUrlNumber("page", 1);
  const pay = payRaw as PayMethod;
  const size = 50;

  // Secondary filters (URL-persisted query state).
  const [checkType, setCheckTypeRaw] = useUrlState("checkType", "NKM_CHECK");
  const [subType, setSubTypeRaw] = useUrlState("subType", "SALE");
  const [paymentNo, setPaymentNoRaw] = useUrlState("checkNum", "");
  const [minAmount, setMinAmountRaw] = useUrlState("minAmount", "");
  const [maxAmount, setMaxAmountRaw] = useUrlState("maxAmount", "");
  const [minVat, setMinVatRaw] = useUrlState("minVat", "");
  const [maxVat, setMaxVatRaw] = useUrlState("maxVat", "");
  const [tin, setTinRaw] = useUrlState("tin", "");
  const [sortBy, setSortByRaw] = useUrlState("sort", "payment_date");
  const [sortOrder, setSortOrderRaw] = useUrlState("dir", "desc");
  // Ephemeral UI — keep local.
  const [showFilters, setShowFilters] = useState(false);

  const setMode = (v: string) => { setModeRaw(v); setPage(1); };
  const setTerminal = (v: string) => { setTerminalRaw(v); setPage(1); };
  const setPay = (v: PayMethod) => setPayRaw(v);
  const selectDay = (d: string) => { setSelectedDay(d); setPage(1); };
  const setCheckType = (v: string) => setCheckTypeRaw(v);
  const setSubType = (v: string) => setSubTypeRaw(v);
  const setPaymentNo = (v: string) => setPaymentNoRaw(v);
  const setMinAmount = (v: string) => setMinAmountRaw(v);
  const setMaxAmount = (v: string) => setMaxAmountRaw(v);
  const setMinVat = (v: string) => setMinVatRaw(v);
  const setMaxVat = (v: string) => setMaxVatRaw(v);
  const setTin = (v: string) => setTinRaw(v);
  const setSortBy = (v: string) => setSortByRaw(v);
  const setSortOrder = (v: string) => setSortOrderRaw(v);

  const [selected, setSelected] = useState<ChequeRow | null>(null);

  const companyId = company?.id ?? null;

  const secondaryActive =
    (checkType !== "NKM_CHECK" ? 1 : 0) + (subType !== "SALE" ? 1 : 0) +
    [paymentNo, minAmount, maxAmount, minVat, maxVat, tin].filter(Boolean).length;

  const listParams = {
    date_from: selectedDay, date_to: selectedDay,
    ...(terminal && { terminal_id: terminal }),
    ...(checkType !== "NKM_CHECK" && { check_type: checkType }),
    ...(subType && { check_sub_type: subType }),
    ...(paymentNo && { payment_no: paymentNo }),
    ...(minAmount && { min_amount: Number(minAmount) }),
    ...(maxAmount && { max_amount: Number(maxAmount) }),
    ...(minVat && { min_vat: Number(minVat) }),
    ...(maxVat && { max_vat: Number(maxVat) }),
    ...(tin && { tin }),
    ...(pay && { card_types: pay }),
    sort_by: sortBy, sort_order: sortOrder,
    page, size,
  };

  const { data, isLoading } = useCheques(companyId, { ...listParams, mode });
  // The terminal filter must reach the KPI cards and the day tabs too — without
  // it the header showed company-wide totals next to a terminal-filtered list.
  const termFilter = terminal ? { terminal_id: terminal } : {};
  const { data: summary } = useChequesSummary(companyId, { date_from: selectedDay, date_to: selectedDay, ...termFilter });
  const { data: daily } = useChequesDailyTotals(companyId, { date_from: dateFrom, date_to: dateTo, ...termFilter });
  const { data: bankDeposit } = useChequesBankDeposit(companyId, { date_from: selectedDay, date_to: selectedDay, ...termFilter });
  const { data: expired } = useChequesExpiredTerminal(companyId);
  // The company's cash registers, for the TERMINAL filter dropdown.
  // Shape: {terminals: [{terminal_id, sale_point_name, sale_point_address, ...}]}
  const { data: termData } = useChequesTerminals(companyId);
  const terminals = ((termData?.terminals ?? termData?.data ?? []) as any[]);
  const sync = useChequesSync();
  const qc = useQueryClient();

  const visibleRows = data?.items ?? [];

  // Cheque fetch is fire-and-forget on the soliq service (it backfills ~60 days on
  // the first run) and there is no server progress endpoint, so we remember WHEN a
  // sync was started. Keeping it in localStorage (not React state) means a page
  // refresh still shows "Yig'ilmoqda…" instead of offering the start button again.
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!companyId) return;
    const started = Number(localStorage.getItem(SYNC_KEY(companyId)) || 0);
    setSyncing(!!started && Date.now() - started < SYNC_WINDOW_MS);
  }, [companyId]);

  const stopSync = () => {
    if (companyId) localStorage.removeItem(SYNC_KEY(companyId));
    setSyncing(false);
  };
  const doSync = (force?: boolean) => {
    if (!company) return;
    setSyncMsg(null);
    sync.mutate(
      { companyId: company.id, force_refetch: force },
      {
        onSuccess: (d: any) => {
          if (d && d.matched_subscriptions === 0) {
            setSyncMsg(t("modules.soliq.cheques.noSubscription", { defaultValue: "Bu korxonada soliq (NKM) obunasi yo'q" }));
            return;
          }
          localStorage.setItem(SYNC_KEY(company.id), String(Date.now()));
          setSyncing(true);
        },
      },
    );
  };
  // While a sync is in flight, poll so the cards fill in as rows land.
  useEffect(() => {
    if (!syncing || !companyId) return;
    const started = Number(localStorage.getItem(SYNC_KEY(companyId)) || 0);
    const left = Math.max(0, SYNC_WINDOW_MS - (Date.now() - started));
    const stop = setTimeout(stopSync, left);
    const id = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["soliq", "cheques", companyId] });
    }, 10_000);
    return () => { clearInterval(id); clearTimeout(stop); };
  }, [syncing, qc, companyId]);
  // Cheques arrived → the fetch produced data, drop the pill.
  useEffect(() => {
    if (syncing && visibleRows.length > 0) stopSync();
  }, [syncing, visibleRows.length]);

  const resetSecondary = () => {
    setCheckType("NKM_CHECK"); setSubType("SALE"); setPaymentNo("");
    setMinAmount(""); setMaxAmount(""); setMinVat(""); setMaxVat(""); setTin("");
    setSortBy("payment_date"); setSortOrder("desc"); setPage(1);
  };

  const bankDepositInfo = extractBankDeposit(bankDeposit);

  if (!company) return <p className="text-muted-foreground">{t("modules.soliq.common.pickCompanyFirst")}</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold">{t("modules.soliq.cheques.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("modules.soliq.cheques.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowFilters((v) => !v)}>
            <SlidersHorizontal className="size-4 mr-2" /> {t("modules.soliq.cheques.filters")}
            {secondaryActive > 0 && <Badge variant="info" className="ml-2">{secondaryActive}</Badge>}
          </Button>
          {syncing && (
            <span className="inline-flex items-center gap-1.5 text-xs text-primary">
              <RefreshCw className="size-3.5 animate-spin" />
              {t("modules.soliq.cheques.syncing", { defaultValue: "Yig'ilmoqda…" })}
            </span>
          )}
          {syncMsg && <span className="text-xs text-warning">{syncMsg}</span>}
          <Button variant="outline" size="sm"
                  onClick={() => doSync(false)}
                  disabled={sync.isPending || syncing}>
            <RefreshCw className={`size-4 mr-2 ${sync.isPending || syncing ? "animate-spin" : ""}`} />
            {t("modules.soliq.actions.refresh")}
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon"><MoreVertical className="size-4" /></Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2">
              <Button type="button" variant="ghost"
                onClick={() => doSync(true)}
                disabled={sync.isPending || syncing}
                className="w-full h-auto flex-col items-start gap-0 px-2 py-2 rounded font-normal hover:bg-secondary/60">
                <div className="font-medium text-sm">{t("modules.soliq.cheques.forceReloadTitle")}</div>
                <div className="text-xs text-muted-foreground whitespace-normal text-left">
                  {t("modules.soliq.cheques.forceReloadHint")}
                </div>
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Expired-terminals indicator */}
      <ExpiredIndicator data={expired} />

      <Tabs value={mode} onValueChange={(v) => setMode(v)}>
        <TabsList>
          <TabsTrigger value="cheques">{t("modules.soliq.cheques.tabCheques")}</TabsTrigger>
          <TabsTrigger value="z-reports">{t("modules.soliq.cheques.tabZReports")}</TabsTrigger>
          <TabsTrigger value="ofd-reports">{t("modules.soliq.cheques.tabOfdReports")}</TabsTrigger>
        </TabsList>

        {/* ===== Tab 1: cheques ===== */}
        <TabsContent value="cheques" className="space-y-4">
          {/* Primary filter bar */}
          <Card>
            <CardContent className="pt-4 flex items-end gap-4 flex-wrap">
              <Field label={t("modules.soliq.cheques.period")}>
                <DateRangePicker
                  value={{ from: isoToDate(dateFrom), to: isoToDate(dateTo) }}
                  onChange={(r: DateRange | undefined) => {
                    if (r?.from) setDateFrom(dateToIso(r.from)!);
                    if (r?.to) setDateTo(dateToIso(r.to)!);
                  }} />
              </Field>
              <Field label={t("modules.soliq.cheques.terminal")} className="flex-1 min-w-[200px]">
                <Select value={terminal || "__all"} onValueChange={(v) => setTerminal(v === "__all" ? "" : v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("modules.soliq.cheques.allTerminals")} />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="__all">{t("modules.soliq.cheques.allTerminals")}</SelectItem>
                    {terminals.map((tm, i) => {
                      const tid = String(tm.terminal_id ?? tm.terminalId ?? "");
                      const name = tm.sale_point_name ?? tm.salePointName;
                      return tid ? (
                        <SelectItem key={tid || i} value={tid}>{tid}{name ? ` — ${name}` : ""}</SelectItem>
                      ) : null;
                    })}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t("modules.soliq.cheques.payMethod")}>
                <div className="flex items-center gap-1">
                  {([
                    ["", t("modules.soliq.cheques.payAll")],
                    ["0", t("modules.soliq.cheques.payCash")],
                    ["1", t("modules.soliq.cheques.payQr")],
                    ["2", t("modules.soliq.cheques.payCard")],
                  ] as const).map(([v, l]) => (
                    <Button key={v} size="sm" variant={pay === v ? "default" : "outline"}
                            onClick={() => setPay(v as PayMethod)}>
                      {l}
                    </Button>
                  ))}
                </div>
              </Field>
            </CardContent>
          </Card>

          {/* Secondary filter panel */}
          {showFilters && (
            <Card>
              <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label={t("modules.soliq.cheques.checkType")}>
                  <SimpleSelect value={checkType} onChange={(v) => { setCheckType(v); setPage(1); }}
                                options={CHECK_TYPES} />
                </Field>
                <Field label={t("modules.soliq.cheques.subType")}>
                  <SimpleSelect value={subType} onChange={(v) => { setSubType(v); setPage(1); }}
                                options={CHECK_SUB_TYPES} />
                </Field>
                <Field label={t("modules.soliq.cheques.checkNum")}>
                  <Input value={paymentNo} onChange={(e) => { setPaymentNo(e.target.value); setPage(1); }} />
                </Field>
                <Field label={t("modules.soliq.cheques.counterpartyTin")}>
                  <Input value={tin} onChange={(e) => { setTin(e.target.value); setPage(1); }} />
                </Field>
                <Field label={t("modules.soliq.cheques.amountFrom")}>
                  <Input type="number" value={minAmount} placeholder="0"
                         onChange={(e) => { setMinAmount(e.target.value); setPage(1); }} />
                </Field>
                <Field label={t("modules.soliq.cheques.amountTo")}>
                  <Input type="number" value={maxAmount} placeholder="∞"
                         onChange={(e) => { setMaxAmount(e.target.value); setPage(1); }} />
                </Field>
                <Field label={t("modules.soliq.cheques.vatFrom")}>
                  <Input type="number" value={minVat}
                         onChange={(e) => { setMinVat(e.target.value); setPage(1); }} />
                </Field>
                <Field label={t("modules.soliq.cheques.vatTo")}>
                  <Input type="number" value={maxVat}
                         onChange={(e) => { setMaxVat(e.target.value); setPage(1); }} />
                </Field>
                <Field label={t("modules.soliq.cheques.sortBy")}>
                  <SimpleSelect value={sortBy} onChange={(v) => { setSortBy(v); setPage(1); }}
                    options={[
                      { value: "payment_date", label: t("modules.soliq.cheques.sortSaleDate") },
                      { value: "total", label: t("modules.soliq.cheques.sortTotal") },
                      { value: "cash_total", label: t("modules.soliq.cheques.payCash") },
                      { value: "card_total", label: t("modules.soliq.cheques.payCard") },
                      { value: "vat_total", label: t("modules.soliq.cheques.vat") },
                    ]} />
                </Field>
                <Field label={t("modules.soliq.cheques.sortOrder")}>
                  <SimpleSelect value={sortOrder} onChange={(v) => { setSortOrder(v); setPage(1); }}
                    options={[
                      { value: "desc", label: t("modules.soliq.cheques.sortDesc") },
                      { value: "asc", label: t("modules.soliq.cheques.sortAsc") },
                    ]} />
                </Field>
                <div className="col-span-full flex justify-end">
                  <Button variant="ghost" size="sm" onClick={resetSecondary}>{t("modules.soliq.cheques.clearFilters")}</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Daily totals strip */}
          <DailyStrip days={daily?.days ?? []} selected={selectedDay} onSelect={selectDay} />

          {/* Summary tiles + bank deposit */}
          {summary ? (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 animate-in fade-in-0 duration-300">
              <SummaryCard label={t("modules.soliq.cheques.summaryCount")} value={summary.count} plain />
              <SummaryCard label={t("modules.soliq.cheques.payCash")} value={summary.cash} />
              <SummaryCard label={t("modules.soliq.cheques.payCard")} value={summary.card} />
              <SummaryCard label={t("modules.soliq.cheques.vat")} value={summary.vat} />
              <SummaryCard label={t("modules.soliq.cheques.summaryTotal")} value={summary.gross} highlight />
              <SummaryCard label={t("modules.soliq.cheques.bankDeposit")} value={bankDepositInfo.deposit} />
              <SummaryCard label={t("modules.soliq.cheques.bankCommission")} value={bankDepositInfo.commission} />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("modules.soliq.cheques.selectedDay")}:</span>
            <Badge variant="info">{fmtDate(selectedDay)}</Badge>
            {data && <span className="text-muted-foreground">· {t("modules.soliq.cheques.chequeCount", { count: data.count })}</span>}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-44 w-full animate-in fade-in-0 duration-300" />
              ))}
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 text-center py-16 animate-in fade-in-50 zoom-in-95 duration-300">
              <div className="size-14 rounded-full bg-muted grid place-items-center">
                {syncing ? <RefreshCw className="size-7 text-primary animate-spin" /> : <Receipt className="size-7 text-muted-foreground" />}
              </div>
              {syncing ? (
                <div className="text-sm font-medium text-foreground">
                  {t("modules.soliq.cheques.syncingLong", { defaultValue: "Cheklar soliq.uz'dan yig'ilmoqda, kuting…" })}
                </div>
              ) : (
                <>
                  <div className="text-sm font-medium text-foreground">{t("modules.soliq.page.noData")}</div>
                  <div className="text-xs text-muted-foreground max-w-xs">
                    {t("modules.soliq.cheques.emptyHint", { defaultValue: "Soliq.uz'dan kassa cheklarini yig'ish uchun «Jarayonni boshlash» tugmasini bosing." })}
                  </div>
                  {syncMsg && <div className="text-xs text-warning">{syncMsg}</div>}
                  <Button size="sm" className="mt-1" onClick={() => doSync(false)} disabled={sync.isPending}>
                    <Play className="size-4 mr-1" />
                    {t("modules.soliq.cheques.bfStart", { defaultValue: "Jarayonni boshlash" })}
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {visibleRows.map((r, i) => (
                <div key={String(r.id)}
                     className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                     style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <ChequeCard row={r} onOpen={() => setSelected(r)} />
                </div>
              ))}
            </div>
          )}

          <Pager page={page} size={size} total={data?.count ?? 0} onPage={setPage} />
        </TabsContent>

        {/* ===== Tab 2: Z-reports ===== */}
        <TabsContent value="z-reports" className="space-y-4">
          <ZReportsTab companyId={companyId} sync={sync.isPending} />
        </TabsContent>

        {/* ===== Tab 3: OFD-reports ===== */}
        <TabsContent value="ofd-reports" className="space-y-4">
          <OfdReportsTab companyId={companyId} defaultFrom={dateFrom} defaultTo={dateTo} />
        </TabsContent>
      </Tabs>

      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right">
          <SheetHeader>
            <SheetTitle>{t("modules.soliq.cheques.chequeNum", { num: selected?.payment_no ?? "—" })}</SheetTitle>
          </SheetHeader>
          {selected && <ChequeDetail row={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ====================== Z-reports tab =======================================

function ZReportsTab({ companyId, sync }: { companyId: string | number | null; sync: boolean }) {
  const { t } = useTranslation();
  const [checkType, setCheckType] = useState("NKM_CHECK");
  const [zMode, setZMode] = useState("Z_HISOBOT");
  const [page, setPage] = useState(1);
  const size = 12;

  const { data, isLoading } = useCheques(companyId, {
    mode: "z-reports", check_type: checkType, check_sub_type: "SALE",
    ...(zMode === "KOMISSIONER" && { as_commission: true }),
    page, size,
  });
  const rows = (data?.items ?? []) as unknown as ZReportRow[];
  // Z/OFD report rows arrive raw; use the row.raw payload from the cheque mapper.
  const reports = (data?.items ?? []).map((r) => (r.raw ?? r)) as ZReportRow[];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 flex items-end gap-4 flex-wrap">
          <Field label={t("modules.soliq.cheques.checkType")}>
            <SimpleSelect value={checkType} onChange={(v) => { setCheckType(v); setPage(1); }}
                          options={CHECK_TYPES} />
          </Field>
          <Field label={t("modules.soliq.cheques.mode")}>
            <SimpleSelect value={zMode} onChange={(v) => { setZMode(v); setPage(1); }}
              options={[
                { value: "Z_HISOBOT", label: t("modules.soliq.cheques.zReport") },
                { value: "KOMISSIONER", label: t("modules.soliq.cheques.komissioner") },
              ]} />
          </Field>
        </CardContent>
      </Card>

      {isLoading || sync ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full animate-in fade-in-0 duration-300" />)}</div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 text-center py-16 animate-in fade-in-50 zoom-in-95 duration-300">
          <div className="size-14 rounded-full bg-muted grid place-items-center">
            <Receipt className="size-7 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium text-foreground">{t("modules.soliq.cheques.reportsEmpty")}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r, i) => (
            <div key={i} className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                 style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
              <ZReportCard r={r} />
            </div>
          ))}
        </div>
      )}
      <Pager page={page} size={size} total={data?.count ?? 0} onPage={setPage} />
      {/* silence unused rows var without changing data flow */}
      <span className="hidden">{rows.length}</span>
    </div>
  );
}

function ZReportCard({ r }: { r: ZReportRow }) {
  const { t } = useTranslation();
  const term = r.terminalId ?? r.terminal_id ?? "—";
  const open = fmtDateTime(r.openTime ?? r.open_time);
  const close = fmtDateTime(r.closeTime ?? r.close_time);
  const firstSeq = r.firstReceiptSeq ?? r.first_receipt_seq ?? "—";
  const lastSeq = r.lastReceiptSeq ?? r.last_receipt_seq ?? "—";
  const saleCash = fmt(r.totalSaleCash ?? r.total_sale_cash);
  const saleCard = fmt(r.totalSaleCard ?? r.total_sale_card);
  const refundCash = fmt(r.totalRefundCash ?? r.total_refund_cash);
  const refundCard = fmt(r.totalRefundCard ?? r.total_refund_card);
  const saleCount = r.totalSaleCount ?? r.total_sale_count ?? 0;
  const refundCount = r.totalRefundCount ?? r.total_refund_count ?? 0;
  return (
    <div className="rounded-2xl border border-[#F0F1F3] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="tabular-nums text-sm font-medium">{term}</div>
          <div className="text-xs text-muted-foreground">{open} — {close}</div>
        </div>
        <div className="text-xs text-muted-foreground">{t("modules.soliq.cheques.cheques")}: {firstSeq} — {lastSeq}</div>
      </div>
      <div className="border-t mt-2 pt-2 text-sm grid grid-cols-2 gap-1">
        <span>{t("modules.soliq.cheques.sale")}: <b>{saleCash}</b> / {saleCard} ({saleCount})</span>
        <span className="text-muted-foreground">{t("modules.soliq.cheques.refund")}: {refundCash} / {refundCard} ({refundCount})</span>
      </div>
    </div>
  );
}

// ====================== OFD-reports tab =====================================

function OfdReportsTab({ companyId, defaultFrom, defaultTo }: {
  companyId: string | number | null; defaultFrom: string; defaultTo: string;
}) {
  const { t } = useTranslation();
  const [checkType, setCheckType] = useState("NKM_CHECK");
  const [ofdMode, setOfdMode] = useState("TERMINAL");
  const [terminal, setTerminal] = useState("");
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [page, setPage] = useState(1);
  const size = 12;

  const { data: termData } = useChequesReportTerminals(companyId, checkType);
  const terminals = ((termData?.data ?? termData?.terminals ?? []) as ReportTerminal[]);

  const { data, isLoading } = useCheques(companyId, {
    mode: ofdMode === "TERMINAL" ? "ofd-terminal-reports" : "ofd-reports",
    check_type: checkType, check_sub_type: "SALE",
    ...(ofdMode === "KOMISSIONER" && { as_commission: true }),
    ...(ofdMode !== "TERMINAL" && { mode2: "monthly" }),
    ...(terminal && { terminal_id: terminal }),
    date_from: from, date_to: to, page, size,
  });
  const reports = (data?.items ?? []).map((r) => (r.raw ?? r)) as OfdReportRow[];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4 flex items-end gap-4 flex-wrap">
          <Field label={t("modules.soliq.cheques.checkType")}>
            <SimpleSelect value={checkType} onChange={(v) => { setCheckType(v); setPage(1); }}
                          options={CHECK_TYPES} />
          </Field>
          <Field label={t("modules.soliq.cheques.mode")}>
            <SimpleSelect value={ofdMode} onChange={(v) => { setOfdMode(v); setPage(1); }}
              options={[
                { value: "TERMINAL", label: t("modules.soliq.cheques.terminal") },
                { value: "MAHSULOT", label: t("modules.soliq.cheques.product") },
                { value: "KOMISSIONER", label: t("modules.soliq.cheques.komissioner") },
              ]} />
          </Field>
          <Field label={t("modules.soliq.cheques.terminal")} className="min-w-[220px]">
            <Select value={terminal || "__all"} onValueChange={(v) => { setTerminal(v === "__all" ? "" : v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder={t("modules.soliq.cheques.allTerminals")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">{t("modules.soliq.cheques.allTerminals")}</SelectItem>
                {terminals.map((tm, i) => {
                  const tid = String(tm.terminalId ?? tm.terminal_id ?? "");
                  const name = tm.salePointName ?? tm.sale_point_name;
                  return tid ? (
                    <SelectItem key={i} value={tid}>{tid}{name ? ` — ${name}` : ""}</SelectItem>
                  ) : null;
                })}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("modules.soliq.cheques.dateFrom")}>
            <DatePicker value={from} onChange={(v) => { setFrom(v); setPage(1); }} />
          </Field>
          <Field label={t("modules.soliq.cheques.dateTo")}>
            <DatePicker value={to} onChange={(v) => { setTo(v); setPage(1); }} />
          </Field>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full animate-in fade-in-0 duration-300" />)}</div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 text-center py-16 animate-in fade-in-50 zoom-in-95 duration-300">
          <div className="size-14 rounded-full bg-muted grid place-items-center">
            <Receipt className="size-7 text-muted-foreground" />
          </div>
          <div className="text-sm font-medium text-foreground">{t("modules.soliq.cheques.reportsEmpty")}</div>
        </div>
      ) : (
        <div className="space-y-2">
          {reports.map((r, i) => (
            <div key={i} className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                 style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
              <OfdReportCard r={r} />
            </div>
          ))}
        </div>
      )}
      <Pager page={page} size={size} total={data?.count ?? 0} onPage={setPage} />
    </div>
  );
}

function OfdReportCard({ r }: { r: OfdReportRow }) {
  const { t } = useTranslation();
  const term = r.terminalId ?? r.terminal_id ?? "";
  const period = r.year && r.month ? `${r.year}-${String(r.month).padStart(2, "0")}` : "";
  const date = r.paymentDate ?? r.payment_date ?? "";
  return (
    <div className="rounded-2xl border border-[#F0F1F3] bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          {term && <div className="tabular-nums text-sm font-medium">{term}</div>}
          <div className="text-xs text-muted-foreground">{period || date || "—"}</div>
        </div>
        <div className="text-xs text-muted-foreground">{t("modules.soliq.cheques.count")}: {r.count ?? 0}</div>
      </div>
      <div className="border-t mt-2 pt-2 text-sm">
        <div className="font-medium">{t("modules.soliq.cheques.summaryTotal")}: {fmt(r.total)}</div>
        <div className="text-xs text-muted-foreground">
          {t("modules.soliq.cheques.payCash")}: {fmt(r.cashTotal ?? r.cash_total)} · {t("modules.soliq.cheques.payCard")}: {fmt(r.cardTotal ?? r.card_total)} ·
          {" "}{t("modules.soliq.cheques.vat")}: {fmt(r.vatTotal ?? r.vat_total)} · {t("modules.soliq.cheques.refund")}: {fmt(r.refundTotal ?? r.refund_total)}
        </div>
      </div>
    </div>
  );
}

// ====================== Expired-terminals indicator ==========================

function ExpiredIndicator({ data }: { data?: Record<string, unknown> }) {
  const { t } = useTranslation();
  const d = (data?.data ?? data) as Record<string, unknown> | undefined;
  if (!d) return null;
  const hasExpired = (d.has_expired ?? d.hasExpired) as boolean | undefined;
  if (hasExpired === undefined) return null;
  const reason = d.reason_text as { ru?: string; uz_latn?: string } | string | undefined;
  const text = typeof reason === "string" ? reason
    : reason?.ru || reason?.uz_latn
    || (hasExpired ? t("modules.soliq.cheques.expiredHas") : t("modules.soliq.cheques.expiredNone"));
  if (!hasExpired) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/15 px-3 py-2 text-sm">
      <AlertTriangle className="size-4 text-warning" />
      <span className="text-warning">{text}</span>
    </div>
  );
}

// ====================== shared helpers ======================================

function extractBankDeposit(data?: Record<string, unknown>): { deposit?: number; commission?: number } {
  if (!data) return {};
  const d = (data.data ?? data) as Record<string, unknown>;
  const num = (...keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = d[k];
      if (v != null && !isNaN(Number(v))) return Number(v);
    }
    return undefined;
  };
  return {
    deposit: num("deposit", "total_deposit", "bank_deposit", "amount"),
    commission: num("commission", "total_commission", "bank_commission"),
  };
}

function Pager({ page, size, total, onPage }: {
  page: number; size: number; total: number; onPage: (p: number) => void;
}) {
  const { t } = useTranslation();
  if (total <= size) return null;
  return (
    <div className="flex items-center gap-2 justify-end text-sm">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</Button>
      <span className="text-muted-foreground">
        {t("modules.soliq.page.pageOf", { page, total: Math.ceil(total / size) })} · {t("modules.soliq.pagination.itemCount", { count: total })}
      </span>
      <Button variant="outline" size="sm" disabled={page * size >= total} onClick={() => onPage(page + 1)}>›</Button>
    </div>
  );
}

function SimpleSelect({ value, onChange, options }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ---- Daily totals horizontal strip -----------------------------------------

function DailyStrip({ days, selected, onSelect }: {
  days: DayTotal[]; selected: string; onSelect: (date: string) => void;
}) {
  const { t } = useTranslation();
  const WD = [
    t("modules.soliq.weekdays.sun"), t("modules.soliq.weekdays.mon"),
    t("modules.soliq.weekdays.tue"), t("modules.soliq.weekdays.wed"),
    t("modules.soliq.weekdays.thu"), t("modules.soliq.weekdays.fri"),
    t("modules.soliq.weekdays.sat"),
  ];
  const scroller = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateArrows = () => {
    const el = scroller.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };
  useEffect(() => {
    updateArrows();
    const el = scroller.current;
    if (!el) return;
    el.addEventListener("scroll", updateArrows, { passive: true });
    window.addEventListener("resize", updateArrows);
    return () => {
      el.removeEventListener("scroll", updateArrows);
      window.removeEventListener("resize", updateArrows);
    };
  }, [days.length]);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const node = el.querySelector<HTMLElement>(`[data-day="${selected}"]`);
    if (node) node.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected, days.length]);

  const slide = (dir: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8), behavior: "smooth" });
  };
  if (!days.length) return null;

  return (
    <div className="flex items-stretch gap-2">
      <Button variant="outline" size="icon" className="shrink-0 self-stretch h-auto w-9"
              onClick={() => slide(-1)} disabled={!canPrev}><ChevronLeft className="size-4" /></Button>
      <div ref={scroller} className="flex items-stretch gap-1 overflow-x-hidden scroll-smooth flex-1">
        {days.map((d) => {
          const dt = new Date(d.date);
          const has = d.total > 0;
          const isSel = d.date === selected;
          return (
            <Button key={d.date} data-day={d.date} type="button" variant="outline" onClick={() => onSelect(d.date)}
                 className={`shrink-0 w-28 h-auto flex-col items-stretch gap-0 rounded-md border p-2 text-center transition-colors
                   ${isSel ? "border-primary ring-2 ring-primary bg-primary/5 hover:bg-primary/5"
                      : has ? "bg-card border-border hover:bg-muted" : "bg-muted/30 border-border hover:bg-muted"}`}>
              <div className={`text-xs font-normal ${isSel ? "text-primary font-medium" : "text-muted-foreground"}`}>
                {dt.getDate()} {WD[dt.getDay()]}
              </div>
              <div className={`text-sm font-semibold mt-1 tabular-nums ${has ? "text-success" : "text-muted-foreground"}`}>
                {has ? d.total.toLocaleString("ru-RU") : "—"}
              </div>
            </Button>
          );
        })}
      </div>
      <Button variant="outline" size="icon" className="shrink-0 self-stretch h-auto w-9"
              onClick={() => slide(1)} disabled={!canNext}><ChevronRight className="size-4" /></Button>
    </div>
  );
}

function SummaryCard({ label, value, highlight, plain }: {
  label: string; value?: number | null; highlight?: boolean; plain?: boolean;
}) {
  return (
    // KB-плитка: серый фон, активная — фиолетовая (стиль дашборда «Касса»).
    <Card className={highlight ? "bg-primary text-primary-foreground" : "bg-[#F7F8F9]"}>
      <CardContent className="pt-4 pb-3">
        <div className={`text-[13px] font-medium ${highlight ? "text-primary-foreground/80" : "text-[#83888B]"}`}>
          {label}
        </div>
        <div className="mt-1 text-[18px] font-bold tabular-nums">
          {value != null ? Number(value).toLocaleString("ru-RU", { maximumFractionDigits: plain ? 0 : 2 }) : "—"}
        </div>
      </CardContent>
    </Card>
  );
}

function ChequeCard({ row, onOpen }: { row: ChequeRow; onOpen: () => void }) {
  const { t } = useTranslation();
  const raw = row.raw ?? {};
  const items: any[] = (raw as any).details ?? [];
  const preview = items.slice(0, 2);
  const extra = items.length - preview.length;
  const refund = !!(raw as any).is_refund;
  return (
    <div className={`rounded-2xl border border-[#F0F1F3] bg-white p-4 flex flex-col gap-2 hover:shadow-md transition-shadow
      ${refund ? "border-destructive/60" : ""}`}>
      <div className="flex items-start justify-between">
        <div className="text-[10px] tabular-nums text-muted-foreground truncate">{row.terminal_id ?? "—"}</div>
        {refund && <Badge variant="danger" className="text-[10px]">{t("modules.soliq.cheques.refund")}</Badge>}
      </div>
      <div>
        <div className="font-semibold">№ {row.payment_no ?? "—"}</div>
        <div className="text-xs text-muted-foreground">{fmtDateTime(row.payment_date)}</div>
      </div>
      <div className="border-t pt-2 text-xs space-y-0.5 min-h-[44px]">
        {preview.map((it, i) => <div key={i} className="truncate">{i + 1}. {it.name ?? "—"}</div>)}
        {extra > 0 && <div className="text-muted-foreground">{t("modules.soliq.cheques.extraItems", { count: extra })}</div>}
        {items.length === 0 && <div className="text-muted-foreground">—</div>}
      </div>
      <div className="border-t pt-2 flex items-end justify-between">
        <div>
          <div className="font-semibold">{fmt(row.total)} {t("modules.soliq.cheques.soms")}</div>
          <div className="text-[11px] text-muted-foreground">{t("modules.soliq.cheques.vat")}: {fmt(row.vat_total)}</div>
        </div>
        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onOpen}>{t("modules.soliq.cheques.details")}</Button>
      </div>
    </div>
  );
}

function ChequeDetail({ row }: { row: ChequeRow }) {
  const { t } = useTranslation();
  const raw = row.raw ?? {};
  const items: any[] = (raw as any).details ?? [];
  return (
    <div className="space-y-4 mt-4 text-sm">
      <Section title={t("modules.soliq.cheques.sectionCheque")}>
        <KV k={t("modules.soliq.cheques.fieldNum")} v={row.payment_no} />
        <KV k={t("modules.soliq.cheques.terminal")} v={row.terminal_id} />
        <KV k={t("modules.soliq.taxPayments.fieldDate")} v={fmtDateTime(row.payment_date)} />
        <KV k={t("modules.soliq.cheques.fieldType")} v={`${row.check_type ?? ""} / ${row.check_sub_type ?? ""}`} />
      </Section>
      {items.length > 0 && (
        <Section title={t("modules.soliq.cheques.sectionItems", { count: items.length })}>
          <Table>
            <TableHeader><TableRow>
              <TableHead>№</TableHead>
              <TableHead>{t("modules.soliq.profileTab.name")}</TableHead>
              <TableHead>{t("modules.soliq.cheques.mxik")}</TableHead>
              <TableHead className="text-right">{t("modules.soliq.cheques.qty")}</TableHead>
              <TableHead className="text-right">{t("modules.soliq.cheques.price")}</TableHead>
              <TableHead className="text-right">{t("modules.soliq.cheques.vat")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {items.map((it, i) => (
                <TableRow key={i}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell className="text-xs">{it.name ?? "—"}</TableCell>
                  <TableCell className="tabular-nums text-[10px]">{it.productCode ?? it.packageCode ?? it.barCode ?? "—"}</TableCell>
                  <TableCell className="text-right">{it.amount ?? "—"}</TableCell>
                  <TableCell className="text-right">{fmt(it.price)}</TableCell>
                  <TableCell className="text-right">{fmt(it.vat)} <small>({it.vatPercent ?? 0}%)</small></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}
      <Section title={t("modules.soliq.cheques.sectionSummary")}>
        <div className="grid grid-cols-2 gap-2">
          <Stat label={t("modules.soliq.cheques.payCash")} v={fmt(row.cash_total)} />
          <Stat label={t("modules.soliq.cheques.payCard")} v={fmt(row.card_total)} />
          <Stat label={t("modules.soliq.cheques.vat")} v={fmt(row.vat_total)} />
          <Stat label={t("modules.soliq.cheques.summaryTotal")} v={fmt(row.total)} highlight />
        </div>
      </Section>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs uppercase tracking-wider text-muted-foreground">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}
function KV({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b py-1 gap-3">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium text-right truncate max-w-[60%]">{v ?? "—"}</span>
    </div>
  );
}
function Stat({ label, v, highlight }: { label: string; v: string; highlight?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${highlight ? "bg-primary/5 border-primary" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="tabular-nums font-semibold">{v}</div>
    </div>
  );
}
function fmt(v?: number | null | string): string {
  if (v == null) return "—";
  const n = Number(v);
  return isNaN(n) ? "—" : n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}
function fmtDate(v?: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("ru-RU");
}
function fmtDateTime(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
