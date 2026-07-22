import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight, ChevronsUpDown, FileText, Link2, MoreHorizontal, Plus, Search,
  Settings2, Trash2, FolderPlus, Lock, Users2, Pencil, Copy,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/shared/lib/utils";
import { useWikiStore } from "./local/store";
import type { Page, Space } from "./local/model";

export function WikiSidebar({
  spaces, activeSpace, activePageId, onSelectSpace, onSelectPage, onNewSpace, onShareSpace,
}: {
  spaces: Space[];
  activeSpace: Space | null;
  activePageId: string | null;
  onSelectSpace: (id: string) => void;
  onSelectPage: (id: string | null) => void;
  onNewSpace: () => void;
  onShareSpace: () => void;
}) {
  const { t } = useTranslation();
  const allPages = useWikiStore((s) => s.pages);
  const allBlocks = useWikiStore((s) => s.blocks);
  const createPage = useWikiStore((s) => s.createPage);
  const duplicatePage = useWikiStore((s) => s.duplicatePage);
  const movePage = useWikiStore((s) => s.movePage);
  const updatePage = useWikiStore((s) => s.updatePage);
  const deletePage = useWikiStore((s) => s.deletePage);

  const copyLink = (page: Page) => {
    try { navigator.clipboard?.writeText(`${location.origin}/wiki?space=${page.spaceId}&page=${page.id}`); } catch { /* ignore */ }
  };
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; zone: "before" | "inside" | "after" } | null>(null);
  const [rootOver, setRootOver] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const pages = useMemo(
    () => (activeSpace ? allPages.filter((p) => p.spaceId === activeSpace.id) : []),
    [allPages, activeSpace],
  );
  const query = q.trim().toLowerCase();
  const searching = query.length > 0;
  // Search matches the title OR any block's text (so "без" finds a page whose body says it).
  const matched = useMemo(() => {
    if (!searching) return [] as Page[];
    const textByPage = new Map<string, string>();
    // block.text is inline HTML now — strip tags so search matches the plain words.
    for (const b of allBlocks) textByPage.set(b.pageId, (textByPage.get(b.pageId) ?? "") + " " + (b.text || "").replace(/<[^>]*>/g, " "));
    return pages.filter(
      (p) => (p.title || "").toLowerCase().includes(query) || (textByPage.get(p.id) ?? "").toLowerCase().includes(query),
    );
  }, [pages, allBlocks, query, searching]);

  const childrenOf = (parentId: string | null) =>
    pages.filter((p) => p.parentId === parentId).sort((a, b) => a.order - b.order);

  const toggle = (id: string) => setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const addPage = (parentId: string | null) => {
    if (!activeSpace) return;
    const id = createPage(activeSpace.id, parentId, {});
    if (parentId) setExpanded((s) => new Set(s).add(parentId));
    onSelectPage(id);
  };

  const resetDrag = () => { setDrag(null); setOver(null); setRootOver(false); };

  const onDrop = (target: Page) => {
    if (!drag || drag === target.id) { resetDrag(); return; }
    const zone = over?.zone ?? "inside";
    if (zone === "inside") {
      movePage(drag, target.id, 0);
      setExpanded((s) => new Set(s).add(target.id));
    } else {
      // before / after → become a sibling of `target` (same parent — this is how a
      // nested page is brought back to root: drop it before/after a root page).
      const sibs = childrenOf(target.parentId).filter((p) => p.id !== drag);
      const ti = sibs.findIndex((p) => p.id === target.id);
      movePage(drag, target.parentId, zone === "after" ? ti + 1 : ti);
    }
    resetDrag();
  };

  const renderRow = (page: Page, depth: number) => {
    const kids = childrenOf(page.id);
    const isOpen = expanded.has(page.id);
    const active = page.id === activePageId;
    return (
      <div key={page.id}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
        <div
          draggable
          onDragStart={(e) => {
            // Setting data (and an allowed effect) is what actually starts a native
            // drag session — without it the drop never fires in some browsers.
            e.dataTransfer.setData("text/plain", page.id);
            e.dataTransfer.effectAllowed = "move";
            setDrag(page.id);
          }}
          onDragEnd={resetDrag}
          onDragOver={(e) => {
            if (!drag || drag === page.id) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "move";
            const r = e.currentTarget.getBoundingClientRect();
            const y = e.clientY - r.top;
            // Generous reorder zones (top/bottom 40%) so dragging up OR down is easy;
            // the narrow middle band nests the page as a child.
            const zone = y < r.height * 0.4 ? "before" : y > r.height * 0.6 ? "after" : "inside";
            setOver((o) => (o?.id === page.id && o.zone === zone ? o : { id: page.id, zone }));
          }}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); onDrop(page); }}
          onClick={() => { if (editingId !== page.id) onSelectPage(page.id); }}
          style={{ paddingLeft: depth * 16 + 6 }}
          className={cn(
            "group/row relative flex items-center gap-1 rounded-md py-1 pr-1 text-sm cursor-pointer transition-colors",
            active
              ? "bg-black/[0.055] dark:bg-accent font-medium"
              : "opacity-70 hover:bg-black/[0.04] hover:opacity-100 dark:hover:bg-accent/60",
            over?.id === page.id && over.zone === "inside" && "ring-1 ring-inset ring-primary/60",
          )}
        >
          {over?.id === page.id && over.zone === "before" && <span className="absolute inset-x-1 -top-px h-0.5 rounded bg-primary" />}
          {over?.id === page.id && over.zone === "after" && <span className="absolute inset-x-1 -bottom-px h-0.5 rounded bg-primary" />}
          <button
            onClick={(e) => { e.stopPropagation(); if (kids.length) toggle(page.id); }}
            className={cn("grid size-4 shrink-0 place-items-center rounded hover:bg-foreground/10", !kids.length && "invisible")}
          >
            <ChevronRight className={cn("size-3.5 transition-transform duration-150", isOpen && "rotate-90")} />
          </button>
          <span className="shrink-0 text-[15px] leading-none">{page.icon}</span>
          {editingId === page.id ? (
            <input
              autoFocus
              defaultValue={page.title}
              onClick={(e) => e.stopPropagation()}
              onBlur={(e) => { updatePage(page.id, { title: e.target.value }); setEditingId(null); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { updatePage(page.id, { title: (e.target as HTMLInputElement).value }); setEditingId(null); }
                if (e.key === "Escape") setEditingId(null);
              }}
              className="min-w-0 flex-1 rounded border bg-background px-1 text-sm outline-none focus:border-primary/50"
            />
          ) : (
            <span className="min-w-0 flex-1 truncate">{page.title || t("modules.wiki.untitled", { defaultValue: "Nomsiz" })}</span>
          )}
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover/row:opacity-100">
            <button onClick={(e) => { e.stopPropagation(); addPage(page.id); }} title={t("modules.wiki.newSubpage", { defaultValue: "Ichki sahifa" })} className="rounded p-0.5 hover:bg-foreground/10">
              <Plus className="size-3.5" />
            </button>
            <PageMenu page={page} onRename={() => setEditingId(page.id)} onOpen={() => onSelectPage(page.id)} onAfterDelete={() => { if (active) onSelectPage(null); }} />
          </div>
        </div>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-52">
            <ContextMenuItem onSelect={() => onSelectPage(page.id)} className="gap-2"><FileText className="size-3.5" /> {t("modules.wiki.openPage", { defaultValue: "Ochish" })}</ContextMenuItem>
            <ContextMenuItem onSelect={() => setEditingId(page.id)} className="gap-2"><Pencil className="size-3.5" /> {t("modules.wiki.rename", { defaultValue: "Nomini o'zgartirish" })}</ContextMenuItem>
            <ContextMenuItem onSelect={() => addPage(page.id)} className="gap-2"><Plus className="size-3.5" /> {t("modules.wiki.newSubpage", { defaultValue: "Ichki sahifa" })}</ContextMenuItem>
            <ContextMenuItem onSelect={() => { const id = duplicatePage(page.id); if (id) onSelectPage(id); }} className="gap-2"><Copy className="size-3.5" /> {t("modules.wiki.duplicate", { defaultValue: "Nusxa" })}</ContextMenuItem>
            <ContextMenuItem onSelect={() => copyLink(page)} className="gap-2"><Link2 className="size-3.5" /> {t("modules.wiki.copyLink", { defaultValue: "Havolani nusxalash" })}</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => { deletePage(page.id); if (active) onSelectPage(null); }} className="gap-2 text-destructive focus:bg-destructive focus:text-white focus:[&_svg]:text-white"><Trash2 className="size-3.5" /> {t("modules.wiki.delete", { defaultValue: "O'chirish" })}</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        {isOpen && (
          <div className="animate-in fade-in-0 slide-in-from-top-1 duration-150">
            {kids.map((k) => renderRow(k, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const roots = childrenOf(null);

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-black/[0.06] bg-[#f7f7f5] text-[#37352f] dark:border-border dark:bg-card dark:text-foreground">
      {/* space switcher */}
      <div className="p-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted transition-colors">
              <span className="text-lg leading-none">{activeSpace?.icon ?? "📚"}</span>
              <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{activeSpace?.name ?? t("modules.wiki.pickSpace", { defaultValue: "Makon" })}</span>
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>{t("modules.wiki.spaces", { defaultValue: "Makonlar" })}</DropdownMenuLabel>
            {spaces.map((sp) => (
              <DropdownMenuItem key={sp.id} onClick={() => onSelectSpace(sp.id)} className="gap-2">
                <span className="text-base leading-none">{sp.icon}</span>
                <span className="flex-1 truncate">{sp.name}</span>
                {sp.everyone == null && <Lock className="size-3 text-muted-foreground" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            {activeSpace && (
              <DropdownMenuItem onClick={onShareSpace} className="gap-2"><Users2 className="size-4" /> {t("modules.wiki.share", { defaultValue: "Kirish huquqi" })}</DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onNewSpace} className="gap-2"><FolderPlus className="size-4" /> {t("modules.wiki.newSpace", { defaultValue: "Yangi makon" })}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* search */}
      <div className="px-2 pb-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("modules.wiki.searchPages", { defaultValue: "Sahifa qidirish…" })} className="h-8 pl-7 text-sm" />
        </div>
      </div>

      {/* tree / search results — dropping on the empty area moves a page to root */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
        onDragOver={(e) => { if (drag) { e.preventDefault(); setOver(null); setRootOver(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setRootOver(false); }}
        onDrop={(e) => { if (drag) { e.preventDefault(); movePage(drag, null, roots.length); resetDrag(); } }}
      >
        {searching ? (
          matched.length ? matched.map((p) => renderRow(p, 0)) : (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">{t("modules.wiki.noResults", { defaultValue: "Topilmadi" })}</div>
          )
        ) : (
          <>
            {roots.map((p) => renderRow(p, 0))}
            {drag && rootOver && <div className="mx-1 my-0.5 h-0.5 rounded bg-primary" />}
            <button onClick={() => addPage(null)} className="mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-muted/70 hover:text-foreground">
              <Plus className="size-4" /> {t("modules.wiki.newPage", { defaultValue: "Yangi sahifa" })}
            </button>
          </>
        )}
        {!activeSpace && (
          <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
            <FileText className="size-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t("modules.wiki.noSpace", { defaultValue: "Makon yo'q" })}</span>
          </div>
        )}
      </div>
    </aside>
  );
}

function PageMenu({ page, onRename, onOpen, onAfterDelete }: { page: Page; onRename: () => void; onOpen: () => void; onAfterDelete: () => void }) {
  const { t } = useTranslation();
  const del = useWikiStore((s) => s.deletePage);
  const duplicate = useWikiStore((s) => s.duplicatePage);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button onClick={(e) => e.stopPropagation()} className="rounded p-0.5 hover:bg-foreground/10"><MoreHorizontal className="size-3.5" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onRename} className="gap-2"><Pencil className="size-4" /> {t("modules.wiki.rename", { defaultValue: "Nomini o'zgartirish" })}</DropdownMenuItem>
        <DropdownMenuItem onClick={onOpen} className="gap-2"><Settings2 className="size-4" /> {t("modules.wiki.openPage", { defaultValue: "Ochish" })}</DropdownMenuItem>
        <DropdownMenuItem onClick={() => duplicate(page.id)} className="gap-2">
          <Copy className="size-4" /> {t("modules.wiki.duplicate", { defaultValue: "Nusxa" })}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { del(page.id); onAfterDelete(); }} className="gap-2 text-destructive focus:text-destructive">
          <Trash2 className="size-4" /> {t("modules.wiki.delete", { defaultValue: "O'chirish" })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
