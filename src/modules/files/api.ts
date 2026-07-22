import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type {
  FileNode, ItemsResp, ListResp, PublicView, ShareLink, StatsResp,
} from "./types";

const BASE = "/files";

// ── queries ───────────────────────────────────────────────────────────────────
export function useNodes(companyId: number | null, parentId: number | null) {
  return useQuery<ListResp>({
    queryKey: ["files", "nodes", companyId, parentId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/nodes`, {
        params: parentId != null ? { parent_id: parentId } : {},
      })).data,
    enabled: !!companyId,
    staleTime: 5_000,
  });
}

export function useRecent(companyId: number | null, enabled = true) {
  return useQuery<ItemsResp>({
    queryKey: ["files", "recent", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/recent`)).data,
    enabled: !!companyId && enabled,
    staleTime: 5_000,
  });
}

export function useFavorites(companyId: number | null, enabled = true) {
  return useQuery<ItemsResp>({
    queryKey: ["files", "favorites", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/favorites`)).data,
    enabled: !!companyId && enabled,
    staleTime: 5_000,
  });
}

export function useTrash(companyId: number | null, enabled = true) {
  return useQuery<ItemsResp>({
    queryKey: ["files", "trash", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/trash`)).data,
    enabled: !!companyId && enabled,
    staleTime: 5_000,
  });
}

export function useFilesStats(companyId: number | null) {
  return useQuery<StatsResp>({
    queryKey: ["files", "stats", companyId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/stats`)).data,
    enabled: !!companyId,
    staleTime: 15_000,
  });
}

export function useShares(companyId: number | null, nodeId: number | null) {
  return useQuery<{ items: ShareLink[] }>({
    queryKey: ["files", "shares", companyId, nodeId],
    queryFn: async () =>
      (await api.get(`${BASE}/companies/${companyId}/nodes/${nodeId}/shares`)).data,
    enabled: !!companyId && !!nodeId,
  });
}

// ── invalidation helper: any tree change touches several views ───────────────
const invalidateAll = (qc: ReturnType<typeof useQueryClient>, companyId: number) =>
  qc.invalidateQueries({ queryKey: ["files"], predicate: (q) => q.queryKey.includes(companyId) });

// ── mutations ─────────────────────────────────────────────────────────────────
export function useCreateFolder() {
  const qc = useQueryClient();
  return useMutation<FileNode, Error, { companyId: number; parentId: number | null; name: string }>({
    mutationFn: async ({ companyId, parentId, name }) =>
      (await api.post(`${BASE}/companies/${companyId}/folders`, {
        name, parent_id: parentId,
      })).data,
    onSuccess: (_d, { companyId }) => invalidateAll(qc, companyId),
  });
}

export function useUploadFile() {
  const qc = useQueryClient();
  return useMutation<FileNode, Error, { companyId: number; parentId: number | null; file: File }>({
    mutationFn: async ({ companyId, parentId, file }) => {
      // Raw-body upload (backend has no python-multipart) — name + mime in headers.
      const buf = await file.arrayBuffer();
      return (await api.post(
        `${BASE}/companies/${companyId}/upload`,
        buf,
        {
          params: parentId != null ? { parent_id: parentId } : {},
          headers: {
            "Content-Type": file.type || "application/octet-stream",
            "X-Filename": encodeURIComponent(file.name),
            "X-Content-Type": file.type || "application/octet-stream",
          },
          timeout: 120_000,
        },
      )).data;
    },
    onSuccess: (_d, { companyId }) => invalidateAll(qc, companyId),
  });
}

export function useRenameNode() {
  const qc = useQueryClient();
  return useMutation<FileNode, Error, { companyId: number; nodeId: number; name: string }>({
    mutationFn: async ({ companyId, nodeId, name }) =>
      (await api.patch(`${BASE}/companies/${companyId}/nodes/${nodeId}`, { name })).data,
    onSuccess: (_d, { companyId }) => invalidateAll(qc, companyId),
  });
}

export function useMoveNode() {
  const qc = useQueryClient();
  return useMutation<FileNode, Error, { companyId: number; nodeId: number; parentId: number | null }>({
    mutationFn: async ({ companyId, nodeId, parentId }) =>
      (await api.patch(`${BASE}/companies/${companyId}/nodes/${nodeId}`, {
        parent_id: parentId, move: true,
      })).data,
    onSuccess: (_d, { companyId }) => invalidateAll(qc, companyId),
  });
}

export function useCopyNode() {
  const qc = useQueryClient();
  return useMutation<FileNode, Error, { companyId: number; nodeId: number; parentId: number | null }>({
    mutationFn: async ({ companyId, nodeId, parentId }) =>
      (await api.post(`${BASE}/companies/${companyId}/nodes/${nodeId}/copy`, {
        parent_id: parentId,
      })).data,
    onSuccess: (_d, { companyId }) => invalidateAll(qc, companyId),
  });
}

export function useDeleteNode() {
  const qc = useQueryClient();
  return useMutation<void, Error, { companyId: number; nodeId: number }>({
    mutationFn: async ({ companyId, nodeId }) => {
      await api.delete(`${BASE}/companies/${companyId}/nodes/${nodeId}`);
    },
    onSuccess: (_d, { companyId }) => invalidateAll(qc, companyId),
  });
}

export function useSetFavorite() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { companyId: number; nodeId: number; value: boolean }>({
    mutationFn: async ({ companyId, nodeId, value }) =>
      (await api.put(`${BASE}/companies/${companyId}/nodes/${nodeId}/favorite`, { value })).data,
    onSuccess: (_d, { companyId }) => invalidateAll(qc, companyId),
  });
}

export function useRestoreNode() {
  const qc = useQueryClient();
  return useMutation<FileNode, Error, { companyId: number; nodeId: number }>({
    mutationFn: async ({ companyId, nodeId }) =>
      (await api.post(`${BASE}/companies/${companyId}/trash/${nodeId}/restore`)).data,
    onSuccess: (_d, { companyId }) => invalidateAll(qc, companyId),
  });
}

export function usePurgeNode() {
  const qc = useQueryClient();
  return useMutation<void, Error, { companyId: number; nodeId: number }>({
    mutationFn: async ({ companyId, nodeId }) => {
      await api.delete(`${BASE}/companies/${companyId}/trash/${nodeId}`);
    },
    onSuccess: (_d, { companyId }) => invalidateAll(qc, companyId),
  });
}

export function useEmptyTrash() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { companyId: number }>({
    mutationFn: async ({ companyId }) =>
      (await api.delete(`${BASE}/companies/${companyId}/trash`)).data,
    onSuccess: (_d, { companyId }) => invalidateAll(qc, companyId),
  });
}

export function useCreateShare() {
  const qc = useQueryClient();
  return useMutation<ShareLink, Error, {
    companyId: number; nodeId: number; password?: string; expiresAt?: string;
  }>({
    mutationFn: async ({ companyId, nodeId, password, expiresAt }) =>
      (await api.post(`${BASE}/companies/${companyId}/nodes/${nodeId}/shares`, {
        password: password || null, expires_at: expiresAt || null,
      })).data,
    onSuccess: (_d, { companyId, nodeId }) => {
      qc.invalidateQueries({ queryKey: ["files", "shares", companyId, nodeId] });
      qc.invalidateQueries({ queryKey: ["files", "nodes", companyId] });
    },
  });
}

export function useDeleteShare() {
  const qc = useQueryClient();
  return useMutation<void, Error, { companyId: number; nodeId: number; shareId: number }>({
    mutationFn: async ({ companyId, shareId }) => {
      await api.delete(`${BASE}/companies/${companyId}/shares/${shareId}`);
    },
    onSuccess: (_d, { companyId, nodeId }) => {
      qc.invalidateQueries({ queryKey: ["files", "shares", companyId, nodeId] });
      qc.invalidateQueries({ queryKey: ["files", "nodes", companyId] });
    },
  });
}

// ── downloads / public ────────────────────────────────────────────────────────
/** Authenticated download: <a href> would not carry X-AIBA-Token, so fetch a
 *  blob through axios and hand it to the browser as an object URL. */
export async function downloadNode(companyId: number, node: FileNode, inline = false) {
  const resp = await api.get(
    `${BASE}/companies/${companyId}/nodes/${node.id}/download`,
    { params: inline ? { inline: 1 } : {}, responseType: "blob", timeout: 120_000 },
  );
  const url = URL.createObjectURL(resp.data as Blob);
  if (inline) {
    window.open(url, "_blank", "noopener");
  } else {
    const a = document.createElement("a");
    a.href = url;
    a.download = node.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Blob fetch for the preview dialog. */
export async function fetchNodeBlob(companyId: number, nodeId: number): Promise<Blob> {
  const resp = await api.get(
    `${BASE}/companies/${companyId}/nodes/${nodeId}/download`,
    { params: { inline: 1 }, responseType: "blob", timeout: 120_000 },
  );
  return resp.data as Blob;
}

export const shareUrl = (token: string) => `${window.location.origin}/s/${token}`;

export const internalUrl = (node: FileNode) =>
  `${window.location.origin}/files?${node.is_dir ? `dir=${node.id}` : node.parent_id ? `dir=${node.parent_id}` : ""}`;

// Public endpoints need no auth → a BARE axios client. Using the shared `api`
// here would be a bug: its 401 interceptor logs the user out, and a
// password-protected share answers 401 by design.
const publicApi = axios.create({ baseURL: "/api/v2", timeout: 30_000 });

export async function getPublicView(token: string, password?: string, dir?: number): Promise<PublicView> {
  return (await publicApi.get(`${BASE}/public/${token}`, {
    params: { ...(password ? { password } : {}), ...(dir ? { dir } : {}) },
  })).data;
}

export const publicDownloadUrl = (token: string, opts: { childId?: number; password?: string; inline?: boolean } = {}) => {
  const p = new URLSearchParams();
  if (opts.childId) p.set("child_id", String(opts.childId));
  if (opts.password) p.set("password", opts.password);
  if (opts.inline) p.set("inline", "1");
  const qs = p.toString();
  return `/api/v2${BASE}/public/${token}/download${qs ? `?${qs}` : ""}`;
};
