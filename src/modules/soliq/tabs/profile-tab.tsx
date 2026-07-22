import { useTranslation } from "react-i18next";
import type { CompanyOverview } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Backend proxies soliq.uz's `/company/overview` verbatim — every field is
 * camelCase with per-language variants (`taxModeNameLatn`/`Ru`/`Uz`,
 * `statusName`, `vatNumber`, etc.), plus the flat legacy fields (`name`,
 * `inn`, `address`, `email`, `phone`). We read the camelCase names directly
 * and fall back to the snake_case variants for older payloads.
 */
export function ProfileTab({
  overview, loading,
}: {
  overview: CompanyOverview | undefined;
  loading: boolean;
}) {
  const { t } = useTranslation();
  if (loading) return <Skeleton className="h-64 w-full" />;
  const p = (overview?.profile ?? {}) as Record<string, unknown>;
  const pick = <T = string,>(...keys: string[]): T | undefined => {
    for (const k of keys) {
      const v = p[k];
      if (v != null && v !== "") return v as T;
    }
    return undefined;
  };
  const legalForm =
    pick<string>("legal_form", "legalForm") ??
    (overview?.type ? String(overview.type).toUpperCase() : undefined);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="shadow-[0_2px_10px_rgba(68,83,113,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[12px] uppercase tracking-wide font-semibold text-[#7000FF]">{t("modules.soliq.profileTab.company")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row k={t("modules.soliq.profileTab.name")} v={pick("name", "statName")} />
          <Row k={t("modules.soliq.profileTab.stir")} v={pick("tin", "inn") ?? overview?.inn} />
          <Row k={t("modules.soliq.profileTab.legalForm")} v={legalForm} />
          <Row k={t("modules.soliq.profileTab.director")} v={pick("director_name", "directorName")} />
          <Row k={t("modules.soliq.profileTab.email")} v={pick("email")} />
          <Row k={t("modules.soliq.profileTab.phone")} v={pick("phone")} />
          <Row k={t("modules.soliq.profileTab.address")} v={pick("address")} />
        </CardContent>
      </Card>
      <Card className="shadow-[0_2px_10px_rgba(68,83,113,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[12px] uppercase tracking-wide font-semibold text-[#7000FF]">{t("modules.soliq.profileTab.taxProfile")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row k={t("modules.soliq.profileTab.taxMode")} v={pick("taxModeNameLatn", "taxModeNameUz", "taxModeNameRu", "tax_mode")} />
          <Row k={t("modules.soliq.profileTab.activityType")} v={pick("sectorNameLatn", "sectorNameUz", "sectorNameRu", "activity_type")} />
          <Row k={t("modules.soliq.profileTab.status")} v={pick("statusName", "status_name")} />
          <Row k={t("modules.soliq.profileTab.registeredAt")} v={pick("regDate", "reg_date")} />
          <Row k={t("modules.soliq.profileTab.vatNum")} v={pick("vatNumber", "vat_number")} />
          <Row k={t("modules.soliq.profileTab.vatDate")} v={pick("vatDate", "vat_date")} />
        </CardContent>
      </Card>
      <Card className="md:col-span-2 shadow-[0_2px_10px_rgba(68,83,113,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-[12px] uppercase tracking-wide font-semibold text-[#7000FF]">{t("modules.soliq.profileTab.taxInspectorate")}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Row k={t("modules.soliq.profileTab.name")} v={pick("taxPayerTypeNameLatn", "taxPayerTypeNameUz", "taxPayerTypeNameRu")} />
          <Row k={t("modules.soliq.profileTab.phone")} v={pick("tax_office_phone", "taxOfficePhone")} />
          <Row k={t("modules.soliq.profileTab.email")} v={pick("tax_office_email", "taxOfficeEmail")} />
          <Row k={t("modules.soliq.profileTab.address")} v={pick("tax_office_address", "taxOfficeAddress")} />
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  const empty = v == null || v === "";
  return (
    <div className="flex justify-between items-baseline gap-3 border-b border-[#F0F1F3] py-2.5 last:border-b-0">
      <span className="text-[13px] text-[#83888B] shrink-0">{k}</span>
      <span className={`text-[14px] text-right truncate max-w-[60%] ${empty ? "text-[#9DA4A8]" : "font-medium text-[#101010]"}`}>
        {empty ? "—" : v}
      </span>
    </div>
  );
}
