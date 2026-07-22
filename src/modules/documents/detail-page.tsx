// Full-page detail view for a single document. Mirrors cloud
// apps/aiba_documents/templates/document-detail.php + js/document-detail.js:
//   .doc-layout: LEFT 380px sidebar (header / sender-receiver tabs / detail tabs / bank) + RIGHT viewer.
// Replaces the previous Sheet-based DocumentDetail on the list page.
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useUrlState } from "@/shared/hooks/use-url-state";
import { useTranslation } from "react-i18next";
import {
  Loader2, PenLine, Ban, Trash2, FileText, ExternalLink, Printer, Download,
  Building2, AlertCircle, Tag, Percent, ZoomIn, ZoomOut, RotateCcw,
} from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { useTabs, moduleRoot } from "@/shared/store/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DetailPage, DetailCard, DetailRow as KvRow } from "@/components/ui/detail-page";
import { Reveal } from "@/components/ui/reveal";
import {
  useDocDetail, useDocHtml, useDocPdf, useBankTransactions,
  useSignDocument, useRejectDocument, useDeleteDocument,
} from "./api";
import { bankReasonText } from "./bank-reason";
import {
  doctypeLabel, statusMeta, riskMeta, extractDocFile,
  type DocDetail, type DocParty, type BankTx, type DocFile,
} from "./types";

function money(v?: number | null) {
  return v == null
    ? "—"
    : Number(v).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function DocumentDetailPage() {
  const { t } = useTranslation();
  const { id: pk } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;

  // Smart Back: if the list we came from is still exactly where we left it,
  // close this doc's tab and return to it; otherwise (its page/filter changed,
  // or it was closed) reopen that source list here.
  const onBack = () => {
    const st = useTabs.getState();
    const myPath = `/documents/${pk}`;
    const myTab = st.tabs.find((tb) => tb.path === myPath) ?? st.tabs.find((tb) => tb.id === st.activeId) ?? null;
    const referrer = st.referrers[myPath] || "/documents";
    const listTab = st.tabs.find((tb) => tb.id !== myTab?.id && moduleRoot(tb.path) === "/documents");
    if (listTab && listTab.path === referrer) {
      st.setActive(listTab.id);
      if (myTab) st.close(myTab.id);
    } else {
      navigate(referrer);
    }
  };

  const { data, isLoading, error } = useDocDetail(companyId, pk ?? null);
  const docId = data?.doc_id ?? null;
  // Active detail sub-tab is navigational → URL (deep-link + Back/Forward).
  const [tabRaw, setTabRaw] = useUrlState("tab", "info");
  const tab = tabRaw as "info" | "finance" | "products";
  const setTab = (v: "info" | "finance" | "products") => setTabRaw(v);
  const [party, setParty] = useState<"sender" | "receiver">("sender");
  const [viewerOpen] = useState(true);

  const html = useDocHtml(companyId, docId, "ru", viewerOpen);

  // Attached file (contract / free-doc PDF or scan). When present we show it as
  // the primary view — the /html endpoint only returns the e-signature envelope
  // for these, so the actual document lives in this uploaded file.
  const file = useMemo(() => extractDocFile(data), [data]);
  // По умолчанию активна вкладка «Файл» (PDF); HTML-вид — по клику на «Э-подпись».
  const [showFile, setShowFile] = useState(true);
  useEffect(() => { setShowFile(true); }, [data?.doc_id]);
  const fileVisible = !!file && showFile;

  // The actual document is the Didox PDF render, fetched (as a blob) through our
  // backend only while the file view is active. We mint a same-origin object URL
  // so the <iframe> frames cleanly and the download keeps the real filename.
  const pdf = useDocPdf(companyId, docId, "ru", fileVisible);
  const [pdfUrl, setPdfUrl] = useState<string>();
  useEffect(() => {
    if (!pdf.data) { setPdfUrl(undefined); return; }
    const url = URL.createObjectURL(pdf.data);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pdf.data]);

  const st = statusMeta(data?.status_group);
  const rk = riskMeta(data?.doc_rating);
  const stLabel = data?.status_group ? t(`modules.documents.status.${data.status_group}`, st.label) : st.label;
  const rkLabel = rk && data?.doc_rating ? t(`modules.documents.risk.${data.doc_rating.toUpperCase()}`, rk.label) : rk?.label;

  // Sender/Receiver resolution — incoming (owner=0): seller is the counterparty.
  const senderParty = data?.seller ?? fallbackParty(data, "sender");
  const receiverParty = data?.buyer ?? fallbackParty(data, "receiver");

  const ownerLabel = data?.owner === 0 ? t("modules.documents.sections.incoming") : data?.owner === 1 ? t("modules.documents.sections.outgoing") : null;
  const titleText = useMemo(() => {
    const parts: string[] = [(data?.doctype ? t(`modules.documents.doctypes.${data.doctype}`, doctypeLabel(data.doctype)) : doctypeLabel(data?.doctype)) ?? "—"];
    if (data?.name) parts.push(data.name);
    return parts.join(": ");
  }, [data, t]);

  // Give this doc's tab a meaningful label — e.g. «Акт: "OCTAGRAM" AJ» (short
  // doctype + counterparty) instead of the generic "Documents".
  const setTabTitle = useTabs((s) => s.setTitle);
  const tabTitle = useMemo(() => {
    if (!data) return "";
    const full = data.doctype ? t(`modules.documents.doctypes.${data.doctype}`, doctypeLabel(data.doctype)) : "";
    // Per-doctype abbreviation (Счёт-фактура → «СФ»), falling back to first word.
    const abbr = data.doctype
      ? t(`modules.documents.doctypesAbbr.${data.doctype}`, { defaultValue: full.split(" ")[0] || full })
      : "";
    const partner = data.partner_name?.trim();
    return partner ? `${abbr}: ${partner}` : abbr;
  }, [data, t]);
  useEffect(() => {
    if (pk && tabTitle) setTabTitle(`/documents/${pk}`, tabTitle);
  }, [pk, tabTitle, setTabTitle]);

  if (!companyId) {
    return (
      <DetailPage backTo="/documents" backLabel={t("modules.documents.title")} onBack={onBack} sidebar={null}>
        <div className="m-6 rounded-lg border bg-card p-8 text-center text-muted-foreground">
          {t("modules.documents.emptyState.pickCompanyDetail")}
        </div>
      </DetailPage>
    );
  }

  // -- sidebar --------------------------------------------------------------
  const sidebar = (
    <>
      {/* (1) Header card */}
      <DetailCard>
        <Reveal
          loading={isLoading}
          skeleton={
            <div className="space-y-2">
              <Skeleton className="h-3 w-12" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-6 w-24" />
            </div>
          }
        >
          <>
            <div className="text-base font-semibold text-foreground leading-tight">
              {titleText}
            </div>
            {data?.doc_date && (
              <div className="mt-1 text-xs text-muted-foreground">{data.doc_date}</div>
            )}
            {data?.doc_id && (
              <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{t("modules.documents.fields.idPrefix")}: {data.doc_id}</div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <Badge variant={st.variant}>{stLabel}</Badge>
              {ownerLabel && (
                <Badge variant={data?.owner === 0 ? "info" : "muted"}>{ownerLabel}</Badge>
              )}
              {rk && <Badge variant={rk.variant}>{t("modules.documents.risk.label")}: {rkLabel}</Badge>}
              {data?.has_lgota && (
                <Badge variant="success" className="gap-1">
                  <Percent className="size-3" />
                  {t("modules.documents.badges.benefit")}
                </Badge>
              )}
              {data?.has_marks && (
                <Badge variant="info" className="gap-1">
                  <Tag className="size-3" />
                  {t("modules.documents.badges.markirovka")}
                </Badge>
              )}
            </div>
            {(data?.can_sign || data?.can_delete) && (
              <ActionBar
                companyId={companyId}
                pk={pk!}
                canSign={!!data?.can_sign}
                canDelete={!!data?.can_delete}
              />
            )}
          </>
        </Reveal>
      </DetailCard>

      {/* (2) Sender / Receiver tabs */}
      <DetailCard>
        <div className="-mt-4 -mx-4 mb-3 flex border-b border-border">
          {(["sender", "receiver"] as const).map((p) => (
            <Button
              key={p}
              variant="ghost"
              size="sm"
              onClick={() => setParty(p)}
              className={`h-auto flex-1 rounded-none px-3 py-2 font-normal hover:bg-transparent ${
                party === p
                  ? "border-b-2 border-primary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p === "sender" ? t("modules.documents.party.sender") : t("modules.documents.party.receiver")}
            </Button>
          ))}
        </div>
        <PartyBlock p={party === "sender" ? senderParty : receiverParty} loading={isLoading} />
      </DetailCard>

      {/* (3) Detail tabs: Umumiy / Moliya / Tovarlar */}
      <DetailCard>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="w-full">
            <TabsTrigger value="info" className="flex-1">{t("modules.documents.tabs.general")}</TabsTrigger>
            <TabsTrigger value="finance" className="flex-1">{t("modules.documents.tabs.finance")}</TabsTrigger>
            <TabsTrigger value="products" className="flex-1">{t("modules.documents.tabs.products")}</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="mt-3">
            <Reveal
              loading={isLoading}
              skeleton={
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
                </div>
              }
            >
              <dl className="text-sm">
                <KvRow k={t("modules.documents.fields.name")} v={data?.name} />
                <KvRow k={t("modules.documents.fields.docId")} v={data?.doc_id} mono />
                <KvRow k={t("modules.documents.columns.doctype")} v={data?.doctype ? t(`modules.documents.doctypes.${data.doctype}`, doctypeLabel(data.doctype)) : doctypeLabel(data?.doctype)} />
                <KvRow k={t("modules.documents.fields.date")} v={data?.doc_date} />
                {data?.signed_date && <KvRow k={t("modules.documents.fields.signedAt")} v={data.signed_date} />}
                {data?.created && <KvRow k={t("modules.documents.fields.createdAt")} v={data.created} />}
                {data?.updated && <KvRow k={t("modules.documents.fields.updatedAt")} v={data.updated} />}
                {data?.contract_number && <KvRow k={t("modules.documents.fields.contract")} v={data.contract_number} />}
                {data?.contract_date && <KvRow k={t("modules.documents.fields.contractDate")} v={data.contract_date} />}
                {data?.agent && <KvRow k={t("modules.documents.fields.agent")} v={data.agent} />}
              </dl>
            </Reveal>
          </TabsContent>

          <TabsContent value="finance" className="mt-3 space-y-3">
            <Reveal
              loading={isLoading}
              skeleton={
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}
                </div>
              }
            >
              <>
                <dl className="text-sm">
                  <KvRow
                    k={t("modules.documents.fields.amountWithoutVat")}
                    v={money(data?.total_without_vat ?? data?.total_sum)}
                    mono
                  />
                  <KvRow k={t("modules.documents.fields.vat")} v={money(data?.total_vat_sum)} mono />
                  <KvRow k={t("modules.documents.fields.amountWithVat")} v={money(data?.total_with_vat)} mono emphasize />
                  <KvRow k={t("modules.documents.fields.hasVat")} v={data?.has_vat ? t("modules.documents.common.yes") : t("modules.documents.common.no")} />
                </dl>
                {!!data?.vat_breakdown?.length && (
                  <div>
                    <div className="mb-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                      {t("modules.documents.vatBreakdown.title")}
                    </div>
                    <div className="overflow-hidden rounded-md border border-border">
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

          <TabsContent value="products" className="mt-3">
            <Reveal
              loading={isLoading}
              skeleton={
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
                </div>
              }
            >
              {data?.products?.length ? (
              <div className="overflow-x-auto rounded-md border border-border">
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
                        <TableCell className="max-w-[180px]">
                          <div className="truncate text-sm">{p.name ?? "—"}</div>
                          {p.catalog_code && (
                            <div className="tabular-nums text-[11px] text-muted-foreground">{p.catalog_code}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm">{p.count ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {money(p.delivery_sum ?? p.summa)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{money(p.vat_sum)}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {money(p.delivery_sum_with_vat)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">{t("modules.documents.products.empty")}</div>
              )}
            </Reveal>
          </TabsContent>
        </Tabs>
      </DetailCard>

      {/* (4) Bank operatsiyalari */}
      {data && (
        <BankCard
          companyId={companyId}
          partnerTin={data.partner_tin}
          contractNumber={data.contract_number}
          contractDate={data.contract_date}
        />
      )}
    </>
  );

  // -- right viewer ---------------------------------------------------------
  return (
    <DetailPage backTo="/documents" backLabel={t("modules.documents.title")} onBack={onBack} sidebar={sidebar}>
      <div className="flex h-full flex-col">
        {/* viewer toolbar */}
        <div className="m-4 mb-3 flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 shadow-[0_2px_10px_rgba(68,83,113,0.06)]">
          <div className="flex items-center gap-2.5 text-[15px] font-semibold text-foreground">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-4" />
            </span>
            {t("modules.documents.viewer.title")}
          </div>
          {viewerOpen && file && (
            <div className="inline-flex rounded-lg border p-0.5">
              {([["file", t("modules.documents.viewer.fileTab", { defaultValue: "Fayl" })],
                 ["html", t("modules.documents.viewer.esignTab", { defaultValue: "E-imzo" })]] as const).map(([k, lbl]) => {
                const on = (k === "file") === fileVisible;
                return (
                  <button
                    key={k}
                    onClick={() => setShowFile(k === "file")}
                    className={`rounded-md px-2.5 py-1 text-sm transition-colors ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>
          )}
          {viewerOpen && (
            fileVisible && file ? (
              <div className="ml-auto flex items-center gap-1">
                <span className="mr-1 hidden max-w-[220px] truncate text-xs text-muted-foreground sm:inline" title={file.name}>{file.name}</span>
                <Button asChild size="icon" variant="ghost" className="size-8" title={t("modules.documents.viewer.open")} disabled={!pdfUrl}>
                  <a href={pdfUrl ?? "#"} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-4" /></a>
                </Button>
                <Button asChild size="icon" variant="ghost" className="size-8" title={t("modules.documents.viewer.download")} disabled={!pdfUrl}>
                  <a href={pdfUrl ?? "#"} download={file.name}><Download className="size-4" /></a>
                </Button>
              </div>
            ) : html.data?.html ? (
              <DocViewerToolbar html={html.data.html} name={data?.name ?? data?.doc_id ?? t("modules.documents.viewer.defaultFilename")} />
            ) : null
          )}
        </div>

        {error && (
          <div className="m-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mr-1.5 inline size-4" />
            {t("modules.documents.errors.loadFailed")}
          </div>
        )}

        {/* In dark mode, a neutral "desk" behind the white page — Word-style. */}
        <div className="flex-1 overflow-auto px-4 pb-4 dark:bg-muted">
          {!viewerOpen ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <FileText className="size-8 opacity-40" />
              {t("modules.documents.viewer.openHint")}
            </div>
          ) : fileVisible && file ? (
            <FileViewer file={file} url={pdfUrl} loading={pdf.isPending} error={pdf.isError} />
          ) : html.isPending ? (
            <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t("modules.documents.common.loading")}
            </div>
          ) : html.data?.html ? (
            // Инлайн-HTML в DOM (не iframe) — стили заскоуплены под .esf-doc,
            // поэтому документ можно свободно кастомизировать.
            <div
              className="mx-auto w-full max-w-[920px] rounded-2xl border border-border bg-white p-8 shadow-sm animate-in fade-in-0 duration-300"
              dangerouslySetInnerHTML={{ __html: html.data.html }}
            />
          ) : (
            <div className="text-sm text-muted-foreground animate-in fade-in-0 duration-300">{t("modules.documents.viewer.unavailable")}</div>
          )}
        </div>
      </div>
    </DetailPage>
  );
}

// ---- viewer toolbar (Open / Print / Download) ------------------------------
function DocViewerToolbar({ html, name }: { html: string; name: string }) {
  const { t } = useTranslation();
  const blobUrl = useMemo(
    () => URL.createObjectURL(new Blob([html], { type: "text/html" })),
    [html],
  );
  function print() {
    const w = window.open(blobUrl, "_blank");
    if (w) {
      w.addEventListener("load", () => {
        try {
          w.focus();
          w.print();
        } catch {
          /* ignore */
        }
      });
    }
  }
  return (
    <div className="ml-auto flex items-center gap-1">
      <Button asChild size="icon" variant="ghost" className="size-8" title={t("modules.documents.viewer.open")}>
        <a href={blobUrl} target="_blank" rel="noopener noreferrer">
          <ExternalLink className="size-4" />
        </a>
      </Button>
      <Button size="icon" variant="ghost" className="size-8" title={t("modules.documents.viewer.print")} onClick={print}>
        <Printer className="size-4" />
      </Button>
      <Button asChild size="icon" variant="ghost" className="size-8" title={t("modules.documents.viewer.download")}>
        <a href={blobUrl} download={`${name}.html`}>
          <Download className="size-4" />
        </a>
      </Button>
    </div>
  );
}

// ---- attached-file viewer (contract / free-doc PDF, via backend proxy) -----
function FileViewer({ file, url, loading, error }: { file: DocFile; url?: string; loading: boolean; error: boolean }) {
  const { t } = useTranslation();
  if (loading || (!url && !error))
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {t("modules.documents.common.loading")}
      </div>
    );
  if (error || !url)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <AlertCircle className="size-6 opacity-50" />
        {t("modules.documents.viewer.unavailable")}
      </div>
    );
  // Image (rasterised page) → plain <img> on a WHITE surface. No PDF plugin, so
  // no dark viewer backdrop — the document always sits on white.
  if (file.kind === "image") {
    return <ImageViewer url={url} name={file.name} />;
  }
  // Same-origin blob URL → the browser's PDF viewer frames cleanly, with its own
  // scroll. Its dark-invert would wreck the PDF, so no dark filter here.
  // `#toolbar=0&navpanes=0` hides Chrome's built-in PDF chrome (download/print/
  // zoom bar + side thumbnails) for a clean embedded view.
  const embedUrl = `${url}#toolbar=0&navpanes=0`;
  return (
    <div className="flex h-full min-h-[70vh] flex-col animate-in fade-in-0 duration-300">
      <iframe
        src={embedUrl}
        title={file.name}
        className="w-full flex-1 min-h-[70vh] bg-[#F3F4F6] [color-scheme:light]"
        style={{ colorScheme: "light" }}
      />
      <p className="text-center text-xs text-muted-foreground">
        <a href={url} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
          {t("modules.documents.viewer.openInNewTab", { defaultValue: "Fayl ko'rinmasa, yangi oynada oching" })}
        </a>
      </p>
    </div>
  );
}

// ---- image (rasterised page) viewer with zoom ------------------------------
function ImageViewer({ url, name }: { url: string; name: string }) {
  const [scale, setScale] = useState(1);
  const clamp = (v: number) => Math.min(4, Math.max(0.5, Number(v.toFixed(2))));
  return (
    <div className="relative flex h-full min-h-[60vh] w-full flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-[0_2px_10px_rgba(68,83,113,0.06)] animate-in fade-in-0 duration-300">
      {/* Zoom controls — зафиксированы в углу карточки, документ скроллится под ними */}
      <div className="absolute right-3 top-3 z-10 inline-flex items-center gap-0.5 rounded-full border border-border bg-card/95 p-1 shadow-sm backdrop-blur">
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setScale((s) => clamp(s - 0.25))} title="Уменьшить">
          <ZoomOut className="size-4" />
        </Button>
        <span className="min-w-[3.5ch] text-center text-xs tabular-nums text-muted-foreground">{Math.round(scale * 100)}%</span>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setScale((s) => clamp(s + 0.25))} title="Увеличить">
          <ZoomIn className="size-4" />
        </Button>
        <Button size="icon" variant="ghost" className="size-7" onClick={() => setScale(1)} title="Сбросить">
          <RotateCcw className="size-4" />
        </Button>
      </div>
      <div className="flex-1 overflow-auto p-6 text-center">
        <img
          src={url}
          alt={name}
          style={{ width: `${scale * 100}%`, maxWidth: scale <= 1 ? "100%" : "none" }}
          className="mx-auto h-auto origin-top select-none"
          draggable={false}
        />
      </div>
    </div>
  );
}

// ---- bank transactions card ------------------------------------------------
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
    <DetailCard
      title={
        <span className="flex items-center gap-2">
          <Building2 className="size-4 text-muted-foreground" />
          {t("modules.documents.bank.title")}
        </span>
      }
    >
      {!partnerTin ? (
        <p className="text-xs text-muted-foreground">{t("modules.documents.bank.noTin")}</p>
      ) : data && !data.available ? (
        <p className="text-xs text-muted-foreground">{bankReasonText(data.reason, t) ?? t("modules.documents.bank.unavailable")}</p>
      ) : (
        <>
          <div className="-mx-4 -mt-4 mb-3 flex border-b border-border">
            {hasContractCtx && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBtab("contract")}
                className={`h-auto rounded-none px-3 py-1.5 text-xs font-normal hover:bg-transparent ${
                  btab === "contract"
                    ? "border-b-2 border-primary font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("modules.documents.bank.byContract")} {data?.contract != null && `(${data.contract.length})`}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setBtab("partner")}
              className={`h-auto rounded-none px-3 py-1.5 text-xs font-normal hover:bg-transparent ${
                btab === "partner"
                  ? "border-b-2 border-primary font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("modules.documents.bank.allWithPartner")} {data?.partner != null && `(${data.partner.length})`}
            </Button>
          </div>
          {isLoading ? (
            <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> {t("modules.documents.common.loading")}
            </div>
          ) : list.length === 0 ? (
            <p className="p-2 text-xs text-muted-foreground animate-in fade-in-0 duration-300">{t("modules.documents.bank.noTransactions")}</p>
          ) : (
            <div className="max-h-56 space-y-1.5 overflow-y-auto animate-in fade-in-0 duration-300">
              {list.map((tx, i) => <BankRow key={i} tx={tx} />)}
            </div>
          )}
        </>
      )}
    </DetailCard>
  );
}

function BankRow({ tx }: { tx: BankTx }) {
  const { t } = useTranslation();
  const isIn = tx.direction === "in";
  return (
    <div className="rounded-md border border-border bg-card px-2.5 py-1.5 text-xs">
      <div className="flex items-center gap-2">
        <Badge variant={isIn ? "success" : "info"} className="text-[10px]">
          {isIn ? t("modules.documents.bank.in") : t("modules.documents.bank.out")}
        </Badge>
        <span className="text-muted-foreground">{tx.document_date ?? "—"}</span>
        {tx.payment_number && (
          <span className="text-muted-foreground">№{tx.payment_number}</span>
        )}
        <span
          className={`ml-auto tabular-nums font-medium ${isIn ? "text-success" : "text-destructive"}`}
        >
          {isIn ? "+" : "−"} {money(tx.amount)}
        </span>
      </div>
      {tx.counterparty && <div className="mt-0.5 truncate">{tx.counterparty}</div>}
      {tx.payment_purpose && (
        <div className="truncate text-muted-foreground">{tx.payment_purpose}</div>
      )}
    </div>
  );
}

// ---- action bar + confirmation modal ---------------------------------------
function ActionBar({
  companyId, pk, canSign, canDelete,
}: {
  companyId: number;
  pk: string;
  canSign: boolean;
  canDelete: boolean;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<null | "sign" | "reject" | "delete">(null);
  const [comment, setComment] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const sign = useSignDocument();
  const reject = useRejectDocument();
  const del = useDeleteDocument();
  const pending = sign.isPending || reject.isPending || del.isPending;

  const run = () => {
    setErr(null);
    const onSuccess = () => {
      setMode(null);
      setComment("");
    };
    const onError = (e: unknown) =>
      setErr(
        String(
          (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
            (e as Error)?.message ??
            e,
        ),
      );
    if (mode === "sign") sign.mutate({ companyId, pk }, { onSuccess, onError });
    else if (mode === "delete") del.mutate({ companyId, pk }, { onSuccess, onError });
    else if (mode === "reject") {
      if (!comment.trim()) {
        setErr(t("modules.documents.reject.commentRequired"));
        return;
      }
      reject.mutate({ companyId, pk, comment }, { onSuccess, onError });
    }
  };

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        {canSign && (
          <>
            <Button size="sm" onClick={() => setMode("sign")}>
              <PenLine className="mr-1.5 size-4" /> {t("modules.documents.actions.sign")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setMode("reject")}>
              <Ban className="mr-1.5 size-4" /> {t("modules.documents.actions.reject")}
            </Button>
          </>
        )}
        {canDelete && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive"
            onClick={() => setMode("delete")}
          >
            <Trash2 className="mr-1.5 size-4" /> {t("modules.documents.actions.delete")}
          </Button>
        )}
      </div>

      <Dialog
        open={!!mode}
        onOpenChange={(o) => {
          if (!o && !pending) {
            setMode(null);
            setErr(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mode ? t(`modules.documents.confirm.${mode}`) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {mode === "delete" && (
              <p className="text-sm text-muted-foreground">
                {t("modules.documents.confirm.deleteWarning")}
              </p>
            )}
            {mode === "reject" && (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{t("modules.documents.reject.commentLabel")}</label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={t("modules.documents.reject.commentShort")}
                  rows={3}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}
            {err && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {err}
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMode(null);
                  setErr(null);
                }}
                disabled={pending}
              >
                {t("modules.documents.actions.cancel")}
              </Button>
              <Button
                size="sm"
                variant={mode === "delete" ? "destructive" : "default"}
                onClick={run}
                disabled={pending}
              >
                {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                {t("modules.documents.actions.confirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---- party block (cloud .doc-company-panel) --------------------------------
function PartyBlock({ p, loading }: { p: DocParty | null; loading?: boolean }) {
  const { t } = useTranslation();
  return (
    <Reveal
      loading={!!loading}
      skeleton={
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      }
    >
      {!p ? (
        <div className="text-sm text-muted-foreground">{t("modules.documents.party.noInfo")}</div>
      ) : (
    <div className="space-y-1.5">
      <div className="text-sm font-medium text-foreground">{p.name ?? "—"}</div>
      {p.tin && <div className="tabular-nums text-xs text-muted-foreground">{t("modules.documents.party.tinPrefix")} {p.tin}</div>}
      {p.address && <div className="text-xs text-muted-foreground">{p.address}</div>}
      <dl className="mt-2 text-xs">
        {p.phone && <KvRow k={t("modules.documents.party.phone")} v={p.phone} />}
        {p.director && <KvRow k={t("modules.documents.party.director")} v={p.director} />}
        {p.accountant && <KvRow k={t("modules.documents.party.accountant")} v={p.accountant} />}
        {p.account && <KvRow k={t("modules.documents.party.account")} v={p.account} mono />}
        {p.bank_id && <KvRow k={t("modules.documents.party.mfo")} v={p.bank_id} mono />}
        {p.vat_reg_code && <KvRow k={t("modules.documents.party.vatCode")} v={p.vat_reg_code} mono />}
        {p.vat_reg_status && <KvRow k={t("modules.documents.party.vatStatus")} v={p.vat_reg_status} />}
      </dl>
    </div>
      )}
    </Reveal>
  );
}

function fallbackParty(
  d: DocDetail | undefined,
  type: "sender" | "receiver",
): DocParty | null {
  if (!d) return null;
  const incoming = Number(d.owner) === 0;
  const isCounterparty =
    (incoming && type === "sender") || (!incoming && type === "receiver");
  if (isCounterparty) {
    return { name: d.partner_name, tin: d.partner_tin, phone: d.partner_phone };
  }
  return { tin: d.users_tax_id, account: d.seller_account };
}
