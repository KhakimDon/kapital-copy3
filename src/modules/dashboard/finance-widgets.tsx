// Finance widgets — reuse the existing dashboard hooks (./api.ts) and render the
// same cards the legacy finance dashboard showed, each as a self-contained,
// company-scoped widget. Contributed to the registry via the WIDGETS export.
import {
  DollarSign,
  Euro,
  Banknote,
  TrendingUp,
  TrendingDown,
  FileText,
  ArrowDownLeft,
  ArrowUpRight,
  KeyRound,
  AlertTriangle,
  Receipt,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCompany } from "@/shared/store/company";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  WidgetCard,
  EmptyRow,
  ListSkeleton,
  money,
  severityBadgeVariant,
  type WidgetDef,
} from "./widget-kit";
import {
  useDashboardCurrency,
  useDashboardCurrencyArchive,
  useDashboardDebtors,
  useDashboardExpiringKeys,
  useDashboardRecentDocs,
  useDashboardTaxStatus,
  type CurrencyPoint,
  type CurrencyRate,
  type DebtorRow,
  type ExpiringKey,
  type RecentDoc,
  type TaxStatusItem,
} from "./api";

function Delta({ value }: { value: number | null | undefined }) {
  if (value == null || value === 0)
    return <span className="text-xs text-[#83888B]">—</span>;
  const up = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${
        up ? "text-[#09B849]" : "text-[#F24835]"
      }`}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {Math.abs(value).toLocaleString("ru-RU")}
    </span>
  );
}

function RateRow({
  icon,
  label,
  rate,
}: {
  icon: React.ReactNode;
  label: string;
  rate: CurrencyRate | null | undefined;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-[#F0F1F3] last:border-0">
      <span className="flex items-center gap-1.5 text-sm text-[#83888B]">
        <span className="text-[#7000FF]">{icon}</span>
        {label}
      </span>
      <span className="flex items-center gap-2">
        <span className="text-sm font-semibold tabular-nums text-[#101010]">
          {rate?.rate != null ? money(rate.rate) : "—"}
        </span>
        <Delta value={rate?.delta} />
      </span>
    </div>
  );
}

function Sparkline({ points }: { points: CurrencyPoint[] }) {
  const width = 220;
  const height = 40;
  if (points.length < 2)
    return <div className="text-xs text-muted-foreground">—</div>;
  const values = points.map((p) => p.rate);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / Math.max(1, points.length - 1);
  const d = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height;
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-10">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary"
      />
    </svg>
  );
}

// ── finance_currency ─────────────────────────────────────────────────────────

function CurrencyWidget() {
  const { t } = useTranslation();
  const q = useDashboardCurrency();
  const archive = useDashboardCurrencyArchive(7);
  const points = archive.data?.points ?? [];
  return (
    <WidgetCard
      title={t("modules.dashboard.widget.finance_currency", { defaultValue: "Valyuta kurslari" })}
      icon={<DollarSign className="size-4" />}
    >
      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
        </div>
      ) : (
        <div className="animate-in fade-in-0 duration-300">
          <RateRow icon={<DollarSign className="size-3.5" />} label="USD" rate={q.data?.usd} />
          <RateRow icon={<Euro className="size-3.5" />} label="EUR" rate={q.data?.eur} />
          <RateRow icon={<Banknote className="size-3.5" />} label="RUB" rate={q.data?.rub} />
          {points.length >= 2 && (
            <div className="mt-2">
              <Sparkline points={points} />
            </div>
          )}
        </div>
      )}
    </WidgetCard>
  );
}

// ── finance_docs ─────────────────────────────────────────────────────────────

function RecentDocsWidget() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;
  const q = useDashboardRecentDocs(companyId, 5);
  const items = q.data?.items ?? [];
  return (
    <WidgetCard
      title={t("modules.dashboard.widget.finance_docs", { defaultValue: "So'nggi hujjatlar" })}
      icon={<FileText className="size-4" />}
      footer={
        <Link to="/documents" className="hover:underline">
          {t("modules.dashboard.footer.viewAll", { defaultValue: "Barchasini ko'rish" })}
        </Link>
      }
    >
      {!companyId ? (
        <EmptyRow text={t("modules.dashboard.pickCompany", { defaultValue: "Kompaniyani tanlang" })} />
      ) : q.isLoading ? (
        <ListSkeleton rows={5} />
      ) : !items.length ? (
        <EmptyRow text={t("modules.dashboard.empty.noDocs", { defaultValue: "Hujjatlar yo'q" })} />
      ) : (
        <ul className="animate-in fade-in-0 duration-300">
          {items.map((d: RecentDoc, i) => (
            <li
              key={d.doc_id ?? i}
              className="flex items-start gap-2 rounded-lg px-1.5 py-1.5 text-xs transition-colors hover:bg-[#F8F2FF]/60"
            >
              <span
                className={`mt-0.5 inline-flex items-center justify-center size-4 rounded ${
                  d.is_creator ? "bg-[#7000FF]/10 text-[#7000FF]" : "bg-[#09B849]/10 text-[#09B849]"
                }`}
              >
                {d.is_creator ? <ArrowUpRight className="size-3" /> : <ArrowDownLeft className="size-3" />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-[#101010]">{d.doctype_label}</div>
                <div className="text-[#83888B] truncate">
                  {d.partner_name || "—"}
                  {d.doc_date ? ` · ${String(d.doc_date).slice(0, 10)}` : ""}
                </div>
              </div>
              {d.total_sum != null && d.total_sum !== 0 && (
                <span className="text-xs font-semibold tabular-nums shrink-0 text-[#7000FF]">{money(d.total_sum)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

// ── finance_tax ──────────────────────────────────────────────────────────────

function TaxStatusWidget() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;
  const q = useDashboardTaxStatus(companyId);
  const items = q.data?.items ?? [];
  const period = q.data?.period;
  return (
    <WidgetCard
      title={t("modules.dashboard.widget.finance_tax", { defaultValue: "Soliq holati" })}
      icon={<Receipt className="size-4" />}
      footer={period ? `${t("modules.dashboard.labels.period", { defaultValue: "Davr" })}: ${period.month}/${period.year}` : undefined}
    >
      {!companyId ? (
        <EmptyRow text={t("modules.dashboard.pickCompany", { defaultValue: "Kompaniyani tanlang" })} />
      ) : q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : !items.length ? (
        <EmptyRow text={t("modules.dashboard.empty.noData", { defaultValue: "Ma'lumot yo'q" })} />
      ) : (
        <ul className="animate-in fade-in-0 duration-300">
          {items.slice(0, 6).map((it: TaxStatusItem) => {
            const variant: "success" | "danger" | "warning" | "muted" =
              it.status === "submitted"
                ? "success"
                : it.status === "not_submitted" || it.status === "penalty"
                  ? "danger"
                  : it.status === "late"
                    ? "warning"
                    : "muted";
            const label =
              it.status === "submitted"
                ? t("status.signed", { defaultValue: "Topshirilgan" })
                : it.status === "late"
                  ? t("modules.dashboard.labels.overdue", { defaultValue: "Kechikib" })
                  : it.status === "not_submitted"
                    ? t("status.unconfirmed", { defaultValue: "Topshirilmagan" })
                    : it.status === "penalty"
                      ? t("modules.dashboard.labels.penalty", { defaultValue: "Jarima" })
                      : t("modules.dashboard.empty.noData", { defaultValue: "Ma'lumot yo'q" });
            return (
              <li key={it.id} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-xs transition-colors hover:bg-[#F8F2FF]/60">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-[#101010]">
                    {t(`modules.dashboard.tax.${it.id}`, { defaultValue: it.label })}
                  </div>
                  <div className="text-[#83888B] truncate">
                    {it.reports} {t("modules.dashboard.labels.reports", { defaultValue: "hisobot" })}
                  </div>
                </div>
                <Badge variant={variant}>{label}</Badge>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}

// ── finance_debtors ──────────────────────────────────────────────────────────

function DebtorsWidget() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;
  const q = useDashboardDebtors(companyId, 10);
  const items = q.data?.items ?? [];
  return (
    <WidgetCard
      title={t("modules.dashboard.widget.finance_debtors", { defaultValue: "Debitorlar" })}
      icon={<AlertTriangle className="size-4" />}
      footer={
        <Link to="/onec" className="hover:underline">
          {t("modules.dashboard.footer.goTo1C", { defaultValue: "1C ga o'tish" })}
        </Link>
      }
    >
      {!companyId ? (
        <EmptyRow text={t("modules.dashboard.pickCompany", { defaultValue: "Kompaniyani tanlang" })} />
      ) : q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : !items.length ? (
        <EmptyRow
          text={
            q.data?.available === false
              ? t("modules.dashboard.empty.not1C", { defaultValue: "1C ulanmagan" })
              : t("modules.dashboard.empty.noDebtors", { defaultValue: "Debitorlar yo'q" })
          }
        />
      ) : (
        <ul className="animate-in fade-in-0 duration-300">
          {items.slice(0, 5).map((d: DebtorRow, i) => (
            <li key={`${d.inn}-${i}`} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-xs transition-colors hover:bg-[#F8F2FF]/60">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-[#101010]">{d.name}</div>
                <div className="text-[#83888B] truncate">{d.inn}</div>
              </div>
              <span className="text-xs font-semibold tabular-nums text-[#F24835] shrink-0">
                {money(d.debt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

// ── finance_keys ─────────────────────────────────────────────────────────────

function ExpiringKeysWidget() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;
  const q = useDashboardExpiringKeys(companyId, 60);
  const items = q.data?.items ?? [];
  return (
    <WidgetCard
      title={t("modules.dashboard.widget.finance_keys", { defaultValue: "Muddati tugaydigan kalitlar" })}
      icon={<KeyRound className="size-4" />}
      footer={
        <Link to="/keys" className="hover:underline">
          {t("modules.dashboard.footer.keysAdmin", { defaultValue: "Kalitlar" })}
        </Link>
      }
    >
      {!companyId ? (
        <EmptyRow text={t("modules.dashboard.pickCompany", { defaultValue: "Kompaniyani tanlang" })} />
      ) : q.isLoading ? (
        <ListSkeleton rows={3} />
      ) : !items.length ? (
        <EmptyRow text={t("modules.dashboard.empty.noKeys", { defaultValue: "Kalitlar yo'q" })} />
      ) : (
        <ul className="animate-in fade-in-0 duration-300">
          {items.slice(0, 5).map((k: ExpiringKey, i) => (
            <li key={k.id ?? i} className="flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-xs transition-colors hover:bg-[#F8F2FF]/60">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-[#101010]">{k.owner_name || "—"}</div>
                <div className="text-[#83888B] truncate">
                  {k.tin || ""}
                  {k.valid_to ? ` · ${new Date(k.valid_to).toLocaleDateString("ru-RU")}` : ""}
                </div>
              </div>
              <Badge variant={severityBadgeVariant(k.severity)}>
                {k.days_remaining < 0
                  ? t("modules.dashboard.labels.overdue", { defaultValue: "Kechikkan" })
                  : `${k.days_remaining} ${t("modules.dashboard.labels.kun", { defaultValue: "kun" })}`}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </WidgetCard>
  );
}

export const WIDGETS: WidgetDef[] = [
  {
    type: "finance_currency",
    module: "dashboard",
    titleKey: "modules.dashboard.widget.finance_currency",
    title: "Valyuta kurslari",
    icon: DollarSign,
    defaultColspan: 1,
    Component: CurrencyWidget,
  },
  {
    type: "finance_docs",
    module: "documents",
    titleKey: "modules.dashboard.widget.finance_docs",
    title: "So'nggi hujjatlar",
    icon: FileText,
    defaultColspan: 1,
    Component: RecentDocsWidget,
  },
  {
    type: "finance_tax",
    module: "soliq",
    titleKey: "modules.dashboard.widget.finance_tax",
    title: "Soliq holati",
    icon: Receipt,
    defaultColspan: 1,
    Component: TaxStatusWidget,
  },
  {
    type: "finance_debtors",
    module: "onec",
    titleKey: "modules.dashboard.widget.finance_debtors",
    title: "Debitorlar",
    icon: AlertTriangle,
    defaultColspan: 1,
    Component: DebtorsWidget,
  },
  {
    type: "finance_keys",
    module: "keys",
    titleKey: "modules.dashboard.widget.finance_keys",
    title: "Muddati tugaydigan kalitlar",
    icon: KeyRound,
    defaultColspan: 1,
    Component: ExpiringKeysWidget,
  },
];
