import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUrlState, useUrlSearch } from "@/shared/hooks/use-url-state";
import {
  Plus, Trash2, Loader2, Search, ShoppingCart, AlertTriangle, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  usePurchases, useCreatePurchase,
  money, errMessage, fmtDate, ageBucket,
  STATUS_LABEL, statusVariant,
  type Purchase, type ItemInput,
} from "./purchases-api";

const STATUS_CHIP_VALUES = ["", "priced_pending", "awaiting_load", "tx_pending", "tx_sent", "delivered"] as const;
const STATUS_CHIP_KEYS: Record<string, string> = {
  "": "modules.warehouse.statusChips.all",
  priced_pending: "modules.warehouse.statusChips.priced_pending",
  awaiting_load: "modules.warehouse.statusChips.awaiting_load",
  tx_pending: "modules.warehouse.statusChips.tx_pending",
  tx_sent: "modules.warehouse.statusChips.tx_sent",
  delivered: "modules.warehouse.statusChips.delivered",
};

const ACTIVE_STATUSES = "priced_pending,awaiting_load,tx_pending,tx_sent,delivered";

// NC-token age dot: overdue=destructive, aging=warning, fresh=success
const AGE_DOT: Record<"fresh" | "aging" | "overdue", string> = {
  overdue: "bg-destructive",
  aging: "bg-warning",
  fresh: "bg-success",
};

// ─────────────────────────────────────────────────────────────────────────────
export function PurchasesView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  // Navigational state in the URL (namespaced `pu_` — shares warehouse URL).
  const [tabRaw, setTabRaw] = useUrlState("pu_tab", "requests");
  const tab = tabRaw as "requests" | "archive";
  const setTab = (v: "requests" | "archive") => setTabRaw(v);
  const [statusFilter, setStatusFilter] = useUrlState("pu_status", "");
  const [qInput, q, setQInput] = useUrlSearch("pu_q");
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();

  const effStatus = tab === "archive" ? "ttn_official" : statusFilter || ACTIVE_STATUSES;
  const { data, isLoading } = usePurchases(companyId, { status: effStatus, q, limit: 200 });
  const purchases = data?.items ?? [];

  return (
    <div className="space-y-4">
      {/* Tabs row (NC underline tabs + actions) */}
      <div className="flex items-end justify-between gap-3 flex-wrap border-b border-border">
        <div className="flex items-center gap-1">
          {(["requests", "archive"] as const).map((k) => (
            <Button
              key={k}
              variant="ghost"
              onClick={() => setTab(k)}
              className={`h-auto rounded-none px-3 py-2 text-sm border-b-2 -mb-px hover:bg-transparent ${tab === k ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {k === "requests" ? <ShoppingCart className="size-4" /> : <Package className="size-4" />}
              {k === "requests" ? t("modules.warehouse.tabs.requests") : t("modules.warehouse.tabs.archive")}
            </Button>
          ))}
        </div>
        <Button size="sm" className="mb-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1" /> {t("modules.warehouse.actions.newPurchase")}
        </Button>
      </div>

      {/* Filters + search */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {tab === "requests" && (
          <div className="flex flex-wrap gap-1.5">
            {STATUS_CHIP_VALUES.map((value) => (
              <Button
                key={value}
                variant="outline"
                onClick={() => setStatusFilter(value)}
                className={`h-auto rounded-full px-3 py-1 text-xs ${statusFilter === value ? "border-primary bg-primary/10 text-primary font-medium hover:bg-primary/10" : "border-border text-muted-foreground hover:bg-muted"}`}
              >
                {t(STATUS_CHIP_KEYS[value])}
              </Button>
            ))}
          </div>
        )}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("modules.warehouse.placeholders.searchPurchases")} className="pl-8" />
        </div>
      </div>

      {/* Table — header stays mounted; only the body transitions loading → data → empty. */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-14 text-xs uppercase tracking-wide text-muted-foreground">№</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.items")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.notes")}</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.total")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.createdAt")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-3.5 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-44" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                </TableRow>
              ))
            ) : purchases.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <ShoppingCart className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {tab === "archive" ? t("modules.warehouse.empty.archive") : t("modules.warehouse.empty.purchases")}
                    </div>
                    {q.trim() && (
                      <Button variant="outline" size="sm" onClick={() => setQInput("")}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              purchases.map((p, i) => (
                <PurchaseRow
                  key={p.id}
                  p={p}
                  index={i}
                  isArchive={tab === "archive"}
                  onOpen={() => navigate(`/warehouse/purchases/${p.id}`)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateModal companyId={companyId} open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────
function PurchaseRow({ p, index, isArchive, onOpen }: { p: Purchase; index: number; isArchive: boolean; onOpen: () => void }) {
  const { t } = useTranslation();
  const names = p.items.map((i) => i.item_name).filter(Boolean);
  const preview = names.slice(0, 2).join(", ") + (names.length > 2 ? ` +${names.length - 2}` : "");
  const bucket = ageBucket(p.created_at);
  const showDot = !isArchive && p.status !== "ttn_official";
  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
      onClick={onOpen}
    >
      <TableCell className="font-mono text-xs text-muted-foreground">{p.order_id}</TableCell>
      <TableCell className="max-w-[18rem]">
        <div className="flex items-center gap-2">
          {showDot && (
            <span className={`size-2 rounded-full shrink-0 ${AGE_DOT[bucket]}`} title={bucket} />
          )}
          <span className="truncate">{preview || t("modules.warehouse.itemsCount", { count: p.items_count })}</span>
        </div>
      </TableCell>
      <TableCell className="max-w-[12rem] truncate text-muted-foreground text-sm">{p.notes || "—"}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{p.total != null ? money(p.total) : "—"}</TableCell>
      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{fmtDate(p.created_at)}</TableCell>
      <TableCell>
        <Badge variant={statusVariant(p.status)}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
      </TableCell>
    </TableRow>
  );
}

// ── Field helper ───────────────────────────────────────────────────────────--
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

const txt =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y";

// ── Create modal ───────────────────────────────────────────────────────────--
type DraftRow = { item_name: string; qty: string; unit: string; unit_price: string; desc: string };
const emptyRow = (): DraftRow => ({ item_name: "", qty: "1", unit: "", unit_price: "", desc: "" });

function CreateModal({ companyId, open, onClose }: { companyId: number; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<DraftRow[]>([emptyRow()]);
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const create = useCreatePurchase(companyId);

  const reset = () => { setRows([emptyRow()]); setNotes(""); setErr(""); };
  const setRow = (i: number, patch: Partial<DraftRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((rs) => (rs.length > 1 ? rs.filter((_, idx) => idx !== i) : rs));

  const submit = () => {
    const items: ItemInput[] = rows
      .filter((r) => r.item_name.trim())
      .map((r) => ({
        item_name: r.item_name.trim(),
        qty: r.qty.trim() === "" ? 1 : r.qty.trim(),
        unit: r.unit.trim() || undefined,
        unit_price: r.unit_price.trim() ? r.unit_price.trim() : undefined,
        custom_fields: r.desc.trim() ? { description: r.desc.trim() } : undefined,
      }));
    if (items.length === 0) { setErr(t("modules.warehouse.errors.noItems")); return; }
    setErr("");
    create.mutate(
      { items, notes: notes.trim() || undefined },
      { onSuccess: () => { reset(); onClose(); }, onError: (e) => setErr(errMessage(e)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShoppingCart className="size-5" /> {t("modules.warehouse.actions.newPurchase")}</DialogTitle>
          <DialogDescription>{t("modules.warehouse.createDialog.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="hidden md:grid grid-cols-[1fr_5rem_5rem_6rem_2rem] gap-2 text-xs text-muted-foreground px-1">
            <span>{t("modules.warehouse.cols.name")}</span><span>{t("modules.warehouse.cols.qty")}</span><span>{t("modules.warehouse.cols.unit")}</span><span>{t("modules.warehouse.cols.price")}</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 md:grid-cols-[1fr_5rem_5rem_6rem_2rem] gap-2 items-start">
              <Input value={r.item_name} onChange={(e) => setRow(i, { item_name: e.target.value })} placeholder={t("modules.warehouse.placeholders.itemName")} className="col-span-2 md:col-span-1" />
              <Input value={r.qty} inputMode="decimal" onChange={(e) => setRow(i, { qty: e.target.value })} placeholder="1" />
              <Input value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} placeholder={t("modules.warehouse.placeholders.unitPiece")} />
              <Input value={r.unit_price} inputMode="numeric" onChange={(e) => setRow(i, { unit_price: e.target.value.replace(/[^\d.]/g, "") })} placeholder={t("modules.warehouse.cols.price")} />
              <Button variant="ghost" size="icon" onClick={() => removeRow(i)} className="size-8 text-muted-foreground hover:text-destructive justify-self-center mt-1" title={t("modules.warehouse.actions.delete")}>
                <Trash2 className="size-4" />
              </Button>
              <Input value={r.desc} onChange={(e) => setRow(i, { desc: e.target.value })} placeholder={t("modules.warehouse.placeholders.descriptionOptional")} className="col-span-2 md:col-span-5" />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
            <Plus className="size-4 mr-1" /> {t("modules.warehouse.actions.addRow")}
          </Button>
        </div>

        <Field label={t("modules.warehouse.cols.notes")}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder={t("modules.warehouse.placeholders.purchaseNotes")} className={txt} />
        </Field>

        {err && (
          <div className="flex items-center gap-2 text-sm text-destructive rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
            <AlertTriangle className="size-4 shrink-0" /> {err}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={create.isPending}>{t("modules.warehouse.actions.cancel")}</Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Plus className="size-4 mr-1" />} {t("modules.warehouse.actions.create")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
