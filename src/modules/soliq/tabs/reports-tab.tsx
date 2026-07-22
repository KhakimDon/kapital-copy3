import { useTranslation } from "react-i18next";
import { useUrlNumber, useUrlState } from "@/shared/hooks/use-url-state";
import { useReports } from "../api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText } from "lucide-react";

const STATUS_KEYS = [
  { v: "", labelKey: "modules.soliq.reportsTab.statusAll" },
  { v: "approved", labelKey: "modules.soliq.reportsTab.statusApproved" },
  { v: "sent", labelKey: "modules.soliq.reportsTab.statusSent" },
  { v: "processing", labelKey: "modules.soliq.reportsTab.statusProcessing" },
  { v: "error", labelKey: "modules.soliq.reportsTab.statusError" },
  { v: "rejected", labelKey: "modules.soliq.reportsTab.statusRejected" },
  { v: "draft", labelKey: "modules.soliq.reportsTab.statusDraft" },
  { v: "scheduled", labelKey: "modules.soliq.reportsTab.statusScheduled" },
];

export function ReportsTab({ companyId }: { companyId: string | number | null }) {
  const { t } = useTranslation();
  const now = new Date();
  // Navigational / query state in URL — namespaced `r*` to avoid collisions with
  // sibling tabs sharing the company-detail URL.
  const [year, setYearNum] = useUrlNumber("ryear", now.getFullYear());
  const [status, setStatusRaw] = useUrlState("rstatus", "");
  const [page, setPage] = useUrlNumber("rpage", 1);
  const setYear = (y: number) => { setYearNum(y); setPage(1); };
  const setStatus = (s: string) => { setStatusRaw(s); setPage(1); };

  const { data, isLoading } = useReports(companyId, { year, status: status || null, page });

  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {yearOptions.map((y) => (
            <Button key={y} variant={year === y ? "default" : "outline"} size="sm"
                    onClick={() => setYear(y)}>
              {y}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {STATUS_KEYS.map((s) => (
            <Button key={s.v} variant={status === s.v ? "default" : "ghost"} size="sm"
                    onClick={() => setStatus(s.v)}>
              {t(s.labelKey)}
            </Button>
          ))}
        </div>
      </div>

      <Card className="shadow-[0_2px_10px_rgba(68,83,113,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[12px] uppercase tracking-wide font-semibold text-[#7000FF]">{t("modules.soliq.reportsTab.title")} ({data?.count ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow className="[&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-[#9DA4A8] [&_th]:font-medium hover:bg-transparent border-[#F0F1F3]">
                <TableHead>{t("modules.soliq.reportsTab.colReport")}</TableHead>
                <TableHead>{t("modules.soliq.reportsTab.colYearPeriod")}</TableHead>
                <TableHead>{t("modules.soliq.reportsTab.colSentAt")}</TableHead>
                <TableHead>{t("modules.soliq.reportsTab.colStatus")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                    <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : (data?.items.length ?? 0) === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <FileText className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.soliq.page.noData")}</div>
                      {status && (
                        <Button variant="outline" size="sm" onClick={() => setStatus("")}>
                          {t("modules.soliq.reportsTab.statusAll")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((r, i) => {
                  // soliq sends dates as "DD.MM.YYYY HH:MM:SS" (not ISO) → new Date()
                  // can't parse it ("Invalid Date"); reorder before formatting.
                  const raw = r.sent_at as string | undefined;
                  const m = raw?.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
                  const dt = m
                    ? new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}`)
                    : raw ? new Date(raw) : null;
                  const sent = !raw ? "—" : dt && !isNaN(dt.getTime()) ? dt.toLocaleString("ru-RU") : raw;
                  const link = ((r as Record<string, unknown>).raw as Record<string, unknown> | undefined)?.view_link as string | undefined;
                  return (
                    <TableRow key={String(r.id ?? i)}
                              className={`border-[#F0F1F3] hover:bg-[#F8F2FF]/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300 ${link ? "cursor-pointer" : ""}`}
                              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                              onClick={() => { if (link) window.open(link, "_blank", "noopener"); }}>
                      <TableCell className="text-[14px] font-medium text-[#101010]">{r.name ?? "—"}</TableCell>
                      <TableCell className="text-[13px] font-medium text-[#7000FF] tabular-nums whitespace-nowrap">{r.year} / {r.period ?? "—"}</TableCell>
                      <TableCell className="text-[13px] text-[#83888B] tabular-nums whitespace-nowrap">{sent}</TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {data && data.count > (data.per_page * data.page) && (
        <div className="flex items-center gap-2 justify-end">
          <Button variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage(page - 1)}>‹</Button>
          <span className="text-sm text-muted-foreground">{t("modules.soliq.pagination.page", { page })}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(page + 1)}>›</Button>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return <span className="text-muted-foreground">—</span>;
  const v = status.toLowerCase();
  let variant: "success" | "info" | "warning" | "danger" | "muted" = "muted";
  if (/topshir|paid|approved|оплач|сдан/i.test(v)) variant = "success";
  else if (/late|kechikib|просроч/i.test(v)) variant = "warning";
  else if (/error|rejected|отказ|отклон|xato/i.test(v)) variant = "danger";
  else if (/sent|sending|processing/i.test(v)) variant = "info";
  return <Badge variant={variant}>{status}</Badge>;
}
