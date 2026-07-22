import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, RefreshCw, Plus, Pencil, Trash2, Loader2, Users, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/reveal";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useEmployees } from "@/modules/employees/api";
import { useMyCompanies } from "@/shared/companies";
import {
  useRotation, useManualRotations, useSaveManualRotation, useDeleteManualRotation,
} from "./api";
import type { ManualRotationRow } from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function RotationView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const MONTHS = useMemo(() => [
    t("modules.attendance.months.janShort"), t("modules.attendance.months.febShort"), t("modules.attendance.months.marShort"),
    t("modules.attendance.months.aprShort"), t("modules.attendance.months.may"), t("modules.attendance.months.junShort"),
    t("modules.attendance.months.julShort"), t("modules.attendance.months.augShort"), t("modules.attendance.months.sepShort"),
    t("modules.attendance.months.octShort"), t("modules.attendance.months.novShort"), t("modules.attendance.months.decShort"),
  ], [t]);
  const [day, setDay] = useState(new Date());
  const { data, isLoading, isFetching, refetch } = useRotation(companyId, iso(day));
  const manual = useManualRotations(companyId);
  const [edit, setEdit] = useState<ManualRotationRow | null | "new">(null);
  const del = useDeleteManualRotation();
  const nav = (d: number) => { const n = new Date(day); n.setDate(day.getDate() + d); setDay(n); };

  return (
    <div className="space-y-6">
      {/* Live rotation (today's terminal vs home company) */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => nav(-1)}><ChevronLeft className="size-4" /></Button>
            <span className="font-medium w-36 text-center text-sm">{day.getDate()} {MONTHS[day.getMonth()]} {day.getFullYear()}</span>
            <Button variant="outline" size="sm" onClick={() => nav(1)}><ChevronRight className="size-4" /></Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => { refetch(); manual.refetch(); }}>
            <RefreshCw className={`size-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} /> {t("modules.attendance.refresh")}
          </Button>
          {data && (
            <FadeIn className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{t("modules.attendance.rotation.rotated")}: <b className="text-foreground">{data.rotated}</b></span>
              <span className="text-muted-foreground">{t("modules.attendance.status.absent")}: <b className="text-foreground">{data.absent}</b></span>
            </FadeIn>
          )}
        </div>

        {/* Header stays mounted; only the body transitions between loading → data → empty. */}
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.columns.employee")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.rotation.cols.position")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.rotation.cols.todayTerminal")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.rotation.cols.time")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.rotation.cols.status")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                    <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-14" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  </TableRow>
                ))
              ) : (data?.employees.length ?? 0) === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <Users className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.attendance.noEmployees")}</div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data?.employees.map((r, i) => (
                  <TableRow key={r.id}
                    className={`animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300 ${r.rotated ? "bg-warning/10 hover:bg-warning/15" : "hover:bg-muted/60"}`}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.position ?? "—"}</TableCell>
                    <TableCell>{r.today_terminal ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">{r.last_event_time ?? "—"}</TableCell>
                    <TableCell>
                      {r.absent ? <Badge variant="danger">{t("modules.attendance.status.absent")}</Badge>
                        : r.rotated ? <Badge variant="warning">{t("modules.attendance.rotation.statusRotated")}</Badge>
                        : <Badge variant="success">{t("modules.attendance.rotation.statusHome")}</Badge>}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Manual rotation records (Назначенные ротации) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">{t("modules.attendance.rotation.assignedTitle")}</h3>
          <Button size="sm" onClick={() => setEdit("new")}><Plus className="size-4 mr-1.5" /> {t("modules.attendance.rotation.create")}</Button>
        </div>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.columns.employee")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.rotation.cols.fromBranch")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.rotation.cols.toBranch")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.rotation.cols.startDate")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.rotation.cols.endDate")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.rotation.cols.note")}</TableHead>
              <TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {manual.isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                    <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-7 w-16 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : (manual.data?.rotations.length ?? 0) === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <RotateCw className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">{t("modules.attendance.rotation.noRecords")}</div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                (manual.data?.rotations ?? []).map((r, i) => (
                  <TableRow key={r.id}
                    className="hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                    <TableCell className="font-medium">{r.employee_name ?? `ID ${r.employee_id}`}</TableCell>
                    <TableCell className="text-muted-foreground">{r.from_company_name ?? `ID ${r.from_company_id}`}</TableCell>
                    <TableCell>{r.to_company_name ?? `ID ${r.to_company_id}`}</TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">{r.start_date}</TableCell>
                    <TableCell className="font-mono text-xs tabular-nums">{r.end_date ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">{r.note ?? "—"}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" onClick={() => setEdit(r)}><Pencil className="size-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-destructive"
                        disabled={del.isPending}
                        onClick={() => { if (confirm(t("modules.attendance.rotation.confirmDelete"))) del.mutate({ companyId, id: r.id }); }}>
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <RotationModal
        companyId={companyId}
        record={edit === "new" ? null : edit}
        open={edit !== null}
        onClose={() => setEdit(null)}
      />
    </div>
  );
}

function RotationModal({ companyId, record, open, onClose }: {
  companyId: number; record: ManualRotationRow | null; open: boolean; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [employeeId, setEmployeeId] = useState("");
  const [toCompanyId, setToCompanyId] = useState("");
  const [startDate, setStartDate] = useState(iso(new Date()));
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const save = useSaveManualRotation();
  const emps = useEmployees(companyId, { status: "active" });
  const companies = useMyCompanies();

  useEffect(() => {
    if (!open) return;
    setErr("");
    if (record) {
      setEmployeeId(String(record.employee_id));
      setToCompanyId(String(record.to_company_id));
      setStartDate(record.start_date);
      setEndDate(record.end_date ?? "");
      setNote(record.note ?? "");
    } else {
      setEmployeeId(""); setToCompanyId(""); setStartDate(iso(new Date())); setEndDate(""); setNote("");
    }
  }, [open, record]);

  // Exclude the current (home) company from the "to" picker — same as cloud
  const toOptions = useMemo(
    () => (companies.data?.items ?? []).filter((c) => c.id !== companyId),
    [companies.data, companyId],
  );

  const submit = () => {
    setErr("");
    if (!employeeId || !toCompanyId || !startDate) {
      setErr(t("modules.attendance.rotation.errorRequired"));
      return;
    }
    save.mutate(
      {
        companyId, id: record?.id,
        body: {
          employee_id: Number(employeeId), to_company_id: Number(toCompanyId),
          start_date: startDate, end_date: endDate || null, note: note || null,
        },
      },
      {
        onSuccess: onClose,
        onError: (e: unknown) => {
          const ax = e as { response?: { data?: { detail?: string } } };
          setErr(ax.response?.data?.detail ?? t("modules.attendance.errors.generic"));
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{record ? t("modules.attendance.rotation.edit") : t("modules.attendance.rotation.create")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">{t("modules.attendance.columns.employee")} *</span>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("modules.attendance.rotation.selectEmployee")} /></SelectTrigger>
              <SelectContent>
                {(emps.data?.items ?? []).map((e) => (
                  <SelectItem key={e.id} value={String(e.id)}>
                    {e.full_name || `${e.last_name ?? ""} ${e.first_name}`.trim()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">{t("modules.attendance.rotation.cols.toBranch")} *</span>
            <Select value={toCompanyId} onValueChange={setToCompanyId}>
              <SelectTrigger className="w-full"><SelectValue placeholder={t("modules.attendance.rotation.selectBranch")} /></SelectTrigger>
              <SelectContent>
                {toOptions.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 block">
              <span className="text-xs text-muted-foreground">{t("modules.attendance.rotation.cols.startDate")} *</span>
              <DatePicker value={startDate} onChange={(v) => setStartDate(v)} />
            </label>
            <label className="space-y-1 block">
              <span className="text-xs text-muted-foreground">{t("modules.attendance.rotation.cols.endDate")}</span>
              <DatePicker value={endDate} onChange={(v) => setEndDate(v)} />
            </label>
          </div>
          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">{t("modules.attendance.rotation.cols.note")}</span>
            <Input value={note} maxLength={255} onChange={(e) => setNote(e.target.value)} placeholder={t("modules.attendance.rotation.notePlaceholder")} />
          </label>
          {err && <div className="text-sm text-destructive">{err}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>{t("modules.attendance.actions.cancel")}</Button>
            <Button disabled={save.isPending} onClick={submit}>
              {save.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}{t("modules.attendance.actions.save")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
