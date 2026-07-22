/**
 * AI Avtoprovodka — cloud-parity rebuild.
 *
 * Layout mirrors cloud `aiba_avtoprovodka/templates/main.php`:
 *
 *   ┌──────┬──────────────────────────────────────────────────────┐
 *   │      │ Toolbar (search · base picker · source toggles)      │
 *   │ Side ├──────────────────────────────────────────────────────┤
 *   │ bar  │ Stats row (Jami · 1C da yo'q · Tanlangan + bulk btn) │
 *   │      ├──────────────────────────────────────────────────────┤
 *   │      │ 9-column entries table + pagination                  │
 *   └──────┴──────────────────────────────────────────────────────┘
 *
 *   Floating: 1C-sync banner + AI-mining banner (bottom-right).
 *   Modals  : classify-result + entry-detail (Sheet).
 *
 * State tracks: active source, per-source filters (year/account/file/q),
 * pagination, selection, classify modal target, and detail drawer
 * target. Switching sources resets selection + page but preserves the
 * other filters per cloud's per-tab viewState.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCompany } from "@/shared/store/company";
import { useUrlNumber, useUrlState } from "@/shared/hooks/use-url-state";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";
import {
  type AvDirection, type AvEntry, type AvSource, type DocSource,
  type SourceCounts,
  useBankAccounts, useVedmostiFiles, useOnecBases, useBankSyncStatus,
  useBankSync, useCheck1C, useAiAuto,
  useCheck1CStatus, useSourceCounts, useSourceList,
  useUploadBankExcel, useUploadVedmostiExcel,
  useBulkConfirm, useBulkSend,
  useBulkSendDocs, useBulkClassifyDocs,
  entryKey, sysLabel,
} from "./api";
import { AvSidebar } from "./sidebar";
import { AvToolbar } from "./toolbar";
import { AvStatsRow } from "./stats-row";
import { EntryTable } from "./entry-table";
import { AvDetailDrawer } from "./detail-drawer";
import { ClassifyResultModal } from "./classify-modal";
import { Sync1CBanner, MiningBanner } from "./mining-banner";

const PAGE_SIZE = 20;

const EMPTY_COUNTS: SourceCounts = {
  document: 0,
  bank_txn: 0,
  fiscal_cheque: 0,
  vedmosti: 0,
  not_in_1c: 0,
};

export function AvtoprovodkaPage() {
  const companyId = useCompany((s) => s.current)?.id ?? null;

  if (!companyId) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        Avval yuqoridan kompaniya tanlang.
      </div>
    );
  }
  return <AvtoprovodkaInner companyId={companyId} />;
}

function AvtoprovodkaInner({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  // ── URL state: active tab / sub-tab / direction / page survive a refresh ────
  // Harmonized onto the shared use-url-state hooks (read string + cast union),
  // matching the previous manual useSearchParams behavior: defaults omitted from
  // the URL, writes use `replace`.
  const [sourceRaw, setSourceRaw] = useUrlState("source", "document");
  const source = (["document", "bank_txn", "fiscal_cheque", "vedmosti"] as AvSource[])
    .includes(sourceRaw as AvSource) ? (sourceRaw as AvSource) : "document";
  const setSource = (v: AvSource) => setSourceRaw(v);

  const [docSrcRaw, setDocSrcRaw] = useUrlState("docsrc", "didox");
  const docSource = (["didox", "onec_out", "onec_in"] as DocSource[])
    .includes(docSrcRaw as DocSource) ? (docSrcRaw as DocSource) : "didox";
  const setDocSource = (v: DocSource) => setDocSrcRaw(v);

  const [q, setQ] = useUrlState("q");
  const [year, setYear] = useState<number | "all">(new Date().getFullYear());
  // "" = all, "yes" = in 1C, "no" = not in 1C. The old `notin1c=1` links keep
  // working — they mean the same thing as in1c=no.
  const [in1cRaw, setIn1cRaw] = useUrlState("in1c");
  const [legacyNotIn1C, setLegacyNotIn1C] = useUrlState("notin1c");
  const in1c = in1cRaw || (legacyNotIn1C === "1" ? "no" : "");
  // Any explicit change must also clear the legacy param, or it keeps
  // re-asserting "no" after the user clicks Hammasi (in1c="" falls back to it).
  const setIn1c = (v: string) => {
    setIn1cRaw(v);
    if (legacyNotIn1C) setLegacyNotIn1C("");
  };
  const onlyNotIn1C = in1c === "no";
  // direction is Documents-tab only; persisted across docSource changes because
  // the cloud reads it as a top-level filter, not a per-source one.
  const [dirRaw, setDirRaw] = useUrlState("dir", "all");
  const direction = (["all", "incoming", "outgoing"] as AvDirection[])
    .includes(dirRaw as AvDirection) ? (dirRaw as AvDirection) : "all";
  const setDirection = (v: AvDirection) => setDirRaw(v);
  const [account, setAccount] = useState("");
  const [file, setFile] = useState("");
  const [selectedBase, setSelectedBase] = useUrlState("base");
  const [page, setPage] = useUrlNumber("page", 1);

  // ── Selection ──────────────────────────────────────────────────────────────
  // key (see `entryKey`) → numeric entry id (0 for live rows, which have none).
  // Keyed by identity rather than id because every live document row carries
  // id 0, which made one tick select the whole page.
  const [picked, setPicked] = useState<Map<string, number>>(new Map());

  // ── Detail / classify modals ───────────────────────────────────────────────
  // The clicked ROW, not its id: live rows all carry id 0 (no cache row), so
  // looking the entry back up by id always resolved to the first row on the
  // page — every row opened the same document.
  const [drawerEntry, setDrawerEntry] = useState<AvEntry | null>(null);
  const [drawerMode, setDrawerMode] = useState<"view" | "confirm" | "reject">("view");
  const [classifyEntry, setClassifyEntry] = useState<AvEntry | null>(null);
  // Whether the modal re-runs the engine (classify) or shows the stored
  // suggestion (send/review). Both open the same modal.
  const [classifyLive, setClassifyLive] = useState(false);

  // ── Floating banners ───────────────────────────────────────────────────────
  const [syncBannerOpen, setSyncBannerOpen] = useState(false);
  const [syncBannerDismissed, setSyncBannerDismissed] = useState(false);
  const [miningBannerOpen, setMiningBannerOpen] = useState(false);
  const [miningPercent, setMiningPercent] = useState(0);
  const [miningMeta, setMiningMeta] = useState("");

  // Reset selection + page + search on source switch (matches cloud
  // switchSource). Account filter is shared between Bank and Vedmosti
  // — wipe it when moving to a tab that doesn't consume it. File
  // filter is Vedmosti-only.
  const prevSource = useRef(source);
  useEffect(() => {
    // Reset filters only when the source TAB actually CHANGES — not on the
    // initial mount or React StrictMode's double-invoke (compare the value, not
    // a one-shot flag, so the URL-restored state survives a refresh).
    if (prevSource.current === source) return;
    prevSource.current = source;
    setPage(1);
    setPicked(new Map());
    setQ("");
    setIn1c("");
    // Direction filter is documents-only; reset when leaving the tab so the
    // next visit starts neutral and Bank/Cheklar/Vedmosti can't inherit it.
    if (source !== "document") setDirection("all");
    if (source !== "bank_txn" && source !== "vedmosti") setAccount("");
    if (source !== "vedmosti") setFile("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // ── Data ───────────────────────────────────────────────────────────────────
  // Documents are the only year-scoped source; elsewhere the year select is
  // hidden and the badge must stay unscoped.
  const counts = useSourceCounts(
    companyId,
    source === "document" && year !== "all" ? year : null,
  );
  const bases = useOnecBases(companyId);
  // Which accounting system this company's books live in — the backend probes
  // 1C first (priority), 1UZ as fallback. Every "1C …" label switches on it.
  const provider = bases.data?.provider ?? bases.data?.items?.[0]?.provider ?? null;
  const sys = sysLabel(provider);
  const bankAccounts = useBankAccounts(companyId, source === "bank_txn");
  const vedmostiFiles = useVedmostiFiles(companyId, source === "vedmosti");
  const bankSync = useBankSyncStatus(companyId, source === "bank_txn");

  const listFilters = useMemo(
    () => ({
      source,
      year: source === "document" && year !== "all" ? year : null,
      account: source === "bank_txn" || source === "vedmosti" ? account || null : null,
      file: source === "vedmosti" ? file || null : null,
      in_1c: in1c || undefined,
      q,
      page,
      page_size: PAGE_SIZE,
      // Direction is only meaningful on the Documents tab; collapse to
      // "all" everywhere else so the api helper omits the param entirely.
      direction: source === "document" ? direction : ("all" as AvDirection),
      // Selected 1C base — forwarded as ?infobase_id= so the backend
      // can scope live listings (G19). Empty string means "Auto".
      infobase_id: selectedBase || null,
    }),
    [source, year, account, file, in1c, q, page, direction, selectedBase],
  );
  const list = useSourceList(companyId, listFilters);
  const items = list.data?.items ?? [];
  // Re-resolve the open row from the current page so the drawer follows
  // refetches (a confirm inside it updates the row); fall back to the clicked
  // snapshot once the row has scrolled out of the loaded page.
  const drawerRow = drawerEntry
    ? (items.find((i) => entryKey(i) === entryKey(drawerEntry)) ?? drawerEntry)
    : null;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const check1c = useCheck1C(companyId);
  // Server-side scan state — survives a reload, unlike the mutation's own
  // pending flag.
  const scanStatus = useCheck1CStatus(companyId, source);
  const scanRunning = !!scanStatus.data?.running;
  useEffect(() => {
    // Run finished → drop the "started it myself" flag so the banner closes,
    // and re-arm the dismissal for the next run.
    if (!scanRunning) {
      setSyncBannerOpen(false);
      setSyncBannerDismissed(false);
    }
  }, [scanRunning]);
  const aiAuto = useAiAuto(companyId);
  const bankSyncMut = useBankSync(companyId);
  const uploadBank = useUploadBankExcel(companyId);
  const uploadVedmosti = useUploadVedmostiExcel(companyId);
  const bulkConfirm = useBulkConfirm();
  const bulkSend = useBulkSend();
  // Live rows (documents) go through the didox-id endpoints; the numeric-id
  // ones above only ever addressed cache rows.
  const bulkSendDocs = useBulkSendDocs(companyId);
  const bulkClassifyDocs = useBulkClassifyDocs(companyId);
  const bulkStatus = useCheck1CStatus(companyId, "bulk");
  // The run's closing note ("12 ta hujjat 1C ga yuborildi", or why not) — the
  // selection bar that showed the progress is gone by then, so it lives here.
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  const bulkRunning = !!bulkStatus.data?.running;
  const wasBulkRunning = useRef(false);
  useEffect(() => {
    if (wasBulkRunning.current && !bulkRunning) {
      setBulkNote(bulkStatus.data?.note ?? null);
      setPicked(new Map());
      window.setTimeout(() => setBulkNote(null), 12_000);
    }
    wasBulkRunning.current = bulkRunning;
    // bulkStatus.data is read only on the falling edge; tracking it as a dep
    // would re-run this on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkRunning]);

  // ── Selection helpers ──────────────────────────────────────────────────────
  const togglePick = (key: string) => {
    setPicked((cur) => {
      const next = new Map(cur);
      if (next.has(key)) next.delete(key);
      else next.set(key, items.find((i) => entryKey(i) === key)?.id ?? 0);
      return next;
    });
  };
  const togglePickAll = () => {
    setPicked((cur) => {
      const next = new Map(cur);
      const onPage = items.map((i) => [entryKey(i), i.id] as const);
      const allPicked = onPage.length > 0 && onPage.every(([k]) => next.has(k));
      onPage.forEach(([k, id]) => (allPicked ? next.delete(k) : next.set(k, id)));
      return next;
    });
  };

  // Reset page-1 on filter changes (search/year/account/file/only-not-in-1c).
  // ── Toolbar handlers ───────────────────────────────────────────────────────
  const handleCheck1C = () => {
    setSyncBannerOpen(true);
    setSyncBannerDismissed(false);
    // The scan itself is year-independent (it always covers the whole history);
    // `year` still goes up for the bank source, which scopes its own scan.
    check1c.mutate({
      source,
      year: source === "document" && year !== "all" ? (year as number) : null,
    });
    // The optimistic flag only bridges the gap until the status query reports
    // the run; if no run ever shows up (start refused), don't strand the banner.
    window.setTimeout(() => setSyncBannerOpen(false), 10_000);
  };

  const handleAiAuto = () => {
    // Walk a fake progress arc so the banner doesn't look frozen on
    // instant responses from the poc dispatcher.
    setMiningBannerOpen(true);
    setMiningPercent(10);
    setMiningMeta("Navbatga qo'shilmoqda...");
    aiAuto.mutate(
      { source },
      {
        onSuccess: (res) => {
          setMiningPercent(100);
          setMiningMeta(
            res.queued_count > 0
              ? `${res.queued_count} ta hujjat navbatda${res.note ? ` (${res.note})` : ""}`
              : (res.note || "Klassifikatsiya kerakli emas"),
          );
          window.setTimeout(() => setMiningBannerOpen(false), 2400);
        },
        onError: () => {
          setMiningMeta("Xatolik yuz berdi");
          window.setTimeout(() => setMiningBannerOpen(false), 2000);
        },
      },
    );
  };

  // ── Row + bulk actions ─────────────────────────────────────────────────────
  // Bulk endpoints address cache rows by numeric id; live rows have none, so
  // they are dropped rather than posted as a list of zeros.
  const pickedIds = Array.from(picked.values()).filter((id) => id > 0);

  // Selected didox ids, in the order they appear on screen.
  const pickedDocIds = Array.from(picked.keys());

  const onBulkClassify = () => {
    if (source === "document") {
      if (pickedDocIds.length === 0) return;
      bulkClassifyDocs.mutate({ docIds: pickedDocIds });
      return;
    }
    if (pickedIds.length === 0) return;
    bulkConfirm.mutate({ ids: pickedIds }, { onSuccess: () => setPicked(new Map()) });
  };
  const onBulkSend = () => {
    if (source === "document") {
      if (pickedDocIds.length === 0) return;
      bulkSendDocs.mutate({ docIds: pickedDocIds, infobase_id: selectedBase || null });
      return;
    }
    if (pickedIds.length === 0) return;
    bulkSend.mutate({ ids: pickedIds }, { onSuccess: () => setPicked(new Map()) });
  };

  // Counts map for the sidebar — typed strictly to keep TS happy.
  const sidebarCounts: Record<AvSource, number> = {
    document: counts.data?.document ?? 0,
    bank_txn: counts.data?.bank_txn ?? 0,
    fiscal_cheque: counts.data?.fiscal_cheque ?? 0,
    vedmosti: counts.data?.vedmosti ?? 0,
  };
  const totalForSource = sidebarCounts[source];
  // Every tab count comes from `source-counts`, and ONLY from there. Swapping
  // in the live list `total` while a filter was active is what made "1C da
  // yo'q" read 606 and then 9547 the moment you clicked it — a tab must not
  // renumber itself for being selected.
  //
  // NB the bare `not_in_1c` is the cross-source SUM and must never be shown on
  // one tab (the "Bank reads 360" bug); per-source is the fallback's fallback.
  const notIn1CForSource =
    counts.data?.not_in_1c_by_source?.[source]
      ?? counts.data?.not_in_1c ?? EMPTY_COUNTS.not_in_1c;
  const in1CForSource = counts.data?.in_1c_by_source?.[source] ?? 0;

  return (
    <div className="flex h-[calc(100vh-7rem)] -mx-4 -mt-4 rounded-lg border border-border bg-background overflow-hidden">
      <AvSidebar source={source} onChange={setSource} counts={sidebarCounts} />

      <main className="flex flex-1 min-w-0 flex-col">
        <AvToolbar
          source={source}
          docSource={docSource}
          sys={sys}
          q={q}
          year={year}
          direction={direction}
          account={account}
          file={file}
          selectedBase={selectedBase}
          bases={bases.data?.items ?? []}
          basesLoading={bases.isLoading}
          accounts={bankAccounts.data?.accounts ?? []}
          files={vedmostiFiles.data?.files ?? []}
          isLoading={list.isFetching}
          isChecking={check1c.isPending || !!scanStatus.data?.running}
          isAiAuto={aiAuto.isPending}
          isUploading={uploadBank.isPending || uploadVedmosti.isPending}
          isSyncing={bankSyncMut.isPending}
          onSearchChange={(v) => { setQ(v); setPage(1); }}
          onDocSourceChange={(v) => { setDocSource(v); setPage(1); }}
          onDirectionChange={(v) => { setDirection(v); setPage(1); }}
          onYearChange={(v) => { setYear(v); setPage(1); }}
          onAccountChange={(v) => { setAccount(v); setPage(1); }}
          onFileChange={(v) => { setFile(v); setPage(1); }}
          onBaseChange={setSelectedBase}
          onRefresh={() => list.refetch()}
          onCheck1C={handleCheck1C}
          check1cProgress={scanStatus.data}
          bulkNote={bulkNote}
          onAiAuto={handleAiAuto}
          onUploadBank={(f) => uploadBank.mutate({ file: f })}
          onBankSync={() => bankSyncMut.mutate()}
          onUploadVedmosti={(f) => uploadVedmosti.mutate({ file: f })}
        />

        {/* Hammasi / 1C da yo'q tab row — cloud parity with the "Всего /
            Не в 1С" tabs that sit between toolbar and entries. Clicking
            "1C da yo'q" flips the existing `onlyNotIn1C` filter; clicking
            "Hammasi" clears it. Hidden when the source doesn't expose a
            meaningful not-in-1C count (cheques/vedmosti). */}
        {(source === "document" || source === "bank_txn") && (
          <DocsScopeTabs
            total={totalForSource}
            in1CCount={in1CForSource}
            notIn1C={notIn1CForSource}
            value={in1c as "" | "yes" | "no"}
            onChange={(v) => {
              setIn1c(v);
              setPage(1);
            }}
            labelAll={t("modules.avtoprovodka.toolbar.tabs.all")}
            labelIn1C={t("modules.avtoprovodka.toolbar.tabs.in1C", { sys })}
            labelNotIn1C={t("modules.avtoprovodka.toolbar.tabs.notIn1C", { sys })}
          />
        )}

        {source === "bank_txn" && bankSync.data && !bankSync.data.never_synced && (
          <BankSyncLastLine ts={bankSync.data.last_synced_at} />
        )}

        <AvStatsRow
          source={source}
          docSource={docSource}
          sys={sys}
          total={totalForSource}
          notIn1C={notIn1CForSource}
          selectedCount={picked.size}
          onlyNotIn1C={onlyNotIn1C}
          onToggleNotIn1C={() => { setIn1c(onlyNotIn1C ? "" : "no"); setPage(1); }}
          onClearSelection={() => setPicked(new Map())}
          onBulkClassify={onBulkClassify}
          onBulkSend={onBulkSend}
          isBulkClassifying={bulkConfirm.isPending || bulkClassifyDocs.isPending}
          isBulkSending={bulkSend.isPending || bulkSendDocs.isPending}
          bulkProgress={bulkStatus.data}
        />

        <EntryTable
          items={items}
          isLoading={list.isLoading}
          isFetching={list.isFetching}
          sys={sys}
          selectedIds={new Set(picked.keys())}
          onTogglePick={togglePick}
          onTogglePickAll={togglePickAll}
          onOpenRow={(e) => {
            setDrawerMode("view");
            setDrawerEntry(e);
          }}
          onAction={(e, action) => {
            switch (action.kind) {
              case "open":
                setDrawerMode("view");
                setDrawerEntry(e);
                break;
              case "classify":
                // "AI klassifikatsiya" always re-runs the engine live, even on
                // an already-suggested row — the user asked to be able to
                // reopen it and re-classify.
                setClassifyLive(true);
                setClassifyEntry(e);
                break;
              case "send":
                // "1C ga yuborish" reviews the STORED suggestion (no re-run).
                setClassifyLive(false);
                setClassifyEntry(e);
                break;
              case "reject":
                setDrawerMode("reject");
                setDrawerEntry(e);
                break;
              case "delete":
                // Poc has no per-row delete; surface as reject for now.
                setDrawerMode("reject");
                setDrawerEntry(e);
                break;
            }
          }}
          page={list.data?.page ?? page}
          pages={list.data?.pages ?? 1}
          total={list.data?.total ?? 0}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          emptyText={
            list.isError
              ? "Yozuvlarni yuklab bo'lmadi"
              : "Tanlangan manbaga oid yozuvlar topilmadi"
          }
        />
      </main>

      {/* Driven by the run row, not by the mutation: the banner has to come back
          on its own after a page reload while the scan is still going. */}
      <Sync1CBanner
        open={(syncBannerOpen || !!scanStatus.data?.running) && !syncBannerDismissed}
        title={`${sys} bilan sinxronlanmoqda...`}
        onClose={() => {
          setSyncBannerOpen(false);
          setSyncBannerDismissed(true);
        }}
      />
      <MiningBanner
        open={miningBannerOpen}
        onClose={() => setMiningBannerOpen(false)}
        percent={miningPercent}
        meta={miningMeta}
      />

      <AvDetailDrawer
        entryId={drawerRow ? drawerRow.id : null}
        fallback={drawerRow ?? undefined}
        open={drawerRow != null}
        initialMode={drawerMode}
        sys={sys}
        onClose={() => setDrawerEntry(null)}
      />

      <ClassifyResultModal
        infobaseId={selectedBase}
        sys={sys}
        entry={classifyEntry}
        open={classifyEntry != null}
        companyId={companyId}
        live={classifyLive}
        onClose={() => setClassifyEntry(null)}
      />
    </div>
  );
}

/**
 * Top-of-list tab row — cloud parity with `aiba-av-doc-tabs`.
 *
 * Two segments: "Hammasi N" and "1C da yo'q N". Acts as a thin wrapper
 * over the existing `only_not_in_1c` filter so users get a familiar
 * tabbed entry point (cloud has the same wired to `state.unprocessedOnly`).
 * Counts come from `source-counts` so they stay in sync with the
 * sidebar even when filters scope the list.
 */
function DocsScopeTabs({
  total, in1CCount, notIn1C, value, onChange, labelAll, labelIn1C, labelNotIn1C,
}: {
  total: number;
  in1CCount: number;
  notIn1C: number;
  value: "" | "yes" | "no";
  onChange: (v: "" | "yes" | "no") => void;
  labelAll: string;
  labelIn1C: string;
  labelNotIn1C: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={labelAll + " / " + labelIn1C + " / " + labelNotIn1C}
      className="flex items-center gap-1 border-b border-border bg-muted/10 px-4"
    >
      <ScopeTab
        active={value === ""}
        label={labelAll}
        count={total}
        onClick={() => onChange("")}
      />
      <ScopeTab
        active={value === "yes"}
        label={labelIn1C}
        count={in1CCount}
        tone="ok"
        onClick={() => onChange("yes")}
      />
      <ScopeTab
        active={value === "no"}
        label={labelNotIn1C}
        count={notIn1C}
        tone="warning"
        onClick={() => onChange("no")}
      />
    </div>
  );
}

function ScopeTab({
  active, label, count, onClick, tone = "default",
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  tone?: "default" | "ok" | "warning";
}) {
  return (
    <Button
      variant="ghost"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "relative -mb-px h-auto gap-2 rounded-none border-b-2 px-3 py-2 text-sm font-normal transition-colors hover:bg-transparent",
        active
          ? tone === "warning"
            ? "border-warning text-foreground"
            : tone === "ok"
              ? "border-success text-foreground"
              : "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs tabular-nums",
          active
            ? tone === "warning"
              ? "bg-warning/15 text-foreground"
              : tone === "ok"
                ? "bg-success/15 text-foreground"
                : "bg-primary/15 text-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </Button>
  );
}

function BankSyncLastLine({ ts }: { ts: number | null }) {
  if (!ts) return null;
  const ageSec = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  let label = "";
  if (ageSec < 60) label = `${ageSec}s`;
  else if (ageSec < 3600) label = `${Math.floor(ageSec / 60)}m`;
  else if (ageSec < 86400) label = `${Math.floor(ageSec / 3600)}h`;
  else label = `${Math.floor(ageSec / 86400)}d`;
  return (
    <div className="border-b border-border bg-muted/20 px-4 py-1 text-[11px] text-muted-foreground">
      Oxirgi sinxron: {label} oldin
    </div>
  );
}
