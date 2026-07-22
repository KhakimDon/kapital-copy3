// Mirrors backend/app/modules/soliq/schemas.py

export type TaxColumn =
  | "tax_fix" | "tax_oborot" | "tax_nds" | "tax_profit"
  | "tax_ndfl" | "tax_soc" | "tax_akciz" | "tax_itpark"
  | "tax_property" | "tax_land" | "tax_transport" | "tax_water";

// One entry per tax column, IN ORDER (index aligns with the cloud's 12-column
// matcher). `keywords` is matched against the Russian/Uzbek report or payment
// name to assign it to this column. `id` is the cloud column id (kept for the
// NDFL+social combined-report and IT-park special cases in tax-grid-derive.ts).
export const TAX_COLUMNS: {
  key: TaxColumn; id: string; label: string; keywords: string[];
}[] = [
  { key: "tax_fix", id: "fix", label: "Fix.", keywords: ["fix", "qat", "фикс", "патент", "fiksirlangan"] },
  { key: "tax_oborot", id: "turnover", label: "Aylanma", keywords: ["turnover", "aylanma", "оборот"] },
  { key: "tax_nds", id: "vat", label: "QQS", keywords: ["vat", "qqs", "ндс", "добавленную стоимость", "qo'shilgan"] },
  { key: "tax_profit", id: "profit", label: "Foyda", keywords: ["profit", "foyda", "прибыль"] },
  { key: "tax_ndfl", id: "ndfl", label: "NDFL", keywords: ["ndfl", "jshods", "ндфл", "daromad", "доходы физических лиц", "jismoniy"] },
  { key: "tax_soc", id: "social", label: "Ijtimoiy", keywords: ["social", "ijtimoiy", "соц"] },
  { key: "tax_akciz", id: "excise", label: "Aksiz", keywords: ["excise", "aksiz", "акциз"] },
  { key: "tax_itpark", id: "itpark", label: "IT-park", keywords: ["it", "park"] },
  { key: "tax_property", id: "property", label: "Mulk", keywords: ["property", "mulk", "mol", "имущество"] },
  { key: "tax_land", id: "land", label: "Yer", keywords: ["land", "yer", "земл"] },
  { key: "tax_transport", id: "transport", label: "Transport", keywords: ["transport", "транспорт"] },
  { key: "tax_water", id: "water", label: "Suv", keywords: ["water", "suv", "вод"] },
];

export type Period = { year: number; month: number };

// Lean shapes snapshotted by the backend (already filtered to the period).
export type TaxGridReport = {
  name?: string | null;
  status?: string | null;
  period?: string | null;
  region?: string | null;
  sent_date?: string | null;
  report_number?: string | null;
};

export type TaxGridPayment = {
  na2_name?: string | Record<string, string> | null;
  na2_code?: string | number | null;
  summa?: number | null;
  state?: number | null;
  state_name?: string | null;
  payment_date?: string | null;
};

// Canonical filial (registration district) + its per-region saldo.
export type TaxGridRegion = {
  name?: string | null;
  ns10_code?: number | null;
  ns11_code?: number | null;
  is_default?: boolean;
  debt?: number | null;
  advance?: number | null;
  last_date?: string | null;
};

export type TaxGridRow = {
  id?: number | null;
  inn: string;
  company_uuid?: string | null;
  company_name?: string | null;
  debt?: number | null;
  advance?: number | null;
  last_recon_date?: string | null;
  rating?: string | null;
  rating_points?: number | null;
  rating_color?: string | null;
  tax_mode_name?: Record<string, string> | null;
  is_vat_payer?: boolean | null;
  vat_certificate_active?: boolean | null;
  unread_mail_count?: number | null;
  total_mail_count?: number | null;
  ytd_turnover?: number | null;
  turnover_limit?: number | null;
  turnover_percent?: number | null;
  // Raw period reports/payments — the 12 tax-status cells are derived from
  // these on the client (see tax-grid-derive.ts).
  reports?: TaxGridReport[];
  payments?: TaxGridPayment[];
  regions?: TaxGridRegion[] | null;
  bank_kartoteka_2?: number | null;
  didox_docs_count?: number | null;
  synced_at?: string | null;
  is_stale?: boolean;
};

export type TaxGridOut = {
  period: Period;
  source: "snapshot" | "legacy" | "fallback";
  rows: TaxGridRow[];
  count: number;
  synced_at?: string | null;
};

export type CompanyOverview = {
  company_id: number;
  inn?: string | null;
  type: "mchj" | "yatt";
  profile: Record<string, unknown>;
  stats: Record<string, unknown>;
};

export type ReportRow = {
  id?: string | number;
  name?: string;
  year?: number;
  period?: string;
  sent_at?: string;
  status?: string;
  raw?: Record<string, unknown>;
};

export type ReportsPage = {
  items: ReportRow[];
  count: number;
  page: number;
  per_page: number;
};

export type PaymentRow = {
  id?: string | number;
  date?: string;
  payer?: string;
  recipient?: string;
  purpose?: string;
  amount?: number;
  state_name?: string;
  na2_code?: string;
  na2_name?: string | Record<string, string | null> | null;
  raw?: Record<string, unknown>;
};

export type PaymentsPage = {
  items: PaymentRow[];
  count: number;
  page: number;
  per_page: number;
};

export type ReconciliationRow = {
  object_code?: string;
  na2_code?: string;
  na2_name?: string | Record<string, string | null> | null;
  saldo_nachalo_ned?: number;
  saldo_nachalo_pen?: number;
  saldo_nachalo_per?: number;
  saldo_tek_ned?: number;
  saldo_tek_pen?: number;
  saldo_tek_per?: number;
  nach_rachet?: number;
  nach_itogo?: number;
  nach_penya?: number;
  uploch_plateji?: number;
  uploch_vozvrat?: number;
  uploch_penya?: number;
  uploch_itogo?: number;
  total_debt?: number;
  total_over_payment?: number;
};

export type ReconciliationPage = {
  items: ReconciliationRow[];
  totals: Record<string, number>;
};

export type ChequeRow = {
  id?: string | number;
  payment_no?: string;
  terminal_id?: string;
  payment_date?: string;
  check_type?: string;
  check_sub_type?: string;
  tin?: string;
  total?: number;
  cash_total?: number;
  card_total?: number;
  vat_total?: number;
  raw?: Record<string, unknown>;
};

export type ChequesPage = {
  items: ChequeRow[];
  summary: Record<string, unknown>;
  count: number;
  page: number;
  size: number;
};

export type MailRow = {
  pkey: string;
  mail_type?: string;
  registered_num?: string;
  registered_at?: string;
  deadlined_at?: string;
  title?: string;
  direction?: string;
  status_code?: string | number;
  status_name?: string;
  read_at_soliq?: string;
  last_answer_at?: string;
  raw?: Record<string, unknown>;
};

export type MailsPage = {
  items: MailRow[];
  count: number;
  skip: number;
  limit: number;
};

export type MailDetail = {
  pkey: string;
  mail_type?: string;
  title?: string;
  direction?: string;
  registered_num?: string;
  registered_at?: string;
  deadlined_at?: string;
  status_name?: string;
  files: Array<{ id: string; name?: string; file_type?: string }>;
  history: Array<{ at: string; state_name?: string }>;
  raw?: Record<string, unknown>;
};

export type TaxPaymentDetail = {
  id: string | number;
  payment_num?: string;
  payment_date?: string;
  state_name?: string;
  summa?: number;
  summa_text?: string;
  name_a?: string; tin_a?: string;
  branch_a?: string; account_a?: string; bank_a?: string;
  name_b?: string; tin_b?: string;
  branch_b?: string; account_b?: string; bank_b?: string;
  na2_code?: string; na2_name?: string;
  purpose?: string;
  raw?: Record<string, unknown>;
};

export type IjaraStateCounts = {
  state_10: number;
  state_15: number;
  state_20: number;
  state_50: number;
};

export type IjaraContractRow = {
  id: string;
  state?: string | number;
  state_name?: string;
  section?: "incoming" | "outgoing";
  my_rent_type?: number | null;
  counterparty?: string;
  counterparty_tin?: string;
  contract_no?: string;
  contract_date?: string;
  start_date?: string;
  end_date?: string;
  estate_address?: string;
  currency?: string;
  amount?: number;
  source_created_at?: string;
  synced_at?: string;
  raw?: Record<string, unknown>;
};

export type IjaraPage = {
  items: IjaraContractRow[];
  count: number;
  info: Record<string, unknown>;
  incoming: IjaraStateCounts;
  outgoing: IjaraStateCounts;
};

export type IjaraContractDetail = IjaraContractRow & {
  valid_from?: string;
  valid_to?: string;
};

export type IjaraGridRow = {
  id: number;
  inn?: string;
  name?: string;
  legal_form?: string;
  has_subscription: boolean;
  incoming: IjaraStateCounts;
  outgoing: IjaraStateCounts;
  synced_at?: string;
};

export type IjaraGridOut = { grid: IjaraGridRow[] };

// ---- Mail categories aggregate (mirrors backend MailCategoriesOut) ----------

export type MailCategoryStat = {
  total: number;
  actionable: number;
  answered: number;
  unread: number;
  overdue: number;
  deadline_soon: number;
  stale_unanswered: number;
  needs_attention: number;
  with_files: number;
};

export type MailDirectionTotals = { total: number; incoming: number; outgoing: number };

export type MailAggregates = {
  unread: number;
  actionable: number;
  answered: number;
  overdue: number;
  deadline_soon: number;
  stale_unanswered: number;
  needs_attention: number;
  with_files: number;
  today?: string | null;
};

export type MailCategoriesOut = {
  subscription_found: boolean;
  categories: Record<string, MailCategoryStat>;
  totals: MailDirectionTotals;
  aggregates?: MailAggregates | null;
};

// ---- Mail categories (from cloud MAIL_FAMILY_TYPES) -------------------------

export const MAIL_CATEGORIES = [
  { key: "all",             label: "Hammasi",        family: "mail" },
  { key: "requirement",     label: "Talabnoma",      family: "mail" },
  { key: "decision",        label: "Qaror",          family: "mail" },
  { key: "court_statement", label: "Sud bayonoti",   family: "mail" },
  { key: "notice",          label: "Bildirishnoma",  family: "mail" },
  { key: "appeal",          label: "Apellyatsiya",   family: "mail" },
  { key: "statement",       label: "Ariza",          family: "mail" },
  { key: "external",        label: "Tashqi",         family: "mail" },
  { key: "tax_report",      label: "Soliq hisoboti", family: "tax_report" },
  { key: "tax_pay",         label: "Soliq to'lovi",  family: "payment" },
] as const;

export type MailCategory = (typeof MAIL_CATEGORIES)[number]["key"];

// ---- Smart-chip presets (from cloud SMART_CHIPS) ----------------------------
// `countKey` indexes into MailAggregates / per-category stat for the chip badge.
export const SMART_CHIPS = [
  { id: "unread",            label: "O'qilmagan",         preset: "unread_actionable",  countKey: "unread",           tone: "blue" as const },
  { id: "needs_attention",   label: "Diqqat talab qiladi", preset: "needs_attention",   countKey: "needs_attention",  tone: "red" as const },
  { id: "overdue",           label: "Muddati o'tgan",     preset: "overdue",            countKey: "overdue",          tone: "red" as const },
  { id: "hot",               label: "Muddati yaqin",      preset: "hot",                countKey: "deadline_soon",    tone: "amber" as const },
  { id: "stale_unanswered",  label: "Javobsiz (7+ kun)",  preset: "stale_requirements", countKey: "stale_unanswered", tone: "red" as const },
  { id: "archive",           label: "Arxiv",              preset: "archive",            countKey: null,               tone: "muted" as const },
] as const;

// Answer-status segmented toggle (Requirements-style). Maps to status_code.
export const MAIL_ANSWER_STATUSES = [
  { value: "",             label: "Barchasi",          dot: "" },
  { value: "answered",     label: "Javob berilgan",    dot: "bg-emerald-500" },
  { value: "not_answered", label: "Javob berilmagan",  dot: "bg-red-500" },
] as const;

// ---- Status keywords for tax-grid columns (mirrors STATUS_KEYWORDS in NC) ---
// detectReportStatus() checks groups in this priority order:
//   penalty → failed → late → notPaid → paid → unknown
// so a "Проведенный с опозданием" (contains both проведен + опозда) reads as
// late, not submitted. Keep the lists and order in sync with cloud profiles.js.

export const STATUS_KEYWORDS = {
  penalty: ["pen", "jarima", "штраф"],
  failed: ["отказ", "отклон", "ошибк", "rad etilgan", "rad etil", "xato", "rejected", "failed", "error"],
  late: ["late", "kech", "prosrocheno", "прострочен", "опоздан"],
  notPaid: ["not_paid", "topshirilmagan", "ne_sdano", "не сдан", "не принят", "черновик", "хомаки", "qoralama", "draft"],
  paid: ["paid", "topshirilgan", "sdano", "сдано", "вовремя", "accepted", "qabul", "проведен"],
} as const;

// Report-name prefixes that are helper forms (spravka / ma'lumotnoma), not a
// real filing — they don't close the obligation for a column.
export const NON_REPORT_PREFIXES = [
  "справка", "spravka", "маълумотнома", "ma'lumotnoma", "malumotnoma",
];

// ---- Ijara states ----------------------------------------------------------
// Colors match cloud js/ijara.js stateBadge():
//   10 = gray (Sent), 15 = orange (Rejected), 20 = green (Active), 50 = red (Expired).
export const IJARA_STATES = [
  { value: "10", label: "Yuborilgan",     color: "gray"   as const, dot: "bg-muted-foreground/40" },
  { value: "20", label: "Tasdiqlangan",   color: "green"  as const, dot: "bg-emerald-500" },
  { value: "15", label: "Rad etilgan",    color: "orange" as const, dot: "bg-orange-500" },
  { value: "50", label: "Muddati o'tgan", color: "red"    as const, dot: "bg-red-500" },
];

// Tailwind classes for the ijara state badge per color.
export const IJARA_STATE_BADGE: Record<string, string> = {
  gray:   "bg-muted text-muted-foreground border-transparent",
  green:  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-transparent",
  orange: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-transparent",
  red:    "bg-red-500/15 text-red-700 dark:text-red-400 border-transparent",
};

export function ijaraStateInfo(state?: string | number | null) {
  const s = String(state ?? "");
  return IJARA_STATES.find((x) => x.value === s);
}

// ---- Cheque Z-report / OFD-report rows (loose — soliq camelCase or snake) ---

export type CheckType = "NKM_CHECK" | "MARKETPLACE_CHECK" | "TAXI_CHECK";
export type CheckSubType = "SALE" | "REFUND";

export const CHECK_TYPES: { value: CheckType; label: string }[] = [
  { value: "NKM_CHECK", label: "NKM" },
  { value: "MARKETPLACE_CHECK", label: "Marketplace" },
  { value: "TAXI_CHECK", label: "Taksi" },
];

export const CHECK_SUB_TYPES: { value: CheckSubType; label: string }[] = [
  { value: "SALE", label: "Sotuv" },
  { value: "REFUND", label: "Qaytarish" },
];

export type ZReportRow = {
  terminalId?: string; terminal_id?: string;
  openTime?: string; open_time?: string;
  closeTime?: string; close_time?: string;
  firstReceiptSeq?: string | number; first_receipt_seq?: string | number;
  lastReceiptSeq?: string | number; last_receipt_seq?: string | number;
  totalSaleCash?: number; total_sale_cash?: number;
  totalSaleCard?: number; total_sale_card?: number;
  totalRefundCash?: number; total_refund_cash?: number;
  totalRefundCard?: number; total_refund_card?: number;
  totalSaleCount?: number; total_sale_count?: number;
  totalRefundCount?: number; total_refund_count?: number;
};

export type OfdReportRow = {
  terminalId?: string; terminal_id?: string;
  paymentDate?: string; payment_date?: string;
  year?: number; month?: number;
  total?: number;
  cashTotal?: number; cash_total?: number;
  cardTotal?: number; card_total?: number;
  vatTotal?: number; vat_total?: number;
  refundTotal?: number; refund_total?: number;
  count?: number;
};

export type ReportTerminal = {
  terminalId?: string; terminal_id?: string;
  salePointName?: string; sale_point_name?: string;
  salePointAddress?: string; sale_point_address?: string;
  status?: number;
  totalCount?: number;
};

export type SyncStatus = {
  sync_name: string;
  mode: string;
  last_run?: {
    started_at?: string;
    finished_at?: string;
    status?: string;
    rows_attempted?: number;
    rows_synced?: number;
    period?: { year?: number; month?: number };
  } | null;
  snapshot_age_seconds?: number | null;
  is_stale?: boolean;
};
