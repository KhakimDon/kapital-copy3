/**
 * Avtohujjat (Autodoc) — POC native module.
 *
 * Mirrors cloud aiba_integration/autodoc.{php,js} read-side surface:
 *   - Jadvallar (schedules table)
 *   - Tarix    (run history table with status filter + pagination)
 *   - Sozlamalar (placeholder card — cron/payload edit is owned by cloud-os)
 *
 * Schedule detail opens inline as a right-side Sheet (no route nav, so the
 * left section list stays anchored).
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUrlNumber, useUrlState } from "@/shared/hooks/use-url-state";
import {
  FilePlus,
  CalendarClock,
  History as HistoryIcon,
  Settings,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Building2,
  Tag,
  FileText,
  CalendarDays,
  Repeat,
  CheckCircle2,
  XCircle,
  Hash,
  ExternalLink,
  Plus,
  MoreVertical,
  Pencil,
  Play,
  Power,
  Trash2,
  Loader2,
} from "lucide-react";

import { useCompany } from "@/shared/store/company";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/ui/reveal";
import {
  ModuleShell,
  type ModuleSection,
} from "@/components/ui/module-shell";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useSchedules,
  useSchedule,
  useHistory,
  useDeleteSchedule,
  useRunSchedule,
  useToggleSchedule,
  money,
  fmtDate,
  fmtDateTime,
  statusMeta,
  activeMeta,
  type HistoryStatus,
} from "./api";
import { ScheduleForm } from "./schedule-form";

type SectionKey = "schedules" | "history" | "settings";

const PAGE = 50;

export function AutodocPage() {
  const { t } = useTranslation();
  const SECTIONS: ModuleSection[] = [
    {
      key: "schedules",
      label: t("modules.autodoc.sections.schedules"),
      icon: <CalendarClock className="size-4" />,
    },
    {
      key: "history",
      label: t("modules.autodoc.sections.history"),
      icon: <HistoryIcon className="size-4" />,
    },
    {
      key: "settings",
      label: t("modules.autodoc.sections.settings"),
      icon: <Settings className="size-4" />,
    },
  ];
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? 0;
  const [sectionRaw, setSectionRaw] = useUrlState("section", "schedules");
  const section = sectionRaw as SectionKey;
  const [openId, setOpenId] = useState<number | null>(null);

  // Form sheet — used for both create + edit. `formMode` distinguishes them.
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [formScheduleId, setFormScheduleId] = useState<number | null>(null);

  // Confirm-delete dialog state.
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  function openCreate() {
    setFormMode("create");
    setFormScheduleId(null);
    setFormOpen(true);
  }
  function openEdit(id: number) {
    setFormMode("edit");
    setFormScheduleId(id);
    setFormOpen(true);
  }

  if (!company) {
    return (
      <ModuleShell
        sections={SECTIONS}
        active={section}
        onSelect={(k) => setSectionRaw(k)}
        title={t("modules.autodoc.title")}
        icon={<FilePlus className="size-6 text-primary" />}
        subtitle={t("modules.autodoc.subtitle")}
      >
        <EmptyCard text={t("modules.autodoc.empty.selectCompany")} />
      </ModuleShell>
    );
  }

  return (
    <>
      <ModuleShell
        sections={SECTIONS}
        active={section}
        onSelect={(k) => setSectionRaw(k)}
        title={t("modules.autodoc.title")}
        icon={<FilePlus className="size-6 text-primary" />}
        subtitle={company.name}
      >
        {section === "schedules" && (
          <SchedulesSection
            companyId={companyId}
            onOpen={(id) => setOpenId(id)}
            onCreate={openCreate}
            onEdit={openEdit}
            onDelete={(id) => setConfirmDeleteId(id)}
          />
        )}
        {section === "history" && <HistorySection companyId={companyId} />}
        {section === "settings" && <SettingsSection />}
      </ModuleShell>

      <ScheduleSheet
        id={openId}
        open={openId !== null}
        onClose={() => setOpenId(null)}
      />

      <ScheduleForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        mode={formMode}
        scheduleId={formScheduleId}
        companyId={companyId}
        companyName={company.name}
        companyInn={company.inn}
      />

      <ConfirmDeleteDialog
        scheduleId={confirmDeleteId}
        onClose={() => setConfirmDeleteId(null)}
      />
    </>
  );
}

// ── Schedules ────────────────────────────────────────────────────────────────
function SchedulesSection({
  companyId,
  onOpen,
  onCreate,
  onEdit,
  onDelete,
}: {
  companyId: number;
  onOpen: (id: number) => void;
  onCreate: () => void;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading, isFetching, refetch } = useSchedules(companyId);
  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>
            {t("modules.autodoc.stats.total")}: <span className="font-medium text-foreground">{data?.total ?? 0}</span>
          </span>
          <span className="text-border">·</span>
          <span>
            {t("modules.autodoc.stats.active")}: <span className="font-medium text-success">{data?.active ?? 0}</span>
          </span>
          <span className="text-border">·</span>
          <span>
            {t("modules.autodoc.stats.inactive")}:{" "}
            <span className="font-medium text-muted-foreground">
              {data?.inactive ?? 0}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`size-4 ${isFetching ? "animate-spin" : ""}`}
            />
            {t("modules.autodoc.actions.refresh")}
          </Button>
          <Button size="sm" onClick={onCreate}>
            <Plus className="size-4" />
            {t("modules.autodoc.actions.newSchedule")}
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("modules.autodoc.columns.name")}</TableHead>
              <TableHead>{t("modules.autodoc.columns.type")}</TableHead>
              <TableHead>{t("modules.autodoc.columns.status")}</TableHead>
              <TableHead>{t("modules.autodoc.columns.interval")}</TableHead>
              <TableHead>{t("modules.autodoc.columns.nextRun")}</TableHead>
              <TableHead>{t("modules.autodoc.columns.lastRun")}</TableHead>
              <TableHead className="text-right">{t("modules.autodoc.columns.sum")}</TableHead>
              <TableHead className="w-[40px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell>
                    <div className="space-y-1.5">
                      <Skeleton className="h-3.5 w-40" />
                      <Skeleton className="h-2.5 w-24" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                  <TableCell className="w-[40px]"><Skeleton className="size-4 rounded-md" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <CalendarClock className="size-7 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">{t("modules.autodoc.empty.noSchedules")}</div>
                      <div className="text-xs text-muted-foreground">{t("modules.autodoc.empty.noSchedulesHint")}</div>
                    </div>
                    <Button size="sm" onClick={onCreate} className="mt-1">
                      <Plus className="size-4" />
                      {t("modules.autodoc.actions.createFirst")}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((s, i) => {
                const am = activeMeta(s.is_active);
                return (
                  <TableRow
                    key={s.id}
                    className="group animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <TableCell
                      className="max-w-[280px] cursor-pointer"
                      onClick={() => onOpen(s.id)}
                    >
                      <div className="font-medium truncate">{s.name}</div>
                      {s.buyer_name && (
                        <div className="text-xs text-muted-foreground truncate">
                          {s.buyer_name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell onClick={() => onOpen(s.id)} className="cursor-pointer">
                      <Badge variant="muted">{s.doc_type_label}</Badge>
                    </TableCell>
                    <TableCell onClick={() => onOpen(s.id)} className="cursor-pointer">
                      <Badge variant={am.variant}>{am.label}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground cursor-pointer" onClick={() => onOpen(s.id)}>
                      {s.interval_label}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm cursor-pointer" onClick={() => onOpen(s.id)}>
                      {fmtDateTime(s.next_run_at)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm cursor-pointer" onClick={() => onOpen(s.id)}>
                      {fmtDateTime(s.last_run_at)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums cursor-pointer" onClick={() => onOpen(s.id)}>
                      {money(s.total_sum)}
                    </TableCell>
                    <TableCell className="w-[40px]">
                      <RowActions
                        scheduleId={s.id}
                        isActive={s.is_active}
                        onEdit={() => onEdit(s.id)}
                        onDelete={() => onDelete(s.id)}
                      />
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

// ── Row actions menu ────────────────────────────────────────────────────────
function RowActions({
  scheduleId,
  isActive,
  onEdit,
  onDelete,
}: {
  scheduleId: number;
  isActive: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const runMut = useRunSchedule();
  const toggleMut = useToggleSchedule();
  const [notice, setNotice] = useState<string | null>(null);

  async function handleRun() {
    setNotice(null);
    try {
      const r = await runMut.mutateAsync({ id: scheduleId });
      // The dispatcher lives in cloud-os; we only nudged next_run_at. Surface
      // that so the user knows it's queued, not executed inline.
      setNotice(
        r.note === "dispatcher unavailable"
          ? t("modules.autodoc.notices.queuedDispatcher")
          : t("modules.autodoc.notices.queued")
      );
    } catch (e) {
      setNotice(extractErr(e, t));
    } finally {
      setOpen(false);
    }
  }

  async function handleToggle() {
    setNotice(null);
    try {
      await toggleMut.mutateAsync({ id: scheduleId });
    } catch (e) {
      setNotice(extractErr(e, t));
    } finally {
      setOpen(false);
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => e.stopPropagation()}
            aria-label={t("modules.autodoc.actions.actions")}
          >
            <MoreVertical className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-56 p-1">
          <MenuItem
            icon={<Pencil className="size-4" />}
            label={t("modules.autodoc.actions.edit")}
            onClick={() => {
              onEdit();
              setOpen(false);
            }}
          />
          <MenuItem
            icon={
              runMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )
            }
            label={t("modules.autodoc.actions.runNow")}
            onClick={handleRun}
            disabled={runMut.isPending}
          />
          <MenuItem
            icon={
              toggleMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Power className="size-4" />
              )
            }
            label={isActive ? t("modules.autodoc.actions.disable") : t("modules.autodoc.actions.enable")}
            onClick={handleToggle}
            disabled={toggleMut.isPending}
          />
          <div className="my-1 h-px bg-border" />
          <MenuItem
            icon={<Trash2 className="size-4 text-destructive" />}
            label={t("modules.autodoc.actions.delete")}
            onClick={() => {
              onDelete();
              setOpen(false);
            }}
            destructive
          />
        </PopoverContent>
      </Popover>
      {notice && (
        <div className="absolute right-12 mt-1 z-50 rounded-md border border-border bg-card px-3 py-1.5 text-xs shadow-md">
          {notice}
          <Button
            variant="ghost"
            onClick={() => setNotice(null)}
            className="ml-2 inline h-auto p-0 align-baseline text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            ×
          </Button>
        </div>
      )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full h-auto justify-start gap-2 px-2.5 py-1.5 text-sm font-normal ${
        destructive
          ? "text-destructive hover:bg-destructive/10 hover:text-destructive"
          : "hover:bg-muted hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </Button>
  );
}

// ── Confirm delete dialog ───────────────────────────────────────────────────
function ConfirmDeleteDialog({
  scheduleId,
  onClose,
}: {
  scheduleId: number | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const deleteMut = useDeleteSchedule();
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    if (!scheduleId) return;
    setErr(null);
    try {
      await deleteMut.mutateAsync({ id: scheduleId });
      onClose();
    } catch (e) {
      setErr(extractErr(e, t));
    }
  }

  return (
    <Dialog
      open={scheduleId !== null}
      onOpenChange={(o) => !o && onClose()}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("modules.autodoc.confirmDelete.title")}</DialogTitle>
          <DialogDescription>
            {t("modules.autodoc.confirmDelete.description")}
          </DialogDescription>
        </DialogHeader>
        {err && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {err}
          </div>
        )}
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={deleteMut.isPending}
          >
            {t("modules.autodoc.actions.cancel")}
          </Button>
          <Button
            variant="destructive"
            onClick={confirm}
            disabled={deleteMut.isPending}
          >
            {deleteMut.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            {t("modules.autodoc.actions.delete")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function extractErr(e: unknown, t: (k: string) => string): string {
  const anyE = e as {
    response?: { data?: { detail?: string; error?: string } };
    message?: string;
  };
  return (
    anyE.response?.data?.detail ||
    anyE.response?.data?.error ||
    anyE.message ||
    t("modules.autodoc.errors.generic")
  );
}

// ── History ──────────────────────────────────────────────────────────────────
function HistorySection({ companyId }: { companyId: number }) {
  const { t } = useTranslation();
  const STATUS_CHIPS: { value: HistoryStatus; labelKey: string }[] = [
    { value: "all", labelKey: "modules.autodoc.historyChips.all" },
    { value: "success", labelKey: "modules.autodoc.historyChips.success" },
    { value: "error", labelKey: "modules.autodoc.historyChips.error" },
  ];
  const [statusRaw, setStatusRaw] = useUrlState("status", "all");
  const status = statusRaw as HistoryStatus;
  const [page, setPage] = useUrlNumber("page", 0);

  const filters = useMemo(
    () => ({ status, skip: page * PAGE, limit: PAGE }),
    [status, page]
  );
  const { data, isLoading, isFetching, refetch } = useHistory(
    companyId,
    filters
  );
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const counts = data?.status_counts ?? {};
  const pages = Math.max(1, Math.ceil(total / PAGE));

  function pickStatus(s: HistoryStatus) {
    setStatusRaw(s);
    setPage(0);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {STATUS_CHIPS.map((c) => {
            const active = status === c.value;
            const badge =
              c.value === "success"
                ? counts.success ?? 0
                : c.value === "error"
                  ? counts.error ?? 0
                  : (counts.success ?? 0) + (counts.error ?? 0);
            return (
              <Button
                key={c.value}
                variant="outline"
                onClick={() => pickStatus(c.value)}
                className={`h-auto gap-1.5 px-3 py-1.5 text-sm font-normal ${
                  active
                    ? "border-primary bg-primary/10 text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(c.labelKey)}
                <span className="text-xs text-muted-foreground">{badge}</span>
              </Button>
            );
          })}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw
            className={`size-4 ${isFetching ? "animate-spin" : ""}`}
          />
          {t("modules.autodoc.actions.refresh")}
        </Button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("modules.autodoc.historyColumns.date")}</TableHead>
              <TableHead>{t("modules.autodoc.historyColumns.schedule")}</TableHead>
              <TableHead>{t("modules.autodoc.columns.type")}</TableHead>
              <TableHead>{t("modules.autodoc.columns.status")}</TableHead>
              <TableHead>{t("modules.autodoc.historyColumns.docId")}</TableHead>
              <TableHead>{t("modules.autodoc.historyColumns.error")}</TableHead>
              <TableHead className="text-right">{t("modules.autodoc.columns.sum")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={`sk-${i}`} className="hover:bg-transparent animate-in fade-in-0 duration-300">
                  <TableCell><Skeleton className="h-3.5 w-28" /></TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      <Skeleton className="h-3.5 w-36" />
                      <Skeleton className="h-2.5 w-20" />
                    </div>
                  </TableCell>
                  <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-3.5 w-40" /></TableCell>
                  <TableCell className="text-right"><Skeleton className="h-3.5 w-20 ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : items.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-16">
                  <div className="flex flex-col items-center justify-center gap-3 text-center animate-in fade-in-50 zoom-in-95 duration-300">
                    <div className="size-14 rounded-full bg-muted grid place-items-center">
                      <HistoryIcon className="size-7 text-muted-foreground" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-medium text-foreground">{t("modules.autodoc.empty.noHistory")}</div>
                      <div className="text-xs text-muted-foreground">{t("modules.autodoc.empty.noHistoryHint")}</div>
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              items.map((h, i) => {
                const sm = statusMeta(h.status);
                return (
                  <TableRow
                    key={h.id}
                    className="animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300"
                    style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                  >
                    <TableCell className="whitespace-nowrap text-sm">
                      {fmtDateTime(h.created_at)}
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate font-medium">
                        {h.schedule_name || `#${h.schedule_id ?? "—"}`}
                      </div>
                      {h.buyer_name && (
                        <div className="text-xs text-muted-foreground truncate">
                          {h.buyer_name}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="muted">{h.doc_type_label}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={sm.variant}>{sm.label}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {h.doc_id || "—"}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="text-xs text-destructive line-clamp-2">
                        {h.error_message || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {money(h.total_sum)}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {page * PAGE + 1}–{Math.min((page + 1) * PAGE, total)} / {total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 0}
              onClick={() => setPage(Math.max(0, page - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="px-2">
              {page + 1} / {pages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= pages}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Settings (placeholder) ───────────────────────────────────────────────────
function SettingsSection() {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-card p-8">
      <div className="flex flex-col items-center gap-3 text-center text-muted-foreground">
        <Settings className="size-8 opacity-40" />
        <div className="text-sm font-medium text-foreground">
          {t("modules.autodoc.settings.unavailableTitle")}
        </div>
        <p className="text-sm max-w-md">
          {t("modules.autodoc.settings.unavailableHint")}
        </p>
      </div>
    </div>
  );
}

// ── Schedule Sheet ───────────────────────────────────────────────────────────
function ScheduleSheet({
  id,
  open,
  onClose,
}: {
  id: number | null;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useSchedule(id);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-5 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <FilePlus className="size-5 text-primary" />
            {isLoading ? t("modules.autodoc.loading") : data ? data.name : t("modules.autodoc.empty.noData")}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <Reveal
            loading={isLoading}
            skeleton={
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </div>
            }
            className="space-y-5"
          >
          {!data ? (
            <div className="text-sm text-muted-foreground">
              {t("modules.autodoc.empty.noData")}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="muted">{data.doc_type_label}</Badge>
                {(() => {
                  const am = activeMeta(data.is_active);
                  return <Badge variant={am.variant}>{am.label}</Badge>;
                })()}
                {data.with_act && (
                  <Badge variant="info">{t("modules.autodoc.detail.withAct")}</Badge>
                )}
              </div>

              <Section title={t("modules.autodoc.detail.sectionMain")}>
                <Field
                  icon={<Repeat className="size-4" />}
                  label={t("modules.autodoc.columns.interval")}
                  value={data.interval_label}
                />
                <Field
                  icon={<CalendarDays className="size-4" />}
                  label={t("modules.autodoc.columns.nextRun")}
                  value={fmtDateTime(data.next_run_at)}
                />
                <Field
                  icon={<CalendarDays className="size-4" />}
                  label={t("modules.autodoc.columns.lastRun")}
                  value={fmtDateTime(data.last_run_at)}
                />
                <Field
                  icon={<CalendarDays className="size-4" />}
                  label={t("modules.autodoc.detail.createdAt")}
                  value={fmtDateTime(data.created_at)}
                />
              </Section>

              <Section title={t("modules.autodoc.detail.sectionContent")}>
                <Field
                  icon={<FileText className="size-4" />}
                  label={t("modules.autodoc.fields.product")}
                  value={data.product_name}
                />
                <Field
                  icon={<Hash className="size-4" />}
                  label={t("modules.autodoc.fields.quantity")}
                  value={money(data.quantity)}
                />
                <Field
                  icon={<Hash className="size-4" />}
                  label={t("modules.autodoc.fields.price")}
                  value={money(data.unit_price)}
                />
                <Field
                  icon={<Hash className="size-4" />}
                  label={t("modules.autodoc.columns.sum")}
                  value={money(data.total_sum)}
                />
                <Field
                  icon={<Tag className="size-4" />}
                  label={t("modules.autodoc.fields.mxik")}
                  value={
                    data.mxik_code
                      ? `${data.mxik_code}${data.mxik_name ? ` · ${data.mxik_name}` : ""}`
                      : null
                  }
                />
                <Field
                  icon={<Tag className="size-4" />}
                  label={t("modules.autodoc.fields.package")}
                  value={
                    data.package_code
                      ? `${data.package_code}${data.package_name ? ` · ${data.package_name}` : ""}`
                      : null
                  }
                />
                <Field
                  icon={<Tag className="size-4" />}
                  label={t("modules.autodoc.fields.vat")}
                  value={
                    data.has_vat
                      ? `${t("modules.autodoc.fields.vatYes")}${data.vat_rate != null ? ` · ${data.vat_rate}%` : ""}`
                      : t("modules.autodoc.fields.vatNo")
                  }
                />
              </Section>

              <Section title={t("modules.autodoc.detail.sectionParties")}>
                <Field
                  icon={<Building2 className="size-4" />}
                  label={t("modules.autodoc.fields.seller")}
                  value={
                    data.company_name
                      ? `${data.company_name}${data.company_inn ? ` (${data.company_inn})` : ""}`
                      : null
                  }
                />
                <Field
                  icon={<Building2 className="size-4" />}
                  label={t("modules.autodoc.fields.buyer")}
                  value={
                    data.buyer_name
                      ? `${data.buyer_name}${data.buyer_tin ? ` (${data.buyer_tin})` : ""}`
                      : null
                  }
                />
                <Field
                  icon={<FileText className="size-4" />}
                  label={t("modules.autodoc.fields.contract")}
                  value={
                    data.contract_no
                      ? `№${data.contract_no} · ${fmtDate(data.contract_date)}`
                      : null
                  }
                />
                <Field
                  icon={<FileText className="size-4" />}
                  label={t("modules.autodoc.fields.invoice")}
                  value={
                    data.factura_no
                      ? `№${data.factura_no} · ${fmtDate(data.factura_date)}`
                      : null
                  }
                />
              </Section>

              <Section title={t("modules.autodoc.detail.sectionRecent")}>
                {data.recent_history.length === 0 ? (
                  <div className="text-xs text-muted-foreground">
                    {t("modules.autodoc.detail.noRecent")}
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {data.recent_history.map((h) => {
                      const sm = statusMeta(h.status);
                      return (
                        <li
                          key={h.id}
                          className="flex items-start gap-2 rounded-md border border-border p-2"
                        >
                          <span className="mt-0.5">
                            {h.status === "success" ? (
                              <CheckCircle2 className="size-4 text-success" />
                            ) : (
                              <XCircle className="size-4 text-destructive" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 text-xs">
                              <span className="text-muted-foreground">
                                {fmtDateTime(h.created_at)}
                              </span>
                              <Badge variant={sm.variant}>{sm.label}</Badge>
                            </div>
                            {h.doc_id && (
                              <div className="mt-1 flex items-center gap-1 text-xs font-mono break-all">
                                <ExternalLink className="size-3 shrink-0" />
                                {h.doc_id}
                              </div>
                            )}
                            {h.error_message && (
                              <div className="mt-1 text-xs text-destructive line-clamp-3">
                                {h.error_message}
                              </div>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>
            </>
          )}
          </Reveal>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Tiny UI primitives ───────────────────────────────────────────────────────
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="space-y-2.5">{children}</div>
    </div>
  );
}

function Field({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | number | null;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <span className="mt-0.5 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="break-words">{value == null || value === "" ? "—" : value}</div>
      </div>
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
      {text}
    </div>
  );
}
