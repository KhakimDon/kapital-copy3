/**
 * KeysPage — root view at /keys.
 *
 * Mirrors cloud-os/apps/aiba_keys companies.php + js/companies.js: a single
 * list of all companies with their key count + status. Row click opens the
 * per-company DetailPage at /keys/companies/{id} (cloud company-detail.php).
 *
 * If the user already picked a company elsewhere (sidebar selector → useCompany.current),
 * we auto-redirect to that company's detail page so the experience stays consistent
 * with the rest of the app's "current company is sticky" behaviour.
 *
 * The previous per-company keys view that used to live here has moved to
 * company-page.tsx as the "Kalitlar" tab of the DetailPage.
 */
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, Search, Building2, RefreshCw, Plus, UserPlus, ShieldCheck } from "lucide-react";
import { useUrlSearch } from "@/shared/hooks/use-url-state";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import { useCompany } from "@/shared/store/company";
import { useMe } from "@/shared/api/me";
import { useKeyCompanies, type KeyCompany } from "./api";

// ── helpers (mirror cloud js/companies.js) ──────────────────────────────────

const AVATAR_COLORS = [
  "#2563eb", "#7c3aed", "#db2777", "#ea580c",
  "#16a34a", "#0891b2", "#4f46e5", "#059669",
  "#d97706", "#9333ea", "#e11d48", "#0d9488",
];

function avatarColor(name?: string | null) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) {
    hash = (name || "").charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function avatarInitial(name?: string | null) {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

export function KeysPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const current = useCompany((s) => s.current);
  const setCurrent = useCompany((s) => s.setCurrent);
  const [qInput, q, setQInput] = useUrlSearch("q");
  const [params] = useSearchParams();

  const { data: me } = useMe();
  const { data: companies, isLoading, isError, refetch, isFetching } = useKeyCompanies();

  // Auto-route to the current company's detail page so the per-company view
  // is reachable without a second click when the sidebar selector is set.
  //   ?company=X  → explicit, always redirect
  //   store.current set → redirect unless ?list=1 (user clicked back from detail)
  const explicitId = params.get("company");
  const wantList = params.get("list") === "1";
  useEffect(() => {
    if (explicitId) {
      navigate(`/keys/companies/${explicitId}`, { replace: true });
      return;
    }
    if (!wantList && current?.id != null) {
      navigate(`/keys/companies/${current.id}`, { replace: true });
    }
  }, [explicitId, wantList, current?.id, navigate]);

  const filtered = useMemo(() => {
    const rows: KeyCompany[] = companies ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((c) =>
      [c.name, c.inn, c.director_name, c.legal_form]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(term)),
    );
  }, [companies, q]);

  const counts = useMemo(() => {
    const list = companies ?? [];
    let keys = 0;
    let active = 0;
    let inactive = 0;
    for (const c of list) {
      keys += c.keys_count || 0;
      if (c.is_active) active++;
      else inactive++;
    }
    return { total: list.length, keys, active, inactive };
  }, [companies]);

  return (
    <div className="space-y-4">
      {/* Header (mirrors cloud .aiba-page-header) */}
      <div className="flex items-end justify-between gap-3 flex-wrap border-b border-border">
        <div className="pb-2">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <KeyRound className="size-6 text-primary" /> {t("modules.keys.title")}
          </h1>
          <p className="text-sm text-muted-foreground">{t("modules.keys.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2 pb-2">
          <div className="relative">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder={t("modules.keys.companySearchPlaceholder")}
              className="pl-8 w-64"
            />
          </div>
          <Button
            variant="outline" size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title={t("modules.keys.actions.refresh")}
          >
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          {me?.is_admin && (
            <>
              <Button size="sm" variant="secondary" onClick={() => navigate("/keys/admin")}>
                <ShieldCheck className="size-4 mr-1" />
                {t("modules.keys.admin.title")}
              </Button>
              <Button size="sm" onClick={() => navigate("/keys/admin/companies/new")}>
                <Plus className="size-4 mr-1" />
                {t("modules.keys.admin.addCompany")}
              </Button>
              <Button size="sm" variant="outline" onClick={() => navigate("/keys/admin/users/new")}>
                <UserPlus className="size-4 mr-1" />
                {t("modules.keys.admin.addUser")}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stat chips (cloud .aiba-stats: total / keys / active / inactive) */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="gap-1.5 px-2.5 py-1 text-xs">
          <Building2 className="size-3.5" />
          {t("modules.keys.stats.companies")}: <strong>{counts.total}</strong>
        </Badge>
        <Badge variant="info" className="gap-1.5 px-2.5 py-1 text-xs">
          <KeyRound className="size-3.5" />
          {t("modules.keys.stats.keys")}: {counts.keys}
        </Badge>
        <Badge variant="success" className="gap-1.5 px-2.5 py-1 text-xs">
          {t("modules.keys.stats.active")}: {counts.active}
        </Badge>
        <Badge variant="danger" className="gap-1.5 px-2.5 py-1 text-xs">
          {t("modules.keys.stats.inactive")}: {counts.inactive}
        </Badge>
      </div>

      {/* Table — cloud column order: Kompaniya / INN / Kalitlar / Holat / Sana */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("modules.keys.columns.company")}</TableHead>
              <TableHead>{t("modules.keys.columns.inn")}</TableHead>
              <TableHead className="text-center">{t("modules.keys.columns.keys")}</TableHead>
              <TableHead className="text-center">{t("modules.keys.columns.status")}</TableHead>
              <TableHead>{t("modules.keys.columns.created")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Skeleton className="size-9 rounded-md shrink-0" />
                      <div className="space-y-1.5"><Skeleton className="h-3.5 w-40" /><Skeleton className="h-2.5 w-24" /></div>
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell className="text-center"><Skeleton className="h-5 w-12 rounded-full mx-auto" /></TableCell>
                  <TableCell className="text-center"><Skeleton className="h-5 w-16 rounded-full mx-auto" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                </TableRow>
              ))}

            {!isLoading && isError && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Building2 className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.keys.loadCompaniesError")}</div>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && !isError && filtered.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Building2 className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {companies && companies.length > 0
                        ? t("modules.keys.noCompaniesFilter")
                        : t("modules.keys.noCompanies")}
                    </div>
                    {q.trim() && (
                      <Button variant="outline" size="sm" onClick={() => setQInput("")}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading &&
              !isError &&
              filtered.map((c, i) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  onClick={() => {
                    setCurrent({
                      id: c.id,
                      name: c.name || "",
                      inn: c.inn || undefined,
                    });
                    navigate(`/keys/companies/${c.id}`);
                  }}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div
                        className="size-9 rounded-md grid place-items-center text-white text-xs font-bold shrink-0 uppercase"
                        style={{ background: avatarColor(c.name) }}
                      >
                        {avatarInitial(c.name)}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium leading-tight truncate">
                          {c.name || "—"}
                        </div>
                        {(c.legal_form || c.director_name) && (
                          <div className="text-xs text-muted-foreground truncate">
                            {[c.legal_form, c.director_name].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {c.inn || "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={c.keys_count > 0 ? "success" : "muted"}
                      className="gap-1 px-2 py-0.5"
                    >
                      <KeyRound className="size-3" />
                      {c.keys_count ?? 0}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant={c.is_active ? "success" : "danger"}>
                      {c.is_active ? t("modules.keys.activeFlag.active") : t("modules.keys.activeFlag.inactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {fmtDate(c.created_at)}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
