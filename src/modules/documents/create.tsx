import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Plus, Trash2, Check, Search, Upload, CheckCircle2 } from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
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
  const delivery = (Number(p.count) || 0) * (Number(p.price) || 0) + (Number(p.delivery_extra) || 0);
  const rate = p.vat_rate === "none" ? 0 : Number(p.vat_rate) || 0;
  const vat = (delivery * rate) / 100;
  return { delivery, vat, total: delivery + vat };
}
const fmt = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export function CreateDocument({
  companyId, companyInn, open, onClose,
}: {
  companyId: number;
  companyInn?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [docType, setDocType] = useState("002");
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

  // prefill seller from the company's own past documents
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

  // autofill buyer when a TIN resolves
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

  const reset = () => {
    setDocType("002"); setBuyerTin(""); setBuyer({}); setFacturaNo("");
    setFacturaDate(today()); setContractNo(""); setContractDate(today());
    setActText(""); setProducts([emptyProduct()]); setContractName("");
    setValidTo(""); setParts([{ title: "", body: "" }]); setDocName("");
    setPdf(null); setErr(null); createMut.reset();
  };
  const close = () => { reset(); onClose(); };

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
    setErr(null);
    const v = validate();
    if (v) { setErr(v); return; }
    createMut.mutate({ companyId, body: buildBody(sign) });
  }

  const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

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

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <SheetContent side="right" className="w-full sm:max-w-3xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle>{t("modules.documents.actions.newDocument")}</SheetTitle>
        </SheetHeader>

        {result?.ok ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center animate-in fade-in-0 zoom-in-95 duration-300">
            <CheckCircle2 className="size-12 text-success" />
            <div>
              <div className="text-lg font-semibold">{t("modules.documents.create.success")}</div>
              <div className="text-sm text-muted-foreground mt-1">
                {result.signed ? t("modules.documents.create.successSigned") : t("modules.documents.create.successDraft")}
                {result.message && <div className="mt-1">{result.message}</div>}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => createMut.reset()}>{t("modules.documents.create.createMore")}</Button>
              <Button onClick={close}>{t("modules.documents.actions.close")}</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* doc type */}
              <Field label={t("modules.documents.fields.doctype")}>
                <Select value={docType} onValueChange={setDocType}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CREATE_DOCTYPES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>{t(`modules.documents.doctypes.${d.value}`, d.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {/* parties */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
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
                    <div className="font-medium text-sm">{seller.name || "—"}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">{t("modules.documents.create.innPrefix")} {seller.tin || companyInn || "—"}</div>
                    {seller.account && <div className="text-xs text-muted-foreground">{t("modules.documents.create.accountShort")}: {seller.account} · {t("modules.documents.party.mfo")} {seller.bank_id}</div>}
                  </Reveal>
                </div>

                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    {t("modules.documents.create.buyer")}
                    {buyerLookup.isFetching && <Loader2 className="size-3 animate-spin" />}
                    {buyerLookup.data?.found && <Badge variant="success" className="text-[10px]">{t("modules.documents.create.found")}</Badge>}
                  </div>
                  <Input value={buyerTin} onChange={(e) => setBuyerTin(e.target.value)}
                         placeholder={t("modules.documents.placeholders.tinOrPinfl")} className="h-8" />
                  <Input value={buyer.name ?? ""} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })}
                         placeholder={t("modules.documents.fields.name")} className="h-8" />
                  <Input value={buyer.account ?? ""} onChange={(e) => setBuyer({ ...buyer, account: e.target.value })}
                         placeholder={t("modules.documents.party.account")} className="h-8" />
                  <div className="grid grid-cols-2 gap-2">
                    <Input value={buyer.bank_id ?? ""} onChange={(e) => setBuyer({ ...buyer, bank_id: e.target.value })}
                           placeholder={t("modules.documents.party.mfo")} className="h-8" />
                    <Input value={buyer.director ?? ""} onChange={(e) => setBuyer({ ...buyer, director: e.target.value })}
                           placeholder={t("modules.documents.party.director")} className="h-8" />
                  </div>
                </div>
              </div>

              {/* type-specific */}
              {isInvoiceLike && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                      <Textarea value={actText} onChange={(e) => setActText(e.target.value)} rows={2}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                    </Field>
                  )}

                  <ProductsEditor companyId={companyId} products={products} setProducts={setProducts} totals={totals} />
                </>
              )}

              {docType === "007" && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label={t("modules.documents.create.contractName")}><Input value={contractName} onChange={(e) => setContractName(e.target.value)} className="h-9" /></Field>
                    <Field label={t("modules.documents.create.contractNo")}><Input value={contractNo} onChange={(e) => setContractNo(e.target.value)} className="h-9" /></Field>
                    <Field label={t("modules.documents.fields.date")}><DatePicker value={contractDate} onChange={(v) => setContractDate(v)} className="h-9" /></Field>
                    <Field label={t("modules.documents.create.validTo")}><DatePicker value={validTo} onChange={(v) => setValidTo(v)} className="h-9" /></Field>
                  </div>
                  <ContractParts parts={parts} setParts={setParts} />
                </>
              )}

              {docType === "000" && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Field label={t("modules.documents.create.docName")}><Input value={docName} onChange={(e) => setDocName(e.target.value)} className="h-9" /></Field>
                    <Field label={t("modules.documents.create.docNo")}><Input value={facturaNo} onChange={(e) => setFacturaNo(e.target.value)} className="h-9" /></Field>
                  </div>
                  <Field label={t("modules.documents.create.pdfFile")}>
                    <label className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 cursor-pointer hover:bg-muted/30 justify-center text-sm text-muted-foreground">
                      <Upload className="size-4" />
                      {pdf ? <span className="text-foreground">{pdf.name}</span> : t("modules.documents.create.pdfPickHint")}
                      <Input type="file" accept="application/pdf" className="hidden" onChange={onFile} />
                    </label>
                  </Field>
                </>
              )}

              {(err || createMut.error) && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {err ?? String(createMut.error?.message ?? createMut.error)}
                </div>
              )}
            </div>

            {/* footer */}
            <div className="border-t px-5 py-3 flex items-center gap-2 bg-muted/20">
              <Button variant="outline" onClick={() => submit(false)} disabled={createMut.isPending}>
                {createMut.isPending && !createMut.variables?.body.sign_after_create && <Loader2 className="size-4 mr-1.5 animate-spin" />}
                {t("modules.documents.create.saveDraft")}
              </Button>
              <Button onClick={() => submit(true)} disabled={createMut.isPending}>
                {createMut.isPending && createMut.variables?.body.sign_after_create
                  ? <Loader2 className="size-4 mr-1.5 animate-spin" />
                  : <Check className="size-4 mr-1.5" />}
                {t("modules.documents.create.createAndSign")}
              </Button>
              <Button variant="ghost" className="ml-auto" onClick={close} disabled={createMut.isPending}>{t("modules.documents.actions.cancel")}</Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// ---- products editor with per-row MXIK search ------------------------------
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
  const remove = (i: number) => setProducts(products.filter((_, idx) => idx !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("modules.documents.create.productsHeading")}</span>
        <Button size="sm" variant="outline" onClick={() => setProducts([...products, emptyProduct()])}>
          <Plus className="size-4 mr-1" /> {t("modules.documents.create.addRow")}
        </Button>
      </div>
      <div className="rounded-lg border divide-y">
        {products.map((p, i) => {
          const c = rowCalc(p);
          return (
            <div key={i} className="p-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground pt-2 w-4">{i + 1}</span>
                <div className="flex-1">
                  <MxikNameInput companyId={companyId} value={p.name}
                    onName={(name) => update(i, { name })}
                    onPick={(m) => update(i, {
                      name: m.name ?? p.name, mxik_code: m.code,
                      mxik_name: m.name ?? "",
                      package_code: m.packages?.[0]?.code ?? "",
                      package_name: m.packages?.[0]?.name_ru ?? m.packages?.[0]?.name ?? "",
                    })} />
                  {p.mxik_code && <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">МХИК {p.mxik_code}</div>}
                </div>
                <Button size="icon" variant="ghost" className="text-destructive size-8" onClick={() => remove(i)} disabled={products.length <= 1}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pl-6">
                <LabeledNum label={t("modules.documents.products.count")} value={p.count} onChange={(v) => update(i, { count: v })} />
                <LabeledNum label={t("modules.documents.create.price")} value={p.price} onChange={(v) => update(i, { price: v })} />
                <div>
                  <span className="text-[10px] text-muted-foreground">{t("modules.documents.fields.vat")}</span>
                  <Select value={p.vat_rate} onValueChange={(v) => update(i, { vat_rate: v })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {VAT_RATES.map((r) => <SelectItem key={r.value} value={r.value}>{t(`modules.documents.vatRates.${r.value}`, r.label)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground block">{t("modules.documents.create.vatAmount")}</span>
                  <span className="text-sm tabular-nums">{fmt(c.vat)}</span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-muted-foreground block">{t("modules.documents.vatBreakdown.total")}</span>
                  <span className="text-sm tabular-nums font-medium">{fmt(c.total)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-6 text-sm px-2">
        <span className="text-muted-foreground">{t("modules.documents.columns.withoutVat")}: <b className="tabular-nums text-foreground">{fmt(totals.delivery)}</b></span>
        <span className="text-muted-foreground">{t("modules.documents.fields.vat")}: <b className="tabular-nums text-foreground">{fmt(totals.vat)}</b></span>
        <span className="text-muted-foreground">{t("modules.documents.vatBreakdown.total")}: <b className="tabular-nums text-foreground">{fmt(totals.total)}</b></span>
      </div>
    </div>
  );
}

function LabeledNum({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <Input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} className="h-8" />
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
        <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={value} onChange={(e) => { onName(e.target.value); setOpen(true); }}
               onFocus={() => setOpen(true)}
               onBlur={() => setTimeout(() => setOpen(false), 150)}
               placeholder={t("modules.documents.placeholders.mxikSearch")} className="h-8 pl-7" />
        {isFetching && <Loader2 className="size-3.5 absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {open && !!data?.length && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
          {data.map((m) => (
            <Button key={m.code} type="button" variant="ghost"
              className="h-auto w-full flex-col items-start gap-0 rounded-none px-3 py-1.5 font-normal"
              onMouseDown={(e) => { e.preventDefault(); onPick(m); setOpen(false); }}>
              <div className="truncate">{m.name}</div>
              <div className="text-[11px] text-muted-foreground tabular-nums">{m.code}</div>
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

function ContractParts({ parts, setParts }: { parts: CreateContractPartIn[]; setParts: (p: CreateContractPartIn[]) => void }) {
  const { t } = useTranslation();
  const update = (i: number, patch: Partial<CreateContractPartIn>) =>
    setParts(parts.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{t("modules.documents.create.contractClauses")}</span>
        <Button size="sm" variant="outline" onClick={() => setParts([...parts, { title: "", body: "" }])}>
          <Plus className="size-4 mr-1" /> {t("modules.documents.create.addClause")}
        </Button>
      </div>
      {parts.map((p, i) => (
        <div key={i} className="rounded-lg border p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
            <Input value={p.title ?? ""} onChange={(e) => update(i, { title: e.target.value })} placeholder={t("modules.documents.create.clauseTitle")} className="h-8" />
            <Button size="icon" variant="ghost" className="text-destructive size-8" onClick={() => setParts(parts.filter((_, idx) => idx !== i))} disabled={parts.length <= 1}>
              <Trash2 className="size-4" />
            </Button>
          </div>
          <Textarea value={p.body ?? ""} onChange={(e) => update(i, { body: e.target.value })} rows={2} placeholder={t("modules.documents.create.clauseBody")}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      ))}
    </div>
  );
}
