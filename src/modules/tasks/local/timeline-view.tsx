import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/utils";
import { PRIORITY_META, type Card, type Member, type Project } from "./model";
import { AvatarStack } from "./pieces";
import { cardKey, daysBetween, parseDay } from "./util";

const DAY_W = 34;
const LABEL_W = 240;

export function TimelineView({
  project,
  cards,
  members,
  onOpen,
}: {
  project: Project;
  cards: Card[];
  members: Member[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();

  const dated = cards.filter((c) => c.startDate || c.dueDate);
  const undated = cards.length - dated.length;

  // Build the date window: a little padding around the min/max of all dates + today.
  const today = new Date();
  let min = new Date(today);
  let max = new Date(today);
  for (const c of dated) {
    for (const iso of [c.startDate, c.dueDate]) {
      const d = parseDay(iso);
      if (!d) continue;
      if (d < min) min = d;
      if (d > max) max = d;
    }
  }
  min = new Date(min.getFullYear(), min.getMonth(), min.getDate() - 2);
  max = new Date(max.getFullYear(), max.getMonth(), max.getDate() + 3);
  const totalDays = Math.max(14, daysBetween(min, max) + 1);
  const days = Array.from({ length: totalDays }, (_, i) => new Date(min.getFullYear(), min.getMonth(), min.getDate() + i));
  const trackW = totalDays * DAY_W;
  const todayIdx = daysBetween(min, today);

  const barFor = (c: Card) => {
    const s = parseDay(c.startDate) ?? parseDay(c.dueDate)!;
    const e = parseDay(c.dueDate) ?? parseDay(c.startDate)!;
    const startIdx = Math.max(0, daysBetween(min, s));
    const endIdx = Math.min(totalDays - 1, daysBetween(min, e));
    const span = Math.max(1, endIdx - startIdx + 1);
    return { left: startIdx * DAY_W, width: span * DAY_W - 4 };
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <div style={{ width: LABEL_W + trackW }}>
          {/* header */}
          <div className="flex border-b bg-muted/30">
            <div
              className="sticky left-0 z-20 shrink-0 bg-muted/30 px-3 py-1.5 text-xs font-medium text-muted-foreground"
              style={{ width: LABEL_W }}
            >
              {t("modules.tasks.title", { defaultValue: "Vazifalar" })}
            </div>
            <div className="relative flex" style={{ width: trackW }}>
              {days.map((d, i) => {
                const first = d.getDate() === 1 || i === 0;
                const weekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={i}
                    className={cn(
                      "shrink-0 border-l text-center text-[10px] leading-tight py-1",
                      weekend ? "bg-muted/40 text-muted-foreground" : "text-muted-foreground",
                    )}
                    style={{ width: DAY_W }}
                  >
                    <div className="font-medium">{d.getDate()}</div>
                    {first && (
                      <div className="text-[9px] opacity-70">
                        {t(`modules.tasks.monthsShort.${d.getMonth()}`, { defaultValue: MONTHS_SHORT[d.getMonth()] })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* rows */}
          <div className="relative">
            {/* today line */}
            {todayIdx >= 0 && todayIdx < totalDays && (
              <div
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary/60 z-10"
                style={{ left: LABEL_W + todayIdx * DAY_W + DAY_W / 2 }}
              />
            )}
            {dated.map((c) => {
              const bar = barFor(c);
              const color = PRIORITY_META[c.priority].color;
              return (
                <div key={c.id} className="flex items-center border-b hover:bg-muted/30 transition-colors">
                  <button
                    type="button"
                    onClick={() => onOpen(c.id)}
                    className="sticky left-0 z-10 flex shrink-0 items-center gap-2 bg-card px-3 py-2 text-left"
                    style={{ width: LABEL_W }}
                  >
                    <span className="font-mono text-[10px] text-muted-foreground shrink-0">{cardKey(project, c)}</span>
                    <span className="truncate text-sm">{c.title}</span>
                  </button>
                  <div className="relative" style={{ width: trackW, height: 40 }}>
                    <button
                      type="button"
                      onClick={() => onOpen(c.id)}
                      className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-white shadow-sm hover:brightness-110 transition-all overflow-hidden"
                      style={{ left: bar.left + 2, width: bar.width, height: 24, background: color }}
                      title={c.title}
                    >
                      <span className="truncate">{c.title}</span>
                      {c.assigneeIds.length > 0 && (
                        <span className="ml-auto shrink-0">
                          <AvatarStack memberIds={c.assigneeIds} members={members} size={18} max={2} />
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
            {dated.length === 0 && (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                {t("modules.tasks.timeline.empty", { defaultValue: "Sanasi belgilangan vazifa yo'q" })}
              </div>
            )}
          </div>
        </div>
      </div>
      {undated > 0 && (
        <div className="px-3 py-1.5 text-[11px] text-muted-foreground border-t bg-muted/20">
          {t("modules.tasks.timeline.undated", { defaultValue: "{{n}} ta vazifada sana yo'q", n: undated })}
        </div>
      )}
    </div>
  );
}

const MONTHS_SHORT = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];
