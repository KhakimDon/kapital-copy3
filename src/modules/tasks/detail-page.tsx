/**
 * TaskDetailPage — full-page (NOT a Sheet) cloud-parity rebuild of the cloud
 * aiba_tasks task-detail modal (templates/index.php #aiba-task-detail-modal +
 * js/tasks.js openDetail / saveDetail / comments / attachments / activity).
 *
 * Layout: DetailPage (left 380px sidebar of <DetailCard>s + right main viewer).
 *   LEFT sidebar:
 *     (1) Header card — title (inline-editable), status / priority badges,
 *         assignee, due-date, save / delete actions
 *     (2) Meta card — created at / created by / updated / source / version
 *   MAIN (right):
 *     Tabs — Tavsif (description textarea) · Izohlar (thread + add) ·
 *            Fayllar (raw-body upload + list) · Tarix (activity / lifecycle)
 *
 * Data flow mirrors the existing TaskDetail Sheet (we kept all hooks) — the
 * Sheet was simply replaced by a full route. Reads use the existing useTasks
 * list query first (already cached when the user came from the board);
 * a per-task useTask() is also wired for direct deep-link / refresh.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useUrlState } from "@/shared/hooks/use-url-state";
import i18n from "@/shared/i18n";
import {
  AlertTriangle,
  CalendarDays,
  Download,
  FileText,
  History,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  Trash2,
  Upload,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetailCard, DetailPage, DetailRow } from "@/components/ui/detail-page";
import { Reveal, FadeIn } from "@/components/ui/reveal";

import { useCompany } from "@/shared/store/company";
import {
  useTasks, useTask, useMembers, useComments, useAttachments,
  useUpdateTask, useDeleteTask,
  useAddComment, useDeleteComment, useUploadAttachment, useDeleteAttachment,
  downloadAttachmentUrl,
} from "./api";
import {
  STATUSES, PRIORITY_LABEL_KEY, PRIORITY_VARIANT, STATUS_LABEL_KEY,
  assigneeLabel, type Task, type TaskPriority, type TaskStatus, type Member,
} from "./types";

// ── small utils (mirrors page.tsx helpers) ────────────────────────────────────
const initial = (s?: string | null) => {
  const t = (s || "").trim();
  return t ? t.charAt(0).toUpperCase() : "?";
};
const COLORS = ["#f97316", "#0ea5e9", "#10b981", "#a855f7", "#ec4899", "#eab308", "#3b82f6", "#14b8a6", "#ef4444", "#8b5cf6"];
const colorFor = (name?: string | null) => {
  let h = 0;
  const s = String(name || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffffffff;
  return COLORS[Math.abs(h) % COLORS.length];
};
const fmtStamp = (iso?: string | null) => (iso || "").slice(0, 16).replace("T", " ");
const fmtDay = (iso?: string | null) => (iso || "").slice(0, 10);
const fmtSize = (n?: number | null) => {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return (i === 0 ? v : v.toFixed(1)) + " " + u[i];
};
const errMsg = (e: unknown) => {
  const d = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof d === "string" ? d : (e as Error)?.message || i18n.t("modules.tasks.errors.generic");
};

function Avatar({ name, photo, size = 24 }: { name?: string | null; photo?: string | null; size?: number }) {
  const px = `${size}px`;
  if (photo)
    return (
      <img
        src={photo}
        alt={name || ""}
        title={name || ""}
        className="rounded-full object-cover shrink-0"
        style={{ width: px, height: px }}
      />
    );
  return (
    <span
      className="rounded-full inline-flex items-center justify-center text-white font-medium shrink-0"
      style={{ width: px, height: px, fontSize: size * 0.42, background: colorFor(name) }}
      title={name || ""}
    >
      {initial(name)}
    </span>
  );
}

// ── shared field wrapper ──────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
type DetailTab = "description" | "comments" | "attachments" | "history";

export function TaskDetailPage() {
  const { t: tr } = useTranslation();
  const { id: taskId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const companyId = useCompany((s) => s.current)?.id ?? null;

  // Prefer the cached board list (peer-shared between routes); fall back to
  // single-task GET when the user lands here directly (refresh / bookmark).
  const { data: list } = useTasks(companyId);
  const fromList = useMemo(
    () => list?.items?.find((t) => t.id === taskId) ?? null,
    [list, taskId],
  );
  const { data: single, isLoading: singleLoading, error: singleErr } =
    useTask(companyId, !fromList ? (taskId ?? null) : null);
  const task: Task | null = fromList ?? single ?? null;
  const isLoading = !task && (singleLoading || !list);

  const { data: members } = useMembers(companyId);
  const update = useUpdateTask();
  const del = useDeleteTask();

  // editable fields, seeded from the task each time taskId changes
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState("");
  const [due, setDue] = useState("");
  const [err, setErr] = useState("");
  const [tabRaw, setTab] = useUrlState("tab", "description");
  const tab = tabRaw as DetailTab;

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDesc(task.description || "");
      setStatus(task.status);
      setPriority(task.priority);
      setAssignee(task.assignee_user_id || "");
      setDue(fmtDay(task.due_at));
      setErr("");
    }
  }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => navigate("/tasks");

  const save = () => {
    if (!task || !companyId || !title.trim()) return;
    setErr("");
    update.mutate(
      {
        companyId, taskId: task.id, version: task.version,
        body: {
          title: title.trim(),
          description: desc,
          status, priority,
          assignee_user_id: assignee || null,
          due_at: due || null,
        },
      },
      { onError: (e) => setErr(errMsg(e)) },
    );
  };

  const remove = () => {
    if (!task || !companyId) return;
    if (!confirm(tr("modules.tasks.confirmDelete"))) return;
    setErr("");
    del.mutate(
      { companyId, taskId: task.id, version: task.version },
      { onSuccess: back, onError: (e) => setErr(errMsg(e)) },
    );
  };

  // ── No company / not-found guards ────────────────────────────────────────────
  if (!companyId) {
    return (
      <DetailPage backTo="/tasks" backLabel={tr("modules.tasks.title")} sidebar={null}>
        <div className="m-6 rounded-lg border bg-card p-8 text-center text-muted-foreground">
          {tr("modules.tasks.detail.pickCompany")}
        </div>
      </DetailPage>
    );
  }

  if (!isLoading && !task) {
    return (
      <DetailPage backTo="/tasks" backLabel={tr("modules.tasks.title")} sidebar={null}>
        <div className="m-6 rounded-lg border bg-card p-8 text-center text-muted-foreground">
          {singleErr ? errMsg(singleErr) : tr("modules.tasks.detail.notFound")}
        </div>
      </DetailPage>
    );
  }

  // ── Sidebar ──────────────────────────────────────────────────────────────────
  // loading → skeleton; not-loading-but-no-data (fetch failed) → empty, since the
  // main content area already renders the error/not-found state above (never hang).
  const sidebar = isLoading ? (
    <SidebarSkeleton />
  ) : !task ? null : (
    <FadeIn className="space-y-4">
      {/* (1) Header card — title + status/priority + assignee + due + actions */}
      <DetailCard>
        <div className="space-y-3">
          <Field label={tr("modules.tasks.fields.title")}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="font-medium"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label={tr("modules.tasks.fields.status")}>
              <Select value={status} onValueChange={(v) => setStatus(v as TaskStatus)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{tr(s.labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={tr("modules.tasks.fields.priority")}>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["low", "medium", "high", "urgent"] as TaskPriority[]).map((p) => (
                    <SelectItem key={p} value={p}>{tr(PRIORITY_LABEL_KEY[p])}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label={tr("modules.tasks.fields.assignee")}>
            <Select value={assignee || "none"} onValueChange={(v) => setAssignee(v === "none" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder={tr("modules.tasks.unassigned")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{tr("modules.tasks.unassigned")}</SelectItem>
                {(members?.items ?? []).map((m: Member) => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label={tr("modules.tasks.fields.due")}>
            <DatePicker value={due} onChange={(v) => setDue(v)} className="h-9" />
          </Field>

          {/* Current badge strip (live preview) */}
          <div className="flex items-center gap-1.5 flex-wrap pt-1">
            <Badge variant={status === "done" ? "success" : status === "in_progress" ? "info" : "muted"}>
              {tr(STATUS_LABEL_KEY[status])}
            </Badge>
            <Badge variant={PRIORITY_VARIANT[priority]}>{tr(PRIORITY_LABEL_KEY[priority])}</Badge>
            {assignee ? (
              <Badge variant="muted" className="gap-1">
                <Avatar
                  name={assigneeLabel(task) || members?.items?.find((m) => m.id === assignee)?.name}
                  photo={task.assignee_avatar}
                  size={14}
                />
                <span>
                  {assigneeLabel(task) || members?.items?.find((m) => m.id === assignee)?.name || "—"}
                </span>
              </Badge>
            ) : null}
            {due && (
              <Badge
                variant={
                  status !== "done" && new Date(due) < new Date() ? "danger" : "muted"
                }
                className="gap-1"
              >
                <CalendarDays className="size-3" />
                {fmtDay(due)}
              </Badge>
            )}
          </div>

          {err && (
            <div className="text-xs text-destructive flex items-center gap-1.5">
              <AlertTriangle className="size-3.5" />
              {err}
            </div>
          )}

          {/* Actions: Save + Delete (cloud has Save / Close / Delete in the modal foot) */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={save}
              disabled={!title.trim() || update.isPending}
              size="sm"
              className="flex-1 gap-1.5"
            >
              {update.isPending && <Loader2 className="size-4 animate-spin" />}
              {tr("modules.tasks.actions.save")}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={remove}
              disabled={del.isPending}
              title={tr("modules.tasks.actions.delete")}
            >
              {del.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </Button>
          </div>
        </div>
      </DetailCard>

      {/* (2) Meta card — created / by / updated / source / version */}
      <DetailCard title={tr("modules.tasks.detail.metaTitle")}>
        <dl>
          <DetailRow
            k={tr("modules.tasks.detail.creator")}
            v={
              <span className="inline-flex items-center gap-1.5">
                <Avatar name={task.creator_name} photo={task.creator_avatar} size={16} />
                <span>{task.creator_name || "—"}</span>
              </span>
            }
          />
          <DetailRow k={tr("modules.tasks.detail.created")} v={fmtStamp(task.created_at)} />
          <DetailRow k={tr("modules.tasks.detail.updated")} v={fmtStamp(task.updated_at)} />
          <DetailRow k={tr("modules.tasks.detail.completed")} v={task.completed_at ? fmtStamp(task.completed_at) : null} />
          <DetailRow k={tr("modules.tasks.detail.source")} v={<Badge variant="muted">{task.source}</Badge>} />
          <DetailRow k={tr("modules.tasks.detail.version")} v={String(task.version)} mono />
        </dl>
      </DetailCard>
    </FadeIn>
  );

  // ── Main / right viewer ──────────────────────────────────────────────────────
  return (
    <DetailPage backTo="/tasks" backLabel={tr("modules.tasks.title")} sidebar={sidebar}>
      <div className="p-6 space-y-4">
        {/* Header row — title preview + status pill (full text from sidebar input) */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold leading-tight break-words">
              {isLoading ? (
                <Skeleton className="h-8 w-72" />
              ) : (
                <span className="inline-block animate-in fade-in-0 duration-300">
                  {title || "—"}
                </span>
              )}
            </h1>
            {!isLoading && task && (
              <p className="text-sm text-muted-foreground mt-0.5 animate-in fade-in-0 duration-300">
                {tr("modules.tasks.detail.idLabel")}: <span className="font-mono">{task.id}</span>
              </p>
            )}
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)}>
          <div className="border-b border-border">
            <TabsList className="bg-transparent h-auto p-0 rounded-none gap-0 flex-wrap">
              <TabsTrigger
                value="description"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 text-sm gap-1.5"
              >
                <FileText className="size-4" /> {tr("modules.tasks.tabs.description")}
              </TabsTrigger>
              <TabsTrigger
                value="comments"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 text-sm gap-1.5"
              >
                <MessageSquare className="size-4" />
                {tr("modules.tasks.tabs.comments")}
                {task?.comments_count ? (
                  <span className="ml-1 text-xs text-muted-foreground">{task.comments_count}</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="attachments"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 text-sm gap-1.5"
              >
                <Paperclip className="size-4" />
                {tr("modules.tasks.tabs.attachments")}
                {task?.attachments_count ? (
                  <span className="ml-1 text-xs text-muted-foreground">{task.attachments_count}</span>
                ) : null}
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground data-[state=active]:border-primary border-b-2 border-transparent rounded-none px-4 py-2.5 text-sm gap-1.5"
              >
                <History className="size-4" /> {tr("modules.tasks.tabs.history")}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="description" className="mt-6">
            <DescriptionPanel value={desc} onChange={setDesc} disabled={isLoading} />
          </TabsContent>
          <TabsContent value="comments" className="mt-6">
            {task && <CommentsPanel companyId={companyId} taskId={task.id} />}
          </TabsContent>
          <TabsContent value="attachments" className="mt-6">
            {task && <AttachmentsPanel companyId={companyId} taskId={task.id} />}
          </TabsContent>
          <TabsContent value="history" className="mt-6">
            {task && <HistoryPanel task={task} />}
          </TabsContent>
        </Tabs>
      </div>
    </DetailPage>
  );
}

// ── Sidebar skeleton ──────────────────────────────────────────────────────────
function SidebarSkeleton() {
  return (
    <>
      <DetailCard>
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <div className="grid grid-cols-2 gap-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      </DetailCard>
      <DetailCard>
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}
        </div>
      </DetailCard>
    </>
  );
}

// ── Description panel ────────────────────────────────────────────────────────
function DescriptionPanel({
  value, onChange, disabled,
}: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const { t: tr } = useTranslation();
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        disabled={disabled}
        placeholder={tr("modules.tasks.detail.descriptionPlaceholder")}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {tr("modules.tasks.detail.saveHint")}
      </p>
    </div>
  );
}

// ── Comments panel (mirrors cloud comments thread) ────────────────────────────
function CommentsPanel({ companyId, taskId }: { companyId: number; taskId: string }) {
  const { t: tr } = useTranslation();
  const { data, isLoading } = useComments(companyId, taskId);
  const add = useAddComment();
  const delc = useDeleteComment();
  const [body, setBody] = useState("");
  const [err, setErr] = useState("");
  const items = data?.items ?? [];

  const send = () => {
    if (!body.trim()) return;
    setErr("");
    add.mutate(
      { companyId, taskId, body: body.trim() },
      { onSuccess: () => setBody(""), onError: (e) => setErr(errMsg(e)) },
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <Reveal
        loading={isLoading}
        skeleton={
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        }
      >
      {items.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-4">{tr("modules.tasks.comments.empty")}</div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const who = c.author_name || "—";
            return (
              <div key={c.id} className="flex gap-2 group">
                <Avatar name={who} photo={c.author_avatar} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-xs">
                    <strong className="text-foreground">{who}</strong>
                    <span className="text-muted-foreground">{fmtStamp(c.created_at)}</span>
                    <Button
                      variant="ghost"
                      onClick={() => delc.mutate({ companyId, taskId, commentId: c.id })}
                      className="ml-auto h-auto w-auto p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-transparent transition-opacity"
                      title={tr("modules.tasks.actions.delete")}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                  <div className="text-sm mt-0.5 whitespace-pre-wrap break-words">{c.body}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </Reveal>

      <div className="flex items-start gap-2 pt-1 border-t border-border">
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder={tr("modules.tasks.comments.addPlaceholder")}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
        />
        <Button size="icon" onClick={send} disabled={!body.trim() || add.isPending} className="shrink-0">
          {add.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </div>
      {err && <div className="text-xs text-destructive">{err}</div>}
    </div>
  );
}

// ── Attachments panel (raw-body upload) ──────────────────────────────────────
function AttachmentsPanel({ companyId, taskId }: { companyId: number; taskId: string }) {
  const { t: tr } = useTranslation();
  const { data, isLoading } = useAttachments(companyId, taskId);
  const up = useUploadAttachment();
  const dela = useDeleteAttachment();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState("");
  const items = data?.items ?? [];

  const onFile = (file?: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErr(tr("modules.tasks.attachments.tooLarge"));
      return;
    }
    setErr("");
    up.mutate({ companyId, taskId, file }, { onError: (e) => setErr(errMsg(e)) });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
        className={`flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed py-8 cursor-pointer transition-colors ${
          drag ? "border-primary bg-primary/5" : "border-input hover:border-primary/40"
        }`}
      >
        {up.isPending ? (
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        ) : (
          <Upload className="size-6 text-muted-foreground" />
        )}
        <span className="text-sm text-muted-foreground">{tr("modules.tasks.attachments.dropHint")}</span>
        <span className="text-xs text-muted-foreground/70">{tr("modules.tasks.attachments.maxSize")}</span>
        <Input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => { onFile(e.target.files?.[0]); e.currentTarget.value = ""; }}
        />
      </div>
      {err && <div className="text-xs text-destructive">{err}</div>}

      <Reveal
        loading={isLoading}
        skeleton={
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        }
      >
      {items.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-2">{tr("modules.tasks.attachments.empty")}</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-2 group"
            >
              <FileText className="size-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <a
                  href={downloadAttachmentUrl(companyId, taskId, a.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium hover:underline truncate block"
                >
                  {a.filename}
                </a>
                <div className="text-xs text-muted-foreground">
                  {fmtSize(a.size)}
                  {a.uploaded_by_name ? ` · ${a.uploaded_by_name}` : ""}
                  {a.created_at ? ` · ${fmtStamp(a.created_at)}` : ""}
                </div>
              </div>
              <a
                href={downloadAttachmentUrl(companyId, taskId, a.id)}
                target="_blank"
                rel="noreferrer"
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
                title={tr("modules.tasks.attachments.download")}
              >
                <Download className="size-4" />
              </a>
              <Button
                variant="ghost"
                onClick={() => {
                  if (confirm(tr("modules.tasks.attachments.confirmDelete")))
                    dela.mutate({ companyId, taskId, attachmentId: a.id });
                }}
                className="h-auto w-auto p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive hover:bg-transparent transition-opacity shrink-0"
                title={tr("modules.tasks.actions.delete")}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
      </Reveal>
    </div>
  );
}

// ── History / activity panel ─────────────────────────────────────────────────
function HistoryPanel({ task }: { task: Task }) {
  const { t: tr } = useTranslation();
  // The aiba-tasks service does NOT expose a per-task activity feed to the
  // POC backend yet; we surface the lifecycle stamps it does carry (created /
  // updated / completed). Mirrors the cloud "History" tab intent (which
  // would normally list aiba_tasks_activity rows).
  const rows: { label: string; ts: string | null; tone: "primary" | "info" | "success" }[] = [
    { label: tr("modules.tasks.history.created"), ts: task.created_at, tone: "primary" },
    { label: tr("modules.tasks.history.updated"), ts: task.updated_at, tone: "info" },
    { label: tr("modules.tasks.history.completed"), ts: task.completed_at, tone: "success" },
  ];
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="space-y-3">
        {rows.filter((r) => r.ts).map((r) => (
          <div key={r.label} className="flex items-center gap-3 text-sm">
            <span
              className={`size-2 rounded-full shrink-0 ${
                r.tone === "success" ? "bg-success"
                : r.tone === "info" ? "bg-info"
                : "bg-primary"
              }`}
            />
            <span className="font-medium">{r.label}</span>
            <span className="text-muted-foreground ml-auto font-mono text-xs">{fmtStamp(r.ts)}</span>
          </div>
        ))}
        {rows.every((r) => !r.ts) && (
          <div className="text-center text-sm text-muted-foreground py-4">{tr("modules.tasks.history.empty")}</div>
        )}
      </div>
    </div>
  );
}
