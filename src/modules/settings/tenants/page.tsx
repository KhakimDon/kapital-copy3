/**
 * TenantsPage — superadmin list of all tenants.
 *
 * Route: /settings/tenants
 * Search (slug/name) + status filter live in the URL. Row click → detail,
 * "+ Tenant" → /new. Loading skeleton rows; ErrorState on failed fetch;
 * empty state when nothing matches.
 */
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Building2, Plus, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ErrorState } from "@/components/ui/reveal";

import { useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";
import { useTenants } from "./api";

function fmtDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "—"
    : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_VARIANT: Record<string, "success" | "danger" | "muted"> = {
  active: "success",
  suspended: "danger",
  archived: "muted",
};

export function TenantsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [qInput, q, setQInput] = useUrlSearch("q");
  const [status, setStatus] = useUrlState("status", "all");

  // "archived" is a server-side view (hidden from the main list); active/suspended
  // are filtered client-side over the non-archived set.
  const archivedView = status === "archived";
  const { data, isLoading, isError, isFetching, refetch } = useTenants({
    q: q || undefined,
    archived: archivedView || undefined,
  });

  const rows = (data?.items ?? []).filter((r) =>
    status === "all" || archivedView ? true : r.status === status,
  );

  return (
    <div className="space-y-4 animate-in fade-in-0 duration-300">
      <div className="flex items-center gap-3 border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <Building2 className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold">
              {t("modules.settings.tenants.title", { defaultValue: "Tenantlar" })}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t("modules.settings.tenants.subtitle", { defaultValue: "Barcha tenantlarni boshqarish" })}
            </p>
          </div>
        </div>
        <div className="ml-auto">
          <Button size="sm" onClick={() => navigate("/settings/tenants/new")}>
            <Plus className="size-4 mr-1" />
            {t("modules.settings.tenants.add", { defaultValue: "Tenant" })}
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder={t("modules.settings.tenants.searchPlaceholder", { defaultValue: "Slug yoki nom..." })}
          className="w-64"
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("modules.settings.tenants.statusAll", { defaultValue: "Barcha statuslar" })}</SelectItem>
            <SelectItem value="active">{t("modules.settings.tenants.statusActive", { defaultValue: "Faol" })}</SelectItem>
            <SelectItem value="suspended">{t("modules.settings.tenants.statusSuspended", { defaultValue: "To'xtatilgan" })}</SelectItem>
            <SelectItem value="archived">{t("modules.settings.tenants.statusArchived", { defaultValue: "Arxiv" })}</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>
        {data != null && (
          <span className="text-xs text-muted-foreground">
            {t("modules.settings.tenants.count", { defaultValue: "{{count}} ta", count: rows.length })}
          </span>
        )}
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("modules.settings.tenants.cols.name", { defaultValue: "Nom" })}</TableHead>
                <TableHead>{t("modules.settings.tenants.cols.placement", { defaultValue: "Joylashuv" })}</TableHead>
                <TableHead className="text-center">{t("modules.settings.tenants.cols.limits", { defaultValue: "Limitlar" })}</TableHead>
                <TableHead>{t("modules.settings.tenants.cols.expiry", { defaultValue: "Amal qiladi" })}</TableHead>
                <TableHead className="text-center">{t("modules.settings.tenants.cols.status", { defaultValue: "Status" })}</TableHead>
                <TableHead>{t("modules.settings.tenants.cols.created", { defaultValue: "Yaratilgan" })}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <SkeletonRows />}
              {!isLoading && rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={6} className="py-16">
                    <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                      <div className="size-14 rounded-full bg-muted grid place-items-center">
                        <Building2 className="size-7 text-muted-foreground" />
                      </div>
                      <div className="text-sm font-medium text-foreground">
                        {t("modules.settings.tenants.empty", { defaultValue: "Tenant topilmadi" })}
                      </div>
                      {(q || status !== "all") && (
                        <Button variant="outline" size="sm" onClick={() => { setQInput(""); setStatus("all"); }}>
                          {t("common.clear", { defaultValue: "Tozalash" })}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && rows.map((tn, i) => (
                <TableRow
                  key={tn.id}
                  className="cursor-pointer animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  onClick={() => navigate(`/settings/tenants/${tn.id}`)}
                >
                  <TableCell className="font-medium">
                    {tn.name || "—"}
                    <span className="block text-xs text-muted-foreground font-mono">{tn.slug}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={tn.placement === "dedicated" ? "info" : "muted"}>
                      {t(`modules.settings.tenants.placement.${tn.placement}`, {
                        defaultValue: tn.placement === "dedicated" ? "Alohida" : "Umumiy",
                      })}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm text-muted-foreground">
                    {tn.max_companies} / {tn.max_keys}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(tn.expiry_at)}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={STATUS_VARIANT[tn.status] ?? "muted"}>
                      {t(`modules.settings.tenants.status.${tn.status}`, { defaultValue: tn.status })}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{fmtDate(tn.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function SkeletonRows() {
  const widths = ["w-40", "w-20", "w-16", "w-24", "w-16", "w-24"];
  const aligns: (string | undefined)[] = [undefined, undefined, "center", undefined, "center", undefined];
  return (
    <>
      {Array.from({ length: 6 }).map((_, i) => (
        <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
          {widths.map((w, j) => {
            const a = aligns[j];
            return (
              <TableCell key={j} className={a === "center" ? "text-center" : undefined}>
                <Skeleton className={`h-4 ${w} ${a === "center" ? "mx-auto" : ""}`} />
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}
