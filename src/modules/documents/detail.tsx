import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, PenLine, Ban, Trash2, FileText, ExternalLink, Printer,
  Download, Building2,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Reveal } from "@/components/ui/reveal";
import {
  useDocDetail, useDocHtml, useBankTransactions,
  useSignDocument, useRejectDocument, useDeleteDocument,
} from "./api";
import { bankReasonText } from "./bank-reason";
import {
  doctypeLabel, statusMeta, riskMeta,
  type DocRow, type DocDetail, type DocParty, type BankTx,
} from "./types";

function money(v?: number | null) {
  return v == null ? "—" : Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DocumentDetail({
  companyId, row, onClose,
}: {
  companyId: number;
  row: DocRow | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const open = !!row;
  const pk = row?.id ?? null;
  const docId = row?.doc_id ?? null;
  const [tab, setTab] = useState("info");
  const [party, setParty] = useState<"sender" | "receiver">("sender");

  const { data, isLoading } = useDocDetail(companyId, pk);
  const html = useDocHtml(companyId, docId, "ru", tab === "doc");
  const st = statusMeta(data?.status_group ?? row?.status_group);
  const rk = riskMeta(data?.doc_rating ?? row?.doc_rating);
  const stGroup = data?.status_group ?? row?.status_group;
  const stLabel = stGroup ? t(`modules.documents.status.${stGroup}`, st.label) : st.label;
  const rating = data?.doc_rating ?? row?.doc_rating;
  const rkLabel = rk && rating ? t(`modules.documents.risk.${rating.toUpperCase()}`, rk.label) : rk?.label;
  const dt = data?.doctype ?? row?.doctype;

  // Sender/Receiver resolution: owner=0 (incoming) → seller is the counterparty.
  const seller = data?.seller ?? null;
  const buyer = data?.buyer ?? null;
  const senderParty = seller ?? fallbackParty(data, "sender");
  const receiverParty = buyer ?? fallbackParty(data, "receiver");

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) { setTab("info"); setParty("sender"); onClose(); } }}>
      <SheetContent side="right" className="w-full sm:max-w-4xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <div className="flex items-center gap-2 flex-wrap">
            <SheetTitle className="text-base">
              {dt ? t(`modules.documents.doctypes.${dt}`, doctypeLabel(dt)) : doctypeLabel(dt)}
            </SheetTitle>
            <Badge variant={st.variant}>{stLabel}</Badge>
            {rk && <Badge variant={rk.variant}>{t("modules.documents.risk.label")}: {rkLabel}</Badge>}
            {(data?.has_lgota ?? row?.has_lgota) && <Badge variant="success">{t("modules.documents.badges.benefit")}</Badge>}
            {(data?.doc_date ?? row?.doc_date) && (
              <span className="text-xs text-muted-foreground">{data?.doc_date ?? row?.doc_date}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">{row?.name}</div>
        </SheetHeader>

        <div className="flex-1 flex min-h-0">
          {/* ---- left info column ---- */}
          <div className="w-[44%] shrink-0 border-r overflow-y-auto p-4 space-y-4">
            {/* Sender / Receiver tabs */}
            <div className="rounded-lg border">
              <div className="flex border-b">
                {(["sender", "receiver"] as const).map((p) => (
                  <Button key={p} variant="ghost" size="sm" onClick={() => setParty(p)}
                          className={`h-auto flex-1 rounded-none px-3 py-2 font-normal hover:bg-transparent ${
                            party === p ? "border-b-2 border-primary font-medium" : "text-muted-foreground hover:text-foreground"
                          }`}>
                    {p === "sender" ? t("modules.documents.party.sender") : t("modules.documents.party.receiver")}
                  </Button>
                ))}
              </div>
              <div className="p-3">
                <PartyBlock p={party === "sender" ? senderParty : receiverParty} loading={isLoading} />
              </div>
            </div>

            {/* General / Finance / Products */}
            <Tabs value={tab === "doc" ? "info" : tab} onValueChange={setTab}>
              <TabsList className="w-full">
                <TabsTrigger value="info" className="flex-1">{t("modules.documents.tabs.general")}</TabsTrigger>
                <TabsTrigger value="finance" className="flex-1">{t("modules.documents.tabs.finance")}</TabsTrigger>
                <TabsTrigger value="products" className="flex-1">{t("modules.documents.tabs.products")}</TabsTrigger>
              </TabsList>

              {/* General */}
              <TabsContent value="info" className="mt-3">
                <Reveal
                  loading={isLoading}
                  skeleton={<div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>}
                >
                  <div className="rounded-lg border divide-y text-sm">
                    <Row label={t("modules.documents.fields.name")} value={data?.name} />
                    <Row label={t("modules.documents.fields.docId")} value={data?.doc_id} mono />
                    <Row label={t("modules.documents.fields.doctype")} value={data?.doctype ? t(`modules.documents.doctypes.${data.doctype}`, doctypeLabel(data.doctype)) : doctypeLabel(data?.doctype)} />
                    <Row label={t("modules.documents.fields.date")} value={data?.doc_date} />
                    <Row label={t("modules.documents.fields.signedAt")} value={data?.signed_date} />
                    <Row label={t("modules.documents.fields.createdAt")} value={data?.created} />
                    <Row label={t("modules.documents.fields.updatedAt")} value={data?.updated} />
                    {data?.contract_number && <Row label={t("modules.documents.fields.contract")} value={data?.contract_number} />}
                    {data?.contract_date && <Row label={t("modules.documents.fields.contractDate")} value={data?.contract_date} />}
                    {data?.agent && <Row label={t("modules.documents.fields.agent")} value={data?.agent} />}
                  </div>
                </Reveal>
              </TabsContent>

              {/* Finance */}
              <TabsContent value="finance" className="mt-3 space-y-3">
                <Reveal
                  loading={isLoading}
                  skeleton={<div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>}
                >
                  <>
                    <div className="rounded-lg border divide-y text-sm">
                      <Row label={t("modules.documents.fields.amountWithoutVat")} value={money(data?.total_without_vat ?? data?.total_sum)} mono />
                      <Row label={t("modules.documents.fields.vat")} value={money(data?.total_vat_sum)} mono />
                      <Row label={t("modules.documents.fields.amountWithVat")} value={money(data?.total_with_vat)} mono strong />
                      <Row label={t("modules.documents.fields.hasVat")} value={data?.has_vat ? t("modules.documents.common.yes") : t("modules.documents.common.no")} />
                    </div>
                    {!!data?.vat_breakdown?.length && (
                      <div>
                        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{t("modules.documents.vatBreakdown.title")}</div>
                        <div className="rounded-lg border overflow-hidden">
                          <Table>
                            <TableHeader>
                              <TableRow className="[&>th]:text-xs [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-muted-foreground">
                                <TableHead>{t("modules.documents.vatBreakdown.rate")}</TableHead>
                                <TableHead className="text-right">{t("modules.documents.columns.withoutVat")}</TableHead>
                                <TableHead className="text-right">{t("modules.documents.columns.vat")}</TableHead>
                                <TableHead className="text-right">{t("modules.documents.vatBreakdown.total")}</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {data.vat_breakdown.map((b) => (
                                <TableRow key={b.rate}>
                                  <TableCell className="font-medium">{b.rate}</TableCell>
                                  <TableCell className="text-right tabular-nums text-xs">{money(b.without_vat)}</TableCell>
                                  <TableCell className="text-right tabular-nums text-xs">{money(b.vat_sum)}</TableCell>
                                  <TableCell className="text-right tabular-nums text-xs">{money(b.with_vat)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </>
                </Reveal>
              </TabsContent>

              {/* Products */}
              <TabsContent value="products" className="mt-3">
                <Reveal
                  loading={isLoading}
                  skeleton={<div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>}
                >
                  {!!data?.products?.length ? (
                  <div className="rounded-lg border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="[&>th]:text-xs [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-muted-foreground">
                          <TableHead>{t("modules.documents.products.name")}</TableHead>
                          <TableHead className="text-right">{t("modules.documents.products.count")}</TableHead>
                          <TableHead className="text-right">{t("modules.documents.products.amount")}</TableHead>
                          <TableHead className="text-right">{t("modules.documents.columns.vat")}</TableHead>
                          <TableHead className="text-right">{t("modules.documents.vatBreakdown.total")}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.products.map((p, i) => (
                          <TableRow key={i}>
                            <TableCell className="max-w-[200px]">
                              <div className="truncate">{p.name ?? "—"}</div>
                              {p.catalog_code && <div className="text-[11px] text-muted-foreground tabular-nums">{p.catalog_code}</div>}
                            </TableCell>
                            <TableCell className="text-right">{p.count ?? "—"}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs">{money(p.delivery_sum ?? p.summa)}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs">{money(p.vat_sum)}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs">{money(p.delivery_sum_with_vat)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground py-6 text-center">{t("modules.documents.products.empty")}</div>
                )}
                </Reveal>
              </TabsContent>
            </Tabs>

            {/* Bank transactions card */}
            {data && (
              <BankCard
                companyId={companyId}
                partnerTin={data.partner_tin ?? row?.partner_tin}
                contractNumber={data.contract_number}
                contractDate={data.contract_date}
              />
            )}
          </div>

          {/* ---- right: document viewer ---- */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center gap-1 border-b px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTab((t) => (t === "doc" ? "info" : "doc"))}
                className={`h-auto gap-1.5 px-3 py-1.5 font-normal ${
                  tab === "doc" ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground hover:bg-transparent"
                }`}
              >
                <FileText className="size-4" /> {t("modules.documents.viewer.title")}
              </Button>
              {tab === "doc" && html.data?.html && (
                <DocViewerToolbar html={html.data.html} name={data?.name ?? row?.name ?? t("modules.documents.viewer.defaultFilename")} />
              )}
            </div>
            <div className="flex-1 min-h-0 p-3">
              {tab !== "doc" ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 text-sm">
                  <FileText className="size-8 opacity-40" />
                  {t("modules.documents.viewer.openHint")}
                </div>
              ) : html.isPending ? (
                <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
                  <Loader2 className="size-4 animate-spin" /> {t("modules.documents.common.loading")}
                </div>
              ) : html.data?.html ? (
                <iframe
                  title="document"
                  srcDoc={html.data.html}
                  className="w-full h-full min-h-[60vh] rounded-lg border bg-white animate-in fade-in-0 duration-300"
                  sandbox="allow-same-origin"
                />
              ) : (
                <div className="text-muted-foreground text-sm animate-in fade-in-0 duration-300">{t("modules.documents.viewer.unavailable")}</div>
              )}
            </div>
          </div>
        </div>

        {/* ---- actions ---- */}
        {(row?.can_sign || row?.can_delete) && (
          <ActionBar companyId={companyId} row={row!} onDone={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---- document viewer toolbar (Open / Print / Download) ---------------------
function DocViewerToolbar({ html, name }: { html: string; name: string }) {
  const { t } = useTranslation();
  const blobUrl = useMemo(() => URL.createObjectURL(new Blob([html], { type: "text/html" })), [html]);
  function print() {
    const w = window.open(blobUrl, "_blank");
    if (w) w.addEventListener("load", () => { try { w.focus(); w.print(); } catch { /* ignore */ } });
  }
  return (
    <div className="ml-auto flex items-center gap-1">
      <Button asChild size="icon" variant="ghost" className="size-8" title={t("modules.documents.viewer.open")}>
        <a href={blobUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" /></a>
      </Button>
      <Button size="icon" variant="ghost" className="size-8" title={t("modules.documents.viewer.print")} onClick={print}>
        <Printer className="size-4" />
      </Button>
      <Button asChild size="icon" variant="ghost" className="size-8" title={t("modules.documents.viewer.download")}>
        <a href={blobUrl} download={`${name}.html`}><Download className="size-4" /></a>
      </Button>
    </div>
  );
}

// ---- bank transactions card (by-contract / all-with-counterparty) ----------
function BankCard({
  companyId, partnerTin, contractNumber, contractDate,
}: {
  companyId: number;
  partnerTin?: string | null;
  contractNumber?: string | null;
  contractDate?: string | null;
}) {
  const { t } = useTranslation();
  const hasContractCtx = !!(contractNumber || contractDate);
  const [btab, setBtab] = useState<"contract" | "partner">(hasContractCtx ? "contract" : "partner");
  const { data, isLoading } = useBankTransactions(
    companyId,
    { partnerTin, contractNumber, contractDate },
    !!partnerTin,
  );

  const list = btab === "contract" ? data?.contract ?? [] : data?.partner ?? [];

  return (
    <div className="rounded-lg border">
      <div className="px-3 py-2 border-b flex items-center gap-2">
        <Building2 className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{t("modules.documents.bank.title")}</span>
      </div>
      {!partnerTin ? (
        <p className="text-xs text-muted-foreground p-3">{t("modules.documents.bank.noTin")}</p>
      ) : data && !data.available ? (
        <p className="text-xs text-muted-foreground p-3">{bankReasonText(data.reason, t) ?? t("modules.documents.bank.unavailable")}</p>
      ) : (
        <>
          <div className="flex border-b">
            {hasContractCtx && (
              <Button variant="ghost" size="sm" onClick={() => setBtab("contract")}
                      className={`h-auto rounded-none px-3 py-1.5 text-xs font-normal hover:bg-transparent ${btab === "contract" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}>
                {t("modules.documents.bank.byContract")} {data?.contract != null && `(${data.contract.length})`}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => setBtab("partner")}
                    className={`h-auto rounded-none px-3 py-1.5 text-xs font-normal hover:bg-transparent ${btab === "partner" ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}>
              {t("modules.documents.bank.allWithPartner")} {data?.partner != null && `(${data.partner.length})`}
            </Button>
          </div>
          <div className="p-2 max-h-56 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                <Loader2 className="size-3.5 animate-spin" /> {t("modules.documents.common.loading")}
              </div>
            ) : list.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2 animate-in fade-in-0 duration-300">{t("modules.documents.bank.noTransactions")}</p>
            ) : (
              <div className="space-y-1.5 animate-in fade-in-0 duration-300">{list.map((tx, i) => <BankRow key={i} tx={tx} />)}</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BankRow({ tx }: { tx: BankTx }) {
  const { t } = useTranslation();
  const isIn = tx.direction === "in";
  return (
    <div className="rounded-md border px-2.5 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <Badge variant={isIn ? "success" : "info"} className="text-[10px]">{isIn ? t("modules.documents.bank.in") : t("modules.documents.bank.out")}</Badge>
        <span className="text-muted-foreground">{tx.document_date ?? "—"}</span>
        {tx.payment_number && <span className="text-muted-foreground">№{tx.payment_number}</span>}
        <span className={`ml-auto tabular-nums font-medium ${isIn ? "text-success" : "text-destructive"}`}>
          {isIn ? "+" : "−"} {money(tx.amount)}
        </span>
      </div>
      {tx.counterparty && <div className="truncate mt-0.5">{tx.counterparty}</div>}
      {tx.payment_purpose && <div className="text-muted-foreground truncate">{tx.payment_purpose}</div>}
    </div>
  );
}

// ---- action bar + modal (Sign / Reject / Delete) ---------------------------
function ActionBar({ companyId, row, onDone }: { companyId: number; row: DocRow; onDone: () => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<null | "sign" | "reject" | "delete">(null);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const sign = useSignDocument();
  const reject = useRejectDocument();
  const del = useDeleteDocument();
  const pending = sign.isPending || reject.isPending || del.isPending;
  const pk = row.id!;

  const run = () => {
    setErr(null);
    const onSuccess = () => { setMode(null); setComment(""); onDone(); };
    const onError = (e: unknown) =>
      setErr(String((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? (e as Error)?.message ?? e));
    if (mode === "sign") sign.mutate({ companyId, pk }, { onSuccess, onError });
    else if (mode === "delete") del.mutate({ companyId, pk }, { onSuccess, onError });
    else if (mode === "reject") {
      if (!comment.trim()) { setErr(t("modules.documents.reject.commentRequired")); return; }
      reject.mutate({ companyId, pk, comment }, { onSuccess, onError });
    }
  };

  return (
    <>
      <div className="border-t px-5 py-3 flex items-center gap-2 bg-muted/20">
        {row.can_sign && (
          <>
            <Button size="sm" onClick={() => setMode("sign")}>
              <PenLine className="size-4 mr-1.5" /> {t("modules.documents.actions.sign")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode("reject")}>
              <Ban className="size-4 mr-1.5" /> {t("modules.documents.actions.reject")}
            </Button>
          </>
        )}
        {row.can_delete && (
          <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => setMode("delete")}>
            <Trash2 className="size-4 mr-1.5" /> {t("modules.documents.actions.delete")}
          </Button>
        )}
      </div>

      <Dialog open={!!mode} onOpenChange={(o) => { if (!o && !pending) { setMode(null); setErr(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode ? t(`modules.documents.confirm.${mode}`) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {mode === "delete" && (
              <p className="text-sm text-muted-foreground">{t("modules.documents.confirm.deleteWarning")}</p>
            )}
            {mode === "reject" && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("modules.documents.reject.commentLabel")}</label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("modules.documents.reject.commentShort")}
                  rows={3}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
            {err && <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">{err}</div>}
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setMode(null); setErr(null); }} disabled={pending}>
                {t("modules.documents.actions.cancel")}
              </Button>
              <Button size="sm" variant={mode === "delete" ? "destructive" : "default"} onClick={run} disabled={pending}>
                {pending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                {t("modules.documents.actions.confirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- party block (full: name/TIN/address/phone/director/account/MFO/VAT) ----
function PartyBlock({ p, loading }: { p: DocParty | null; loading?: boolean }) {
  const { t } = useTranslation();
  return (
    <Reveal
      loading={!!loading}
      skeleton={<div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>}
    >
      {!p ? (
        <div className="text-sm text-muted-foreground">{t("modules.documents.party.noInfo")}</div>
      ) : (
    <div className="space-y-1.5">
      <div className="font-medium text-sm">{p.name ?? "—"}</div>
      {p.tin && <div className="text-xs text-muted-foreground tabular-nums">{t("modules.documents.party.tinPrefix")} {p.tin}</div>}
      {p.address && <div className="text-xs text-muted-foreground">{p.address}</div>}
      <div className="rounded-md border divide-y text-xs mt-2">
        {p.phone && <PartyRow label={t("modules.documents.party.phone")} value={p.phone} />}
        {p.director && <PartyRow label={t("modules.documents.party.director")} value={p.director} />}
        {p.accountant && <PartyRow label={t("modules.documents.party.accountant")} value={p.accountant} />}
        {p.account && <PartyRow label={t("modules.documents.party.account")} value={p.account} mono />}
        {p.bank_id && <PartyRow label={t("modules.documents.party.mfo")} value={p.bank_id} mono />}
        {p.vat_reg_code && <PartyRow label={t("modules.documents.party.vatCode")} value={p.vat_reg_code} mono />}
        {p.vat_reg_status && <PartyRow label={t("modules.documents.party.vatStatus")} value={p.vat_reg_status} />}
      </div>
    </div>
      )}
    </Reveal>
  );
}

function PartyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 px-2.5 py-1.5">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right ${mono ? "tabular-nums" : ""}`}>{value}</span>
    </div>
  );
}

function fallbackParty(d: DocDetail | undefined, type: "sender" | "receiver"): DocParty | null {
  if (!d) return null;
  // when json_data party block is absent, synthesize from row-level partner fields
  const incoming = Number(d.owner) === 0;
  const isCounterparty = (incoming && type === "sender") || (!incoming && type === "receiver");
  if (isCounterparty) {
    return {
      name: d.partner_name,
      tin: d.partner_tin,
      phone: d.partner_phone,
    };
  }
  return { tin: d.users_tax_id, account: d.seller_account };
}

function Row({ label, value, mono, strong }: { label: string; value?: string | number | null; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 gap-3">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className={`text-right ${mono ? "tabular-nums text-xs break-all" : ""} ${strong ? "font-semibold" : ""}`}>{value ?? "—"}</span>
    </div>
  );
}
