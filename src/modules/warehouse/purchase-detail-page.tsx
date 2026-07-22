/**
 * PurchaseDetailPage — full-page (NOT Sheet) cloud-parity rebuild of
 * cloud-os/apps/aiba_warehouse drawer (.wh-drawer / renderPurchaseSummary).
 *
 * Layout: DetailPage (left 380px sidebar of <DetailCard>s + right viewer).
 * Sidebar cards:
 *   1. Header  — purchase № + status badge + age dot + supplier + total
 *   2. Summary — created/by/notes/payment_timing/payment_purpose
 *   3. TTN     — ttn_draft + finalized status
 *   4. History — last 3 transitions from purchase_history
 *
 * Main viewer:
 *   - Status-driven action panel (Narxlash / To'lovga / Yetkazish / TTN forms)
 *   - Items table (Nomi / Miqdor / Birlik / Narx / Jami) — matches cloud
 *     renderPurchaseSummary docs-table-wrap wh-detail-items.
 *   - Full purchase_history list (cloud History tab).
 *
 * All forms (PriceForm/SendTxForm/ReceiveForm/TtnForm) are moved here from
 * the previous DetailDrawer Sheet — same hooks, same flow, just inline on
 * the route page. Reuses every existing api hook from purchases-api.ts.
 */
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle, CheckCircle2, FileText, History as HistoryIcon, Loader2,
  Package, Send, Tag, Trash2, Truck, Upload, X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DetailCard, DetailPage, DetailRow } from "@/components/ui/detail-page";
import { FadeIn, ErrorState } from "@/components/ui/reveal";

import { useCompany } from "@/shared/store/company";
import {
  usePurchase, useDeletePurchase, usePricePurchase, useSendTx,
  useReceiveGoods, useDeliver, useFinalizeTtn, useSetPaymentTiming,
  useWhSuppliers,
  ACTION_LABEL, STATUS_LABEL, ageBucket, errMessage, fmtDate, money, statusVariant,
  type Purchase, type ReceivedItem, type WhSupplier,
} from "./purchases-api";

// NC-token age dot: overdue=destructive, aging=warning, fresh=success.
const AGE_DOT: Record<"fresh" | "aging" | "overdue", string> = {
  overdue: "bg-destructive",
  aging: "bg-warning",
  fresh: "bg-success",
};

const txt =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y";

// ────────────────────────────────────────────────────────────────────────────
export function PurchaseDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const pid = id ? Number(id) : NaN;
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;

  const { data: p, isLoading, error, refetch } = usePurchase(companyId ?? 0, Number.isFinite(pid) ? pid : null);

  // No company — same fallback pattern as documents/companies detail pages.
  if (!companyId) {
    return (
      <DetailPage backTo="/warehouse" backLabel={t("modules.warehouse.nav.purchases")} sidebar={null}>
        <div className="m-6 rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          {t("modules.warehouse.detail.selectCompany")}
        </div>
      </DetailPage>
    );
  }

  if (error) {
    return (
      <DetailPage backTo="/warehouse" backLabel={t("modules.warehouse.nav.purchases")} sidebar={null}>
        <div className="m-6 rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          <AlertTriangle className="inline size-4 mr-1.5" />
          {t("modules.warehouse.detail.loadError")} {errMessage(error)}
        </div>
      </DetailPage>
    );
  }

  if (isLoading) {
    return (
      <DetailPage
        backTo="/warehouse"
        backLabel={t("modules.warehouse.nav.purchases")}
        sidebar={
          <>
            <DetailCard>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="mt-2 h-4 w-1/2" />
              <Skeleton className="mt-3 h-6 w-24" />
            </DetailCard>
            <DetailCard title={t("modules.warehouse.detail.info")}>
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="my-2 h-4 w-full" />
              ))}
            </DetailCard>
          </>
        }
      >
        <div className="p-6 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </DetailPage>
    );
  }

  if (!p) {
    return (
      <DetailPage backTo="/warehouse" backLabel={t("modules.warehouse.nav.purchases")} sidebar={null}>
        <ErrorState onRetry={() => refetch()} />
      </DetailPage>
    );
  }

  return (
    <DetailPage
      backTo="/warehouse"
      backLabel={t("modules.warehouse.nav.purchases")}
      sidebar={
        <FadeIn className="space-y-3">
          <Sidebar companyId={companyId} p={p} />
        </FadeIn>
      }
    >
      <FadeIn className="p-6 space-y-6">
        <ActionPanel companyId={companyId} p={p} />
        <ItemsTable p={p} />
        <FullHistory p={p} />
      </FadeIn>
    </DetailPage>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────────────────
function Sidebar({ companyId, p }: { companyId: number; p: Purchase }) {
  const { t } = useTranslation();
  const del = useDeletePurchase(companyId);
  const bucket = ageBucket(p.created_at);
  const showDot = p.status !== "ttn_official";
  const total = p.tx_order?.total ?? p.total;

  // Last 3 transitions (most-recent first) for the sidebar History card.
  const recent = (p.history ?? []).slice(0, 3);

  return (
    <>
      {/* (1) Header */}
      <DetailCard>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {showDot && (
                <span className={`size-2 rounded-full shrink-0 ${AGE_DOT[bucket]}`} title={bucket} />
              )}
              <div className="text-base font-semibold text-foreground leading-tight">
                {t("modules.warehouse.detail.purchaseNo", { n: p.order_id })}
              </div>
            </div>
            <div className="mt-2">
              <Badge variant={statusVariant(p.status)}>
                {STATUS_LABEL[p.status] ?? p.status}
              </Badge>
            </div>
          </div>
          {p.status === "priced_pending" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (!confirm(t("modules.warehouse.detail.confirmDelete"))) return;
                del.mutate(p.id, {
                  onSuccess: () => {
                    window.location.href = "/warehouse";
                  },
                });
              }}
              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
              title={t("modules.warehouse.actions.delete")}
            >
              {del.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </Button>
          )}
        </div>

        {/* Supplier / payment template under the header. */}
        {p.supplier ? (
          <div className="mt-3 border-t border-border pt-3 space-y-0.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.detail.counterparty")}</div>
            <div className="text-sm font-medium text-foreground">{p.supplier.name}</div>
            {p.supplier.inn && (
              <div className="text-xs text-muted-foreground">INN {p.supplier.inn}</div>
            )}
          </div>
        ) : p.tx_order?.payment_template_id ? (
          <div className="mt-3 border-t border-border pt-3 space-y-0.5">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.detail.paymentTemplate")}</div>
            <div className="text-sm font-mono text-foreground">{p.tx_order.payment_template_id}</div>
          </div>
        ) : null}

        {/* Total. */}
        {total != null && (
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">{t("modules.warehouse.cols.total")}</span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {money(total)} {t("modules.warehouse.detail.sum")}
            </span>
          </div>
        )}
      </DetailCard>

      {/* (2) Summary */}
      <DetailCard title={t("modules.warehouse.detail.info")}>
        <dl className="space-y-0">
          <DetailRow k={t("modules.warehouse.detail.createdAt")} v={fmtDate(p.created_at)} />
          <DetailRow k={t("modules.warehouse.detail.author")} v={p.created_by_uid || "—"} mono />
          <DetailRow k={t("modules.warehouse.detail.updatedAt")} v={fmtDate(p.updated_at)} />
          {p.tx_order?.payment_timing && (
            <DetailRow
              k={t("modules.warehouse.detail.paymentType")}
              v={p.tx_order.payment_timing === "prepay" ? t("modules.warehouse.detail.prepay") : t("modules.warehouse.detail.postpay")}
            />
          )}
          {p.tx_order?.payment_purpose && (
            <DetailRow k={t("modules.warehouse.detail.paymentPurpose")} v={p.tx_order.payment_purpose} />
          )}
          {p.tx_order?.bank_tx_id && (
            <DetailRow k={t("modules.warehouse.detail.bankTx")} v={p.tx_order.bank_tx_id} mono />
          )}
          {p.notes && <DetailRow k={t("modules.warehouse.cols.notes")} v={p.notes} />}
        </dl>
      </DetailCard>

      {/* (3) TTN draft */}
      {p.ttn_draft && (
        <DetailCard title="TTN">
          <dl className="space-y-0">
            <DetailRow
              k={t("modules.warehouse.detail.draft")}
              v={
                p.ttn_draft.has_draft ? (
                  <a
                    href={`/api/v2/warehouse/companies/${companyId}/purchases/${p.id}/ttn/draft`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {p.ttn_draft.filename || t("modules.warehouse.actions.view")}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{t("modules.warehouse.detail.none")}</span>
                )
              }
            />
            <DetailRow
              k={t("modules.warehouse.detail.official")}
              v={
                p.ttn_draft.has_official ? (
                  <a
                    href={`/api/v2/warehouse/companies/${companyId}/purchases/${p.id}/ttn/official`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    {p.ttn_draft.official_filename || t("modules.warehouse.actions.view")}
                  </a>
                ) : (
                  <span className="text-muted-foreground">{t("modules.warehouse.detail.none")}</span>
                )
              }
            />
            {p.ttn_draft.finalized_at && (
              <DetailRow
                k={t("modules.warehouse.detail.finalizedAt")}
                v={
                  <span className="inline-flex items-center gap-1 text-success">
                    <CheckCircle2 className="size-3.5" />
                    {fmtDate(p.ttn_draft.finalized_at)}
                  </span>
                }
              />
            )}
          </dl>
        </DetailCard>
      )}

      {/* (4) History — last 3 */}
      {recent.length > 0 && (
        <DetailCard
          title={
            <span className="inline-flex items-center gap-1.5">
              <HistoryIcon className="size-3.5" /> {t("modules.warehouse.detail.history")}
            </span>
          }
        >
          <ol className="space-y-2">
            {recent.map((h) => (
              <li key={h.id} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 size-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">
                    {STATUS_LABEL[h.to_status] ?? h.to_status}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {fmtDate(h.created_at)}
                    {h.by_display_name ? ` · ${h.by_display_name}` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </DetailCard>
      )}
    </>
  );
}

// ── Items table (right viewer) ──────────────────────────────────────────────
function ItemsTable({ p }: { p: Purchase }) {
  const { t } = useTranslation();
  const anyPriced = p.items.some((i) => i.unit_price != null);
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium flex items-center gap-1.5 text-foreground">
        <Package className="size-4" /> {t("modules.warehouse.detail.items")}
      </div>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.name")}</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.qty")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.unit")}</TableHead>
              {anyPriced && (
                <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.price")}</TableHead>
              )}
              {anyPriced && (
                <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.total")}</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {p.items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={anyPriced ? 5 : 3} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Package className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.warehouse.detail.none")}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              p.items.map((it, i) => (
                <TableRow
                  key={it.id}
                  className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <TableCell>
                    {it.item_name}
                    {it.qty_received != null && it.qty_received !== it.qty && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({t("modules.warehouse.detail.received")}: {it.qty_received})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {(it.qty ?? 0).toString().replace(/\.?0+$/, "")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{it.unit || "—"}</TableCell>
                  {anyPriced && (
                    <TableCell className="text-right tabular-nums">
                      {it.unit_price != null ? money(it.unit_price) : "—"}
                    </TableCell>
                  )}
                  {anyPriced && (
                    <TableCell className="text-right tabular-nums">
                      {it.line_total != null ? money(it.line_total) : "—"}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ── Full history (right viewer, after items) ────────────────────────────────
function FullHistory({ p }: { p: Purchase }) {
  const { t } = useTranslation();
  const hist = p.history ?? [];
  if (hist.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium flex items-center gap-1.5 text-foreground">
        <HistoryIcon className="size-4" /> {t("modules.warehouse.detail.history")}
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <ol className="space-y-2.5">
          {hist.map((h) => (
            <li key={h.id} className="flex items-start gap-2 text-sm">
              <span className="mt-1.5 size-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
              <div>
                <span className="font-medium text-foreground">
                  {STATUS_LABEL[h.to_status] ?? h.to_status}
                </span>
                {h.comment && (
                  <span className="text-muted-foreground"> · {h.comment}</span>
                )}
                <div className="text-xs text-muted-foreground">
                  {fmtDate(h.created_at)}
                  {h.by_display_name ? ` · ${h.by_display_name}` : ""}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ── Action panel: branches by status ────────────────────────────────────────
function ActionPanel({ companyId, p }: { companyId: number; p: Purchase }) {
  if (p.status === "priced_pending") return <PriceForm companyId={companyId} p={p} />;
  if (p.status === "tx_pending") return <SendTxForm companyId={companyId} p={p} />;
  if (p.status === "awaiting_load") return <ReceiveForm companyId={companyId} p={p} mode="receive" />;
  if (p.status === "tx_sent") return <ReceiveForm companyId={companyId} p={p} mode="deliver" />;
  if (p.status === "delivered") return <TtnForm companyId={companyId} p={p} />;
  if (p.status === "ttn_official") {
    return <FinalizedPanel companyId={companyId} p={p} />;
  }
  return null;
}

function FinalizedPanel({ companyId, p }: { companyId: number; p: Purchase }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
      <CheckCircle2 className="size-4 text-success" /> {t("modules.warehouse.detail.finalized")}
      {p.ttn_draft?.has_official && (
        <a
          href={`/api/v2/warehouse/companies/${companyId}/purchases/${p.id}/ttn/official`}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline underline-offset-2 ml-auto"
        >
          TTN
        </a>
      )}
    </div>
  );
}

function PanelShell({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="text-sm font-medium flex items-center gap-1.5 text-foreground">
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function ErrLine({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-destructive rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2">
      <AlertTriangle className="size-4 shrink-0" /> {msg}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ── Narxlash (Pricing) ──────────────────────────────────────────────────────
function PriceForm({ companyId, p }: { companyId: number; p: Purchase }) {
  const { t } = useTranslation();
  const { data: suppliers } = useWhSuppliers(companyId);
  const price = usePricePurchase(companyId);
  const [prices, setPrices] = useState<Record<number, string>>(
    () => Object.fromEntries(
      p.items.map((i) => [i.id, i.unit_price != null ? String(i.unit_price) : ""]),
    ),
  );
  const [source, setSource] = useState<"supplier" | "template">("supplier");
  const [supplierId, setSupplierId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [timing, setTiming] = useState<"prepay" | "postpay">("prepay");
  const [purpose, setPurpose] = useState("");
  const [err, setErr] = useState("");

  const total = useMemo(
    () => p.items.reduce((sum, it) => sum + (Number(prices[it.id]) || 0) * (it.qty ?? 0), 0),
    [prices, p.items],
  );

  const submit = () => {
    if (source === "supplier" && !supplierId) {
      setErr(t("modules.warehouse.detail.errors.pickCounterparty"));
      return;
    }
    if (source === "template" && !templateId.trim()) {
      setErr(t("modules.warehouse.detail.errors.enterTemplate"));
      return;
    }
    setErr("");
    price.mutate(
      {
        pid: p.id,
        body: {
          items: p.items.map((it) => ({ id: it.id, unit_price: prices[it.id] || "0" })),
          ...(source === "supplier"
            ? { supplier_id: Number(supplierId) }
            : { payment_template_id: templateId.trim() }),
          payment_timing: timing,
          payment_purpose: purpose.trim() || undefined,
        },
      },
      { onError: (e) => setErr(errMessage(e)) },
    );
  };

  return (
    <PanelShell icon={<Tag className="size-4" />} title={ACTION_LABEL.priced_pending}>
      <div className="space-y-2">
        {p.items.map((it) => (
          <div key={it.id} className="grid grid-cols-[1fr_8rem] gap-2 items-center">
            <div className="text-sm truncate">
              {it.item_name}{" "}
              <span className="text-muted-foreground">
                · {(it.qty ?? 0)} {it.unit || ""}
              </span>
            </div>
            <Input
              inputMode="numeric"
              value={prices[it.id] ?? ""}
              onChange={(e) =>
                setPrices((s) => ({ ...s, [it.id]: e.target.value.replace(/[^\d.]/g, "") }))
              }
              placeholder="Narx"
            />
          </div>
        ))}
      </div>

      {/* Payment source */}
      <div className="inline-flex rounded-md border border-input p-0.5">
        {([["supplier", t("modules.warehouse.detail.counterparty")], ["template", t("modules.warehouse.detail.template")]] as const).map(([k, lbl]) => (
          <Button
            key={k}
            variant={source === k ? "default" : "ghost"}
            onClick={() => setSource(k)}
            className="h-auto rounded px-3 py-1 text-sm"
          >
            {lbl}
          </Button>
        ))}
      </div>
      {source === "supplier" ? (
        <Field label={t("modules.warehouse.detail.counterparty")}>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("modules.warehouse.detail.pickCounterparty")} />
            </SelectTrigger>
            <SelectContent>
              {(suppliers ?? []).map((s: WhSupplier) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                  {s.inn ? ` · ${s.inn}` : ""}
                </SelectItem>
              ))}
              {(suppliers ?? []).length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  {t("modules.warehouse.detail.noCounterparty")}
                </div>
              )}
            </SelectContent>
          </Select>
        </Field>
      ) : (
        <Field label={t("modules.warehouse.detail.paymentTemplateId")}>
          <Input
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            placeholder={t("modules.warehouse.detail.ipakTemplatePlaceholder")}
          />
        </Field>
      )}

      {/* prepay / postpay */}
      <Field label={t("modules.warehouse.detail.paymentType")}>
        <div className="inline-flex rounded-md border border-input p-0.5">
          {([["prepay", t("modules.warehouse.detail.prepayFull")], ["postpay", t("modules.warehouse.detail.postpayFull")]] as const).map(([k, lbl]) => (
            <Button
              key={k}
              variant={timing === k ? "default" : "ghost"}
              onClick={() => setTiming(k)}
              className="h-auto rounded px-3 py-1 text-sm"
            >
              {lbl}
            </Button>
          ))}
        </div>
      </Field>

      <Field label={t("modules.warehouse.detail.paymentPurpose")}>
        <Textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={2}
          placeholder={t("modules.warehouse.detail.paymentPurposePlaceholder")}
          className={txt}
        />
      </Field>

      <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
        <span className="text-sm text-muted-foreground">{t("modules.warehouse.cols.total")}</span>
        <span className="text-base font-semibold tabular-nums text-foreground">
          {money(total)} {t("modules.warehouse.detail.sum")}
        </span>
      </div>

      {err && <ErrLine msg={err} />}
      <Button onClick={submit} disabled={price.isPending} className="w-full">
        {price.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Tag className="size-4 mr-1" />}
        {t("modules.warehouse.detail.priceAndContinue")}
      </Button>
    </PanelShell>
  );
}

// ── To'lovga (Send tx) ──────────────────────────────────────────────────────
function SendTxForm({ companyId, p }: { companyId: number; p: Purchase }) {
  const { t } = useTranslation();
  const send = useSendTx(companyId);
  const timing = useSetPaymentTiming(companyId);
  const [bankTxId, setBankTxId] = useState("");
  const [purpose, setPurpose] = useState(p.tx_order?.payment_purpose ?? "");
  const [err, setErr] = useState("");

  const submit = () => {
    setErr("");
    send.mutate(
      {
        pid: p.id,
        bank_tx_id: bankTxId.trim() || undefined,
        payment_purpose: purpose.trim() || undefined,
      },
      { onError: (e) => setErr(errMessage(e)) },
    );
  };

  return (
    <PanelShell icon={<Send className="size-4" />} title={ACTION_LABEL.tx_pending}>
      <div className="text-sm text-muted-foreground">
        {t("modules.warehouse.detail.sendTxHint")}
      </div>
      <Field label={t("modules.warehouse.detail.paymentType")}>
        <div className="inline-flex rounded-md border border-input p-0.5">
          {([["prepay", t("modules.warehouse.detail.prepay")], ["postpay", t("modules.warehouse.detail.postpay")]] as const).map(([k, lbl]) => (
            <Button
              key={k}
              variant={(p.tx_order?.payment_timing ?? "prepay") === k ? "default" : "ghost"}
              disabled={timing.isPending}
              onClick={() => timing.mutate({ pid: p.id, payment_timing: k })}
              className="h-auto rounded px-3 py-1 text-sm"
            >
              {lbl}
            </Button>
          ))}
        </div>
      </Field>
      <Field label={t("modules.warehouse.detail.bankTxOptional")}>
        <Input value={bankTxId} onChange={(e) => setBankTxId(e.target.value)} placeholder="BANK-..." />
      </Field>
      <Field label={t("modules.warehouse.detail.paymentPurpose")}>
        <Textarea
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
          rows={2}
          className={txt}
        />
      </Field>
      {err && <ErrLine msg={err} />}
      <Button onClick={submit} disabled={send.isPending} className="w-full">
        {send.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Send className="size-4 mr-1" />}
        {t("modules.warehouse.detail.sendPayment")}
      </Button>
    </PanelShell>
  );
}

// ── Yetkazish (receive postpay / deliver prepay) ────────────────────────────
function ReceiveForm({
  companyId,
  p,
  mode,
}: {
  companyId: number;
  p: Purchase;
  mode: "receive" | "deliver";
}) {
  const { t } = useTranslation();
  const receive = useReceiveGoods(companyId);
  const deliver = useDeliver(companyId);
  const m = mode === "receive" ? receive : deliver;
  const [file, setFile] = useState<File | null>(null);
  const [recv, setRecv] = useState<Record<number, string>>(
    () => Object.fromEntries(
      p.items.map((i) => [i.id, i.qty != null ? String(i.qty) : ""]),
    ),
  );
  const [err, setErr] = useState("");

  const submit = () => {
    setErr("");
    const received_items: ReceivedItem[] = p.items.map((it) => ({
      id: it.id,
      qty_received: recv[it.id] || "0",
    }));
    m.mutate(
      { pid: p.id, file, received_items },
      { onError: (e) => setErr(errMessage(e)) },
    );
  };

  return (
    <PanelShell
      icon={<Truck className="size-4" />}
      title={mode === "receive" ? ACTION_LABEL.awaiting_load : ACTION_LABEL.tx_sent}
    >
      <div className="space-y-2">
        <div className="text-xs text-muted-foreground">
          {t("modules.warehouse.detail.receivedQtyHint")}
        </div>
        {p.items.map((it) => (
          <div key={it.id} className="grid grid-cols-[1fr_7rem] gap-2 items-center">
            <div className="text-sm truncate">
              {it.item_name}{" "}
              <span className="text-muted-foreground">
                / {(it.qty ?? 0)} {it.unit || ""}
              </span>
            </div>
            <Input
              inputMode="decimal"
              value={recv[it.id] ?? ""}
              onChange={(e) =>
                setRecv((s) => ({ ...s, [it.id]: e.target.value.replace(/[^\d.]/g, "") }))
              }
            />
          </div>
        ))}
      </div>
      <FileDrop
        label={mode === "receive" ? t("modules.warehouse.detail.receipt") : t("modules.warehouse.detail.draftTtn")}
        file={file}
        onPick={setFile}
      />
      {err && <ErrLine msg={err} />}
      <Button onClick={submit} disabled={m.isPending} className="w-full">
        {m.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <Truck className="size-4 mr-1" />}
        {mode === "receive" ? t("modules.warehouse.detail.received") : t("modules.warehouse.detail.delivered")}
      </Button>
    </PanelShell>
  );
}

// ── TTN finalization ────────────────────────────────────────────────────────
function TtnForm({ companyId, p }: { companyId: number; p: Purchase }) {
  const { t } = useTranslation();
  const ttn = useFinalizeTtn(companyId);
  const [file, setFile] = useState<File | null>(null);
  const [didox, setDidox] = useState(p.tx_order?.didox_invoice_id ?? "");
  const [err, setErr] = useState("");

  const submit = () => {
    setErr("");
    ttn.mutate(
      { pid: p.id, file, didox_invoice_id: didox.trim() || undefined },
      { onError: (e) => setErr(errMessage(e)) },
    );
  };

  return (
    <PanelShell icon={<FileText className="size-4" />} title={ACTION_LABEL.delivered}>
      {p.ttn_draft?.has_draft && (
        <a
          href={`/api/v2/warehouse/companies/${companyId}/purchases/${p.id}/ttn/draft`}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-primary underline underline-offset-2"
        >
          {t("modules.warehouse.detail.viewDraftTtn")}
        </a>
      )}
      <FileDrop label={t("modules.warehouse.detail.officialTtnLabel")} file={file} onPick={setFile} />
      <Field label={t("modules.warehouse.detail.didoxInvoiceOptional")}>
        <Input value={didox} onChange={(e) => setDidox(e.target.value)} placeholder={t("modules.warehouse.detail.didoxPlaceholder")} />
      </Field>
      {err && <ErrLine msg={err} />}
      <Button onClick={submit} disabled={ttn.isPending} className="w-full">
        {ttn.isPending ? <Loader2 className="size-4 animate-spin mr-1" /> : <FileText className="size-4 mr-1" />}
        {t("modules.warehouse.detail.finalize")}
      </Button>
    </PanelShell>
  );
}

// ── File drop ───────────────────────────────────────────────────────────────
function FileDrop({
  label,
  file,
  onPick,
}: {
  label: string;
  file: File | null;
  onPick: (f: File | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <Field label={label}>
      <label className="flex items-center gap-2 rounded-lg border border-dashed border-input bg-background px-3 py-3 cursor-pointer hover:border-primary transition-colors text-sm">
        <Upload className="size-4 text-muted-foreground" />
        {file ? (
          <span className="flex items-center gap-2 truncate">
            {file.name}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={(e) => {
                e.preventDefault();
                onPick(null);
              }}
              className="size-5 text-muted-foreground hover:text-destructive"
            >
              <X className="size-3.5" />
            </Button>
          </span>
        ) : (
          <span className="text-muted-foreground">{t("modules.warehouse.detail.pickFileOptional")}</span>
        )}
        <Input
          type="file"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
    </Field>
  );
}
