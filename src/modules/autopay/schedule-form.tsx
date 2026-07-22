/**
 * Avtoto'lov ScheduleForm — port of cloud-os
 *   apps/aiba_integration/templates/autopay-form.php (~766 LOC)
 *   apps/aiba_integration/js/autopay-form.js (~2182 LOC)
 *
 * One large Sheet that walks the user through the 6 sections of a new
 * (or edited) recurring payment:
 *
 *   1. Asosiy        — name, category (CATEGORY pills), bank provider, active
 *   2. Yuboruvchi    — sender_account / sender_branch (picked from bank accs)
 *   3. Oluvchi       — receiver_type radio + conditional fields per type
 *                      (entity-INN / individual-PINFL / card / employee roster)
 *   4. Summa+maqsad  — amount, purpose, purpose_code (Ipak only)
 *   5. Byudjet       — budget_amount, budget_period
 *   6. Takrorlash    — recurrence_json builder + live next-5 preview
 *
 * Validation is client-side (lightweight); the backend re-validates via the
 * Python port of RecurrenceEngine + the CATEGORY matrix.
 *
 * Convention notes:
 *   - NC theme tokens only via shadcn primitives. No hex literals here.
 *   - All copy in Uzbek (Latin). Money toLocaleString("ru-RU").
 *   - Inline types stay in this file when not shared; everything cross-form
 *     hits autopay/api.ts.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CreditCard, Banknote, ChevronLeft, ChevronRight,
  Loader2, AlertCircle, CheckCircle2, Trash2, Plus, Users,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/shared/lib/utils";
import {
  useCreateSchedule, useUpdateSchedule, useRecurrencePreview,
  autopayErrDetail,
  type AutopaySchedule, type ScheduleWriteBody, type RecurrenceRule,
} from "./api";

// ── Constants (mirror cloud autopay-form.php $cats + CATEGORY matrix) ────────

type CategoryKey =
  | "tax" | "budget" | "kazacheystvo" | "rent" | "comms" | "supplier"
  | "salary_card" | "salary_payroll" | "other";

type CategoryCfg = {
  payment_type: "account" | "card" | "payroll";
  document_type: string;
  default_code?: string;
  disabled?: boolean; // 'tax' is filed via Soliq integration, not autopay.
};

const CATEGORIES: Record<CategoryKey, CategoryCfg> = {
  tax:            { payment_type: "account", document_type: "98", disabled: true },
  budget:         { payment_type: "account", document_type: "99" },
  kazacheystvo:   { payment_type: "account", document_type: "98" },
  rent:           { payment_type: "account", document_type: "01", default_code: "00647" },
  comms:          { payment_type: "account", document_type: "01" },
  supplier:       { payment_type: "account", document_type: "01", default_code: "00599" },
  salary_card:    { payment_type: "card",    document_type: "97", default_code: "00719" },
  salary_payroll: { payment_type: "payroll", document_type: "01" },
  other:          { payment_type: "account", document_type: "01" },
};

type ReceiverType = "tashkilot" | "jismoniy" | "karta" | "xodimlar";

const WEEKDAY_CODES = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

type Preset = "once" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

// Default rule used for new schedules — monthly, day 1, 09:00, skip weekends.
function defaultRule(): RecurrenceRule {
  const today = new Date().toISOString().slice(0, 10);
  return {
    freq: "monthly",
    interval: 1,
    byMonthDay: [1],
    hour: 9,
    minute: 0,
    timezone: "Asia/Tashkent",
    startDate: today,
    endMode: "never",
    until: null,
    count: null,
    skipWeekends: true,
  };
}

// ── Form state types (local — do not leak into api.ts) ──────────────────────

type EmployeeRow = {
  // KB rows carry employeeCode + fio + inn (bank-side roster).
  employeeCode?: string;
  fio?: string;
  inn?: string;
  // IY rows carry card + name + pinfl (manual entry).
  card_number?: string;
  name?: string;
  pinfl?: string;
  amount: number;
};

type FormState = {
  // Section 1: Asosiy
  name: string;
  category: CategoryKey;
  bank_provider: "kapitalbank" | "ipak_yoli";
  is_active: boolean;
  // Section 2: Yuboruvchi
  sender_account_number: string;
  sender_branch: string;
  card_number: string; // sender card for category=salary_card
  // Section 3: Oluvchi
  receiver_type: ReceiverType;
  receiver_name: string;
  receiver_inn_or_pinfl: string;
  receiver_branch: string;
  receiver_account_number: string;
  receiver_card_number: string; // for salary_card receiver
  // Section 4: Summa + maqsad
  amount: number;
  payment_purpose: string;
  payment_purpose_code: string;
  // Section 5: Byudjet — only shown for tax/budget/kazacheystvo
  budget_inn: string;
  budget_name: string;
  budget_account_number: string;
  // Payroll
  description: string;
  employees: EmployeeRow[];
  // Section 6: Takrorlash
  preset: Preset;
  rule: RecurrenceRule;
};

function blankState(): FormState {
  return {
    name: "",
    category: "supplier",
    bank_provider: "kapitalbank",
    is_active: true,
    sender_account_number: "",
    sender_branch: "",
    card_number: "",
    receiver_type: "tashkilot",
    receiver_name: "",
    receiver_inn_or_pinfl: "",
    receiver_branch: "",
    receiver_account_number: "",
    receiver_card_number: "",
    amount: 0,
    payment_purpose: "",
    payment_purpose_code: "",
    budget_inn: "",
    budget_name: "",
    budget_account_number: "",
    description: "",
    employees: [],
    preset: "monthly",
    rule: defaultRule(),
  };
}

// ── helpers ─────────────────────────────────────────────────────────────────

function moneyFmt(v: number): string {
  return Number(v || 0).toLocaleString("ru-RU");
}

function formatTs(ts: number): string {
  const d = new Date(ts * 1000);
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tashkent",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(d);
  } catch {
    return new Date(ts * 1000).toISOString();
  }
}

function luhnValid(num: string): boolean {
  const s = (num || "").replace(/\D/g, "");
  if (s.length < 13 || s.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = s.length - 1; i >= 0; i--) {
    let d = s.charCodeAt(i) - 48;
    if (shouldDouble) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

// Map preset → engine freq. quarterly = monthly w/ interval=3 (sugar).
const PRESET_TO_FREQ: Record<Preset, RecurrenceRule["freq"]> = {
  once: "once", daily: "daily", weekly: "weekly",
  monthly: "monthly", quarterly: "monthly", yearly: "yearly",
};

// Init form state from an existing schedule row (edit mode).
function rowToState(s: AutopaySchedule): FormState {
  const cat = (s.category || "supplier") as CategoryKey;
  // Receiver type inferred from payment_type + category.
  let rt: ReceiverType = "tashkilot";
  if (cat === "salary_payroll") rt = "xodimlar";
  else if (s.payment_type === "card") rt = "karta";
  else if ((s.receiver_inn_or_pinfl || "").length === 14) rt = "jismoniy";

  // Recurrence
  let rule: RecurrenceRule = defaultRule();
  if (s.recurrence_json) {
    try {
      const parsed = JSON.parse(s.recurrence_json);
      if (parsed && parsed.freq) rule = parsed;
    } catch {
      // fall through to default
    }
  }
  let preset: Preset = (rule.freq === "monthly" && rule.interval === 3) ? "quarterly" : (rule.freq as Preset);
  if (!["once", "daily", "weekly", "monthly", "quarterly", "yearly"].includes(preset)) preset = "monthly";

  // Employees
  const employees: EmployeeRow[] = [];
  if (s.employees_json) {
    try {
      const arr = JSON.parse(s.employees_json);
      if (Array.isArray(arr)) {
        for (const e of arr) {
          if (e && (e.card_number || e.cardNumber)) {
            employees.push({
              card_number: String(e.card_number || e.cardNumber || ""),
              name: String(e.name || e.fullName || ""),
              pinfl: String(e.pinfl || e.pinflOrPassport || ""),
              amount: Number(e.amount || 0),
            });
          } else {
            employees.push({
              employeeCode: String(e.employeeCode || ""),
              fio: String(e.fio || ""),
              inn: String(e.inn || ""),
              amount: Number(e.amount || 0),
            });
          }
        }
      }
    } catch {
      // ignore — leave employees empty
    }
  }

  return {
    name: s.name || "",
    category: cat,
    bank_provider: (s.bank_provider as "kapitalbank" | "ipak_yoli") || "kapitalbank",
    is_active: !!s.is_active,
    sender_account_number: s.sender_account_number || "",
    sender_branch: s.sender_branch || "",
    card_number: s.card_number || "",
    receiver_type: rt,
    receiver_name: s.receiver_name || "",
    receiver_inn_or_pinfl: s.receiver_inn_or_pinfl || "",
    receiver_branch: s.receiver_branch || "",
    receiver_account_number: s.receiver_account_number || "",
    receiver_card_number: s.card_number || "",
    amount: Number(s.amount || 0),
    payment_purpose: s.payment_purpose || "",
    payment_purpose_code: s.payment_purpose_code || "",
    budget_inn: s.budget_inn || "",
    budget_name: s.budget_name || "",
    budget_account_number: s.budget_account_number || "",
    description: s.description || "",
    employees,
    preset,
    rule,
  };
}

// ── ScheduleForm Sheet ──────────────────────────────────────────────────────

const STEPS = [
  { key: "asosiy" },
  { key: "sender" },
  { key: "receiver" },
  { key: "amount" },
  { key: "budget" },
  { key: "schedule" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

export function ScheduleForm({
  open,
  onClose,
  companyId,
  companyName,
  companyInn,
  chat2CompanyId,
  editing,
}: {
  open: boolean;
  /** `saved=true` only when the form successfully created/updated a row.
   *  Cancel / overlay-click pass `false` so the parent can decide whether
   *  to surface a "saved" toast. */
  onClose: (saved?: boolean) => void;
  companyId: number | null;
  companyName?: string;
  companyInn?: string;
  chat2CompanyId?: string;
  editing?: AutopaySchedule | null;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<StepKey>("asosiy");
  const [state, setState] = useState<FormState>(() => editing ? rowToState(editing) : blankState());
  const [formError, setFormError] = useState<string | null>(null);

  // Rehydrate when opening or switching between create/edit.
  useEffect(() => {
    if (!open) return;
    setStep("asosiy");
    setFormError(null);
    setState(editing ? rowToState(editing) : blankState());
  }, [open, editing]);

  const create = useCreateSchedule();
  const update = useUpdateSchedule();
  const saving = create.isPending || update.isPending;

  const isEdit = !!editing;
  const cfg = CATEGORIES[state.category];

  function patch(p: Partial<FormState>) {
    setState((prev) => ({ ...prev, ...p }));
  }
  function patchRule(p: Partial<RecurrenceRule>) {
    setState((prev) => ({ ...prev, rule: { ...prev.rule, ...p } }));
  }

  function validate(): string | null {
    if (!companyId) return t("modules.autopay.form.validation.noCompany");
    if (!state.name.trim()) return t("modules.autopay.form.validation.noName");

    // Recurrence client-side guards.
    const r = state.rule;
    if (r.freq === "once" && !r.targetDate) return t("modules.autopay.form.validation.noTargetDate");
    if (r.freq === "weekly" && (!r.byDay || !r.byDay.length)) return t("modules.autopay.form.validation.noWeekday");

    if (cfg.payment_type === "payroll") {
      if (!state.description.trim()) return t("modules.autopay.form.validation.noDescription");
      const paid = state.employees.filter((e) => (e.amount || 0) > 0);
      if (!paid.length) return t("modules.autopay.form.validation.noEmployee");
      for (const e of paid) {
        if (!e.amount || e.amount <= 0) return t("modules.autopay.form.validation.noEmployeeAmount");
      }
      if (!state.sender_account_number.trim()) return t("modules.autopay.form.validation.noSenderAccount");
      if (state.sender_account_number.startsWith("23106")) {
        return t("modules.autopay.form.validation.senderTransit");
      }
      return null;
    }

    if (cfg.payment_type === "card") {
      const card = state.card_number || state.receiver_card_number;
      if (!card) return t("modules.autopay.form.validation.noCard");
      if (!/^\d{16}$/.test(card)) return t("modules.autopay.form.validation.cardLength");
      if (!luhnValid(card)) return t("modules.autopay.form.validation.cardLuhn");
    }

    if (cfg.payment_type === "account") {
      const recv = state.receiver_account_number;
      if (!recv) return t("modules.autopay.form.validation.noReceiverAccount");
      if (recv.startsWith("2312") || recv.startsWith("23106")) {
        return t("modules.autopay.form.validation.receiverTransit");
      }
      if (state.sender_account_number && state.sender_account_number === recv) {
        return t("modules.autopay.form.validation.sameAccount");
      }
    }

    // (payroll branch returned early above — payment_type is "card" | "account" here)
    if (!state.amount || state.amount <= 0) {
      return t("modules.autopay.form.validation.amountZero");
    }
    if (!state.payment_purpose.trim()) return t("modules.autopay.form.validation.noPurpose");
    return null;
  }

  function buildPayload(): ScheduleWriteBody {
    const ruleNorm: RecurrenceRule = {
      ...state.rule,
      freq: PRESET_TO_FREQ[state.preset] || "monthly",
      interval: state.preset === "quarterly" ? 3 : (state.rule.interval || 1),
    };

    const body: ScheduleWriteBody = {
      company_eskey_id: companyId ?? undefined,
      company_name: companyName,
      company_inn: companyInn,
      company_chat2_id: chat2CompanyId,
      name: state.name.trim(),
      category: state.category,
      payment_type: cfg.payment_type,
      document_type: cfg.document_type,
      bank_provider: state.bank_provider,
      sender_branch: state.sender_branch.trim(),
      sender_account_number: state.sender_account_number.trim(),
      card_number: (state.card_number || state.receiver_card_number).replace(/\s+/g, ""),
      receiver_branch: state.receiver_branch.trim(),
      receiver_account_number: state.receiver_account_number.trim(),
      receiver_name: state.receiver_name.trim(),
      receiver_inn_or_pinfl: state.receiver_inn_or_pinfl.trim(),
      payment_purpose: state.payment_purpose.trim(),
      payment_purpose_code: state.payment_purpose_code.trim(),
      budget_inn: state.budget_inn.trim(),
      budget_name: state.budget_name.trim(),
      budget_account_number: state.budget_account_number.trim(),
      description: state.description.trim(),
      amount: state.amount || 0,
      is_active: state.is_active,
      skip_weekends: !!ruleNorm.skipWeekends,
      timezone: ruleNorm.timezone || "Asia/Tashkent",
      recurrence_json: ruleNorm,
      // Legacy mirrors for old controller paths.
      interval_type: ruleNorm.freq === "weekly" ? "weekly" : ruleNorm.freq === "monthly" ? "monthly" : "monthly",
      day_of_month: ruleNorm.byMonthDay?.[0] ?? 1,
      day_of_week: 1,
    };

    if (cfg.payment_type === "payroll") {
      const paid = state.employees.filter((e) => (e.amount || 0) > 0);
      if (state.bank_provider === "ipak_yoli") {
        body.employees_json = JSON.stringify(paid.map((e) => ({
          card_number: (e.card_number || "").replace(/\s+/g, ""),
          name: (e.name || "").trim(),
          pinfl: (e.pinfl || "").trim(),
          amount: e.amount || 0,
        })));
      } else {
        body.employees_json = JSON.stringify(paid.map((e) => ({
          employeeCode: e.employeeCode,
          amount: e.amount || 0,
        })));
      }
      body.amount = 0;
    }

    return body;
  }

  async function handleSave() {
    setFormError(null);
    const err = validate();
    if (err) {
      setFormError(err);
      return;
    }
    const payload = buildPayload();
    try {
      if (isEdit && editing) {
        await update.mutateAsync({ id: editing.id, body: payload });
      } else {
        await create.mutateAsync(payload);
      }
      onClose(true);
    } catch (e) {
      setFormError(autopayErrDetail(e));
    }
  }

  // Step nav helpers
  const stepIdx = STEPS.findIndex((s) => s.key === step);
  function next() {
    if (stepIdx < STEPS.length - 1) setStep(STEPS[stepIdx + 1].key);
  }
  function prev() {
    if (stepIdx > 0) setStep(STEPS[stepIdx - 1].key);
  }

  // Whether each section is relevant to the chosen category.
  const isPayroll = cfg.payment_type === "payroll";
  const isCard = cfg.payment_type === "card";
  const isBudget = state.category === "tax" || state.category === "budget" || state.category === "kazacheystvo";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose(false)}>
      <SheetContent side="right" className="w-full sm:max-w-3xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CreditCard className="size-5" />
            {isEdit
              ? t("modules.autopay.form.editTitle")
              : t("modules.autopay.form.newTitle")}
          </SheetTitle>
        </SheetHeader>

        <Tabs value={step} onValueChange={(v) => setStep(v as StepKey)} className="mt-4 flex-1 flex flex-col min-h-0">
          <TabsList className="grid grid-cols-6 h-9 w-full">
            {STEPS.map((s) => (
              <TabsTrigger key={s.key} value={s.key} className="text-xs">
                {t(`modules.autopay.form.steps.${s.key}`)}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-3 pr-1">
            <TabsContent value="asosiy">
              <AsosiyStep state={state} patch={patch} />
            </TabsContent>
            <TabsContent value="sender">
              <SenderStep state={state} patch={patch} isCard={isCard} isPayroll={isPayroll} />
            </TabsContent>
            <TabsContent value="receiver">
              <ReceiverStep
                state={state} patch={patch}
                isPayroll={isPayroll} isCard={isCard}
              />
            </TabsContent>
            <TabsContent value="amount">
              <AmountStep state={state} patch={patch} isPayroll={isPayroll} />
            </TabsContent>
            <TabsContent value="budget">
              <BudgetStep state={state} patch={patch} isBudget={isBudget} />
            </TabsContent>
            <TabsContent value="schedule">
              <ScheduleStep state={state} patch={patch} patchRule={patchRule} />
            </TabsContent>
          </div>
        </Tabs>

        {formError && (
          <div className="mt-3 flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0" /> {formError}
          </div>
        )}

        {/* Footer actions */}
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button
            variant="outline"
            onClick={prev}
            disabled={stepIdx === 0 || saving}
            className="gap-1"
          >
            <ChevronLeft className="size-4" /> {t("modules.autopay.form.back")}
          </Button>
          <div className="text-xs text-muted-foreground">
            {t("modules.autopay.form.stepIndicator", {
              current: stepIdx + 1,
              total: STEPS.length,
              label: t(`modules.autopay.form.steps.${STEPS[stepIdx].key}`),
            })}
          </div>
          {stepIdx < STEPS.length - 1 ? (
            <Button onClick={next} disabled={saving} className="gap-1">
              {t("modules.autopay.form.next")} <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {isEdit ? t("modules.autopay.form.save") : t("modules.autopay.form.create")}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Step 1: Asosiy ──────────────────────────────────────────────────────────

function AsosiyStep({
  state, patch,
}: { state: FormState; patch: (p: Partial<FormState>) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Field label={t("modules.autopay.form.templateName")}>
        <Input
          value={state.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder={t("modules.autopay.form.templateNamePlaceholder")}
          maxLength={120}
        />
      </Field>

      <div>
        <SectionTitle>{t("modules.autopay.form.selectPaymentType")}</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
          {(Object.keys(CATEGORIES) as CategoryKey[]).map((key) => {
            const c = CATEGORIES[key];
            const active = state.category === key;
            return (
              <Button
                key={key}
                type="button"
                variant="outline"
                disabled={c.disabled}
                onClick={() => !c.disabled && patch({ category: key })}
                className={cn(
                  "flex h-auto items-start justify-start gap-2 rounded-lg border-2 p-2.5 text-left font-normal",
                  active
                    ? "border-primary bg-primary/5 hover:bg-primary/5"
                    : "hover:bg-accent/30",
                  c.disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                <div className={cn(
                  "size-7 rounded-md border border-border flex items-center justify-center shrink-0",
                  active ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground",
                )}>
                  <Banknote className="size-3.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight flex items-center gap-1">
                    {t(`modules.autopay.categories.${key}.label`)}
                    {c.disabled && (
                      <Badge variant="warning" className="text-[10px] px-1 py-0">
                        {t("modules.autopay.form.soon")}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {t(`modules.autopay.categories.${key}.desc`)}
                  </div>
                </div>
              </Button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("modules.autopay.form.bank")}>
          <Select
            value={state.bank_provider}
            onValueChange={(v) => patch({ bank_provider: v as FormState["bank_provider"] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="kapitalbank">Kapitalbank</SelectItem>
              <SelectItem value="ipak_yoli">Ipak Yo'li</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label={t("modules.autopay.form.activeLabel")}>
          <label className="flex items-center h-9 gap-2 text-sm">
            <Checkbox
              checked={state.is_active}
              onCheckedChange={(v) => patch({ is_active: Boolean(v) })}
              className="size-4 rounded border-2 border-input"
            />
            <span>{t("modules.autopay.form.activeHint")}</span>
          </label>
        </Field>
      </div>
    </div>
  );
}

// ── Step 2: Yuboruvchi ──────────────────────────────────────────────────────

function SenderStep({
  state, patch, isCard, isPayroll,
}: { state: FormState; patch: (p: Partial<FormState>) => void; isCard: boolean; isPayroll: boolean; }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Hint>{t("modules.autopay.form.senderHint")}</Hint>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("modules.autopay.form.bankBranch")}>
          <Input
            value={state.sender_branch}
            onChange={(e) => patch({ sender_branch: e.target.value.replace(/\D/g, "").slice(0, 10) })}
            placeholder="00842"
            maxLength={10}
          />
        </Field>
        <Field label={t("modules.autopay.form.senderAccount")}>
          <Input
            value={state.sender_account_number}
            onChange={(e) => patch({ sender_account_number: e.target.value.replace(/\s+/g, "") })}
            placeholder="20208..."
            maxLength={40}
          />
        </Field>
      </div>
      {isCard && (
        <Field label={t("modules.autopay.form.senderCard")}>
          <Input
            value={state.card_number}
            onChange={(e) => patch({ card_number: e.target.value.replace(/\s+/g, "") })}
            placeholder={t("modules.autopay.form.digits16")}
            maxLength={19}
          />
          {state.card_number && /^\d{16}$/.test(state.card_number) && !luhnValid(state.card_number) && (
            <div className="mt-1 text-xs text-destructive">{t("modules.autopay.form.validation.cardLuhn")}</div>
          )}
        </Field>
      )}
      {isPayroll && (
        <Hint>{t("modules.autopay.form.payrollSenderHint")}</Hint>
      )}
    </div>
  );
}

// ── Step 3: Oluvchi ─────────────────────────────────────────────────────────

function ReceiverStep({
  state, patch, isPayroll, isCard,
}: { state: FormState; patch: (p: Partial<FormState>) => void; isPayroll: boolean; isCard: boolean }) {
  const { t } = useTranslation();
  // For payroll category, the only "receiver" is the employee roster.
  if (isPayroll) {
    return <PayrollRoster state={state} patch={patch} />;
  }

  const types: ReceiverType[] = ["tashkilot", "jismoniy", "karta"];

  return (
    <div className="space-y-4">
      <Field label={t("modules.autopay.form.receiverType")}>
        <div className="flex flex-wrap gap-2">
          {types.map((v) => {
            const active = state.receiver_type === v;
            return (
              <Button
                key={v}
                type="button"
                variant="outline"
                onClick={() => patch({ receiver_type: v })}
                className={cn(
                  "h-auto rounded-full px-3 py-1.5 text-sm font-normal",
                  active ? "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary" : "hover:bg-accent/30",
                )}
              >
                {t(`modules.autopay.form.receiverTypes.${v}`)}
              </Button>
            );
          })}
        </div>
      </Field>

      {state.receiver_type === "tashkilot" && (
        <>
          <Field label={t("modules.autopay.form.receiverName")}>
            <Input
              value={state.receiver_name}
              onChange={(e) => patch({ receiver_name: e.target.value })}
              maxLength={120}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("modules.autopay.form.innRequired")}>
              <Input
                value={state.receiver_inn_or_pinfl}
                onChange={(e) => patch({ receiver_inn_or_pinfl: e.target.value.replace(/\D/g, "").slice(0, 9) })}
                placeholder={t("modules.autopay.form.digitsN", { count: 9 })}
                maxLength={9}
              />
            </Field>
            <Field label={t("modules.autopay.form.bankBranch")}>
              <Input
                value={state.receiver_branch}
                onChange={(e) => patch({ receiver_branch: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                placeholder={t("modules.autopay.form.digitsN", { count: 5 })}
                maxLength={10}
              />
            </Field>
          </div>
          <Field label={t("modules.autopay.form.accountNumber")}>
            <Input
              value={state.receiver_account_number}
              onChange={(e) => patch({ receiver_account_number: e.target.value.replace(/\s+/g, "") })}
              placeholder={t("modules.autopay.form.digitsN", { count: 20 })}
              maxLength={40}
            />
            {(state.receiver_account_number.startsWith("2312") || state.receiver_account_number.startsWith("23106")) && (
              <div className="mt-1 text-xs text-destructive">{t("modules.autopay.form.transitAccount")}</div>
            )}
          </Field>
        </>
      )}

      {state.receiver_type === "jismoniy" && (
        <>
          <Field label={t("modules.autopay.form.receiverFio")}>
            <Input
              value={state.receiver_name}
              onChange={(e) => patch({ receiver_name: e.target.value })}
              maxLength={120}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("modules.autopay.form.pinflRequired")}>
              <Input
                value={state.receiver_inn_or_pinfl}
                onChange={(e) => patch({ receiver_inn_or_pinfl: e.target.value.replace(/\D/g, "").slice(0, 14) })}
                placeholder={t("modules.autopay.form.digitsN", { count: 14 })}
                maxLength={14}
              />
            </Field>
            <Field label={t("modules.autopay.form.bankBranch")}>
              <Input
                value={state.receiver_branch}
                onChange={(e) => patch({ receiver_branch: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                placeholder={t("modules.autopay.form.digitsN", { count: 5 })}
                maxLength={10}
              />
            </Field>
          </div>
          <Field label={t("modules.autopay.form.accountNumber")}>
            <Input
              value={state.receiver_account_number}
              onChange={(e) => patch({ receiver_account_number: e.target.value.replace(/\s+/g, "") })}
              maxLength={40}
            />
          </Field>
        </>
      )}

      {(state.receiver_type === "karta" || isCard) && (
        <>
          <Field label={t("modules.autopay.form.receiverFioOptional")}>
            <Input
              value={state.receiver_name}
              onChange={(e) => patch({ receiver_name: e.target.value })}
              maxLength={120}
            />
          </Field>
          <Field label={t("modules.autopay.form.receiverCard")}>
            <Input
              value={state.receiver_card_number}
              onChange={(e) => patch({ receiver_card_number: e.target.value.replace(/\s+/g, "") })}
              placeholder={t("modules.autopay.form.digits16")}
              maxLength={19}
            />
            {state.receiver_card_number && /^\d{16}$/.test(state.receiver_card_number) && !luhnValid(state.receiver_card_number) && (
              <div className="mt-1 text-xs text-destructive">{t("modules.autopay.form.validation.cardLuhn")}</div>
            )}
          </Field>
        </>
      )}
    </div>
  );
}

// Employee roster for category=salary_payroll. Add/edit/delete rows in place.
// Real-prod fetches the bank-side roster (Kapitalbank) or shows IY-modal — here
// we let the user add either KB-roster rows OR IY-card rows by toggling provider.
function PayrollRoster({
  state, patch,
}: { state: FormState; patch: (p: Partial<FormState>) => void }) {
  const { t } = useTranslation();
  const isIy = state.bank_provider === "ipak_yoli";
  const total = useMemo(
    () => state.employees.reduce((acc, e) => acc + (e.amount || 0), 0),
    [state.employees],
  );

  function addRow() {
    const blank: EmployeeRow = isIy
      ? { card_number: "", name: "", pinfl: "", amount: 0 }
      : { employeeCode: "", fio: "", inn: "", amount: 0 };
    patch({ employees: [...state.employees, blank] });
  }
  function updateRow(idx: number, p: Partial<EmployeeRow>) {
    const next = state.employees.slice();
    next[idx] = { ...next[idx], ...p };
    patch({ employees: next });
  }
  function removeRow(idx: number) {
    const next = state.employees.slice();
    next.splice(idx, 1);
    patch({ employees: next });
  }

  return (
    <div className="space-y-4">
      <Field label={t("modules.autopay.form.payrollDescription")}>
        <Input
          value={state.description}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder={t("modules.autopay.form.payrollDescriptionPlaceholder")}
          maxLength={255}
        />
      </Field>

      <Hint>
        {isIy
          ? t("modules.autopay.form.payrollHintIpak")
          : t("modules.autopay.form.payrollHintKb")}
      </Hint>

      <div className="flex items-center justify-between gap-2">
        <Button variant="outline" size="sm" onClick={addRow} className="gap-1">
          <Plus className="size-3.5" /> {t("modules.autopay.form.addEmployee")}
        </Button>
        <div className="text-sm text-muted-foreground">
          {t("modules.autopay.form.totalLabel")}: <span className="font-medium text-foreground">{t("modules.autopay.amountSum", { amount: moneyFmt(total) })}</span> · {t("modules.autopay.form.employeeCount", { count: state.employees.length })}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {isIy ? (
                <>
                  <TableHead className="w-[30%]">{t("modules.autopay.form.fio")}</TableHead>
                  <TableHead className="w-[20%]">{t("modules.autopay.form.cardCol")}</TableHead>
                  <TableHead className="w-[20%]">{t("modules.autopay.form.pinflCol")}</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="w-[25%]">{t("modules.autopay.form.codeCol")}</TableHead>
                  <TableHead className="w-[30%]">{t("modules.autopay.form.fio")}</TableHead>
                  <TableHead className="w-[15%]">{t("modules.autopay.form.innCol")}</TableHead>
                </>
              )}
              <TableHead className="w-[20%]">{t("modules.autopay.form.amountCol")}</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {state.employees.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Users className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {t("modules.autopay.form.noEmployees")}
                    </div>
                    <Button variant="outline" size="sm" onClick={addRow} className="gap-1">
                      <Plus className="size-3.5" /> {t("modules.autopay.form.addEmployee")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              state.employees.map((e, idx) => (
                <TableRow key={idx} className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300" style={{ animationDelay: `${Math.min(idx, 12) * 25}ms` }}>
                  {isIy ? (
                    <>
                      <TableCell>
                        <Input value={e.name || ""} onChange={(ev) => updateRow(idx, { name: ev.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input value={e.card_number || ""} onChange={(ev) => updateRow(idx, { card_number: ev.target.value.replace(/\s+/g, "") })} placeholder={t("modules.autopay.form.digits16")} maxLength={19} />
                      </TableCell>
                      <TableCell>
                        <Input value={e.pinfl || ""} onChange={(ev) => updateRow(idx, { pinfl: ev.target.value.replace(/\D/g, "").slice(0, 14) })} placeholder={t("modules.autopay.form.digitsN", { count: 14 })} maxLength={14} />
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>
                        <Input value={e.employeeCode || ""} onChange={(ev) => updateRow(idx, { employeeCode: ev.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input value={e.fio || ""} onChange={(ev) => updateRow(idx, { fio: ev.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Input value={e.inn || ""} onChange={(ev) => updateRow(idx, { inn: ev.target.value.replace(/\D/g, "") })} maxLength={14} />
                      </TableCell>
                    </>
                  )}
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={e.amount || ""}
                      onChange={(ev) => updateRow(idx, { amount: parseInt(ev.target.value, 10) || 0 })}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline" size="icon" className="h-8 w-8 text-destructive"
                      onClick={() => removeRow(idx)} title={t("modules.autopay.actions.delete")}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
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

// ── Step 4: Summa va maqsad ─────────────────────────────────────────────────

function AmountStep({
  state, patch, isPayroll,
}: { state: FormState; patch: (p: Partial<FormState>) => void; isPayroll: boolean }) {
  const { t } = useTranslation();
  if (isPayroll) {
    return <Hint>{t("modules.autopay.form.amountHintPayroll")}</Hint>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("modules.autopay.form.amountUzs")}>
          <Input
            type="number"
            min={1}
            value={state.amount || ""}
            onChange={(e) => patch({ amount: parseInt(e.target.value, 10) || 0 })}
            placeholder="1000"
          />
          {state.amount > 0 && (
            <div className="mt-1 text-xs text-muted-foreground">{t("modules.autopay.amountSum", { amount: moneyFmt(state.amount) })}</div>
          )}
        </Field>
        <Field label={t("modules.autopay.form.purposeCode")}>
          <Input
            value={state.payment_purpose_code}
            onChange={(e) => patch({ payment_purpose_code: e.target.value.replace(/\D/g, "").slice(0, 5) })}
            placeholder={t("modules.autopay.form.purposeCodePlaceholder")}
            maxLength={5}
          />
          <div className="mt-1 text-xs text-muted-foreground">
            {t("modules.autopay.form.purposeCodeHint")}
          </div>
        </Field>
      </div>
      <Field label={t("modules.autopay.form.paymentPurposeLabel", { length: state.payment_purpose.length, max: 210 })}>
        <Textarea
          value={state.payment_purpose}
          onChange={(e) => patch({ payment_purpose: e.target.value })}
          maxLength={state.bank_provider === "ipak_yoli" ? 495 : 210}
          rows={4}
          placeholder={t("modules.autopay.form.paymentPurposePlaceholder")}
          className="w-full rounded-lg border-2 border-input bg-background px-3 py-2 text-[15px] focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </Field>
    </div>
  );
}

// ── Step 5: Byudjet ─────────────────────────────────────────────────────────

function BudgetStep({
  state, patch, isBudget,
}: { state: FormState; patch: (p: Partial<FormState>) => void; isBudget: boolean }) {
  const { t } = useTranslation();
  if (!isBudget) {
    return <Hint>{t("modules.autopay.form.budgetHintSkip")}</Hint>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("modules.autopay.form.budgetInn")}>
          <Input
            value={state.budget_inn}
            onChange={(e) => patch({ budget_inn: e.target.value.replace(/\D/g, "").slice(0, 14) })}
            placeholder={t("modules.autopay.form.budgetInnPlaceholder")}
          />
        </Field>
        <Field label={t("modules.autopay.form.budgetName")}>
          <Input
            value={state.budget_name}
            onChange={(e) => patch({ budget_name: e.target.value })}
            maxLength={255}
          />
        </Field>
      </div>
      <Field label={t("modules.autopay.form.budgetAccount")}>
        <Input
          value={state.budget_account_number}
          onChange={(e) => patch({ budget_account_number: e.target.value.replace(/\s+/g, "") })}
          maxLength={40}
        />
        <div className="mt-1 text-xs text-muted-foreground">
          {t("modules.autopay.form.budgetAccountHint")}
        </div>
      </Field>
    </div>
  );
}

// ── Step 6: Takrorlash ──────────────────────────────────────────────────────

function ScheduleStep({
  state, patch, patchRule,
}: {
  state: FormState;
  patch: (p: Partial<FormState>) => void;
  patchRule: (p: Partial<RecurrenceRule>) => void;
}) {
  const { t } = useTranslation();
  const preview = useRecurrencePreview();
  const [previewSlots, setPreviewSlots] = useState<number[]>([]);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Auto-refresh preview when anything in the rule changes (debounced).
  useEffect(() => {
    const ruleNorm: RecurrenceRule = {
      ...state.rule,
      freq: PRESET_TO_FREQ[state.preset] || "monthly",
      interval: state.preset === "quarterly" ? 3 : (state.rule.interval || 1),
    };
    setPreviewError(null);
    const timer = setTimeout(() => {
      preview.mutate(
        { recurrence_json: ruleNorm, limit: 5 },
        {
          onSuccess: (d) => {
            setPreviewSlots(d.occurrences || []);
            if ((d.occurrences || []).length === 0) {
              setPreviewError(t("modules.autopay.form.scheduleEnded"));
            }
          },
          onError: (e) => {
            setPreviewSlots([]);
            setPreviewError(autopayErrDetail(e));
          },
        },
      );
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.preset, JSON.stringify(state.rule)]);

  const presetKeys: Preset[] = ["once", "daily", "weekly", "monthly", "quarterly", "yearly"];

  return (
    <div className="space-y-4">
      <Field label={t("modules.autopay.form.recurrenceLabel")}>
        <div className="flex flex-wrap gap-2">
          {presetKeys.map((v) => {
            const active = state.preset === v;
            return (
              <Button
                key={v}
                type="button"
                variant="outline"
                onClick={() => patch({ preset: v })}
                className={cn(
                  "h-auto rounded-full px-3 py-1.5 text-sm font-normal",
                  active ? "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary" : "hover:bg-accent/30",
                )}
              >
                {t(`modules.autopay.form.presets.${v}`)}
              </Button>
            );
          })}
        </div>
      </Field>

      {/* Preset-specific panel */}
      {state.preset === "once" && (
        <Field label={t("modules.autopay.form.targetDate")}>
          <DatePicker
            value={state.rule.targetDate || ""}
            onChange={(v) => patchRule({ targetDate: v || null })}
          />
        </Field>
      )}

      {state.preset === "daily" && (
        <Field label={t("modules.autopay.form.intervalDays")}>
          <Input
            type="number"
            min={1}
            max={365}
            value={state.rule.interval || 1}
            onChange={(e) => patchRule({ interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
            className="max-w-[160px]"
          />
        </Field>
      )}

      {state.preset === "weekly" && (
        <>
          <Field label={t("modules.autopay.form.intervalWeeks")}>
            <Input
              type="number"
              min={1}
              max={52}
              value={state.rule.interval || 1}
              onChange={(e) => patchRule({ interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              className="max-w-[160px]"
            />
          </Field>
          <Field label={t("modules.autopay.form.weekdays")}>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_CODES.map((code) => {
                const active = (state.rule.byDay || []).includes(code);
                return (
                  <Button
                    key={code}
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const cur = state.rule.byDay || [];
                      patchRule({
                        byDay: active ? cur.filter((c) => c !== code) : [...cur, code],
                      });
                    }}
                    className={cn(
                      "h-auto rounded-full px-3 py-1.5 text-sm font-normal",
                      active ? "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary" : "hover:bg-accent/30",
                    )}
                  >
                    {t(`modules.autopay.form.weekdayPills.${code}`)}
                  </Button>
                );
              })}
            </div>
          </Field>
        </>
      )}

      {(state.preset === "monthly" || state.preset === "quarterly") && (
        <>
          {state.preset === "monthly" && (
            <Field label={t("modules.autopay.form.intervalMonths")}>
              <Input
                type="number"
                min={1}
                max={12}
                value={state.rule.interval || 1}
                onChange={(e) => patchRule({ interval: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                className="max-w-[160px]"
              />
            </Field>
          )}
          <Field label={t("modules.autopay.form.whichDay")}>
            <Select
              value={String((state.rule.byMonthDay || [1])[0])}
              onValueChange={(v) => patchRule({ byMonthDay: [parseInt(v, 10)], bySetPos: null })}
            >
              <SelectTrigger className="max-w-[220px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 31 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                ))}
                <SelectItem value="-1">{t("modules.autopay.form.lastDay")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      )}

      {state.preset === "yearly" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("modules.autopay.form.monthLabel")}>
            <Select
              value={String((state.rule.byMonth || [1])[0])}
              onValueChange={(v) => patchRule({ byMonth: [parseInt(v, 10)] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => (
                  <SelectItem key={i} value={String(i + 1)}>
                    {t(`modules.autopay.form.months.${i + 1}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t("modules.autopay.form.dayLabel")}>
            <Select
              value={String((state.rule.byMonthDay || [1])[0])}
              onValueChange={(v) => patchRule({ byMonthDay: [parseInt(v, 10)] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 31 }, (_, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      )}

      <hr className="border-border" />

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("modules.autopay.form.sendTime")}>
          <div className="flex items-center gap-2">
            <Input
              type="number" min={0} max={23} value={state.rule.hour ?? 9}
              onChange={(e) => patchRule({ hour: Math.max(0, Math.min(23, parseInt(e.target.value, 10) || 0)) })}
              className="max-w-[80px]"
            />
            <span className="text-muted-foreground">:</span>
            <Input
              type="number" min={0} max={59} value={state.rule.minute ?? 0}
              onChange={(e) => patchRule({ minute: Math.max(0, Math.min(59, parseInt(e.target.value, 10) || 0)) })}
              className="max-w-[80px]"
            />
          </div>
        </Field>
        <Field label={t("modules.autopay.form.startDate")}>
          <DatePicker
            value={state.rule.startDate || ""}
            onChange={(v) => patchRule({ startDate: v || null })}
          />
        </Field>
      </div>

      {state.preset !== "once" && (
        <Field label={t("modules.autopay.form.endLabel")}>
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {(["never", "until", "count"] as const).map((mv) => {
                const active = (state.rule.endMode || "never") === mv;
                return (
                  <Button
                    key={mv}
                    type="button"
                    variant="outline"
                    onClick={() => patchRule({ endMode: mv })}
                    className={cn(
                      "h-auto rounded-full px-3 py-1.5 text-sm font-normal",
                      active ? "border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary" : "hover:bg-accent/30",
                    )}
                  >
                    {t(`modules.autopay.form.endModes.${mv}`)}
                  </Button>
                );
              })}
            </div>
            <div className="flex gap-3">
              <DatePicker
                value={state.rule.until || ""}
                onChange={(v) => patchRule({ until: v || null })}
                disabled={state.rule.endMode !== "until"}
                className="max-w-[220px]"
              />
              <Input
                type="number"
                min={1} max={120}
                value={state.rule.count || ""}
                onChange={(e) => patchRule({ count: parseInt(e.target.value, 10) || null })}
                disabled={state.rule.endMode !== "count"}
                placeholder="N"
                className="max-w-[140px]"
              />
            </div>
          </div>
        </Field>
      )}

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={!!state.rule.skipWeekends}
          onCheckedChange={(v) => patchRule({ skipWeekends: Boolean(v) })}
          className="size-4 rounded border-2 border-input"
        />
        {t("modules.autopay.form.skipWeekends")}
      </label>

      {/* Preview */}
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="text-xs uppercase font-semibold tracking-wide text-muted-foreground mb-2">
          {t("modules.autopay.form.previewTitle")}
        </div>
        {preview.isPending ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> {t("modules.autopay.form.calculating")}
          </div>
        ) : previewError ? (
          <div className="text-sm text-destructive animate-in fade-in-0 duration-300">{previewError}</div>
        ) : previewSlots.length === 0 ? (
          <div className="text-sm text-muted-foreground animate-in fade-in-0 duration-300">{t("modules.autopay.form.previewEmpty")}</div>
        ) : (
          <ul className="space-y-1 font-mono text-sm animate-in fade-in-0 duration-300">
            {previewSlots.map((ts, i) => (
              <li key={i}>{formatTs(ts)}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── tiny shared widgets ─────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold tracking-wide text-muted-foreground uppercase mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-semibold tracking-wide text-muted-foreground uppercase mb-1.5">
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {children}
    </div>
  );
}
