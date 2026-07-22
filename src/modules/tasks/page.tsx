import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import type { ComponentType } from "react";
import { ListTodo, Loader2, Plus } from "lucide-react";
import { CalendarIcon, KanbanIcon, ListIcon, ReportsIcon, SearchIcon, TimelineIcon } from "./local/view-icons";
import { useCompany } from "@/shared/store/company";
import { useAuth } from "@/shared/store/auth";
import { useUrlState } from "@/shared/hooks/use-url-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { useState } from "react";
import { useTasksStore } from "./local/store";
import { useBoardSocket } from "./board-ws";
import { useMembers } from "./api";
import type { BoardView } from "./local/model";
import { KanbanView } from "./local/kanban-view";
import { ListView } from "./local/list-view";
import { CalendarView } from "./local/calendar-view";
import { TimelineView } from "./local/timeline-view";
import { TaskDrawer } from "./local/task-drawer";
import { TaskSpotlight } from "./local/spotlight";
import { ReportsView } from "./local/reports-view";
import { useDensity } from "./local/use-density";
import {
  AssigneeFilter, CardConfigMenu, CreateTaskDialog, NewProjectDialog, ProjectList, ProjectPicker,
  SwimlaneMenu, UNASSIGNED_FILTER,
} from "./local/board-dialogs";
import { SWIMLANES, type Swimlane } from "./local/model";
import { myPerms, myRoleKey } from "./local/perms";
import { useMe } from "@/shared/api/me";
import { cardKey, daysInColumn } from "./local/util";

// Reports is a page-local view key (not a board data view), so it lives here as
// `ViewKey` rather than widening the model's BoardView.
type ViewKey = BoardView | "reports";

const VIEWS: { key: ViewKey; labelKey: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { key: "board", labelKey: "modules.tasks.view.board", label: "Doska", Icon: KanbanIcon },
  { key: "list", labelKey: "modules.tasks.view.list", label: "Ro'yxat", Icon: ListIcon },
  { key: "calendar", labelKey: "modules.tasks.view.calendar", label: "Kalendar", Icon: CalendarIcon },
  { key: "timeline", labelKey: "modules.tasks.view.timeline", label: "Timeline", Icon: TimelineIcon },
  { key: "reports", labelKey: "modules.tasks.view.reports", label: "Hisobotlar", Icon: ReportsIcon },
];

// Per-user, per-project grouping (swimlane) memory — so re-opening a project
// restores MY last chosen grouping.
const swimlaneStoreKey = (projectKey: string, uid: string | null) =>
  `aiba:tasks:swimlane:${projectKey}:${uid ?? "anon"}`;

export function TasksPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;
  const username = useAuth((s) => s.username) ?? "guest";

  const ensureUser = useTasksStore((s) => s.ensureUser);
  const loadBoard = useTasksStore((s) => s.loadBoard);
  const loadedProjects = useTasksStore((s) => s.loadedProjects);
  const loading = useTasksStore((s) => s.loading);
  const currentUserId = useTasksStore((s) => s.currentUserId);
  const projects = useTasksStore((s) => s.projects);
  const columnsAll = useTasksStore((s) => s.columns);
  const cardsAll = useTasksStore((s) => s.cards);
  const comments = useTasksStore((s) => s.comments);
  const members = useTasksStore((s) => s.members);
  const config = useTasksStore((s) => s.cardConfig);

  // Keep the current-user id set (needed for authorship / optimistic fields).
  useEffect(() => {
    ensureUser(username);
  }, [username, ensureUser]);

  // Real assignee/reporter/watcher roster comes from AIBA (chat2 company members).
  const membersQ = useMembers(companyId);
  const setMembers = useTasksStore((s) => s.setMembers);
  useEffect(() => {
    const items = membersQ.data?.items;
    if (!items) return;
    setMembers(items.map((m) => ({ id: m.id, name: m.name, avatar: m.avatar ?? null, role: m.role ?? null, color: null })));
  }, [membersQ.data, setMembers]);

  const [viewRaw, setView] = useUrlState("view", "board");
  const view = viewRaw as ViewKey;
  const density = useDensity();
  const [projectUrl, setProjectUrl] = useUrlState("project", "");
  const [q] = useUrlState("q", "");
  const [assigneesUrl, setAssignees] = useUrlState("assignees", "");
  const [cardUrl, setCardUrl] = useUrlState("card", "");
  const [swimlaneRaw, setSwimlane] = useUrlState("swimlane", "none");
  const swimlane = swimlaneRaw as Swimlane;

  // Realtime board socket — mounted at the board level so it persists across
  // drawer open/close. Reports which card the user is viewing for presence.
  const sendViewing = useBoardSocket(companyId);
  useEffect(() => {
    sendViewing(cardUrl || null);
  }, [cardUrl, sendViewing]);

  // Initial load: fetch the project list (+ the server's first project's cards).
  // The specific active project's cards are loaded on demand below.
  useEffect(() => {
    if (companyId != null) loadBoard(companyId);
  }, [companyId, loadBoard]);

  // Cross-project epics for pickers + chips (refreshes when card count changes,
  // e.g. a new epic was created).
  const loadEpics = useTasksStore((s) => s.loadEpics);
  useEffect(() => {
    if (companyId != null) loadEpics(companyId);
  }, [companyId, cardsAll.length, loadEpics]);

  // Task permission roles (for the Jira-style project access scheme).
  const me = useMe();
  const isAdmin = !!(me.data?.is_admin || me.data?.is_superadmin);
  // Reflect the user's self-set avatar on their board member (so their cards
  // show their photo).
  const setMyAvatar = useTasksStore((s) => s.setMyAvatar);
  useEffect(() => {
    setMyAvatar(me.data?.avatar ?? null);
  }, [me.data?.avatar, currentUserId, setMyAvatar]);
  const roles = useTasksStore((s) => s.roles);
  const loadRoles = useTasksStore((s) => s.loadRoles);
  useEffect(() => {
    if (companyId != null) loadRoles(companyId);
  }, [companyId, loadRoles]);

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);

  // Projects for this firm, visible to the current user. Private → owner or
  // members only — PLUS tenant admins, who get "owner" access everywhere
  // (perms.ts::myRoleKey), so the visibility filter must match or an admin
  // could manage a project they can't even see in the picker.
  const myProjects = useMemo(
    () =>
      projects
        .filter((p) => p.companyId === companyId && !p.archived)
        .filter((p) => !p.private || isAdmin || p.ownerId === currentUserId || (currentUserId != null && p.memberIds.includes(currentUserId))),
    [projects, companyId, currentUserId, isAdmin],
  );

  // The URL carries the project's KEY (its uppercase nickname), not the id.
  const urlProject = projectUrl
    ? myProjects.find((p) => p.key.toLowerCase() === projectUrl.toLowerCase()) ?? null
    : null;
  // One accessible project → open it straight away. Many (and none picked) →
  // fall through to the project list so the user chooses.
  const activeProject = urlProject ?? (!projectUrl && myProjects.length === 1 ? myProjects[0] : null);
  const showProjectList = !activeProject && myProjects.length > 0;
  // The active project's cards may still be loading (per-project lazy load).
  const activeLoaded = activeProject ? loadedProjects.has(activeProject.id) : false;

  // The current user's permissions in the active project (project role scheme).
  const perms = useMemo(
    () => myPerms(activeProject, currentUserId, isAdmin, roles),
    [activeProject, currentUserId, isAdmin, roles],
  );
  const myRole = activeProject ? myRoleKey(activeProject, currentUserId, isAdmin) : "member";

  // The bootstrap load above uses the URL hint, but the *resolved* active project
  // can differ (e.g. URL empty → falls back to the first VISIBLE project, which
  // need not be the server's first project). Ensure its cards get loaded too.
  useEffect(() => {
    if (companyId != null && activeProject && !activeLoaded) loadBoard(companyId, activeProject.id);
  }, [companyId, activeProject?.id, activeLoaded, loadBoard]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = useMemo(
    () => (activeProject ? columnsAll.filter((c) => c.projectId === activeProject.id).sort((a, b) => a.order - b.order) : []),
    [columnsAll, activeProject],
  );

  // Restore this user's last grouping for this project when it opens; changes are
  // saved by `changeSwimlane` below. Keyed on the project id so it runs once per
  // project switch (not on every swimlane change).
  useEffect(() => {
    if (!activeProject) return;
    try {
      const saved = localStorage.getItem(swimlaneStoreKey(activeProject.key, currentUserId));
      if (saved && SWIMLANES.includes(saved as Swimlane) && saved !== swimlaneRaw) setSwimlane(saved);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProject?.id, currentUserId]);

  const changeSwimlane = (s: Swimlane) => {
    setSwimlane(s);
    if (activeProject) {
      try {
        localStorage.setItem(swimlaneStoreKey(activeProject.key, currentUserId), s);
      } catch {
        /* ignore */
      }
    }
  };

  // Reports read the WHOLE project (not the assignee/search-filtered board set).
  const projectCards = useMemo(
    () => (activeProject ? cardsAll.filter((c) => c.projectId === activeProject.id) : []),
    [cardsAll, activeProject],
  );

  const selectedAssignees = assigneesUrl ? assigneesUrl.split(",").filter(Boolean) : [];

  // Filter: project → search → assignee. Subtasks stay hidden from the top board
  // (they live inside their parent card) except in list/timeline where they read fine.
  const filteredCards = useMemo(() => {
    if (!activeProject) return [];
    const query = q.trim().toLowerCase();
    return cardsAll
      .filter((c) => c.projectId === activeProject.id)
      .filter((c) => !c.parentId || view !== "board")
      .filter((c) => {
        if (!query) return true;
        return (
          c.title.toLowerCase().includes(query) ||
          c.labels.some((l) => l.toLowerCase().includes(query)) ||
          cardKey(activeProject, c).toLowerCase().includes(query)
        );
      })
      .filter((c) => {
        if (!selectedAssignees.length) return true;
        const wantUnassigned = selectedAssignees.includes(UNASSIGNED_FILTER);
        const ids = selectedAssignees.filter((x) => x !== UNASSIGNED_FILTER);
        return (
          (wantUnassigned && c.assigneeIds.length === 0) ||
          c.assigneeIds.some((a) => ids.includes(a))
        );
      })
      // Board only: hide long-settled done cards (like a Jira "done within N days"
      // filter). The list view shows everything.
      .filter((c) => {
        if (view !== "board" || config.hideDoneAfterDays == null) return true;
        const done = columns.find((col) => col.id === c.columnId)?.category === "done";
        return !done || daysInColumn(c) <= config.hideDoneAfterDays;
      });
  }, [cardsAll, activeProject, q, assigneesUrl, view, config.hideDoneAfterDays, columns]); // eslint-disable-line react-hooks/exhaustive-deps

  const counts = useMemo(() => {
    const cmap = new Map<string, number>();
    for (const c of comments) cmap.set(c.cardId, (cmap.get(c.cardId) ?? 0) + 1);
    const smap = new Map<string, number>();
    for (const c of cardsAll) if (c.parentId) smap.set(c.parentId, (smap.get(c.parentId) ?? 0) + 1);
    const watching = new Set<string>();
    if (currentUserId) for (const c of cardsAll) if (c.watcherIds.includes(currentUserId)) watching.add(c.id);
    return { comments: cmap, subtasks: smap, watching };
  }, [comments, cardsAll, currentUserId]);

  const projectMemberIds = activeProject
    ? (activeProject.memberIds.length ? activeProject.memberIds : members.map((m) => m.id))
    : [];

  const openCard = (id: string) => setCardUrl(id);

  if (!companyId)
    return (
      <div className="rounded-xl border bg-card p-10 text-center text-muted-foreground">
        {t("modules.tasks.noCompany", { defaultValue: "Avval yuqoridan kompaniya tanlang." })}
      </div>
    );

  return (
    <div className="space-y-3">
      {/* Sticky, full-bleed header — project + search + actions, then the view
          tab strip whose divider bleeds to both edges; stays fixed on scroll.
          `-mx-6 -mt-6 px-6` cancels the tab-container padding so the hairline
          reaches the edges and the bar sits flush to the scroll top. */}
      <div className="sticky top-0 z-30 -mx-6 -mt-6 border-b border-border bg-background/85 px-6 pt-4 backdrop-blur-md">
      {/* ROW 1: project + search + actions */}
      <div className="flex flex-wrap items-center gap-2 pb-2.5">
        {density === "full" && (
          <h1 className="mr-1 flex items-center gap-2 text-xl font-semibold">
            <ListTodo className="size-5" /> {t("modules.tasks.title", { defaultValue: "Vazifalar" })}
          </h1>
        )}

        <ProjectPicker
          projects={myProjects}
          activeId={activeProject?.id ?? null}
          onSelect={(id) => setProjectUrl(myProjects.find((p) => p.id === id)?.key ?? "")}
          onNew={() => setNewProjectOpen(true)}
          onSettings={perms.has("manage") ? () => navigate(`/tasks/settings?project=${activeProject?.key ?? ""}`) : undefined}
        />

        {activeProject && (
          <>
            {/* Compact mode: the original inline pill switcher — active shows an
                icon+label pill (neutral), others are icon-only. */}
            {density === "compact" && (
              <div className="inline-flex items-center gap-0.5">
                {VIEWS.map(({ key, labelKey, label, Icon }) => {
                  const active = view === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setView(key)}
                      title={t(labelKey, { defaultValue: label })}
                      aria-label={t(labelKey, { defaultValue: label })}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full text-sm transition-all",
                        active
                          ? "bg-muted px-3 py-1.5 font-medium text-foreground"
                          : "px-2 py-1.5 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                      {active && <span>{t(labelKey, { defaultValue: label })}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Compact: a small divider between the view switcher and search. */}
            {density === "compact" && <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />}

            {/* search — standalone spotlight trigger (stays on top row) */}
            <button
              onClick={() => setSpotlightOpen(true)}
              title={t("modules.tasks.search", { defaultValue: "Qidirish" })}
              aria-label={t("modules.tasks.search", { defaultValue: "Qidirish" })}
              className="inline-flex items-center justify-center rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <SearchIcon className="size-4" />
            </button>

            <AssigneeFilter
              members={members}
              memberIds={projectMemberIds}
              selected={selectedAssignees}
              onToggle={(id) =>
                setAssignees(
                  (selectedAssignees.includes(id)
                    ? selectedAssignees.filter((x) => x !== id)
                    : [...selectedAssignees, id]
                  ).join(","),
                )
              }
              onClear={() => setAssignees("")}
            />

            <div className="ml-auto flex items-center gap-2">
              {view === "board" && <SwimlaneMenu value={swimlane} onChange={changeSwimlane} />}
              {/* Single "Вид" — card display + full/compact density live inside. */}
              <CardConfigMenu />
              {perms.has("create") && (
                <Button size="sm" className="h-9 gap-1.5" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" /> {t("modules.tasks.newTask", { defaultValue: "Yangi vazifa" })}
                </Button>
              )}
            </div>
          </>
        )}
      </div>

      {/* ROW 2: Jira-style view tab strip — full mode only (compact folds it into
          the inline switcher above). Flush to the header's bottom divider. */}
      {activeProject && density === "full" && (
          <div className="-mb-px flex items-center gap-0 overflow-x-auto">
            {VIEWS.map(({ key, labelKey, label, Icon }) => {
              const active = view === key;
              return (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-none border-b-2 px-4 py-2.5 text-sm transition-colors",
                    active
                      ? "border-primary font-medium text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  <span>{t(labelKey, { defaultValue: label })}</span>
                </button>
              );
            })}
          </div>
      )}
      </div>

      {/* body */}
      {loading && myProjects.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-card py-20 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("modules.tasks.loading", { defaultValue: "Yuklanmoqda…" })}
        </div>
      ) : myProjects.length === 0 ? (
        <EmptyProjects onNew={() => setNewProjectOpen(true)} />
      ) : showProjectList ? (
        <ProjectList
          projects={myProjects}
          cards={cardsAll}
          onOpen={(p) => setProjectUrl(p.key)}
          onNew={() => setNewProjectOpen(true)}
        />
      ) : !activeLoaded ? (
        // Switcher stays usable above; only the board area shows the loader
        // while this project's cards are fetched on demand.
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-card py-20 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t("modules.tasks.loading", { defaultValue: "Yuklanmoqda…" })}
        </div>
      ) : view === "reports" ? (
        <ReportsView project={activeProject!} cards={projectCards} columns={columns} members={members} />
      ) : view === "board" ? (
        <KanbanView project={activeProject!} columns={columns} cards={filteredCards} members={members} config={config} counts={counts} query={q} swimlane={swimlane} perms={perms} myRole={myRole} onOpen={openCard} />
      ) : view === "list" ? (
        <ListView project={activeProject!} columns={columns} cards={filteredCards} members={members} onOpen={openCard} />
      ) : view === "calendar" ? (
        <CalendarView project={activeProject!} cards={filteredCards} members={members} onOpen={openCard} />
      ) : (
        <TimelineView project={activeProject!} cards={filteredCards} members={members} onOpen={openCard} />
      )}

      {/* drawer + dialogs */}
      <TaskSpotlight
        open={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        cards={cardsAll}
        projects={myProjects}
        columns={columnsAll}
        members={members}
        onOpen={(id) => { openCard(id); setSpotlightOpen(false); }}
      />
      <TaskDrawer cardId={cardUrl || null} onClose={() => setCardUrl("")} />
      <NewProjectDialog
        companyId={companyId}
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreated={(id) => setProjectUrl(id)}
      />
      {activeProject && <CreateTaskDialog project={activeProject} open={createOpen} onClose={() => setCreateOpen(false)} />}
    </div>
  );
}

function EmptyProjects({ onNew }: { onNew: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border bg-card py-20 text-center animate-in fade-in-50 zoom-in-95 duration-300">
      <div className="grid size-16 place-items-center rounded-full bg-muted">
        <ListTodo className="size-8 text-muted-foreground" />
      </div>
      <div>
        <div className="text-base font-semibold">{t("modules.tasks.project.emptyTitle", { defaultValue: "Bu firmada loyiha yo'q" })}</div>
        <div className="mt-1 text-sm text-muted-foreground">{t("modules.tasks.project.emptyHint", { defaultValue: "Vazifalarni boshqarish uchun loyiha yarating." })}</div>
      </div>
      <Button onClick={onNew} className="gap-1.5"><Plus className="size-4" /> {t("modules.tasks.project.new", { defaultValue: "Yangi loyiha" })}</Button>
    </div>
  );
}
