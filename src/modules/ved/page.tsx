import { useEffect, useState } from "react";
import { Globe, RefreshCw, AlertTriangle, FileDown, Download, Package, X, Play, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCompany } from "@/shared/store/company";
import { useUrlState } from "@/shared/hooks/use-url-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DateRangePicker, isoToDate, dateToIso, type DateRange,
} from "@/components/ui/date-range-picker";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useVedDeclarations, useVedOverview, useVedGoods, downloadVedPdf, downloadVedExcel,
  useVedBackfill, useStartVedBackfill,
} from "./api";

const fmtDate = (s?: string | null) => (s ? String(s).slice(0, 10) : "—");
const str = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

// ── Detail drawer: header (numbered GTD fields) + goods ──────────────────────
function DetailSheet({
  companyId, decl, onClose,
}: {
  companyId: number;
  decl: { decl_id: string; gtd_number: string } | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const declId = decl?.decl_id ?? null;
  const ov = useVedOverview(companyId, declId);
  const gs = useVedGoods(companyId, declId);
  const header = (ov.data?.header ?? {}) as Record<string, any>;
  const goods = gs.data?.goods ?? [];
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState<string | null>(null);

  const party = (p: any) => (p ? [p.name, p.inn, p.country, p.address].filter(Boolean).join(" · ") : "—");
  const rows: Array<[string, string]> = [
    [t("modules.ved.f.gtd", { defaultValue: "GTD raqami" }), str(header.gtd_number)],
    [t("modules.ved.f.regDate", { defaultValue: "Sana" }), str(header.reg_date)],
    [t("modules.ved.f.declType", { defaultValue: "Deklaratsiya turi" }), str(header.decl_type)],
    [t("modules.ved.f.sender", { defaultValue: "Yubroruvchi" }), party(header.sender)],
    [t("modules.ved.f.receiver", { defaultValue: "Qabul qiluvchi" }), party(header.receiver)],
    [t("modules.ved.f.declarant", { defaultValue: "Deklarant" }), party(header.declarant)],
    [t("modules.ved.f.customsValue", { defaultValue: "Bojxona qiymati" }), str(header.customs_value)],
    [t("modules.ved.f.invoiceValue", { defaultValue: "Faktura qiymati" }), [header.invoice_value, header.invoice_currency].filter(Boolean).join(" ") || "—"],
    [t("modules.ved.f.deliveryTerms", { defaultValue: "Yetkazib berish sharti" }), str(header.delivery_terms)],
    [t("modules.ved.f.customsOffice", { defaultValue: "Bojxona posti" }), str(header.customs_office)],
    [t("modules.ved.f.status", { defaultValue: "Holati" }), str(header.status)],
  ];

  const doPdf = async () => {
    if (!declId) return;
    setPdfBusy(true);
    setPdfMsg(null);
    try {
      await downloadVedPdf(companyId, declId);
    } catch {
      // 502 = ed2 has no РУ (release permit) PDF for this declaration yet.
      setPdfMsg(t("modules.ved.pdfUnavail", { defaultValue: "Bu deklaratsiya uchun PDF (РУ) hali mavjud emas" }));
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <Sheet open={!!decl} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-mono text-base">
            <Globe className="size-5 text-primary" />
            {decl?.gtd_number || t("modules.ved.detail", { defaultValue: "Deklaratsiya" })}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex items-center justify-end gap-3">
          {pdfMsg && <span className="text-xs text-warning">{pdfMsg}</span>}
          <Button size="sm" variant="outline" onClick={doPdf} disabled={pdfBusy}>
            <FileDown className={`size-4 mr-1 ${pdfBusy ? "animate-pulse" : ""}`} />
            {t("modules.ved.pdf", { defaultValue: "PDF yuklab olish" })}
          </Button>
        </div>

        {/* Header fields */}
        <div className="mt-3 rounded-lg border border-border bg-card divide-y divide-border">
          {ov.isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2">
                <Skeleton className="h-3.5 w-28" /><Skeleton className="h-3.5 w-40" />
              </div>
            ))
          ) : (
            rows.map(([k, v]) => (
              <div key={k} className="flex items-start justify-between gap-4 px-3 py-2 text-sm">
                <span className="text-muted-foreground shrink-0">{k}</span>
                <span className="text-right text-foreground break-words">{v}</span>
              </div>
            ))
          )}
        </div>

        {/* Goods */}
        <div className="mt-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Package className="size-4 text-primary" />
            {t("modules.ved.goods", { defaultValue: "Tovarlar" })}
            {gs.data?.goods_count ? <span className="text-muted-foreground font-normal">({str(gs.data.goods_count)})</span> : null}
            {gs.data && gs.data.complete === false && (
              <span className="text-xs font-normal text-muted-foreground inline-flex items-center gap-1">
                <RefreshCw className="size-3 animate-spin" />
                {t("modules.ved.goodsFilling", { defaultValue: "to'ldirilmoqda…" })}
              </span>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">#</TableHead>
                <TableHead className="text-xs">{t("modules.ved.g.code", { defaultValue: "Kod (ТН ВЭД)" })}</TableHead>
                <TableHead className="text-xs">{t("modules.ved.g.name", { defaultValue: "Nomi" })}</TableHead>
                <TableHead className="text-xs text-right">{t("modules.ved.g.netto", { defaultValue: "Netto" })}</TableHead>
                <TableHead className="text-xs text-right">{t("modules.ved.g.faktura", { defaultValue: "Faktura" })}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {gs.isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i} className="hover:bg-transparent">
                      <TableCell><Skeleton className="h-3 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-3 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-3 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-3 w-12 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-3 w-16 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : goods.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      {gs.data?.reason === "upstream_unavailable"
                        ? t("modules.ved.goodsUnavail", { defaultValue: "Tovarlar yuklanmadi (qayta urinib ko'ring)" })
                        : t("modules.ved.goodsEmpty", { defaultValue: "Tovar topilmadi" })}
                    </TableCell>
                  </TableRow>
                ) : (
                  goods.map((g: any, i: number) => (
                    <TableRow key={g.num ?? i} className="hover:bg-muted/40">
                      <TableCell className="tabular-nums text-muted-foreground">{str(g.num)}</TableCell>
                      <TableCell className="font-mono text-xs">{str(g.code)}</TableCell>
                      <TableCell className="max-w-xs truncate" title={str(g.name)}>{str(g.name)}</TableCell>
                      <TableCell className="text-right tabular-nums">{str(g.netto)}</TableCell>
                      <TableCell className="text-right tabular-nums">{str(g.faktura)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function VedPage() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;
  // Empty range = show everything (backend defaults to a wide 2020–2030 window).
  const [dateFrom, setDateFrom] = useUrlState("from", "");
  const [dateTo, setDateTo] = useUrlState("to", "");
  const { data, isLoading, isFetching, refetch } = useVedDeclarations(companyId, dateFrom || undefined, dateTo || undefined);
  const items = data?.items ?? [];
  const [sel, setSel] = useState<{ decl_id: string; gtd_number: string } | null>(null);
  const [xlsBusy, setXlsBusy] = useState(false);
  const hasRange = !!dateFrom || !!dateTo;

  // Backfill: the Celery worker fully fetches declarations; the list shows only
  // completed ones. While it runs, keep refetching the list so new rows appear.
  const bf = useVedBackfill(companyId);
  const startBackfill = useStartVedBackfill(companyId);
  const bfStatus = bf.data?.status ?? "idle";
  const bfActive = bfStatus === "running" || bfStatus === "queued";
  useEffect(() => {
    if (!bfActive) return;
    const id = setInterval(() => refetch(), 8000);
    return () => clearInterval(id);
  }, [bfActive, refetch]);

  const doExcel = async () => {
    if (!companyId) return;
    setXlsBusy(true);
    try { await downloadVedExcel(companyId, dateFrom || undefined, dateTo || undefined); } catch { /* ignore */ } finally { setXlsBusy(false); }
  };

  if (!companyId) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        {t("modules.ved.pickCompany", { defaultValue: "Korxona tanlang" })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Globe className="size-6 text-primary" />
          {t("modules.ved.title", { defaultValue: "VED — Bojxona deklaratsiyalari" })}
        </h1>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <DateRangePicker
            value={{ from: isoToDate(dateFrom), to: isoToDate(dateTo) }}
            placeholder={t("modules.ved.dateRange", { defaultValue: "Sana oralig'i" })}
            onChange={(r: DateRange | undefined) => {
              setDateFrom(r?.from ? dateToIso(r.from)! : "");
              setDateTo(r?.to ? dateToIso(r.to)! : "");
            }}
          />
          {hasRange && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              title={t("common.clear", { defaultValue: "Tozalash" })}
            >
              <X className="size-4" />
            </Button>
          )}
          {bfActive ? (
            <div className="inline-flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-sm text-primary">
              <Loader2 className="size-4 animate-spin" />
              {bfStatus === "queued"
                ? t("modules.ved.bfQueued", { defaultValue: "Navbatда…" })
                : t("modules.ved.bfRunning", {
                    defaultValue: "Yig'ilmoqda {{done}}/{{total}}",
                    done: bf.data?.done ?? 0,
                    total: bf.data?.total ?? 0,
                  })}
            </div>
          ) : (
            <Button
              variant="default"
              size="sm"
              onClick={() => startBackfill.mutate()}
              disabled={startBackfill.isPending}
              title={t("modules.ved.bfHint", { defaultValue: "So'nggi 3 oy deklaratsiyalarini to'liq yig'ish" })}
            >
              <Play className={`size-4 mr-1 ${startBackfill.isPending ? "animate-pulse" : ""}`} />
              {bfStatus === "done"
                ? t("modules.ved.bfRestart", { defaultValue: "Qayta yig'ish" })
                : t("modules.ved.bfStart", { defaultValue: "Jarayonni boshlash" })}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={doExcel} disabled={xlsBusy || items.length === 0}>
            <Download className={`size-4 mr-1 ${xlsBusy ? "animate-pulse" : ""}`} />
            Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`size-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
            {t("common.refresh", { defaultValue: "Yangilash" })}
          </Button>
        </div>
      </div>

      {data && !data.available && (
        <div className="flex items-center gap-2 rounded-lg border border-warning/40 bg-warning/15 px-3 py-2 text-sm text-warning animate-in fade-in-0 duration-300">
          <AlertTriangle className="size-4 shrink-0" />
          {t("modules.ved.unavailable", {
            defaultValue: "Bojxona xizmati (ed2.customs.uz) hozircha ulanmagan yoki deklaratsiya yo'q (GTD).",
          })}
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">{t("modules.ved.cols.gtd", { defaultValue: "GTD raqami" })}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">{t("modules.ved.cols.date", { defaultValue: "Sana" })}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">{t("modules.ved.cols.type", { defaultValue: "Turi" })}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold text-right">{t("modules.ved.cols.goods", { defaultValue: "Tovarlar" })}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-8 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      {bfActive ? <Loader2 className="size-7 text-primary animate-spin" /> : <Globe className="size-7 text-muted-foreground" />}
                    </div>
                    {bfActive ? (
                      <div className="text-sm font-medium text-foreground">
                        {t("modules.ved.emptyRunning", { defaultValue: "Deklaratsiyalar yig'ilmoqda, kuting…" })}
                        <div className="mt-1 text-xs font-normal text-muted-foreground">{bf.data?.done ?? 0}/{bf.data?.total ?? 0}</div>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-medium text-foreground">{t("modules.ved.empty", { defaultValue: "Deklaratsiya topilmadi" })}</div>
                        <div className="text-xs text-muted-foreground max-w-xs">
                          {t("modules.ved.emptyHint", { defaultValue: "So'nggi 3 oy deklaratsiyalarini to'liq yig'ish uchun «Jarayonni boshlash» tugmasini bosing." })}
                        </div>
                        <Button size="sm" className="mt-1" onClick={() => startBackfill.mutate()} disabled={startBackfill.isPending}>
                          <Play className="size-4 mr-1" />
                          {t("modules.ved.bfStart", { defaultValue: "Jarayonni boshlash" })}
                        </Button>
                      </>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((d, i) => {
                const declId = (d.decl_id as string) || "";
                const gtd = (d.gtd_number as string) || "—";
                return (
                  <TableRow
                    key={declId || i}
                    onClick={() => declId && setSel({ decl_id: declId, gtd_number: gtd })}
                    className="cursor-pointer animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <TableCell className="font-mono text-xs">{gtd}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(d.reg_date as string)}</TableCell>
                    <TableCell>{(d.regime as string) || (d.doctype as string) || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{str(d.goods_count)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <DetailSheet companyId={companyId} decl={sel} onClose={() => setSel(null)} />
    </div>
  );
}
