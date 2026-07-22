// Telegram bridge — message composer, ported from Telegram Web A's Composer.
// The rounded `.composer-wrapper` card (with the `.svg-appendix` tail at its
// bottom-right) holds, left→right: the symbol (emoji/stickers/GIFs) button, the
// auto-growing `#message-input-text` field (Enter sends, Shift+Enter newlines),
// and the attach (paperclip) button; then, OUTSIDE the card on the right, the
// circular `> .Button` that morphs mic (empty) ↔ send arrow (has text/attachment)
// ↔ stop-send (recording).
//
// The text field is now the RICH contentEditable input (message-input.tsx):
// formatting renders LIVE as you type/apply it, and the DOM is serialised to
// `{ text, entities }` at send time. The composer owns everything AROUND it:
//   • SymbolMenu — a tabbed Emoji / Stickers / GIFs popover (symbol-menu.tsx).
//   • TextFormatter — a selection toolbar (Bold/Italic/Underline/Strike/Mono/
//     Spoiler/Link) + Ctrl-/Cmd- shortcuts; each wraps the live SELECTION in
//     real styled DOM (`<b>`, `<span class="spoiler">`, …) via the input handle,
//     so the user SEES the formatting; it serialises to MTProto entities on send.
//   • MentionTooltip — `@`-autocomplete of group members (mention-tooltip.tsx).
//   • AttachMenu — Photo/Video · File (multi-select) · Poll.
//   • CustomSendMenu — right-click / long-press the send button → Send without
//     sound · Schedule.
//   • Paste of an image routes into the attachment preview.
// Above the input the card grows a `.ComposerEmbeddedMessage` strip for the
// active reply / edit / attachment draft (now with sender avatar + media thumb).
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  BellOff,
  Clock,
  CornerUpLeft,
  File as FileIcon,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  tgPeerPhotoUrl,
  tgThumbUrl,
  useEditTgMessage,
  useSendTgMedia,
  useSendTgMessage,
  useSendTgTyping,
  useTgDialogs,
  useTgMembers,
  type TgEntity,
  type TgMember,
  type TgMessage,
} from "./api";
import { ChatAvatar } from "../avatar";
import { fetchTgMediaBlobUrl, useTgMediaSrc } from "./media";
import { TgSymbolMenu } from "./symbol-menu";
import { type TgStickerItem } from "./sticker-picker";
import { type TgGifItem } from "./gif-picker";
import {
  parseMarkdownEntities,
  stripMarkdown,
  TgTextFormatter,
  type FormatKind,
} from "./text-formatter";
import { TgMessageInput, type TgMessageInputHandle } from "./message-input";
import { filterMembers, TgMentionTooltip } from "./mention-tooltip";
import { useTgSettings } from "./settings-store";
import "./tgweb-composer.css";
import "./tgweb-menu.css";

type Attachment = { file: File; previewUrl: string | null; kind: "photo" | "document" };
type MentionState = { query: string; start: number; activeIndex: number };
type FormatterState = { open: boolean; autoLink: boolean };

const kindOf = (f: File): "photo" | "document" =>
  f.type.startsWith("image/") ? "photo" : "document";

// Ctrl/Cmd shortcut key → format kind (B/I/U/M/S/P/K, matching the reference).
const SHORTCUT_FORMAT: Record<string, FormatKind> = {
  b: "bold",
  i: "italic",
  u: "underline",
  m: "mono",
  s: "strike",
  p: "spoiler",
  k: "link",
};

export function TgComposer({
  accountId,
  chatId,
  replyTo,
  editing,
  onCancelReply,
  onCancelEdit,
  onSent,
}: {
  accountId: number;
  chatId: number;
  replyTo?: TgMessage | null;
  editing?: TgMessage | null;
  onCancelReply?: () => void;
  onCancelEdit?: () => void;
  onSent?: () => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const send = useSendTgMessage();
  const sendMedia = useSendTgMedia();
  const editMsg = useEditTgMessage();
  const typing = useSendTgTyping();
  const sendOnEnter = useTgSettings((s) => s.sendOnEnter);

  // Group members drive @-mention autocomplete (only fetched in groups/channels).
  const dialogsQ = useTgDialogs(accountId);
  const dialog = useMemo(
    () => (dialogsQ.data ?? []).find((d) => d.chatId === chatId) ?? null,
    [dialogsQ.data, chatId],
  );
  const isGroup = dialog ? dialog.kind !== "user" : false;
  const membersQ = useTgMembers(accountId, chatId, isGroup);
  const members = membersQ.data?.items ?? [];

  const [text, setText] = useState("");
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [formatter, setFormatter] = useState<FormatterState>({ open: false, autoLink: false });
  const [mention, setMention] = useState<MentionState | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [sendMenuOpen, setSendMenuOpen] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const inputRef = useRef<TgMessageInputHandle | null>(null);
  const symbolWrapRef = useRef<HTMLDivElement | null>(null);
  const attachWrapRef = useRef<HTMLDivElement | null>(null);
  const sendWrapRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastTypingRef = useRef(0);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFiredRef = useRef(false);

  // ── voice recording ─────────────────────────────────────────────────────────
  const [recording, setRecording] = useState(false);
  const [recSeconds, setRecSeconds] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recCancelRef = useRef(false);

  const busy = send.isPending || sendMedia.isPending || editMsg.isPending || working;

  const mentionMembers = useMemo<TgMember[]>(
    () => (mention ? filterMembers(members, mention.query) : []),
    [mention, members],
  );

  // Reply-strip enrichment: the replied sender's avatar + a media thumbnail.
  const replyAvatar = useTgMediaSrc(
    replyTo?.senderId != null ? tgPeerPhotoUrl(accountId, replyTo.senderId) : null,
  );
  const replyThumbUrl =
    replyTo?.media && ["photo", "video", "gif"].includes(replyTo.media.type) && replyTo.media.downloadable !== false
      ? tgThumbUrl(accountId, chatId, replyTo.id)
      : null;
  const replyThumb = useTgMediaSrc(replyThumbUrl);

  // Auto-dismiss the lightweight hint toast.
  useEffect(() => {
    if (!hint) return;
    const id = setTimeout(() => setHint(null), 2500);
    return () => clearTimeout(id);
  }, [hint]);
  const showHint = (m: string) => setHint(m);

  // When an edit target is picked, load its text + entities back in as styled
  // DOM (so the formatting is visible) and focus with the caret at the end.
  useEffect(() => {
    if (editing) {
      setText(editing.text ?? "");
      clearAttachments();
      requestAnimationFrame(() => {
        inputRef.current?.setFormatted(editing.text ?? "", editing.entities ?? null);
        inputRef.current?.focus();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  // Close the attach menu on an outside click / Escape.
  useEffect(() => {
    if (!attachOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!attachWrapRef.current?.contains(e.target as Node)) setAttachOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAttachOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [attachOpen]);

  // Close the send-options menu on an outside click / Escape.
  useEffect(() => {
    if (!sendMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!sendWrapRef.current?.contains(e.target as Node)) setSendMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSendMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [sendMenuOpen]);

  // Close the format toolbar / mention tooltip on an outside click or Escape.
  // (Focus moving INTO the toolbar's link field must NOT close it, so this is a
  // document listener keyed to "is the click inside a pop or the input area?" —
  // not an input blur, which would fire when the link field takes focus.)
  const overlayOpen = formatter.open || mention !== null;
  useEffect(() => {
    if (!overlayOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.closest(".tg-formatter-pop") || t.closest(".tg-mention-pop") || t.closest("#message-input-text"))) return;
      setFormatter((f) => (f.open ? { open: false, autoLink: false } : f));
      setMention(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFormatter((f) => (f.open ? { open: false, autoLink: false } : f));
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [overlayOpen]);

  // Telegram clears typing ~5s after the last signal; re-emit at most every ~4s.
  const pingTyping = () => {
    const now = Date.now();
    if (now - lastTypingRef.current < 4000) return;
    lastTypingRef.current = now;
    typing.mutate({ accountId, chatId });
  };

  const hasText = text.trim().length > 0;
  const canSend = hasText || attachments.length > 0;

  const clearAttachments = () => {
    setAttachments((prev) => {
      for (const a of prev) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      return [];
    });
  };

  const clearAll = () => {
    setText("");
    inputRef.current?.clear();
    clearAttachments();
    setMention(null);
    setFormatter({ open: false, autoLink: false });
    lastTypingRef.current = 0;
  };

  // ── contentEditable plumbing (delegates to the rich input's handle) ──────────
  const insertEmoji = (emoji: string) => inputRef.current?.insertText(emoji);

  /** SymbolMenu backspace: delete the selection, else one char before the caret. */
  const removeSymbol = () => inputRef.current?.deleteBackward();

  /** Toggle a format on the live selection — rendered as real styled DOM. */
  const wrapFormat = (kind: FormatKind, url?: string) => {
    inputRef.current?.applyFormat(kind, url);
    if (kind === "link") setFormatter({ open: false, autoLink: false });
  };

  /** Serialise the input for sending — falls back to the markdown parser if the
   *  rich-input handle is somehow unavailable, so send never breaks. */
  const getOutgoing = (): { text: string; entities: TgEntity[] } => {
    const handle = inputRef.current;
    if (handle) return handle.getFormatted();
    return parseMarkdownEntities(text.trim());
  };

  // ── @mention detection ──────────────────────────────────────────────────────
  const detectMention = (value: string, caret: number): MentionState | null => {
    let i = caret - 1;
    while (i >= 0) {
      const ch = value[i];
      if (ch === "@") {
        const prev = i > 0 ? value[i - 1] : " ";
        if (i === 0 || /\s/.test(prev)) {
          const token = value.slice(i + 1, caret);
          if (/^[a-zA-Z0-9_]*$/.test(token)) return { query: token, start: i, activeIndex: 0 };
        }
        return null;
      }
      if (/\s/.test(ch)) return null;
      i -= 1;
    }
    return null;
  };

  const selectMention = (member: TgMember) => {
    if (!mention) return;
    const insert = (member.username ? `@${member.username}` : member.name) + " ";
    // Replace the "@query" (query.length + the "@") immediately before the caret.
    inputRef.current?.replaceBeforeCaret(mention.query.length + 1, insert);
    setMention(null);
  };

  // Fires on every content change from the rich input (already-plain text).
  const handleUpdate = (value: string) => {
    setText(value);
    if (value.trim().length > 0 && !editing) pingTyping();
    const caret = inputRef.current?.getCaretOffset() ?? value.length;
    setMention(isGroup ? detectMention(value, caret) : null);
  };

  // Selection changed inside the input → show the format toolbar while a
  // non-empty selection exists (and no @mention tooltip is up).
  const handleSelectionChange = () => {
    const has = inputRef.current?.hasSelection() ?? false;
    setFormatter((f) => {
      if (has && !mention) return f.open ? f : { open: true, autoLink: false };
      return f.open ? { open: false, autoLink: false } : f;
    });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // IME guard: never treat an in-progress composition Enter/Tab as a command.
    const composing = e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229;

    // 1) mention navigation
    if (mention && mentionMembers.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMention((m) => (m ? { ...m, activeIndex: (m.activeIndex + 1) % mentionMembers.length } : m));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMention((m) =>
          m ? { ...m, activeIndex: (m.activeIndex - 1 + mentionMembers.length) % mentionMembers.length } : m,
        );
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && !composing) {
        e.preventDefault();
        selectMention(mentionMembers[mention.activeIndex] ?? mentionMembers[0]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMention(null);
        return;
      }
    }

    // 2) formatting shortcuts (only with an active selection)
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const kind = SHORTCUT_FORMAT[e.key.toLowerCase()];
      if (kind && inputRef.current?.hasSelection()) {
        e.preventDefault();
        if (kind === "link") setFormatter({ open: true, autoLink: true });
        else wrapFormat(kind);
        return;
      }
    }

    // 3) escape closes the formatter, then the reply/edit draft
    if (e.key === "Escape") {
      if (formatter.open) {
        e.preventDefault();
        setFormatter({ open: false, autoLink: false });
        return;
      }
      if (replyTo || editing) {
        e.preventDefault();
        if (editing) {
          clearAll();
          onCancelEdit?.();
        } else onCancelReply?.();
        return;
      }
    }

    // 4) Enter to send (Shift+Enter always inserts a newline; respect sendOnEnter)
    if (e.key !== "Enter" || composing) return;
    const wantSend = sendOnEnter ? !e.shiftKey : e.ctrlKey || e.metaKey;
    if (wantSend) {
      e.preventDefault();
      submit();
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const data = e.clipboardData;
    if (!data) return;
    const imgs: File[] = [];
    for (let i = 0; i < data.items.length; i++) {
      const it = data.items[i];
      if (it.kind === "file" && it.type.startsWith("image/")) {
        const f = it.getAsFile();
        if (f) imgs.push(f);
      }
    }
    if (imgs.length > 0) {
      e.preventDefault();
      addFiles(imgs);
      return;
    }
    // Plain-text paste only — never inject foreign rich HTML into the input.
    // Any markdown markers in the pasted text still convert to entities at send.
    const txt = data.getData("text/plain");
    if (txt) {
      e.preventDefault();
      inputRef.current?.insertText(txt);
    }
  };

  // ── attachments (multi-file) ────────────────────────────────────────────────
  const addFiles = (files: File[]) => {
    if (files.length === 0) return;
    setAttachments((prev) => [
      ...prev,
      ...files.map((file) => ({
        file,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
        kind: kindOf(file),
      })),
    ]);
    setAttachOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => {
      const target = prev[index];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  };

  const onPhotoChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  };
  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files));
    e.target.value = "";
  };

  // ── sticker / gif send (via the existing media path) ────────────────────────
  const sendMediaFromUrl = async (url: string | null | undefined, name: string) => {
    setSymbolOpen(false);
    if (!url) {
      showHint(tr("soon", "Tez orada"));
      return;
    }
    try {
      const objUrl = await fetchTgMediaBlobUrl(url);
      const blob = await (await fetch(objUrl)).blob();
      const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
      await sendMedia.mutateAsync({
        accountId,
        chatId,
        file,
        kind: "document",
        replyTo: replyTo?.id ?? null,
      });
      onSent?.();
    } catch {
      showHint(tr("genericError", "Xatolik yuz berdi"));
    }
  };
  const onStickerSelect = (item: TgStickerItem) => void sendMediaFromUrl(item.url, `sticker-${item.id}.webp`);
  const onGifSelect = (item: TgGifItem) => void sendMediaFromUrl(item.url, `gif-${item.id}.mp4`);

  // ── send ────────────────────────────────────────────────────────────────────
  const submitMedia = async (caption: string, silent?: boolean) => {
    if (working) return;
    setWorking(true);
    const files = attachments;
    try {
      for (let i = 0; i < files.length; i++) {
        await sendMedia.mutateAsync({
          accountId,
          chatId,
          file: files[i].file,
          text: i === 0 && caption ? caption : undefined,
          replyTo: i === 0 ? replyTo?.id ?? null : null,
          kind: files[i].kind,
          silent,
        });
      }
      clearAll();
      onSent?.();
    } catch {
      showHint(tr("genericError", "Xatolik yuz berdi"));
    } finally {
      setWorking(false);
    }
  };

  const submit = (opts?: { silent?: boolean }) => {
    if (busy) return;
    // Serialise the live contentEditable DOM → clean text + real entities.
    const { text: outText, entities } = getOutgoing();

    // Edit mode: commit the new text (+ entities) to the message.
    if (editing) {
      if (!outText) return;
      editMsg.mutate(
        { accountId, chatId, msgId: editing.id, text: outText, entities: entities.length ? entities : null },
        { onSuccess: () => { clearAll(); onCancelEdit?.(); onSent?.(); } },
      );
      return;
    }

    // Media mode: upload each attachment; caption (plain text) + reply ride on
    // the first. (The media endpoint carries a text caption, not entities.)
    if (attachments.length > 0) {
      void submitMedia(outText, opts?.silent);
      return;
    }

    // Text mode: send the serialised text + entities.
    if (!outText) return;
    send.mutate(
      {
        accountId,
        chatId,
        text: outText,
        replyTo: replyTo?.id ?? null,
        entities: entities.length ? entities : null,
        silent: opts?.silent,
      },
      { onSuccess: () => { clearAll(); onSent?.(); } },
    );
  };

  // ── voice ─────────────────────────────────────────────────────────────────
  const stopTimer = () => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
  };

  const startRecording = async () => {
    if (recording || busy) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")
          ? "audio/ogg;codecs=opus"
          : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorderRef.current = rec;
      recChunksRef.current = [];
      recCancelRef.current = false;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) recChunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((tk) => tk.stop());
        stopTimer();
        setRecording(false);
        const cancelled = recCancelRef.current;
        const chunks = recChunksRef.current;
        recChunksRef.current = [];
        if (cancelled || chunks.length === 0) return;
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const ext = (rec.mimeType || "").includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: blob.type });
        sendMedia.mutate(
          { accountId, chatId, file, replyTo: replyTo?.id ?? null, kind: "voice" },
          { onSuccess: () => onSent?.() },
        );
      };
      rec.start();
      setRecording(true);
      setRecSeconds(0);
      recTimerRef.current = setInterval(() => setRecSeconds((s) => s + 1), 1000);
    } catch {
      // Mic permission denied / unavailable — silently ignore.
    }
  };

  const finishRecording = (cancel: boolean) => {
    recCancelRef.current = cancel;
    recorderRef.current?.stop();
  };

  useEffect(() => () => stopTimer(), []);

  const cancelStrip = () => {
    if (editing) {
      clearAll();
      onCancelEdit?.();
    } else if (attachments.length > 0) {
      clearAttachments();
    } else onCancelReply?.();
  };

  // ── send button: long-press / right-click opens the send-options menu ───────
  const clearPress = () => {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };
  const onSendPointerDown = () => {
    if (recording || !(canSend || editing)) return;
    longFiredRef.current = false;
    pressTimerRef.current = setTimeout(() => {
      longFiredRef.current = true;
      setSendMenuOpen(true);
    }, 500);
  };
  const onSendClick = () => {
    if (longFiredRef.current) {
      longFiredRef.current = false;
      return;
    }
    if (recording) finishRecording(false);
    else if (canSend || editing) submit();
    else void startRecording();
  };

  const editStripPreview = editing?.text ? stripMarkdown(editing.text) : tr("mediaCaption", "Media");
  const firstAttachment = attachments[0] ?? null;

  // main round button: mic (idle) ↔ send arrow (has content) ↔ stop-send (recording)
  const mainState = recording ? "recording" : canSend || editing ? "send" : "record";
  const showStrip = (replyTo || editing || attachments.length > 0) && !recording;

  return (
    <div className="shrink-0 pb-1 pt-1">
      <div className="Composer">
        {/* the rounded input card (+ appendix tail, + strip above the input) */}
        <div className="composer-wrapper">
          {/* the appendix tail — real Telegram Web A `MessageAppendix` shape */}
          <svg className="svg-appendix" width="9" height="20" aria-hidden="true">
            <defs>
              <filter
                x="-50%"
                y="-14.7%"
                width="200%"
                height="141.2%"
                filterUnits="objectBoundingBox"
                id="tgComposerAppendix"
              >
                <feOffset dy="1" in="SourceAlpha" result="shadowOffsetOuter1" />
                <feGaussianBlur stdDeviation="1" in="shadowOffsetOuter1" result="shadowBlurOuter1" />
                <feColorMatrix
                  values="0 0 0 0 0.0621962482 0 0 0 0 0.138574144 0 0 0 0 0.185037364 0 0 0 0.15 0"
                  in="shadowBlurOuter1"
                />
              </filter>
            </defs>
            <g fill="none" fillRule="evenodd">
              <path
                d="M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z"
                fill="#000"
                filter="url(#tgComposerAppendix)"
              />
              <path
                d="M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z"
                fill="#FFF"
                className="corner"
              />
            </g>
          </svg>

          {/* draft context strip (reply / edit / attachment) */}
          {showStrip && (
            <div className="ComposerEmbeddedMessage">
              <div className="ComposerEmbeddedMessage_inner">
                <div className="embedded-left-icon">
                  {editing ? (
                    <Pencil className="size-6" />
                  ) : attachments.length > 0 ? (
                    firstAttachment?.kind === "photo" ? <ImageIcon className="size-6" /> : <FileIcon className="size-6" />
                  ) : (
                    <CornerUpLeft className="size-6" />
                  )}
                </div>

                {/* attachments: a horizontal thumb/chip row (multi-file) */}
                {attachments.length > 0 ? (
                  <div className="embedded-attachments">
                    {attachments.map((a, i) => (
                      <div key={i} className="embedded-attach-item" title={a.file.name}>
                        {a.previewUrl ? (
                          <img src={a.previewUrl} alt="" className="embedded-attach-thumb" />
                        ) : (
                          <span className="embedded-attach-file">
                            <FileIcon className="size-5" />
                          </span>
                        )}
                        <button
                          type="button"
                          className="embedded-attach-remove"
                          aria-label={tr("close", "Yopish")}
                          onClick={() => removeAttachment(i)}
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="embedded-attach-add"
                      aria-label={tr("attachFile", "Fayl")}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Plus className="size-5" />
                    </button>
                  </div>
                ) : (
                  <>
                    {/* reply: sender avatar; edit shows nothing extra here */}
                    {replyTo && !editing && (
                      <span className="embedded-avatar">
                        <ChatAvatar
                          seed={String(replyTo.senderId ?? replyTo.senderName ?? "?")}
                          name={replyTo.senderName ?? ""}
                          src={replyAvatar.failed ? null : replyAvatar.src}
                          size={36}
                        />
                      </span>
                    )}
                    {replyThumb.src && !editing && (
                      <img src={replyThumb.src} alt="" className="embedded-thumb" />
                    )}
                    <div className="EmbeddedMessage">
                      <div className="message-title">
                        {editing
                          ? tr("editing", "Tahrirlash")
                          : replyTo?.out
                            ? tr("you", "Siz")
                            : replyTo?.senderName || tr("reply", "Javob")}
                      </div>
                      <div className="message-text">
                        {editing ? editStripPreview : replyTo?.text || tr("media", "Media")}
                      </div>
                    </div>
                  </>
                )}

                <button type="button" onClick={cancelStrip} aria-label={tr("close", "Yopish")} className="embedded-cancel">
                  <X className="size-5" />
                </button>
              </div>
            </div>
          )}

          {/* input row */}
          <div className="message-input-wrapper">
            {recording ? (
              <span className="recording-state">
                {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, "0")}
              </span>
            ) : (
              <>
                {/* symbol (emoji / stickers / GIFs) button — LEFT */}
                <div ref={symbolWrapRef} className="composer-action-buttons-container">
                  {symbolOpen && (
                    <div className="absolute bottom-full left-0 mb-2 z-30">
                      <TgSymbolMenu
                        accountId={accountId}
                        wrapRef={symbolWrapRef}
                        onEmojiSelect={insertEmoji}
                        onStickerSelect={onStickerSelect}
                        onGifSelect={onGifSelect}
                        onRemoveSymbol={removeSymbol}
                        onClose={() => setSymbolOpen(false)}
                        tr={tr}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setSymbolOpen((v) => !v)}
                    title={tr("emoji", "Emoji")}
                    aria-label={tr("emoji", "Emoji")}
                    aria-expanded={symbolOpen}
                    className={cn("composer-action-button symbol-menu-button", symbolOpen && "activated")}
                  >
                    <Smile className="size-6" />
                  </button>
                </div>

                {/* the text field */}
                <div id="message-input-text">
                  {/* format toolbar — floats above the input while text is selected */}
                  {formatter.open && (
                    <div className="tg-formatter-pop">
                      <TgTextFormatter
                        autoLink={formatter.autoLink}
                        onFormat={wrapFormat}
                        onClose={() => setFormatter({ open: false, autoLink: false })}
                        tr={tr}
                      />
                    </div>
                  )}

                  {/* @mention autocomplete — floats above the input in groups */}
                  {mention && mentionMembers.length > 0 && (
                    <div className="tg-mention-pop">
                      <TgMentionTooltip
                        accountId={accountId}
                        members={mentionMembers}
                        activeIndex={mention.activeIndex}
                        onSelect={selectMention}
                        onHover={(i) => setMention((m) => (m ? { ...m, activeIndex: i } : m))}
                      />
                    </div>
                  )}

                  <TgMessageInput
                    ref={inputRef}
                    accountId={accountId}
                    placeholder={editing ? tr("editMessage", "Xabarni tahrirlash") : tr("message", "Xabar")}
                    onUpdate={handleUpdate}
                    onKeyDown={onKeyDown}
                    onPaste={onPaste}
                    onSelectionChange={handleSelectionChange}
                  />
                </div>

                {/* attach (paperclip) button — RIGHT. Opens the AttachMenu upward. */}
                <div ref={attachWrapRef} className="composer-action-buttons-container">
                  {attachOpen && (
                    <div
                      role="menu"
                      aria-label={tr("attach", "Biriktirish")}
                      className="Menu compact fluid AttachMenu--menu absolute bottom-full right-0 mb-2 z-30"
                    >
                      <div className="bubble">
                        <button
                          type="button"
                          role="menuitem"
                          className="MenuItem compact"
                          onClick={() => photoInputRef.current?.click()}
                        >
                          <ImageIcon className="icon" />
                          {tr("attachPhoto", "Rasm yoki video")}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="MenuItem compact"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <FileIcon className="icon" />
                          {tr("attachFile", "Fayl")}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="MenuItem compact"
                          onClick={() => {
                            setAttachOpen(false);
                            setPollOpen(true);
                          }}
                        >
                          <BarChart3 className="icon" />
                          {tr("poll", "So'rovnoma")}
                        </button>
                      </div>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setAttachOpen((v) => !v)}
                    aria-label={tr("attach", "Biriktirish")}
                    title={tr("attach", "Biriktirish")}
                    className={cn("composer-action-button", attachOpen && "activated")}
                  >
                    <Paperclip className="size-6" />
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={onPhotoChosen}
                  />
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileChosen} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* record-cancel (trash) — appears only while recording */}
        {recording && (
          <button
            type="button"
            onClick={() => finishRecording(true)}
            aria-label={tr("cancel", "Bekor qilish")}
            title={tr("cancel", "Bekor qilish")}
            className="Button cancel"
          >
            <Trash2 className="size-5" />
          </button>
        )}

        {/* the outside circular send / mic / stop button (+ send-options menu) */}
        <div ref={sendWrapRef} className="tg-send-wrap">
          {sendMenuOpen && (
            <div role="menu" aria-label={tr("sendOptions", "Yuborish sozlamalari")} className="Menu compact fluid tg-send-menu">
              <div className="bubble">
                <button
                  type="button"
                  role="menuitem"
                  className="MenuItem compact"
                  onClick={() => {
                    setSendMenuOpen(false);
                    submit({ silent: true });
                  }}
                >
                  <BellOff className="icon" />
                  {tr("sendSilent", "Ovozsiz yuborish")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="MenuItem compact"
                  onClick={() => {
                    setSendMenuOpen(false);
                    showHint(tr("soon", "Tez orada"));
                  }}
                >
                  <Clock className="icon" />
                  {tr("schedule", "Rejalashtirish")}
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onSendClick}
            onPointerDown={onSendPointerDown}
            onPointerUp={clearPress}
            onPointerLeave={clearPress}
            onContextMenu={(e) => {
              if (recording || !(canSend || editing)) return;
              e.preventDefault();
              setSendMenuOpen(true);
            }}
            disabled={busy}
            title={recording ? tr("stopSend", "To'xtatib yuborish") : canSend ? tr("send", "Yuborish") : tr("record", "Ovozli xabar")}
            aria-label={recording ? tr("stopSend", "To'xtatib yuborish") : canSend ? tr("send", "Yuborish") : tr("record", "Ovozli xabar")}
            className={cn("Button main-button", mainState)}
          >
            {busy ? (
              <Loader2 className="size-6 animate-spin" />
            ) : mainState === "record" ? (
              <Mic className="size-6" />
            ) : (
              <Send className="size-6 -translate-x-px" />
            )}
          </button>
        </div>
      </div>

      {/* poll create modal */}
      {pollOpen && (
        <PollModal
          tr={tr}
          onClose={() => setPollOpen(false)}
          onSubmit={() => {
            setPollOpen(false);
            showHint(tr("soon", "Tez orada"));
          }}
        />
      )}

      {/* lightweight hint toast (coming-soon / errors) */}
      {hint && <div className="tg-composer-hint">{hint}</div>}
    </div>
  );
}

// ── poll create modal (simple; sends via a coming-soon toast until the backend
//    ships a send-poll path) ──────────────────────────────────────────────────
function PollModal({
  tr,
  onClose,
  onSubmit,
}: {
  tr: (k: string, d: string) => string;
  onClose: () => void;
  onSubmit: (poll: { question: string; options: string[] }) => void;
}) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);

  const setOption = (i: number, v: string) =>
    setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));
  const addOption = () => setOptions((prev) => (prev.length >= 10 ? prev : [...prev, ""]));
  const removeOption = (i: number) =>
    setOptions((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));

  const filled = options.map((o) => o.trim()).filter(Boolean);
  const canCreate = question.trim().length > 0 && filled.length >= 2;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="tg-poll-overlay" onMouseDown={onClose}>
      <div className="tg-poll-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="tg-poll-header">
          <button type="button" className="tg-poll-x" aria-label={tr("close", "Yopish")} onClick={onClose}>
            <X className="size-5" />
          </button>
          <h3>{tr("newPoll", "Yangi so'rovnoma")}</h3>
        </div>

        <label className="tg-poll-label">{tr("pollQuestion", "Savol")}</label>
        <input
          className="tg-poll-input"
          value={question}
          maxLength={255}
          autoFocus
          placeholder={tr("pollQuestionPh", "Savolni kiriting")}
          onChange={(e) => setQuestion(e.target.value)}
        />

        <label className="tg-poll-label">{tr("pollOptions", "Javob variantlari")}</label>
        {options.map((o, i) => (
          <div key={i} className="tg-poll-option">
            <input
              className="tg-poll-input"
              value={o}
              maxLength={100}
              placeholder={tr("pollOptionPh", "Variant")}
              onChange={(e) => setOption(i, e.target.value)}
            />
            {options.length > 2 && (
              <button
                type="button"
                className="tg-poll-remove"
                aria-label={tr("close", "Yopish")}
                onClick={() => removeOption(i)}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ))}
        {options.length < 10 && (
          <button type="button" className="tg-poll-add" onClick={addOption}>
            <Plus className="size-4" />
            {tr("pollAddOption", "Variant qo'shish")}
          </button>
        )}

        <button
          type="button"
          className="tg-poll-create"
          disabled={!canCreate}
          onClick={() => onSubmit({ question: question.trim(), options: filled })}
        >
          {tr("pollCreate", "Yaratish")}
        </button>
      </div>
    </div>
  );
}
