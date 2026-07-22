import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUrlState } from "@/shared/hooks/use-url-state";
import {
  ArrowLeft, User, CreditCard, Wallet, History, CalendarDays, Cpu,
  ChevronLeft, ChevronRight, Cake, BadgeCheck, Pencil, Camera, Upload,
  Circle, RefreshCw, Send, FileUp, MoreVertical,
} from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useEmployee, useEmployeeEvents, useEmpAction, useUpdateEmployee } from "./api";
import {
  CONTRACT_TYPE_LABELS, EMPLOYMENT_TYPE_LABELS, EVENT_TYPE_META,
  EMP_STATUS, type Employee, type EmployeeEvent,
} from "./types";
import { useAttendanceDetail, useTerminalUsers } from "@/modules/attendance/api";
import { ATT_STYLE, WEEKDAYS } from "@/modules/attendance/types";

// HR document checklist catalogue — mirrors the cloud DocTypesRegistry::defaults().
const HR_DOC_SLUGS = [
  "contract", "passport", "order", "application", "diploma",
  "offer", "inps", "military", "residence", "form_086",
] as const;

const money = (v?: string | number | null) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");
const useGenderMap = (): Record<string, string> => {
  const { t } = useTranslation();
  return {
    male: t("modules.employees.gender.male"),
    female: t("modules.employees.gender.female"),
    m: t("modules.employees.gender.male"),
    f: t("modules.employees.gender.female"),
  };
};

function age(birth?: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth); if (isNaN(+b)) return null;
  const t = new Date(); let a = t.getFullYear() - b.getFullYear();
  if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) a--;
  return a;
}
function daysToBirthday(birth?: string | null): number | null {
  if (!birth) return null;
  const b = new Date(birth); if (isNaN(+b)) return null;
  const t = new Date(); const y = t.getFullYear();
  let next = new Date(y, b.getMonth(), b.getDate());
  if (next < new Date(t.getFullYear(), t.getMonth(), t.getDate())) next = new Date(y + 1, b.getMonth(), b.getDate());
  return Math.round((+next - +new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
}

const TAB_DEFS = [
  { key: "general", icon: User },
  { key: "passport", icon: CreditCard },
  { key: "payroll", icon: Wallet },
  { key: "events", icon: History },
  { key: "attendance", icon: CalendarDays },
  { key: "terminal", icon: Cpu },
] as const;
type TabKey = (typeof TAB_DEFS)[number]["key"];

export function EmployeeDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const empId = Number(id);
  const companyId = useCompany((s) => s.current)?.id ?? null;
  const navigate = useNavigate();
  const { data: emp, isLoading } = useEmployee(companyId, empId);
  const [tabRaw, setTabRaw] = useUrlState("tab", "general");
  const tab = tabRaw as TabKey;
  const TABS = TAB_DEFS.map((tb) => ({ ...tb, label: t(`modules.employees.detailTabs.${tb.key}`) }));

  if (!companyId)
    return <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">{t("modules.employees.empty.noCompanyShort")}</div>;
  if (isLoading) return <div className="space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-64 w-full" /></div>;
  if (!emp) return <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground animate-in fade-in-0 duration-300">{t("modules.employees.empty.employeeNotFound")}</div>;

  return (
    <div className="space-y-4 animate-in fade-in-0 duration-300">
      <Button variant="link" onClick={() => navigate("/employees")}
        className="h-auto p-0 self-start gap-1.5 text-sm text-muted-foreground no-underline hover:text-foreground hover:no-underline">
        <ArrowLeft className="size-4" /> {t("modules.employees.title")}
      </Button>

      <Hero emp={emp} companyId={companyId} />

      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {TABS.map((t) => (
          <Button key={t.key} variant="ghost" onClick={() => setTabRaw(t.key)}
            className={`h-auto rounded-none gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap hover:bg-transparent ${tab === t.key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <t.icon className="size-4" /> {t.label}
          </Button>
        ))}
      </div>

      {tab === "general" && <GeneralTab emp={emp} companyId={companyId} />}
      {tab === "passport" && <PassportTab emp={emp} companyId={companyId} />}
      {tab === "payroll" && <PayrollTab emp={emp} companyId={companyId} />}
      {tab === "events" && <EventsTab companyId={companyId} empId={empId} />}
      {tab === "attendance" && <AttendanceTab companyId={companyId} empId={empId} />}
      {tab === "terminal" && <TerminalTab companyId={companyId} empId={empId} />}
    </div>
  );
}

function Hero({ emp, companyId }: { emp: Employee; companyId: number }) {
  const { t } = useTranslation();
  const st = EMP_STATUS[emp.status] ?? { labelKey: "", variant: "muted" as const };
  const initials = ((emp.last_name?.[0] ?? "") + (emp.first_name?.[0] ?? "")).toUpperCase() || "—";
  const a = age(emp.birth_date);
  const d2b = daysToBirthday(emp.birth_date);
  const action = useEmpAction();
  const sync = (path: string, label: string) =>
    action.mutate({ companyId, path, body: { employee_ids: [emp.id] } }, {
      onSuccess: () => alert(`${label}: ${t("modules.employees.alerts.done")}`),
      onError: (e) => alert(String((e as Error)?.message ?? e)),
    });
  return (
    <div className="rounded-xl border bg-card p-5 flex items-start gap-4 flex-wrap">
      {/* Photo with edit menu (upload is a cloud-Files feature → stubbed) */}
      <div className="relative shrink-0">
        <div className="size-16 rounded-full bg-primary/10 text-primary grid place-items-center text-xl font-semibold overflow-hidden">{initials}</div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="absolute -bottom-1 -right-1 size-6 rounded-full bg-background border shadow-sm hover:bg-accent" title={t("modules.employees.photo.changeTitle")}>
              <Camera className="size-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-1">
            <Button variant="ghost" className="w-full justify-start gap-2 rounded px-2.5 py-2 h-auto text-sm font-normal"
              onClick={() => alert(t("modules.employees.photo.uploadInfo"))}>
              <Upload className="size-4 text-muted-foreground" /> {t("modules.employees.photo.upload")}
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-2 rounded px-2.5 py-2 h-auto text-sm font-normal text-destructive hover:text-destructive"
              onClick={() => alert(t("modules.employees.photo.deleteInfo"))}>
              <MoreVertical className="size-4" /> {t("modules.employees.photo.delete")}
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xl font-semibold">{emp.full_name}{a != null && <span className="ml-2 text-sm font-normal text-muted-foreground">{t("modules.employees.units.years", { count: a })}</span>}</div>
        <div className="text-muted-foreground">{emp.position ?? "—"}{emp.department ? ` · ${emp.department}` : ""}</div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <Badge variant={st.variant}>{st.labelKey ? t(st.labelKey) : emp.status}</Badge>
          {emp.exists_in_1c != null && (
            <Badge variant={emp.exists_in_1c ? "success" : "warning"} className="gap-1">
              <BadgeCheck className="size-3" /> 1C {emp.exists_in_1c ? "✓" : "✗"}
            </Badge>
          )}
          {emp.exists_in_mehnat != null && (
            <Badge variant={emp.exists_in_mehnat ? "success" : "warning"} className="gap-1">
              <BadgeCheck className="size-3" /> mehnat {emp.exists_in_mehnat ? "✓" : "✗"}
            </Badge>
          )}
          {emp.is_innovation_center && <Badge variant="info">IT-park</Badge>}
          {d2b != null && (
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${d2b <= 7 ? "bg-info/15 text-info" : "bg-muted text-muted-foreground"}`}>
              <Cake className="size-3" /> {d2b === 0 ? t("modules.employees.birthday.today") : t("modules.employees.birthday.daysUntil", { count: d2b })}
            </span>
          )}
        </div>
      </div>
      {/* Hero sync-action buttons (1C / mehnat integration → 409/stub) */}
      <div className="flex items-center gap-2">
        {emp.exists_in_1c !== true && (
          <Button variant="outline" size="sm" onClick={() => sync("sync/to-1c", t("modules.employees.actions.addToOnec"))}>
            <RefreshCw className="size-4 mr-1.5" /> {t("modules.employees.actions.addToOnec")}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => sync("employees/" + emp.id + "/push-to-mehnat", t("modules.employees.actions.sendToMehnat"))}>
          <Send className="size-4 mr-1.5" /> {t("modules.employees.actions.sendToMehnatShort")}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children, onEdit, editing }: { title: string; children: React.ReactNode; onEdit?: () => void; editing?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-2.5 border-b text-sm font-medium flex items-center justify-between">
        {title}
        {onEdit && !editing && (
          <Button variant="ghost" onClick={onEdit} className="h-auto gap-1 px-1.5 py-0.5 text-xs font-normal text-muted-foreground hover:text-foreground">
            <Pencil className="size-3" /> {t("modules.employees.actions.change")}
          </Button>
        )}
      </div>
      <dl className="divide-y">{children}</dl>
    </div>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 text-sm">
      <dt className="w-44 shrink-0 text-muted-foreground">{k}</dt>
      <dd className="flex-1 font-medium">{v ?? "—"}</dd>
    </div>
  );
}

// Inline-edit field row for the per-section edit mode.
function EditRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 text-sm">
      <span className="w-44 shrink-0 text-muted-foreground">{k}</span>
      <div className="flex-1">{children}</div>
    </div>
  );
}

// ── HR document checklist (left panel on General tab) ───────────────────────
function DocChecklist({ companyId, empId }: { companyId: number; empId: number }) {
  const { t } = useTranslation();
  const action = useEmpAction();
  // No employee folder data over the poc backend → render the checklist with
  // every slot empty (parity with a freshly-created employee) and an upload
  // button per row that surfaces the cloud-write block.
  const upload = (slug: string) =>
    action.mutate({ companyId, path: `employees/${empId}/documents/${slug}` }, {
      onSuccess: () => alert(t("modules.employees.alerts.uploaded")),
      onError: (e) => alert(String((e as Error)?.message ?? e)),
    });
  return (
    <div className="rounded-lg border bg-card">
      <div className="px-4 py-2.5 border-b flex items-center justify-between">
        <span className="text-sm font-medium">{t("modules.employees.docChecklist.title")}</span>
        <span className="text-xs text-muted-foreground">0 / {HR_DOC_SLUGS.length}</span>
      </div>
      <ul className="divide-y">
        {HR_DOC_SLUGS.map((slug) => (
          <li key={slug} className="flex items-center gap-2.5 px-4 py-2.5 text-sm">
            <Circle className="size-4 text-muted-foreground shrink-0" />
            <span className="flex-1">{t(`modules.employees.docChecklist.types.${slug}`)}</span>
            <Button variant="ghost" size="icon" className="size-7" title={t("modules.employees.actions.upload")} onClick={() => upload(slug)}>
              <FileUp className="size-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Tiny inline-edit input wrappers (controlled by the parent's draft state).
function TextIn({ value, onChange, type = "text" }: { value: string; onChange: (v: string) => void; type?: string }) {
  return <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-8" />;
}

function SectionEditBar({ onSave, onCancel, saving }: { onSave: () => void; onCancel: () => void; saving: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-t">
      <Button size="sm" onClick={onSave} disabled={saving}>{saving ? t("modules.employees.actions.saving") : t("modules.employees.actions.save")}</Button>
      <Button size="sm" variant="ghost" onClick={onCancel}>{t("modules.employees.actions.cancel")}</Button>
    </div>
  );
}

function GeneralTab({ emp, companyId }: { emp: Employee; companyId: number }) {
  const { t } = useTranslation();
  const GENDER = useGenderMap();
  const update = useUpdateEmployee();
  const [edit, setEdit] = useState<null | "personal" | "contact" | "work">(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const begin = (sec: "personal" | "contact" | "work", seed: Record<string, string>) => { setDraft(seed); setEdit(sec); };
  const save = () => update.mutate({ companyId, id: emp.id, body: draft },
    { onSuccess: () => setEdit(null), onError: (e) => alert(String((e as Error)?.message ?? e)) });

  return (
    <div className="grid md:grid-cols-[minmax(0,18rem)_1fr] gap-4">
      <DocChecklist companyId={companyId} empId={emp.id} />
      <div className="grid sm:grid-cols-2 gap-4 content-start">
        <Section title={t("modules.employees.sections.personal")} editing={edit === "personal"}
          onEdit={() => begin("personal", { last_name: emp.last_name ?? "", first_name: emp.first_name ?? "", middle_name: emp.middle_name ?? "", gender: emp.gender ?? "", birth_date: emp.birth_date ?? "", pinfl: emp.pinfl ?? "", inn: emp.inn ?? "" })}>
          {edit === "personal" ? <>
            <EditRow k={t("modules.employees.fields.lastName")}><TextIn value={draft.last_name} onChange={(v) => setDraft((d) => ({ ...d, last_name: v }))} /></EditRow>
            <EditRow k={t("modules.employees.fields.firstName")}><TextIn value={draft.first_name} onChange={(v) => setDraft((d) => ({ ...d, first_name: v }))} /></EditRow>
            <EditRow k={t("modules.employees.fields.middleName")}><TextIn value={draft.middle_name} onChange={(v) => setDraft((d) => ({ ...d, middle_name: v }))} /></EditRow>
            <EditRow k={t("modules.employees.fields.birthDate")}><DatePicker value={draft.birth_date} onChange={(v) => setDraft((d) => ({ ...d, birth_date: v }))} /></EditRow>
            <EditRow k="PINFL"><TextIn value={draft.pinfl} onChange={(v) => setDraft((d) => ({ ...d, pinfl: v }))} /></EditRow>
            <EditRow k="INN"><TextIn value={draft.inn} onChange={(v) => setDraft((d) => ({ ...d, inn: v }))} /></EditRow>
            <SectionEditBar onSave={save} onCancel={() => setEdit(null)} saving={update.isPending} />
          </> : <>
            <Row k={t("modules.employees.columns.fio")} v={emp.full_name} />
            <Row k={t("modules.employees.fields.gender")} v={emp.gender ? GENDER[emp.gender.toLowerCase()] ?? emp.gender : "—"} />
            <Row k={t("modules.employees.fields.birthDate")} v={fmtDate(emp.birth_date)} />
            <Row k="PINFL" v={<span className="font-mono">{emp.pinfl ?? "—"}</span>} />
            <Row k="INN" v={<span className="font-mono">{emp.inn ?? "—"}</span>} />
          </>}
        </Section>
        <Section title={t("modules.employees.sections.contact")} editing={edit === "contact"}
          onEdit={() => begin("contact", { phone: emp.phone ?? "", email: emp.email ?? "" })}>
          {edit === "contact" ? <>
            <EditRow k={t("modules.employees.columns.phone")}><TextIn type="tel" value={draft.phone} onChange={(v) => setDraft((d) => ({ ...d, phone: v }))} /></EditRow>
            <EditRow k={t("modules.employees.columns.email")}><TextIn type="email" value={draft.email} onChange={(v) => setDraft((d) => ({ ...d, email: v }))} /></EditRow>
            <SectionEditBar onSave={save} onCancel={() => setEdit(null)} saving={update.isPending} />
          </> : <>
            <Row k={t("modules.employees.columns.phone")} v={<span className="font-mono">{emp.phone ?? "—"}</span>} />
            <Row k={t("modules.employees.columns.email")} v={emp.email ?? "—"} />
          </>}
        </Section>
        <Section title={t("modules.employees.sections.work")} editing={edit === "work"}
          onEdit={() => begin("work", { position: emp.position ?? "", hire_date: emp.hire_date ?? "", mehnat_position_name_uz: emp.mehnat_position_name_uz ?? "" })}>
          {edit === "work" ? <>
            <EditRow k={t("modules.employees.columns.position")}><TextIn value={draft.position} onChange={(v) => setDraft((d) => ({ ...d, position: v }))} /></EditRow>
            <EditRow k={t("modules.employees.fields.hireDate")}><DatePicker value={draft.hire_date} onChange={(v) => setDraft((d) => ({ ...d, hire_date: v }))} /></EditRow>
            <EditRow k={t("modules.employees.fields.mehnatPosition")}><TextIn value={draft.mehnat_position_name_uz} onChange={(v) => setDraft((d) => ({ ...d, mehnat_position_name_uz: v }))} /></EditRow>
            <SectionEditBar onSave={save} onCancel={() => setEdit(null)} saving={update.isPending} />
          </> : <>
            <Row k={t("modules.employees.columns.position")} v={emp.position ?? "—"} />
            <Row k={t("modules.employees.columns.department")} v={emp.department ?? "—"} />
            <Row k={t("modules.employees.fields.hireDate")} v={fmtDate(emp.hire_date)} />
            {emp.dismissal_date && <Row k={t("modules.employees.fields.dismissalDate")} v={fmtDate(emp.dismissal_date)} />}
            <Row k={t("modules.employees.fields.employmentType")} v={emp.employment_type ? (EMPLOYMENT_TYPE_LABELS[emp.employment_type] ? t(EMPLOYMENT_TYPE_LABELS[emp.employment_type]) : emp.employment_type) : "—"} />
            {emp.mehnat_position_name_uz && <Row k={t("modules.employees.fields.mehnatPosition")} v={emp.mehnat_position_name_uz} />}
          </>}
        </Section>
      </div>
    </div>
  );
}

function PassportTab({ emp, companyId }: { emp: Employee; companyId: number }) {
  const { t } = useTranslation();
  const update = useUpdateEmployee();
  const action = useEmpAction();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = () => update.mutate({ companyId, id: emp.id, body: draft },
    { onSuccess: () => setEdit(false), onError: (e) => alert(String((e as Error)?.message ?? e)) });
  return (
    <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
      <Section title={t("modules.employees.sections.passportData")} editing={edit}
        onEdit={() => { setDraft({ passport_series: emp.passport_series ?? "", passport_number: emp.passport_number ?? "" }); setEdit(true); }}>
        {edit ? <>
          <EditRow k={t("modules.employees.fields.passportSeries")}><TextIn value={draft.passport_series} onChange={(v) => setDraft((d) => ({ ...d, passport_series: v.toUpperCase() }))} /></EditRow>
          <EditRow k={t("modules.employees.fields.passportNumber")}><TextIn value={draft.passport_number} onChange={(v) => setDraft((d) => ({ ...d, passport_number: v }))} /></EditRow>
          <SectionEditBar onSave={save} onCancel={() => setEdit(false)} saving={update.isPending} />
        </> : <>
          <Row k={t("modules.employees.fields.passportSeries")} v={<span className="font-mono">{emp.passport_series ?? "—"}</span>} />
          <Row k={t("modules.employees.fields.passportNumber")} v={<span className="font-mono">{emp.passport_number ?? "—"}</span>} />
          <Row k="PINFL" v={<span className="font-mono">{emp.pinfl ?? "—"}</span>} />
        </>}
      </Section>
      {/* Passport-photo upload block (cloud Files-backed → stub) */}
      <div className="rounded-lg border bg-card">
        <div className="px-4 py-2.5 border-b text-sm font-medium">{t("modules.employees.sections.passportPhoto")}</div>
        <div className="p-4 space-y-3">
          <div className="aspect-[3/2] rounded-md border border-dashed grid place-items-center text-muted-foreground text-sm">
            {t("modules.employees.empty.noFile")}
          </div>
          <Button variant="outline" size="sm" className="w-full"
            onClick={() => action.mutate({ companyId, path: `employees/${emp.id}/documents/passport-photo` },
              { onSuccess: () => alert(t("modules.employees.alerts.uploaded")), onError: (e) => alert(String((e as Error)?.message ?? e)) })}>
            <Upload className="size-4 mr-1.5" /> {t("modules.employees.actions.uploadPassportPhoto")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function PayrollTab({ emp, companyId }: { emp: Employee; companyId: number }) {
  const { t } = useTranslation();
  const update = useUpdateEmployee();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const save = () => update.mutate({ companyId, id: emp.id, body: draft },
    { onSuccess: () => setEdit(false), onError: (e) => alert(String((e as Error)?.message ?? e)) });
  return (
    <div className="max-w-md">
      <Section title={t("modules.employees.sections.salaryTaxes")} editing={edit}
        onEdit={() => { setDraft({ oklad: emp.oklad != null ? String(emp.oklad) : "", oklad_currency: emp.oklad_currency ?? "UZS", vacation_days_per_year: String(emp.vacation_days_per_year ?? 21), ndfl_rate: String(emp.ndfl_rate ?? 12), children_count: String(emp.children_count ?? 0) }); setEdit(true); }}>
        {edit ? <>
          <EditRow k={t("modules.employees.fields.oklad")}><TextIn type="number" value={draft.oklad} onChange={(v) => setDraft((d) => ({ ...d, oklad: v }))} /></EditRow>
          <EditRow k={t("modules.employees.fields.vacationDays")}><TextIn type="number" value={draft.vacation_days_per_year} onChange={(v) => setDraft((d) => ({ ...d, vacation_days_per_year: v }))} /></EditRow>
          <EditRow k={t("modules.employees.fields.ndflPercent")}><TextIn type="number" value={draft.ndfl_rate} onChange={(v) => setDraft((d) => ({ ...d, ndfl_rate: v }))} /></EditRow>
          <EditRow k={t("modules.employees.fields.childrenCount")}><TextIn type="number" value={draft.children_count} onChange={(v) => setDraft((d) => ({ ...d, children_count: v }))} /></EditRow>
          <SectionEditBar onSave={save} onCancel={() => setEdit(false)} saving={update.isPending} />
        </> : <>
          <Row k={t("modules.employees.fields.oklad")} v={<span className="font-mono">{money(emp.oklad)} {emp.oklad_currency ?? ""}</span>} />
          {emp.hourly_rate != null && <Row k={t("modules.employees.fields.hourlyRate")} v={<span className="font-mono">{money(emp.hourly_rate)}</span>} />}
          {emp.contract_amount != null && <Row k={t("modules.employees.fields.contractAmount")} v={<span className="font-mono">{money(emp.contract_amount)}</span>} />}
          <Row k={t("modules.employees.fields.vacationDays")} v={emp.vacation_days_per_year ?? 21} />
          <Row k={t("modules.employees.fields.ndflRate")} v={`${emp.ndfl_rate ?? "12"}%`} />
          <Row k={t("modules.employees.fields.childrenCount")} v={emp.children_count ?? 0} />
          <Row k={t("modules.employees.fields.contractType")} v={emp.contract_type ? (CONTRACT_TYPE_LABELS[emp.contract_type] ? t(CONTRACT_TYPE_LABELS[emp.contract_type]) : emp.contract_type) : "—"} />
          {emp.is_innovation_center && <Row k={t("modules.employees.fields.itParkResident")} v={<Badge variant="info">{t("modules.employees.boolean.yes")}</Badge>} />}
        </>}
      </Section>
    </div>
  );
}

function EventsTab({ companyId, empId }: { companyId: number; empId: number }) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useEmployeeEvents(companyId, empId);
  return (
    <Reveal loading={isLoading} skeleton={<Skeleton className="h-40 w-full" />}>
      {data.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">{t("modules.employees.empty.historyEmpty")}</div>
      ) : (
        <div className="space-y-2">
          {data.map((e) => <EventCard key={e.id} e={e} />)}
        </div>
      )}
    </Reveal>
  );
}
function EventCard({ e }: { e: EmployeeEvent }) {
  const { t } = useTranslation();
  const meta = EVENT_TYPE_META[e.event_type] ?? { labelKey: "", variant: "muted" as const };
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant={meta.variant}>{meta.labelKey ? t(meta.labelKey) : e.event_type}</Badge>
        <span className="text-sm text-muted-foreground">{fmtDate(e.event_date)}</span>
        {e.order_number && <span className="text-xs text-muted-foreground">· {t("modules.employees.events.orderNo", { num: e.order_number })}{e.order_date ? ` (${fmtDate(e.order_date)})` : ""}</span>}
      </div>
      <div className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
        {e.position && <div><span className="text-muted-foreground">{t("modules.employees.columns.position")}: </span>{e.position}</div>}
        {e.salary != null && <div><span className="text-muted-foreground">{t("modules.employees.events.salary")}: </span><span className="font-mono">{money(e.salary)} {e.currency ?? ""}</span></div>}
        {e.rate != null && <div><span className="text-muted-foreground">{t("modules.employees.schedules.rate")}: </span>{e.rate}</div>}
        {e.contract_number && <div><span className="text-muted-foreground">{t("modules.employees.events.contract")}: </span>№{e.contract_number}{e.contract_date ? ` (${fmtDate(e.contract_date)})` : ""}</div>}
        {e.dismiss_reason && <div className="sm:col-span-2"><span className="text-muted-foreground">{t("modules.employees.events.reason")}: </span>{e.dismiss_reason}</div>}
        {e.compensation_days != null && <div><span className="text-muted-foreground">{t("modules.employees.events.compensation")}: </span>{t("modules.employees.units.days", { count: e.compensation_days })}</div>}
      </div>
      {e.changes && <ChangesDiff raw={e.changes} />}
    </div>
  );
}
function ChangesDiff({ raw }: { raw: string }) {
  let obj: Record<string, unknown> | null = null;
  try { obj = JSON.parse(raw); } catch { /* ignore */ }
  if (!obj || typeof obj !== "object") return null;
  const entries = Object.entries(obj);
  if (!entries.length) return null;
  return (
    <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
      {entries.map(([k, val]) => {
        const v = val as { old?: unknown; new?: unknown };
        return <div key={k}>{k}: <span className="line-through">{String(v?.old ?? "")}</span> → <span className="text-foreground">{String(v?.new ?? "")}</span></div>;
      })}
    </div>
  );
}

function AttendanceTab({ companyId, empId }: { companyId: number; empId: number }) {
  const { t } = useTranslation();
  const now = new Date();
  // Month selector backed by the URL as a stable `YYYY-MM` string.
  const defMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [monthStr, setMonthStr] = useUrlState("amonth", defMonth);
  const [yStr, mStr] = monthStr.split("-");
  const cur = { y: Number(yStr) || now.getFullYear(), m: Number(mStr) || now.getMonth() + 1 };
  const from = `${cur.y}-${String(cur.m).padStart(2, "0")}-01`;
  const last = new Date(cur.y, cur.m, 0).getDate();
  const to = `${cur.y}-${String(cur.m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  const { data, isLoading } = useAttendanceDetail(companyId, empId, from, to);
  const nav = (d: number) => { let m = cur.m + d, y = cur.y; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } setMonthStr(`${y}-${String(m).padStart(2, "0")}`); };
  const MONTHS = [
    t("modules.employees.months.jan"), t("modules.employees.months.feb"), t("modules.employees.months.mar"),
    t("modules.employees.months.apr"), t("modules.employees.months.may"), t("modules.employees.months.jun"),
    t("modules.employees.months.jul"), t("modules.employees.months.aug"), t("modules.employees.months.sep"),
    t("modules.employees.months.oct"), t("modules.employees.months.nov"), t("modules.employees.months.dec"),
  ];

  const firstDow = (new Date(cur.y, cur.m - 1, 1).getDay() + 6) % 7; // Mon=0
  const cells: (string | null)[] = [...Array(firstDow).fill(null),
    ...Array.from({ length: last }, (_, i) => `${from.slice(0, 8)}${String(i + 1).padStart(2, "0")}`)];
  const stats = data?.stats ?? {};

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => nav(-1)}><ChevronLeft className="size-4" /></Button>
        <span className="font-medium w-32 text-center">{MONTHS[cur.m - 1]} {cur.y}</span>
        <Button variant="outline" size="sm" onClick={() => nav(1)}><ChevronRight className="size-4" /></Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[["ontime", t("modules.employees.attendance.ontime")], ["slight", t("modules.employees.attendance.slight")], ["late", t("modules.employees.attendance.late")], ["absent", t("modules.employees.attendance.absent")], ["total", t("modules.employees.attendance.total")]].map(([k, lbl]) => (
          <div key={k} className="rounded-lg border p-2.5 text-center"><div className="text-xs text-muted-foreground">{lbl}</div><div className="text-lg font-semibold">{stats[k] ?? 0}</div></div>
        ))}
      </div>
      <Reveal loading={isLoading} skeleton={<Skeleton className="h-56 w-full" />}>
        <div className="rounded-lg border bg-card p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">{WEEKDAYS.map((d) => <div key={d} className="text-center text-xs text-muted-foreground py-1">{d}</div>)}</div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const cell = data?.records[d];
              const sty = cell ? ATT_STYLE[cell.status] : null;
              const day = Number(d.slice(8));
              return (
                <div key={i} className={`rounded-md border min-h-[3.5rem] p-1 text-xs ${sty?.cls ?? ""}`}>
                  <div className="font-medium">{day}</div>
                  {cell?.check_in && <div className="opacity-80">{cell.check_in}{cell.check_out ? `–${cell.check_out}` : ""}</div>}
                  {cell?.raw_check_in && <div className="opacity-60">{t("modules.employees.attendance.cameAt", { time: cell.raw_check_in })}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </Reveal>
    </div>
  );
}

function TerminalTab({ companyId, empId }: { companyId: number; empId: number }) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useTerminalUsers(companyId);
  const mine = data.filter((u) => u.linked_employee?.id === empId);
  return (
    <Reveal loading={isLoading} skeleton={<Skeleton className="h-32 w-full" />}>
      {mine.length === 0 ? (
        <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground">{t("modules.employees.empty.notLinkedToTerminal")}</div>
      ) : (
      <div className="rounded-lg border bg-card divide-y max-w-2xl">
      {mine.map((u) => (
        <div key={u.id} className="flex items-center gap-3 px-4 py-3">
          <Cpu className="size-4 text-muted-foreground" />
          <div className="flex-1">
            <div className="font-medium">{u.name ?? u.employee_no}</div>
            <div className="text-xs text-muted-foreground">#{u.employee_no} · {u.terminal_names.join(", ") || "—"} · {t("modules.employees.terminal.eventsCount", { count: u.events_count })}</div>
          </div>
          {u.last_seen_at && <span className="text-xs text-muted-foreground">{new Date(u.last_seen_at).toLocaleDateString("ru-RU")}</span>}
        </div>
      ))}
      </div>
      )}
    </Reveal>
  );
}
