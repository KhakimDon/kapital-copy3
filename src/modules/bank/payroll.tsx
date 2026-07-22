import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlNumber } from "@/shared/hooks/use-url-state";
import {
  ReceiptText, Plus, ChevronLeft, ChevronRight, Coins, Clock, Landmark,
  CheckCircle2, AlertTriangle, Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  usePayrolls, usePayrollAccounts, usePayrollEmployees, useCreatePayroll,
  empCode, empName, type Payroll, type PayrollAccount, type CreatePayrollEmployee,
} from "./payroll-api";

const money = (v?: string | number | null) =>
  v == null || v === "" ? "0" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");
const isDone = (state?: string | null) => {
  const s = (state ?? "").toLowerCase();
  return s === "completed" || s === "done";
};
const stateVariant = (state?: string | null) =>
  isDone(state) ? "success" : state ? "warning" : "muted";

export function PayrollView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const [page, setPage] = useUrlNumber("ppage", 1);
  const [pageSize, setPageSize] = useUrlNumber("psize", 20);
  const [createOpen, setCreateOpen] = useState(false);
  const { data, isLoading } = usePayrolls(companyId, page, pageSize);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  // Summary across the loaded page (matches the cloud's per-page reduction).
  const { totalAmount, pending } = useMemo(() => {
    let amt = 0, pend = 0;
    for (const it of items) {
      amt += (Number(it.amount) || 0) / 100;
      if (!isDone(it.state)) pend++;
    }
    return { totalAmount: amt, pending: pend };
  }, [items]);

  if (data?.no_kapitalbank) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <Landmark className="size-10 mx-auto text-muted-foreground/60" />
        <div className="mt-3 text-lg font-medium">{t("modules.bank.payroll.kapitalNeeded.title")}</div>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          {t("modules.bank.payroll.kapitalNeeded.desc")}
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ReceiptText className="size-5" /> {t("modules.bank.payroll.title")}
        </h2>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" /> {t("modules.bank.payroll.createBtn")}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard
          label={t("modules.bank.payroll.summary.total")} value={String(total)}
          icon={<ReceiptText className="size-4" />}
        />
        <SummaryCard
          label={t("modules.bank.payroll.summary.totalAmount")} value={money(totalAmount)}
          icon={<Coins className="size-4" />}
        />
        <SummaryCard
          label={t("modules.bank.payroll.summary.pending")} value={String(pending)} accent={pending > 0}
          icon={<Clock className="size-4" />}
        />
      </div>

      <>
          <div className="rounded-lg border border-border bg-card overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.payroll.cols.name")}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.payroll.cols.description")}</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.payroll.cols.amount")}</TableHead>
                <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.payroll.cols.employees")}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.payroll.cols.status")}</TableHead>
                <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.bank.payroll.cols.date")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                      <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-3.5 w-8 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="py-16">
                      <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                        <div className="size-14 rounded-full bg-muted grid place-items-center">
                          <ReceiptText className="size-7 text-muted-foreground" />
                        </div>
                        <div className="text-sm font-medium text-foreground">{t("modules.bank.payroll.empty")}</div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((p: Payroll, i) => (
                    <TableRow key={i} className="hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300" style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                      <TableCell className="font-medium">{p.salaryName || "—"}</TableCell>
                      <TableCell className="max-w-[250px] truncate text-xs text-muted-foreground">{p.salaryDesc || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">{money((Number(p.amount) || 0) / 100)}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.totalEmpl ?? 0}</TableCell>
                      <TableCell><Badge variant={stateVariant(p.state)}>{p.stateName || p.state || "—"}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap">{fmtDate(p.operationDate)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {total > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></Button>
              <span className="text-muted-foreground">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></Button>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-24 h-8 ml-2"><SelectValue /></SelectTrigger>
                <SelectContent>{[20, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{t("modules.bank.pagination.perPage", { n })}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
        </>

      <CreatePayrollSheet companyId={companyId} open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}

function SummaryCard({ label, value, icon, accent }: { label: string; value: string; icon: React.ReactNode; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-warning/40 bg-warning/15" : "border-border bg-card"}`}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">{icon} {label}</div>
      <div className="text-xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}

type EmpState = { code: string; name: string; checked: boolean; amount: string };

function CreatePayrollSheet({ companyId, open, onClose }: { companyId: number; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: accounts, isLoading: accLoading } = usePayrollAccounts(companyId, open);
  const { data: employees, isLoading: empLoading } = usePayrollEmployees(companyId, open);
  const create = useCreatePayroll(companyId);

  const [sender, setSender] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<Record<string, EmpState>>({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ name: string; total: number; count: number } | null>(null);

  // Build editable rows whenever the employees list changes; merge per-row edits.
  const empRows = useMemo<EmpState[]>(() => {
    return (employees ?? []).map((e) => {
      const code = empCode(e);
      const existing = rows[code];
      return existing ?? { code, name: empName(e), checked: false, amount: "" };
    });
  }, [employees, rows]);

  const setRow = (code: string, patch: Partial<EmpState>) =>
    setRows((prev) => {
      const base = prev[code] ?? empRows.find((r) => r.code === code) ?? { code, name: "", checked: false, amount: "" };
      return { ...prev, [code]: { ...base, ...patch } };
    });

  const reset = () => {
    setSender(""); setDescription(""); setRows({}); setError(""); setSuccess(null);
    create.reset();
  };

  const handleClose = () => { reset(); onClose(); };

  const selected = empRows.filter((r) => r.checked);
  const selectedTotal = selected.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const submit = () => {
    setError("");
    if (!sender) { setError(t("modules.bank.payroll.errors.pickSender")); return; }
    if (selected.length === 0) { setError(t("modules.bank.payroll.errors.pickEmployee")); return; }
    for (const r of selected) {
      const amt = Number(r.amount);
      if (!amt || amt <= 0) { setError(t("modules.bank.payroll.errors.enterAmount")); return; }
    }
    if (!description.trim()) { setError(t("modules.bank.payroll.errors.enterDescription")); return; }

    const payload: CreatePayrollEmployee[] = selected.map((r) => ({ employeeCode: r.code, amount: Number(r.amount) }));
    const total = selectedTotal;
    const count = selected.length;
    create.mutate(
      { senderAccountNumber: sender, description: description.trim(), employees: payload },
      {
        onSuccess: (data) => {
          const name = (data?.data?.salaryName ?? data?.salaryName ?? data?.name) || t("modules.bank.payroll.defaultName");
          setSuccess({ name: String(name), total, count });
        },
        onError: (e: unknown) => {
          const err = e as { response?: { data?: { detail?: string } }; message?: string };
          setError(err?.response?.data?.detail || err?.message || t("modules.bank.payroll.errors.generic"));
        },
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader><SheetTitle>{t("modules.bank.payroll.createSheet.title")}</SheetTitle></SheetHeader>

        {success ? (
          <div className="mt-6 space-y-4 text-center">
            <CheckCircle2 className="size-12 mx-auto text-success" />
            <div className="text-lg font-semibold">{success.name}</div>
            <div className="rounded-lg border border-border bg-card p-4 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("modules.bank.payroll.createSheet.totalAmount")}</span><span className="tabular-nums font-medium">{money(success.total)} UZS</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("modules.bank.payroll.createSheet.employees")}</span><span className="tabular-nums font-medium">{success.count}</span></div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleClose}>{t("modules.bank.payroll.createSheet.backToList")}</Button>
              <Button className="flex-1" onClick={reset}>{t("modules.bank.payroll.createSheet.createMore")}</Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {/* Sender account */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("modules.bank.payroll.createSheet.senderAccount")}</label>
              <Select value={sender} onValueChange={setSender} disabled={accLoading}>
                <SelectTrigger><SelectValue placeholder={accLoading ? t("modules.bank.actions.loading") : t("modules.bank.payroll.createSheet.pickAccount")} /></SelectTrigger>
                <SelectContent>
                  {(accounts ?? []).map((a: PayrollAccount) => (
                    <SelectItem key={a.id} value={a.number}>
                      {a.number} ({money((Number(a.current_balance) || 0) / 100)} UZS)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!accLoading && (accounts?.length ?? 0) === 0 && (
                <p className="text-xs text-muted-foreground">{t("modules.bank.payroll.createSheet.noKapitalAccount")}</p>
              )}
            </div>

            {/* Employees checklist */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Users className="size-4" /> {t("modules.bank.payroll.createSheet.employees")}
                {selected.length > 0 && <span className="text-xs text-muted-foreground">({t("modules.bank.payroll.createSheet.selectedCount", { count: selected.length })})</span>}
              </label>
              <div className="rounded-lg border border-border bg-card divide-y divide-border max-h-64 overflow-y-auto">
                <Reveal
                  loading={empLoading}
                  skeleton={<div className="p-3 space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>}
                >
                {empRows.length === 0 ? (
                  <div className="p-4 text-center text-sm text-muted-foreground">{t("modules.bank.payroll.createSheet.noEmployees")}</div>
                ) : (
                  empRows.map((r) => (
                    <div key={r.code} className="flex items-center gap-2 px-3 py-2">
                      <Checkbox
                        className="shrink-0"
                        checked={r.checked}
                        onCheckedChange={(v) => setRow(r.code, { checked: Boolean(v) })}
                      />
                      <span className="flex-1 text-sm truncate">{r.name}</span>
                      <Input
                        type="number" min={1} placeholder={t("modules.bank.payroll.createSheet.amountPlaceholder")}
                        className="w-32 h-8"
                        value={r.amount}
                        disabled={!r.checked}
                        onChange={(e) => setRow(r.code, { amount: e.target.value })}
                      />
                    </div>
                  ))
                )}
                </Reveal>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("modules.bank.payroll.createSheet.description")}</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("modules.bank.payroll.createSheet.descriptionPlaceholder")}
              />
            </div>

            {/* Running total */}
            {selected.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm">
                <span className="text-muted-foreground">{t("modules.bank.payroll.createSheet.totalLabel", { count: selected.length })}</span>
                <span className="tabular-nums font-semibold">{money(selectedTotal)} UZS</span>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={handleClose}>{t("modules.bank.actions.cancel")}</Button>
              <Button className="flex-1" onClick={submit} disabled={create.isPending}>
                {create.isPending ? t("modules.bank.payroll.createSheet.creating") : t("modules.bank.payroll.createBtn")}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
