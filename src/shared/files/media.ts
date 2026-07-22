import { useEffect, useState } from "react";
import { api } from "@/shared/api/client";
import type { FileNode, ListResp } from "@/modules/files/types";

/** Shared "media lives in the Files module" plumbing.
 *
 *  Modules (wiki, tasks, …) upload user media into the company drive under a
 *  per-module folder tree (e.g. `Wiki/<article>/`, `Tasks/<project>/`) and
 *  store only a compact stable ref `files:<companyId>/<nodeId>`. Rendering
 *  resolves the ref to a blob URL through the authenticated download endpoint
 *  (a plain <img src> can't carry the JWT), cached per session. */

const BASE = "/files";

async function children(companyId: number, parentId: number | null): Promise<FileNode[]> {
  const d: ListResp = (
    await api.get(`${BASE}/companies/${companyId}/nodes`, {
      params: parentId != null ? { parent_id: parentId } : {},
    })
  ).data;
  return d.items ?? [];
}

/** Folder-safe segment (slashes would read as paths in the Files UI). */
const cleanSegment = (name: string) =>
  (name || "").replace(/[/\\]/g, "-").trim().slice(0, 80) || "Papka";

/** Find-or-create one folder under `parentId` (find first — the backend
 *  dedupes names on create, so blind creates would fork "Wiki (1)"). */
async function ensureFolder(companyId: number, parentId: number | null, name: string): Promise<number> {
  const kids = await children(companyId, parentId);
  const hit = kids.find((k) => k.is_dir && k.name === name);
  if (hit) return hit.id;
  const created: FileNode = (
    await api.post(`${BASE}/companies/${companyId}/folders`, { name, parent_id: parentId })
  ).data;
  return created.id;
}

/** Find-or-create a nested folder path (optionally under `startParent`),
 *  returning the leaf folder id. */
export async function ensureFolderPath(
  companyId: number,
  names: string[],
  startParent: number | null = null,
): Promise<number | null> {
  let parent: number | null = startParent;
  for (const raw of names) parent = await ensureFolder(companyId, parent, cleanSegment(raw));
  return parent;
}

/** Upload a file into `folderPath` (created as needed) → `files:` ref. */
export async function uploadToFolder(
  companyId: number,
  folderPath: string[],
  file: File,
): Promise<{ ref: string; node: FileNode }> {
  const folderId = await ensureFolderPath(companyId, folderPath);
  const buf = await file.arrayBuffer();
  const node: FileNode = (
    await api.post(`${BASE}/companies/${companyId}/upload`, buf, {
      params: folderId != null ? { parent_id: folderId } : {},
      headers: {
        "Content-Type": file.type || "application/octet-stream",
        "X-Filename": encodeURIComponent(file.name || "file"),
        "X-Content-Type": file.type || "application/octet-stream",
      },
      timeout: 120_000,
    })
  ).data;
  return { ref: `files:${companyId}/${node.id}`, node };
}

// ── files: ref → blob URL (session cache, deduped in-flight) ─────────────────

export const isFilesRef = (s: string | null | undefined): s is string =>
  !!s && s.startsWith("files:");

const urlCache = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();

export function resolveFilesRef(ref: string): Promise<string> {
  const hit = urlCache.get(ref);
  if (hit) return Promise.resolve(hit);
  const pending = inflight.get(ref);
  if (pending) return pending;
  const m = /^files:(\d+)\/(\d+)$/.exec(ref);
  if (!m) return Promise.reject(new Error(`bad files ref: ${ref}`));
  const p = api
    .get(`${BASE}/companies/${m[1]}/nodes/${m[2]}/download`, {
      params: { inline: 1 },
      responseType: "blob",
      timeout: 120_000,
    })
    .then((r) => {
      const url = URL.createObjectURL(r.data as Blob);
      urlCache.set(ref, url);
      inflight.delete(ref);
      return url;
    })
    .catch((e) => {
      inflight.delete(ref);
      throw e;
    });
  inflight.set(ref, p);
  return p;
}

/** Resolve any media `url` for rendering: `files:` refs become blob URLs
 *  (with loading/failed states); data:/http(s) URLs pass through untouched. */
export function useResolvedSrc(url: string | null | undefined): {
  src: string | null;
  loading: boolean;
  failed: boolean;
} {
  const ref = isFilesRef(url) ? url : null;
  const [state, setState] = useState(() =>
    ref
      ? { src: urlCache.get(ref) ?? null, loading: !urlCache.has(ref), failed: false }
      : { src: url ?? null, loading: false, failed: false },
  );

  useEffect(() => {
    if (!ref) {
      setState({ src: url ?? null, loading: false, failed: false });
      return;
    }
    const hit = urlCache.get(ref);
    if (hit) {
      setState({ src: hit, loading: false, failed: false });
      return;
    }
    let alive = true;
    setState({ src: null, loading: true, failed: false });
    resolveFilesRef(ref).then(
      (u) => { if (alive) setState({ src: u, loading: false, failed: false }); },
      () => { if (alive) setState({ src: null, loading: false, failed: true }); },
    );
    return () => { alive = false; };
  }, [ref, url]);

  return state;
}
