/**
 * SOLIQ module — nested routing under /soliq/*
 *
 * Пилот P26015 (AIBA × Kapitalbank): остаются только налоговые обязательства
 * (tax-grid + company detail с отчётами/платежами) и касса (cheques).
 * Mails / ijara / tax-payments вне ТЗ — убраны.
 *
 *   /soliq                       → tax-grid landing
 *   /soliq/company/:id           → per-company detail
 *   /soliq/cheques               → cheques (kassa)
 */

import { Routes, Route } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Receipt, Table2, ReceiptText } from "lucide-react";
import { ModuleShell, type ModuleSection } from "@/components/ui/module-shell";
import { SoliqPage } from "./page";
import { SoliqCompanyDetail } from "./company-detail";
import { SoliqChequesPage } from "./cheques";

export function SoliqRouter() {
  const { t } = useTranslation();
  const SECTIONS: ModuleSection[] = [
    { key: "grid", label: t("modules.soliq.nav.grid"), icon: <Table2 className="size-4" />, to: "/soliq", end: true },
    { key: "cheques", label: t("modules.soliq.nav.cheques"), icon: <ReceiptText className="size-4" />, to: "/soliq/cheques" },
  ];

  return (
    <ModuleShell
      title={t("modules.soliq.title")}
      icon={<Receipt className="size-6" />}
      sections={SECTIONS}
    >
      <Routes>
        <Route index element={<SoliqPage />} />
        <Route path="company/:id" element={<SoliqCompanyDetail />} />
        <Route path="cheques" element={<SoliqChequesPage />} />
      </Routes>
    </ModuleShell>
  );
}
