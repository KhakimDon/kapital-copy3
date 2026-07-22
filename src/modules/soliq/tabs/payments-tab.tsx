import { useTranslation } from "react-i18next";
import { useUrlNumber } from "@/shared/hooks/use-url-state";
import { usePayments } from "../api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Receipt } from "lucide-react";
import { localized } from "../localized";

export function PaymentsTab({ companyId }: { companyId: string | number | null }) {
  const { t } = useTranslation();
  const now = new Date();
  // Navigational / query state in URL — namespaced `p*` (shared company-detail URL).
  const [year, setYearNum] = useUrlNumber("pyear", now.getFullYear());
  const [page, setPage] = useUrlNumber("ppage", 1);
  const setYear = (y: number) => { setYearNum(y); setPage(1); };
  const { data, isLoading } = usePayments(companyId, { year, page });

  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        {yearOptions.map((y) => (
          <Button key={y} variant={year === y ? "default" : "outline"} size="sm"
                  onClick={() => setYear(y)}>
            {y}
          </Button>
        ))}
      </div>

      <Card className="shadow-[0_2px_10px_rgba(68,83,113,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[12px] uppercase tracking-wide font-semibold text-[#7000FF]">{t("modules.soliq.paymentsTab.title")} ({data?.count ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow className="[&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-[#9DA4A8] [&_th]:font-medium hover:bg-transparent border-[#F0F1F3]">
                <TableHead>{t("modules.soliq.paymentsTab.colDate")}</TableHead>
                <TableHead>{t("modules.soliq.paymentsTab.colPayer")}</TableHead>
                <TableHead>{t("modules.soliq.paymentsTab.colRecipient")}</TableHead>
                <TableHead>{t("modules.soliq.paymentsTab.colPurpose")}</TableHead>
                <TableHead>{t("modules.soliq.paymentsTab.colTaxType")}</TableHead>
                <TableHead className="text-right">{t("modules.soliq.paymentsTab.colAmount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                    <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (data?.items.length ?? 0) === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <Receipt className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.soliq.page.noData")}</div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data?.items.map((p, i) => (
                  <TableRow key={String(p.id ?? i)} className="border-[#F0F1F3] hover:bg-[#F8F2FF]/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                            style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                    <TableCell className="text-[13px] text-[#83888B] tabular-nums whitespace-nowrap">{p.date ?? "—"}</TableCell>
                    <TableCell className="text-xs text-[#101010]">{p.payer ?? "—"}</TableCell>
                    <TableCell className="text-xs text-[#101010]">{p.recipient ?? "—"}</TableCell>
                    <TableCell className="text-xs text-[#83888B] max-w-xs truncate">{p.purpose ?? "—"}</TableCell>
                    <TableCell className="text-xs text-[#83888B]">{localized(p.na2_name) ?? p.na2_code ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums text-[14px] font-semibold text-[#101010]">
                      {p.amount != null
                        ? Number(p.amount).toLocaleString("ru-RU", { maximumFractionDigits: 0 })
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
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
