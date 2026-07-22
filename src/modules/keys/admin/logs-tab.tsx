/**
 * LogsTab — KM unified activity/audit log (ActivityLog).
 *
 * Read-only viewer over /api/v2/keys/admin/logs (proxies KM /api/activity-logs/).
 * Filters: service · action · resource_type · username · time window, plus
 * client-side text search and server-side pagination.
 */
import { useTranslation } from "react-i18next";
import { RefreshCw, Search, ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { useUrlNumber, useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";

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

import { useActivityLogs, type ActivityLog } from "../api";

const SERVICES = ["nextcloud", "telegram", "chat2", "eskey"];
const ACTIONS = ["view", "create", "update", "delete", "sync", "login", "logout", "export"];
const DAYS = [7, 30, 90, 365, 3650];

function fmtTs(s: string) {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

const ACTION_VARIANT: Record<string, "success" | "danger" | "info" | "warning" | "muted"> = {
  create: "success", update: "info", delete: "danger",
  login: "success", logout: "muted", sync: "warning", export: "info", view: "muted",
};

// "all" is the Select's sentinel for "no filter" (Radix can't use an empty value).
const ALL = "all";

export function LogsTab() {
  const { t } = useTranslation();
  // Namespaced (l*) because this tab shares its URL with the km-admin `tab` selector.
  const [service, setService] = useUrlState("lservice", ALL);
  const [action, setAction] = useUrlState("laction", ALL);
  const [days, setDays] = useUrlNumber("ldays", 30);
  const [page, setPage] = useUrlNumber("lpage", 1);
  const [qInput, q, setQInput] = useUrlSearch("lq");
  const pageSize = 50;

  const filter = {
    days, page, page_size: pageSize,
    ...(service !== ALL ? { service } : {}),
    ...(action !== ALL ? { action } : {}),
  };
  const { data, isLoading, isFetching, refetch } = useActivityLogs(filter);

  const logs: ActivityLog[] = data?.logs ?? [];
  const term = q.trim().toLowerCase();
  const rows = term
    ? logs.filter((l) =>
        [l.username, l.description, l.resource_type, l.resource_id, l.ip_address]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(term)),
      )
    : logs;

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const resetPage = () => setPage(1);

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={t("modules.keys.logs.search")}
            className="pl-8 w-56"
          />
        </div>

        <Select value={service} onValueChange={(v) => { setService(v); resetPage(); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("modules.keys.logs.service")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("modules.keys.logs.allServices")}</SelectItem>
            {SERVICES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={action} onValueChange={(v) => { setAction(v); resetPage(); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t("modules.keys.logs.action")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("modules.keys.logs.allActions")}</SelectItem>
            {ACTIONS.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={String(days)} onValueChange={(v) => { setDays(Number(v)); resetPage(); }}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {DAYS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {d >= 3650 ? t("modules.keys.logs.allTime") : t("modules.keys.logs.lastDays", { count: d })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>

        <span className="ml-auto text-xs text-muted-foreground">
          {t("modules.keys.logs.total", { count: total })}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">{t("modules.keys.logs.time")}</TableHead>
              <TableHead>{t("modules.keys.logs.user")}</TableHead>
              <TableHead>{t("modules.keys.logs.service")}</TableHead>
              <TableHead>{t("modules.keys.logs.action")}</TableHead>
              <TableHead>{t("modules.keys.logs.resource")}</TableHead>
              <TableHead>{t("modules.keys.logs.description")}</TableHead>
              <TableHead className="w-32">{t("modules.keys.logs.ip")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                </TableRow>
              ))}

            {!isLoading && rows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <ScrollText className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.keys.logs.empty")}</div>
                    {(q.trim() || service !== ALL || action !== ALL) && (
                      <Button variant="outline" size="sm" onClick={() => { setQInput(""); setService(ALL); setAction(ALL); resetPage(); }}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && rows.map((l, i) => (
              <TableRow
                key={l.id}
                className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
              >
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtTs(l.timestamp)}</TableCell>
                <TableCell className="font-medium">{l.username || "—"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-normal">{l.service_display || l.service}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={ACTION_VARIANT[l.action] ?? "muted"}>{l.action_display || l.action}</Badge>
                </TableCell>
                <TableCell className="text-xs">
                  {l.resource_type
                    ? <span className="text-muted-foreground">{l.resource_type}{l.resource_id ? ` #${l.resource_id}` : ""}</span>
                    : "—"}
                </TableCell>
                <TableCell className="max-w-xs truncate" title={l.description}>{l.description || "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{l.ip_address || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs text-muted-foreground">
          {t("modules.keys.logs.page", { page, total: totalPages })}
        </span>
        <Button
          variant="outline" size="sm"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1 || isFetching}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline" size="sm"
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages || isFetching}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
