import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// ── Types (inline; do not edit shared types) ────────────────────────────────

export type EntryType = "opening" | "wire" | "goods_received" | "return" | "adjustment";
export type Direction = "debit" | "credit";

export type Balances = Record<string, string>; // {CUR: amount_str}

export type SverkaSupplier = {
  id: number;
  company_id: number;
  name: string;
  inn?: string | null;
  phone?: string | null;
  bank_account?: string | null;
  mfo?: string | null;
  purpose_code?: string | null;
  last_used_at?: string | null;
  balances: Balances;
};

export type DerivedDocState = {
  has_invoice: boolean;
  has_ttn_draft: boolean;
  has_ttn_official: boolean;
  has_bank_tx: boolean;
} | null;

export type LedgerAttachment = {
  id: number;
  ledger_id: number;
  file_key: string;
  filename?: string | null;
  content_type?: string | null;
  size?: number | null;
  uploaded_by_uid?: string | null;
  uploaded_at?: string | null;
};

export type LedgerEntry = {
  id: number;
  company_id: number;
  supplier_id: number;
  branch_id?: number | null;
  entry_type: EntryType;
  direction: Direction;
  amount: string;
  currency: string;
  entry_date: string;
  notes?: string | null;
  purchase_id?: number | null;
  bank_tx_id?: string | null;
  didox_doc_id?: string | null;
  return_of_id?: number | null;
  payment_verified_at?: string | null;
  invoice_verified_at?: string | null;
  ttn_verified_at?: string | null;
  voided_at?: string | null;
  voided_reason?: string | null;
  voided: boolean;
  created_by_uid?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  _running?: Record<string, string>;
  attachments?: LedgerAttachment[];
  derived_doc_state?: DerivedDocState;
};

export type PurchaseSnapshot = {
  id: number;
  order_id: number;
  total?: string | null;
  created_at?: string | null;
  items_count: number;
};

export type RecentPurchase = {
  id: number;
  order_id: number;
  status: string;
  created_at?: string | null;
  items_count: number;
  supplier?: { id: number; name: string } | null;
  tx_order?: {
    total?: string | null;
    bank_tx_id?: string | null;
    didox_invoice_id?: string | null;
    payment_template_id?: string | null;
    payment_purpose?: string | null;
    payment_timing?: string | null;
  } | null;
};

export type SupplierDetail = {
  supplier: SverkaSupplier;
  balances: Balances;
  entries: LedgerEntry[];
  purchases: Record<string, PurchaseSnapshot>;
  purchase_list: RecentPurchase[];
};

export type LedgerRevision = {
  id: number;
  ledger_id: number;
  edited_by_uid?: string | null;
  edited_at?: string | null;
  changes: Record<string, { from: unknown; to: unknown }>;
};

export type ReconcileTally = {
  checked: number;
  voided_now: number;
  executed: number;
  still_pending: number;
  portal_unreachable: number;
};
export type ReconcileResult = {
  company_id: string;
  tally: ReconcileTally;
  voided_ids: number[];
  note?: string;
};

export type CreateEntryBody = {
  supplier_id: number;
  entry_type: EntryType;
  direction: Direction;
  amount: string;
  entry_date: string;
  currency?: string;
  notes?: string | null;
  purchase_id?: number | null;
  bank_tx_id?: string | null;
};

export type UpdateEntryBody = {
  direction?: Direction;
  amount?: string;
  currency?: string;
  entry_date?: string;
  notes?: string | null;
  bank_tx_id?: string | null;
  purchase_id?: number | null;
};

const base = (cid: number) => `/warehouse/companies/${cid}/sverka`;

// ── Queries ──────────────────────────────────────────────────────────────────

export function useSverkaSuppliers(companyId: number) {
  return useQuery({
    queryKey: ["sverka", "suppliers", companyId],
    queryFn: async () => {
      const { data } = await api.get<SverkaSupplier[]>(`${base(companyId)}/suppliers`);
      return data;
    },
  });
}

export function useSupplierDetail(companyId: number, supplierId: number | null) {
  return useQuery({
    queryKey: ["sverka", "supplier", companyId, supplierId],
    enabled: supplierId != null,
    queryFn: async () => {
      const { data } = await api.get<SupplierDetail>(
        `${base(companyId)}/suppliers/${supplierId}`
      );
      return data;
    },
  });
}

export function useEntryRevisions(companyId: number, entryId: number | null) {
  return useQuery({
    queryKey: ["sverka", "revisions", companyId, entryId],
    enabled: entryId != null,
    queryFn: async () => {
      const { data } = await api.get<LedgerRevision[]>(
        `${base(companyId)}/entries/${entryId}/revisions`
      );
      return data;
    },
  });
}

// ── Mutations ────────────────────────────────────────────────────────────────

function useInvalidate(companyId: number) {
  const qc = useQueryClient();
  return (supplierId?: number | null) => {
    qc.invalidateQueries({ queryKey: ["sverka", "suppliers", companyId] });
    if (supplierId != null)
      qc.invalidateQueries({ queryKey: ["sverka", "supplier", companyId, supplierId] });
  };
}

export function useCreateEntry(companyId: number) {
  const invalidate = useInvalidate(companyId);
  return useMutation({
    mutationFn: async (body: CreateEntryBody) => {
      const { data } = await api.post<LedgerEntry>(`${base(companyId)}/entries`, body);
      return data;
    },
    onSuccess: (_d, vars) => invalidate(vars.supplier_id),
  });
}

export function useUpdateEntry(companyId: number, supplierId: number | null) {
  const invalidate = useInvalidate(companyId);
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: UpdateEntryBody }) => {
      const { data } = await api.put<LedgerEntry>(`${base(companyId)}/entries/${id}`, body);
      return data;
    },
    onSuccess: () => invalidate(supplierId),
  });
}

export function useVerifyEntry(companyId: number, supplierId: number | null) {
  const invalidate = useInvalidate(companyId);
  return useMutation({
    mutationFn: async (vars: {
      id: number;
      field: "payment" | "invoice" | "ttn";
      verified: boolean;
    }) => {
      const { data } = await api.put<LedgerEntry>(
        `${base(companyId)}/entries/${vars.id}/verify`,
        { field: vars.field, verified: vars.verified }
      );
      return data;
    },
    onSuccess: () => invalidate(supplierId),
  });
}

export function useUploadAttachment(companyId: number, supplierId: number | null) {
  const invalidate = useInvalidate(companyId);
  return useMutation({
    mutationFn: async ({ entryId, file }: { entryId: number; file: File }) => {
      const buf = await file.arrayBuffer();
      const { data } = await api.post<LedgerAttachment>(
        `${base(companyId)}/entries/${entryId}/attachments`,
        buf,
        {
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-Content-Type": file.type || "application/octet-stream",
            "X-Filename": encodeURIComponent(file.name),
          },
        }
      );
      return data;
    },
    onSuccess: () => invalidate(supplierId),
  });
}

export function useDeleteAttachment(companyId: number, supplierId: number | null) {
  const invalidate = useInvalidate(companyId);
  return useMutation({
    mutationFn: async (attachmentId: number) => {
      await api.delete(`${base(companyId)}/attachments/${attachmentId}`);
    },
    onSuccess: () => invalidate(supplierId),
  });
}

export function attachmentDownloadUrl(companyId: number, attachmentId: number) {
  return `/api/v2${base(companyId)}/attachments/${attachmentId}/download`;
}

export function useReconcile(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ReconcileResult>(`${base(companyId)}/reconcile`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sverka", "suppliers", companyId] });
      qc.invalidateQueries({ queryKey: ["sverka", "supplier", companyId] });
    },
  });
}
