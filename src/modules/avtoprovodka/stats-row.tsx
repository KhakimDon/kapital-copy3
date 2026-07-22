/**
 * Three stat buttons under the toolbar — mirrors cloud `.aiba-av-stats`:
 *
 *   - Jami (📊)     — total rows on this tab.
 *   - 1C da yo'q (⚠) — count of rows with in_onec=0 on this tab. Click
 *                      to toggle the `only_not_in_1c` filter.
 *   - Tanlangan (🎯) — appears only when the user has rows selected.
 *                      Embeds the three bulk-action buttons inline (AI
 *                      classify / Send to 1C / Delete) — same layout as
 *                      the cloud's `.aiba-av-stat__actions` span.
 *
 * "1C da yo'q" only shows when the active source supports the
 * unprocessed-only filter (Documents/Didox + Bank txns). Hidden otherwise
 * to avoid a stat that no longer makes sense.
 */
import { useTranslation } from "react-i18next";
import {
  BarChart3, AlertTriangle, Target, Cpu, Send, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/utils";
import type { AvSource, Check1CProgress, DocSource } from "./api";

export function AvStatsRow({
  source,
  docSource,
  sys,
  total,
  notIn1C,
  selectedCount,
  onlyNotIn1C,
  onToggleNotIn1C,
  onClearSelection,
  onBulkClassify,
  onBulkSend,
  isBulkClassifying,
  isBulkSending,
  bulkProgress,
}: {
  source: AvSource;
  docSource: DocSource;
  /** Accounting system name every "1C …" label switches on ("1C" | "1UZ"). */
  sys: string;
  total: number;
  notIn1C: number;
  selectedCount: number;
  onlyNotIn1C: boolean;
  onToggleNotIn1C: () => void;
  onClearSelection: () => void;
  onBulkClassify: () => void;
  onBulkSend: () => void;
  isBulkClassifying?: boolean;
  isBulkSending?: boolean;
  /** Live state of the shared bulk run, polled from check-1c/status. */
  bulkProgress?: Check1CProgress | null;
}) {
  const { t } = useTranslation();
  const supportsNotIn1C =
    (source === "document" && docSource === "didox") || source === "bank_txn";
  const writableForSend = source === "bank_txn" || source === "document";
  const showSelected = selectedCount > 0;

  return (
    <div className="flex flex-wrap items-stretch gap-2 px-4 py-3">
      <StatPill
        icon={<BarChart3 className="size-4" />}
        label={t("modules.avtoprovodka.jami")}
        value={total}
      />

      {supportsNotIn1C && (
        <Button
          variant="ghost"
          onClick={onToggleNotIn1C}
          className={cn(
            "h-auto justify-start gap-2 rounded-lg border px-3 py-2 text-sm font-normal transition-colors",
            onlyNotIn1C
              ? "border-warning/40 bg-warning/10 text-foreground hover:bg-warning/10"
              : "border-border bg-card text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          )}
          title={`${sys} da bo'lmaganlarni ko'rsatish`}
        >
          <AlertTriangle className="size-4 text-warning" />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[10px] uppercase tracking-wide">{t("modules.avtoprovodka.onecMissing", { sys })}</span>
            <span className="font-semibold tabular-nums">
              {notIn1C === 0 && !onlyNotIn1C ? "—" : notIn1C}
            </span>
          </span>
        </Button>
      )}

      {showSelected && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <Target className="size-4 text-primary" />
          <span className="flex flex-col items-start leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Tanlangan
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {selectedCount}
            </span>
          </span>
          <div className="ml-3 flex items-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={onBulkClassify}
              disabled={!!isBulkClassifying}
              className="h-7"
            >
              {isBulkClassifying ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Cpu className="size-3.5" />
              )}
              AI klassifikatsiya
            </Button>
            {writableForSend && (
              <Button
                size="sm"
                onClick={onBulkSend}
                disabled={!!isBulkSending}
                className="h-7"
              >
                {isBulkSending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Send className="size-3.5" />
                )}
                {sys} ga yuborish
              </Button>
            )}
            {/* What the background run is doing right now. A relay write takes
                seconds per document, so without this the bar just sits there
                looking broken. */}
            {bulkProgress?.running && (
              <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
                {bulkProgress.phase === "sending"
                  ? "1C ga yuborilmoqda"
                  : bulkProgress.phase === "classifying"
                    ? "Klassifikatsiya qilinmoqda"
                    : "1C indeksi tuzilmoqda"}
                {!!bulkProgress.total && ` — ${bulkProgress.scanned ?? 0} / ${bulkProgress.total}`}
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearSelection}
              className="h-7 text-muted-foreground"
            >
              Bekor qilish
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatPill({
  icon, label, value,
}: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex flex-col items-start leading-tight">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="font-semibold tabular-nums">{value}</span>
      </span>
    </div>
  );
}
