import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { type Card, type Column, type Member, type Project } from "./model";
import { AvatarStack, LabelChip, PriorityBadge } from "./pieces";
import { cardKey, dueMeta } from "./util";

export function ListView({
  project,
  columns,
  cards,
  members,
  onOpen,
}: {
  project: Project;
  columns: Column[];
  cards: Card[];
  members: Member[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const subsOf = (parentId: string) =>
    cards.filter((c) => c.parentId === parentId).sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-4">
      {columns.map((col) => {
        // Only top-level cards head each column; subtasks render nested below.
        const list = cards.filter((c) => c.columnId === col.id && !c.parentId).sort((a, b) => a.order - b.order);
        if (list.length === 0) return null;
        return (
          <div key={col.id} className="rounded-xl border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
              <span className="size-2 rounded-full" style={{ background: col.color }} />
              <span className="text-sm font-semibold">{col.name}</span>
              <span className="text-xs text-muted-foreground">{list.length}</span>
            </div>
            <div className="divide-y">
              {list.map((card) => (
                <div key={card.id}>
                  <Row card={card} project={project} members={members} onOpen={onOpen} />
                  {subsOf(card.id).map((sub) => (
                    <Row key={sub.id} card={sub} project={project} members={members} onOpen={onOpen} sub />
                  ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {cards.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          {t("modules.tasks.empty", { defaultValue: "Vazifa yo'q" })}
        </div>
      )}
    </div>
  );
}

function Row({
  card, project, members, onOpen, sub,
}: {
  card: Card;
  project: Project;
  members: Member[];
  onOpen: (id: string) => void;
  sub?: boolean;
}) {
  const due = dueMeta(card.dueDate);
  return (
    <button
      type="button"
      onClick={() => onOpen(card.id)}
      className={cn(
        "flex w-full items-center gap-3 py-2 pr-3 text-left transition-colors hover:bg-muted/50",
        sub ? "border-t border-dashed pl-9" : "px-3",
      )}
    >
      {sub && <ChevronRight className="size-3 shrink-0 text-muted-foreground/50" />}
      <span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground">
        {cardKey(project, card)}
      </span>
      <PriorityBadge priority={card.priority} showLabel={false} />
      <span className={cn("flex-1 truncate font-medium", sub ? "text-[13px]" : "text-sm")}>{card.title}</span>
      <div className="hidden max-w-[240px] flex-wrap justify-end gap-1 md:flex">
        {card.labels.slice(0, 3).map((l) => <LabelChip key={l} label={l} />)}
      </div>
      {due && (
        <span
          className={cn(
            "w-20 whitespace-nowrap text-right text-xs",
            due.tone === "overdue" && "font-medium text-destructive",
            due.tone === "today" && "font-medium text-warning",
            due.tone === "normal" && "text-muted-foreground",
          )}
        >
          {due.label}
        </span>
      )}
      {card.assigneeIds.length > 0 ? (
        <AvatarStack memberIds={card.assigneeIds} members={members} size={22} max={3} />
      ) : (
        <span className="w-[22px]" />
      )}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
