import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookText, CalendarClock, CalendarDays, Check, ChevronRight, Eye, EyeOff, GitBranch, Loader2, MoreHorizontal, Plus,
  ThumbsDown, ThumbsUp, Trash2, UserPlus, Users, X, Zap,
} from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import { useTasksStore } from "./store";
import { type Card, type CardType, type HistoryEntry } from "./model";
import { EpicSelect, LabelChip, LabelPicker, MemberPicker, PriorityBadge, PriorityMenu } from "./pieces";
import { AttachmentsSection, RichDescription } from "./attachments";
import { interceptImageClick } from "@/components/ui/lightbox";
import { useCompany } from "@/shared/store/company";
import { MemberAvatar, cardKey, fmtDateTime, relTime, resolveMember } from "./util";
import { WikiLinks } from "./wiki-link";

export function TaskDrawer({ cardId, onClose }: { cardId: string | null; onClose: () => void }) {
  const { t } = useTranslation();
  const card = useTasksStore((s) => s.cards.find((c) => c.id === cardId) ?? null);
  const loading = useTasksStore((s) => s.loading);
  return (
    <Sheet open={!!cardId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" hideClose className="p-0 sm:max-w-3xl w-full flex flex-col gap-0">
        {card ? (
          <DrawerBody card={card} onClose={onClose} />
        ) : (
          // A deep-link to a card that isn't in the loaded set (another
          // project/company, or deleted) — show a graceful state instead of a
          // blank white panel.
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            {loading ? (
              <>
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t("modules.tasks.loading", { defaultValue: "Yuklanmoqda…" })}</p>
              </>
            ) : (
              <>
                <div className="grid size-12 place-items-center rounded-full bg-muted text-2xl">🔍</div>
                <p className="text-sm text-muted-foreground">
                  {t("modules.tasks.cardNotFound", { defaultValue: "Vazifa topilmadi (boshqa loyiha/kompaniyada bo'lishi mumkin)" })}
                </p>
                <Button variant="outline" size="sm" onClick={onClose}>
                  {t("modules.tasks.actions.close", { defaultValue: "Yopish" })}
                </Button>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DrawerBody({ card, onClose }: { card: Card; onClose: () => void }) {
  const { t } = useTranslation();
  const s = useTasksStore();
  const companyId = useCompany((st) => st.current)?.id ?? null;
  const project = s.projects.find((p) => p.id === card.projectId);
  const columns = s.columns.filter((c) => c.projectId === card.projectId).sort((a, b) => a.order - b.order);
  const members = s.members;
  const me = s.currentUserId;
  const subtasks = s.cards.filter((c) => c.parentId === card.id);
  const parent = card.parentId ? s.cards.find((c) => c.id === card.parentId) : null;
  const allLabels = useMemo(
    () => [...new Set(s.cards.filter((c) => c.projectId === card.projectId).flatMap((c) => c.labels))],
    [s.cards, card.projectId],
  );
  const watching = me ? card.watcherIds.includes(me) : false;

  const [title, setTitle] = useState(card.title);
  const [editingDesc, setEditingDesc] = useState(false);

  const memberById = (id: string | null) => resolveMember(members, id);

  return (
    <>
      {/* header — status pipeline */}
      <div className="flex items-center gap-2 border-b px-4 py-2.5">
        <span className="font-mono text-xs text-muted-foreground">{project && cardKey(project, card)}</span>
        <span className="text-muted-foreground/50">·</span>
        <div className="flex items-center overflow-x-auto">
          {columns.map((col, i) => {
            const curIdx = columns.findIndex((c) => c.id === card.columnId);
            const active = col.id === card.columnId;
            const passed = curIdx > i;
            return (
              <Fragment key={col.id}>
                {i > 0 && <ChevronRight className="size-4 shrink-0 text-muted-foreground/40" />}
                <button
                  type="button"
                  onClick={() => s.moveCard(card.id, col.id, s.cards.filter((c) => c.columnId === col.id).length)}
                  className={cn(
                    "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : passed
                      ? "text-foreground/70 hover:bg-muted"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {passed && <Check className="size-3" />}
                  {col.name}
                </button>
              </Fragment>
            );
          })}
        </div>
        <span className="flex-1" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="rounded p-1 text-muted-foreground hover:bg-foreground/10"><MoreHorizontal className="size-4" /></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-destructive focus:text-destructive gap-2" onClick={() => { s.deleteCard(card.id); onClose(); }}>
              <Trash2 className="size-4" />
              {t("modules.tasks.actions.delete", { defaultValue: "O'chirish" })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-foreground/10"><X className="size-4" /></button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row overflow-hidden">
        {/* main */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {parent && (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-muted/70"
            >
              <GitBranch className="size-3" />
              {project && cardKey(project, parent)} · {parent.title}
            </button>
          )}

          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => title.trim() && title !== card.title && s.updateCard(card.id, { title: title.trim() })}
            className="w-full bg-transparent text-xl font-semibold outline-none focus:bg-muted/30 rounded px-1 -mx-1"
          />

          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">
              {t("modules.tasks.fields.description", { defaultValue: "Tavsif" })}
            </div>
            {editingDesc ? (
              <RichDescription
                docKey={card.id}
                initialHtml={card.description}
                autoFocus
                onCommit={(html) => { if (html !== card.description) s.updateCard(card.id, { description: html }); setEditingDesc(false); }}
                onAddAttachment={(a) => {
                  const patch: Partial<Card> = { attachments: [...card.attachments, a] };
                  if (!card.cover && a.mime.startsWith("image/") && !card.attachments.some((x) => x.mime.startsWith("image/"))) patch.cover = a.id;
                  s.updateCard(card.id, patch);
                }}
                placeholder={t("modules.tasks.detail.descriptionPlaceholder", { defaultValue: "Vazifa tavsifi…" })}
                uploadTo={companyId ? { companyId, folder: ["Tasks", project?.name ?? "Boshqa"] } : null}
              />
            ) : (
              <div
                onClick={() => setEditingDesc(true)}
                onClickCapture={interceptImageClick}
                className="tasks-rte min-h-[40px] cursor-text rounded-lg border px-3 py-2 text-sm transition-colors hover:border-primary/40 [&_img]:my-1 [&_img]:cursor-zoom-in [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
              >
                {card.description
                  ? <div dangerouslySetInnerHTML={{ __html: card.description }} />
                  : <span className="text-muted-foreground">{t("modules.tasks.detail.descriptionPlaceholder", { defaultValue: "Vazifa tavsifi…" })}</span>}
              </div>
            )}
          </div>

          {/* attachments — stored in the Files module under Tasks/<project>/ */}
          <AttachmentsSection
            attachments={card.attachments}
            cover={card.cover}
            onAttachmentsChange={(next) => s.updateCard(card.id, { attachments: next })}
            onCoverChange={(id) => s.updateCard(card.id, { cover: id })}
            uploadTo={companyId ? { companyId, folder: ["Tasks", project?.name ?? "Boshqa"] } : null}
          />

          {/* subtasks */}
          <Subtasks card={card} subtasks={subtasks} />

          {/* comments / history */}
          <Tabs defaultValue="comments">
            <TabsList>
              <TabsTrigger value="comments">{t("modules.tasks.tabs.comments", { defaultValue: "Izohlar" })}</TabsTrigger>
              <TabsTrigger value="history">{t("modules.tasks.tabs.history", { defaultValue: "Tarix" })}</TabsTrigger>
            </TabsList>
            <TabsContent value="comments" className="pt-3">
              <Comments cardId={card.id} />
            </TabsContent>
            <TabsContent value="history" className="pt-3">
              <History cardId={card.id} />
            </TabsContent>
          </Tabs>
        </div>

        {/* aside — meta */}
        <div className="w-full md:w-72 shrink-0 border-t md:border-t-0 md:border-l overflow-y-auto p-4 space-y-4 bg-muted/20">
          <Field label={t("modules.tasks.fields.type", { defaultValue: "Turi" })}>
            <div className="inline-flex rounded-lg border p-0.5">
              {(["task", "epic"] as CardType[]).map((ty) => (
                <button
                  key={ty}
                  onClick={() => {
                    s.updateCard(card.id, { type: ty, ...(ty === "epic" ? { epicId: null } : {}) });
                    if (s.currentCompanyId != null) s.loadEpics(s.currentCompanyId);
                  }}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors",
                    card.type === ty ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {ty === "epic" && <Zap className="size-3" />}
                  {t(`modules.tasks.type.${ty}`, { defaultValue: ty === "epic" ? "Epik" : "Vazifa" })}
                </button>
              ))}
            </div>
          </Field>

          {card.type !== "epic" && (
            <Field label={t("modules.tasks.fields.epic", { defaultValue: "Epik" })}>
              <EpicSelect
                epics={s.epics.filter((e) => e.id !== card.id)}
                value={card.epicId}
                onChange={(id) => s.updateCard(card.id, { epicId: id })}
              />
            </Field>
          )}

          <Field label={t("modules.tasks.fields.priority", { defaultValue: "Muhimlik" })}>
            <PriorityMenu value={card.priority} onChange={(p) => s.setPriority(card.id, p)}>
              <button className="flex w-full items-center justify-between rounded-lg border bg-background px-2.5 py-1.5 hover:bg-muted/50">
                <PriorityBadge priority={card.priority} />
              </button>
            </PriorityMenu>
          </Field>

          <Field label={t("modules.tasks.fields.assignee", { defaultValue: "Mas'ul" })}>
            <MemberPicker
              members={members}
              selected={card.assigneeIds}
              single
              onToggle={(id) => s.setAssignee(card.id, card.assigneeIds[0] === id ? null : id)}
              trigger={
                <button className="flex w-full items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 hover:bg-muted/50">
                  {card.assigneeIds[0] ? (
                    <><MemberAvatar member={memberById(card.assigneeIds[0])} size={20} /><span className="text-sm">{memberById(card.assigneeIds[0])?.name}</span></>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><UserPlus className="size-4" /> {t("modules.tasks.unassigned", { defaultValue: "Tayinlanmagan" })}</span>
                  )}
                </button>
              }
            />
          </Field>

          <Field label={t("modules.tasks.fields.reporter", { defaultValue: "Muallif" })}>
            <MemberPicker
              members={members}
              selected={card.reporterId ? [card.reporterId] : []}
              single
              onToggle={(id) => s.setReporter(card.id, card.reporterId === id ? null : id)}
              trigger={
                <button className="flex w-full items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 hover:bg-muted/50">
                  {card.reporterId ? (
                    <><MemberAvatar member={memberById(card.reporterId)} size={20} /><span className="text-sm">{memberById(card.reporterId)?.name}</span></>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><UserPlus className="size-4" /> —</span>
                  )}
                </button>
              }
            />
          </Field>

          <Field
            label={t("modules.tasks.fields.watchers", { defaultValue: "Kuzatuvchilar" })}
            action={
              <button
                onClick={() => me && s.toggleWatcher(card.id, me)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {watching ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {watching ? t("modules.tasks.watch.stop", { defaultValue: "Kuzatmaslik" }) : t("modules.tasks.watch.start", { defaultValue: "Kuzatish" })}
              </button>
            }
          >
            <MemberPicker
              members={members}
              selected={card.watcherIds}
              onToggle={(id) => s.toggleWatcher(card.id, id)}
              trigger={
                <button className="flex w-full items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 hover:bg-muted/50 min-h-[38px]">
                  {card.watcherIds.length === 0 ? (
                    <span className="flex items-center gap-1.5 text-sm text-muted-foreground"><Users className="size-4" /> —</span>
                  ) : (
                    <span className="flex items-center -space-x-1.5">
                      {card.watcherIds.slice(0, 5).map((id) => <MemberAvatar key={id} member={memberById(id)} size={20} ring />)}
                    </span>
                  )}
                </button>
              }
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label={<span className="inline-flex items-center gap-1"><CalendarClock className="size-3" /> {t("modules.tasks.fields.start", { defaultValue: "Boshlanish" })}</span>}>
              <DatePicker value={card.startDate ?? ""} onChange={(v) => s.setDates(card.id, { startDate: v || null })} className="h-9 w-full justify-start gap-1.5 px-2.5 [&_svg]:mr-0" />
            </Field>
            <Field label={<span className="inline-flex items-center gap-1"><CalendarDays className="size-3" /> {t("modules.tasks.fields.due", { defaultValue: "Muddat" })}</span>}>
              <DatePicker value={card.dueDate ?? ""} onChange={(v) => s.setDates(card.id, { dueDate: v || null })} className="h-9 w-full justify-start gap-1.5 px-2.5 [&_svg]:mr-0" />
            </Field>
          </div>

          <Field
            label={t("modules.tasks.fields.labels", { defaultValue: "Yorliqlar" })}
            action={
              <LabelPicker
                allLabels={allLabels}
                selected={card.labels}
                onToggle={(l) => s.toggleLabel(card.id, l)}
                trigger={<button className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"><Plus className="size-3" /> {t("modules.tasks.actions.add", { defaultValue: "Qo'shish" })}</button>}
              />
            }
          >
            <div className="flex flex-wrap gap-1">
              {card.labels.length === 0 && <span className="text-sm text-muted-foreground">—</span>}
              {card.labels.map((l) => <LabelChip key={l} label={l} onRemove={() => s.toggleLabel(card.id, l)} />)}
            </div>
          </Field>

          <Field label={<span className="inline-flex items-center gap-1"><BookText className="size-3" /> {t("modules.tasks.wiki.title", { defaultValue: "Wiki sahifalar" })}</span>}>
            <WikiLinks cardId={card.id} companyId={project?.companyId ?? null} />
          </Field>
        </div>
      </div>
    </>
  );
}

function Field({ label, children, action }: { label: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── subtasks ────────────────────────────────────────────────────────────────
function Subtasks({ card, subtasks }: { card: Card; subtasks: Card[] }) {
  const { t } = useTranslation();
  const s = useTasksStore();
  const columns = s.columns.filter((c) => c.projectId === card.projectId).sort((a, b) => a.order - b.order);
  const doneCol = columns.find((c) => c.category === "done");
  const todoCol = columns.find((c) => c.category === "todo") ?? columns[0];
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const doneCount = subtasks.filter((c) => columns.find((x) => x.id === c.columnId)?.category === "done").length;

  const isDone = (c: Card) => columns.find((x) => x.id === c.columnId)?.category === "done";

  const add = () => {
    if (!title.trim() || !todoCol) return;
    s.createCard({ projectId: card.projectId, columnId: todoCol.id, title: title.trim(), parentId: card.id });
    setTitle("");
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <GitBranch className="size-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">
          {t("modules.tasks.subtasks.title", { defaultValue: "Kichik vazifalar" })}
        </span>
        {subtasks.length > 0 && <span className="text-xs text-muted-foreground">{doneCount}/{subtasks.length}</span>}
        <span className="flex-1" />
        <button onClick={() => setAdding((v) => !v)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5">
          <Plus className="size-3" /> {t("modules.tasks.actions.add", { defaultValue: "Qo'shish" })}
        </button>
      </div>
      {subtasks.length > 0 && (
        <div className="mb-2 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${Math.round((doneCount / subtasks.length) * 100)}%` }} />
        </div>
      )}
      <div className="space-y-1">
        {subtasks.map((st) => (
          <div key={st.id} className="flex items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5">
            <button
              onClick={() => doneCol && s.moveCard(st.id, isDone(st) ? todoCol.id : doneCol.id, 0)}
              className={cn(
                "size-4 rounded border flex items-center justify-center shrink-0",
                isDone(st) ? "bg-primary border-primary text-primary-foreground" : "border-muted-foreground/40",
              )}
            >
              {isDone(st) && <span className="text-[10px]">✓</span>}
            </button>
            <span className={cn("flex-1 text-sm truncate", isDone(st) && "line-through text-muted-foreground")}>{st.title}</span>
            <button onClick={() => s.deleteCard(st.id)} className="text-muted-foreground hover:text-destructive"><X className="size-3.5" /></button>
          </div>
        ))}
      </div>
      {adding && (
        <div className="mt-1.5 flex gap-1.5">
          <Input
            autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") add(); if (e.key === "Escape") setAdding(false); }}
            placeholder={t("modules.tasks.subtasks.placeholder", { defaultValue: "Kichik vazifa nomi…" })}
            className="h-8 text-sm"
          />
          <Button size="sm" className="h-8" onClick={add}>{t("modules.tasks.actions.add", { defaultValue: "Qo'shish" })}</Button>
        </div>
      )}
    </div>
  );
}

// ── comments ────────────────────────────────────────────────────────────────
function Comments({ cardId }: { cardId: string }) {
  const { t } = useTranslation();
  const s = useTasksStore();
  const comments = s.comments.filter((c) => c.cardId === cardId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const members = s.members;
  const me = s.currentUserId;
  const [body, setBody] = useState("");
  const meMember = members.find((m) => m.id === me);

  const send = () => { if (body.trim()) { s.addComment(cardId, body); setBody(""); } };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <MemberAvatar member={meMember} size={28} />
        <div className="flex-1">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
            rows={2}
            placeholder={t("modules.tasks.comments.addPlaceholder", { defaultValue: "Izoh qo'shish…" })}
            className="w-full resize-y rounded-lg border bg-transparent px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
          {body.trim() && (
            <div className="mt-1.5">
              <Button size="sm" className="h-7" onClick={send}>{t("modules.tasks.comments.send", { defaultValue: "Yuborish" })}</Button>
            </div>
          )}
        </div>
      </div>

      {comments.length === 0 && (
        <div className="py-6 text-center text-sm text-muted-foreground">{t("modules.tasks.comments.empty", { defaultValue: "Izoh yo'q" })}</div>
      )}
      {comments.map((c) => {
        const author = members.find((m) => m.id === c.authorId);
        const likes = Object.values(c.reactions).filter((r) => r === "like").length;
        const dislikes = Object.values(c.reactions).filter((r) => r === "dislike").length;
        const myReaction = me ? c.reactions[me] : undefined;
        return (
          <div key={c.id} className="flex gap-2">
            <MemberAvatar member={author} size={28} />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{author?.name}</span>
                <span className="text-xs text-muted-foreground cursor-default" title={fmtDateTime(c.createdAt)}>{relTime(c.createdAt, t)}</span>
                {c.editedAt && <span className="text-xs text-muted-foreground/60">({t("modules.tasks.comments.edited", { defaultValue: "tahrirlangan" })})</span>}
                {c.authorId === me && (
                  <button onClick={() => s.deleteComment(c.id)} className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="size-3.5" /></button>
                )}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2 text-sm">{c.body}</div>
              <div className="mt-1 flex items-center gap-1">
                <button
                  onClick={() => s.reactComment(c.id, "like")}
                  className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-muted", myReaction === "like" && "text-primary font-medium")}
                >
                  <ThumbsUp className="size-3.5" /> {likes > 0 && likes}
                </button>
                <button
                  onClick={() => s.reactComment(c.id, "dislike")}
                  className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs hover:bg-muted", myReaction === "dislike" && "text-destructive font-medium")}
                >
                  <ThumbsDown className="size-3.5" /> {dislikes > 0 && dislikes}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── history ───────────────────────────────────────────────────────────────────
function History({ cardId }: { cardId: string }) {
  const { t } = useTranslation();
  const s = useTasksStore();
  const entries = s.history.filter((h) => h.cardId === cardId).sort((a, b) => b.at.localeCompare(a.at));
  const members = s.members;

  const text = (h: HistoryEntry): string => {
    const cat = (v?: string | null) => v || "—";
    switch (h.kind) {
      case "created": return t("modules.tasks.history.created", { defaultValue: "vazifani yaratdi" });
      case "subtask": return t("modules.tasks.history.subtask", { defaultValue: "kichik vazifa yaratdi" });
      case "moved": return t("modules.tasks.history.moved", { defaultValue: "{{from}} → {{to}}", from: cat(h.from), to: cat(h.to) });
      case "renamed": return t("modules.tasks.history.renamed", { defaultValue: "nomini o'zgartirdi" });
      case "priority": return t("modules.tasks.history.priority", { defaultValue: "muhimlikni o'zgartirdi" });
      case "assignee": return h.to ? t("modules.tasks.history.assigned", { defaultValue: "mas'ul qo'shdi" }) : t("modules.tasks.history.unassigned", { defaultValue: "mas'ulni olib tashladi" });
      case "reporter": return t("modules.tasks.history.reporter", { defaultValue: "muallifni o'zgartirdi" });
      case "due": return t("modules.tasks.history.due", { defaultValue: "muddatni belgiladi" });
      case "start": return t("modules.tasks.history.start", { defaultValue: "boshlanish sanasini belgiladi" });
      case "label": return t("modules.tasks.history.label", { defaultValue: "yorliqni o'zgartirdi" });
      case "described": return t("modules.tasks.history.described", { defaultValue: "tavsifni yangiladi" });
      case "commented": return t("modules.tasks.history.commented", { defaultValue: "izoh qoldirdi" });
      default: return h.kind;
    }
  };

  if (entries.length === 0)
    return <div className="py-6 text-center text-sm text-muted-foreground">{t("modules.tasks.history.empty", { defaultValue: "Tarix yo'q" })}</div>;

  return (
    <div className="space-y-2.5">
      {entries.map((h) => {
        const who = members.find((m) => m.id === h.userId);
        return (
          <div key={h.id} className="flex items-start gap-2 text-sm">
            <MemberAvatar member={who} size={22} />
            <div className="flex-1">
              <span className="font-medium">{who?.name ?? t("modules.tasks.system", { defaultValue: "Tizim" })}</span>{" "}
              <span className="text-muted-foreground">{text(h)}</span>
            </div>
            <span className="text-xs text-muted-foreground whitespace-nowrap cursor-default" title={fmtDateTime(h.at)}>{relTime(h.at, t)}</span>
          </div>
        );
      })}
    </div>
  );
}
