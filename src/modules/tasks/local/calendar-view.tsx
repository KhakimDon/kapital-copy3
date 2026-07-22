import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { PRIORITY_META, type Card, type Member, type Project } from "./model";
import { fmtDay, monthGrid, parseDay } from "./util";

const MONTHS_UZ = [
  "Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun",
  "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr",
];
const DOW_UZ = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

export function CalendarView({
  cards,
  onOpen,
}: {
  project: Project;
  cards: Card[];
  members: Member[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const grid = monthGrid(ym.y, ym.m);
  const todayKey = fmtDay(today.toISOString());

  const byDay = new Map<string, Card[]>();
  for (const c of cards) {
    const d = parseDay(c.dueDate);
    if (!d) continue;
    const key = fmtDay(d.toISOString());
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(c);
  }

  const shift = (delta: number) => {
    setYm(({ y, m }) => {
      const nm = m + delta;
      return { y: y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
    });
  };

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <span className="text-sm font-semibold">
          {t(`modules.tasks.months.${ym.m}`, { defaultValue: MONTHS_UZ[ym.m] })} {ym.y}
        </span>
        <span className="flex-1" />
        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => shift(-1)}>
          <ChevronLeft className="size-4" />
        </Button>
        <Button size="sm" variant="outline" className="h-7" onClick={() => setYm({ y: today.getFullYear(), m: today.getMonth() })}>
          {t("modules.tasks.calendar.today", { defaultValue: "Bugun" })}
        </Button>
        <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => shift(1)}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 border-b bg-muted/30">
        {DOW_UZ.map((d, i) => (
          <div key={d} className="px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground">
            {t(`modules.tasks.dow.${i}`, { defaultValue: d })}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {grid.map((day, i) => {
          const key = fmtDay(day.toISOString());
          const inMonth = day.getMonth() === ym.m;
          const isToday = key === todayKey;
          const items = byDay.get(key) ?? [];
          return (
            <div
              key={i}
              className={cn(
                "min-h-[92px] border-b border-r p-1 last-in-row",
                (i + 1) % 7 === 0 && "border-r-0",
                !inMonth && "bg-muted/20",
              )}
            >
              <div
                className={cn(
                  "inline-flex items-center justify-center text-[11px] w-5 h-5 rounded-full mb-0.5",
                  isToday ? "bg-primary text-primary-foreground font-semibold" : "text-muted-foreground",
                  !inMonth && "opacity-40",
                )}
              >
                {day.getDate()}
              </div>
              <div className="space-y-1">
                {items.slice(0, 3).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onOpen(c.id)}
                    className="block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium text-white hover:opacity-90"
                    style={{ background: PRIORITY_META[c.priority].color }}
                    title={c.title}
                  >
                    {c.title}
                  </button>
                ))}
                {items.length > 3 && (
                  <div className="px-1.5 text-[11px] text-muted-foreground">+{items.length - 3}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
