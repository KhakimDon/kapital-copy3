import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

const BASE = "/warehouse";

// ── Types (inline; do not edit shared types) ────────────────────────────────
export type PurchaseStatus =
  | "draft"
  | "priced_pending"
  | "awaiting_load"
  | "tx_pending"
  | "tx_sent"
  | "delivered"
  | "ttn_official";

export type PurchaseItem = {
  id: number;
  purchase_id: number;
  template_id: number | null;
  item_name: string;
  custom_fields: Record<string, unknown> | null;
  qty: number | null;
  unit: string | null;
  unit_price: number | null;
  line_total: number | null;
  qty_received: number | null;
};

export type TxOrder = {
  id: number;
  supplier_id: number | null;
  payment_template_id: string | null;
  total: number | null;
  bank_tx_id: string | null;
  status: string;
  payment_purpose: string | null;
  payment_timing: "prepay" | "postpay";
  didox_invoice_id: string | null;
};

export type WhSupplier = {
  id: number;
  name: string;
  inn: string | null;
  phone: string | null;
  bank_account: string | null;
  mfo: string | null;
  purpose_code: string | null;
};

export type TtnDraft = {
  id: number;
  file_key: string | null;
  filename: string | null;
  official_file_key: string | null;
  official_filename: string | null;
  finalized_at: string | null;
  has_draft: boolean;
  has_official: boolean;
};

export type HistoryRow = {
  id: number;
  from_status: string | null;
  to_status: string;
  by_uid: string | null;
  by_display_name: string | null;
  comment: string | null;
  created_at: string | null;
};

export type Purchase = {
  id: number;
  order_id: number;
  company_id: number;
  branch_id: number | null;
  created_by_uid: string;
  status: PurchaseStatus;
  notes: string | null;
  creation_photo_key: string | null;
  created_at: string | null;
  updated_at: string | null;
  items: PurchaseItem[];
  items_count: number;
  tx_order: TxOrder | null;
  supplier: WhSupplier | null;
  ttn_draft: TtnDraft | null;
  total: number | null;
  history?: HistoryRow[];
};

export type PurchaseList = {
  items: Purchase[];
  total: number;
  page: number;
  size: number;
  pages: number;
};

// Create / edit
export type ItemInput = {
  item_name: string;
  qty: number | string;
  unit?: string;
  unit_price?: number | string;
  custom_fields?: Record<string, unknown>;
  template_id?: number;
};
export type CreateBody = { items: ItemInput[]; notes?: string; branch_id?: number };
export type UpdateBody = { items: ItemInput[]; notes?: string };
export type PriceBody = {
  items: { id: number; unit_price: number | string }[];
  supplier_id?: number;
  payment_template_id?: string;
  payment_timing: "prepay" | "postpay";
  payment_purpose?: string;
};
export type ReceivedItem = { id: number; qty_received: number | string };

// Masterdata (read over HTTP — owned by sibling agents)
export type WhTemplate = {
  id: number;
  name: string;
  category: string | null;
  fields_schema: { name?: string; label?: string; type?: string }[];
};

// ── Queries ──────────────────────────────────────────────────────────────────
const qk = (companyId: number, ...rest: unknown[]) => ["wh", "purchases", companyId, ...rest];

export function usePurchases(
  companyId: number,
  opts: { status?: string; q?: string; branch_id?: number; skip?: number; limit?: number },
) {
  return useQuery<PurchaseList>({
    queryKey: qk(companyId, "list", opts),
    queryFn: async () =>
      (
        await api.get(`${BASE}/companies/${companyId}/purchases`, {
          params: {
            status: opts.status || undefined,
            q: opts.q || undefined,
            branch_id: opts.branch_id || undefined,
            skip: opts.skip ?? 0,
            limit: opts.limit ?? 50,
          },
        })
      ).data,
    enabled: !!companyId,
    staleTime: 10_000,
  });
}

export function usePurchase(companyId: number, pid: number | null) {
  return useQuery<Purchase>({
    queryKey: qk(companyId, "detail", pid),
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/purchases/${pid}`)).data,
    enabled: !!companyId && !!pid,
  });
}

export function useWhSuppliers(companyId: number) {
  return useQuery<WhSupplier[]>({
    queryKey: ["wh", "suppliers", companyId],
    queryFn: async () => {
      const d = (await api.get(`${BASE}/companies/${companyId}/suppliers`)).data;
      return Array.isArray(d) ? d : d?.items ?? d?.results ?? [];
    },
    enabled: !!companyId,
    staleTime: 60_000,
    retry: false,
  });
}

export function useWhTemplates(companyId: number) {
  return useQuery<WhTemplate[]>({
    queryKey: ["wh", "templates", companyId],
    queryFn: async () => {
      const d = (await api.get(`${BASE}/companies/${companyId}/templates`)).data;
      return Array.isArray(d) ? d : d?.items ?? d?.results ?? [];
    },
    enabled: !!companyId,
    staleTime: 60_000,
    retry: false,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────--
function useInvalidate(companyId: number) {
  const qc = useQueryClient();
  return (pid?: number) => {
    qc.invalidateQueries({ queryKey: ["wh", "purchases", companyId] });
    if (pid) qc.invalidateQueries({ queryKey: qk(companyId, "detail", pid) });
  };
}

export function useCreatePurchase(companyId: number) {
  const inval = useInvalidate(companyId);
  return useMutation<Purchase, unknown, CreateBody>({
    mutationFn: async (body) =>
      (await api.post(`${BASE}/companies/${companyId}/purchases`, body)).data,
    onSuccess: () => inval(),
  });
}

export function useUpdatePurchase(companyId: number) {
  const inval = useInvalidate(companyId);
  return useMutation<Purchase, unknown, { pid: number; body: UpdateBody }>({
    mutationFn: async ({ pid, body }) =>
      (await api.put(`${BASE}/companies/${companyId}/purchases/${pid}`, body)).data,
    onSuccess: (_d, v) => inval(v.pid),
  });
}

export function useDeletePurchase(companyId: number) {
  const inval = useInvalidate(companyId);
  return useMutation<unknown, unknown, number>({
    mutationFn: async (pid) =>
      (await api.delete(`${BASE}/companies/${companyId}/purchases/${pid}`)).data,
    onSuccess: () => inval(),
  });
}

export function usePricePurchase(companyId: number) {
  const inval = useInvalidate(companyId);
  return useMutation<Purchase, unknown, { pid: number; body: PriceBody }>({
    mutationFn: async ({ pid, body }) =>
      (await api.put(`${BASE}/companies/${companyId}/purchases/${pid}/price`, body)).data,
    onSuccess: (_d, v) => inval(v.pid),
  });
}

export function useSetPaymentTiming(companyId: number) {
  const inval = useInvalidate(companyId);
  return useMutation<Purchase, unknown, { pid: number; payment_timing: "prepay" | "postpay" }>({
    mutationFn: async ({ pid, payment_timing }) =>
      (await api.put(`${BASE}/companies/${companyId}/purchases/${pid}/payment-timing`, { payment_timing })).data,
    onSuccess: (_d, v) => inval(v.pid),
  });
}

export function useSendTx(companyId: number) {
  const inval = useInvalidate(companyId);
  return useMutation<Purchase, unknown, { pid: number; bank_tx_id?: string; payment_purpose?: string }>({
    mutationFn: async ({ pid, bank_tx_id, payment_purpose }) =>
      (await api.put(`${BASE}/companies/${companyId}/purchases/${pid}/send-tx`, { bank_tx_id, payment_purpose })).data,
    onSuccess: (_d, v) => inval(v.pid),
  });
}

// File-bearing actions (raw body upload). When a file is present we send the
// bytes with X-Filename + optional X-Received-Items header; otherwise JSON.
async function postAction(
  url: string, file: File | null, receivedItems?: ReceivedItem[], extraHeaders?: Record<string, string>,
) {
  if (file) {
    const headers: Record<string, string> = {
      "Content-Type": file.type || "application/octet-stream",
      "X-Filename": encodeURIComponent(file.name),
      "X-Content-Type": file.type || "application/octet-stream",
      ...extraHeaders,
    };
    if (receivedItems && receivedItems.length) headers["X-Received-Items"] = JSON.stringify(receivedItems);
    const buf = await file.arrayBuffer();
    return (await api.post(url, buf, { headers })).data;
  }
  const body: Record<string, unknown> = {};
  if (receivedItems) body.received_items = receivedItems;
  return (await api.post(url, body)).data;
}

export function useReceiveGoods(companyId: number) {
  const inval = useInvalidate(companyId);
  return useMutation<Purchase, unknown, { pid: number; file: File | null; received_items?: ReceivedItem[] }>({
    mutationFn: async ({ pid, file, received_items }) =>
      postAction(`/api/v2${BASE}/companies/${companyId}/purchases/${pid}/receive-goods`, file, received_items).then(
        async () => (await api.get(`${BASE}/companies/${companyId}/purchases/${pid}`)).data,
      ),
    onSuccess: (_d, v) => inval(v.pid),
  });
}

export function useDeliver(companyId: number) {
  const inval = useInvalidate(companyId);
  return useMutation<Purchase, unknown, { pid: number; file: File | null; received_items?: ReceivedItem[] }>({
    mutationFn: async ({ pid, file, received_items }) =>
      postAction(`/api/v2${BASE}/companies/${companyId}/purchases/${pid}/deliver`, file, received_items).then(
        async () => (await api.get(`${BASE}/companies/${companyId}/purchases/${pid}`)).data,
      ),
    onSuccess: (_d, v) => inval(v.pid),
  });
}

export function useFinalizeTtn(companyId: number) {
  const inval = useInvalidate(companyId);
  return useMutation<Purchase, unknown, { pid: number; file: File | null; didox_invoice_id?: string }>({
    mutationFn: async ({ pid, file, didox_invoice_id }) =>
      postAction(
        `/api/v2${BASE}/companies/${companyId}/purchases/${pid}/ttn`,
        file,
        undefined,
        didox_invoice_id ? { "X-Didox-Invoice-Id": didox_invoice_id } : undefined,
      ).then(async () => (await api.get(`${BASE}/companies/${companyId}/purchases/${pid}`)).data),
    onSuccess: (_d, v) => inval(v.pid),
  });
}

// ── Helpers ────────────────────────────────────────────────────────────────--
export const money = (v?: number | string | null) =>
  v == null || v === "" ? "0" : Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 0 });

export function errMessage(e: unknown): string {
  const ax = e as { response?: { data?: unknown; status?: number } };
  const d = ax?.response?.data as Record<string, unknown> | string | undefined;
  if (typeof d === "string" && d) return d;
  if (d && typeof d === "object") {
    const detail = (d as Record<string, unknown>).detail;
    if (typeof detail === "string" && detail) return detail;
    const m = (d as Record<string, unknown>).message ?? (d as Record<string, unknown>).error;
    if (typeof m === "string" && m) return m;
  }
  return ax?.response?.status ? `Xatolik (${ax.response.status})` : "Xatolik yuz berdi";
}

// Status → label / badge variant (parity with cloud warehouse.js).
export const STATUS_LABEL: Record<string, string> = {
  draft: "Qoralama",
  priced_pending: "Narxlanmoqda",
  awaiting_load: "Yo'lda",
  tx_pending: "To'lovga",
  tx_sent: "Yuborilgan",
  delivered: "Yetkazib berildi",
  ttn_official: "Yakunlandi",
};

export function statusVariant(
  s: string,
): "warning" | "secondary" | "info" | "success" | "muted" | "default" {
  switch (s) {
    case "priced_pending":
      return "warning"; // amber
    case "awaiting_load":
      return "secondary"; // purple-ish (no dedicated purple variant)
    case "tx_pending":
      return "info"; // blue
    case "tx_sent":
    case "delivered":
      return "success"; // green
    case "ttn_official":
      return "muted";
    default:
      return "default";
  }
}

// Action label for the actionable queue button (parity with cloud).
export const ACTION_LABEL: Record<string, string> = {
  priced_pending: "Narxlash",
  awaiting_load: "Yetkazib berildi",
  tx_pending: "To'lovni yuborish",
  tx_sent: "Yetkazishni tasdiqlash",
  delivered: "Schyot faktura yuklash",
};

// Age bucket for the freshness dot (fresh<24h / aging<72h / overdue).
export function ageBucket(createdAt?: string | null): "fresh" | "aging" | "overdue" {
  if (!createdAt) return "fresh";
  const dt = new Date(createdAt).getTime();
  if (isNaN(dt)) return "fresh";
  const hours = (Date.now() - dt) / 3_600_000;
  if (hours >= 72) return "overdue";
  if (hours >= 24) return "aging";
  return "fresh";
}
export function ageDotColor(b: "fresh" | "aging" | "overdue"): string {
  if (b === "overdue") return "bg-red-500";
  if (b === "aging") return "bg-amber-500";
  return "bg-emerald-500";
}

export function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const dt = new Date(value);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleString("ru-RU", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
