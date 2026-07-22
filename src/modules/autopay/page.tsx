/**
 * Avtoto'lov (Autopay) page — 1:1 native mirror of the cloud
 * `aiba_integration/templates/autopay.php` + `autopay.js` view.
 *
 * Three sections via the canonical ModuleShell sidebar:
 *   - 'schedules'  → Jadvallar (list of recurring payment templates)
 *   - 'history'    → Tarix (run history with status filter + pagination)
 *   - 'settings'   → Sozlamalar (placeholder; cloud owns mutations)
 *
 * Data is read-only from oc_aiba_autopay_schedules + oc_aiba_autopay_history
 * via /api/v2/autopay/*. A schedule/history row click opens a detail Sheet
 * (mirrors the cloud's #apdetails-modal).
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlNumber, useUrlState } from "@/shared/hooks/use-url-state";
import {
  CreditCard, ListChecks, History, Settings as SettingsIcon,
  ChevronLeft, ChevronRight, RefreshCw, AlertCircle, CheckCircle2,
  Clock, Search as SearchIcon, Plus, MoreVertical,
  Pencil, Play, Power, Trash2,
} from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { ModuleShell, type ModuleSection } from "@/components/ui/module-shell";
import { Reveal } from "@/components/ui/reveal";
import { DetailRow } from "@/components/ui/detail-page";
import {
  useAutopaySchedules, useAutopaySchedule, useAutopayHistory,
  useAutopayHistoryEntry,
  useDeleteSchedule, useToggleSchedule, useRunSchedule,
  autopayErrDetail,
  type AutopaySchedule, type AutopayHistoryEntry,
} from "./api";
import { ScheduleForm } from "./schedule-form";

type SectionKey = "schedules" | "history" | "settings";

const SECTION_ICONS: Record<SectionKey, React.ReactNode> = {
  schedules: <ListChecks className="size-4" />,
  history: <History className="size-4" />,
  settings: <SettingsIcon className="size-4" />,
};
const SECTION_KEYS: SectionKey[] = ["schedules", "history", "settings"];

// ---- formatters ------------------------------------------------------------

function money(v?: number | null): string {
  if (v == null) return "—";
  return Number(v).toLocaleString("ru-RU");
}

function formatTs(ts?: number | null): string {
  if (!ts) return "—";
  try {
    const d = new Date(ts * 1000);
    return new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Asia/Tashkent",
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(d);
  } catch {
    return "—";
  }
}

function useStatusBadge() {
  const { t } = useTranslation();
  return (status?: string | null) => {
    switch (status) {
      case "success":
        return (
          <Badge variant="success" className="gap-1">
            <CheckCircle2 className="size-3" /> {t("modules.autopay.status.success")}
          </Badge>
        );
      case "error":
      case "failed":
        return (
          <Badge variant="danger" className="gap-1">
            <AlertCircle className="size-3" /> {t("modules.autopay.status.error")}
          </Badge>
        );
      case "skipped":
        return <Badge variant="info">{t("modules.autopay.status.skipped")}</Badge>;
      case "pending":
        return (
          <Badge variant="warning" className="gap-1">
            <Clock className="size-3" /> {t("modules.autopay.status.pending")}
          </Badge>
        );
      default:
        return <Badge variant="muted">{status || "—"}</Badge>;
    }
  };
}

function useActiveBadge() {
  const { t } = useTranslation();
  return (active: boolean) =>
    active ? (
      <Badge variant="success">{t("modules.autopay.status.active")}</Badge>
    ) : (
      <Badge variant="muted">{t("modules.autopay.status.stopped")}</Badge>
    );
}

// ----------------------------------------------------------------------------

// Tiny inline toast — same pattern as the warehouse module.
function Toast({ msg, kind, onDone }: { msg: string; kind: "ok" | "err"; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, 4000);
    return () => clearTimeout(id);
  }, [msg, onDone]);
  const ok = kind === "ok";
  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg ${
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

export function AutopayPage() {
  const { t } = useTranslation();
  const [sectionRaw, setSectionRaw] = useUrlState("section", "schedules");
  const section = sectionRaw as SectionKey;
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;

  const [openScheduleId, setOpenScheduleId] = useState<number | null>(null);
  const [openHistoryId, setOpenHistoryId] = useState<number | null>(null);

  // Form (create + edit). When `editing` is set we open in edit mode.
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AutopaySchedule | null>(null);

  // Confirm-delete dialog state.
  const [confirmDelete, setConfirmDelete] = useState<AutopaySchedule | null>(null);

  // Toast for row actions (toggle/run/delete) success+failure.
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "err" } | null>(null);

  const sections: ModuleSection[] = SECTION_KEYS.map((k) => ({
    key: k,
    label: t(`modules.autopay.sections.${k}`),
    icon: SECTION_ICONS[k],
  }));

  const subtitle = company ? company.name : undefined;

  function handleEdit(row: AutopaySchedule) {
    setEditing(row);
    setFormOpen(true);
  }
  function handleNew() {
    setEditing(null);
    setFormOpen(true);
  }

  return (
    <>
      <ModuleShell
        title={t("modules.autopay.title")}
        icon={<CreditCard className="size-6" />}
        subtitle={subtitle}
        sections={sections}
        active={section}
        onSelect={(k) => setSectionRaw(k)}
      >
        {!companyId ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
            {t("modules.autopay.noCompany")}
          </div>
        ) : section === "schedules" ? (
          <SchedulesView
            companyId={companyId}
            onOpen={(id) => setOpenScheduleId(id)}
            onNew={handleNew}
            onEdit={handleEdit}
            onDelete={(row) => setConfirmDelete(row)}
            onToast={(t) => setToast(t)}
          />
        ) : section === "history" ? (
          <HistoryView
            companyId={companyId}
            onOpen={(id) => setOpenHistoryId(id)}
            onOpenSchedule={(id) => setOpenScheduleId(id)}
          />
        ) : (
          <SettingsView />
        )}
      </ModuleShell>

      <ScheduleDetailSheet
        id={openScheduleId}
        onClose={() => setOpenScheduleId(null)}
      />
      <HistoryDetailSheet
        id={openHistoryId}
        onClose={() => setOpenHistoryId(null)}
      />

      <ScheduleForm
        open={formOpen}
        onClose={(saved) => {
          const wasEdit = !!editing;
          setFormOpen(false);
          setEditing(null);
          if (saved) {
            setToast({
              msg: wasEdit
                ? t("modules.autopay.toast.scheduleSaved")
                : t("modules.autopay.toast.scheduleCreated"),
              kind: "ok",
            });
          }
        }}
        companyId={companyId}
        companyName={company?.name}
        companyInn={company?.inn}
        chat2CompanyId={company?.chat2_company_id}
        editing={editing}
      />

      <ConfirmDeleteDialog
        row={confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onDeleted={() => setToast({ msg: t("modules.autopay.toast.scheduleDeleted"), kind: "ok" })}
        onError={(msg) => setToast({ msg, kind: "err" })}
      />

      {toast && <Toast msg={toast.msg} kind={toast.kind} onDone={() => setToast(null)} />}
    </>
  );
}

function ConfirmDeleteDialog({
  row, onClose, onDeleted, onError,
}: {
  row: AutopaySchedule | null;
  onClose: () => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}) {
  const { t } = useTranslation();
  const del = useDeleteSchedule();
  if (!row) return null;
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("modules.autopay.confirmDelete.title")}</DialogTitle>
          <DialogDescription>
            {t("modules.autopay.confirmDelete.description", { name: row.name })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={onClose} disabled={del.isPending}>
            {t("modules.autopay.actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={del.isPending}
            onClick={async () => {
              try {
                await del.mutateAsync(row.id);
                onClose();
                onDeleted();
              } catch (e) {
                onError(autopayErrDetail(e));
              }
            }}
          >
            {del.isPending
              ? t("modules.autopay.actions.deleting")
              : t("modules.autopay.actions.delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---- Schedules view --------------------------------------------------------

function SchedulesView({
  companyId,
  onOpen,
  onNew,
  onEdit,
  onDelete,
  onToast,
}: {
  companyId: number;
  onOpen: (id: number) => void;
  onNew: () => void;
  onEdit: (row: AutopaySchedule) => void;
  onDelete: (row: AutopaySchedule) => void;
  onToast: (t: { msg: string; kind: "ok" | "err" }) => void;
}) {
  const { t } = useTranslation();
  const activeBadge = useActiveBadge();
  const { data, isLoading, isFetching, refetch } = useAutopaySchedules(companyId);
  const rows: AutopaySchedule[] = data ?? [];

  const toggle = useToggleSchedule();
  const run = useRunSchedule();

  async function handleToggle(row: AutopaySchedule) {
    try {
      const r = await toggle.mutateAsync(row.id);
      onToast({
        msg: r.is_active
          ? t("modules.autopay.toast.scheduleActivated")
          : t("modules.autopay.toast.scheduleStopped"),
        kind: "ok",
      });
    } catch (e) {
      onToast({ msg: autopayErrDetail(e), kind: "err" });
    }
  }
  async function handleRun(row: AutopaySchedule) {
    try {
      const r = await run.mutateAsync(row.id);
      if (r.note === "dispatcher unavailable") {
        onToast({ msg: t("modules.autopay.toast.queuedNoDispatcher"), kind: "ok" });
      } else {
        onToast({ msg: t("modules.autopay.toast.launched"), kind: "ok" });
      }
    } catch (e) {
      onToast({ msg: autopayErrDetail(e), kind: "err" });
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-muted-foreground">
          {isLoading
            ? t("modules.autopay.loading")
            : t("modules.autopay.scheduleCount", { count: rows.length })}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {t("modules.autopay.actions.refresh")}
          </Button>
          <Button
            size="sm"
            onClick={onNew}
            className="gap-2"
          >
            <Plus className="size-3.5" />
            {t("modules.autopay.actions.newSchedule")}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("modules.autopay.table.name")}</TableHead>
              <TableHead>{t("modules.autopay.table.bank")}</TableHead>
              <TableHead>{t("modules.autopay.table.account")}</TableHead>
              <TableHead className="text-right">{t("modules.autopay.table.amount")}</TableHead>
              <TableHead>{t("modules.autopay.table.state")}</TableHead>
              <TableHead>{t("modules.autopay.table.next")}</TableHead>
              <TableHead>{t("modules.autopay.table.last")}</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Table-shaped skeleton mirrors the 8 columns so the swap to real
              // data is seamless — gentle pulse + fade-in.
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`s-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell>
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="mt-1.5 h-2.5 w-20" />
                  </TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell><Skeleton className="size-8 rounded-md ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <ListChecks className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {t("modules.autopay.empty.schedules")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("modules.autopay.empty.schedulesHint")}
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((s, i) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer hover:bg-accent/30 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  onClick={() => onOpen(s.id)}
                >
                  <TableCell>
                    <div className="font-medium">{s.name || "—"}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.category_label}
                    </div>
                  </TableCell>
                  <TableCell>{s.bank_provider_label}</TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">
                      {s.sender_account_number || "—"}
                    </div>
                    {s.receiver_account_number && (
                      <div className="text-xs text-muted-foreground">
                        → {s.receiver_account_number}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {t("modules.autopay.amountSum", { amount: money(s.amount) })}
                  </TableCell>
                  <TableCell>{activeBadge(s.is_active)}</TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {formatTs(s.next_run_at)}
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {formatTs(s.last_run_at)}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <RowMenu
                      row={s}
                      onEdit={() => onEdit(s)}
                      onRun={() => handleRun(s)}
                      onToggle={() => handleToggle(s)}
                      onDelete={() => onDelete(s)}
                      busyRun={run.isPending && run.variables === s.id}
                      busyToggle={toggle.isPending && toggle.variables === s.id}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---- History view ----------------------------------------------------------

const STATUS_FILTER_VALUES: string[] = ["all", "success", "error", "skipped"];

const PAGE_SIZE = 25;

function HistoryView({
  companyId,
  onOpen,
  onOpenSchedule,
}: {
  companyId: number;
  onOpen: (id: number) => void;
  onOpenSchedule: (id: number) => void;
}) {
  const { t } = useTranslation();
  const statusBadge = useStatusBadge();
  const [statusFilter, setStatusFilterRaw] = useUrlState("status", "all");
  const [page, setPage] = useUrlNumber("page", 1);
  const setStatusFilter = (v: string) => { setStatusFilterRaw(v); setPage(1); };

  const skip = (page - 1) * PAGE_SIZE;
  const status = statusFilter === "all" ? undefined : statusFilter;
  const { data, isLoading, isFetching, refetch } = useAutopayHistory(
    companyId,
    { status, skip, limit: PAGE_SIZE },
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <SearchIcon className="size-4 text-muted-foreground" />
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_VALUES.map((v) => (
                <SelectItem key={v} value={v}>
                  {t(`modules.autopay.statusFilter.${v}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">
            {isLoading
              ? t("modules.autopay.loading")
              : t("modules.autopay.entryCount", { count: total })}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="gap-2"
        >
          <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
          {t("modules.autopay.actions.refresh")}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("modules.autopay.historyTable.date")}</TableHead>
              <TableHead>{t("modules.autopay.historyTable.schedule")}</TableHead>
              <TableHead className="text-right">{t("modules.autopay.table.amount")}</TableHead>
              <TableHead>{t("modules.autopay.table.state")}</TableHead>
              <TableHead>{t("modules.autopay.historyTable.paymentId")}</TableHead>
              <TableHead>{t("modules.autopay.historyTable.error")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              // Table-shaped skeleton mirrors the 6 columns for a seamless swap.
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`h-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell>
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="mt-1.5 h-2.5 w-20" />
                  </TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-32" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={6} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <History className="size-7 text-muted-foreground" />
                    </div>
                    <div className="text-sm font-medium text-foreground">
                      {t("modules.autopay.empty.history")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {t("modules.autopay.empty.historyHint")}
                    </div>
                    {statusFilter !== "all" && (
                      <Button variant="outline" size="sm" onClick={() => { setStatusFilter("all"); setPage(1); }}>
                        {t("modules.autopay.statusFilter.all")}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((h, i) => (
                <TableRow
                  key={h.id}
                  className="cursor-pointer hover:bg-accent/30 animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                  style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  onClick={() => onOpen(h.id)}
                >
                  <TableCell className="text-xs whitespace-nowrap">
                    {formatTs(h.created_at)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      className="h-auto flex-col items-start gap-0 p-0 text-left font-normal hover:bg-transparent [&:hover_.sch-name]:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (h.schedule_id) onOpenSchedule(h.schedule_id);
                      }}
                    >
                      <div className="sch-name font-medium">
                        {h.schedule_name || "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {h.payment_type_label}
                      </div>
                    </Button>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {t("modules.autopay.amountSum", { amount: money(h.amount) })}
                  </TableCell>
                  <TableCell>{statusBadge(h.status)}</TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">
                      {h.payment_number || h.payment_id || "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    {h.error_message ? (
                      <span
                        className="text-xs text-destructive line-clamp-2"
                        title={h.error_message}
                      >
                        {h.error_message}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <div className="text-muted-foreground">
            {t("modules.autopay.pagination.pageOf", { page, total: pageCount })}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(Math.max(1, page - 1))}
              className="gap-1"
            >
              <ChevronLeft className="size-3.5" /> {t("modules.autopay.actions.prev")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage(Math.min(pageCount, page + 1))}
              className="gap-1"
            >
              {t("modules.autopay.actions.next")} <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Settings view (placeholder) ------------------------------------------

function SettingsView() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-card p-8 space-y-2">
      <div className="text-lg font-medium">{t("modules.autopay.settings.title")}</div>
      <p className="text-sm text-muted-foreground">{t("modules.autopay.settings.lineWrites")}</p>
      <p className="text-sm text-muted-foreground">{t("modules.autopay.settings.lineDispatcher")}</p>
    </div>
  );
}

// ---- Schedule detail sheet -------------------------------------------------

function ScheduleDetailSheet({
  id,
  onClose,
}: {
  id: number | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const activeBadge = useActiveBadge();
  const { data, isLoading } = useAutopaySchedule(id);
  const s: AutopaySchedule | undefined = data;
  const hasData = !!s && !!s.id;

  return (
    <Sheet open={id != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <CreditCard className="size-5" />
            {t("modules.autopay.detail.scheduleTitle")}
          </SheetTitle>
        </SheetHeader>

        <Reveal
          loading={isLoading}
          skeleton={
            <div className="mt-6 space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          }
        >
        {!hasData ? (
          <div className="mt-6 text-muted-foreground text-sm">
            {t("modules.autopay.detail.scheduleNotFound")}
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <div>
              <div className="text-xl font-semibold">{s!.name || "—"}</div>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                {activeBadge(s!.is_active)}
                <Badge variant="muted">{s!.category_label}</Badge>
                <Badge variant="outline">{s!.payment_type_label}</Badge>
              </div>
            </div>

            <Section title={t("modules.autopay.detail.scheduleSection")}>
              <DetailRow k={t("modules.autopay.detail.bank")} v={s!.bank_provider_label} />
              <DetailRow k={t("modules.autopay.detail.recurrence")} v={s!.interval_label} />
              <DetailRow k={t("modules.autopay.detail.nextRun")} v={formatTs(s!.next_run_at)} />
              <DetailRow k={t("modules.autopay.detail.lastRun")} v={formatTs(s!.last_run_at)} />
              <DetailRow
                k={t("modules.autopay.detail.fired")}
                v={t("modules.autopay.detail.firedTimes", { count: s!.occurrences_fired })}
              />
              <DetailRow k={t("modules.autopay.detail.timezone")} v={s!.timezone || "—"} />
            </Section>

            <Section title={t("modules.autopay.detail.companyAndSender")}>
              <DetailRow k={t("modules.autopay.detail.company")} v={s!.company_name || "—"} />
              <DetailRow k={t("modules.autopay.detail.inn")} v={s!.company_inn || "—"} />
              <DetailRow
                k={t("modules.autopay.detail.senderBranch")}
                v={s!.sender_branch || "—"}
                mono
              />
              <DetailRow
                k={t("modules.autopay.detail.senderAccount")}
                v={s!.sender_account_number || "—"}
                mono
              />
              {s!.card_number && (
                <DetailRow k={t("modules.autopay.detail.cardNumber")} v={s!.card_number} mono />
              )}
            </Section>

            <Section title={t("modules.autopay.detail.receiverSection")}>
              <DetailRow k={t("modules.autopay.detail.receiver")} v={s!.receiver_name || "—"} />
              <DetailRow k={t("modules.autopay.detail.innPinfl")} v={s!.receiver_inn_or_pinfl || "—"} mono />
              <DetailRow
                k={t("modules.autopay.detail.bankBranch")}
                v={s!.receiver_branch || "—"}
                mono
              />
              <DetailRow
                k={t("modules.autopay.detail.accountNumber")}
                v={s!.receiver_account_number || "—"}
                mono
              />
            </Section>

            <Section title={t("modules.autopay.detail.amountAndPurpose")}>
              <DetailRow
                k={t("modules.autopay.detail.amount")}
                v={t("modules.autopay.amountSum", { amount: money(s!.amount) })}
                emphasize
              />
              <DetailRow k={t("modules.autopay.detail.purposeCode")} v={s!.payment_purpose_code || "—"} />
              <DetailRow
                k={t("modules.autopay.detail.paymentPurpose")}
                v={s!.payment_purpose || "—"}
              />
              {s!.description && (
                <DetailRow k={t("modules.autopay.detail.description")} v={s!.description} />
              )}
            </Section>

            {(s!.budget_inn || s!.budget_name || s!.budget_account_number) && (
              <Section title={t("modules.autopay.detail.budgetReceiver")}>
                <DetailRow k={t("modules.autopay.detail.inn")} v={s!.budget_inn || "—"} mono />
                <DetailRow k={t("modules.autopay.detail.name")} v={s!.budget_name || "—"} />
                <DetailRow
                  k={t("modules.autopay.detail.accountNumber")}
                  v={s!.budget_account_number || "—"}
                  mono
                />
              </Section>
            )}
          </div>
        )}
        </Reveal>
      </SheetContent>
    </Sheet>
  );
}

// ---- History detail sheet --------------------------------------------------

function HistoryDetailSheet({
  id,
  onClose,
}: {
  id: number | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const statusBadge = useStatusBadge();
  const { data, isLoading } = useAutopayHistoryEntry(id);
  const h: AutopayHistoryEntry | undefined = data;
  const hasData = !!h && !!h.id;

  const bankResponse = useMemo(() => {
    if (!h?.raw_response) return null;
    try {
      return JSON.parse(h.raw_response);
    } catch {
      return null;
    }
  }, [h?.raw_response]);

  return (
    <Sheet open={id != null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="size-5" />
            {t("modules.autopay.detail.paymentTitle")}
          </SheetTitle>
        </SheetHeader>

        <Reveal
          loading={isLoading}
          skeleton={
            <div className="mt-6 space-y-3">
              <Skeleton className="h-6 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-24 w-full" />
            </div>
          }
        >
        {!hasData ? (
          <div className="mt-6 text-muted-foreground text-sm">
            {t("modules.autopay.detail.entryNotFound")}
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <div>
              <div className="text-xl font-semibold">
                {h!.schedule_name || "—"}
              </div>
              <div className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                {statusBadge(h!.status)}
                {h!.category_label && (
                  <Badge variant="muted">{h!.category_label}</Badge>
                )}
                <Badge variant="outline">{h!.payment_type_label}</Badge>
              </div>
            </div>

            <Section title={t("modules.autopay.detail.sendSection")}>
              <DetailRow k={t("modules.autopay.detail.time")} v={formatTs(h!.created_at)} />
              <DetailRow k={t("modules.autopay.detail.paymentType")} v={h!.payment_type_label} />
              {h!.amount > 0 && (
                <DetailRow
                  k={t("modules.autopay.detail.amount")}
                  v={t("modules.autopay.amountSum", { amount: money(h!.amount) })}
                  emphasize
                />
              )}
              {h!.payment_number && (
                <DetailRow k={t("modules.autopay.detail.paymentNumber")} v={h!.payment_number} mono />
              )}
              {h!.payment_id && (
                <DetailRow k={t("modules.autopay.detail.paymentIdLabel")} v={h!.payment_id} mono />
              )}
              {h!.payroll_id && (
                <>
                  <DetailRow k={t("modules.autopay.detail.payrollId")} v={h!.payroll_id} mono />
                  {h!.employee_count != null && (
                    <DetailRow
                      k={t("modules.autopay.detail.employeeCount")}
                      v={String(h!.employee_count)}
                    />
                  )}
                </>
              )}
            </Section>

            <Section title={t("modules.autopay.detail.companyAndParties")}>
              <DetailRow k={t("modules.autopay.detail.company")} v={h!.company_name || "—"} />
              {h!.company_inn && (
                <DetailRow k={t("modules.autopay.detail.inn")} v={h!.company_inn} mono />
              )}
              {h!.receiver_name && (
                <DetailRow k={t("modules.autopay.detail.receiver")} v={h!.receiver_name} />
              )}
              {h!.receiver_inn && (
                <DetailRow k={t("modules.autopay.detail.innPinfl")} v={h!.receiver_inn} mono />
              )}
              <DetailRow k={t("modules.autopay.detail.bank")} v={h!.bank_provider_label} />
            </Section>

            {h!.payment_purpose && (
              <Section title={t("modules.autopay.detail.paymentPurpose")}>
                <div className="text-sm whitespace-pre-wrap break-words">
                  {h!.payment_purpose}
                </div>
              </Section>
            )}

            {h!.error_message && (
              <Section title={t("modules.autopay.detail.errorSection")}>
                <div className="text-sm text-destructive whitespace-pre-wrap break-words font-mono">
                  {h!.error_message}
                </div>
              </Section>
            )}

            {bankResponse && (
              <Section title={t("modules.autopay.detail.bankResponse")}>
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto whitespace-pre-wrap break-words max-h-80">
                  {JSON.stringify(bankResponse, null, 2)}
                </pre>
              </Section>
            )}
          </div>
        )}
        </Reveal>
      </SheetContent>
    </Sheet>
  );
}

// ---- shared ----------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

// 3-dot menu rendered per schedule row. Mirrors the cloud's "..." button — edit
// / run-now / toggle / delete. Popover anchors below the kebab so it works
// inside an overflow-hidden table cell.
function RowMenu({
  row, onEdit, onRun, onToggle, onDelete, busyRun, busyToggle,
}: {
  row: AutopaySchedule;
  onEdit: () => void;
  onRun: () => void;
  onToggle: () => void;
  onDelete: () => void;
  busyRun: boolean;
  busyToggle: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  function pick(fn: () => void) {
    return () => { setOpen(false); fn(); };
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          title={t("modules.autopay.actions.actionsMenu")}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVertical className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        <Button
          variant="ghost"
          className="flex w-full h-auto justify-start gap-2 px-2 py-1.5 text-sm font-normal hover:bg-accent text-left"
          onClick={pick(onEdit)}
        >
          <Pencil className="size-3.5" /> {t("modules.autopay.actions.edit")}
        </Button>
        <Button
          variant="ghost"
          className="flex w-full h-auto justify-start gap-2 px-2 py-1.5 text-sm font-normal hover:bg-accent text-left"
          onClick={pick(onRun)}
          disabled={busyRun}
        >
          <Play className="size-3.5" /> {t("modules.autopay.actions.run")}
        </Button>
        <Button
          variant="ghost"
          className="flex w-full h-auto justify-start gap-2 px-2 py-1.5 text-sm font-normal hover:bg-accent text-left"
          onClick={pick(onToggle)}
          disabled={busyToggle}
        >
          <Power className="size-3.5" />
          {row.is_active
            ? t("modules.autopay.actions.stop")
            : t("modules.autopay.actions.activate")}
        </Button>
        <Button
          variant="ghost"
          className="flex w-full h-auto justify-start gap-2 px-2 py-1.5 text-sm font-normal hover:bg-accent text-left text-destructive hover:text-destructive"
          onClick={pick(onDelete)}
        >
          <Trash2 className="size-3.5" /> {t("modules.autopay.actions.delete")}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
