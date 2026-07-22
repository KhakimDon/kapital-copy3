/**
 * Fayllar — company-scoped file manager (folders + MinIO-backed files).
 * NC-style layout: left rail with views (all/recent/favorites/trash) + quota,
 * main browser on the right. Folder navigation lives in `?dir=`, the active
 * view in `?view=` so refresh/back work.
 */

import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  Clock, Folder, HardDrive, Loader2, RotateCcw, Star, Trash2, X,
} from "lucide-react";
import { useState } from "react";
import { useCompany } from "@/shared/store/company";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ModuleShell, type ModuleSection } from "@/components/ui/module-shell";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  downloadNode, useEmptyTrash, useFavorites, useFilesStats, usePurgeNode,
  useRecent, useRestoreNode, useTrash,
} from "./api";
import { BrowserView } from "./browser-view";
import { UploadManager } from "./upload-manager";
import { nodeVisual } from "./icons";
import { errMsg, fmtSize, fmtStamp } from "./lib";
import type { FileNode, FilesView } from "./types";

export function FilesPage() {
  const companyId = useCompany((s) => s.current)?.id ?? null;

  if (!companyId) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
        Avval yuqoridan kompaniya tanlang.
      </div>
    );
  }
  return <FilesShell companyId={companyId} />;
}

function FilesShell({ companyId }: { companyId: number }) {
  const { t: tr } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const view = (sp.get("view") as FilesView) || "all";
  const { data: stats } = useFilesStats(companyId);

  const setView = (v: FilesView) => {
    const next = new URLSearchParams();
    if (v !== "all") next.set("view", v);
    setSp(next);
  };

  const sections: ModuleSection[] = [
    { key: "all", label: tr("modules.files.allFiles"), icon: <Folder /> },
    { key: "recent", label: tr("modules.files.recentView"), icon: <Clock /> },
    { key: "favorites", label: tr("modules.files.favoritesView"), icon: <Star /> },
    {
      key: "trash",
      label: tr("modules.files.trashView"),
      icon: <Trash2 />,
      badge: (stats?.trash_items ?? 0) > 0
        ? <span className="text-[10px] text-muted-foreground">{stats?.trash_items}</span>
        : undefined,
    },
  ];

  return (
    <ModuleShell
      title={tr("modules.files.title", "Fayllar")}
      icon={<HardDrive className="size-6" />}
      subtitle={
        stats
          ? tr("modules.files.usedSpace", { size: fmtSize(stats.used_bytes ?? 0), count: stats.files ?? 0 })
          : undefined
      }
      sections={sections}
      active={view}
      onSelect={(k) => setView(k as FilesView)}
    >
      {view === "all" && <BrowserView companyId={companyId} />}
      {view === "recent" && <PathList companyId={companyId} kind="recent" />}
      {view === "favorites" && <PathList companyId={companyId} kind="favorites" />}
      {view === "trash" && <TrashView companyId={companyId} />}
      {/* Floating transfer manager (uploads with live progress). */}
      <UploadManager />
    </ModuleShell>
  );
}

// ── Recent / Favorites: flat list with parent path ────────────────────────────
function PathList({ companyId, kind }: { companyId: number; kind: "recent" | "favorites" }) {
  const { t: tr } = useTranslation();
  const [, setSp] = useSearchParams();
  const recent = useRecent(companyId, kind === "recent");
  const favorites = useFavorites(companyId, kind === "favorites");
  const { data, isLoading } = kind === "recent" ? recent : favorites;
  const [err, setErr] = useState("");

  const openLocation = (n: FileNode) => {
    const next = new URLSearchParams();
    if (n.is_dir) next.set("dir", String(n.id));
    else if (n.parent_id != null) next.set("dir", String(n.parent_id));
    setSp(next);
  };

  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        {tr(kind === "recent" ? "modules.files.recentView" : "modules.files.favoritesView")}
      </h2>
      {err && <div className="text-xs text-destructive">{err}</div>}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("modules.files.name")}</TableHead>
              <TableHead className="hidden sm:table-cell">{tr("modules.files.location")}</TableHead>
              <TableHead className="w-24">{tr("modules.files.size")}</TableHead>
              <TableHead className="w-40 hidden md:table-cell">{tr("modules.files.modified")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-4 rounded-md shrink-0" />
                      <Skeleton className="h-3.5 w-40" />
                    </div>
                  </TableCell>
                  <TableCell className="py-2 hidden sm:table-cell"><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell className="py-2"><Skeleton className="h-3.5 w-12" /></TableCell>
                  <TableCell className="py-2 hidden md:table-cell"><Skeleton className="h-3.5 w-24" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      {kind === "recent"
                        ? <Clock className="size-7 text-muted-foreground" />
                        : <Star className="size-7 text-muted-foreground" />}
                    </div>
                    <div className="text-sm font-medium text-foreground">{tr("modules.files.emptyView")}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((n, i) => {
                const { Icon, cls } = nodeVisual(n);
                return (
                  <TableRow
                    key={n.id}
                    className="group animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <TableCell className="py-2">
                      <Button
                        variant="link"
                        onClick={() => n.is_dir
                          ? openLocation(n)
                          : downloadNode(companyId, n, true).catch((e) => setErr(errMsg(e)))}
                        className="flex h-auto min-w-0 justify-start gap-2 p-0 text-left font-normal text-foreground no-underline hover:underline"
                      >
                        <Icon className={`size-4 shrink-0 ${cls}`} />
                        <span className="truncate font-medium">{n.name}</span>
                      </Button>
                    </TableCell>
                    <TableCell className="py-2 hidden sm:table-cell">
                      <Button
                        variant="link"
                        onClick={() => openLocation(n)}
                        className="h-auto justify-start truncate p-0 text-sm font-normal text-muted-foreground no-underline hover:underline"
                      >
                        {n.path ? n.path : tr("modules.files.rootLocation")}
                      </Button>
                    </TableCell>
                    <TableCell className="py-2 text-muted-foreground text-sm">
                      {n.is_dir ? "—" : fmtSize(n.size)}
                    </TableCell>
                    <TableCell className="py-2 text-muted-foreground text-sm hidden md:table-cell">
                      {fmtStamp(n.updated_at)}
                    </TableCell>
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

// ── Trash ─────────────────────────────────────────────────────────────────────
function TrashView({ companyId }: { companyId: number }) {
  const { t: tr } = useTranslation();
  const { data, isLoading } = useTrash(companyId);
  const restore = useRestoreNode();
  const purge = usePurgeNode();
  const empty = useEmptyTrash();
  const [err, setErr] = useState("");

  const items = data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground flex-1">
          {tr("modules.files.trashView")}
        </h2>
        {items.length > 0 && (
          <Button
            variant="outline" size="sm" className="text-destructive"
            disabled={empty.isPending}
            onClick={() => {
              if (confirm(tr("modules.files.confirmEmptyTrash")))
                empty.mutate({ companyId }, { onError: (e) => setErr(errMsg(e)) });
            }}
          >
            {empty.isPending
              ? <Loader2 className="size-4 mr-1.5 animate-spin" />
              : <X className="size-4 mr-1.5" />}
            {tr("modules.files.emptyTrash")}
          </Button>
        )}
      </div>
      {err && <div className="text-xs text-destructive">{err}</div>}
      <div className="rounded-lg border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tr("modules.files.name")}</TableHead>
              <TableHead className="w-24">{tr("modules.files.size")}</TableHead>
              <TableHead className="w-44 hidden sm:table-cell">{tr("modules.files.deletedAt")}</TableHead>
              <TableHead className="w-36 hidden md:table-cell">{tr("modules.files.deletedBy")}</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell className="py-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="size-4 rounded-md shrink-0" />
                      <Skeleton className="h-3.5 w-40" />
                    </div>
                  </TableCell>
                  <TableCell className="py-2"><Skeleton className="h-3.5 w-12" /></TableCell>
                  <TableCell className="py-2 hidden sm:table-cell"><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell className="py-2 hidden md:table-cell"><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell className="py-2"><Skeleton className="h-7 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={5} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Trash2 className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{tr("modules.files.trashEmpty")}</div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((n, i) => {
                const { Icon, cls } = nodeVisual(n);
                return (
                  <TableRow
                    key={n.id}
                    className="group animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <TableCell className="py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`size-4 shrink-0 ${cls}`} />
                        <span className="truncate font-medium">{n.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-2 text-muted-foreground text-sm">
                      {n.is_dir ? "—" : fmtSize(n.size)}
                    </TableCell>
                    <TableCell className="py-2 text-muted-foreground text-sm hidden sm:table-cell">
                      {fmtStamp(n.deleted_at)}
                    </TableCell>
                    <TableCell className="py-2 text-muted-foreground text-sm hidden md:table-cell">
                      {n.deleted_by || "—"}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => restore.mutate(
                            { companyId, nodeId: n.id },
                            { onError: (e) => setErr(errMsg(e)) },
                          )}
                          className="size-8 text-muted-foreground hover:text-foreground"
                          title={tr("modules.files.restore")}
                        >
                          <RotateCcw className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm(tr("modules.files.confirmPurge", { name: n.name })))
                              purge.mutate({ companyId, nodeId: n.id },
                                           { onError: (e) => setErr(errMsg(e)) });
                          }}
                          className="size-8 text-muted-foreground hover:text-destructive"
                          title={tr("modules.files.purge")}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
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
