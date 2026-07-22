// Message composer — re-skinned 1:1 to Telegram Web A's Composer (the "A"
// client) using the ported `tg/tgweb-composer.css`. The rounded
// `.composer-wrapper` card (with the `.svg-appendix` tail at its bottom-right)
// holds, left→right: the emoji button, the auto-growing `#message-input-text`
// field (Enter=send / Shift+Enter=newline), and the attach (paperclip) button;
// then, OUTSIDE the card on the right, the circular `> .Button` that morphs mic
// (empty) ↔ send arrow (has text / editing) ↔ send-arrow (recording). The whole
// thing sits in the width-capped, centered `.Composer` footer.
//
// Above the input the card grows a `.ComposerEmbeddedMessage` strip for the
// active reply/edit draft context. While recording, the input row is replaced
// by a `.recording-state` timer (blinking red dot) and a `.cancel` trash button
// flanks the card next to the round send button.
//
// This is a VISUAL re-skin only — every feature, hook, handler and the exact
// send routing are preserved from the previous implementation.
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CornerUpLeft,
  File as FileIcon,
  Image as ImageIcon,
  Loader2,
  Mic,
  Paperclip,
  Pencil,
  Send,
  Smile,
  Trash2,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/shared/lib/utils";
import {
  fmtDuration,
  uid,
  uploadFile,
  useEditMessage,
  useSendMessage,
  type Message,
  type MessageKind,
} from "./api";
import { EMOJI_CATEGORIES } from "./emoji";
import { previewText } from "./message-bubble";
import { startVoiceRecording, voiceExt, type VoiceRecorder } from "./voice";
import "./tg/tgweb-composer.css";

export function Composer({
  chatId,
  replyTo,
  onCancelReply,
  editing,
  onCancelEdit,
  onTyping,
  onSent,
}: {
  chatId: string;
  replyTo: Message | null;
  onCancelReply: () => void;
  editing: Message | null;
  onCancelEdit: () => void;
  onTyping: () => void;
  onSent: () => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.${k}`, { defaultValue: d });

  const send = useSendMessage(chatId);
  const edit = useEditMessage(chatId);

  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const imageRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);

  // voice recording state
  const recRef = useRef<VoiceRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [recSec, setRecSec] = useState(0);

  // Seed the box when entering edit mode; clear when leaving.
  const editId = editing?.id ?? null;
  const seededRef = useRef<string | null>(null);
  useEffect(() => {
    if (editId && seededRef.current !== editId) {
      seededRef.current = editId;
      setText(editing?.body ?? "");
      taRef.current?.focus();
    } else if (!editId && seededRef.current) {
      seededRef.current = null;
      setText("");
    }
  }, [editId, editing?.body]);

  useEffect(() => {
    if (replyTo) taRef.current?.focus();
  }, [replyTo]);

  // Autosize — one line sits at --base-height (3rem, via CSS min-height); grows
  // from there and the CSS max-height (26rem) caps it with scroll.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    if (el.value.length > 0) el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setRecSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);

  // Drop transient state when switching chats.
  useEffect(() => {
    setText("");
    recRef.current?.cancel();
    recRef.current = null;
    setRecording(false);
    setRecSec(0);
  }, [chatId]);

  // Insert text at the caret (emoji picker) and keep the caret after it.
  const insertAtCursor = (ins: string) => {
    const ta = taRef.current;
    if (!ta) {
      setText((v) => v + ins);
      return;
    }
    const start = ta.selectionStart ?? text.length;
    const end = ta.selectionEnd ?? text.length;
    const next = text.slice(0, start) + ins + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.focus();
      const caret = start + ins.length;
      ta.setSelectionRange(caret, caret);
    });
  };

  const submitText = async () => {
    const body = text.trim();
    if (!body) return;
    if (editing) {
      await edit.mutateAsync({ id: editing.id, body });
      onCancelEdit();
      setText("");
      return;
    }
    setText("");
    const replyId = replyTo?.id;
    onCancelReply();
    await send.mutateAsync({ id: uid(), kind: "text", body, ...(replyId ? { replyTo: replyId } : {}) });
    onSent();
  };

  const sendFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const mime = file.type || "application/octet-stream";
        const up = await uploadFile(chatId, file, file.name, mime);
        const kind: MessageKind = mime.startsWith("image/") ? "image" : "file";
        const replyId = replyTo?.id;
        onCancelReply();
        await send.mutateAsync({
          id: uid(),
          kind,
          body: "",
          attachment: up,
          ...(replyId ? { replyTo: replyId } : {}),
        });
      }
      onSent();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (imageRef.current) imageRef.current.value = "";
    }
  };

  const startRec = async () => {
    try {
      recRef.current = await startVoiceRecording();
      setRecSec(0);
      setRecording(true);
    } catch {
      recRef.current = null;
    }
  };

  const cancelRec = () => {
    recRef.current?.cancel();
    recRef.current = null;
    setRecording(false);
    setRecSec(0);
  };

  const finishRec = async () => {
    const rec = recRef.current;
    if (!rec) return;
    recRef.current = null;
    setRecording(false);
    setUploading(true);
    try {
      const { blob, duration } = await rec.stop();
      if (blob.size === 0) return;
      const mime = rec.mime;
      const up = await uploadFile(chatId, blob, `voice-${Date.now()}.${voiceExt(mime)}`, mime);
      await send.mutateAsync({ id: uid(), kind: "voice", body: "", attachment: { ...up, duration } });
      onSent();
    } finally {
      setUploading(false);
      setRecSec(0);
    }
  };

  const busy = send.isPending || edit.isPending;
  const hasText = text.trim().length > 0;

  // main round button: mic (idle) ↔ send arrow (has text / editing) ↔ send-arrow (recording)
  const mainState = recording ? "recording" : hasText || editing ? "send" : "record";
  const mainDisabled =
    mainState === "record" ? uploading : mainState === "send" ? busy || !hasText : false;
  const onMainClick = recording
    ? () => void finishRec()
    : hasText || editing
      ? () => void submitText()
      : () => void startRec();

  return (
    <div className="shrink-0 pb-3 pt-1">
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
                id="internalComposerAppendix"
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
                filter="url(#internalComposerAppendix)"
              />
              <path
                d="M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z"
                fill="#FFF"
                className="corner"
              />
            </g>
          </svg>

          {/* draft context strip (reply / edit) */}
          {(replyTo || editing) && !recording && (
            <div className="ComposerEmbeddedMessage">
              <div className="ComposerEmbeddedMessage_inner">
                <div className="embedded-left-icon">
                  {editing ? <Pencil className="size-6" /> : <CornerUpLeft className="size-6" />}
                </div>
                <div className="EmbeddedMessage">
                  <div className="message-title">
                    {editing ? tr("editing", "Tahrirlash") : (replyTo?.senderName ?? "")}
                  </div>
                  <div className="message-text">
                    {editing ? (editing.body ?? "") : replyTo ? previewText(replyTo, tr) : ""}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={editing ? onCancelEdit : onCancelReply}
                  aria-label={tr("cancel", "Bekor qilish")}
                  className="embedded-cancel"
                >
                  <X className="size-5" />
                </button>
              </div>
            </div>
          )}

          {/* input row */}
          <div className="message-input-wrapper">
            {recording ? (
              <span className="recording-state">{fmtDuration(recSec)}</span>
            ) : (
              <>
                {/* emoji button — LEFT */}
                <div className="composer-action-buttons-container">
                  <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        title="Emoji"
                        aria-label="Emoji"
                        aria-expanded={emojiOpen}
                        className={cn("composer-action-button symbol-menu-button", emojiOpen && "activated")}
                      >
                        <Smile className="size-6" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" side="top" className="w-[22rem] max-w-[92vw] p-0">
                      <div className="max-h-[24rem] overflow-y-auto p-2">
                        {EMOJI_CATEGORIES.map((cat) => (
                          <div key={cat.key} className="mb-2 last:mb-0">
                            <div className="sticky top-0 z-10 bg-popover/80 px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
                              {tr(cat.key, cat.label)}
                            </div>
                            <div className="grid grid-cols-8 gap-0.5">
                              {cat.emojis.map((e, i) => (
                                <button
                                  key={`${cat.key}-${i}`}
                                  type="button"
                                  className="rounded-md p-1 text-xl hover:bg-muted"
                                  onClick={() => insertAtCursor(e)}
                                >
                                  {e}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* the text field */}
                <div id="message-input-text">
                  <textarea
                    ref={taRef}
                    value={text}
                    rows={1}
                    onChange={(e) => {
                      setText(e.target.value);
                      onTyping();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void submitText();
                      }
                      if (e.key === "Escape" && (editing || replyTo)) {
                        editing ? onCancelEdit() : onCancelReply();
                      }
                    }}
                    placeholder={tr("message", "Xabar")}
                    className="form-control"
                  />
                </div>

                {/* attach (paperclip) button — RIGHT */}
                <div className="composer-action-buttons-container">
                  <Popover open={attachOpen} onOpenChange={setAttachOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        disabled={uploading}
                        aria-label={tr("attach", "Fayl biriktirish")}
                        title={tr("attach", "Fayl biriktirish")}
                        className={cn("composer-action-button", attachOpen && "activated")}
                      >
                        {uploading ? (
                          <Loader2 className="size-6 animate-spin" />
                        ) : (
                          <Paperclip className="size-6" />
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" side="top" className="w-44 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAttachOpen(false);
                          imageRef.current?.click();
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-foreground/[0.06]"
                      >
                        <ImageIcon className="size-[18px] text-[#3390ec]" />
                        {tr("attachPhoto", "Rasm")}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAttachOpen(false);
                          fileRef.current?.click();
                        }}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-foreground/[0.06]"
                      >
                        <FileIcon className="size-[18px] text-[#3390ec]" />
                        {tr("attachFile", "Fayl")}
                      </button>
                    </PopoverContent>
                  </Popover>

                  {/* hidden file inputs (attach menu targets) */}
                  <input
                    ref={imageRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => void sendFiles(e.target.files)}
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => void sendFiles(e.target.files)}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* record-cancel (trash) — appears only while recording */}
        {recording && (
          <button
            type="button"
            onClick={cancelRec}
            aria-label={tr("cancel", "Bekor qilish")}
            title={tr("cancel", "Bekor qilish")}
            className="Button cancel"
          >
            <Trash2 className="size-5" />
          </button>
        )}

        {/* the outside circular send / mic / stop button */}
        <button
          type="button"
          onClick={onMainClick}
          disabled={mainDisabled}
          title={
            recording
              ? tr("send", "Yuborish")
              : hasText || editing
                ? tr("send", "Yuborish")
                : tr("voice", "Ovozli xabar")
          }
          aria-label={
            recording
              ? tr("send", "Yuborish")
              : hasText || editing
                ? tr("send", "Yuborish")
                : tr("voice", "Ovozli xabar")
          }
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
  );
}
