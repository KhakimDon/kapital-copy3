import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ExternalLink, Link2, Plus, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useTabs, moduleRoot } from "@/shared/store/tabs";
import { useWikiStore } from "@/modules/wiki/local/store";
import { useTasksStore } from "./store";

/** Open a wiki page in its module tab — reuse an exact match, else open a new tab
 *  (a fresh tab reads ?space/?page from the URL and lands on the page). */
function openWikiPage(spaceId: string, pageId: string) {
  const path = `/wiki?space=${spaceId}&page=${pageId}`;
  const st = useTabs.getState();
  const exact = st.tabs.find((tb) => tb.path === path);
  if (exact) st.setActive(exact.id);
  else if (st.tabs.some((tb) => moduleRoot(tb.path) === "/wiki")) st.openNew(path);
  else st.open(path);
}

export function WikiLinks({ cardId, companyId }: { cardId: string; companyId: number | null }) {
  const { t } = useTranslation();
  const card = useTasksStore((s) => s.cards.find((c) => c.id === cardId));
  const toggle = useTasksStore((s) => s.toggleWikiLink);
  const spaces = useWikiStore((s) => s.spaces);
  const pages = useWikiStore((s) => s.pages);
  const [q, setQ] = useState("");

  const linked = card?.wikiPageIds ?? [];
  const spaceById = useMemo(() => new Map(spaces.map((sp) => [sp.id, sp])), [spaces]);
  const pageById = useMemo(() => new Map(pages.map((p) => [p.id, p])), [pages]);
  const companySpaceIds = useMemo(
    () => new Set(spaces.filter((sp) => sp.companyId === companyId).map((sp) => sp.id)),
    [spaces, companyId],
  );

  const candidates = useMemo(() => {
    const query = q.trim().toLowerCase();
    return pages
      .filter((p) => companySpaceIds.has(p.spaceId))
      .filter((p) => !query || (p.title || "").toLowerCase().includes(query))
      .slice(0, 60);
  }, [pages, companySpaceIds, q]);

  const untitled = t("modules.wiki.untitled", { defaultValue: "Nomsiz" });

  return (
    <div className="space-y-1.5">
      {linked.map((pid) => {
        const p = pageById.get(pid);
        if (!p) return null;
        const sp = spaceById.get(p.spaceId);
        return (
          <div key={pid} className="group/wl flex items-center gap-1.5 rounded-lg border bg-background px-2 py-1.5 text-sm hover:bg-muted/50">
            <span className="text-base leading-none">{p.icon}</span>
            <button onClick={() => openWikiPage(p.spaceId, pid)} className="min-w-0 flex-1 truncate text-left hover:underline">
              {p.title || untitled}
              {sp && <span className="ml-1 text-xs text-muted-foreground">· {sp.name}</span>}
            </button>
            <button onClick={() => openWikiPage(p.spaceId, pid)} title={t("modules.tasks.wiki.open", { defaultValue: "Ochish" })} className="text-muted-foreground hover:text-foreground">
              <ExternalLink className="size-3.5" />
            </button>
            <button onClick={() => toggle(cardId, pid)} title={t("modules.tasks.wiki.unlink", { defaultValue: "Uzish" })} className="text-muted-foreground opacity-0 transition-opacity group-hover/wl:opacity-100 hover:text-destructive">
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}

      <Popover>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
            <Plus className="size-3" /> {t("modules.tasks.wiki.add", { defaultValue: "Wiki sahifa ulash" })}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <div className="p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("modules.tasks.wiki.search", { defaultValue: "Sahifa qidirish…" })} className="h-8 pl-7 text-sm" autoFocus />
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto pb-1">
            {candidates.length === 0 && (
              <div className="flex flex-col items-center gap-1 px-3 py-6 text-center text-xs text-muted-foreground">
                <Link2 className="size-4" />
                {t("modules.tasks.wiki.none", { defaultValue: "Wiki sahifasi topilmadi" })}
              </div>
            )}
            {candidates.map((p) => {
              const on = linked.includes(p.id);
              const sp = spaceById.get(p.spaceId);
              return (
                <button key={p.id} onClick={() => toggle(cardId, p.id)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm hover:bg-foreground/[0.06] transition-colors">
                  <span className="text-base leading-none">{p.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-left">
                    {p.title || untitled}
                    {sp && <span className="ml-1 text-xs text-muted-foreground">· {sp.name}</span>}
                  </span>
                  {on && <Check className="size-4 text-primary" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
