import { useMemo, useState } from "react";
import { useAccountTxCount } from "./api";
import { AccountDetailSheet } from "./account-detail-sheet";
import { useTranslation } from "react-i18next";
import { useUrlState, useUrlNumber, useUrlSearch } from "@/shared/hooks/use-url-state";
import {
  Landmark, Search, ChevronLeft, ChevronRight, ArrowDownLeft, ArrowUpRight, Wallet, Building, PenLine,
  ArrowLeftRight, AlertTriangle,
} from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ModuleShell, type ModuleSection } from "@/components/ui/module-shell";
import {
  useBankTransactions, useTxSummary, useBankAccounts, usePendingPayments, type TxParams,
} from "./api";
import { acctName, acctBank, type BankTransaction, type BankAccount } from "./types";
import { CashflowView } from "./cashflow";
import { EmployeesView } from "./employees";
import { PayrollView } from "./payroll";
import { PaymentsView, BankConnectPanel } from "./payments";
import { AccountScrapeButton } from "./account-scrape-button";

// Bank amounts/balances arrive in tiyin (minor units) — the last two digits
// are the fractional part. Divide by 100 and always show 2 decimals.
const money = (v?: string | number | null) => {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return (n / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Account "HOLAT" badge. Bank state codes are per-bank: Ipak Yo'li marks an
// open account state=1, Kapitalbank state=2 ("Утвержден/открыт"), and other
// codes mean various restricted states (e.g. Kapital state=28 "blocked by
// debit"). The old check only recognised state===1, so every Kapital account
// rendered a bare "—" even when open with a full transaction history. Treat
// the known open states (or an explicit is_active) as active; for any other
// non-empty state show the bank's own state_name (informative) instead of a
// meaningless dash; fall back to "—" only when we truly know nothing.
function accountStatusBadge(a: BankAccount, t: (k: string) => string) {
  const anyA = a as unknown as { state_name?: string; stateName?: string; is_active?: boolean };
  const active =
    anyA.is_active === true || a.state === 1 || a.state === 2 || (a.state as unknown) === "active";
  if (active) {
    return <Badge variant="success">{t("modules.bank.accounts.statusActive")}</Badge>;
  }
  const label = anyA.state_name || anyA.stateName;
  if (label) {
    return (
      <Badge variant="warning" title={label} className="max-w-[10rem] truncate">
        {label}
      </Badge>
    );
  }
  return <Badge variant="muted">—</Badge>;
}
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");
const cpName = (t: BankTransaction) => (t.direction === "in" ? t.senderName : t.receiverName) || "—";
const cpInn = (t: BankTransaction) => (t.direction === "in" ? t.senderInn : t.receiverInnOrPinfl) || "";

type BankView = "tx" | "accounts" | "cashflow" | "employees" | "payroll" | "payments";

export function BankPage() {
  const { t } = useTranslation();
  const companyId = useCompany((s) => s.current)?.id ?? null;
  const [viewRaw, setViewRaw] = useUrlState("view", "tx");
  const view = viewRaw as BankView;
  const setView = (v: BankView) => setViewRaw(v);

  // Пилот P26015: только остатки и обороты по р/с — cashflow/employees/
  // payroll/payments вне ТЗ и скрыты.
  const BANK_NAV: ModuleSection[] = [
    { key: "tx", label: t("modules.bank.nav.tx"), icon: <ArrowLeftRight className="size-4" /> },
    { key: "accounts", label: t("modules.bank.nav.accounts"), icon: <Wallet className="size-4" /> },
  ];

  if (!companyId)
    return <div className="rounded-2xl border border-[#F0F1F3] bg-white p-8 text-center text-muted-foreground">{t("modules.bank.noCompany")}</div>;

  // Cards make sense only on the tx/accounts overview; feature pages own their layout.
  const showCards = view === "tx" || view === "accounts";
  const sectionLabel = BANK_NAV.find((s) => s.key === view)?.label;

  return (
    <ModuleShell
      title={t("modules.bank.title")}
      icon={<Landmark className="size-6" />}
      subtitle={sectionLabel}
      sections={BANK_NAV}
      active={view}
      onSelect={(k) => setView(k as BankView)}
    >
      {showCards && <SummaryCards companyId={companyId} />}
      {view === "tx" && <TransactionsView companyId={companyId} />}
      {view === "accounts" && <AccountsView companyId={companyId} />}
      {view === "cashflow" && <CashflowView companyId={companyId} />}
      {view === "employees" && <EmployeesView companyId={companyId} />}
      {view === "payroll" && <PayrollView companyId={companyId} />}
      {view === "payments" && <PaymentsView companyId={companyId} />}
    </ModuleShell>
  );
}

function SummaryCards({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const { data: acc } = useBankAccounts(companyId);
  const { data: pending } = usePendingPayments(companyId);
  const s = acc?.summary;
  const pendingN = pending?.total ?? pending?.items?.length ?? 0;
  // Kartoteka №2 debt is company-level, repeated on each Kapital account row.
  // Pick the first non-null value; show the tile only when the bank reports it.
  const k2Raw = (acc?.items ?? [])
    .map((a) => a.k2_debt)
    .find((v) => v != null && v !== "");
  const hasK2 = k2Raw != null;
  // tile tuple: [label, value, icon, accent, danger?]
  const cards: [string, string, React.ReactNode, boolean, boolean?][] = [
    [t("modules.bank.summary.totalBalance"), money(s?.total_balance), <Wallet className="size-4" />, false],
    [t("modules.bank.summary.accounts"), String(s?.accounts ?? 0), <Landmark className="size-4" />, false],
    [t("modules.bank.summary.banks"), String(s?.banks ?? 0), <Building className="size-4" />, false],
    [t("modules.bank.summary.signPending"), String(pendingN), <PenLine className="size-4" />, true],
  ];
  if (hasK2) {
    cards.push([
      t("modules.bank.summary.kartoteka2", "Kartoteka №2 (qarz)"),
      money(k2Raw as string | number),
      <AlertTriangle className="size-4" />,
      false,
      true,
    ]);
  }
  return (
    <div className={`grid grid-cols-2 gap-3 ${hasK2 ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
      {cards.map(([k, v, icon, accent, danger]) => {
        const warn = accent && Number(v) > 0;
        const debt = danger && Number(v) > 0;
        return (
          // KB-плитка: светло-серый фон без рамки (внутри белого контейнера).
          <div key={k} className={`rounded-2xl p-4 ${
            debt ? "bg-[#FAD6D9]/50"
              : warn ? "bg-[#FCEBD9]"
              : "bg-[#F7F8F9]"}`}>
            <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#83888B]">{icon} {k}</div>
            <div className={`mt-1 text-[20px] font-bold tabular-nums ${debt ? "text-[#F24835]" : "text-[#101010]"}`}>{v}</div>
          </div>
        );
      })}
    </div>
  );
}

type Tab = "all" | "in" | "out" | "pending";

function TransactionsView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const [tabRaw, setTabRaw] = useUrlState("tab", "all");
  const tab = tabRaw as Tab;
  const [dateFrom, setDateFrom] = useUrlState("from");
  const [dateTo, setDateTo] = useUrlState("to");
  const [accountId, setAccountId] = useUrlState("account");
  const [searchInput, searchCommitted, setSearchInput] = useUrlSearch("q");
  const [page, setPage] = useUrlNumber("page", 0);
  const [perPage, setPerPage] = useUrlNumber("perPage", 20);
  const { data: acc } = useBankAccounts(companyId);

  const baseParams = useMemo(() => {
    const p: Omit<TxParams, "skip" | "limit"> = {};
    if (dateFrom) p.date_from = dateFrom;
    if (dateTo) p.date_to = dateTo;
    if (accountId) p.account_ids = accountId;
    if (searchCommitted.trim()) p.search = searchCommitted.trim();
    return p;
  }, [dateFrom, dateTo, accountId, searchCommitted]);

  const direction = tab === "in" ? "in" : tab === "out" ? "out" : undefined;
  const { data: summary } = useTxSummary(companyId, baseParams);
  const { data: pending } = usePendingPayments(companyId);
  const { data, isLoading } = useBankTransactions(companyId, {
    ...baseParams, ...(direction ? { direction } : {}), skip: page * perPage, limit: perPage,
  });
  const [detail, setDetail] = useState<BankTransaction | null>(null);

  const counts = {
    all: summary?.transactions_count ?? 0, in: summary?.income_count ?? 0,
    out: summary?.expense_count ?? 0, pending: pending?.total ?? pending?.items?.length ?? 0,
  };
  const TABS: [Tab, string][] = [
    ["all", t("modules.bank.tabs.all")],
    ["in", t("modules.bank.tabs.in")],
    ["out", t("modules.bank.tabs.out")],
    ["pending", t("modules.bank.tabs.pending")],
  ];
  const total = data?.total ?? 0;
  const rows = data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 border-b border-border flex-wrap">
          {TABS.map(([k, lbl]) => (
            <Button key={k} variant="ghost" onClick={() => { setTabRaw(k); setPage(0); }}
              className={`h-auto rounded-none px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors hover:bg-transparent ${tab === k ? "border-primary text-primary hover:text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {lbl}<span className="ml-1.5 text-xs text-muted-foreground">{counts[k]}</span>
            </Button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <DatePicker value={dateFrom} onChange={(v) => { setDateFrom(v); setPage(0); }} className="w-40 h-9" />
        <span className="text-muted-foreground">—</span>
        <DatePicker value={dateTo} onChange={(v) => { setDateTo(v); setPage(0); }} className="w-40 h-9" />
        <Select value={accountId || "all"} onValueChange={(v) => { setAccountId(v === "all" ? "" : v); setPage(0); }}>
          <SelectTrigger className="w-56 h-9"><SelectValue placeholder={t("modules.bank.filters.allAccounts")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("modules.bank.filters.allAccounts")}</SelectItem>
            {(acc?.items ?? []).map((a) => <SelectItem key={a.id} value={a.id}>{acctName(a)}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchInput} onChange={(e) => { setSearchInput(e.target.value); setPage(0); }} placeholder={t("modules.bank.filters.searchPlaceholder")} className="pl-8 w-48 h-9" />
        </div>
      </div>

      {/* Income / Expense summary */}
      {summary && (
        <div className="flex items-center gap-4 text-sm rounded-2xl border border-[#F0F1F3] bg-white px-3 py-2 flex-wrap animate-in fade-in-0 duration-300">
          <span className="inline-flex items-center gap-1.5 text-success"><ArrowDownLeft className="size-4" /> {t("modules.bank.summary.income")}: <span className="tabular-nums font-medium">{money(summary.total_income)}</span></span>
          <span className="inline-flex items-center gap-1.5 text-destructive"><ArrowUpRight className="size-4" /> {t("modules.bank.summary.expense")}: <span className="tabular-nums font-medium">{money(summary.total_expense)}</span></span>
          <span className="text-muted-foreground ml-auto">{t("modules.bank.summary.totalCount", { count: summary.transactions_count ?? 0 })}</span>
        </div>
      )}

      <>
          <div className="rounded-2xl border border-[#F0F1F3] bg-white overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="">{t("modules.bank.tx.date")}</TableHead>
                <TableHead className="">{t("modules.bank.tx.counterparty")}</TableHead>
                <TableHead className="">{t("modules.bank.tx.purpose")}</TableHead>
                <TableHead className="text-right">{t("modules.bank.tx.amount")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                      <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                      <TableCell><div className="space-y-1.5"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-2.5 w-24" /></div></TableCell>
                      <TableCell><Skeleton className="h-3.5 w-56" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-3.5 w-24 ml-auto" /></TableCell>
                    </TableRow>
                  ))
                ) : ((tab === "pending" ? (pending?.items?.length ?? 0) : rows.length) === 0) ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="py-16">
                      <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                        <div className="size-14 rounded-full bg-muted grid place-items-center">
                          <ArrowLeftRight className="size-7 text-muted-foreground" />
                        </div>
                        <div className="text-sm font-medium text-foreground">{t("modules.bank.tx.empty")}</div>
                        {searchCommitted.trim() && (
                          <Button variant="outline" size="sm" onClick={() => { setSearchInput(""); setPage(0); }}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {(tab === "pending" ? [] : rows).map((t, i) => (
                      <TableRow key={t.id} className="cursor-pointer hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }} onClick={() => setDetail(t)}>
                        <TableCell className="whitespace-nowrap">{fmtDate(t.documentDate)}</TableCell>
                        <TableCell><div className="font-medium">{cpName(t)}</div>{cpInn(t) && <div className="text-xs text-muted-foreground tabular-nums">{cpInn(t)}</div>}</TableCell>
                        <TableCell className="max-w-md"><div className="line-clamp-2 text-xs text-muted-foreground">{t.paymentPurpose ?? "—"}</div></TableCell>
                        <TableCell className={`text-right tabular-nums font-semibold whitespace-nowrap ${t.direction === "in" ? "text-success" : "text-destructive"}`}>
                          {t.direction === "in" ? "+" : "−"}{money(t.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    {tab === "pending" && (pending?.items ?? []).map((p, i) => {
                      const it = p as Record<string, unknown>;
                      return (
                        <TableRow key={i} className="hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                          <TableCell className="whitespace-nowrap">{fmtDate((it.created || it.created_at) as string)}</TableCell>
                          <TableCell className="font-medium">{(it.receiver_name || it.receiverName || "—") as string}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{(it.status || it.stateName || "—") as string}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">{money(it.amount as number)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </>
                )}
              </TableBody>
            </Table>
          </div>

          {tab !== "pending" && total > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button>
              <span className="text-muted-foreground">{page * perPage + 1}–{Math.min((page + 1) * perPage, total)} / {total}</span>
              <Button variant="outline" size="sm" disabled={(page + 1) * perPage >= total} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button>
              <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); setPage(0); }}>
                <SelectTrigger className="w-24 h-8 ml-2"><SelectValue /></SelectTrigger>
                <SelectContent>{[20, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{t("modules.bank.pagination.perPage", { n })}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </>

      <TxDetail tx={detail} onClose={() => setDetail(null)} />
    </div>
  );
}

function TxDetail({ tx, onClose }: { tx: BankTransaction | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Sheet open={!!tx} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>{t("modules.bank.txDetail.title")}</SheetTitle></SheetHeader>
        {tx && (
          <div className="mt-4 space-y-4">
            <div className={`text-2xl font-bold tabular-nums ${tx.direction === "in" ? "text-success" : "text-destructive"}`}>
              {tx.direction === "in" ? "+" : "−"}{money(tx.amount)} <span className="text-sm font-normal text-muted-foreground">{t("modules.bank.txDetail.som")}</span>
            </div>
            <Section title={t("modules.bank.txDetail.general")}>
              <Row k={t("modules.bank.txDetail.date")} v={fmtDate(tx.documentDate)} />
              <Row k={t("modules.bank.txDetail.direction")} v={tx.direction === "in" ? t("modules.bank.txDetail.incoming") : t("modules.bank.txDetail.outgoing")} />
              <Row k={t("modules.bank.txDetail.docNumber")} v={tx.paymentNumber} />
              <Row k={t("modules.bank.txDetail.bank")} v={tx.bank_name} />
              {tx.stateName && <Row k={t("modules.bank.txDetail.status")} v={tx.stateName} />}
            </Section>
            <Section title={t("modules.bank.txDetail.sender")}>
              <Row k={t("modules.bank.txDetail.name")} v={tx.senderName} /><Row k={t("modules.bank.txDetail.inn")} v={tx.senderInn} />
              <Row k={t("modules.bank.txDetail.account")} v={tx.senderAccountNumber} /><Row k={t("modules.bank.txDetail.mfo")} v={tx.senderBranch} />
            </Section>
            <Section title={t("modules.bank.txDetail.receiver")}>
              <Row k={t("modules.bank.txDetail.name")} v={tx.receiverName} /><Row k={t("modules.bank.txDetail.inn")} v={tx.receiverInnOrPinfl} />
              <Row k={t("modules.bank.txDetail.account")} v={tx.receiverAccountNumber} /><Row k={t("modules.bank.txDetail.mfo")} v={tx.receiverBranch} />
            </Section>
            <Section title={t("modules.bank.txDetail.purpose")}>
              <div className="px-4 py-2.5 text-sm">{tx.paymentPurpose ?? "—"}</div>
            </Section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-2xl border border-[#F0F1F3] bg-white"><div className="px-4 py-2 border-b border-border text-sm font-medium">{title}</div><dl className="divide-y divide-border">{children}</dl></div>;
}
function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  return <div className="flex items-start gap-3 px-4 py-2 text-sm"><dt className="w-28 shrink-0 text-muted-foreground">{k}</dt><dd className="flex-1 font-medium break-all">{v || "—"}</dd></div>;
}

function AccountsView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const { data, isLoading } = useBankAccounts(companyId);
  const items = data?.items ?? [];
  // Detail sheet (right drawer): account metadata + its own txn feed. State
  // lives at the parent so the per-row click handler can open it; null = closed.
  const [detailAcc, setDetailAcc] = useState<BankAccount | null>(null);
  return (
    <div className="space-y-4">
      {/* Bank ulash / o'chirish / qayta ulash — connection management lives here */}
      <BankConnectPanel companyId={companyId} />
      <div className="rounded-2xl border border-[#F0F1F3] bg-white overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead className="">{t("modules.bank.accounts.statusCol")}</TableHead>
            <TableHead className="">{t("modules.bank.accounts.accountCol")}</TableHead>
            <TableHead className="">{t("modules.bank.accounts.bankCol")}</TableHead>
            <TableHead className="text-right">{t("modules.bank.accounts.balanceCol")}</TableHead>
            <TableHead className="text-right">{t("modules.bank.accounts.txCountCol", "Tranzaksiyalar")}</TableHead>
            <TableHead className="w-[8.5rem] text-right">{t("modules.bank.accounts.actionsCol", "Amallar")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><div className="space-y-1.5"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-2.5 w-24" /></div></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-24 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-10 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-7 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Wallet className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.bank.accounts.empty")}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((a: BankAccount, i) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  index={i}
                  companyId={companyId}
                  onOpen={() => setDetailAcc(a)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <AccountDetailSheet
        open={!!detailAcc}
        onClose={() => setDetailAcc(null)}
        companyId={companyId}
        account={detailAcc}
      />
    </div>
  );
}

// One row of the Hisoblar table. Lives in its own component so each row can
// call `useAccountTxCount` (hooks can't go inside `.map()`). Row body
// (everything except the trailing Yuklash button) is the click target.
function AccountRow({
  account: a, index: i, companyId, onOpen,
}: {
  account: BankAccount;
  index: number;
  companyId: number;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const { data } = useAccountTxCount(companyId, a.id);
  const count = data?.total;
  return (
    <TableRow
      className="hover:bg-muted/60 cursor-pointer animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
      style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
      onClick={onOpen}
    >
      <TableCell>{accountStatusBadge(a, t)}</TableCell>
      <TableCell><div className="tabular-nums text-xs">{a.number}</div>{(a.short_name || a.custom_name) && <div className="text-xs text-muted-foreground">{a.custom_name || a.short_name}</div>}</TableCell>
      <TableCell className="text-muted-foreground text-sm max-w-xs truncate">{acctBank(a)}</TableCell>
      <TableCell className="text-right tabular-nums font-semibold">{money(a.current_balance)}</TableCell>
      <TableCell className="text-right tabular-nums text-sm">
        {count == null ? "—" : count}
      </TableCell>
      {/* Stop click bubbling so the Yuklash button doesn't also open detail */}
      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
        <AccountScrapeButton companyId={companyId} account={a} />
      </TableCell>
    </TableRow>
  );
}
