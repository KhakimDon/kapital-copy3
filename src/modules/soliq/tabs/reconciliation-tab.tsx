import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlNumber, useUrlState } from "@/shared/hooks/use-url-state";
import {
  useReconciliation,
  useReconciliationDates,
  useReconciliationRegions,
  useReconciliationSync,
} from "../api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { RefreshCw, Scale } from "lucide-react";
import { localized } from "../localized";

export function ReconciliationTab({
  companyId, companyType,
}: { companyId: string | number | null; companyType: "mchj" | "yatt" }) {
  const { t } = useTranslation();
  const now = new Date();
  // Navigational / query state in URL — namespaced `rec*` (shared company-detail URL).
  const [year, setYearNum] = useUrlNumber("recyear", now.getFullYear());
  const [regionRaw, setRegionRaw] = useUrlState("recregion", "");
  const [dateRaw, setDateRaw] = useUrlState("recdate", "");
  const region = regionRaw || undefined;
  const date = dateRaw || undefined;
  const setRegion = (v: string | undefined) => setRegionRaw(v ?? "");
  const setDate = (v: string | undefined) => setDateRaw(v ?? "");
  // Explicit "Ko'rsatish" gate — the table only loads after the user clicks
  // Show (mirrors cloud; avoids a /reconciliation call on every tab open).
  // Ephemeral action gate → keep local.
  const [shown, setShown] = useState(false);

  const { data: regionsData } = useReconciliationRegions(
    companyType === "mchj" ? companyId : null,
  );
  const ns = parseRegion(region);
  const { data: datesData } = useReconciliationDates(
    companyType === "mchj" ? companyId : null,
    { year, ns10_code: ns?.[0], ns11_code: ns?.[1] },
  );

  // Backend proxies soliq.uz verbatim: /regions and /available-dates each
  // return a BARE ARRAY, not an envelope. Regions rows carry ns10_name +
  // ns11_name (no `name`); dates carry request_date (no `date`).
  const toArr = (v: unknown): any[] =>
    Array.isArray(v) ? v : (v as any)?.items ?? (v as any)?.regions ?? (v as any)?.dates ?? [];
  const regionsRaw: any[] = toArr(regionsData);
  const dates: any[] = toArr(datesData);
  // Backend sometimes returns the same (ns10, ns11) pair twice (once with
  // is_default=true, once without) — dedupe on the code pair so we don't
  // render duplicate <SelectItem>s with the same key.
  const seen = new Set<string>();
  const regions = regionsRaw.filter((r: any) => {
    const k = `${r.ns10_code}:${r.ns11_code}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const dateStr = (d: any): string =>
    typeof d === "string" ? d : String(d?.request_date ?? d?.date ?? "");

  // auto-pick first available date when region or year changes
  useEffect(() => {
    if (companyType !== "mchj") return;
    if (!date && dates.length > 0) {
      const first = dateStr(dates[0]);
      if (first) setDate(first);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesData, date, companyType]);

  // Default the region to the row soliq.uz marks as is_default (or the
  // first row when there's no default flag) so the user isn't forced to
  // open the dropdown just to hit "Ko'rsatish".
  useEffect(() => {
    if (companyType !== "mchj") return;
    if (region || regions.length === 0) return;
    const preferred = regions.find((r: any) => r.is_default) ?? regions[0];
    setRegion(`${preferred.ns10_code}:${preferred.ns11_code}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionsData, companyType]);

  const { data, isLoading } = useReconciliation(companyId, {
    year,
    ns10_code: ns?.[0],
    ns11_code: ns?.[1],
    request_date: date,
  }, shown);
  const sync = useReconciliationSync();

  const yearOptions = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {yearOptions.map((y) => (
            <Button key={y} variant={year === y ? "default" : "outline"} size="sm"
                    onClick={() => { setYearNum(y); setDate(undefined); setShown(false); }}>
              {y}
            </Button>
          ))}
        </div>

        {companyType === "mchj" && (
          <>
            <Select value={region} onValueChange={(v) => { setRegion(v); setDate(undefined); setShown(false); }}>
              <SelectTrigger className="w-48"><SelectValue placeholder={t("modules.soliq.reconciliationTab.region")} /></SelectTrigger>
              <SelectContent>
                {regions.map((r: any) => (
                  <SelectItem key={`${r.ns10_code}:${r.ns11_code}`}
                              value={`${r.ns10_code}:${r.ns11_code}`}>
                    {r.name ?? [r.ns10_name, r.ns11_name].filter(Boolean).join(" — ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={date} onValueChange={(v) => { setDate(v); setShown(false); }}>
              <SelectTrigger className="w-44"><SelectValue placeholder={t("modules.soliq.reconciliationTab.date")} /></SelectTrigger>
              <SelectContent>
                {dates.map((d: any) => {
                  const s = dateStr(d);
                  if (!s) return null;
                  return <SelectItem key={s} value={s}>{s}</SelectItem>;
                })}
              </SelectContent>
            </Select>
          </>
        )}

        <Button size="sm" onClick={() => setShown(true)}
                disabled={companyType === "mchj" && !date}>
          {t("modules.soliq.reconciliationTab.show")}
        </Button>

        {companyType === "mchj" && (
          <Button size="sm" variant="outline"
                  disabled={!date || sync.isPending}
                  onClick={() => date && companyId != null && sync.mutate({ companyId, request_date: date })}>
            <RefreshCw className={`size-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
            {t("modules.soliq.actions.sync")}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">{t("modules.soliq.reconciliationTab.title")} ({data?.items.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!shown ? (
            <p className="text-center text-muted-foreground py-12">
              {companyType === "mchj" && !date
                ? t("modules.soliq.reconciliationTab.pickRegionDate")
                : t("modules.soliq.reconciliationTab.pickShow")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                {/* Group headers — each colSpan matches the sub-columns
                   below. Sticky first column stays pinned during horizontal
                   scroll so the tax-name never scrolls out of view. */}
                <TableRow className="[&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:font-semibold [&_th]:text-center [&_th]:border-b hover:bg-transparent">
                  <TableHead rowSpan={2} className="sticky left-0 bg-background z-10 min-w-[260px] text-left align-bottom">
                    Soliq turi
                  </TableHead>
                  <TableHead colSpan={5}>Saldo boshl.</TableHead>
                  <TableHead colSpan={6}>Hisoblangan</TableHead>
                  <TableHead colSpan={4}>To‘langan</TableHead>
                  <TableHead colSpan={6}>Saldo tek.</TableHead>
                  <TableHead colSpan={2}>Yakuniy</TableHead>
                </TableRow>
                <TableRow className="[&_th]:text-[10px] [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:font-medium [&_th]:text-right hover:bg-transparent">
                  {/* Saldo boshl. */}
                  <TableHead>Ned.</TableHead>
                  <TableHead>Ned. ots.</TableHead>
                  <TableHead>Pen.</TableHead>
                  <TableHead>Pen. ots.</TableHead>
                  <TableHead>Per.</TableHead>
                  {/* Hisoblangan */}
                  <TableHead>Rachet</TableHead>
                  <TableHead>Akt</TableHead>
                  <TableHead>Raz. op.</TableHead>
                  <TableHead>Protokol</TableHead>
                  <TableHead>Jami</TableHead>
                  <TableHead>Penya</TableHead>
                  {/* To'langan */}
                  <TableHead>Plateji</TableHead>
                  <TableHead>Vozvrat</TableHead>
                  <TableHead>Penya</TableHead>
                  <TableHead>Jami</TableHead>
                  {/* Saldo tek. */}
                  <TableHead>Ned.</TableHead>
                  <TableHead>Ned. ots.</TableHead>
                  <TableHead>Pen.</TableHead>
                  <TableHead>Pen. ots.</TableHead>
                  <TableHead>Per.</TableHead>
                  <TableHead>Izl. upl.</TableHead>
                  {/* Yakuniy */}
                  <TableHead>Qarz</TableHead>
                  <TableHead>Avans</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 7 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                      <TableCell className="sticky left-0 bg-background z-10"><Skeleton className="h-3.5 w-40" /></TableCell>
                      {Array.from({ length: 23 }).map((_, j) => (
                        <TableCell key={j} className="text-right"><Skeleton className="h-3.5 w-12 ml-auto" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (data?.items.length ?? 0) === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={24} className="py-16">
                      <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                        <div className="size-14 rounded-full bg-muted grid place-items-center">
                          <Scale className="size-7 text-muted-foreground" />
                        </div>
                        <div className="text-sm font-medium text-foreground">{t("modules.soliq.page.noData")}</div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.items.map((r, i) => (
                    <TableRow key={i} className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                      <TableCell className="sticky left-0 bg-background z-10 text-xs align-top">
                        {localized(r.na2_name) ?? r.na2_code ?? "—"}
                      </TableCell>
                      {/* Saldo boshl. */}
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.saldo_nachalo_ned)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt((r as any).saldo_nachalo_ned_ots)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.saldo_nachalo_pen)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt((r as any).saldo_nachalo_pen_ots)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.saldo_nachalo_per)}</TableCell>
                      {/* Hisoblangan */}
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.nach_rachet)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt((r as any).nach_akt)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt((r as any).nach_raz_oper)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt((r as any).nach_protokol)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.nach_itogo)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.nach_penya)}</TableCell>
                      {/* To'langan */}
                      <TableCell className="text-right tabular-nums text-xs">{fmt((r as any).uploch_plateji)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt((r as any).uploch_vozvrat)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.uploch_penya)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.uploch_itogo)}</TableCell>
                      {/* Saldo tek. */}
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.saldo_tek_ned)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt((r as any).saldo_tek_ned_ots)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.saldo_tek_pen)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt((r as any).saldo_tek_pen_ots)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt(r.saldo_tek_per)}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{fmt((r as any).saldo_tek_izlish_upl)}</TableCell>
                      {/* Yakuniy */}
                      <TableCell className="text-right tabular-nums text-xs">
                        <span className={Number(r.total_debt ?? 0) > 0 ? "text-destructive font-semibold" : ""}>
                          {fmt(r.total_debt)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-xs">
                        <span className={Number(r.total_over_payment ?? 0) > 0 ? "text-success font-semibold" : ""}>
                          {fmt(r.total_over_payment)}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {!isLoading && data && data.items.length > 0 && (
                <TableFooter>
                  <TableRow className="[&_td]:font-semibold [&_td]:text-xs">
                    <TableCell className="sticky left-0 bg-muted z-10">{t("modules.soliq.reconciliationTab.total")}</TableCell>
                    {/* Saldo boshl. */}
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).saldo_nachalo_ned)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).saldo_nachalo_ned_ots)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).saldo_nachalo_pen)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).saldo_nachalo_pen_ots)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).saldo_nachalo_per)}</TableCell>
                    {/* Hisoblangan */}
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).nach_rachet)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).nach_akt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).nach_raz_oper)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).nach_protokol)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(data.totals.nach_itogo)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(data.totals.nach_penya)}</TableCell>
                    {/* To'langan */}
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).uploch_plateji)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).uploch_vozvrat)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).uploch_penya)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(data.totals.uploch_itogo)}</TableCell>
                    {/* Saldo tek. */}
                    <TableCell className="text-right tabular-nums">{fmt(data.totals.saldo_tek_ned)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).saldo_tek_ned_ots)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(data.totals.saldo_tek_pen)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).saldo_tek_pen_ots)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(data.totals.saldo_tek_per)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt((data.totals as any).saldo_tek_izlish_upl)}</TableCell>
                    {/* Yakuniy */}
                    <TableCell className="text-right tabular-nums text-destructive">{fmt(data.totals.total_debt)}</TableCell>
                    <TableCell className="text-right tabular-nums text-success">{fmt(data.totals.total_over_payment)}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function parseRegion(s?: string): [string, string] | null {
  if (!s) return null;
  const [a, b] = s.split(":");
  return [a, b];
}

function fmt(v?: number | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}
