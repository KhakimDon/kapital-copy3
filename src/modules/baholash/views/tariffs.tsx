import { useTranslation } from "react-i18next";
import { Tags } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/reveal";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useMeta } from "../api";
import { SPHERE_LABELS, fmtSum, type Meta } from "../types";
import { ClassBadge } from "../components";

// ════ VIEW: Tariffs reference ════ (1:1 with NC renderTariffs)
export function TariffsView() {
  const { t } = useTranslation();
  const { data: meta, isLoading, refetch } = useMeta();
  if (isLoading)
    return (
      <div className="space-y-4">
        <Card title={t("modules.baholash.tariffs.tableTitle")}>
          <div className="space-y-2.5 animate-in fade-in-0 duration-300">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        </Card>
        <Card title={t("modules.baholash.tariffs.spheresTitle")}>
          <div className="space-y-2.5 animate-in fade-in-0 duration-300">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        </Card>
      </div>
    );
  if (!meta) return <ErrorState onRetry={() => refetch()} />;

  return (
    <div className="space-y-4 animate-in fade-in-0 duration-300">
      <Card title={t("modules.baholash.tariffs.tableTitle")}>
        <TariffTable meta={meta} />
      </Card>
      <Card title={t("modules.baholash.tariffs.spheresTitle")}>
        <SphereTable meta={meta} />
      </Card>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-2.5 border-b border-border text-xs font-bold uppercase tracking-wide text-muted-foreground flex items-center gap-2">
        <Tags className="size-3.5" /> {title}
      </div>
      <div className="p-3 overflow-x-auto">{children}</div>
    </div>
  );
}

const TH = "text-xs uppercase tracking-wide text-muted-foreground font-bold";

function TariffTable({ meta }: { meta: Meta }) {
  const { t } = useTranslation();
  const classes = [1, 2, 3, 4, 5, 6];
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={TH}>{t("modules.baholash.tariffs.columns.class")}</TableHead>
          <TableHead className={TH}>{t("modules.baholash.tariffs.columns.ball")}</TableHead>
          <TableHead className={`${TH} text-right`}>{t("modules.baholash.tariffs.columns.budget")}</TableHead>
          <TableHead className={`${TH} text-right`}>{t("modules.baholash.tariffs.columns.tariffUsd")}</TableHead>
          <TableHead className={`${TH} text-right`}>{t("modules.baholash.tariffs.columns.tariffSom")}</TableHead>
          <TableHead className={TH}>{t("modules.baholash.tariffs.columns.turnover")}</TableHead>
          <TableHead className={TH}>{t("modules.baholash.tariffs.columns.employees")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {classes.map((c) => (
          <TableRow key={c}>
            <TableCell><ClassBadge cls={c} /></TableCell>
            <TableCell className="tabular-nums">{meta.ball[c]}</TableCell>
            <TableCell className="font-mono tabular-nums text-right">{fmtSum(meta.budget[c])}</TableCell>
            <TableCell className="tabular-nums text-right">${meta.tariffUsd[c]}</TableCell>
            <TableCell className="font-mono tabular-nums text-right">{fmtSum(meta.tariffUsd[c] * meta.usdRate)}</TableCell>
            <TableCell className="tabular-nums">{c < 6 ? `≤ ${meta.turnoverBln[c]}` : `> ${meta.turnoverBln[5]}`}</TableCell>
            <TableCell className="tabular-nums">{c < 6 ? `≤ ${meta.employees[c]}` : `> ${meta.employees[5]}`}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SphereTable({ meta }: { meta: Meta }) {
  const { t } = useTranslation();
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className={TH}>{t("modules.baholash.tariffs.spheresColumns.sphere")}</TableHead>
          <TableHead className={TH}>{t("modules.baholash.tariffs.spheresColumns.saleCoef")}</TableHead>
          <TableHead className={TH}>{t("modules.baholash.tariffs.spheresColumns.empCoef")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.keys(meta.spheres).map((k) => {
          const s = meta.spheres[k];
          return (
            <TableRow key={k}>
              <TableCell>{SPHERE_LABELS[k] || k}</TableCell>
              <TableCell className="tabular-nums">×{s.sale}</TableCell>
              <TableCell className="tabular-nums">×{s.emp}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
