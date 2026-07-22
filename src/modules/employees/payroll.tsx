import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlNumber, useUrlState } from "@/shared/hooks/use-url-state";
import {
  ChevronLeft, ChevronRight, CalendarDays, Printer, Calculator, Lock, Unlock,
  Send, RefreshCw, Eraser, Plus, Pencil, Settings2,
  Wallet, MessageSquare, Star, MinusCircle, FileText, CalendarCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/reveal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  usePayrollRun, useLeaves, usePremiums, useDeductions, useTimesheet, useHolidays,
  useEmpAction, useEmployees, useSchedules,
} from "./api";
import {
  LEAVE_TYPE_LABELS, PREMIUM_KIND_LABELS, DEDUCTION_KIND_LABELS, FORMULA_LABELS,
  PAYROLL_STATUS_META, type PayrollEmpLine,
} from "./types";

const money = (v?: string | number | null) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
// NextCloud .docs-table look — uppercase muted headers + comfortable padding.
const NC_TABLE =
  "[&_thead_th]:text-xs [&_thead_th]:uppercase [&_thead_th]:tracking-wide [&_thead_th]:font-semibold [&_thead_th]:text-muted-foreground [&_thead_th]:px-3 [&_tbody_td]:px-3 [&_tbody_td]:py-2.5";
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");

const SUB_DEFS: { key: SubKey; icon: LucideIcon }[] = [
  { key: "calc", icon: Wallet },
  { key: "timesheet", icon: CalendarDays },
  { key: "leaves", icon: MessageSquare },
  { key: "premiums", icon: Star },
  { key: "deductions", icon: MinusCircle },
  { key: "t51", icon: FileText },
  { key: "holidays", icon: CalendarCheck },
];
type SubKey = "calc" | "timesheet" | "leaves" | "premiums" | "deductions" | "t51" | "holidays";

const useMonths = () => {
  const { t } = useTranslation();
  return [
    t("modules.employees.months.jan"), t("modules.employees.months.feb"), t("modules.employees.months.mar"),
    t("modules.employees.months.apr"), t("modules.employees.months.may"), t("modules.employees.months.jun"),
    t("modules.employees.months.jul"), t("modules.employees.months.aug"), t("modules.employees.months.sep"),
    t("modules.employees.months.oct"), t("modules.employees.months.nov"), t("modules.employees.months.dec"),
  ];
};

function useAlertAction(companyId: number) {
  const { t } = useTranslation();
  const action = useEmpAction();
  return (path: string, label: string, opts?: { method?: "post" | "put" | "delete"; body?: unknown; onOk?: () => void }) =>
    action.mutate({ companyId, path, method: opts?.method, body: opts?.body }, {
      onSuccess: () => { alert(`${label}: ${t("modules.employees.alerts.done")}`); opts?.onOk?.(); },
      onError: (e) => alert(String((e as Error)?.message ?? e)),
    });
}

export function PayrollView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const MONTHS = useMonths();
  const now = new Date();
  const [year, setYear] = useUrlNumber("pyear", now.getFullYear());
  const [month, setMonth] = useUrlNumber("pmonth", now.getMonth() + 1);
  const [subRaw, setSubRaw] = useUrlState("psub", "calc");
  const sub = subRaw as SubKey;
  const nav = (d: number) => { let m = month + d, y = year; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } setMonth(m); setYear(y); };
  const SUBS = SUB_DEFS.map((s) => ({ ...s, label: t(`modules.employees.payroll.subs.${s.key}`) }));

  return (
    <div className="space-y-4">
      {/* Section tabs — horizontal, full content width */}
      <div className="flex items-center gap-1 border-b overflow-x-auto">
        {SUBS.map((s) => (
          <Button key={s.key} variant="ghost" onClick={() => setSubRaw(s.key)}
            className={`h-auto rounded-none gap-1.5 whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors hover:bg-transparent ${sub === s.key ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <s.icon className="size-4 shrink-0" /> {s.label}
          </Button>
        ))}
      </div>

      {/* Period navigator */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => nav(-1)}><ChevronLeft className="size-4" /></Button>
        <span className="font-medium w-32 text-center tabular-nums">{MONTHS[month - 1]} {year}</span>
        <Button variant="outline" size="sm" onClick={() => nav(1)}><ChevronRight className="size-4" /></Button>
      </div>

      {sub === "calc" && <CalcSection companyId={companyId} year={year} month={month} />}
      {sub === "timesheet" && <TimesheetSection companyId={companyId} year={year} month={month} />}
      {sub === "leaves" && <LeavesSection companyId={companyId} year={year} month={month} />}
      {sub === "premiums" && <PremiumsSection companyId={companyId} year={year} month={month} />}
      {sub === "deductions" && <DeductionsSection companyId={companyId} year={year} month={month} />}
      {sub === "t51" && <T51Section companyId={companyId} year={year} month={month} />}
      {sub === "holidays" && <HolidaysSection companyId={companyId} year={year} />}
    </div>
  );
}

type P = { companyId: number; year: number; month: number };

function Empty({ msg }: { msg: string }) {
  return <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground animate-in fade-in-0 duration-300">{msg}</div>;
}

// 1C row-status chip + actions used across leaves/premiums/deductions.
function OneCStatus({ synced }: { synced?: boolean | null }) {
  if (synced == null) return <Badge variant="muted" className="text-[10px]">1C ?</Badge>;
  return synced
    ? <Badge variant="success" className="text-[10px]">1C ✓</Badge>
    : <Badge variant="warning" className="text-[10px]">1C ✗</Badge>;
}
function RowActions({ onEdit, onSend }: { onEdit?: () => void; onSend?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-0.5 justify-end">
      {onSend && <Button variant="ghost" size="icon" className="size-7" title={t("modules.employees.actions.sendToOnec")} onClick={onSend}><Send className="size-3.5" /></Button>}
      {onEdit && <Button variant="ghost" size="icon" className="size-7" title={t("modules.employees.actions.edit")} onClick={onEdit}><Pencil className="size-3.5" /></Button>}
    </div>
  );
}

function CalcSection({ companyId, year, month }: P) {
  const { t } = useTranslation();
  const { data, isLoading } = usePayrollRun(companyId, year, month);
  const run = useAlertAction(companyId);
  const [wdy, setWdy] = useState("");
  if (isLoading) return <Skeleton className="h-48 w-full" />;
  const r = data?.run ?? null;
  const status = r?.status ?? "";
  const st = PAYROLL_STATUS_META[status] ?? { labelKey: "", variant: "muted" as const };
  const period = { year, month, workdays_per_year: wdy ? Number(wdy) : undefined };

  return (
    <div className="space-y-4">
      {/* Toolbar: Calculate / Send-1C / Close / Reopen + workdays/year */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-card px-3 py-2">
        <Button size="sm" onClick={() => run("payroll/calculate", t("modules.employees.payroll.calc.calculate"), { body: period })}>
          <Calculator className="size-4 mr-1.5" /> {t("modules.employees.payroll.calc.calculate")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => run("payroll/send-1c", t("modules.employees.actions.sendToOnec"), { body: period })}>
          <Send className="size-4 mr-1.5" /> {t("modules.employees.actions.sendToOnec")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => run("payroll/close", t("modules.employees.payroll.calc.closeMonth"), { body: period })}>
          <Lock className="size-4 mr-1.5" /> {t("modules.employees.payroll.calc.closeMonth")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => run("payroll/reopen", t("modules.employees.payroll.calc.reopen"), { body: period })}>
          <Unlock className="size-4 mr-1.5" /> {t("modules.employees.payroll.calc.reopen")}
        </Button>
        <div className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
          <label htmlFor="wdy">{t("modules.employees.payroll.calc.workdaysPerYear")}</label>
          <Input id="wdy" type="number" min={200} max={366} value={wdy} onChange={(e) => setWdy(e.target.value)} className="w-20 h-8" />
          <Button size="sm" variant="outline" onClick={() => run("payroll/calculate", t("modules.employees.alerts.saved"), { body: period })}>{t("modules.employees.actions.save")}</Button>
        </div>
      </div>

      {!r ? <Empty msg={t("modules.employees.empty.noPayrollPeriod")} /> : <FadeIn className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant={st.variant}>{st.labelKey ? t(st.labelKey) : (status || "—")}</Badge>
          <span className="text-sm text-muted-foreground">{t("modules.employees.payroll.calc.workdays", { count: r.workdays_in_month })}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[[t("modules.employees.payroll.calc.accrued"), r.total_accrued], ["NDFL", r.total_ndfl], ["INPS", r.total_inps], [t("modules.employees.payroll.calc.deductions"), r.total_deductions], [t("modules.employees.payroll.calc.net"), r.total_net]].map(([k, v]) => (
            <div key={k as string} className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">{k}</div>
              <div className="text-lg font-semibold font-mono">{money(v as number)}</div></div>
          ))}
        </div>
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table className={NC_TABLE}>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>{t("modules.employees.columns.employee")}</TableHead><TableHead className="text-right">{t("modules.employees.fields.oklad")}</TableHead>
              <TableHead className="text-right">{t("modules.employees.payroll.cols.vacation")}</TableHead><TableHead className="text-right">{t("modules.employees.payroll.cols.sick")}</TableHead>
              <TableHead className="text-right">{t("modules.employees.payroll.cols.premium")}</TableHead><TableHead className="text-right">{t("modules.employees.payroll.calc.accrued")}</TableHead>
              <TableHead className="text-right">NDFL</TableHead><TableHead className="text-right">INPS</TableHead>
              <TableHead className="text-right">{t("modules.employees.payroll.calc.deductions")}</TableHead><TableHead className="text-right">{t("modules.employees.payroll.calc.net")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(data?.lines ?? []).map((l) => (
                <TableRow key={l.employee_id} className="odd:bg-muted/30 hover:bg-muted/60">
                  <TableCell><div className="font-medium">{l.full_name}</div><div className="text-xs text-muted-foreground">{l.position}</div></TableCell>
                  <TableCell className="text-right font-mono">{money(l.oklad)}</TableCell>
                  <TableCell className="text-right font-mono">{money(l.vacation_amount)}</TableCell>
                  <TableCell className="text-right font-mono">{money(l.sick_amount)}</TableCell>
                  <TableCell className="text-right font-mono">{money(l.premium_amount)}</TableCell>
                  <TableCell className="text-right font-mono">{money(l.total_accrued)}</TableCell>
                  <TableCell className="text-right font-mono text-destructive">{money(l.ndfl_amount)}</TableCell>
                  <TableCell className="text-right font-mono">{money(l.inps_amount)}</TableCell>
                  <TableCell className="text-right font-mono">{money(l.total_deductions)}</TableCell>
                  <TableCell className="text-right font-mono font-medium">{money(l.total_net)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {(data?.entries.length ?? 0) > 0 && (
          <div>
            <div className="text-sm font-medium mb-2">{t("modules.employees.payroll.calc.entriesTitle")}</div>
            <div className="rounded-lg border border-border bg-card">
              <Table className={NC_TABLE}>
                <TableHeader><TableRow className="hover:bg-transparent">
                  <TableHead>{t("modules.employees.columns.employee")}</TableHead><TableHead>{t("modules.employees.payroll.cols.category")}</TableHead>
                  <TableHead>{t("modules.employees.payroll.cols.debit")}</TableHead><TableHead>{t("modules.employees.payroll.cols.credit")}</TableHead><TableHead className="text-right">{t("modules.employees.payroll.cols.amount")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data!.entries.map((e, i) => (
                    <TableRow key={i} className="odd:bg-muted/30 hover:bg-muted/60">
                      <TableCell>{e.full_name ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{e.category}</TableCell>
                      <TableCell className="font-mono">{e.debit_account ?? "—"}</TableCell>
                      <TableCell className="font-mono">{e.credit_account ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{money(e.amount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </FadeIn>}
    </div>
  );
}

const DAY_CODES_KEYS = ["Я", "В", "О", "Б", "К", "НН", "П", "БС"] as const;
const useDayCodes = () => {
  const { t } = useTranslation();
  return DAY_CODES_KEYS.map((code) => ({ code, label: t(`modules.employees.timesheet.dayCodes.${code}`) }));
};

function TimesheetSection({ companyId, year, month }: P) {
  const { t } = useTranslation();
  const MONTHS = useMonths();
  const DAY_CODES = useDayCodes();
  const { data = [], isLoading } = useTimesheet(companyId, year, month);
  const run = useAlertAction(companyId);
  const [editId, setEditId] = useState<number | null>(null);
  const [absentOpen, setAbsentOpen] = useState(false);
  return (
    <div className="space-y-3">
      {/* Toolbar: Generate / Rebuild / Clear / Write-1C + auto-absence */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-card px-3 py-2">
        <Button size="sm" variant="outline" onClick={() => run("timesheet/generate", t("modules.employees.timesheet.toolbar.generate"), { body: { year, month } })}>
          <CalendarDays className="size-4 mr-1.5" /> {t("modules.employees.timesheet.toolbar.generate")}
        </Button>
        <Button size="sm" variant="outline" title={t("modules.employees.timesheet.toolbar.rebuildHint")}
          onClick={() => run("timesheet/rebuild", t("modules.employees.timesheet.toolbar.rebuild"), { body: { year, month } })}>
          <RefreshCw className="size-4 mr-1.5" /> {t("modules.employees.timesheet.toolbar.rebuild")}
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => run("timesheet/clear", t("modules.employees.timesheet.toolbar.clear"), { body: { year, month } })}>
          <Eraser className="size-4 mr-1.5" /> {t("modules.employees.timesheet.toolbar.clear")}
        </Button>
        <Button size="sm" variant="outline" onClick={() => run("timesheet/write-1c", t("modules.employees.timesheet.toolbar.writeOnec"), { body: { year, month } })}>
          <Send className="size-4 mr-1.5" /> {t("modules.employees.timesheet.toolbar.writeOnec")}
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setAbsentOpen(true)} title={t("modules.employees.timesheet.toolbar.autoAbsenceHint")}>
          <Settings2 className="size-4 mr-1.5" /> {t("modules.employees.timesheet.toolbar.autoAbsence")}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table className={NC_TABLE}>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>{t("modules.employees.columns.employee")}</TableHead><TableHead className="text-right">{t("modules.employees.timesheet.cols.workDays")}</TableHead>
              <TableHead className="text-right">{t("modules.employees.timesheet.cols.weekend")}</TableHead><TableHead className="text-right">{t("modules.employees.payroll.cols.vacation")}</TableHead>
              <TableHead className="text-right">{t("modules.employees.payroll.cols.sick")}</TableHead><TableHead className="text-right">{t("modules.employees.timesheet.cols.unpaid")}</TableHead>
              <TableHead className="text-right">{t("modules.employees.timesheet.cols.tripShort")}</TableHead><TableHead className="text-right">{t("modules.employees.timesheet.cols.holiday")}</TableHead>
              <TableHead className="text-right">{t("modules.employees.timesheet.cols.expectedHours")}</TableHead><TableHead className="text-right">{t("modules.employees.timesheet.cols.workedHours")}</TableHead>
              <TableHead className="w-10" />
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                    <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j} className="text-right"><Skeleton className="h-3.5 w-8 ml-auto" /></TableCell>
                    ))}
                    <TableCell><Skeleton className="size-7 rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={11} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <CalendarDays className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.employees.empty.noTimesheetPeriod")}</div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
              data.map((ts, i) => (
                <TableRow key={ts.employee_id}
                  className="odd:bg-muted/30 hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <TableCell className="font-medium">{ts.full_name}</TableCell>
                  <TableCell className="text-right">{ts.work_days}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{ts.weekend_days}</TableCell>
                  <TableCell className="text-right">{ts.vacation_days}</TableCell>
                  <TableCell className="text-right">{ts.sick_days}</TableCell>
                  <TableCell className="text-right">{ts.unpaid_days}</TableCell>
                  <TableCell className="text-right">{ts.trip_days}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{ts.holiday_days}</TableCell>
                  <TableCell className="text-right font-mono">{ts.expected_hours}</TableCell>
                  <TableCell className="text-right font-mono font-medium">{ts.worked_hours}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" className="size-7" title={t("modules.employees.actions.edit")} onClick={() => setEditId(ts.employee_id)}><Pencil className="size-3.5" /></Button></TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </div>

      {/* Day-code edit drawer */}
      <Sheet open={editId != null} onOpenChange={(o) => { if (!o) setEditId(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0">
          <SheetHeader className="px-5 py-4 border-b"><SheetTitle>{t("modules.employees.timesheet.editTitle")}</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <p className="text-sm text-muted-foreground">{MONTHS[month - 1]} {year} — {t("modules.employees.timesheet.editHint")}</p>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: new Date(year, month, 0).getDate() }, (_, i) => i + 1).map((d) => (
                <div key={d} className="rounded-md border p-1 text-center">
                  <div className="text-xs text-muted-foreground">{d}</div>
                  <Select defaultValue="Я">
                    <SelectTrigger className="w-full text-xs mt-0.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DAY_CODES.map((c) => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground pt-2 border-t">
              {DAY_CODES.map((c) => <span key={c.code}><b>{c.code}</b> — {c.label}</span>)}
            </div>
          </div>
          <div className="border-t px-5 py-3 flex items-center gap-2 bg-muted/20">
            <Button onClick={() => run("timesheet/rebuild", t("modules.employees.alerts.saved"), { body: { year, month }, onOk: () => setEditId(null) })}>{t("modules.employees.actions.save")}</Button>
            <Button variant="ghost" onClick={() => setEditId(null)}>{t("modules.employees.actions.cancel")}</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Auto-absence settings */}
      <Dialog open={absentOpen} onOpenChange={setAbsentOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("modules.employees.timesheet.autoAbsenceTitle")}</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">{t("modules.employees.timesheet.autoAbsenceDesc")}</p>
            <label className="flex items-center gap-2"><Checkbox defaultChecked /> {t("modules.employees.timesheet.autoAbsenceMarkNn")}</label>
            <label className="flex items-center gap-2"><Checkbox /> {t("modules.employees.timesheet.onlyWorkdays")}</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAbsentOpen(false)}>{t("modules.employees.actions.cancel")}</Button>
            <Button onClick={() => run("timesheet/generate", t("modules.employees.alerts.marked"), { body: { year, month }, onOk: () => setAbsentOpen(false) })}>{t("modules.employees.actions.mark")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionToolbar({ onAdd, label }: { onAdd: () => void; label: string }) {
  return (
    <div className="flex justify-end">
      <Button size="sm" onClick={onAdd}><Plus className="size-4 mr-1.5" /> {label}</Button>
    </div>
  );
}

function LeavesSection({ companyId, year, month }: P) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useLeaves(companyId, year, month);
  const run = useAlertAction(companyId);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <SectionToolbar label={t("modules.employees.leaves.addLeave")} onAdd={() => setOpen(true)} />
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table className={NC_TABLE}>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>{t("modules.employees.columns.employee")}</TableHead><TableHead>{t("modules.employees.leaves.type")}</TableHead>
              <TableHead>{t("modules.employees.leaves.start")}</TableHead><TableHead>{t("modules.employees.leaves.end")}</TableHead>
              <TableHead className="text-right">{t("modules.employees.leaves.days")}</TableHead><TableHead className="text-right">{t("modules.employees.payroll.cols.amount")}</TableHead>
              <TableHead>{t("modules.employees.leaves.details")}</TableHead><TableHead>1C</TableHead><TableHead className="w-16 text-right" />
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                    <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-8 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="size-7 rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <MessageSquare className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.employees.empty.noLeavesPeriod")}</div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
              data.map((l, i) => (
                <TableRow key={l.id}
                  className="odd:bg-muted/30 hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <TableCell className="font-medium">{l.full_name}</TableCell>
                  <TableCell><Badge variant="muted">{LEAVE_TYPE_LABELS[l.type] ?? l.type}{l.sick_percent ? ` ${l.sick_percent}%` : ""}</Badge></TableCell>
                  <TableCell>{fmtDate(l.start_date)}</TableCell>
                  <TableCell>{fmtDate(l.end_date)}</TableCell>
                  <TableCell className="text-right">{l.calendar_days ?? "—"}{l.workdays != null ? ` (${l.workdays})` : ""}</TableCell>
                  <TableCell className="text-right font-mono">{money(l.computed_amount)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {l.sick_series && `№ ${l.sick_series}${l.sick_number ?? ""}`}
                    {l.sick_cause && ` · ${l.sick_cause}`}
                    {l.trip_city && `${l.trip_country ?? ""} ${l.trip_city}`}
                    {l.trip_organization && ` · ${l.trip_organization}`}
                    {l.dismissal_reason_name && l.dismissal_reason_name}
                    {!l.sick_series && !l.trip_city && !l.dismissal_reason_name && (l.reason ?? "—")}
                  </TableCell>
                  <TableCell><OneCStatus synced={l.onec_synced} /></TableCell>
                  <TableCell><RowActions onSend={() => run("leaves", t("modules.employees.alerts.sentToOnec"), { body: { employee_id: l.employee_id } })} /></TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </div>
      <LeaveForm companyId={companyId} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function LeaveForm({ companyId, open, onClose }: { companyId: number; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { data } = useEmployees(companyId, { status: "active" });
  const run = useEmpAction();
  const [f, setF] = useState<Record<string, string>>({ type: "vacation" });
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setF({ type: "vacation" }); setErr(null); } }, [open]);
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const lt = f.type;
  const submit = () => {
    setErr(null);
    if (!f.employee_id) { setErr(t("modules.employees.errors.selectEmployee")); return; }
    run.mutate({ companyId, path: "leaves", body: { ...f, employee_id: Number(f.employee_id) } },
      { onSuccess: onClose, onError: (e) => setErr(String((e as Error)?.message ?? e)) });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{t("modules.employees.leaves.dialogTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <Fld label={t("modules.employees.fields.employeeRequired")}>
            <Select value={f.employee_id ?? ""} onValueChange={(v) => set("employee_id", v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{(data?.items ?? []).map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </Fld>
          <Fld label={t("modules.employees.leaves.type")}>
            <Select value={lt} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
            </Select>
          </Fld>
          {lt !== "compensation" && (
            <div className="grid grid-cols-2 gap-3">
              <Fld label={t("modules.employees.leaves.startRequired")}><DatePicker value={f.start_date ?? ""} onChange={(v) => set("start_date", v)} /></Fld>
              <Fld label={t("modules.employees.leaves.endRequired")}><DatePicker value={f.end_date ?? ""} onChange={(v) => set("end_date", v)} /></Fld>
            </div>
          )}
          {lt === "compensation" && (
            <div className="grid grid-cols-2 gap-3">
              <Fld label={t("modules.employees.fields.dismissDate")}><DatePicker value={f.dismiss_date ?? ""} onChange={(v) => set("dismiss_date", v)} /></Fld>
              <Fld label={t("modules.employees.fields.compensationDays")}><Input type="number" value={f.days ?? ""} onChange={(e) => set("days", e.target.value)} /></Fld>
            </div>
          )}
          {lt === "sick" && <>
            <div className="grid grid-cols-3 gap-3">
              <Fld label={t("modules.employees.leaves.sickPercent")}><Input type="number" value={f.sick_percent ?? ""} onChange={(e) => set("sick_percent", e.target.value)} /></Fld>
              <Fld label={t("modules.employees.fields.passportSeries")}><Input value={f.sick_series ?? ""} onChange={(e) => set("sick_series", e.target.value)} /></Fld>
              <Fld label={t("modules.employees.fields.passportNumber")}><Input value={f.sick_number ?? ""} onChange={(e) => set("sick_number", e.target.value)} /></Fld>
            </div>
            <Fld label={t("modules.employees.leaves.sickCause")}><Input value={f.sick_cause ?? ""} onChange={(e) => set("sick_cause", e.target.value)} /></Fld>
          </>}
          {lt === "business_trip" && (
            <div className="grid grid-cols-3 gap-3">
              <Fld label={t("modules.employees.leaves.country")}><Input value={f.trip_country ?? ""} onChange={(e) => set("trip_country", e.target.value)} /></Fld>
              <Fld label={t("modules.employees.leaves.city")}><Input value={f.trip_city ?? ""} onChange={(e) => set("trip_city", e.target.value)} /></Fld>
              <Fld label={t("modules.employees.leaves.organization")}><Input value={f.trip_organization ?? ""} onChange={(e) => set("trip_organization", e.target.value)} /></Fld>
            </div>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Fld label={t("modules.employees.leaves.reasonOrder")}><Input value={f.reason ?? ""} onChange={(e) => set("reason", e.target.value)} /></Fld>
            <Fld label={t("modules.employees.payroll.cols.debit")}><Input value={f.debit_account ?? ""} onChange={(e) => set("debit_account", e.target.value)} placeholder="9420" /></Fld>
            <Fld label={t("modules.employees.payroll.cols.credit")}><Input value={f.credit_account ?? ""} onChange={(e) => set("credit_account", e.target.value)} placeholder="6710" /></Fld>
          </div>
          {err && <div className="text-sm text-destructive">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>{t("modules.employees.actions.cancel")}</Button>
          <Button onClick={submit} disabled={run.isPending}>{t("modules.employees.actions.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PremiumsSection({ companyId, year, month }: P) {
  const { t } = useTranslation();
  const { data = [], isLoading } = usePremiums(companyId, year, month);
  const run = useAlertAction(companyId);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <SectionToolbar label={t("modules.employees.premiums.add")} onAdd={() => setOpen(true)} />
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table className={NC_TABLE}>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>{t("modules.employees.columns.employee")}</TableHead><TableHead>{t("modules.employees.leaves.type")}</TableHead><TableHead>{t("modules.employees.premiums.formula")}</TableHead>
              <TableHead className="text-right">{t("modules.employees.payroll.cols.amount")}</TableHead><TableHead className="text-right">%</TableHead>
              <TableHead>{t("modules.employees.premiums.countsInAverage")}</TableHead><TableHead>{t("modules.employees.premiums.period")}</TableHead><TableHead>Dt / Kt</TableHead>
              <TableHead>1C</TableHead><TableHead className="w-16 text-right" />
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                    <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-8 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="size-7 rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <Star className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.employees.empty.noPremiumsPeriod")}</div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
              data.map((p, i) => (
                <TableRow key={p.id}
                  className="odd:bg-muted/30 hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <TableCell className="font-medium">{p.full_name}</TableCell>
                  <TableCell>{PREMIUM_KIND_LABELS[p.kind ?? ""] ?? p.kind ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{FORMULA_LABELS[p.formula ?? ""] ?? p.formula ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{money(p.amount)}</TableCell>
                  <TableCell className="text-right">{p.percent ?? "—"}</TableCell>
                  <TableCell>{p.counts_in_average ? <Badge variant="info">{t("modules.employees.boolean.yes")}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.start_date ? `${fmtDate(p.start_date)}–${fmtDate(p.end_date)}` : "—"}{p.reason ? ` · ${p.reason}` : ""}</TableCell>
                  <TableCell className="font-mono text-xs">{p.debit_account ?? "—"} / {p.credit_account ?? "—"}</TableCell>
                  <TableCell><OneCStatus synced={null} /></TableCell>
                  <TableCell><RowActions onSend={() => run("premiums", t("modules.employees.alerts.sentToOnec"), { body: { employee_id: p.employee_id } })} /></TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </div>
      <PremiumDeductionForm companyId={companyId} kind="premium" open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function DeductionsSection({ companyId, year, month }: P) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useDeductions(companyId, year, month);
  const run = useAlertAction(companyId);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <SectionToolbar label={t("modules.employees.deductions.add")} onAdd={() => setOpen(true)} />
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table className={NC_TABLE}>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>{t("modules.employees.columns.employee")}</TableHead><TableHead>{t("modules.employees.leaves.type")}</TableHead><TableHead>{t("modules.employees.premiums.formula")}</TableHead>
              <TableHead className="text-right">{t("modules.employees.payroll.cols.amount")}</TableHead><TableHead className="text-right">%</TableHead>
              <TableHead>{t("modules.employees.deductions.reducesNdfl")}</TableHead><TableHead>{t("modules.employees.deductions.ndflCode")}</TableHead><TableHead>Dt / Kt</TableHead>
              <TableHead>1C</TableHead><TableHead className="w-16 text-right" />
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                    <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-3.5 w-8 ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="size-7 rounded ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <MinusCircle className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.employees.empty.noDeductionsPeriod")}</div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
              data.map((d, i) => (
                <TableRow key={d.id}
                  className="odd:bg-muted/30 hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <TableCell className="font-medium">{d.full_name}</TableCell>
                  <TableCell>{DEDUCTION_KIND_LABELS[d.kind ?? ""] ?? d.kind ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{FORMULA_LABELS[d.formula ?? ""] ?? d.formula ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{money(d.amount)}</TableCell>
                  <TableCell className="text-right">{d.percent ?? "—"}</TableCell>
                  <TableCell>{d.reduces_ndfl_base ? <Badge variant="info">{t("modules.employees.boolean.yes")}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="font-mono text-xs">{d.ndfl_deduction_code ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{d.debit_account ?? "—"} / {d.credit_account ?? "—"}</TableCell>
                  <TableCell><OneCStatus synced={null} /></TableCell>
                  <TableCell><RowActions onSend={() => run("deductions", t("modules.employees.alerts.sentToOnec"), { body: { employee_id: d.employee_id } })} /></TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </div>
      <PremiumDeductionForm companyId={companyId} kind="deduction" open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function PremiumDeductionForm({ companyId, kind, open, onClose }: { companyId: number; kind: "premium" | "deduction"; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { data } = useEmployees(companyId, { status: "active" });
  const run = useEmpAction();
  const [f, setF] = useState<Record<string, string | boolean>>({ formula: "fixed" });
  const [err, setErr] = useState<string | null>(null);
  const isPrem = kind === "premium";
  useEffect(() => { if (open) { setF({ formula: "fixed", counts_in_average: true, reduces_ndfl_base: false }); setErr(null); } }, [open]);
  const set = (k: string, v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const kindLabels = isPrem ? PREMIUM_KIND_LABELS : DEDUCTION_KIND_LABELS;
  const submit = () => {
    setErr(null);
    if (!f.employee_id) { setErr(t("modules.employees.errors.selectEmployee")); return; }
    run.mutate({ companyId, path: isPrem ? "premiums" : "deductions", body: { ...f, employee_id: Number(f.employee_id) } },
      { onSuccess: onClose, onError: (e) => setErr(String((e as Error)?.message ?? e)) });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{isPrem ? t("modules.employees.premiums.add") : t("modules.employees.deductions.add")}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <Fld label={t("modules.employees.fields.employeeRequired")}>
            <Select value={(f.employee_id as string) ?? ""} onValueChange={(v) => set("employee_id", v)}>
              <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>{(data?.items ?? []).map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </Fld>
          <div className="grid grid-cols-2 gap-3">
            <Fld label={t("modules.employees.leaves.type")}>
              <Select value={(f.kind as string) ?? ""} onValueChange={(v) => set("kind", v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>{Object.entries(kindLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
              </Select>
            </Fld>
            <Fld label={t("modules.employees.premiums.formula")}>
              <Select value={(f.formula as string) ?? "fixed"} onValueChange={(v) => set("formula", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="fixed">{t("modules.employees.premiums.formulaFixed")}</SelectItem><SelectItem value="percent">{t("modules.employees.premiums.formulaPercent")}</SelectItem></SelectContent>
              </Select>
            </Fld>
            <Fld label={t("modules.employees.payroll.cols.amount")}><Input type="number" value={(f.amount as string) ?? ""} onChange={(e) => set("amount", e.target.value)} /></Fld>
            <Fld label="%"><Input type="number" value={(f.percent as string) ?? ""} onChange={(e) => set("percent", e.target.value)} /></Fld>
          </div>
          {isPrem
            ? <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!f.counts_in_average} onCheckedChange={(v) => set("counts_in_average", Boolean(v))} /> {t("modules.employees.premiums.countsInAverageLabel")}</label>
            : <>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={!!f.reduces_ndfl_base} onCheckedChange={(v) => set("reduces_ndfl_base", Boolean(v))} /> {t("modules.employees.deductions.reducesNdflBenefit")}</label>
              <Fld label={t("modules.employees.deductions.ndflDeductionCode")}><Input value={(f.ndfl_deduction_code as string) ?? ""} onChange={(e) => set("ndfl_deduction_code", e.target.value)} /></Fld>
            </>}
          <div className="grid grid-cols-2 gap-3">
            <Fld label={t("modules.employees.leaves.startDate")}><DatePicker value={(f.start_date as string) ?? ""} onChange={(v) => set("start_date", v)} /></Fld>
            <Fld label={t("modules.employees.leaves.endDate")}><DatePicker value={(f.end_date as string) ?? ""} onChange={(v) => set("end_date", v)} /></Fld>
          </div>
          <Fld label={t("modules.employees.fields.dismissReason")}><Input value={(f.reason as string) ?? ""} onChange={(e) => set("reason", e.target.value)} /></Fld>
          <div className="grid grid-cols-2 gap-3">
            <Fld label={t("modules.employees.payroll.cols.debit")}><Input value={(f.debit_account as string) ?? ""} onChange={(e) => set("debit_account", e.target.value)} placeholder={isPrem ? "9420" : "6710"} /></Fld>
            <Fld label={t("modules.employees.payroll.cols.credit")}><Input value={(f.credit_account as string) ?? ""} onChange={(e) => set("credit_account", e.target.value)} placeholder={isPrem ? "6710" : ""} /></Fld>
          </div>
          {err && <div className="text-sm text-destructive">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>{t("modules.employees.actions.cancel")}</Button>
          <Button onClick={submit} disabled={run.isPending}>{t("modules.employees.actions.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 block"><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
}

function T51Section({ companyId, year, month }: P) {
  const { t } = useTranslation();
  const MONTHS = useMonths();
  // from/to period pickers (default = current month range)
  const [from, setFrom] = useState({ y: year, m: month });
  const [to, setTo] = useState({ y: year, m: month });
  const [applied, setApplied] = useState({ y: to.y, m: to.m });
  const { data, isLoading } = usePayrollRun(companyId, applied.y, applied.m);
  const yearOpts = Array.from({ length: 6 }, (_, i) => year - 3 + i);

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  const lines = data?.lines ?? [];
  const sum = (f: keyof PayrollEmpLine) => lines.reduce((a, l) => a + Number(l[f] || 0), 0);
  const accCols: { f: keyof PayrollEmpLine; h: string }[] = [
    { f: "salary_amount", h: t("modules.employees.fields.oklad") }, { f: "vacation_amount", h: t("modules.employees.payroll.cols.vacation") },
    { f: "sick_amount", h: t("modules.employees.payroll.cols.sick") }, { f: "premium_amount", h: t("modules.employees.payroll.cols.premium") },
    { f: "total_accrued", h: t("modules.employees.t51.colTotal") },
  ];
  const whCols: { f: keyof PayrollEmpLine; h: string }[] = [
    { f: "ndfl_amount", h: "NDFL" }, { f: "inps_amount", h: "INPS" },
    { f: "total_deductions", h: t("modules.employees.t51.colOther") }, { f: "total_net", h: t("modules.employees.payroll.calc.net") },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-card px-3 py-2">
        <span className="text-sm text-muted-foreground">{t("modules.employees.t51.periodLabel")}</span>
        <Select value={String(from.y)} onValueChange={(v) => setFrom((s) => ({ ...s, y: Number(v) }))}>
          <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{yearOpts.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(from.m)} onValueChange={(v) => setFrom((s) => ({ ...s, m: Number(v) }))}>
          <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((mn, i) => <SelectItem key={i} value={String(i + 1)}>{mn}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-muted-foreground">—</span>
        <Select value={String(to.y)} onValueChange={(v) => setTo((s) => ({ ...s, y: Number(v) }))}>
          <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{yearOpts.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(to.m)} onValueChange={(v) => setTo((s) => ({ ...s, m: Number(v) }))}>
          <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((mn, i) => <SelectItem key={i} value={String(i + 1)}>{mn}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" onClick={() => setApplied({ y: to.y, m: to.m })}>{t("modules.employees.actions.build")}</Button>
        <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="size-4 mr-1.5" />{t("modules.employees.actions.print")}</Button>
      </div>

      {lines.length === 0 ? <Empty msg={t("modules.employees.empty.noT51Period")} /> : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto animate-in fade-in-0 duration-300">
          <div className="text-sm font-medium px-4 py-2 border-b border-border">{t("modules.employees.t51.titlePrefix")} · {MONTHS[applied.m - 1]} {applied.y}</div>
          <Table className={NC_TABLE}>
            <TableHeader>
              {/* nested header: grouped Accruals / Withholdings */}
              <TableRow className="hover:bg-transparent">
                <TableHead rowSpan={2} className="w-8">№</TableHead>
                <TableHead rowSpan={2}>{t("modules.employees.columns.employee")}</TableHead>
                <TableHead rowSpan={2}>{t("modules.employees.columns.position")}</TableHead>
                <TableHead colSpan={accCols.length} className="text-center border-l border-border">{t("modules.employees.payroll.calc.accrued")}</TableHead>
                <TableHead colSpan={whCols.length} className="text-center border-l border-border">{t("modules.employees.t51.withheldNet")}</TableHead>
              </TableRow>
              <TableRow className="hover:bg-transparent">
                {accCols.map((c, i) => <TableHead key={c.f} className={`text-right ${i === 0 ? "border-l border-border" : ""}`}>{c.h}</TableHead>)}
                {whCols.map((c, i) => <TableHead key={c.f} className={`text-right ${i === 0 ? "border-l border-border" : ""}`}>{c.h}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => (
                <TableRow key={l.employee_id} className="odd:bg-muted/30 hover:bg-muted/60">
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium">{l.full_name}</TableCell>
                  <TableCell className="text-muted-foreground">{l.position ?? "—"}</TableCell>
                  {accCols.map((c, j) => <TableCell key={c.f} className={`text-right font-mono ${j === 0 ? "border-l" : ""} ${c.f === "total_accrued" ? "font-medium" : ""}`}>{money(l[c.f] as number)}</TableCell>)}
                  {whCols.map((c, j) => <TableCell key={c.f} className={`text-right font-mono ${j === 0 ? "border-l" : ""} ${c.f === "total_net" ? "font-medium" : ""} ${c.f === "ndfl_amount" ? "text-destructive" : ""}`}>{money(l[c.f] as number)}</TableCell>)}
                </TableRow>
              ))}
              <TableRow className="border-t-2 font-semibold bg-muted/30">
                <TableCell colSpan={3}>{t("modules.employees.t51.colTotal")}</TableCell>
                {accCols.map((c, j) => <TableCell key={c.f} className={`text-right font-mono ${j === 0 ? "border-l" : ""}`}>{money(sum(c.f))}</TableCell>)}
                {whCols.map((c, j) => <TableCell key={c.f} className={`text-right font-mono ${j === 0 ? "border-l" : ""}`}>{money(sum(c.f))}</TableCell>)}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

const useShortMonths = () => {
  const { t } = useTranslation();
  return [
    t("modules.employees.monthsShort.jan"), t("modules.employees.monthsShort.feb"), t("modules.employees.monthsShort.mar"),
    t("modules.employees.monthsShort.apr"), t("modules.employees.monthsShort.may"), t("modules.employees.monthsShort.jun"),
    t("modules.employees.monthsShort.jul"), t("modules.employees.monthsShort.aug"), t("modules.employees.monthsShort.sep"),
    t("modules.employees.monthsShort.oct"), t("modules.employees.monthsShort.nov"), t("modules.employees.monthsShort.dec"),
  ];
};

function HolidaysSection({ companyId, year }: { companyId: number; year: number }) {
  const { t } = useTranslation();
  const UZ_MONTHS_SHORT = useShortMonths();
  const [yr, setYr] = useState(year);
  const [schedId, setSchedId] = useState("");
  const { data = [], isLoading } = useHolidays(companyId, yr);
  const { data: schedules = [] } = useSchedules(companyId);
  const run = useAlertAction(companyId);
  const [form, setForm] = useState<null | { date: string; name: string; is_workday: boolean; push_1c: boolean }>(null);
  const yearOpts = Array.from({ length: 6 }, (_, i) => year - 3 + i);
  const byDate = new Map(data.map((h) => [h.date.slice(0, 10), h]));

  return (
    <div className="space-y-3">
      {/* Toolbar: year + schedule + seed-UZ + legend */}
      <div className="flex items-center gap-2 flex-wrap rounded-lg border bg-card px-3 py-2">
        <span className="text-sm text-muted-foreground">{t("modules.employees.holidays.yearLabel")}</span>
        <Select value={String(yr)} onValueChange={(v) => setYr(Number(v))}>
          <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
          <SelectContent>{yearOpts.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">{t("modules.employees.holidays.scheduleLabel")}</span>
        <Select value={schedId || "all"} onValueChange={(v) => setSchedId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-44 h-8"><SelectValue placeholder={t("modules.employees.holidays.allSchedules")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("modules.employees.holidays.allSchedules")}</SelectItem>
            {schedules.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => run("holidays/seed-uz?year=" + yr, t("modules.employees.holidays.uzAdded"))}>
          {t("modules.employees.holidays.seedUz")}
        </Button>
        <div className="ml-auto flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-destructive" /> {t("modules.employees.holidays.legendHoliday")}</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-warning" /> {t("modules.employees.holidays.legendShifted")}</span>
          <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-full bg-muted-foreground" /> {t("modules.employees.holidays.legendWeekend")}</span>
        </div>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 animate-in fade-in-0 duration-300">
          {Array.from({ length: 12 }, (_, mi) => {
            const first = new Date(yr, mi, 1);
            const firstDow = (first.getDay() + 6) % 7;
            const days = new Date(yr, mi + 1, 0).getDate();
            const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
            return (
              <div key={mi} className="rounded-lg border bg-card p-2">
                <div className="text-sm font-medium text-center mb-1">{UZ_MONTHS_SHORT[mi]} {yr}</div>
                <div className="grid grid-cols-7 gap-0.5">
                  {["D", "S", "C", "P", "J", "Sh", "Y"].map((d, i) => <div key={i} className="text-center text-[10px] text-muted-foreground">{d}</div>)}
                  {cells.map((d, i) => {
                    if (!d) return <div key={i} />;
                    const ds = `${yr}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                    const h = byDate.get(ds);
                    const cls = h ? (h.is_workday ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive") : "hover:bg-muted";
                    return (
                      <Button key={i} variant="ghost" title={h?.name}
                        onClick={() => setForm({ date: ds, name: h?.name ?? "", is_workday: !!h?.is_workday, push_1c: false })}
                        className={`aspect-square h-auto min-w-0 rounded p-0 text-[11px] font-normal hover:bg-transparent ${cls}`}>{d}</Button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Holiday edit modal */}
      <Dialog open={!!form} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>{t("modules.employees.holidays.dialogTitle")}</DialogTitle></DialogHeader>
          {form && <div className="space-y-3">
            <Fld label={t("modules.employees.holidays.dateRequired")}><DatePicker value={form.date} onChange={(v) => setForm({ ...form, date: v })} /></Fld>
            <Fld label={t("modules.employees.fields.nameRequired")}><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("modules.employees.holidays.namePlaceholder")} /></Fld>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.is_workday} onCheckedChange={(v) => setForm({ ...form, is_workday: Boolean(v) })} /> {t("modules.employees.holidays.legendShifted")}</label>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.push_1c} onCheckedChange={(v) => setForm({ ...form, push_1c: Boolean(v) })} /> {t("modules.employees.holidays.pushOnec")}</label>
          </div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setForm(null)}>{t("modules.employees.actions.cancel")}</Button>
            <Button onClick={() => form && run("holidays", t("modules.employees.alerts.saved"), { body: { ...form, year: yr }, onOk: () => setForm(null) })}>{t("modules.employees.actions.save")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
