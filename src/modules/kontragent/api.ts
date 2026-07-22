import { useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// ── Types (inline — do not edit shared types) ────────────────────────────────
export type Verification = {
  inn: string;
  name: string;
  legal_form: string;
  address: string;
  director: string;
  tax_mode: string;
  is_vat_payer: boolean;
  debt: number | null;
  advance: number | null;
  bank_account: string;
  mfo: string;
  bank_name: string;
  company_id: string;
  sync_completed: boolean;
  last_sync_at: string | null;
  gnk_verified: boolean;
  soliq_found: boolean;
  sources: string[];
};

export function useLookup(inn: string | null) {
  return useQuery<Verification>({
    queryKey: ["kontragent", "lookup", inn],
    queryFn: async () =>
      (await api.get(`/kontragent/lookup`, { params: { inn } })).data,
    enabled: !!inn,
    staleTime: 60_000,
    retry: false,
  });
}

export function errDetail(e: unknown): string {
  const r = (e as { response?: { data?: { detail?: unknown; message?: string; error?: string } } })
    .response?.data;
  const d = r?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return r?.message || r?.error || "Tekshirishda xatolik yuz berdi";
}

// ── Recent lookups (localStorage) ─────────────────────────────────────────────
export type RecentItem = { inn: string; name: string; status: KontragentStatus };
export type KontragentStatus = "verified" | "partial" | "notfound";

const LS_KEY = "aiba.kontragent.recent";
const MAX_RECENT = 10;

export function statusOf(v: Verification): KontragentStatus {
  if (v.gnk_verified) return "verified";
  if (v.soliq_found || v.name) return "partial";
  return "notfound";
}

export function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as RecentItem[]) : [];
  } catch {
    return [];
  }
}

export function pushRecent(item: RecentItem): RecentItem[] {
  const cur = loadRecent().filter((r) => r.inn !== item.inn);
  const next = [item, ...cur].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
  return next;
}

export function removeRecent(inn: string): RecentItem[] {
  const next = loadRecent().filter((r) => r.inn !== inn);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}
