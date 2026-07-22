// Date-jump calendar — a compact month grid modal, ported in spirit from
// Telegram Web A's DateJumpModal / CalendarModal. Clicking a date asks the
// message list to jump to the first message on-or-after that day (loading older
// history if needed). Rendered through a portal so it overlays the whole
// surface; the panel carries `.tg-surface` so the `--tg-*` tokens resolve even
// though the portal target (document.body) sits outside the chat pane.
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { dateLocale } from "./shared";

/** Local-midnight epoch for a date — the unit we compare calendar days in. */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export function TgDateJumpModal({
  seed,
  maxDate,
  tr,
  onPick,
  onGoToLatest,
  onClose,
}: {
  /** Month the calendar opens on (the clicked pill's date). */
  seed: Date;
  /** Latest selectable day (defaults to today); later days are disabled. */
  maxDate?: Date;
  tr: (k: string, d: string) => string;
  /** A day was picked — the list jumps to the first message on-or-after it. */
  onPick: (date: Date) => void;
  /** Optional "jump to the newest messages" affordance in the footer. */
  onGoToLatest?: () => void;
  onClose: () => void;
}) {
  // First-of-month currently shown.
  const [view, setView] = useState(() => new Date(seed.getFullYear(), seed.getMonth(), 1));

  const max = maxDate ?? new Date();
  const maxStart = startOfDay(max);
  const todayStart = startOfDay(new Date());

  // Monday-first weekday short labels in the active locale (matches TG Web A).
  const weekdays = useMemo(() => {
    const monday = new Date(2021, 10, 1); // 2021-11-01 was a Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d.toLocaleDateString(dateLocale(), { weekday: "short" });
    });
  }, []);

  const monthLabel = view.toLocaleDateString(dateLocale(), { month: "long", year: "numeric" });

  // Leading blanks (Monday-based) + each day of the shown month.
  const cells = useMemo<(Date | null)[]>(() => {
    const y = view.getFullYear();
    const m = view.getMonth();
    const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // 0 = Monday
    const days = new Date(y, m + 1, 0).getDate();
    const out: (Date | null)[] = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let d = 1; d <= days; d++) out.push(new Date(y, m, d));
    return out;
  }, [view]);

  // Don't page into a month that lies entirely in the future.
  const canNext =
    new Date(view.getFullYear(), view.getMonth(), 1).getTime() <
    new Date(max.getFullYear(), max.getMonth(), 1).getTime();

  const step = (delta: number) =>
    setView((v) => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="tg-surface w-[20rem] max-w-full overflow-hidden rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-panel)] shadow-2xl"
      >
        {/* header — month label + prev/next nav + close */}
        <div className="flex items-center gap-1 border-b border-[var(--tg-border)] px-2 py-2">
          <span className="flex items-center gap-2 px-2 text-[15px] font-semibold text-[var(--tg-text)]">
            <Calendar className="size-4 text-[var(--tg-text-secondary)]" />
            <span className="capitalize">{monthLabel}</span>
          </span>
          <div className="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => step(-1)}
              aria-label={tr("prevMonth", "Previous month")}
              className="grid size-8 place-items-center rounded-full text-[var(--tg-text-secondary)] hover:bg-[var(--tg-hover)] hover:text-[var(--tg-text)]"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => canNext && step(1)}
              disabled={!canNext}
              aria-label={tr("nextMonth", "Next month")}
              className="grid size-8 place-items-center rounded-full text-[var(--tg-text-secondary)] hover:bg-[var(--tg-hover)] hover:text-[var(--tg-text)] disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="size-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={tr("close", "Close")}
              className="ml-0.5 grid size-8 place-items-center rounded-full text-[var(--tg-text-secondary)] hover:bg-[var(--tg-hover)] hover:text-[var(--tg-text)]"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* weekday header */}
        <div className="grid grid-cols-7 px-3 pt-3 text-center text-[11px] font-medium uppercase text-[var(--tg-text-secondary)]">
          {weekdays.map((w, i) => (
            <span key={i} className="py-1">
              {w}
            </span>
          ))}
        </div>

        {/* day grid — click a day to jump there */}
        <div className="grid grid-cols-7 gap-y-1 px-3 pb-3">
          {cells.map((d, i) => {
            if (!d) return <span key={`b${i}`} />;
            const ds = startOfDay(d);
            const disabled = ds > maxStart;
            const isToday = ds === todayStart;
            return (
              <div key={d.getTime()} className="flex justify-center">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onPick(d)}
                  className={cn(
                    "grid size-9 place-items-center rounded-full text-[13px] tabular-nums transition-colors",
                    disabled
                      ? "cursor-default text-[var(--tg-text-secondary)] opacity-30"
                      : "text-[var(--tg-text)] hover:bg-[var(--tg-primary)] hover:text-white",
                    isToday && !disabled && "font-semibold text-[var(--tg-primary)]",
                  )}
                >
                  {d.getDate()}
                </button>
              </div>
            );
          })}
        </div>

        {onGoToLatest && (
          <button
            type="button"
            onClick={onGoToLatest}
            className="w-full border-t border-[var(--tg-border)] px-3 py-2.5 text-center text-[13px] font-medium text-[var(--tg-primary)] hover:bg-[var(--tg-hover)]"
          >
            {tr("goToLatest", "Go to the latest messages")}
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
