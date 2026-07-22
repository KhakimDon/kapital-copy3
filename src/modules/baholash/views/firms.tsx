import { useTranslation } from "react-i18next";
import { Building2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useDeleteEvaluation, useEvaluations } from "../api";
import { fmtSum } from "../types";
import { ClassBadge } from "../components";

// ════ VIEW: Evaluated firms ════ (1:1 with NC loadFirms)
export function FirmsView() {
  const { t } = useTranslation();
  const { data, isLoading } = useEvaluations(true);
  const del = useDeleteEvaluation();
  const rows = data ?? [];

  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">{t("modules.baholash.firms.columns.firm")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">{t("modules.baholash.firms.columns.inn")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">{t("modules.baholash.firms.columns.class")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">{t("modules.baholash.firms.columns.ball")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold text-right">{t("modules.baholash.firms.columns.tariff")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">{t("modules.baholash.firms.columns.date")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            // Table-shaped skeleton (mirrors the columns) so the swap to real
            // data is seamless — gentle pulse + fade-in.
            Array.from({ length: 6 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-10" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                <TableCell className="text-right"><Skeleton className="size-8 rounded-md ml-auto" /></TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="py-16">
                <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                  <div className="size-14 rounded-full bg-muted grid place-items-center">
                    <Building2 className="size-7 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-medium text-foreground">{t("modules.baholash.firms.emptyTitle")}</div>
                  <p className="text-sm text-muted-foreground">{t("modules.baholash.firms.emptyHint")}</p>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((e, i) => (
              <TableRow
                key={e.id}
                className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              >
                <TableCell className="font-medium">{e.name || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{e.inn || ""}</TableCell>
                <TableCell><ClassBadge cls={e.class} /></TableCell>
                <TableCell className="tabular-nums">{e.ball}</TableCell>
                <TableCell className="font-mono tabular-nums text-right">{fmtSum(e.tariff_sum)}</TableCell>
                <TableCell className="text-muted-foreground">{(e.updated_at || "").slice(0, 10)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("modules.baholash.actions.delete")}
                    disabled={del.isPending}
                    onClick={() => del.mutate(e.id)}
                    className="size-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
