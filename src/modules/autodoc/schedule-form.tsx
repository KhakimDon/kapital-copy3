/**
 * Avtohujjat — Schedule create/edit form.
 *
 * Mirrors `aiba_integration/templates/autodoc-form.php` + `js/autodoc-form.js`
 * at native parity, scaled down to the fields the cron dispatcher actually
 * reads. Rendered inside a right-side Sheet (parent owns open/close).
 *
 * Sections:
 *   1. Asosiy        — Nomi, Hujjat turi (002/005/007/000…), Faollik toggle
 *   2. Xaridor       — TIN input + auto-lookup via /api/v2/kontragent/lookup
 *   3. Hujjat tarkibi
 *      - 007  → contract_name, contract_no/date, contract_place, valid_to,
 *               parts repeater (title + body) — JSON-encoded into parts_json
 *      - 000  → doc title + free-form PDF base64 upload (≤10MB)
 *      - any other → factura_no/factura_date, product_name + qty + price,
 *                    optional MXIK code, VAT toggle + rate
 *   4. Interval     — interval_type select, day_of_week (weekly/biweekly),
 *                     day_of_month (monthly), time-of-day kept at 09:00 (the
 *                     cloud cron defaults to it; surfacing it now would only
 *                     drift from prod).
 *
 * Validation:
 *   - Common: name (required), buyer_tin (required), interval_type (required).
 *   - 007: contract_no + contract_date required, contract_name required.
 *   - 002/005: factura_date required, product_name + unit_price required.
 *   - 000: contract_no (we treat this as the document number).
 *
 * Submit:
 *   - Edit mode → useUpdateSchedule({id, body})
 *   - Create mode → useCreateSchedule(body)
 * Mutation onSuccess closes the sheet; failures show inline next to the
 * primary button. Never throws — error bubbles up as text.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FilePlus,
  Save,
  Search,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import { Textarea } from "@/components/ui/textarea";
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
  DOC_TYPE_OPTIONS,
  INTERVAL_OPTIONS,
  WEEKDAY_OPTIONS,
  useCreateSchedule,
  useUpdateSchedule,
  useSchedule,
  useKontragentLookup,
  type ScheduleInput,
} from "./api";

type ContractPart = { ordno: number; title: string; body: string };

type FormState = {
  name: string;
  doc_type: string;
  is_active: boolean;
  // Xaridor
  buyer_tin: string;
  buyer_name: string;
  // Document body
  factura_no: string;
  factura_date: string;
  contract_no: string;
  contract_date: string;
  contract_name: string;
  contract_place: string;
  valid_to: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  has_vat: boolean;
  vat_rate: number;
  mxik_code: string;
  mxik_name: string;
  // 000
  pdf_base64: string;
  doc_subtype: number;
  // Contract parts
  parts: ContractPart[];
  // Interval
  interval_type: string;
  day_of_month: number;
  day_of_week: number;
  // 002
  with_act: boolean;
};

function emptyForm(): FormState {
  return {
    name: "",
    doc_type: "007",
    is_active: true,
    buyer_tin: "",
    buyer_name: "",
    factura_no: "",
    factura_date: "",
    contract_no: "",
    contract_date: "",
    contract_name: "",
    contract_place: "",
    valid_to: "",
    product_name: "",
    quantity: 1,
    unit_price: 0,
    has_vat: true,
    vat_rate: 12,
    mxik_code: "",
    mxik_name: "",
    pdf_base64: "",
    doc_subtype: 6,
    parts: [{ ordno: 1, title: "", body: "" }],
    interval_type: "monthly",
    day_of_month: 1,
    day_of_week: 1,
    with_act: false,
  };
}

const MONTHLY_PRESETS: { value: string; labelKey: string; day: number }[] = [
  { value: "start", labelKey: "modules.autodoc.form.monthly.start", day: 1 },
  { value: "middle", labelKey: "modules.autodoc.form.monthly.middle", day: 15 },
  { value: "end", labelKey: "modules.autodoc.form.monthly.end", day: 0 },
];

// ── Component ────────────────────────────────────────────────────────────────

export function ScheduleForm({
  open,
  onClose,
  mode,
  scheduleId,
  companyId,
  companyName,
  companyInn,
}: {
  open: boolean;
  onClose: () => void;
  mode: "create" | "edit";
  scheduleId?: number | null;
  companyId: number;
  companyName?: string | null;
  companyInn?: string | null;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);

  const detail = useSchedule(mode === "edit" ? scheduleId ?? null : null);
  const createMut = useCreateSchedule();
  const updateMut = useUpdateSchedule();

  // Reset form when the sheet opens / edit target changes.
  useEffect(() => {
    if (!open) return;
    if (mode === "create") {
      setForm(emptyForm());
      setSubmitError(null);
      setFieldErrors([]);
      return;
    }
    if (mode === "edit" && detail.data) {
      const d = detail.data;
      let parts: ContractPart[] = [{ ordno: 1, title: "", body: "" }];
      // cloud stores contract sections under parts_json — best-effort decode.
      const rawParts =
        (d as unknown as { parts_json?: string | null }).parts_json ?? null;
      if (rawParts) {
        try {
          const parsed = JSON.parse(rawParts);
          if (Array.isArray(parsed) && parsed.length) {
            parts = parsed.map((p, i) => ({
              ordno: i + 1,
              title: String(p.title ?? ""),
              body: String(p.body ?? ""),
            }));
          }
        } catch {
          /* malformed JSON — fall back to the empty placeholder */
        }
      }
      setForm({
        name: d.name ?? "",
        doc_type: d.doc_type || "007",
        is_active: !!d.is_active,
        buyer_tin: d.buyer_tin ?? "",
        buyer_name: d.buyer_name ?? "",
        factura_no: d.factura_no ?? "",
        factura_date: (d.factura_date ?? "").slice(0, 10),
        contract_no: d.contract_no ?? "",
        contract_date: (d.contract_date ?? "").slice(0, 10),
        contract_name: "",
        contract_place: "",
        valid_to: "",
        product_name: d.product_name ?? "",
        quantity: d.quantity ?? 1,
        unit_price: d.unit_price ?? 0,
        has_vat: d.has_vat ?? true,
        vat_rate: d.vat_rate ?? 12,
        mxik_code: d.mxik_code ?? "",
        mxik_name: d.mxik_name ?? "",
        pdf_base64: "",
        doc_subtype: 6,
        parts,
        interval_type: d.interval_type || "monthly",
        day_of_month: d.day_of_month ?? 1,
        day_of_week: d.day_of_week ?? 1,
        with_act: d.with_act ?? false,
      });
      setSubmitError(null);
      setFieldErrors([]);
    }
  }, [open, mode, scheduleId, detail.data]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string[] {
    const errs: string[] = [];
    if (!form.name.trim()) errs.push(t("modules.autodoc.form.fields.templateName"));
    if (!form.buyer_tin.trim()) errs.push(t("modules.autodoc.form.fields.buyerTinShort"));
    if (!form.interval_type) errs.push(t("modules.autodoc.columns.interval"));

    const dt = form.doc_type;
    if (dt === "007") {
      if (!form.contract_no.trim()) errs.push(t("modules.autodoc.form.fields.contractNo"));
      if (!form.contract_date) errs.push(t("modules.autodoc.form.fields.contractDate"));
      if (!form.contract_name.trim()) errs.push(t("modules.autodoc.form.fields.contractName"));
    } else if (dt === "000") {
      if (!form.contract_no.trim()) errs.push(t("modules.autodoc.form.fields.docNo"));
      if (!form.contract_date) errs.push(t("modules.autodoc.form.fields.docDate"));
    } else {
      if (!form.factura_date) errs.push(t("modules.autodoc.form.fields.invoiceDate"));
      if (!form.product_name.trim()) errs.push(t("modules.autodoc.form.fields.productName"));
      if (!(form.unit_price > 0)) errs.push(t("modules.autodoc.fields.price"));
    }

    if (form.interval_type === "monthly") {
      // 0 is "last day" → allowed.
      if (
        form.day_of_month !== 0 &&
        (form.day_of_month < 1 || form.day_of_month > 28)
      ) {
        errs.push(t("modules.autodoc.form.fields.dayOfMonthRange"));
      }
    }
    if (form.interval_type === "weekly" || form.interval_type === "biweekly") {
      if (form.day_of_week < 0 || form.day_of_week > 6) {
        errs.push(t("modules.autodoc.form.fields.dayOfWeek"));
      }
    }
    return errs;
  }

  async function handleSubmit() {
    const errs = validate();
    setFieldErrors(errs);
    if (errs.length) {
      setSubmitError(null);
      return;
    }

    const body: ScheduleInput = {
      company_eskey_id: companyId,
      company_inn: companyInn ?? null,
      company_name: companyName ?? null,
      name: form.name.trim(),
      doc_type: form.doc_type,
      is_active: form.is_active,
      buyer_tin: form.buyer_tin.trim(),
      buyer_name: form.buyer_name.trim() || null,
      interval_type: form.interval_type,
      day_of_month: form.day_of_month,
      day_of_week: form.day_of_week,
      with_act: form.doc_type === "002" ? form.with_act : false,
    };

    if (form.doc_type === "007") {
      body.contract_no = form.contract_no;
      body.contract_date = form.contract_date;
      body.contract_name = form.contract_name;
      body.contract_place = form.contract_place || null;
      body.valid_to = form.valid_to || null;
      body.parts_json = JSON.stringify(
        form.parts
          .filter((p) => p.title.trim() || p.body.trim())
          .map((p, i) => ({ ordno: i + 1, title: p.title, body: p.body }))
      );
      body.product_name = form.contract_name || form.name;
      body.quantity = 1;
      body.unit_price = form.unit_price || 0;
    } else if (form.doc_type === "000") {
      body.contract_no = form.contract_no;
      body.contract_date = form.contract_date;
      body.product_name = form.product_name || form.name;
      body.doc_subtype = form.doc_subtype;
      if (form.pdf_base64) body.pdf_base64 = form.pdf_base64;
    } else {
      body.factura_no = form.factura_no || null;
      body.factura_date = form.factura_date;
      body.contract_no = form.contract_no || null;
      body.contract_date = form.contract_date || null;
      body.product_name = form.product_name;
      body.quantity = form.quantity;
      body.unit_price = form.unit_price;
      body.has_vat = form.has_vat;
      body.vat_rate = form.has_vat ? form.vat_rate : 0;
      body.mxik_code = form.mxik_code || null;
      body.mxik_name = form.mxik_name || null;
    }

    setSubmitError(null);
    try {
      if (mode === "edit" && scheduleId) {
        await updateMut.mutateAsync({ id: scheduleId, body });
      } else {
        await createMut.mutateAsync(body);
      }
      onClose();
    } catch (e) {
      setSubmitError(extractError(e, t));
    }
  }

  const saving = createMut.isPending || updateMut.isPending;
  const title =
    mode === "edit"
      ? t("modules.autodoc.form.titleEdit")
      : t("modules.autodoc.form.titleCreate");

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <FilePlus className="size-5 text-primary" />
            {title}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <Reveal
            loading={mode === "edit" && detail.isLoading}
            skeleton={
              <div className="space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            }
            className="space-y-5"
          >
            <SectionAsosiy form={form} set={set} />
            <SectionXaridor form={form} set={set} />
            <SectionContent form={form} set={set} />
            <SectionInterval form={form} set={set} />
          </Reveal>
        </div>

        <div className="border-t px-5 py-3 bg-card">
          {fieldErrors.length > 0 && (
            <div className="mb-2 text-sm text-destructive">
              {t("modules.autodoc.form.fillFields")}: {fieldErrors.join(", ")}
            </div>
          )}
          {submitError && (
            <div className="mb-2 text-sm text-destructive">{submitError}</div>
          )}
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={saving}
              type="button"
            >
              {t("modules.autodoc.actions.cancel")}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={saving}
              type="button"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {mode === "edit"
                ? t("modules.autodoc.actions.save")
                : t("modules.autodoc.actions.create")}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Sections ─────────────────────────────────────────────────────────────────

type SetFn = <K extends keyof FormState>(key: K, value: FormState[K]) => void;

function SectionAsosiy({
  form,
  set,
}: {
  form: FormState;
  set: SetFn;
}) {
  const { t } = useTranslation();
  return (
    <Section title={t("modules.autodoc.detail.sectionMain")}>
      <Field label={t("modules.autodoc.form.fields.templateName")} required>
        <Input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder={t("modules.autodoc.form.placeholders.templateName")}
        />
      </Field>
      <Field label={t("modules.autodoc.form.fields.docType")} required>
        <Select
          value={form.doc_type}
          onValueChange={(v) => set("doc_type", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("modules.autodoc.form.placeholders.selectDocType")} />
          </SelectTrigger>
          <SelectContent>
            {DOC_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.code} value={o.code}>
                {o.code} · {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label={t("modules.autodoc.form.fields.activity")}>
        <label className="inline-flex items-center gap-2 select-none cursor-pointer">
          <Checkbox
            checked={form.is_active}
            onCheckedChange={(v) => set("is_active", Boolean(v))}
            className="size-4 rounded border-input"
          />
          <Badge variant={form.is_active ? "success" : "muted"}>
            {form.is_active ? t("modules.autodoc.status.active") : t("modules.autodoc.status.inactive")}
          </Badge>
        </label>
      </Field>
    </Section>
  );
}

function SectionXaridor({
  form,
  set,
}: {
  form: FormState;
  set: SetFn;
}) {
  const { t } = useTranslation();
  const tinTrim = form.buyer_tin.trim();
  const lookup = useKontragentLookup(tinTrim.length >= 9 ? tinTrim : null);

  // Auto-populate buyer name once the lookup resolves (mirrors cloud
  // `lookupTin` debounce behaviour — but only fills when name is empty so
  // editing the field manually still wins).
  useEffect(() => {
    if (lookup.data && lookup.data.name && !form.buyer_name) {
      set("buyer_name", String(lookup.data.name));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup.data?.name]);

  return (
    <Section title={t("modules.autodoc.form.sections.buyer")}>
      <Field label={t("modules.autodoc.form.fields.buyerTin")} required>
        <div className="flex items-center gap-2">
          <Input
            value={form.buyer_tin}
            onChange={(e) =>
              set("buyer_tin", e.target.value.replace(/[^0-9]/g, ""))
            }
            placeholder={t("modules.autodoc.form.placeholders.tin")}
            maxLength={14}
            inputMode="numeric"
          />
          {lookup.isFetching && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </Field>
      <Field label={t("modules.autodoc.form.fields.name")}>
        <Input
          value={form.buyer_name}
          onChange={(e) => set("buyer_name", e.target.value)}
          placeholder={t("modules.autodoc.form.placeholders.companyName")}
        />
      </Field>
      {lookup.data && !lookup.isFetching && (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground space-y-0.5 animate-in fade-in-0 duration-300">
          <div className="flex items-center gap-2">
            <Search className="size-3" />
            <span className="font-medium text-foreground">
              {lookup.data.name || lookup.data.short_name || "—"}
            </span>
          </div>
          {lookup.data.director && (
            <div>{t("modules.autodoc.form.lookup.director")}: {String(lookup.data.director)}</div>
          )}
          {lookup.data.address && (
            <div>{t("modules.autodoc.form.lookup.address")}: {String(lookup.data.address)}</div>
          )}
          {lookup.data.bank_name && (
            <div>
              {t("modules.autodoc.form.lookup.bank")}: {String(lookup.data.bank_name)}
              {lookup.data.mfo ? ` · MFO ${lookup.data.mfo}` : ""}
            </div>
          )}
        </div>
      )}
      {lookup.isError && tinTrim.length >= 9 && (
        <div className="text-xs text-muted-foreground">
          {t("modules.autodoc.form.lookup.notFound")}
        </div>
      )}
    </Section>
  );
}

function SectionContent({
  form,
  set,
}: {
  form: FormState;
  set: SetFn;
}) {
  const { t } = useTranslation();
  const dt = form.doc_type;

  if (dt === "007") {
    return (
      <Section title={t("modules.autodoc.form.sections.contentContract")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("modules.autodoc.form.fields.contractNo")} required>
            <Input
              value={form.contract_no}
              onChange={(e) => set("contract_no", e.target.value)}
              placeholder="№"
            />
          </Field>
          <Field label={t("modules.autodoc.form.fields.contractDate")} required>
            <DatePicker
              value={form.contract_date}
              onChange={(v) => set("contract_date", v)}
            />
          </Field>
          <Field label={t("modules.autodoc.form.fields.contractName")} required>
            <Input
              value={form.contract_name}
              onChange={(e) => set("contract_name", e.target.value)}
              placeholder={t("modules.autodoc.form.placeholders.contractTitle")}
            />
          </Field>
          <Field label={t("modules.autodoc.form.fields.contractPlace")}>
            <Input
              value={form.contract_place}
              onChange={(e) => set("contract_place", e.target.value)}
              placeholder={t("modules.autodoc.form.placeholders.tashkent")}
            />
          </Field>
          <Field label={t("modules.autodoc.form.fields.validTo")}>
            <DatePicker
              value={form.valid_to}
              onChange={(v) => set("valid_to", v)}
            />
          </Field>
          <Field label={t("modules.autodoc.form.fields.contractSum")}>
            <Input
              type="number"
              min={0}
              value={form.unit_price}
              onChange={(e) => set("unit_price", parseInt(e.target.value) || 0)}
            />
          </Field>
        </div>

        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t("modules.autodoc.form.parts.sectionsTitle")}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                set("parts", [
                  ...form.parts,
                  { ordno: form.parts.length + 1, title: "", body: "" },
                ])
              }
            >
              <Plus className="size-4" />
              {t("modules.autodoc.form.parts.addSection")}
            </Button>
          </div>
          <div className="space-y-3">
            {form.parts.map((p, idx) => (
              <div
                key={idx}
                className="rounded-md border border-border bg-card p-3 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("modules.autodoc.form.parts.partN", { n: idx + 1 })}
                  </span>
                  {form.parts.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const next = form.parts.filter((_, i) => i !== idx);
                        set("parts", next.length ? next : [{ ordno: 1, title: "", body: "" }]);
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
                <Input
                  value={p.title}
                  onChange={(e) => {
                    const next = [...form.parts];
                    next[idx] = { ...p, title: e.target.value };
                    set("parts", next);
                  }}
                  placeholder={t("modules.autodoc.form.parts.titlePlaceholder")}
                />
                <Textarea
                  value={p.body}
                  onChange={(e) => {
                    const next = [...form.parts];
                    next[idx] = { ...p, body: e.target.value };
                    set("parts", next);
                  }}
                  rows={3}
                  className="flex w-full rounded-lg border-2 border-input bg-background px-3 py-2 text-[15px] ring-offset-background placeholder:text-muted-foreground focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1"
                  placeholder={t("modules.autodoc.form.parts.bodyPlaceholder")}
                />
              </div>
            ))}
          </div>
        </div>
      </Section>
    );
  }

  if (dt === "000") {
    return (
      <Section title={t("modules.autodoc.form.sections.contentFreeForm")}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label={t("modules.autodoc.form.fields.docNo")} required>
            <Input
              value={form.contract_no}
              onChange={(e) => set("contract_no", e.target.value)}
              placeholder="№"
            />
          </Field>
          <Field label={t("modules.autodoc.form.fields.docDate")} required>
            <DatePicker
              value={form.contract_date}
              onChange={(v) => set("contract_date", v)}
            />
          </Field>
          <Field label={t("modules.autodoc.form.fields.docName")}>
            <Input
              value={form.product_name}
              onChange={(e) => set("product_name", e.target.value)}
              placeholder={t("modules.autodoc.form.placeholders.docTitle")}
            />
          </Field>
          <Field label={t("modules.autodoc.form.fields.subtype")}>
            <Select
              value={String(form.doc_subtype)}
              onValueChange={(v) => set("doc_subtype", parseInt(v) || 6)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("modules.autodoc.form.subtypes.reconciliation")}</SelectItem>
                <SelectItem value="2">{t("modules.autodoc.form.subtypes.letter")}</SelectItem>
                <SelectItem value="3">{t("modules.autodoc.form.subtypes.contract")}</SelectItem>
                <SelectItem value="4">{t("modules.autodoc.form.subtypes.invoiceForPayment")}</SelectItem>
                <SelectItem value="5">{t("modules.autodoc.form.subtypes.actOfWork")}</SelectItem>
                <SelectItem value="6">{t("modules.autodoc.form.subtypes.other")}</SelectItem>
                <SelectItem value="7">{t("modules.autodoc.form.subtypes.application")}</SelectItem>
                <SelectItem value="8">{t("modules.autodoc.form.subtypes.specification")}</SelectItem>
                <SelectItem value="9">{t("modules.autodoc.form.subtypes.addendum")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label={t("modules.autodoc.form.fields.pdfFile")}>
          <Input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) {
                set("pdf_base64", "");
                return;
              }
              if (f.size > 10 * 1024 * 1024) {
                set("pdf_base64", "");
                return;
              }
              const reader = new FileReader();
              reader.onload = () =>
                set("pdf_base64", String(reader.result || ""));
              reader.readAsDataURL(f);
            }}
            className="text-muted-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-muted file:px-3 file:py-1 file:text-sm"
          />
          {form.pdf_base64 && (
            <div className="text-xs text-muted-foreground mt-1">
              {t("modules.autodoc.form.fileUploaded", { kb: Math.round(form.pdf_base64.length / 1024) })}
            </div>
          )}
        </Field>
      </Section>
    );
  }

  // 002 / 005 / 006 / 008 / 041 / 052 / 054 / 075 — invoice-like
  return (
    <Section title={t("modules.autodoc.detail.sectionContent")}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t("modules.autodoc.form.fields.invoiceNo")}>
          <Input
            value={form.factura_no}
            onChange={(e) => set("factura_no", e.target.value)}
            placeholder={t("modules.autodoc.form.placeholders.autoCalculated")}
          />
        </Field>
        <Field label={t("modules.autodoc.form.fields.invoiceDate")} required>
          <DatePicker
            value={form.factura_date}
            onChange={(v) => set("factura_date", v)}
          />
        </Field>
        <Field label={t("modules.autodoc.form.fields.contractNo")}>
          <Input
            value={form.contract_no}
            onChange={(e) => set("contract_no", e.target.value)}
          />
        </Field>
        <Field label={t("modules.autodoc.form.fields.contractDate")}>
          <DatePicker
            value={form.contract_date}
            onChange={(v) => set("contract_date", v)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Field label={t("modules.autodoc.fields.product")} required className="sm:col-span-2">
          <Input
            value={form.product_name}
            onChange={(e) => set("product_name", e.target.value)}
            placeholder={t("modules.autodoc.form.placeholders.productOrService")}
          />
        </Field>
        <Field label={t("modules.autodoc.fields.quantity")}>
          <Input
            type="number"
            min={1}
            value={form.quantity}
            onChange={(e) => set("quantity", parseInt(e.target.value) || 1)}
          />
        </Field>
        <Field label={t("modules.autodoc.form.fields.priceSum")} required>
          <Input
            type="number"
            min={0}
            value={form.unit_price}
            onChange={(e) => set("unit_price", parseInt(e.target.value) || 0)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t("modules.autodoc.form.fields.mxikCode")}>
          <Input
            value={form.mxik_code}
            onChange={(e) => set("mxik_code", e.target.value)}
            placeholder="МХИК"
          />
        </Field>
        <Field label={t("modules.autodoc.form.fields.mxikName")}>
          <Input
            value={form.mxik_name}
            onChange={(e) => set("mxik_name", e.target.value)}
            placeholder={t("modules.autodoc.form.placeholders.mxikName")}
          />
        </Field>
      </div>

      <Field label={t("modules.autodoc.form.fields.qqs")}>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 select-none">
            <Checkbox
              checked={form.has_vat}
              onCheckedChange={(v) => set("has_vat", Boolean(v))}
              className="size-4 rounded border-input"
            />
            <span className="text-sm">{t("modules.autodoc.form.qqsLabel")}</span>
          </label>
          {form.has_vat && (
            <Select
              value={String(form.vat_rate)}
              onValueChange={(v) => set("vat_rate", parseInt(v) || 12)}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0%</SelectItem>
                <SelectItem value="12">12%</SelectItem>
                <SelectItem value="15">15%</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
      </Field>

      {dt === "002" && (
        <Field label={t("modules.autodoc.detail.withAct")}>
          <label className="inline-flex items-center gap-2 select-none">
            <Checkbox
              checked={form.with_act}
              onCheckedChange={(v) => set("with_act", Boolean(v))}
              className="size-4 rounded border-input"
            />
            <span className="text-sm">
              {t("modules.autodoc.form.withActHint")}
            </span>
          </label>
        </Field>
      )}
    </Section>
  );
}

function SectionInterval({
  form,
  set,
}: {
  form: FormState;
  set: SetFn;
}) {
  const { t } = useTranslation();
  // Helper: which monthly preset is currently active.
  const monthlyValue = useMemo(() => {
    if (form.day_of_month === 0) return "end";
    if (form.day_of_month === 15) return "middle";
    if (form.day_of_month === 1) return "start";
    return "custom";
  }, [form.day_of_month]);

  return (
    <Section title={t("modules.autodoc.form.sections.schedule")}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={t("modules.autodoc.columns.interval")} required>
          <Select
            value={form.interval_type}
            onValueChange={(v) => set("interval_type", v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map((o) => (
                <SelectItem key={o.code} value={o.code}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {form.interval_type === "monthly" && (
        <Field label={t("modules.autodoc.form.fields.dayOfMonth")}>
          <div className="flex flex-wrap items-center gap-2">
            {MONTHLY_PRESETS.map((p) => {
              const active = monthlyValue === p.value;
              return (
                <Button
                  key={p.value}
                  type="button"
                  variant="outline"
                  onClick={() => set("day_of_month", p.day)}
                  className={`h-auto gap-1.5 px-3 py-1.5 text-sm font-normal ${
                    active
                      ? "border-primary bg-primary/10 text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t(p.labelKey)}
                </Button>
              );
            })}
            <Input
              type="number"
              min={0}
              max={28}
              value={form.day_of_month}
              onChange={(e) =>
                set("day_of_month", parseInt(e.target.value) || 1)
              }
              className="w-24"
              title={t("modules.autodoc.form.dayOfMonthHint")}
            />
          </div>
        </Field>
      )}

      {(form.interval_type === "weekly" ||
        form.interval_type === "biweekly") && (
        <Field label={t("modules.autodoc.form.fields.dayOfWeek")}>
          <Select
            value={String(form.day_of_week)}
            onValueChange={(v) => set("day_of_week", parseInt(v))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAY_OPTIONS.map((o) => (
                <SelectItem key={o.code} value={String(o.code)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
    </Section>
  );
}

// ── Tiny primitives ──────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1 ${className || ""}`}>
      <label className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
    </div>
  );
}

function extractError(e: unknown, t: (k: string) => string): string {
  if (!e) return t("modules.autodoc.errors.unknown");
  const anyE = e as {
    response?: { data?: { detail?: string; error?: string } };
    message?: string;
  };
  const detail = anyE.response?.data?.detail;
  const err = anyE.response?.data?.error;
  return detail || err || anyE.message || t("modules.autodoc.errors.save");
}
