export type Employee = {
  id: number;
  company_id: number;
  company_inn?: string | null;
  first_name: string;
  last_name?: string | null;
  middle_name?: string | null;
  full_name: string;
  position?: string | null;
  department?: string | null;
  phone?: string | null;
  email?: string | null;
  pinfl?: string | null;
  inn?: string | null;
  gender?: string | null;
  birth_date?: string | null;
  passport_series?: string | null;
  passport_number?: string | null;
  status: string;
  hire_date?: string | null;
  dismissal_date?: string | null;
  oklad?: string | number | null;
  oklad_currency?: string;
  rate?: string | number;
  ndfl_rate?: string | number;
  employment_type?: string;
  vacation_days_per_year?: number;
  children_count?: number;
  work_start?: string;
  work_end?: string;
  department_id?: number | null;
  schedule_id?: number | null;
  contract_type?: number | null;
  workplace_type?: number | null;
  is_resident?: number | null;
  is_innovation_center?: boolean;
  always_full_sick?: boolean;
  experience_start_date?: string | null;
  hourly_rate?: string | number | null;
  contract_amount?: string | number | null;
  exists_in_1c?: boolean | null;
  exists_in_mehnat?: boolean | null;
  mehnat_position_name_uz?: string | null;
};

export type EmployeeEvent = {
  id: number;
  event_type: string; // hire | dismiss | modify
  event_date?: string | null;
  position?: string | null;
  employment_type?: string | null;
  rate?: string | number | null;
  salary?: string | number | null;
  currency?: string | null;
  order_number?: string | null;
  order_date?: string | null;
  contract_number?: string | null;
  contract_date?: string | null;
  dismiss_reason?: string | null;
  compensation_days?: number | null;
  changes?: string | null;
  created_at?: string | null;
};

// The maps below hold i18n keys (not literals) so labels follow the active
// language. Resolve each value through `t(...)` at render time.
export const CONTRACT_TYPE_LABELS: Record<number, string> = {
  1: "modules.employees.contractTypes.main",
  2: "modules.employees.contractTypes.additional",
  3: "modules.employees.contractTypes.gph",
  4: "modules.employees.contractTypes.construction",
  5: "modules.employees.contractTypes.piecework",
};

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  staff: "modules.employees.employmentTypes.staff",
  staff_daily: "modules.employees.employmentTypes.staff_daily",
  staff_shift: "modules.employees.employmentTypes.staff_shift",
  self_employed: "modules.employees.employmentTypes.self_employed",
  contract_hourly: "modules.employees.employmentTypes.contract_hourly",
  contract_fixed: "modules.employees.employmentTypes.contract_fixed",
};

export const EVENT_TYPE_META: Record<string, { labelKey: string; variant: "success" | "danger" | "info" }> = {
  hire: { labelKey: "modules.employees.eventTypes.hire", variant: "success" },
  dismiss: { labelKey: "modules.employees.eventTypes.dismiss", variant: "danger" },
  modify: { labelKey: "modules.employees.eventTypes.modify", variant: "info" },
};

export type EmployeesPage = { items: Employee[]; count: number };

export type EmployeeIn = {
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  position?: string;
  department?: string;
  phone?: string;
  email?: string;
  pinfl?: string;
  inn?: string;
  gender?: string;
  birth_date?: string;
  passport_series?: string;
  passport_number?: string;
  hire_date?: string;
  oklad?: string;
  oklad_currency?: string;
  rate?: string;
  ndfl_rate?: string;
  employment_type?: string;
  work_start?: string;
  work_end?: string;
  // --- extended (4-step hire wizard parity; backend ignores unknown keys) ---
  vacation_days_per_year?: number | string;
  children_count?: number | string;
  mehnat_position_name_uz?: string;
  hourly_rate?: string;
  contract_amount?: string;
  schedule_id?: number | null;
  calc_type?: string;
  order_number?: string;
  order_date?: string;
  contract_number?: string;
  contract_date?: string;
};

// value + i18n labelKey (empty option keeps a literal dash).
export const GENDER_OPTIONS = [
  { value: "", labelKey: "" },
  { value: "male", labelKey: "modules.employees.gender.male" },
  { value: "female", labelKey: "modules.employees.gender.female" },
];
export const CURRENCY_OPTIONS = ["UZS", "USD", "EUR", "RUB"];
export const RATE_OPTIONS = ["0.25", "0.5", "1", "1.25", "1.5"];

export type PayrollLine = {
  employee_id: number;
  full_name: string;
  position?: string | null;
  oklad?: string | null;
  rate?: string;
  workdays_in_month: number;
  worked_days: number;
  gross: string;
  ndfl_rate: string;
  ndfl: string;
  inps: string;
  net: string;
};

export type PayrollResult = {
  company_id: number;
  year: number;
  month: number;
  workdays_in_month: number;
  lines: PayrollLine[];
  totals: Record<string, string>;
};

export type Department = {
  id: number; name: string; employee_count: number;
  default_debit_account?: string | null; exists_in_1c?: boolean | null;
  parent_id?: number | null; parent_name?: string | null;
  is_administration?: boolean; exists_in_mehnat?: boolean | null;
};
export type DepartmentIn = {
  name: string; parent_id?: number | null;
  is_administration?: boolean; default_debit_account?: string | null;
};
export type Schedule = {
  id: number; name: string; work_start: string; work_end: string; workdays: number[];
  check_in_floor?: string | null; is_default?: boolean; employee_count?: number; rate?: string | number | null;
  exists_in_1c?: boolean | null;
};
export type ScheduleAssignment = {
  employee_id: number; full_name: string; schedule_id?: number | null;
  schedule_name?: string | null; work_start?: string | null; work_end?: string | null;
  effective_from?: string | null; effective_to?: string | null;
  is_default: boolean; is_current: boolean;
};

// i18n keys — resolve with t(WEEKDAY_LABELS[n]).
export const WEEKDAY_LABELS: Record<number, string> = {
  1: "modules.employees.weekdaysShort.1", 2: "modules.employees.weekdaysShort.2",
  3: "modules.employees.weekdaysShort.3", 4: "modules.employees.weekdaysShort.4",
  5: "modules.employees.weekdaysShort.5", 6: "modules.employees.weekdaysShort.6",
  7: "modules.employees.weekdaysShort.7",
};

// value + i18n labelKey (resolve with t(opt.labelKey) at render).
export const EMPLOYMENT_TYPES = [
  { value: "staff", labelKey: "modules.employees.employmentTypes.staff" },
  { value: "staff_shift", labelKey: "modules.employees.employmentTypes.staff_shift" },
  { value: "contract_hourly", labelKey: "modules.employees.employmentTypes.contract_hourly" },
  { value: "contract_fixed", labelKey: "modules.employees.employmentTypes.contract_fixed" },
  { value: "self_employed", labelKey: "modules.employees.employmentTypes.self_employed" },
];

export const EMP_STATUS: Record<string, { labelKey: string; variant: "success" | "muted" }> = {
  active: { labelKey: "modules.employees.status.active", variant: "success" },
  inactive: { labelKey: "modules.employees.status.inactive", variant: "muted" },
};

// ---- Oylik (payroll) suite -------------------------------------------------
export type PayrollEmpLine = {
  employee_id: number; full_name: string; position?: string | null; oklad?: string | number | null;
  worked_days: number; workdays_in_month: number;
  salary_amount: string | number; vacation_amount: string | number; sick_amount: string | number;
  premium_amount: string | number; compensation_amount: string | number;
  total_accrued: string | number; ndfl_amount: string | number; inps_amount: string | number;
  total_deductions: string | number; total_net: string | number;
};
export type PayrollRun = {
  id?: number | null; period_year: number; period_month: number; status?: string | null;
  workdays_in_month: number; total_accrued: string | number; total_ndfl: string | number;
  total_inps: string | number; total_deductions: string | number; total_net: string | number;
  calculated_at?: string | null; closed_at?: string | null;
};
export type AccountingEntryRow = {
  employee_id?: number | null; full_name?: string | null; category?: string | null;
  debit_account?: string | null; credit_account?: string | null; amount: string | number; description?: string | null;
};
export type PayrollRunDetail = { run: PayrollRun | null; lines: PayrollEmpLine[]; entries: AccountingEntryRow[] };
export type LeaveRow = {
  id: number; employee_id: number; full_name?: string | null; type: string;
  start_date?: string | null; end_date?: string | null; calendar_days?: number | null;
  workdays?: number | null; computed_amount?: string | number | null; sick_percent?: number | null; status?: string | null;
  reason?: string | null;
  sick_series?: string | null; sick_number?: string | null; sick_cause?: string | null;
  trip_country?: string | null; trip_city?: string | null; trip_organization?: string | null;
  dismissal_reason_name?: string | null; debit_account?: string | null; credit_account?: string | null;
  onec_synced?: boolean | null;
};
export type PremiumRow = {
  id: number; employee_id: number; full_name?: string | null; kind?: string | null; formula?: string | null;
  amount?: string | number | null; percent?: string | number | null; counts_in_average: boolean;
  debit_account?: string | null; credit_account?: string | null;
  reason?: string | null; start_date?: string | null; end_date?: string | null;
};
export type DeductionRow = {
  id: number; employee_id: number; full_name?: string | null; kind?: string | null; formula?: string | null;
  amount?: string | number | null; percent?: string | number | null; reduces_ndfl_base: boolean;
  debit_account?: string | null; credit_account?: string | null;
  ndfl_deduction_code?: string | null; reason?: string | null; start_date?: string | null; end_date?: string | null;
};
export type TimesheetRow = {
  employee_id: number; full_name?: string | null; work_days: number; vacation_days: number;
  sick_days: number; unpaid_days: number; trip_days: number; weekend_days: number;
  holiday_days: number; expected_hours: string | number; worked_hours: string | number;
};
export type HolidayRow = { id: number; date: string; name: string; is_workday: boolean; country?: string | null; exists_in_1c?: boolean | null };

// ---- dismiss / hire-wizard payloads ----------------------------------------
export type DismissIn = {
  dismissal_date?: string; reason?: string;
  compensation_days?: number | string;
  compensation_dept_id?: number | null; compensation_type?: string;
  order_number?: string; order_date?: string;
  contract_number?: string; contract_date?: string;
};

export const LEAVE_TYPE_LABELS: Record<string, string> = {
  vacation: "Mehnat ta'tili", sick: "Kasallik varaqasi", unpaid: "Haqsiz (BS)",
  business_trip: "Komandirovka", compensation: "Kompensatsiya",
};
export const PREMIUM_KIND_LABELS: Record<string, string> = {
  monthly: "Oylik", quarterly: "Choraklik", annual: "Yillik", one_time: "Bir martalik",
};
export const DEDUCTION_KIND_LABELS: Record<string, string> = {
  contract_edu: "Shartnoma asosida o'qish", alimony: "Aliment", fine: "Jarima",
  court_order: "Sud qarori", other: "Boshqa",
};
export const FORMULA_LABELS: Record<string, string> = {
  fixed: "Belgilangan", percent: "Okladdan %", percent_of_oklad: "Okladdan %",
};
export const PAYROLL_STATUS_META: Record<string, { labelKey: string; variant: "muted" | "info" | "success" }> = {
  draft: { labelKey: "modules.employees.payrollStatus.draft", variant: "muted" },
  calculated: { labelKey: "modules.employees.payrollStatus.calculated", variant: "info" },
  closed: { labelKey: "modules.employees.payrollStatus.closed", variant: "success" },
};

// ---- AI Rules + ChangeLog --------------------------------------------------
export type RuleRow = {
  id: number; section?: string | null; kind?: string | null; name: string; enabled: boolean;
  ai_model?: string | null; source_text?: string | null; explanation?: string | null;
  validation_status?: string | null; version?: number | null;
};
export type ChangeLogRow = {
  id: number; actor?: string | null; action?: string | null; entity?: string | null;
  summary?: string | null; reversible: boolean; payroll_id?: number | null; created_at?: string | null;
};
export const RULE_SECTION_LABELS: Record<string, string> = {
  premium: "modules.employees.ruleSections.premium",
  deduction: "modules.employees.ruleSections.deduction",
  absence: "modules.employees.ruleSections.absence",
};
export const CHANGELOG_ACTION_META: Record<string, { labelKey: string; variant: "success" | "info" | "danger" | "warning" }> = {
  create: { labelKey: "modules.employees.changelogActions.create", variant: "success" },
  update: { labelKey: "modules.employees.changelogActions.update", variant: "info" },
  delete: { labelKey: "modules.employees.changelogActions.delete", variant: "danger" },
  revert: { labelKey: "modules.employees.changelogActions.revert", variant: "warning" },
};
