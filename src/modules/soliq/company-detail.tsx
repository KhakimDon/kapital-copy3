import { useParams, Link } from "react-router-dom";
import { useUrlState } from "@/shared/hooks/use-url-state";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { useCompanyOverview } from "./api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import { ProfileTab } from "./tabs/profile-tab";
import { ReportsTab } from "./tabs/reports-tab";
import { PaymentsTab } from "./tabs/payments-tab";
import { ReconciliationTab } from "./tabs/reconciliation-tab";

/** Route-обёртка (deep-link /soliq/company/:id). Основной сценарий пилота —
 *  модалка из налоговой сетки (см. SoliqCompanyDetailBody). */
export function SoliqCompanyDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/soliq">
            <ArrowLeft className="size-4 mr-1" /> {t("modules.soliq.nav.grid")}
          </Link>
        </Button>
      </div>
      <SoliqCompanyDetailBody companyId={id ?? null} />
    </div>
  );
}

/** Контент карточки компании — рендерится и в модалке, и на роуте. */
export function SoliqCompanyDetailBody({ companyId }: { companyId: string | null }) {
  const { t } = useTranslation();
  // Active sub-tab is navigational → URL key `tab` (deep-link / refresh reopens it).
  const [tab, setTab] = useUrlState("tab", "profile");

  const { data: overview, isLoading } = useCompanyOverview(companyId);

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div className="rounded-2xl bg-white p-6 shadow-[0_2px_10px_rgba(68,83,113,0.06)]">
        <Reveal
          loading={isLoading}
          skeleton={
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="space-y-2">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
          }
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h2 className="text-[22px] font-bold leading-tight text-[#101010]">
                {(overview?.profile as any)?.name ?? t("modules.soliq.companyDetail.companyNum", { id: companyId })}
              </h2>
              <div className="mt-2 flex items-center gap-2.5 flex-wrap">
                <span className="text-[13px] text-[#83888B]">
                  {t("modules.soliq.grid.inn")}:{" "}
                  <span className="font-medium text-[#101010] tabular-nums">{overview?.inn ?? "—"}</span>
                </span>
                <Badge variant="info">{overview?.type?.toUpperCase()}</Badge>
              </div>
            </div>
            <HeroStats stats={overview?.stats as any} />
          </div>
        </Reveal>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="px-1">
          <TabsTrigger value="profile" className="data-[state=active]:text-[#7000FF] data-[state=active]:font-semibold data-[state=active]:border-[#7000FF]">{t("modules.soliq.tabs.profile")}</TabsTrigger>
          <TabsTrigger value="reports" className="data-[state=active]:text-[#7000FF] data-[state=active]:font-semibold data-[state=active]:border-[#7000FF]">{t("modules.soliq.tabs.reports")}</TabsTrigger>
          <TabsTrigger value="payments" className="data-[state=active]:text-[#7000FF] data-[state=active]:font-semibold data-[state=active]:border-[#7000FF]">{t("modules.soliq.tabs.payments")}</TabsTrigger>
          <TabsTrigger value="reconciliation" className="data-[state=active]:text-[#7000FF] data-[state=active]:font-semibold data-[state=active]:border-[#7000FF]">{t("modules.soliq.tabs.reconciliation")}</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab overview={overview} loading={isLoading} />
        </TabsContent>
        <TabsContent value="reports">
          <ReportsTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="payments">
          <PaymentsTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="reconciliation">
          <ReconciliationTab companyId={companyId}
                             companyType={overview?.type ?? "mchj"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HeroStats({ stats }: { stats?: Record<string, number> }) {
  const { t } = useTranslation();
  if (!stats) return null;
  // Upstream `tax-stats` speaks `current_overpayment`, not the legacy
  // `final_over_payment` field the older POC read — keep the legacy alias
  // as fallback so we don't break if soliq.uz ever renames it back.
  const debt = Number((stats as any).final_debt ?? 0);
  const adv = Number(
    (stats as any).current_overpayment ??
    (stats as any).final_over_payment ??
    0,
  );
  return (
    <div className="flex items-center gap-3">
      <div className="rounded-xl bg-[#F8F9FA] px-4 py-3 min-w-[120px]">
        <div className="text-[11px] uppercase tracking-wide font-medium text-[#9DA4A8]">{t("modules.soliq.meta.debt")}</div>
        <div className={`mt-1 text-[20px] font-bold tabular-nums ${debt > 0 ? "text-[#F24835]" : "text-[#9DA4A8]"}`}>
          {debt.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div className="rounded-xl bg-[#F8F9FA] px-4 py-3 min-w-[120px]">
        <div className="text-[11px] uppercase tracking-wide font-medium text-[#9DA4A8]">{t("modules.soliq.meta.advance")}</div>
        <div className={`mt-1 text-[20px] font-bold tabular-nums ${adv > 0 ? "text-[#09B849]" : "text-[#9DA4A8]"}`}>
          {adv.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
        </div>
      </div>
    </div>
  );
}
