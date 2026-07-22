import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// ── Types (inline — do not edit shared types) ────────────────────────────────
export type AvSource = "document" | "bank_txn" | "fiscal_cheque" | "vedmosti";
export type AvStatus = "unprocessed" | "unconfirmed" | "confirmed" | "sent" | "imported";

export type ProvodkaLine = {
  /** 1C's own line number within the document (`НомерСтроки`). */
  line?: number | null;
  debit_account?: string | null;
  credit_account?: string | null;
  debit_account_name?: string | null;
  credit_account_name?: string | null;
  amount?: number | null;
  description?: string | null;
  period?: string | null;
};

export type ClassifyValidationError = {
  code: string;
  message?: string | null;
  details?: Record<string, unknown> | null;
};

/** provodka-ai `/api/v2/classify` response (cloud-parity rich result). */
export type ClassifyResult = {
  audit_id?: string | null;
  /** rule | learned_pattern | gemini_pro | gemini_pro_judged | no_rule */
  source: string;
  /** Comes back as a string ("1.0") or number — coerce with Number(). */
  confidence: number | string;
  requires_review: boolean;
  entries: ProvodkaLine[];
  reasoning?: string | null;
  ambiguities?: string[] | null;
  validation_errors?: ClassifyValidationError[] | null;
  operation_type?: string | null;
  model?: string | null;
  duration_ms?: number | null;
  tokens_used?: {
    input_cached?: number;
    input_uncached?: number;
    output?: number;
  } | null;
  ledger_summary?: Record<string, unknown> | null;
};

export type ClassifyRequest = {
  source_type: AvSource;
  source_data: Record<string, unknown>;
  instruction?: string;
};

export type MatchedOnec = {
  id?: string | null;
  number?: string | null;
  date?: string | null;
  sum?: number | null;
  counterparty_name?: string | null;
  counterparty_inn?: string | null;
  type?: string | null;
  _confirmed_at?: number | null;
  _sent_at?: number | null;
  _rejected_at?: number | null;
  _reject_reason?: string | null;
  _dispatcher_note?: string | null;
};

/**
 * Document direction — backend derives from owner / buyer/sellerTin vs own INN.
 *
 * The `"all"` member is filter-only (used in `SourceListFilters.direction` and
 * page state); rows that come back from the backend will only ever carry
 * `"incoming"` or `"outgoing"`.
 */
export type AvDirection = "all" | "incoming" | "outgoing";

/**
 * Backend-derived bucket from Didox `doc_status` (or synthetic 1C status).
 * Drives the colored chip rendered in the HOLAT column.
 */
export type AvStatusGroup =
  | "signed"
  | "pending"
  | "rejected"
  | "draft"
  | "deleted"
  | "unknown";

/** Localized label pair emitted by backend for doctype + doc_status. */
export type AvLabel = {
  ru?: string | null;
  uz?: string | null;
};

/** One Дт/Кт pair from `in_onec_accounts`. */
export type AvOnecAccount = {
  debit: string;
  credit: string;
  amount: number;
};

export type AvEntry = {
  id: number;
  company_id: string;
  source_type: AvSource;
  source_id: string;
  /** TRI-state: true = in 1C, false = checked and absent, null = not checked yet. */
  in_onec: boolean | null;
  has_provodka: boolean;
  status: AvStatus;
  operation_type: string | null;
  last_checked_at: string | null;
  onec_number: string | null;
  onec_date: string | null;
  counterparty_name: string | null;
  counterparty_inn: string | null;
  onec_type: string | null;
  amount: number | null;
  first_entry_debit: string | null;
  first_entry_credit: string | null;
  entries_count: number;
  entries: ProvodkaLine[];
  matched_onec: MatchedOnec | null;
  // Surfaced from matched_onec._* helpers.
  reject_reason: string | null;
  rejected_at: string | null;
  sent_at: string | null;
  confirmed_at: string | null;
  // Only on send-action response when dispatcher is unreachable.
  note?: string | null;

  // ── Cloud-parity row fields (`_didox_to_entry` in backend) ────────────────
  /** Document date (ISO `YYYY-MM-DD`). Falls back to onec_date when absent. */
  doc_date?: string | null;
  /** EDO creation date (didox `created`) — what the document list is ordered by. */
  created?: string | null;
  /** Didox doctype code, e.g. "002", "041". */
  doctype?: string | null;
  doctype_code?: string | number | null;
  /** Localized doctype label pair (uz/ru). */
  doctype_label?: AvLabel | null;
  /** Raw Didox doc_status. */
  doc_status?: string | number | null;
  doc_status_code?: string | number | null;
  /** Localized doc_status label pair. */
  doc_status_label?: AvLabel | null;
  /** Derived bucket: signed/pending/rejected/draft/deleted/unknown. */
  status_group?: AvStatusGroup | null;
  /** Document direction: incoming = bizga, outgoing = bizdan. */
  direction?: AvDirection | null;
  /** Pre-grouped Дт/Кт pairs for the 1C/Provodka cell. */
  in_onec_accounts?: AvOnecAccount[];
  /** 1C version when the document is already posted. */
  onec_version?: string | null;
  /** Convenience: Didox internal name / short ref. */
  name?: string | null;
  /** Convenience: Didox doc_id (hex32) when available. */
  doc_id?: string | null;
  /** Didox canonical lowercase UUID `id` — used for detail fetch + classify. */
  didox_id?: string | null;
  /** True when this row came from the live Didox/1C listing (no DB cache). */
  live?: boolean;
  /** Raw upstream row for bank_txn / fiscal_cheque — fed straight to classify. */
  raw?: Record<string, unknown>;
};

/**
 * Stable per-row identity for selection.
 *
 * `id` is the cache-row primary key and is **0 for every live row** — documents
 * come straight from didox and the 1C cache table is empty, so keying selection
 * on it made one checkbox tick the whole page. Fall back through the didox
 * identifiers, which are unique per document.
 */
export const entryKey = (e: AvEntry): string =>
  e.didox_id || e.doc_id || e.source_id || String(e.id);

export type AvEntryPage = {
  items: AvEntry[];
  total: number;
  skip: number;
  limit: number;
};

export type AvFilters = {
  source: "all" | AvSource;
  status: "all" | AvStatus;
  skip: number;
  limit: number;
};

export type AvStats = {
  total: number;
  by_status: Record<AvStatus, number>;
  by_source: Record<AvSource, number>;
  by_source_status: Record<AvSource, Record<AvStatus, number>>;
};

export type ClassifyMeta = {
  id: number;
  company_id: string;
  document_id: string;
  source_type: AvSource | string;
  operation_type: string | null;
  onec_version: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type ClassifyMetaPage = {
  items: ClassifyMeta[];
  total: number;
  skip: number;
  limit: number;
};

export type ConfirmPayload = {
  dt?: string | null;
  kt?: string | null;
  amount?: number | null;
  notes?: string | null;
};

export type BulkActionResult = {
  ok: number[];
  failed: { id: number; error: string }[];
  ok_count: number;
  failed_count: number;
  note?: string | null;
};

export type ClassifyMetaCreate = {
  document_id: string;
  source_type: AvSource | string;
  operation_type?: string | null;
  onec_version?: string | null;
};

export type ClassifyMetaPatch = Partial<ClassifyMetaCreate>;

// ── Queries ──────────────────────────────────────────────────────────────────
const base = (companyId: number) => `/avtoprovodka/companies/${companyId}`;

export function useAvEntries(companyId: number, f: AvFilters) {
  return useQuery<AvEntryPage>({
    queryKey: ["avtoprovodka", "entries", companyId, f],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        source: f.source,
        status: f.status,
        skip: f.skip,
        limit: f.limit,
      };
      return (await api.get(`${base(companyId)}/entries`, { params })).data;
    },
    enabled: !!companyId,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useAvEntry(entryId: number | null) {
  return useQuery<AvEntry>({
    queryKey: ["avtoprovodka", "entry", entryId],
    queryFn: async () =>
      (await api.get(`/avtoprovodka/entries/${entryId}`)).data,
    enabled: entryId != null && entryId > 0,
    staleTime: 30_000,
  });
}

export function useAvStats(companyId: number) {
  return useQuery<AvStats>({
    queryKey: ["avtoprovodka", "stats", companyId],
    queryFn: async () =>
      (await api.get(`${base(companyId)}/stats`)).data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

// ── Mutations — entry actions ────────────────────────────────────────────────
function invalidateEntries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["avtoprovodka", "entries"] });
  qc.invalidateQueries({ queryKey: ["avtoprovodka", "entry"] });
  qc.invalidateQueries({ queryKey: ["avtoprovodka", "stats"] });
}

export function useConfirmEntry() {
  const qc = useQueryClient();
  return useMutation<AvEntry, unknown, { id: number; payload: ConfirmPayload }>({
    mutationFn: async ({ id, payload }) =>
      (await api.post(`/avtoprovodka/entries/${id}/confirm`, payload)).data,
    onSuccess: () => invalidateEntries(qc),
  });
}

/** Confirm a (possibly edited) suggestion on a LIVE didox document. Writes the
 * provodka to didox and teaches the engine's T0 tier — the accountant's
 * confirmation becomes the rule for this counterparty. */
export function useConfirmProvodka(companyId: number) {
  const qc = useQueryClient();
  return useMutation<
    { status: string; learned: boolean; warning?: string | null },
    unknown,
    { docId: string; entries: ProvodkaLine[] }
  >({
    mutationFn: async ({ docId, entries }) =>
      (await api.post(`${base(companyId)}/documents/${docId}/confirm-provodka`, { entries })).data,
    onSuccess: () => invalidateEntries(qc),
  });
}

/** Confirm a bank/cheque provodka (no didox anchor — stored in km.avtoprov_provodka). */
export function useConfirmSourceProvodka(companyId: number) {
  const qc = useQueryClient();
  return useMutation<
    { status: string; source_id: string; learned: boolean },
    unknown,
    {
      source_type: AvSource;
      source_id: string;
      entries: ProvodkaLine[];
      raw?: Record<string, unknown>;
    }
  >({
    mutationFn: async ({ source_type, source_id, entries, raw }) =>
      (
        await api.post(`${base(companyId)}/provodka-confirm`, {
          source_type,
          source_id,
          entries,
          raw: raw ?? {},
        })
      ).data,
    onSuccess: () => invalidateEntries(qc),
  });
}

/** Send a CONFIRMED provodka into 1C over the onec-ws relay (desktop connector). */
export function useSendToOnec(companyId: number) {
  const qc = useQueryClient();
  return useMutation<
    { status: string; message?: string | null },
    unknown,
    { docId: string; infobase_id?: string | null }
  >({
    mutationFn: async ({ docId, infobase_id }) =>
      (await api.post(`${base(companyId)}/documents/${docId}/send-to-1c`, {
        infobase_id: infobase_id || "",
      })).data,
    onSuccess: () => {
      invalidateEntries(qc);
      // The backend flips in_1c optimistically on a successful write — pull
      // the fresh verdict into the visible list and the tab badges right away.
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "source-list"] });
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "source-counts"] });
    },
  });
}

export function useSendEntry() {
  const qc = useQueryClient();
  return useMutation<AvEntry, unknown, { id: number }>({
    mutationFn: async ({ id }) =>
      (await api.post(`/avtoprovodka/entries/${id}/send`, {})).data,
    onSuccess: () => invalidateEntries(qc),
  });
}

export function useRejectEntry() {
  const qc = useQueryClient();
  return useMutation<AvEntry, unknown, { id: number; reason: string }>({
    mutationFn: async ({ id, reason }) =>
      (await api.post(`/avtoprovodka/entries/${id}/reject`, { reason })).data,
    onSuccess: () => invalidateEntries(qc),
  });
}

export function useBulkConfirm() {
  const qc = useQueryClient();
  return useMutation<BulkActionResult, unknown, { ids: number[] }>({
    mutationFn: async ({ ids }) =>
      (await api.post(`/avtoprovodka/entries/bulk-confirm`, { ids })).data,
    onSuccess: () => invalidateEntries(qc),
  });
}

export function useBulkSend() {
  const qc = useQueryClient();
  return useMutation<BulkActionResult, unknown, { ids: number[] }>({
    mutationFn: async ({ ids }) =>
      (await api.post(`/avtoprovodka/entries/bulk-send`, { ids })).data,
    onSuccess: () => invalidateEntries(qc),
  });
}

/** Live AI classify — POST /avtoprovodka/companies/{cid}/classify → provodka-ai. */
export function useClassify(companyId: number) {
  return useMutation<ClassifyResult, unknown, ClassifyRequest>({
    mutationFn: async (payload) =>
      (await api.post(`${base(companyId)}/classify`, payload)).data,
  });
}

/** Didox document HTML (reuses the documents module endpoint) — for the detail
 * drawer's "Hujjatni ko'rish" viewer. */
export function useDocumentHtml(
  companyId: number, docId: string | null, enabled: boolean,
) {
  return useQuery<{ html: string; error?: string }>({
    queryKey: ["avtoprovodka", "doc-html", companyId, docId],
    queryFn: async () =>
      (await api.get(
        `/documents/companies/${companyId}/documents/${docId}/html`,
      )).data,
    enabled: !!companyId && !!docId && enabled,
    staleTime: 60_000,
  });
}

// ── Mutations — classify_meta CRUD ───────────────────────────────────────────
export function useClassifyMeta(companyId: number) {
  return useQuery<ClassifyMetaPage>({
    queryKey: ["avtoprovodka", "classify-meta", companyId],
    queryFn: async () =>
      (await api.get(`${base(companyId)}/classify-meta`)).data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

function invalidateMeta(qc: ReturnType<typeof useQueryClient>, companyId: number) {
  qc.invalidateQueries({ queryKey: ["avtoprovodka", "classify-meta", companyId] });
}

export function useCreateClassifyMeta(companyId: number) {
  const qc = useQueryClient();
  return useMutation<ClassifyMeta, unknown, ClassifyMetaCreate>({
    mutationFn: async (payload) =>
      (await api.post(`${base(companyId)}/classify-meta`, payload)).data,
    onSuccess: () => invalidateMeta(qc, companyId),
  });
}

export function useUpdateClassifyMeta(companyId: number) {
  const qc = useQueryClient();
  return useMutation<ClassifyMeta, unknown, { id: number; payload: ClassifyMetaPatch }>({
    mutationFn: async ({ id, payload }) =>
      (await api.put(`/avtoprovodka/classify-meta/${id}`, payload)).data,
    onSuccess: () => invalidateMeta(qc, companyId),
  });
}

export function useDeleteClassifyMeta(companyId: number) {
  const qc = useQueryClient();
  return useMutation<void, unknown, { id: number }>({
    mutationFn: async ({ id }) => {
      await api.delete(`/avtoprovodka/classify-meta/${id}`);
    },
    onSuccess: () => invalidateMeta(qc, companyId),
  });
}

// ── Display helpers ──────────────────────────────────────────────────────────
export function money(v?: number | null): string {
  return v == null ? "—" : Number(v).toLocaleString("ru-RU");
}

export function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v.slice(0, 10);
  return d.toLocaleDateString("ru-RU");
}

export function fmtDateTime(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("ru-RU");
}

export const SOURCE_META: Record<
  AvSource,
  { label: string; variant: "info" | "success" | "warning" | "secondary" }
> = {
  document: { label: "Hujjat", variant: "info" },
  bank_txn: { label: "Bank", variant: "success" },
  fiscal_cheque: { label: "Chek", variant: "warning" },
  vedmosti: { label: "Vedmosti", variant: "secondary" },
};

export const STATUS_META: Record<
  AvStatus,
  { label: string; variant: "warning" | "info" | "success" | "muted" | "danger" }
> = {
  unprocessed: { label: "Klassifikatsiya kutilmoqda", variant: "warning" },
  unconfirmed: { label: "Tasdiqlanmagan", variant: "info" },
  confirmed: { label: "Tasdiqlangan", variant: "success" },
  sent: { label: "1C ga yuborilgan", variant: "success" },
  imported: { label: "1C dan import", variant: "muted" },
};

export const ONEC_TYPE_LABEL: Record<string, string> = {
  PURCHASE_OF_GOODS_AND_SERVICES: "Tovar/xizmat xaridi",
  SALES_OF_GOODS_AND_SERVICES: "Tovar/xizmat sotuvi",
  PAYMENT_OUT: "To'lov (chiqim)",
  PAYMENT_IN: "Tushum",
};

// ── Cloud-parity reads ───────────────────────────────────────────────────────
export type SourceCounts = {
  document: number;
  bank_txn: number;
  fiscal_cheque: number;
  vedmosti: number;
  /** Cross-source SUM of not-in-1c — do NOT render per-tab (use the map below). */
  not_in_1c: number;
  /** Per-source not-in-1c so each tab shows its own count. */
  not_in_1c_by_source?: Partial<Record<AvSource, number>>;
  /** Checked AND found in 1C. `document - in_1c - not_in_1c` = never checked. */
  in_1c_by_source?: Partial<Record<AvSource, number>>;
};

export type SourceListFilters = {
  source: AvSource;
  year?: number | null;
  account?: string | null;
  file?: string | null;
  /** "" / undefined = all, "yes" = in 1C, "no" = not in 1C. */
  in_1c?: string;
  q?: string;
  page: number;
  page_size: number;
  // New: direction filter for Documents tab (kiruvchi/chiquvchi/all).
  // Backend agent owns the server-side filter; we pass-through here.
  direction?: AvDirection;
  // New: selected 1C base route_key. Empty string / undefined = "Auto"
  // (server picks). Forwarded as ?infobase_id= so the backend can scope
  // the list to a single base when the user picks one.
  infobase_id?: string | null;
  // New: Didox status_group filter (signed/pending/rejected/draft/deleted).
  status?: string | null;
  // New: Documents-tab side switch — didox vs 1C-side listings.
  docSource?: "didox" | "onec_out" | "onec_in" | null;
};

export type SourceListPage = {
  items: AvEntry[];
  total: number;
  skip: number;
  limit: number;
  page: number;
  pages: number;
};

export type OneCBase = {
  route_key: string | null;
  name: string;
  alias: string | null;
  is_online: boolean;
  // Picker-friendly display label. Backend emits this from the raw
  // ESKey/onec response (it.odataName ?? it.name); when present we
  // prefer it over `name` so the user sees the same label as cloud
  // ("108-UIC", "Главная База" etc).
  odataName?: string | null;
  // Whether a write can actually be routed to this base right now, per the
  // onec-ws relay's connector roster. `is_online` above only proves the READ
  // path (OData heartbeat) is alive — the two genuinely disagree, and a base
  // that is online-but-not-write-ready fails every send with ROUTE_NOT_FOUND.
  // `null`/undefined = we could not reach the relay, so say nothing.
  write_ready?: boolean | null;
  // Raw relay status behind `write_ready` ("connected" / "not_connected" /
  // "unregistered"), kept for the tooltip.
  relay_status?: string | null;
  // Which accounting system the base lives in ("1c" | "1uz").
  provider?: OnecProviderTag;
};

// A company's books live EITHER in 1C or in 1UZ (BePro) — the backend probes
// 1C first (priority) and falls back to 1UZ; `null` = neither has a base.
export type OnecProviderTag = "1c" | "1uz";

// Display name of the accounting system every "1C …" label switches on.
// Default is "1C" so a company without any base keeps today's wording.
export const sysLabel = (p?: OnecProviderTag | null): string =>
  p === "1uz" ? "1UZ" : "1C";

// `AvDirection` is defined near the top of this file (filter and row
// shapes share the same type). "all" mirrors cloud's neutral default;
// "incoming" = kiruvchi (received from counterparty), "outgoing" =
// chiquvchi (issued by us). Lifted from page state and forwarded to
// the source-list endpoint as ?direction=.

export type BankAccount = { our_account: string; count: number };
export type VedmostiFile = { source_file: string; count: number };

export type BankSyncStatus = {
  company_id: string;
  last_synced_at: number | null;
  sources: {
    external_source: string | null;
    last_synced_at: number | null;
    last_sync_status: string | null;
    last_sync_error: string | null;
  }[];
  never_synced: boolean;
};

export type Check1CStatus = {
  running: boolean;
  last_checked_at: number | null;
};

export type AiAutoResult = { queued_count: number; note?: string | null };

export type UploadResult = {
  status: "accepted" | "rejected";
  note?: string | null;
  filename?: string;
  size?: number;
  imported?: number;
};

// `year` scopes the badge to the same window as the list and the 1C scan.
// Left unscoped the badge counted every year's documents while the 1C verdicts
// only covered the selected one — "Hammasi 1118" next to "1C da bor 157 / yo'q
// 42", three numbers that could never add up.
export function useSourceCounts(companyId: number, year?: number | null) {
  return useQuery<SourceCounts>({
    queryKey: ["avtoprovodka", "source-counts", companyId, year ?? null],
    queryFn: async () =>
      (await api.get(`${base(companyId)}/source-counts`, {
        params: year != null ? { year } : {},
      })).data,
    enabled: !!companyId,
    staleTime: 15_000,
  });
}

export function useSourceList(companyId: number, f: SourceListFilters) {
  return useQuery<SourceListPage>({
    queryKey: ["avtoprovodka", "source-list", companyId, f],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {
        page: f.page,
        page_size: f.page_size,
      };
      if (f.year != null) params.year = f.year;
      if (f.account) params.account = f.account;
      if (f.file) params.file = f.file;
      if (f.in_1c) params.in_1c = f.in_1c;
      if (f.q) params.q = f.q;
      if (f.direction && f.direction !== "all") params.direction = f.direction;
      if (f.infobase_id) params.infobase_id = f.infobase_id;
      if (f.status) params.status = f.status;
      if (f.docSource) params.docSource = f.docSource;
      return (await api.get(
        `${base(companyId)}/${f.source}/list`,
        { params },
      )).data;
    },
    enabled: !!companyId && !!f.source,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useOnecBases(companyId: number) {
  return useQuery<{
    items: OneCBase[];
    total: number;
    provider?: OnecProviderTag | null;
  }>({
    queryKey: ["avtoprovodka", "onec-bases", companyId],
    queryFn: async () =>
      (await api.get(`${base(companyId)}/onec-bases`)).data,
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

export function useBankAccounts(companyId: number, enabled: boolean) {
  return useQuery<{ accounts: BankAccount[]; total: number }>({
    queryKey: ["avtoprovodka", "bank-accounts", companyId],
    queryFn: async () =>
      (await api.get(`${base(companyId)}/bank/accounts`)).data,
    enabled: !!companyId && enabled,
    staleTime: 60_000,
  });
}

export function useVedmostiFiles(companyId: number, enabled: boolean) {
  return useQuery<{ files: VedmostiFile[]; total: number }>({
    queryKey: ["avtoprovodka", "vedmosti-files", companyId],
    queryFn: async () =>
      (await api.get(`${base(companyId)}/vedmosti/files`)).data,
    enabled: !!companyId && enabled,
    staleTime: 60_000,
  });
}

export function useBankSyncStatus(companyId: number, enabled: boolean) {
  return useQuery<BankSyncStatus>({
    queryKey: ["avtoprovodka", "bank-sync-status", companyId],
    queryFn: async () =>
      (await api.get(`${base(companyId)}/bank/sync-status`)).data,
    enabled: !!companyId && enabled,
    staleTime: 30_000,
  });
}

// ── Cloud-parity writes (poc-graceful) ───────────────────────────────────────

/** Live progress of a running 1C scan, as reported by check-1c/status. */
export type Check1CProgress = {
  running?: boolean;
  /** Documents given a verdict so far. */
  scanned?: number;
  /** Documents this run will walk. 0 until the scan publishes it. */
  total?: number;
  /**
   * What the run is doing. Scan: indexing → collecting → provodka → checking.
   * Bulk selection actions: indexing → classifying, or sending.
   */
  phase?:
    | "indexing"
    | "collecting"
    | "provodka"
    | "checking"
    | "classifying"
    | "sending";
  /** Closing summary once the run has finished ("12 ta hujjat 1C ga yuborildi"). */
  note?: string | null;
  /** Whether the finished run succeeded outright. */
  ok?: boolean | null;
};

/**
 * Server-side state of the 1C scan for one source.
 *
 * The scan is a BACKGROUND job, so its progress must come from the server, not
 * from the mutation that started it: a page reload discards mutation state and
 * the UI would show nothing while a scan was still running (and would never
 * refresh the list when it finished).
 *
 * Polls only while a scan is actually running, and refreshes the list + counts
 * on the running → finished edge.
 */
export function useCheck1CStatus(companyId: number, source: AvSource | "bulk") {
  const qc = useQueryClient();
  const wasRunning = useRef(false);
  const q = useQuery<Check1CProgress>({
    queryKey: ["avtoprovodka", "check1c-status", companyId, source],
    queryFn: async () =>
      (await api.get(`${base(companyId)}/check-1c/status`, { params: { source } })).data,
    // Cheques have no 1C reconciliation, vedmosti neither.
    enabled:
      !!companyId && (source === "document" || source === "bank_txn" || source === "bulk"),
    refetchInterval: (query) => (query.state.data?.running ? 2000 : false),
    staleTime: 0,
  });

  const running = !!q.data?.running;
  useEffect(() => {
    if (wasRunning.current && !running) {
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "source-list"] });
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "source-counts"] });
    }
    wasRunning.current = running;
  }, [running, qc]);

  return q;
}

export function useCheck1C(companyId: number) {
  const qc = useQueryClient();
  return useMutation<
    { status: string; note?: string | null; running?: boolean; last_checked_at?: number | null },
    unknown,
    { source: AvSource; year?: number | null }
  >({
    // Fire-and-forget: the scan is a background job on the server. Watching it
    // is `useCheck1CStatus`'s job, which reads the run row and therefore keeps
    // working across a page reload — this mutation used to poll in a local
    // loop, so refreshing the page lost the progress readout entirely and the
    // list was never refetched when the scan finished.
    mutationFn: async ({ source, year }) =>
      (await api.post(`${base(companyId)}/${source}/check-1c`, { year: year ?? null })).data,
    onSuccess: (_res, { source }) => {
      // Kick the status query so polling starts immediately.
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "check1c-status", companyId, source] });
    },
  });
}

/**
 * Bulk actions over the SELECTED rows.
 *
 * These post DIDOX document ids, not the numeric entry ids `/entries/bulk-*`
 * takes: documents are served live and have no cache row, so their numeric id
 * is 0 and the old endpoints silently did nothing. Both run in the background
 * and report progress through the shared 'bulk' run slot.
 */
export function useBulkSendDocs(companyId: number) {
  const qc = useQueryClient();
  return useMutation<
    { running?: boolean; total?: number; note?: string | null },
    unknown,
    { docIds: string[]; infobase_id?: string | null }
  >({
    mutationFn: async ({ docIds, infobase_id }) =>
      (await api.post(`${base(companyId)}/documents/bulk-send-1c`, {
        doc_ids: docIds,
        infobase_id: infobase_id || "",
      })).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "check1c-status", companyId, "bulk"] }),
  });
}

export function useBulkClassifyDocs(companyId: number) {
  const qc = useQueryClient();
  return useMutation<
    { running?: boolean; total?: number; note?: string | null },
    unknown,
    { docIds: string[] }
  >({
    mutationFn: async ({ docIds }) =>
      (await api.post(`${base(companyId)}/documents/bulk-classify`, { doc_ids: docIds })).data,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "check1c-status", companyId, "bulk"] }),
  });
}

export function useAiAuto(companyId: number) {
  const qc = useQueryClient();
  return useMutation<AiAutoResult, unknown, { source: AvSource }>({
    mutationFn: async ({ source }) =>
      (await api.post(`${base(companyId)}/${source}/ai-auto`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "source-list"] });
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "source-counts"] });
    },
  });
}

export function useBankSync(companyId: number) {
  const qc = useQueryClient();
  return useMutation<{ status: string; note?: string | null }, unknown, void>({
    mutationFn: async () =>
      (await api.post(`${base(companyId)}/bank/sync`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "bank-sync-status"] });
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "source-list"] });
    },
  });
}

export function useUploadBankExcel(companyId: number) {
  const qc = useQueryClient();
  return useMutation<UploadResult, unknown, { file: File }>({
    mutationFn: async ({ file }) => {
      const buf = await file.arrayBuffer();
      return (await api.post(
        `${base(companyId)}/bank/upload-excel`,
        buf,
        {
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Filename": encodeURIComponent(file.name),
          },
        },
      )).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "source-list"] });
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "source-counts"] });
    },
  });
}

export function useUploadVedmostiExcel(companyId: number) {
  const qc = useQueryClient();
  return useMutation<UploadResult, unknown, { file: File }>({
    mutationFn: async ({ file }) => {
      const buf = await file.arrayBuffer();
      return (await api.post(
        `${base(companyId)}/vedmosti/upload`,
        buf,
        {
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Filename": encodeURIComponent(file.name),
          },
        },
      )).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "source-list"] });
      qc.invalidateQueries({ queryKey: ["avtoprovodka", "source-counts"] });
    },
  });
}

// ── Source-tab labels (mirrors cloud aiba-av-side-tab) ───────────────────────
export const SOURCE_TAB_LABEL: Record<AvSource, string> = {
  document: "Hujjatlar",
  bank_txn: "Bank txns",
  fiscal_cheque: "Cheklar",
  vedmosti: "Vedmosti",
};

export type DocSource = "didox" | "onec_out" | "onec_in";
export const DOC_SOURCES: DocSource[] = ["didox", "onec_out", "onec_in"];
// Label carries the company's accounting system name ("1C" | "1UZ").
export const docSourceLabel = (k: DocSource, sys: string): string =>
  ({
    didox: "Didox",
    onec_out: `${sys} — chiquvchi`,
    onec_in: `${sys} — kiruvchi`,
  })[k];
