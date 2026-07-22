// The four calendar views, styled after the macOS Calendar app on our design
// system: Month = clean 7-col grid with colored event pills; Week/Day = an
// hour timeline with a live "now" line, positioned event blocks and an all-day
// lane (auto-scrolls to the current hour on mount); Year = 12 mini-months.
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, Clock } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useTimeFmt } from "@/shared/store/prefs";
import type { EventOccurrence, TaskDue } from "./api";
import { DAY_MS, addDays, chipOrder, isSameDay, monthGrid, onDay, startOfDay, startOfWeek, ymd } from "./util";

export type ViewProps = {
  cursor: Date;
  events: EventOccurrence[];
  tasks: TaskDue[];
  onEvent: (e: EventOccurrence) => void;
  onTask: (t: TaskDue) => void;
  onDay: (d: Date) => void;
  /** Create an event at this local time (double-click / tap on empty space). */
  onCreateAt: (d: Date) => void;
};

export function useCalNames() {
  const { t } = useTranslation();
  const months = useMemo(
    () =>
      [
        "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
        "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
      ].map((d, i) => t(`modules.calendar.months.${i}`, { defaultValue: d })),
    [t],
  );
  const days = useMemo(
    () =>
      ["Du", "Se", "Cho", "Pa", "Ju", "Sha", "Ya"].map((d, i) =>
        t(`modules.calendar.days.${i}`, { defaultValue: d }),
      ),
    [t],
  );
  // Full weekday names, shown in the month header when there's room (see MonthView).
  const daysFull = useMemo(
    () =>
      ["Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba", "Yakshanba"].map(
        (d, i) => t(`modules.calendar.daysFull.${i}`, { defaultValue: d }),
      ),
    [t],
  );
  return { months, days, daysFull };
}

function TaskChip({ task, onClick, compact }: { task: TaskDue; onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={`${task.projectKey} · ${task.title}`}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded-md px-1.5 py-px text-left text-[11px] leading-5 hover:bg-muted",
        task.done && "text-muted-foreground line-through",
      )}
    >
      {task.done ? (
        <CheckCircle2 className="size-3 shrink-0 text-emerald-500" />
      ) : (
        <Circle className="size-3 shrink-0" style={{ color: task.color }} />
      )}
      <span className="truncate">{compact ? task.title : `${task.projectKey}: ${task.title}`}</span>
    </button>
  );
}

// A month-grid event pill: all-day = solid colored bar, timed = colored dot +
// time + title (macOS Calendar look).
function EventChip({ ev, onClick }: { ev: EventOccurrence; onClick: () => void }) {
  const tf = useTimeFmt();
  const time = ev.allDay ? "" : tf.time(new Date(ev.startsAt));
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={ev.title}
      className={cn(
        "flex w-full items-center gap-1 truncate rounded-md px-1.5 py-px text-left text-[11px] font-medium leading-5",
        ev.allDay ? "text-white hover:opacity-90" : "hover:bg-muted",
      )}
      style={ev.allDay ? { background: ev.color } : undefined}
    >
      {!ev.allDay && <span className="size-1.5 shrink-0 rounded-full" style={{ background: ev.color }} />}
      {time && <span className="shrink-0 font-normal tabular-nums text-muted-foreground">{time}</span>}
      <span className="truncate">{ev.title || "—"}</span>
    </button>
  );
}

// ── Month ────────────────────────────────────────────────────────────────────

export function MonthView(p: ViewProps) {
  const { t } = useTranslation();
  const { days, daysFull } = useCalNames();
  const cells = monthGrid(p.cursor);
  const today = new Date();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b bg-muted/20 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {days.map((d, i) => (
          <div key={d} className="py-1.5">
            {/* Full weekday name when the column is wide enough; abbreviation otherwise. */}
            <span className="lg:hidden">{d}</span>
            <span className="hidden normal-case tracking-normal lg:inline">{daysFull[i]}</span>
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {cells.map((d) => {
          const inMonth = d.getMonth() === p.cursor.getMonth();
          const isToday = isSameDay(d, today);
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const evs = p.events
            .filter((e) => onDay(new Date(e.startsAt), new Date(e.endsAt), d))
            .sort(chipOrder);
          const tks = p.tasks.filter((t) => t.due === ymd(d));
          const total = evs.length + tks.length;
          const maxChips = 3;
          return (
            <div
              key={d.toISOString()}
              onClick={() => p.onCreateAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9))}
              className={cn(
                "group flex min-h-0 cursor-pointer flex-col gap-px overflow-hidden border-b border-r p-1 transition-colors hover:bg-muted/40",
                !inMonth ? "bg-muted/30 text-muted-foreground" : isWeekend && "bg-muted/10",
              )}
            >
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); p.onDay(d); }}
                className={cn(
                  "ml-auto grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium tabular-nums transition-colors",
                  isToday
                    ? "bg-primary font-semibold text-primary-foreground"
                    : inMonth
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground hover:bg-muted",
                )}
                title={ymd(d)}
              >
                {d.getDate()}
              </button>
              {evs.slice(0, maxChips).map((e) => (
                <EventChip key={e.id} ev={e} onClick={() => p.onEvent(e)} />
              ))}
              {tks.slice(0, Math.max(0, maxChips - evs.length)).map((t) => (
                <TaskChip key={t.id} task={t} onClick={() => p.onTask(t)} compact />
              ))}
              {total > maxChips && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); p.onDay(d); }}
                  className="px-1.5 text-left text-[10px] font-medium text-muted-foreground hover:text-foreground"
                >
                  {t("modules.calendar.more", { defaultValue: "+{{n}} ko'proq", n: total - maxChips })}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week / Day (hour timeline) ───────────────────────────────────────────────

const HOUR_PX = 52;

function TimeGrid({ p, dayCount }: { p: ViewProps; dayCount: 1 | 7 }) {
  const { days } = useCalNames();
  const tf = useTimeFmt();
  const start = dayCount === 7 ? startOfWeek(p.cursor) : startOfDay(p.cursor);
  const cols = Array.from({ length: dayCount }, (_, i) => addDays(start, i));
  const today = new Date();
  const nowTop = (today.getHours() * 60 + today.getMinutes()) * (HOUR_PX / 60);

  // Auto-scroll the hour timeline so the current hour sits near the top on
  // mount (and whenever the visible day/week changes) — macOS Calendar does the
  // same. Keeps the "now" line comfortably in view, a little below the edge.
  const scrollRef = useRef<HTMLDivElement>(null);
  const cursorKey = ymd(p.cursor);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = Math.max(0, nowTop - Math.min(el.clientHeight * 0.3, 2 * HOUR_PX));
    // Only re-run on mount / when the shown range changes, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayCount, cursorKey]);

  const allDayOf = (d: Date) =>
    p.events.filter((e) => e.allDay && onDay(new Date(e.startsAt), new Date(e.endsAt), d));
  const tasksOf = (d: Date) => p.tasks.filter((t) => t.due === ymd(d));
  const timedOf = (d: Date) =>
    p.events
      .filter((e) => !e.allDay && onDay(new Date(e.startsAt), new Date(e.endsAt), d))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  const gridCols = `56px repeat(${dayCount}, minmax(0, 1fr))`;
  const hasAllDay = cols.some((d) => allDayOf(d).length > 0 || tasksOf(d).length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* day headers */}
      <div className="grid shrink-0 border-b" style={{ gridTemplateColumns: gridCols }}>
        <div />
        {cols.map((d, i) => {
          const isToday = isSameDay(d, today);
          return (
            <button
              key={i}
              type="button"
              onClick={() => p.onDay(d)}
              className="flex items-center justify-center gap-1.5 border-l py-2 text-xs transition-colors hover:bg-muted/50"
            >
              <span className={cn("uppercase tracking-wide", isToday ? "text-primary" : "text-muted-foreground")}>
                {days[(d.getDay() + 6) % 7]}
              </span>
              <span
                className={cn(
                  "grid size-6 place-items-center rounded-full text-sm font-semibold tabular-nums",
                  isToday && "bg-primary text-primary-foreground",
                )}
              >
                {d.getDate()}
              </span>
            </button>
          );
        })}
      </div>
      {/* all-day + tasks lane (only when there's something to show) */}
      {hasAllDay && (
        <div className="grid max-h-28 shrink-0 overflow-y-auto border-b bg-muted/20" style={{ gridTemplateColumns: gridCols }}>
          <div className="py-1 pr-1.5 text-right text-[10px] uppercase tracking-wide text-muted-foreground">24h</div>
          {cols.map((d, i) => (
            <div key={i} className="space-y-0.5 border-l p-0.5">
              {allDayOf(d).map((e) => (
                <EventChip key={e.id} ev={e} onClick={() => p.onEvent(e)} />
              ))}
              {tasksOf(d).map((t) => (
                <TaskChip key={t.id} task={t} onClick={() => p.onTask(t)} compact={dayCount === 7} />
              ))}
            </div>
          ))}
        </div>
      )}
      {/* hour grid */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative grid" style={{ gridTemplateColumns: gridCols, height: HOUR_PX * 24 }}>
          {/* hour labels */}
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute right-1.5 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground" style={{ top: h * HOUR_PX }}>
                {h > 0 && tf.hour(h)}
              </div>
            ))}
          </div>
          {cols.map((d, i) => {
            const evs = timedOf(d);
            const isToday = isSameDay(d, today);
            return (
              <div
                key={i}
                className="relative border-l"
                onDoubleClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const mins = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 60);
                  const h = Math.max(0, Math.min(23, Math.floor(mins / 60)));
                  p.onCreateAt(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h));
                }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="absolute inset-x-0 border-t border-border/50" style={{ top: h * HOUR_PX }} />
                ))}
                {isToday && (
                  <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-red-500" style={{ top: nowTop }}>
                    <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-red-500 shadow-sm" />
                  </div>
                )}
                {evs.map((e, idx) => {
                  const s = new Date(e.startsAt);
                  const en = new Date(e.endsAt);
                  const dayStart = startOfDay(d).getTime();
                  const topMin = Math.max(0, (s.getTime() - dayStart) / 60000);
                  const endMin = Math.min(1440, (en.getTime() - dayStart) / 60000);
                  const height = Math.max(20, (endMin - topMin) * (HOUR_PX / 60));
                  // Naive overlap offset: consecutive overlapping events indent.
                  const overlap = evs.slice(0, idx).filter((x) => new Date(x.endsAt) > s && new Date(x.startsAt) < en).length;
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={(ev2) => { ev2.stopPropagation(); p.onEvent(e); }}
                      className="absolute z-[5] overflow-hidden rounded-lg py-1 pl-3 pr-2 text-left leading-tight transition-shadow hover:z-[6] hover:shadow-md"
                      style={{
                        top: topMin * (HOUR_PX / 60),
                        height,
                        left: `calc(${overlap * 12}% + 2px)`,
                        right: 2,
                        background: `${e.color}1f`,
                        color: e.color,
                      }}
                    >
                      {/* left accent bar (inset, rounded) — no border */}
                      <span
                        className="absolute inset-y-1 left-1 w-1 rounded-full"
                        style={{ background: e.color }}
                      />
                      <div className="truncate text-[12px] font-bold">{e.title || "—"}</div>
                      {height > 30 && (
                        <div className="mt-0.5 flex items-center gap-1 truncate text-[11px] opacity-85">
                          <Clock className="size-3 shrink-0" />
                          {tf.time(s)}–{tf.time(en)}{e.location ? ` · ${e.location}` : ""}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export const WeekView = (p: ViewProps) => <TimeGrid p={p} dayCount={7} />;
export const DayView = (p: ViewProps) => <TimeGrid p={p} dayCount={1} />;

// ── Year ─────────────────────────────────────────────────────────────────────

export function YearView(p: ViewProps & { onMonth: (d: Date) => void }) {
  const { months, days } = useCalNames();
  const year = p.cursor.getFullYear();
  const today = new Date();
  // Days with any activity → dot markers.
  const busy = useMemo(() => {
    const set = new Set<string>();
    for (const e of p.events) {
      const s = new Date(e.startsAt);
      const en = new Date(e.endsAt);
      for (let t = startOfDay(s).getTime(); t < en.getTime(); t += DAY_MS) {
        set.add(ymd(new Date(t)));
      }
    }
    for (const t of p.tasks) set.add(t.due);
    return set;
  }, [p.events, p.tasks]);

  return (
    <div className="grid h-full grid-cols-1 gap-x-6 gap-y-5 overflow-y-auto p-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 12 }, (_, m) => {
        const first = new Date(year, m, 1);
        const cells = monthGrid(first);
        const isCurMonth = today.getFullYear() === year && today.getMonth() === m;
        return (
          <div key={m} className="min-w-0">
            <button
              type="button"
              onClick={() => p.onMonth(first)}
              className={cn(
                "mb-2 text-[15px] font-semibold hover:underline",
                isCurMonth ? "text-primary" : "text-foreground",
              )}
            >
              {months[m]}
            </button>
            <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
              {days.map((d) => (
                <div key={d}>{d.slice(0, 1)}</div>
              ))}
            </div>
            <div className="mt-0.5 grid grid-cols-7 text-center">
              {cells.map((d, i) => {
                const inMonth = d.getMonth() === m;
                const isToday = isSameDay(d, today);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => p.onDay(d)}
                    className={cn("relative grid h-8 place-items-center text-[13px] tabular-nums", !inMonth && "invisible")}
                  >
                    <span className={cn("grid size-7 place-items-center rounded-full transition-colors", isToday ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted")}>
                      {d.getDate()}
                    </span>
                    {busy.has(ymd(d)) && !isToday && (
                      <span className="absolute bottom-0 size-1 rounded-full bg-primary/60" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
