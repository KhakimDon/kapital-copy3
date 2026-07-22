import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlNumber, useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";
import {
  MonitorSmartphone, Users, List, Loader2, Search, Link2, Unlink,
  Filter, Check, ChevronDown, UserPlus, ArrowLeft, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEmployees, useCreateEmployee } from "@/modules/employees/api";
import { useMyCompanies } from "@/shared/companies";
import {
  useTerminals, useTerminalUsers, useAttendanceEvents,
  useTerminalSuggestions, useLinkTerminalUser, useUnlinkTerminalUser,
} from "./api";
import { TERMINAL_STATUS, type TerminalRow, type TerminalUserRow } from "./types";

type Sub = "terminals" | "users" | "events";

export function TerminalView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const [subRaw, setSubRaw] = useUrlState("tsub", "users");
  const sub = subRaw as Sub;
  const [linkTu, setLinkTu] = useState<TerminalUserRow | null>(null);
  const [searchInput, search, setSearchInput] = useUrlSearch("tq");
  // 0 sentinel = "all terminals" (terminal ids are positive); maps to/from null.
  const [filterNum, setFilterNum] = useUrlNumber("tfilter", 0);
  const terminalFilter = filterNum || null;
  const setTerminalFilter = (id: number | null) => setFilterNum(id ?? 0);
  const terminals = useTerminals(companyId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t("modules.attendance.terminal.search")} className="pl-8 w-48" />
          </div>
          <TerminalFilter terminals={terminals.data ?? []} value={terminalFilter} onChange={setTerminalFilter} />
        </div>
      </div>

      <div className="flex items-center gap-1 flex-wrap border-b border-border">
        <SubBtn active={sub === "users"} onClick={() => setSubRaw("users")} icon={<Users className="size-4" />} label={t("modules.attendance.terminal.sub.users")} />
        <SubBtn active={sub === "events"} onClick={() => setSubRaw("events")} icon={<List className="size-4" />} label={t("modules.attendance.terminal.sub.events")} />
        <SubBtn active={sub === "terminals"} onClick={() => setSubRaw("terminals")} icon={<MonitorSmartphone className="size-4" />} label={t("modules.attendance.terminal.sub.terminals")} />
      </div>

      {sub === "users" && <UsersTab companyId={companyId} search={search} terminalFilter={terminalFilter} onLink={setLinkTu} onClearSearch={() => setSearchInput("")} />}
      {sub === "events" && <EventsTab companyId={companyId} search={search} terminalFilter={terminalFilter} onClearSearch={() => setSearchInput("")} />}
      {sub === "terminals" && <TerminalsTab terminals={terminals.data ?? []} loading={terminals.isLoading} search={search} terminalFilter={terminalFilter} onClearSearch={() => setSearchInput("")} />}

      <LinkModal companyId={companyId} tu={linkTu} onClose={() => setLinkTu(null)} />
    </div>
  );
}

function SubBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Button variant="ghost" onClick={onClick}
      className={`h-auto gap-2 rounded-none px-3 py-2 text-sm border-b-2 -mb-px hover:bg-transparent ${active ? "border-primary text-foreground font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
      {icon}{label}
    </Button>
  );
}

// ── Terminal (device) filter dropdown ───────────────────────────────────
function TerminalFilter({ terminals, value, onChange }: {
  terminals: TerminalRow[]; value: number | null; onChange: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const sorted = useMemo(
    () => [...terminals].sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [terminals],
  );
  const filtered = q
    ? sorted.filter((trm) => `${trm.name} ${trm.uuid ?? ""} ${trm.ip ?? ""}`.toLowerCase().includes(q.toLowerCase()))
    : sorted;
  const current = value != null ? terminals.find((t) => t.id === value) : null;

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Filter className="size-4" />
          <span className="max-w-[140px] truncate">{current ? current.name : t("modules.attendance.terminal.allTerminals")}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        <div className="p-2 border-b">
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("modules.attendance.terminal.searchTerminal")} className="h-8" />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <FilterItem label={t("modules.attendance.terminal.allTerminals")} selected={value == null} onClick={() => { onChange(null); setOpen(false); }} />
          {filtered.map((trm) => (
            <FilterItem key={trm.id} label={trm.name || `#${trm.id}`} selected={value === trm.id}
              count={trm.events_count} onClick={() => { onChange(trm.id); setOpen(false); }} />
          ))}
          {filtered.length === 0 && <div className="px-3 py-4 text-center text-xs text-muted-foreground">{t("modules.attendance.terminal.notFound")}</div>}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FilterItem({ label, selected, count, onClick }: { label: string; selected: boolean; count?: number; onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick}
      className={`w-full h-auto justify-start gap-2 px-3 py-1.5 text-sm text-left ${selected ? "font-medium" : "font-normal"}`}>
      <Check className={`size-4 ${selected ? "opacity-100 text-primary" : "opacity-0"}`} />
      <span className="flex-1 truncate">{label}</span>
      {count != null && <span className="text-xs text-muted-foreground">{count}</span>}
    </Button>
  );
}

function UsersTab({ companyId, search, terminalFilter, onLink, onClearSearch }: {
  companyId: number; search: string; terminalFilter: number | null; onLink: (tu: TerminalUserRow) => void; onClearSearch: () => void;
}) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useTerminalUsers(companyId);
  const unlink = useUnlinkTerminalUser();
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((u) => {
      if (terminalFilter != null && !(u.terminal_ids ?? []).includes(terminalFilter)) return false;
      if (!q) return true;
      const hay = `${u.name ?? ""} ${u.employee_no} ${u.terminal_names.join(" ")} ${u.linked_employee?.full_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, terminalFilter]);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.cols.terminalUser")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.cols.type")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.cols.linkedEmployee")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.cols.lastSeen")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">{t("modules.attendance.terminal.cols.events")}</TableHead>
          <TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                <TableCell>
                  <div className="space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-2.5 w-20" /></div>
                </TableCell>
                <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-3.5 w-8 ml-auto" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-8 w-20 rounded-md ml-auto" /></TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="py-16">
                <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                  <div className="size-14 rounded-full bg-muted grid place-items-center">
                    <Users className="size-7 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-medium text-foreground">{t("modules.attendance.terminal.noUsers")}</div>
                  {search.trim() && (
                    <Button variant="outline" size="sm" onClick={() => onClearSearch()}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((u, i) => (
              <TableRow key={u.id}
                className="hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                <TableCell>
                  <div className="font-medium">{u.name ?? u.employee_no}</div>
                  <div className="text-xs text-muted-foreground">#{u.employee_no}{u.terminals_count > 1 ? ` · ${t("modules.attendance.terminal.nTerminals", { count: u.terminals_count })}` : u.terminal_names[0] ? ` · ${u.terminal_names[0]}` : ""}</div>
                </TableCell>
                <TableCell>
                  {u.user_type ? <Badge variant="muted">{u.user_type}</Badge> : <span className="text-muted-foreground text-sm">—</span>}
                </TableCell>
                <TableCell>
                  {u.linked_employee ? (
                    <div><div className="font-medium">{u.linked_employee.full_name}</div>
                      {u.linked_employee.position && <div className="text-xs text-muted-foreground">{u.linked_employee.position}</div>}</div>
                  ) : <span className="text-muted-foreground text-sm">{t("modules.attendance.terminal.unlinked")}</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{u.last_seen_at?.replace("T", " ").slice(0, 16) ?? "—"}</TableCell>
                <TableCell className="text-right">{u.events_count}</TableCell>
                <TableCell className="text-right">
                  {u.linked_employee ? (
                    <Button variant="outline" size="sm" onClick={() => unlink.mutate({ companyId, tuId: u.id })}>
                      <Unlink className="size-4 mr-1.5" /> {t("modules.attendance.terminal.actions.unlink")}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => onLink(u)}><Link2 className="size-4 mr-1.5" /> {t("modules.attendance.terminal.actions.link")}</Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function EventsTab({ companyId, search, terminalFilter, onClearSearch }: { companyId: number; search: string; terminalFilter: number | null; onClearSearch: () => void }) {
  const { t } = useTranslation();
  const { data = [], isLoading } = useAttendanceEvents(companyId);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((e) => {
      if (terminalFilter != null && e.terminal_id !== terminalFilter) return false;
      if (!q) return true;
      const hay = `${e.name ?? ""} ${e.employee_no ?? ""} ${e.terminal_name ?? ""} ${e.employee_name ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, terminalFilter]);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.eventCols.time")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.eventCols.terminal")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.columns.employee")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.eventCols.direction")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.eventCols.verify")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.eventCols.source")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={6} className="py-16">
                <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                  <div className="size-14 rounded-full bg-muted grid place-items-center">
                    <List className="size-7 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-medium text-foreground">{t("modules.attendance.terminal.noEvents")}</div>
                  {search.trim() && (
                    <Button variant="outline" size="sm" onClick={() => onClearSearch()}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((e, i) => (
              <TableRow key={e.id}
                className="hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                <TableCell className="font-mono text-xs tabular-nums">{e.event_date} {e.event_time.slice(11, 16)}</TableCell>
                <TableCell className="text-muted-foreground">{e.terminal_name ?? "—"}</TableCell>
                <TableCell className="font-medium">{e.employee_name ?? e.name ?? "—"}</TableCell>
                <TableCell><Badge variant={e.direction === "entry" ? "success" : "muted"}>{e.direction === "entry" ? t("modules.attendance.terminal.direction.entry") : t("modules.attendance.terminal.direction.exit")}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.verify_mode ?? "—"}</TableCell>
                <TableCell><Badge variant={e.source === "terminal" ? "info" : "muted"}>{e.source === "terminal" ? t("modules.attendance.terminal.source.terminal") : t("modules.attendance.terminal.source.manual")}</Badge></TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function TerminalsTab({ terminals, loading, search, terminalFilter, onClearSearch }: {
  terminals: TerminalRow[]; loading: boolean; search: string; terminalFilter: number | null; onClearSearch: () => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return terminals.filter((trm) => {
      if (terminalFilter != null && trm.id !== terminalFilter) return false;
      if (!q) return true;
      return `${trm.name} ${trm.uuid ?? ""} ${trm.ip ?? ""} ${trm.model ?? ""}`.toLowerCase().includes(q);
    });
  }, [terminals, search, terminalFilter]);
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <Table>
        <TableHeader><TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.cols.terminal")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.cols.type")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.cols.status")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.attendance.terminal.cols.lastSync")}</TableHead>
          <TableHead className="text-xs uppercase tracking-wide text-muted-foreground text-right">{t("modules.attendance.terminal.cols.events")}</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                <TableCell>
                  <div className="space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-2.5 w-24" /></div>
                </TableCell>
                <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-3.5 w-8 ml-auto" /></TableCell>
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className="py-16">
                <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                  <div className="size-14 rounded-full bg-muted grid place-items-center">
                    <MonitorSmartphone className="size-7 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-medium text-foreground">{t("modules.attendance.terminal.noTerminals")}</div>
                  {search.trim() && (
                    <Button variant="outline" size="sm" onClick={() => onClearSearch()}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((trm, i) => {
              const st = TERMINAL_STATUS[trm.status] ?? TERMINAL_STATUS.unknown;
              return (
                <TableRow key={trm.id}
                  className="hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}>
                  <TableCell>
                    <div className="font-medium">{trm.name}</div>
                    <div className="text-xs text-muted-foreground">{[trm.ip && `${trm.ip}${trm.port ? ":" + trm.port : ""}`, trm.model].filter(Boolean).join(" · ")}</div>
                  </TableCell>
                  <TableCell>{trm.type === "exit" ? t("modules.attendance.terminal.direction.exit") : t("modules.attendance.terminal.direction.entry")}</TableCell>
                  <TableCell><Badge variant={st.variant}>{st.label}</Badge>{trm.status_message && <div className="text-xs text-muted-foreground">{trm.status_message}</div>}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{trm.last_synced_at?.replace("T", " ").slice(0, 16) ?? "—"}</TableCell>
                  <TableCell className="text-right">{trm.events_count}</TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Link modal: choice → pick existing | create new ─────────────────────
type LinkView = "choice" | "existing" | "create";

function LinkModal({ companyId, tu, onClose }: { companyId: number; tu: TerminalUserRow | null; onClose: () => void }) {
  const { t } = useTranslation();
  const [view, setView] = useState<LinkView>("choice");
  const reset = () => { setView("choice"); onClose(); };

  return (
    <Dialog open={!!tu} onOpenChange={(o) => { if (!o) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view !== "choice" && (
              <Button variant="ghost" size="icon" onClick={() => setView("choice")} className="size-6 text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /></Button>
            )}
            {t("modules.attendance.terminal.link.title")} — {tu?.name ?? tu?.employee_no}
          </DialogTitle>
        </DialogHeader>
        {view === "choice" && (
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setView("existing")}
              className="h-auto flex-col items-start rounded-lg p-4 text-left font-normal hover:border-primary hover:bg-muted">
              <UserCheck className="size-6 mb-2 text-primary" />
              <div className="font-medium text-sm">{t("modules.attendance.terminal.link.pickExisting")}</div>
              <div className="text-xs text-muted-foreground mt-0.5 whitespace-normal">{t("modules.attendance.terminal.link.pickExistingHint")}</div>
            </Button>
            <Button variant="outline" onClick={() => setView("create")}
              className="h-auto flex-col items-start rounded-lg p-4 text-left font-normal hover:border-primary hover:bg-muted">
              <UserPlus className="size-6 mb-2 text-primary" />
              <div className="font-medium text-sm">{t("modules.attendance.terminal.link.createNew")}</div>
              <div className="text-xs text-muted-foreground mt-0.5 whitespace-normal">{t("modules.attendance.terminal.link.createNewHint")}</div>
            </Button>
          </div>
        )}
        {view === "existing" && tu && <PickExisting companyId={companyId} tu={tu} onDone={reset} />}
        {view === "create" && tu && <CreateEmployee companyId={companyId} tu={tu} onDone={reset} />}
      </DialogContent>
    </Dialog>
  );
}

function PickExisting({ companyId, tu, onDone }: { companyId: number; tu: TerminalUserRow; onDone: () => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [pickCompany, setPickCompany] = useState(String(companyId));
  const companies = useMyCompanies();
  const sugg = useTerminalSuggestions(companyId, tu.id);
  const emps = useEmployees(Number(pickCompany), { status: "active", search: search || undefined });
  const link = useLinkTerminalUser();
  const [err, setErr] = useState("");
  const companyName = (id?: number | null) => companies.data?.items.find((c) => c.id === id)?.name;

  const doLink = (employee_id: number) =>
    link.mutate({ companyId, tuId: tu.id, employee_id }, {
      onSuccess: onDone,
      onError: (e: unknown) => setErr((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? t("modules.attendance.errors.generic")),
    });

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">{t("modules.attendance.terminal.link.suggestions")}</div>
        {sugg.isLoading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {t("modules.attendance.terminal.link.searching")}</div>
          : sugg.data?.suggestions.length ? (
            <div className="space-y-1 animate-in fade-in-0 duration-300">
              {sugg.data.suggestions.map((s) => (
                <div key={s.employee.id} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{s.employee.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[s.employee.position, companyName(s.employee.company_id)].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <Badge variant="success">{s.score}%</Badge>
                  <Button size="sm" onClick={() => doLink(s.employee.id)} disabled={link.isPending}>{t("modules.attendance.terminal.link.accept")}</Button>
                </div>
              ))}
            </div>
          ) : <div className="text-sm text-muted-foreground animate-in fade-in-0 duration-300">{t("modules.attendance.terminal.link.noSimilar")}</div>}
      </div>
      <div>
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{t("modules.attendance.terminal.link.orPickManually")}</div>
          <Select value={pickCompany} onValueChange={(v) => { setPickCompany(v); setSearch(""); }}>
            <SelectTrigger className="h-7 w-auto gap-1 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(companies.data?.items ?? []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="relative mb-2">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("modules.attendance.terminal.link.searchEmployees")} className="pl-8" />
        </div>
        <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y divide-border animate-in fade-in-0 duration-300">
          {(emps.data?.items ?? []).map((e) => (
            <Button key={e.id} variant="ghost" onClick={() => doLink(e.id)} disabled={link.isPending}
              className="w-full h-auto rounded-none text-left px-3 py-2 text-sm flex items-center justify-between font-normal">
              <span><span className="font-medium">{e.full_name}</span> <span className="text-muted-foreground">{e.position ?? ""}</span></span>
              {link.isPending && <Loader2 className="size-4 animate-spin" />}
            </Button>
          ))}
          {(emps.data?.items.length ?? 0) === 0 && <div className="px-3 py-6 text-center text-muted-foreground text-sm">{t("modules.attendance.terminal.link.noEmployeeFound")}</div>}
        </div>
      </div>
      {err && <div className="text-sm text-destructive">{err}</div>}
    </div>
  );
}

function CreateEmployee({ companyId, tu, onDone }: { companyId: number; tu: TerminalUserRow; onDone: () => void }) {
  const { t } = useTranslation();
  // Pre-fill name fields by splitting the terminal user label (cloud behavior)
  const parts = (tu.name ?? "").trim().split(/\s+/).filter(Boolean);
  const [last, setLast] = useState(parts[0] ?? "");
  const [first, setFirst] = useState(parts[1] ?? "");
  const [middle, setMiddle] = useState(parts.slice(2).join(" "));
  const [createCompany, setCreateCompany] = useState(String(companyId));
  const [err, setErr] = useState("");
  const companies = useMyCompanies();
  const create = useCreateEmployee();
  const link = useLinkTerminalUser();
  const busy = create.isPending || link.isPending;

  const submit = () => {
    setErr("");
    if (!last.trim() || !first.trim()) { setErr(t("modules.attendance.terminal.create.errorNameRequired")); return; }
    if (!createCompany) { setErr(t("modules.attendance.terminal.create.errorCompanyRequired")); return; }
    // Step 1: create employee → Step 2: link the terminal user (mirrors cloud)
    create.mutate(
      { companyId: Number(createCompany), body: { last_name: last.trim(), first_name: first.trim(), middle_name: middle.trim() || undefined } },
      {
        onSuccess: (emp) => {
          link.mutate({ companyId, tuId: tu.id, employee_id: emp.id }, {
            onSuccess: onDone,
            onError: (e: unknown) => setErr((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? t("modules.attendance.terminal.create.errorLink")),
          });
        },
        onError: (e: unknown) => setErr((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? t("modules.attendance.terminal.create.errorCreate")),
      },
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <label className="space-y-1 block"><span className="text-xs text-muted-foreground">{t("modules.attendance.terminal.create.lastName")} *</span><Input value={last} onChange={(e) => setLast(e.target.value)} /></label>
        <label className="space-y-1 block"><span className="text-xs text-muted-foreground">{t("modules.attendance.terminal.create.firstName")} *</span><Input value={first} onChange={(e) => setFirst(e.target.value)} /></label>
        <label className="space-y-1 block"><span className="text-xs text-muted-foreground">{t("modules.attendance.terminal.create.middleName")}</span><Input value={middle} onChange={(e) => setMiddle(e.target.value)} /></label>
      </div>
      <label className="space-y-1 block">
        <span className="text-xs text-muted-foreground">{t("modules.attendance.terminal.create.company")} *</span>
        <Select value={createCompany} onValueChange={setCreateCompany}>
          <SelectTrigger className="w-full"><SelectValue placeholder={t("modules.attendance.terminal.create.companyPlaceholder")} /></SelectTrigger>
          <SelectContent>
            {(companies.data?.items ?? []).map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      {err && <div className="text-sm text-destructive">{err}</div>}
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button disabled={busy} onClick={submit}>
          {busy && <Loader2 className="size-4 mr-1.5 animate-spin" />}{t("modules.attendance.terminal.create.submit")}
        </Button>
      </div>
    </div>
  );
}
