// One message bubble — re-skinned 1:1 to the real Telegram Web A `Message`.
//
// The bubble DOM + class names now mirror the reference component element-for-
// element (`.Message[.own][.first-in-group][.last-in-group]` →
// `.message-content-wrapper` → `.message-content.has-solid-background[.has-appendix]`
// → `.message-title` / reply quote / media / `.text-content` + `.MessageMeta` /
// `.svg-appendix`, with a sibling `.Reactions`), styled by the already-ported
// `tgweb-message.css`. Colours come from the `--color-*` theme tokens on the
// surrounding `.tg-surface`. This is a VISUAL re-skin only — every feature and
// the data flow are preserved: incoming/outgoing sides, same-sender grouping
// (tail on the last bubble of a run), reply/quote rendering, image/file/voice
// bodies, an interactive reactions row, the edited indicator, read/delivered
// ticks, the deleted-message placeholder, and the right-click / long-press
// context menu with a quick-reaction bar. Attachments resolve through the
// auth'd blob-URL cache (a plain src can't carry the JWT).
import "./tg/tgweb-message.css";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  Check,
  CheckCheck,
  CheckCircle2,
  Copy,
  CornerUpLeft,
  Download,
  File as FileIcon,
  FileText,
  Film,
  Forward,
  Loader2,
  Music,
  Pause,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { TgMediaViewer } from "./tg/media-viewer";
import { cn } from "@/shared/lib/utils";
import {
  decodeWaveform,
  downloadAttachment,
  fmtDuration,
  fmtSize,
  fmtTime,
  pseudoWaveform,
  stickerKindOf,
  useAttachmentSrc,
  type Attachment,
  type Message,
  type Reaction,
} from "./api";
import { ChatAvatar } from "./avatar";
// Rich-content renderers ported for the Telegram surface, reused here so the
// internal messenger reaches near-100% content parity: animated .tgs stickers and
// inline custom emoji / formatting entities. Imported from the sibling `tg/` folder.
import { AnimatedSticker } from "./tg/animated-sticker";
import { renderEntities } from "./tg/entities";

const tkey = "modules.messenger";

/** Quick reactions shown in the bar above the context menu (Telegram order). */
const QUICK_REACTIONS = ["👏", "❤️", "👍", "👎", "🔥", "🥰", "😄"];

// Telegram-style deterministic sender-name colors (readable on white/green
// incoming bubbles). Seeded by username so a person keeps one color.
const SENDER_COLORS = ["#e17076", "#eda86c", "#a695e7", "#7bc862", "#6ec9cb", "#65aadd", "#ee7aae"];
function senderColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  return SENDER_COLORS[h % SENDER_COLORS.length];
}

/** The signature Telegram bubble tail ("appendix") — the exact reference SVG
 *  (MessageAppendix.tsx). The `.corner` path inherits the bubble
 *  `--background-color` via tgweb-message.css so it matches incoming / outgoing
 *  / light / dark automatically; the black path behind it is the soft
 *  drop-shadow. Shown only on the last bubble of a group (the
 *  `.message-content.has-appendix` gate). */
function MessageAppendix({ isOwn }: { isOwn: boolean }) {
  const path = isOwn
    ? "M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 016 17z"
    : "M3 17h6V0c-.193 2.84-.876 5.767-2.05 8.782-.904 2.325-2.446 4.485-4.625 6.48A1 1 0 003 17z";
  return (
    <svg width="9" height="20" className="svg-appendix" aria-hidden>
      <defs>
        <filter
          x="-50%"
          y="-14.7%"
          width="200%"
          height="141.2%"
          filterUnits="objectBoundingBox"
          id="tgMessageAppendixInternal"
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
        <path d={path} fill="#000" filter="url(#tgMessageAppendixInternal)" />
        <path d={path} className="corner" />
      </g>
    </svg>
  );
}

export function MessageBubble({
  msg,
  mine,
  read,
  group,
  lastOfCluster,
  firstOfCluster,
  canDelete,
  replySource,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onJumpTo,
  onForward,
  onStartSelect,
  selectionActive,
  isSelected,
  onToggleSelect,
}: {
  msg: Message;
  mine: boolean;
  /** Outgoing message has been read by the recipient(s) → double blue tick. */
  read?: boolean;
  /** Chat is a group — show sender name + avatar for incoming clusters. */
  group: boolean;
  firstOfCluster: boolean;
  lastOfCluster: boolean;
  /** May the current user delete this message (own message, or admin/owner). */
  canDelete: boolean;
  /** The message this one replies to (when loaded). */
  replySource: Message | null;
  onReply: (m: Message) => void;
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
  onReact: (m: Message, emoji: string) => void;
  onJumpTo: (id: string) => void;
  /** Open the forward dialog for this single message. */
  onForward: (m: Message) => void;
  /** Enter selection mode with this message pre-selected. */
  onStartSelect: (m: Message) => void;
  /** Selection mode is on for the chat — show checkboxes, tap toggles. */
  selectionActive: boolean;
  /** This message is currently selected. */
  isSelected: boolean;
  onToggleSelect: (m: Message) => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`${tkey}.${k}`, { defaultValue: d });

  const time = fmtTime(msg.createdAt);

  // Body kinds. Only an image is edge-to-edge "media" (photo-only → no solid
  // background); voice/file ride a padded solid bubble. A reply quote above an
  // image forces the image back into a solid bubble (the "media with header"
  // Telegram look) so the quote gets its padding.
  // The internal MessageKind has no dedicated "video"/"audio" — both arrive as
  // kind:"file", so split them out by the attachment mime (the composer only
  // ever promotes image/* to kind:"image"; everything else stays "file").
  const attMime = msg.attachment?.mime ?? "";
  // A Telegram-style sticker attachment (.tgs Lottie / animated webm / static
  // webp). The internal model has no kind:"sticker", so a sticker arrives as
  // kind:"file"; detect it (defensively — null for every ordinary attachment) and
  // render it bubble-less via the shared AnimatedSticker instead of a download row.
  const stickerKind = !msg.deleted ? stickerKindOf(msg.attachment) : null;
  const isSticker = !!stickerKind && !!msg.attachment;
  const isImage = msg.kind === "image" && !!msg.attachment && !msg.deleted && !isSticker;
  const isVoice = msg.kind === "voice" && !!msg.attachment && !msg.deleted;
  const isVideo =
    msg.kind === "file" && !!msg.attachment && !msg.deleted && !isSticker && attMime.startsWith("video/");
  const isAudio =
    msg.kind === "file" && !!msg.attachment && !msg.deleted && !isSticker && attMime.startsWith("audio/");
  const isFile =
    msg.kind === "file" && !!msg.attachment && !msg.deleted && !isSticker && !isVideo && !isAudio;
  const isMedia = isImage || isVoice || isFile || isVideo || isAudio || isSticker;
  const hasReply = !!msg.replyTo && !msg.deleted;

  // Photo AND video render edge-to-edge (no solid bubble) when they carry no
  // reply header; a reply forces them into a padded solid bubble.
  // Photo, video AND stickers render edge-to-edge (no solid bubble) when they
  // carry no reply header; a reply forces them into a padded solid bubble.
  const photoOnly = (isImage || isVideo || isSticker) && !hasReply;
  const hasSolid = !photoOnly;

  // Where the meta (time + edited + ticks) goes:
  //   • text / deleted / file-with-caption → floated to the end of `.text-content`
  //   • voice / file-without-caption       → its own right-aligned `.tg-meta-inline`
  //   • image                              → overlaid on the photo (white scrim)
  const showTextContent = msg.deleted || msg.kind === "text" || (isFile && !!msg.body);
  const showInlineMeta = isVoice || isAudio || (isFile && !msg.body);

  // Context-menu anchor (viewport coords) — null when closed. Opened on
  // right-click (desktop) or long-press (mobile); no hover chevron.
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const openMenuAt = (x: number, y: number) => setMenuAt({ x, y });

  // Long-press (~450ms) for touch devices.
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };
  const onTouchStart = (e: React.TouchEvent) => {
    if (msg.deleted) return;
    const tch = e.touches[0];
    if (!tch) return;
    const { clientX, clientY } = tch;
    clearLongPress();
    longPressRef.current = setTimeout(() => openMenuAt(clientX, clientY), 450);
  };

  // Meta inner children — the reference MessageMeta child order (time then a
  // delivery tick). Edited → the "edited" label before the time; ticks colour
  // to `--color-accent-own` via tgweb-message.css.
  const metaInner = (
    <>
      <span className="message-time">
        {msg.editedAt && !msg.deleted ? `${tr("edited", "tahrirlangan")} ` : ""}
        {time}
      </span>
      {mine && !msg.deleted && (
        <span className="MessageOutgoingStatus">
          {read ? (
            <CheckCheck className="size-4" strokeWidth={2.5} />
          ) : (
            <Check className="size-4" strokeWidth={2.5} />
          )}
        </span>
      )}
    </>
  );
  const metaNode = <span className="MessageMeta">{metaInner}</span>;

  const selectable = selectionActive && !msg.deleted;

  return (
    <div
      className={cn(
        "group/msg flex w-full items-end gap-2",
        firstOfCluster ? "mt-2" : "mt-0.5",
        selectable && "cursor-pointer",
      )}
      onClickCapture={
        selectable
          ? (e) => {
              e.stopPropagation();
              e.preventDefault();
              onToggleSelect(msg);
            }
          : undefined
      }
    >
      {/* selection checkbox (selection mode) — pinned to the far left */}
      {selectionActive && (
        <div className="flex w-6 shrink-0 items-center justify-center self-center">
          {!msg.deleted && (
            <span
              className={cn(
                "grid size-[22px] place-items-center rounded-full border-2 transition-colors",
                isSelected
                  ? "border-[#3390ec] bg-[#3390ec] text-white"
                  : "border-muted-foreground/40",
              )}
            >
              {isSelected && <Check className="size-3.5" strokeWidth={3} />}
            </span>
          )}
        </div>
      )}

      <div className={cn("flex min-w-0 flex-1 items-end gap-2", mine ? "justify-end" : "justify-start")}>
        {/* avatar slot for others' messages in groups — rendered once per cluster */}
        {!mine && group && (
          <div className="w-8 shrink-0 self-end">
            {lastOfCluster && (
              <ChatAvatar seed={msg.sender} name={msg.senderName} src={msg.senderAvatar} size={32} />
            )}
          </div>
        )}

        {/* ── the Telegram Web A `.Message` container (bubble + reactions) ── */}
        <div
          className={cn(
            "Message",
            mine && "own",
            firstOfCluster && "first-in-group",
            lastOfCluster && "last-in-group",
          )}
        >
          <div className="message-content-wrapper">
            <div
              onContextMenu={(e) => {
                if (msg.deleted || selectionActive) return;
                e.preventDefault();
                openMenuAt(e.clientX, e.clientY);
              }}
              onTouchStart={selectionActive ? undefined : onTouchStart}
              onTouchEnd={clearLongPress}
              onTouchMove={clearLongPress}
              onTouchCancel={clearLongPress}
              className={cn(
                "message-content",
                hasSolid && "has-solid-background",
                isMedia && "media",
                lastOfCluster && "has-appendix",
              )}
            >
              {/* sender name (groups, incoming, first bubble of the cluster) */}
              {!mine && group && firstOfCluster && !isImage && !isVideo && (
                <div className="message-title" style={{ color: senderColor(msg.sender) }}>
                  <span className="sender-title">{msg.senderName}</span>
                </div>
              )}

              {/* reply quote — jumps to the quoted message on click */}
              {hasReply && (
                <button
                  type="button"
                  onClick={() => onJumpTo(msg.replyTo!)}
                  className="mb-1 mt-0.5 flex w-full items-stretch gap-2 overflow-hidden rounded-md bg-black/[0.06] py-1 pl-2 pr-2 text-left transition-colors hover:bg-black/[0.1] dark:bg-white/[0.08] dark:hover:bg-white/[0.14]"
                >
                  <span className="w-[3px] shrink-0 rounded-full bg-[var(--accent-color)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium leading-tight text-[var(--accent-color)]">
                      {replySource?.senderName ?? tr("message", "Xabar")}
                    </span>
                    <span className="block truncate text-[13px] leading-tight opacity-80">
                      {replySource ? previewText(replySource, tr) : "…"}
                    </span>
                  </span>
                </button>
              )}

              {/* media bodies — the image is edge-to-edge (photo-only) or bled
                  out of the bubble padding via `.media-inner` when a header
                  (reply) sits above it; voice / file are inline. */}
              {isImage &&
                (photoOnly ? (
                  <ImageBody att={msg.attachment!} meta={metaNode} />
                ) : (
                  <div className="media-inner below-header no-footer">
                    <ImageBody att={msg.attachment!} meta={metaNode} />
                  </div>
                ))}
              {isVideo &&
                (photoOnly ? (
                  <VideoBody att={msg.attachment!} meta={metaNode} />
                ) : (
                  <div className="media-inner below-header no-footer">
                    <VideoBody att={msg.attachment!} meta={metaNode} />
                  </div>
                ))}
              {isSticker &&
                (photoOnly ? (
                  <StickerBody att={msg.attachment!} kind={stickerKind!} meta={metaNode} />
                ) : (
                  <div className="media-inner below-header no-footer">
                    <StickerBody att={msg.attachment!} kind={stickerKind!} meta={metaNode} />
                  </div>
                ))}
              {isVoice && <VoiceBody msgId={msg.id} att={msg.attachment!} />}
              {isAudio && <AudioBody att={msg.attachment!} />}
              {isFile && <FileBody att={msg.attachment!} />}

              {/* text / caption / deleted placeholder — meta FLOATED to the end
                  of the last line (the reference `.text-content > .MessageMeta`
                  float trick, in tgweb-message.css). */}
              {showTextContent && (
                <div className="text-content" dir="auto">
                  {msg.deleted ? (
                    <span className="italic opacity-60">{tr("deletedMsg", "Xabar o'chirilgan")}</span>
                  ) : msg.entities && msg.entities.length > 0 ? (
                    // Rich text — render inline formatting + custom emoji through the
                    // shared tg renderer. Taken ONLY when the backend actually sends
                    // entities; a plain message still renders as the raw string, so
                    // nothing changes for ordinary AIBA messages. accountId 0: the
                    // internal surface has no Telegram account, so any customEmoji
                    // entity falls back to its unicode glyph.
                    renderEntities(msg.body, msg.entities, "", tr, 0, `im-${msg.id}`)
                  ) : (
                    msg.body
                  )}
                  {metaNode}
                </div>
              )}

              {/* media-only bodies (voice, uncaptioned file) — meta on a
                  right-aligned inline row beneath the body. */}
              {showInlineMeta && (
                <div className="tg-meta-inline">{metaNode}</div>
              )}

              {/* signature tail on the last bubble of a same-sender group */}
              {lastOfCluster && <MessageAppendix isOwn={mine} />}
            </div>
          </div>

          {/* reactions row (sibling of the bubble, under it) */}
          {!msg.deleted && msg.reactions && msg.reactions.length > 0 && (
            <Reactions reactions={msg.reactions} onReact={(e) => onReact(msg, e)} />
          )}
        </div>
      </div>

      {menuAt && (
        <BubbleMenu
          x={menuAt.x}
          y={menuAt.y}
          mine={mine}
          msg={msg}
          canDelete={canDelete}
          tr={tr}
          onClose={() => setMenuAt(null)}
          onReact={(e) => onReact(msg, e)}
          onReply={() => onReply(msg)}
          onEdit={() => onEdit(msg)}
          onCopy={() => void navigator.clipboard?.writeText(msg.body)}
          onDownload={() => msg.attachment && void downloadAttachment(msg.attachment)}
          onDelete={() => onDelete(msg)}
          onForward={() => onForward(msg)}
          onSelect={() => onStartSelect(msg)}
        />
      )}
    </div>
  );
}

// ── context menu (reaction bar + rows), positioned near the cursor ───────────

function BubbleMenu({
  x,
  y,
  mine,
  msg,
  canDelete,
  tr,
  onClose,
  onReact,
  onReply,
  onEdit,
  onCopy,
  onDownload,
  onDelete,
  onForward,
  onSelect,
}: {
  x: number;
  y: number;
  mine: boolean;
  msg: Message;
  canDelete: boolean;
  tr: (k: string, d: string) => string;
  onClose: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onForward: () => void;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  // Clamp into the viewport before paint.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    let left = mine ? x - width : x;
    let top = y;
    if (left + width + pad > window.innerWidth) left = window.innerWidth - width - pad;
    if (left < pad) left = pad;
    if (top + height + pad > window.innerHeight) top = Math.max(pad, y - height);
    if (top < pad) top = pad;
    setPos({ left, top });
  }, [x, y, mine]);

  // Close on Escape / scroll / resize.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault(); // handled here — don't also close the open chat
      onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => {
    fn();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60]"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={ref}
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn("msg-menu-in absolute w-max", mine ? "origin-top-right" : "origin-top-left")}
      >
        {/* quick reaction bar */}
        <div className="mb-2 flex items-center gap-0.5 rounded-full border border-border bg-popover/90 p-1 shadow-[0_8px_30px_-8px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          {QUICK_REACTIONS.map((e) => {
            const active = (msg.reactions ?? []).some((r) => r.emoji === e && r.mine);
            return (
              <button
                key={e}
                type="button"
                onClick={run(() => onReact(e))}
                className={cn(
                  "grid size-8 place-items-center rounded-full text-lg transition-transform hover:scale-125",
                  active && "bg-[#3390ec]/15",
                )}
              >
                {e}
              </button>
            );
          })}
        </div>

        {/* menu card */}
        <div className="min-w-[188px] overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-[14px] shadow-[0_12px_40px_-8px_rgba(0,0,0,0.4)]">
          <MenuRow icon={CornerUpLeft} label={tr("reply", "Javob berish")} onClick={run(onReply)} />
          {mine && msg.kind === "text" && (
            <MenuRow icon={Pencil} label={tr("edit", "Tahrirlash")} onClick={run(onEdit)} />
          )}
          {msg.body && (
            <MenuRow icon={Copy} label={tr("copy", "Nusxalash")} onClick={run(onCopy)} />
          )}
          {msg.attachment && (
            <MenuRow icon={Download} label={tr("download", "Yuklab olish")} onClick={run(onDownload)} />
          )}
          <MenuRow icon={Forward} label={tr("forward", "Yo'naltirish")} onClick={run(onForward)} />
          <MenuRow icon={CheckCircle2} label={tr("select", "Tanlash")} onClick={run(onSelect)} />
          {canDelete && (
            <MenuRow
              icon={Trash2}
              label={tr("delete", "O'chirish")}
              destructive
              onClick={run(onDelete)}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function MenuRow({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "hover:bg-foreground/[0.06]",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span className="flex-1 truncate">{label}</span>
    </button>
  );
}

// ── reaction chips (ported to the reference `.Reactions` + `.message-reaction`) ─

function Reactions({
  reactions,
  onReact,
}: {
  reactions: Reaction[];
  onReact: (emoji: string) => void;
}) {
  // Track which emojis are new since the last render so only they pop.
  const seenRef = useRef<Set<string>>(new Set());
  const nowSet = new Set(reactions.map((r) => r.emoji));
  const isNew = (e: string) => !seenRef.current.has(e);
  useEffect(() => {
    seenRef.current = nowSet;
  });

  return (
    <div className="Reactions">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          type="button"
          onClick={() => onReact(r.emoji)}
          className={cn("message-reaction", r.mine && "chosen", isNew(r.emoji) && "reaction-pop")}
        >
          <span className="reaction-emoji">{r.emoji}</span>
          {r.count > 0 && <span className="counter tabular-nums">{r.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function previewText(m: Message, tr: (k: string, d: string) => string): string {
  if (m.deleted) return tr("deletedMsg", "Xabar o'chirilgan");
  // A sticker (detected from the attachment) previews as a label, not a filename.
  if (stickerKindOf(m.attachment)) return `🖼 ${tr("sticker", "Stiker")}`;
  switch (m.kind) {
    case "image":
      return `🖼 ${tr("photo", "Rasm")}`;
    case "voice":
      return `🎤 ${tr("voiceMsg", "Ovozli xabar")}`;
    case "file":
      return `📎 ${m.attachment?.name || tr("file", "Fayl")}`;
    default:
      return m.body;
  }
}

// ── image / video / audio ────────────────────────────────────────────────────

/** The time+ticks meta pill overlaid bottom-right on edge-to-edge visual media
 *  (photo / video). The inner `.MessageMeta` is forced static/transparent/white
 *  so it reads over the media regardless of the bubble's own meta styling. */
function MediaMeta({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute bottom-1.5 right-1.5 flex items-center rounded-[10px] bg-black/40 px-1.5 py-0.5 backdrop-blur-sm [&_.MessageMeta]:static [&_.MessageMeta]:h-auto [&_.MessageMeta]:!bg-transparent [&_.MessageMeta]:p-0 [&_.MessageMeta]:!text-white [&_.MessageOutgoingStatus]:!text-white">
      {children}
    </div>
  );
}

// ── sticker (.tgs Lottie / animated webm / static webp) — transparent, no bubble ─

/** A chat sticker. Its bytes resolve through the auth'd blob cache (like every
 *  attachment — a plain src can't carry the JWT), then render via the shared tg
 *  `AnimatedSticker` for a `.tgs` Lottie, an autoplay muted <video> for webm, or a
 *  plain <img> for a static webp — capped to a square box with the time/ticks meta
 *  overlaid bottom-right (the same treatment as a photo). */
function StickerBody({
  att,
  kind,
  meta,
}: {
  att: Attachment;
  kind: "static" | "tgs" | "webm";
  meta: React.ReactNode;
}) {
  const { src, loading } = useAttachmentSrc(att.url);
  const box = 160;
  return (
    <div className="relative overflow-hidden" style={{ width: box, height: box }}>
      {!src ? (
        <div className="grid h-full w-full place-items-center">
          {loading ? (
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          ) : (
            <span className="text-4xl leading-none">🖼️</span>
          )}
        </div>
      ) : kind === "tgs" ? (
        <AnimatedSticker tgsUrl={src} size={box} className="!h-full !w-full" />
      ) : kind === "webm" ? (
        <video src={src} autoPlay loop muted playsInline className="h-full w-full object-contain" />
      ) : (
        <img src={src} alt={att.name} className="h-full w-full object-contain" draggable={false} />
      )}
      <MediaMeta>{meta}</MediaMeta>
    </div>
  );
}

function ImageBody({ att, meta }: { att: Attachment; meta: React.ReactNode }) {
  const { src, loading, failed } = useAttachmentSrc(att.url);
  // Full-screen lightbox (zoom / pan / close / download) — the already-resolved
  // blob `src` is handed straight to the shared viewer.
  const [viewer, setViewer] = useState(false);
  return (
    <div className="relative overflow-hidden rounded-[10px]">
      {loading || failed || !src ? (
        <div className="grid h-48 w-64 max-w-full place-items-center bg-muted">
          {failed ? (
            <FileIcon className="size-6 text-muted-foreground" />
          ) : (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          )}
        </div>
      ) : (
        <img
          src={src}
          alt={att.name}
          className="block max-h-80 min-h-16 min-w-24 max-w-full cursor-zoom-in object-cover"
          onClick={() => setViewer(true)}
          draggable={false}
        />
      )}
      <MediaMeta>{meta}</MediaMeta>
      {viewer && src && (
        <TgMediaViewer src={src} kind="photo" name={att.name} onClose={() => setViewer(false)} />
      )}
    </div>
  );
}

// ── video — poster + ▶, click → inline <video controls> (native full-screen) ──

/** A chat video. The internal media endpoint has no thumbnail, so the bytes are
 *  fetched lazily (only on ▶ — videos can be large) and the poster is a dark
 *  placeholder. Once armed it plays inline with native controls (which include
 *  the browser's own full-screen button). */
function VideoBody({ att, meta }: { att: Attachment; meta: React.ReactNode }) {
  const [playing, setPlaying] = useState(false);
  const { src, loading } = useAttachmentSrc(playing ? att.url : null);

  if (playing) {
    return (
      <div className="relative overflow-hidden rounded-[10px] bg-black">
        {src ? (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            onEnded={() => setPlaying(false)}
            className="block max-h-80 w-full max-w-full object-contain"
          />
        ) : (
          <div className="grid h-48 w-64 max-w-full place-items-center">
            <Loader2 className="size-5 animate-spin text-white/70" />
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="relative block overflow-hidden rounded-[10px] bg-black/80"
    >
      <span className="grid h-48 w-64 max-w-full place-items-center">
        {loading ? (
          <Loader2 className="size-6 animate-spin text-white/60" />
        ) : (
          <Film className="size-10 text-white/40" />
        )}
      </span>
      {/* center play button */}
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-12 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
          <Play className="size-6 translate-x-0.5" fill="currentColor" />
        </span>
      </span>
      {/* duration badge (present only when the backend supplied one) */}
      {att.duration != null && att.duration > 0 && (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium leading-none text-white">
          {fmtDuration(att.duration)}
        </span>
      )}
      <MediaMeta>{meta}</MediaMeta>
    </button>
  );
}

// ── audio (music) — a player row (play/pause, name, seek, times) ──────────────

function AudioBody({ att }: { att: Attachment }) {
  const { src, loading } = useAttachmentSrc(att.url);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [len, setLen] = useState(att.duration ?? 0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a || !src) return;
    if (a.paused) {
      void a.play();
      setPlaying(true);
    } else {
      a.pause();
      setPlaying(false);
    }
  };

  const seekTo = (ratio: number) => {
    const a = audioRef.current;
    if (!a || !len) return;
    a.currentTime = Math.max(0, Math.min(1, ratio)) * len;
    setCur(a.currentTime);
  };

  const pct = len > 0 ? (cur / len) * 100 : 0;

  return (
    <div className="flex w-[260px] min-w-0 max-w-full items-center gap-2.5 py-1">
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            const d = e.currentTarget.duration;
            if (Number.isFinite(d) && d > 0) setLen(d);
          }}
          onEnded={() => {
            setPlaying(false);
            setCur(0);
          }}
        />
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-[#3390ec] text-white"
        aria-label={playing ? "pause" : "play"}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : playing ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="size-4 translate-x-px fill-current" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1 text-[14px] font-medium">
          <Music className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{att.name}</span>
        </div>
        <div
          role="slider"
          aria-label="seek"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - r.left) / r.width);
          }}
          className="mt-1 h-1 cursor-pointer overflow-hidden rounded-full bg-[#3390ec]/20"
        >
          <div className="h-full rounded-full bg-[#3390ec]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-0.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>{fmtDuration(cur)}</span>
          <span>{fmtDuration(len)}</span>
        </div>
      </div>
    </div>
  );
}

// ── voice (real-ish decoded waveform, played portion in blue) ────────────────

const WAVE_BARS = 32;

function VoiceBody({ msgId, att }: { msgId: string; att: Attachment }) {
  const { src, loading } = useAttachmentSrc(att.url);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [elapsed, setElapsed] = useState(0);
  const [bars, setBars] = useState<number[]>(() => pseudoWaveform(msgId, WAVE_BARS));

  // Measured pixel width of the bar track — the played overlay renders a second
  // (clipped) copy of the bars at this exact width so both rows stay aligned.
  const barsRef = useRef<HTMLDivElement | null>(null);
  const [trackW, setTrackW] = useState(0);
  useLayoutEffect(() => {
    const el = barsRef.current;
    if (!el) return;
    setTrackW(el.clientWidth);
    const ro = new ResizeObserver(() => setTrackW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dur = () => {
    const a = audioRef.current;
    const d = a && Number.isFinite(a.duration) && a.duration > 0 ? a.duration : (att.duration ?? 0);
    return d;
  };

  // Decode the real waveform once the blob URL resolves (fallback: pseudo).
  useEffect(() => {
    let alive = true;
    decodeWaveform(att.url, WAVE_BARS).then(
      (b) => alive && setBars(b),
      () => alive && setBars(pseudoWaveform(msgId, WAVE_BARS)),
    );
    return () => {
      alive = false;
    };
  }, [att.url, msgId]);

  // Smooth playhead: drive progress off requestAnimationFrame (~60fps) while
  // playing instead of the coarse `timeupdate` event (~4/s), so the overlay
  // mask glides continuously. Cancelled on pause / unmount.
  useEffect(() => {
    if (!playing) return;
    const a = audioRef.current;
    if (!a) return;
    let raf = 0;
    const tick = () => {
      const d = dur();
      setElapsed(a.currentTime);
      setProgress(d > 0 ? Math.min(1, a.currentTime / d) : 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  // Reset when playback reaches the end.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
      setElapsed(0);
    };
    a.addEventListener("ended", onEnd);
    return () => a.removeEventListener("ended", onEnd);
  }, [src]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a || !src) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      void a.play();
      setPlaying(true);
    }
  };

  const seekTo = (frac: number) => {
    const a = audioRef.current;
    if (!a || !src) return;
    const f = Math.max(0, Math.min(1, frac));
    a.currentTime = f * dur();
    setProgress(f);
    setElapsed(f * dur());
  };

  // Flexible bars: each fills an equal share of the track (max 3px) so the
  // waveform always fits the bubble instead of overflowing at a fixed width.
  const renderBars = (played: boolean) =>
    bars.map((h, i) => (
      <span
        key={i}
        className={cn("min-w-0 flex-1 max-w-[3px] rounded-full", played ? "bg-[#3390ec]" : "bg-[#3390ec]/30")}
        style={{ height: `${Math.max(12, h * 100)}%` }}
      />
    ));

  return (
    <div className="flex w-[240px] min-w-0 max-w-full items-center gap-2.5 py-1">
      {src && <audio ref={audioRef} src={src} preload="metadata" />}
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        className="grid size-10 shrink-0 place-items-center rounded-full bg-[#3390ec] text-white"
        aria-label={playing ? "pause" : "play"}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : playing ? (
          <Pause className="size-4 fill-current" />
        ) : (
          <Play className="size-4 translate-x-px fill-current" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <div
          ref={barsRef}
          className="relative flex h-7 cursor-pointer items-center gap-[2px] overflow-hidden"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - r.left) / r.width);
          }}
        >
          {/* base (unplayed) bars */}
          {renderBars(false)}
          {/* played overlay — a clipped copy that eases its width, so the
              playhead moves continuously instead of jumping bar-by-bar */}
          <div
            className="pointer-events-none absolute inset-y-0 left-0 flex items-center overflow-hidden"
            style={{ width: `${progress * 100}%`, transition: "width 90ms linear" }}
          >
            <div
              className="flex h-full items-center gap-[2px]"
              style={{ width: trackW ? `${trackW}px` : "100%" }}
            >
              {renderBars(true)}
            </div>
          </div>
        </div>
        <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
          {playing || elapsed > 0 ? fmtDuration(elapsed) : fmtDuration(att.duration)}
        </div>
      </div>
    </div>
  );
}

// ── file ─────────────────────────────────────────────────────────────────────

function FileBody({ att }: { att: Attachment }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="flex min-w-52 items-center gap-2.5 py-1 text-left"
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await downloadAttachment(att);
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#3390ec] text-white">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{att.name}</span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {fmtSize(att.size)} <Download className="size-3" />
        </span>
      </span>
    </button>
  );
}
