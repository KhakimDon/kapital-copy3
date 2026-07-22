import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Download, Loader2, CheckCircle2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { BankAccount } from "./types";
import { useSubscriptions, useScrapeAccount, useSubConfig, useScrapeStatus } from "./payments-api";

// Per-row "Yuklash" / "Aktiv" button on the Hisoblar (accounts) table.
//
// Visible states (driven by sub.config.auto_scrape_account_numbers, the
// authoritative opt-in source, plus the live scrape-status poll):
//
//   "Yuklash"     — account NOT in the auto-scrape list. Click opts it in.
//   "Yuklanmoqda" — a scrape for this account is running right now: either the
//                   click's mutation is still in flight, OR the tenant
//                   bank-module reports the account in its in-progress set
//                   (the ~1-2 min Ipak Yo'li iterate). Poll flips it to
//                   "Aktiv" within a few seconds of the scrape finishing.
//   "Aktiv"       — account IS opted in and nothing is scraping it now.
//                   Periodic sweep keeps it fresh; click forces a refresh.
//
// The Yuklash mutation is fire-and-forget on the backend: it returns as soon
// as the account is opted in; the actual iterate happens in a background task
// on the tenant's bank-module. We surface that background work via the
// scrape-status poll so the row honestly reads "Yuklanmoqda" until it lands.
export function AccountScrapeButton({
  companyId, account,
}: { companyId: number; account: BankAccount }) {
  const { t } = useTranslation();
  const { data: subsData } = useSubscriptions(companyId);

  const sub = useMemo(() => {
    const items = (subsData?.items ?? []).filter((s) => !s.is_deleted);
    return items.find((s) => s.bank_id === account.bank_id) ?? null;
  }, [subsData, account.bank_id]);

  const subId = sub?.id ?? null;
  const acctNum = account.number ?? "";
  const { data: cfgData } = useSubConfig(companyId, subId);
  const { data: statusData } = useScrapeStatus(companyId, subId);
  const scrape = useScrapeAccount(companyId, subId);

  if (!subId || !acctNum) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  // API banks (Kapital / NBU / SQB / OFB / Davr / Anor) are auto-synced by
  // AIBA-central — no per-account opt-in list; every account is already
  // active and clicking forces a central re-sync. Playwright banks (Ipak /
  // Agro / Octo) use the opt-in auto-scrape flow ("Yuklash").
  //
  // Read the bank_type from the ACCOUNT, not the subscription: subs created
  // through the connect wizard don't always carry bank_type (it's null on the
  // central row), so `sub.bank_type` was empty for Ipak and the "unknown →
  // central" default wrongly showed every Ipak account as "Aktiv". The
  // account row always carries bank_type. Only treat a bank as central when
  // we positively know it is NOT a Playwright bank.
  const bankType = String((account.bank_type ?? sub?.bank_type ?? "")).trim();
  const playwrightBank = ["ipak_yoli", "agrobank", "octobank"].includes(bankType);
  const centralManaged = bankType !== "" && !playwrightBank;
  const optedIn =
    centralManaged || (cfgData?.config?.auto_scrape_account_numbers ?? []).includes(acctNum);

  const click = () => scrape.mutate({ account_number: acctNum });

  // Scraping right now = the click's request is still in flight, OR the tenant
  // bank-module reports this account in its live in-progress set.
  const scrapingNow =
    scrape.isPending || (statusData?.in_progress ?? []).includes(acctNum);

  if (scrapingNow) {
    return (
      <Button size="sm" variant="outline" disabled className="h-7 text-xs gap-1.5">
        <Loader2 className="size-3.5 animate-spin" />
        Yuklanmoqda…
      </Button>
    );
  }

  if (optedIn) {
    return (
      <Button
        size="sm"
        variant="ghost"
        onClick={click}
        className="h-7 text-xs gap-1.5 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
        title={t(
          "modules.bank.accounts.scrapeActive",
          "Avtomat yangilanib turibdi. Hozir qayta yangilash uchun bosing.",
        )}
      >
        <CheckCircle2 className="size-3.5" />
        Aktiv
        <RefreshCw className="size-3 opacity-50" />
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={click}
      className="h-7 text-xs gap-1.5"
      title={t(
        "modules.bank.accounts.scrapeTooltip",
        "Bu hisob bo'yicha tranzaksiyalarni avtomat yangilab turish",
      )}
    >
      <Download className="size-3.5" />
      Yuklash
    </Button>
  );
}
