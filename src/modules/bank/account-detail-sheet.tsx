import { useTranslation } from "react-i18next";
import { Wallet, Landmark, ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import { useBankTransactions } from "./api";
import { acctBank, type BankAccount, type BankTransaction } from "./types";

// Bank amounts/balances are in tiyin (minor units) — divide by 100, 2 decimals.
const money = (v?: string | number | null) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return (n / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");
const cpName = (t: BankTransaction) =>
  (t.direction === "in" ? t.senderName : t.receiverName) || "—";

// Right-side drawer that shows account metadata + the account's own
// transactions feed. Lazy-loads transactions only when the sheet is open.
export function AccountDetailSheet({
  open, onClose, companyId, account,
}: {
  open: boolean;
  onClose: () => void;
  companyId: number;
  account: BankAccount | null;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useBankTransactions(
    open && account ? companyId : null,
    { account_ids: account?.id ?? "", limit: 50 },
  );
  const items = (data?.items ?? []) as BankTransaction[];

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Wallet className="size-5" />
            {account?.custom_name || account?.short_name || account?.name || account?.number || "—"}
          </SheetTitle>
        </SheetHeader>

        {account && (
          <div className="mt-4 rounded-lg border border-border bg-card p-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {t("modules.bank.accounts.accountCol", "Hisob")}
              </span>
              <span className="tabular-nums font-medium">{account.number}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Landmark className="size-3.5" />
                {t("modules.bank.accounts.bankCol", "Bank")}
              </span>
              <span>{acctBank(account)}</span>
            </div>
            {account.currency && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Valyuta</span>
                <span>{account.currency}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {t("modules.bank.accounts.balanceCol", "Balans")}
              </span>
              <span className="tabular-nums font-semibold">{money(account.current_balance)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {t("modules.bank.accounts.statusCol", "Holat")}
              </span>
              <Badge variant={account.state === 1 || account.state === "active" ? "success" : "muted"}>
                {account.state === 1 || account.state === "active"
                  ? t("modules.bank.accounts.statusActive", "Faol")
                  : "—"}
              </Badge>
            </div>
          </div>
        )}

        <div className="mt-6">
          <div className="px-1 pb-2 text-sm font-medium flex items-center justify-between">
            <span>Tranzaksiyalar</span>
            <span className="text-xs text-muted-foreground">
              {data?.total != null ? `${data.total} ta` : ""}
            </span>
          </div>
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Sana</TableHead>
                  <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">Kontragent</TableHead>
                  <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">Summa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="hover:bg-transparent">
                      <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-3.5 w-24 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={3} className="py-10 text-center text-sm text-muted-foreground">
                      Tranzaksiya yo'q
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="text-xs tabular-nums">{fmtDate(tx.documentDate)}</TableCell>
                      <TableCell className="text-sm">
                        <div className="flex items-center gap-1.5">
                          {tx.direction === "in" ? (
                            <ArrowDownLeft className="size-3.5 text-emerald-600 shrink-0" />
                          ) : (
                            <ArrowUpRight className="size-3.5 text-rose-600 shrink-0" />
                          )}
                          <span className="truncate max-w-[18rem]">{cpName(tx)}</span>
                        </div>
                        {tx.paymentPurpose && (
                          <div className="text-[11px] text-muted-foreground truncate max-w-[22rem]">
                            {tx.paymentPurpose}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {money(tx.amount)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
