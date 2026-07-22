// Dashboard widget contributed by the Companies module: the current company's
// name, rating, document mix and bank balance. Reuses the dashboard overview
// hook. Consumed by the dashboard registry.
import { Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCompany } from "@/shared/store/company";
import { RatingTag } from "@/shared/rating";
import { Badge } from "@/components/ui/badge";
import {
  WidgetCard,
  EmptyRow,
  ListSkeleton,
  money,
  num,
  type WidgetDef,
} from "@/modules/dashboard/widget-kit";
import { useDashboardOverview } from "@/modules/dashboard/api";

function CompanyOverviewWidget() {
  const { t } = useTranslation();
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;
  const q = useDashboardOverview(companyId);
  const rating = q.data?.rating ?? {};
  const docs = q.data?.documents;
  const bank = q.data?.bank;

  return (
    <WidgetCard
      title={t("modules.dashboard.widget.company_overview", { defaultValue: "Kompaniya" })}
      icon={<Building2 className="size-4" />}
    >
      {!companyId ? (
        <EmptyRow text={t("modules.dashboard.pickCompany", { defaultValue: "Kompaniyani tanlang" })} />
      ) : q.isLoading ? (
        <ListSkeleton rows={4} />
      ) : (
        <div className="animate-in fade-in-0 duration-300">
          <div className="mb-2 font-medium text-foreground truncate">{company?.name}</div>
          <div className="mb-3 flex items-center gap-2">
            <RatingTag rating={rating.rating} points={rating.rating_points} className="text-sm px-3 py-1" />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground">
                {t("modules.dashboard.cards.documents", { defaultValue: "Hujjatlar" })}
              </div>
              <div className="flex flex-wrap gap-1 pt-0.5">
                <Badge variant="warning">{num(docs?.pending)}</Badge>
                <Badge variant="success">{num(docs?.signed)}</Badge>
                <Badge variant="danger">{num(docs?.rejected)}</Badge>
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">
                {t("modules.dashboard.cards.bank", { defaultValue: "Bank balansi" })}
              </div>
              <div className="pt-0.5 font-semibold tabular-nums">
                {money(bank?.total_balance)}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("modules.dashboard.labels.soms", { defaultValue: "so'm" })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </WidgetCard>
  );
}

export const WIDGETS: WidgetDef[] = [
  {
    type: "company_overview",
    module: "companies",
    titleKey: "modules.dashboard.widget.company_overview",
    title: "Kompaniya",
    icon: Building2,
    defaultColspan: 1,
    Component: CompanyOverviewWidget,
  },
];
