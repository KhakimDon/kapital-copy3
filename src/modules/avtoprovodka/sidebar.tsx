/**
 * Left-rail source switcher. Mirrors cloud `.aiba-av-sidebar` 1:1:
 *
 *   - Four tabs: Documents / Bank txns / Cheques / Vedmosti
 *   - Each carries an icon, a label, and a per-source count badge
 *   - Collapsible: 200px expanded, 64px collapsed (icons only)
 *
 * Collapsed state is persisted to localStorage so the user's choice
 * survives navigation between modules.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText, Banknote, Receipt, Sheet as SheetIcon, Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { AvSource } from "./api";
import { SOURCE_TAB_LABEL } from "./api";

const COLLAPSE_KEY = "aiba_av_sidebar_collapsed";

const TABS: { key: AvSource; icon: typeof FileText }[] = [
  { key: "document", icon: FileText },
  { key: "bank_txn", icon: Banknote },
  { key: "fiscal_cheque", icon: Receipt },
  { key: "vedmosti", icon: SheetIcon },
];

export function AvSidebar({
  source,
  onChange,
  counts,
}: {
  source: AvSource;
  onChange: (s: AvSource) => void;
  counts: Record<AvSource, number> | null;
}) {
  const { t } = useTranslation();
  // Fall back to the hard-coded Uzbek labels if a translation is missing.
  // Explicit string return type avoids TS7023 ("any" inference from t()).
  const tabLabel = (key: AvSource): string =>
    String(t(`modules.avtoprovodka.sources.${key}`, { defaultValue: SOURCE_TAB_LABEL[key] }));

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* quota or disabled storage — fail open */
    }
  }, [collapsed]);

  return (
    <aside
      className={cn(
        "shrink-0 border-r border-border bg-sidebar flex flex-col gap-1 p-2 transition-[width] duration-200",
        collapsed ? "w-16" : "w-52"
      )}
      role="tablist"
      aria-label="Ma'lumot manbalari"
    >
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCollapsed((v) => !v)}
        className="size-auto p-2 text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
        aria-label={collapsed ? "Panelni kengaytirish" : "Panelni yig'ish"}
        title={collapsed ? "Panelni kengaytirish" : "Panelni yig'ish"}
      >
        <Menu className="size-5" />
      </Button>

      <div className="my-1 border-t border-border" />

      {TABS.map(({ key, icon: Icon }) => {
        const isActive = source === key;
        const count = counts?.[key] ?? 0;
        return (
          <Button
            key={key}
            variant="ghost"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className={cn(
              "group h-auto justify-start rounded-md text-sm font-normal transition-colors",
              collapsed ? "justify-center p-2.5 [&_svg]:size-5" : "gap-3 px-3 py-2.5",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium hover:bg-sidebar-accent"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            )}
            title={collapsed ? tabLabel(key) : undefined}
          >
            <Icon className={cn("shrink-0", collapsed ? "size-5" : "size-4")} />
            {!collapsed && (
              <>
                <span className="flex-1 truncate text-left">{tabLabel(key)}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums",
                    isActive
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground group-hover:bg-muted/80"
                  )}
                >
                  {count}
                </span>
              </>
            )}
            {collapsed && count > 0 && (
              <span className="sr-only">
                {tabLabel(key)} ({count})
              </span>
            )}
          </Button>
        );
      })}
    </aside>
  );
}
