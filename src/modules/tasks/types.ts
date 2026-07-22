// Wire shapes mirror the aiba-tasks service (TaskOut / CommentOut / members[])
// plus the legacy aliases the NC kanban JS reads.

export type TaskStatus =
  | "todo" | "in_progress" | "done" | "late" | "missed" | "archived";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskSource =
  | "manual" | "autotask" | "didox" | "soliq" | "onec" | "ai";

export type Task = {
  id: string;
  company_id: string | null;
  project_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  creator_user_id: string;
  creator_name?: string | null;
  creator_avatar?: string | null;
  creator_phone?: string | null;
  assignee_user_id: string | null;
  assignee_name?: string | null;
  assignee_avatar?: string | null;
  assignee_phone?: string | null;
  due_at: string | null;
  completed_at: string | null;
  template_id: string | null;
  sort_order: number;
  version: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  // counters the board badges read (service may include them)
  comments_count?: number;
  attachments_count?: number;
  // optimistic-insert marker
  _optimistic?: boolean;
};

export type TaskListResp = {
  items: Task[];
  synced?: boolean;
  reason?: string;
};

export type Member = {
  id: string; // chat2 UUID — what assignee_user_id expects
  name: string;
  phone?: string;
  avatar?: string | null;
  role?: string;
  is_owner?: boolean;
};
export type MembersResp = { items: Member[] };

export type Comment = {
  id: string;
  task_id: string;
  author_user_id: string;
  author_name?: string | null;
  author_avatar?: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};
export type CommentsResp = { items: Comment[] };

export type Attachment = {
  id: string;
  task_id?: string;
  filename: string;
  size?: number | null;
  content_type?: string | null;
  uploaded_by_user_id?: string | null;
  uploaded_by_name?: string | null;
  created_at?: string | null;
};
export type AttachmentsResp = { items: Attachment[] };

export type StatsResp = {
  overview: Record<string, unknown>;
  leaderboard: Array<Record<string, unknown>>;
};

// ── view helpers ──────────────────────────────────────────────────────────────
// Translation keys — callers must pass through t().
export const STATUSES: { key: TaskStatus; labelKey: string }[] = [
  { key: "todo", labelKey: "modules.tasks.status.todo" },
  { key: "in_progress", labelKey: "modules.tasks.status.in_progress" },
  { key: "done", labelKey: "modules.tasks.status.done" },
];

export const PRIORITY_LABEL_KEY: Record<TaskPriority, string> = {
  low: "modules.tasks.priority.low",
  medium: "modules.tasks.priority.medium",
  high: "modules.tasks.priority.high",
  urgent: "modules.tasks.priority.urgent",
};

export const STATUS_LABEL_KEY: Record<TaskStatus, string> = {
  todo: "modules.tasks.status.todo",
  in_progress: "modules.tasks.status.in_progress",
  done: "modules.tasks.status.done",
  late: "modules.tasks.status.late",
  missed: "modules.tasks.status.missed",
  archived: "modules.tasks.status.archived",
};

export const PRIORITY_VARIANT: Record<TaskPriority, "muted" | "info" | "warning" | "danger"> = {
  low: "muted",
  medium: "info",
  high: "warning",
  urgent: "danger",
};

export const assigneeLabel = (t: Task) =>
  t.assignee_name || (t.assignee_user_id ? "—" : "");
export const authorLabel = (t: Task) => t.creator_name || "—";
