import { Package, ShoppingCart, LayoutList, Scale } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useUrlState } from "@/shared/hooks/use-url-state";
import { useCompany } from "@/shared/store/company";
import { PurchasesView } from "./purchases";
import { MasterDataView } from "./masterdata";
import { SverkaView } from "./sverka";

type WhView = "purchases" | "masterdata" | "sverka";

export function WarehousePage() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;
  // Top-level sub-view in the URL so it deep-links / survives Back/Forward.
  const [viewRaw, setViewRaw] = useUrlState("view", "purchases", true);
  const view = viewRaw as WhView;
  const setView = (v: WhView) => setViewRaw(v);

  const NAV: [WhView, string, React.ReactNode][] = [
    ["purchases", t("modules.warehouse.nav.purchases"), <ShoppingCart className="size-4" />],
    ["masterdata", t("modules.warehouse.nav.masterdata"), <LayoutList className="size-4" />],
    ["sverka", t("modules.warehouse.nav.sverka"), <Scale className="size-4" />],
  ];

  if (!companyId)
    return <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">{t("modules.warehouse.selectCompany")}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap border-b border-border">
        <h1 className="text-2xl font-semibold flex items-center gap-2 pb-2"><Package className="size-6 text-primary" /> {t("modules.warehouse.title")}</h1>
        <div className="flex items-center gap-1 flex-wrap">
          {NAV.map(([k, lbl, icon]) => (
            <Button key={k} variant="ghost" onClick={() => setView(k)}
              className={`h-auto rounded-none px-3 py-2 text-sm border-b-2 -mb-px hover:bg-transparent ${view === k ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {icon}{lbl}
            </Button>
          ))}
        </div>
      </div>
      {view === "purchases" && <PurchasesView companyId={companyId} />}
      {view === "masterdata" && <MasterDataView companyId={companyId} />}
      {view === "sverka" && <SverkaView companyId={companyId} />}
    </div>
  );
}
