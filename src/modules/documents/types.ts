// Mirrors backend/app/modules/documents/schemas.py

export type DocRow = {
  id?: string | null;        // internal UUID — used for detail/sign/reject/delete
  doc_id?: string | null;    // Didox hex id — used for HTML render
  doctype?: string | null;
  doc_status?: number | null;
  status_group?: string | null;
  owner?: number | null;
  doc_date?: string | null;
  signed_date?: string | null;
  contract_number?: string | null;
  contract_date?: string | null;
  name?: string | null;
  partner_tin?: string | null;
  partner_name?: string | null;
  partner_phone?: string | null;
  users_tax_id?: string | null;
  total_sum?: number | null;
  total_without_vat?: number | null;
  total_vat_sum?: number | null;
  total_with_vat?: number | null;
  has_vat?: boolean | null;
  has_marks?: boolean | null;
  has_lgota?: boolean | null;
  doc_rating?: string | null;     // LOW | MEDIUM | HIGH
  partner_type?: string | null;
  partner_criteria?: unknown;
  agent?: string | null;
  can_sign?: boolean;
  can_delete?: boolean;
};

export type DocsPage = {
  items: DocRow[];
  total: number;
  skip: number;
  limit: number;
};

export type DocCounts = {
  all: number;
  pending: number;
  signed: number;
  rejected: number;
  deleted: number;
  draft: number;
};

export type DocParty = {
  name?: string | null;
  tin?: string | null;
  address?: string | null;
  phone?: string | null;
  director?: string | null;
  accountant?: string | null;
  account?: string | null;
  bank_id?: string | null;
  vat_reg_code?: string | null;
  vat_reg_status?: string | null;
};

export type VatBreakdownRow = {
  rate: string;
  without_vat?: number | null;
  vat_sum?: number | null;
  with_vat?: number | null;
  count: number;
};

export type BankTx = {
  direction?: string | null; // 'in' | 'out'
  document_date?: string | null;
  payment_number?: string | null;
  counterparty?: string | null;
  payment_purpose?: string | null;
  amount?: number | null;
};

export type BankTxResult = {
  available: boolean;
  reason?: string | null;
  contract: BankTx[];
  partner: BankTx[];
};

// ---- statistics (invoice-002-flow) -----------------------------------------
export type FlowCounterparty = { name?: string; tin?: string; count?: number; amount?: number | string };
export type FlowBucket = {
  count?: number;
  amount?: number | string;
  counterparties?: FlowCounterparty[];
  top_counterparty?: FlowCounterparty;
};
export type FlowGroup = { owner_0?: FlowBucket; owner_1?: FlowBucket; total?: FlowBucket };
export type InvoiceFlowStats = {
  error?: string;
  period?: { date_from?: string; date_to?: string; timezone?: string };
  totals?: FlowBucket;
  invoice_002?: { pending?: FlowGroup; signed?: FlowGroup };
};

export type DocProduct = {
  ord_no?: number | null;
  name?: string | null;
  catalog_code?: string | null;
  barcode?: string | null;
  count?: number | null;
  summa?: number | null;
  delivery_sum?: number | null;
  vat_rate?: string | number | null;
  vat_sum?: number | null;
  delivery_sum_with_vat?: number | null;
};

export type DocDetail = {
  doc_id?: string | null;
  doctype?: string | null;
  doc_status?: number | null;
  status_group?: string | null;
  owner?: number | null;
  doc_date?: string | null;
  signed_date?: string | null;
  created?: string | null;
  updated?: string | null;
  name?: string | null;
  contract_number?: string | null;
  contract_date?: string | null;
  partner_tin?: string | null;
  partner_name?: string | null;
  partner_phone?: string | null;
  users_tax_id?: string | null;
  seller_account?: string | null;
  total_sum?: number | null;
  total_without_vat?: number | null;
  total_vat_sum?: number | null;
  total_with_vat?: number | null;
  vat_breakdown?: VatBreakdownRow[];
  has_vat?: boolean | null;
  has_marks?: boolean | null;
  has_lgota?: boolean | null;
  doc_rating?: string | null;
  partner_type?: string | null;
  partner_criteria?: unknown;
  agent?: string | null;
  seller?: DocParty | null;
  buyer?: DocParty | null;
  products: DocProduct[];
  can_sign?: boolean;
  can_delete?: boolean;
  /** Full upstream Didox object echoed by the backend — holds the uploaded
   *  file reference (json_data.url / filename) for free-docs & contracts. */
  raw?: Record<string, unknown> | null;
};

/** The uploaded file behind a document (contract / free-doc PDF or scan). */
export type DocFile = { url: string; name: string; kind: "pdf" | "image" | "other" };

/** Pull the attached file out of the raw Didox payload (json_data.url + filename). */
export function extractDocFile(data?: DocDetail | null): DocFile | null {
  const raw = data?.raw;
  if (!raw || typeof raw !== "object") return null;
  let jd: unknown = (raw as Record<string, unknown>).json_data;
  if (typeof jd === "string") {
    try { jd = JSON.parse(jd); } catch { jd = null; }
  }
  const jo = (jd && typeof jd === "object" ? (jd as Record<string, unknown>) : {}) as Record<string, unknown>;
  const url =
    (typeof jo.url === "string" && jo.url) ||
    (typeof (raw as Record<string, unknown>).pdf_path === "string" && (raw as Record<string, unknown>).pdf_path as string) ||
    (typeof (raw as Record<string, unknown>).image_path === "string" && (raw as Record<string, unknown>).image_path as string) ||
    "";
  if (!url) return null;
  const name = (typeof jo.filename === "string" && jo.filename) || data?.name || "document";
  const probe = `${name} ${url}`.toLowerCase();
  const kind: DocFile["kind"] = /\.pdf(\b|$|\?)|\/pdf/.test(probe)
    ? "pdf"
    : /\.(png|jpe?g|gif|webp|bmp|tiff?)(\b|$|\?)/.test(probe)
      ? "image"
      : "pdf"; // unknown uploads are almost always PDFs on Didox
  return { url, name, kind };
}

// ---- create flow -----------------------------------------------------------
export type PartyInfo = {
  tin?: string | null;
  name?: string | null;
  address?: string | null;
  account?: string | null;
  bank_id?: string | null;
  director?: string | null;
  accountant?: string | null;
  vat_reg_code?: string | null;
  vat_reg_status?: string | null;
  oked?: string | null;
  is_yatt?: boolean;
  pinfl?: string | null;
  found?: boolean;
  source?: string | null;
};

export type MxikItem = {
  code: string;
  name?: string | null;
  group?: string | null;
  units?: unknown;
  packages: Array<{ code?: string; name?: string; name_ru?: string }>;
};

export type CreatePartyIn = {
  tin?: string;
  name?: string;
  address?: string;
  account?: string;
  bank_id?: string;
  director?: string;
  accountant?: string;
  vat_reg_code?: string;
  vat_reg_status?: string;
};

export type CreateProductIn = {
  name: string;
  mxik_code?: string;
  mxik_name?: string;
  package_code?: string;
  package_name?: string;
  barcode?: string;
  count: number;
  price: number;
  delivery_extra?: number;
  vat_rate: string; // 'none' | '0' | '12' | '15'
  origin?: number;
  is_marked?: boolean;
};

export type CreateContractPartIn = { title?: string; body?: string };

export type CreateDocIn = {
  doc_type: string;
  seller: CreatePartyIn;
  buyer: CreatePartyIn;
  factura_no?: string;
  factura_date?: string;
  contract_no?: string;
  contract_date?: string;
  act_text?: string;
  products?: CreateProductIn[];
  contract_name?: string;
  valid_to?: string;
  parts?: CreateContractPartIn[];
  doc_name?: string;
  pdf_base64?: string;
  pdf_filename?: string;
  sign_after_create?: boolean;
};

export type CreateResult = {
  ok: boolean;
  doc_id?: string | null;
  signed?: boolean;
  message?: string | null;
};

export const CREATE_DOCTYPES = [
  { value: "002", label: "Hisob-faktura" },
  { value: "005", label: "Bajarilgan ish dalolatnomasi (Akt)" },
  { value: "007", label: "Shartnoma" },
  { value: "000", label: "Erkin hujjat (PDF)" },
];

export const VAT_RATES = [
  { value: "none", label: "QQSsiz" },
  { value: "0", label: "0%" },
  { value: "12", label: "12%" },
  { value: "15", label: "15%" },
];

// ---- doctype labels (Didox codes → Uzbek) ----------------------------------
export const DOCTYPES: Record<string, string> = {
  "000": "Erkin hujjat",
  "001": "Hisob-faktura",
  "002": "Hisob-faktura",
  "005": "Bajarilgan ish dalolatnomasi",
  "006": "Ishonchnoma",
  "007": "Shartnoma",
  "008": "Farm. hisob-faktura",
  "010": "Ko'p tomonlama",
  "041": "Yuk xati (TTN)",
  "052": "Solishtirma dalolatnoma",
  "054": "Qabul dalolatnomasi",
  "075": "Bayonnoma",
};

export function doctypeLabel(code?: string | null): string {
  if (!code) return "—";
  return DOCTYPES[code] ?? code;
}

// ---- status group → label + badge variant ----------------------------------
export type BadgeVariant = "success" | "warning" | "danger" | "info" | "muted";

export const STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  draft: { label: "Qoralama", variant: "muted" },
  pending: { label: "Imzo kutilmoqda", variant: "warning" },
  signed: { label: "Imzolangan", variant: "success" },
  rejected: { label: "Rad etilgan", variant: "danger" },
  deleted: { label: "O'chirilgan", variant: "muted" },
};

export function statusMeta(group?: string | null) {
  return (group && STATUS_META[group]) || { label: group ?? "—", variant: "muted" as BadgeVariant };
}

// ---- sidebar sections (mirror cloud: 5 sections) ---------------------------
// incoming/outgoing/drafts → real document lists; templates/stats → special views.
export type SectionKey = "incoming" | "outgoing" | "drafts" | "templates" | "stats";
export const SECTIONS: { key: SectionKey; label: string; owner: number | null }[] = [
  { key: "incoming", label: "Kiruvchi", owner: 0 },
  { key: "outgoing", label: "Chiquvchi", owner: 1 },
  { key: "drafts", label: "Qoralama", owner: 0 },
  { key: "templates", label: "Shablonlar", owner: null },
  { key: "stats", label: "Hisobotlar", owner: null },
];

export const STATUS_TABS = [
  { key: "all", label: "Hammasi", countKey: "all" },
  { key: "pending", label: "Imzo kutilmoqda", countKey: "pending" },
  { key: "signed", label: "Imzolangan", countKey: "signed" },
  { key: "rejected", label: "Rad etilgan", countKey: "rejected" },
  { key: "draft", label: "Qoralama", countKey: "draft" },
  { key: "deleted", label: "O'chirilgan", countKey: "deleted" },
] as const;
export type StatusTabKey = (typeof STATUS_TABS)[number]["key"];

// Drafts section only shows All + Deleted (mirror cloud draft-only tab filtering).
export const DRAFT_STATUS_TABS: StatusTabKey[] = ["all", "deleted"];

// doctype filter options — full 11-type list from cloud documents.php
export const DOCTYPE_FILTER = [
  { value: "002", label: "Hisob-faktura" },
  { value: "008", label: "Farm. hisob-faktura" },
  { value: "005", label: "Bajarilgan ish dalolatnomasi" },
  { value: "006", label: "Ishonchnoma" },
  { value: "007", label: "Shartnoma" },
  { value: "000", label: "Erkin hujjat" },
  { value: "010", label: "Ko'p tomonlama" },
  { value: "075", label: "Bayonnoma" },
  { value: "041", label: "Yuk xati (TTN)" },
  { value: "052", label: "Solishtirma dalolatnoma" },
  { value: "054", label: "Qabul dalolatnomasi" },
];

// ---- list columns (id + label + togglable) — mirror cloud DOC_COL_TOGGLE ----
export type ColumnId =
  | "status" | "doctype" | "date" | "counterparty" | "phone" | "amount"
  | "without_vat" | "vat" | "with_vat" | "contract" | "risk" | "agent" | "benefits";

export const DOC_COLUMNS: { id: ColumnId; label: string; align?: "right" }[] = [
  { id: "doctype", label: "Tur" },
  { id: "status", label: "Holat" },
  { id: "date", label: "Sana" },
  { id: "counterparty", label: "Kontragent" },
  { id: "amount", label: "Summa", align: "right" },
  { id: "without_vat", label: "QQSsiz summa", align: "right" },
  { id: "vat", label: "QQS summa", align: "right" },
  { id: "with_vat", label: "QQS bilan", align: "right" },
  { id: "contract", label: "Shartnoma" },
  { id: "risk", label: "Risk" },
  { id: "agent", label: "Agent" },
  { id: "benefits", label: "Imtiyoz" },
];
export const DOC_COL_STORAGE_KEY = "aiba-poc.docs-visible-cols";

export const PAGE_SIZES = [10, 20, 50, 100];

// ---- risk (doc_rating) badge ----------------------------------------------
export function riskMeta(rating?: string | null): { label: string; variant: BadgeVariant } | null {
  if (!rating) return null;
  const r = rating.toUpperCase();
  if (r === "HIGH") return { label: "Yuqori", variant: "danger" };
  if (r === "MEDIUM") return { label: "O'rta", variant: "warning" };
  if (r === "LOW") return { label: "Past", variant: "success" };
  return { label: rating, variant: "muted" };
}
