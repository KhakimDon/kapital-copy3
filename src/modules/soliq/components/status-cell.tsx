import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { RatingTag } from "@/shared/rating";
import type { CellStatus } from "../tax-grid-derive";

// Per-tax filing-status badge (reports mode). Mirrors cloud renderStatusBadge.
// Cloud dot intent: green=success, orange/yellow=warning, red=error, gray=muted.
const STATUS_STYLE: Record<CellStatus["status"], { cls: string; sym: string }> = {
  paid: { cls: "bg-success/15 text-success", sym: "✓" },
  submitted_no_payment: { cls: "bg-success/10 text-success", sym: "✓" },
  submitted_not_paid: { cls: "bg-warning/15 text-warning", sym: "✓∅" },
  late: { cls: "bg-warning/15 text-warning", sym: "⏳" },
  not_submitted: { cls: "bg-destructive/15 text-destructive", sym: "✗" },
  failed: { cls: "bg-destructive/20 text-destructive", sym: "⚠" },
  penalty: { cls: "bg-warning/20 text-warning", sym: "⚠" },
  none: { cls: "text-muted-foreground", sym: "—" },
};

export function TaxStatusBadge({ cell }: { cell: CellStatus }) {
  const { t } = useTranslation();
  const s = STATUS_STYLE[cell.status] ?? STATUS_STYLE.none;
  if (cell.status === "none") {
    return <span className="text-muted-foreground" title={t("modules.soliq.page.noData")}>—</span>;
  }
  return (
    <span
      title={cell.label}
      className={`inline-flex min-w-[1.6rem] items-center justify-center rounded px-1 py-0.5 text-xs font-medium ${s.cls}`}
    >
      {s.sym}
    </span>
  );
}

export function PaySumCell({ value }: { value?: number | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums text-xs">
      {Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
    </span>
  );
}

export function MoneyCell({ value }: { value?: number | null }) {
  if (value == null || isNaN(Number(value))) {
    return <span className="text-muted-foreground">—</span>;
  }
  const n = Number(value);
  if (n === 0) return <span className="text-muted-foreground">0</span>;
  return (
    <span className={n > 0 ? "text-destructive" : "text-success"}>
      {n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
    </span>
  );
}

export function DebtCell({ value }: { value?: number | null }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const n = Number(value);
  if (n <= 0) return <span className="text-success">0</span>;
  return (
    <Badge variant="danger" className="tabular-nums">
      {n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
    </Badge>
  );
}

export function AdvanceCell({ value }: { value?: number | null }) {
  if (value == null || Number(value) === 0)
    return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="success" className="tabular-nums">
      {Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
    </Badge>
  );
}

export function RatingBadge({ rating, points }: { rating?: string | null; points?: number | null }) {
  if (!rating) return <span className="text-muted-foreground">—</span>;
  return <RatingTag rating={rating} points={points} />;
}
