import { create } from "zustand";
import { api } from "@/shared/api/client";
import { ensureFolderPath } from "@/shared/files/media";
import { MAX_SIZE, errMsg } from "./lib";

/** Upload queue with real progress — drives the Proton-style transfer manager.
 *  Folder drops/pickers carry a `relPath` (folders under the drop target),
 *  created on demand and cached per batch. Three uploads run concurrently. */

export type UploadItem = {
  id: string;
  name: string;
  size: number;
  /** 0..100 (byte progress from axios). */
  progress: number;
  status: "queued" | "uploading" | "done" | "error";
  error?: string;
};

export type UploadFile = { file: File; relPath?: string[] };

const uid = () =>
  (crypto as { randomUUID?: () => string }).randomUUID?.() ?? `u${Date.now()}${Math.random().toString(16).slice(2)}`;

type UploadsState = {
  items: UploadItem[];
  minimized: boolean;
  toggleMinimized: () => void;
  clearFinished: () => void;
  enqueue: (opts: {
    companyId: number;
    parentId: number | null;
    files: UploadFile[];
    /** Called after every finished file (success) — invalidate the listings. */
    onDone?: () => void;
  }) => void;
};

export const useUploads = create<UploadsState>((set) => ({
  items: [],
  minimized: false,
  toggleMinimized: () => set((s) => ({ minimized: !s.minimized })),
  clearFinished: () =>
    set((s) => ({ items: s.items.filter((i) => i.status === "queued" || i.status === "uploading") })),

  enqueue: ({ companyId, parentId, files, onDone }) => {
    if (!files.length) return;
    const rows: UploadItem[] = files.map(({ file }) => ({
      id: uid(),
      name: file.name || "file",
      size: file.size,
      progress: 0,
      status: "queued",
    }));
    set((s) => ({ items: [...s.items, ...rows], minimized: false }));
    const patch = (id: string, p: Partial<UploadItem>) =>
      set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, ...p } : i)) }));

    // Folder creation is deduped per batch (a dropped tree hits each dir once).
    const folderIds = new Map<string, Promise<number | null>>();
    const resolveFolder = (rel?: string[]): Promise<number | null> => {
      if (!rel || rel.length === 0) return Promise.resolve(parentId);
      const key = rel.join("/");
      let p = folderIds.get(key);
      if (!p) {
        p = ensureFolderPath(companyId, rel, parentId);
        folderIds.set(key, p);
      }
      return p;
    };

    let next = 0;
    const worker = async () => {
      while (next < files.length) {
        const i = next++;
        const row = rows[i];
        const { file, relPath } = files[i];
        if (file.size > MAX_SIZE) {
          patch(row.id, { status: "error", error: "50 MB dan katta" });
          continue;
        }
        try {
          patch(row.id, { status: "uploading" });
          const pid = await resolveFolder(relPath);
          const buf = await file.arrayBuffer();
          await api.post(`/files/companies/${companyId}/upload`, buf, {
            params: pid != null ? { parent_id: pid } : {},
            headers: {
              "Content-Type": file.type || "application/octet-stream",
              "X-Filename": encodeURIComponent(file.name || "file"),
              "X-Content-Type": file.type || "application/octet-stream",
            },
            timeout: 600_000,
            onUploadProgress: (e) => {
              if (e.total) patch(row.id, { progress: Math.round((e.loaded / e.total) * 100) });
            },
          });
          patch(row.id, { status: "done", progress: 100 });
          onDone?.();
        } catch (e) {
          patch(row.id, { status: "error", error: errMsg(e) });
        }
      }
    };
    void Promise.all([worker(), worker(), worker()]);
  },
}));

/** Anything currently moving? (used to keep the panel visible) */
export const hasActiveUploads = () =>
  useUploads.getState().items.some((i) => i.status === "queued" || i.status === "uploading");

// ── drop payload → files (recursive folder traversal) ────────────────────────

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file: (ok: (f: File) => void, err: (e: unknown) => void) => void;
  createReader: () => { readEntries: (ok: (es: FsEntry[]) => void, err: (e: unknown) => void) => void };
};

/** Extract files (with folder-relative paths) from a drop. Dropped folders are
 *  walked recursively via webkitGetAsEntry; plain file drops pass through. */
export async function filesFromDrop(dt: DataTransfer): Promise<UploadFile[]> {
  const out: UploadFile[] = [];
  const entries = Array.from(dt.items || [])
    .map((i) => i.webkitGetAsEntry?.() as unknown as FsEntry | null | undefined)
    .filter((e): e is FsEntry => !!e);

  if (!entries.length) {
    return Array.from(dt.files || []).map((file) => ({ file }));
  }

  const walk = async (entry: FsEntry, path: string[]): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((ok, err) => entry.file(ok, err));
      out.push({ file, relPath: path.length ? path : undefined });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      // readEntries returns results in chunks — loop until empty.
      for (;;) {
        const batch = await new Promise<FsEntry[]>((ok, err) => reader.readEntries(ok, err));
        if (!batch.length) break;
        for (const e of batch) await walk(e, [...path, entry.name]);
      }
    }
  };
  for (const e of entries) await walk(e, []);
  return out;
}

/** Files from a `webkitdirectory` input — relative paths from the picker. */
export function filesFromFolderInput(list: FileList | null): UploadFile[] {
  if (!list) return [];
  return Array.from(list).map((file) => {
    const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    const parts = rel.split("/").slice(0, -1).filter(Boolean);
    return { file, relPath: parts.length ? parts : undefined };
  });
}
