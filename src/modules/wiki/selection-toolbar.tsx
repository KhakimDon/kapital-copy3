import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Bold, Italic, Underline, Strikethrough, Code, Link2,
  Sparkles, Wand2, CheckCheck, Languages, Loader2, ChevronDown,
} from "lucide-react";
import { useWikiAi, type AiAction } from "./ai";

/** The contentEditable block that currently holds the selection (if any). */
function currentEditable(): HTMLElement | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.anchorNode;
  const el = node && (node.nodeType === 3 ? node.parentElement : (node as HTMLElement));
  return (el?.closest('[data-wiki-editable][contenteditable="true"]') as HTMLElement) ?? null;
}

/**
 * Notion-style floating toolbar. Appears above a text selection inside an
 * editable wiki block: inline marks (execCommand — the pragmatic cross-browser
 * way to mutate a contentEditable selection, which fires a native `input` event
 * so the block persists) plus AI actions that rewrite the selection through our
 * backend proxy (the OpenAI token stays server-side).
 */
export function SelectionToolbar() {
  const { t } = useTranslation();
  const ai = useWikiAi();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [busy, setBusy] = useState<AiAction | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The selection range is captured on-demand (a Range clone) so AI calls can
  // replace exactly what was selected even after focus moves to the toolbar.
  const savedRange = useRef<Range | null>(null);

  useEffect(() => {
    let raf = 0;
    const recompute = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !currentEditable()) {
        setRect(null); setAiOpen(false); setErr(null); return;
      }
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { setRect(null); return; }
      setRect(r);
    };
    const onChange = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(recompute); };
    document.addEventListener("selectionchange", onChange);
    window.addEventListener("scroll", onChange, true);
    window.addEventListener("resize", onChange);
    return () => {
      document.removeEventListener("selectionchange", onChange);
      window.removeEventListener("scroll", onChange, true);
      window.removeEventListener("resize", onChange);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (!rect) return null;

  const fireInput = (el: HTMLElement | null) => el?.dispatchEvent(new InputEvent("input", { bubbles: true }));
  const exec = (cmd: string, val?: string) => { document.execCommand(cmd, false, val); fireInput(currentEditable()); };

  const toggleCode = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const c = range.commonAncestorContainer;
    const host = (c.nodeType === 3 ? c.parentElement : (c as HTMLElement)) ?? null;
    const codeEl = host?.closest("code");
    if (codeEl && codeEl.parentNode) {
      const parent = codeEl.parentNode;
      while (codeEl.firstChild) parent.insertBefore(codeEl.firstChild, codeEl);
      parent.removeChild(codeEl);
    } else {
      const code = document.createElement("code");
      try { range.surroundContents(code); }
      catch { code.appendChild(range.extractContents()); range.insertNode(code); }
    }
    const el = currentEditable();
    sel.removeAllRanges();
    fireInput(el);
    setRect(null);
  };

  const addLink = () => {
    const url = window.prompt("URL");
    if (url) exec("createLink", url.trim());
  };

  // Run an AI action on the selected text and replace it with the result.
  const runAi = async (action: AiAction) => {
    const sel = window.getSelection();
    const el = currentEditable();
    if (!sel || sel.rangeCount === 0 || !el) return;
    const range = sel.getRangeAt(0);
    savedRange.current = range.cloneRange();
    const text = range.toString();
    if (!text.trim()) return;
    setBusy(action); setErr(null);
    try {
      const out = await ai.run(action, text);
      // Replace the original selection with the AI output (plain text).
      const r = savedRange.current;
      if (r) {
        r.deleteContents();
        r.insertNode(document.createTextNode(out));
        sel.removeAllRanges();
      }
      fireInput(el);
      setRect(null); setAiOpen(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const top = Math.max(8, rect.top - (aiOpen ? 8 : 46));
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - 300));

  const Btn = ({ title, onDo, children }: { title: string; onDo: () => void; children: ReactNode }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => { e.preventDefault(); onDo(); }}
      className="grid size-8 place-items-center rounded-md text-foreground/80 transition-colors hover:bg-muted"
    >
      {children}
    </button>
  );

  const AiItem = ({ action, icon, label }: { action: AiAction; icon: ReactNode; label: string }) => (
    <button
      type="button"
      disabled={busy != null}
      onMouseDown={(e) => { e.preventDefault(); runAi(action); }}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground/90 transition-colors hover:bg-muted disabled:opacity-50"
    >
      {busy === action ? <Loader2 className="size-4 animate-spin text-primary" /> : <span className="text-primary">{icon}</span>}
      {label}
    </button>
  );

  return createPortal(
    <div
      style={{ position: "fixed", top, left, zIndex: 60 }}
      onMouseDown={(e) => e.preventDefault()}
      className="animate-in fade-in-0 zoom-in-95 duration-100"
    >
      {!aiOpen ? (
        <div className="flex items-center gap-0.5 rounded-lg border border-black/[0.08] bg-popover p-1 text-popover-foreground shadow-lg dark:border-border">
          {ai.enabled && (
            <>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setAiOpen(true); }}
                className="flex h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-primary transition-colors hover:bg-primary/10"
              >
                <Sparkles className="size-4" /> AI <ChevronDown className="size-3.5" />
              </button>
              <div className="mx-0.5 h-5 w-px bg-border" />
            </>
          )}
          <Btn title="Bold  ⌘B" onDo={() => exec("bold")}><Bold className="size-4" /></Btn>
          <Btn title="Italic  ⌘I" onDo={() => exec("italic")}><Italic className="size-4" /></Btn>
          <Btn title="Underline  ⌘U" onDo={() => exec("underline")}><Underline className="size-4" /></Btn>
          <Btn title="Strikethrough" onDo={() => exec("strikeThrough")}><Strikethrough className="size-4" /></Btn>
          <Btn title="Code" onDo={toggleCode}><Code className="size-4" /></Btn>
          <div className="mx-0.5 h-5 w-px bg-border" />
          <Btn title="Link" onDo={addLink}><Link2 className="size-4" /></Btn>
        </div>
      ) : (
        <div className="w-60 rounded-lg border border-black/[0.08] bg-popover p-1 text-popover-foreground shadow-xl dark:border-border">
          <div className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">{t("modules.wiki.ai.title", { defaultValue: "AI bilan tahrirlash" })}</div>
          <AiItem action="improve" icon={<Wand2 className="size-4" />} label={t("modules.wiki.ai.improve", { defaultValue: "Matnni yaxshilash" })} />
          <AiItem action="fix" icon={<CheckCheck className="size-4" />} label={t("modules.wiki.ai.fix", { defaultValue: "Xatolarni tuzatish" })} />
          <AiItem action="shorten" icon={<Sparkles className="size-4" />} label={t("modules.wiki.ai.shorten", { defaultValue: "Qisqartirish" })} />
          <AiItem action="lengthen" icon={<Sparkles className="size-4" />} label={t("modules.wiki.ai.lengthen", { defaultValue: "Kengaytirish" })} />
          <AiItem action="explain" icon={<Sparkles className="size-4" />} label={t("modules.wiki.ai.explain", { defaultValue: "Tushuntirish" })} />
          <AiItem action="translate_ru" icon={<Languages className="size-4" />} label={t("modules.wiki.ai.translateRu", { defaultValue: "Rus tiliga tarjima" })} />
          <AiItem action="translate_uz" icon={<Languages className="size-4" />} label={t("modules.wiki.ai.translateUz", { defaultValue: "O'zbek tiliga tarjima" })} />
          <AiItem action="translate_en" icon={<Languages className="size-4" />} label={t("modules.wiki.ai.translateEn", { defaultValue: "Ingliz tiliga tarjima" })} />
          {err && <div className="px-2.5 py-1 text-xs text-destructive">{err}</div>}
        </div>
      )}
    </div>,
    document.body,
  );
}
