import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// ── Types (inline — do not edit shared types) ────────────────────────────────
export type KizSource = "didox" | "soliq";

export type Kiz = {
  kiz_code: string;
  product_name: string | null;
  supplier_tin: string | null;
  supplier_name: string | null;
  document_date: string | null;
  source: KizSource;
  qty: number | null;
  unit_price: number | null;
  total: number | null;
  doc_id: string | null;
  status: string | null;
};

export type KizPage = {
  items: Kiz[];
  total: number;
  source_counts: { didox: number; soliq: number };
};

export type KizFilters = {
  source: "all" | KizSource;
  date_from?: string;
  date_to?: string;
  q?: string;
  skip: number;
  limit: number;
};

const base = (companyId: number) => `/markirovka/companies/${companyId}`;

export function useKizs(companyId: number, f: KizFilters) {
  return useQuery<KizPage>({
    queryKey: ["markirovka", "kizs", companyId, f],
    queryFn: async () => {
      const params: Record<string, string | number> = {
        source: f.source,
        skip: f.skip,
        limit: f.limit,
      };
      if (f.date_from) params.date_from = f.date_from;
      if (f.date_to) params.date_to = f.date_to;
      if (f.q) params.q = f.q;
      return (await api.get(`${base(companyId)}/kizs`, { params })).data;
    },
    enabled: !!companyId,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────────────
export function money(v?: number | null): string {
  return v == null ? "—" : Number(v).toLocaleString("ru-RU");
}

export function fmtDate(v?: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v.slice(0, 10);
  return d.toLocaleDateString("ru-RU");
}

export const SOURCE_META: Record<KizSource, { label: string; variant: "info" | "success" }> = {
  didox: { label: "Didox", variant: "info" },
  soliq: { label: "Soliq", variant: "success" },
};

export function statusMeta(
  s?: string | null
): { label: string; variant: "success" | "warning" | "danger" | "muted" } {
  switch (s) {
    case "signed":
      return { label: "Imzolangan", variant: "success" };
    case "pending":
      return { label: "Kutilmoqda", variant: "warning" };
    case "rejected":
      return { label: "Rad etilgan", variant: "danger" };
    case "deleted":
      return { label: "O'chirilgan", variant: "muted" };
    case "draft":
      return { label: "Qoralama", variant: "muted" };
    default:
      return { label: s || "—", variant: "muted" };
  }
}
