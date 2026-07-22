import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Columns3 } from "lucide-react";

type Col = { key: string; label: string };

export type ColumnGroup = {
  title: string;
  columns: Col[];
  hidden: Set<string>;
  onToggle: (key: string) => void;
};

/** Single "Ustunlar" button — one dropdown, with grouped sections inside. */
export function ColumnToggle({ groups }: { groups: ColumnGroup[] }) {
  const { t } = useTranslation();
  const total = groups.reduce((s, g) => s + g.columns.length, 0);
  const visible = groups.reduce(
    (s, g) => s + g.columns.filter((c) => !g.hidden.has(c.key)).length,
    0
  );
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Columns3 className="size-4 mr-2" />
          {t("modules.soliq.columnToggle.columns")} ({visible}/{total})
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 max-h-[70vh] overflow-y-auto">
        <div className="space-y-3">
          {groups.map((g) => (
            <div key={g.title} className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                {g.title}
              </div>
              {g.columns.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!g.hidden.has(c.key)}
                    onCheckedChange={() => g.onToggle(c.key)}
                  />
                  {c.label}
                </label>
              ))}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function useHiddenCols(storageKey: string): [Set<string>, (k: string) => void] {
  const [hidden, setHidden] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? new Set<string>(JSON.parse(raw)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(Array.from(hidden))); } catch { /* */ }
  }, [hidden, storageKey]);
  const toggle = (k: string) => {
    setHidden((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };
  return [hidden, toggle];
}
