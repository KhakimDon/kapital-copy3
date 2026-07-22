// Shared building blocks for the dynamic dashboard widgets. Every module owns
// its own widget components (src/modules/<m>/dashboard-widgets.tsx) but imports
// the primitives + the WidgetDef contract from here, so the registry stays a
// thin manifest and each widget renders as a self-contained, crash-isolated Card.
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// ── contract ────────────────────────────────────────────────────────────────

/** Free-form per-instance settings persisted in the layout (e.g. wiki pageId). */
export type WidgetSettings = Record<string, unknown>;

export type WidgetProps = {
  /** Layout-instance settings (from the saved layout row). */
  settings?: WidgetSettings;
};

/** One widget type, contributed by a module and collected by the registry. */
export type WidgetDef = {
  /** Stable type id — matches the backend catalog + saved layout rows. */
  type: string;
  /** Owning module slug — gated against me.disabled_modules. */
  module: string;
  /** i18n key for the widget title. */
  titleKey: string;
  /** Uzbek fallback title (defaultValue for titleKey). */
  title: string;
  icon: LucideIcon;
  defaultColspan: number;
  Component: React.ComponentType<WidgetProps>;
};

// ── number/format helpers ────────────────────────────────────────────────────

export const money = (v: number | null | undefined) =>
  Number(v ?? 0).toLocaleString("ru-RU");

export const num = (v: number | null | undefined) =>
  Number(v ?? 0).toLocaleString("ru-RU");

// ── card shell ────────────────────────────────────────────────────────────────

/** Glassy dashboard card — soft warm aesthetic. Translucent + backdrop-blur so
 *  the .dash-bg gradient reads through; an amber icon bubble + a semibold title,
 *  optional top-right "open ↗" action. */
export function WidgetCard({
  title,
  icon,
  children,
  footer,
  accent,
  action,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Optional left-border accent color class (e.g. "border-l-success"). */
  accent?: string;
  /** Optional top-right control (e.g. an open-in-module link). */
  action?: React.ReactNode;
}) {
  return (
    <div
      className={`flex h-full flex-col rounded-2xl border border-[#EDEEF0] bg-white p-5 shadow-[0_2px_10px_rgba(68,83,113,0.06)] transition-shadow hover:shadow-[0_4px_16px_rgba(68,83,113,0.10)] ${
        accent ? `border-l-4 ${accent}` : ""
      }`}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#F8F2FF] text-[#7000FF]">
          {icon}
        </span>
        <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-[#101010]">{title}</span>
        {action}
      </div>
      <div className="flex-1">{children}</div>
      {footer && (
        <div className="mt-3 border-t border-[#F0F1F3] pt-3 text-xs text-[#83888B]">
          {footer}
        </div>
      )}
    </div>
  );
}

export function EmptyRow({ text }: { text: string }) {
  return (
    <div className="py-6 text-center text-xs text-[#83888B]">{text}</div>
  );
}

export function ListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-1">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between">
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Full-card skeleton — used as the Suspense fallback while a widget loads. */
export function WidgetSkeleton() {
  return (
    <div className="h-full rounded-2xl border border-[#EDEEF0] bg-white p-5 shadow-[0_2px_10px_rgba(68,83,113,0.06)]">
      <div className="mb-3 flex items-center gap-2.5">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

export function severityBadgeVariant(
  sev: "over" | "red" | "yellow" | "normal",
): "danger" | "warning" | "success" | "info" {
  switch (sev) {
    case "over":
    case "red":
      return "danger";
    case "yellow":
      return "warning";
    case "normal":
    default:
      return "info";
  }
}

// ── crash isolation ───────────────────────────────────────────────────────────

/** Compact per-widget error boundary. The shared app ErrorBoundary is
 *  full-page sized (min-h-[50vh]); a dashboard cell needs a small card so one
 *  broken/absent widget never blanks the grid. Also catches failed lazy imports. */
export class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode; label: string; title: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error(`[dashboard] widget "${this.props.label}" failed:`, error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col rounded-2xl border border-dashed border-[#EDEEF0] bg-white p-5">
        <div className="mb-3 flex items-center gap-2.5 text-sm font-semibold text-[#83888B]">
          <span>⚠️</span>
          {this.props.title}
        </div>
        <div className="flex flex-1 items-center justify-center text-center text-xs text-[#83888B]">
          {this.props.label}
        </div>
      </div>
    );
  }
}
