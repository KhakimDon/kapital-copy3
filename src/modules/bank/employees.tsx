import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlState, useUrlNumber } from "@/shared/hooks/use-url-state";
import {
  Users, UserCheck, Clock, Plus, Pencil, Trash2, CreditCard, CheckCircle2, AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useEmployees, useSalaryApplications, useAddEmployee, useChangeCard, useDeleteEmployee,
  empState, isActive, isPending, errDetail,
  type Employee, type SalaryApp,
} from "./employees-api";

type Tab = "all" | "apps";

const PAGE_SIZE = 20;

function StatusBadge({ state }: { state: string }) {
  if (!state) return <span className="text-muted-foreground">—</span>;
  if (isActive(state)) return <Badge variant="success">{state}</Badge>;
  if (isPending(state)) return <Badge variant="warning">{state}</Badge>;
  return <Badge variant="muted">{state}</Badge>;
}

export function EmployeesView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const [tabRaw, setTabRaw] = useUrlState("etab", "all");
  const tab = tabRaw as Tab;
  const [page, setPage] = useUrlNumber("epage", 0);

  // Transient success notice ("So'rov yuborildi…")
  const [notice, setNotice] = useState(false);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(false), 6000);
    return () => clearTimeout(id);
  }, [notice]);

  // Modals
  const [addOpen, setAddOpen] = useState(false);
  const [changeEmp, setChangeEmp] = useState<Employee | null>(null);
  const [deleteEmp, setDeleteEmp] = useState<Employee | null>(null);

  const empQ = useEmployees(companyId, page + 1, PAGE_SIZE, tab === "all");
  const appsQ = useSalaryApplications(companyId, tab === "apps");

  const noKapital = empQ.data?.no_kapitalbank === true;
  const employees = empQ.data?.items ?? [];

  const summary = useMemo(() => {
    let active = 0;
    let pending = 0;
    for (const e of employees) {
      const s = empState(e);
      if (isActive(s)) active++;
      if (isPending(s)) pending++;
    }
    return { total: employees.length, active, pending };
  }, [employees]);

  const onSuccess = () => {
    setNotice(true);
    setAddOpen(false);
    setChangeEmp(null);
    setDeleteEmp(null);
    setTimeout(() => {
      if (tab === "all") empQ.refetch();
      else appsQ.refetch();
    }, 1000);
  };

  // Kapitalbank not connected → hint card instead of the table.
  if (tab === "all" && noKapital) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center space-y-3">
        <CreditCard className="size-10 mx-auto text-muted-foreground" />
        <div className="text-lg font-semibold">{t("modules.bank.employees.kapitalNeeded.title")}</div>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          {t("modules.bank.employees.kapitalNeeded.hintPre")}{" "}
          <span className="font-medium text-foreground">{t("modules.bank.employees.kapitalNeeded.paymentsSection")}</span> {t("modules.bank.employees.kapitalNeeded.hintPost")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success/15 px-3 py-2 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          {t("modules.bank.employees.notice.sent")}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {([
          [t("modules.bank.employees.summary.total"), summary.total, <Users className="size-4" key="t" />, false],
          [t("modules.bank.employees.summary.activeCards"), summary.active, <UserCheck className="size-4" key="a" />, false],
          [t("modules.bank.employees.summary.pending"), summary.pending, <Clock className="size-4" key="p" />, true],
        ] as [string, number, React.ReactNode, boolean][]).map(([k, v, icon, accent]) => (
          <div key={k} className={`rounded-lg border p-3 ${accent && v > 0 ? "border-warning/40 bg-warning/15" : "border-border bg-card"}`}>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">{icon} {k}</div>
            <div className="text-xl font-semibold tabular-nums mt-1">{v}</div>
          </div>
        ))}
      </div>

      {/* Tabs + add button */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 border-b border-border flex-wrap">
          {([["all", t("modules.bank.employees.tabs.all")], ["apps", t("modules.bank.employees.tabs.apps")]] as [Tab, string][]).map(([k, lbl]) => (
            <Button key={k} variant="ghost" onClick={() => { setTabRaw(k); setPage(0); }}
              className={`h-auto rounded-none px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors hover:bg-transparent ${tab === k ? "border-primary text-primary hover:text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {lbl}
            </Button>
          ))}
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="size-4 mr-1" /> {t("modules.bank.employees.addBtn")}
        </Button>
      </div>

      {tab === "all" ? (
        <EmployeesTable
          loading={empQ.isLoading}
          items={employees}
          onChange={setChangeEmp}
          onDelete={setDeleteEmp}
        />
      ) : (
        <ApplicationsTable loading={appsQ.isLoading} items={appsQ.data?.items ?? []} />
      )}

      <AddModal companyId={companyId} open={addOpen} onClose={() => setAddOpen(false)} onSuccess={onSuccess} />
      <ChangeCardModal companyId={companyId} emp={changeEmp} onClose={() => setChangeEmp(null)} onSuccess={onSuccess} />
      <DeleteModal companyId={companyId} emp={deleteEmp} onClose={() => setDeleteEmp(null)} onSuccess={onSuccess} />
    </div>
  );
}

function EmployeesTable({
  loading, items, onChange, onDelete,
}: {
  loading: boolean; items: Employee[];
  onChange: (e: Employee) => void; onDelete: (e: Employee) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.employees.cols.code")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.employees.cols.fio")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.employees.cols.card")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.employees.cols.status")}</TableHead>
          <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.employees.cols.actions")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                <TableCell><Skeleton className="h-3.5 w-12" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-8 w-20 rounded-md ml-auto" /></TableCell>
              </TableRow>
            ))
          ) : items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-16">
                <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                  <div className="size-14 rounded-full bg-muted grid place-items-center">
                    <Users className="size-7 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-medium text-foreground">{t("modules.bank.employees.empty")}</div>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            items.map((e, i) => (
              <TableRow key={e.employeeCode || i} className="hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                <TableCell className="tabular-nums text-xs">{e.employeeCode || "—"}</TableCell>
                <TableCell className="font-medium">{e.fio || "—"}</TableCell>
                <TableCell className="tabular-nums text-sm">{e.maskedCard || "—"}</TableCell>
                <TableCell><StatusBadge state={empState(e)} /></TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button variant="outline" size="icon" className="h-8 w-8" title={t("modules.bank.employees.actions.changeCard")} onClick={() => onChange(e)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-8 w-8 ml-1.5 text-destructive hover:text-destructive" title={t("modules.bank.employees.actions.delete")} onClick={() => onDelete(e)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ApplicationsTable({ loading, items }: { loading: boolean; items: SalaryApp[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-card overflow-x-auto">
      <Table>
        <TableHeader><TableRow>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.employees.apps.id")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.employees.apps.description")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.employees.apps.status")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.employees.apps.created")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                <TableCell><Skeleton className="h-3.5 w-10" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-48" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
              </TableRow>
            ))
          ) : items.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={4} className="py-16">
                <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                  <div className="size-14 rounded-full bg-muted grid place-items-center">
                    <Clock className="size-7 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-medium text-foreground">{t("modules.bank.employees.apps.empty")}</div>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            items.map((a, i) => (
              <TableRow key={String(a.id ?? i)} className="hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                <TableCell className="tabular-nums text-xs">{a.id ?? "—"}</TableCell>
                <TableCell>{a.subtopicDescription || "—"}</TableCell>
                <TableCell>{a.stateDescription ? <Badge variant="muted">{a.stateDescription}</Badge> : "—"}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{a.createdAt || "—"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" /> {msg}
    </div>
  );
}

function AddModal({
  companyId, open, onClose, onSuccess,
}: {
  companyId: number; open: boolean; onClose: () => void; onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [fullName, setFullName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [pinfl, setPinfl] = useState("");
  const [err, setErr] = useState("");
  const mut = useAddEmployee(companyId);

  useEffect(() => {
    if (open) { setFullName(""); setCardNumber(""); setPinfl(""); setErr(""); }
  }, [open]);

  const submit = () => {
    setErr("");
    if (!fullName.trim() || !cardNumber.trim() || !pinfl.trim()) {
      setErr(t("modules.bank.employees.errors.fillAll"));
      return;
    }
    mut.mutate(
      { fullName: fullName.trim(), cardNumber: cardNumber.trim(), pinflOrPassport: pinfl.trim() },
      { onSuccess, onError: (e) => setErr(errDetail(e)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("modules.bank.employees.addModal.title")}</DialogTitle>
          <DialogDescription>{t("modules.bank.employees.addModal.desc")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("modules.bank.employees.fields.fio")}</label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={t("modules.bank.employees.placeholders.fio")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("modules.bank.employees.fields.cardNumber")}</label>
            <Input value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} maxLength={16} inputMode="numeric" placeholder="8600 ХХХХ ХХХХ ХХХХ" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("modules.bank.employees.fields.innOrPassport")}</label>
            <Input value={pinfl} onChange={(e) => setPinfl(e.target.value)} placeholder={t("modules.bank.employees.placeholders.pinfl")} />
          </div>
          <FormError msg={err} />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>{t("modules.bank.actions.cancel")}</Button>
          <Button onClick={submit} disabled={mut.isPending}>{mut.isPending ? t("modules.bank.actions.sending") : t("modules.bank.actions.add")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ChangeCardModal({
  companyId, emp, onClose, onSuccess,
}: {
  companyId: number; emp: Employee | null; onClose: () => void; onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [card, setCard] = useState("");
  const [err, setErr] = useState("");
  const mut = useChangeCard(companyId);

  useEffect(() => {
    if (emp) { setCard(""); setErr(""); }
  }, [emp]);

  const submit = () => {
    setErr("");
    if (!emp?.employeeCode) return;
    if (!card.trim()) { setErr(t("modules.bank.employees.errors.enterNewCard")); return; }
    mut.mutate(
      { employeeCode: emp.employeeCode, newCardNumber: card.trim() },
      { onSuccess, onError: (e) => setErr(errDetail(e)) },
    );
  };

  return (
    <Dialog open={!!emp} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("modules.bank.employees.changeCardModal.title")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("modules.bank.employees.fields.employee")}</label>
            <Input value={emp?.fio || ""} readOnly disabled />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("modules.bank.employees.fields.newCard")}</label>
            <Input value={card} onChange={(e) => setCard(e.target.value)} maxLength={16} inputMode="numeric" placeholder="8600 ХХХХ ХХХХ ХХХХ" />
          </div>
          <FormError msg={err} />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>{t("modules.bank.actions.cancel")}</Button>
          <Button onClick={submit} disabled={mut.isPending}>{mut.isPending ? t("modules.bank.actions.sending") : t("modules.bank.actions.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DeleteModal({
  companyId, emp, onClose, onSuccess,
}: {
  companyId: number; emp: Employee | null; onClose: () => void; onSuccess: () => void;
}) {
  const { t } = useTranslation();
  const [err, setErr] = useState("");
  const mut = useDeleteEmployee(companyId);

  useEffect(() => {
    if (emp) setErr("");
  }, [emp]);

  const submit = () => {
    setErr("");
    if (!emp?.employeeCode) return;
    mut.mutate(
      { employeeCode: emp.employeeCode },
      { onSuccess, onError: (e) => setErr(errDetail(e)) },
    );
  };

  return (
    <Dialog open={!!emp} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("modules.bank.employees.deleteModal.title")}</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{emp?.fio || ""}</span> {t("modules.bank.employees.deleteModal.confirm")}
          </DialogDescription>
        </DialogHeader>
        <FormError msg={err} />
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={mut.isPending}>{t("modules.bank.actions.cancel")}</Button>
          <Button variant="destructive" onClick={submit} disabled={mut.isPending}>{mut.isPending ? t("modules.bank.actions.deleting") : t("modules.bank.actions.delete")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
