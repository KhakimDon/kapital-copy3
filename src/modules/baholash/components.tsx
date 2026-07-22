// Shared small presentational bits used across Baholash views.
import { useTranslation } from "react-i18next";

// NC bh-class--N scale mapped to on-palette semantic tokens (dark-mode safe):
// 1 neutral · 2/3 info(blue) · 4 success(green) · 5 warning(amber) · 6 danger(red).
const CLASS_COLORS: Record<number, string> = {
  1: "bg-muted text-muted-foreground",
  2: "bg-info/15 text-info",
  3: "bg-info/15 text-info",
  4: "bg-success/15 text-success",
  5: "bg-warning/15 text-warning",
  6: "bg-destructive/15 text-destructive",
};

export function ClassBadge({ cls }: { cls: number | null | undefined }) {
  const { t } = useTranslation();
  const c = Number(cls) || 1;
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-bold ${CLASS_COLORS[c] ?? CLASS_COLORS[1]}`}>
      {t("modules.baholash.classLabel")} {c}
    </span>
  );
}

export function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-base font-semibold font-mono tabular-nums mt-0.5 break-all">{value}</div>
    </div>
  );
}

// Source chip — "avto" (auto-pulled) vs "qo'lda" (manual). Mirrors NC bh-src.
export function SrcChip({ src }: { src?: string | null }) {
  const { t } = useTranslation();
  const manual = !src || src === "manual";
  const label = manual
    ? t("modules.baholash.srcChip.manual")
    : src === "oked" || src === "eskey"
      ? t("modules.baholash.srcChip.auto")
      : src;
  return (
    <span
      className={`ml-1 inline-flex items-center rounded px-1 py-0 text-[10px] font-bold uppercase align-middle ${
        manual ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"
      }`}
    >
      {label}
    </span>
  );
}
