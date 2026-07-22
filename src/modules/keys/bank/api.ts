/**
 * Bank keys (банковские ключи) API — physical ePass2003 USB tokens hosted on
 * machines running the Aiba Connector, mirrored from KM's `bankkeys` app
 * (es-key-connector, feature/bank-keys):
 *   Connector — a machine that hosts tokens, authenticated WS tunnel
 *   BankKey   — a physical token; the key material NEVER leaves the chip,
 *               the PIN is NEVER stored (operator enters it on the machine)
 *
 * Endpoints are planned under /api/v2/keys/admin/bank-keys|connectors. Until
 * the backend lands, the hooks fall back to demo data (flagged `demo: true`,
 * surfaced as a banner in the UI) so the surface is fully explorable; all
 * mutations then edit the query cache locally.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

// ── types (wire shapes mirror bankkeys/models.py) ───────────────────────────

export type ConnectorInfo = {
  id: number;
  name: string;
  client_username: string | null;
  is_online: boolean;
  last_seen_at: string | null;
  note: string;
  keys_count: number;
  created_at: string | null;
  /** Present only in the create response — shown once, then never again. */
  token?: string;
};

export type BankKeyStatus =
  | "active" | "needs_activation" | "needs_reactivation" | "offline" | "error";

export type BankKeyInfo = {
  id: number;
  name: string;
  bank_name: string;
  signing_stack: "styx" | "bss" | "kapital" | "";
  chip_serial: string;
  thumbprint: string;
  connector_id: number | null;
  connector_name: string | null;
  connector_online: boolean;
  company_id: number | null;
  company_name: string | null;
  attached_user_ids: number[];
  activation_status: BankKeyStatus;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string | null;
};

export const SIGNING_STACKS = ["styx", "bss", "kapital"] as const;

// ── demo fallback (until /keys/admin/bank-keys lands on the backend) ────────

const DEMO_CONNECTORS: ConnectorInfo[] = [
  {
    id: 1, name: "Office-PC (Tashkent HQ)", client_username: "karimov",
    is_online: true, last_seen_at: new Date(Date.now() - 90_000).toISOString(),
    note: "Bux. bo'limi, 2-qavat", keys_count: 2, created_at: "2026-05-12T09:30:00Z",
  },
  {
    id: 2, name: "Filial-Samarqand", client_username: "aziza.s",
    is_online: false, last_seen_at: "2026-07-11T16:42:00Z",
    note: "", keys_count: 1, created_at: "2026-06-02T11:00:00Z",
  },
];

const DEMO_KEYS: BankKeyInfo[] = [
  {
    id: 1, name: "Asosiy hisob — Ipak Yo'li", bank_name: "Ipak Yo'li", signing_stack: "styx",
    chip_serial: "EP2003-8F41C2", thumbprint: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    connector_id: 1, connector_name: "Office-PC (Tashkent HQ)", connector_online: true,
    company_id: 1, company_name: "BARAKA SAVDO MCHJ", attached_user_ids: [3, 7],
    activation_status: "active", is_active: true,
    last_seen_at: new Date(Date.now() - 120_000).toISOString(), created_at: "2026-05-12T10:05:00Z",
  },
  {
    id: 2, name: "Kapital — valyuta hisobi", bank_name: "Kapitalbank", signing_stack: "kapital",
    chip_serial: "EP2003-2274AB", thumbprint: "b2c3d4e5f60718293a4b5c6d7e8f901234567890",
    connector_id: 1, connector_name: "Office-PC (Tashkent HQ)", connector_online: true,
    company_id: 1, company_name: "BARAKA SAVDO MCHJ", attached_user_ids: [3],
    activation_status: "needs_activation", is_active: false,
    last_seen_at: null, created_at: "2026-06-20T14:12:00Z",
  },
  {
    id: 3, name: "NBU — asosiy", bank_name: "NBU", signing_stack: "bss",
    chip_serial: "EP2003-99D0E1", thumbprint: "c3d4e5f60718293a4b5c6d7e8f90123456789012",
    connector_id: 2, connector_name: "Filial-Samarqand", connector_online: false,
    company_id: 2, company_name: "ZUMRAD TEKS XK", attached_user_ids: [],
    activation_status: "offline", is_active: false,
    last_seen_at: "2026-07-11T16:40:00Z", created_at: "2026-06-02T11:20:00Z",
  },
];

// ── queries ──────────────────────────────────────────────────────────────────

export const QK = {
  keys: ["bank-keys"] as const,
  connectors: ["bank-connectors"] as const,
};

export type BankKeysResult = { items: BankKeyInfo[]; demo: boolean };
export type ConnectorsResult = { items: ConnectorInfo[]; demo: boolean };

export function useBankKeys() {
  return useQuery<BankKeysResult>({
    queryKey: QK.keys,
    queryFn: async () => {
      try {
        const { data } = await api.get<{ items: BankKeyInfo[] }>("/keys/admin/bank-keys");
        return { items: data.items ?? [], demo: false };
      } catch (err) {
        // Dev-only preview: never show fabricated rows in production builds.
        if (import.meta.env.DEV) return { items: DEMO_KEYS, demo: true };
        throw err;
      }
    },
  });
}

export function useConnectors() {
  return useQuery<ConnectorsResult>({
    queryKey: QK.connectors,
    queryFn: async () => {
      try {
        const { data } = await api.get<{ items: ConnectorInfo[] }>("/keys/admin/connectors");
        return { items: data.items ?? [], demo: false };
      } catch (err) {
        if (import.meta.env.DEV) return { items: DEMO_CONNECTORS, demo: true };
        throw err;
      }
    },
  });
}

// ── mutations (demo-aware: edit the cache locally until the API exists) ─────

function useDemoAware<TVars>(opts: {
  run: (vars: TVars) => Promise<void>;
  patchKeys?: (items: BankKeyInfo[], vars: TVars) => BankKeyInfo[];
  patchConnectors?: (items: ConnectorInfo[], vars: TVars) => ConnectorInfo[];
}) {
  const qc = useQueryClient();
  const isDemo = () =>
    qc.getQueryData<BankKeysResult>(QK.keys)?.demo ||
    qc.getQueryData<ConnectorsResult>(QK.connectors)?.demo;
  return useMutation({
    mutationFn: async (vars: TVars) => {
      if (isDemo()) return; // backend not wired yet — cache-only below
      await opts.run(vars);
    },
    onSuccess: (_d, vars) => {
      if (isDemo()) {
        if (opts.patchKeys) {
          const cur = qc.getQueryData<BankKeysResult>(QK.keys);
          if (cur) qc.setQueryData(QK.keys, { ...cur, items: opts.patchKeys(cur.items, vars) });
        }
        if (opts.patchConnectors) {
          const cur = qc.getQueryData<ConnectorsResult>(QK.connectors);
          if (cur) qc.setQueryData(QK.connectors, { ...cur, items: opts.patchConnectors(cur.items, vars) });
        }
        return;
      }
      qc.invalidateQueries({ queryKey: QK.keys });
      qc.invalidateQueries({ queryKey: QK.connectors });
    },
  });
}

export type BankKeyWrite = {
  id: number; name: string; bank_name: string;
  signing_stack: BankKeyInfo["signing_stack"]; company_id: number | null;
};

export function useUpdateBankKey() {
  return useDemoAware<BankKeyWrite>({
    run: async (v) => { await api.patch(`/keys/admin/bank-keys/${v.id}`, v); },
    patchKeys: (items, v) => items.map((k) =>
      k.id === v.id ? { ...k, name: v.name, bank_name: v.bank_name, signing_stack: v.signing_stack } : k),
  });
}

export function useDeleteBankKey() {
  return useDemoAware<number>({
    run: async (id) => { await api.delete(`/keys/admin/bank-keys/${id}`); },
    patchKeys: (items, id) => items.filter((k) => k.id !== id),
  });
}

/** Replace the set of KM users allowed to use a bank key (attach/detach). */
export function useSetBankKeyUsers() {
  return useDemoAware<{ id: number; user_ids: number[] }>({
    run: async ({ id, user_ids }) => {
      await api.patch(`/keys/admin/bank-keys/${id}`, { attached_user_ids: user_ids });
    },
    patchKeys: (items, { id, user_ids }) =>
      items.map((k) => (k.id === id ? { ...k, attached_user_ids: user_ids } : k)),
  });
}

/** Push `activate_chip` to the key's connector; operator enters the PIN there. */
export function useActivateBankKey() {
  return useDemoAware<number>({
    run: async (id) => { await api.post(`/keys/admin/bank-keys/${id}/activate`); },
    patchKeys: (items, id) => items.map((k) =>
      k.id === id ? { ...k, activation_status: "needs_activation" as const } : k),
  });
}

/** Ask every online connector to re-enumerate its tokens. */
export function useRefreshInventory() {
  return useDemoAware<void>({
    run: async () => { await api.post("/keys/admin/connectors/refresh-inventory"); },
  });
}

/** The token is generated BY the connector app and pasted here by the admin. */
export type ConnectorWrite = { id?: number; name: string; token: string; note: string };

export function useSaveConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: ConnectorWrite): Promise<ConnectorInfo> => {
      const demo = qc.getQueryData<ConnectorsResult>(QK.connectors)?.demo;
      if (demo) {
        const cur = qc.getQueryData<ConnectorsResult>(QK.connectors);
        const items = cur?.items ?? [];
        if (v.id != null) {
          const next = items.map((c) => (c.id === v.id ? { ...c, name: v.name, note: v.note } : c));
          qc.setQueryData(QK.connectors, { ...cur!, items: next });
          return next.find((c) => c.id === v.id)!;
        }
        const created: ConnectorInfo = {
          id: Math.max(0, ...items.map((c) => c.id)) + 1,
          name: v.name, client_username: null,
          is_online: false, last_seen_at: null, note: v.note,
          keys_count: 0, created_at: new Date().toISOString(),
        };
        qc.setQueryData(QK.connectors, { ...cur!, items: [created, ...items] });
        return created;
      }
      const payload: Record<string, string> = { name: v.name, note: v.note };
      if (v.token.trim()) payload.token = v.token.trim();
      const { data } = v.id != null
        ? await api.patch<ConnectorInfo>(`/keys/admin/connectors/${v.id}`, payload)
        : await api.post<ConnectorInfo>("/keys/admin/connectors", payload);
      qc.invalidateQueries({ queryKey: QK.connectors });
      return data;
    },
  });
}

export function useDeleteConnector() {
  return useDemoAware<number>({
    run: async (id) => { await api.delete(`/keys/admin/connectors/${id}`); },
    patchConnectors: (items, id) => items.filter((c) => c.id !== id),
    patchKeys: (items, id) => items.map((k) =>
      k.id != null && k.connector_id === id
        ? { ...k, connector_id: null, connector_name: null, connector_online: false }
        : k),
  });
}
