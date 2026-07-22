import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Loader2, Save, X,
  User, Briefcase, Wallet, FileText,
} from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useCreateEmployee, useDepartments, useSchedules,
} from "./api";
import {
  EMPLOYMENT_TYPES, GENDER_OPTIONS, CURRENCY_OPTIONS, RATE_OPTIONS,
  type EmployeeIn,
} from "./types";

// 4-step wizard mirrors cloud aiba_employees hire modal:
//   1) Personal info + employment basics  (templates/employees.php step 1)
//   2) Position                            (templates/employees.php step 2)
//   3) Salary                              (templates/employees.php step 3)
//   4) Order & contract                    (templates/employees.php step 4)
// poc backend is read-through → POST returns 409 with NextCloud o'qish rejimi
// message; we surface that as an inline hint, not a hard error.

type StepKey = "personal" | "position" | "salary" | "order";
type StepDef = { key: StepKey; label: string; icon: React.ComponentType<{ className?: string }>; sub: string };

const STEP_ICONS: Record<StepKey, React.ComponentType<{ className?: string }>> = {
  personal: User, position: Briefcase, salary: Wallet, order: FileText,
};
const STEP_KEYS: StepKey[] = ["personal", "position", "salary", "order"];

export function EmployeeHirePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;

  const STEPS: StepDef[] = STEP_KEYS.map((k) => ({
    key: k,
    icon: STEP_ICONS[k],
    label: t(`modules.employees.hire.steps.${k}.label`),
    sub: t(`modules.employees.hire.steps.${k}.sub`),
  }));

  const [step, setStep] = useState<number>(0);
  const [form, setForm] = useState<EmployeeIn>(() => ({
    employment_type: "staff",
    ndfl_rate: "12",
    oklad_currency: "UZS",
    rate: "1",
    hire_date: new Date().toISOString().slice(0, 10),
    vacation_days_per_year: 21,
    children_count: 0,
  }));
  const [err, setErr] = useState<string | null>(null);

  const create = useCreateEmployee();
  const { data: departments = [] } = useDepartments(companyId);
  const { data: schedules = [] } = useSchedules(companyId);

  const set = <K extends keyof EmployeeIn>(k: K, v: EmployeeIn[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (err) setErr(null);
  };

  if (!companyId) {
    return (
      <div className="p-6">
        <Button
          variant="link"
          onClick={() => navigate("/employees")}
          className="h-auto p-0 gap-1.5 text-sm text-muted-foreground no-underline hover:text-foreground hover:no-underline"
        >
          <ArrowLeft className="size-4" /> {t("modules.employees.title")}
        </Button>
        <div className="mt-4 rounded-lg border bg-card p-8 text-center text-muted-foreground">
          {t("modules.employees.empty.noCompany")}
        </div>
      </div>
    );
  }

  const et = form.employment_type ?? "staff";
  const isLastStep = step === STEPS.length - 1;
  const pending = create.isPending;

  // Step-1 client validation: first name + last name + hire date are required
  // (same fields the cloud wizard marks with *).
  const validateStep = (s: number): string | null => {
    if (s === 0) {
      if (!form.hire_date) return t("modules.employees.errors.enterHireDate");
      if (!form.last_name?.trim()) return t("modules.employees.errors.enterLastName");
      if (!form.first_name?.trim()) return t("modules.employees.errors.enterFirstName");
    }
    return null;
  };

  const onNext = () => {
    const v = validateStep(step);
    if (v) { setErr(v); return; }
    setErr(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const onBack = () => {
    setErr(null);
    setStep((s) => Math.max(0, s - 1));
  };

  const onSubmit = () => {
    for (let i = 0; i <= step; i++) {
      const v = validateStep(i);
      if (v) { setStep(i); setErr(v); return; }
    }
    setErr(null);
    create.mutate(
      { companyId, body: form },
      {
        onSuccess: () => navigate("/employees"),
        onError: (e) => setErr(String((e as Error)?.message ?? e)),
      },
    );
  };

  const onCancel = () => navigate("/employees");

  return (
    <div className="flex flex-col min-h-screen">
      {/* Sticky header: back link + title (mirrors cloud full-page docs-page__header) */}
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="px-5 py-3 flex items-center gap-3">
          <Button
            variant="link"
            onClick={() => navigate("/employees")}
            className="h-auto p-0 gap-1.5 text-sm text-muted-foreground no-underline hover:text-foreground hover:no-underline"
          >
            <ArrowLeft className="size-4" /> {t("modules.employees.title")}
          </Button>
          <div className="h-5 w-px bg-border" />
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold leading-tight truncate">{t("modules.employees.hire.title")}</h1>
            <div className="text-xs text-muted-foreground truncate">
              {company?.name ?? "—"} · {t("modules.employees.hire.stepCounter", { current: step + 1, total: STEPS.length })}
            </div>
          </div>
          <Badge variant="muted" className="hidden sm:inline-flex">{STEPS[step].label}</Badge>
        </div>

        {/* Stepper — clickable tabs (Tabs as stepper, cloud aiba-wizard__steps) */}
        <Stepper step={step} setStep={setStep} steps={STEPS} />
      </header>

      {/* Body */}
      <main className="flex-1 px-5 py-6 max-w-5xl w-full mx-auto space-y-4">
        {step === 0 && <PersonalStep form={form} set={set} et={et} />}
        {step === 1 && <PositionStep form={form} set={set} departments={departments} />}
        {step === 2 && <SalaryStep form={form} set={set} schedules={schedules} />}
        {step === 3 && <OrderStep form={form} set={set} />}

        {/* NC read-mode hint or validation error */}
        {err && (
          <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            {err}
          </div>
        )}
      </main>

      {/* Sticky footer — Bekor / Oldingi / Keyingi / Saqlash */}
      <footer className="sticky bottom-0 border-t bg-card/95 backdrop-blur">
        <div className="px-5 py-3 max-w-5xl mx-auto flex items-center gap-2 justify-between">
          <Button variant="ghost" onClick={onCancel}>
            <X className="size-4 mr-1.5" /> {t("modules.employees.actions.cancel")}
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onBack} disabled={step === 0}>
              <ChevronLeft className="size-4 mr-1.5" /> {t("modules.employees.actions.previous")}
            </Button>
            {!isLastStep ? (
              <Button onClick={onNext}>
                {t("modules.employees.actions.next")} <ChevronRight className="size-4 ml-1.5" />
              </Button>
            ) : (
              <Button onClick={onSubmit} disabled={pending}>
                {pending
                  ? <Loader2 className="size-4 mr-1.5 animate-spin" />
                  : <Save className="size-4 mr-1.5" />}
                {t("modules.employees.actions.save")}
              </Button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

// ── Stepper ────────────────────────────────────────────────────────────────
function Stepper({ step, setStep, steps }: { step: number; setStep: (n: number) => void; steps: StepDef[] }) {
  return (
    <div className="px-5 pb-3 overflow-x-auto">
      <div className="flex items-stretch gap-1.5 min-w-max">
        {steps.map((s, i) => {
          const active = i === step;
          const done = i < step;
          const Icon = s.icon;
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(i)}
                className={`h-auto justify-start gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-foreground hover:bg-primary/10"
                    : done
                    ? "border-border bg-card text-foreground hover:bg-muted/40"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                <span
                  className={`size-6 rounded-full grid place-items-center text-xs font-semibold ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : done
                      ? "bg-success/20 text-success"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <Icon className="size-3.5" /> : i + 1}
                </span>
                <span className="text-left leading-tight">
                  <span className="block text-sm font-medium">{s.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{s.sub}</span>
                </span>
              </Button>
              {i < steps.length - 1 && (
                <ChevronRight className="size-4 text-muted-foreground shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step panes ─────────────────────────────────────────────────────────────
function PersonalStep({
  form, set, et,
}: {
  form: EmployeeIn;
  set: <K extends keyof EmployeeIn>(k: K, v: EmployeeIn[K]) => void;
  et: string;
}) {
  const { t } = useTranslation();
  return (
    <FormCard title={t("modules.employees.hire.employmentTitle")} sub={t("modules.employees.hire.employmentSub")}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <F label={t("modules.employees.fields.hireDateRequired")}>
          <DatePicker value={form.hire_date ?? ""} onChange={(v) => set("hire_date", v)} />
        </F>
        <F label={t("modules.employees.fields.employmentTypeRequired")}>
          <Select value={et} onValueChange={(v) => set("employment_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {EMPLOYMENT_TYPES.map((opt) => <SelectItem key={opt.value} value={opt.value}>{t(opt.labelKey)}</SelectItem>)}
            </SelectContent>
          </Select>
        </F>
        {et === "contract_hourly" && (
          <F label={t("modules.employees.fields.hourlyRate")}>
            <Input type="number" min={0} step="100" placeholder="0"
              value={form.hourly_rate ?? ""}
              onChange={(e) => set("hourly_rate", e.target.value)} />
          </F>
        )}
        {et === "contract_fixed" && (
          <F label={t("modules.employees.fields.contractAmount")}>
            <Input type="number" min={0} step="1000" placeholder="0"
              value={form.contract_amount ?? ""}
              onChange={(e) => set("contract_amount", e.target.value)} />
          </F>
        )}
      </div>

      <SectionTitle>{t("modules.employees.sections.personal")}</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <F label={t("modules.employees.fields.lastNameRequired")}>
          <Input value={form.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} />
        </F>
        <F label={t("modules.employees.fields.firstNameRequired")}>
          <Input value={form.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} />
        </F>
        <F label={t("modules.employees.fields.middleName")}>
          <Input value={form.middle_name ?? ""} onChange={(e) => set("middle_name", e.target.value)} />
        </F>
        <F label={t("modules.employees.fields.birthDate")}>
          <DatePicker value={form.birth_date ?? ""} onChange={(v) => set("birth_date", v)} />
        </F>
        <F label={t("modules.employees.fields.gender")}>
          <Select value={form.gender || "none"} onValueChange={(v) => set("gender", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("modules.employees.placeholders.unselected")}</SelectItem>
              {GENDER_OPTIONS.filter((g) => g.value).map((g) => (
                <SelectItem key={g.value} value={g.value}>{g.labelKey ? t(g.labelKey) : g.value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
        <F label={t("modules.employees.fields.pinflJshshir")}>
          <Input maxLength={14} value={form.pinfl ?? ""} onChange={(e) => set("pinfl", e.target.value)} />
        </F>
        <F label="INN">
          <Input maxLength={20} value={form.inn ?? ""} onChange={(e) => set("inn", e.target.value)} />
        </F>
        <F label={t("modules.employees.columns.phone")}>
          <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+998…" />
        </F>
        <F label="Email">
          <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </F>
        <F label={t("modules.employees.fields.passportSeries")}>
          <Input maxLength={2} className="uppercase" placeholder="AD"
            value={form.passport_series ?? ""}
            onChange={(e) => set("passport_series", e.target.value.toUpperCase())} />
        </F>
        <F label={t("modules.employees.fields.passportNumber")}>
          <Input maxLength={16} placeholder="1234567"
            value={form.passport_number ?? ""}
            onChange={(e) => set("passport_number", e.target.value)} />
        </F>
        <F label={t("modules.employees.fields.mehnatPosition")} hint={t("modules.employees.hire.mehnatPositionHint")}>
          <Input placeholder={t("modules.employees.placeholders.positionExample")}
            value={form.mehnat_position_name_uz ?? ""}
            onChange={(e) => set("mehnat_position_name_uz", e.target.value)} />
        </F>
      </div>
    </FormCard>
  );
}

function PositionStep({
  form, set, departments,
}: {
  form: EmployeeIn;
  set: <K extends keyof EmployeeIn>(k: K, v: EmployeeIn[K]) => void;
  departments: { id: number; name: string }[];
}) {
  const { t } = useTranslation();
  return (
    <FormCard title={t("modules.employees.hire.positionTitle")} sub={t("modules.employees.hire.positionSub")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <F label={t("modules.employees.columns.department")}>
          <Select value={form.department || "none"} onValueChange={(v) => set("department", v === "none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder={t("modules.employees.placeholders.unselected")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("modules.employees.placeholders.unselected")}</SelectItem>
              {departments.map((d) => <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>)}
              {form.department && !departments.some((d) => d.name === form.department) && (
                <SelectItem value={form.department}>{form.department}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </F>
        <F label={t("modules.employees.columns.position")}>
          <Input value={form.position ?? ""} onChange={(e) => set("position", e.target.value)} placeholder={t("modules.employees.placeholders.positionExample")} />
        </F>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("modules.employees.hire.positionOnecHint")}
      </p>
    </FormCard>
  );
}

function SalaryStep({
  form, set, schedules,
}: {
  form: EmployeeIn;
  set: <K extends keyof EmployeeIn>(k: K, v: EmployeeIn[K]) => void;
  schedules: { id: number; name: string; work_start: string; work_end: string }[];
}) {
  const { t } = useTranslation();
  return (
    <FormCard title={t("modules.employees.modes.payroll")} sub={t("modules.employees.hire.salarySub")}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <F label={t("modules.employees.schedules.workSchedule")}>
          <Select
            value={form.schedule_id != null ? String(form.schedule_id) : "default"}
            onValueChange={(v) =>
              setSchedule(set, v === "default" ? null : Number(v))
            }
          >
            <SelectTrigger><SelectValue placeholder={t("modules.employees.placeholders.byCompany")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t("modules.employees.placeholders.byCompany")}</SelectItem>
              {schedules.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.work_start}–{s.work_end})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </F>
        <F label={t("modules.employees.schedules.rate")}>
          <Select value={form.rate ?? "1"} onValueChange={(v) => set("rate", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RATE_OPTIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </F>
        <F label={t("modules.employees.fields.ndflPercent")}>
          <Input type="number" value={form.ndfl_rate ?? ""} onChange={(e) => set("ndfl_rate", e.target.value)} />
        </F>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <F label={t("modules.employees.fields.oklad")}>
          <Input type="number" step="0.01" min={0}
            value={form.oklad ?? ""}
            onChange={(e) => set("oklad", e.target.value)} />
        </F>
        <F label={t("modules.employees.fields.currency")}>
          <Select value={form.oklad_currency ?? "UZS"} onValueChange={(v) => set("oklad_currency", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCY_OPTIONS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </F>
        <F label={t("modules.employees.fields.calcType")}>
          <Input value={form.calc_type ?? ""} onChange={(e) => set("calc_type", e.target.value)} placeholder="Оклад по дням" />
        </F>
      </div>
    </FormCard>
  );
}

function OrderStep({
  form, set,
}: {
  form: EmployeeIn;
  set: <K extends keyof EmployeeIn>(k: K, v: EmployeeIn[K]) => void;
}) {
  const { t } = useTranslation();
  return (
    <FormCard title={t("modules.employees.hire.orderTitle")} sub={t("modules.employees.hire.orderSub")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <F label={t("modules.employees.fields.orderNumber")}>
          <Input value={form.order_number ?? ""} onChange={(e) => set("order_number", e.target.value)} />
        </F>
        <F label={t("modules.employees.fields.orderDate")}>
          <DatePicker value={form.order_date ?? ""} onChange={(v) => set("order_date", v)} />
        </F>
        <F label={t("modules.employees.fields.contractNumber")}>
          <Input value={form.contract_number ?? ""} onChange={(e) => set("contract_number", e.target.value)} />
        </F>
        <F label={t("modules.employees.fields.contractDate")}>
          <DatePicker value={form.contract_date ?? ""} onChange={(v) => set("contract_date", v)} />
        </F>
      </div>
    </FormCard>
  );
}

// ── small primitives ───────────────────────────────────────────────────────
function FormCard({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="px-5 py-3 border-b">
        <div className="text-sm font-semibold">{title}</div>
        {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </section>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">{children}</div>;
}

function F({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground/80">{hint}</span>}
    </label>
  );
}

// schedule_id is the only non-string field on EmployeeIn that we touch in this
// page; helper keeps the Select onValueChange clean and type-correct.
function setSchedule(
  set: <K extends keyof EmployeeIn>(k: K, v: EmployeeIn[K]) => void,
  v: number | null,
) {
  set("schedule_id", v);
}
