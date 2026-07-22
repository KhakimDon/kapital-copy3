import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, PenLine, Ban, Trash2, X, Check, AlertCircle, RotateCcw } from "lucide-react";
import { api } from "@/shared/api/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { doctypeLabel, type DocRow } from "./types";

export type BulkKind = "sign" | "reject" | "delete";

const KIND_META: Record<BulkKind, { icon: typeof PenLine; danger?: boolean }> = {
  sign: { icon: PenLine },
  reject: { icon: Ban },
  delete: { icon: Trash2, danger: true },
};

function money(v?: number | null) {
  return v == null ? "—" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

// ---- bulk action bar (above the table) -------------------------------------
export function BulkBar({
  count, onSign, onReject, onDelete, onClear,
}: {
  count: number;
  onSign: () => void;
  onReject: () => void;
  onDelete: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-primary/5 px-3 py-2 flex-wrap">
      <span className="text-sm font-medium">{t("modules.documents.bulk.selected", { count })}</span>
      <div className="flex items-center gap-1.5 ml-auto">
        <Button size="sm" onClick={onSign}><PenLine className="size-4 mr-1.5" />{t("modules.documents.actions.sign")}</Button>
        <Button size="sm" variant="outline" onClick={onReject}><Ban className="size-4 mr-1.5" />{t("modules.documents.actions.reject")}</Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
          <Trash2 className="size-4 mr-1.5" />{t("modules.documents.actions.delete")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear}><X className="size-4 mr-1.5" />{t("modules.documents.actions.clear")}</Button>
      </div>
    </div>
  );
}

type RowState = "idle" | "running" | "ok" | "error";

// ---- bulk confirm + progress modal -----------------------------------------
export function BulkModal({
  companyId, kind, rows, onClose, onDone,
}: {
  companyId: number;
  kind: BulkKind;
  rows: DocRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const meta = KIND_META[kind];
  const kindTitle = t(`modules.documents.bulk.title.${kind}`);
  const kindVerb = t(`modules.documents.actions.${kind}`);
  const [comment, setComment] = useState("");
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const actionable = rows.filter((r) => r.id && (kind === "delete" ? r.can_delete : r.can_sign));

  function endpoint(pk: string) {
    return `/documents/companies/${companyId}/documents/by-pk/${pk}/${kind}`;
  }

  async function runOn(targets: DocRow[]) {
    setRunning(true);
    setFinished(false);
    const cfg = kind === "reject" ? { params: { comment } } : undefined;
    for (const r of targets) {
      const pk = r.id!;
      setStates((s) => ({ ...s, [pk]: "running" }));
      try {
        const res = (await api.post(endpoint(pk), null, cfg)).data;
        const ok = res?.ok !== false && !res?.error;
        setStates((s) => ({ ...s, [pk]: ok ? "ok" : "error" }));
        if (!ok) setErrors((e) => ({ ...e, [pk]: String(res?.message || res?.error || t("modules.documents.errors.generic")) }));
      } catch (e) {
        setStates((s) => ({ ...s, [pk]: "error" }));
        setErrors((er) => ({ ...er, [pk]: String((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? (e as Error)?.message ?? e) }));
      }
    }
    setRunning(false);
    setFinished(true);
    qc.invalidateQueries({ queryKey: ["documents"] });
  }

  function start() {
    if (kind === "reject" && !comment.trim()) return;
    runOn(actionable);
  }
  function retryFailed() {
    runOn(actionable.filter((r) => states[r.id!] === "error"));
  }

  const okCount = actionable.filter((r) => states[r.id!] === "ok").length;
  const failCount = actionable.filter((r) => states[r.id!] === "error").length;
  const canConfirm = actionable.length > 0 && (kind !== "reject" || comment.trim().length > 0);

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !running) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <meta.icon className="size-5" /> {kindTitle}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {t("modules.documents.bulk.willApply", { count: actionable.length, verb: kindVerb })}
            {actionable.length < rows.length && (
              <span className="text-warning"> {t("modules.documents.bulk.skipped", { count: rows.length - actionable.length })}</span>
            )}
          </p>

          {/* selected docs table */}
          <div className="rounded-lg border max-h-64 overflow-y-auto text-sm">
            <div className="grid grid-cols-[1fr_90px_1fr_90px_24px] gap-2 px-3 py-1.5 bg-muted text-xs font-medium uppercase tracking-wide text-muted-foreground sticky top-0 border-b border-border">
              <span>{t("modules.documents.columns.counterparty")}</span><span>{t("modules.documents.columns.tin")}</span><span>{t("modules.documents.columns.name")}</span><span className="text-right">{t("modules.documents.columns.amount")}</span><span />
            </div>
            {actionable.map((r) => {
              const stt = states[r.id!] ?? "idle";
              return (
                <div key={r.id} className="grid grid-cols-[1fr_90px_1fr_90px_24px] gap-2 px-3 py-1.5 border-t border-border items-center tabular-nums">
                  <span className="truncate">{r.partner_name || "—"}</span>
                  <span className="tabular-nums text-xs">{r.partner_tin || "—"}</span>
                  <span className="truncate text-xs tabular-nums">{r.name || (r.doctype ? t(`modules.documents.doctypes.${r.doctype}`, doctypeLabel(r.doctype)) : doctypeLabel(r.doctype))}</span>
                  <span className="text-right tabular-nums">{money(r.total_sum)}</span>
                  <span className="flex justify-end">
                    {stt === "running" && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                    {stt === "ok" && <Check className="size-4 text-success" />}
                    {stt === "error" && <AlertCircle className="size-4 text-destructive" />}
                  </span>
                </div>
              );
            })}
          </div>

          {/* comment for reject */}
          {kind === "reject" && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("modules.documents.reject.commentLabel")}</label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={t("modules.documents.reject.commentPlaceholder")}
                rows={2}
                disabled={running}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {/* result summary */}
          {finished && (
            <div className="flex items-center gap-3 text-sm animate-in fade-in-0 duration-300">
              {okCount > 0 && <Badge variant="success">{t("modules.documents.bulk.doneCount", { count: okCount })}</Badge>}
              {failCount > 0 && <Badge variant="danger">{t("modules.documents.bulk.errorCount", { count: failCount })}</Badge>}
            </div>
          )}
          {finished && failCount > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive space-y-1 max-h-28 overflow-y-auto animate-in fade-in-0 duration-300">
              {actionable.filter((r) => states[r.id!] === "error").map((r) => (
                <div key={r.id}><span className="tabular-nums">{r.name || r.partner_tin}</span>: {errors[r.id!]}</div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <div className="mr-auto text-xs text-muted-foreground self-center">
            {running ? t("modules.documents.bulk.running") : t("modules.documents.bulk.docCount", { count: actionable.length })}
          </div>
          {finished && failCount > 0 && (
            <Button variant="outline" onClick={retryFailed} disabled={running}>
              <RotateCcw className="size-4 mr-1.5" />{t("modules.documents.bulk.retryErrors")}
            </Button>
          )}
          <Button variant="outline" onClick={finished ? onDone : onClose} disabled={running}>
            {finished ? t("modules.documents.actions.close") : t("modules.documents.actions.cancel")}
          </Button>
          {!finished && (
            <Button variant={meta.danger ? "destructive" : "default"} onClick={start} disabled={running || !canConfirm}>
              {running && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              {kindVerb}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
