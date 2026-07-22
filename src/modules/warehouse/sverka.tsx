import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlNumber, useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Circle,
  History,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { FadeIn, ErrorState } from "@/components/ui/reveal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  type CreateEntryBody,
  type Direction,
  type EntryType,
  type LedgerEntry,
  type SupplierDetail,
  type SverkaSupplier,
  type UpdateEntryBody,
  attachmentDownloadUrl,
  useCreateEntry,
  useDeleteAttachment,
  useEntryRevisions,
  useReconcile,
  useSupplierDetail,
  useSverkaSuppliers,
  useUpdateEntry,
  useUploadAttachment,
  useVerifyEntry,
} from "./sverka-api";

// ── helpers ──────────────────────────────────────────────────────────────────

const ENTRY_TYPE_KEYS: Record<EntryType, string> = {
  opening: "modules.warehouse.sverka.entryTypes.opening",
  wire: "modules.warehouse.sverka.entryTypes.wire",
  goods_received: "modules.warehouse.sverka.entryTypes.goods_received",
  return: "modules.warehouse.sverka.entryTypes.return",
  adjustment: "modules.warehouse.sverka.entryTypes.adjustment",
};

function fmtMoney(amount: string | number | null | undefined, cur = "UZS") {
  const n = Number(amount ?? 0);
  const s = (isFinite(n) ? n : 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${s} ${cur}`;
}

function primaryBalance(balances: Record<string, string>): { cur: string; v: number } | null {
  const keys = Object.keys(balances || {});
  if (!keys.length) return null;
  let best = { cur: keys[0], v: Number(balances[keys[0]]) };
  for (const k of keys) {
    const v = Number(balances[k]);
    if (Math.abs(v) > Math.abs(best.v)) best = { cur: k, v };
  }
  return best;
}

function balanceTone(v: number): "pos" | "neg" | "zero" {
  if (v > 0) return "pos";
  if (v < 0) return "neg";
  return "zero";
}
const TONE_TEXT: Record<string, string> = {
  pos: "text-destructive",
  neg: "text-success",
  zero: "text-muted-foreground",
};

function avatarColor(name: string) {
  let h = 0;
  const s = name || "?";
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return `hsl(${h % 360}, 50%, 55%)`;
}
function avatarInitial(name: string) {
  const s = (name || "?").trim();
  return s ? s.charAt(0).toUpperCase() : "?";
}

const today = () => new Date().toISOString().slice(0, 10);

// ── main view ──────────────────────────────────────────────────────────────────

export function SverkaView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const suppliersQ = useSverkaSuppliers(companyId);
  // Selected supplier + sidebar search live in the URL (namespaced `sv_`).
  // `sv_sup` = 0 means "none chosen yet" → fall back to auto-select-first.
  const [selectedNum, setSelectedNum] = useUrlNumber("sv_sup", 0, true);
  const selectedId = selectedNum || null;
  const setSelectedId = (id: number) => setSelectedNum(id);
  const [searchInput, search, setSearchInput] = useUrlSearch("sv_q");
  const [toast, setToast] = useState<string | null>(null);

  const suppliers = suppliersQ.data ?? [];
  // auto-select first supplier once loaded
  const effectiveId =
    selectedId ?? (suppliers.length ? suppliers[0].id : null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.inn || "").toLowerCase().includes(q)
    );
  }, [suppliers, search]);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
      {toast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-lg border border-border bg-card px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}

      {/* Left: contragents sidebar (NC in-module aside) */}
      <div className="rounded-lg border border-border bg-sidebar text-sidebar-foreground">
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("modules.warehouse.sverka.searchSupplier")}
              className="pl-8"
            />
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          {suppliersQ.isLoading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground animate-in fade-in-0 duration-300">
              {suppliers.length === 0
                ? t("modules.warehouse.sverka.noCounterparties")
                : t("modules.warehouse.sverka.notFound")}
            </div>
          ) : (
            <FadeIn>
              {filtered.map((s) => (
                <SupplierRow
                  key={s.id}
                  supplier={s}
                  active={s.id === effectiveId}
                  onClick={() => setSelectedId(s.id)}
                />
              ))}
            </FadeIn>
          )}
        </div>
      </div>

      {/* Right: ledger detail */}
      <div className="min-w-0">
        {effectiveId == null ? (
          <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
            {t("modules.warehouse.sverka.pickFromLeft")}
          </div>
        ) : (
          <SupplierLedger
            companyId={companyId}
            supplierId={effectiveId}
            onToast={flash}
          />
        )}
      </div>
    </div>
  );
}

function SupplierRow({
  supplier,
  active,
  onClick,
}: {
  supplier: SverkaSupplier;
  active: boolean;
  onClick: () => void;
}) {
  const pb = primaryBalance(supplier.balances);
  const tone = pb ? balanceTone(pb.v) : "zero";
  const extra = Object.keys(supplier.balances || {}).length - 1;
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={`flex h-auto w-full items-center justify-start gap-2.5 whitespace-normal rounded-md p-2 text-left font-normal ${
        active ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent" : "hover:bg-muted"
      }`}
    >
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-medium text-primary-foreground"
        style={{ background: avatarColor(supplier.name) }}
      >
        {avatarInitial(supplier.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{supplier.name}</span>
        {supplier.inn && (
          <span className="block truncate text-xs text-muted-foreground">
            INN: {supplier.inn}
          </span>
        )}
      </span>
      <span className="shrink-0 text-right">
        {pb ? (
          <span className={`text-sm font-semibold ${TONE_TEXT[tone]}`}>
            {fmtMoney(pb.v, pb.cur)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">0</span>
        )}
        {extra > 0 && (
          <span className="ml-1 text-xs text-muted-foreground">+{extra}</span>
        )}
      </span>
    </Button>
  );
}

// ── supplier ledger (right panel) ──────────────────────────────────────────────

type Filters = { from: string; to: string; type: "" | EntryType; q: string };

function SupplierLedger({
  companyId,
  supplierId,
  onToast,
}: {
  companyId: number;
  supplierId: number;
  onToast: (m: string) => void;
}) {
  const { t } = useTranslation();
  const detailQ = useSupplierDetail(companyId, supplierId);
  const reconcile = useReconcile(companyId);
  const createEntry = useCreateEntry(companyId);
  const updateEntry = useUpdateEntry(companyId, supplierId);

  const [modalEntry, setModalEntry] = useState<LedgerEntry | "new" | null>(null);
  // Ledger filters in the URL (namespaced `sv_`); search uses the debounced box.
  const [from, setFrom] = useUrlState("sv_from");
  const [to, setTo] = useUrlState("sv_to");
  const [typeRaw, setType] = useUrlState("sv_type");
  const [lqInput, lq, setLqInput] = useUrlSearch("sv_lq");
  const filters: Filters = { from, to, type: typeRaw as "" | EntryType, q: lq };
  const clearFilters = () => { setFrom(""); setTo(""); setType(""); setLqInput(""); };

  // opening-balance quick-set local state
  const [qAmount, setQAmount] = useState("");
  const [qDir, setQDir] = useState<Direction>("debit");
  const [qDate, setQDate] = useState(today());
  const [qSeeded, setQSeeded] = useState<number | null>(null);

  const detail = detailQ.data;

  // Seed quick-set from existing opening entry (once per supplier load).
  const openingEntry = detail?.entries.find((e) => e.entry_type === "opening") ?? null;
  if (detail && qSeeded !== supplierId) {
    setQSeeded(supplierId);
    setQAmount(openingEntry ? openingEntry.amount : "");
    setQDir(openingEntry ? openingEntry.direction : "debit");
    setQDate(openingEntry ? openingEntry.entry_date : today());
  }

  if (detailQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }
  if (!detail) {
    return <ErrorState onRetry={() => detailQ.refetch()} />;
  }

  const s = detail.supplier;
  const pb = primaryBalance(detail.balances);
  const tone = pb ? balanceTone(pb.v) : "zero";
  const balLabel =
    tone === "pos"
      ? t("modules.warehouse.sverka.balance.theyOweYou")
      : tone === "neg"
      ? t("modules.warehouse.sverka.balance.youOweThem")
      : t("modules.warehouse.sverka.balance.settled");

  function saveOpening() {
    const amt = qAmount.replace(/[^\d.]/g, "");
    if (!amt || Number(amt) <= 0) return onToast(t("modules.warehouse.sverka.errors.amountInvalid"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(qDate)) return onToast(t("modules.warehouse.sverka.errors.dateInvalid"));
    if (openingEntry) {
      updateEntry.mutate(
        { id: openingEntry.id, body: { direction: qDir, amount: amt, entry_date: qDate } },
        { onSuccess: () => onToast(t("modules.warehouse.sverka.toast.openingSaved")), onError: () => onToast(t("modules.warehouse.sverka.toast.error")) }
      );
    } else {
      createEntry.mutate(
        {
          supplier_id: supplierId,
          entry_type: "opening",
          direction: qDir,
          amount: amt,
          currency: "UZS",
          entry_date: qDate,
          notes: t("modules.warehouse.sverka.entryTypes.opening"),
        },
        { onSuccess: () => onToast(t("modules.warehouse.sverka.toast.openingSaved")), onError: () => onToast(t("modules.warehouse.sverka.toast.error")) }
      );
    }
  }

  function doReconcile() {
    reconcile.mutate(undefined, {
      onSuccess: (r) => {
        const tally = r.tally;
        if (r.note === "reconcile unavailable")
          onToast(t("modules.warehouse.sverka.reconcile.unavailable"));
        else if (tally.voided_now > 0)
          onToast(t("modules.warehouse.sverka.reconcile.voided", { voided: tally.voided_now, checked: tally.checked }));
        else if (tally.checked === 0) onToast(t("modules.warehouse.sverka.reconcile.noOpen"));
        else onToast(t("modules.warehouse.sverka.reconcile.noChange", { checked: tally.checked }));
      },
      onError: () => onToast(t("modules.warehouse.sverka.reconcile.error")),
    });
  }

  return (
    <FadeIn className="space-y-4">
      {/* header card */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{s.name}</h2>
            {s.inn && <p className="text-sm text-muted-foreground">INN: {s.inn}</p>}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={doReconcile}
              disabled={reconcile.isPending}
              title={t("modules.warehouse.sverka.reconcile.tooltip")}
            >
              <RefreshCw className={`size-4 ${reconcile.isPending ? "animate-spin" : ""}`} />
              {t("modules.warehouse.sverka.reconcile.button")}
            </Button>
            <Button size="sm" onClick={() => setModalEntry("new")}>
              <Plus className="size-4" /> {t("modules.warehouse.sverka.newEntry")}
            </Button>
          </div>
        </div>

        {/* opening-balance quick set */}
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
          <span className="text-sm font-medium text-muted-foreground">{t("modules.warehouse.sverka.balance.label")}</span>
          <DatePicker
            value={qDate}
            onChange={(v) => setQDate(v)}
            className="h-9 w-[150px]"
          />
          <Input
            inputMode="decimal"
            value={qAmount}
            onChange={(e) => setQAmount(e.target.value)}
            placeholder="0,00"
            className="h-9 w-[140px]"
          />
          <div className="inline-flex rounded-md border border-border p-0.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setQDir("debit")}
              className={`h-auto gap-1 rounded px-2 py-1 text-xs ${
                qDir === "debit" ? "bg-destructive/15 text-destructive hover:bg-destructive/15 hover:text-destructive" : "text-muted-foreground"
              }`}
            >
              <ArrowRight className="size-3" /> {t("modules.warehouse.sverka.balance.theyOwe")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setQDir("credit")}
              className={`h-auto gap-1 rounded px-2 py-1 text-xs ${
                qDir === "credit" ? "bg-success/15 text-success hover:bg-success/15 hover:text-success" : "text-muted-foreground"
              }`}
            >
              <ArrowLeft className="size-3" /> {t("modules.warehouse.sverka.balance.weOwe")}
            </Button>
          </div>
          <Button size="sm" onClick={saveOpening} disabled={createEntry.isPending || updateEntry.isPending}>
            {t("modules.warehouse.actions.save")}
          </Button>
        </div>

        {/* balance headline */}
        <div className="mt-4">
          <div className={`text-3xl font-bold ${TONE_TEXT[tone]}`}>
            {pb ? fmtMoney(pb.v, pb.cur) : "0,00 UZS"}
          </div>
          <div className="text-sm text-muted-foreground">{balLabel}</div>
          {pb && Object.keys(detail.balances).length > 1 && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {Object.entries(detail.balances)
                .filter(([cur]) => cur !== pb.cur)
                .map(([cur, v]) => (
                  <Badge key={cur} variant="muted">
                    {fmtMoney(v, cur)}
                  </Badge>
                ))}
            </div>
          )}
        </div>

        <Separator className="my-3" />

        {/* filters */}
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker
            value={filters.from}
            onChange={(v) => setFrom(v)}
            placeholder={t("modules.warehouse.sverka.filters.dateFrom")}
            className="h-9 w-[150px]"
          />
          <DatePicker
            value={filters.to}
            onChange={(v) => setTo(v)}
            placeholder={t("modules.warehouse.sverka.filters.dateTo")}
            className="h-9 w-[150px]"
          />
          <Select
            value={filters.type || "__all"}
            onValueChange={(v) => setType(v === "__all" ? "" : v)}
          >
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder={t("modules.warehouse.sverka.filters.allTypes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">{t("modules.warehouse.sverka.filters.allTypes")}</SelectItem>
              {(Object.keys(ENTRY_TYPE_KEYS) as EntryType[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {t(ENTRY_TYPE_KEYS[k])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={lqInput}
            onChange={(e) => setLqInput(e.target.value)}
            placeholder={t("modules.warehouse.sverka.filters.searchPlaceholder")}
            className="h-9 min-w-[200px] flex-1"
          />
          {(filters.from || filters.to || filters.type || filters.q) && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              {t("modules.warehouse.sverka.filters.clear")}
            </Button>
          )}
        </div>
      </div>

      <LedgerTable
        detail={detail}
        filters={filters}
        companyId={companyId}
        supplierId={supplierId}
        onEdit={(e) => setModalEntry(e)}
        onToast={onToast}
      />

      {modalEntry && (
        <EntryModal
          companyId={companyId}
          supplierId={supplierId}
          detail={detail}
          entry={modalEntry === "new" ? null : modalEntry}
          onClose={() => setModalEntry(null)}
          onToast={onToast}
        />
      )}
    </FadeIn>
  );
}

// ── ledger table (grouped by purchase_id) ───────────────────────────────────────

function applyFilters(entries: LedgerEntry[], f: Filters): LedgerEntry[] {
  const q = f.q.trim().toLowerCase();
  const qNum = q.replace(/[\s,]/g, "");
  return entries.filter((e) => {
    if (f.from && (e.entry_date || "") < f.from) return false;
    if (f.to && (e.entry_date || "") > f.to) return false;
    if (f.type && e.entry_type !== f.type) return false;
    if (q) {
      const hay = `${e.notes || ""} ${e.entry_type} ${e.bank_tx_id || ""} ${e.amount}`.toLowerCase();
      if (hay.includes(q)) return true;
      const amtClean = String(e.amount || "").replace(/[^0-9.]/g, "");
      if (qNum && amtClean.includes(qNum)) return true;
      return false;
    }
    return true;
  });
}

function LedgerTable({
  detail,
  filters,
  companyId,
  supplierId,
  onEdit,
  onToast,
}: {
  detail: SupplierDetail;
  filters: Filters;
  companyId: number;
  supplierId: number;
  onEdit: (e: LedgerEntry) => void;
  onToast: (m: string) => void;
}) {
  const { t } = useTranslation();
  const all = detail.entries;
  const shown = useMemo(() => applyFilters(all, filters), [all, filters]);

  if (all.length === 0)
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
        {t("modules.warehouse.sverka.ledger.emptyAll")}
      </div>
    );
  if (shown.length === 0)
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center text-muted-foreground">
        {t("modules.warehouse.sverka.ledger.emptyFiltered")}
      </div>
    );

  // group by purchase_id; orphans bucket last
  const groups = new Map<string, LedgerEntry[]>();
  const orphans: LedgerEntry[] = [];
  const order: string[] = [];
  for (const e of shown) {
    const pid = e.purchase_id ? String(e.purchase_id) : "";
    if (!pid) {
      orphans.push(e);
      continue;
    }
    if (!groups.has(pid)) {
      groups.set(pid, []);
      order.push(pid);
    }
    groups.get(pid)!.push(e);
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {t("modules.warehouse.sverka.ledger.shown")}: {shown.length}
        {shown.length !== all.length ? ` / ${all.length}` : ""}
      </div>

      {order.map((pid) => {
        const rows = groups.get(pid)!;
        const snap = detail.purchases[pid];
        let pul = 0,
          tovar = 0,
          cur = "UZS";
        for (const r of rows) {
          const a = Number(r.amount);
          cur = r.currency || cur;
          if (r.direction === "debit") pul += a;
          else tovar += a;
        }
        const delta = pul - tovar;
        const deltaTone = Math.abs(delta) < 0.005 ? "match" : delta > 0 ? "short-tovar" : "short-pul";
        return (
          <div key={pid} className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-2">
              <div className="text-sm font-medium">
                {t("modules.warehouse.sverka.ledger.orderNo", { n: snap?.order_id ?? pid })}
                {snap?.created_at && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {snap.created_at.slice(0, 10)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span>
                  <span className="text-muted-foreground">{t("modules.warehouse.sverka.ledger.money")}</span> {fmtMoney(pul, cur)}
                </span>
                <span>
                  <span className="text-muted-foreground">{t("modules.warehouse.sverka.ledger.goods")}</span> {fmtMoney(tovar, cur)}
                </span>
                <Badge
                  variant={
                    deltaTone === "match" ? "success" : deltaTone === "short-tovar" ? "warning" : "info"
                  }
                >
                  {delta === 0 ? "✓" : delta > 0 ? "+" : ""}
                  {fmtMoney(delta, cur)}
                </Badge>
              </div>
            </div>
            <EntryRows
              rows={rows}
              companyId={companyId}
              supplierId={supplierId}
              onEdit={onEdit}
              onToast={onToast}
            />
          </div>
        );
      })}

      {orphans.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium">
            {t("modules.warehouse.sverka.ledger.otherEntries")}
          </div>
          <EntryRows
            rows={orphans}
            companyId={companyId}
            supplierId={supplierId}
            onEdit={onEdit}
            onToast={onToast}
          />
        </div>
      )}
    </div>
  );
}

function EntryRows({
  rows,
  companyId,
  supplierId,
  onEdit,
  onToast,
}: {
  rows: LedgerEntry[];
  companyId: number;
  supplierId: number;
  onEdit: (e: LedgerEntry) => void;
  onToast: (m: string) => void;
}) {
  const { t } = useTranslation();
  const verify = useVerifyEntry(companyId, supplierId);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 text-left font-medium">{t("modules.warehouse.sverka.cols.date")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("modules.warehouse.sverka.cols.type")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("modules.warehouse.sverka.cols.debit")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("modules.warehouse.sverka.cols.credit")}</th>
            <th className="px-3 py-2 text-right font-medium">{t("modules.warehouse.sverka.cols.balance")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("modules.warehouse.cols.notes")}</th>
            <th className="px-3 py-2 text-left font-medium">{t("modules.warehouse.sverka.cols.confirm")}</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const amt = Number(e.amount);
            const cur = e.currency;
            const run = e._running ? Object.values(e._running)[0] : null;
            return (
              <tr
                key={e.id}
                className={`border-b border-border last:border-0 hover:bg-muted/60 ${e.voided ? "opacity-50" : ""}`}
              >
                <td className="px-3 py-2 whitespace-nowrap">{e.entry_date}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <Badge variant="muted">{t(ENTRY_TYPE_KEYS[e.entry_type])}</Badge>
                    {e.voided && (
                      <Badge variant="danger" title={e.voided_reason || t("modules.warehouse.sverka.voided")}>
                        {t("modules.warehouse.sverka.voided")}
                      </Badge>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {e.direction === "debit" ? fmtMoney(amt, cur) : ""}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {e.direction === "credit" ? fmtMoney(amt, cur) : ""}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap font-medium tabular-nums">
                  {run != null ? fmtMoney(run, cur) : ""}
                </td>
                <td className="px-3 py-2 max-w-[200px] truncate" title={e.notes || ""}>
                  {e.notes || ""}
                </td>
                <td className="px-3 py-2">
                  <DocPills entry={e} onToggle={(field, verified) =>
                    verify.mutate(
                      { id: e.id, field, verified },
                      { onError: () => onToast(t("modules.warehouse.sverka.toast.verifyError")) }
                    )
                  } />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => onEdit(e)}
                    title={t("modules.warehouse.actions.edit")}
                  >
                    <Pencil className="size-4" />
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DocPills({
  entry,
  onToggle,
}: {
  entry: LedgerEntry;
  onToggle: (field: "payment" | "invoice" | "ttn", verified: boolean) => void;
}) {
  const { t } = useTranslation();
  const d = entry.derived_doc_state || ({} as NonNullable<LedgerEntry["derived_doc_state"]>);
  const pill = (
    field: "payment" | "invoice" | "ttn",
    label: string,
    derivedOk: boolean | undefined,
    manualAt: string | null | undefined
  ) => {
    const checked = manualAt != null && manualAt !== "" ? true : !!derivedOk;
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => onToggle(field, !checked)}
        className={`h-auto gap-1 rounded-full px-2 py-0.5 text-xs ${
          checked
            ? "border-success/40 bg-success/15 text-success hover:bg-success/15 hover:text-success"
            : "border-border text-muted-foreground hover:bg-muted"
        }`}
        title={label}
      >
        {checked ? <Check className="size-3" /> : <Circle className="size-3" />}
        {label}
      </Button>
    );
  };
  if (entry.entry_type === "wire")
    return <div className="flex gap-1">{pill("payment", t("modules.warehouse.sverka.pills.check"), d?.has_bank_tx, entry.payment_verified_at)}</div>;
  if (entry.entry_type === "goods_received")
    return (
      <div className="flex flex-wrap gap-1">
        {pill("invoice", t("modules.warehouse.sverka.pills.invoice"), d?.has_invoice, entry.invoice_verified_at)}
        {pill("ttn", "TTN", d?.has_ttn_official, entry.ttn_verified_at)}
      </div>
    );
  return <span className="text-xs text-muted-foreground">—</span>;
}

// ── entry modal (new / edit) ─────────────────────────────────────────────────

function EntryModal({
  companyId,
  supplierId,
  detail,
  entry,
  onClose,
  onToast,
}: {
  companyId: number;
  supplierId: number;
  detail: SupplierDetail;
  entry: LedgerEntry | null;
  onClose: () => void;
  onToast: (m: string) => void;
}) {
  const { t } = useTranslation();
  const isEdit = entry != null;
  const createEntry = useCreateEntry(companyId);
  const updateEntry = useUpdateEntry(companyId, supplierId);
  const upload = useUploadAttachment(companyId, supplierId);
  const delAtt = useDeleteAttachment(companyId, supplierId);

  const [showRevisions, setShowRevisions] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    entry_type: (entry?.entry_type ?? "adjustment") as EntryType,
    direction: (entry?.direction ?? "debit") as Direction,
    amount: entry?.amount ?? "",
    currency: entry?.currency ?? "UZS",
    entry_date: entry?.entry_date ?? today(),
    notes: entry?.notes ?? "",
    purchase_id: entry?.purchase_id ? String(entry.purchase_id) : "",
  });

  function submit() {
    const amt = String(form.amount).replace(/[^\d.]/g, "");
    if (!amt || Number(amt) <= 0) return onToast(t("modules.warehouse.sverka.errors.amountInvalid"));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.entry_date)) return onToast(t("modules.warehouse.sverka.errors.dateInvalid"));
    const pid = form.purchase_id ? Number(form.purchase_id) : null;
    if (isEdit) {
      const body: UpdateEntryBody = {
        direction: form.direction,
        amount: amt,
        currency: form.currency.toUpperCase(),
        entry_date: form.entry_date,
        notes: form.notes || null,
        purchase_id: pid,
      };
      updateEntry.mutate(
        { id: entry!.id, body },
        { onSuccess: () => { onToast(t("modules.warehouse.sverka.toast.saved")); onClose(); }, onError: (e: any) => onToast(e?.response?.data?.detail || t("modules.warehouse.sverka.toast.error")) }
      );
    } else {
      const body: CreateEntryBody = {
        supplier_id: supplierId,
        entry_type: form.entry_type,
        direction: form.direction,
        amount: amt,
        currency: form.currency.toUpperCase(),
        entry_date: form.entry_date,
        notes: form.notes || null,
        purchase_id: pid,
      };
      createEntry.mutate(body, {
        onSuccess: () => { onToast(t("modules.warehouse.sverka.toast.saved")); onClose(); },
        onError: (e: any) => onToast(e?.response?.data?.detail || t("modules.warehouse.sverka.toast.error")),
      });
    }
  }

  function unlink() {
    if (!isEdit) return;
    setForm((f) => ({ ...f, purchase_id: "" }));
    updateEntry.mutate(
      { id: entry!.id, body: { purchase_id: null } },
      { onSuccess: () => onToast(t("modules.warehouse.sverka.toast.unlinked")), onError: () => onToast(t("modules.warehouse.sverka.toast.error")) }
    );
  }

  const atts = entry?.attachments ?? [];

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{isEdit ? t("modules.warehouse.sverka.editEntry") : t("modules.warehouse.sverka.newEntry")}</SheetTitle>
        </SheetHeader>

        {showRevisions && isEdit ? (
          <RevisionsPane
            companyId={companyId}
            entryId={entry!.id}
            onBack={() => setShowRevisions(false)}
          />
        ) : (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{t("modules.warehouse.sverka.cols.date")}</span>
                <DatePicker
                  value={form.entry_date}
                  onChange={(v) => setForm((f) => ({ ...f, entry_date: v }))}
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{t("modules.warehouse.sverka.cols.type")}</span>
                <Select
                  value={form.entry_type}
                  onValueChange={(v) => setForm((f) => ({ ...f, entry_type: v as EntryType }))}
                  disabled={isEdit}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ENTRY_TYPE_KEYS) as EntryType[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(ENTRY_TYPE_KEYS[k])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>

            <div className="grid grid-cols-[1fr_1fr_90px] gap-3">
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{t("modules.warehouse.sverka.direction")}</span>
                <Select
                  value={form.direction}
                  onValueChange={(v) => setForm((f) => ({ ...f, direction: v as Direction }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">{t("modules.warehouse.sverka.debitLong")}</SelectItem>
                    <SelectItem value="credit">{t("modules.warehouse.sverka.creditLong")}</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{t("modules.warehouse.sverka.amount")}</span>
                <Input
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="0,00"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted-foreground">{t("modules.warehouse.sverka.currency")}</span>
                <Input
                  maxLength={3}
                  value={form.currency}
                  onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">{t("modules.warehouse.sverka.linkedPurchase")}</span>
              <Select
                value={form.purchase_id || "__none"}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, purchase_id: v === "__none" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("modules.warehouse.sverka.noneDash")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t("modules.warehouse.sverka.noneDash")}</SelectItem>
                  {detail.purchase_list.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      №{p.order_id}
                      {p.created_at ? ` · ${p.created_at.slice(0, 10)}` : ""}
                      {p.tx_order?.total ? ` · ${fmtMoney(p.tx_order.total)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {isEdit && entry?.purchase_id && (
              <Button
                type="button"
                variant="link"
                onClick={unlink}
                className="h-auto justify-start p-0 text-xs font-normal text-muted-foreground underline-offset-2"
              >
                {t("modules.warehouse.sverka.unlink")}
              </Button>
            )}

            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">{t("modules.warehouse.cols.notes")}</span>
              <Textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              />
            </label>

            {/* attachments (edit only) */}
            {isEdit && (
              <div className="space-y-2">
                <span className="block text-sm text-muted-foreground">{t("modules.warehouse.sverka.attachments")}</span>
                {atts.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {atts.map((a) => (
                      <span
                        key={a.id}
                        className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1 text-xs"
                      >
                        <a
                          href={attachmentDownloadUrl(companyId, a.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 hover:underline"
                        >
                          <Paperclip className="size-3" />
                          {a.filename || t("modules.warehouse.sverka.document")}
                        </a>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            delAtt.mutate(a.id, {
                              onSuccess: () => onToast(t("modules.warehouse.toast.deleted")),
                              onError: () => onToast(t("modules.warehouse.sverka.toast.error")),
                            })
                          }
                          className="size-5 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3" />
                        </Button>
                      </span>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  className="h-auto w-full justify-center gap-2 border-dashed py-3 text-sm font-normal text-muted-foreground hover:bg-muted"
                  disabled={upload.isPending}
                >
                  <Upload className="size-4" />
                  {upload.isPending ? t("modules.warehouse.sverka.uploading") : t("modules.warehouse.sverka.addAttachment")}
                </Button>
                <Input
                  ref={fileRef}
                  type="file"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file)
                      upload.mutate(
                        { entryId: entry!.id, file },
                        {
                          onSuccess: () => onToast(t("modules.warehouse.sverka.toast.uploaded")),
                          onError: () => onToast(t("modules.warehouse.sverka.toast.uploadError")),
                        }
                      );
                    e.target.value = "";
                  }}
                />
              </div>
            )}
            {!isEdit && (
              <p className="text-xs text-muted-foreground">
                {t("modules.warehouse.sverka.attachAfterSave")}
              </p>
            )}

            <div className="flex items-center justify-between pt-2">
              {isEdit ? (
                <Button variant="ghost" size="sm" onClick={() => setShowRevisions(true)}>
                  <History className="size-4" /> {t("modules.warehouse.sverka.revisionsHistory")}
                </Button>
              ) : (
                <span />
              )}
              <Button
                onClick={submit}
                disabled={createEntry.isPending || updateEntry.isPending}
              >
                {t("modules.warehouse.actions.save")}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RevisionsPane({
  companyId,
  entryId,
  onBack,
}: {
  companyId: number;
  entryId: number;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const revQ = useEntryRevisions(companyId, entryId);
  return (
    <div className="mt-4 space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="size-4" /> {t("modules.warehouse.actions.back")}
      </Button>
      {revQ.isLoading ? (
        <Skeleton className="h-24 w-full rounded-md" />
      ) : !revQ.data || revQ.data.length === 0 ? (
        <p className="text-sm text-muted-foreground animate-in fade-in-0 duration-300">{t("modules.warehouse.sverka.noRevisions")}</p>
      ) : (
        <ul className="space-y-2 animate-in fade-in-0 duration-300">
          {revQ.data.map((r) => (
            <li key={r.id} className="rounded-md border bg-muted/30 p-2 text-xs">
              <div className="mb-1 font-medium">
                {r.edited_at} · {r.edited_by_uid || "—"}
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-all text-muted-foreground">
                {JSON.stringify(r.changes, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
