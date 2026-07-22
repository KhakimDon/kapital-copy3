/**
 * Fayllar dialogs: move/copy folder picker, share links, preview.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check, ChevronRight, Copy as CopyIcon, Folder, Home, Link2, Loader2, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchNodeBlob, internalUrl, shareUrl,
  useCreateShare, useDeleteShare, useNodes, useShares,
} from "./api";
import { previewKind } from "./icons";
import { errMsg, fmtStamp } from "./lib";
import type { FileNode } from "./types";

// ── Move / Copy: drill-down folder picker ─────────────────────────────────────
export function MoveCopyDialog({
  companyId, nodes, mode, onClose, onSubmit, pending,
}: {
  companyId: number;
  nodes: FileNode[];           // selection being moved/copied
  mode: "move" | "copy";
  onClose: () => void;
  onSubmit: (parentId: number | null) => void;
  pending: boolean;
}) {
  const { t: tr } = useTranslation();
  const [dirId, setDirId] = useState<number | null>(null);
  const { data, isLoading } = useNodes(companyId, dirId);
  const movingIds = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);

  const folders = (data?.items ?? []).filter((n) => n.is_dir && !movingIds.has(n.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {tr(mode === "move" ? "modules.files.moveTo" : "modules.files.copyTo")}
            {" — "}
            {nodes.length === 1 ? nodes[0].name : tr("modules.files.nItems", { count: nodes.length })}
          </DialogTitle>
        </DialogHeader>

        <nav className="flex items-center gap-1 text-sm flex-wrap">
          <Button
            variant="ghost"
            onClick={() => setDirId(null)}
            className="flex h-auto items-center gap-1 p-0 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground [&_svg]:size-4"
          >
            <Home className="size-4" />
            {tr("modules.files.title")}
          </Button>
          {(data?.breadcrumb ?? []).map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight className="size-3.5 text-muted-foreground/60" />
              <Button
                variant="link"
                onClick={() => setDirId(c.id)}
                className="h-auto p-0 text-sm font-medium text-foreground no-underline hover:underline"
              >
                {c.name}
              </Button>
            </span>
          ))}
        </nav>

        <div className="rounded-md border max-h-64 overflow-y-auto divide-y">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : folders.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground text-center animate-in fade-in-0 duration-300">
              {tr("modules.files.noSubfolders")}
            </div>
          ) : folders.map((f, i) => (
            <Button
              key={f.id}
              variant="ghost"
              onClick={() => setDirId(f.id)}
              className="flex h-auto w-full items-center justify-start gap-2 rounded-none px-3 py-2 text-sm font-normal hover:bg-accent text-left animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
            >
              <Folder className="size-4 text-primary shrink-0" />
              <span className="truncate flex-1">{f.name}</span>
              <ChevronRight className="size-4 text-muted-foreground/60" />
            </Button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>{tr("modules.files.cancel")}</Button>
          <Button onClick={() => onSubmit(dirId)} disabled={pending}>
            {pending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            {tr(mode === "move" ? "modules.files.moveHere" : "modules.files.copyHere")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Share dialog: public links ────────────────────────────────────────────────
export function ShareDialog({
  companyId, node, onClose,
}: {
  companyId: number;
  node: FileNode;
  onClose: () => void;
}) {
  const { t: tr } = useTranslation();
  const { data, isLoading } = useShares(companyId, node.id);
  const create = useCreateShare();
  const remove = useDeleteShare();
  const [password, setPassword] = useState("");
  const [expires, setExpires] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setErr(tr("modules.files.copyFailed"));
    }
  };

  const links = data?.items ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tr("modules.files.shareTitle", { name: node.name })}</DialogTitle>
        </DialogHeader>

        {/* Internal link (works only for logged-in users with access) */}
        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
          <Link2 className="size-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">{tr("modules.files.internalLink")}</div>
            <div className="text-xs text-muted-foreground">{tr("modules.files.internalLinkHint")}</div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => copy(internalUrl(node), "internal")}
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            title={tr("modules.files.copyLink")}
          >
            {copied === "internal" ? <Check className="size-4 text-green-600" /> : <CopyIcon className="size-4" />}
          </Button>
        </div>

        {/* Existing public links */}
        <div className="space-y-1.5">
          <div className="text-sm font-medium">{tr("modules.files.publicLinks")}</div>
          {isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : links.length === 0 ? (
            <div className="text-xs text-muted-foreground animate-in fade-in-0 duration-300">{tr("modules.files.noLinks")}</div>
          ) : links.map((l, i) => (
            <div
              key={l.id}
              className="flex items-center gap-2 rounded-md border px-3 py-2 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
            >
              <Link2 className="size-4 text-green-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-mono truncate">{shareUrl(l.token)}</div>
                <div className="text-xs text-muted-foreground">
                  {l.has_password ? tr("modules.files.withPassword") : tr("modules.files.noPassword")}
                  {l.expires_at ? ` · ${tr("modules.files.until")} ${fmtStamp(l.expires_at).slice(0, 10)}` : ""}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copy(shareUrl(l.token), `l${l.id}`)}
                className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                title={tr("modules.files.copyLink")}
              >
                {copied === `l${l.id}` ? <Check className="size-4 text-green-600" /> : <CopyIcon className="size-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove.mutate(
                  { companyId, nodeId: node.id, shareId: l.id },
                  { onError: (e) => setErr(errMsg(e)) },
                )}
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                title={tr("modules.files.revoke")}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* New link */}
        <div className="space-y-2 rounded-md border p-3">
          <div className="text-sm font-medium">{tr("modules.files.newLink")}</div>
          <div className="flex gap-2">
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tr("modules.files.passwordOptional")}
              className="h-9"
            />
            <DatePicker
              value={expires}
              onChange={(v) => setExpires(v)}
              className="h-9 w-40"
            />
          </div>
          <Button
            size="sm"
            onClick={() => create.mutate(
              { companyId, nodeId: node.id, password: password || undefined, expiresAt: expires || undefined },
              {
                onSuccess: (l) => { setPassword(""); setExpires(""); copy(shareUrl(l.token), `l${l.id}`); },
                onError: (e) => setErr(errMsg(e)),
              },
            )}
            disabled={create.isPending}
          >
            {create.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            {tr("modules.files.createLink")}
          </Button>
        </div>

        {err && <div className="text-xs text-destructive">{err}</div>}
      </DialogContent>
    </Dialog>
  );
}

// ── Preview dialog: images / PDF / spreadsheets / text via blob ───────────────
const SHEET_MAX_ROWS = 1000;
const SHEET_MAX_COLS = 60;

type SheetData = {
  names: string[];
  // rows per sheet, lazily converted on tab switch
  grids: Record<string, (string | number | boolean | null)[][]>;
  truncated: boolean;
};

export function PreviewDialog({
  companyId, node, onClose,
}: {
  companyId: number;
  node: FileNode;
  onClose: () => void;
}) {
  const { t: tr } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [activeSheet, setActiveSheet] = useState("");
  const [err, setErr] = useState("");
  const kind = previewKind(node);

  useEffect(() => {
    let revoke: string | null = null;
    let alive = true;
    fetchNodeBlob(companyId, node.id)
      .then(async (blob) => {
        if (!alive) return;
        if (kind === "sheet") {
          const XLSX = await import("xlsx");
          const wb = XLSX.read(await blob.arrayBuffer(), { type: "array" });
          let truncated = false;
          const grids: SheetData["grids"] = {};
          for (const name of wb.SheetNames) {
            const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(
              wb.Sheets[name], { header: 1, blankrows: false, defval: "" },
            );
            if (rows.length > SHEET_MAX_ROWS) truncated = true;
            grids[name] = rows.slice(0, SHEET_MAX_ROWS).map((r) => {
              if (r.length > SHEET_MAX_COLS) truncated = true;
              return r.slice(0, SHEET_MAX_COLS);
            });
          }
          if (!alive) return;
          setSheet({ names: wb.SheetNames, grids, truncated });
          setActiveSheet(wb.SheetNames[0] || "");
        } else if (kind === "text") {
          setText(await blob.text());
        } else {
          const mime = node.mime || (kind === "pdf" ? "application/pdf" : "");
          revoke = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: mime }));
          setUrl(revoke);
        }
      })
      .catch((e) => alive && setErr(errMsg(e)));
    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [companyId, node.id, kind, node.mime]);

  const grid = sheet ? sheet.grids[activeSheet] ?? [] : [];
  const loading = !err && !url && text == null && !sheet;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[96vw] w-[96vw] h-[94vh] max-h-[94vh] flex flex-col gap-3 p-4">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{node.name}</DialogTitle>
        </DialogHeader>

        {sheet && sheet.names.length > 1 && (
          <div className="flex items-center gap-1 flex-wrap">
            {sheet.names.map((n) => (
              <Button
                key={n}
                variant={n === activeSheet ? "default" : "outline"}
                onClick={() => setActiveSheet(n)}
                className="h-auto rounded-md px-2.5 py-1 text-xs font-normal"
              >
                {n}
              </Button>
            ))}
          </div>
        )}

        <div className={`flex-1 min-h-0 overflow-auto ${
          loading || err ? "flex items-center justify-center" : ""
        }`}>
          {err ? (
            <div className="text-sm text-destructive">{err}</div>
          ) : loading ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          ) : sheet ? (
            <table className="text-xs border-collapse w-max min-w-full animate-in fade-in-0 duration-300">
              <tbody>
                {grid.map((row, ri) => (
                  <tr key={ri} className={ri === 0 ? "bg-muted/60 font-medium sticky top-0" : ri % 2 ? "bg-muted/20" : ""}>
                    <td className="border px-1.5 py-1 text-muted-foreground text-right select-none bg-muted/40 sticky left-0">
                      {ri + 1}
                    </td>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border px-2 py-1 whitespace-nowrap max-w-80 overflow-hidden text-ellipsis">
                        {cell == null ? "" : String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
                {grid.length === 0 && (
                  <tr><td className="p-4 text-muted-foreground">{tr("modules.files.sheetEmpty")}</td></tr>
                )}
              </tbody>
            </table>
          ) : text != null ? (
            <pre className="w-full text-sm whitespace-pre-wrap font-mono p-2 animate-in fade-in-0 duration-300">{text}</pre>
          ) : kind === "pdf" ? (
            <iframe src={url!} title={node.name} className="w-full h-full border-0 rounded animate-in fade-in-0 duration-300" />
          ) : (
            <div className="flex items-center justify-center h-full animate-in fade-in-0 duration-300">
              <img src={url!} alt={node.name} className="max-w-full max-h-full object-contain rounded" />
            </div>
          )}
        </div>

        <div className="text-xs text-muted-foreground shrink-0">
          {sheet?.truncated
            ? tr("modules.files.sheetTruncated", { rows: SHEET_MAX_ROWS })
            : tr("modules.files.previewHint")}
        </div>
      </DialogContent>
    </Dialog>
  );
}
