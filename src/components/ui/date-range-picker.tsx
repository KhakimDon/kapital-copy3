import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type { DateRange };

/** ISO YYYY-MM-DD ↔ Date helpers (local, no UTC shift). */
export function isoToDate(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}
export function dateToIso(d?: Date): string | undefined {
  if (!d) return undefined;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function DateRangePicker({
  value,
  onChange,
  className,
  numberOfMonths = 2,
  placeholder = "Sana oralig'i",
}: {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  numberOfMonths?: number;
  placeholder?: string;
}) {
  const label =
    value?.from && value?.to
      ? `${format(value.from, "dd.MM.yyyy")} — ${format(value.to, "dd.MM.yyyy")}`
      : value?.from
        ? format(value.from, "dd.MM.yyyy")
        : placeholder;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("justify-start text-left font-normal min-w-[260px]", className)}
        >
          <CalendarIcon className="mr-2 size-4 shrink-0" />
          <span className={value?.from ? "" : "text-muted-foreground"}>{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={value?.from}
          selected={value}
          onSelect={onChange}
          numberOfMonths={numberOfMonths}
        />
        <div className="flex items-center justify-between border-t p-2">
          <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
            Tozalash
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
