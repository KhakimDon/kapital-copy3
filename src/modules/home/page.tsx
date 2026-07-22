import { useEffect, useRef, useState } from "react";
import {
  Paperclip, X, File as FileIcon, FileText, FileSpreadsheet,
  FileArchive, FileVideo, FileAudio, FileType2, ArrowUp,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/utils";
import { useCompany } from "@/shared/store/company";
import { useTabs } from "@/shared/store/tabs";
import { useMe } from "@/shared/api/me";
import {
  useHomePrompts, toPromptLang, pickLangText, applyVars,
} from "@/shared/api/home-prompts";
import { AibaLogo } from "@/app/layout/aiba-logo";

type Attachment = { id: string; file: File; url?: string };

// File-type icon + accent colour, chosen by extension / mime.
function fileMeta(file: File): { Icon: typeof FileIcon; cls: string } {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = file.type;
  if (ext === "pdf") return { Icon: FileText, cls: "text-red-500 bg-red-500/10" };
  if (["doc", "docx", "rtf", "txt"].includes(ext)) return { Icon: FileText, cls: "text-blue-500 bg-blue-500/10" };
  if (["xls", "xlsx", "csv"].includes(ext)) return { Icon: FileSpreadsheet, cls: "text-emerald-600 bg-emerald-500/10" };
  if (["ppt", "pptx"].includes(ext)) return { Icon: FileType2, cls: "text-orange-500 bg-orange-500/10" };
  if (["zip", "rar", "7z", "tar", "gz"].includes(ext)) return { Icon: FileArchive, cls: "text-amber-500 bg-amber-500/10" };
  if (type.startsWith("video/")) return { Icon: FileVideo, cls: "text-purple-500 bg-purple-500/10" };
  if (type.startsWith("audio/")) return { Icon: FileAudio, cls: "text-pink-500 bg-pink-500/10" };
  return { Icon: FileIcon, cls: "text-muted-foreground bg-muted" };
}

/**
 * Home — a chat welcome screen. Serif heading + subtitle (z.ai-style entrance),
 * over a growing Telegram-like prompt bar. Not wired to a backend yet. The old
 * dashboard is reachable via the /dash-old link.
 */
export function HomeChatPage() {
  const { t, i18n } = useTranslation();
  const openTab = useTabs((s) => s.open);
  const company = useCompany((s) => s.current);
  const me = useMe().data;
  const { data: homePromptsData } = useHomePrompts();
  const [value, setValue] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const attRef = useRef<Attachment[]>([]);
  attRef.current = attachments;

  const addFiles = (list: FileList | File[]) => {
    const next = Array.from(list).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
      file,
      url: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }));
    setAttachments((a) => [...a, ...next]);
  };
  const removeAttachment = (id: string) =>
    setAttachments((a) => {
      const hit = a.find((x) => x.id === id);
      if (hit?.url) URL.revokeObjectURL(hit.url);
      return a.filter((x) => x.id !== id);
    });
  // Revoke any object URLs on unmount.
  useEffect(() => () => { attRef.current.forEach((a) => a.url && URL.revokeObjectURL(a.url)); }, []);

  // Send the composed prompt. Not wired to a chat backend yet — for now it just
  // resets the composer (the send button appears the moment there's content).
  const handleSend = () => {
    if (!value.trim() && attachments.length === 0) return;
    attachments.forEach((a) => a.url && URL.revokeObjectURL(a.url));
    setAttachments([]);
    setValue("");
    requestAnimationFrame(() => { const el = taRef.current; if (el) { el.style.height = "auto"; el.focus(); } });
  };

  const placeholder = company?.name
    ? t("home.askCompany", { company: company.name, defaultValue: "AI Assistantdan {{company}} haqida so'rang" })
    : t("home.askGeneric", { defaultValue: "AI Assistantdan so'rang" });

  // Rotating headings — swap every 20s; each new phrase slides in letter by
  // letter (the h1 is keyed by index so the animation replays on every change).
  // Superadmin-managed suggestions (3 langs + {variables}) drive the rotating
  // headings when present; otherwise fall back to the built-in i18n phrases.
  const activeItems = (homePromptsData?.prompts ?? []).filter((p) => p.enabled);
  const useBackend = activeItems.length > 0;
  const lng = toPromptLang(i18n.language);
  const promptVars: Record<string, string> = {
    current_company: company?.name ?? "",
    current_user: me?.username ?? "",
    current_date: new Date().toLocaleDateString(),
  };

  const fallbackPhrases = [
    t("home.title", { defaultValue: "Send an invoice to the counterparty?" }),
    t("home.title2", { defaultValue: "Create accounting entries for the transactions?" }),
    t("home.title3", { defaultValue: "Calculate cash flow for the selected period?" }),
    t("home.title4", { defaultValue: "Calculate employee payroll?" }),
    t("home.title5", { defaultValue: "Check for new messages from the tax authorities?" }),
    t("home.title6", { defaultValue: "Show new bank transactions?" }),
  ];
  const fallbackSubtitles = [
    t("home.subtitle", { defaultValue: "AIBA will prepare the document, verify the details, and send it to the counterparty." }),
    t("home.subtitle2", { defaultValue: "AIBA will analyze the transactions and automatically generate the accounting entries." }),
    t("home.subtitle3", { defaultValue: "AIBA will show income, expenses, and the company's net cash flow." }),
    t("home.subtitle4", { defaultValue: "AIBA will calculate salaries, deductions, taxes, and final amounts payable." }),
    t("home.subtitle5", { defaultValue: "AIBA will find new notifications and highlight messages that require your attention." }),
    t("home.subtitle6", { defaultValue: "AIBA will retrieve the latest account transactions and help process them quickly." }),
  ];

  const phrases = useBackend
    ? activeItems.map((p) => applyVars(pickLangText(p.title, lng), promptVars))
    : fallbackPhrases;
  const subtitles = useBackend
    ? activeItems.map((p) => applyVars(pickLangText(p.description, lng), promptVars))
    : fallbackSubtitles;
  const promptTexts = useBackend
    ? activeItems.map((p) => applyVars(pickLangText(p.prompt, lng), promptVars))
    : fallbackPhrases; // fallback: clicking fills with the heading text

  const [phraseIdx, setPhraseIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhraseIdx((i) => (i + 1) % phrases.length), 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phrases.length]);

  // Clamp so a length change (fallback ↔ backend, or a delete) can't over-index.
  const curIdx = phrases.length ? phraseIdx % phrases.length : 0;
  const title = phrases[curIdx] ?? "";
  const subtitle = subtitles[curIdx] ?? subtitles[0] ?? "";
  const promptText = promptTexts[curIdx] ?? title;
  const words = title.split(" ").filter(Boolean);
  const STEP = 28; // ms between letters
  // Subtitle follows the current title's letters; the input animates once.
  const subDelay = title.replace(/\s/g, "").length * STEP + 160;
  const inputDelay = (phrases[0] ?? "").replace(/\s/g, "").length * STEP + 330;

  // Grow the prompt bar downward as the text wraps (Telegram-style), capped.
  const autoGrow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };

  // Clicking the heading drops that prompt into the input, ready to send.
  const fillPrompt = (text: string) => {
    setValue(text);
    requestAnimationFrame(() => { taRef.current?.focus(); autoGrow(); });
  };

  return (
    <div className="-m-6 relative flex min-h-[calc(100vh-3.25rem)] flex-col items-center justify-center overflow-hidden bg-background px-4">
      <div className="relative z-10 w-full max-w-3xl">
        {/* Heading + subtitle rotate together — ONE keyed wrapper so the
            animation replays on each phrase and there's no duplicate-key
            stacking (h1 and p sharing a key silently broke reconciliation). */}
        <div key={phraseIdx}>
        {/* Heading — serif; letters slide in one after another, z.ai-style.
            Words stay whole (inline-block) so the line still wraps at spaces. */}
        <h1
          className="text-center font-serif text-4xl font-normal tracking-[-0.03em] text-foreground sm:text-[3.5rem] sm:leading-[1.08]"
          style={{ fontFamily: '"Crimson Text", ui-serif, Georgia, Cambria, "Times New Roman", serif' }}
        >
          {/* The heading is clickable: hover shows a soft grey pill, click drops
              the prompt into the input. */}
          <button
            type="button"
            onClick={() => fillPrompt(promptText)}
            aria-label={title}
            className="cursor-pointer rounded-3xl px-5 py-2 -my-1 transition-colors hover:bg-foreground/[0.06] active:bg-foreground/[0.1]"
          >
          {(() => {
            let idx = 0;
            return words.map((word, wi) => (
              <span key={wi}>
                <span className="inline-block whitespace-nowrap">
                  {[...word].map((ch) => (
                    <span
                      key={idx}
                      className="home-char inline-block"
                      style={{ animationDelay: `${idx++ * STEP}ms` }}
                    >
                      {ch}
                    </span>
                  ))}
                </span>
                {wi < words.length - 1 ? " " : null}
              </span>
            ));
          })()}
          </button>
        </h1>
        {/* Subtitle — rotates with the heading (wrapper key re-animates it) */}
        <p
          className="mx-auto mb-9 mt-4 max-w-2xl text-center text-base text-muted-foreground animate-in fade-in-0 slide-in-from-bottom-2 duration-300 [animation-fill-mode:backwards]"
          style={{ animationDelay: `${subDelay}ms` }}
        >
          {subtitle}
        </p>
        </div>

        {/* Prompt bar — grows with the text, focus ring, drag-and-drop files */}
        <div
          onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
          className={cn(
            "rounded-[26px] border bg-card shadow-[0_2px_28px_rgba(0,0,0,0.09)] transition-[border-color,box-shadow] duration-200 focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10 dark:shadow-[0_2px_28px_rgba(0,0,0,0.45)] animate-in fade-in-0 zoom-in-95 slide-in-from-bottom-4 duration-500 [animation-fill-mode:backwards]",
            dragOver ? "border-primary ring-4 ring-primary/15" : "border-border",
          )}
          style={{ animationDelay: `${inputDelay}ms` }}
        >
          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
              {attachments.map((att) => {
                const { Icon, cls } = fileMeta(att.file);
                return (
                  <div key={att.id} className="relative">
                    {att.url ? (
                      <div className="size-14 overflow-hidden rounded-xl border border-border">
                        <img src={att.url} alt={att.file.name} className="size-full object-cover" />
                      </div>
                    ) : (
                      <div className="flex max-w-[220px] items-center gap-2.5 rounded-xl border border-border bg-muted/40 py-2 pl-2 pr-2.5">
                        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4", cls)}>
                          <Icon />
                        </span>
                        <div className="min-w-0">
                          <div className="truncate text-xs font-medium text-foreground">{att.file.name}</div>
                          <div className="text-[11px] uppercase text-muted-foreground">
                            {(att.file.name.split(".").pop() || "file")} · {Math.max(1, Math.round(att.file.size / 1024))} KB
                          </div>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      aria-label="remove attachment"
                      className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Input row — uniform p-3 all round + both edge icons the same size
              and padding-free, so the logo (left) and paperclip (right) have
              identical top/side margins from the pill. */}
          <div className="flex items-center gap-2.5 p-3">
            <AibaLogo className="size-7 shrink-0" />
            <textarea
              ref={taRef}
              rows={1}
              value={value}
              onChange={(e) => { setValue(e.target.value); autoGrow(); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder={placeholder}
              className="max-h-[220px] min-w-0 flex-1 resize-none self-center bg-transparent text-base leading-7 text-foreground outline-none placeholder:text-muted-foreground [scrollbar-width:thin]"
            />
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ""; }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "shrink-0 text-foreground/60 transition-[color,opacity] hover:text-foreground",
                value.trim() ? "opacity-60" : "opacity-100",
              )}
              aria-label="attach file"
            >
              <Paperclip className="size-5 mr-1" />
            </button>
            {/* Telegram-style send: appears (zoom-in) the moment there's content,
                sliding the paperclip left to make room. */}
            {(value.trim() || attachments.length > 0) && (
              <button
                type="button"
                onClick={handleSend}
                aria-label="send"
                className="grid size-7 shrink-0 place-items-center rounded-full bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 animate-in fade-in-0 zoom-in-50 duration-200"
              >
                <ArrowUp className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Temporary link to the old dashboard (for copying content over). */}
      <button
        type="button"
        onClick={() => openTab("/dash-old")}
        className="absolute bottom-4 right-5 z-10 text-xs text-muted-foreground/50 transition-colors hover:text-muted-foreground"
      >
        {t("nav.dashboard", { defaultValue: "Дашборд" })} →
      </button>
    </div>
  );
}
