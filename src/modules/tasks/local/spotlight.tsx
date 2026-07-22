import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, CornerDownLeft } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import { type Card, type Column, type Member, type Project } from "./model";
import { PriorityIcon } from "./pieces";
import { MemberAvatar, resolveMember } from "./util";

/**
 * Spotlight-style task search: a big centred modal with a search field and a
 * live results list across the loaded cards. Arrow keys move, Enter opens.
 */
export function TaskSpotlight({
  open,
  onClose,
  cards,
  projects,
  columns,
  members,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  cards: Card[];
  projects: Project[];
  columns: Column[];
  members: Member[];
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);

  const projectOf = (id: string) => projects.find((p) => p.id === id);
  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const scored = cards
      .filter((c) => {
        if (!query) return true;
        const proj = projectOf(c.projectId);
        const key = proj ? `${proj.key}-${c.seq}`.toLowerCase() : "";
        return c.title.toLowerCase().includes(query) || key.includes(query) || c.labels.some((l) => l.toLowerCase().includes(query));
      })
      .slice(0, 24);
    return scored;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, q, projects]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const r = results[idx]; if (r) onOpen(r.id); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        className={cn(
          "top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0",
          // macOS Spotlight / Raycast glass panel — borderless, translucent, blurred.
          "rounded-2xl border-0 bg-popover/80 shadow-[0_24px_70px_-15px_rgba(0,0,0,0.5)] backdrop-blur-2xl backdrop-saturate-150",
        )}
      >
        <div className="flex items-center gap-3 px-4">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={onKey}
            placeholder={t("modules.tasks.spotlightPlaceholder", { defaultValue: "Vazifa qidirish (nom, kalit, yorliq)…" })}
            className="h-14 flex-1 bg-transparent pr-8 text-lg outline-none placeholder:text-muted-foreground"
          />
        </div>
        {/* subtle divider before results */}
        <div className="h-px bg-border" />
        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {t("modules.tasks.spotlightEmpty", { defaultValue: "Vazifa topilmadi" })}
            </div>
          ) : (
            results.map((c, i) => {
              const proj = projectOf(c.projectId);
              const col = columns.find((x) => x.id === c.columnId);
              const assignee = c.assigneeIds[0] ? resolveMember(members, c.assigneeIds[0]) : undefined;
              return (
                <button
                  key={c.id}
                  onClick={() => onOpen(c.id)}
                  onMouseEnter={() => setIdx(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    i === idx ? "bg-foreground/[0.06]" : "hover:bg-foreground/[0.04]",
                  )}
                >
                  <PriorityIcon priority={c.priority} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-foreground">{c.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {proj ? `${proj.key}-${c.seq}` : `#${c.seq}`}{col ? ` · ${col.name}` : ""}
                    </div>
                  </div>
                  {assignee && <MemberAvatar member={assignee} size={20} />}
                  {i === idx && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
