// Derive the 12 per-tax filing-status cells from a row's reports + payments.
//
// Faithful port of cloud nextcloud-server/apps/aiba_soliq/js/profiles.js. The
// backend already filtered reports/payments to the period, so here we only
// assign each to a column (keyword-match the name) and aggregate the status.

import {
  TAX_COLUMNS,
  STATUS_KEYWORDS,
  NON_REPORT_PREFIXES,
  type TaxGridReport,
  type TaxGridPayment,
  type TaxGridRegion,
} from "./types";

export type ReportStatus =
  | "submitted" | "late" | "not_submitted" | "penalty" | "failed" | "unknown";

export type CellStatus = {
  // status drives the badge; see TaxStatusBadge
  status:
    | "paid" | "submitted_no_payment" | "submitted_not_paid"
    | "late" | "not_submitted" | "failed" | "penalty" | "none";
  label: string;
};

function isHelperForm(name: string): boolean {
  const lower = name.toLowerCase().trim();
  return NON_REPORT_PREFIXES.some((p) => lower.indexOf(p) === 0);
}

/** All column indices a report name matches (NDFL+social share one report). */
export function matchTaxColumns(taxName?: string | null): number[] {
  if (!taxName) return [];
  if (isHelperForm(taxName)) return [];
  const lower = taxName.toLowerCase();

  // 1) Combined NDFL + social report → both columns.
  const hasNdfl =
    lower.includes("daromad") || lower.includes("ндфл") ||
    lower.includes("jshds") || lower.includes("jismoniy") ||
    lower.includes("доходы физических");
  const hasSocial = lower.includes("ijtimoiy") || lower.includes("соц");
  if (hasNdfl && hasSocial) {
    const out: number[] = [];
    TAX_COLUMNS.forEach((c, i) => {
      if (c.id === "ndfl" || c.id === "social") out.push(i);
    });
    return out;
  }

  // 2) First single-column keyword match wins.
  for (let i = 0; i < TAX_COLUMNS.length; i++) {
    const col = TAX_COLUMNS[i];
    if (col.id === "itpark") {
      if (lower.includes("it-park") || lower.includes("itpark") || lower.includes("it park")) {
        return [i];
      }
      continue;
    }
    for (const kw of col.keywords) {
      if (lower.includes(kw)) return [i];
    }
  }
  return [];
}

function matchTaxColumn(taxName?: string | null): number {
  const m = matchTaxColumns(taxName);
  return m.length ? m[0] : -1;
}

export function detectReportStatus(statusStr?: string | null): ReportStatus {
  if (!statusStr) return "unknown";
  const lower = String(statusStr).toLowerCase();
  if (STATUS_KEYWORDS.penalty.some((k) => lower.includes(k))) return "penalty";
  if (STATUS_KEYWORDS.failed.some((k) => lower.includes(k))) return "failed";
  if (STATUS_KEYWORDS.late.some((k) => lower.includes(k))) return "late";
  if (STATUS_KEYWORDS.notPaid.some((k) => lower.includes(k))) return "not_submitted";
  if (STATUS_KEYWORDS.paid.some((k) => lower.includes(k))) return "submitted";
  return "unknown";
}

function paymentName(p: TaxGridPayment): string {
  const n = p.na2_name;
  if (n && typeof n === "object") {
    return n.name_ru || n.ru || n.name_uz_latn || "";
  }
  return n ? String(n) : "";
}

function matchPaymentToColumn(p: TaxGridPayment): number {
  return matchTaxColumn(paymentName(p));
}

function isPaymentPaid(p: TaxGridPayment): boolean {
  if (p.state === 4) return true;
  const s = String(p.state_name || "").toLowerCase();
  return s.includes("оплаченные банком") || s.includes("проведен") || s.includes("paid");
}

function buildCellStatus(reports: TaxGridReport[], payments: TaxGridPayment[]): CellStatus {
  if (reports.length === 0 && payments.length === 0) return { status: "none", label: "" };
  let hasSubmitted = false, hasLate = false, hasNotSubmitted = false,
    hasPenalty = false, hasFailed = false;
  for (const r of reports) {
    const st = detectReportStatus(r.status);
    if (st === "submitted") hasSubmitted = true;
    else if (st === "late") hasLate = true;
    else if (st === "not_submitted") hasNotSubmitted = true;
    else if (st === "penalty") hasPenalty = true;
    else if (st === "failed") hasFailed = true;
  }
  const hasPaidPayment = payments.some(isPaymentPaid);

  if (hasPenalty) return { status: "penalty", label: "Есть штраф" };
  if (hasFailed && !hasSubmitted && !hasLate) return { status: "failed", label: "Отказано / С ошибками" };
  if (hasNotSubmitted && !hasSubmitted && !hasLate) return { status: "not_submitted", label: "Не сдано" };
  if (hasLate) return { status: "late", label: "С опозданием" };
  if (hasSubmitted || reports.length > 0) {
    if (hasPaidPayment) return { status: "paid", label: "Сдано / Оплачено" };
    if (payments.length > 0) return { status: "submitted_not_paid", label: "Сдано / Не оплачено" };
    return { status: "submitted_no_payment", label: "Сдано" };
  }
  if (payments.length > 0) {
    return hasPaidPayment
      ? { status: "paid", label: "Оплачено" }
      : { status: "submitted_not_paid", label: "Не оплачено" };
  }
  return { status: "none", label: "" };
}

/** 12 cell statuses (reports mode), aligned with TAX_COLUMNS order. */
export function deriveReportStatuses(
  reports: TaxGridReport[] = [],
  payments: TaxGridPayment[] = [],
): CellStatus[] {
  const colReports: TaxGridReport[][] = Array.from({ length: 12 }, () => []);
  const colPayments: TaxGridPayment[][] = Array.from({ length: 12 }, () => []);
  for (const r of reports) {
    for (const i of matchTaxColumns(r.name)) colReports[i].push(r);
  }
  for (const p of payments) {
    const i = matchPaymentToColumn(p);
    if (i >= 0) colPayments[i].push(p);
  }
  return colReports.map((cr, i) => buildCellStatus(cr, colPayments[i]));
}

/** 12 payment sums (payments mode), aligned with TAX_COLUMNS order. */
export function derivePaymentSums(payments: TaxGridPayment[] = []): number[] {
  const sums = new Array<number>(12).fill(0);
  for (const p of payments) {
    const i = matchPaymentToColumn(p);
    if (i >= 0) sums[i] += Number(p.summa || 0);
  }
  return sums;
}

// ---- per-filial (per-region) splitting ------------------------------------

// Transliterate a tuman name Cyrillic→Latin and collapse x/h so report region
// names (Cyrillic) pair up with the canonical filial list (Latin).
const CYR_TO_LAT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "s", ч: "ch", ш: "sh", щ: "sh",
  ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
};

export function normalizeRegion(s?: string | null): string {
  if (!s) return "";
  const lower = String(s).toLowerCase().trim();
  let out = "";
  for (const ch of lower) out += CYR_TO_LAT[ch] !== undefined ? CYR_TO_LAT[ch] : ch;
  out = out.replace(/x/g, "h");
  // Strip every apostrophe variant used for Uzbek o'/g' — cloud only stripped
  // ' ` ', but the regions endpoint returns ' (U+2018) and ʻ (U+02BB), which
  // left "Mirzo Ulug'bek" unmatched against its Cyrillic report ("...ҒБЕК").
  out = out.replace(/['`’‘ʻ´\-]/g, "").replace(/\s+/g, " ").trim();
  out = out.replace(/\s*tumani\s*$/, "").replace(/\s*shahri\s*$/, "");
  return out;
}

export type FilialRow = {
  key: string;
  label: string;
  isDefault: boolean;
  debt?: number | null;
  advance?: number | null;
  cells: CellStatus[]; // 12, aligned with TAX_COLUMNS
};

/**
 * Per-filial child rows (reports-mode status). Returns [] when the company has
 * ≤1 registration district (no parent/child split needed). Reports whose region
 * doesn't match any canonical filial fall into a trailing "Other" row so data
 * is never silently dropped.
 */
export function deriveFilialRows(
  reports: TaxGridReport[] = [],
  regions: TaxGridRegion[] = [],
): FilialRow[] {
  if (regions.length <= 1) return [];

  const sorted = regions.slice().sort((a, b) => {
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  const regionIndex = new Map<string, number>();
  sorted.forEach((r, i) => {
    const n = normalizeRegion(r.name);
    if (n && !regionIndex.has(n)) regionIndex.set(n, i);
  });

  const byRegion: TaxGridReport[][][] = sorted.map(() =>
    Array.from({ length: 12 }, () => [] as TaxGridReport[]),
  );
  let otherCols: TaxGridReport[][] | null = null;
  let otherLabel = "";

  for (const rep of reports) {
    const cols = matchTaxColumns(rep.name);
    if (!cols.length) continue;
    const regName = (rep.region || "").trim();
    const regIdx = regName ? regionIndex.get(normalizeRegion(regName)) ?? -1 : -1;
    for (const ci of cols) {
      if (regIdx >= 0) {
        byRegion[regIdx][ci].push(rep);
      } else if (regName) {
        if (!otherCols) {
          otherCols = Array.from({ length: 12 }, () => []);
          otherLabel = regName;
        }
        otherCols[ci].push(rep);
      }
    }
  }

  const rows: FilialRow[] = sorted.map((r, i) => ({
    key: `${r.ns10_code}-${r.ns11_code}`,
    label: r.name || "—",
    isDefault: !!r.is_default,
    debt: r.debt,
    advance: r.advance,
    cells: byRegion[i].map((cr) => buildCellStatus(cr, [])),
  }));
  if (otherCols) {
    rows.push({
      key: "other",
      label: otherLabel,
      isDefault: false,
      cells: otherCols.map((cr) => buildCellStatus(cr, [])),
    });
  }
  return rows;
}
