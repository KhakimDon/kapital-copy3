import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";
import { useTranslation } from "react-i18next";
import {
  Users, Plus, Search, Loader2, Trash2, UserX, Building2, Clock, Pencil,
  Settings, Download, RefreshCw, Link2, Send, AlertCircle, X,
  Wallet, Sparkles, History,
} from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ModuleShell, type ModuleSection } from "@/components/ui/module-shell";
import {
  useEmployees, useDismissEmployee, useDeleteEmployee, useEmpAction,
  useDepartments, useSaveDepartment, useDeleteDepartment,
  useSchedules, useSaveSchedule, useDeleteSchedule, useAssignSchedule,
  useScheduleAssignments,
} from "./api";
import {
  EMP_STATUS, WEEKDAY_LABELS,
  type Employee,
} from "./types";
import { PayrollView } from "./payroll";
import { RulesView, ChangelogView } from "./rules";
import { MehnatConnectDialog } from "./mehnat-dialog";
import { type MehnatCreds, clearMehnatCreds, getMehnatCreds } from "./mehnat";

type Mode = "list" | "departments" | "schedules" | "payroll" | "rules" | "changelog";
// NextCloud .docs-table look: uppercase muted header labels, thin row
// separators, comfortable cell padding. Applied to every list table.
const NC_TABLE =
  "[&_thead_th]:text-xs [&_thead_th]:uppercase [&_thead_th]:tracking-wide [&_thead_th]:font-semibold [&_thead_th]:text-muted-foreground [&_thead_th]:h-9 [&_tbody_td]:px-3 [&_tbody_td]:py-2.5 [&_thead_th]:px-3";

const initials = (e: Employee) =>
  ((e.last_name?.[0] ?? "") + (e.first_name?.[0] ?? "")).toUpperCase() || "—";
const ageOf = (b?: string | null): number | null => {
  if (!b) return null; const d = new Date(b); if (isNaN(+d)) return null;
  const t = new Date(); let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--;
  return a >= 0 && a < 120 ? a : null;
};
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");

export function EmployeesPage() {
  const { t } = useTranslation();
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;
  const [modeRaw, setModeRaw] = useUrlState("tab", "list");
  const mode = modeRaw as Mode;

  const MODE_LABELS: Record<Mode, string> = {
    list: t("modules.employees.modes.list"),
    departments: t("modules.employees.modes.departments"),
    schedules: t("modules.employees.modes.schedules"),
    payroll: t("modules.employees.modes.payroll"),
    rules: t("modules.employees.modes.rules"),
    changelog: t("modules.employees.modes.changelog"),
  };
  const EMP_SECTIONS: ModuleSection[] = [
    { key: "list", label: MODE_LABELS.list, icon: <Users className="size-4" /> },
    { key: "departments", label: MODE_LABELS.departments, icon: <Building2 className="size-4" /> },
    { key: "schedules", label: MODE_LABELS.schedules, icon: <Clock className="size-4" /> },
    { key: "payroll", label: MODE_LABELS.payroll, icon: <Wallet className="size-4" /> },
    { key: "rules", label: MODE_LABELS.rules, icon: <Sparkles className="size-4" /> },
    { key: "changelog", label: MODE_LABELS.changelog, icon: <History className="size-4" /> },
  ];

  if (!companyId) {
    return <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
      {t("modules.employees.empty.noCompany")}
    </div>;
  }

  return (
    <ModuleShell
      title={t("modules.employees.title")}
      icon={<Users className="size-6" />}
      subtitle={MODE_LABELS[mode]}
      sections={EMP_SECTIONS}
      active={mode}
      onSelect={(k) => setModeRaw(k)}
    >
      {mode === "list" && <EmployeeList companyId={companyId} />}
      {mode === "departments" && <DepartmentsView companyId={companyId} />}
      {mode === "schedules" && <SchedulesView companyId={companyId} />}
      {mode === "payroll" && <PayrollView companyId={companyId} />}
      {mode === "rules" && <RulesView companyId={companyId} />}
      {mode === "changelog" && <ChangelogView companyId={companyId} />}
    </ModuleShell>
  );
}

// ── Settings (gear) dropdown: mehnat import/connect + 1C sync ───────────────
function SettingsMenu({ companyId, onImportFromMehnat, onConnectMehnat }: {
  companyId: number;
  onImportFromMehnat: () => void;
  onConnectMehnat: () => void;
}) {
  const { t } = useTranslation();
  const action = useEmpAction();
  const run = (path: string, label: string) =>
    action.mutate({ companyId, path }, {
      onSuccess: () => alert(`${label}: ${t("modules.employees.alerts.done")}`),
      onError: (e) => alert(String((e as Error)?.message ?? e)),
    });
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm"><Settings className="size-4 mr-1.5" /> {t("modules.employees.actions.settings")}</Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <Button variant="ghost" className="w-full justify-start gap-2 rounded px-2.5 py-2 h-auto text-sm font-normal"
          onClick={onImportFromMehnat}>
          <Download className="size-4 text-muted-foreground" /> {t("modules.employees.actions.importFromMehnat")}
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-2 rounded px-2.5 py-2 h-auto text-sm font-normal"
          onClick={onConnectMehnat}>
          <Link2 className="size-4 text-muted-foreground" /> {t("modules.employees.actions.connectMehnat")}
        </Button>
        <div className="my-1 border-t" />
        <Button variant="ghost" className="w-full justify-start gap-2 rounded px-2.5 py-2 h-auto text-sm font-normal"
          onClick={() => run("sync/to-1c", t("modules.employees.actions.syncWith1c"))}>
          <RefreshCw className="size-4 text-muted-foreground" /> {t("modules.employees.actions.syncWith1c")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function EmployeeList({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [status, setStatus] = useUrlState("status", "active");
  const [searchInput, search, setSearchInput] = useUrlSearch("q", 350);
  const [firing, setFiring] = useState(false);

  const { data, isLoading } = useEmployees(companyId, { status, search: search.trim() || undefined });
  const del = useDeleteEmployee();
  const action = useEmpAction();
  const [picked, setPicked] = useState<Set<number>>(new Set());

  // my.mehnat.uz session creds — per-company sessionStorage cache (NC parity).
  // Actions that need them go through ensureMehnat(): with creds cached the
  // action runs immediately, otherwise the connect dialog opens and the
  // action resumes after a successful handshake.
  const company = useCompany((s) => s.current);
  const [mehnatOpen, setMehnatOpen] = useState(false);
  const [mehnatCreds, setMehnatCreds] = useState<MehnatCreds | null>(null);
  useEffect(() => { setMehnatCreds(getMehnatCreds(companyId)); }, [companyId]);
  const pendingMehnat = useRef<((creds: MehnatCreds) => void) | null>(null);
  const ensureMehnat = (act: (creds: MehnatCreds) => void) => {
    const creds = getMehnatCreds(companyId);
    if (creds) { act(creds); return; }
    pendingMehnat.current = act;
    setMehnatOpen(true);
  };
  const onMehnatConnected = (creds: MehnatCreds, departments: number) => {
    setMehnatCreds(creds);
    const act = pendingMehnat.current;
    pendingMehnat.current = null;
    if (act) act(creds);
    else alert(t("modules.employees.mehnat.connectedWithCount", { count: departments }));
  };
  const runImportFromMehnat = () => ensureMehnat((creds) =>
    action.mutate({ companyId, path: "sync/import-from-mehnat", body: creds, timeout: 300_000 }, {
      onSuccess: (d) => {
        const r = (d ?? {}) as { ok?: number; failed?: number };
        alert(t("modules.employees.mehnat.importDone", { ok: r.ok ?? 0, failed: r.failed ?? 0 }));
      },
      onError: (err) => alert(String((err as Error)?.message ?? err)),
    }));

  const rows = data?.items ?? [];
  const allChecked = rows.length > 0 && rows.every((e) => picked.has(e.id));
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const onErr = (err: unknown) => alert(String((err as Error)?.message ?? err));

  return (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 border-b">
          {[["active", t("modules.employees.filter.active")], ["inactive", t("modules.employees.filter.inactive")], ["all", t("modules.employees.filter.all")]].map(([k, lbl]) => (
            <Button key={k} variant="ghost" onClick={() => setStatus(k)}
              className={`h-auto rounded-none px-3 py-2 text-sm border-b-2 -mb-px hover:bg-transparent ${status === k ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {lbl}{data && status === k ? <span className="ml-1.5 text-xs text-muted-foreground">{data.count}</span> : null}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {mehnatCreds ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 px-2.5 py-1 text-xs">
              <Link2 className="size-3.5" /> {t("modules.employees.mehnat.connected")}
              <Button variant="ghost" size="icon" onClick={() => { clearMehnatCreds(companyId); setMehnatCreds(null); }}
                title={t("modules.employees.mehnat.disconnect")} className="ml-0.5 size-auto p-0 text-emerald-700 hover:bg-transparent hover:text-emerald-900">
                <X className="size-3" />
              </Button>
            </span>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" onClick={() => { pendingMehnat.current = null; setMehnatOpen(true); }}
                  className="h-auto gap-1 rounded-full border border-border bg-muted text-muted-foreground px-2.5 py-1 text-xs hover:bg-accent hover:text-foreground">
                  <AlertCircle className="size-3.5 opacity-70" /> {t("modules.employees.tooltips.mehnatNotConfigured")}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("modules.employees.tooltips.mehnatNotConfiguredDetail")}</TooltipContent>
            </Tooltip>
          )}
          <div className="relative">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("modules.employees.placeholders.search")} className="pl-8 w-64" />
          </div>
          <Button variant="outline" onClick={() => setFiring(true)}>
            <UserX className="size-4 mr-1.5" /> {t("modules.employees.actions.dismiss")}
          </Button>
          <SettingsMenu companyId={companyId}
            onImportFromMehnat={runImportFromMehnat}
            onConnectMehnat={() => { pendingMehnat.current = null; setMehnatOpen(true); }} />
          <Button onClick={() => navigate("/employees/new")}><Plus className="size-4 mr-1.5" /> {t("modules.employees.actions.newEmployee")}</Button>
        </div>
      </div>

      {picked.size > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm">
          <span className="font-medium text-primary">{t("modules.employees.bulk.selected", { count: picked.size })}</span>
          <BulkScheduleButton companyId={companyId} ids={[...picked]} onDone={() => setPicked(new Set())} />
          <Button variant="default" size="sm"
            onClick={() => ensureMehnat((creds) => action.mutate(
              { companyId, path: "employees/bulk-push-to-mehnat",
                body: { employee_ids: [...picked], ...creds }, timeout: 300_000 },
              { onSuccess: (d) => {
                  const r = (d ?? {}) as { ok?: number; failed?: number };
                  alert(t("modules.employees.mehnat.bulkDone", { ok: r.ok ?? 0, failed: r.failed ?? 0 }));
                  setPicked(new Set());
                }, onError: onErr }))}>
            <Send className="size-4 mr-1.5" /> {t("modules.employees.actions.sendToMehnat")}
          </Button>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setPicked(new Set())}>{t("modules.employees.actions.cancel")}</Button>
        </div>
      )}
      {/* Header stays mounted; only the body transitions between loading → data → empty. */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table className={NC_TABLE}>
          <TableHeader><TableRow className="hover:bg-transparent">
            <TableHead className="w-8">
              <Checkbox checked={allChecked}
                onCheckedChange={() => setPicked(allChecked ? new Set() : new Set(rows.map((e) => e.id)))} />
            </TableHead>
            <TableHead>{t("modules.employees.columns.fio")}</TableHead><TableHead>{t("modules.employees.columns.position")}</TableHead>
            <TableHead>{t("modules.employees.columns.department")}</TableHead><TableHead>{t("modules.employees.columns.phone")}</TableHead>
            <TableHead>{t("modules.employees.columns.email")}</TableHead><TableHead>{t("modules.employees.columns.sync")}</TableHead><TableHead className="w-16" />
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              // Table-shaped skeleton mirroring the columns so the swap to real data is seamless.
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="size-4 rounded" /></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Skeleton className="size-8 rounded-full shrink-0" />
                      <div className="space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-2.5 w-16" /></div>
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-7 w-14 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Users className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.employees.empty.noEmployees")}</div>
                    {search.trim() && (
                      <Button variant="outline" size="sm" onClick={() => setSearchInput("")}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((e, i) => {
                const st = EMP_STATUS[e.status] ?? { labelKey: "", variant: "muted" as const };
                const stLabel = st.labelKey ? t(st.labelKey) : e.status;
                return (
                  <TableRow key={e.id}
                    className="cursor-pointer odd:bg-muted/30 hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    onClick={() => navigate(`/employees/${e.id}`)}>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <Checkbox checked={picked.has(e.id)} onCheckedChange={() => toggle(e.id)} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="size-8 rounded-full bg-primary/10 text-primary grid place-items-center text-xs font-semibold shrink-0">{initials(e)}</span>
                        <div>
                          <div className="font-medium leading-tight">{e.full_name}
                            {ageOf(e.birth_date) != null && <span className="ml-2 text-xs font-normal text-muted-foreground">{t("modules.employees.units.years", { count: ageOf(e.birth_date) as number })}</span>}</div>
                          <div className={`text-xs ${st.variant === "success" ? "text-success" : "text-muted-foreground"}`}>{stLabel}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{e.position ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.department ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{e.phone ?? "—"}</TableCell>
                    <TableCell className="text-xs">{e.email ?? "—"}</TableCell>
                    <TableCell><SyncBadges e={e} /></TableCell>
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex items-center gap-0.5">
                        <Button variant="ghost" size="icon" className="size-7" title={t("modules.employees.actions.edit")}
                          onClick={() => navigate(`/employees/${e.id}`)}><Pencil className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="size-7 text-destructive" title={t("modules.employees.actions.delete")}
                          onClick={() => { if (confirm(t("modules.employees.confirms.deleteEmployee", { name: e.full_name }))) del.mutate({ companyId, id: e.id }, { onError: onErr }); }}>
                          <Trash2 className="size-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <DismissModal companyId={companyId} open={firing} onClose={() => setFiring(false)} />
      <MehnatConnectDialog open={mehnatOpen} onOpenChange={setMehnatOpen}
        companyId={companyId} companyName={company?.name ?? ""} companyInn={company?.inn ?? ""}
        onConnected={onMehnatConnected} />
    </>
  );
}

function BulkScheduleButton({ companyId, ids, onDone }: { companyId: number; ids: number[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Clock className="size-4 mr-1.5" /> {t("modules.employees.actions.assignSchedule")}
      </Button>
      <BulkAssignDialog companyId={companyId} ids={ids} open={open}
        onClose={() => setOpen(false)} onDone={() => { setOpen(false); onDone(); }} />
    </>
  );
}

function BulkAssignDialog({ companyId, ids, open, onClose, onDone }: {
  companyId: number; ids: number[]; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const { data: schedules = [] } = useSchedules(companyId);
  const assign = useAssignSchedule();
  const [schedId, setSchedId] = useState("");
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (open) { setSchedId(""); setErr(null); setFrom(new Date().toISOString().slice(0, 10)); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("modules.employees.dialogs.bulkAssignTitle", { count: ids.length })}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <F label={t("modules.employees.fields.scheduleRequired")}>
            <Select value={schedId} onValueChange={setSchedId}>
              <SelectTrigger><SelectValue placeholder={t("modules.employees.placeholders.selectSchedule")} /></SelectTrigger>
              <SelectContent>
                {schedules.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name} ({s.work_start}–{s.work_end})</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <F label={t("modules.employees.fields.effectiveFromRequired")}><DatePicker value={from} onChange={(v) => setFrom(v)} /></F>
          {err && <div className="text-sm text-destructive">{err}</div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("modules.employees.actions.cancel")}</Button>
          <Button disabled={assign.isPending}
            onClick={() => {
              setErr(null);
              if (!schedId) { setErr(t("modules.employees.errors.selectSchedule")); return; }
              assign.mutate({ companyId, id: Number(schedId), employee_ids: ids, effective_from: from },
                { onSuccess: onDone, onError: (e) => setErr(String((e as Error)?.message ?? e)) });
            }}>
            {assign.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}{t("modules.employees.actions.assign")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 4-step hire wizard moved to /employees/new (hire-page.tsx).
// "Yangi xodim" button in the list above now navigates there instead of
// opening a Sheet.

// ── Dismiss modal (employee picker, date, comp-days, reason, comp-type/dept, order/contract)
function DismissModal({ companyId, open, onClose }: { companyId: number; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { data } = useEmployees(companyId, { status: "active" });
  const { data: departments = [] } = useDepartments(companyId);
  const dismiss = useDismissEmployee();
  const [empId, setEmpId] = useState<string>("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [compDays, setCompDays] = useState("");
  const [reason, setReason] = useState("");
  const [compType, setCompType] = useState("");
  const [compDept, setCompDept] = useState("");
  const [orderNo, setOrderNo] = useState("");
  const [orderDate, setOrderDate] = useState("");
  const [contractNo, setContractNo] = useState("");
  const [contractDate, setContractDate] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setEmpId(""); setDate(new Date().toISOString().slice(0, 10)); setCompDays(""); setReason(""); setCompType(""); setCompDept(""); setOrderNo(""); setOrderDate(""); setContractNo(""); setContractDate(""); setErr(null); }
  }, [open]);
  const employees = data?.items ?? [];
  const submit = () => {
    setErr(null);
    if (!empId) { setErr(t("modules.employees.errors.selectEmployee")); return; }
    if (!date) { setErr(t("modules.employees.errors.enterDismissDate")); return; }
    dismiss.mutate({
      companyId, id: Number(empId),
      body: {
        dismissal_date: date, reason: reason || undefined,
        compensation_days: compDays || undefined,
        compensation_dept_id: compDept ? Number(compDept) : null,
        compensation_type: compType || undefined,
        order_number: orderNo || undefined, order_date: orderDate || undefined,
        contract_number: contractNo || undefined, contract_date: contractDate || undefined,
      },
    }, { onSuccess: onClose, onError: (e) => setErr(String((e as Error)?.message ?? e)) });
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{t("modules.employees.dialogs.dismissTitle")}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <F label={t("modules.employees.fields.employeeRequired")}>
            <Select value={empId} onValueChange={setEmpId}>
              <SelectTrigger><SelectValue placeholder={t("modules.employees.placeholders.unselected")} /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={String(e.id)}>{e.full_name}</SelectItem>)}</SelectContent>
            </Select>
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label={t("modules.employees.fields.dismissDateRequired")}><DatePicker value={date} onChange={(v) => setDate(v)} /></F>
            <F label={t("modules.employees.fields.compensationDays")}><Input type="number" min={0} value={compDays} onChange={(e) => setCompDays(e.target.value)} /></F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label={t("modules.employees.fields.dismissReason")}><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("modules.employees.placeholders.onecBasis")} /></F>
            <F label={t("modules.employees.fields.compensationType")}><Input value={compType} onChange={(e) => setCompType(e.target.value)} /></F>
          </div>
          <F label={t("modules.employees.fields.compensationDept")}>
            <Select value={compDept || "none"} onValueChange={(v) => setCompDept(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder={t("modules.employees.placeholders.unselected")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t("modules.employees.placeholders.unselected")}</SelectItem>
                {departments.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label={t("modules.employees.fields.orderNumber")}><Input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} /></F>
            <F label={t("modules.employees.fields.orderDate")}><DatePicker value={orderDate} onChange={(v) => setOrderDate(v)} /></F>
            <F label={t("modules.employees.fields.contractNumber")}><Input value={contractNo} onChange={(e) => setContractNo(e.target.value)} /></F>
            <F label={t("modules.employees.fields.contractDate")}><DatePicker value={contractDate} onChange={(v) => setContractDate(v)} /></F>
          </div>
          {err && <div className="text-sm text-destructive">{err}</div>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("modules.employees.actions.cancel")}</Button>
          <Button onClick={submit} disabled={dismiss.isPending}>
            {dismiss.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}{t("modules.employees.actions.dismiss")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-1 block"><span className="text-xs text-muted-foreground">{label}</span>{children}</label>;
}

function DialogFooter({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-end gap-2 pt-2">{children}</div>;
}

function SyncBadges({ e }: { e: Employee }) {
  const oneC = e.exists_in_1c, mehnat = e.exists_in_mehnat;
  return (
    <div className="flex items-center gap-1">
      <Badge variant={oneC == null ? "muted" : oneC ? "success" : "warning"} className="text-[10px] px-1.5">
        1C{oneC === true ? " ✓" : oneC === false ? " ✗" : ""}
      </Badge>
      <Badge variant={mehnat ? "success" : "muted"} className="text-[10px] px-1.5 whitespace-nowrap">
        my.mehnat{mehnat ? " ✓" : ""}
      </Badge>
    </div>
  );
}

// ── Departments (parent + administration columns + form) ────────────────────
type DeptForm = { id?: number; name: string; parent_id: number | null; is_administration: boolean; default_debit_account: string };
const BLANK_DEPT: DeptForm = { name: "", parent_id: null, is_administration: false, default_debit_account: "" };

function DepartmentsView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useDepartments(companyId);
  const save = useSaveDepartment();
  const del = useDeleteDepartment();
  const [editing, setEditing] = useState<DeptForm | null>(null);
  const onErr = (e: unknown) => alert(String((e as Error)?.message ?? e));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditing(BLANK_DEPT)}><Plus className="size-4 mr-1.5" /> {t("modules.employees.actions.addDepartment")}</Button>
      </div>
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table className={NC_TABLE}>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>{t("modules.employees.columns.name")}</TableHead><TableHead>{t("modules.employees.columns.parentDept")}</TableHead>
              <TableHead className="text-right">{t("modules.employees.columns.employees")}</TableHead><TableHead>{t("modules.employees.columns.debitAccount")}</TableHead>
              <TableHead>{t("modules.employees.columns.administration")}</TableHead><TableHead>mehnat</TableHead><TableHead>1C</TableHead><TableHead className="w-16" />
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                    <TableCell><div className="flex items-center gap-2"><Skeleton className="size-4 rounded" /><Skeleton className="h-3.5 w-32" /></div></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-5 w-8 rounded-full ml-auto" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-14 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <Building2 className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.employees.empty.noDepartments")}</div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
              data.map((d, i) => (
                <TableRow key={d.id}
                  className="odd:bg-muted/30 hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <TableCell className="font-medium"><div className="flex items-center gap-2"><Building2 className="size-4 text-muted-foreground" />{d.name}</div></TableCell>
                  <TableCell className="text-muted-foreground">{d.parent_name ?? "—"}</TableCell>
                  <TableCell className="text-right"><Badge variant="muted">{d.employee_count}</Badge></TableCell>
                  <TableCell>{d.default_debit_account ? <Badge variant="info" className="font-mono text-[10px]">{d.default_debit_account}</Badge> : "—"}</TableCell>
                  <TableCell>{d.is_administration ? <Badge variant="info">{t("modules.employees.boolean.yes")}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell><Badge variant={d.exists_in_mehnat ? "success" : "muted"} className="text-[10px] whitespace-nowrap">my.mehnat{d.exists_in_mehnat ? " ✓" : ""}</Badge></TableCell>
                  <TableCell>{d.exists_in_1c != null ? <Badge variant={d.exists_in_1c ? "success" : "muted"} className="text-[10px]">1C{d.exists_in_1c ? " ✓" : ""}</Badge> : "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button variant="ghost" size="icon" className="size-8"
                        onClick={() => setEditing({ id: d.id, name: d.name, parent_id: d.parent_id ?? null, is_administration: !!d.is_administration, default_debit_account: d.default_debit_account ?? "" })}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="icon" className="size-8 text-destructive"
                        onClick={() => { if (confirm(t("modules.employees.confirms.deleteGeneric", { name: d.name }))) del.mutate({ companyId, id: d.id }, { onError: onErr }); }}><Trash2 className="size-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </div>

      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? t("modules.employees.dialogs.editDepartment") : t("modules.employees.actions.addDepartment")}</DialogTitle></DialogHeader>
          {editing && <div className="space-y-3">
            <F label={t("modules.employees.fields.nameRequired")}><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></F>
            <div className="grid grid-cols-2 gap-3 items-end">
              <F label={t("modules.employees.columns.parentDept")}>
                <Select value={editing.parent_id != null ? String(editing.parent_id) : "none"}
                  onValueChange={(v) => setEditing({ ...editing, parent_id: v === "none" ? null : Number(v) })}>
                  <SelectTrigger><SelectValue placeholder={t("modules.employees.placeholders.topLevel")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("modules.employees.placeholders.topLevel")}</SelectItem>
                    {data.filter((d) => d.id !== editing.id).map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
              <label className="flex items-center gap-2 text-sm pb-2">
                <Checkbox checked={editing.is_administration} onCheckedChange={(v) => setEditing({ ...editing, is_administration: Boolean(v) })} />
                {t("modules.employees.columns.administration")}
              </label>
            </div>
            <F label={t("modules.employees.fields.defaultDebitAccount")}><Input maxLength={10} placeholder="9420 / 2010 / 9410" value={editing.default_debit_account} onChange={(e) => setEditing({ ...editing, default_debit_account: e.target.value })} /></F>
          </div>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>{t("modules.employees.actions.cancel")}</Button>
            <Button disabled={save.isPending || !editing?.name.trim()}
              onClick={() => editing && save.mutate({ companyId, id: editing.id, body: { name: editing.name.trim(), parent_id: editing.parent_id, is_administration: editing.is_administration, default_debit_account: editing.default_debit_account || null } }, { onSuccess: () => setEditing(null), onError: onErr })}>
              {save.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}{t("modules.employees.actions.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
type SchedForm = { id?: number; name: string; work_start: string; work_end: string; workdays: number[]; check_in_floor: string; rate: string; is_default: boolean };
const BLANK_SCHED: SchedForm = { name: "", work_start: "09:00", work_end: "18:00", workdays: [1, 2, 3, 4, 5], check_in_floor: "", rate: "1", is_default: false };

function SchedulesView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const [stabRaw, setStabRaw] = useUrlState("stab", "schedules");
  const stab = stabRaw as "schedules" | "employees";
  const { data = [], isLoading } = useSchedules(companyId);
  const { data: assignments = [] } = useScheduleAssignments(companyId);
  const save = useSaveSchedule();
  const del = useDeleteSchedule();
  const [form, setForm] = useState<SchedForm>(BLANK_SCHED);
  const [assignId, setAssignId] = useState<number | null>(null);
  const toggleDay = (d: number) => setForm((f) => ({ ...f, workdays: f.workdays.includes(d) ? f.workdays.filter((x) => x !== d) : [...f.workdays, d].sort() }));
  const submit = () => {
    if (!form.name.trim()) return;
    const { id, rate, ...rest } = form;
    save.mutate({ companyId, id, body: { ...rest, rate: rate || undefined } }, { onSuccess: () => setForm(BLANK_SCHED) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b">
        {[["schedules", t("modules.employees.schedules.tabSchedules"), data.length], ["employees", t("modules.employees.schedules.tabEmployees"), assignments.length]].map(([k, lbl, n]) => (
          <Button key={k as string} variant="ghost" onClick={() => setStabRaw(k as string)}
            className={`h-auto rounded-none px-3 py-2 text-sm border-b-2 -mb-px hover:bg-transparent ${stab === k ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {lbl as string} <span className="ml-1 text-xs text-muted-foreground">{n as number}</span>
          </Button>
        ))}
      </div>

      {stab === "schedules" && (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="rounded-lg border p-4 space-y-3 h-fit">
            <div className="font-medium flex items-center gap-2"><Clock className="size-4" /> {form.id ? t("modules.employees.schedules.editTitle") : t("modules.employees.schedules.newTitle")}</div>
            <F label={t("modules.employees.columns.name")}><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder={t("modules.employees.schedules.namePlaceholder")} /></F>
            <div className="grid grid-cols-2 gap-2">
              <F label={t("modules.employees.schedules.workStart")}><Input type="time" value={form.work_start} onChange={(e) => setForm((f) => ({ ...f, work_start: e.target.value }))} /></F>
              <F label={t("modules.employees.schedules.workEnd")}><Input type="time" value={form.work_end} onChange={(e) => setForm((f) => ({ ...f, work_end: e.target.value }))} /></F>
              <F label={t("modules.employees.schedules.rate")}><Input type="number" step="0.25" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} /></F>
              <F label={t("modules.employees.schedules.checkInFloor")}><Input type="time" value={form.check_in_floor} onChange={(e) => setForm((f) => ({ ...f, check_in_floor: e.target.value }))} /></F>
            </div>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">{t("modules.employees.schedules.workdays")}</span>
              <div className="flex gap-1">
                {ALL_DAYS.map((d) => (
                  <Button key={d} type="button" variant="outline" size="icon" onClick={() => toggleDay(d)}
                    className={`size-8 rounded-md text-xs font-medium ${form.workdays.includes(d) ? "bg-primary text-primary-foreground border-primary hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"}`}>
                    {t(WEEKDAY_LABELS[d])}
                  </Button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.is_default} onCheckedChange={(v) => setForm((f) => ({ ...f, is_default: Boolean(v) }))} />
              {t("modules.employees.schedules.defaultForCompany")}
            </label>
            <div className="flex gap-2 pt-1">
              <Button onClick={submit} disabled={save.isPending || !form.name.trim()}>{t("modules.employees.actions.save")}</Button>
              {form.id && <Button variant="ghost" onClick={() => setForm(BLANK_SCHED)}>{t("modules.employees.actions.new")}</Button>}
            </div>
          </div>

          <div>
            <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <Table className={NC_TABLE}>
                  <TableHeader><TableRow className="hover:bg-transparent">
                    <TableHead>{t("modules.employees.columns.name")}</TableHead><TableHead>{t("modules.employees.schedules.workHours")}</TableHead><TableHead>{t("modules.employees.schedules.workdays")}</TableHead>
                    <TableHead className="text-right">{t("modules.employees.schedules.rate")}</TableHead><TableHead>{t("modules.employees.schedules.floor")}</TableHead>
                    <TableHead className="text-right">{t("modules.employees.columns.employee")}</TableHead><TableHead>1C</TableHead><TableHead className="w-24" />
                  </TableRow></TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                          <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                          <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-3.5 w-8 ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-3.5 w-12" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-5 w-8 rounded-full ml-auto" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-12 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-7 w-20 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : data.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={8} className="py-16">
                          <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                            <div className="size-14 rounded-full bg-muted grid place-items-center">
                              <Clock className="size-7 text-muted-foreground" />
                            </div>
                            <div className="text-sm font-medium text-foreground">{t("modules.employees.empty.noSchedules")}</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                    data.map((s, i) => (
                      <TableRow key={s.id}
                        className="odd:bg-muted/30 hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                        style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                        <TableCell className="font-medium">{s.name}{s.is_default && <Badge variant="info" className="ml-2 text-[10px]">{t("modules.employees.badges.primary")}</Badge>}</TableCell>
                        <TableCell className="font-mono text-xs">{s.work_start}–{s.work_end}</TableCell>
                        <TableCell className="text-xs">{s.workdays.map((d) => t(WEEKDAY_LABELS[d])).join(" ")}</TableCell>
                        <TableCell className="text-right">{s.rate ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{s.check_in_floor ?? "—"}</TableCell>
                        <TableCell className="text-right"><Badge variant="muted">{s.employee_count ?? 0}</Badge></TableCell>
                        <TableCell>{s.exists_in_1c != null ? <Badge variant={s.exists_in_1c ? "success" : "muted"} className="text-[10px]">1C{s.exists_in_1c ? " ✓" : ""}</Badge> : "—"}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-0.5">
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => setAssignId(s.id)}>{t("modules.employees.actions.assign")}</Button>
                            <Button variant="ghost" size="icon" className="size-7" onClick={() => setForm({ id: s.id, name: s.name, work_start: s.work_start, work_end: s.work_end, workdays: s.workdays, check_in_floor: s.check_in_floor ?? "", rate: s.rate != null ? String(s.rate) : "1", is_default: !!s.is_default })}><Pencil className="size-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="size-7 text-destructive"
                              onClick={() => { if (confirm(t("modules.employees.confirms.deleteGeneric", { name: s.name }))) del.mutate({ companyId, id: s.id }); }}><Trash2 className="size-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )))}
                  </TableBody>
                </Table>
              </div>
          </div>
        </div>
      )}

      {stab === "employees" && (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <Table className={NC_TABLE}>
            <TableHeader><TableRow className="hover:bg-transparent">
              <TableHead>{t("modules.employees.columns.employee")}</TableHead><TableHead>{t("modules.employees.schedules.workSchedule")}</TableHead>
              <TableHead>{t("modules.employees.schedules.effectiveDate")}</TableHead><TableHead>{t("modules.employees.columns.status")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {assignments.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={4} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <Users className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.employees.empty.noEmployeesFound")}</div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
              assignments.map((a, i) => (
                <TableRow key={a.employee_id}
                  className="odd:bg-muted/30 hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <TableCell className="font-medium">{a.full_name}</TableCell>
                  <TableCell>{a.schedule_name ?? "—"}{a.work_start ? <span className="text-xs text-muted-foreground"> · {a.work_start}–{a.work_end}</span> : null}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(a.effective_from)}</TableCell>
                  <TableCell>{a.is_default ? <Badge variant="muted">{t("modules.employees.badges.primaryDefault")}</Badge> : <Badge variant="info">{t("modules.employees.badges.assigned")}</Badge>}</TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </div>
      )}

      <AssignDialog companyId={companyId} schedId={assignId} onClose={() => setAssignId(null)} />
    </div>
  );
}

function AssignDialog({ companyId, schedId, onClose }: { companyId: number; schedId: number | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data } = useEmployees(companyId, { status: "active" });
  const assign = useAssignSchedule();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setPicked(new Set()); setErr(null); setFrom(new Date().toISOString().slice(0, 10)); }, [schedId]);
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  return (
    <Dialog open={!!schedId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("modules.employees.dialogs.assignToSchedule")}</DialogTitle></DialogHeader>
        <F label={t("modules.employees.fields.effectiveFromRequired")}><DatePicker value={from} onChange={(v) => setFrom(v)} /></F>
        <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
          {(data?.items ?? []).map((e) => (
            <label key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent">
              <Checkbox checked={picked.has(e.id)} onCheckedChange={() => toggle(e.id)} />
              <span className="font-medium">{e.full_name}</span>
              <span className="text-muted-foreground">{e.position ?? ""}</span>
            </label>
          ))}
        </div>
        {err && <div className="text-sm text-destructive">{err}</div>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("modules.employees.actions.cancel")}</Button>
          <Button disabled={assign.isPending || picked.size === 0}
            onClick={() => schedId && assign.mutate({ companyId, id: schedId, employee_ids: [...picked], effective_from: from },
              { onSuccess: onClose, onError: (e) => setErr(String((e as Error)?.message ?? e)) })}>
            {assign.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}{t("modules.employees.actions.assignCount", { count: picked.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
