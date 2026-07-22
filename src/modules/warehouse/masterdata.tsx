import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlState, useUrlSearch } from "@/shared/hooks/use-url-state";
import {
  Plus, Pencil, Trash2, Search, RefreshCw, Users, X, CheckCircle2, AlertCircle, Building2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useSuppliers, useSaveSupplier, useDeleteSupplier, useSyncSuppliers,
  useBranches, useSaveBranch, useDeleteBranch, useBranch,
  useEmployeesPick, useAttachEmployee, useDetachEmployee,
  useTemplates, useSaveTemplate, useDeleteTemplate,
  errDetail,
  type Supplier, type Branch, type ItemTemplate, type TemplateField, type FieldType, type SyncResult,
} from "./masterdata-api";

type Tab = "suppliers" | "branches" | "templates";

const TAB_KEYS: Record<Tab, string> = {
  suppliers: "modules.warehouse.masterdata.tabs.suppliers",
  branches: "modules.warehouse.masterdata.tabs.branches",
  templates: "modules.warehouse.masterdata.tabs.templates",
};
const TAB_VALUES: Tab[] = ["suppliers", "branches", "templates"];

const dim = <span className="text-muted-foreground">—</span>;

export function MasterDataView({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  // Active sub-tab in the URL (namespaced `md_` — shares warehouse URL).
  const [tabRaw, setTabRaw] = useUrlState("md_tab", "suppliers");
  const tab = tabRaw as Tab;
  const setTab = (v: Tab) => setTabRaw(v);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 border-b border-border flex-wrap">
        {TAB_VALUES.map((k) => (
          <Button
            key={k}
            variant="ghost"
            onClick={() => setTab(k)}
            className={`h-auto rounded-none px-3 py-2 text-sm border-b-2 -mb-px hover:bg-transparent ${
              tab === k
                ? "border-primary text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t(TAB_KEYS[k])}
          </Button>
        ))}
      </div>

      {tab === "suppliers" && <SuppliersPane companyId={companyId} />}
      {tab === "branches" && <BranchesPane companyId={companyId} />}
      {tab === "templates" && <TemplatesPane companyId={companyId} />}
    </div>
  );
}

// ─────────────────────────── shared bits ────────────────────────────────────

function Toast({ msg, kind, onDone }: { msg: string; kind: "ok" | "err"; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 5000);
    return () => clearTimeout(id);
  }, [msg, onDone]);
  const ok = kind === "ok";
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
        ok
          ? "border-success/40 bg-success/15 text-success"
          : "border-destructive/40 bg-destructive/15 text-destructive"
      }`}
    >
      {ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
      {msg}
    </div>
  );
}

function FormError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/15 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="size-4 shrink-0" /> {msg}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-8" />
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-1.5 whitespace-nowrap">
      <Button variant="outline" size="icon" className="h-8 w-8" title={t("modules.warehouse.actions.edit")} onClick={onEdit}>
        <Pencil className="size-3.5" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        title={t("modules.warehouse.actions.delete")}
        onClick={onDelete}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function ConfirmDelete({
  open, title, body, busy, onClose, onConfirm,
}: {
  open: boolean; title: string; body: string; busy: boolean; onClose: () => void; onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>{t("modules.warehouse.actions.cancel")}</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? t("modules.warehouse.actions.deleting") : t("modules.warehouse.actions.delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── suppliers ──────────────────────────────────────

function SuppliersPane({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const [q, debounced, setQ] = useUrlSearch("md_q");

  const listQ = useSuppliers(companyId, debounced);
  const del = useDeleteSupplier(companyId);
  const sync = useSyncSuppliers(companyId);

  const [editing, setEditing] = useState<Supplier | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const runSync = () => {
    sync.mutate(undefined, {
      onSuccess: (r: SyncResult) => {
        if (r.note) {
          setToast({ msg: t("modules.warehouse.masterdata.suppliers.syncUnavailable"), kind: "err" });
        } else {
          setToast({
            msg: t("modules.warehouse.masterdata.suppliers.syncResult", { added: r.added, existing: r.skipped_existing, seen: r.total_seen }),
            kind: "ok",
          });
        }
      },
      onError: (e) => setToast({ msg: errDetail(e), kind: "err" }),
    });
  };

  const rows = listQ.data ?? [];

  return (
    <div className="space-y-3">
      {toast && <Toast msg={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder={t("modules.warehouse.masterdata.suppliers.searchPlaceholder")} />
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runSync} disabled={sync.isPending}>
            <RefreshCw className={`size-4 mr-1 ${sync.isPending ? "animate-spin" : ""}`} />
            {sync.isPending ? t("modules.warehouse.masterdata.suppliers.syncing") : t("modules.warehouse.masterdata.suppliers.syncFromDocs")}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4 mr-1" /> {t("modules.warehouse.actions.new")}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.name")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">INN</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.masterdata.suppliers.phone")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.masterdata.suppliers.bankAccount")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">MFO</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.masterdata.suppliers.purposeCode")}</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-14" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto rounded-md" /></TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Building2 className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.warehouse.masterdata.suppliers.empty")}</div>
                    {q.trim() && (
                      <Button variant="outline" size="sm" onClick={() => setQ("")}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((s, i) => (
                <TableRow
                  key={s.id}
                  className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs">{s.inn || dim}</TableCell>
                  <TableCell>{s.phone || dim}</TableCell>
                  <TableCell className="font-mono text-xs">{s.bank_account || dim}</TableCell>
                  <TableCell className="font-mono text-xs">{s.mfo || dim}</TableCell>
                  <TableCell className="font-mono text-xs">{s.purpose_code || dim}</TableCell>
                  <TableCell className="text-right">
                    <RowActions onEdit={() => setEditing(s)} onDelete={() => setToDelete(s)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <SupplierModal
        companyId={companyId}
        supplier={editing}
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onDone={() => { setCreating(false); setEditing(null); setToast({ msg: t("modules.warehouse.toast.done"), kind: "ok" }); }}
      />
      <ConfirmDelete
        open={!!toDelete}
        title={t("modules.warehouse.masterdata.suppliers.deleteTitle")}
        body={t("modules.warehouse.masterdata.confirmDelete", { name: toDelete?.name || "" })}
        busy={del.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (!toDelete) return;
          del.mutate(toDelete.id, {
            onSuccess: () => { setToDelete(null); setToast({ msg: t("modules.warehouse.toast.deleted"), kind: "ok" }); },
            onError: (e) => { setToDelete(null); setToast({ msg: errDetail(e), kind: "err" }); },
          });
        }}
      />
    </div>
  );
}

function SupplierModal({
  companyId, supplier, open, onClose, onDone,
}: {
  companyId: number; supplier: Supplier | null; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveSupplier(companyId);
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [phone, setPhone] = useState("");
  const [bank, setBank] = useState("");
  const [mfo, setMfo] = useState("");
  const [purpose, setPurpose] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(supplier?.name || "");
    setInn(supplier?.inn || "");
    setPhone(supplier?.phone || "");
    setBank(supplier?.bank_account || "");
    setMfo(supplier?.mfo || "");
    setPurpose(supplier?.purpose_code || "");
    setErr("");
  }, [open, supplier]);

  const submit = () => {
    setErr("");
    if (!name.trim()) { setErr(t("modules.warehouse.errors.nameRequired")); return; }
    save.mutate(
      {
        id: supplier?.id,
        payload: {
          name: name.trim(),
          inn: inn.trim() || null,
          phone: phone.trim() || null,
          bank_account: bank.trim() || null,
          mfo: mfo.trim() || null,
          purpose_code: purpose.trim() || null,
        },
      },
      { onSuccess: onDone, onError: (e) => setErr(errDetail(e)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{supplier ? t("modules.warehouse.masterdata.suppliers.editTitle") : t("modules.warehouse.masterdata.suppliers.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("modules.warehouse.cols.name")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("modules.warehouse.masterdata.suppliers.namePlaceholder")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">INN</label>
              <Input value={inn} onChange={(e) => setInn(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("modules.warehouse.masterdata.suppliers.phone")}</label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("modules.warehouse.masterdata.suppliers.bankAccount")}</label>
              <Input value={bank} onChange={(e) => setBank(e.target.value)} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">MFO</label>
              <Input value={mfo} onChange={(e) => setMfo(e.target.value)} inputMode="numeric" />
            </div>
          </div>
          <div className="space-y-1.5 max-w-[12rem]">
            <label className="text-sm font-medium">{t("modules.warehouse.masterdata.suppliers.purposeCode")}</label>
            <Input value={purpose} onChange={(e) => setPurpose(e.target.value)} maxLength={6} inputMode="numeric" placeholder="00659" />
          </div>
          <FormError msg={err} />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>{t("modules.warehouse.actions.cancel")}</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? t("modules.warehouse.actions.saving") : t("modules.warehouse.actions.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── branches ───────────────────────────────────────

function BranchesPane({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  // Client-side filter only — no debounce needed; mirror raw value to the URL.
  const [q, setQ] = useUrlState("md_bq");
  const listQ = useBranches(companyId);
  const del = useDeleteBranch(companyId);

  const [editing, setEditing] = useState<Branch | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Branch | null>(null);
  const [manageEmp, setManageEmp] = useState<Branch | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const rows = useMemo(() => {
    const all = listQ.data ?? [];
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (b) => b.name.toLowerCase().includes(term) || (b.address || "").toLowerCase().includes(term),
    );
  }, [listQ.data, q]);

  return (
    <div className="space-y-3">
      {toast && <Toast msg={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder={t("modules.warehouse.masterdata.branches.searchPlaceholder")} />
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4 mr-1" /> {t("modules.warehouse.actions.new")}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.name")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.masterdata.branches.address")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.masterdata.branches.employees")}</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-28 ml-auto rounded-md" /></TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Building2 className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.warehouse.masterdata.branches.empty")}</div>
                    {q.trim() && (
                      <Button variant="outline" size="sm" onClick={() => setQ("")}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((b, i) => (
                <TableRow
                  key={b.id}
                  className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <TableCell className="font-medium">{b.name}</TableCell>
                  <TableCell>{b.address || dim}</TableCell>
                  <TableCell>
                    <Badge variant="muted">{t("modules.warehouse.masterdata.branches.employeesCount", { count: b.employees_count })}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5 whitespace-nowrap">
                      <Button variant="outline" size="icon" className="h-8 w-8" title={t("modules.warehouse.masterdata.branches.employees")} onClick={() => setManageEmp(b)}>
                        <Users className="size-3.5" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8" title={t("modules.warehouse.actions.edit")} onClick={() => setEditing(b)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title={t("modules.warehouse.actions.delete")} onClick={() => setToDelete(b)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <BranchModal
        companyId={companyId}
        branch={editing}
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onDone={() => { setCreating(false); setEditing(null); setToast({ msg: t("modules.warehouse.toast.done"), kind: "ok" }); }}
      />
      <EmployeesDialog
        companyId={companyId}
        branch={manageEmp}
        onClose={() => setManageEmp(null)}
      />
      <ConfirmDelete
        open={!!toDelete}
        title={t("modules.warehouse.masterdata.branches.deleteTitle")}
        body={t("modules.warehouse.masterdata.confirmDelete", { name: toDelete?.name || "" })}
        busy={del.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (!toDelete) return;
          del.mutate(toDelete.id, {
            onSuccess: () => { setToDelete(null); setToast({ msg: t("modules.warehouse.toast.deleted"), kind: "ok" }); },
            onError: (e) => { setToDelete(null); setToast({ msg: errDetail(e), kind: "err" }); },
          });
        }}
      />
    </div>
  );
}

function BranchModal({
  companyId, branch, open, onClose, onDone,
}: {
  companyId: number; branch: Branch | null; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveBranch(companyId);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(branch?.name || "");
    setAddress(branch?.address || "");
    setErr("");
  }, [open, branch]);

  const submit = () => {
    setErr("");
    if (!name.trim()) { setErr(t("modules.warehouse.errors.nameRequired")); return; }
    save.mutate(
      { id: branch?.id, payload: { name: name.trim(), address: address.trim() || null } },
      { onSuccess: onDone, onError: (e) => setErr(errDetail(e)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{branch ? t("modules.warehouse.masterdata.branches.editTitle") : t("modules.warehouse.masterdata.branches.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("modules.warehouse.cols.name")}</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("modules.warehouse.masterdata.branches.namePlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t("modules.warehouse.masterdata.branches.address")}</label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("modules.warehouse.masterdata.branches.address")} />
          </div>
          <FormError msg={err} />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>{t("modules.warehouse.actions.cancel")}</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? t("modules.warehouse.actions.saving") : t("modules.warehouse.actions.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmployeesDialog({
  companyId, branch, onClose,
}: {
  companyId: number; branch: Branch | null; onClose: () => void;
}) {
  const { t } = useTranslation();
  const open = !!branch;
  const detailQ = useBranch(companyId, branch?.id ?? null);
  const pickQ = useEmployeesPick(companyId, open);
  const attach = useAttachEmployee(companyId);
  const detach = useDetachEmployee(companyId);
  const [pick, setPick] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => { setPick(""); setErr(""); }, [branch?.id]);

  const attached = detailQ.data?.employees_detail ?? [];
  const attachedIds = new Set(attached.map((e) => e.id));
  const available = (pickQ.data ?? []).filter((e) => !attachedIds.has(e.id));

  const doAttach = () => {
    setErr("");
    const eid = Number(pick);
    if (!eid || !branch) return;
    attach.mutate(
      { branchId: branch.id, employeeId: eid },
      { onSuccess: () => setPick(""), onError: (e) => setErr(errDetail(e)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("modules.warehouse.masterdata.employees.title")}</DialogTitle>
          <DialogDescription>{branch?.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border divide-y max-h-60 overflow-y-auto">
            {detailQ.isLoading ? (
              <div className="p-3 space-y-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-2/3" />
              </div>
            ) : attached.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground animate-in fade-in-0 duration-300">{t("modules.warehouse.masterdata.employees.noneAttached")}</div>
            ) : (
              attached.map((e) => (
                <div key={e.id} className="flex items-center justify-between px-3 py-2 text-sm animate-in fade-in-0 duration-300">
                  <span>{e.full_name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    title={t("modules.warehouse.masterdata.employees.detach")}
                    disabled={detach.isPending}
                    onClick={() =>
                      branch &&
                      detach.mutate(
                        { branchId: branch.id, employeeId: e.id },
                        { onError: (er) => setErr(errDetail(er)) },
                      )
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <label className="text-sm font-medium">{t("modules.warehouse.masterdata.employees.addLabel")}</label>
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger>
                  <SelectValue placeholder={available.length ? t("modules.warehouse.masterdata.employees.selectPlaceholder") : t("modules.warehouse.masterdata.employees.noEmployees")} />
                </SelectTrigger>
                <SelectContent>
                  {available.map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>
                      {e.full_name}{e.position ? ` · ${e.position}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={doAttach} disabled={!pick || attach.isPending}>
              <Plus className="size-4 mr-1" /> {t("modules.warehouse.actions.add")}
            </Button>
          </div>
          <FormError msg={err} />
        </div>

        <div className="flex justify-end mt-2">
          <Button variant="outline" onClick={onClose}>{t("modules.warehouse.actions.close")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── item templates ─────────────────────────────────

function TemplatesPane({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const [q, debounced, setQ] = useUrlSearch("md_tq");

  const listQ = useTemplates(companyId, debounced);
  const del = useDeleteTemplate(companyId);

  const [editing, setEditing] = useState<ItemTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<ItemTemplate | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const rows = listQ.data ?? [];

  return (
    <div className="space-y-3">
      {toast && <Toast msg={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <SearchBox value={q} onChange={setQ} placeholder={t("modules.warehouse.masterdata.templates.searchPlaceholder")} />
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4 mr-1" /> {t("modules.warehouse.actions.new")}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.name")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.masterdata.templates.category")}</TableHead>
              <TableHead className="text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.masterdata.templates.fields")}</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wide text-muted-foreground">{t("modules.warehouse.cols.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-8 w-20 ml-auto rounded-md" /></TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={4} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <Building2 className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">{t("modules.warehouse.masterdata.templates.empty")}</div>
                    {q.trim() && (
                      <Button variant="outline" size="sm" onClick={() => setQ("")}>{t("common.clear", { defaultValue: "Tozalash" })}</Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((tpl, i) => (
                <TableRow
                  key={tpl.id}
                  className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                >
                  <TableCell className="font-medium">{tpl.name}</TableCell>
                  <TableCell>{tpl.category || dim}</TableCell>
                  <TableCell>
                    <Badge variant="muted">{t("modules.warehouse.masterdata.templates.fieldsCount", { count: tpl.fields_schema?.length || 0 })}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <RowActions onEdit={() => setEditing(tpl)} onDelete={() => setToDelete(tpl)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <TemplateModal
        companyId={companyId}
        template={editing}
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onDone={() => { setCreating(false); setEditing(null); setToast({ msg: t("modules.warehouse.toast.done"), kind: "ok" }); }}
      />
      <ConfirmDelete
        open={!!toDelete}
        title={t("modules.warehouse.masterdata.templates.deleteTitle")}
        body={t("modules.warehouse.masterdata.confirmDelete", { name: toDelete?.name || "" })}
        busy={del.isPending}
        onClose={() => setToDelete(null)}
        onConfirm={() => {
          if (!toDelete) return;
          del.mutate(toDelete.id, {
            onSuccess: () => { setToDelete(null); setToast({ msg: t("modules.warehouse.toast.deleted"), kind: "ok" }); },
            onError: (e) => { setToDelete(null); setToast({ msg: errDetail(e), kind: "err" }); },
          });
        }}
      />
    </div>
  );
}

type FieldRow = { label: string; type: FieldType; unit: string; required: boolean; options: string };

function toRow(f: TemplateField): FieldRow {
  return {
    label: f.label || "",
    type: (f.type as FieldType) || "text",
    unit: f.unit || "",
    required: !!f.required,
    options: (f.options || []).join(", "),
  };
}

function TemplateModal({
  companyId, template, open, onClose, onDone,
}: {
  companyId: number; template: ItemTemplate | null; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const save = useSaveTemplate(companyId);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(template?.name || "");
    setCategory(template?.category || "");
    setFields(
      template?.fields_schema?.length
        ? template.fields_schema.map(toRow)
        : [{ label: "", type: "text", unit: "", required: false, options: "" }],
    );
    setErr("");
  }, [open, template]);

  const setField = (i: number, patch: Partial<FieldRow>) =>
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const addField = () =>
    setFields((prev) => [...prev, { label: "", type: "text", unit: "", required: false, options: "" }]);
  const removeField = (i: number) => setFields((prev) => prev.filter((_, idx) => idx !== i));

  const submit = () => {
    setErr("");
    if (!name.trim()) { setErr(t("modules.warehouse.errors.nameRequired")); return; }
    const fields_schema: TemplateField[] = fields
      .filter((f) => f.label.trim())
      .map((f) => ({
        label: f.label.trim(),
        type: f.type,
        unit: f.unit.trim() || undefined,
        required: f.required,
        options:
          f.type === "select"
            ? f.options.split(",").map((o) => o.trim()).filter(Boolean)
            : undefined,
      }));
    save.mutate(
      { id: template?.id, payload: { name: name.trim(), category: category.trim() || null, fields_schema } },
      { onSuccess: onDone, onError: (e) => setErr(errDetail(e)) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{template ? t("modules.warehouse.masterdata.templates.editTitle") : t("modules.warehouse.masterdata.templates.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("modules.warehouse.cols.name")}</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("modules.warehouse.masterdata.templates.namePlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("modules.warehouse.masterdata.templates.category")}</label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">{t("modules.warehouse.masterdata.templates.fields")}</label>
            {fields.map((f, i) => (
              <div key={i} className="rounded-md border p-2 space-y-2">
                <div className="flex gap-2 items-center">
                  <Input
                    value={f.label}
                    onChange={(e) => setField(i, { label: e.target.value })}
                    placeholder={t("modules.warehouse.masterdata.templates.fieldNamePlaceholder")}
                    className="flex-1"
                  />
                  <div className="w-32 shrink-0">
                    <Select value={f.type} onValueChange={(v) => setField(i, { type: v as FieldType })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">{t("modules.warehouse.masterdata.templates.fieldTypes.text")}</SelectItem>
                        <SelectItem value="number">{t("modules.warehouse.masterdata.templates.fieldTypes.number")}</SelectItem>
                        <SelectItem value="select">{t("modules.warehouse.masterdata.templates.fieldTypes.select")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    value={f.unit}
                    onChange={(e) => setField(i, { unit: e.target.value })}
                    placeholder={t("modules.warehouse.cols.unit")}
                    className="w-24 shrink-0"
                  />
                  <label className="flex items-center gap-1.5 text-sm shrink-0 whitespace-nowrap">
                    <Checkbox
                      checked={f.required}
                      onCheckedChange={(v) => setField(i, { required: Boolean(v) })}
                    />
                    {t("modules.warehouse.masterdata.templates.required")}
                  </label>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                    title={t("modules.warehouse.actions.delete")}
                    onClick={() => removeField(i)}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                {f.type === "select" && (
                  <Input
                    value={f.options}
                    onChange={(e) => setField(i, { options: e.target.value })}
                    placeholder={t("modules.warehouse.masterdata.templates.optionsPlaceholder")}
                  />
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addField}>
              <Plus className="size-4 mr-1" /> {t("modules.warehouse.masterdata.templates.newField")}
            </Button>
          </div>

          <FormError msg={err} />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={save.isPending}>{t("modules.warehouse.actions.cancel")}</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? t("modules.warehouse.actions.saving") : t("modules.warehouse.actions.save")}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
