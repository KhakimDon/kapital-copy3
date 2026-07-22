import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";
import { ClipboardCheck, ChevronLeft, ChevronRight, Search, Loader2, LayoutGrid, MonitorSmartphone, Repeat, RefreshCw } from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ModuleShell, type ModuleSection } from "@/components/ui/module-shell";
import { Reveal } from "@/components/ui/reveal";
import {
  useAttendance, useMarkAttendance, useAttendanceDetail,
} from "./api";
import { TerminalView } from "./terminal-view";
import { RotationView } from "./rotation-view";
import {
  type AttendanceRow, type AttendanceCell,
} from "./types";

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Day-cell styles mapped to NextCloud tokens (mirrors cloud .att-day--* colors:
// ontime → success, slight → warning, late → error, absent/weekend/future → muted).
// Use translation keys; label is resolved at render time.
const ATT_CELL: Record<string, { cls: string; chip: string; labelKey: string }> = {
  ontime: { cls: "bg-success/15 text-success", chip: "bg-success", labelKey: "modules.attendance.status.ontime" },
  slight: { cls: "bg-warning/15 text-warning", chip: "bg-warning", labelKey: "modules.attendance.status.slight" },
  late: { cls: "bg-destructive/15 text-destructive", chip: "bg-destructive", labelKey: "modules.attendance.status.late" },
  absent: { cls: "bg-muted text-muted-foreground", chip: "bg-muted-foreground/40", labelKey: "modules.attendance.status.absent" },
  weekend: { cls: "bg-muted/40 text-muted-foreground/50", chip: "bg-muted", labelKey: "modules.attendance.status.weekend" },
  future: { cls: "text-muted-foreground/30", chip: "bg-muted", labelKey: "modules.attendance.status.future" },
};
// Status tab → count-badge color (mirrors cloud docs-tab__count--green/yellow/red/gray)
const TAB_COUNT_CLS: Record<string, string> = {
  ontime: "bg-success text-white",
  slight: "bg-warning text-white",
  late: "bg-destructive text-white",
  absent: "bg-muted-foreground/60 text-white",
};

type Mode = "today" | "week" | "month";
type View = "matrix" | "terminal" | "rotation";

function periodRange(mode: Mode, a: Date, months: string[]): { from: Date; to: Date; label: string } {
  if (mode === "today") return { from: a, to: a, label: `${a.getDate()} ${months[a.getMonth()]} ${a.getFullYear()}` };
  if (mode === "week") {
    const mon = new Date(a); mon.setDate(a.getDate() - ((a.getDay() + 6) % 7));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: mon, to: sun, label: `${mon.getDate()} ${months[mon.getMonth()].slice(0, 3)} – ${sun.getDate()} ${months[sun.getMonth()].slice(0, 3)}` };
  }
  return {
    from: new Date(a.getFullYear(), a.getMonth(), 1),
    to: new Date(a.getFullYear(), a.getMonth() + 1, 0),
    label: `${months[a.getMonth()]} ${a.getFullYear()}`,
  };
}
function shift(mode: Mode, a: Date, d: number): Date {
  const n = new Date(a);
  if (mode === "today") n.setDate(a.getDate() + d);
  else if (mode === "week") n.setDate(a.getDate() + d * 7);
  else n.setMonth(a.getMonth() + d, 1);
  return n;
}

export function AttendancePage() {
  const { t } = useTranslation();
  const MONTHS = useMemo(() => [
    t("modules.attendance.months.jan"),
    t("modules.attendance.months.feb"),
    t("modules.attendance.months.mar"),
    t("modules.attendance.months.apr"),
    t("modules.attendance.months.may"),
    t("modules.attendance.months.jun"),
    t("modules.attendance.months.jul"),
    t("modules.attendance.months.aug"),
    t("modules.attendance.months.sep"),
    t("modules.attendance.months.oct"),
    t("modules.attendance.months.nov"),
    t("modules.attendance.months.dec"),
  ], [t]);
  const NAV_ITEMS = useMemo(() => [
    { key: "matrix" as const, icon: LayoutGrid, label: t("modules.attendance.nav.matrix") },
    { key: "terminal" as const, icon: MonitorSmartphone, label: t("modules.attendance.nav.terminal") },
    { key: "rotation" as const, icon: Repeat, label: t("modules.attendance.nav.rotation") },
  ], [t]);
  const ATT_TABS_LOCALIZED = useMemo(() => [
    { key: "all", label: t("modules.attendance.tabs.all") },
    { key: "ontime", label: t("modules.attendance.status.ontime"), countKey: "ontime" },
    { key: "slight", label: t("modules.attendance.status.slight"), countKey: "slight" },
    { key: "late", label: t("modules.attendance.status.late"), countKey: "late" },
    { key: "absent", label: t("modules.attendance.status.absent"), countKey: "absent" },
  ], [t]);
  const WEEKDAYS_LOCALIZED = useMemo(() => [
    t("modules.attendance.weekdays.mo"),
    t("modules.attendance.weekdays.tu"),
    t("modules.attendance.weekdays.we"),
    t("modules.attendance.weekdays.th"),
    t("modules.attendance.weekdays.fr"),
    t("modules.attendance.weekdays.sa"),
    t("modules.attendance.weekdays.su"),
  ], [t]);
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;
  const [viewRaw, setViewRaw] = useUrlState("view", "matrix");
  const view = viewRaw as View;
  const [modeRaw, setModeRaw] = useUrlState("mode", "month");
  const mode = modeRaw as Mode;
  // Period anchor backed by the URL as a stable `YYYY-MM-DD` string, parsed
  // back to the Date the period math needs.
  const [anchorStr, setAnchorStr] = useUrlState("anchor", iso(new Date()));
  const anchor = useMemo(() => { const d = new Date(anchorStr); return isNaN(+d) ? new Date() : d; }, [anchorStr]);
  const setAnchor = (d: Date) => setAnchorStr(iso(d));
  const [tab, setTab] = useUrlState("tab", "all");
  const [searchInput, search, setSearchInput] = useUrlSearch("q");
  const [mark, setMark] = useState<{ row: AttendanceRow; date: string; cell: AttendanceCell } | null>(null);
  const [detailEmp, setDetailEmp] = useState<{ id: number; name: string } | null>(null);

  const { from, to, label } = periodRange(mode, anchor, MONTHS);
  const { data, isLoading, isFetching, refetch } = useAttendance(companyId, iso(from), iso(to));

  const employees = useMemo(() => {
    let list = data?.employees ?? [];
    if (tab !== "all") list = list.filter((e) => e.worst_status === tab);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || (e.position ?? "").toLowerCase().includes(q));
    return list;
  }, [data, tab, search]);

  if (!companyId) {
    return <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">{t("modules.attendance.selectCompany")}</div>;
  }

  const shellSections: ModuleSection[] = NAV_ITEMS.map((item) => {
    const Icon = item.icon;
    return { key: item.key, label: item.label, icon: <Icon className="size-4 shrink-0" /> };
  });
  const currentLabel = NAV_ITEMS.find((i) => i.key === view)?.label;

  const shellActions = view === "matrix" ? (
    <>
      <div className="relative">
        <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("modules.attendance.searchEmployee")} className="pl-8 w-52" />
      </div>
      <Button variant="outline" size="sm" onClick={() => refetch()} title={t("modules.attendance.refresh")}>
        <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
      </Button>
    </>
  ) : undefined;

  return (
    <ModuleShell
      title={t("modules.attendance.title")}
      icon={<ClipboardCheck className="size-6" />}
      subtitle={currentLabel}
      sections={shellSections}
      active={view}
      onSelect={(k) => setViewRaw(k)}
      actions={shellActions}
    >
        {view === "terminal" ? (
          <TerminalView companyId={companyId} />
        ) : view === "rotation" ? (
          <RotationView companyId={companyId} />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-md border border-border p-0.5">
                {(["today", "week", "month"] as Mode[]).map((m) => (
                  <Button key={m} variant="ghost" size="sm" onClick={() => setModeRaw(m)}
                    className={`h-auto rounded px-2.5 py-1 text-sm ${mode === m ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    {m === "today" ? t("modules.attendance.mode.today") : m === "week" ? t("modules.attendance.mode.week") : t("modules.attendance.mode.month")}
                  </Button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setAnchor(shift(mode, anchor, -1))}><ChevronLeft className="size-4" /></Button>
              <span className="font-medium min-w-[150px] text-center text-sm">{label}</span>
              <Button variant="outline" size="sm" onClick={() => setAnchor(shift(mode, anchor, 1))}><ChevronRight className="size-4" /></Button>
            </div>

            <div className="flex items-center gap-1 flex-wrap border-b border-border">
              {ATT_TABS_LOCALIZED.map((tb) => {
                const n = tb.countKey ? data?.totals?.[tb.countKey] : undefined;
                const active = tab === tb.key;
                const countCls = tb.countKey ? TAB_COUNT_CLS[tb.countKey] : "";
                return (
                  <Button key={tb.key} variant="ghost" onClick={() => setTab(tb.key)}
                    className={`h-auto gap-2 rounded-none px-3 py-2 text-sm border-b-2 -mb-px hover:bg-transparent ${active ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    {tb.label}
                    {n != null && (
                      <span className={`inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full text-[10px] font-bold ${
                        active ? "bg-primary text-primary-foreground" : countCls || "bg-secondary text-muted-foreground"
                      }`}>{n}</span>
                    )}
                  </Button>
                );
              })}
            </div>

            <Reveal loading={isLoading} skeleton={<Skeleton className="h-64 w-full" />}>
              <div className="rounded-lg border border-border bg-card overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="sticky left-0 bg-muted/40 z-10 text-left px-3 py-2 min-w-[200px] text-xs uppercase tracking-wide font-medium text-muted-foreground">{t("modules.attendance.columns.employee")}</th>
                      {data?.dates.map((d) => {
                        const dt = new Date(d); const wd = (dt.getDay() + 6) % 7;
                        return (
                          <th key={d} className={`px-1 py-1.5 text-center font-normal min-w-[48px] ${wd >= 5 ? "bg-muted/60" : ""}`}>
                            <div className="text-sm font-semibold text-foreground">{dt.getDate()}</div>
                            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{WEEKDAYS_LOCALIZED[wd]}</div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {employees.map((e) => (
                      <tr key={e.id} className="hover:bg-muted/60">
                        <td className="sticky left-0 bg-card z-10 px-3 py-1.5 min-w-[200px]">
                          <Button variant="ghost" onClick={() => setDetailEmp({ id: e.id, name: e.name })} className="h-auto flex-col items-start gap-0 p-0 text-left font-normal hover:bg-transparent hover:text-primary [&:hover_.emp-name]:underline">
                            <div className="emp-name font-medium truncate">{e.name}</div>
                            <div className="text-xs text-muted-foreground truncate">{e.position ?? "—"}</div>
                          </Button>
                        </td>
                        {data?.dates.map((d) => {
                          const c = e.records[d];
                          const style = ATT_CELL[c?.status ?? "absent"];
                          const clickable = c && c.status !== "future" && c.status !== "weekend";
                          return (
                            <td key={d} className="p-0.5 text-center align-middle">
                              <Button variant="ghost" disabled={!clickable} onClick={() => clickable && setMark({ row: e, date: d, cell: c })}
                                title={`${e.name} · ${d} · ${t(style.labelKey)}${c?.check_in ? ` · ${c.check_in}${c.check_out ? "–" + c.check_out : ""}` : ""}`}
                                className={`flex-col w-full h-auto rounded-md px-1 py-1 text-[11px] leading-tight font-normal hover:bg-transparent disabled:opacity-100 ${style.cls} ${clickable ? "cursor-pointer hover:ring-1 hover:ring-ring" : "cursor-default"}`}>
                                {c?.check_in ? (
                                  <><div className="font-mono tabular-nums">{c.check_in}</div>{c.minutes_late > 0 && <div className="text-[9px]">+{c.minutes_late}m</div>}</>
                                ) : (<div className="text-muted-foreground">{c?.status === "weekend" || c?.status === "future" ? "·" : "—"}</div>)}
                              </Button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                    {employees.length === 0 && (
                      <tr><td colSpan={(data?.dates.length ?? 0) + 1} className="text-center text-muted-foreground py-10">{t("modules.attendance.noEmployees")}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Reveal>

            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
              {["ontime", "slight", "late", "absent"].map((k) => (
                <span key={k} className="flex items-center gap-1.5"><span className={`size-3 rounded ${ATT_CELL[k].chip}`} /> {t(ATT_CELL[k].labelKey)}</span>
              ))}
            </div>
          </div>
        )}

      <MarkDialog companyId={companyId} mark={mark} onClose={() => setMark(null)} />
      <EmployeeDetailSheet companyId={companyId} emp={detailEmp} anchor={anchor} onClose={() => setDetailEmp(null)} />
    </ModuleShell>
  );
}

function EmployeeDetailSheet({ companyId, emp, anchor, onClose }: {
  companyId: number; emp: { id: number; name: string } | null; anchor: Date; onClose: () => void;
}) {
  const { t } = useTranslation();
  const MONTHS = useMemo(() => [
    t("modules.attendance.months.jan"), t("modules.attendance.months.feb"), t("modules.attendance.months.mar"),
    t("modules.attendance.months.apr"), t("modules.attendance.months.may"), t("modules.attendance.months.jun"),
    t("modules.attendance.months.jul"), t("modules.attendance.months.aug"), t("modules.attendance.months.sep"),
    t("modules.attendance.months.oct"), t("modules.attendance.months.nov"), t("modules.attendance.months.dec"),
  ], [t]);
  const WEEKDAYS_LOCALIZED = useMemo(() => [
    t("modules.attendance.weekdays.mo"), t("modules.attendance.weekdays.tu"), t("modules.attendance.weekdays.we"),
    t("modules.attendance.weekdays.th"), t("modules.attendance.weekdays.fr"), t("modules.attendance.weekdays.sa"),
    t("modules.attendance.weekdays.su"),
  ], [t]);
  const [month, setMonth] = useState(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  useEffect(() => { if (emp) setMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1)); }, [emp]); // eslint-disable-line
  const from = new Date(month.getFullYear(), month.getMonth(), 1);
  const to = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const { data, isLoading } = useAttendanceDetail(companyId, emp?.id ?? null, iso(from), iso(to));

  // calendar grid (Mon-first)
  const offset = (from.getDay() + 6) % 7;
  const days = to.getDate();
  const cells: (string | null)[] = [...Array(offset).fill(null),
    ...Array.from({ length: days }, (_, i) => iso(new Date(month.getFullYear(), month.getMonth(), i + 1)))];
  const st = data?.stats ?? {};

  return (
    <Sheet open={!!emp} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-2xl flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b border-border">
          <SheetTitle>{emp?.name}</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <Reveal
            loading={isLoading}
            skeleton={
              <div className="grid grid-cols-5 gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-[52px] w-full rounded-lg" />
                ))}
              </div>
            }
          >
            <div className="grid grid-cols-5 gap-2">
              {([
                [t("modules.attendance.status.ontime"), "ontime", "text-success"],
                [t("modules.attendance.status.slight"), "slight", "text-warning"],
                [t("modules.attendance.status.late"), "late", "text-destructive"],
                [t("modules.attendance.status.absent"), "absent", "text-muted-foreground"],
                [t("modules.attendance.statsTotal"), "total", "text-foreground"],
              ] as const).map(([lbl, k, color]) => (
                <div key={k} className="rounded-lg border border-border p-2 text-center">
                  <div className={`text-lg font-semibold ${color}`}>{st[k] ?? 0}</div>
                  <div className="text-[10px] text-muted-foreground">{lbl}</div>
                </div>
              ))}
            </div>
          </Reveal>

          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="size-4" /></Button>
            <span className="font-medium w-32 text-center text-sm">{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
            <Button variant="outline" size="sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="size-4" /></Button>
          </div>

          <Reveal loading={isLoading} skeleton={<Skeleton className="h-64 w-full" />}>
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS_LOCALIZED.map((w) => <div key={w} className="text-center text-[10px] text-muted-foreground py-1">{w}</div>)}
              {cells.map((d, i) => {
                if (!d) return <div key={i} />;
                const c = data?.records[d];
                const style = ATT_CELL[c?.status ?? "absent"];
                return (
                  <div key={d} className={`rounded-md p-1 min-h-[52px] text-center ${style.cls}`}>
                    <div className="text-[11px] font-medium">{Number(d.slice(-2))}</div>
                    {c?.check_in && <div className="text-[10px] font-mono tabular-nums">{c.check_in}</div>}
                    {c?.raw_check_in && <div className="text-[9px] italic opacity-70" title={t("modules.attendance.actualArrival")}>{t("modules.attendance.cameAt", { time: c.raw_check_in })}</div>}
                    {c && c.minutes_late > 0 && <div className="text-[9px]">+{c.minutes_late}m</div>}
                  </div>
                );
              })}
            </div>
          </Reveal>

          <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground pt-1">
            {["ontime", "slight", "late", "absent"].map((k) => (
              <span key={k} className="flex items-center gap-1.5"><span className={`size-3 rounded ${ATT_CELL[k].chip}`} /> {t(ATT_CELL[k].labelKey)}</span>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MarkDialog({ companyId, mark, onClose }: {
  companyId: number; mark: { row: AttendanceRow; date: string; cell: AttendanceCell } | null; onClose: () => void;
}) {
  const { t } = useTranslation();
  const [ci, setCi] = useState("");
  const [co, setCo] = useState("");
  const save = useMarkAttendance();
  useEffect(() => { if (mark) { setCi(mark.cell.check_in ?? "09:00"); setCo(mark.cell.check_out ?? "18:00"); } }, [mark]);

  return (
    <Dialog open={!!mark} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("modules.attendance.title")} — {mark?.row.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">{mark?.date}</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1"><span className="text-xs text-muted-foreground">{t("modules.attendance.checkIn")}</span><Input type="time" value={ci} onChange={(e) => setCi(e.target.value)} /></label>
            <label className="space-y-1"><span className="text-xs text-muted-foreground">{t("modules.attendance.checkOut")}</span><Input type="time" value={co} onChange={(e) => setCo(e.target.value)} /></label>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button disabled={save.isPending} onClick={() => mark && save.mutate({ companyId, employee_id: mark.row.id, date: mark.date, check_in: ci, check_out: co }, { onSuccess: onClose })}>
              {save.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}{t("modules.attendance.actions.save")}
            </Button>
            <Button variant="ghost" onClick={onClose}>{t("modules.attendance.actions.cancel")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
