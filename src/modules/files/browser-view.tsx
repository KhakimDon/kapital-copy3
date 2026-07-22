/**
 * Fayllar — main browser (Proton Drive-style): breadcrumb, search, list/grid,
 * multi-select, sortable columns, row context menus, drag-drop that really
 * works (OS files AND folders upload with live progress via the transfer
 * manager; rows drag onto folders/breadcrumbs to move), row menu, dialogs.
 */

import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useUrlSearch, useUrlState } from "@/shared/hooks/use-url-state";
import {
  ArrowDown, ArrowUp, ChevronRight, Copy as CopyIcon, Download, Eye,
  FolderInput, FolderPlus, FolderUp, Home, LayoutGrid, Link2, List as ListIcon,
  Loader2, MoreHorizontal, Pencil, Share2, Star, Trash2, Upload, UploadCloud, X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  downloadNode, useCopyNode, useCreateFolder, useDeleteNode, useMoveNode,
  useNodes, useRenameNode, useSetFavorite,
} from "./api";
import { MoveCopyDialog, PreviewDialog, ShareDialog } from "./dialogs";
import { isPreviewable, nodeVisual } from "./icons";
import { errMsg, fmtSize, fmtStamp } from "./lib";
import { filesFromDrop, filesFromFolderInput, useUploads } from "./uploads";
import type { FileNode, SortDir, SortKey } from "./types";

/** Internal drag payload type for moving nodes (vs OS "Files" drags). */
const NODE_MIME = "application/x-aiba-node";

export function BrowserView({ companyId }: { companyId: number }) {
  const { t: tr } = useTranslation();
  const [sp, setSp] = useSearchParams();
  const qc = useQueryClient();
  const dirParam = sp.get("dir");
  const parentId = dirParam ? Number(dirParam) || null : null;

  const { data, isLoading } = useNodes(companyId, parentId);
  const enqueue = useUploads((s) => s.enqueue);
  const createFolder = useCreateFolder();
  const renameNode = useRenameNode();
  const deleteNode = useDeleteNode();
  const moveNode = useMoveNode();
  const copyNode = useCopyNode();
  const setFavorite = useSetFavorite();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  // Drag counter — enter/leave fire per child node, a bare boolean flickers.
  const dragDepth = useRef(0);
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState("");
  const [qInput, q, setQInput] = useUrlSearch("q");
  const [grid, setGrid] = useState(false);
  const [sortKeyRaw, setSortKeyRaw] = useUrlState("sort", "name");
  const sortKey = sortKeyRaw as SortKey;
  const [sortDirRaw, setSortDirRaw] = useUrlState("sortDir", "asc");
  const sortDir = sortDirRaw as SortDir;
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [renaming, setRenaming] = useState<FileNode | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [moveCopy, setMoveCopy] = useState<{ mode: "move" | "copy"; nodes: FileNode[] } | null>(null);
  const [sharing, setSharing] = useState<FileNode | null>(null);
  const [preview, setPreview] = useState<FileNode | null>(null);

  const items = useMemo(() => {
    let all = data?.items ?? [];
    const needle = q.trim().toLowerCase();
    if (needle) all = all.filter((n) => n.name.toLowerCase().includes(needle));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...all].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1; // dirs always first
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name, "uz");
      else if (sortKey === "size") cmp = a.size - b.size;
      else cmp = String(a.updated_at).localeCompare(String(b.updated_at));
      return cmp * dir;
    });
  }, [data, q, sortKey, sortDir]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["files"] });

  const goTo = (id: number | null) => {
    const next = new URLSearchParams(sp);
    if (id == null) next.delete("dir");
    else next.set("dir", String(id));
    setSp(next);
    setSelected(new Set());
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDirRaw(sortDir === "asc" ? "desc" : "asc");
    else { setSortKeyRaw(key); setSortDirRaw("asc"); }
  };

  /** Queue uploads into `target` (default: current folder). */
  const uploadFiles = (files: { file: File; relPath?: string[] }[], target: number | null = parentId) => {
    if (!files.length) return;
    setErr("");
    enqueue({ companyId, parentId: target, files, onDone: invalidate });
  };

  const submitFolder = () => {
    const name = folderName.trim();
    if (!name) return;
    createFolder.mutate(
      { companyId, parentId, name },
      {
        onSuccess: () => { setFolderOpen(false); setFolderName(""); },
        onError: (e) => setErr(errMsg(e)),
      },
    );
  };

  const submitRename = () => {
    if (!renaming) return;
    const name = renameTo.trim();
    if (!name || name === renaming.name) { setRenaming(null); return; }
    renameNode.mutate(
      { companyId, nodeId: renaming.id, name },
      { onSuccess: () => setRenaming(null), onError: (e) => setErr(errMsg(e)) },
    );
  };

  const onDelete = (nodes: FileNode[]) => {
    const msg = nodes.length === 1
      ? tr(nodes[0].is_dir ? "modules.files.confirmDeleteDir" : "modules.files.confirmDelete",
           { name: nodes[0].name })
      : tr("modules.files.confirmDeleteMany", { count: nodes.length });
    if (!confirm(msg)) return;
    for (const n of nodes) {
      deleteNode.mutate({ companyId, nodeId: n.id }, { onError: (e) => setErr(errMsg(e)) });
    }
    setSelected(new Set());
  };

  const submitMoveCopy = async (targetId: number | null) => {
    if (!moveCopy) return;
    try {
      for (const n of moveCopy.nodes) {
        if (moveCopy.mode === "move") {
          await moveNode.mutateAsync({ companyId, nodeId: n.id, parentId: targetId });
        } else {
          await copyNode.mutateAsync({ companyId, nodeId: n.id, parentId: targetId });
        }
      }
      setMoveCopy(null);
      setSelected(new Set());
    } catch (e) {
      setErr(errMsg(e));
    }
  };

  /** Move dragged node(s) into `targetId` (a folder or a breadcrumb level). */
  const moveDropped = async (draggedId: number, targetId: number | null) => {
    const ids = selected.has(draggedId) ? [...selected] : [draggedId];
    for (const id of ids) {
      if (id === targetId) continue;
      try {
        await moveNode.mutateAsync({ companyId, nodeId: id, parentId: targetId });
      } catch (e) {
        setErr(errMsg(e));
      }
    }
    setSelected(new Set());
  };

  const open = (n: FileNode) => {
    if (n.is_dir) return goTo(n.id);
    if (isPreviewable(n)) return setPreview(n);
    downloadNode(companyId, n).catch((e) => setErr(errMsg(e)));
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const allSelected = items.length > 0 && items.every((n) => selected.has(n.id));
  const someSelected = items.length > 0 && items.some((n) => selected.has(n.id));
  const selectedNodes = items.filter((n) => selected.has(n.id));

  const hasOsFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const hasNodeDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes(NODE_MIME);

  const SortHead = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <TableHead className={className}>
      <Button
        variant="ghost"
        onClick={() => toggleSort(k)}
        className="flex h-auto items-center gap-1 p-0 font-medium hover:bg-transparent hover:text-foreground [&_svg]:size-3"
      >
        {label}
        {sortKey === k && (sortDir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </Button>
    </TableHead>
  );

  /** Shared row actions — used by both the ⋯ menu and the right-click menu. */
  const rowActions = (n: FileNode) => ({
    preview: isPreviewable(n) ? () => setPreview(n) : undefined,
    download: () => downloadNode(companyId, n).catch((e) => setErr(errMsg(e))),
    rename: () => { setRenaming(n); setRenameTo(n.name); },
    move: () => setMoveCopy({ mode: "move", nodes: [n] }),
    copy: () => setMoveCopy({ mode: "copy", nodes: [n] }),
    share: () => setSharing(n),
    favorite: () => setFavorite.mutate(
      { companyId, nodeId: n.id, value: !n.favorite },
      { onError: (e) => setErr(errMsg(e)) },
    ),
    del: () => onDelete([n]),
  });

  return (
    <div
      className="relative space-y-3"
      onDragEnter={(e) => {
        if (!hasOsFiles(e)) return;
        e.preventDefault();
        dragDepth.current++;
        setDragOver(true);
      }}
      onDragOver={(e) => { if (hasOsFiles(e)) e.preventDefault(); }}
      onDragLeave={(e) => {
        if (!hasOsFiles(e)) return;
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragOver(false);
      }}
      onDrop={(e) => {
        if (!hasOsFiles(e)) return;
        e.preventDefault();
        dragDepth.current = 0;
        setDragOver(false);
        void filesFromDrop(e.dataTransfer).then((fs) => uploadFiles(fs));
      }}
    >
      {/* full-surface drop overlay — Proton-style */}
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/5 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-2 rounded-xl bg-card/95 px-8 py-6 shadow-lg">
            <UploadCloud className="size-8 text-primary" />
            <div className="text-sm font-medium">{tr("modules.files.dropHere", { defaultValue: "Fayl yoki papkalarni shu yerga tashlang" })}</div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex min-w-0 flex-1 items-center gap-1 text-sm">
          <CrumbTarget
            label={tr("modules.files.allFiles")}
            icon={<Home className="size-4" />}
            onOpen={() => goTo(null)}
            onNodeDrop={(id) => void moveDropped(id, null)}
            isRoot
          />
          {(data?.breadcrumb ?? []).map((c) => (
            <span key={c.id} className="flex min-w-0 items-center gap-1">
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
              <CrumbTarget
                label={c.name}
                onOpen={() => goTo(c.id)}
                onNodeDrop={(id) => void moveDropped(id, c.id)}
              />
            </span>
          ))}
        </nav>
        <Input
          value={qInput}
          onChange={(e) => setQInput(e.target.value)}
          placeholder={tr("modules.files.search")}
          className="h-9 w-44"
        />
        <Button variant="ghost" size="icon" className="size-9" onClick={() => setGrid(!grid)}
                title={tr(grid ? "modules.files.listView" : "modules.files.gridView")}>
          {grid ? <ListIcon className="size-4" /> : <LayoutGrid className="size-4" />}
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setFolderName(""); setFolderOpen(true); }}>
          <FolderPlus className="size-4 mr-1.5" />
          {tr("modules.files.newFolder")}
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm">
              <Upload className="size-4 mr-1.5" />
              {tr("modules.files.upload")}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <Upload className="size-4" />
              {tr("modules.files.uploadFiles", { defaultValue: "Fayl yuklash" })}
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <FolderUp className="size-4" />
              {tr("modules.files.uploadFolder", { defaultValue: "Papka yuklash" })}
            </button>
          </PopoverContent>
        </Popover>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            uploadFiles(Array.from(e.target.files ?? []).map((file) => ({ file })));
            e.currentTarget.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          // non-standard but universal in Chromium/WebKit — picks a directory
          {...({ webkitdirectory: "" } as Record<string, string>)}
          onChange={(e) => {
            uploadFiles(filesFromFolderInput(e.target.files));
            e.currentTarget.value = "";
          }}
        />
      </div>

      {err && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          {err}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setErr("")}
            className="size-5 text-destructive hover:bg-transparent hover:text-destructive [&_svg]:size-3"
          >
            <X className="size-3" />
          </Button>
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-md border bg-accent/50 px-3 py-2 text-sm">
          <span className="font-medium">{tr("modules.files.nSelected", { count: selected.size })}</span>
          <span className="flex-1" />
          <Button variant="outline" size="sm"
                  onClick={() => setMoveCopy({ mode: "move", nodes: selectedNodes })}>
            <FolderInput className="size-4 mr-1.5" />
            {tr("modules.files.move")}
          </Button>
          <Button variant="outline" size="sm"
                  onClick={() => setMoveCopy({ mode: "copy", nodes: selectedNodes })}>
            <CopyIcon className="size-4 mr-1.5" />
            {tr("modules.files.copy")}
          </Button>
          <Button variant="outline" size="sm" className="text-destructive"
                  onClick={() => onDelete(selectedNodes)}>
            <Trash2 className="size-4 mr-1.5" />
            {tr("modules.files.delete")}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSelected(new Set())}
            className="size-8 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {/* Listing */}
      <div className="overflow-hidden rounded-lg border bg-card">
        {grid ? (
          isLoading ? (
            <div className="grid grid-cols-2 gap-2 p-3 animate-in fade-in-0 duration-300 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {Array.from({ length: 12 }).map((_, i) => (
                <Skeleton key={`sk-${i}`} className="h-28 w-full rounded-lg" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyDrop tr={tr} onPick={() => fileInputRef.current?.click()} />
          ) : (
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {items.map((n, i) => {
                const { Icon, cls } = nodeVisual(n);
                return (
                  <Button
                    key={n.id}
                    variant="outline"
                    onClick={() => open(n)}
                    className={cn(
                      "flex h-auto flex-col items-center gap-1.5 rounded-lg border p-3 font-normal transition-colors animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300 hover:bg-accent [&_svg]:size-9 [&_.lucide-star]:size-3",
                      selected.has(n.id) && "ring-2 ring-primary",
                    )}
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                    onContextMenu={(e) => { e.preventDefault(); toggleSelect(n.id); }}
                    title={n.name}
                  >
                    <Icon className={`size-9 ${cls}`} />
                    <span className="line-clamp-2 break-all text-center text-xs leading-tight">
                      {n.name}
                      {n.favorite && <Star className="ml-0.5 inline size-3 fill-amber-500 text-amber-500" />}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {n.is_dir ? "" : fmtSize(n.size)}
                    </span>
                  </Button>
                );
              })}
            </div>
          )
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? "indeterminate" : false}
                    onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(items.map((n) => n.id)))}
                    className="size-4 cursor-pointer"
                  />
                </TableHead>
                <SortHead k="name" label={tr("modules.files.name")} />
                <SortHead k="updated_at" label={tr("modules.files.modified")} className="hidden w-44 sm:table-cell" />
                <SortHead k="size" label={tr("modules.files.size")} className="w-24" />
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`sk-${i}`} className="animate-in fade-in-0 duration-300 hover:bg-transparent">
                    <TableCell className="py-2.5"><Skeleton className="size-4 rounded-md" /></TableCell>
                    <TableCell className="py-2.5">
                      <div className="flex items-center gap-2">
                        <Skeleton className="size-4 shrink-0 rounded-md" />
                        <Skeleton className="h-3.5 w-44" />
                      </div>
                    </TableCell>
                    <TableCell className="hidden py-2.5 sm:table-cell"><Skeleton className="h-3.5 w-24" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="h-3.5 w-12" /></TableCell>
                    <TableCell className="py-2.5"><Skeleton className="ml-auto h-7 w-12" /></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5} className="py-16">
                    <EmptyDrop tr={tr} onPick={() => fileInputRef.current?.click()} bare />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((n, i) => {
                  const a = rowActions(n);
                  const { Icon, cls } = nodeVisual(n);
                  const isDropTarget = dropTarget === n.id;
                  return (
                    <ContextMenu key={n.id}>
                      <ContextMenuTrigger asChild>
                        <TableRow
                          className={cn(
                            "group animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300",
                            isDropTarget && "bg-primary/10 outline outline-2 -outline-offset-2 outline-primary/60",
                          )}
                          style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                          data-state={selected.has(n.id) ? "selected" : undefined}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData(NODE_MIME, String(n.id));
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnter={(e) => {
                            if (n.is_dir && (hasNodeDrag(e) || hasOsFiles(e))) {
                              e.preventDefault();
                              e.stopPropagation();
                              setDropTarget(n.id);
                            }
                          }}
                          onDragOver={(e) => {
                            if (n.is_dir && (hasNodeDrag(e) || hasOsFiles(e))) {
                              e.preventDefault();
                              e.stopPropagation();
                            }
                          }}
                          onDragLeave={(e) => {
                            if (dropTarget === n.id && !e.currentTarget.contains(e.relatedTarget as Node)) {
                              setDropTarget(null);
                            }
                          }}
                          onDrop={(e) => {
                            if (!n.is_dir) return;
                            e.preventDefault();
                            e.stopPropagation();
                            setDropTarget(null);
                            dragDepth.current = 0;
                            setDragOver(false);
                            const nodeId = e.dataTransfer.getData(NODE_MIME);
                            if (nodeId) void moveDropped(Number(nodeId), n.id);
                            else void filesFromDrop(e.dataTransfer).then((fs) => uploadFiles(fs, n.id));
                          }}
                        >
                          <TableCell className="py-2.5">
                            <Checkbox
                              checked={selected.has(n.id)}
                              onCheckedChange={() => toggleSelect(n.id)}
                              className="size-4 cursor-pointer"
                            />
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="flex min-w-0 items-center gap-2">
                              <Button
                                variant="link"
                                onClick={() => open(n)}
                                className="flex h-auto min-w-0 justify-start gap-2 p-0 text-left font-normal text-foreground no-underline hover:underline"
                              >
                                <Icon className={`size-4 shrink-0 ${cls}`} />
                                <span className="truncate font-medium">{n.name}</span>
                              </Button>
                              {n.favorite && <Star className="size-3.5 shrink-0 fill-amber-500 text-amber-500" />}
                              {(n.shares ?? 0) > 0 && <Link2 className="size-3.5 shrink-0 text-green-600" />}
                            </div>
                          </TableCell>
                          <TableCell className="hidden py-2.5 text-sm text-muted-foreground sm:table-cell">
                            {fmtStamp(n.updated_at)}
                          </TableCell>
                          <TableCell className="py-2.5 text-sm text-muted-foreground">
                            {n.is_dir ? "—" : fmtSize(n.size)}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={a.favorite}
                                className={cn(
                                  "size-8 text-muted-foreground transition-opacity hover:bg-transparent hover:text-amber-500",
                                  n.favorite ? "" : "opacity-0 group-hover:opacity-100",
                                )}
                                title={tr(n.favorite ? "modules.files.unfavorite" : "modules.files.favorite")}
                              >
                                <Star className={cn("size-4", n.favorite && "fill-amber-500 text-amber-500")} />
                              </Button>
                              <NodeMenu node={n} tr={tr} a={a} />
                            </div>
                          </TableCell>
                        </TableRow>
                      </ContextMenuTrigger>
                      <ContextMenuContent className="w-52">
                        {a.preview && (
                          <ContextMenuItem onSelect={a.preview} className="gap-2">
                            <Eye className="size-4" /> {tr("modules.files.preview")}
                          </ContextMenuItem>
                        )}
                        {!n.is_dir && (
                          <ContextMenuItem onSelect={a.download} className="gap-2">
                            <Download className="size-4" /> {tr("modules.files.download")}
                          </ContextMenuItem>
                        )}
                        <ContextMenuItem onSelect={a.rename} className="gap-2">
                          <Pencil className="size-4" /> {tr("modules.files.rename")}
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={a.move} className="gap-2">
                          <FolderInput className="size-4" /> {tr("modules.files.move")}
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={a.copy} className="gap-2">
                          <CopyIcon className="size-4" /> {tr("modules.files.copy")}
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={a.share} className="gap-2">
                          <Share2 className="size-4" /> {tr("modules.files.share")}
                        </ContextMenuItem>
                        <ContextMenuItem onSelect={a.favorite} className="gap-2">
                          <Star className="size-4" /> {tr(n.favorite ? "modules.files.unfavorite" : "modules.files.favorite")}
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem onSelect={a.del} className="gap-2 text-destructive focus:bg-destructive focus:text-white focus:[&_svg]:text-white">
                          <Trash2 className="size-4" /> {tr("modules.files.delete")}
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {!isLoading && items.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {tr("modules.files.itemsCount", { count: items.length })}
        </div>
      )}

      {/* New folder dialog */}
      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("modules.files.newFolder")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            placeholder={tr("modules.files.folderName")}
            onKeyDown={(e) => e.key === "Enter" && submitFolder()}
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setFolderOpen(false)}>
              {tr("modules.files.cancel")}
            </Button>
            <Button onClick={submitFolder} disabled={!folderName.trim() || createFolder.isPending}>
              {createFolder.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              {tr("modules.files.create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("modules.files.rename")}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameTo}
            onChange={(e) => setRenameTo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
          />
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setRenaming(null)}>
              {tr("modules.files.cancel")}
            </Button>
            <Button onClick={submitRename} disabled={!renameTo.trim() || renameNode.isPending}>
              {renameNode.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              {tr("modules.files.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {moveCopy && (
        <MoveCopyDialog
          companyId={companyId}
          nodes={moveCopy.nodes}
          mode={moveCopy.mode}
          onClose={() => setMoveCopy(null)}
          onSubmit={submitMoveCopy}
          pending={moveNode.isPending || copyNode.isPending}
        />
      )}
      {sharing && (
        <ShareDialog companyId={companyId} node={sharing} onClose={() => setSharing(null)} />
      )}
      {preview && (
        <PreviewDialog companyId={companyId} node={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

/** Breadcrumb item that is ALSO a move target for dragged rows. */
function CrumbTarget({
  label, icon, onOpen, onNodeDrop, isRoot,
}: {
  label: string;
  icon?: React.ReactNode;
  onOpen: () => void;
  onNodeDrop: (nodeId: number) => void;
  isRoot?: boolean;
}) {
  const [over, setOver] = useState(false);
  return (
    <Button
      variant={isRoot ? "ghost" : "link"}
      onClick={onOpen}
      onDragOver={(e) => {
        if (Array.from(e.dataTransfer.types).includes(NODE_MIME)) {
          e.preventDefault();
          e.stopPropagation();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const id = e.dataTransfer.getData(NODE_MIME);
        setOver(false);
        if (id) {
          e.preventDefault();
          e.stopPropagation();
          onNodeDrop(Number(id));
        }
      }}
      className={cn(
        "flex h-auto max-w-44 shrink-0 items-center gap-1 truncate p-0 text-sm no-underline hover:underline",
        isRoot ? "font-normal text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-4" : "font-medium text-foreground",
        over && "rounded bg-primary/10 px-1 outline outline-1 outline-primary/60",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </Button>
  );
}

/** Empty-state drop hint (list + grid). */
function EmptyDrop({ tr, onPick, bare }: { tr: (k: string, o?: Record<string, unknown>) => string; onPick: () => void; bare?: boolean }) {
  return (
    <div
      onClick={onPick}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300",
        !bare && "py-16",
      )}
    >
      <div className="grid size-14 place-items-center rounded-full bg-muted">
        <Upload className="size-7 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium text-foreground">{tr("modules.files.dropHint")}</div>
      <span className="text-xs text-muted-foreground">{tr("modules.files.maxSize")}</span>
    </div>
  );
}

// ── Row ⋯ menu (mirrors the right-click menu) ────────────────────────────────
function NodeMenu({
  node, tr, a,
}: {
  node: FileNode;
  tr: (k: string, o?: Record<string, unknown>) => string;
  a: {
    preview?: () => void;
    download: () => void;
    rename: () => void;
    move: () => void;
    copy: () => void;
    share: () => void;
    favorite: () => void;
    del: () => void;
  };
}) {
  const [open, setOpen] = useState(false);
  const item = (label: string, Icon: typeof Download, fn: () => void, danger = false) => (
    <Button
      variant="ghost"
      onClick={() => { setOpen(false); fn(); }}
      className={cn(
        "flex h-auto w-full items-center justify-start gap-2 rounded px-2 py-1.5 text-left text-sm font-normal hover:bg-accent",
        danger && "text-destructive hover:text-destructive",
      )}
    >
      <Icon className="size-4" />
      {label}
    </Button>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground opacity-0 transition-opacity hover:bg-transparent hover:text-foreground group-hover:opacity-100 data-[state=open]:opacity-100"
          title={tr("modules.files.actions")}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        {a.preview && item(tr("modules.files.preview"), Eye, a.preview)}
        {!node.is_dir && item(tr("modules.files.download"), Download, a.download)}
        {item(tr("modules.files.rename"), Pencil, a.rename)}
        {item(tr("modules.files.move"), FolderInput, a.move)}
        {item(tr("modules.files.copy"), CopyIcon, a.copy)}
        {item(tr("modules.files.share"), Share2, a.share)}
        {item(tr("modules.files.delete"), Trash2, a.del, true)}
      </PopoverContent>
    </Popover>
  );
}
