/**
 * OnecCounterpartyPage — full-page 1C reconciliation detail (cloud-parity
 * rebuild of aiba_onec sverka-detail.{php,js,css}).
 *
 * Layout: DetailPage (left 380px sidebar of <DetailCard>s + right viewer).
 *
 * Left sidebar (mirrors cloud sverka-detail header info + meta):
 *   - Header card: avatar + name + INN + Debet / Kredit / Saldo balances
 *   - Contract picker card (existing contracts derived from loaded txs)
 *   - Period / meta card (period span, hasPaymentData, doc count)
 *
 * Main viewer:
 *   - Tabs: "Akt sverka" (cloud sverka transaction table) / "Hujjatlar"
 *     (compact doc list derived from the same transactions, mirroring the
 *     cloud sverka modal's document detail pattern but flattened to a list)
 *   - Stats strip (cloud sverka-strip) + reconciliation table with running
 *     saldo, column orders matching cloud sverka-detail (Sana / Hujjat /
 *     Debet / Kredit / Saldo plus Tip / Raqam / Shartnoma).
 *
 * URL: /onec/counterparties/:inn — :inn is the counterparty's TIN. We
 * locate the counterparty by INN in the cached list (useCounterparties);
 * detail fetches use the resolved `name` (the backend keys by name).
 */
import { useMemo, useState } from "react";
import { useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import {
  Building2,
  FileText,
  GitCompare,
  Printer,
  RefreshCw,
  Scale,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DetailCard,
  DetailPage,
  DetailRow,
} from "@/components/ui/detail-page";
import { Reveal } from "@/components/ui/reveal";

import { useCompany } from "@/shared/store/company";
import {
  useCounterparties,
  useCounterpartyDetail,
  type Counterparty,
} from "./api";

// ── helpers (mirror cloud sverka-detail.js fmt / fmtSigned) ────────────────

const fmt = (v: number | string | null | undefined) => {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
};

const fmtSigned = (v: number | string | null | undefined) => {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (Number.isNaN(n)) return "—";
  const s = Math.round(Math.abs(n)).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  if (n > 0) return `+${s}`;
  if (n < 0) return `-${s}`;
  return "0";
};

function signedTone(v: number) {
  if (v > 0) return "text-success";
  if (v < 0) return "text-destructive";
  return "text-muted-foreground";
}

const AVATAR_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c",
  "#16a34a", "#0891b2", "#4f46e5", "#059669",
];
function avatarColor(name?: string | null) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = (name || "").charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function avatarInitial(name?: string | null) {
  if (!name) return "?";
  const m = name.trim().match(/[a-zA-Zа-яА-ЯёЁўЎқҚғҒҳҲ]/g);
  if (!m) return "?";
  return (m.length >= 2 ? m[0] + m[1] : m[0]).toUpperCase();
}

// Cloud DOC_TYPE_LABELS — i18n keys
const DOC_TYPE_KEYS: Record<string, string> = {
  sale: "modules.onec.docType.sale",
  purchase: "modules.onec.docType.purchase",
  payment_in: "modules.onec.docType.paymentIn",
  payment_out: "modules.onec.docType.paymentOut",
  refund_out: "modules.onec.docType.refundOut",
  refund_in: "modules.onec.docType.refundIn",
};

const docTypeBadgeVariant = (t: string): "success" | "warning" | "info" | "danger" | "secondary" | "muted" => {
  switch (t) {
    case "sale": return "info";
    case "purchase": return "warning";
    case "payment_in": return "success";
    case "payment_out": return "danger";
    case "refund_out": return "secondary";
    case "refund_in": return "success";
    default: return "muted";
  }
};

// Tab keys ─ "Akt sverka" (main) / "Hujjatlar" (per-doc list)
type TabKey = "reconciliation" | "documents";

// ── Page ────────────────────────────────────────────────────────────────────

export function OnecCounterpartyPage() {
  const { t } = useTranslation();
  const { inn: rawInn } = useParams<{ inn: string }>();
  const innParam = decodeURIComponent(rawInn || "");
  const companyId = useCompany((s) => s.current)?.id ?? null;

  // Reuse the list hook to look up the counterparty by INN (or, as a
  // fallback, by 1C internal code — some CPs have no INN). We don't add a
  // new endpoint; the cached list already carries everything.
  const { data: listData, isLoading: listLoading, refetch: refetchList, isFetching: listFetching } =
    useCounterparties(companyId ?? 0);

  const counterparty: Counterparty | null = useMemo(() => {
    if (!listData?.counterparties) return null;
    return (
      listData.counterparties.find((c) => c.inn === innParam) ||
      listData.counterparties.find((c) => c.code === innParam) ||
      null
    );
  }, [listData, innParam]);

  // Contract picker — selected contract is passed to the detail hook, which
  // re-issues the request with the ?contract= query param the backend
  // accepts. Empty string = "all contracts".
  const [contract, setContract] = useState<string>("");
  // Active sub-tab is navigational → URL so refresh/deep-link reopens it.
  const [tabRaw, setTab] = useUrlState("tab", "reconciliation");
  const tab = tabRaw as TabKey;

  const cpName = counterparty?.name ?? null;
  const {
    data: detail,
    isLoading: detailLoading,
    isFetching: detailFetching,
    refetch: refetchDetail,
  } = useCounterpartyDetail(companyId ?? 0, cpName, contract || null);

  // Derive available contracts from loaded transactions (cloud sources this
  // from a separate /reconciliation-contracts endpoint; the POC backend
  // doesn't expose it, but every tx carries a contract field so we can build
  // the same picker in-page without a round-trip).
  const contracts: string[] = useMemo(() => {
    const s = new Set<string>();
    for (const tx of detail?.transactions ?? []) {
      if (tx.contract) s.add(tx.contract);
    }
    return Array.from(s).sort();
  }, [detail?.transactions]);

  // Refresh both list (balances) + detail (txs).
  const refetchAll = () => {
    refetchList();
    refetchDetail();
  };

  // ── No-company guard ────────────────────────────────────────────────────

  if (!companyId) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        {t("modules.onec.selectCompany")}
      </div>
    );
  }

  // ── Sidebar ─────────────────────────────────────────────────────────────

  const sidebar = (
    <Reveal loading={listLoading} skeleton={<SidebarSkeleton />}>
      {!counterparty ? (
        <NotFoundCard inn={innParam} />
      ) : (
        <Sidebar
          counterparty={counterparty}
          detail={detail}
          contracts={contracts}
          contract={contract}
          onContract={setContract}
          period={detail?.period ?? null}
        />
      )}
    </Reveal>
  );

  return (
    <DetailPage backTo="/onec" backLabel={t("modules.onec.sverka")} sidebar={sidebar}>
      <div className="p-6 space-y-6">
        {/* Header row — title + actions */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Scale className="size-5 text-primary" />
              <h1 className="text-2xl font-semibold leading-tight">
                {listLoading ? (
                  <Skeleton className="h-8 w-72" />
                ) : (
                  <span className="inline-block animate-in fade-in-0 duration-300">
                    {counterparty?.name || "—"}
                  </span>
                )}
              </h1>
            </div>
            {!listLoading && counterparty && (
              <p className="text-sm text-muted-foreground mt-0.5 font-mono animate-in fade-in-0 duration-300">
                {counterparty.inn
                  ? `INN: ${counterparty.inn}`
                  : counterparty.code
                    ? `${t("modules.onec.codePrefix")}: ${counterparty.code}`
                    : "—"}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              disabled={!detail || !detail.connected}
            >
              <Printer className="size-4 mr-1" />
              {t("modules.onec.actions.print")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={refetchAll}
              disabled={listFetching || detailFetching}
            >
              <RefreshCw className={`size-4 mr-1 ${listFetching || detailFetching ? "animate-spin" : ""}`} />
              {t("modules.onec.actions.refresh")}
            </Button>
          </div>
        </div>

        {/* Tabs — "Akt sverka" / "Hujjatlar" */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <div className="border-b border-border">
            <TabsList className="bg-transparent h-auto p-0 rounded-none gap-0 flex-wrap">
              <TabsTrigger
                value="reconciliation"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 text-sm gap-1.5"
              >
                <GitCompare className="size-4" />
                {t("modules.onec.sverka")}
                <span className="ml-1 rounded bg-muted px-1.5 text-xs text-muted-foreground">
                  {detail?.transactions?.length ?? 0}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="documents"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 text-sm gap-1.5"
              >
                <FileText className="size-4" />
                {t("modules.onec.documents")}
                <span className="ml-1 rounded bg-muted px-1.5 text-xs text-muted-foreground">
                  {detail?.transactions?.filter((t) => !!t.documentNumber).length ?? 0}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="reconciliation" className="mt-6">
            <ReconciliationTab
              loading={detailLoading}
              detail={detail}
            />
          </TabsContent>

          <TabsContent value="documents" className="mt-6">
            <DocumentsTab
              loading={detailLoading}
              transactions={detail?.transactions ?? []}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DetailPage>
  );
}

// ── Sidebar pieces ─────────────────────────────────────────────────────────

function SidebarSkeleton() {
  return (
    <>
      <DetailCard>
        <div className="flex flex-col items-center gap-2.5">
          <Skeleton className="size-16 rounded-xl" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-3 w-28" />
        </div>
      </DetailCard>
      {Array.from({ length: 2 }).map((_, i) => (
        <DetailCard key={i}>
          <Skeleton className="h-6 w-full" />
        </DetailCard>
      ))}
    </>
  );
}

function NotFoundCard({ inn }: { inn: string }) {
  const { t } = useTranslation();
  return (
    <DetailCard>
      <div className="text-center text-sm text-muted-foreground py-4">
        <Building2 className="mx-auto mb-2 size-8 opacity-50" />
        {t("modules.onec.counterpartyNotFound")}
        {inn && (
          <div className="mt-2 font-mono text-xs">INN/{t("modules.onec.codePrefix")}: {inn}</div>
        )}
      </div>
    </DetailCard>
  );
}

function Sidebar({
  counterparty,
  detail,
  contracts,
  contract,
  onContract,
  period,
}: {
  counterparty: Counterparty;
  detail: ReturnType<typeof useCounterpartyDetail>["data"];
  contracts: string[];
  contract: string;
  onContract: (v: string) => void;
  period: { from?: string; to?: string } | null;
}) {
  const { t } = useTranslation();
  // Balance card data — Debet / Kredit / Saldo (cloud's three core balances).
  // Debet = customerBalance>0 (they owe us). Kredit = supplierBalance>0
  // (we owe them). Saldo = netBalance (signed cross-side).
  const debit = counterparty.debit;
  const credit = counterparty.credit;
  const balance = counterparty.balance;

  const status: { label: string; variant: "success" | "danger" | "warning" | "secondary" | "muted" }[] = [];
  for (const s of counterparty.statuses) {
    if (s === "debtor") status.push({ label: t("modules.onec.cpStatus.debtor"), variant: "success" });
    else if (s === "creditor") status.push({ label: t("modules.onec.cpStatus.creditor"), variant: "danger" });
    else if (s === "customer_advance") status.push({ label: t("modules.onec.cpStatus.customerAdvance"), variant: "warning" });
    else if (s === "supplier_advance") status.push({ label: t("modules.onec.cpStatus.supplierAdvance"), variant: "secondary" });
    else status.push({ label: t("modules.onec.cpStatus.settled"), variant: "muted" });
  }

  return (
    <>
      {/* Header card — avatar + name + INN + status pills */}
      <DetailCard>
        <div className="flex flex-col items-center text-center gap-2">
          <div
            className="size-16 rounded-xl grid place-items-center text-white text-xl font-bold"
            style={{ background: avatarColor(counterparty.name) }}
          >
            {avatarInitial(counterparty.name)}
          </div>
          <div className="font-semibold text-foreground leading-tight">
            {counterparty.name || "—"}
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {counterparty.inn
              ? `INN: ${counterparty.inn}`
              : counterparty.code
                ? `${t("modules.onec.codePrefix")}: ${counterparty.code}`
                : "—"}
          </div>
          {status.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center mt-1">
              {status.map((s, i) => (
                <Badge key={i} variant={s.variant}>{s.label}</Badge>
              ))}
            </div>
          )}
        </div>
      </DetailCard>

      {/* Balances card — Debet / Kredit / Saldo */}
      <DetailCard
        title={
          <span className="flex items-center gap-1.5">
            <Scale className="size-4 text-muted-foreground" />
            {t("modules.onec.balances")}
          </span>
        }
      >
        <dl>
          <DetailRow
            k={t("modules.onec.columns.debit")}
            v={
              <span className={`tabular-nums ${debit > 0 ? "text-success font-semibold" : "text-foreground"}`}>
                {fmt(debit)}
              </span>
            }
            mono
          />
          <DetailRow
            k={t("modules.onec.columns.credit")}
            v={
              <span className={`tabular-nums ${credit > 0 ? "text-destructive font-semibold" : "text-foreground"}`}>
                {fmt(credit)}
              </span>
            }
            mono
          />
          <DetailRow
            k={t("modules.onec.columns.balance")}
            v={
              <span className={`tabular-nums font-semibold ${signedTone(balance)}`}>
                {fmtSigned(balance)}
              </span>
            }
            mono
            emphasize
          />
        </dl>
      </DetailCard>

      {/* Contract picker card */}
      <DetailCard
        title={
          <span className="flex items-center gap-1.5">
            <FileText className="size-4 text-muted-foreground" />
            {t("modules.onec.contract")}
          </span>
        }
      >
        {contracts.length === 0 ? (
          <div className="text-xs text-muted-foreground">{t("modules.onec.noContracts")}</div>
        ) : (
          <Select
            value={contract || "__all__"}
            onValueChange={(v) => onContract(v === "__all__" ? "" : v)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("modules.onec.allContracts")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t("modules.onec.allContractsCount", { count: contracts.length })}</SelectItem>
              {contracts.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </DetailCard>

      {/* Period / meta card */}
      <DetailCard
        title={
          <span className="flex items-center gap-1.5">
            <GitCompare className="size-4 text-muted-foreground" />
            {t("modules.onec.period")}
          </span>
        }
      >
        <dl>
          <DetailRow k={t("modules.onec.periodFrom")} v={period?.from || "—"} mono />
          <DetailRow k={t("modules.onec.periodTo")} v={period?.to || "—"} mono />
          <DetailRow
            k={t("modules.onec.sales")}
            v={<span className="tabular-nums">{fmt(counterparty.sales)}</span>}
            mono
          />
          <DetailRow
            k={t("modules.onec.purchases")}
            v={<span className="tabular-nums">{fmt(counterparty.purchases)}</span>}
            mono
          />
          {detail?.hasPaymentData && (
            <>
              <DetailRow
                k={t("modules.onec.docType.paymentIn")}
                v={<span className="tabular-nums">{fmt(counterparty.paymentsIn)}</span>}
                mono
              />
              <DetailRow
                k={t("modules.onec.docType.paymentOut")}
                v={<span className="tabular-nums">{fmt(counterparty.paymentsOut)}</span>}
                mono
              />
            </>
          )}
        </dl>
      </DetailCard>
    </>
  );
}

// ── Reconciliation tab (main sverka transaction table) ────────────────────

function StatTile({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={`mt-1 text-lg font-semibold tabular-nums font-mono ${tone ?? "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function ReconciliationTab({
  loading,
  detail,
}: {
  loading: boolean;
  detail: ReturnType<typeof useCounterpartyDetail>["data"];
}) {
  const { t } = useTranslation();
  const skeleton = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );

  if (!detail || !detail.connected) {
    return (
      <Reveal loading={loading} skeleton={skeleton}>
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center text-muted-foreground">
          <FileText className="mx-auto mb-3 size-8 opacity-50" />
          {t("modules.onec.notConnected")}
        </div>
      </Reveal>
    );
  }

  const ob = detail.openingBalance;
  const cb = detail.closingBalance;
  const td = detail.turnovers.totalDebit;
  const tc = detail.turnovers.totalCredit;
  const txs = detail.transactions;

  return (
    <div className="space-y-4 animate-in fade-in-0 duration-300">
      {/* Stats strip — opening / debit / credit / closing (cloud sverka-detail
          .sverka-strip on the detail view). */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label={t("modules.onec.stats.openingBalance")}
          value={fmtSigned(ob)}
          tone={signedTone(ob)}
        />
        <StatTile
          label={t("modules.onec.stats.debitTurnover")}
          value={fmt(td)}
          tone="text-success"
        />
        <StatTile
          label={t("modules.onec.stats.creditTurnover")}
          value={fmt(tc)}
          tone="text-destructive"
        />
        <StatTile
          label={t("modules.onec.stats.closingBalance")}
          value={fmtSigned(cb)}
          tone={signedTone(cb)}
        />
      </div>

      {/* Transaction table — column order mirrors cloud sverka-detail:
          # / Sana / Hujjat turi / Raqam / Shartnoma / Debet / Kredit / Saldo */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">#</TableHead>
              <TableHead>{t("modules.onec.columns.date")}</TableHead>
              <TableHead>{t("modules.onec.columns.docType")}</TableHead>
              <TableHead>{t("modules.onec.columns.number")}</TableHead>
              <TableHead>{t("modules.onec.contract")}</TableHead>
              <TableHead className="text-right">{t("modules.onec.columns.debit")}</TableHead>
              <TableHead className="text-right">{t("modules.onec.columns.credit")}</TableHead>
              <TableHead className="text-right">{t("modules.onec.columns.balance")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Opening balance row */}
            <TableRow className="bg-muted/40">
              <TableCell />
              <TableCell colSpan={4} className="font-medium">
                {t("modules.onec.stats.openingBalance")}
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell className={`text-right font-mono font-semibold tabular-nums ${signedTone(ob)}`}>
                {fmtSigned(ob)}
              </TableCell>
            </TableRow>

            {txs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {t("modules.onec.noDocs")}
                </TableCell>
              </TableRow>
            ) : (
              (() => {
                let running = ob;
                return txs.map((tx, i) => {
                  running += tx.debit - tx.credit;
                  return (
                    <TableRow key={i}>
                      <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {tx.date || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={docTypeBadgeVariant(tx.documentType)}>
                          {DOC_TYPE_KEYS[tx.documentType] ? t(DOC_TYPE_KEYS[tx.documentType]) : (tx.documentType || "—")}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {tx.documentNumber || "—"}
                      </TableCell>
                      <TableCell
                        className="max-w-[200px] truncate text-xs"
                        title={tx.contract || undefined}
                      >
                        {tx.contract || "—"}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-mono ${tx.debit ? "text-success" : ""}`}>
                        {tx.debit ? fmt(tx.debit) : ""}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-mono ${tx.credit ? "text-destructive" : ""}`}>
                        {tx.credit ? fmt(tx.credit) : ""}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-mono ${signedTone(running)}`}>
                        {fmtSigned(running)}
                      </TableCell>
                    </TableRow>
                  );
                });
              })()
            )}

            {/* Turnovers row */}
            <TableRow className="bg-muted/40">
              <TableCell />
              <TableCell colSpan={4} className="font-medium">
                {t("modules.onec.periodTurnover")}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold tabular-nums text-success">
                {fmt(td)}
              </TableCell>
              <TableCell className="text-right font-mono font-semibold tabular-nums text-destructive">
                {fmt(tc)}
              </TableCell>
              <TableCell />
            </TableRow>

            {/* Closing balance row */}
            <TableRow className="bg-muted/40 border-t-2 border-border">
              <TableCell />
              <TableCell colSpan={4} className="font-medium">
                {t("modules.onec.stats.closingBalance")}
              </TableCell>
              <TableCell />
              <TableCell />
              <TableCell className={`text-right font-mono font-semibold tabular-nums ${signedTone(cb)}`}>
                {fmtSigned(cb)}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Documents tab — compact per-doc list derived from txs ─────────────────

function DocumentsTab({
  loading,
  transactions,
}: {
  loading: boolean;
  transactions: NonNullable<ReturnType<typeof useCounterpartyDetail>["data"]>["transactions"];
}) {
  const { t } = useTranslation();
  const [searchInput, search, setSearch] = useUrlSearch("q");
  const [docType, setDocType] = useState<string>("__all__");

  // Aggregate by document number+type — each tx in the reconciliation table
  // already corresponds to a posted 1C document; this view just surfaces
  // them as a clean filterable list (mirrors the cloud sverka-detail's
  // modal pattern but lifted into the page so the user can search/filter
  // without clicking each row).
  const docs = useMemo(() => {
    const filtered = transactions.filter((t) => !!t.documentNumber);
    return filtered;
  }, [transactions]);

  const types = useMemo(() => {
    const s = new Set<string>();
    for (const d of docs) if (d.documentType) s.add(d.documentType);
    return Array.from(s).sort();
  }, [docs]);

  const visible = useMemo(() => {
    const s = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (docType !== "__all__" && d.documentType !== docType) return false;
      if (!s) return true;
      return (
        (d.documentNumber || "").toLowerCase().includes(s) ||
        (d.contract || "").toLowerCase().includes(s)
      );
    });
  }, [docs, search, docType]);

  // "No documents at all" is a true empty-state guard (no filter UI to show);
  // the filter row only makes sense once there is data to filter.
  if (!loading && transactions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/30 p-12 text-center text-muted-foreground animate-in fade-in-0 duration-300">
        <FileText className="mx-auto mb-3 size-8 opacity-50" />
        {t("modules.onec.noDocs")}
      </div>
    );
  }

  const filterActive = search.trim() !== "" || docType !== "__all__";

  return (
    <div className="space-y-3">
      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={searchInput}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("modules.onec.docSearchPlaceholder")}
          className="w-72"
        />
        <Select value={docType} onValueChange={setDocType}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder={t("modules.onec.columns.docType")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("modules.onec.allDocTypes")}</SelectItem>
            {types.map((dt) => (
              <SelectItem key={dt} value={dt}>{DOC_TYPE_KEYS[dt] ? t(DOC_TYPE_KEYS[dt]) : dt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-muted-foreground">
          {t("modules.onec.total")}: <strong className="text-foreground">{visible.length}</strong>
          {visible.length !== docs.length && (
            <> / {docs.length}</>
          )}
        </div>
      </div>

      {/* Documents table — header stays mounted; the body swaps
          loading → data → empty so the transition stays smooth. */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10">#</TableHead>
              <TableHead>{t("modules.onec.columns.date")}</TableHead>
              <TableHead>{t("modules.onec.columns.type")}</TableHead>
              <TableHead>{t("modules.onec.columns.number")}</TableHead>
              <TableHead>{t("modules.onec.contract")}</TableHead>
              <TableHead className="text-right">{t("modules.onec.columns.debit")}</TableHead>
              <TableHead className="text-right">{t("modules.onec.columns.credit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              // Table-shaped skeleton rows mirror the real columns.
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-3.5 w-5" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : visible.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <FileText className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.onec.noFilterMatch")}</div>
                    {filterActive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setSearch(""); setDocType("__all__"); }}
                      >
                        {t("common.clear", { defaultValue: "Tozalash" })}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              visible.map((d, i) => (
                <TableRow
                  key={i}
                  className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <TableCell className="text-muted-foreground tabular-nums">{i + 1}</TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {d.date || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={docTypeBadgeVariant(d.documentType)}>
                      {DOC_TYPE_KEYS[d.documentType] ? t(DOC_TYPE_KEYS[d.documentType]) : (d.documentType || "—")}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {d.documentNumber || "—"}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs" title={d.contract || undefined}>
                    {d.contract || "—"}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-mono ${d.debit ? "text-success" : ""}`}>
                    {d.debit ? fmt(d.debit) : ""}
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-mono ${d.credit ? "text-destructive" : ""}`}>
                    {d.credit ? fmt(d.credit) : ""}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

