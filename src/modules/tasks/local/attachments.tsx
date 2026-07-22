import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Bold, Italic, Underline, List, ListOrdered, Image as ImageIcon,
  Paperclip, X, Download, FileText,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { SmartImage } from "@/components/ui/smart-image";
import { openLightbox, interceptImageClick } from "@/components/ui/lightbox";
import { uploadToFolder, useResolvedSrc } from "@/shared/files/media";
import { useFilePolicy, checkFile } from "@/shared/api/task-files";
import { type Attachment } from "./model";
import { uid } from "./util";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Read a File into an inlined data-URL Attachment (persists in the store, like
 * wiki covers — no upload endpoint, embeds directly in the description HTML). */
export function fileToAttachment(file: File): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () =>
      resolve({
        id: uid(),
        name: file.name || "file",
        url: String(reader.result),
        mime: file.type || "application/octet-stream",
        size: file.size,
      });
    reader.readAsDataURL(file);
  });
}

export const isImage = (a: Attachment) => a.mime.startsWith("image/");

/** Center-crop + downscale an image File to a small banner data-URL (JPEG). The
 * original is discarded — only the compact crop is kept (project covers). */
export function imageCover(file: File, w = 640, h = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        const scale = Math.max(w / img.width, h / img.height);
        const sw = w / scale;
        const sh = h / scale;
        ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/** Downscale an image File to a small, optimized thumbnail File (NOT base64):
 *  drawn to a canvas so the LONGEST side is ≤ `maxPx` (retina-friendly — the
 *  cover renders ~2× smaller), then exported via `toBlob`. Used for card covers
 *  and project avatars, which we UPLOAD (never inline in the store). */
export function imageThumbFile(
  file: File,
  maxPx = 800,
  mime = "image/jpeg",
  quality = 0.82,
): Promise<File> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        const longest = Math.max(img.width, img.height) || 1;
        const scale = Math.min(1, maxPx / longest);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) { reject(new Error("toBlob failed")); return; }
            const base = (file.name || "image").replace(/\.[^.]+$/, "") || "image";
            const ext = mime === "image/png" ? "png" : "jpg";
            resolve(new File([blob], `${base}-thumb.${ext}`, { type: mime }));
          },
          mime,
          quality,
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/** Files pasted/dropped onto an element (images and any other file). */
export function filesFromClipboard(e: React.ClipboardEvent): File[] {
  const out: File[] = [];
  const dt = e.clipboardData;
  if (dt.files && dt.files.length) return Array.from(dt.files);
  for (const item of Array.from(dt.items || [])) {
    if (item.kind === "file") {
      const f = item.getAsFile();
      if (f) out.push(f);
    }
  }
  return out;
}

/** Build a card `Attachment` from a File. With `uploadTo` (companyId > 0) the
 *  original goes to the Files module (`url` = full-res ref) and, for images, a
 *  small thumbnail is uploaded too (`thumbUrl` = the light cover ref); otherwise
 *  the file is inlined as a data: URL. Mirrors AttachmentsSection's add path so
 *  lightweight composers (e.g. the board Quick-Add paste) reuse one code path. */
export async function makeAttachment(
  file: File,
  uploadTo?: { companyId: number; folder: string[] } | null,
): Promise<Attachment> {
  if (uploadTo && uploadTo.companyId > 0) {
    try {
      const { ref } = await uploadToFolder(uploadTo.companyId, uploadTo.folder, file);
      const att: Attachment = {
        id: uid(),
        name: file.name || "file",
        url: ref,
        mime: file.type || "application/octet-stream",
        size: file.size,
      };
      if (att.mime.startsWith("image/")) {
        try {
          const thumb = await imageThumbFile(file, 800);
          const { ref: tref } = await uploadToFolder(uploadTo.companyId, [...uploadTo.folder, "covers"], thumb);
          att.thumbUrl = tref;
        } catch {
          /* keep full-res as the cover source */
        }
      }
      return att;
    } catch {
      /* upload failed — fall back to an inline data: URL below */
    }
  }
  return fileToAttachment(file);
}

const humanSize = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Strip HTML → plain text (for card previews / excerpts). */
export function htmlToText(html: string): string {
  if (!html) return "";
  if (!/[<&]/.test(html)) return html;
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent || el.innerText || "").replace(/\s+/g, " ").trim();
}

// ── WYSIWYG description ──────────────────────────────────────────────────────

/**
 * Lightweight contentEditable rich-text editor (bold/italic/underline + lists +
 * inline images). Images inserted or pasted are also reported via
 * `onAddAttachment` so they show in the attachments list too. Uncontrolled to
 * keep the caret stable — the HTML is seeded once per `docKey`.
 */
export function RichDescription({
  docKey,
  initialHtml,
  onCommit,
  onAddAttachment,
  placeholder,
  autoFocus,
  uploadTo,
}: {
  docKey: string;
  initialHtml: string;
  onCommit: (html: string) => void;
  onAddAttachment: (a: Attachment) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** When set, image attachments ALSO get an uploaded `thumbUrl` (files: ref) so
   *  a card cover made from a pasted description image never renders base64. */
  uploadTo?: { companyId: number; folder: string[] } | null;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: policy } = useFilePolicy();

  // Seed the HTML once per card so typing doesn't reset the caret.
  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== initialHtml) {
      ref.current.innerHTML = initialHtml || "";
    }
    // Focus + place the caret at the end when opened for editing.
    if (autoFocus && ref.current) {
      const el = ref.current;
      el.focus();
      const sel = window.getSelection();
      if (sel) { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); sel.removeAllRanges(); sel.addRange(r); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  const exec = (cmd: string, val?: string) => {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
  };

  // Insert an image into the description. The inline HTML must embed a directly
  // renderable src (a data: URL — a files: ref can't paint inline), so `url`
  // stays base64 for the editor; but we ALSO upload a small thumbnail and stash
  // its files: ref in `thumbUrl`, which is what a board-card cover renders — so
  // a cover made from a description image is a real URL, never base64.
  const insertImage = async (f: File) => {
    const att = await fileToAttachment(f);
    ref.current?.focus();
    document.execCommand("insertHTML", false,
      `<img src="${att.url}" alt="${att.name.replace(/"/g, "&quot;")}" style="max-width:100%;border-radius:8px" />`);
    let enriched = att;
    if (uploadTo && uploadTo.companyId > 0 && att.mime.startsWith("image/")) {
      try {
        const thumb = await imageThumbFile(f, 800);
        const { ref: tref } = await uploadToFolder(uploadTo.companyId, [...uploadTo.folder, "covers"], thumb);
        enriched = { ...att, thumbUrl: tref };
      } catch {
        /* keep the data: URL as the only source */
      }
    }
    onAddAttachment(enriched);
    commit();
  };

  const onPickImages = async (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) if (!checkFile(f, policy)) await insertImage(f);
  };

  const onPaste = async (e: React.ClipboardEvent) => {
    const files = filesFromClipboard(e).filter((f) => f.type.startsWith("image/"));
    if (files.length) {
      e.preventDefault();
      for (const f of files) if (!checkFile(f, policy)) await insertImage(f);
      return;
    }
    // Plain-text paste — strip foreign HTML formatting.
    e.preventDefault();
    document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
  };

  const commit = () => onCommit(ref.current?.innerHTML ?? "");

  const Btn = ({ cmd, val, icon: Icon, label }: { cmd: string; val?: string; icon: typeof Bold; label: string }) => (
    <button
      type="button"
      title={label}
      onMouseDown={(e) => { e.preventDefault(); exec(cmd, val); }}
      className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <Icon className="size-4" />
    </button>
  );

  return (
    <div className="rounded-lg border focus-within:border-primary/50">
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        <Btn cmd="bold" icon={Bold} label={t("modules.tasks.rt.bold", { defaultValue: "Qalin" })} />
        <Btn cmd="italic" icon={Italic} label={t("modules.tasks.rt.italic", { defaultValue: "Kursiv" })} />
        <Btn cmd="underline" icon={Underline} label={t("modules.tasks.rt.underline", { defaultValue: "Tagchiziq" })} />
        <span className="mx-0.5 h-4 w-px bg-border" />
        <Btn cmd="insertUnorderedList" icon={List} label={t("modules.tasks.rt.bullets", { defaultValue: "Ro'yxat" })} />
        <Btn cmd="insertOrderedList" icon={ListOrdered} label={t("modules.tasks.rt.numbers", { defaultValue: "Raqamli ro'yxat" })} />
        <span className="mx-0.5 h-4 w-px bg-border" />
        <button
          type="button"
          title={t("modules.tasks.rt.image", { defaultValue: "Rasm qo'shish" })}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ImageIcon className="size-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { onPickImages(e.target.files); e.target.value = ""; }}
        />
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => { /* live value read on blur */ }}
        onBlur={commit}
        onPaste={onPaste}
        onClickCapture={interceptImageClick}
        data-placeholder={placeholder}
        className={cn(
          "tasks-rte min-h-[96px] px-3 py-2 text-sm outline-none",
          "[&_img]:my-1 [&_img]:cursor-zoom-in [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
        )}
      />
    </div>
  );
}

// ── attachments list ─────────────────────────────────────────────────────────

/** Controlled attachments panel: thumbnails, add/remove, paste-to-attach, and a
 * cover toggle on images (the chosen image renders on the board card).
 *
 * With `uploadTo` set, files are stored in the FILES MODULE under the given
 * folder path (e.g. `Tasks/<project>/`) and the attachment keeps only a
 * `files:` ref — a preloader row shows while an upload is in flight, and any
 * failure falls back to inlining a data: URL so nothing is lost. */
export function AttachmentsSection({
  attachments,
  cover,
  onAttachmentsChange,
  onCoverChange,
  uploadTo,
}: {
  attachments: Attachment[];
  cover: string | null;
  onAttachmentsChange: (next: Attachment[]) => void;
  onCoverChange: (id: string | null) => void;
  uploadTo?: { companyId: number; folder: string[] } | null;
}) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: policy } = useFilePolicy();
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; name: string; size: number }[]>([]);

  const add = async (files: FileList | File[] | null) => {
    if (!files) return;
    setErr(null);
    const ok: File[] = [];
    for (const f of Array.from(files)) {
      const bad = checkFile(f, policy);
      if (bad === "type") setErr(t("modules.tasks.attachments.badType", { defaultValue: "Bu fayl turi ruxsat etilmagan: {{name}}", name: f.name }));
      else if (bad === "size") setErr(t("modules.tasks.attachments.tooBig", { defaultValue: "Fayl juda katta (maks {{n}} MB): {{name}}", n: policy?.maxMb ?? 25, name: f.name }));
      else ok.push(f);
    }
    if (!ok.length) return;

    let added: Attachment[];
    if (uploadTo) {
      // Upload to the Files module (Tasks/<project>/…) with a preloader row per
      // file; a failed upload inlines the data: URL instead.
      const rows = ok.map((f) => ({ id: uid(), name: f.name || "file", size: f.size }));
      setPending((p) => [...p, ...rows]);
      added = await Promise.all(
        ok.map(async (f, i) => {
          try {
            const { ref } = await uploadToFolder(uploadTo.companyId, uploadTo.folder, f);
            // For images, also upload a small optimized thumbnail (≤800px) to a
            // `covers` subfolder → used as the board-card cover so it stays crisp
            // + light and is NEVER a base64 data URL. `url` keeps the full file.
            let thumbUrl: string | undefined;
            if ((f.type || "").startsWith("image/")) {
              try {
                const thumb = await imageThumbFile(f, 800);
                const up = await uploadToFolder(uploadTo.companyId, [...uploadTo.folder, "covers"], thumb);
                thumbUrl = up.ref;
              } catch {
                /* thumbnail is optional — the cover falls back to `url` */
              }
            }
            return {
              id: rows[i].id,
              name: f.name || "file",
              url: ref,
              mime: f.type || "application/octet-stream",
              size: f.size,
              ...(thumbUrl ? { thumbUrl } : {}),
            } satisfies Attachment;
          } catch {
            return await fileToAttachment(f);
          }
        }),
      );
      setPending((p) => p.filter((r) => !rows.some((x) => x.id === r.id)));
    } else {
      added = await Promise.all(ok.map(fileToAttachment));
    }

    onAttachmentsChange([...attachments, ...added]);
    // First image ever added → make it the default cover (user can clear it).
    if (!cover && !attachments.some(isImage)) {
      const firstImg = added.find(isImage);
      if (firstImg) onCoverChange(firstImg.id);
    }
  };
  const remove = (id: string) => {
    onAttachmentsChange(attachments.filter((a) => a.id !== id));
    if (cover === id) onCoverChange(null);
  };
  const toggleCover = (id: string) => onCoverChange(cover === id ? null : id);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {t("modules.tasks.attachments.title", { defaultValue: "Ilovalar" })}
          {attachments.length > 0 && <span className="ml-1 opacity-60">{attachments.length}</span>}
        </span>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <Paperclip className="size-3.5" /> {t("modules.tasks.attachments.add", { defaultValue: "Fayl qo'shish" })}
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { add(e.target.files); e.target.value = ""; }}
        />
      </div>

      {err && <div className="mb-1.5 rounded-md bg-destructive/10 px-2 py-1 text-[11px] text-destructive">{err}</div>}

      {attachments.length === 0 && pending.length === 0 ? (
        <div className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
          {t("modules.tasks.attachments.empty", { defaultValue: "Fayl yo'q — bu yerga qo'shing yoki ⌘V bilan joylang" })}
        </div>
      ) : (
        <div className="space-y-1.5">
          {attachments.map((a) => (
            <AttachmentRow
              key={a.id}
              a={a}
              isCover={cover === a.id}
              onToggleCover={() => toggleCover(a.id)}
              onRemove={() => remove(a.id)}
            />
          ))}
          {pending.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-dashed bg-background p-1.5">
              <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
                <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-transparent" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{p.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t("modules.tasks.attachments.uploading", { defaultValue: "Yuklanmoqda…" })} · {humanSize(p.size)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One attachment row. `files:` refs resolve to blob URLs (shimmer while
 *  loading); data:/http URLs render directly — one code path for both. */
function AttachmentRow({
  a,
  isCover,
  onToggleCover,
  onRemove,
}: {
  a: Attachment;
  isCover: boolean;
  onToggleCover: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { src, loading } = useResolvedSrc(a.url);
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background p-1.5">
      {isImage(a) ? (
        loading || !src ? (
          <span className="size-10 shrink-0 animate-pulse rounded bg-muted" />
        ) : (
          <button
            type="button"
            onClick={(e) => openLightbox(src, a.name, e.currentTarget.querySelector("img"))}
            className="shrink-0 cursor-zoom-in"
            title={a.name}
          >
            <SmartImage src={src} alt={a.name} className="size-10" rounded="rounded" minMs={500} />
          </button>
        )
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">
          <FileText className="size-5 text-muted-foreground" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{a.name}</div>
        <div className="text-[11px] text-muted-foreground">{humanSize(a.size)}</div>
      </div>
      {isImage(a) && (
        <label className="flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted">
          <input type="checkbox" checked={isCover} onChange={onToggleCover} className="size-3.5 accent-primary" />
          {t("modules.tasks.attachments.cover", { defaultValue: "Muqova" })}
        </label>
      )}
      <a
        href={src ?? undefined}
        download={a.name}
        title={t("modules.tasks.attachments.download", { defaultValue: "Yuklab olish" })}
        className="rounded p-1 text-muted-foreground hover:bg-muted"
      >
        <Download className="size-3.5" />
      </a>
      <button type="button" onClick={onRemove} title={t("modules.tasks.attachments.remove", { defaultValue: "O'chirish" })}
        className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
        <X className="size-3.5" />
      </button>
    </div>
  );
}
