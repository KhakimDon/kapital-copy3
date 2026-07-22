/**
 * Avtoprovodka entries table — cloud-parity rebuild.
 *
 * Columns (left → right):
 *   [check] SANA · RAQAM · KONTRAGENT · YO'NALISH · 1C/PROVODKA ·
 *           MAQSAD/TAVSIF · SUMMA · HOLAT · [actions]
 *
 * The renderer trusts the backend's extended row fields (see
 * `AvEntry` in api.ts): `direction`, `doctype_label`, `doc_status_label`,
 * `status_group`, `in_onec_accounts`, `operation_type`, `onec_version`,
 * `name`, `doc_id`. When the backend omits a localized label we fall
 * back to a hardcoded uz translation table so the row never blanks out.
 *
 * Per-cell rules — kept in helper components below to keep the row body
 * legible. The 1C / Provodka cell has three states (mirrors cloud
 * `renderRow` 1:1):
 *   - in_onec && has_provodka → green "✓ В 1С" pill + Dt/Kt chips
 *     (first `in_onec_accounts` entry, "+N" overflow when more) +
 *     "Klassifikatsiya: <operation_type>" line when classify_meta is
 *     joined.
 *   - in_onec only → green "В 1С" pill alone.
 *   - has_provodka only → amber "Klassifikatsiyalangan" pill.
 *   - else → yellow "Не в 1С" / "1C da yo'q" pill.
 *
 * The HOLAT column derives from `status_group` (signed/pending/
 * rejected/draft/deleted/unknown) and uses the backend-emitted
 * `doc_status_label.uz` when present.
 *
 * Existing behaviour preserved: row click → detail drawer, per-row
 * 3-dot menu (open / send / reject / delete), multi-select checkboxes,
 * windowed pagination.
 */
import { useTranslation } from "react-i18next";
import {
  ChevronLeft, ChevronRight, MoreHorizontal, Cpu,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  type AvDirection, type AvEntry, type AvLabel, type AvOnecAccount,
  type AvStatus, type AvStatusGroup, entryKey, fmtDate, money,
} from "./api";

type RowAction =
  | { kind: "open" }
  | { kind: "classify" }
  | { kind: "send" }
  | { kind: "reject" }
  | { kind: "delete" };

// Fallback labels for doctype codes when backend doesn't ship a
// localized `doctype_label`. Mirrors cloud's `DOCTYPES` in aiba-
// avtoprovodka.js — kept in Uzbek (Latin) per project i18n source.
const DOCTYPE_LABEL_FALLBACK: Record<string, string> = {
  "002": "Schyot-faktura",
  "005": "Bajarilgan ish dalolatnomasi",
  "006": "Ishonchnoma",
  "007": "Shartnoma",
  "008": "Farm. schyot-faktura",
  "000": "Maxsus hujjat",
  "010": "Ko'p tomonlama",
  "041": "TTN",
  "052": "Solishtirish dalolatnomasi",
  "054": "Qabul dalolatnomasi",
  "075": "Bayonnoma",
};

export function EntryTable({
  items,
  isLoading,
  isFetching = false,
  sys,
  selectedIds,
  onTogglePick,
  onTogglePickAll,
  onOpenRow,
  onAction,
  page,
  pages,
  total,
  pageSize,
  onPageChange,
  emptyText,
}: {
  items: AvEntry[];
  isLoading: boolean;
  /** A page/filter fetch is in flight while previous rows are still shown. */
  isFetching?: boolean;
  /** Accounting system name every "1C …" label switches on ("1C" | "1UZ"). */
  sys: string;
  /** Keys (see `entryKey`) of the picked rows — NOT numeric ids. */
  selectedIds: Set<string>;
  onTogglePick: (key: string) => void;
  onTogglePickAll: () => void;
  onOpenRow: (e: AvEntry) => void;
  onAction: (e: AvEntry, action: RowAction) => void;
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPageChange: (next: number) => void;
  emptyText?: string;
}) {
  const { t } = useTranslation();
  const idsOnPage = items.map(entryKey);
  // Documents carry the EDO creation date; bank/cheque rows don't. One flag for
  // the whole page — a list never mixes sources.
  const showCreated = items.some((e) => !!e.created);
  const allOnPagePicked =
    idsOnPage.length > 0 && idsOnPage.every((id) => selectedIds.has(id));
  const someOnPagePicked =
    idsOnPage.length > 0 && idsOnPage.some((id) => selectedIds.has(id));

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto border-y border-border">
        <Table>
          <TableHeader className="bg-muted/30 sticky top-0 z-10">
            <TableRow>
              <TableHead className="w-[36px]">
                <Checkbox
                  checked={allOnPagePicked ? true : someOnPagePicked ? "indeterminate" : false}
                  onCheckedChange={onTogglePickAll}
                  aria-label={t("modules.avtoprovodka.row.selectAll", {
                    defaultValue: "Hammasini tanlash",
                  })}
                  className="size-3.5"
                />
              </TableHead>
              {showCreated && (
                <TableHead className="w-[100px]">{t("modules.avtoprovodka.yaratilgan")}</TableHead>
              )}
              <TableHead className="w-[100px]">
                {t(showCreated ? "modules.avtoprovodka.hujjatSanasi" : "modules.avtoprovodka.sana")}
              </TableHead>
              <TableHead className="w-[140px]">{t("modules.avtoprovodka.raqam")}</TableHead>
              <TableHead>{t("modules.avtoprovodka.kontragent")}</TableHead>
              <TableHead className="w-[110px]">{t("modules.avtoprovodka.yonalish")}</TableHead>
              <TableHead className="w-[240px]">{t("modules.avtoprovodka.onecProvodka", { sys })}</TableHead>
              <TableHead>{t("modules.avtoprovodka.maqsadTavsif")}</TableHead>
              <TableHead className="w-[130px] text-right">{t("modules.avtoprovodka.summa")}</TableHead>
              <TableHead className="w-[160px]">{t("modules.avtoprovodka.holat")}</TableHead>
              <TableHead className="w-[48px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading || isFetching ? (
              Array.from({ length: Math.min(pageSize || 8, items.length || 8) || 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="size-3.5 rounded" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-2.5 w-24" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-28 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-36" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="size-7 rounded ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={showCreated ? 11 : 10} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Cpu className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {emptyText
                        || t("modules.avtoprovodka.row.noResults", {
                          defaultValue: "Yozuvlar topilmadi",
                        })}
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((e, i) => (
                <EntryRow
                  showCreated={showCreated}
                  key={e.id || `live-${e.source_id}`}
                  entry={e}
                  index={i}
                  sys={sys}
                  picked={selectedIds.has(entryKey(e))}
                  onPick={() => onTogglePick(entryKey(e))}
                  onOpen={() => onOpenRow(e)}
                  onAction={(action) => onAction(e, action)}
                />
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <Pagination
          page={page}
          pages={pages}
          total={total}
          pageSize={pageSize}
          onPageChange={onPageChange}
        />
      )}
    </div>
  );
}

function EntryRow({
  entry,
  index,
  sys,
  picked,
  showCreated,
  onPick,
  onOpen,
  onAction,
}: {
  entry: AvEntry;
  index: number;
  sys: string;
  picked: boolean;
  /** Render the EDO-created-date cell (document lists only). */
  showCreated: boolean;
  onPick: () => void;
  onOpen: () => void;
  onAction: (a: RowAction) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || "uz";
  // Number column: prefer the human onec_number, then Didox name, then a
  // short slice of doc_id, then source_id. Avoids dumping a 32-char UUID
  // into the cell when nothing else is available (G15).
  const docNumber =
    entry.onec_number
    || entry.name
    || entry.doc_id?.slice(0, 8)
    || entry.source_id?.slice(0, 8)
    || "—";

  // Date column — prefer doc_date (Didox), fall back to onec_date.
  const dateRaw = entry.doc_date || entry.onec_date || entry.last_checked_at;

  // Purpose / description column — backend-emitted localized doctype
  // label first, then operation_type, then matched_onec.type, then the
  // first provodka line description as a last resort.
  const purpose =
    pickLabel(entry.doctype_label, lang)
    || (entry.doctype && DOCTYPE_LABEL_FALLBACK[entry.doctype])
    || entry.operation_type
    || entry.matched_onec?.type
    || entry.entries[0]?.description
    || "";

  const dir = entry.direction === "incoming" || entry.direction === "outgoing"
    ? entry.direction
    : null;

  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/30 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
      style={{ animationDelay: `${Math.min(index, 12) * 25}ms` }}
      onClick={(e) => {
        if (e.target instanceof HTMLElement
          && e.target.closest("input, button, a, [role=menu], [data-stop]")) {
          return;
        }
        onOpen();
      }}
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={picked}
          onCheckedChange={() => onPick()}
          aria-label={t("modules.avtoprovodka.row.select", {
            defaultValue: "Tanlash",
          })}
          className="size-3.5"
        />
      </TableCell>
      {showCreated && (
        <TableCell className="whitespace-nowrap text-xs">
          {entry.created ? fmtDate(entry.created) : "—"}
        </TableCell>
      )}
      <TableCell className="whitespace-nowrap text-xs">
        {fmtDate(dateRaw)}
      </TableCell>
      <TableCell
        className="font-mono text-xs max-w-[140px] truncate"
        title={docNumber}
      >
        {docNumber}
      </TableCell>
      <TableCell className="max-w-[240px]">
        <div className="truncate font-semibold">
          {entry.counterparty_name || "—"}
        </div>
        {entry.counterparty_inn && (
          <div className="text-[11px] text-muted-foreground font-mono">
            {t("modules.avtoprovodka.inn")} {entry.counterparty_inn}
          </div>
        )}
      </TableCell>
      <TableCell>
        <DirectionBadge dir={dir} />
      </TableCell>
      <TableCell>
        <ProvodkaCell entry={entry} sys={sys} />
      </TableCell>
      <TableCell className="max-w-[260px]">
        <div className="truncate text-xs text-foreground" title={purpose}>
          {purpose || "—"}
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {money(entry.amount)}
        <span className="ml-1 text-[11px] text-muted-foreground">
          {t("modules.avtoprovodka.currencySom", { defaultValue: "so'm" })}
        </span>
      </TableCell>
      <TableCell>
        <StatusChip entry={entry} />
      </TableCell>
      <TableCell onClick={(e) => e.stopPropagation()} data-stop>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
              <MoreHorizontal className="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-44 p-1">
            <MenuItem onClick={() => onAction({ kind: "open" })}>
              {t("modules.avtoprovodka.row.detail", { defaultValue: "Tafsilot" })}
            </MenuItem>
            {entry.source_type !== "vedmosti"
              && entry.status !== "imported" && (
              <MenuItem onClick={() => onAction({ kind: "classify" })}>
                {t("modules.avtoprovodka.row.classify", {
                  defaultValue: "AI klassifikatsiya",
                })}
              </MenuItem>
            )}
            {!entry.in_onec && entry.has_provodka && entry.source_type === "document" && (
              <MenuItem onClick={() => onAction({ kind: "send" })}>
                {t("modules.avtoprovodka.row.sendTo1C", {
                  defaultValue: "{{sys}} ga yuborish",
                  sys,
                })}
              </MenuItem>
            )}
            {!entry.rejected_at && entry.status !== "imported" && (
              <MenuItem onClick={() => onAction({ kind: "reject" })}>
                {t("modules.avtoprovodka.row.reject", {
                  defaultValue: "Rad etish",
                })}
              </MenuItem>
            )}
            <MenuItem onClick={() => onAction({ kind: "delete" })} danger>
              {t("modules.avtoprovodka.row.delete", {
                defaultValue: "O'chirish",
              })}
            </MenuItem>
          </PopoverContent>
        </Popover>
      </TableCell>
    </TableRow>
  );
}

// ── YO'NALISH ─────────────────────────────────────────────────────────────────
function DirectionBadge({ dir }: { dir: Exclude<AvDirection, "all"> | null }) {
  const { t } = useTranslation();
  if (!dir) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  if (dir === "incoming") {
    return (
      <Badge
        variant="success"
        className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-transparent"
      >
        {t("modules.avtoprovodka.direction.incoming", {
          defaultValue: "Kiruvchi",
        })}
      </Badge>
    );
  }
  return (
    <Badge
      variant="info"
      className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-transparent"
    >
      {t("modules.avtoprovodka.direction.outgoing", {
        defaultValue: "Chiquvchi",
      })}
    </Badge>
  );
}

// ── 1C / PROVODKA ─────────────────────────────────────────────────────────────
function ProvodkaCell({ entry, sys }: { entry: AvEntry; sys: string }) {
  const { t } = useTranslation();
  const accounts = pickOnecAccounts(entry);
  const hasAccounts = accounts.length > 0;
  const extra = Math.max(0, accounts.length - 1);

  // State 1 — Posted to 1C AND has provodka lines we can render.
  if (entry.in_onec && entry.has_provodka) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge
            variant="success"
            className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-transparent"
          >
            {t("modules.avtoprovodka.onec.inOnec", {
              defaultValue: "✓ В {{sys}}",
              sys,
            })}
          </Badge>
          {hasAccounts && (
            <DtKtChips
              dt={accounts[0].debit}
              kt={accounts[0].credit}
              extra={extra}
            />
          )}
        </div>
        {entry.operation_type && (
          <div className="text-[11px] text-muted-foreground truncate">
            {t("modules.avtoprovodka.onec.classifyPrefix", {
              defaultValue: "Klassifikatsiya",
            })}
            : {entry.operation_type}
          </div>
        )}
      </div>
    );
  }
  // State 2 — Posted to 1C only.
  if (entry.in_onec) {
    return (
      <Badge
        variant="success"
        className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-transparent"
      >
        {t("modules.avtoprovodka.onec.inOnec", { defaultValue: "✓ В {{sys}}", sys })}
      </Badge>
    );
  }
  // State 3 — Has provodka (classified) but not yet in 1C.
  if (entry.has_provodka) {
    return (
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge
          variant="warning"
          className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-transparent"
        >
          {t("modules.avtoprovodka.onec.classified", {
            defaultValue: "Klassifikatsiyalangan",
          })}
        </Badge>
        {hasAccounts && (
          <DtKtChips
            dt={accounts[0].debit}
            kt={accounts[0].credit}
            extra={extra}
          />
        )}
      </div>
    );
  }
  // State 4 — Neither.
  return (
    <Badge
      variant="warning"
      className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-transparent"
    >
      {t("modules.avtoprovodka.onec.notInOnec", { defaultValue: "{{sys}} da yo'q", sys })}
    </Badge>
  );
}

function DtKtChips({
  dt, kt, extra,
}: { dt: string; kt: string; extra: number }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-mono">
      <span className="rounded bg-muted px-1.5 py-0.5">
        {t("modules.avtoprovodka.dt")} {dt || "?"}
      </span>
      <span className="text-muted-foreground">/</span>
      <span className="rounded bg-muted px-1.5 py-0.5">
        {t("modules.avtoprovodka.kt")} {kt || "?"}
      </span>
      {extra > 0 && (
        <span
          className="text-muted-foreground"
          title={t("modules.avtoprovodka.onec.andMore", {
            defaultValue: "yana {{count}} ta",
            count: extra,
          })}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}

// ── HOLAT ─────────────────────────────────────────────────────────────────────
const STATUS_GROUP_STYLE: Record<
  AvStatusGroup,
  { dot: string; chip: string }
> = {
  signed: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent",
  },
  pending: {
    dot: "bg-amber-500",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-transparent",
  },
  rejected: {
    dot: "bg-red-500",
    chip: "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
  },
  draft: {
    dot: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground border-transparent",
  },
  deleted: {
    dot: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground border-transparent",
  },
  unknown: {
    dot: "bg-muted-foreground",
    chip: "bg-muted text-muted-foreground border-transparent",
  },
};

// Fallback status labels (i18n key per group). Lifted from cloud
// `renderStatus`. Defaults are uz-Latin; other locales override via i18n.
const STATUS_GROUP_I18N: Record<AvStatusGroup, { key: string; def: string }> = {
  signed: {
    key: "modules.avtoprovodka.status.signed",
    def: "Imzolangan",
  },
  pending: {
    key: "modules.avtoprovodka.status.pending",
    def: "Imzo kutilmoqda",
  },
  rejected: {
    key: "modules.avtoprovodka.status.rejected",
    def: "Rad etilgan",
  },
  draft: {
    key: "modules.avtoprovodka.status.draft",
    def: "Qoralama",
  },
  deleted: {
    key: "modules.avtoprovodka.status.deleted",
    def: "O'chirilgan",
  },
  unknown: {
    key: "modules.avtoprovodka.status.unknown",
    def: "—",
  },
};

// Map our local AvStatus (cache rows) onto the same status_group bucket
// so rows from the cache list still get a colored chip even when the
// backend hasn't joined the live Didox status.
const CACHE_STATUS_TO_GROUP: Record<AvStatus, AvStatusGroup> = {
  unprocessed: "pending",
  unconfirmed: "pending",
  confirmed: "signed",
  sent: "signed",
  imported: "signed",
};

function StatusChip({ entry }: { entry: AvEntry }) {
  const { t, i18n } = useTranslation();
  const group: AvStatusGroup =
    entry.status_group
    || CACHE_STATUS_TO_GROUP[entry.status]
    || "unknown";
  const style = STATUS_GROUP_STYLE[group];
  // Prefer the backend's localized doc_status label, then translate the
  // group key, then fall back to a default uz string.
  const labelI18n = STATUS_GROUP_I18N[group];
  const label =
    pickLabel(entry.doc_status_label, i18n.language || "uz")
    || t(labelI18n.key, { defaultValue: labelI18n.def });
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-semibold "
        + style.chip
      }
    >
      <span className={`size-2 rounded-full ${style.dot}`} />
      {label}
    </span>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Pick a localized string from a `{uz, ru}` pair. Honours the current
 * i18next language (`uz`/`uz_Cyrl`/`ru`/`en`) and falls back to uz when
 * the requested locale is missing.
 */
function pickLabel(
  label: AvLabel | null | undefined,
  lang: string,
): string {
  if (!label) return "";
  const wantRu = (lang || "").toLowerCase().startsWith("ru");
  if (wantRu && label.ru) return label.ru;
  return label.uz || label.ru || "";
}

/**
 * Normalize the 1C account pairings cell. Prefers the backend's grouped
 * `in_onec_accounts` array; falls back to the row's `first_entry_*` pair
 * (cached rows) and finally to the raw `entries[]` array.
 */
function pickOnecAccounts(entry: AvEntry): AvOnecAccount[] {
  if (Array.isArray(entry.in_onec_accounts) && entry.in_onec_accounts.length) {
    return entry.in_onec_accounts;
  }
  if (entry.first_entry_debit || entry.first_entry_credit) {
    return [{
      debit: entry.first_entry_debit || "",
      credit: entry.first_entry_credit || "",
      amount: entry.amount ?? 0,
    }];
  }
  if (Array.isArray(entry.entries) && entry.entries.length) {
    return entry.entries
      .filter((e) => e.debit_account || e.credit_account)
      .map((e) => ({
        debit: e.debit_account || "",
        credit: e.credit_account || "",
        amount: e.amount ?? 0,
      }));
  }
  return [];
}

function MenuItem({
  children, onClick, danger,
}: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={
        "h-auto w-full justify-start rounded-sm px-2 py-1.5 text-left text-sm font-normal hover:bg-muted "
        + (danger ? "text-destructive" : "text-foreground")
      }
    >
      {children}
    </Button>
  );
}

function Pagination({
  page, pages, total, pageSize, onPageChange,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  onPageChange: (next: number) => void;
}) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Windowed page numbers — current ±5, with start/end + ellipsis.
  const win = 5;
  const items: (number | "…")[] = [];
  if (pages <= 13) {
    for (let p = 1; p <= pages; p++) items.push(p);
  } else {
    let lo = Math.max(2, page - win);
    let hi = Math.min(pages - 1, page + win);
    if (page - win <= 2) hi = Math.min(pages - 1, hi + (2 - (page - win)));
    if (page + win >= pages - 1) lo = Math.max(2, lo - ((page + win) - (pages - 1)));
    items.push(1);
    if (lo > 2) items.push("…");
    for (let p = lo; p <= hi; p++) items.push(p);
    if (hi < pages - 1) items.push("…");
    items.push(pages);
  }

  return (
    // Centered pagination; the count sits on the left (absolute) so the page
    // buttons stay in the middle and clear the fixed "AI Yordamchi" chat button.
    <div className="relative flex items-center justify-center py-2 px-4 text-sm">
      <span className="absolute left-4 hidden text-muted-foreground sm:block">
        {start}–{end} / {total}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <Button
          size="sm" variant="outline" disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
          className="h-7 w-7 p-0"
        >
          <ChevronLeft className="size-4" />
        </Button>
        {items.map((it, i) =>
          it === "…" ? (
            <span key={`e-${i}`} className="px-1 text-muted-foreground">…</span>
          ) : (
            <Button
              key={it}
              size="sm"
              variant={it === page ? "default" : "outline"}
              onClick={() => onPageChange(it)}
              className="h-7 min-w-7 px-2"
            >
              {it}
            </Button>
          )
        )}
        <Button
          size="sm" variant="outline" disabled={page >= pages}
          onClick={() => onPageChange(Math.min(pages, page + 1))}
          className="h-7 w-7 p-0"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
