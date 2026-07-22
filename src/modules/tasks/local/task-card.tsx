import { type ReactNode, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  CalendarDays, Check, GitBranch, Link2, MessageSquare, Eye, EyeOff, Zap,
  ExternalLink, Flag, UserPlus, UserMinus, ArrowRightLeft, Copy, Trash2,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator,
  ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/shared/lib/utils";
import { PRIORITIES, PRIORITY_META, type Card, type CardConfig, type Member, type Priority, type Project } from "./model";
import { SmartImage } from "@/components/ui/smart-image";
import { useResolvedSrc } from "@/shared/files/media";
import { LottieIcon } from "@/components/ui/lottie-icon";
import { AvatarStack, EpicChip, LabelChip, PriorityIcon } from "./pieces";
import { htmlToText } from "./attachments";
import { MemberAvatar, cardKey, daysInColumn, dueMeta, resolveMember } from "./util";
import { useCardViewers } from "../board-ws";
import { useTasksStore } from "./store";

// Jira-style column-aging indicator: a row of 4 dots that fill and redden the
// longer a card sits in its column, with a "N days in this column" tooltip.
function AgingDots({ days, label }: { days: number; label: string }) {
  // level 1..4 by age tier — 18 days lands at the top (all red).
  const level = days >= 10 ? 4 : days >= 5 ? 3 : days >= 2 ? 2 : 1;
  const color = level >= 4 ? "#ef4444" : level >= 3 ? "#f97316" : level >= 2 ? "#f59e0b" : "#94a3b8";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-[3px]" aria-label={label}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn("size-[5px] rounded-full transition-colors", i >= level && "bg-foreground/15")}
              style={i < level ? { background: color } : undefined}
            />
          ))}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

/** Wrap every case-insensitive occurrence of `q` in `text` with a highlight mark. */
export function highlight(text: string, q?: string): ReactNode {
  const query = (q ?? "").trim();
  if (!query) return text;
  const lower = text.toLowerCase();
  const ql = query.toLowerCase();
  if (!lower.includes(ql)) return text;
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  for (;;) {
    const at = lower.indexOf(ql, i);
    if (at === -1) { out.push(text.slice(i)); break; }
    if (at > i) out.push(text.slice(i, at));
    out.push(
      <mark key={k++} className="rounded-[2px] bg-yellow-300/70 px-0.5 text-inherit dark:bg-yellow-500/40">
        {text.slice(at, at + query.length)}
      </mark>,
    );
    i = at + query.length;
  }
  return out;
}

export function TaskCard({
  card,
  project,
  members,
  config,
  query,
  commentCount,
  subtaskCount,
  watching,
  onOpen,
  onOpenId,
  onDragStart,
  onDragEnd,
  dragging,
  index = 0,
}: {
  card: Card;
  project?: Project;
  members: Member[];
  config: CardConfig;
  query?: string;
  commentCount: number;
  subtaskCount: number;
  watching?: boolean;
  onOpen: () => void;
  /** Opens an arbitrary card by id (used by the nested subtask rows). */
  onOpenId?: (id: string) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  dragging?: boolean;
  index?: number;
}) {
  const { t } = useTranslation();
  const due = config.dueDate ? dueMeta(card.dueDate) : null;
  const days = daysInColumn(card);
  // Other users currently viewing this card (realtime presence).
  const viewers = useCardViewers(card.id);
  // Green flash for a just-created card (local create or remote card.upsert).
  const flash = useTasksStore((s) => s.flashCards.has(card.id));
  const coverAtt =
    config.cover && card.cover ? card.attachments.find((a) => a.id === card.cover) : undefined;
  // Prefer the optimized thumbnail (files: ref) when present; fall back to the
  // full-res url (also handles legacy base64 covers). files: refs need auth'd
  // resolution to a blob URL; data:/http URLs pass through.
  const coverSrc = useResolvedSrc(coverAtt?.thumbUrl ?? coverAtt?.url);
  // Nested subtasks (stable selectors + memo → no zustand-v5 re-render loop).
  const allCards = useTasksStore((s) => s.cards);
  const allColumns = useTasksStore((s) => s.columns);
  const subtasks = useMemo(
    () => (config.subtasks ? allCards.filter((c) => c.parentId === card.id).sort((a, b) => a.order - b.order) : []),
    [allCards, card.id, config.subtasks],
  );
  const isDone = (c: Card) => allColumns.find((col) => col.id === c.columnId)?.category === "done";
  const epics = useTasksStore((s) => s.epics);
  const epic = card.epicId ? epics.find((e) => e.id === card.epicId) : undefined;

  return (
    <CardMenu card={card} members={members} onOpen={onOpen}>
    <div
      draggable
      onClick={onOpen}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      data-flash={flash ? "" : undefined}
      style={{ animationDelay: `${Math.min(index, 12) * 22}ms` }}
      className={cn(
        "group relative rounded-xl bg-card p-2.5 cursor-pointer",
        // iOS-style soft shadow (no border); lifts on hover.
        "border border-black/[0.04] dark:border-border",
        "shadow-[0_1px_2px_rgba(0,0,0,0.05),0_2px_6px_rgba(0,0,0,0.06)]",
        "hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-all",
        "animate-in fade-in-0 slide-in-from-bottom-1 fill-mode-backwards duration-300",
        flash && "task-card-flash",
        dragging && "opacity-40 shadow-none ring-2 ring-primary/50",
      )}
    >
      {/* "on fire" — top-left animated flame (decoded .tgs) for the hottest
          priorities. Loads lottie-web + the sticker lazily, only when visible. */}
      {(card.priority === "urgent" || card.priority === "high") && (
        <span
          className="pointer-events-none absolute left-0.5 top-0.5 z-10 drop-shadow"
          title={t("modules.tasks.card.hot", { defaultValue: "Yuqori muhimlik" })}
          aria-label="high priority"
        >
          <LottieIcon
            cacheKey="tasks-fire"
            load={() => import("./fire.lottie.json").then((m) => m.default)}
            className="size-6"
          />
        </span>
      )}

      {/* cover image (an image attachment flagged as cover) — bleeds to edges.
          files: refs resolve to blob URLs (shimmer meanwhile). */}
      {coverAtt && (coverSrc.loading || !coverSrc.src ? (
        <div className="-mx-2.5 -mt-2.5 mb-2 block h-24 w-[calc(100%+1.25rem)] max-w-none animate-pulse rounded-t-xl bg-muted" />
      ) : (
        <SmartImage
          src={coverSrc.src}
          alt={coverAtt.name}
          className="-mx-2.5 -mt-2.5 mb-2 block h-24 w-[calc(100%+1.25rem)] max-w-none"
          rounded="rounded-t-xl"
          minMs={500}
        />
      ))}

      {/* presence: other users viewing this card, stacked top-right */}
      {viewers.length > 0 && (
        <div className="absolute -top-1.5 -right-1.5 z-10 flex items-center">
          {viewers.slice(0, 3).map((u, i) => (
            <span
              key={u.id}
              className="rounded-full ring-2 ring-primary/60"
              style={{ marginLeft: i === 0 ? 0 : -6, zIndex: 3 - i }}
              title={t("modules.tasks.presence.viewing", { defaultValue: "{{name}} ko'rmoqda", name: u.name })}
            >
              <MemberAvatar member={{ id: u.id, name: u.name }} size={20} ring />
            </span>
          ))}
          {viewers.length > 3 && (
            <span
              className="inline-flex items-center justify-center rounded-full bg-muted text-muted-foreground font-medium ring-2 ring-background"
              style={{ width: 20, height: 20, fontSize: 20 * 0.38, marginLeft: -6 }}
            >
              +{viewers.length - 3}
            </span>
          )}
        </div>
      )}

      {/* top row: key + watching + days-in-column. When the flame sits over this
          row (hot card with no cover above it), indent so it clears the ID. */}
      {(config.key || config.daysInColumn || watching) && (
        <div
          className={cn(
            "mb-1 flex items-center gap-1.5 text-[11px] text-muted-foreground",
            (card.priority === "urgent" || card.priority === "high") && !coverAtt && "pl-4",
          )}
        >
          {config.key && project && (
            <span className="font-mono font-medium tracking-tight">{cardKey(project, card)}</span>
          )}
          {watching && <Eye className="size-3" />}
          <span className="flex-1" />
          {config.daysInColumn && (
            <AgingDots
              days={days}
              label={
                days <= 0
                  ? t("modules.tasks.card.daysInColumnToday", { defaultValue: "Bugun shu ustunga kirdi" })
                  : t("modules.tasks.card.daysInColumn", { defaultValue: "Shu ustunda {{n}} kun", n: days })
              }
            />
          )}
        </div>
      )}

      {(epic || card.type === "epic") && (
        <div className="mb-1 flex items-center gap-1">
          {card.type === "epic" && (
            <span className="inline-flex items-center gap-0.5 rounded bg-purple-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-600 dark:text-purple-400">
              <Zap className="size-2.5" /> {t("modules.tasks.type.epic", { defaultValue: "Epik" })}
            </span>
          )}
          {epic && <EpicChip epic={epic} />}
        </div>
      )}

      <div className="text-sm font-medium leading-snug line-clamp-3 text-foreground">{highlight(card.title, query)}</div>

      {config.description && card.description && (
        <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{htmlToText(card.description)}</div>
      )}

      {config.labels && card.labels.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {card.labels.map((l) => <LabelChip key={l} label={l} />)}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        {config.priority && <PriorityIcon priority={card.priority} />}
        {config.dueDate && due && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[11px]",
              due.tone === "overdue" && "bg-destructive/15 text-destructive font-medium",
              due.tone === "today" && "bg-warning/15 text-warning font-medium",
              due.tone === "soon" && "text-warning",
              due.tone === "normal" && "text-muted-foreground",
            )}
          >
            <CalendarDays className="size-3" />
            {due.label}
          </span>
        )}
        <span className="flex-1" />
        <div className="flex items-center gap-2 text-muted-foreground">
          {config.subtaskCount && subtaskCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px]" title={t("modules.tasks.card.subtasks", { defaultValue: "Kichik vazifalar" })}>
              <GitBranch className="size-3" />
              {subtaskCount}
            </span>
          )}
          {config.commentCount && commentCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px]">
              <MessageSquare className="size-3" />
              {commentCount}
            </span>
          )}
          {!!card.wikiPageIds?.length && (
            <span className="inline-flex items-center gap-0.5 text-[11px]" title={t("modules.tasks.wiki.title", { defaultValue: "Wiki sahifalar" })}>
              <Link2 className="size-3" />
              {card.wikiPageIds.length}
            </span>
          )}
          {config.assignees && card.assigneeIds.length > 0 && (
            <AvatarStack memberIds={card.assigneeIds} members={members} size={22} />
          )}
        </div>
      </div>

      {/* nested subtasks (Jira-style sub-list; toggled from card setup) */}
      {subtasks.length > 0 && (
        <div className="mt-2 space-y-0.5 border-t pt-1.5">
          {subtasks.map((st) => {
            const done = isDone(st);
            return (
              <button
                key={st.id}
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenId?.(st.id); }}
                className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[11px] hover:bg-foreground/[0.06]"
              >
                <span className={cn("grid size-3 shrink-0 place-items-center rounded-[3px] border", done && "border-emerald-500 bg-emerald-500")}>
                  {done && <Check className="size-2 text-white" />}
                </span>
                {project && <span className="font-mono text-muted-foreground">{cardKey(project, st)}</span>}
                <span className={cn("flex-1 truncate", done && "text-muted-foreground line-through")}>{st.title}</span>
                {config.assignees && st.assigneeIds[0] && (
                  <MemberAvatar member={resolveMember(members, st.assigneeIds[0])} size={14} />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
    </CardMenu>
  );
}

// ── right-click quick menu ──────────────────────────────────────────────────
function CardMenu({
  card,
  members,
  onOpen,
  children,
}: {
  card: Card;
  members: Member[];
  onOpen: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const s = useTasksStore();
  const me = s.currentUserId;
  const columns = useMemo(
    () => s.columns.filter((c) => c.projectId === card.projectId).sort((a, b) => a.order - b.order),
    [s.columns, card.projectId],
  );
  const cardsInCol = (colId: string) => s.cards.filter((c) => c.columnId === colId).length;
  const watching = me ? card.watcherIds.includes(me) : false;
  const priorityLabel = (p: Priority) => t(PRIORITY_META[p].labelKey, { defaultValue: PRIORITY_META[p].label });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onSelect={onOpen} className="gap-2">
          <ExternalLink className="size-4" /> {t("modules.tasks.menu.open", { defaultValue: "Ochish" })}
        </ContextMenuItem>

        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2"><Flag className="size-4" /> {t("modules.tasks.fields.priority", { defaultValue: "Muhimlik" })}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {PRIORITIES.map((p) => (
              <ContextMenuItem key={p} onSelect={() => s.setPriority(card.id, p)} className="gap-2">
                <PriorityIcon priority={p} /> {priorityLabel(p)}
                {card.priority === p && <Check className="ml-auto size-3.5 text-primary" />}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2"><UserPlus className="size-4" /> {t("modules.tasks.fields.assignee", { defaultValue: "Mas'ul" })}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-72 overflow-y-auto">
            {me && (
              <ContextMenuItem onSelect={() => s.setAssignee(card.id, me)} className="gap-2">
                <UserPlus className="size-4" /> {t("modules.tasks.menu.assignMe", { defaultValue: "Menga tayinlash" })}
              </ContextMenuItem>
            )}
            {members.slice(0, 30).map((m) => (
              <ContextMenuItem key={m.id} onSelect={() => s.setAssignee(card.id, m.id)} className="gap-2">
                <MemberAvatar member={m} size={18} /> <span className="truncate">{m.name}</span>
                {card.assigneeIds.includes(m.id) && <Check className="ml-auto size-3.5 text-primary" />}
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => s.setAssignee(card.id, null)} className="gap-2 text-muted-foreground">
              <UserMinus className="size-4" /> {t("modules.tasks.menu.unassign", { defaultValue: "Olib tashlash" })}
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuSub>
          <ContextMenuSubTrigger className="gap-2"><ArrowRightLeft className="size-4" /> {t("modules.tasks.menu.moveTo", { defaultValue: "Ustunga o'tkazish" })}</ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {columns.map((col) => (
              <ContextMenuItem key={col.id} onSelect={() => s.moveCard(card.id, col.id, cardsInCol(col.id))} className="gap-2" disabled={col.id === card.columnId}>
                <span className="size-2 rounded-full" style={{ background: col.color }} /> {col.name}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>

        <ContextMenuItem onSelect={() => me && s.toggleWatcher(card.id, me)} className="gap-2">
          {watching ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          {watching ? t("modules.tasks.menu.unwatch", { defaultValue: "Kuzatmaslik" }) : t("modules.tasks.menu.watch", { defaultValue: "Kuzatish" })}
        </ContextMenuItem>

        <ContextMenuItem onSelect={() => s.duplicateCard(card.id)} className="gap-2">
          <Copy className="size-4" /> {t("modules.tasks.menu.duplicate", { defaultValue: "Nusxa olish" })}
        </ContextMenuItem>

        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => s.deleteCard(card.id)} className="gap-2 text-destructive focus:bg-destructive focus:text-white focus:[&_svg]:text-white">
          <Trash2 className="size-4" /> {t("modules.tasks.menu.delete", { defaultValue: "O'chirish" })}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
