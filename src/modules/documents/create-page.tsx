// Full-page "Create document" form. Mirrors cloud
// apps/aiba_documents/templates/create-document.php + js/create-document.js:
//   header (back + doctype selector) → dynamic form sections (parties / type-specific
//   fields / products) → footer with Draft / Sign / Cancel buttons.
// Replaces the previous Sheet-based CreateDocument on the list page.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Loader2, Plus, Trash2, Check, Search, Upload, CheckCircle2, ChevronLeft,
} from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import { useTinLookup, useMxikSearch, useCreateDocument } from "./api";
import {
  CREATE_DOCTYPES, VAT_RATES,
  type CreatePartyIn, type CreateProductIn, type CreateContractPartIn,
  type CreateDocIn, type MxikItem,
} from "./types";

const today = () => new Date().toISOString().slice(0, 10);
const emptyProduct = (): CreateProductIn => ({
  name: "", count: 1, price: 0, vat_rate: "12", origin: 1, is_marked: false,
});

function rowCalc(p: CreateProductIn) {
  const delivery =
    (Number(p.count) || 0) * (Number(p.price) || 0) + (Number(p.delivery_extra) || 0);
  const rate = p.vat_rate === "none" ? 0 : Number(p.vat_rate) || 0;
  const vat = (delivery * rate) / 100;
  return { delivery, vat, total: delivery + vat };
}
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

export function DocumentCreatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;
  const companyInn = company?.inn;

  const defaultType = params.get("type") ?? "002";
  const [docType, setDocType] = useState(defaultType);

  const [seller, setSeller] = useState<CreatePartyIn>({});
  const [buyerTin, setBuyerTin] = useState("");
  const [buyer, setBuyer] = useState<CreatePartyIn>({});
  const [facturaNo, setFacturaNo] = useState("");
  const [facturaDate, setFacturaDate] = useState(today());
  const [contractNo, setContractNo] = useState("");
  const [contractDate, setContractDate] = useState(today());
  const [actText, setActText] = useState("");
  const [products, setProducts] = useState<CreateProductIn[]>([emptyProduct()]);
  const [contractName, setContractName] = useState("");
  const [validTo, setValidTo] = useState("");
  const [parts, setParts] = useState<CreateContractPartIn[]>([{ title: "", body: "" }]);
  const [docName, setDocName] = useState("");
  const [pdf, setPdf] = useState<{ base64: string; name: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const sellerLookup = useTinLookup(companyId, companyInn ?? "");
  const buyerLookup = useTinLookup(companyId, buyerTin);
  const createMut = useCreateDocument();

  // Pre-fill seller from the company's own past records.
  useEffect(() => {
    const d = sellerLookup.data;
    if (d?.found) {
      setSeller({
        tin: d.tin ?? companyInn, name: d.name ?? "", address: d.address ?? "",
        account: d.account ?? "", bank_id: d.bank_id ?? "", director: d.director ?? "",
        accountant: d.accountant ?? "", vat_reg_code: d.vat_reg_code ?? "",
        vat_reg_status: d.vat_reg_status ?? "",
      });
    } else if (companyInn && !seller.tin) {
      setSeller((s) => ({ ...s, tin: companyInn }));
    }
  }, [sellerLookup.data, companyInn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autofill buyer when a TIN resolves.
  useEffect(() => {
    const d = buyerLookup.data;
    if (d?.found) {
      setBuyer({
        tin: d.tin ?? buyerTin, name: d.name ?? "", address: d.address ?? "",
        account: d.account ?? "", bank_id: d.bank_id ?? "", director: d.director ?? "",
        accountant: d.accountant ?? "", vat_reg_code: d.vat_reg_code ?? "",
        vat_reg_status: d.vat_reg_status ?? "",
      });
    }
  }, [buyerLookup.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = useMemo(() => {
    return products.reduce(
      (acc, p) => {
        const c = rowCalc(p);
        acc.delivery += c.delivery; acc.vat += c.vat; acc.total += c.total;
        return acc;
      },
      { delivery: 0, vat: 0, total: 0 },
    );
  }, [products]);

  const isInvoiceLike = docType === "002" || docType === "005";

  function validate(): string | null {
    if (!buyer.tin && !buyerTin) return t("modules.documents.validation.buyerTin");
    if (!buyer.name) return t("modules.documents.validation.buyerName");
    if (isInvoiceLike) {
      const valid = products.filter((p) => p.name.trim());
      if (!valid.length) return t("modules.documents.validation.productRequired");
    }
    if (docType === "007" && !contractName.trim()) return t("modules.documents.validation.contractName");
    if (docType === "000") {
      if (!docName.trim()) return t("modules.documents.validation.docName");
      if (!pdf) return t("modules.documents.validation.pdfRequired");
    }
    return null;
  }

  function buildBody(sign: boolean): CreateDocIn {
    const body: CreateDocIn = {
      doc_type: docType,
      seller,
      buyer: { ...buyer, tin: buyer.tin || buyerTin },
      sign_after_create: sign,
    };
    if (isInvoiceLike) {
      body.factura_no = facturaNo; body.factura_date = facturaDate;
      body.contract_no = contractNo; body.contract_date = contractDate;
      body.products = products.filter((p) => p.name.trim());
      if (docType === "005") body.act_text = actText;
    } else if (docType === "007") {
      body.contract_name = contractName; body.contract_no = contractNo;
      body.contract_date = contractDate; body.valid_to = validTo;
      body.parts = parts.filter((p) => p.title?.trim() || p.body?.trim());
    } else if (docType === "000") {
      body.doc_name = docName; body.factura_no = facturaNo;
      body.factura_date = facturaDate; body.contract_no = contractNo;
      body.contract_date = contractDate;
      body.pdf_base64 = pdf?.base64; body.pdf_filename = pdf?.name;
    }
    return body;
  }

  function submit(sign: boolean) {
    if (!companyId) {
      setErr(t("modules.documents.validation.pickCompanyFirst"));
      return;
    }
    setErr(null);
    const v = validate();
    if (v) { setErr(v); return; }
    createMut.mutate({ companyId, body: buildBody(sign) });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.type && f.type !== "application/pdf") {
      setErr(t("modules.documents.validation.pdfOnly"));
      e.target.value = "";
      return;
    }
    if (f.size > MAX_PDF_BYTES) {
      setErr(t("modules.documents.validation.pdfTooLarge", { size: (f.size / 1024 / 1024).toFixed(1) }));
      e.target.value = "";
      return;
    }
    setErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      const raw = String(reader.result || "");
      const comma = raw.indexOf(",");
      setPdf({ base64: comma >= 0 ? raw.slice(comma + 1) : raw, name: f.name });
    };
    reader.readAsDataURL(f);
  }

  const result = createMut.data;

  if (!companyId) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        {t("modules.documents.emptyState.pickCompanyCreate")}
      </div>
    );
  }

  // Success screen — navigate user to detail (when doc_id known) or list.
  if (result?.ok) {
    return (
      <div className="-m-6 flex min-h-[calc(100vh-4rem)] items-center justify-center bg-muted/40 p-8">
        <div className="max-w-md space-y-4 rounded-lg border border-border bg-card p-8 text-center animate-in fade-in-0 zoom-in-95 duration-300">
          <CheckCircle2 className="mx-auto size-12 text-success" />
          <div>
            <div className="text-lg font-semibold">{t("modules.documents.create.success")}</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {result.signed ? t("modules.documents.create.successSignedShort") : t("modules.documents.create.successDraft")}
              {result.message && <div className="mt-1">{result.message}</div>}
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={() => createMut.reset()}>
              {t("modules.documents.create.createMore")}
            </Button>
            {result.doc_id ? (
              <Button onClick={() => navigate(`/documents/${result.doc_id}`)}>
                {t("modules.documents.create.goToDocument")}
              </Button>
            ) : (
              <Button onClick={() => navigate("/documents")}>{t("modules.documents.create.backToList")}</Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Main create form -------------------------------------------------------
  return (
    <div className="-m-6 flex min-h-[calc(100vh-4rem)] flex-col bg-muted/40">
      {/* sticky header */}
      <div className="sticky top-0 z-10 border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-6 py-4">
          <Link
            to="/documents"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            {t("modules.documents.actions.back")}
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("modules.documents.fields.doctype")}:</span>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="w-[260px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CREATE_DOCTYPES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{t(`modules.documents.doctypes.${d.value}`, d.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <h1 className="text-lg font-semibold">{t("modules.documents.actions.newDocument")}</h1>
        </div>
      </div>

      {/* form body */}
      <div className="mx-auto w-full max-w-5xl flex-1 space-y-4 px-6 py-6">
        {/* parties */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              {t("modules.documents.create.sellerYou")}
              {sellerLookup.isFetching && <Loader2 className="size-3 animate-spin" />}
            </div>
            <Reveal
              loading={sellerLookup.isFetching}
              skeleton={
                <div className="space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              }
            >
              <div className="text-sm font-medium">{seller.name || "—"}</div>
              <div className="mt-0.5 tabular-nums text-xs text-muted-foreground">
                {t("modules.documents.party.tinPrefix")} {seller.tin || companyInn || "—"}
              </div>
              {seller.account && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t("modules.documents.create.accountShort")}: {seller.account} · {t("modules.documents.party.mfo")} {seller.bank_id}
                </div>
              )}
              {seller.director && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {t("modules.documents.party.director")}: {seller.director}
                </div>
              )}
            </Reveal>
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              {t("modules.documents.create.buyer")}
              {buyerLookup.isFetching && <Loader2 className="size-3 animate-spin" />}
              {buyerLookup.data?.found && (
                <Badge variant="success" className="text-[10px]">{t("modules.documents.create.found")}</Badge>
              )}
            </div>
            <div className="space-y-2">
              <Input
                value={buyerTin}
                onChange={(e) => setBuyerTin(e.target.value)}
                placeholder={t("modules.documents.placeholders.tinOrPinfl")}
                className="h-9"
              />
              <Input
                value={buyer.name ?? ""}
                onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
                placeholder={t("modules.documents.fields.name")}
                className="h-9"
              />
              <Input
                value={buyer.account ?? ""}
                onChange={(e) => setBuyer({ ...buyer, account: e.target.value })}
                placeholder={t("modules.documents.party.account")}
                className="h-9"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={buyer.bank_id ?? ""}
                  onChange={(e) => setBuyer({ ...buyer, bank_id: e.target.value })}
                  placeholder={t("modules.documents.party.mfo")}
                  className="h-9"
                />
                <Input
                  value={buyer.director ?? ""}
                  onChange={(e) => setBuyer({ ...buyer, director: e.target.value })}
                  placeholder={t("modules.documents.party.director")}
                  className="h-9"
                />
              </div>
            </div>
          </section>
        </div>

        {/* invoice-like (002 / 005) */}
        {isInvoiceLike && (
          <section className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Field label={docType === "005" ? t("modules.documents.create.actNo") : t("modules.documents.create.facturaNo")}>
                <Input value={facturaNo} onChange={(e) => setFacturaNo(e.target.value)} className="h-9" />
              </Field>
              <Field label={t("modules.documents.fields.date")}>
                <DatePicker value={facturaDate} onChange={(v) => setFacturaDate(v)} className="h-9" />
              </Field>
              <Field label={t("modules.documents.create.contractNo")}>
                <Input value={contractNo} onChange={(e) => setContractNo(e.target.value)} className="h-9" />
              </Field>
              <Field label={t("modules.documents.fields.contractDate")}>
                <DatePicker value={contractDate} onChange={(v) => setContractDate(v)} className="h-9" />
              </Field>
            </div>
            {docType === "005" && (
              <Field label={t("modules.documents.create.actText")}>
                <Textarea
                  value={actText}
                  onChange={(e) => setActText(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </Field>
            )}
            <ProductsEditor
              companyId={companyId}
              products={products}
              setProducts={setProducts}
              totals={totals}
            />
          </section>
        )}

        {/* contract (007) */}
        {docType === "007" && (
          <section className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label={t("modules.documents.create.contractName")}>
                <Input value={contractName} onChange={(e) => setContractName(e.target.value)} className="h-9" />
              </Field>
              <Field label={t("modules.documents.create.contractNo")}>
                <Input value={contractNo} onChange={(e) => setContractNo(e.target.value)} className="h-9" />
              </Field>
              <Field label={t("modules.documents.fields.date")}>
                <DatePicker value={contractDate} onChange={(v) => setContractDate(v)} className="h-9" />
              </Field>
              <Field label={t("modules.documents.create.validTo")}>
                <DatePicker value={validTo} onChange={(v) => setValidTo(v)} className="h-9" />
              </Field>
            </div>
            <ContractParts parts={parts} setParts={setParts} />
          </section>
        )}

        {/* custom (000) */}
        {docType === "000" && (
          <section className="space-y-4 rounded-lg border border-border bg-card p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label={t("modules.documents.create.docName")}>
                <Input value={docName} onChange={(e) => setDocName(e.target.value)} className="h-9" />
              </Field>
              <Field label={t("modules.documents.create.docNo")}>
                <Input value={facturaNo} onChange={(e) => setFacturaNo(e.target.value)} className="h-9" />
              </Field>
            </div>
            <Field label={t("modules.documents.create.pdfFile")}>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted-foreground hover:bg-muted/30">
                <Upload className="size-4" />
                {pdf ? (
                  <span className="text-foreground">{pdf.name}</span>
                ) : (
                  t("modules.documents.create.pdfPickHint")
                )}
                <Input type="file" accept="application/pdf" className="hidden" onChange={onFile} />
              </label>
            </Field>
          </section>
        )}

        {(err || createMut.error) && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err ?? String(createMut.error?.message ?? createMut.error)}
          </div>
        )}
      </div>

      {/* sticky footer with actions */}
      <div className="sticky bottom-0 border-t border-border bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-6 py-3">
          <Button
            variant="outline"
            onClick={() => submit(false)}
            disabled={createMut.isPending}
          >
            {createMut.isPending && !createMut.variables?.body.sign_after_create && (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            )}
            {t("modules.documents.create.saveDraft")}
          </Button>
          <Button onClick={() => submit(true)} disabled={createMut.isPending}>
            {createMut.isPending && createMut.variables?.body.sign_after_create ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" />
            ) : (
              <Check className="mr-1.5 size-4" />
            )}
            {t("modules.documents.create.createAndSign")}
          </Button>
          <Button
            variant="ghost"
            className="ml-auto"
            onClick={() => navigate("/documents")}
            disabled={createMut.isPending}
          >
            {t("modules.documents.actions.cancel")}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- helpers ---------------------------------------------------------------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function ProductsEditor({
  companyId, products, setProducts, totals,
}: {
  companyId: number;
  products: CreateProductIn[];
  setProducts: (p: CreateProductIn[]) => void;
  totals: { delivery: number; vat: number; total: number };
}) {
  const { t } = useTranslation();
  const update = (i: number, patch: Partial<CreateProductIn>) =>
    setProducts(products.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  const remove = (i: number) =>
    setProducts(products.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {t("modules.documents.create.productsHeading")}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setProducts([...products, emptyProduct()])}
        >
          <Plus className="mr-1 size-4" /> {t("modules.documents.create.addRow")}
        </Button>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {products.map((p, i) => {
          const c = rowCalc(p);
          return (
            <div key={i} className="space-y-2 p-2.5">
              <div className="flex items-start gap-2">
                <span className="w-4 pt-2 text-xs text-muted-foreground">{i + 1}</span>
                <div className="flex-1">
                  <MxikNameInput
                    companyId={companyId}
                    value={p.name}
                    onName={(name) => update(i, { name })}
                    onPick={(m) =>
                      update(i, {
                        name: m.name ?? p.name,
                        mxik_code: m.code,
                        mxik_name: m.name ?? "",
                        package_code: m.packages?.[0]?.code ?? "",
                        package_name: m.packages?.[0]?.name_ru ?? m.packages?.[0]?.name ?? "",
                      })
                    }
                  />
                  {p.mxik_code && (
                    <div className="mt-0.5 tabular-nums text-[11px] text-muted-foreground">
                      МХИК {p.mxik_code}
                    </div>
                  )}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-destructive"
                  onClick={() => remove(i)}
                  disabled={products.length <= 1}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2 pl-6 md:grid-cols-5">
                <LabeledNum label={t("modules.documents.products.count")} value={p.count} onChange={(v) => update(i, { count: v })} />
                <LabeledNum label={t("modules.documents.create.price")} value={p.price} onChange={(v) => update(i, { price: v })} />
                <div>
                  <span className="text-[10px] text-muted-foreground">{t("modules.documents.fields.vat")}</span>
                  <Select value={p.vat_rate} onValueChange={(v) => update(i, { vat_rate: v })}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VAT_RATES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{t(`modules.documents.vatRates.${r.value}`, r.label)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] text-muted-foreground">{t("modules.documents.create.vatAmount")}</span>
                  <span className="tabular-nums text-sm">{fmt(c.vat)}</span>
                </div>
                <div className="text-right">
                  <span className="block text-[10px] text-muted-foreground">{t("modules.documents.vatBreakdown.total")}</span>
                  <span className="tabular-nums text-sm font-medium">{fmt(c.total)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap justify-end gap-6 px-2 text-sm">
        <span className="text-muted-foreground">
          {t("modules.documents.columns.withoutVat")}: <b className="tabular-nums text-foreground">{fmt(totals.delivery)}</b>
        </span>
        <span className="text-muted-foreground">
          {t("modules.documents.fields.vat")}: <b className="tabular-nums text-foreground">{fmt(totals.vat)}</b>
        </span>
        <span className="text-muted-foreground">
          {t("modules.documents.vatBreakdown.total")}: <b className="tabular-nums text-foreground">{fmt(totals.total)}</b>
        </span>
      </div>
    </div>
  );
}

function LabeledNum({
  label, value, onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8"
      />
    </div>
  );
}

function MxikNameInput({
  companyId, value, onName, onPick,
}: {
  companyId: number;
  value: string;
  onName: (v: string) => void;
  onPick: (m: MxikItem) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isFetching } = useMxikSearch(companyId, open ? value : "");
  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => {
            onName(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={t("modules.documents.placeholders.mxikSearch")}
          className="h-8 pl-7"
        />
        {isFetching && (
          <Loader2 className="absolute right-2 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && !!data?.length && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {data.map((m) => (
            <Button
              key={m.code}
              type="button"
              variant="ghost"
              className="h-auto w-full flex-col items-start gap-0 rounded-none px-3 py-1.5 font-normal"
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(m);
                setOpen(false);
              }}
            >
              <div className="truncate">{m.name}</div>
              <div className="tabular-nums text-[11px] text-muted-foreground">{m.code}</div>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function ContractParts({
  parts, setParts,
}: {
  parts: CreateContractPartIn[];
  setParts: (p: CreateContractPartIn[]) => void;
}) {
  const { t } = useTranslation();
  const update = (i: number, patch: Partial<CreateContractPartIn>) =>
    setParts(parts.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">
          {t("modules.documents.create.contractClauses")}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setParts([...parts, { title: "", body: "" }])}
        >
          <Plus className="mr-1 size-4" /> {t("modules.documents.create.addClause")}
        </Button>
      </div>
      {parts.map((p, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-border p-2.5">
          <div className="flex items-center gap-2">
            <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
            <Input
              value={p.title ?? ""}
              onChange={(e) => update(i, { title: e.target.value })}
              placeholder={t("modules.documents.create.clauseTitle")}
              className="h-8"
            />
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-destructive"
              onClick={() => setParts(parts.filter((_, idx) => idx !== i))}
              disabled={parts.length <= 1}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          <Textarea
            value={p.body ?? ""}
            onChange={(e) => update(i, { body: e.target.value })}
            rows={2}
            placeholder={t("modules.documents.create.clauseBody")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      ))}
    </div>
  );
}
