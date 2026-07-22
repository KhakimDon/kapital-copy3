/**
 * Detail page layout (mirrors cloud .doc-layout):
 * a full-page 2-column shell — LEFT sidebar (info cards, ~380px) + RIGHT viewer
 * (HTML/PDF/table content). Used for /{module}/:id detail routes so they are
 * separate pages (NOT Sheet/Drawer overlays).
 *
 * The cloud convention:
 *   .doc-detail { min-height: calc(100vh - 50px); bg-muted }
 *   .doc-layout { display:flex; height:calc(100vh - 50px); }
 *   .doc-sidebar { width:380px; flex-shrink:0; overflow-y:auto; padding:16px }
 *   .doc-viewer { flex:1; overflow:auto }
 *
 * Provides three slots: backLink (top-left "← Back"), sidebar (cards), main (viewer/content).
 * Cards inside the sidebar can use <DetailCard> for consistent NC styling.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/shared/lib/utils";

export function DetailPage({
  backTo,
  backLabel = "Orqaga",
  onBack,
  sidebar,
  children,
  sidebarWidth = "w-[380px]",
}: {
  backTo?: string;
  backLabel?: string;
  /** Custom Back behaviour (e.g. close the tab / return to the source list).
   *  When set, it replaces the plain `backTo` link. */
  onBack?: () => void;
  sidebar: React.ReactNode;
  children: React.ReactNode;
  sidebarWidth?: string;
}) {
  const backCls =
    "inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2";
  return (
    <div className="-m-6 flex h-[calc(100vh-4rem)] bg-muted/40">
      {/* Left sidebar (380px) */}
      <aside className={cn("shrink-0 overflow-y-auto bg-muted/40 p-4 space-y-3", sidebarWidth)}>
        {onBack ? (
          <button type="button" onClick={onBack} className={backCls}>
            <ChevronLeft className="size-4" />
            {backLabel}
          </button>
        ) : backTo ? (
          <Link to={backTo} className={backCls}>
            <ChevronLeft className="size-4" />
            {backLabel}
          </Link>
        ) : null}
        {sidebar}
      </aside>

      {/* Right viewer / content */}
      <div className="flex-1 min-w-0 overflow-auto bg-background">
        {children}
      </div>
    </div>
  );
}

// Card primitive for the left sidebar — used for header card, info cards, etc.
export function DetailCard({
  title,
  action,
  children,
  className,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          {title && <div className="text-sm font-medium text-foreground">{title}</div>}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

// Simple K/V row helper (also used in poc Sheets) — keeps detail layouts consistent.
export function DetailRow({
  k,
  v,
  mono = false,
  emphasize = false,
}: {
  k: React.ReactNode;
  v?: React.ReactNode;
  mono?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm border-b border-border last:border-0">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd
        className={cn(
          "min-w-0 text-right break-words",
          mono && "font-mono",
          emphasize ? "font-semibold text-foreground" : "text-foreground",
        )}
      >
        {v ?? <span className="text-muted-foreground">—</span>}
      </dd>
    </div>
  );
}
