import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import * as Icons from "lucide-react";
import { GripVertical, Image as ImageIcon, Plus, Trash2, Copy, ChevronRight, Repeat2, Upload } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/shared/lib/utils";
import { interceptImageClick } from "@/components/ui/lightbox";
import { isFilesRef, resolveFilesRef, startWikiImageUpload, useWikiUploads } from "./media";
import { useWikiStore } from "./local/store";
import { BLOCK_TYPES, COVER_IMAGES, PAGE_EMOJIS, coverCss, type Block, type BlockType } from "./local/model";
import { SelectionToolbar } from "./selection-toolbar";

function lucide(name: string) {
  return (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.Square;
}

type FocusReq = { id: string; pos?: number | "end" } | null;

// ── page header (icon + title) ──────────────────────────────────────────────
export function PageEditor({ pageId, canEdit }: { pageId: string; canEdit: boolean }) {
  const { t } = useTranslation();
  const page = useWikiStore((s) => s.pages.find((p) => p.id === pageId) ?? null);
  const updatePage = useWikiStore((s) => s.updatePage);
  const [focus, setFocus] = useState<FocusReq>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = titleRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [page?.title]);

  if (!page) return null;

  // "Add cover" drops in a random photo straight away (Notion behaviour); the
  // user can then pick a specific one or upload their own from the picker.
  const addCover = () => {
    updatePage(pageId, { cover: COVER_IMAGES[Math.floor(Math.random() * COVER_IMAGES.length)] });
  };

  const widthClass = page.fullWidth ? "max-w-[1280px]" : "max-w-[720px]";

  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200">
      {/* Header hover zone = cover + icon + title. The cover controls reveal on
          THIS group, not the cover alone — the icon block straddles full-width
          over the cover's bottom, so a cover-only :hover drops the instant the
          cursor crosses the icon on its way to the buttons. Grouping the whole
          header keeps them up across that gap. */}
      <div className="group/hdr">
        {page.cover && <CoverBanner pageId={pageId} cover={page.cover} canEdit={canEdit} widthClass={widthClass} />}

        <div className={cn("group/head mx-auto w-full px-14 text-[#37352f] dark:text-foreground", widthClass, page.cover ? "pt-0" : "pt-14")}>
        {/* hover affordance — Add cover (only when there's none) */}
        {canEdit && !page.cover && (
          <div className="flex h-7 items-center gap-2 opacity-0 transition-opacity group-hover/hdr:opacity-100">
            <button onClick={addCover} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-black/[0.05] dark:hover:bg-white/10">
              <ImageIcon className="size-3.5" /> {t("modules.wiki.addCover", { defaultValue: "Muqova qo'shish" })}
            </button>
          </div>
        )}

        {/* icon — straddles the cover's bottom edge when a cover is set */}
        <div className={cn("group/icon relative", page.cover ? "-mt-12 mb-1" : "mb-1")}>
          <Popover>
            <PopoverTrigger asChild disabled={!canEdit}>
              <button className="rounded-lg px-1 text-[64px] leading-none drop-shadow-sm transition-colors hover:bg-black/[0.05] dark:hover:bg-white/10">
                {page.icon}
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-2">
              <div className="grid grid-cols-8 gap-1">
                {PAGE_EMOJIS.map((e) => (
                  <button key={e} onClick={() => updatePage(pageId, { icon: e })} className="rounded-md p-1 text-2xl hover:bg-muted">
                    {e}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <textarea
          ref={titleRef}
          value={page.title}
          readOnly={!canEdit}
          onChange={(e) => updatePage(pageId, { title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); document.getElementById(`wiki-first-block`)?.focus(); }
          }}
          rows={1}
          placeholder={t("modules.wiki.untitled", { defaultValue: "Nomsiz" })}
          className="w-full resize-none overflow-hidden bg-transparent text-[40px] font-bold leading-[1.2] tracking-[-0.018em] text-inherit outline-none placeholder:text-muted-foreground/40"
        />
        </div>
      </div>

      {/* Blocks live OUTSIDE the header hover group so they don't keep the cover
          controls revealed, and their box never overlaps the cover. */}
      <div className={cn("mx-auto w-full px-14 pb-24 pt-2 text-[#37352f] dark:text-foreground", widthClass)}>
        <BlockEditor pageId={pageId} canEdit={canEdit} focus={focus} setFocus={setFocus} />
      </div>
    </div>
  );
}

// ── image block ──────────────────────────────────────────────────────────────
/** `block.text` holds either a `files:<companyId>/<nodeId>` ref (uploads go to
 *  the Files module under `Wiki/<article>/`) or a plain data:/http URL (legacy
 *  blocks, personal spaces). Empty → upload placeholder or the in-flight
 *  preloader; set → the picture, opening in the lightbox via the editor-level
 *  click interception. */
function ImageBlock({ block, canEdit }: { block: Block; canEdit: boolean; update: (id: string, patch: Partial<Block>) => void }) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const uploading = useWikiUploads((s) => s.ids.has(block.id));

  // files: ref → blob URL (authed download; <img src> can't carry the JWT).
  const filesRef = isFilesRef(block.text) ? block.text : null;
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!filesRef) return;
    let alive = true;
    setResolved(null);
    setFailed(false);
    resolveFilesRef(filesRef).then(
      (url) => { if (alive) setResolved(url); },
      () => { if (alive) setFailed(true); },
    );
    return () => { alive = false; };
  }, [filesRef]);

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    startWikiImageUpload(block.id, block.pageId, f);
  };

  // Preloader: upload in flight, or a files: ref still resolving.
  if (uploading || (filesRef && !resolved && !failed)) {
    return (
      <div className="py-1.5">
        <div className="flex h-40 w-full animate-pulse items-center justify-center gap-2 rounded-lg bg-black/[0.05] text-sm text-muted-foreground dark:bg-muted">
          <span className="size-4 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-transparent" />
          {uploading
            ? t("modules.wiki.imageUploading", { defaultValue: "Rasm yuklanmoqda…" })
            : t("modules.wiki.imageLoading", { defaultValue: "Rasm ochilmoqda…" })}
        </div>
      </div>
    );
  }

  const src = filesRef ? resolved : block.text || null;
  if (src) {
    return (
      <div className="py-1.5">
        <img
          src={src}
          alt=""
          className="max-w-full cursor-zoom-in rounded-lg border border-black/[0.06] dark:border-border"
          draggable={false}
        />
      </div>
    );
  }
  if (filesRef && failed) {
    return (
      <div className="py-1.5">
        <div className="rounded-lg border border-dashed border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {t("modules.wiki.imageFailed", { defaultValue: "Rasmni ochib bo'lmadi (fayl o'chirilgan bo'lishi mumkin)." })}
        </div>
      </div>
    );
  }
  if (!canEdit) return <div className="py-1" />;
  return (
    <div className="py-1.5">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-foreground/20 bg-muted/40 px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted"
      >
        <ImageIcon className="size-4" />
        {t("modules.wiki.imageUpload", { defaultValue: "Rasm yuklash (yoki matn blokiga rasm joylang)" })}
      </button>
    </div>
  );
}

// ── full-width page cover (gradient banner behind the title) ─────────────────
function CoverBanner({ pageId, cover, canEdit, widthClass }: { pageId: string; cover: string; canEdit: boolean; widthClass: string }) {
  const { t } = useTranslation();
  const updatePage = useWikiStore((s) => s.updatePage);
  const fileRef = useRef<HTMLInputElement>(null);
  // Reveal on hover via CSS (:hover is cursor-driven, so it never misses), and
  // keep the controls forced-visible while the picker popover is open — a bare
  // opacity group-hover alone fought the portaled popover: the controls faded
  // the instant it stole focus, so the click never landed.
  const [pickerOpen, setPickerOpen] = useState(false);

  // Uploaded covers are inlined as data: URLs so they persist in the local store.
  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { updatePage(pageId, { cover: String(reader.result) }); setPickerOpen(false); };
    reader.readAsDataURL(f);
  };
  return (
    <div className="relative h-[184px] w-full" style={{ background: coverCss(cover) }}>
      {canEdit && (
        // Outer strip is full-width but click-through (pointer-events-none) so it
        // never covers the icon on the left. z-20 lifts the buttons ABOVE the
        // page-icon wrapper, which straddles up into the cover and otherwise
        // stole the click. Reveal is driven by the header group (group/hdr) so
        // crossing the icon on the way to the buttons doesn't hide them.
        <div className={cn("pointer-events-none absolute inset-x-0 bottom-3 z-20 mx-auto flex justify-end px-14", widthClass)}>
        <div className={cn(
          "flex gap-1.5 transition-opacity duration-150 group-hover/hdr:pointer-events-auto group-hover/hdr:opacity-100",
          pickerOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button className="rounded-md bg-white/90 px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-black/5 hover:bg-white">
                {t("modules.wiki.changeCover", { defaultValue: "Muqovani almashtirish" })}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-2" onCloseAutoFocus={(e) => e.preventDefault()}>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
              <div className="grid grid-cols-5 gap-1.5">
                {/* first cell — upload your own */}
                <button
                  onClick={() => fileRef.current?.click()}
                  title={t("modules.wiki.uploadCover", { defaultValue: "Rasm yuklash" })}
                  className="flex h-10 items-center justify-center rounded-md border border-dashed border-foreground/25 text-muted-foreground transition-colors hover:border-foreground/40 hover:bg-muted"
                >
                  <Upload className="size-4" />
                </button>
                {COVER_IMAGES.map((url) => (
                  <button
                    key={url}
                    onClick={() => { updatePage(pageId, { cover: url }); setPickerOpen(false); }}
                    className={cn("h-10 rounded-md bg-cover bg-center ring-offset-1 ring-offset-background transition-shadow hover:ring-2 hover:ring-foreground/30", cover === url && "ring-2 ring-primary")}
                    style={{ backgroundImage: `url("${url}")` }}
                  />
                ))}
              </div>
              <div className="mt-2 px-0.5 text-[10px] text-muted-foreground/70">{t("modules.wiki.coverCredit", { defaultValue: "Rasmlar: Pexels" })}</div>
            </PopoverContent>
          </Popover>
          <button
            onClick={() => updatePage(pageId, { cover: null })}
            className="rounded-md bg-white/90 px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-black/5 hover:bg-white"
          >
            {t("modules.wiki.removeCover", { defaultValue: "Olib tashlash" })}
          </button>
        </div>
        </div>
      )}
    </div>
  );
}

// ── block list ──────────────────────────────────────────────────────────────
function BlockEditor({
  pageId, canEdit, focus, setFocus,
}: {
  pageId: string;
  canEdit: boolean;
  focus: FocusReq;
  setFocus: (f: FocusReq) => void;
}) {
  const allBlocks = useWikiStore((s) => s.blocks);
  const blocks = useMemo(
    () => allBlocks.filter((b) => b.pageId === pageId).sort((a, b) => a.order - b.order),
    [allBlocks, pageId],
  );
  const createBlock = useWikiStore((s) => s.createBlock);
  const moveBlock = useWikiStore((s) => s.moveBlock);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [justMoved, setJustMoved] = useState<string | null>(null);

  // Hide blocks nested under a collapsed toggle.
  const visible = useMemo(
    () => blocks.filter((b) => {
      if (!b.parentBlockId) return true;
      const parent = blocks.find((p) => p.id === b.parentBlockId);
      return !!parent && !parent.collapsed;
    }),
    [blocks],
  );

  return (
    // Any image inside block HTML (pasted/inserted) opens in the lightbox —
    // captured before the contentEditable caret handling grabs the click.
    <div className="min-h-[40vh] [&_img]:cursor-zoom-in" onClickCapture={interceptImageClick}>
      {canEdit && <SelectionToolbar />}
      {visible.map((b) => {
        const i = blocks.indexOf(b);
        return (
          <div
            key={b.id}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverIdx(i); } }}
            onDrop={(e) => {
              e.preventDefault();
              const moved = dragId;
              if (moved && moved !== b.id) {
                moveBlock(moved, i);
                setJustMoved(moved);
                window.setTimeout(() => setJustMoved((cur) => (cur === moved ? null : cur)), 500);
              }
              setDragId(null); setOverIdx(null);
            }}
            style={{ paddingLeft: b.parentBlockId ? 24 : 0 }}
            className={cn("rounded-md transition-colors duration-500", justMoved === b.id && "bg-primary/10")}
          >
            {dragId && overIdx === i && <div className="h-0.5 rounded-full bg-primary transition-all" />}
            <BlockRow
              block={b}
              index={i}
              first={b === visible[0]}
              canEdit={canEdit}
              blocks={blocks}
              focus={focus}
              setFocus={setFocus}
              onDragStart={(e) => { e.dataTransfer.setData("text/plain", b.id); e.dataTransfer.effectAllowed = "move"; setDragId(b.id); }}
              onDragEnd={() => { setDragId(null); setOverIdx(null); }}
              dragging={dragId === b.id}
            />
          </div>
        );
      })}
      {/* click-to-add trailing area */}
      {canEdit && (
        <div
          onClick={() => {
            const last = blocks[blocks.length - 1];
            if (last && last.type === "text" && last.text === "") { setFocus({ id: last.id, pos: "end" }); return; }
            const id = createBlock(pageId, last?.id ?? null, "text", "");
            setFocus({ id, pos: 0 });
          }}
          className="h-24 cursor-text"
        />
      )}
    </div>
  );
}

const CONTINUES: Partial<Record<BlockType, BlockType>> = { bulleted: "bulleted", numbered: "numbered", todo: "todo" };

// ── contentEditable helpers (rich text lives as inline HTML in block.text) ────
const stripHtml = (html: string) => {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return d.textContent || "";
};
/** Character offset of the caret from the start of `el` (counts text only). */
function caretOffset(el: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return 0;
  const r = sel.getRangeAt(0);
  const pre = r.cloneRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.endContainer, r.endOffset);
  return pre.toString().length;
}
/** Put the caret at a character offset (or the end) inside `el`, preserving marks. */
function placeCaret(el: HTMLElement, pos: number | "end" | null | undefined) {
  el.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  if (pos === "end" || pos == null) {
    range.selectNodeContents(el);
    range.collapse(false);
  } else {
    let remaining = pos;
    let placed = false;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = walker.nextNode())) {
      const len = n.textContent?.length ?? 0;
      if (remaining <= len) { range.setStart(n, remaining); range.collapse(true); placed = true; break; }
      remaining -= len;
    }
    if (!placed) { range.selectNodeContents(el); range.collapse(false); }
  }
  sel.removeAllRanges();
  sel.addRange(range);
}
/** Split `el`'s content at the caret; returns HTML before/after (marks kept). */
function splitAtCaret(el: HTMLElement): { before: string; after: string } {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return { before: el.textContent ? el.innerHTML : "", after: "" };
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const after = document.createRange();
  after.setStart(range.endContainer, range.endOffset);
  after.setEnd(el, el.childNodes.length);
  const frag = after.extractContents();
  const tmp = document.createElement("div");
  tmp.appendChild(frag);
  return { before: el.textContent ? el.innerHTML : "", after: tmp.textContent ? tmp.innerHTML : "" };
}

// ── one block ─────────────────────────────────────────────────────────────
function BlockRow({
  block, index, first, canEdit, blocks, focus, setFocus, onDragStart, onDragEnd, dragging,
}: {
  block: Block;
  index: number;
  first: boolean;
  canEdit: boolean;
  blocks: Block[];
  focus: FocusReq;
  setFocus: (f: FocusReq) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  dragging: boolean;
}) {
  const { t } = useTranslation();
  const update = useWikiStore((s) => s.updateBlock);
  const create = useWikiStore((s) => s.createBlock);
  const del = useWikiStore((s) => s.deleteBlock);
  const indent = useWikiStore((s) => s.indentBlock);
  const outdent = useWikiStore((s) => s.outdentBlock);
  const toggleCollapse = useWikiStore((s) => s.toggleCollapse);
  const ref = useRef<HTMLDivElement | null>(null);
  const onInputRef = useRef<() => void>(() => {});
  const [slash, setSlash] = useState<{ query: string } | null>(null);
  const [slashIdx, setSlashIdx] = useState(0);
  const [focused, setFocused] = useState(false);
  const [empty, setEmpty] = useState(!stripHtml(block.text));

  // Persist via a MutationObserver, not input events. On contentEditable, React's
  // onInput / native `input` proved unreliable to route to the store (multi-mount
  // + synthetic events), but a MutationObserver fires on EVERY DOM change (typing,
  // toolbar execCommand, paste) — it can't be missed.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new MutationObserver(() => onInputRef.current());
    obs.observe(el, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, []);

  // Push EXTERNAL text changes (merge, turn-into, undo) into the DOM. This is an
  // uncontrolled contentEditable — React renders it empty and never touches its
  // children; we own innerHTML. Skip while the user types (DOM already matches)
  // or when both sides are empty (avoids nuking the caret over a stray <br>).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stateEmpty = !stripHtml(block.text);
    setEmpty(stateEmpty);
    if (stateEmpty && !el.textContent) return;
    if (el.innerHTML !== (block.text || "")) el.innerHTML = block.text || "";
  }, [block.text]);

  // focus requests (after split / merge / add)
  useEffect(() => {
    if (focus?.id !== block.id) return;
    const el = ref.current;
    if (el) requestAnimationFrame(() => placeCaret(el, focus.pos));
    setFocus(null);
  }, [focus, block.id, setFocus]);

  const matches = useMemo(() => {
    const q = (slash?.query ?? "").toLowerCase();
    return BLOCK_TYPES.filter(
      (bt) => t(bt.labelKey, { defaultValue: bt.label }).toLowerCase().includes(q) || bt.type.includes(q),
    );
  }, [slash, t]);

  const applyType = (type: BlockType) => {
    setSlash(null);
    // Non-editable blocks: set the type, then continue typing in a fresh text
    // block below (an empty image block renders its upload placeholder).
    if (type === "divider" || type === "image") {
      update(block.id, { type, text: "" });
      const id = create(block.pageId, block.id, "text", "");
      setFocus({ id, pos: 0 });
      return;
    }
    update(block.id, { type, text: "" });
    setFocus({ id: block.id, pos: 0 });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    // inline-mark hotkeys (⌘/Ctrl + B / I / U)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "b" || k === "i" || k === "u") {
        e.preventDefault();
        document.execCommand(k === "b" ? "bold" : k === "i" ? "italic" : "underline");
        return;
      }
    }
    if (slash) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx((i) => Math.min(i + 1, matches.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setSlashIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter") { e.preventDefault(); if (matches[slashIdx]) applyType(matches[slashIdx].type); return; }
      if (e.key === "Escape") { e.preventDefault(); setSlash(null); return; }
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const pos = caretOffset(el);
      if (e.shiftKey) outdent(block.id);
      else indent(block.id);
      setFocus({ id: block.id, pos });
      return;
    }
    // Soft line break: Shift+Enter anywhere, and any Enter inside a code block.
    if (e.key === "Enter" && (e.shiftKey || block.type === "code")) {
      e.preventDefault();
      document.execCommand("insertLineBreak");
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && block.type !== "code") {
      e.preventDefault();
      const plain = el.textContent ?? "";
      // Empty nested item → outdent one level (Notion behaviour).
      if (!plain && block.parentBlockId) { outdent(block.id); update(block.id, { type: "text" }); return; }
      // Empty list/todo/toggle → exit the list (turn into plain text).
      if (!plain && (block.type === "bulleted" || block.type === "numbered" || block.type === "todo" || block.type === "toggle" || block.type === "quote" || block.type === "callout")) {
        update(block.id, { type: "text" });
        return;
      }
      const { before, after } = splitAtCaret(el);
      // Enter inside a toggle → create its first child (and expand it).
      if (block.type === "toggle") {
        update(block.id, { text: before, collapsed: false });
        const id = create(block.pageId, block.id, "text", after, block.id);
        setFocus({ id, pos: 0 });
        return;
      }
      update(block.id, { text: before });
      const nextType = CONTINUES[block.type] ?? "text";
      const id = create(block.pageId, block.id, nextType, after, block.parentBlockId ?? null);
      setFocus({ id, pos: 0 });
      return;
    }
    if (e.key === "Backspace" && window.getSelection()?.isCollapsed && caretOffset(el) === 0) {
      if (block.type !== "text") { e.preventDefault(); update(block.id, { type: "text" }); return; }
      const prev = blocks[index - 1];
      if (!prev) return;
      if (prev.type === "divider") { e.preventDefault(); del(prev.id); return; }
      e.preventDefault();
      const tmp = document.createElement("div"); tmp.innerHTML = prev.text || "";
      const mergePos = tmp.textContent?.length ?? 0;
      const tail = el.textContent ? el.innerHTML : "";
      update(prev.id, { text: (prev.text || "") + tail });
      del(block.id);
      setFocus({ id: prev.id, pos: mergePos });
    }
  };

  const onInput = () => {
    const el = ref.current;
    if (!el) return;
    const html = el.textContent ? el.innerHTML : "";
    setEmpty(!el.textContent);
    update(block.id, { text: html });
    const plain = el.textContent ?? "";
    if (/^\/[\p{L}\d]*$/u.test(plain)) { setSlash({ query: plain.slice(1) }); setSlashIdx(0); }
    else if (slash) setSlash(null);
  };
  onInputRef.current = onInput;

  if (block.type === "divider") {
    return (
      <BlockShell block={block} first={first} canEdit={canEdit} onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={dragging} focus={focus} setFocus={setFocus}>
        <div className="py-2.5"><hr className="border-border" /></div>
      </BlockShell>
    );
  }

  if (block.type === "image") {
    return (
      <BlockShell block={block} first={first} canEdit={canEdit} onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={dragging} focus={focus} setFocus={setFocus}>
        <ImageBlock block={block} canEdit={canEdit} update={update} />
      </BlockShell>
    );
  }

  const shared =
    "w-full whitespace-pre-wrap break-words bg-transparent outline-none [&_code]:rounded [&_code]:bg-black/[0.06] [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em] dark:[&_code]:bg-muted [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2";
  const typeClass: Record<BlockType, string> = {
    text: "text-[16px] leading-[1.6] text-inherit",
    h1: "text-[1.875rem] font-bold leading-[1.3] pt-8 pb-1",
    h2: "text-[1.5rem] font-semibold leading-[1.3] pt-6 pb-0.5",
    h3: "text-[1.25rem] font-semibold leading-[1.3] pt-4 pb-0.5",
    bulleted: "text-[16px] leading-[1.6]",
    numbered: "text-[16px] leading-[1.6]",
    todo: "text-[16px] leading-[1.6]",
    toggle: "text-[16px] leading-[1.6]",
    quote: "text-[16px] leading-[1.6] italic",
    callout: "text-[16px] leading-[1.6]",
    code: "font-mono text-[14px] leading-[1.5]",
    divider: "",
    image: "",
  };

  // Numbered lists restart after any non-numbered break (and per nesting level).
  const numberIndex = (() => {
    if (block.type !== "numbered") return 0;
    let n = 0;
    for (let j = index; j >= 0; j--) {
      const bb = blocks[j];
      if (bb.type === "numbered" && (bb.parentBlockId ?? null) === (block.parentBlockId ?? null)) n++;
      else break;
    }
    return n;
  })();

  // Notion-style: an empty block shows its hint only while focused (the first
  // text block always hints, as the page's starting prompt).
  const placeholderText =
    first && block.type === "text"
      ? t("modules.wiki.blockPlaceholderFirst", { defaultValue: "Yozing yoki '/' bosib blok tanlang…" })
      : block.type === "h1"
      ? t("modules.wiki.h1Placeholder", { defaultValue: "Sarlavha 1" })
      : block.type === "h2"
      ? t("modules.wiki.h2Placeholder", { defaultValue: "Sarlavha 2" })
      : block.type === "h3"
      ? t("modules.wiki.h3Placeholder", { defaultValue: "Sarlavha 3" })
      : block.type === "quote"
      ? t("modules.wiki.quotePlaceholder", { defaultValue: "Iqtibos" })
      : block.type === "callout"
      ? t("modules.wiki.calloutPlaceholder", { defaultValue: "Eslatma yozing…" })
      : block.type === "code"
      ? t("modules.wiki.codePlaceholder", { defaultValue: "Kod" })
      : block.type === "bulleted" || block.type === "numbered" || block.type === "todo"
      ? t("modules.wiki.listPlaceholder", { defaultValue: "Ro'yxat" })
      : block.type === "toggle"
      ? t("modules.wiki.togglePlaceholder", { defaultValue: "Yig'iladigan sarlavha" })
      : t("modules.wiki.blockPlaceholder", { defaultValue: "'/' — buyruqlar uchun" });

  const editable = (
    <div className="relative">
      <div
        id={first ? "wiki-first-block" : undefined}
        ref={ref}
        data-wiki-editable
        contentEditable={canEdit}
        suppressContentEditableWarning
        spellCheck={false}
        onInput={onInput}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          // Pasted image(s) → image block(s) right below, uploaded to Files
          // (Wiki/<article>/) with a preloader while in flight.
          const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
          if (files.length) {
            e.preventDefault();
            let afterId = block.id;
            for (const f of files) {
              const id = create(block.pageId, afterId, "image", "");
              afterId = id;
              startWikiImageUpload(id, block.pageId, f);
            }
            return;
          }
          e.preventDefault();
          document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setTimeout(() => setSlash(null), 120); }}
        className={cn(shared, typeClass[block.type], block.type === "todo" && block.checked && "text-muted-foreground line-through")}
      />
      {empty && (focused || (first && block.type === "text")) && (
        <div className={cn("pointer-events-none absolute inset-0 text-muted-foreground/40", typeClass[block.type])} aria-hidden>
          {placeholderText}
        </div>
      )}
      {slash && canEdit && (
        <SlashMenu matches={matches} activeIndex={slashIdx} onPick={applyType} />
      )}
    </div>
  );

  // wrappers per type (bullet / number / todo / quote / callout / toggle)
  // Markers (bullet / number / checkbox) are centered inside a box the height of
  // the first text line (16px × 1.6 ≈ 1.6rem) so they sit level with the text and
  // stay on the first line when the text wraps.
  let inner = editable;
  if (block.type === "bulleted")
    inner = (
      <div className="flex gap-2">
        <span className="flex h-[1.6rem] w-4 shrink-0 select-none items-center justify-center">
          <span className="size-[6px] rounded-full bg-current" />
        </span>
        <div className="min-w-0 flex-1">{editable}</div>
      </div>
    );
  else if (block.type === "numbered")
    inner = (
      <div className="flex gap-2">
        <span className="flex h-[1.6rem] min-w-4 shrink-0 select-none items-center justify-end tabular-nums text-[15px] text-muted-foreground">{numberIndex}.</span>
        <div className="min-w-0 flex-1">{editable}</div>
      </div>
    );
  else if (block.type === "todo")
    inner = (
      <div className="flex gap-2">
        <span className="flex h-[1.6rem] shrink-0 items-center">
          <button
            disabled={!canEdit}
            onClick={() => update(block.id, { checked: !block.checked })}
            className={cn("flex size-[18px] items-center justify-center rounded border transition-colors", block.checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40")}
          >
            {block.checked && <Icons.Check className="size-3" />}
          </button>
        </span>
        <div className="min-w-0 flex-1">{editable}</div>
      </div>
    );
  else if (block.type === "toggle") {
    const hasChildren = blocks.some((b) => (b.parentBlockId ?? null) === block.id);
    inner = (
      <div>
        <div className="flex gap-1">
          <span className="flex h-[1.6rem] shrink-0 items-center">
            <button
              onClick={() => toggleCollapse(block.id)}
              title={t("modules.wiki.toggleHint", { defaultValue: "Ochish / yopish" })}
              className="grid size-5 place-items-center rounded hover:bg-muted"
            >
              <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", !block.collapsed && "rotate-90")} />
            </button>
          </span>
          <div className="min-w-0 flex-1">{editable}</div>
        </div>
        {/* An empty, expanded toggle shows an inviting placeholder so it never
            looks broken — clicking it (or Enter in the toggle) adds a child. */}
        {!block.collapsed && !hasChildren && canEdit && (
          <button
            onClick={() => { const id = create(block.pageId, block.id, "text", "", block.id); setFocus({ id, pos: 0 }); }}
            className="ml-6 mt-0.5 block text-[15px] text-muted-foreground/50 transition-colors hover:text-muted-foreground"
          >
            {t("modules.wiki.emptyToggle", { defaultValue: "Bo'sh. Ichki blok qo'shish uchun bosing." })}
          </button>
        )}
      </div>
    );
  }
  else if (block.type === "quote")
    inner = <div className="border-l-[3px] border-current/40 pl-3.5">{editable}</div>;
  else if (block.type === "callout")
    inner = <div className="flex gap-2.5 rounded-lg bg-black/[0.03] p-3 dark:bg-muted"><span className="pt-0.5 text-lg leading-none">💡</span><div className="flex-1">{editable}</div></div>;
  else if (block.type === "code")
    inner = <div className="rounded-lg bg-black/[0.035] p-3 font-mono dark:bg-muted">{editable}</div>;

  return (
    <BlockShell block={block} first={first} canEdit={canEdit} onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={dragging} focus={focus} setFocus={setFocus}>
      {inner}
    </BlockShell>
  );
}

// left-gutter controls (add / drag handle + menu) shared by every block
function BlockShell({
  block, first, canEdit, children, onDragStart, onDragEnd, dragging, setFocus,
}: {
  block: Block;
  first: boolean;
  canEdit: boolean;
  children: React.ReactNode;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  dragging: boolean;
  focus: FocusReq;
  setFocus: (f: FocusReq) => void;
}) {
  const { t } = useTranslation();
  const create = useWikiStore((s) => s.createBlock);
  const del = useWikiStore((s) => s.deleteBlock);
  const update = useWikiStore((s) => s.updateBlock);
  const [menuOpen, setMenuOpen] = useState(false);
  const draggedRef = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  void first;
  // Blocks push their first text line down by a type-specific top padding
  // (headings, callout/code padding). The gutter is absolutely positioned, so
  // it must be nudged down by the same amount to sit ON the text line the user
  // is grabbing — otherwise the handle floats above the row and the drag ghost
  // is offset from the cursor.
  const gutterTop: Partial<Record<BlockType, string>> = {
    h1: "top-[2.375rem]",
    h2: "top-[1.625rem]",
    h3: "top-[0.9375rem]",
    callout: "top-[0.6875rem]",
    code: "top-[0.6875rem]",
  };
  return (
    <div
      ref={rowRef}
      className={cn(
        "group/block relative -ml-12 flex items-start rounded-md pl-12 transition-[opacity,transform,background-color] duration-150",
        dragging && "opacity-40",
      )}
    >
      {canEdit && (
        <div className={cn("absolute left-0 flex h-7 items-center gap-0.5 opacity-0 transition-opacity group-hover/block:opacity-100", gutterTop[block.type] ?? "top-0")}>
          <button
            title={t("modules.wiki.addBlock", { defaultValue: "Blok qo'shish" })}
            onClick={() => { const id = create(block.pageId, block.id, "text", ""); setFocus({ id, pos: 0 }); }}
            className="rounded p-0.5 text-black/30 transition-colors hover:bg-black/[0.06] hover:text-black/55 dark:text-white/30 dark:hover:bg-white/[0.08] dark:hover:text-white/60"
          >
            <Plus className="size-4" />
          </button>
          {/* The handle both DRAGS (native drag) and opens the menu on a plain
              click. It must not be the Radix trigger — that opens on pointer-down
              and swallows the drag; the menu is controlled, anchored to an inert span. */}
          <div className="relative">
            <button
              draggable
              onDragStart={(e) => {
                draggedRef.current = true;
                // Grab the WHOLE block as the drag ghost (not just this tiny handle),
                // aligned under the cursor — so the row visibly lifts and follows.
                const row = rowRef.current;
                if (row) {
                  const r = row.getBoundingClientRect();
                  e.dataTransfer.setDragImage(row, e.clientX - r.left, e.clientY - r.top);
                }
                onDragStart(e);
              }}
              onDragEnd={onDragEnd}
              onClick={() => { if (draggedRef.current) { draggedRef.current = false; return; } setMenuOpen(true); }}
              title={t("modules.wiki.blockHandle", { defaultValue: "Suring yoki menyu uchun bosing" })}
              className="cursor-grab rounded p-0.5 text-black/30 transition-colors hover:bg-black/[0.06] hover:text-black/55 active:cursor-grabbing dark:text-white/30 dark:hover:bg-white/[0.08] dark:hover:text-white/60"
            >
              <GripVertical className="size-4" />
            </button>
            <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
              <DropdownMenuTrigger asChild>
                <span className="pointer-events-none absolute inset-0" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="gap-2">
                  <Repeat2 className="size-4 text-muted-foreground" />
                  {t("modules.wiki.turnInto", { defaultValue: "O'zgartirish" })}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-48">
                  {BLOCK_TYPES.filter((bt) => bt.type !== "divider").map((bt) => {
                    const Ic = lucide(bt.icon);
                    return (
                      <DropdownMenuItem key={bt.type} onClick={() => update(block.id, { type: bt.type })} className="gap-2">
                        <Ic className="size-4 text-muted-foreground" />
                        {t(bt.labelKey, { defaultValue: bt.label })}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => create(block.pageId, block.id, block.type, block.text)} className="gap-2">
                <Copy className="size-4" /> {t("modules.wiki.duplicate", { defaultValue: "Nusxa" })}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => del(block.id)} className="gap-2 text-destructive focus:text-destructive">
                <Trash2 className="size-4" /> {t("modules.wiki.delete", { defaultValue: "O'chirish" })}
              </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

// ── slash command menu ──────────────────────────────────────────────────────
function SlashMenu({
  matches, activeIndex, onPick,
}: {
  matches: typeof BLOCK_TYPES;
  activeIndex: number;
  onPick: (t: BlockType) => void;
}) {
  const { t } = useTranslation();
  if (matches.length === 0) return null;
  return (
    <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95">
      {matches.map((bt, i) => {
        const Ic = lucide(bt.icon);
        return (
          <button
            key={bt.type}
            onMouseDown={(e) => { e.preventDefault(); onPick(bt.type); }}
            className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left", i === activeIndex ? "bg-muted" : "hover:bg-muted/60")}
          >
            <span className="grid size-9 place-items-center rounded-md border bg-background"><Ic className="size-4" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t(bt.labelKey, { defaultValue: bt.label })}</span>
              <span className="block truncate text-xs text-muted-foreground">{t(bt.descKey, { defaultValue: bt.desc })}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
