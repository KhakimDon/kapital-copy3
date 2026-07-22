import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUrlNumber, useUrlState } from "@/shared/hooks/use-url-state";
import {
  ArrowLeft, ArrowRight, RefreshCcw, RefreshCw, ChevronDown, Search,
  ArrowDownLeft, ArrowUpRight, FileText,
} from "lucide-react";
import { useIjara, useIjaraContract, useIjaraGrid, useIjaraGridSync } from "./api";
import {
  IJARA_STATES, ijaraStateInfo,
  type IjaraGridRow, type IjaraStateCounts,
} from "./types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 25;

// NC-token state badge classes per cloud color intent (overrides types.ts off-palette).
//   gray=muted, green=success, orange=warning, red=error.
const STATE_BADGE_NC: Record<string, string> = {
  gray:   "bg-muted text-muted-foreground border-transparent",
  green:  "bg-success/15 text-success border-transparent",
  orange: "bg-warning/15 text-warning border-transparent",
  red:    "bg-destructive/15 text-destructive border-transparent",
};
// NC-token dot for the state-filter tabs, keyed by cloud color.
const STATE_DOT_NC: Record<string, string> = {
  gray: "bg-muted-foreground/40", green: "bg-success",
  orange: "bg-warning", red: "bg-destructive",
};

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------

export function SoliqIjaraPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sectionRaw, setSectionRaw] = useUrlState("tab", "incoming");
  const [stateRaw, setStateRaw] = useUrlState("status", "");
  const [page, setPage] = useUrlNumber("page", 1);
  const [companyNum, setCompanyNum] = useUrlNumber("company", 0);
  const section = sectionRaw as "incoming" | "outgoing";
  const state = stateRaw || undefined;
  const companyId = companyNum || null;
  const setCompanyId = (id: number) => setCompanyNum(id);
  const setState = (v: string | undefined) => setStateRaw(v ?? "");

  const grid = useIjaraGrid();
  const sync = useIjaraGridSync();

  // Auto-pick the first company with a subscription once the grid lands.
  useEffect(() => {
    if (companyId != null || !grid.data?.grid?.length) return;
    const withSub = grid.data.grid.find((c) => c.has_subscription);
    setCompanyId((withSub ?? grid.data.grid[0]).id);
  }, [grid.data, companyId]);

  const selected = grid.data?.grid.find((c) => c.id === companyId) ?? null;

  const { data, isLoading } = useIjara(
    { company_id: companyId ?? undefined, section, state, page, size: PAGE_SIZE },
    companyId != null,
  );

  // Tab counts come from the company's grid row (incoming/outgoing buckets).
  const counts: IjaraStateCounts = (selected
    ? selected[section]
    : data?.[section]) ?? { state_10: 0, state_15: 0, state_20: 0, state_50: 0 };
  const total = data?.count ?? 0;
  const allCount = counts.state_10 + counts.state_15 + counts.state_20 + counts.state_50;

  const switchSection = (s: "incoming" | "outgoing") => {
    setSectionRaw(s); setState(undefined); setPage(1);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold">{t("modules.soliq.ijara.title")}</h1>
            <p className="text-sm text-muted-foreground">{t("modules.soliq.ijara.subtitle")}</p>
          </div>
          <CompanyPicker grid={grid.data?.grid ?? []} loading={grid.isLoading}
                         selected={selected}
                         onSelect={(id) => { setCompanyId(id); setPage(1); setState(undefined); }} />
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={section} onValueChange={(v) => switchSection(v as "incoming" | "outgoing")}>
            <TabsList>
              <TabsTrigger value="incoming">{t("modules.soliq.ijara.incoming")}</TabsTrigger>
              <TabsTrigger value="outgoing">{t("modules.soliq.ijara.outgoing")}</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button variant="outline" size="sm" onClick={() => grid.refetch()}
                  disabled={grid.isFetching}>
            <RefreshCcw className={`size-4 mr-2 ${grid.isFetching ? "animate-spin" : ""}`} />
            {t("modules.soliq.actions.refresh")}
          </Button>
          <Button variant="default" size="sm"
                  onClick={() => {
                    sync.mutate(undefined, {
                      onSuccess: () => setTimeout(() => grid.refetch(), 3000),
                    });
                  }}
                  disabled={sync.isPending}>
            <RefreshCw className={`size-4 mr-2 ${sync.isPending ? "animate-spin" : ""}`} />
            {t("modules.soliq.actions.sync")}
          </Button>
        </div>
      </div>

      {/* State filter tabs with counts */}
      <div className="flex items-center gap-1 flex-wrap">
        <StateTab label={t("modules.soliq.ijara.all")} active={!state} count={allCount}
                  onClick={() => { setState(undefined); setPage(1); }} />
        {IJARA_STATES.map((s) => (
          <StateTab key={s.value}
                    label={s.label}
                    dot={STATE_DOT_NC[s.color]}
                    active={state === s.value}
                    count={counts[`state_${s.value}` as keyof IjaraStateCounts]}
                    onClick={() => { setState(s.value); setPage(1); }} />
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {!companyId ? (
            <p className="text-center text-muted-foreground py-12">
              {grid.isLoading ? t("modules.soliq.common.loading") : t("modules.soliq.common.pickCompany")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="[&_th]:text-xs [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground [&_th]:font-medium hover:bg-transparent">
                  <TableHead>{t("modules.soliq.ijara.colContract")}</TableHead>
                  <TableHead>{t("modules.soliq.ijara.colState")}</TableHead>
                  <TableHead>{t("modules.soliq.ijara.colCounterparty")}</TableHead>
                  <TableHead>{t("modules.soliq.ijara.colAddress")}</TableHead>
                  <TableHead className="text-right">{t("modules.soliq.paymentsTab.colAmount")}</TableHead>
                  <TableHead>{t("modules.soliq.ijara.colPeriod")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                      <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                      <TableCell>
                        <div className="space-y-1.5"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-2.5 w-24" /></div>
                      </TableCell>
                      <TableCell><Skeleton className="h-3.5 w-48" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                    </TableRow>
                  ))
                ) : (data?.items.length ?? 0) === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6} className="py-16">
                      <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                        <div className="size-14 rounded-full bg-muted grid place-items-center">
                          <FileText className="size-7 text-muted-foreground" />
                        </div>
                        <div className="text-sm font-medium text-foreground">{t("modules.soliq.ijara.empty")}</div>
                        {state && (
                          <Button variant="outline" size="sm" onClick={() => { setState(undefined); setPage(1); }}>
                            {t("modules.soliq.ijara.all")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.items.map((c, i) => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/60 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                              onClick={() => navigate(`/soliq/ijara/${c.id}`)}>
                      <TableCell className="tabular-nums text-xs">#{c.contract_no ?? "—"}</TableCell>
                      <TableCell><IjaraStateBadge state={c.state} /></TableCell>
                      <TableCell>
                        {c.counterparty ? (
                          <div className="min-w-0">
                            <div className="truncate max-w-[220px]">{c.counterparty}</div>
                            {c.counterparty_tin &&
                              <div className="text-xs text-muted-foreground tabular-nums">{c.counterparty_tin}</div>}
                          </div>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <span className="truncate block text-sm" title={c.estate_address}>
                          {c.estate_address || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        <Money value={c.amount} currency={c.currency} />
                      </TableCell>
                      <TableCell><Period start={c.start_date} end={c.end_date} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {total > PAGE_SIZE && (
        <div className="flex items-center gap-2 justify-end text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage(page - 1)}>{t("modules.soliq.pagination.prev")}</Button>
          <span className="text-muted-foreground">
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} / {total}
          </span>
          <Button variant="outline" size="sm" disabled={page * PAGE_SIZE >= total}
                  onClick={() => setPage(page + 1)}>{t("modules.soliq.pagination.next")}</Button>
        </div>
      )}
    </div>
  );
}

function StateTab({ label, count, active, dot, onClick }: {
  label: string; count: number; active: boolean; dot?: string; onClick: () => void;
}) {
  return (
    <Button variant={active ? "default" : "outline"} size="sm" onClick={onClick}>
      {dot && <span className={`mr-2 size-2 rounded-full ${dot}`} />}
      {label}
      <span className={`ml-2 rounded-full px-1.5 text-xs ${
        active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"}`}>
        {count}
      </span>
    </Button>
  );
}

// ---- Company picker (driven by the ijara-grid) -----------------------------

function CompanyPicker({ grid, loading, selected, onSelect }: {
  grid: IjaraGridRow[];
  loading: boolean;
  selected: IjaraGridRow | null;
  onSelect: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return grid;
    return grid.filter((c) =>
      (c.name ?? "").toLowerCase().includes(s) || (c.inn ?? "").includes(s));
  }, [grid, q]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 max-w-[280px]">
          <span className="truncate">
            {loading ? t("modules.soliq.common.loading") : selected?.name ?? t("modules.soliq.common.pickCompany")}
          </span>
          {selected?.inn && <span className="text-xs text-muted-foreground tabular-nums">{selected.inn}</span>}
          <ChevronDown className="size-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <div className="p-2 border-b flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                 placeholder={t("modules.soliq.common.searchPlaceholder")}
                 className="flex-1 h-auto border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0 focus-visible:ring-offset-0" />
        </div>
        <div className="max-h-72 overflow-y-auto py-1">
          {filtered.map((c) => {
            const cnt = c.incoming.state_10 + c.incoming.state_15 + c.incoming.state_20 + c.incoming.state_50 +
                        c.outgoing.state_10 + c.outgoing.state_15 + c.outgoing.state_20 + c.outgoing.state_50;
            return (
              <Button key={c.id} type="button" variant="ghost"
                      onClick={() => { onSelect(c.id); setOpen(false); }}
                      className={`w-full h-auto rounded-none px-3 py-2 flex items-center justify-between gap-2 font-normal hover:bg-secondary/60
                        ${selected?.id === c.id ? "bg-secondary" : ""}`}>
                <div className="min-w-0">
                  <div className="truncate text-sm text-left">{c.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground tabular-nums text-left">{c.inn ?? ""}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!c.has_subscription &&
                    <span className="text-[10px] text-muted-foreground">{t("modules.soliq.ijara.notConnected")}</span>}
                  {cnt > 0 && <span className="rounded-full bg-muted px-1.5 text-xs">{cnt}</span>}
                </div>
              </Button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t("modules.soliq.common.notFound")}</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Contract detail page (with on-page state + direction filters)
// ---------------------------------------------------------------------------

export function SoliqIjaraContractDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useIjaraContract(id ?? null);
  const [showRaw, setShowRaw] = useState(false);

  const dir = data?.my_rent_type === 1 ? "out" : data?.my_rent_type === 2 ? "in" : null;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/soliq/ijara"><ArrowLeft className="size-4 mr-1" /> {t("modules.soliq.ijara.title")}</Link>
      </Button>
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <CardTitle className="flex items-center gap-2">
              <Reveal loading={isLoading} skeleton={<Skeleton className="h-6 w-64" />}>
                <span className="flex items-center gap-2">
                  {t("modules.soliq.ijara.contractNum", { num: data?.contract_no ?? id })}
                  {data && <IjaraStateBadge state={data.state} />}
                </span>
              </Reveal>
            </CardTitle>
            {dir && (
              <span className={`inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs ${
                dir === "in" ? "text-success" : "text-info"}`}>
                {dir === "in"
                  ? <><ArrowDownLeft className="size-3.5" /> {t("modules.soliq.ijara.rentedIn")}</>
                  : <><ArrowUpRight className="size-3.5" /> {t("modules.soliq.ijara.rentedOut")}</>}
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3 text-sm animate-in fade-in-0 duration-300">
          <Row k={t("modules.soliq.ijara.colCounterparty")} v={data?.counterparty} />
          <Row k={t("modules.soliq.profileTab.stir")} v={data?.counterparty_tin} />
          <Row k={t("modules.soliq.ijara.colAddress")} v={data?.estate_address} />
          <Row k={t("modules.soliq.paymentsTab.colAmount")} v={data?.amount != null
            ? `${Number(data.amount).toLocaleString("ru-RU")} ${data.currency ?? ""}` : undefined} />
          <Row k={t("modules.soliq.ijara.startDate")} v={fmtDate(data?.start_date)} />
          <Row k={t("modules.soliq.ijara.endDate")} v={fmtDate(data?.end_date)} />
          <Row k={t("modules.soliq.ijara.createdSource")} v={fmtDateTime(data?.source_created_at)} />
          <Row k={t("modules.soliq.ijara.syncedAt")} v={fmtDateTime(data?.synced_at)} />
        </CardContent>
      </Card>

      {/* Raw-data panel */}
      {data?.raw && (
        <Card>
          <CardHeader className="cursor-pointer" onClick={() => setShowRaw((v) => !v)}>
            <CardTitle className="text-sm flex items-center gap-2">
              <ChevronDown className={`size-4 transition-transform ${showRaw ? "" : "-rotate-90"}`} />
              {t("modules.soliq.ijara.rawData")}
            </CardTitle>
          </CardHeader>
          {showRaw && (
            <CardContent>
              <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto max-h-[400px]">
                {JSON.stringify(data.raw, null, 2)}
              </pre>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}

// ---- shared bits -----------------------------------------------------------

function IjaraStateBadge({ state }: { state?: string | number | null }) {
  const info = ijaraStateInfo(state);
  if (!info) return <span className="text-muted-foreground">{state ?? "—"}</span>;
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${
      STATE_BADGE_NC[info.color] ?? "bg-muted text-muted-foreground border-transparent"}`}>
      {info.label}
    </span>
  );
}

function Period({ start, end }: { start?: string; end?: string }) {
  if (!start && !end) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs whitespace-nowrap">
      {fmtDate(start)}
      <ArrowRight className="size-3 text-muted-foreground" />
      {fmtDate(end)}
    </span>
  );
}

function Money({ value, currency }: { value?: number; currency?: string }) {
  if (value == null || Number(value) === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <>
      {Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 0 })}
      {currency && <span className="ml-1 text-xs text-muted-foreground">{currency}</span>}
    </>
  );
}

function Row({ k, v }: { k: string; v?: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{k}</span>
      <span className="font-medium">{v ?? "—"}</span>
    </div>
  );
}

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : s;
}
function fmtDateTime(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return fmtDate(s);
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
