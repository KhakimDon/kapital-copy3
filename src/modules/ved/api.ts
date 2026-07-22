import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// ── Types (inline) ───────────────────────────────────────────────────────────
export type GtdDeclaration = {
  gtd_number: string | null;
  reg_date: string | null;
  doctype: string | null;
  goods_count: number | null;
  yur_inn: string | null;
  // forward-compatible — the customs service may return more fields
  [k: string]: unknown;
};

export type VedDeclarationsResp = {
  items: GtdDeclaration[];
  count: number;
  available: boolean;
  reason?: string;
};

/** GTD customs declarations for the current company (BFF → aiba-customs).
 *  Returns `available:false` (empty) when the customs service is unreachable
 *  or the company has no INN — the page shows a "not connected / no data" notice. */
export function useVedDeclarations(companyId: number | null, dateFrom?: string, dateTo?: string) {
  return useQuery<VedDeclarationsResp>({
    queryKey: ["ved", "declarations", companyId, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      const qs = params.toString();
      return (await api.get(`/ved/companies/${companyId}/declarations${qs ? `?${qs}` : ""}`)).data;
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });
}

// ── Backfill (Celery worker fetches everything, list shows complete only) ─────
export type VedBackfillStatus = {
  ok: boolean;
  status: "idle" | "queued" | "running" | "done" | "error";
  total: number;
  done: number;
  complete_count: number;
  date_from?: string | null;
  date_to?: string | null;
  message?: string | null;
};

/** Backfill progress for the current company. Polls every 5s while the worker
 *  is queued/running so the button + progress bar stay live. */
export function useVedBackfill(companyId: number | null) {
  return useQuery<VedBackfillStatus>({
    queryKey: ["ved", "backfill", companyId],
    queryFn: async () => (await api.get(`/ved/companies/${companyId}/backfill`)).data,
    enabled: !!companyId,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "running" || s === "queued" ? 5000 : false;
    },
  });
}

/** Start the last-3-months backfill for the current company. */
export function useStartVedBackfill(companyId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => (await api.post(`/ved/companies/${companyId}/backfill`, {})).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ved", "backfill", companyId] });
    },
  });
}

// ── Detail (overview + goods) ────────────────────────────────────────────────
export type GtdOverviewResp = {
  ok: boolean;
  header?: Record<string, unknown>;
  goods_count?: number | string;
  source?: string;
  reason?: string;
};
export type GtdGoodsResp = {
  ok: boolean;
  goods?: Array<Record<string, unknown>>;
  goods_count?: number | string;
  complete?: boolean;   // false → ed2 still filling the tail; poll until true
  source?: string;
  reason?: string;
};

/** GTD header (numbered fields) for one declaration. */
export function useVedOverview(companyId: number | null, declId: string | null) {
  return useQuery<GtdOverviewResp>({
    queryKey: ["ved", "overview", companyId, declId],
    queryFn: async () =>
      (await api.get(`/ved/companies/${companyId}/declarations/${encodeURIComponent(declId!)}/overview`)).data,
    enabled: !!companyId && !!declId,
    staleTime: 300_000,
  });
}

/** All goods for one declaration. Big (100-good) declarations fill progressively
 *  on the server (ed2 throttles the bulk pull), so while `complete` is false we
 *  poll every 4s and the table fills in as the background scrape catches up. */
export function useVedGoods(companyId: number | null, declId: string | null) {
  return useQuery<GtdGoodsResp>({
    queryKey: ["ved", "goods", companyId, declId],
    queryFn: async () =>
      (await api.get(`/ved/companies/${companyId}/declarations/${encodeURIComponent(declId!)}/goods`)).data,
    enabled: !!companyId && !!declId,
    staleTime: 300_000,
    refetchInterval: (q) => (q.state.data && q.state.data.complete === false ? 4000 : false),
  });
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download the official РУ PDF (ed2 may wrap it in a ZIP). */
export async function downloadVedPdf(companyId: number, declId: string) {
  const resp = await api.get(
    `/ved/companies/${companyId}/declarations/${encodeURIComponent(declId)}/pdf`,
    { responseType: "blob", timeout: 120_000 },
  );
  const ct = String(resp.headers["content-type"] || "");
  const ext = ct.includes("zip") ? "zip" : "pdf";
  saveBlob(resp.data as Blob, `gtd-${declId}.${ext}`);
}

/** Download the GTD list as .xls. */
export async function downloadVedExcel(companyId: number, dateFrom?: string, dateTo?: string) {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const qs = params.toString();
  const resp = await api.get(`/ved/companies/${companyId}/gtd-excel${qs ? `?${qs}` : ""}`, {
    responseType: "blob",
    timeout: 120_000,
  });
  saveBlob(resp.data as Blob, "gtd.xls");
}
