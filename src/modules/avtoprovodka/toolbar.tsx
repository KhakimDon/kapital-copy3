/**
 * Sticky top toolbar — mirrors cloud `.aiba-av-topbar__actions` 1:1.
 *
 * Visibility per source matches cloud's `data-show-on` rules:
 *
 *   - Documents: source dropdown (Didox/1C-out/1C-in) + year picker +
 *     1C-tekshirish + AI auto + direction pills (Hammasi/Kiruvchi/Chiquvchi).
 *   - Bank txns: account filter + Excel upload + Bank sync + 1C-tekshirish
 *     + AI auto.
 *
 * The 1C verdict filter (hammasi / 1C da bor / 1C da yo'q) is NOT here — it
 * lives in the tab row below the toolbar, which already showed the same
 * counts. Two controls for one filter is one too many.
 *   - Cheques: 1C-tekshirish + AI auto.
 *   - Vedmosti: account filter + file filter + Vedmost upload.
 *   - All sources: search + 1C base picker + Refresh.
 *
 * The 1C base picker is the only control that talks to a non-list
 * endpoint at mount: it's the "Yuborish uchun 1C bazasi" dropdown the
 * write-actions key off of. When there are zero bases we render a
 * disabled "1C bazasi yo'q" select to make the empty state obvious
 * instead of silently falling back to "Auto" (which would let users
 * click Send and get a 503 from the dispatcher). The "Auto" entry at
 * the top means "no specific base — server picks" so single-base
 * tenants don't have to fiddle with the dropdown.
 *
 * Uploads use raw-body POSTs; we trigger the hidden file input then hand
 * the File object to the upload mutation. The toolbar emits intent
 * (`onCheck1C`, `onAiAuto`, `onUploadBank`, etc.) — the page wires the
 * mutations so this stays presentational and reusable.
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Search, RefreshCw, CheckCircle2, Zap, Upload, RotateCw, Loader2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/shared/lib/utils";
import type {
  AvDirection, AvSource, BankAccount, Check1CProgress, DocSource, OneCBase, VedmostiFile,
} from "./api";
import { DOC_SOURCES, docSourceLabel } from "./api";

// Sentinel used inside the <Select> for "no base selected → Auto".
// Radix's Select rejects empty-string values, so we round-trip through
// this token instead.
export const BASE_AUTO = "__auto__";

export type ToolbarProps = {
  source: AvSource;
  docSource: DocSource;
  /** Accounting system name every "1C …" label switches on ("1C" | "1UZ"). */
  sys: string;
  q: string;
  year: number | "all";
  direction: AvDirection;
  account: string;
  file: string;
  selectedBase: string;
  bases: OneCBase[];
  basesLoading?: boolean;
  accounts: BankAccount[];
  files: VedmostiFile[];
  isLoading?: boolean;
  isChecking?: boolean;
  isAiAuto?: boolean;
  isUploading?: boolean;
  isSyncing?: boolean;
  onSearchChange: (v: string) => void;
  onDocSourceChange: (v: DocSource) => void;
  onDirectionChange: (v: AvDirection) => void;
  onYearChange: (v: number | "all") => void;
  onAccountChange: (v: string) => void;
  onFileChange: (v: string) => void;
  onBaseChange: (v: string) => void;
  onRefresh: () => void;
  onCheck1C: () => void;
  /** Live progress of a running 1C scan (null when nothing is running). */
  check1cProgress?: Check1CProgress | null;
  /** Closing summary of the last bulk selection action, shown briefly. */
  bulkNote?: string | null;
  onAiAuto: () => void;
  onUploadBank: (f: File) => void;
  onBankSync: () => void;
  onUploadVedmosti: (f: File) => void;
};

const CY = new Date().getFullYear();
const YEARS: (number | "all")[] = [CY, CY - 1, CY - 2, CY - 3, CY - 4, CY - 5, "all"];

const DIRECTIONS: AvDirection[] = ["all", "incoming", "outgoing"];

export function AvToolbar(p: ToolbarProps) {
  const { t } = useTranslation();
  const bankFileRef = useRef<HTMLInputElement | null>(null);
  const vedmostiFileRef = useRef<HTMLInputElement | null>(null);

  // Debounce the search input so we don't flood the API while typing.
  // 300 ms mirrors the cloud's `debounce(..., 300)` on aiba-av-search.
  const debounceTimer = useRef<number | null>(null);
  useEffect(() => () => {
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
  }, []);

  // Auto-select the best base once on mount / when the bases list
  // changes shape. Rule (mirrors cloud `pickDefaultBase`):
  //   1. If the user already picked one, do nothing.
  //   2. Otherwise prefer the first online base.
  //   3. Fall back to the first base regardless of status.
  //   4. With zero bases we leave it empty (the select is rendered
  //      disabled below).
  // We deliberately avoid re-firing once the user has cleared back to
  // Auto — that's an explicit choice and we respect it.
  const didAutoPick = useRef(false);
  useEffect(() => {
    if (didAutoPick.current) return;
    if (p.selectedBase) {
      didAutoPick.current = true;
      return;
    }
    if (!p.bases || p.bases.length === 0) return;
    // Prefer a base we can actually WRITE to — being online is not enough, and
    // auto-picking a read-only base sets the user up for a failed send.
    const writable = p.bases.find((b) => b.write_ready && b.route_key);
    const online = p.bases.find((b) => b.is_online && b.route_key);
    const fallback = p.bases.find((b) => b.route_key) || null;
    const pick = (writable || online || fallback)?.route_key || "";
    if (pick) {
      didAutoPick.current = true;
      p.onBaseChange(pick);
    }
    // We intentionally exclude p.onBaseChange / p.selectedBase from the
    // dep list — including the callback would re-run this effect on
    // every parent render, and including selectedBase would fight the
    // didAutoPick gate. We only care about the bases list identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.bases]);

  const showDocSource = p.source === "document";
  const showDirection = p.source === "document";
  const showYear = p.source === "document";
  const showAccountFilter = p.source === "bank_txn" || p.source === "vedmosti";
  const showFileFilter = p.source === "vedmosti";
  // Cheques get no 1C reconciliation — 1C aggregates retail into daily Z-reports,
  // so a per-cheque "in 1C" verdict isn't meaningful.
  const showCheck1C = p.source === "document" || p.source === "bank_txn";
  const showAiAuto = p.source !== "vedmosti";
  const showBankUpload = p.source === "bank_txn";
  const showBankSync = p.source === "bank_txn";
  const showVedmostiUpload = p.source === "vedmosti";

  const basesEmpty = (p.bases?.length ?? 0) === 0;

  // Two independent liveness signals, and they disagree in practice:
  //   is_online    — the 1C service's OData heartbeat (READ path)
  //   write_ready  — the onec-ws relay holds a socket for this base (WRITE path)
  // A base can be `is_online` yet not write-ready, which used to surface only
  // as a ROUTE_NOT_FOUND at send time with the picker cheerfully showing it as
  // fine. `write_ready == null` means the relay was unreachable — unknown, so
  // we stay silent rather than accuse a healthy base.
  const baseLabel = (b: OneCBase, idx: number): string => {
    const primary = (b.odataName || b.name || b.alias || b.route_key || `#${idx + 1}`).trim() || "?";
    if (!b.is_online) return `${primary} · ${t("modules.avtoprovodka.toolbar.base.offline")}`;
    if (b.write_ready === false) return `${primary} · ${t("modules.avtoprovodka.toolbar.base.noWrite")}`;
    return primary;
  };

  const selected = p.bases?.find((b) => b.route_key === p.selectedBase) || null;
  // Only warn about a base the user can actually send to — an offline base
  // already says so in its own label.
  const showNoWriteHint = !!selected && selected.is_online && selected.write_ready === false;

  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      {/* Search — remount on source change so the input clears with state.q */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          key={`search-${p.source}`}
          defaultValue={p.q}
          onChange={(e) => {
            const v = e.target.value;
            if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
            debounceTimer.current = window.setTimeout(
              () => p.onSearchChange(v.trim()),
              300,
            );
          }}
          placeholder={t("common.search")}
          type="search"
          autoComplete="off"
          className="h-9 w-[180px] pl-8"
        />
      </div>

      {/* Document source toggle */}
      {showDocSource && (
        <Select
          value={p.docSource}
          onValueChange={(v) => p.onDocSourceChange(v as DocSource)}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOC_SOURCES.map((k) => (
              <SelectItem key={k} value={k}>
                {docSourceLabel(k, p.sys)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* 1C base picker
          ────────────────
          - basesEmpty: render a disabled select labelled "1C bazasi yo'q"
            so the user can tell the picker isn't broken — it's just empty.
          - basesEmpty + loading: same disabled shell with a "Yuklanmoqda…"
            label; keeps width stable so the toolbar doesn't reflow.
          - otherwise: Auto (no specific base) + one entry per base.
            Offline bases get an " · offline" suffix on the label so the
            user can still pick them but knows the connector is down. */}
      {basesEmpty ? (
        <Select value={BASE_AUTO} disabled>
          <SelectTrigger
            className="h-9 w-[200px] opacity-70"
            title={t("modules.avtoprovodka.toolbar.base.emptyTitle", { sys: p.sys })}
          >
            <SelectValue
              placeholder={
                p.basesLoading
                  ? t("modules.avtoprovodka.toolbar.base.loading")
                  : t("modules.avtoprovodka.toolbar.base.empty", { sys: p.sys })
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={BASE_AUTO}>
              {p.basesLoading
                ? t("modules.avtoprovodka.toolbar.base.loading")
                : t("modules.avtoprovodka.toolbar.base.empty", { sys: p.sys })}
            </SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Select
          value={p.selectedBase || BASE_AUTO}
          onValueChange={(v) => p.onBaseChange(v === BASE_AUTO ? "" : v)}
        >
          <SelectTrigger
            className="h-9 w-[200px]"
            title={t("modules.avtoprovodka.toolbar.base.title", { sys: p.sys })}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={BASE_AUTO}>
              {t("modules.avtoprovodka.toolbar.base.auto")}
            </SelectItem>
            {p.bases.map((b, i) => (
              <SelectItem
                key={b.route_key || `b-${i}`}
                value={b.route_key || `b-${i}`}
              >
                {baseLabel(b, i)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Write-path warning — the selected base reads fine but the relay has no
          connector socket for it, so every "1C ga yuborish" would fail. Say so
          here rather than letting the user find out one failed send at a time. */}
      {showNoWriteHint && (
        <span
          className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500"
          title={t("modules.avtoprovodka.toolbar.base.noWriteHint")}
        >
          <AlertTriangle className="size-3.5 shrink-0" />
          {t("modules.avtoprovodka.toolbar.base.noWrite")}
        </span>
      )}

      {/* Outcome of the last bulk selection action. It lands after the
          selection bar (which carried the progress) has gone, so it needs a
          home of its own. */}
      {p.bulkNote && (
        <span className="text-xs text-muted-foreground">{p.bulkNote}</span>
      )}

      {/* Account filter */}
      {showAccountFilter && (
        <Select
          value={p.account || "__all__"}
          onValueChange={(v) => p.onAccountChange(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="h-9 w-[170px]">
            <SelectValue placeholder={t("modules.avtoprovodka.toolbar.allAccounts")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("modules.avtoprovodka.toolbar.allAccounts")}</SelectItem>
            {p.accounts.map((a) => (
              <SelectItem key={a.our_account} value={a.our_account}>
                {a.our_account} ({a.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* File filter (vedmosti) */}
      {showFileFilter && (
        <Select
          value={p.file || "__all__"}
          onValueChange={(v) => p.onFileChange(v === "__all__" ? "" : v)}
        >
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder={t("modules.avtoprovodka.toolbar.allFiles")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t("modules.avtoprovodka.toolbar.allFiles")}</SelectItem>
            {p.files.map((f) => {
              const display = f.source_file.length > 36
                ? f.source_file.slice(0, 34) + "…"
                : f.source_file;
              return (
                <SelectItem key={f.source_file} value={f.source_file}>
                  {display} ({f.count})
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}

      {/* Year filter (documents) */}
      {showYear && (
        <Select
          value={String(p.year)}
          onValueChange={(v) =>
            p.onYearChange(v === "all" ? "all" : Number(v))
          }
        >
          <SelectTrigger className="h-9 w-[100px]" title={t("modules.avtoprovodka.toolbar.yearTitle", { sys: p.sys })}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {YEARS.map((y) => (
              <SelectItem key={String(y)} value={String(y)}>
                {y === "all" ? t("common.all") : String(y)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={p.onRefresh}
        disabled={!!p.isLoading}
        className="h-9"
      >
        <RefreshCw className={`size-4 ${p.isLoading ? "animate-spin" : ""}`} />
        {t("common.refresh")}
      </Button>

      {showCheck1C && (
        <Button
          variant="outline"
          size="sm"
          onClick={p.onCheck1C}
          disabled={!!p.isChecking}
          className="h-9"
          title={t("modules.avtoprovodka.toolbar.check1cTitle", { sys: p.sys })}
        >
          {p.isChecking ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {t("modules.avtoprovodka.check1C", { sys: p.sys })}
        </Button>
      )}

      {/* Scan progress. The check covers EVERY year (the year select filters
          only the view), so on a large base this runs for minutes — a bare
          spinner would leave the user guessing whether anything is happening. */}
      {showCheck1C && p.isChecking && p.check1cProgress && (
        <span className="text-xs tabular-nums text-muted-foreground">
          {t(
            `modules.avtoprovodka.toolbar.scan.${
              p.check1cProgress.phase ?? "checking"
            }`,
            {
              scanned: (p.check1cProgress.scanned ?? 0).toLocaleString(),
              total: (p.check1cProgress.total ?? 0).toLocaleString(),
              // A phase we don't have a label for still reads sensibly.
              defaultValue: t("modules.avtoprovodka.toolbar.scan.checking", {
                scanned: (p.check1cProgress.scanned ?? 0).toLocaleString(),
                total: (p.check1cProgress.total ?? 0).toLocaleString(),
              }),
            },
          )}
        </span>
      )}

      {showAiAuto && (
        <Button
          size="sm"
          onClick={p.onAiAuto}
          disabled={!!p.isAiAuto}
          className="h-9"
          title={t("modules.avtoprovodka.toolbar.aiAutoTitle")}
        >
          {p.isAiAuto ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />}
          {t("modules.avtoprovodka.aiAuto")}
        </Button>
      )}

      {showBankUpload && (
        <>
          <input
            ref={bankFileRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) p.onUploadBank(f);
              if (e.target) e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => bankFileRef.current?.click()}
            disabled={!!p.isUploading}
            className="h-9"
          >
            {p.isUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {t("modules.avtoprovodka.toolbar.uploadExcel")}
          </Button>
        </>
      )}

      {showBankSync && (
        <Button
          variant="outline"
          size="sm"
          onClick={p.onBankSync}
          disabled={!!p.isSyncing}
          className="h-9"
          title={t("modules.avtoprovodka.toolbar.bankSyncTitle")}
        >
          {p.isSyncing ? <Loader2 className="size-4 animate-spin" /> : <RotateCw className="size-4" />}
          {t("modules.avtoprovodka.toolbar.syncFromBank")}
        </Button>
      )}

      {showVedmostiUpload && (
        <>
          <input
            ref={vedmostiFileRef}
            type="file"
            accept=".xlsx,.xls"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) p.onUploadVedmosti(f);
              if (e.target) e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => vedmostiFileRef.current?.click()}
            disabled={!!p.isUploading}
            className="h-9"
          >
            {p.isUploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {t("modules.avtoprovodka.toolbar.uploadVedmost")}
          </Button>
        </>
      )}

      {/* Direction pills — right-aligned via ml-auto so they sit at the
          far edge of the toolbar like cloud's filter group. Hidden on
          tabs where the concept doesn't apply (Bank/Cheklar/Vedmosti
          already carry direction via account / source file metadata). */}
      {showDirection && (
        <div
          className="ml-auto inline-flex h-9 items-center rounded-md border border-border bg-card p-0.5 text-sm"
          role="group"
          aria-label={t("modules.avtoprovodka.toolbar.direction.label")}
        >
          {DIRECTIONS.map((d) => (
            <Button
              key={d}
              variant="ghost"
              onClick={() => p.onDirectionChange(d)}
              aria-pressed={p.direction === d}
              className={cn(
                "h-8 rounded px-3 text-xs font-medium transition-colors",
                p.direction === d
                  ? "bg-primary/10 text-foreground hover:bg-primary/10"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`modules.avtoprovodka.toolbar.direction.${d}`)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
