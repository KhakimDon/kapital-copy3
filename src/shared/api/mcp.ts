import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";

// The MCP tenant-admin surface (/api/v2/mcp/admin/*). Mirrors the backend
// crates/api/src/modules/mcp.rs governance model.

export type McpModuleState = { key: string; name: string; enabled: boolean };
export type McpConfig = { modules: McpModuleState[] };

export type McpModuleGrant = {
  module: string;
  scope: "read-only" | "read-write";
  deny_tools: string[];
};
export type McpGrantSet = { modules: McpModuleGrant[] };

export type McpToken = {
  id: string;
  label: string;
  username: string;
  scopes: McpGrantSet;
  createdAt: string | null;
  revokedAt: string | null;
};

export type McpAuditRow = {
  id: string;
  principal: string | null;
  module: string | null;
  tool: string | null;
  args: unknown;
  status: string | null;
  createdAt: string | null;
};

// ── config ────────────────────────────────────────────────────────────────
export function useMcpConfig() {
  return useQuery({
    queryKey: ["mcp", "config"],
    queryFn: async () => (await api.get<McpConfig>("/mcp/admin/config")).data,
  });
}

export function useSetMcpModule() {
  const qc = useQueryClient();
  return useMutation({
    // Toggle one module; the backend stores the whole `{ modules: {...} }` map.
    mutationFn: async (vars: { modules: Record<string, boolean> }) =>
      (await api.put("/mcp/admin/config", vars)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mcp", "config"] }),
  });
}

// ── tokens ────────────────────────────────────────────────────────────────
export function useMcpTokens() {
  return useQuery({
    queryKey: ["mcp", "tokens"],
    queryFn: async () => (await api.get<{ items: McpToken[] }>("/mcp/admin/tokens")).data.items,
  });
}

export type NewMcpToken = { label: string; username?: string; module?: string; scope?: "read-only" | "read-write" };
export type IssuedMcpToken = { id: string; token: string; username: string; scopes: McpGrantSet };

export function useCreateMcpToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: NewMcpToken) =>
      (await api.post<IssuedMcpToken>("/mcp/admin/tokens", body)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mcp", "tokens"] }),
  });
}

export function useRevokeMcpToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/mcp/admin/tokens/${id}`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mcp", "tokens"] }),
  });
}

// ── grants ────────────────────────────────────────────────────────────────
export type McpGrantsResponse = { username: string; grants: McpGrantSet; hasOverride: boolean };

export function useMcpGrants(username: string) {
  return useQuery({
    queryKey: ["mcp", "grants", username],
    enabled: username.trim().length > 0,
    queryFn: async () =>
      (await api.get<McpGrantsResponse>("/mcp/admin/grants", { params: { username } })).data,
  });
}

export function useSetMcpGrants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { username: string; grants: McpGrantSet }) =>
      (await api.put("/mcp/admin/grants", body)).data,
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ["mcp", "grants", v.username] }),
  });
}

// ── self-service ("my") ─────────────────────────────────────────────────────
// Any logged-in user connects their OWN external MCP client. Distinct query keys
// from the admin surface so a non-admin never touches admin endpoints.

export type MyMcpToken = {
  id: string;
  label: string;
  scopes: McpGrantSet;
  createdAt: string | null;
  revokedAt: string | null;
};

export function useMyMcpModules() {
  return useQuery({
    queryKey: ["mcp", "my", "modules"],
    queryFn: async () => (await api.get<McpConfig>("/mcp/my/modules")).data,
  });
}

export function useMyMcpTokens() {
  return useQuery({
    queryKey: ["mcp", "my", "tokens"],
    queryFn: async () => (await api.get<{ items: MyMcpToken[] }>("/mcp/my/tokens")).data.items,
  });
}

export function useCreateMyMcpToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: { label: string; scope?: "read-only" | "read-write" }) =>
      (await api.post<IssuedMcpToken>("/mcp/my/tokens", body)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mcp", "my", "tokens"] }),
  });
}

export function useRevokeMyMcpToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => (await api.delete(`/mcp/my/tokens/${id}`)).data,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["mcp", "my", "tokens"] }),
  });
}

// ── audit ─────────────────────────────────────────────────────────────────
export function useMcpAudit(limit = 100) {
  return useQuery({
    queryKey: ["mcp", "audit", limit],
    queryFn: async () =>
      (await api.get<{ items: McpAuditRow[] }>("/mcp/admin/audit", { params: { limit } })).data.items,
    refetchInterval: 20_000,
  });
}
