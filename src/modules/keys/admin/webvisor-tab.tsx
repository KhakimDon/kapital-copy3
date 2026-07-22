/**
 * WebvisorTab — recorded browser sessions + rrweb replay.
 *
 * Lists sessions from /api/v2/keys/admin/webvisor; clicking ▶ opens a dialog
 * that fetches the session's rrweb events and replays them with rrweb-player
 * (dynamically imported so the heavy player only loads on demand).
 *
 * NOTE: needs a KM with the /api/admin/webvisor/* surface deployed. On a KM
 * that predates it the list degrades to empty (backend swallows the 404).
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshCw, Search, Play, MonitorPlay, Monitor, Smartphone, Clock,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

import { useWebvisorSessions, useWebvisorEvents, type WebvisorSession } from "../api";

const DAYS = [7, 30, 90, 365, 3650];

function fmtTs(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ru-RU", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function fmtDuration(sec: number | null) {
  if (sec == null) return "—";
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${r}s`;
}

// ── rrweb replay (events loaded + player mounted on demand) ──────────────────

function WebvisorPlayer({ session, onClose }: { session: WebvisorSession; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useWebvisorEvents(session.id);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const events = data?.events as unknown[] | undefined;

  useEffect(() => {
    if (!events || events.length < 2 || !hostRef.current) return;
    let cancelled = false;
    let player: { pause?: () => void } | undefined;
    (async () => {
      try {
        const [rrwebMod] = await Promise.all([
          import("rrweb-player"),
          import("rrweb-player/dist/style.css"),
        ]);
        // Decouple from rrweb's strict eventWithTime[] — events come from the
        // API as opaque JSON; the player validates them at runtime.
        const RRWebPlayer = rrwebMod.default as unknown as new (o: {
          target: HTMLElement;
          props: { events: unknown[]; width?: number; height?: number; autoPlay?: boolean; showController?: boolean };
        }) => { pause?: () => void };
        if (cancelled || !hostRef.current) return;
        hostRef.current.innerHTML = "";
        player = new RRWebPlayer({
          target: hostRef.current,
          props: { events, width: 880, height: 460, autoPlay: false, showController: true },
        });
      } catch (e) {
        setPlayerError(String((e as Error)?.message || e));
      }
    })();
    return () => {
      cancelled = true;
      try { player?.pause?.(); } catch { /* noop */ }
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, [events]);

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[940px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorPlay className="size-5 text-primary" />
            {session.domain}
          </DialogTitle>
          <DialogDescription>
            {(session.user_full_name || session.username || "—")} · {fmtTs(session.started_at)} · {fmtDuration(session.duration_seconds)}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-[460px] flex items-center justify-center rounded-md border border-border bg-muted/30">
          {isLoading && <Skeleton className="h-[440px] w-[860px]" />}
          {isError && <p className="text-destructive text-sm animate-in fade-in-0 duration-300">{t("modules.keys.webvisor.loadEventsError")}</p>}
          {!isLoading && !isError && events && events.length < 2 && (
            <p className="text-muted-foreground text-sm animate-in fade-in-0 duration-300">{t("modules.keys.webvisor.noEvents")}</p>
          )}
          {playerError && <p className="text-destructive text-sm">{playerError}</p>}
          <div ref={hostRef} className="rrweb-host" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── sessions list ────────────────────────────────────────────────────────────

export function WebvisorTab() {
  const { t } = useTranslation();
  const [domain, setDomain] = useState("");
  const [days, setDays] = useState(365);
  const [active, setActive] = useState<WebvisorSession | null>(null);

  const { data, isLoading, isFetching, refetch } = useWebvisorSessions({
    days, page: 1, page_size: 100, ...(domain.trim() ? { domain: domain.trim() } : {}),
  });
  const sessions: WebvisorSession[] = data?.sessions ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder={t("modules.keys.webvisor.domainSearch")}
            className="pl-8 w-56"
          />
        </div>
        <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
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
          {t("modules.keys.webvisor.total", { count: data?.total ?? 0 })}
        </span>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12" />
              <TableHead>{t("modules.keys.webvisor.user")}</TableHead>
              <TableHead>{t("modules.keys.webvisor.domain")}</TableHead>
              <TableHead>{t("modules.keys.webvisor.device")}</TableHead>
              <TableHead className="w-40">{t("modules.keys.webvisor.started")}</TableHead>
              <TableHead className="w-24">{t("modules.keys.webvisor.duration")}</TableHead>
              <TableHead className="w-28">{t("modules.keys.webvisor.ip")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="size-8 rounded-md" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-20" /></TableCell>
                </TableRow>
              ))}

            {!isLoading && sessions.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <MonitorPlay className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.keys.webvisor.empty")}</div>
                    {domain.trim() && (
                      <Button variant="outline" size="sm" onClick={() => setDomain("")}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )}

            {!isLoading && sessions.map((s, i) => {
              const DeviceIcon = s.device_type?.toLowerCase().includes("smart") || s.device_type?.toLowerCase().includes("phone")
                ? Smartphone : Monitor;
              return (
                <TableRow key={s.id}
                  className={`animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300 ${s.has_events ? "cursor-pointer" : ""}`}
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  onClick={() => s.has_events && setActive(s)}>
                  <TableCell>
                    {s.has_events ? (
                      <Button size="icon" variant="ghost" className="size-8"
                        onClick={(e) => { e.stopPropagation(); setActive(s); }}
                        title={t("modules.keys.webvisor.play")}>
                        <Play className="size-4 text-primary" />
                      </Button>
                    ) : (
                      <Clock className="size-4 text-muted-foreground mx-auto" />
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{s.user_full_name || s.username || t("modules.keys.webvisor.anonymous")}</TableCell>
                  <TableCell>
                    <a href={`https://${s.domain}`} target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-primary hover:underline">{s.domain}</a>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <DeviceIcon className="size-3.5" />
                      {[s.browser, s.os].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtTs(s.started_at)}</TableCell>
                  <TableCell>
                    <Badge variant="muted" className="gap-1"><Clock className="size-3" />{fmtDuration(s.duration_seconds)}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{s.ip_address || "—"}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {active && <WebvisorPlayer session={active} onClose={() => setActive(null)} />}
    </div>
  );
}
