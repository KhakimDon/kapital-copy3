import { useMemo } from "react";
import { useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Search, RefreshCw, KeyRound, Plus, Building2 } from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { useMe } from "@/shared/api/me";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useCompaniesList, useCompaniesEnrich } from "./api";
import type { CompanyRow, EnrichRow } from "./types";

const fmtMoney = (v?: number | null) =>
  v == null ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
const fmtDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");
const initials = (name?: string | null) =>
  (name || "—").replace(/["«»'`]/g, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "—";

function ratingVariant(e?: EnrichRow): "success" | "warning" | "danger" | "muted" {
  if (!e || e.rating_points == null) return "muted";
  if (e.rating_points >= 60) return "success";
  if (e.rating_points >= 40) return "warning";
  return "danger";
}

type Filter = "all" | "active" | "has-debt" | "no-debt";

export function CompaniesPage() {
  const { t } = useTranslation();
  const TABS: { k: Filter; label: string }[] = [
    { k: "all", label: t("modules.companies.tabs.all") },
    { k: "active", label: t("modules.companies.tabs.active") },
    { k: "has-debt", label: t("modules.companies.tabs.hasDebt") },
    { k: "no-debt", label: t("modules.companies.tabs.noDebt") },
  ];
  const current = useCompany((s) => s.current);
  const setCurrent = useCompany((s) => s.setCurrent);
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { data, isLoading, refetch, isFetching } = useCompaniesList();
  const items = useMemo(() => data?.items ?? [], [data]);
  const inns = useMemo(() => items.map((c) => c.inn).filter(Boolean) as string[], [items]);
  const { data: enrich } = useCompaniesEnrich(inns);
  // Navigational / query state lives in the URL (deep-link + Back/Forward).
  const [searchInput, search, setSearch] = useUrlSearch("q");
  const [filterRaw, setFilter] = useUrlState("filter", "all");
  const filter = filterRaw as Filter;

  const enrichOf = (c: CompanyRow): EnrichRow | undefined => (c.inn ? enrich?.[c.inn] : undefined);
  const debtOf = (c: CompanyRow): number | null => {
    const d = enrichOf(c)?.debt; return d == null ? null : Number(d);
  };

  const counts = useMemo(() => {
    const r = { all: items.length, active: 0, "has-debt": 0, "no-debt": 0 };
    for (const c of items) {
      if (c.is_active) r.active++;
      const d = c.inn ? enrich?.[c.inn]?.debt : null;
      if (d != null) { Number(d) > 0 ? r["has-debt"]++ : r["no-debt"]++; }
    }
    return r;
  }, [items, enrich]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((c) => {
      if (q && !((c.name || "").toLowerCase().includes(q) || (c.inn || "").includes(q))) return false;
      if (filter === "active" && !c.is_active) return false;
      const d = c.inn ? enrich?.[c.inn]?.debt : null;
      if (filter === "has-debt" && !(d != null && Number(d) > 0)) return false;
      if (filter === "no-debt" && !(d != null && Number(d) === 0)) return false;
      return true;
    });
  }, [items, search, filter, enrich]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            {t("modules.companies.title")} <span className="text-base font-normal text-muted-foreground">({data?.count ?? 0})</span>
          </h1>
          <p className="text-sm text-muted-foreground">{t("modules.companies.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={searchInput} onChange={(e) => setSearch(e.target.value)} placeholder={t("modules.companies.placeholders.search")} className="pl-8 w-64" />
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} title={t("modules.companies.actions.refresh")}>
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          {me?.is_admin && (
            <Button size="sm" onClick={() => navigate("/keys/admin/companies/new")}>
              <Plus className="size-4 mr-1" />
              {t("modules.keys.admin.addCompany")}
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-border flex-wrap">
        {TABS.map((t) => {
          const active = filter === t.k;
          const countCls =
            t.k === "has-debt" ? (active ? "bg-destructive text-white" : "bg-destructive/15 text-destructive")
            : t.k === "no-debt" ? (active ? "bg-success text-white" : "bg-success/15 text-success")
            : active ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground";
          return (
            <Button key={t.k} variant="ghost" size="sm" onClick={() => setFilter(t.k)}
              className={`h-auto gap-2 rounded-none px-4 py-2.5 border-b-2 -mb-px hover:bg-transparent ${active ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
              {t.label}
              <span className={`inline-flex items-center justify-center min-w-[21px] h-[18px] px-1.5 rounded-full text-[10px] font-bold ${countCls}`}>{counts[t.k]}</span>
            </Button>
          );
        })}
      </div>

      {/* Header stays mounted; only the body transitions between loading → data → empty. */}
      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="hover:bg-transparent">
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">{t("modules.companies.columns.company")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">INN</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">{t("modules.companies.columns.rating")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold text-right">{t("modules.companies.columns.debt")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">{t("modules.companies.columns.status")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold text-right">{t("modules.companies.columns.keys")}</TableHead>
            <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-bold">{t("modules.companies.columns.created")}</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              // Table-shaped skeleton (mirrors the columns) so the swap to real
              // data is seamless — gentle pulse + fade-in.
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Skeleton className="size-9 rounded-md shrink-0" />
                      <div className="space-y-1.5"><Skeleton className="h-3.5 w-32" /><Skeleton className="h-2.5 w-16" /></div>
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-16 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-6 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Building2 className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.companies.empty.list")}</div>
                    {search.trim() && (
                      <Button variant="outline" size="sm" onClick={() => setSearch("")}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c, i) => {
                const en = enrichOf(c); const d = debtOf(c); const isCur = current?.id === c.id;
                return (
                  <TableRow
                    key={c.id}
                    className={`cursor-pointer transition-colors animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300 ${isCur ? "bg-primary/5" : ""}`}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    onClick={() => {
                      setCurrent({ id: c.id, name: c.name || "", inn: c.inn || undefined, chat2_company_id: c.chat2_company_id || undefined });
                      navigate(`/companies/${c.id}`);
                    }}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <span className="size-9 rounded-md bg-primary/10 text-primary grid place-items-center text-xs font-bold shrink-0 uppercase">{initials(c.name)}</span>
                        <div>
                          <div className="font-medium leading-tight">{c.name || "—"}
                            {isCur && <Badge variant="info" className="ml-2 text-[10px]">{t("modules.companies.badges.current")}</Badge>}</div>
                          {c.legal_form && <div className="text-xs text-muted-foreground">{c.legal_form}</div>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.inn || "—"}</TableCell>
                    <TableCell>
                      {en?.rating
                        ? <Badge variant={ratingVariant(en)}>{en.rating}{en.rating_points != null ? ` · ${en.rating_points}` : ""}</Badge>
                        : <span className="text-muted-foreground">{enrich ? "—" : "…"}</span>}
                    </TableCell>
                    <TableCell className={`text-right font-mono tabular-nums ${d && d > 0 ? "text-destructive font-semibold" : ""}`}>
                      {d == null ? (enrich ? "—" : "…") : fmtMoney(d)}
                    </TableCell>
                    <TableCell><Badge variant={c.is_active ? "success" : "muted"}>{c.is_active ? t("modules.companies.status.active") : t("modules.companies.status.inactive")}</Badge></TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex items-center gap-1 text-muted-foreground"><KeyRound className="size-3.5" />{c.keys_count ?? 0}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmtDate(c.created_at)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
