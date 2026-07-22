import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlState } from "@/shared/hooks/use-url-state";
import {
  CalendarClock, CheckCircle2, ChevronRight, Inbox, Loader2, Maximize2, Minimize2, Send,
  SlidersHorizontal, Tag,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DateRangePicker, isoToDate, dateToIso, type DateRange,
} from "@/components/ui/date-range-picker";
import { cn } from "@/shared/lib/utils";
import { useAllDocuments } from "./api";
import { statusMeta, doctypeLabel, type DocRow } from "./types";
import { CounterpartyCell } from "./counterparty-cell";
import { useStatsPrefs, type StatsDensity, type ToggleableStatus } from "./stats-prefs";

function todayIso() { return new Date().toISOString().slice(0, 10); }
function monthAgoIso() {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function num(v?: number | string | null) {
  const n = typeof v === "string" ? parseFloat(v) : v ?? 0;
  return (n || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}
const day = (d?: string | null) => (d || "").slice(0, 10);
const inRange = (d?: string | null, from?: string, to?: string) => {
  const x = day(d);
  if (!x) return true;
  if (from && x < from) return false;
  if (to && x > to) return false;
  return true;
};
const sumAmount = (rows: DocRow[]) => rows.reduce((s, d) => s + (Number(d.total_sum) || 0), 0);

const MS_DAY = 24 * 60 * 60 * 1000;
// Legal EDI acceptance window: a counterparty has this many days from the
// document date (doc_date) to accept/sign it. Change here if the law changes.
const ACCEPTANCE_DAYS = 10;
// "Recently accepted" heuristic: a document dated ~2 months back (this window in
// days) that was only signed within the last ACCEPTANCE_DAYS — a late acceptance.
const OLD_DOC_MIN_DAYS = 45;
const OLD_DOC_MAX_DAYS = 90;

/** Whole days between two YYYY-MM-DD dates (b - a), rounded up. Positive = b later. */
function daysBetween(aIso: string, bIso: string): number {
  const a = Date.parse(`${aIso}T00:00:00Z`);
  const b = Date.parse(`${bIso}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.ceil((b - a) / MS_DAY);
}

/** The acceptance deadline (doc_date + ACCEPTANCE_DAYS) as YYYY-MM-DD, or "". */
function acceptanceDeadline(d: DocRow): string {
  const doc = day(d.doc_date);
  if (!doc) return "";
  return new Date(Date.parse(`${doc}T00:00:00Z`) + ACCEPTANCE_DAYS * MS_DAY)
    .toISOString().slice(0, 10);
}

/** Days left until a PENDING document's acceptance deadline (negative = overdue).
 *  `null` when the doc isn't pending or carries no date — those rows get no badge.
 *  Every pending row shows this, not just the ones in the "deadline" section. */
function pendingDaysLeft(d: DocRow, todayIsoStr: string): number | null {
  if (d.status_group !== "pending") return null;
  const deadline = acceptanceDeadline(d);
  if (!deadline) return null;
  return daysBetween(todayIsoStr, deadline);
}

type StatTab = "outgoing" | "incoming";
type Agg = {
  total: { count: number; amount: number };
  signed: DocRow[];
  pending: DocRow[];
  rejected: DocRow[];
};

export function StatsView({
  companyId,
  onOpenDoc,
}: {
  companyId: number;
  onOpenDoc: (id?: string | null) => void;
}) {
  const { t } = useTranslation();
  // Date-range + active flow tab are navigational → URL (deep-link + Back/Forward).
  // The date range itself is edited from the module header via <StatsToolbar/>
  // (which reads/writes the same "from"/"to" URL keys), so here we only READ it.
  const [dateFrom] = useUrlState("from", monthAgoIso());
  const [dateTo] = useUrlState("to", todayIso());
  const [tab, setTab] = useUrlState("stab", "outgoing");
  const activeTab = (tab === "incoming" ? "incoming" : "outgoing") as StatTab;

  // Persistent view preferences (status visibility, density, bottom sections).
  const prefs = useStatsPrefs();

  // We aggregate CLIENT-SIDE, keyed on the invoice date (doc_date), not the sent
  // date — a month-end invoice sent early next month must count toward its own
  // month. The Didox stats passthrough keys on the sent date, so we don't use it.
  const out = useAllDocuments(companyId, { owner: 1, doctype: "002" }, true);
  const inc = useAllDocuments(companyId, { owner: 0, doctype: "002" }, true);
  const isLoading = out.isLoading || inc.isLoading;
  const isFetching = out.isFetching || inc.isFetching;
  const error = out.error || inc.error;

  const aggregate = useMemo(() => {
    const build = (items?: DocRow[]): Agg => {
      const inR = (items ?? []).filter((d) => inRange(d.doc_date, dateFrom, dateTo));
      const signed = inR.filter((d) => d.status_group === "signed");
      const pending = inR.filter((d) => d.status_group === "pending");
      const rejected = inR.filter((d) => d.status_group === "rejected");
      return {
        signed,
        pending,
        rejected,
        total: { count: signed.length + pending.length, amount: sumAmount(signed) + sumAmount(pending) },
      };
    };
    return { outgoing: build(out.data?.items), incoming: build(inc.data?.items) };
  }, [out.data?.items, inc.data?.items, dateFrom, dateTo]);

  const active = aggregate[activeTab];
  const truncated = activeTab === "outgoing" ? out.data?.truncated : inc.data?.truncated;

  const today = todayIso();

  // Approaching-deadline rows (PENDING of the active flow, deadline within the
  // acceptance window). Computed from doc_date — no backend field involved.
  const deadlineRows = useMemo(() => {
    return active.pending
      .map((d) => {
        const daysLeft = pendingDaysLeft(d, today);
        return daysLeft == null ? null : { d, daysLeft };
      })
      .filter((r): r is { d: DocRow; daysLeft: number } => r != null && r.daysLeft <= ACCEPTANCE_DAYS)
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [active.pending, today]);

  // Recently-accepted rows: signed within the last ACCEPTANCE_DAYS, but the doc
  // itself is ~2 months old (a late acceptance of an old document).
  const recentRows = useMemo(() => {
    return active.signed
      .filter((d) => {
        const signed = day(d.signed_date);
        const doc = day(d.doc_date);
        if (!signed || !doc) return false;
        const sinceSigned = daysBetween(signed, today);
        const docAge = daysBetween(doc, today);
        return sinceSigned >= 0 && sinceSigned <= ACCEPTANCE_DAYS
          && docAge >= OLD_DOC_MIN_DAYS && docAge <= OLD_DOC_MAX_DAYS;
      })
      .sort((a, b) => day(b.signed_date).localeCompare(day(a.signed_date)));
  }, [active.signed, today]);

  const statusGroups: ToggleableStatus[] = ["signed", "pending", "rejected"];

  return (
    <div className="space-y-4">
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
          <Loader2 className="size-5 animate-spin" /> {t("modules.documents.stats.loading")}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive animate-in fade-in-0 duration-300">
          {t("modules.documents.stats.loadError")}
        </div>
      ) : (
        <div className={cn("space-y-4 animate-in fade-in-0 duration-300", isFetching && "opacity-70")}>
          {/* flow tab bar — outgoing / incoming, each with its count + sum */}
          <div className="inline-flex w-full items-stretch gap-1 rounded-xl bg-muted/60 p-1">
            {(["outgoing", "incoming"] as StatTab[]).map((k) => {
              const tot = aggregate[k].total;
              const isActive = activeTab === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTab(k)}
                  className={cn(
                    "flex flex-1 flex-col rounded-lg px-3 py-2 text-left transition-colors",
                    isActive
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-sm font-semibold", isActive ? "text-primary" : "")}>
                      {t(`modules.documents.sections.${k}`)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("modules.documents.stats.docsCount", { count: tot.count, defaultValue: "{{count}} hujjat" })}
                    </span>
                  </div>
                  <div className={cn("mt-0.5 tabular-nums text-lg font-semibold", isActive ? "text-foreground" : "")}>
                    {num(tot.amount)}
                  </div>
                </button>
              );
            })}
          </div>

          {/* status groups within the active tab — visibility per prefs */}
          <div className="space-y-3">
            {statusGroups.filter((s) => prefs[s]).map((s) => (
              <StatusGroup
                key={s}
                companyId={companyId}
                status={s}
                rows={active[s]}
                density={prefs.density}
                onOpenDoc={onOpenDoc}
              />
            ))}
          </div>

          {/* NEW: approaching acceptance deadline */}
          {prefs.showDeadline && (
            <DeadlineSection companyId={companyId} rows={deadlineRows} density={prefs.density} onOpenDoc={onOpenDoc} />
          )}

          {/* NEW: recently accepted old documents */}
          {prefs.showRecent && (
            <RecentAcceptedSection companyId={companyId} rows={recentRows} density={prefs.density} onOpenDoc={onOpenDoc} />
          )}

          {truncated && (
            <p className="text-xs text-muted-foreground">
              {t("modules.documents.stats.truncated", { defaultValue: "Faqat oxirgi hujjatlar ko'rsatildi" })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** The stats toolbar — date range + view menu. Lives in the MODULE HEADER row
 *  (rendered by page.tsx as a shell action), not inside the stats body. Reads &
 *  writes the same "from"/"to" URL keys StatsView reads, so both stay in sync. */
export function StatsToolbar() {
  const [dateFrom, setDateFrom] = useUrlState("from", monthAgoIso());
  const [dateTo, setDateTo] = useUrlState("to", todayIso());
  const range: DateRange | undefined = { from: isoToDate(dateFrom), to: isoToDate(dateTo) };
  return (
    <div className="flex items-center gap-2">
      <DateRangePicker
        value={range}
        onChange={(r) => {
          if (r?.from) setDateFrom(dateToIso(r.from) ?? dateFrom);
          if (r?.to) setDateTo(dateToIso(r.to) ?? dateTo);
        }}
      />
      <ViewMenu />
    </div>
  );
}

// ── "Vid" (View) dropdown — status visibility, density, section toggles ────────
function ViewMenu() {
  const { t } = useTranslation();
  const prefs = useStatsPrefs();

  const statusItems: { key: ToggleableStatus; labelKey: string; fallback: string }[] = [
    { key: "signed", labelKey: "modules.documents.status.signed", fallback: "Podpisan" },
    { key: "pending", labelKey: "modules.documents.status.pending", fallback: "V ojidanii" },
    { key: "rejected", labelKey: "modules.documents.status.rejected", fallback: "Otklanen" },
  ];
  // Interface density — Control-Center-style circular icon toggles (same look as
  // the Tasks "Karta ko'rinishi" menu): detailed = spacious (Maximize2),
  // compact = dense (Minimize2).
  const densities: { key: StatsDensity; Icon: typeof Maximize2; labelKey: string; fallback: string }[] = [
    { key: "detailed", Icon: Maximize2, labelKey: "modules.documents.stats.density.detailed", fallback: "Batafsil" },
    { key: "compact", Icon: Minimize2, labelKey: "modules.documents.stats.density.compact", fallback: "Ixcham" },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5">
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">{t("modules.documents.stats.view", { defaultValue: "Ko'rinish" })}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel>{t("modules.documents.stats.statusVisibility", { defaultValue: "Holatlar" })}</DropdownMenuLabel>
        {statusItems.map((it) => (
          <ToggleRow
            key={it.key}
            label={t(it.labelKey, { defaultValue: it.fallback })}
            checked={prefs[it.key]}
            onCheckedChange={(v) => prefs.setStatus(it.key, v)}
          />
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("modules.documents.stats.density.title", { defaultValue: "Zichlik" })}</DropdownMenuLabel>
        <div className="grid grid-cols-2 gap-1 px-1 pb-1">
          {densities.map(({ key, Icon, labelKey, fallback }) => {
            const on = prefs.density === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => prefs.setDensity(key)}
                className="flex flex-col items-center gap-1.5 rounded-xl py-1.5 transition-colors hover:bg-foreground/5"
              >
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-full transition-colors [&_svg]:size-[18px]",
                    on ? "bg-primary text-primary-foreground shadow-sm" : "bg-foreground/10 text-foreground",
                  )}
                >
                  <Icon />
                </span>
                <span className={cn("text-[11px]", on ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {t(labelKey, { defaultValue: fallback })}
                </span>
              </button>
            );
          })}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("modules.documents.stats.sectionsLabel", { defaultValue: "Bo'limlar" })}</DropdownMenuLabel>
        <ToggleRow
          label={t("modules.documents.stats.deadline.title", { defaultValue: "Qabul qilish muddati" })}
          checked={prefs.showDeadline}
          onCheckedChange={prefs.setShowDeadline}
        />
        <ToggleRow
          label={t("modules.documents.stats.recent.title", { defaultValue: "So'nggi qabul qilinganlar" })}
          checked={prefs.showRecent}
          onCheckedChange={prefs.setShowRecent}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A checkbox-style row inside the view menu — keeps the menu open on toggle. */
function ToggleRow({
  label, checked, onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm transition-colors hover:bg-accent"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="truncate">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

// ── status group (collapsible) ─────────────────────────────────────────────────
function StatusGroup({
  companyId,
  status,
  rows,
  density,
  onOpenDoc,
}: {
  companyId: number;
  status: ToggleableStatus;
  rows: DocRow[];
  density: StatsDensity;
  onOpenDoc: (id?: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(status === "pending"); // pending open by default — usually the actionable one
  const meta = statusMeta(status);

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
        <Badge variant={meta.variant}>{t(`modules.documents.status.${status}`, meta.label)}</Badge>
        <span className="text-sm text-muted-foreground">
          {t("modules.documents.stats.docsCount", { count: rows.length, defaultValue: "{{count}} hujjat" })}
        </span>
        <span className="ml-auto tabular-nums font-semibold">{num(sumAmount(rows))}</span>
      </button>

      {open && (
        <div>
          {rows.length === 0 ? (
            <div className="border-t"><EmptyRows /></div>
          ) : (
            <>
              {/* pending rows carry a days-left / overdue badge → extra column */}
              <ColumnsHeader density={density} deadline={status === "pending"} />
              {rows
                .slice()
                .sort((a, b) => day(b.doc_date).localeCompare(day(a.doc_date)))
                .map((d, i) => (
                  <InvoiceRow key={d.id || d.doc_id || i} d={d} companyId={companyId} density={density} onOpenDoc={onOpenDoc} />
                ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function EmptyRows() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-1.5 py-8 text-sm text-muted-foreground">
      <Inbox className="size-5 opacity-60" />
      {t("modules.documents.stats.empty", { defaultValue: "Hujjat yo'q" })}
    </div>
  );
}

// Shared column layout for the detailed document rows. Fixed widths so the
// header lines up with every row; the less-critical columns fold away as the
// viewport narrows (contract → below xl, sums/date → below lg, party → below md).
const COL = {
  status: "w-[96px] shrink-0",
  main: "min-w-0 flex-1",
  date: "hidden md:block w-[94px] shrink-0",
  party: "hidden md:block w-56 shrink-0 min-w-0",
  contract: "hidden xl:block w-28 shrink-0 min-w-0",
  noVat: "hidden lg:block w-28 shrink-0 text-right",
  vat: "hidden lg:block w-24 shrink-0 text-right",
  deadline: "w-[104px] shrink-0 text-right",
  total: "w-32 shrink-0 text-right",
};

/** Short doctype label (falls back to the full name / raw code). */
function doctypeShort(t: ReturnType<typeof useTranslation>["t"], dt?: string | null): string {
  if (!dt) return "—";
  const full = t(`modules.documents.doctypes.${dt}`, { defaultValue: doctypeLabel(dt) });
  return t(`modules.documents.doctypesShort.${dt}`, { defaultValue: full });
}

/** A document's number, labelled so a bare "16" can't be mistaken for a count. */
function docNumber(t: ReturnType<typeof useTranslation>["t"], d: DocRow): string {
  return d.name
    ? `№ ${d.name}`
    : t("modules.documents.stats.noNumber", { defaultValue: "— raqamsiz —" });
}

/** The aligned column header shown once at the top of an open group. Compact
 *  keeps status/doc/date/counterparty/total; detailed adds contract + the VAT
 *  breakdown. `deadline`/`accepted` add the extra column those sections use. */
function ColumnsHeader({
  density, deadline, accepted,
}: {
  density: StatsDensity;
  deadline?: boolean;
  accepted?: boolean;
}) {
  const { t } = useTranslation();
  const C = (k: string, d: string) => t(`modules.documents.columns.${k}`, { defaultValue: d });
  const detailed = density === "detailed";
  return (
    <div className="flex items-center gap-3 border-t bg-muted/30 px-4 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
      <span className={COL.status}>{C("status", "Holat")}</span>
      <span className={COL.main}>{C("doctype", "Hujjat")}</span>
      <span className={COL.date}>
        {accepted
          ? t("modules.documents.stats.recent.acceptedCol", { defaultValue: "Qabul" })
          : C("date", "Sana")}
      </span>
      <span className={COL.party}>{C("counterparty", "Kontragent")}</span>
      {detailed && (
        <>
          <span className={COL.contract}>{C("contract", "Shartnoma")}</span>
          <span className={COL.noVat}>{C("withoutVat", "QQSsiz")}</span>
          <span className={COL.vat}>{C("vat", "QQS")}</span>
        </>
      )}
      {deadline && (
        <span className={COL.deadline}>
          {t("modules.documents.stats.deadline.col", { defaultValue: "Muddat" })}
        </span>
      )}
      <span className={COL.total}>{C("amount", "Summa")}</span>
    </div>
  );
}

// ── one document row — columns depend on density ───────────────────────────────
function InvoiceRow({
  d,
  companyId,
  density,
  onOpenDoc,
  trailing,
}: {
  d: DocRow;
  companyId: number;
  density: StatsDensity;
  onOpenDoc: (id?: string | null) => void;
  /** Optional node rendered in its own column just before the amount (the
   *  deadline badge). When set, the group's header must pass `deadline`. */
  trailing?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const meta = statusMeta(d.status_group);
  const sent = day(d.signed_date);
  const detailed = density === "detailed";
  const number = docNumber(t, d);

  // A pending document ALWAYS shows how long it has left to be accepted (or how
  // long it is overdue) — the deadline section isn't the only place that matters.
  // An explicit `trailing` (the deadline section's own badge) wins.
  const autoDays = trailing ? null : pendingDaysLeft(d, todayIso());
  const deadlineNode = trailing ?? (autoDays != null ? <DeadlineBadge daysLeft={autoDays} /> : null);

  // Compact: one line — status · type №num · date · counterparty · total. Denser
  // than detailed (no contract / VAT split, no second line), but you can still
  // tell WHO the document is with, which is the whole point of the list.
  if (!detailed) {
    return (
      <div
        onClick={() => onOpenDoc(d.id)}
        className="flex cursor-pointer items-center gap-3 border-t px-4 py-1.5 text-sm hover:bg-muted/40 transition-colors"
      >
        <span className={COL.status}>
          <Badge variant={meta.variant}>
            {d.status_group ? t(`modules.documents.status.${d.status_group}`, meta.label) : meta.label}
          </Badge>
        </span>
        <span className={cn(COL.main, "flex items-center gap-1.5")}>
          <span className="truncate">{doctypeShort(t, d.doctype)}</span>
          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{number}</span>
          {d.has_marks && <Tag className="size-3 shrink-0 text-primary" />}
        </span>
        <span className={cn(COL.date, "whitespace-nowrap text-xs text-muted-foreground")}>
          {day(d.doc_date) || "—"}
        </span>
        <div className={COL.party}>
          <CounterpartyCell d={d} companyId={companyId} />
        </div>
        {deadlineNode}
        <span className={cn(COL.total, "tabular-nums")}>{num(d.total_sum)}</span>
      </div>
    );
  }

  return (
    <div
      onClick={() => onOpenDoc(d.id)}
      className="flex cursor-pointer items-center gap-3 border-t px-4 py-2 text-sm hover:bg-muted/40 transition-colors"
    >
      <span className={COL.status}>
        <Badge variant={meta.variant}>
          {d.status_group ? t(`modules.documents.status.${d.status_group}`, meta.label) : meta.label}
        </Badge>
      </span>

      {/* doctype + number */}
      <div className={COL.main}>
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{doctypeShort(t, d.doctype)}</span>
          {d.has_marks && <Tag className="size-3 shrink-0 text-primary" />}
        </div>
        <div className="truncate tabular-nums text-xs text-muted-foreground">{number}</div>
      </div>

      {/* date (doc date + sent) */}
      <div className={cn(COL.date, "text-xs text-muted-foreground")}>
        <div className="whitespace-nowrap">{day(d.doc_date) || "—"}</div>
        {sent && (
          <div className="inline-flex items-center gap-0.5 whitespace-nowrap" title={t("modules.documents.stats.sentAt", { defaultValue: "Yuborilgan" })}>
            <Send className="size-3" /> {sent}
          </div>
        )}
      </div>

      {/* counterparty — left-click bubbles up to open the doc, right-click → profile */}
      <div className={COL.party}>
        <CounterpartyCell
          d={d}
          companyId={companyId}
          tinNode={d.partner_tin && <span className="tabular-nums text-xs text-muted-foreground">{d.partner_tin}</span>}
        />
      </div>

      {/* contract */}
      <div className={cn(COL.contract, "text-xs text-muted-foreground")}>
        {d.contract_number ? (
          <>
            <div className="truncate">{d.contract_number}</div>
            {d.contract_date && <div className="truncate">{d.contract_date}</div>}
          </>
        ) : "—"}
      </div>

      {/* money — without VAT · VAT · total */}
      <span className={cn(COL.noVat, "tabular-nums text-xs text-muted-foreground")}>{num(d.total_without_vat)}</span>
      <span className={cn(COL.vat, "tabular-nums text-xs text-muted-foreground")}>{num(d.total_vat_sum)}</span>
      {deadlineNode}
      <span className={cn(COL.total, "tabular-nums")}>{num(d.total_sum)}</span>
    </div>
  );
}

// ── NEW: approaching acceptance deadline ───────────────────────────────────────
function DeadlineSection({
  companyId,
  rows,
  density,
  onOpenDoc,
}: {
  companyId: number;
  rows: { d: DocRow; daysLeft: number }[];
  density: StatsDensity;
  onOpenDoc: (id?: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
        <CalendarClock className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">
          {t("modules.documents.stats.deadline.title", { defaultValue: "Qabul qilish muddati" })}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("modules.documents.stats.docsCount", { count: rows.length, defaultValue: "{{count}} hujjat" })}
        </span>
      </button>
      {open && (
        <div>
          {rows.length === 0 ? (
            <div className="border-t"><EmptyRows /></div>
          ) : (
            <>
              <ColumnsHeader density={density} deadline />
              {rows.map(({ d, daysLeft }, i) => (
                <InvoiceRow
                  key={d.id || d.doc_id || i}
                  d={d}
                  companyId={companyId}
                  density={density}
                  onOpenDoc={onOpenDoc}
                  trailing={<DeadlineBadge daysLeft={daysLeft} />}
                />
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function DeadlineBadge({ daysLeft }: { daysLeft: number }) {
  const { t } = useTranslation();
  // green > 3 days, amber 1–3 days, red ≤ 0 (overdue).
  const cls =
    daysLeft <= 0
      ? "bg-destructive/15 text-destructive"
      : daysLeft <= 3
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  const label =
    daysLeft <= 0
      ? t("modules.documents.stats.deadline.overdue", { defaultValue: "Muddati o'tgan" })
      : t("modules.documents.stats.deadline.daysLeft", { count: daysLeft, defaultValue: "{{count}} kun qoldi" });
  return (
    <span className={COL.deadline}>
      <span className={cn("inline-block rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap", cls)}>
        {label}
      </span>
    </span>
  );
}

// ── NEW: recently accepted old documents ───────────────────────────────────────
function RecentAcceptedSection({
  companyId,
  rows,
  density,
  onOpenDoc,
}: {
  companyId: number;
  rows: DocRow[];
  density: StatsDensity;
  onOpenDoc: (id?: string | null) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded-xl border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 px-4 py-3 hover:bg-muted/40 transition-colors"
      >
        <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
        <CheckCircle2 className="size-4 text-muted-foreground" />
        <span className="text-sm font-semibold">
          {t("modules.documents.stats.recent.title", { defaultValue: "So'nggi qabul qilinganlar" })}
        </span>
        <span className="text-sm text-muted-foreground">
          {t("modules.documents.stats.docsCount", { count: rows.length, defaultValue: "{{count}} hujjat" })}
        </span>
      </button>
      {open && (
        <div>
          {rows.length === 0 ? (
            <div className="border-t"><EmptyRows /></div>
          ) : (
            <>
              <ColumnsHeader density={density} accepted />
              {rows.map((d, i) => (
                <RecentRow key={d.id || d.doc_id || i} d={d} companyId={companyId} density={density} onOpenDoc={onOpenDoc} />
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/** Recently-accepted row: mirrors InvoiceRow's columns, but the date column
 *  emphasises the accepted (signed) date in green — that late-acceptance gap is
 *  the whole point of this section. */
function RecentRow({
  d,
  companyId,
  density,
  onOpenDoc,
}: {
  d: DocRow;
  companyId: number;
  density: StatsDensity;
  onOpenDoc: (id?: string | null) => void;
}) {
  const { t } = useTranslation();
  const meta = statusMeta(d.status_group);
  const detailed = density === "detailed";
  const number = docNumber(t, d);

  if (!detailed) {
    return (
      <div
        onClick={() => onOpenDoc(d.id)}
        className="flex cursor-pointer items-center gap-3 border-t px-4 py-1.5 text-sm hover:bg-muted/40 transition-colors"
      >
        <span className={COL.status}>
          <Badge variant={meta.variant}>
            {d.status_group ? t(`modules.documents.status.${d.status_group}`, meta.label) : meta.label}
          </Badge>
        </span>
        <span className={cn(COL.main, "flex items-center gap-1.5")}>
          <span className="truncate">{doctypeShort(t, d.doctype)}</span>
          <span className="shrink-0 tabular-nums text-xs text-muted-foreground">{number}</span>
        </span>
        <span className={cn(COL.date, "whitespace-nowrap text-xs text-emerald-600 dark:text-emerald-400")}>
          {day(d.signed_date) || "—"}
        </span>
        <div className={COL.party}>
          <CounterpartyCell d={d} companyId={companyId} />
        </div>
        <span className={cn(COL.total, "tabular-nums")}>{num(d.total_sum)}</span>
      </div>
    );
  }

  return (
    <div
      onClick={() => onOpenDoc(d.id)}
      className="flex cursor-pointer items-center gap-3 border-t px-4 py-2 text-sm hover:bg-muted/40 transition-colors"
    >
      <span className={COL.status}>
        <Badge variant={meta.variant}>
          {d.status_group ? t(`modules.documents.status.${d.status_group}`, meta.label) : meta.label}
        </Badge>
      </span>

      <div className={COL.main}>
        <div className="truncate font-medium">{doctypeShort(t, d.doctype)}</div>
        <div className="truncate tabular-nums text-xs text-muted-foreground">{number}</div>
      </div>

      {/* accepted (signed) date in green, doc date under it */}
      <div className={cn(COL.date, "text-xs")}>
        {day(d.signed_date) ? (
          <div className="inline-flex items-center gap-0.5 whitespace-nowrap text-emerald-600 dark:text-emerald-400" title={t("modules.documents.stats.recent.acceptedAt", { defaultValue: "Qabul qilingan" })}>
            <CheckCircle2 className="size-3" /> {day(d.signed_date)}
          </div>
        ) : "—"}
        <div className="whitespace-nowrap text-muted-foreground" title={t("modules.documents.stats.byDocDate", { defaultValue: "hujjat sanasi bo'yicha" })}>
          {day(d.doc_date) || "—"}
        </div>
      </div>

      <div className={COL.party}>
        <CounterpartyCell
          d={d}
          companyId={companyId}
          tinNode={d.partner_tin && <span className="tabular-nums text-xs text-muted-foreground">{d.partner_tin}</span>}
        />
      </div>

      <div className={cn(COL.contract, "text-xs text-muted-foreground")}>
        {d.contract_number ? (
          <>
            <div className="truncate">{d.contract_number}</div>
            {d.contract_date && <div className="truncate">{d.contract_date}</div>}
          </>
        ) : "—"}
      </div>

      <span className={cn(COL.noVat, "tabular-nums text-xs text-muted-foreground")}>{num(d.total_without_vat)}</span>
      <span className={cn(COL.vat, "tabular-nums text-xs text-muted-foreground")}>{num(d.total_vat_sum)}</span>
      <span className={cn(COL.total, "tabular-nums")}>{num(d.total_sum)}</span>
    </div>
  );
}
