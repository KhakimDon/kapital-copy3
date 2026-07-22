export type AttendanceCell = {
  status: "ontime" | "slight" | "late" | "absent" | "weekend" | "future";
  check_in?: string | null;
  check_out?: string | null;
  raw_check_in?: string | null;
  minutes_late: number;
};

export type AttendanceRow = {
  id: number;
  name: string;
  position?: string | null;
  records: Record<string, AttendanceCell>;
  worst_status: string;
  stats: Record<string, number>;
};

export type AttendanceMatrix = {
  dates: string[];
  employees: AttendanceRow[];
  totals: Record<string, number>;
};

// status → cell style (matches cloud att-day--* colors)
export const ATT_STYLE: Record<string, { cls: string; label: string }> = {
  ontime: { cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200", label: "Vaqtida" },
  slight: { cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200", label: "Bir oz kech" },
  late: { cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200", label: "Kechikkan" },
  absent: { cls: "bg-muted text-muted-foreground", label: "Kelmagan" },
  weekend: { cls: "bg-background text-muted-foreground/40", label: "Dam olish" },
  future: { cls: "bg-background text-muted-foreground/30", label: "—" },
};

export const ATT_TABS = [
  { key: "all", label: "Hammasi" },
  { key: "ontime", label: "Vaqtida", countKey: "ontime" },
  { key: "slight", label: "Bir oz kech", countKey: "slight" },
  { key: "late", label: "Kechikkan", countKey: "late" },
  { key: "absent", label: "Kelmagan", countKey: "absent" },
];

export const WEEKDAYS = ["Du", "Se", "Ch", "Pa", "Ju", "Sh", "Ya"];

export type AttendanceDetail = {
  id: number;
  name: string;
  position?: string | null;
  records: Record<string, AttendanceCell>;
  stats: Record<string, number>;
};

export type AttendanceEventRow = {
  id: number;
  employee_id: number;
  employee_name?: string | null;
  event_time: string;
  event_date: string;
  direction: string;
  terminal_id?: number | null;
  terminal_name?: string | null;
  source: string;
  employee_no?: string | null;
  name?: string | null;
  verify_mode?: string | null;
  user_type?: string | null;
  card_no?: string | null;
};

export type TerminalRow = {
  id: number;
  uuid: string;
  name: string;
  ip?: string | null;
  port?: number | null;
  type: string;
  model?: string | null;
  status: string;
  status_message?: string | null;
  last_event_time?: string | null;
  last_synced_at?: string | null;
  events_count: number;
  users_count: number;
};

export type LinkedEmployee = {
  id: number;
  full_name: string;
  position?: string | null;
  company_id?: number | null;
};

export type TerminalUserRow = {
  id: number;
  employee_no: string;
  name?: string | null;
  user_type?: string | null;
  door_right?: string | null;
  valid_enable?: number | null;
  valid_begin?: string | null;
  valid_end?: string | null;
  linked_employee?: LinkedEmployee | null;
  last_seen_at?: string | null;
  events_count: number;
  terminals_count: number;
  terminal_ids: number[];
  terminal_names: string[];
  member_ids: number[];
};

export type Suggestion = { employee: LinkedEmployee; score: number };
export type SuggestResult = { terminal_user: TerminalUserRow; suggestions: Suggestion[] };

export type RotationRow = {
  id: number;
  name: string;
  position?: string | null;
  today_terminal?: string | null;
  today_company_id?: number | null;
  last_event_time?: string | null;
  rotated: boolean;
  absent: boolean;
};

export type RotationResult = {
  date: string;
  employees: RotationRow[];
  rotated: number;
  absent: number;
};

// Manual rotation records (oc_aiba_emp_rotations)
export type ManualRotationRow = {
  id: number;
  employee_id: number;
  from_company_id: number;
  to_company_id: number;
  start_date: string;
  end_date?: string | null;
  note?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  employee_name?: string | null;
  from_company_name?: string | null;
  to_company_name?: string | null;
};

export type ManualRotationList = { rotations: ManualRotationRow[] };

export type ManualRotationIn = {
  employee_id: number;
  to_company_id: number;
  start_date: string;
  end_date?: string | null;
  note?: string | null;
};

export const TERMINAL_STATUS: Record<string, { label: string; variant: "success" | "danger" | "muted" | "warning" }> = {
  connected: { label: "Onlayn", variant: "success" },
  error: { label: "Xatolik", variant: "danger" },
  stopped: { label: "To'xtatilgan", variant: "danger" },
  connecting: { label: "Ulanmoqda", variant: "warning" },
  unknown: { label: "Noma'lum", variant: "muted" },
};
