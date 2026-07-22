import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BookOpen, ChevronRight, Eye, Loader2, PanelLeft, Plus, Users2, MoreHorizontal, Sparkles } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuCheckboxItem,
  DropdownMenuItem, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useMe } from "@/shared/api/me";
import { AiSettingsDialog } from "./ai-settings-dialog";
import { useCompany } from "@/shared/store/company";
import { useAuth } from "@/shared/store/auth";
import { useUrlState } from "@/shared/hooks/use-url-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import { useWikiStore } from "./local/store";
import { useCompanyMembers } from "./api";
import { SPACE_EMOJIS, type Page } from "./local/model";
import { WikiSidebar } from "./sidebar";
import { PageEditor } from "./editor";
import { ShareDialog } from "./share-dialog";
import { PageMeta } from "./page-meta";

export function WikiPage() {
  const { t } = useTranslation();
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;
  const username = useAuth((s) => s.username) ?? "guest";

  const ensureUser = useWikiStore((s) => s.ensureUser);
  const loadWiki = useWikiStore((s) => s.loadWiki);
  const loading = useWikiStore((s) => s.loading);
  const updatePage = useWikiStore((s) => s.updatePage);
  const setMembers = useWikiStore((s) => s.setMembers);
  const recordView = useWikiStore((s) => s.recordView);
  const currentUserId = useWikiStore((s) => s.currentUserId);
  const spacesAll = useWikiStore((s) => s.spaces);
  const pagesAll = useWikiStore((s) => s.pages);
  const createSpace = useWikiStore((s) => s.createSpace);

  // Keep the current-user id set (needed for authorship / optimistic fields).
  useEffect(() => { ensureUser(username); }, [username, ensureUser]);

  // Load the shared wiki for the selected company from the server (seeds a
  // default space + welcome page on the server if this company has none yet).
  // Guarded to a real company id — loading under a null company created a stray
  // "personal" space that duplicated the real one on refresh.
  useEffect(() => { if (companyId != null) loadWiki(companyId); }, [companyId, loadWiki]);

  const membersQ = useCompanyMembers(companyId);
  useEffect(() => {
    const items = membersQ.data?.items;
    if (!items) return;
    setMembers(items.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar ?? null })));
  }, [membersQ.data, setMembers]);

  const { data: me } = useMe();
  const [spaceUrl, setSpaceUrl] = useUrlState("space", "");
  const [pageUrl, setPageUrl] = useUrlState("page", "");
  const [shareOpen, setShareOpen] = useState(false);
  const [newSpaceOpen, setNewSpaceOpen] = useState(false);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  // User-id comparison tolerant of the `me:` prefix: older spaces stored the bare
  // username as ownerId/access key, newer ones use `me:<username>`. Normalise so
  // an owner never loses edit access to their own older space.
  const bare = (id: string | null | undefined) => (id ?? "").replace(/^me:/, "");
  const isMe = (id: string | null | undefined) => currentUserId != null && bare(id) === bare(currentUserId);
  const myAccess = (access: Record<string, string>) => {
    if (currentUserId == null) return undefined;
    const b = bare(currentUserId);
    return access[currentUserId] ?? access[b] ?? access["me:" + b];
  };

  // Spaces of this firm the current user may see (owner / shared with everyone / granted).
  const spaces = useMemo(
    () =>
      spacesAll
        .filter((sp) => sp.companyId === companyId)
        .filter((sp) => isMe(sp.ownerId) || sp.everyone != null || myAccess(sp.access) != null)
        .sort((a, b) => a.order - b.order),
    [spacesAll, companyId, currentUserId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const activeSpace = spaces.find((s) => s.id === spaceUrl) ?? spaces[0] ?? null;
  const canEdit = !!activeSpace && (
    isMe(activeSpace.ownerId) ||
    activeSpace.everyone === "edit" ||
    myAccess(activeSpace.access) === "edit"
  );

  const spacePages = useMemo(
    () => (activeSpace ? pagesAll.filter((p) => p.spaceId === activeSpace.id) : []),
    [pagesAll, activeSpace],
  );
  const activePage = spacePages.find((p) => p.id === pageUrl) ?? null;

  // Open the first page by default (Notion always shows a page, not an empty pane).
  useEffect(() => {
    if (activeSpace && !activePage) {
      const firstRoot = spacePages.filter((p) => p.parentId === null).sort((a, b) => a.order - b.order)[0];
      if (firstRoot) setPageUrl(firstRoot.id);
    }
  }, [activeSpace, activePage, spacePages, setPageUrl]);

  // Record a view whenever a page is opened (drives view stats + presence).
  const activePageId = activePage?.id;
  useEffect(() => { if (activePageId) recordView(activePageId); }, [activePageId, recordView]);

  const breadcrumb = useMemo(() => {
    if (!activePage) return [] as Page[];
    const chain: Page[] = [];
    let cur: Page | undefined = activePage;
    const byId = new Map(spacePages.map((p) => [p.id, p]));
    while (cur) { chain.unshift(cur); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }
    return chain;
  }, [activePage, spacePages]);

  if (!companyId)
    return <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">{t("modules.wiki.noCompany", { defaultValue: "Avval yuqoridan kompaniya tanlang." })}</div>;

  if (loading && spaces.length === 0)
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border bg-card py-20 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        {t("modules.wiki.loading", { defaultValue: "Yuklanmoqda…" })}
      </div>
    );

  return (
    <div className="relative -m-6 flex h-[calc(100dvh-66px)] overflow-hidden max-md:h-[calc(100dvh-56px)]">
      {/* Desktop: fixed sidebar. Mobile: hidden — opens as a drawer below. */}
      <div className="hidden md:contents">
        <WikiSidebar
          spaces={spaces}
          activeSpace={activeSpace}
          activePageId={activePage?.id ?? null}
          onSelectSpace={(id) => { setSpaceUrl(id); setPageUrl(""); }}
          onSelectPage={(id) => setPageUrl(id ?? "")}
          onNewSpace={() => setNewSpaceOpen(true)}
          onShareSpace={() => setShareOpen(true)}
        />
      </div>

      {/* Mobile drawer: pages panel slides over the content. */}
      {mobileSidebar && (
        <div className="absolute inset-0 z-40 flex md:hidden">
          <div className="h-full w-72 max-w-[85vw] overflow-hidden bg-background shadow-2xl animate-in slide-in-from-left-4 duration-200">
            <WikiSidebar
              spaces={spaces}
              activeSpace={activeSpace}
              activePageId={activePage?.id ?? null}
              onSelectSpace={(id) => { setSpaceUrl(id); setPageUrl(""); setMobileSidebar(false); }}
              onSelectPage={(id) => { setPageUrl(id ?? ""); setMobileSidebar(false); }}
              onNewSpace={() => { setNewSpaceOpen(true); setMobileSidebar(false); }}
              onShareSpace={() => { setShareOpen(true); setMobileSidebar(false); }}
            />
          </div>
          <button
            type="button"
            aria-label="Yopish"
            onClick={() => setMobileSidebar(false)}
            className="flex-1 bg-black/35 animate-in fade-in-0 duration-200"
          />
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col bg-white dark:bg-background">
        {/* top bar: breadcrumb + share */}
        <div className="flex h-11 shrink-0 items-center gap-1 border-b border-black/[0.06] dark:border-border px-4 text-sm">
          <button
            type="button"
            onClick={() => setMobileSidebar(true)}
            className="mr-1 rounded-md p-1.5 text-muted-foreground hover:bg-muted md:hidden"
            aria-label={t("modules.wiki.pages", { defaultValue: "Sahifalar" })}
          >
            <PanelLeft className="size-4" />
          </button>
          {activeSpace && <span className="text-muted-foreground">{activeSpace.icon}</span>}
          {breadcrumb.map((p, i) => (
            <span key={p.id} className="flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />}
              <button onClick={() => setPageUrl(p.id)} className="truncate rounded px-1 py-0.5 hover:bg-muted">
                <span className="mr-1">{p.icon}</span>{p.title || t("modules.wiki.untitled", { defaultValue: "Nomsiz" })}
              </button>
            </span>
          ))}
          <span className="flex-1" />
          {activePage && <PageMeta page={activePage} />}
          {activeSpace && !canEdit && (
            <span className="ml-1 mr-1 inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <Eye className="size-3.5" /> {t("modules.wiki.viewOnly", { defaultValue: "Faqat ko'rish" })}
            </span>
          )}
          {activeSpace && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setShareOpen(true)}>
              <Users2 className="size-4" /> {t("modules.wiki.share", { defaultValue: "Kirish huquqi" })}
            </Button>
          )}
          {activePage && canEdit && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="icon" variant="ghost" className="ml-0.5 size-8"><MoreHorizontal className="size-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuCheckboxItem
                  checked={!!activePage.fullWidth}
                  onCheckedChange={(v) => updatePage(activePage.id, { fullWidth: v })}
                >
                  {t("modules.wiki.fullWidth", { defaultValue: "Keng sahifa" })}
                </DropdownMenuCheckboxItem>
                {me?.is_admin && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="gap-2" onClick={() => setAiOpen(true)}>
                      <Sparkles className="size-4 text-primary" />
                      {t("modules.wiki.ai.settingsTitle", { defaultValue: "AI sozlamalari" })}
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {activePage ? (
            <PageEditor key={activePage.id} pageId={activePage.id} canEdit={canEdit} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="grid size-16 place-items-center rounded-2xl bg-muted"><BookOpen className="size-8 text-muted-foreground" /></div>
              <div>
                <div className="text-base font-semibold">{activeSpace ? t("modules.wiki.pickPage", { defaultValue: "Sahifani tanlang yoki yarating" }) : t("modules.wiki.emptyTitle", { defaultValue: "Bilimlar bazasini boshlang" })}</div>
                <div className="mt-1 text-sm text-muted-foreground">{t("modules.wiki.pickPageHint", { defaultValue: "Chapdagi paneldan sahifa oching yoki yangi qo'shing." })}</div>
              </div>
              {activeSpace && canEdit && (
                <Button className="gap-1.5" onClick={() => { const id = useWikiStore.getState().createPage(activeSpace.id, null, {}); setPageUrl(id); }}>
                  <Plus className="size-4" /> {t("modules.wiki.newPage", { defaultValue: "Yangi sahifa" })}
                </Button>
              )}
            </div>
          )}
        </div>
      </main>

      <ShareDialog space={shareOpen ? activeSpace : null} open={shareOpen} onClose={() => setShareOpen(false)} />
      <AiSettingsDialog open={aiOpen} onClose={() => setAiOpen(false)} />
      <NewSpaceDialog
        open={newSpaceOpen}
        onClose={() => setNewSpaceOpen(false)}
        onCreate={(name, icon) => { const id = createSpace(companyId, name, icon); setSpaceUrl(id); setPageUrl(""); setNewSpaceOpen(false); setShareOpen(true); }}
      />
    </div>
  );
}

function NewSpaceDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (name: string, icon: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(SPACE_EMOJIS[0]);
  useEffect(() => { if (open) { setName(""); setIcon(SPACE_EMOJIS[0]); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t("modules.wiki.newSpace", { defaultValue: "Yangi makon" })}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-lg border text-2xl">{icon}</span>
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("modules.wiki.spaceNamePlaceholder", { defaultValue: "Masalan: Buxgalteriya qo'llanmasi" })}
              onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) onCreate(name.trim(), icon); }} />
          </div>
          <div className="flex flex-wrap gap-1">
            {SPACE_EMOJIS.map((e) => (
              <button key={e} onClick={() => setIcon(e)} className={cn("rounded-md p-1 text-xl hover:bg-muted", e === icon && "bg-muted ring-1 ring-primary")}>{e}</button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground">{t("modules.wiki.newSpaceHint", { defaultValue: "Makon standart holatda yopiq — keyin kimga kirish berishni tanlaysiz." })}</div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>{t("modules.wiki.cancel", { defaultValue: "Bekor qilish" })}</Button>
          <Button disabled={!name.trim()} onClick={() => onCreate(name.trim(), icon)}>{t("modules.wiki.create", { defaultValue: "Yaratish" })}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
