import { create } from "zustand";
import { persist } from "zustand/middleware";
import i18n from "@/shared/i18n";
import {
  DEFAULT_CARD_CONFIG,
  type Attachment,
  type Card,
  type CardConfig,
  type CardType,
  type EpicRef,
  type TaskRole,
  type Column,
  type ColumnCategory,
  type Comment,
  type HistoryEntry,
  type HistoryKind,
  type Member,
  type Priority,
  type Project,
  type Reaction,
  SWATCHES,
} from "./model";
import { uid } from "./util";
import { imageThumbFile } from "./attachments";
import { uploadToFolder } from "@/shared/files/media";
import * as boardApi from "../board-api";

// ─────────────────────────────────────────────────────────────────────────────
// Server-persisted board store. The board DATA (projects, columns, cards,
// comments) lives on the server (see ../board-api.ts) so it is shared across
// users/devices; `loadBoard` GETs ONE project's columns/cards/comments at a
// time (lazily, tracked in `loadedProjects`) while always refreshing the full
// project list, and every mutation stays synchronous + optimistic locally,
// then fire-and-forgets an idempotent UPSERT.
// Only the UI-only `cardConfig` pref survives reload (localStorage). `history`
// is client-side only (not part of the server contract).
// ─────────────────────────────────────────────────────────────────────────────

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── realtime: messages the board socket forwards to `applyRemote` ────────────
// The `data` payloads are the SAME camelCase shapes the store already holds.
export type RemoteEvent =
  | { type: "card.upsert"; data: Card }
  | { type: "card.delete"; id: string }
  | { type: "column.upsert"; data: Column }
  | { type: "column.delete"; id: string }
  | { type: "project.upsert"; data: Project }
  | { type: "project.delete"; id: string }
  | { type: "comment.upsert"; data: Comment }
  | { type: "comment.delete"; id: string };

export type NewCardInput = {
  projectId: string;
  columnId: string;
  title: string;
  description?: string;
  priority?: Priority;
  assigneeIds?: string[];
  reporterId?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  labels?: string[];
  parentId?: string | null;
  attachments?: Attachment[];
  cover?: string | null;
  type?: CardType;
  epicId?: string | null;
};

type TasksState = {
  projects: Project[];
  columns: Column[];
  cards: Card[];
  comments: Comment[];
  history: HistoryEntry[];
  members: Member[];
  currentUserId: string | null;
  cardConfig: CardConfig;
  /** Cross-project epics for the whole company (picker + chips). */
  epics: EpicRef[];
  /** Tenant-wide task permission roles (system + custom). */
  roles: TaskRole[];

  // ── server sync bookkeeping ──
  currentCompanyId: number | null;
  loading: boolean;
  /** Ids of projects whose columns/cards/comments are loaded into the store. */
  loadedProjects: Set<string>;
  /** Card ids briefly flashing green (just created — locally or over the wire). */
  flashCards: Set<string>;

  // ── bootstrap ──
  ensureUser: (username: string) => string;
  loadBoard: (companyId: number, projectId?: string) => Promise<void>;
  loadEpics: (companyId: number) => Promise<void>;
  loadRoles: (companyId: number) => Promise<void>;
  saveRole: (companyId: number, role: TaskRole) => void;
  removeRole: (companyId: number, id: string) => void;
  isProjectLoaded: (projectId: string) => boolean;

  // ── projects ──
  createProject: (input: {
    companyId: number | null;
    name: string;
    key: string;
    color?: string;
    avatar?: string | null;
    private?: boolean;
    memberIds?: string[];
    defaultAssigneeId?: string | null;
    defaultReporterId?: string | null;
  }) => string;
  updateProject: (id: string, patch: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // ── columns ──
  addColumn: (projectId: string, name: string, category?: ColumnCategory) => string;
  updateColumn: (id: string, patch: Partial<Column>) => void;
  deleteColumn: (id: string) => void;
  reorderColumns: (projectId: string, orderedIds: string[]) => void;

  // ── cards ──
  createCard: (input: NewCardInput) => string;
  duplicateCard: (srcId: string) => string;
  updateCard: (id: string, patch: Partial<Card>) => void;
  moveCard: (cardId: string, toColumnId: string, toIndex: number) => void;
  deleteCard: (id: string) => void;
  setPriority: (id: string, p: Priority) => void;
  toggleAssignee: (id: string, memberId: string) => void;
  /** Single assignee per task (Jira-style): sets the sole assignee, or clears it. */
  setAssignee: (id: string, memberId: string | null) => void;
  setReporter: (id: string, memberId: string | null) => void;
  toggleWatcher: (id: string, memberId: string) => void;
  toggleLabel: (id: string, label: string) => void;
  /** Link / unlink a Wiki page to a card. */
  toggleWikiLink: (id: string, pageId: string) => void;
  setDates: (id: string, patch: { startDate?: string | null; dueDate?: string | null }) => void;
  setParent: (id: string, parentId: string | null) => void;

  // ── comments ──
  addComment: (cardId: string, body: string) => void;
  editComment: (commentId: string, body: string) => void;
  deleteComment: (commentId: string) => void;
  reactComment: (commentId: string, reaction: Reaction) => void;

  // ── members ──
  addMember: (name: string) => string;
  /** Replace the roster with the real company members (keeps the current user). */
  setMembers: (members: Member[]) => void;
  setMyAvatar: (avatar: string | null) => void;

  // ── config ──
  setCardConfig: (patch: Partial<CardConfig>) => void;

  // ── realtime remote-apply (NO echo: these never fire put*/delete*) ──
  applyRemote: (evt: RemoteEvent) => void;
  upsertCardRemote: (card: Card) => void;
  removeCardRemote: (id: string) => void;
  upsertColumnRemote: (column: Column) => void;
  removeColumnRemote: (id: string) => void;
  upsertProjectRemote: (project: Project) => void;
  removeProjectRemote: (id: string) => void;
  upsertCommentRemote: (comment: Comment) => void;
  removeCommentRemote: (id: string) => void;
};

function logHistory(
  history: HistoryEntry[],
  userId: string | null,
  cardId: string,
  kind: HistoryKind,
  from?: string | null,
  to?: string | null,
): HistoryEntry[] {
  return [
    ...history,
    { id: uid(), cardId, userId: userId ?? "system", at: now(), kind, from: from ?? null, to: to ?? null },
  ];
}

/** Rebuild the `order` field (0..n) of one column's cards in their current sequence. */
function renumber(cards: Card[], columnId: string): Card[] {
  const inCol = cards
    .filter((c) => c.columnId === columnId)
    .sort((a, b) => a.order - b.order);
  const orderById = new Map(inCol.map((c, i) => [c.id, i]));
  return cards.map((c) => (orderById.has(c.id) ? { ...c, order: orderById.get(c.id)! } : c));
}

export const useTasksStore = create<TasksState>()(
  persist(
    (set, get) => {
      // ── server-sync helpers (fire-and-forget; the local `set` already ran) ──
      const err = (label: string) => (e: unknown) => console.error(`[tasks] ${label} failed`, e);

      // Resolves `true` once the project row is safely on the server. Columns and
      // cards FK-reference `km.task_projects(id)`, so anything that depends on the
      // project existing MUST chain off this promise instead of firing alongside
      // it — a parallel write loses the FK race (23503) and is silently dropped
      // server-side while the optimistic local copy survives until the next load.
      const pushProject = (id: string): Promise<boolean> => {
        const cid = get().currentCompanyId;
        if (cid == null) return Promise.resolve(false);
        const p = get().projects.find((x) => x.id === id);
        if (!p) return Promise.resolve(false);
        return boardApi.putProject(cid, p).then(
          () => true,
          (e) => { err("putProject")(e); return false; },
        );
      };
      const pushColumn = (id: string) => {
        const cid = get().currentCompanyId;
        if (cid == null) return;
        const c = get().columns.find((x) => x.id === id);
        if (c) boardApi.putColumn(cid, c).catch(err("putColumn"));
      };
      const pushCard = (id: string) => {
        const cid = get().currentCompanyId;
        if (cid == null) return;
        const c = get().cards.find((x) => x.id === id);
        if (c) boardApi.putCard(cid, c).catch(err("putCard"));
      };
      const pushCards = (ids: string[]) => ids.forEach(pushCard);

      // One-time cleanup: legacy card covers were stored inline as base64 data:
      // URLs. Convert every base64 cover that has no uploaded thumbnail yet into
      // a Files-module thumbnail (files: ref) in the background, so the board
      // never paints base64. Idempotent (skips ones already migrated) + throttled.
      async function migrateBase64Covers(companyId: number, projectId: string) {
        const targets = get().cards.filter(
          (c) =>
            c.projectId === projectId &&
            c.cover != null &&
            c.attachments.some((a) => a.id === c.cover && a.url.startsWith("data:") && !a.thumbUrl),
        );
        if (!targets.length) return;
        const project = get().projects.find((p) => p.id === projectId);
        const folder = ["Tasks", project?.name ?? "Boshqa", "covers"];
        for (const card of targets) {
          const att = card.attachments.find((a) => a.id === card.cover);
          if (!att || !att.url.startsWith("data:") || att.thumbUrl) continue;
          try {
            const blob = await (await fetch(att.url)).blob();
            const file = new File([blob], att.name || "cover.jpg", { type: att.mime || blob.type });
            const thumb = await imageThumbFile(file, 800);
            const { ref } = await uploadToFolder(companyId, folder, thumb);
            set((s) => ({
              cards: s.cards.map((c) =>
                c.id === card.id
                  ? { ...c, attachments: c.attachments.map((a) => (a.id === att.id ? { ...a, thumbUrl: ref } : a)) }
                  : c,
              ),
            }));
            pushCard(card.id);
          } catch {
            /* leave as-is; a later load retries */
          }
        }
      }
      const pushComment = (id: string) => {
        const cid = get().currentCompanyId;
        if (cid == null) return;
        const c = get().comments.find((x) => x.id === id);
        if (c) boardApi.putComment(cid, c).catch(err("putComment"));
      };
      // Briefly mark a card as "just created" so the UI can flash it green,
      // then drop it from the set after the keyframe finishes (~1.2s).
      const flashCard = (id: string) => {
        set((s) => {
          if (s.flashCards.has(id)) return s;
          const flashCards = new Set(s.flashCards);
          flashCards.add(id);
          return { flashCards };
        });
        setTimeout(() => {
          set((s) => {
            if (!s.flashCards.has(id)) return s;
            const flashCards = new Set(s.flashCards);
            flashCards.delete(id);
            return { flashCards };
          });
        }, 1200);
      };

      // Force a re-fetch of one project (used to recover from a failed mutation):
      // evict it from `loadedProjects` so `loadBoard`'s guard allows the refetch.
      const resyncProject = (projectId: string | undefined) => {
        const cid = get().currentCompanyId;
        if (cid == null || !projectId) return;
        set((st) => {
          if (!st.loadedProjects.has(projectId)) return st;
          const loadedProjects = new Set(st.loadedProjects);
          loadedProjects.delete(projectId);
          return { loadedProjects };
        });
        get().loadBoard(cid, projectId);
      };

      return {
        projects: [],
        columns: [],
        cards: [],
        comments: [],
        history: [],
        members: [],
        epics: [],
        roles: [],
        currentUserId: null,
        cardConfig: DEFAULT_CARD_CONFIG,

        currentCompanyId: null,
        loading: false,
        loadedProjects: new Set<string>(),
        flashCards: new Set<string>(),

        ensureUser: (username) => {
          const id = `me:${username || "guest"}`;
          set((s) => {
            const next: Partial<TasksState> = { currentUserId: id };
            if (!s.members.some((m) => m.id === id)) {
              const nm = (username || "Men").replace(/^\w/, (c) => c.toUpperCase());
              next.members = [{ id, name: nm, color: "#6366f1", role: "owner" }, ...s.members];
            }
            return next;
          });
          return id;
        },

        // Lazily load ONE project's board data for a company. The `projects`
        // list (switcher metadata) is always replaced with the full server
        // list, but only `loaded_project`'s columns/cards/comments come back —
        // they are MERGED into the store so already-loaded OTHER projects stay
        // intact. Omitting `projectId` loads the first project. If the company
        // has no projects (`loaded_project` null) we seed a default board.
        // Guards against double-load (StrictMode / rapid re-renders) and skips
        // a refetch when the requested project is already loaded.
        loadBoard: async (companyId, projectId) => {
          const s = get();
          const companyChanged = s.currentCompanyId !== companyId;

          if (!companyChanged) {
            if (s.loading) return; // a load is already in flight
            // Requested project already loaded → nothing to fetch.
            if (projectId && s.loadedProjects.has(projectId)) return;
            // No specific project asked for, but we already loaded one → done.
            if (!projectId && s.loadedProjects.size > 0) return;
          }

          // Company switch: clear the in-memory board before loading the new one.
          if (companyChanged) {
            set({
              currentCompanyId: companyId,
              projects: [],
              columns: [],
              cards: [],
              comments: [],
              history: [],
              loadedProjects: new Set<string>(),
              loading: true,
            });
          } else {
            set({ loading: true });
          }

          try {
            const board = await boardApi.getBoard(companyId, projectId || undefined);
            const loaded = board.loaded_project;

            set((st) => {
              const projects = board.projects ?? [];
              if (loaded == null) return { projects };
              // Replace just the loaded project's slice; keep other projects'.
              const staleCardIds = new Set(st.cards.filter((c) => c.projectId === loaded).map((c) => c.id));
              return {
                projects,
                columns: [...st.columns.filter((c) => c.projectId !== loaded), ...(board.columns ?? [])],
                cards: [...st.cards.filter((c) => c.projectId !== loaded), ...(board.cards ?? [])],
                comments: [...st.comments.filter((c) => !staleCardIds.has(c.cardId)), ...(board.comments ?? [])],
              };
            });

            // Company has no projects yet → seed a default board (creates + PUTs).
            // `loaded == null` alone is NOT enough: the server also reports null
            // when a specific (stale / deleted) project was requested, and
            // seeding a demo board on top of an existing company would be wrong.
            if (loaded == null && (board.projects ?? []).length === 0) seedBoard(companyId);

            set((st) => {
              if (loaded == null || st.loadedProjects.has(loaded)) return { loading: false };
              const loadedProjects = new Set(st.loadedProjects);
              loadedProjects.add(loaded);
              return { loading: false, loadedProjects };
            });

            // Background: heal any legacy base64 covers into uploaded thumbnails.
            if (loaded != null) void migrateBase64Covers(companyId, loaded);
          } catch (e) {
            console.error("[tasks] loadBoard failed", e);
            set({ loading: false });
          }
        },

        loadEpics: async (companyId) => {
          try {
            const epics = await boardApi.getEpics(companyId);
            set({ epics });
          } catch (e) {
            console.error("[tasks] loadEpics failed", e);
          }
        },

        loadRoles: async (companyId) => {
          try {
            const roles = await boardApi.getRoles(companyId);
            set({ roles });
          } catch (e) {
            console.error("[tasks] loadRoles failed", e);
          }
        },
        saveRole: (companyId, role) => {
          set((s) => ({
            roles: s.roles.some((r) => r.id === role.id)
              ? s.roles.map((r) => (r.id === role.id ? role : r))
              : [...s.roles, role],
          }));
          boardApi.putRole(companyId, role).catch(err("putRole"));
        },
        removeRole: (companyId, id) => {
          set((s) => ({ roles: s.roles.filter((r) => r.id !== id) }));
          boardApi.deleteRole(companyId, id).catch(err("deleteRole"));
        },

        isProjectLoaded: (projectId) => get().loadedProjects.has(projectId),

        createProject: ({ companyId, name, key, color, avatar, private: priv, memberIds, defaultAssigneeId, defaultReporterId }) => {
          const id = uid();
          const me = get().currentUserId;
          const project: Project = {
            id,
            companyId,
            key: (key || name.slice(0, 4)).toUpperCase().replace(/[^A-Z0-9]/g, "") || "PRJ",
            name: name.trim() || "Loyiha",
            description: "",
            avatar: avatar ?? null,
            color: color || SWATCHES[Math.floor(get().projects.length) % SWATCHES.length],
            private: priv ?? true,
            memberIds: memberIds ?? (me ? [me] : []),
            ownerId: me ?? "system",
            // The creator is the project's default assignee (req: new tasks
            // pre-select the creator until the user picks someone else).
            defaultAssigneeId: defaultAssigneeId ?? me ?? null,
            defaultReporterId: defaultReporterId ?? me ?? null,
            seq: 0,
            createdAt: now(),
          };
          // Default column names follow the CURRENT UI language (seed-time),
          // not a hardcoded locale.
          const cols: Column[] = [
            { category: "todo" as ColumnCategory, color: "#64748b" },
            { category: "inprogress" as ColumnCategory, color: "#0ea5e9" },
            { category: "done" as ColumnCategory, color: "#22c55e" },
          ].map((c, i) => ({
            id: uid(), projectId: id, order: i,
            name: i18n.t(`modules.tasks.category.${c.category}`),
            ...c,
          }));
          set((s) => {
            // A freshly created project's columns/cards live in the store already.
            const loadedProjects = new Set(s.loadedProjects);
            loadedProjects.add(id);
            return { projects: [...s.projects, project], columns: [...s.columns, ...cols], loadedProjects };
          });
          // Persist with the project's OWN companyId — NOT via pushProject/
          // pushColumn, which read `currentCompanyId` and silently no-op while
          // it is still null (board not loaded yet / store just re-created).
          // That path dropped the entire project: it lived in this tab only and
          // was gone on the next reload.
          //
          // Ordered, not parallel: the columns FK-reference the project row, so
          // firing them together raced the constraint and lost whichever column
          // reached the DB first — the board then came back short on the next
          // load, and the MCP tools saw column ids that never existed.
          // Fall back to the loaded board's company only if the caller had none.
          const cid = companyId ?? get().currentCompanyId;
          if (cid != null) {
            void boardApi
              .putProject(cid, project)
              .then(() => Promise.all(cols.map((c) => boardApi.putColumn(cid, c))))
              .catch(err("createProject"));
          } else {
            console.error("[tasks] createProject: no company — project not persisted", id);
          }
          return id;
        },

        updateProject: (id, patch) => {
          set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
          pushProject(id);
        },

        deleteProject: (id) => {
          set((s) => {
            const colIds = new Set(s.columns.filter((c) => c.projectId === id).map((c) => c.id));
            const cardIds = new Set(s.cards.filter((c) => c.projectId === id).map((c) => c.id));
            const loadedProjects = new Set(s.loadedProjects);
            loadedProjects.delete(id);
            return {
              projects: s.projects.filter((p) => p.id !== id),
              columns: s.columns.filter((c) => !colIds.has(c.id)),
              cards: s.cards.filter((c) => !cardIds.has(c.id)),
              comments: s.comments.filter((c) => !cardIds.has(c.cardId)),
              history: s.history.filter((h) => !cardIds.has(h.cardId)),
              loadedProjects,
            };
          });
          // Server cascades columns/cards/comments via FK on project delete.
          const cid = get().currentCompanyId;
          if (cid != null) boardApi.deleteProject(cid, id).catch(err("deleteProject"));
        },

        addColumn: (projectId, name, category = "todo") => {
          const id = uid();
          set((s) => {
            const order = s.columns.filter((c) => c.projectId === projectId).length;
            const color = SWATCHES[order % SWATCHES.length];
            return { columns: [...s.columns, { id, projectId, name: name.trim() || "Yangi", color, category, order }] };
          });
          pushColumn(id);
          return id;
        },

        updateColumn: (id, patch) => {
          set((s) => ({ columns: s.columns.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
          pushColumn(id);
        },

        deleteColumn: (id) => {
          const before = get();
          const col = before.columns.find((c) => c.id === id);
          // Card ids that will be reassigned to the fallback column (not deleted).
          const movedCardIds = before.cards.filter((c) => c.columnId === id).map((c) => c.id);
          set((s) => {
            const target = s.columns.find((c) => c.id === id);
            if (!target) return s;
            const siblings = s.columns
              .filter((c) => c.projectId === target.projectId && c.id !== id)
              .sort((a, b) => a.order - b.order);
            const fallback = siblings[0]?.id;
            // Cards in the removed column move to the first surviving column (or vanish if none).
            const cards = fallback
              ? s.cards.map((c) => (c.columnId === id ? { ...c, columnId: fallback, columnEnteredAt: today() } : c))
              : s.cards.filter((c) => c.columnId !== id);
            return {
              columns: siblings.map((c, i) => ({ ...c, order: i })),
              cards: fallback ? renumber(cards, fallback) : cards,
            };
          });

          const cid = get().currentCompanyId;
          if (cid == null || !col) return;
          // Delete the column on the server (FK-cascades its cards), then
          // re-persist the surviving siblings (order shifted) and any cards
          // that were moved to the fallback column so they survive the cascade.
          boardApi
            .deleteColumn(cid, id)
            .then(() => {
              const cid2 = get().currentCompanyId;
              if (cid2 == null) return;
              get()
                .columns.filter((c) => c.projectId === col.projectId)
                .forEach((c) => boardApi.putColumn(cid2, c).catch(err("putColumn")));
              movedCardIds.forEach((cardId) => {
                const c = get().cards.find((x) => x.id === cardId);
                if (c) boardApi.putCard(cid2, c).catch(err("putCard"));
              });
            })
            .catch((e) => {
              err("deleteColumn")(e);
              resyncProject(col.projectId);
            });
        },

        reorderColumns: (projectId, orderedIds) => {
          set((s) => ({
            columns: s.columns.map((c) =>
              c.projectId === projectId && orderedIds.includes(c.id)
                ? { ...c, order: orderedIds.indexOf(c.id) }
                : c,
            ),
          }));
          orderedIds.forEach(pushColumn);
        },

        createCard: (input) => {
          const id = uid();
          const me = get().currentUserId;
          set((s) => {
            const project = s.projects.find((p) => p.id === input.projectId);
            const seq = (project?.seq ?? 0) + 1;
            const order = s.cards.filter((c) => c.columnId === input.columnId).length;
            const card: Card = {
              id,
              projectId: input.projectId,
              columnId: input.columnId,
              seq,
              title: input.title.trim(),
              type: input.type ?? "task",
              epicId: input.epicId ?? null,
              description: input.description ?? "",
              attachments: input.attachments ?? [],
              cover: input.cover ?? null,
              priority: input.priority ?? "medium",
              // No project-default fallback: if the caller didn't pick anyone,
              // the task stays UNASSIGNED (the dialog seeds its own default).
              assigneeIds: input.assigneeIds ?? [],
              reporterId: input.reporterId ?? project?.defaultReporterId ?? me,
              watcherIds: [],
              labels: input.labels ?? [],
              startDate: input.startDate ?? null,
              dueDate: input.dueDate ?? null,
              order,
              parentId: input.parentId ?? null,
              columnEnteredAt: today(),
              createdAt: now(),
              updatedAt: now(),
            };
            return {
              cards: [...s.cards, card],
              projects: s.projects.map((p) => (p.id === input.projectId ? { ...p, seq } : p)),
              history: logHistory(s.history, me, id, input.parentId ? "subtask" : "created"),
            };
          });
          // Persist the new card AND the project (its seq counter advanced).
          pushCard(id);
          pushProject(input.projectId);
          flashCard(id);
          return id;
        },

        duplicateCard: (srcId) => {
          const src = get().cards.find((c) => c.id === srcId);
          if (!src) return "";
          const id = uid();
          const me = get().currentUserId;
          set((s) => {
            const project = s.projects.find((p) => p.id === src.projectId);
            const seq = (project?.seq ?? 0) + 1;
            const order = s.cards.filter((c) => c.columnId === src.columnId).length;
            const card: Card = {
              ...src,
              id,
              seq,
              order,
              watcherIds: [],
              columnEnteredAt: today(),
              createdAt: now(),
              updatedAt: now(),
            };
            return {
              cards: [...s.cards, card],
              projects: s.projects.map((p) => (p.id === src.projectId ? { ...p, seq } : p)),
              history: logHistory(s.history, me, id, "created"),
            };
          });
          pushCard(id);
          pushProject(src.projectId);
          flashCard(id);
          return id;
        },

        updateCard: (id, patch) => {
          set((s) => {
            const prev = s.cards.find((c) => c.id === id);
            if (!prev) return s;
            let history = s.history;
            const me = s.currentUserId;
            if (patch.title != null && patch.title !== prev.title)
              history = logHistory(history, me, id, "renamed", prev.title, patch.title);
            if (patch.description != null && patch.description !== prev.description)
              history = logHistory(history, me, id, "described");
            return {
              cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: now() } : c)),
              history,
            };
          });
          pushCard(id);
        },

        moveCard: (cardId, toColumnId, toIndex) => {
          const fromColumnId = get().cards.find((c) => c.id === cardId)?.columnId;
          set((s) => {
            const card = s.cards.find((c) => c.id === cardId);
            if (!card) return s;
            const from = card.columnId;
            const changedColumn = from !== toColumnId;

            // Build the target column's sequence with the card inserted at toIndex.
            const target = s.cards
              .filter((c) => c.columnId === toColumnId && c.id !== cardId)
              .sort((a, b) => a.order - b.order);
            const idx = Math.max(0, Math.min(toIndex, target.length));
            const targetIds = target.map((c) => c.id);
            targetIds.splice(idx, 0, cardId);

            let cards = s.cards.map((c) => {
              if (c.id === cardId)
                return {
                  ...c,
                  columnId: toColumnId,
                  columnEnteredAt: changedColumn ? today() : c.columnEnteredAt,
                  updatedAt: now(),
                  order: targetIds.indexOf(cardId),
                };
              if (c.columnId === toColumnId) return { ...c, order: targetIds.indexOf(c.id) };
              return c;
            });
            if (changedColumn) cards = renumber(cards, from);

            const fromName = s.columns.find((c) => c.id === from)?.name ?? null;
            const toName = s.columns.find((c) => c.id === toColumnId)?.name ?? null;
            const history = changedColumn
              ? logHistory(s.history, s.currentUserId, cardId, "moved", fromName, toName)
              : s.history;
            return { cards, history };
          });
          // Reordering shifts sibling `order` too → persist every card in the
          // affected column(s), not just the moved one.
          const affected = new Set<string>();
          for (const c of get().cards)
            if (c.columnId === toColumnId || c.columnId === fromColumnId) affected.add(c.id);
          pushCards([...affected]);
        },

        deleteCard: (id) => {
          const before = get();
          const projectId = before.cards.find((c) => c.id === id)?.projectId;
          // Subtasks of the deleted card are promoted to top-level (parentId cleared).
          const childIds = before.cards.filter((c) => c.parentId === id).map((c) => c.id);
          set((s) => ({
            cards: s.cards.filter((c) => c.id !== id).map((c) => (c.parentId === id ? { ...c, parentId: null } : c)),
            comments: s.comments.filter((c) => c.cardId !== id),
            history: s.history.filter((h) => h.cardId !== id),
          }));
          const cid = get().currentCompanyId;
          if (cid == null) return;
          // Server FK-cascades this card's comments; re-persist promoted children.
          boardApi
            .deleteCard(cid, id)
            .then(() => {
              const cid2 = get().currentCompanyId;
              if (cid2 == null) return;
              childIds.forEach((childId) => {
                const c = get().cards.find((x) => x.id === childId);
                if (c) boardApi.putCard(cid2, c).catch(err("putCard"));
              });
            })
            .catch((e) => {
              err("deleteCard")(e);
              resyncProject(projectId);
            });
        },

        setPriority: (id, p) => {
          set((s) => {
            const prev = s.cards.find((c) => c.id === id);
            if (!prev || prev.priority === p) return s;
            return {
              cards: s.cards.map((c) => (c.id === id ? { ...c, priority: p, updatedAt: now() } : c)),
              history: logHistory(s.history, s.currentUserId, id, "priority", prev.priority, p),
            };
          });
          pushCard(id);
        },

        toggleAssignee: (id, memberId) => {
          set((s) => {
            const prev = s.cards.find((c) => c.id === id);
            if (!prev) return s;
            const has = prev.assigneeIds.includes(memberId);
            const assigneeIds = has
              ? prev.assigneeIds.filter((m) => m !== memberId)
              : [...prev.assigneeIds, memberId];
            return {
              cards: s.cards.map((c) => (c.id === id ? { ...c, assigneeIds, updatedAt: now() } : c)),
              history: logHistory(s.history, s.currentUserId, id, "assignee", has ? memberId : null, has ? null : memberId),
            };
          });
          pushCard(id);
        },

        setAssignee: (id, memberId) => {
          set((s) => {
            const prev = s.cards.find((c) => c.id === id);
            if (!prev) return s;
            const before = prev.assigneeIds[0] ?? null;
            if (before === memberId) return s;
            return {
              cards: s.cards.map((c) => (c.id === id ? { ...c, assigneeIds: memberId ? [memberId] : [], updatedAt: now() } : c)),
              history: logHistory(s.history, s.currentUserId, id, "assignee", before, memberId),
            };
          });
          pushCard(id);
        },

        setReporter: (id, memberId) => {
          set((s) => ({
            cards: s.cards.map((c) => (c.id === id ? { ...c, reporterId: memberId, updatedAt: now() } : c)),
            history: logHistory(s.history, s.currentUserId, id, "reporter", null, memberId),
          }));
          pushCard(id);
        },

        toggleWatcher: (id, memberId) => {
          set((s) => {
            const prev = s.cards.find((c) => c.id === id);
            if (!prev) return s;
            const has = prev.watcherIds.includes(memberId);
            const watcherIds = has
              ? prev.watcherIds.filter((m) => m !== memberId)
              : [...prev.watcherIds, memberId];
            return { cards: s.cards.map((c) => (c.id === id ? { ...c, watcherIds, updatedAt: now() } : c)) };
          });
          pushCard(id);
        },

        toggleLabel: (id, label) => {
          set((s) => {
            const prev = s.cards.find((c) => c.id === id);
            if (!prev) return s;
            const has = prev.labels.includes(label);
            const labels = has ? prev.labels.filter((l) => l !== label) : [...prev.labels, label];
            return {
              cards: s.cards.map((c) => (c.id === id ? { ...c, labels, updatedAt: now() } : c)),
              history: logHistory(s.history, s.currentUserId, id, "label", has ? label : null, has ? null : label),
            };
          });
          pushCard(id);
        },

        toggleWikiLink: (id, pageId) => {
          set((s) => {
            const prev = s.cards.find((c) => c.id === id);
            if (!prev) return s;
            const cur = prev.wikiPageIds ?? [];
            const wikiPageIds = cur.includes(pageId) ? cur.filter((p) => p !== pageId) : [...cur, pageId];
            return { cards: s.cards.map((c) => (c.id === id ? { ...c, wikiPageIds, updatedAt: now() } : c)) };
          });
          pushCard(id);
        },

        setDates: (id, patch) => {
          set((s) => {
            const prev = s.cards.find((c) => c.id === id);
            if (!prev) return s;
            let history = s.history;
            if ("dueDate" in patch && patch.dueDate !== prev.dueDate)
              history = logHistory(history, s.currentUserId, id, "due", prev.dueDate, patch.dueDate ?? null);
            if ("startDate" in patch && patch.startDate !== prev.startDate)
              history = logHistory(history, s.currentUserId, id, "start", prev.startDate, patch.startDate ?? null);
            return {
              cards: s.cards.map((c) => (c.id === id ? { ...c, ...patch, updatedAt: now() } : c)),
              history,
            };
          });
          pushCard(id);
        },

        setParent: (id, parentId) => {
          set((s) => ({ cards: s.cards.map((c) => (c.id === id ? { ...c, parentId, updatedAt: now() } : c)) }));
          pushCard(id);
        },

        addComment: (cardId, body) => {
          const text = body.trim();
          if (!text) return;
          const id = uid();
          set((s) => {
            const comment: Comment = {
              id,
              cardId,
              authorId: s.currentUserId ?? "system",
              body: text,
              createdAt: now(),
              reactions: {},
            };
            return {
              comments: [...s.comments, comment],
              history: logHistory(s.history, s.currentUserId, cardId, "commented"),
            };
          });
          pushComment(id);
        },

        editComment: (commentId, body) => {
          set((s) => ({
            comments: s.comments.map((c) => (c.id === commentId ? { ...c, body: body.trim(), editedAt: now() } : c)),
          }));
          pushComment(commentId);
        },

        deleteComment: (commentId) => {
          set((s) => ({ comments: s.comments.filter((c) => c.id !== commentId) }));
          const cid = get().currentCompanyId;
          if (cid != null) boardApi.deleteComment(cid, commentId).catch(err("deleteComment"));
        },

        reactComment: (commentId, reaction) => {
          set((s) => {
            const me = s.currentUserId ?? "system";
            return {
              comments: s.comments.map((c) => {
                if (c.id !== commentId) return c;
                const reactions = { ...c.reactions };
                if (reactions[me] === reaction) delete reactions[me];
                else reactions[me] = reaction;
                return { ...c, reactions };
              }),
            };
          });
          pushComment(commentId);
        },

        addMember: (name) => {
          const id = uid();
          set((s) => ({ members: [...s.members, { id, name: name.trim() || "A'zo", color: null }] }));
          return id;
        },

        // Replace the roster with the live AIBA members, keeping the local
        // current-user entry (used for comment/history attribution) at the front.
        setMembers: (incoming) =>
          set((s) => {
            const meId = s.currentUserId;
            const meEntry = s.members.find((m) => m.id === meId);
            const rest = incoming.filter((m) => m.id !== meId);
            const next = meEntry ? [meEntry, ...rest] : rest;
            // Avoid a pointless state write (keeps referential stability for selectors).
            const same =
              next.length === s.members.length &&
              next.every((m, i) => s.members[i]?.id === m.id && s.members[i]?.name === m.name);
            return same ? s : { members: next };
          }),

        setMyAvatar: (avatar) =>
          set((s) => ({ members: s.members.map((m) => (m.id === s.currentUserId ? { ...m, avatar } : m)) })),

        setCardConfig: (patch) => set((s) => ({ cardConfig: { ...s.cardConfig, ...patch } })),

        // ── realtime remote-apply ───────────────────────────────────────────
        // Apply a change that ALREADY happened on the server. These NEVER call
        // the HTTP put*/delete* helpers (that would echo the change back and
        // create a feedback loop). Upserts are replace-or-insert by id.
        applyRemote: (evt) => {
          switch (evt.type) {
            case "card.upsert": get().upsertCardRemote(evt.data); break;
            case "card.delete": get().removeCardRemote(evt.id); break;
            case "column.upsert": get().upsertColumnRemote(evt.data); break;
            case "column.delete": get().removeColumnRemote(evt.id); break;
            case "project.upsert": get().upsertProjectRemote(evt.data); break;
            case "project.delete": get().removeProjectRemote(evt.id); break;
            case "comment.upsert": get().upsertCommentRemote(evt.data); break;
            case "comment.delete": get().removeCommentRemote(evt.id); break;
          }
        },

        // Scope guard: only apply if the card's project is loaded (otherwise the
        // user will fetch it fresh when they open that project). A card whose id
        // isn't already present is NEW → flash it green.
        upsertCardRemote: (card) => {
          // Defensive: a remote payload may omit array/text fields — default
          // them so a partial broadcast can never crash the card render.
          const c: Card = {
            ...card,
            assigneeIds: card.assigneeIds ?? [],
            watcherIds: card.watcherIds ?? [],
            labels: card.labels ?? [],
            wikiPageIds: card.wikiPageIds ?? [],
            attachments: card.attachments ?? [],
            cover: card.cover ?? null,
            type: card.type ?? "task",
            epicId: card.epicId ?? null,
            description: card.description ?? "",
            priority: card.priority ?? "medium",
          };
          const st = get();
          if (!st.loadedProjects.has(c.projectId)) return;
          const isNew = !st.cards.some((x) => x.id === c.id);
          set((s) => ({
            cards: isNew ? [...s.cards, c] : s.cards.map((x) => (x.id === c.id ? c : x)),
          }));
          if (isNew) flashCard(c.id);
        },

        removeCardRemote: (id) =>
          set((s) => ({
            cards: s.cards.filter((c) => c.id !== id),
            comments: s.comments.filter((c) => c.cardId !== id),
            history: s.history.filter((h) => h.cardId !== id),
          })),

        upsertColumnRemote: (column) =>
          set((s) => {
            if (!s.loadedProjects.has(column.projectId)) return s;
            const exists = s.columns.some((c) => c.id === column.id);
            return {
              columns: exists
                ? s.columns.map((c) => (c.id === column.id ? column : c))
                : [...s.columns, column],
            };
          }),

        removeColumnRemote: (id) =>
          set((s) => ({ columns: s.columns.filter((c) => c.id !== id) })),

        // Projects always apply (the switcher list must stay live). A remote NEW
        // project is NOT added to loadedProjects — its board is fetched on open.
        upsertProjectRemote: (project) =>
          set((s) => {
            const p: Project = { ...project, description: project.description ?? "", memberIds: project.memberIds ?? [] };
            const exists = s.projects.some((x) => x.id === p.id);
            return {
              projects: exists
                ? s.projects.map((x) => (x.id === p.id ? p : x))
                : [...s.projects, p],
            };
          }),

        // A remote project delete evicts it from loadedProjects and drops its
        // columns/cards/comments/history.
        removeProjectRemote: (id) =>
          set((s) => {
            const cardIds = new Set(s.cards.filter((c) => c.projectId === id).map((c) => c.id));
            const loadedProjects = new Set(s.loadedProjects);
            loadedProjects.delete(id);
            return {
              projects: s.projects.filter((p) => p.id !== id),
              columns: s.columns.filter((c) => c.projectId !== id),
              cards: s.cards.filter((c) => c.projectId !== id),
              comments: s.comments.filter((c) => !cardIds.has(c.cardId)),
              history: s.history.filter((h) => !cardIds.has(h.cardId)),
              loadedProjects,
            };
          }),

        // Scope guard via the parent card: only apply if that card is loaded.
        upsertCommentRemote: (comment) =>
          set((s) => {
            const card = s.cards.find((c) => c.id === comment.cardId);
            if (!card || !s.loadedProjects.has(card.projectId)) return s;
            const exists = s.comments.some((c) => c.id === comment.id);
            return {
              comments: exists
                ? s.comments.map((c) => (c.id === comment.id ? comment : c))
                : [...s.comments, comment],
            };
          }),

        removeCommentRemote: (id) =>
          set((s) => ({ comments: s.comments.filter((c) => c.id !== id) })),
      };

      // ── seed ────────────────────────────────────────────────────────────────
      // Build a shared starter board for an empty company: a default project,
      // its columns and a few demo cards. Applied locally AND pushed to the
      // server so every user of the company sees the same seed. No mock people —
      // real members are pulled live from AIBA (see setMembers / useMembers).
      function seedBoard(companyId: number) {
        const me = get().currentUserId ?? "system";

        const projectId = uid();
        const project: Project = {
          id: projectId,
          companyId,
          key: "AIBA",
          name: "Umumiy loyiha",
          description: "",
          color: "#6366f1",
          private: false,
          memberIds: [me],
          ownerId: me,
          defaultReporterId: me,
          seq: 0,
          createdAt: now(),
        };

        // Names in the current UI language (seed-time), not hardcoded Uzbek.
        const colDefs: { key: string; cat: ColumnCategory; color: string }[] = [
          { key: "todo", cat: "todo", color: "#64748b" },
          { key: "inprogress", cat: "inprogress", color: "#0ea5e9" },
          { key: "review", cat: "inprogress", color: "#a855f7" },
          { key: "done", cat: "done", color: "#22c55e" },
        ];
        const columns: Column[] = colDefs.map((c, i) => ({
          id: uid(),
          projectId,
          name: i18n.t(`modules.tasks.category.${c.key}`),
          color: c.color,
          category: c.cat,
          order: i,
        }));

        let seq = 0;
        const mk = (columnIndex: number, title: string, extra: Partial<Card> = {}): Card => {
          seq += 1;
          return {
            id: uid(),
            projectId,
            columnId: columns[columnIndex].id,
            seq,
            title,
            type: extra.type ?? "task",
            epicId: extra.epicId ?? null,
            description: extra.description ?? "",
            priority: extra.priority ?? "medium",
            assigneeIds: extra.assigneeIds ?? [],
            reporterId: extra.reporterId ?? me,
            watcherIds: extra.watcherIds ?? [],
            labels: extra.labels ?? [],
            attachments: extra.attachments ?? [],
            cover: extra.cover ?? null,
            startDate: extra.startDate ?? null,
            dueDate: extra.dueDate ?? null,
            order: 0,
            parentId: extra.parentId ?? null,
            columnEnteredAt: today(),
            createdAt: now(),
            updatedAt: now(),
          };
        };

        const c1 = mk(0, "Kontragentlar reyestrini import qilish", {
          priority: "high",
          labels: ["backend"],
          dueDate: addDays(3),
        });
        const c2 = mk(0, "Yangi hisob-faktura shablonini tayyorlash", {
          priority: "medium",
          labels: ["design"],
          dueDate: addDays(6),
        });
        const c3 = mk(1, "Bank integratsiyasini test qilish", {
          priority: "urgent",
          assigneeIds: [me],
          watcherIds: [me],
          labels: ["backend", "urgent"],
          startDate: today(),
          dueDate: addDays(1),
        });
        const c3sub = mk(1, "Ipak Yo'li API kalitlarini tekshirish", {
          priority: "high",
          parentId: c3.id,
        });
        const c4 = mk(2, "Kanban board dizaynini ko'rib chiqish", {
          priority: "low",
          labels: ["design"],
        });
        const c5 = mk(3, "Loyiha strukturamiz uchun ADR yozish", {
          priority: "lowest",
          assigneeIds: [me],
          labels: ["docs"],
        });
        // Keep the project's seq counter in sync with the demo cards.
        project.seq = seq;
        const cards = [c1, c2, c3, c3sub, c4, c5].map((c, i) => ({ ...c, order: i }));

        const history: HistoryEntry[] = cards.map((c) => ({
          id: uid(),
          cardId: c.id,
          userId: me,
          at: c.createdAt,
          kind: "created" as HistoryKind,
        }));

        set((s) => {
          const loadedProjects = new Set(s.loadedProjects);
          loadedProjects.add(projectId);
          return {
            projects: [...s.projects, project],
            columns: [...s.columns, ...columns],
            cards: [...s.cards, ...cards],
            history: [...s.history, ...history],
            loadedProjects,
          };
        });

        // Persist the seed so it is shared, not just local. Strictly ordered:
        // columns AND cards FK-reference the project row, so the project has to
        // land before either — otherwise the FK race drops them server-side.
        void boardApi
          .putProject(companyId, project)
          .then(() =>
            Promise.all([
              ...columns.map((c) => boardApi.putColumn(companyId, c)),
              ...cards.map((c) => boardApi.putCard(companyId, c)),
            ]),
          )
          .catch(err("seedProject"));
      }
    },
    {
      name: "aiba.tasks.prefs",
      version: 1,
      // Only the UI-only card layout pref is persisted to localStorage; the board
      // data now lives on the server (see loadBoard / board-api.ts).
      partialize: (s) => ({ cardConfig: s.cardConfig }),
      // Backfill any newly-added cardConfig keys so an older persisted blob keeps
      // sensible defaults (e.g. the subtask sub-list, done-hiding).
      merge: (persisted, current) => {
        const p = persisted as Partial<TasksState> | undefined;
        return {
          ...current,
          ...(p ?? {}),
          cardConfig: { ...DEFAULT_CARD_CONFIG, ...(p?.cardConfig ?? {}) },
        };
      },
    },
  ),
);
