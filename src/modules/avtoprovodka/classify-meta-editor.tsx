import { useEffect, useMemo, useState } from "react";
import {
  Plus, Pencil, Trash2, RefreshCw, Loader2, Settings2, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  useClassifyMeta, useCreateClassifyMeta, useUpdateClassifyMeta,
  useDeleteClassifyMeta, fmtDateTime, SOURCE_META,
  type AvSource, type ClassifyMeta,
} from "./api";

const SOURCE_OPTIONS: { value: AvSource; label: string }[] = [
  { value: "document", label: "Hujjat" },
  { value: "bank_txn", label: "Bank" },
  { value: "fiscal_cheque", label: "Chek" },
  { value: "vedmosti", label: "Vedmosti" },
];

// Common 1C ВидОперации enum names. These are suggestions — admin may type
// any string; the backend stores raw text. The full enum lives in cloud-os.
const OP_TYPE_SUGGESTIONS: string[] = [
  "ОплатаПокупателяКомиссия",
  "ВозвратДенежныхСредствПокупателем",
  "ОплатаПоставщикуСчет",
  "ОплатаПоставщикуТовары",
  "ВозвратДенежныхСредствПоставщиком",
  "ПрочееПоступлениеБезналичных",
  "ПрочееСписаниеБезналичных",
];

export function ClassifyMetaEditor({ companyId }: { companyId: number }) {
  const { data, isLoading, isFetching, refetch } = useClassifyMeta(companyId);
  const del = useDeleteClassifyMeta(companyId);
  const [edit, setEdit] = useState<ClassifyMeta | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ClassifyMeta | null>(null);

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          <Settings2 className="inline size-4 mr-1.5 -mt-0.5" />
          AI klassifikator qoidalari ({data?.total ?? 0})
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
            Yangilash
          </Button>
          <Button size="sm" onClick={() => setEdit("new")}>
            <Plus className="size-4" />
            Qoida qo'shish
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Manba</TableHead>
              <TableHead>Hujjat ID</TableHead>
              <TableHead>Operatsiya turi</TableHead>
              <TableHead className="w-[80px]">1C versiyasi</TableHead>
              <TableHead className="w-[170px]">Oxirgi tahrir</TableHead>
              <TableHead className="w-[100px] text-right">Amal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-7 w-16 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Settings2 className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">Qoidalar topilmadi</div>
                    <div className="text-xs text-muted-foreground">
                      "Qoida qo'shish" tugmasi orqali birinchi qoidani yarating.
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((m, i) => {
                const sm = SOURCE_META[m.source_type as AvSource];
                return (
                  <TableRow
                    key={m.id}
                    className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <TableCell>
                      {sm ? (
                        <Badge variant={sm.variant}>{sm.label}</Badge>
                      ) : (
                        <Badge variant="muted">{m.source_type}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="truncate font-mono text-xs">{m.document_id}</div>
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="truncate font-mono text-xs">
                        {m.operation_type || <span className="text-muted-foreground italic">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{m.onec_version || "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDateTime(m.updated_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setEdit(m)}
                          title="Tahrirlash"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          onClick={() => setConfirmDelete(m)}
                          title="O'chirish"
                          disabled={del.isPending}
                        >
                          <Trash2 className="size-3.5 text-destructive" />
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

      <ClassifyMetaDialog
        companyId={companyId}
        record={edit === "new" ? null : edit}
        open={edit !== null}
        onClose={() => setEdit(null)}
      />

      <ConfirmDeleteDialog
        record={confirmDelete}
        open={confirmDelete !== null}
        pending={del.isPending}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          del.mutate({ id: confirmDelete.id }, { onSuccess: () => setConfirmDelete(null) });
        }}
      />
    </div>
  );
}

// ── Edit / create dialog ─────────────────────────────────────────────────────
function ClassifyMetaDialog({
  companyId, record, open, onClose,
}: {
  companyId: number;
  record: ClassifyMeta | null;
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateClassifyMeta(companyId);
  const update = useUpdateClassifyMeta(companyId);

  const [sourceType, setSourceType] = useState<AvSource>("bank_txn");
  const [documentId, setDocumentId] = useState("");
  const [operationType, setOperationType] = useState("");
  const [onecVersion, setOnecVersion] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (record) {
      setSourceType((record.source_type as AvSource) || "bank_txn");
      setDocumentId(record.document_id || "");
      setOperationType(record.operation_type || "");
      setOnecVersion(record.onec_version || "");
    } else {
      setSourceType("bank_txn");
      setDocumentId("");
      setOperationType("");
      setOnecVersion("");
    }
  }, [open, record]);

  const isEdit = !!record;
  const pending = create.isPending || update.isPending;

  const submit = () => {
    setErr(null);
    if (!documentId.trim()) {
      setErr("Hujjat ID majburiy");
      return;
    }
    const payload = {
      document_id: documentId.trim(),
      source_type: sourceType,
      operation_type: operationType.trim() || null,
      onec_version: onecVersion.trim() || null,
    };
    const onError = (e: unknown) => {
      const ax = e as { response?: { data?: { detail?: string } } };
      setErr(ax.response?.data?.detail ?? "Xatolik yuz berdi");
    };
    if (isEdit && record) {
      update.mutate(
        { id: record.id, payload },
        { onSuccess: onClose, onError },
      );
    } else {
      create.mutate(payload, { onSuccess: onClose, onError });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Qoidani tahrirlash" : "Yangi qoida"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">Manba *</span>
            <Select value={sourceType} onValueChange={(v) => setSourceType(v as AvSource)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">Hujjat ID *</span>
            <Input
              value={documentId}
              onChange={(e) => setDocumentId(e.target.value)}
              placeholder="masalan: bank txn uuid yoki Didox doc UUID"
              maxLength={128}
            />
            <span className="text-[11px] text-muted-foreground">
              Manba bo'yicha hujjatning kanonik ID si — tranzaksiya yoki hujjat UUID si.
            </span>
          </label>

          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">
              Operatsiya turi (1C ВидОперации)
            </span>
            <Input
              value={operationType}
              onChange={(e) => setOperationType(e.target.value)}
              placeholder="masalan: ОплатаПоставщикуТовары"
              maxLength={64}
              list="op-type-suggestions"
            />
            <datalist id="op-type-suggestions">
              {OP_TYPE_SUGGESTIONS.map((o) => (
                <option key={o} value={o} />
              ))}
            </datalist>
          </label>

          <label className="space-y-1 block">
            <span className="text-xs text-muted-foreground">1C versiyasi</span>
            <Input
              value={onecVersion}
              onChange={(e) => setOnecVersion(e.target.value)}
              placeholder="ENT|UPP"
              maxLength={8}
            />
          </label>

          {err && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="size-4 mt-0.5 shrink-0" />
              <span>{err}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Bekor qilish
            </Button>
            <Button disabled={pending} onClick={submit}>
              {pending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              {isEdit ? "Saqlash" : "Yaratish"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Confirm-delete dialog ────────────────────────────────────────────────────
function ConfirmDeleteDialog({
  record, open, pending, onClose, onConfirm,
}: {
  record: ClassifyMeta | null;
  open: boolean;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const summary = useMemo(() => {
    if (!record) return "";
    const sm = SOURCE_META[record.source_type as AvSource];
    return `${sm?.label ?? record.source_type} · ${record.document_id}`;
  }, [record]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Qoidani o'chirishni tasdiqlang</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
            <div className="text-xs text-muted-foreground mb-1">O'chiriladi:</div>
            <div className="font-mono text-xs break-all">{summary}</div>
            {record?.operation_type && (
              <div className="mt-2 text-xs">
                <span className="text-muted-foreground">Operatsiya turi: </span>
                <span className="font-mono">{record.operation_type}</span>
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            Bu amal qaytarib bo'lmaydi. Hujjat keyingi AI klassifikatsiyada
            standart qoidalarga qaytadi.
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose} disabled={pending}>
              Bekor qilish
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={onConfirm}
            >
              {pending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              O'chirish
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
