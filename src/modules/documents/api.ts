import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type {
  DocCounts, DocDetail, DocsPage,
  PartyInfo, MxikItem, CreateDocIn, CreateResult,
  BankTxResult, InvoiceFlowStats,
} from "./types";

const BASE = "/documents";

export type DocListParams = {
  owner: number;
  status?: string;
  doctype?: string;
  search?: string;
  skip?: number;
  limit?: number;
};

export function useDocuments(companyId: number | null, params: DocListParams) {
  return useQuery<DocsPage>({
    queryKey: ["documents", "list", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/documents`, { params })).data,
    enabled: !!companyId,
    placeholderData: (prev) => prev, // keep previous page while fetching next
    staleTime: 30_000,
  });
}

/**
 * Fetch the WHOLE filtered set (for client-side sorting) by paging through it
 * with the reliable 20-row window — the upstream rejects large `limit`s
 * ("didox upstream error" ≥ ~200) so we can't grab it in one request. Pages
 * after the first are fetched in small concurrent batches; capped so a huge
 * tenant can't fan out unbounded (the rest is left unsorted, `truncated=true`).
 */
export function useAllDocuments(
  companyId: number | null,
  params: { owner: number; status?: string; doctype?: string; search?: string },
  enabled = true,
) {
  return useQuery<DocsPage & { truncated: boolean }>({
    queryKey: ["documents", "all", companyId, params],
    enabled: !!companyId && enabled,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    queryFn: async () => {
      const PAGE = 20;
      const MAX_PAGES = 40; // hard cap → at most 800 rows sorted
      const BATCH = 4; // concurrent requests per wave (upstream is rate-sensitive)
      const url = `${BASE}/companies/${companyId}/documents`;
      const first = (await api.get<DocsPage>(url, { params: { ...params, skip: 0, limit: PAGE } })).data;
      const total = first.total ?? (first.items?.length ?? 0);
      const items = [...(first.items ?? [])];
      const need = Math.min(Math.ceil(total / PAGE), MAX_PAGES);
      for (let start = 1; start < need; start += BATCH) {
        const wave = await Promise.all(
          Array.from({ length: Math.min(BATCH, need - start) }, (_, k) =>
            api
              .get<DocsPage>(url, { params: { ...params, skip: (start + k) * PAGE, limit: PAGE } })
              .then((r) => r.data.items ?? []),
          ),
        );
        for (const arr of wave) items.push(...arr);
      }
      return { items, total, skip: 0, limit: items.length, truncated: total > MAX_PAGES * PAGE };
    },
  });
}

export function useDocCounts(
  companyId: number | null,
  params: { owner: number; doctype?: string; search?: string },
) {
  return useQuery<DocCounts>({
    queryKey: ["documents", "counts", companyId, params],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/documents/counts`, { params })).data,
    enabled: !!companyId,
    staleTime: 30_000,
  });
}

export function useDocDetail(companyId: number | null, pk: string | null) {
  return useQuery<DocDetail>({
    queryKey: ["documents", "detail", companyId, pk],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/documents/by-pk/${pk}`)).data,
    enabled: !!companyId && !!pk,
  });
}

export function useDocHtml(
  companyId: number | null,
  docId: string | null,
  lang = "ru",
  enabled = true,
) {
  return useQuery<{ html: string; error?: string }>({
    queryKey: ["documents", "html", companyId, docId, lang],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/documents/${docId}/html`, {
        params: { lang },
      })).data,
    enabled: !!companyId && !!docId && enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * The official Didox PDF render, fetched as a Blob through our backend proxy
 * (which injects the service secret). Used for free-docs / contracts whose
 * `/html` is only the e-signature envelope — the real document is this PDF.
 */
export function useDocPdf(
  companyId: number | null,
  docId: string | null,
  lang = "ru",
  enabled = true,
) {
  return useQuery<Blob>({
    queryKey: ["documents", "pdf", companyId, docId, lang],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/documents/${docId}/pdf`, {
        params: { lang },
        responseType: "blob",
      })).data,
    enabled: !!companyId && !!docId && enabled,
    staleTime: 5 * 60_000,
  });
}

export function useBankTransactions(
  companyId: number | null,
  args: { partnerTin?: string | null; contractNumber?: string | null; contractDate?: string | null },
  enabled = true,
) {
  const partner_tin = (args.partnerTin || "").trim();
  return useQuery<BankTxResult>({
    queryKey: ["documents", "bank-tx", companyId, partner_tin, args.contractNumber, args.contractDate],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/documents/bank-transactions`, {
        params: {
          partner_tin,
          contract_number: args.contractNumber || undefined,
          contract_date: args.contractDate || undefined,
        },
      })).data,
    enabled: !!companyId && !!partner_tin && enabled,
    staleTime: 60_000,
  });
}

export function useInvoiceFlowStats(
  companyId: number | null,
  args: { dateFrom?: string; dateTo?: string },
  enabled = true,
) {
  return useQuery<InvoiceFlowStats>({
    queryKey: ["documents", "stats", companyId, args.dateFrom, args.dateTo],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/documents/stats/invoice-flow`, {
        params: { date_from: args.dateFrom || undefined, date_to: args.dateTo || undefined },
      })).data,
    enabled: !!companyId && enabled,
    staleTime: 30_000,
  });
}

type ActionVars = { companyId: number; pk: string; comment?: string };

function useDocAction(kind: "sign" | "reject" | "delete") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ companyId, pk, comment }: ActionVars) => {
      const url = `${BASE}/companies/${companyId}/documents/by-pk/${pk}/${kind}`;
      const cfg = kind === "reject" ? { params: { comment } } : undefined;
      return (await api.post(url, null, cfg)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["documents"] });
    },
  });
}

export const useSignDocument = () => useDocAction("sign");
export const useRejectDocument = () => useDocAction("reject");
export const useDeleteDocument = () => useDocAction("delete");

// ---- create flow ----------------------------------------------------------

export function useTinLookup(companyId: number | null, tin: string) {
  const clean = (tin || "").trim();
  return useQuery<PartyInfo>({
    queryKey: ["documents", "tin", companyId, clean],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/tin/${clean}`)).data,
    enabled: !!companyId && clean.length >= 9,
    staleTime: 60 * 60_000,
  });
}

export function useMxikSearch(companyId: number | null, q: string) {
  const clean = (q || "").trim();
  return useQuery<MxikItem[]>({
    queryKey: ["documents", "mxik", companyId, clean],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/mxik`, { params: { q: clean } })).data,
    enabled: !!companyId && clean.length >= 2,
    staleTime: 5 * 60_000,
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation<CreateResult, Error, { companyId: number; body: CreateDocIn }>({
    mutationFn: async ({ companyId, body }) =>
      (await api.post(`${BASE}/companies/${companyId}/documents/create`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["documents"] }),
  });
}
