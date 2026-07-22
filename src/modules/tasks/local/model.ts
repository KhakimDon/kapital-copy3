// ─────────────────────────────────────────────────────────────────────────────
// Local-first task board model. Everything here is stored client-side (zustand +
// persist, see store.ts) so tasks can be created / managed WITHOUT AIBA. When a
// company is AIBA-synced a later adapter reconciles these shapes two-way — the
// field names deliberately echo the aiba-tasks service (see ../types.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type Priority = "lowest" | "low" | "medium" | "high" | "urgent";
export const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "lowest"];

/** Where a column sits in the workflow — drives the "done" styling + stats. */
export type ColumnCategory = "todo" | "inprogress" | "done";

export type Member = {
  id: string;
  name: string;
  avatar?: string | null;
  /** Optional accent — falls back to a hashed colour (see util colorFor). */
  color?: string | null;
  role?: string | null;
};

// ── task permission scheme (Jira-style project roles) ───────────────────────
// "autotask" gates the recurring-template feature: only roles granted it can
// see or manage autotasks. Kept separate from "manage" so a project manager
// does not automatically get the power to mint scheduled work.
export type TaskPermission = "view" | "create" | "edit" | "move" | "delete" | "comment" | "manage" | "autotask";
export const TASK_PERMISSIONS: TaskPermission[] = ["view", "create", "edit", "move", "delete", "comment", "manage", "autotask"];

export type TaskRole = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  permissions: TaskPermission[];
};

/** A user's role grant within a project. */
export type ProjectAccess = { userId: string; roleKey: string };

export type Project = {
  id: string;
  /** The firm this project belongs to (Company.id) — or null for a personal board. */
  companyId: number | null;
  /** Short prefix used to mint card keys, e.g. "DEV" → DEV-12. Also the URL nickname. */
  key: string;
  name: string;
  /** Free-text project description (rich-text HTML allowed). */
  description: string;
  /** Project avatar — a `files:` ref to an uploaded thumbnail, or a data-URL
   *  (offline fallback), or null. Shown avatar-style everywhere a project is
   *  represented (picker, list, settings header). */
  avatar?: string | null;
  /** @deprecated Legacy cover banner (data-URL). Kept for back-compat; the UI
   *  no longer reads or writes it — see `avatar`. */
  coverImage?: string | null;
  color: string;
  /** Private → only listed members (+ owner) see it. New projects default to this. */
  private: boolean;
  /** Members allowed to see a private project (ids). Owner is always implicit. */
  memberIds: string[];
  /** Per-member role grants (Jira-style project roles). */
  access?: ProjectAccess[];
  ownerId: string;
  /** Pre-filled on every new card in this project (chosen from real members). */
  defaultAssigneeId?: string | null;
  defaultReporterId?: string | null;
  /** Monotonic counter for minting card keys. */
  seq: number;
  archived?: boolean;
  createdAt: string;
};

export type Column = {
  id: string;
  projectId: string;
  name: string;
  color: string;
  category: ColumnCategory;
  order: number;
  /** Optional work-in-progress limit; the header goes red past it. */
  wipLimit?: number | null;
  /** Role keys allowed to move a card INTO this column (empty = anyone w/ edit). */
  moveRoles?: string[];
};

/** A file attached to a card. `url` is a data: URL (inlined, like wiki covers)
 * so it persists in the store and embeds directly in the description HTML. */
export type Attachment = {
  id: string;
  name: string;
  url: string;
  mime: string;
  size: number;
  /** Optional small, optimized preview (`files:` ref) used when this image is a
   *  board-card cover — keeps the cover crisp + light while `url` stays the
   *  full-resolution original for download. Absent on non-image / legacy files. */
  thumbUrl?: string | null;
};

/** A card is a normal task or an epic (a big theme other cards roll up to). */
export type CardType = "task" | "epic";

/** Lightweight epic reference for the cross-project picker + chips. */
export type EpicRef = {
  id: string;
  seq: number;
  title: string;
  projectId: string;
  projectKey: string;
  color: string;
};

export type Card = {
  id: string;
  projectId: string;
  columnId: string;
  /** Per-project sequence → key = `${project.key}-${seq}`. */
  seq: number;
  title: string;
  /** "task" (default) or "epic". */
  type: CardType;
  /** The epic this card rolls up to (may live in another accessible project). */
  epicId: string | null;
  /** Rich-text HTML (WYSIWYG). May embed uploaded images as data: URLs. */
  description: string;
  /** Files attached to this card (also any image dropped into the description). */
  attachments: Attachment[];
  /** Attachment id shown as the board card's cover image (image attachments only). */
  cover: string | null;
  priority: Priority;
  assigneeIds: string[];
  reporterId: string | null;
  watcherIds: string[];
  labels: string[];
  startDate: string | null; // yyyy-mm-dd
  dueDate: string | null; // yyyy-mm-dd
  /** Linked Wiki pages (ids into the wiki store) — reference docs for this issue. */
  wikiPageIds?: string[];
  /** Ordering within a column (fractional, so inserts don't renumber siblings). */
  order: number;
  parentId: string | null;
  /** When the card last entered its current column — powers the "N days here" chip. */
  columnEnteredAt: string;
  createdAt: string;
  updatedAt: string;
};

export type Reaction = "like" | "dislike";

export type Comment = {
  id: string;
  cardId: string;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  /** userId → their reaction. */
  reactions: Record<string, Reaction>;
};

export type HistoryKind =
  | "created"
  | "moved"
  | "renamed"
  | "priority"
  | "assignee"
  | "reporter"
  | "watcher"
  | "due"
  | "start"
  | "label"
  | "described"
  | "commented"
  | "subtask"
  | "archived";

export type HistoryEntry = {
  id: string;
  cardId: string;
  userId: string;
  at: string;
  kind: HistoryKind;
  from?: string | null;
  to?: string | null;
};

/** Which fields the kanban/list cards render — the "Card setup" popover writes this. */
export type CardConfig = {
  key: boolean;
  priority: boolean;
  assignees: boolean;
  labels: boolean;
  dueDate: boolean;
  subtaskCount: boolean;
  commentCount: boolean;
  daysInColumn: boolean;
  description: boolean;
  cover: boolean;
  /** Show a nested sub-list of the card's subtasks on the board / list. */
  subtasks: boolean;
  /** Hide done-column cards on the BOARD after N days in the done column
   * (null = always show). The list view ignores this. */
  hideDoneAfterDays: number | null;
};

export const DEFAULT_CARD_CONFIG: CardConfig = {
  key: true,
  priority: true,
  assignees: true,
  labels: true,
  dueDate: true,
  subtaskCount: true,
  commentCount: true,
  daysInColumn: true,
  description: false,
  cover: false,
  subtasks: true,
  hideDoneAfterDays: null,
};

export type BoardView = "board" | "list" | "calendar" | "timeline";

/** Horizontal swimlane grouping on the board (Jira-style). */
export type Swimlane = "none" | "epic" | "assignee" | "priority";
export const SWIMLANES: Swimlane[] = ["none", "epic", "assignee", "priority"];

// Palette used for new columns / projects / labels — theme-friendly hues.
export const SWATCHES = [
  "#64748b", "#0ea5e9", "#6366f1", "#8b5cf6", "#ec4899",
  "#f43f5e", "#f97316", "#eab308", "#22c55e", "#14b8a6",
];

export const PRIORITY_META: Record<
  Priority,
  { labelKey: string; label: string; color: string; icon: "urgent" | "up" | "eq" | "down" | "lowest" }
> = {
  urgent: { labelKey: "modules.tasks.priority.urgent", label: "Shoshilinch", color: "#ef4444", icon: "urgent" },
  high: { labelKey: "modules.tasks.priority.high", label: "Yuqori", color: "#f97316", icon: "up" },
  medium: { labelKey: "modules.tasks.priority.medium", label: "O'rta", color: "#eab308", icon: "eq" },
  low: { labelKey: "modules.tasks.priority.low", label: "Past", color: "#22c55e", icon: "down" },
  lowest: { labelKey: "modules.tasks.priority.lowest", label: "Eng past", color: "#64748b", icon: "lowest" },
};

export const CATEGORY_META: Record<ColumnCategory, { labelKey: string; label: string }> = {
  todo: { labelKey: "modules.tasks.category.todo", label: "Rejada" },
  inprogress: { labelKey: "modules.tasks.category.inprogress", label: "Jarayonda" },
  done: { labelKey: "modules.tasks.category.done", label: "Tugatilgan" },
};
