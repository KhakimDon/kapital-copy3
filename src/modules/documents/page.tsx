import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useUrlNumber, useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";
import { useTranslation } from "react-i18next";
import {
  Search, ChevronLeft, ChevronRight, Tag, Percent, FileText, Plus,
  RefreshCw, SlidersHorizontal, Columns3, Inbox, Send, PenLine,
  LayoutTemplate, BarChart3, FileSearch, Ban, Trash2, ExternalLink,
  Copy, Check, Sparkles, ArrowRight,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useCompany } from "@/shared/store/company";
import { useTabs } from "@/shared/store/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column, type RowAction, type SortState } from "@/components/ui/data-table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ModuleShell, type ModuleSection } from "@/components/ui/module-shell";
import { useDocuments, useAllDocuments, useDocCounts } from "./api";
import { BulkBar, BulkModal, type BulkKind } from "./bulk";
import { OneCStatusIcon } from "./onec-icon";
import { CounterpartyCell } from "./counterparty-cell";
import { StatsView, StatsToolbar } from "./stats";
import {
  SECTIONS, STATUS_TABS, DRAFT_STATUS_TABS, DOCTYPE_FILTER, DOC_COLUMNS,
  DOC_COL_STORAGE_KEY, PAGE_SIZES, doctypeLabel, statusMeta, riskMeta,
  type ColumnId, type SectionKey, type StatusTabKey, type DocRow,
} from "./types";

function money(v?: number | null) {
  return v == null ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

// Compact local phone: strip the 998 country code and group as "90 137 44 21".
function formatPhone(raw?: string | null): string {
  if (!raw) return "—";
  const d = raw.replace(/\D/g, "");
  const n = d.length === 12 && d.startsWith("998") ? d.slice(3) : d.length === 9 ? d : "";
  if (!n) return raw; // unknown shape — show verbatim
  return `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5, 7)} ${n.slice(7, 9)}`;
}

// Click-to-copy value: light-grey pill on hover, copies `copy` (or the text).
function CopyText({ text, copy, className }: { text?: string | null; copy?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!text || text === "—") return <span className="text-muted-foreground">—</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(copy ?? text).then(
          () => { setCopied(true); setTimeout(() => setCopied(false), 1000); },
          () => {},
        );
      }}
      className={cn(
        "group/copy -mx-1 inline-flex max-w-full items-center gap-1 rounded px-1 py-0.5 align-middle transition-colors hover:bg-foreground/[0.07] active:bg-foreground/[0.12]",
        className,
      )}
    >
      <span className="truncate">{text}</span>
      {copied
        ? <Check className="size-3 shrink-0 text-success" />
        : <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/copy:opacity-50" />}
    </button>
  );
}

// Soft, per-status count-badge colours for the tabs (mirrors the cloud app:
// blue=all, amber=pending, green=signed, red=rejected, grey=draft/deleted).
const TAB_BADGE: Record<string, string> = {
  all: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  signed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  rejected: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  draft: "bg-muted text-muted-foreground",
  deleted: "bg-muted text-muted-foreground/80",
};

// Comparable value per column — drives both the header "sortable" flag and the
// client-side sort of the fetched window. One source of truth.
const SORT_ACCESSORS: Record<ColumnId, (d: DocRow) => string | number | null> = {
  status: (d) => d.status_group ?? null,
  doctype: (d) => d.doctype ?? null,
  date: (d) => d.doc_date ?? null,
  counterparty: (d) => d.partner_name ?? null,
  phone: (d) => d.partner_phone ?? null,
  amount: (d) => d.total_sum ?? null,
  without_vat: (d) => d.total_without_vat ?? null,
  vat: (d) => d.total_vat_sum ?? null,
  with_vat: (d) => d.total_with_vat ?? null,
  contract: (d) => d.contract_number ?? null,
  risk: (d) => d.doc_rating ?? null,
  agent: (d) => d.agent ?? null,
  benefits: (d) => (d.has_lgota ? 1 : 0),
};

function loadVisibleCols(): Record<ColumnId, boolean> {
  const all = Object.fromEntries(DOC_COLUMNS.map((c) => [c.id, true])) as Record<ColumnId, boolean>;
  try {
    const s = localStorage.getItem(DOC_COL_STORAGE_KEY);
    if (s) return { ...all, ...JSON.parse(s) };
  } catch { /* ignore */ }
  return all;
}

const SECTION_ICONS: Record<SectionKey, typeof Inbox> = {
  incoming: Inbox, outgoing: Send, drafts: PenLine,
  templates: LayoutTemplate, stats: BarChart3,
};

export function DocumentsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;

  // Section lives in the URL so a section can be deep-linked / opened in a new tab.
  const [sectionRaw, setSectionRaw] = useUrlState("section", "incoming");
  const section = sectionRaw as SectionKey;
  const setSection = (k: SectionKey) => setSectionRaw(k);
  // Navigational / query state lives in the URL (deep-link + Back/Forward).
  const [statusTabRaw, setStatusTabRaw] = useUrlState("status", "all");
  const statusTab = statusTabRaw as StatusTabKey;
  const setStatusTab = (k: StatusTabKey) => setStatusTabRaw(k);
  const [doctype, setDoctype] = useState<string>("all");
  const [searchInput, search, setSearchInput] = useUrlSearch("q", 400);
  const [page, setPage] = useUrlNumber("page", 1);
  const [limit, setLimit] = useState(20);
  // Sort lives in the URL. The upstream (Didox) has no sort param, so when a
  // sort is active we pull the whole filtered set once (capped) and sort +
  // paginate it client-side.
  const [sortId, setSortId] = useUrlState("sort", "");
  const [sortDir, setSortDir] = useUrlState("order", "");
  const sorting = !!sortId;
  const [filterOpen, setFilterOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [visibleCols, setVisibleCols] = useState<Record<ColumnId, boolean>>(loadVisibleCols);

  // selection (bulk)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkKind, setBulkKind] = useState<BulkKind | null>(null);
  // a single row targeted by its context menu (reuses the bulk confirm modal);
  // null → the modal acts on the current multi-select instead.
  const [actionRows, setActionRows] = useState<DocRow[] | null>(null);

  const isList = section === "incoming" || section === "outgoing" || section === "drafts";
  const isDrafts = section === "drafts";

  // Open a document in its OWN app tab (not inside the list tab). Reuse the tab
  // if that exact doc is already open, otherwise spawn a new one.
  const goDetail = (id?: string | null) => {
    if (!id) return;
    const path = `/documents/${id}`;
    const st = useTabs.getState();
    const existing = st.tabs.find((t) => t.path === path);
    if (existing) {
      st.setActive(existing.id);
    } else {
      // Remember the exact list URL we came from, so the detail's Back can
      // return to it (close this tab if that list is still there, else reopen it).
      st.setReferrer(path, location.pathname + location.search);
      st.openNew(path);
    }
  };

  // Reflect the active section in this list tab's title: «ЭДО (Входящие)» etc.
  const setTabTitle = useTabs((s) => s.setTitle);
  useEffect(() => {
    const base = t("nav.navItems.documents", { defaultValue: "EDO" }).split("(")[0].trim();
    const sectionLabel = t(`modules.documents.sections.${section}`);
    setTabTitle(location.pathname + location.search, `${base} (${sectionLabel})`);
  }, [section, t, location.pathname, location.search, setTabTitle]);

  // The tab content lives in a scrollable ancestor (per-tab overflow-auto box).
  // On page/limit change, return it to the top so the new rows start at the top.
  const topRef = useRef<HTMLDivElement>(null);
  function scrollToTop() {
    let el: HTMLElement | null = topRef.current;
    while (el) {
      if (el.scrollHeight > el.clientHeight && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) {
        // instant, not smooth: the page swap re-renders rows mid-animation and
        // interrupts a smooth scroll, leaving it stranded partway down.
        el.scrollTo({ top: 0 });
        return;
      }
      el = el.parentElement;
    }
  }
  const goPage = (p: number) => { setPage(p); scrollToTop(); };

  // Column sort (client-side over the fetched window). Header click cycles
  // asc → desc → off and lands back on page 1.
  const sortState: SortState = sortId ? { id: sortId, dir: sortDir === "desc" ? "desc" : "asc" } : null;
  const handleSort = (next: SortState) => {
    setSortId(next?.id ?? "");
    setSortDir(next?.dir ?? "");
    setPage(1);
    scrollToTop();
  };

  // reset to page 1 + clear selection whenever a filter changes
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
    // setPage is stable from the URL hook; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section, statusTab, doctype, search, dateFrom, dateTo, limit, companyId]);

  // when entering Drafts force the status to a draft-allowed tab
  useEffect(() => {
    if (isDrafts && !DRAFT_STATUS_TABS.includes(statusTab)) setStatusTab("all");
  }, [isDrafts, statusTab]);

  function persistCols(next: Record<ColumnId, boolean>) {
    setVisibleCols(next);
    try { localStorage.setItem(DOC_COL_STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  }

  const owner = SECTIONS.find((s) => s.key === section)?.owner ?? 0;
  const doctypeParam = doctype === "all" ? undefined : doctype;
  // Drafts section: pin the status to the 'draft' group regardless of All/Deleted tab,
  // except the Deleted tab which narrows to deleted.
  const effectiveStatus = isDrafts
    ? (statusTab === "deleted" ? "deleted" : "draft")
    : (statusTab === "all" ? undefined : statusTab);

  const counts = useDocCounts(isList ? companyId : null, {
    owner, doctype: doctypeParam, search: search || undefined,
  });
  // Normal view: server-paginated. Sort view: pull the whole filtered set once
  // (chunked) and sort/paginate it client-side (the upstream has no sort param).
  const filterParams = {
    owner, status: effectiveStatus, doctype: doctypeParam, search: search || undefined,
  };
  const paged = useDocuments(isList && !sorting ? companyId : null, {
    ...filterParams, skip: (page - 1) * limit, limit,
  });
  const all = useAllDocuments(isList && sorting ? companyId : null, filterParams);
  const data = sorting ? all.data : paged.data;
  const isLoading = sorting ? all.isLoading : paged.isLoading;
  const isFetching = sorting ? all.isFetching : paged.isFetching;
  const refetch = sorting ? all.refetch : paged.refetch;
  const truncated = sorting ? (all.data?.truncated ?? false) : false;

  const fetched = data?.items ?? [];
  // Sort the whole fetched window client-side (upstream has no sort param).
  const sortedAll = useMemo(() => {
    const acc = sorting ? SORT_ACCESSORS[sortId as ColumnId] : undefined;
    if (!acc) return fetched;
    const dir = sortDir === "desc" ? -1 : 1;
    return [...fetched].sort((a, b) => {
      const va = acc(a);
      const vb = acc(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1; // nulls last
      if (vb == null) return -1;
      const c =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va).localeCompare(String(vb), undefined, { numeric: true });
      return c * dir;
    });
  }, [fetched, sorting, sortId, sortDir]);

  const serverTotal = data?.total ?? 0;
  const total = sorting ? sortedAll.length : serverTotal;
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);

  // Sort mode paginates the sorted set client-side; otherwise the server did.
  const rows = sorting ? sortedAll.slice((page - 1) * limit, page * limit) : fetched;
  const selectableRows = rows.filter((r) => r.id && (r.can_sign || r.can_delete));
  const selectedRows = rows.filter((r) => r.id && selectedIds.has(r.id));
  // The bulk modal operates on either a single context-menu target or the multi-select.
  const modalRows = actionRows ?? selectedRows;

  const tabs = useMemo(
    () => (isDrafts ? STATUS_TABS.filter((t) => DRAFT_STATUS_TABS.includes(t.key)) : STATUS_TABS),
    [isDrafts],
  );

  function toggleRow(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    setSelectedIds((prev) => {
      if (selectableRows.every((r) => prev.has(r.id!))) return new Set();
      return new Set(selectableRows.map((r) => r.id!));
    });
  }

  if (!companyId) {
    return (
      <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
        {t("modules.documents.emptyState.pickCompany")}
      </div>
    );
  }

  const colVisible = (id: ColumnId) => visibleCols[id] !== false;

  // Column catalogue — one Column<DocRow> per column id. Only the currently
  // visible ones (respecting the ColumnsPicker) are handed to <DataTable>.
  const COLS: Record<ColumnId, Column<DocRow>> = {
    status: {
      id: "status", header: t("modules.documents.columns.status"), width: "w-[90px]",
      sortAccessor: (d) => d.status_group ?? null,
      cell: (d) => {
        const st = statusMeta(d.status_group);
        const stLabel = d.status_group ? t(`modules.documents.status.${d.status_group}`, st.label) : st.label;
        return (
          <span className="flex items-center gap-1.5">
            <Badge variant={st.variant}>{stLabel}</Badge>
            <OneCStatusIcon row={d} />
          </span>
        );
      },
    },
    doctype: {
      id: "doctype", header: t("modules.documents.columns.doctype"),
      sortAccessor: (d) => d.doctype ?? null,
      cell: (d) => {
        const full = d.doctype ? t(`modules.documents.doctypes.${d.doctype}`, doctypeLabel(d.doctype)) : doctypeLabel(d.doctype);
        // A per-doctype short label for the list (falls back to the full name).
        const label = d.doctype ? t(`modules.documents.doctypesShort.${d.doctype}`, { defaultValue: full }) : full;
        return (
          <>
            <div className="font-medium flex items-center gap-1.5 whitespace-nowrap" title={full}>
              {label}
              {d.has_marks && <Tag className="size-3.5 shrink-0 text-primary" />}
            </div>
            {d.name && <div className="text-xs text-muted-foreground tabular-nums truncate max-w-[220px]">{d.name}</div>}
          </>
        );
      },
    },
    date: {
      id: "date", header: t("modules.documents.columns.date"), width: "w-[110px]",
      sortAccessor: (d) => d.doc_date ?? null,
      cellClassName: "whitespace-nowrap text-sm", cell: (d) => d.doc_date ?? "—",
    },
    counterparty: {
      id: "counterparty", header: t("modules.documents.columns.counterparty"),
      sortAccessor: (d) => d.partner_name ?? null,
      // Left-click → open the doc (row nav); right-click → counterparty profile.
      cell: (d) => (
        <CounterpartyCell
          d={d}
          companyId={companyId}
          tinNode={d.partner_tin && <CopyText text={d.partner_tin} className="tabular-nums text-xs text-muted-foreground" />}
        />
      ),
    },
    phone: {
      id: "phone", header: t("modules.documents.columns.phone"), width: "w-[130px]",
      sortAccessor: (d) => d.partner_phone ?? null,
      cellClassName: "whitespace-nowrap",
      cell: (d) => <CopyText text={formatPhone(d.partner_phone)} copy={d.partner_phone ?? undefined} className="tabular-nums text-sm" />,
    },
    amount: {
      id: "amount", header: t("modules.documents.columns.amount"), align: "right",
      sortAccessor: (d) => d.total_sum ?? null,
      cellClassName: "tabular-nums whitespace-nowrap font-semibold text-[#101010]", cell: (d) => money(d.total_sum),
    },
    without_vat: {
      id: "without_vat", header: t("modules.documents.columns.withoutVat"), align: "right",
      sortAccessor: (d) => d.total_without_vat ?? null,
      cellClassName: "tabular-nums whitespace-nowrap text-sm", cell: (d) => money(d.total_without_vat),
    },
    vat: {
      id: "vat", header: t("modules.documents.columns.vat"), align: "right",
      sortAccessor: (d) => d.total_vat_sum ?? null,
      cellClassName: "tabular-nums whitespace-nowrap text-sm", cell: (d) => money(d.total_vat_sum),
    },
    with_vat: {
      id: "with_vat", header: t("modules.documents.columns.withVat"), align: "right",
      sortAccessor: (d) => d.total_with_vat ?? null,
      cellClassName: "tabular-nums whitespace-nowrap font-bold text-[#7000FF]", cell: (d) => money(d.total_with_vat),
    },
    contract: {
      id: "contract", header: t("modules.documents.columns.contract"), width: "w-[140px]",
      sortAccessor: (d) => d.contract_number ?? null,
      cell: (d) => d.contract_number ? (
        <>
          <div className="text-sm truncate max-w-[130px]">{d.contract_number}</div>
          {d.contract_date && <div className="text-xs text-muted-foreground">{d.contract_date}</div>}
        </>
      ) : <span className="text-muted-foreground">—</span>,
    },
    risk: {
      id: "risk", header: t("modules.documents.columns.risk"), width: "w-[80px]",
      sortAccessor: (d) => d.doc_rating ?? null,
      cell: (d) => {
        const rk = riskMeta(d.doc_rating);
        const rkLabel = rk && d.doc_rating ? t(`modules.documents.risk.${d.doc_rating.toUpperCase()}`, rk.label) : rk?.label;
        return rk ? <Badge variant={rk.variant}>{rkLabel}</Badge> : <span className="text-muted-foreground">—</span>;
      },
    },
    agent: {
      id: "agent", header: t("modules.documents.columns.agent"), width: "w-[120px]",
      sortAccessor: (d) => d.agent ?? null,
      cellClassName: "text-sm truncate max-w-[120px]", cell: (d) => d.agent || "—",
    },
    benefits: {
      id: "benefits", header: t("modules.documents.columns.benefits"), width: "w-[80px]",
      sortAccessor: (d) => (d.has_lgota ? 1 : 0),
      cell: (d) => d.has_lgota
        ? <Badge variant="success" className="gap-1"><Percent className="size-3" />{t("modules.documents.benefits.yes")}</Badge>
        : <span className="text-muted-foreground">—</span>,
    },
  };
  const columns = DOC_COLUMNS.filter((c) => colVisible(c.id)).map((c) => COLS[c.id]);

  // Per-row context-menu actions (right-click + ⋯). Sign/Reject/Delete reuse the
  // bulk confirm modal by targeting just this one row.
  const rowActions = (d: DocRow): RowAction<DocRow>[] => {
    const acts: RowAction<DocRow>[] = [
      { key: "open-new", label: t("modules.documents.actions.openNewTab"), icon: ExternalLink,
        disabled: !d.id, onSelect: () => goDetail(d.id) },
      { key: "open-here", label: t("modules.documents.actions.openThisTab"), icon: ArrowRight,
        disabled: !d.id, onSelect: () => { if (d.id) navigate(`/documents/${d.id}`); } },
      // Placeholder — wired up once the AI assistant lands.
      { key: "ai-info", label: t("modules.documents.actions.aiInfo"), icon: Sparkles,
        separatorBefore: true, onSelect: () => {} },
    ];
    if (d.can_sign) {
      acts.push({ key: "sign", label: t("modules.documents.actions.sign"), icon: PenLine,
        separatorBefore: true, onSelect: () => { setActionRows([d]); setBulkKind("sign"); } });
      acts.push({ key: "reject", label: t("modules.documents.actions.reject"), icon: Ban,
        onSelect: () => { setActionRows([d]); setBulkKind("reject"); } });
    }
    if (d.can_delete) {
      acts.push({ key: "delete", label: t("modules.documents.actions.delete"), icon: Trash2,
        destructive: true, separatorBefore: true,
        onSelect: () => { setActionRows([d]); setBulkKind("delete"); } });
    }
    return acts;
  };

  const shellSections: ModuleSection[] = SECTIONS.map((s) => {
    const Icon = SECTION_ICONS[s.key];
    return {
      key: s.key,
      label: t(`modules.documents.sections.${s.key}`),
      icon: <Icon className="size-4 shrink-0" />,
      // URL for the right-click "open in new tab / window" menu.
      menuTo: `/documents?section=${s.key}`,
    };
  });

  const shellActions = (
    <>
      {isList && (
        <>
          <div className="relative">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("modules.documents.placeholders.search")}
              className="pl-8 w-56"
            />
          </div>
          <Button variant="outline" size="icon" title={t("modules.documents.actions.filter")}
                  onClick={() => setFilterOpen((o) => !o)}
                  aria-pressed={filterOpen}>
            <SlidersHorizontal className="size-4" />
          </Button>
          <Button variant="outline" size="icon" title={t("modules.documents.actions.refresh")}
                  onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <ColumnsPicker visibleCols={visibleCols} onChange={persistCols} />
        </>
      )}
      {/* Stats section: date range + view menu live in the module header row. */}
      {section === "stats" && <StatsToolbar />}
      {section !== "stats" && (
        <Button onClick={() => navigate("/documents/create")}>
          <Plus className="size-4 mr-1.5" /> {t("modules.documents.actions.newDocument")}
        </Button>
      )}
    </>
  );

  return (
    <ModuleShell
      title={t("modules.documents.title")}
      icon={<FileText className="size-6" />}
      subtitle={t(`modules.documents.sections.${section}`)}
      sections={shellSections}
      active={section}
      onSelect={(k) => setSection(k as SectionKey)}
      actions={shellActions}
    >
        {/* scroll anchor — used to find the tab's scroll box for scroll-to-top */}
        <div ref={topRef} aria-hidden="true" />
        {/* collapsible filter panel */}
        {isList && (
          <Collapsible open={filterOpen}>
            <CollapsibleContent>
              <div className="rounded-lg border bg-card p-3 flex items-end gap-3 flex-wrap">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground block">{t("modules.documents.filters.doctype")}</span>
                  <Select value={doctype} onValueChange={setDoctype}>
                    <SelectTrigger className="w-[220px]"><SelectValue placeholder={t("modules.documents.filters.allTypes")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("modules.documents.filters.allTypes")}</SelectItem>
                      {DOCTYPE_FILTER.map((d) => (
                        <SelectItem key={d.value} value={d.value}>{t(`modules.documents.doctypes.${d.value}`, d.label)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground block">{t("modules.documents.filters.dateFrom")}</span>
                  <DatePicker value={dateFrom} onChange={(v) => setDateFrom(v)} className="w-[160px]" />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground block">{t("modules.documents.filters.dateTo")}</span>
                  <DatePicker value={dateTo} onChange={(v) => setDateTo(v)} className="w-[160px]" />
                </label>
                <div className="flex items-center gap-2">
                  <Button onClick={() => { setPage(1); refetch(); }}>{t("modules.documents.actions.apply")}</Button>
                  <Button variant="outline" onClick={() => { setDoctype("all"); setDateFrom(""); setDateTo(""); setPage(1); }}>
                    {t("modules.documents.actions.clear")}
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* ===== TEMPLATES view ===== */}
        {section === "templates" && (
          <div className="rounded-lg border bg-card p-10 text-center text-muted-foreground space-y-2">
            <LayoutTemplate className="size-8 mx-auto opacity-60" />
            <div className="font-medium text-foreground">{t("modules.documents.templates.title")}</div>
            <p className="text-sm">{t("modules.documents.templates.description")}</p>
          </div>
        )}

        {/* ===== STATS view ===== */}
        {section === "stats" && <StatsView companyId={companyId} onOpenDoc={goDetail} />}

        {/* ===== LIST view ===== */}
        {isList && (
          <>
            {/* status tabs */}
            <div className="flex items-center gap-1 flex-wrap border-b">
              {tabs.map((tb) => {
                const n = counts.data?.[tb.countKey as keyof typeof counts.data];
                const active = statusTab === tb.key;
                return (
                  <Button
                    key={tb.key}
                    variant="ghost"
                    size="sm"
                    onClick={() => setStatusTab(tb.key)}
                    className={cn(
                      "h-auto gap-1.5 rounded-none border-b-2 -mb-px px-3 py-2.5 font-normal hover:bg-transparent",
                      active
                        ? "border-primary text-primary font-medium"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {t(`modules.documents.statusTabs.${tb.key}`, tb.label)}
                    {!isDrafts && n != null && (
                      <span className={cn(
                        "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none",
                        TAB_BADGE[tb.key] ?? TAB_BADGE.deleted,
                      )}>
                        {n}
                      </span>
                    )}
                  </Button>
                );
              })}
            </div>

            {/* bulk bar */}
            {selectedIds.size > 0 && (
              <BulkBar
                count={selectedIds.size}
                onSign={() => setBulkKind("sign")}
                onReject={() => setBulkKind("reject")}
                onDelete={() => setBulkKind("delete")}
                onClear={() => setSelectedIds(new Set())}
              />
            )}

            {/* table — one reusable DataTable: selection, right-click / ⋯ row
                actions, skeleton loading, striping, staggered rows, empty state. */}
            <DataTable<DocRow>
              columns={columns}
              rows={rows}
              rowKey={(d, i) => d.id ?? d.doc_id ?? `row-${i}`}
              loading={isLoading}
              isFetching={isFetching}
              onRowClick={(d) => goDetail(d.id)}
              rowActions={rowActions}
              hideActionsColumn
              actionsLabel={t("modules.documents.actions.rowMenu")}
              sortState={sortState}
              onSortChange={handleSort}
              selection={{
                selectedIds,
                onToggleRow: toggleRow,
                onToggleAll: toggleAll,
                isSelectable: (d) => !!d.id && (!!d.can_sign || !!d.can_delete),
                selectAllLabel: t("modules.documents.actions.selectAll"),
                selectRowLabel: t("modules.documents.actions.select"),
              }}
              empty={
                <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                  <div className="size-14 rounded-full bg-muted grid place-items-center">
                    <FileSearch className="size-7 text-muted-foreground" />
                  </div>
                  <div className="text-sm font-medium text-foreground">{t("modules.documents.emptyState.notFound")}</div>
                  {search.trim() && (
                    <Button variant="outline" size="sm" onClick={() => setSearchInput("")}>
                      {t("modules.documents.actions.clear")}
                    </Button>
                  )}
                </div>
              }
            />

            {/* pagination + page size */}
            <div className="flex items-center justify-between text-sm gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground">{from}–{to} / {total}</span>
                {sorting && truncated && (
                  <span className="text-xs text-warning" title={t("modules.documents.pagination.sortTruncatedHint", { defaultValue: "Faqat birinchi hujjatlar saralandi" })}>
                    {t("modules.documents.pagination.sortTruncated", { defaultValue: "qisman saralandi" })}
                  </span>
                )}
                <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); scrollToTop(); }}>
                  <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{t("modules.documents.pagination.perPage", { count: n })}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || isFetching}
                        onClick={() => goPage(Math.max(1, page - 1))}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-muted-foreground">{page} / {pages}</span>
                <Button variant="outline" size="sm" disabled={page >= pages || isFetching}
                        onClick={() => goPage(Math.min(pages, page + 1))}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          </>
        )}

        {bulkKind && (
          <BulkModal
            companyId={companyId}
            kind={bulkKind}
            rows={modalRows}
            onClose={() => { setBulkKind(null); setActionRows(null); }}
            onDone={() => {
              setBulkKind(null);
              // clear the multi-select only when the modal was acting on it
              if (!actionRows) setSelectedIds(new Set());
              setActionRows(null);
            }}
          />
        )}
    </ModuleShell>
  );
}

function ColumnsPicker({
  visibleCols, onChange,
}: {
  visibleCols: Record<ColumnId, boolean>;
  onChange: (next: Record<ColumnId, boolean>) => void;
}) {
  const { t } = useTranslation();
  const colLabelKey: Record<ColumnId, string> = {
    status: "modules.documents.columns.status",
    doctype: "modules.documents.columns.doctype",
    date: "modules.documents.columns.date",
    counterparty: "modules.documents.columns.counterparty",
    phone: "modules.documents.columns.phone",
    amount: "modules.documents.columns.amount",
    without_vat: "modules.documents.columns.withoutVat",
    vat: "modules.documents.columns.vat",
    with_vat: "modules.documents.columns.withVat",
    contract: "modules.documents.columns.contract",
    risk: "modules.documents.columns.risk",
    agent: "modules.documents.columns.agent",
    benefits: "modules.documents.columns.benefits",
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" title={t("modules.documents.actions.columns")}>
          <Columns3 className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-2">
        <div className="text-xs font-medium text-muted-foreground px-1 pb-1.5">{t("modules.documents.actions.columns")}</div>
        <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
          {DOC_COLUMNS.map((c) => (
            <label key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted cursor-pointer">
              <Checkbox
                     checked={visibleCols[c.id] !== false}
                     onCheckedChange={(v) => onChange({ ...visibleCols, [c.id]: Boolean(v) })}
                     className="size-4" />
              {t(colLabelKey[c.id], c.label)}
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
