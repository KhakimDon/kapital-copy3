import { create } from "zustand";
import { uploadToFolder } from "@/shared/files/media";
import { useWikiStore } from "./local/store";

/** Wiki media — images go to the FILES MODULE under `Wiki/<article>/`.
 *  The generic plumbing (folder ensure, upload, `files:` ref resolution) lives
 *  in `@/shared/files/media`; this file adds the wiki-specific upload flow +
 *  the per-block preloader registry. */

export { isFilesRef, resolveFilesRef } from "@/shared/files/media";

// ── upload-in-flight registry (drives the block preloader) ───────────────────

export const useWikiUploads = create<{
  ids: Set<string>;
  add: (id: string) => void;
  del: (id: string) => void;
}>((set) => ({
  ids: new Set(),
  add: (id) => set((s) => { const n = new Set(s.ids); n.add(id); return { ids: n }; }),
  del: (id) => set((s) => { const n = new Set(s.ids); n.delete(id); return { ids: n }; }),
}));

/** Kick off an image upload for a block: preloader on, upload to Files under
 *  `Wiki/<article>/`, then point the block at the `files:` ref. Personal
 *  spaces (no company) and upload failures fall back to inlining a data: URL
 *  so the user never loses the picture. */
export function startWikiImageUpload(blockId: string, pageId: string, file: File) {
  const st = useWikiStore.getState();
  const finish = (text: string) => useWikiStore.getState().updateBlock(blockId, { text });
  const inline = () => {
    const r = new FileReader();
    r.onload = () => finish(String(r.result));
    r.readAsDataURL(file);
  };

  const companyId = st.currentCompanyId;
  if (!companyId) { inline(); return; }
  const title = st.pages.find((p) => p.id === pageId)?.title ?? "";

  useWikiUploads.getState().add(blockId);
  uploadToFolder(companyId, ["Wiki", title || "Sahifa"], file)
    .then(({ ref }) => finish(ref))
    .catch(inline)
    .finally(() => useWikiUploads.getState().del(blockId));
}
