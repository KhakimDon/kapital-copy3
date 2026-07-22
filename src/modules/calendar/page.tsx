// /calendar — Apple-Calendar-structured calendar on the system UI:
// left sidebar (mini month + calendar list with color checkboxes + task
// project toggles), main area with Day/Week/Month/Year views, event dialog,
// invites inbox, ICS export/subscription. Mobile: the sidebar becomes a
// slide-in drawer (same pattern as the wiki module).
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTabs } from "@/shared/store/tabs";
import {
  Bell, Check, ChevronLeft, ChevronRight, Copy, Link2, Loader2, PanelLeft, Pencil, Plus, Search, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar as MiniMonth } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import { useCompany } from "@/shared/store/company";
import { useTimeFmt } from "@/shared/store/prefs";
import { useUrlState } from "@/shared/hooks/use-url-state";
import {
  type CalendarInfo, type EventOccurrence, type TaskDue,
  uid, useCalendars, useCalendarFeedLink, useDeleteCalendar, useEvents, useMyInvites,
  useRespondInvite, useSaveCalendar, useTasksDue,
} from "./api";
import { addDays, addMonths, DAY_MS, monthGrid, startOfDay, startOfWeek, ymd } from "./util";
import { DayView, MonthView, WeekView, YearView, useCalNames } from "./views";
import { EventDialog } from "./event-dialog";

const VIEWS = ["day", "week", "month", "year"] as const;
type View = (typeof VIEWS)[number];

const SWATCHES = ["#1868DB", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b"];

export function CalendarPage() {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.calendar.${k}`, { defaultValue: d });
  const { months } = useCalNames();
  const openTab = useTabs((s) => s.open);
  const company = useCompany((s) => s.current);
  const companyId = company?.id;

  const [viewUrl, setViewUrl] = useUrlState("view", "month");
  const view = (VIEWS as readonly string[]).includes(viewUrl) ? (viewUrl as View) : "month";
  const [dateUrl, setDateUrl] = useUrlState("date", "");
  const cursor = useMemo(() => {
    const d = dateUrl ? new Date(`${dateUrl}T00:00:00`) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  }, [dateUrl]);
  const setCursor = (d: Date) => setDateUrl(ymd(d));

  // Visible range per view (month view pads to the full 6-week grid).
  const [from, to] = useMemo((): [Date, Date] => {
    switch (view) {
      case "day":
        return [cursor, addDays(cursor, 1)];
      case "week": {
        const s = startOfWeek(cursor);
        return [s, addDays(s, 7)];
      }
      case "year":
        return [new Date(cursor.getFullYear(), 0, 1), new Date(cursor.getFullYear() + 1, 0, 1)];
      default: {
        const cells = monthGrid(cursor);
        return [cells[0], addDays(cells[41], 1)];
      }
    }
  }, [view, cursor]);

  const cals = useCalendars(companyId);
  const eventsQ = useEvents(companyId, from.toISOString(), to.toISOString());
  const tasksQ = useTasksDue(companyId, from.toISOString(), to.toISOString());

  const [hiddenCals, setHiddenCals] = useState<Set<string>>(new Set());
  const [showTasks, setShowTasks] = useState(true);
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(new Set());
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [q] = useUrlState("q", "");
  const query = q.trim().toLowerCase();

  const events = useMemo(
    () =>
      (eventsQ.data ?? [])
        .filter((e) => !hiddenCals.has(e.calendarId))
        .filter((e) => !query || `${e.title} ${e.location}`.toLowerCase().includes(query)),
    [eventsQ.data, hiddenCals, query],
  );

  // Per-day event colours for the mini-month dot markers (up to 3 per day). Only
  // covers the loaded range (the current view's month grid), which is what the
  // mini-month shows by default.
  const dayColors = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const e of events) {
      const end = new Date(e.endsAt).getTime();
      for (let t = startOfDay(new Date(e.startsAt)).getTime(); t < end; t += DAY_MS) {
        const key = ymd(new Date(t));
        const arr = m.get(key) ?? [];
        if (arr.length < 3) arr.push(e.color);
        m.set(key, arr);
      }
    }
    return m;
  }, [events]);
  const tasks = useMemo(
    () =>
      showTasks
        ? (tasksQ.data ?? [])
            .filter((tk) => !hiddenProjects.has(tk.projectId))
            .filter((tk) => !query || tk.title.toLowerCase().includes(query))
        : [],
    [showTasks, tasksQ.data, hiddenProjects, query],
  );
  const projects = useMemo(() => {
    const map = new Map<string, TaskDue>();
    for (const tk of tasksQ.data ?? []) if (!map.has(tk.projectId)) map.set(tk.projectId, tk);
    return [...map.values()];
  }, [tasksQ.data]);

  // Dialogs.
  const [editEvent, setEditEvent] = useState<EventOccurrence | null>(null);
  const [createAt, setCreateAt] = useState<Date | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [calEdit, setCalEdit] = useState<CalendarInfo | "new" | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const openEvent = (e: EventOccurrence) => { setEditEvent(e); setCreateAt(null); setEventOpen(true); };
  const openCreate = (d: Date) => { setEditEvent(null); setCreateAt(d); setEventOpen(true); };
  // Open the task in the Tasks tab (app-standard, like the topbar notifications)
  // — keeps the Calendar tab intact so closing the card returns here.
  const openTask = (tk: TaskDue) => openTab(`/tasks?project=${tk.projectId}&card=${tk.id}`);
  const gotoDay = (d: Date) => { setCursor(d); setViewUrl("day"); setMobileSidebar(false); };

  const shift = (dir: 1 | -1) => {
    switch (view) {
      case "day": return setCursor(addDays(cursor, dir));
      case "week": return setCursor(addDays(cursor, 7 * dir));
      case "year": return setCursor(new Date(cursor.getFullYear() + dir, cursor.getMonth(), 1));
      default: return setCursor(addMonths(cursor, dir));
    }
  };

  const headerTitle =
    view === "year"
      ? String(cursor.getFullYear())
      : view === "day"
        ? `${cursor.getDate()}-${months[cursor.getMonth()].toLowerCase()}, ${cursor.getFullYear()}`
        : `${months[cursor.getMonth()]} ${cursor.getFullYear()}`;

  if (!companyId) {
    return <div className="p-6 text-sm text-muted-foreground">{tr("noCompany", "Kompaniya tanlanmagan")}</div>;
  }

  const sidebar = (
    <Sidebar
      companyId={companyId}
      cursor={cursor}
      onPick={gotoDay}
      dayColors={dayColors}
      calendars={cals.data ?? []}
      hiddenCals={hiddenCals}
      onToggleCal={(id) =>
        setHiddenCals((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })
      }
      onEditCal={(c) => setCalEdit(c)}
      onNewCal={() => setCalEdit("new")}
      showTasks={showTasks}
      onToggleTasks={() => setShowTasks((v) => !v)}
      projects={projects}
      hiddenProjects={hiddenProjects}
      onToggleProject={(id) =>
        setHiddenProjects((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; })
      }
    />
  );

  return (
    <div className="relative -m-6 flex h-[calc(100dvh-66px)] overflow-hidden max-md:h-[calc(100dvh-56px)]">
      <aside className="hidden w-60 shrink-0 flex-col overflow-hidden border-r bg-muted/30 md:flex">
        {sidebar}
      </aside>

      {mobileSidebar && (
        <div className="absolute inset-0 z-40 flex md:hidden">
          <div className="h-full w-72 max-w-[85vw] overflow-hidden bg-background shadow-2xl animate-in slide-in-from-left-4 duration-200">
            {sidebar}
          </div>
          <button type="button" aria-label="Yopish" onClick={() => setMobileSidebar(false)} className="flex-1 bg-black/35 animate-in fade-in-0 duration-200" />
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col bg-white dark:bg-background">
        {/* toolbar — responsive 3-column. On lg+ the left (title) and right
            (controls) groups are equal flex-1 so the CENTER switcher stays
            perfectly centered and never shifts with the title width. Below lg
            (where the sidebar leaves little room) the switcher WRAPS to its own
            centered second row instead of colliding with the controls. */}
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
          {/* left: sidebar toggle (mobile) + title */}
          <div className="flex min-w-0 flex-1 items-center gap-2 lg:flex-1">
            <button
              type="button"
              onClick={() => setMobileSidebar(true)}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted md:hidden"
              aria-label={tr("calendars", "Kalendarlar")}
            >
              <PanelLeft className="size-4" />
            </button>
            <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">{headerTitle}</h1>
          </div>

          {/* center: Day / Week / Month / Year switcher — its own centered row
              below lg, inline-centered on lg+. */}
          <div className="order-last flex w-full justify-center lg:order-none lg:w-auto lg:flex-1">
            <div className="inline-flex rounded-lg border bg-muted/50 p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setViewUrl(v)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    view === v ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {tr(`views.${v}`, v)}
                </button>
              ))}
            </div>
          </div>

          {/* right: prev/today/next, search, add — pinned to the end */}
          <div className="flex shrink-0 items-center justify-end gap-2 lg:flex-1">
            <div className="inline-flex shrink-0 items-center rounded-lg border">
              <button type="button" onClick={() => shift(-1)} className="rounded-l-lg p-1.5 hover:bg-muted" aria-label="‹"><ChevronLeft className="size-4" /></button>
              <button type="button" onClick={() => setCursor(new Date())} className="border-x px-2 py-1 text-xs font-medium hover:bg-muted">
                {tr("today", "Bugun")}
              </button>
              <button type="button" onClick={() => shift(1)} className="rounded-r-lg p-1.5 hover:bg-muted" aria-label="›"><ChevronRight className="size-4" /></button>
            </div>
            {/* Search — opens a jump-to-event modal. */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="grid size-8 shrink-0 place-items-center rounded-lg border text-muted-foreground hover:bg-muted"
              title={tr("searchPh", "Qidirish")}
              aria-label={tr("searchPh", "Qidirish")}
            >
              <Search className="size-4" />
            </button>
            {/* Add event — far right, after search. */}
            <Button size="sm" className="h-8 shrink-0" onClick={() => openCreate(cursor)}>
              <Plus className="size-4" /> <span className="max-sm:hidden">{tr("add", "Qo'shish")}</span>
            </Button>
          </div>
        </div>

        {/* body */}
        <div className="min-h-0 flex-1">
          {eventsQ.isLoading ? (
            <div className="grid h-full place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : view === "month" ? (
            <MonthView cursor={cursor} events={events} tasks={tasks} onEvent={openEvent} onTask={openTask} onDay={gotoDay} onCreateAt={openCreate} />
          ) : view === "week" ? (
            <WeekView cursor={cursor} events={events} tasks={tasks} onEvent={openEvent} onTask={openTask} onDay={gotoDay} onCreateAt={openCreate} />
          ) : view === "day" ? (
            <DayView cursor={cursor} events={events} tasks={tasks} onEvent={openEvent} onTask={openTask} onDay={gotoDay} onCreateAt={openCreate} />
          ) : (
            <YearView
              cursor={cursor} events={events} tasks={tasks}
              onEvent={openEvent} onTask={openTask} onDay={gotoDay} onCreateAt={openCreate}
              onMonth={(d) => { setCursor(d); setViewUrl("month"); }}
            />
          )}
        </div>
      </main>

      <EventDialog
        companyId={companyId}
        calendars={cals.data ?? []}
        event={editEvent}
        createAt={createAt}
        open={eventOpen}
        onClose={() => setEventOpen(false)}
      />
      <CalendarEditDialog
        companyId={companyId}
        cal={calEdit}
        onClose={() => setCalEdit(null)}
      />
      <CalendarSearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        events={events}
        onPick={(ev) => { setSearchOpen(false); setCursor(new Date(ev.startsAt)); openEvent(ev); }}
      />
    </div>
  );
}

// ── search modal (jump-to-event, Tasks-style) ─────────────────────────────────

function CalendarSearchDialog({
  open,
  onClose,
  events,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  events: EventOccurrence[];
  onPick: (e: EventOccurrence) => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.calendar.${k}`, { defaultValue: d });
  const tf = useTimeFmt();
  const { months } = useCalNames();
  const [q, setQ] = useState("");
  useEffect(() => { if (open) setQ(""); }, [open]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    return [...events]
      .filter((e) => !query || `${e.title} ${e.location}`.toLowerCase().includes(query))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 60);
  }, [events, q]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[70vh] w-[34rem] max-w-[95vw] flex-col gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("searchPh", "Qidirish")}
            className="h-7 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <div className="grid place-items-center py-10 text-sm text-muted-foreground">
              {tr("searchEmpty", "Tadbir topilmadi")}
            </div>
          ) : (
            results.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => onPick(e)}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-muted"
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: e.color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{e.title || "—"}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {new Date(e.startsAt).getDate()} {months[new Date(e.startsAt).getMonth()]}
                    {!e.allDay ? ` · ${tf.time(new Date(e.startsAt))}` : ""}
                    {e.location ? ` · ${e.location}` : ""}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── sidebar ──────────────────────────────────────────────────────────────────

function Sidebar(p: {
  companyId: number;
  cursor: Date;
  onPick: (d: Date) => void;
  /** ymd → up to 3 event colours, for the mini-month dot markers. */
  dayColors: Map<string, string[]>;
  calendars: CalendarInfo[];
  hiddenCals: Set<string>;
  onToggleCal: (id: string) => void;
  onEditCal: (c: CalendarInfo) => void;
  onNewCal: () => void;
  showTasks: boolean;
  onToggleTasks: () => void;
  projects: TaskDue[];
  hiddenProjects: Set<string>;
  onToggleProject: (id: string) => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.calendar.${k}`, { defaultValue: d });
  const { days, months } = useCalNames();

  // Mini-month follows the main cursor when it jumps to another month, but its
  // own ‹ › arrows let you browse ahead without moving the main view.
  const [miniMonth, setMiniMonth] = useState(p.cursor);
  const curKey = `${p.cursor.getFullYear()}-${p.cursor.getMonth()}`;
  const [seen, setSeen] = useState(curKey);
  if (curKey !== seen) { setSeen(curKey); setMiniMonth(p.cursor); }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PendingInvites companyId={p.companyId} />
      {/* calendar + task-project toggle list (scrolls) */}
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
        <div className="flex items-center justify-between px-2 pb-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {tr("calendars", "Kalendarlar")}
          </span>
          <button type="button" onClick={p.onNewCal} className="rounded p-1 text-muted-foreground hover:bg-muted" title={tr("newCalendar", "Yangi kalendar")}>
            <Plus className="size-3.5" />
          </button>
        </div>
        {p.calendars.map((c) => (
          <div key={c.id} className="group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60">
            <Checkbox
              checked={!p.hiddenCals.has(c.id)}
              onCheckedChange={() => p.onToggleCal(c.id)}
              className="size-4 border-2"
              style={{ borderColor: c.color, background: p.hiddenCals.has(c.id) ? "transparent" : c.color }}
            />
            <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
            {c.kind === "ics" && <Link2 className="size-3 shrink-0 text-muted-foreground" />}
            <button
              type="button"
              onClick={() => p.onEditCal(c)}
              className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100"
            >
              <Pencil className="size-3" />
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between px-2 pb-0.5 pt-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {tr("tasksSection", "Vazifalar")}
          </span>
          <Checkbox checked={p.showTasks} onCheckedChange={p.onToggleTasks} className="size-4" />
        </div>
        {p.showTasks &&
          p.projects.map((pr) => (
            <label key={pr.projectId} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted/60">
              <Checkbox
                checked={!p.hiddenProjects.has(pr.projectId)}
                onCheckedChange={() => p.onToggleProject(pr.projectId)}
                className="size-4 border-2"
                style={{ borderColor: pr.color, background: p.hiddenProjects.has(pr.projectId) ? "transparent" : pr.color }}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{pr.projectName}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{pr.projectKey}</span>
            </label>
          ))}
      </div>

      {/* mini-month picker pinned to the bottom */}
      <div className="shrink-0 border-t p-1.5">
        <MiniMonth
          mode="single"
          selected={p.cursor}
          month={miniMonth}
          onMonthChange={setMiniMonth}
          onSelect={(d) => { if (d) p.onPick(d); }}
          weekStartsOn={1}
          formatters={{
            formatWeekdayName: (date) => days[(date.getDay() + 6) % 7],
            formatCaption: (date) => `${months[date.getMonth()]} ${date.getFullYear()}`,
          }}
          components={{
            IconLeft: () => <ChevronLeft className="size-4" />,
            IconRight: () => <ChevronRight className="size-4" />,
            DayContent: ({ date }) => {
              const colors = p.dayColors.get(ymd(date));
              return (
                <span className="relative flex size-full items-center justify-center">
                  {date.getDate()}
                  {colors && colors.length > 0 && (
                    <span className="pointer-events-none absolute bottom-px left-1/2 flex -translate-x-1/2 gap-[2px]">
                      {colors.map((c, i) => (
                        <span key={i} className="size-[3px] rounded-full" style={{ background: c }} />
                      ))}
                    </span>
                  )}
                </span>
              );
            },
          }}
          className="mx-auto p-1"
          classNames={{
            months: "flex flex-col",
            month: "space-y-2",
            caption: "flex justify-center pt-0.5 relative items-center",
            caption_label: "text-xs font-medium",
            nav_button: "h-6 w-6 bg-transparent p-0 opacity-70 hover:opacity-100 inline-flex items-center justify-center rounded-md border",
            table: "w-full border-collapse",
            head_cell: "text-muted-foreground w-7 font-normal text-[10px]",
            row: "flex w-full mt-1",
            cell: "relative p-0 text-center text-xs focus-within:relative focus-within:z-20 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md",
            day: "h-7 w-7 p-0 font-normal aria-selected:opacity-100 inline-flex items-center justify-center rounded-md hover:bg-muted text-xs",
          }}
        />
      </div>
    </div>
  );
}

// ── invites inbox ────────────────────────────────────────────────────────────

// Unaccepted calendar invites, shown as a section INSIDE the calendar sidebar
// (the notification bell was removed — new invites also arrive in the global
// notifications). Renders nothing when there are none.
function PendingInvites({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.calendar.${k}`, { defaultValue: d });
  const tf = useTimeFmt();
  const { months } = useCalNames();
  const invites = useMyInvites(companyId);
  const respond = useRespondInvite(companyId);
  const list = invites.data ?? [];
  if (list.length === 0) return null;
  return (
    <div className="shrink-0 border-b p-2">
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Bell className="size-3.5" />
        {tr("pendingInvites", "Qabul qilinmagan takliflar")}
        <span className="ml-auto grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
          {list.length}
        </span>
      </div>
      <div className="space-y-1.5">
        {list.map((i) => (
          <div key={i.id} className="rounded-lg border bg-background p-2">
            <div className="truncate text-sm font-medium">{i.title || "—"}</div>
            <div className="truncate text-[11px] text-muted-foreground">
              {new Date(i.startsAt).getDate()} {months[new Date(i.startsAt).getMonth()]} · {tf.time(new Date(i.startsAt))} {i.location && `· ${i.location}`}
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <Button size="sm" className="h-7 flex-1 gap-1 text-xs" onClick={() => respond.mutate({ inviteId: i.id, accept: true })}>
                <Check className="size-3" /> {tr("accept", "Qabul qilish")}
              </Button>
              <Button size="sm" variant="outline" className="h-7 flex-1 gap-1 text-xs" onClick={() => respond.mutate({ inviteId: i.id, accept: false })}>
                <X className="size-3" /> {tr("decline", "Rad etish")}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── calendar create/edit dialog ──────────────────────────────────────────────

function CalendarEditDialog({
  companyId,
  cal,
  onClose,
}: {
  companyId: number;
  cal: CalendarInfo | "new" | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.calendar.${k}`, { defaultValue: d });
  const save = useSaveCalendar(companyId);
  const del = useDeleteCalendar(companyId);
  const isNew = cal === "new";
  const existing = isNew || !cal ? null : cal;

  const [name, setName] = useState("");
  const [color, setColor] = useState(SWATCHES[0]);
  const [kind, setKind] = useState<"local" | "ics">("local");
  const [icsUrl, setIcsUrl] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  // Per-calendar ICS share link (local calendars only), generated on demand.
  const shareLink = useCalendarFeedLink(companyId, existing?.id ?? "");
  const [copied, setCopied] = useState(false);

  // Seed on open (cal changes identity each time the dialog opens).
  const [seeded, setSeeded] = useState<string | null>(null);
  const calKey = cal === null ? null : isNew ? "new" : cal.id;
  if (calKey !== seeded) {
    setSeeded(calKey);
    setConfirmDel(false);
    if (existing) {
      setName(existing.name);
      setColor(existing.color);
      setKind(existing.kind);
      setIcsUrl(existing.icsUrl ?? "");
    } else {
      setName("");
      setColor(SWATCHES[0]);
      setKind("local");
      setIcsUrl("");
    }
  }

  const submit = async () => {
    await save.mutateAsync({
      id: existing?.id ?? uid("cal"),
      name: name.trim() || tr("untitled", "Nomsiz"),
      color,
      kind,
      icsUrl: kind === "ics" ? icsUrl.trim() : null,
      order: existing?.order ?? 0,
    });
    onClose();
  };

  return (
    <Dialog open={cal !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isNew ? tr("newCalendar", "Yangi kalendar") : tr("editCalendar", "Kalendarni tahrirlash")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("calNamePh", "Nomi")} />
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className="grid size-6 place-items-center rounded-full" style={{ background: c }}>
                {color === c && <Check className="size-3.5 text-white" />}
              </button>
            ))}
          </div>
          {/* Type is chosen ONCE at creation — an existing calendar's type is
              fixed (a local calendar can't become an ICS subscription, and vice
              versa), so we show it read-only when editing. */}
          {existing ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{tr("type", "Turi")}:</span>
              <span className="rounded-md border bg-muted/50 px-2 py-1 font-medium text-foreground">
                {kind === "local" ? tr("kindLocal", "Oddiy") : tr("kindIcs", "ICS obuna")}
              </span>
            </div>
          ) : (
            <div className="inline-flex rounded-lg border bg-muted/50 p-0.5">
              {(["local", "ics"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "rounded-md px-3 py-1 text-xs font-medium",
                    kind === k ? "bg-background shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {k === "local" ? tr("kindLocal", "Oddiy") : tr("kindIcs", "ICS obuna")}
                </button>
              ))}
            </div>
          )}
          {kind === "ics" && (
            <Input
              value={icsUrl}
              onChange={(e) => setIcsUrl(e.target.value)}
              placeholder="https://…/calendar.ics"
              className="font-mono text-xs"
            />
          )}

          {/* Per-calendar share — this LOCAL calendar's own ICS export link,
              generated on demand (each calendar is shared independently). */}
          {existing && kind === "local" && (
            <div className="space-y-1.5 rounded-lg border p-2.5">
              <div className="text-xs font-semibold text-muted-foreground">
                {tr("shareCalendar", "Bu kalendarni ulashish")}
              </div>
              <div className="text-[11px] leading-snug text-muted-foreground">
                {tr("shareHint", "ICS havolani Apple/Google kalendarga obuna qiling — faqat shu kalendar tadbirlari. Havola maxfiy!")}
              </div>
              {!shareLink.data ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5"
                  disabled={shareLink.isPending}
                  onClick={() => shareLink.mutate()}
                >
                  {shareLink.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
                  {tr("generateIcs", "ICS havola yaratish")}
                </Button>
              ) : (
                <div className="flex gap-1.5">
                  <Input readOnly value={shareLink.data.url} className="h-8 font-mono text-[10px]" onFocus={(e) => e.target.select()} />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    onClick={async () => {
                      await navigator.clipboard.writeText(shareLink.data!.url);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between pt-1">
          {existing ? (
            confirmDel ? (
              <div className="flex gap-1.5">
                <Button size="sm" variant="destructive" onClick={async () => { await del.mutateAsync(existing.id); onClose(); }}>
                  {t("common.delete", { defaultValue: "O'chirish" })}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDel(false)}>
                  {t("modules.tasks.actions.cancel", { defaultValue: "Bekor qilish" })}
                </Button>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmDel(true)} className="text-sm text-destructive hover:underline">
                {t("common.delete", { defaultValue: "O'chirish" })}
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t("modules.tasks.actions.cancel", { defaultValue: "Bekor qilish" })}</Button>
            <Button onClick={submit} disabled={save.isPending || (kind === "ics" && !icsUrl.trim())}>
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : t("modules.tasks.actions.save", { defaultValue: "Saqlash" })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
