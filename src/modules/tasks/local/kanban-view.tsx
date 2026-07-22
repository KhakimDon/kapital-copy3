import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays, Check, ChevronDown, Loader2, MoreHorizontal, Paperclip, Plus, Trash2, UserPlus, X, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { SmartImage } from "@/components/ui/smart-image";
import { useResolvedSrc } from "@/shared/files/media";
import { filesFromClipboard, isImage, makeAttachment } from "./attachments";
import type { Attachment } from "./model";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import { useTasksStore } from "./store";
import {
  CATEGORY_META, PRIORITIES, PRIORITY_META, SWATCHES, type Card, type CardConfig, type Column,
  type ColumnCategory, type Member, type Priority, type Project, type Swimlane, type TaskPermission,
} from "./model";
import { canMoveTo } from "./perms";
import { TaskCard } from "./task-card";
import { MemberPicker, PriorityIcon } from "./pieces";
import { MemberAvatar, resolveMember } from "./util";
import type { TFunction } from "i18next";

// How many cards to render per column before lazy-loading more on scroll.
const WINDOW_PAGE = 12;

type Counts = { comments: Map<string, number>; subtasks: Map<string, number>; watching: Set<string> };
type Lane = {
  key: string;
  label: string;
  color?: string;
  cards: Card[];
  // Leading visual for the lane header: a member avatar (assignee grouping), a
  // priority glyph (priority grouping), or a filled bolt (epic grouping).
  member?: Member;
  priority?: Priority;
  epic?: boolean;
};

/** Partition cards into horizontal swimlanes by the chosen dimension. */
function lanesFor(
  swimlane: Swimlane,
  cards: Card[],
  epics: { id: string; title: string; color: string }[],
  members: Member[],
  t: TFunction,
): Lane[] {
  const bucket = (keyOf: (c: Card) => string) => {
    const m = new Map<string, Card[]>();
    for (const c of cards) {
      const k = keyOf(c);
      (m.get(k) ?? m.set(k, []).get(k)!).push(c);
    }
    return m;
  };
  if (swimlane === "epic") {
    const m = bucket((c) => c.epicId ?? "");
    const lanes: Lane[] = [];
    for (const e of epics) if (m.has(e.id)) lanes.push({ key: e.id, label: e.title, color: e.color, cards: m.get(e.id)!, epic: true });
    if (m.has("")) lanes.push({ key: "none", label: t("modules.tasks.epic.none", { defaultValue: "Epik yo'q" }), cards: m.get("")!, epic: true });
    return lanes;
  }
  if (swimlane === "assignee") {
    const m = bucket((c) => c.assigneeIds[0] ?? "");
    const lanes: Lane[] = [];
    for (const mem of members) if (m.has(mem.id)) lanes.push({ key: mem.id, label: mem.name, cards: m.get(mem.id)!, member: mem });
    if (m.has("")) lanes.push({ key: "none", label: t("modules.tasks.unassigned", { defaultValue: "Tayinlanmagan" }), cards: m.get("")! });
    return lanes;
  }
  if (swimlane === "priority") {
    const m = bucket((c) => c.priority);
    return PRIORITIES.filter((p) => m.has(p)).map((p) => ({
      key: p,
      label: t(PRIORITY_META[p].labelKey, { defaultValue: PRIORITY_META[p].label }),
      color: PRIORITY_META[p].color,
      cards: m.get(p)!,
      priority: p,
    }));
  }
  return [{ key: "all", label: "", cards }];
}

export function KanbanView({
  project,
  columns,
  cards,
  members,
  config,
  counts,
  query,
  swimlane = "none",
  perms,
  myRole = "member",
  onOpen,
}: {
  project: Project;
  columns: Column[];
  cards: Card[];
  members: Member[];
  config: CardConfig;
  counts: Counts;
  query: string;
  swimlane?: Swimlane;
  perms?: Set<TaskPermission>;
  myRole?: string;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const moveCard = useTasksStore((s) => s.moveCard);
  const addColumn = useTasksStore((s) => s.addColumn);
  const reorderColumns = useTasksStore((s) => s.reorderColumns);
  const epics = useTasksStore((s) => s.epics);

  const [dragCard, setDragCard] = useState<string | null>(null);
  const [over, setOver] = useState<{ col: string; index: number } | null>(null);
  const [dragCol, setDragCol] = useState<string | null>(null);
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [collapsedLanes, setCollapsedLanes] = useState<Set<string>>(new Set());
  const toggleLane = (k: string) =>
    setCollapsedLanes((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  const canCreate = !perms || perms.has("create");
  const mayMoveTo = (col: Column | undefined) => canMoveTo(col, myRole, perms ?? new Set(["move"]));

  const total = cards.length;
  const cardsInCol = (colId: string) =>
    cards.filter((c) => c.columnId === colId).sort((a, b) => a.order - b.order);

  const bodyRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Compute the insertion index in `colId` from the pointer Y.
  const indexFromPointer = (colId: string, clientY: number): number => {
    const body = bodyRefs.current[colId];
    if (!body) return 0;
    const cardEls = [...body.querySelectorAll<HTMLElement>("[data-card]")];
    for (let i = 0; i < cardEls.length; i++) {
      const r = cardEls[i].getBoundingClientRect();
      if (clientY < r.top + r.height / 2) return i;
    }
    return cardEls.length;
  };

  const onColBodyDragOver = (colId: string, e: React.DragEvent) => {
    if (!dragCard) return;
    e.preventDefault();
    setOver({ col: colId, index: indexFromPointer(colId, e.clientY) });
  };

  const onColDrop = (colId: string, e: React.DragEvent) => {
    e.preventDefault();
    const targetCol = columns.find((c) => c.id === colId);
    if (dragCard && mayMoveTo(targetCol)) {
      const index = over?.col === colId ? over.index : cardsInCol(colId).length;
      moveCard(dragCard, colId, index);
    }
    setDragCard(null);
    setOver(null);
  };

  // column reorder (drop a column header onto another)
  const onColHeaderDrop = (targetId: string) => {
    if (!dragCol || dragCol === targetId) return;
    const ordered = columns.map((c) => c.id);
    const from = ordered.indexOf(dragCol);
    const to = ordered.indexOf(targetId);
    ordered.splice(from, 1);
    ordered.splice(to, 0, dragCol);
    reorderColumns(project.id, ordered);
    setDragCol(null);
  };

  // ── swimlane layout: shared column headers on top, collapsible group bands ──
  if (swimlane !== "none") {
    const lanes = lanesFor(swimlane, cards, epics, members, t);
    return (
      <div className="overflow-x-auto pb-3 -mx-1 px-1 min-h-[60vh]">
        <div className="min-w-max space-y-2">
          {/* column headers (once) */}
          <div className="flex gap-3">
            {columns.map((col) => {
              const n = cardsInCol(col.id).length;
              return (
                <div key={col.id} className="w-[300px] shrink-0 rounded-t-xl bg-muted/40">
                  <ColumnHeader
                    col={col}
                    count={n}
                    pct={total ? Math.round((n / total) * 100) : 0}
                    overLimit={col.wipLimit != null && n > col.wipLimit}
                    onDragStart={() => {}}
                    onDragEnd={() => {}}
                  />
                </div>
              );
            })}
          </div>
          {lanes.map((lane) => {
            const collapsed = collapsedLanes.has(lane.key);
            return (
              <div key={lane.key} className="rounded-xl border bg-muted/20">
                <button type="button" onClick={() => toggleLane(lane.key)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", collapsed && "-rotate-90")} />
                  {lane.member ? (
                    <MemberAvatar member={lane.member} size={20} />
                  ) : lane.priority ? (
                    <PriorityIcon priority={lane.priority} />
                  ) : lane.epic ? (
                    <Zap className="size-4 shrink-0" style={{ color: lane.color || "#8b5cf6", fill: lane.color || "#8b5cf6" }} />
                  ) : lane.color ? (
                    <span className="size-2.5 rounded-full" style={{ background: lane.color }} />
                  ) : null}
                  <span className="text-sm font-semibold">{lane.label}</span>
                  <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">{lane.cards.length}</span>
                </button>
                {!collapsed && (
                  <div className="flex gap-3 px-2 pb-2">
                    {columns.map((col) => {
                      const list = lane.cards.filter((c) => c.columnId === col.id).sort((a, b) => a.order - b.order);
                      const cellKey = `${lane.key}::${col.id}`;
                      const isOver = over?.col === cellKey;
                      return (
                        <div
                          key={col.id}
                          onDragOver={(e) => { if (dragCard) { e.preventDefault(); setOver({ col: cellKey, index: 0 }); } }}
                          onDrop={(e) => { e.preventDefault(); if (dragCard && mayMoveTo(col)) moveCard(dragCard, col.id, cardsInCol(col.id).length); setDragCard(null); setOver(null); }}
                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o?.col === cellKey ? null : o)); }}
                          className={cn("w-[300px] shrink-0 space-y-2 rounded-lg p-1 min-h-[56px] transition-colors", isOver && "bg-primary/5")}
                        >
                          {list.map((card, i) => (
                            <div key={card.id} data-card>
                              <TaskCard
                                card={card}
                                project={project}
                                members={members}
                                config={config}
                                query={query}
                                commentCount={counts.comments.get(card.id) ?? 0}
                                subtaskCount={counts.subtasks.get(card.id) ?? 0}
                                watching={counts.watching.has(card.id)}
                                onOpen={() => onOpen(card.id)}
                                onOpenId={onOpen}
                                onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", card.id); setDragCard(card.id); }}
                                onDragEnd={() => { setDragCard(null); setOver(null); }}
                                dragging={dragCard === card.id}
                                index={i}
                              />
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 min-h-[60vh]">
      {columns.map((col) => {
        const list = cardsInCol(col.id);
        const pct = total ? Math.round((list.length / total) * 100) : 0;
        const overLimit = col.wipLimit != null && list.length > col.wipLimit;
        const isOver = over?.col === col.id;
        return (
          <div
            key={col.id}
            onDragOver={(e) => dragCol && e.preventDefault()}
            onDrop={() => onColHeaderDrop(col.id)}
            className={cn(
              "flex w-[300px] shrink-0 flex-col rounded-xl bg-muted/40",
              dragCol === col.id && "opacity-50",
            )}
          >
            <ColumnHeader
              col={col}
              count={list.length}
              pct={pct}
              overLimit={overLimit}
              onDragStart={() => setDragCol(col.id)}
              onDragEnd={() => setDragCol(null)}
            />

            <ColumnBody
              col={col}
              list={list}
              project={project}
              members={members}
              config={config}
              counts={counts}
              query={query}
              canCreate={canCreate}
              isOver={isOver}
              overIndex={isOver ? over!.index : -1}
              dragCard={dragCard}
              registerRef={(el) => { bodyRefs.current[col.id] = el; }}
              onDragOver={(e) => onColBodyDragOver(col.id, e)}
              onDrop={(e) => onColDrop(col.id, e)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver((o) => (o?.col === col.id ? null : o));
              }}
              onCardDragStart={(id, e) => {
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", id);
                setDragCard(id);
              }}
              onCardDragEnd={() => { setDragCard(null); setOver(null); }}
              onOpen={onOpen}
            />
          </div>
        );
      })}

      {/* add column */}
      <div className="w-[300px] shrink-0">
        {addingCol ? (
          <div className="rounded-xl border border-dashed p-2">
            <Input
              autoFocus
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newColName.trim()) { addColumn(project.id, newColName.trim()); setNewColName(""); }
                if (e.key === "Escape") { setAddingCol(false); setNewColName(""); }
              }}
              placeholder={t("modules.tasks.columns.namePlaceholder", { defaultValue: "Ustun nomi…" })}
              className="h-8 text-sm"
            />
            <div className="mt-2 flex gap-1.5">
              <Button
                size="sm"
                className="h-7"
                onClick={() => { if (newColName.trim()) { addColumn(project.id, newColName.trim()); setNewColName(""); } }}
              >
                {t("modules.tasks.columns.add", { defaultValue: "Qo'shish" })}
              </Button>
              <Button size="sm" variant="ghost" className="h-7" onClick={() => { setAddingCol(false); setNewColName(""); }}>
                <X className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAddingCol(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed py-2.5 text-sm text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <Plus className="size-4" />
            {t("modules.tasks.columns.addColumn", { defaultValue: "Ustun qo'shish" })}
          </button>
        )}
      </div>
    </div>
  );
}

function DropLine() {
  return <div className="h-0.5 rounded-full bg-primary my-1 animate-in fade-in-0 duration-150" />;
}

// ── column body: windowed card list (renders WINDOW_PAGE at a time, more on
// scroll) so a 100+ card column doesn't render everything up front. While a
// search is active the window is bypassed so every match (even far down) shows.
function ColumnBody({
  col, list, project, members, config, counts, query, canCreate = true,
  isOver, overIndex, dragCard,
  registerRef, onDragOver, onDrop, onDragLeave, onCardDragStart, onCardDragEnd, onOpen,
}: {
  col: Column;
  list: Card[];
  project: Project;
  members: Member[];
  config: CardConfig;
  counts: Counts;
  query: string;
  canCreate?: boolean;
  isOver: boolean;
  overIndex: number;
  dragCard: string | null;
  registerRef: (el: HTMLDivElement | null) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onCardDragStart: (id: string, e: React.DragEvent) => void;
  onCardDragEnd: () => void;
  onOpen: (id: string) => void;
}) {
  const [visible, setVisible] = useState(WINDOW_PAGE);
  const searching = query.trim().length > 0;
  const sentinelRef = useRef<HTMLDivElement>(null);
  // `registerRef` is an inline prop (new identity every render) — keep it in a
  // latest-ref so `setBodyRef` stays stable.
  const registerRefLatest = useRef(registerRef);
  registerRefLatest.current = registerRef;
  const setBodyRef = useCallback((el: HTMLDivElement | null) => {
    registerRefLatest.current(el);
  }, []);

  const shown = searching ? list : list.slice(0, visible);
  const hiddenCount = list.length - shown.length;

  // Reveal the next page when the sentinel scrolls near the viewport.
  useEffect(() => {
    if (searching) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) setVisible((v) => (v < list.length ? v + WINDOW_PAGE : v)); },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [searching, list.length]);

  return (
    <div
      ref={setBodyRef}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      className={cn("flex-1 space-y-2 px-2 pb-2 min-h-[80px] rounded-b-xl transition-colors", isOver && "bg-primary/5")}
    >
      {shown.map((card, i) => (
        <div key={card.id} data-card>
          {isOver && overIndex === i && <DropLine />}
          <TaskCard
            card={card}
            project={project}
            members={members}
            config={config}
            query={query}
            commentCount={counts.comments.get(card.id) ?? 0}
            subtaskCount={counts.subtasks.get(card.id) ?? 0}
            watching={counts.watching.has(card.id)}
            onOpen={() => onOpen(card.id)}
            onOpenId={onOpen}
            onDragStart={(e) => onCardDragStart(card.id, e)}
            onDragEnd={onCardDragEnd}
            dragging={dragCard === card.id}
            index={i}
          />
        </div>
      ))}
      {isOver && overIndex >= shown.length && <DropLine />}

      {!searching && hiddenCount > 0 && (
        <div ref={sentinelRef} className="py-1.5 text-center text-xs text-muted-foreground">
          +{hiddenCount}
        </div>
      )}

      {canCreate && <QuickAdd projectId={project.id} columnId={col.id} members={members} />}
    </div>
  );
}

// ── column header (name + count/percent + menu) ─────────────────────────────
function ColumnHeader({
  col,
  count,
  pct,
  overLimit,
  onDragStart,
  onDragEnd,
}: {
  col: Column;
  count: number;
  pct: number;
  overLimit: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const { t } = useTranslation();
  const update = useTasksStore((s) => s.updateColumn);
  const remove = useTasksStore((s) => s.deleteColumn);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(col.name);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="group flex items-center gap-1.5 px-2.5 py-2 cursor-grab active:cursor-grabbing"
    >
      <span className="size-2 rounded-full shrink-0" style={{ background: col.color }} />
      {editing ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { update(col.id, { name: name.trim() || col.name }); setEditing(false); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { update(col.id, { name: name.trim() || col.name }); setEditing(false); }
            if (e.key === "Escape") { setName(col.name); setEditing(false); }
          }}
          className="h-6 px-1 py-0 text-sm font-semibold"
        />
      ) : (
        <span
          className="text-sm font-semibold truncate cursor-text"
          onDoubleClick={() => { setName(col.name); setEditing(true); }}
        >
          {col.name}
        </span>
      )}
      <span className={cn("text-xs tabular-nums", overLimit ? "text-destructive font-semibold" : "text-muted-foreground")}>
        {count}
        {col.wipLimit != null && `/${col.wipLimit}`}
        <span className="opacity-60"> · {pct}%</span>
      </span>
      <span className="flex-1" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-muted-foreground hover:bg-foreground/10 transition-opacity">
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => { setName(col.name); setEditing(true); }}>
            {t("modules.tasks.columns.rename", { defaultValue: "Nomini o'zgartirish" })}
          </DropdownMenuItem>

          <DropdownMenuLabel className="pt-2">{t("modules.tasks.columns.color", { defaultValue: "Rang" })}</DropdownMenuLabel>
          <div className="flex flex-wrap gap-1.5 px-2 pb-1.5">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => update(col.id, { color: c })}
                className="size-5 rounded-full ring-offset-1 ring-offset-background hover:ring-2 hover:ring-foreground/30"
                style={{ background: c }}
              >
                {col.color === c && <Check className="size-3 text-white mx-auto" />}
              </button>
            ))}
          </div>

          <DropdownMenuLabel className="pt-1">{t("modules.tasks.columns.category", { defaultValue: "Bosqich" })}</DropdownMenuLabel>
          {(Object.keys(CATEGORY_META) as ColumnCategory[]).map((cat) => (
            <DropdownMenuItem key={cat} onClick={() => update(col.id, { category: cat })} className="gap-2">
              <span className="flex-1">{t(CATEGORY_META[cat].labelKey, { defaultValue: CATEGORY_META[cat].label })}</span>
              {col.category === cat && <Check className="size-3.5 opacity-70" />}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <WipMenuItem col={col} />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => remove(col.id)}
            className="text-destructive focus:text-destructive gap-2"
          >
            <Trash2 className="size-4" />
            {t("modules.tasks.columns.delete", { defaultValue: "Ustunni o'chirish" })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function WipMenuItem({ col }: { col: Column }) {
  const { t } = useTranslation();
  const update = useTasksStore((s) => s.updateColumn);
  const [val, setVal] = useState(col.wipLimit != null ? String(col.wipLimit) : "");
  return (
    <div className="px-2 py-1.5">
      <div className="text-xs font-medium text-muted-foreground mb-1">
        {t("modules.tasks.columns.wip", { defaultValue: "WIP limiti" })}
      </div>
      <Input
        value={val}
        onChange={(e) => setVal(e.target.value.replace(/\D/g, ""))}
        onBlur={() => update(col.id, { wipLimit: val ? Number(val) : null })}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="—"
        className="h-7 text-sm"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── quick add (inline card create: title + assignee + due + paste/attach image) ──
function QuickThumb({ att, onRemove, removeLabel }: { att: Attachment; onRemove: () => void; removeLabel: string }) {
  const { src } = useResolvedSrc(att.thumbUrl ?? att.url);
  return (
    <div className="relative size-11 shrink-0 overflow-hidden rounded-md border bg-muted">
      {isImage(att) && src ? (
        <SmartImage src={src} alt={att.name} className="size-full" rounded="rounded-md" />
      ) : (
        <div className="grid size-full place-items-center px-0.5 text-center text-[9px] leading-tight text-muted-foreground">
          {att.name.slice(0, 8)}
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        title={removeLabel}
        aria-label={removeLabel}
        className="absolute right-0.5 top-0.5 rounded bg-black/55 p-0.5 text-white hover:bg-black/75"
      >
        <X className="size-3" />
      </button>
    </div>
  );
}

function QuickAdd({ projectId, columnId, members }: { projectId: string; columnId: string; members: Member[] }) {
  const { t } = useTranslation();
  const createCard = useTasksStore((s) => s.createCard);
  const project = useTasksStore((s) => s.projects.find((p) => p.id === projectId));
  const companyId = project?.companyId ?? 0;
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [due, setDue] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => { setTitle(""); setAssignee(null); setDue(""); setAttachments([]); setCover(null); };

  // Paste or pick images/files → attach to the new card (first image = cover).
  // Uploads to the Files module (thumbnail ref, no base64) when the project has
  // a company; otherwise inlines a data: URL so it still works offline.
  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setPasting(true);
    try {
      const uploadTo = companyId > 0 ? { companyId, folder: ["Tasks", project?.name || "General"] } : null;
      const built = await Promise.all(files.map((f) => makeAttachment(f, uploadTo)));
      setAttachments((prev) => {
        const next = [...prev, ...built];
        if (!cover) { const firstImg = next.find(isImage); if (firstImg) setCover(firstImg.id); }
        return next;
      });
    } finally {
      setPasting(false);
    }
  };

  const submit = (keepOpen: boolean) => {
    const v = title.trim();
    if (!v && !attachments.length) return;
    createCard({
      projectId,
      columnId,
      title: v || (attachments[0]?.name ?? "…"),
      assigneeIds: assignee ? [assignee] : undefined,
      dueDate: due || null,
      attachments: attachments.length ? attachments : undefined,
      cover: cover ?? undefined,
    });
    reset();
    if (!keepOpen) setOpen(false);
  };

  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground transition-colors"
      >
        <Plus className="size-4" />
        {t("modules.tasks.quickAdd", { defaultValue: "Vazifa yaratish" })}
      </button>
    );

  const assigneeMember = assignee ? resolveMember(members, assignee) : undefined;

  return (
    <div
      className="rounded-xl border bg-card p-2 animate-in fade-in-0 zoom-in-95 duration-150"
      onPaste={(e) => {
        const fs = filesFromClipboard(e);
        if (fs.length) { e.preventDefault(); void addFiles(fs); }
      }}
    >
      <textarea
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(true); }
          if (e.key === "Escape") { reset(); setOpen(false); }
        }}
        placeholder={t("modules.tasks.quickAddPlaceholder", { defaultValue: "Sarlavha kiriting, Enter — saqlash…" })}
        rows={2}
        className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />

      {(attachments.length > 0 || pasting) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {attachments.map((a) => (
            <QuickThumb
              key={a.id}
              att={a}
              removeLabel={t("common.delete", { defaultValue: "O'chirish" })}
              onRemove={() => {
                setAttachments((prev) => prev.filter((x) => x.id !== a.id));
                setCover((c) => (c === a.id ? null : c));
              }}
            />
          ))}
          {pasting && (
            <div className="flex size-11 items-center justify-center rounded-md border text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          )}
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <MemberPicker
          members={members}
          selected={assignee ? [assignee] : []}
          single
          onToggle={(id) => setAssignee((v) => (v === id ? null : id))}
          title={t("modules.tasks.fields.assignee", { defaultValue: "Mas'ul" })}
          trigger={
            <button
              type="button"
              title={assigneeMember?.name ?? t("modules.tasks.unassigned", { defaultValue: "Tayinlanmagan" })}
              className="inline-flex h-7 items-center gap-1 rounded-md border px-1.5 text-xs text-muted-foreground hover:bg-muted"
            >
              {assigneeMember ? <MemberAvatar member={assigneeMember} size={18} /> : <UserPlus className="size-3.5" />}
            </button>
          }
        />
        <div className="[&_button]:h-7 [&_button]:text-xs">
          <DatePicker value={due} onChange={setDue} className="h-7 text-xs" placeholder={t("modules.tasks.fields.due", { defaultValue: "Muddat" })} />
        </div>
        {due && <CalendarDays className="size-3 text-muted-foreground -ml-0.5" />}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          title={t("modules.tasks.attach", { defaultValue: "Rasm biriktirish (yoki qo'ying)" })}
          className="inline-flex h-7 items-center gap-1 rounded-md border px-1.5 text-xs text-muted-foreground hover:bg-muted"
        >
          <Paperclip className="size-3.5" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files || []);
            e.target.value = "";
            if (fs.length) void addFiles(fs);
          }}
        />
        <span className="flex-1" />
        <Button size="sm" className="h-7" onMouseDown={(e) => e.preventDefault()} onClick={() => submit(true)} disabled={pasting}>
          {t("modules.tasks.actions.add", { defaultValue: "Qo'shish" })}
        </Button>
      </div>
    </div>
  );
}
