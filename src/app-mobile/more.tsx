import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import * as Icons from "lucide-react";
import { ChevronRight } from "lucide-react";
import { NAV_TOP } from "@/app/layout/nav-config";
import { useMe } from "@/shared/api/me";

/** "Menyu": the desktop navigation tree, grouped exactly like the web mega
 *  menu — one card per top category, column titles as section labels inside.
 *  Personal items (profile / theme / language / logout) live in the SAME
 *  profile menu as the web (avatar in the top bar), not here. */
export function MobileMore() {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(k, { defaultValue: d });
  const navigate = useNavigate();
  const { data: me } = useMe();
  const disabled = new Set(me?.disabled_modules ?? []);

  const LeafIcon = ({ name }: { name: string }) => {
    const I = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.File;
    return <I className="size-4" />;
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">{tr("mobile.nav.more", "Menyu")}</h1>

      {NAV_TOP.filter((top) => !top.disabled).map((top) => {
        // Direct-link category (e.g. Dashboard) — one tappable card row.
        if (top.to && !top.columns) {
          if (top.slug && disabled.has(top.slug)) return null;
          return (
            <div key={top.key} className="overflow-hidden rounded-xl border bg-card">
              <button
                type="button"
                onClick={() => navigate(top.to!)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium active:bg-muted"
              >
                <span className="text-muted-foreground"><LeafIcon name={top.icon} /></span>
                <span className="flex-1">{top.labelKey ? t(top.labelKey, { defaultValue: top.label }) : top.label}</span>
                <ChevronRight className="size-4 text-muted-foreground/50" />
              </button>
            </div>
          );
        }

        // Mega-menu category — card titled by the category, columns as
        // sub-sections (same hierarchy as the desktop dropdown).
        const columns = (top.columns ?? [])
          .map((col) => ({
            ...col,
            items: col.items.filter((l) => !l.disabled && (!l.slug || !disabled.has(l.slug))),
          }))
          .filter((col) => col.items.length > 0);
        if (!columns.length) return null;

        return (
          <div key={top.key} className="overflow-hidden rounded-xl border bg-card">
            <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-2.5 text-sm font-semibold">
              <span className="text-muted-foreground"><LeafIcon name={top.icon} /></span>
              {top.labelKey ? t(top.labelKey, { defaultValue: top.label }) : top.label}
            </div>
            {columns.map((col) => (
              <div key={col.key}>
                {columns.length > 1 && (
                  <div className="px-4 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {col.labelKey ? t(col.labelKey, { defaultValue: col.title }) : col.title}
                  </div>
                )}
                {col.items.map((leaf) => (
                  <button
                    key={leaf.key + leaf.to}
                    type="button"
                    onClick={() => navigate(leaf.to)}
                    className="flex w-full items-center gap-3 border-b px-4 py-2.5 text-left text-sm last:border-b-0 active:bg-muted"
                  >
                    <span className="text-muted-foreground"><LeafIcon name={leaf.icon} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {leaf.labelKey ? t(leaf.labelKey, { defaultValue: leaf.title }) : leaf.title}
                      </span>
                      {leaf.desc && (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {leaf.descKey ? t(leaf.descKey, { defaultValue: leaf.desc }) : leaf.desc}
                        </span>
                      )}
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                  </button>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
