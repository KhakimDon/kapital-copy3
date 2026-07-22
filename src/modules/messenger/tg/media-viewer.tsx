// Full-screen media viewer (lightbox) for the Telegram surface — a faithful port
// of Telegram Web A's `MediaViewer` (+ `MediaViewerSlides` / `MediaViewerContent`
// / `MediaViewerActions` / `SenderInfo` / `MediaViewerFooter`). It portals to
// <body> under the `.tg-surface` class so it resolves the scoped Telegram theme
// tokens, and draws the classic dark overlay:
//   • a header (`.media-viewer-head`) with SENDER INFO (avatar + name + date) on
//     the left and ACTIONS on the right — Forward / Delete / Download / zoom /
//     close (Forward + Delete call optional callbacks; only shown when wired);
//   • a centered media stage with PHOTO zoom/pan (wheel / buttons / double-click /
//     drag) and a custom VIDEO player (video-player.tsx) — no native controls;
//   • PREV / NEXT navigation across the chat's media: on-screen arrows, keyboard
//     ArrowLeft/ArrowRight, and horizontal swipe/drag; a vertical drag closes;
//   • a footer caption (`.MediaViewerFooter`) rendered with the shared entity
//     renderer;
//   • an open/close scale+opacity transition.
//
// TWO CALL SHAPES, both supported (new props are all optional + additive):
//   1. SINGLE (the current opener in message-media.tsx): pass an already-resolved
//      blob `src` + `kind` + `name`. One slide, no nav, download/zoom/close.
//   2. RICH / LIST: pass `accountId` + `chatId` and either an explicit `items`
//      (a list of the chat's `TgMessage`s) or nothing — the viewer then DERIVES
//      the chat's photos/videos/gifs from the loaded message pages in the React
//      Query cache (`tgMessagesKey`). Open at `startMsgId` (preferred) or
//      `startIndex`. This lights up the header, caption, nav and Forward/Delete.
//
// Bytes for a derived slide are resolved on demand via the shared blob cache
// (`useTgMediaSrc`), so a plain <img>/<video> here needs no JWT. Reuses TgAvatar,
// renderEntities and useTgMediaSrc; the `.VideoPlayer` control-bar CSS ported
// from the reference lives in this file's injected <style> (see MV_STYLES).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Forward,
  Loader2,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { tgMediaUrl, tgMessagesKey, type TgMedia, type TgMessage } from "./api";
import { downloadTgMedia, useTgMediaSrc } from "./media";
import { renderEntities } from "./entities";
import { TgAvatar } from "./tg-avatar";
import { TgVideoPlayer } from "./video-player";

type Kind = "photo" | "video";
type Tr = (k: string, d: string) => string;

const MIN_ZOOM = 1;
const MAX_ZOOM = 6;
const SWIPE_X = 60; // px horizontal drag → prev/next
const SWIPE_Y = 110; // px vertical drag → close
const CLOSE_ANIM_MS = 200;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

/** The media kinds that open in the lightbox (everything else stays inline). */
const VIEWABLE = new Set<TgMedia["type"]>(["photo", "video", "gif"]);

/** RFC3339 → "19 Jul 2026, 14:30" (mirrors the reference `formatMediaDateTime`). */
function fmtMediaDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** One normalized slide the viewer renders. A derived/list slide carries the
 *  source message + an auth'd bytes url; a legacy single slide carries a
 *  pre-resolved blob `presrc`. */
type Slide = {
  kind: Kind;
  isGif: boolean;
  name: string | null;
  /** derived/list slide */
  msg?: TgMessage;
  url?: string;
  /** legacy single slide (pre-resolved blob) */
  presrc?: string;
};

/** Flatten the infinite message pages into one chronological list — mirrors the
 *  `flattenPages` in api.ts (page 0 is newest, so reverse then flat). */
function flattenPages(data: InfiniteData<TgMessage[], number | undefined> | undefined): TgMessage[] {
  if (!data) return [];
  return data.pages.slice().reverse().flat();
}

/** Map a chronological message list to viewable slides (photo/video/gif with
 *  streamable bytes). */
function messagesToSlides(msgs: TgMessage[], accountId: number, chatId: number): Slide[] {
  const out: Slide[] = [];
  for (const m of msgs) {
    const media = m.media;
    if (!media || !VIEWABLE.has(media.type) || media.downloadable === false) continue;
    out.push({
      kind: media.type === "photo" ? "photo" : "video",
      isGif: media.type === "gif",
      name: media.name ?? null,
      msg: m,
      url: tgMediaUrl(accountId, chatId, m.id),
    });
  }
  return out;
}

/** A round overlay control button (header actions + zoom). */
function IconBtn({
  onClick,
  title,
  children,
  href,
  download,
}: {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
  href?: string;
  download?: string;
}) {
  const cls =
    "mv-headbtn grid size-10 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white";
  if (href) {
    return (
      <a
        href={href}
        download={download}
        title={title}
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className={cls}
      >
        {children}
      </a>
    );
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={cls}
    >
      {children}
    </button>
  );
}

export function TgMediaViewer(props: {
  // ── legacy single-item (the current message-media.tsx opener) ──
  src?: string;
  kind?: Kind;
  name?: string | null;
  // ── rich / list mode ──
  accountId?: number;
  chatId?: number;
  /** Explicit chronological message list; when omitted (but accountId+chatId are
   *  given) the viewer derives it from the React Query message cache. */
  items?: TgMessage[];
  /** Open at this message id (preferred — stable across cache growth). */
  startMsgId?: number;
  /** …or at this index into the viewable slide list. */
  startIndex?: number;
  /** The source message, for the header/caption in single-item rich opens. */
  message?: TgMessage;
  /** Forward the current message (shows the Forward action when provided). */
  onForward?: (msg: TgMessage) => void;
  /** Delete the current message (shows the Delete action when provided). */
  onDelete?: (msg: TgMessage) => void;
  tr?: Tr;
  onClose: () => void;
}) {
  const {
    src,
    kind = "photo",
    name = null,
    accountId,
    chatId,
    items,
    startMsgId,
    startIndex,
    message,
    onForward,
    onDelete,
    onClose,
  } = props;
  const t: Tr = props.tr ?? ((_k, d) => d);
  const qc = useQueryClient();
  const isRich = accountId != null && chatId != null;

  // ── build the slide list (once per open) ───────────────────────────────────
  const initialSlides = useMemo<Slide[]>(() => {
    if (isRich) {
      const msgs =
        items ??
        flattenPages(
          qc.getQueryData<InfiniteData<TgMessage[], number | undefined>>(
            tgMessagesKey(accountId!, chatId!),
          ),
        );
      const derived = messagesToSlides(msgs, accountId!, chatId!);
      if (derived.length > 0) return derived;
      // Nothing in cache yet → fall back to the single source message, if any.
      if (message?.media && VIEWABLE.has(message.media.type)) {
        return [
          {
            kind: message.media.type === "photo" ? "photo" : "video",
            isGif: message.media.type === "gif",
            name: message.media.name ?? null,
            msg: message,
            url: tgMediaUrl(accountId!, chatId!, message.id),
          },
        ];
      }
    }
    // Legacy single-item.
    return [{ kind, isGif: false, name, presrc: src, msg: message }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [slides, setSlides] = useState<Slide[]>(initialSlides);
  const [index, setIndex] = useState<number>(() => {
    if (startMsgId != null) {
      const i = initialSlides.findIndex((s) => s.msg?.id === startMsgId);
      if (i >= 0) return i;
    }
    if (startIndex != null) return clamp(startIndex, 0, Math.max(0, initialSlides.length - 1));
    if (message?.id != null) {
      const i = initialSlides.findIndex((s) => s.msg?.id === message.id);
      if (i >= 0) return i;
    }
    return 0;
  });

  const slide = slides[index];
  const count = slides.length;
  const hasPrev = index > 0;
  const hasNext = index < count - 1;

  // ── zoom / pan (photos) ─────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState({ x: 0, y: 0 }); // live swipe/close feedback
  const movedRef = useRef(false);

  const zoomBy = useCallback(
    (d: number) => setZoom((z) => clamp(round1(z + d), MIN_ZOOM, MAX_ZOOM)),
    [],
  );

  // Reset zoom/pan whenever the active slide changes.
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setDrag({ x: 0, y: 0 });
  }, [index]);

  useEffect(() => {
    if (zoom <= 1) setPan({ x: 0, y: 0 });
  }, [zoom]);

  // ── open / close transition ─────────────────────────────────────────────────
  const [phase, setPhase] = useState<"enter" | "shown" | "closing">("enter");
  useEffect(() => {
    const id = requestAnimationFrame(() => setPhase("shown"));
    return () => cancelAnimationFrame(id);
  }, []);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestClose = useCallback(() => {
    setPhase("closing");
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(onClose, CLOSE_ANIM_MS);
  }, [onClose]);
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  // ── navigation ──────────────────────────────────────────────────────────────
  const goPrev = useCallback(() => setIndex((i) => (i > 0 ? i - 1 : i)), []);
  const goNext = useCallback(
    () => setIndex((i) => (i < slides.length - 1 ? i + 1 : i)),
    [slides.length],
  );

  // Esc closes, +/- zoom (photos), arrows navigate (only when not zoomed and not
  // fullscreen — the video player owns arrows while fullscreen). Capture phase so
  // Esc closes the viewer BEFORE any underlying dialog handler. Lock body scroll.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (document.fullscreenElement) return; // let the browser exit fullscreen first
        e.stopPropagation();
        e.preventDefault();
        requestClose();
      } else if (slide?.kind === "photo" && (e.key === "+" || e.key === "=")) {
        zoomBy(0.5);
      } else if (slide?.kind === "photo" && e.key === "-") {
        zoomBy(-0.5);
      } else if (e.key === "ArrowLeft" && zoom <= 1 && !document.fullscreenElement) {
        goPrev();
      } else if (e.key === "ArrowRight" && zoom <= 1 && !document.fullscreenElement) {
        goNext();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
    };
  }, [requestClose, zoomBy, goPrev, goNext, slide?.kind, zoom]);

  const onWheel = (e: React.WheelEvent) => {
    if (slide?.kind !== "photo") return;
    zoomBy(e.deltaY < 0 ? 0.3 : -0.3);
  };

  // Drag: pan while zoomed; else track for swipe (horizontal → prev/next) or
  // close (vertical). Pointer events survive leaving the image bounds.
  const onStagePointerDown = (e: React.PointerEvent) => {
    if (slide?.kind !== "photo") return; // videos: the player owns pointer input
    if ((e.target as HTMLElement).closest("button, a, .VideoPlayer")) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const p0 = { ...pan };
    const z = zoom;
    movedRef.current = false;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) movedRef.current = true;
      if (z > 1) setPan({ x: p0.x + dx, y: p0.y + dy });
      else setDrag({ x: dx, y: dy });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (z > 1) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      setDrag({ x: 0, y: 0 });
      if (Math.abs(dx) > SWIPE_X && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) goNext();
        else goPrev();
      } else if (Math.abs(dy) > SWIPE_Y) {
        requestClose();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Click on empty (dark) space closes; click on media/chrome does not.
  const onStageClick = (e: React.MouseEvent) => {
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    const el = e.target as HTMLElement;
    if (el.closest("img, .VideoPlayer, button, a, .MediaViewerFooter, .SenderInfo, .media-viewer-head"))
      return;
    requestClose();
  };

  // ── actions ─────────────────────────────────────────────────────────────────
  const curMsg = slide?.msg ?? null;
  const [dlBusy, setDlBusy] = useState(false);
  const doDownload = useCallback(async () => {
    if (!slide) return;
    if (slide.presrc) {
      const a = document.createElement("a");
      a.href = slide.presrc;
      a.download = slide.name || "media";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (slide.url) {
      setDlBusy(true);
      try {
        await downloadTgMedia(slide.url, slide.name || "media");
      } finally {
        setDlBusy(false);
      }
    }
  }, [slide]);

  const doForward = useCallback(() => {
    if (curMsg) onForward?.(curMsg);
  }, [curMsg, onForward]);

  const doDelete = useCallback(() => {
    if (!curMsg) return;
    onDelete?.(curMsg);
    // Optimistically drop the slide and advance / close.
    setSlides((prev) => {
      const next = prev.filter((s) => s.msg?.id !== curMsg.id);
      if (next.length === 0) {
        requestClose();
        return prev;
      }
      setIndex((i) => clamp(i, 0, next.length - 1));
      return next;
    });
  }, [curMsg, onDelete, requestClose]);

  if (!slide) return null;

  const caption = curMsg?.text ? curMsg.text : "";
  const senderName = curMsg?.senderName || (curMsg?.out ? t("you", "Siz") : "");
  const dateLabel = curMsg?.date ? fmtMediaDateTime(curMsg.date) : "";

  return createPortal(
    <div
      className={cn(
        "MediaViewer tg-surface fixed inset-0 z-[220] flex flex-col",
        phase === "enter" && "is-enter",
        phase === "closing" && "is-closing",
        zoom > 1 && "zoomed",
      )}
      onWheel={onWheel}
      role="dialog"
      aria-modal="true"
    >
      <style>{MV_STYLES}</style>

      {/* header: sender info (left) + actions (right) */}
      <div className="media-viewer-head" onMouseDown={(e) => e.stopPropagation()}>
        {(senderName || dateLabel) && (
          <div className="SenderInfo">
            {curMsg && (
              <TgAvatar
                accountId={accountId ?? 0}
                peerId={curMsg.senderId}
                name={senderName || "?"}
                size={44}
                className="mv-avatar"
              />
            )}
            <div className="meta">
              {senderName && <div className="title">{senderName}</div>}
              <div className="date">
                {count > 1 ? `${index + 1} / ${count}${dateLabel ? " · " : ""}` : ""}
                {dateLabel}
              </div>
            </div>
          </div>
        )}

        <div className="MediaViewerActions">
          {onForward && curMsg && (
            <IconBtn title={t("forward", "Yo'naltirish")} onClick={doForward}>
              <Forward className="size-5" />
            </IconBtn>
          )}
          {slide.kind === "photo" && (
            <>
              <IconBtn title={t("zoomOut", "Kichraytirish")} onClick={() => zoomBy(-0.5)}>
                <ZoomOut className="size-5" />
              </IconBtn>
              <IconBtn title={t("zoomIn", "Kattalashtirish")} onClick={() => zoomBy(0.5)}>
                <ZoomIn className="size-5" />
              </IconBtn>
            </>
          )}
          {slide.presrc ? (
            <IconBtn title={t("download", "Yuklab olish")} href={slide.presrc} download={slide.name || "media"}>
              <Download className="size-5" />
            </IconBtn>
          ) : (
            <IconBtn title={t("download", "Yuklab olish")} onClick={doDownload}>
              {dlBusy ? <Loader2 className="size-5 animate-spin" /> : <Download className="size-5" />}
            </IconBtn>
          )}
          {onDelete && curMsg && (
            <IconBtn title={t("delete", "O'chirish")} onClick={doDelete}>
              <Trash2 className="size-5" />
            </IconBtn>
          )}
          <IconBtn title={t("close", "Yopish")} onClick={requestClose}>
            <X className="size-5" />
          </IconBtn>
        </div>
      </div>

      {/* media stage */}
      <div className="MediaViewerSlides" onClick={onStageClick}>
        <div
          className="MediaViewerSlide MediaViewerSlide--active"
          onPointerDown={onStagePointerDown}
        >
          <div className="mv-stage" key={index}>
            <MediaViewerContent
              slide={slide}
              zoom={zoom}
              pan={pan}
              drag={drag}
              onToggleZoom={() => setZoom((z) => (z > 1 ? 1 : 2))}
              tr={t}
            />
          </div>
        </div>

        {/* prev/next arrows (hidden while zoomed) */}
        {hasPrev && zoom <= 1 && (
          <button
            type="button"
            className="navigation prev"
            aria-label={t("previous", "Oldingi")}
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
          >
            <ChevronLeft className="size-8" />
          </button>
        )}
        {hasNext && zoom <= 1 && (
          <button
            type="button"
            className="navigation next"
            aria-label={t("next", "Keyingi")}
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
          >
            <ChevronRight className="size-8" />
          </button>
        )}
      </div>

      {/* footer caption (entity-rendered) */}
      {caption && (
        <div className="MediaViewerFooter" onMouseDown={(e) => e.stopPropagation()}>
          <div className="media-viewer-footer-content">
            <p className="media-text" dir="auto">
              {renderEntities(caption, curMsg?.entities, "", t, accountId ?? 0, `mv-${curMsg?.id ?? "x"}`)}
            </p>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

// ── one slide's media (photo or custom video) ────────────────────────────────

function MediaViewerContent({
  slide,
  zoom,
  pan,
  drag,
  onToggleZoom,
  tr,
}: {
  slide: Slide;
  zoom: number;
  pan: { x: number; y: number };
  drag: { x: number; y: number };
  onToggleZoom: () => void;
  tr: Tr;
}) {
  // A derived slide fetches its bytes; a legacy single slide already has them.
  const { src: fetched, loading } = useTgMediaSrc(slide.presrc ? null : slide.url ?? null);
  const src = slide.presrc ?? fetched;

  if (slide.kind === "video") {
    if (!src) {
      return (
        <div className="mv-loading">
          <Loader2 className="size-10 animate-spin text-white/80" />
        </div>
      );
    }
    return <TgVideoPlayer src={src} isGif={slide.isGif} name={slide.name} tr={tr} />;
  }

  if (!src) {
    return (
      <div className="mv-loading">
        {loading ? (
          <Loader2 className="size-10 animate-spin text-white/80" />
        ) : (
          <span className="text-white/70">{tr("mediaFailed", "Media yuklanmadi")}</span>
        )}
      </div>
    );
  }

  const zoomed = zoom > 1;
  const tx = zoomed ? pan.x : drag.x;
  const ty = zoomed ? pan.y : drag.y;
  const dragScale = !zoomed && drag.y ? Math.max(0.85, 1 - Math.abs(drag.y) / 1200) : 1;
  const scale = zoomed ? zoom : dragScale;
  const opacity = !zoomed && drag.y ? Math.max(0.4, 1 - Math.abs(drag.y) / 600) : 1;

  return (
    <img
      src={src}
      alt={slide.name ?? ""}
      draggable={false}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onToggleZoom();
      }}
      style={{
        transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
        opacity,
        cursor: zoomed ? "grab" : "zoom-in",
        transition: drag.x || drag.y ? "none" : "transform 0.15s ease, opacity 0.15s ease",
      }}
      className="mv-image select-none"
    />
  );
}

// ── ported reference CSS (MediaViewer / *Slides / *Content / *Actions /
//    SenderInfo / *Footer / VideoPlayer / VideoPlayerControls / SeekLine) ──────
// Scoped under `.MediaViewer` (which also carries `.tg-surface`, so `--tg-*`
// tokens resolve). Injected once with the portal — keeps everything inside the
// two files this task owns (media-viewer.tsx + video-player.tsx).
const MV_STYLES = `
.MediaViewer{
  color:#fff;background:rgba(0,0,0,.92);
  transition:opacity .2s ease,background-color .2s ease;
  -webkit-user-select:none;user-select:none;
}
.MediaViewer.is-enter,.MediaViewer.is-closing{opacity:0;background:rgba(0,0,0,0)}
.MediaViewer .mv-stage{
  display:flex;align-items:center;justify-content:center;
  width:100%;height:100%;
  transition:transform .2s ease,opacity .2s ease;
}
.MediaViewer.is-enter .mv-stage,.MediaViewer.is-closing .mv-stage{transform:scale(.92);opacity:0}

/* header */
.MediaViewer .media-viewer-head{
  position:relative;z-index:6;display:flex;align-items:center;
  min-height:3.75rem;padding:.5rem max(1.25rem,env(safe-area-inset-left));
  background:linear-gradient(to bottom,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 100%);
  transition:opacity .15s ease;
}
.MediaViewer.is-enter .media-viewer-head,.MediaViewer.is-closing .media-viewer-head{opacity:0}

/* sender info */
.MediaViewer .SenderInfo{display:flex;align-items:center;min-width:0;color:rgba(255,255,255,.55)}
.MediaViewer .SenderInfo .mv-avatar{margin-inline-end:.75rem;flex-shrink:0}
.MediaViewer .SenderInfo .meta{display:flex;flex-direction:column;justify-content:center;min-width:0}
.MediaViewer .SenderInfo .title{
  overflow:hidden;font-weight:500;line-height:1.35;color:#fff;
  text-overflow:ellipsis;white-space:nowrap;
}
.MediaViewer .SenderInfo .date{
  overflow:hidden;font-size:.8125rem;line-height:1.25;color:rgba(255,255,255,.65);
  text-overflow:ellipsis;white-space:nowrap;
}

/* actions */
.MediaViewer .MediaViewerActions{display:flex;align-items:center;gap:.25rem;margin-inline-start:auto}
.MediaViewer .mv-headbtn{cursor:pointer;background:transparent;border:none}

/* slides / stage */
.MediaViewer .MediaViewerSlides{position:relative;flex:1 1 auto;min-height:0;overflow:hidden}
.MediaViewer .MediaViewerSlide{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  padding:.5rem;touch-action:none;
}
.MediaViewer .mv-image{
  max-width:min(100vw,100%);max-height:calc(100vh - 8.25rem);
  object-fit:contain;box-shadow:0 8px 40px rgba(0,0,0,.5);
  will-change:transform;
}
.MediaViewer .mv-loading{display:flex;align-items:center;justify-content:center;min-width:12rem;min-height:12rem}

/* prev / next navigation */
.MediaViewer .navigation{
  position:absolute;top:4rem;bottom:0;z-index:3;
  display:flex;align-items:center;width:12vw;min-width:4rem;max-width:9rem;
  border:none;background:transparent;color:#fff;cursor:pointer;
  opacity:0;transition:opacity .15s ease;outline:none;
}
.MediaViewer .navigation:hover{opacity:1;background:transparent}
.MediaViewer .navigation.prev{left:0;justify-content:flex-start;padding-left:1.25rem}
.MediaViewer .navigation.next{right:0;justify-content:flex-end;padding-right:1.25rem}
.MediaViewer .navigation > svg{
  border-radius:50%;background:rgba(0,0,0,.35);padding:.35rem;box-sizing:content-box;
  width:1.75rem;height:1.75rem;
}

/* footer caption */
.MediaViewer .MediaViewerFooter{
  position:relative;z-index:4;width:100%;padding:.75rem 0 1.1rem;
  transition:opacity .15s ease;
}
.MediaViewer.is-enter .MediaViewerFooter,.MediaViewer.is-closing .MediaViewerFooter{opacity:0}
.MediaViewer .media-viewer-footer-content{
  max-width:var(--messages-container-width,47.5rem);margin:auto;padding:0 1rem;
}
.MediaViewer .media-text{
  margin:0;max-height:6rem;overflow:auto;
  font-size:.9375rem;line-height:1.35;color:rgba(255,255,255,.92);
  text-align:center;white-space:pre-wrap;overflow-wrap:anywhere;
}
.MediaViewer .media-text a{color:#fff;text-decoration:underline}
.MediaViewer .media-text a:hover{text-decoration:none}

/* ── VideoPlayer ─────────────────────────────────────────────────────────── */
.MediaViewer .VideoPlayer{
  position:relative;display:inline-flex;flex-direction:column;overflow:hidden;
  max-width:min(100vw,100%);
}
.MediaViewer .VideoPlayer .mv-video-box{display:flex}
.MediaViewer .VideoPlayer video{
  display:block;margin:auto;max-width:min(100vw,100%);max-height:calc(100vh - 8.25rem);
  object-fit:contain;outline:none;background:#000;
}
.MediaViewer .mv-video-spinner{
  position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
  color:#fff;pointer-events:none;
}
.MediaViewer .mv-video-bigplay{
  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
  display:grid;place-items:center;width:4rem;height:4rem;border:none;border-radius:50%;
  color:#fff;background:rgba(0,0,0,.45);cursor:pointer;
  transition:background-color .15s ease,transform .1s ease;
}
.MediaViewer .mv-video-bigplay:hover{background:rgba(0,0,0,.6)}
.MediaViewer .mv-video-bigplay:active{transform:translate(-50%,-50%) scale(.95)}

/* ── VideoPlayerControls ─────────────────────────────────────────────────── */
.MediaViewer .VideoPlayerControls{
  pointer-events:none;position:absolute;left:0;bottom:0;z-index:5;
  width:100%;padding:2.25rem .5rem .5rem;opacity:0;
  background:linear-gradient(to top,rgba(0,0,0,.75) 0%,rgba(0,0,0,0) 100%);
  transition:opacity .3s ease;
}
.MediaViewer .VideoPlayerControls.active{pointer-events:auto;opacity:1}
.MediaViewer .mv-controls-row{display:flex;align-items:center;width:100%;color:#fff}
.MediaViewer .mv-spacer{flex-grow:1}
.MediaViewer .mv-cbtn{
  display:grid;place-items:center;flex-shrink:0;
  width:2.25rem;height:2.25rem;margin:.15rem;padding:0;border:none;border-radius:50%;
  font-size:.8125rem;font-weight:500;color:rgba(255,255,255,.9);
  background:transparent;cursor:pointer;transition:background-color .15s ease;
}
.MediaViewer .mv-cbtn:hover{background:rgba(255,255,255,.16)}
.MediaViewer .mv-time{
  padding:0 .4rem;font-variant-numeric:tabular-nums;white-space:nowrap;
  color:rgba(255,255,255,.6);font-size:.8125rem;
}

/* volume (hover to expand the slider) */
.MediaViewer .mv-volume{display:flex;align-items:center}
.MediaViewer .mv-volume-slider{
  width:0;margin:0;opacity:0;accent-color:#fff;cursor:pointer;
  transition:width .2s ease,opacity .15s ease,margin .2s ease;
}
.MediaViewer .mv-volume:hover .mv-volume-slider{width:4rem;margin:0 .35rem;opacity:1}

/* playback-rate menu */
.MediaViewer .mv-rate{position:relative;display:flex;align-items:center}
.MediaViewer .mv-rate-menu{
  position:absolute;right:0;bottom:calc(100% + .4rem);z-index:6;
  display:flex;flex-direction:column;min-width:3.5rem;padding:.25rem;
  border-radius:.625rem;background:var(--color-background-compact-menu,rgba(30,30,30,.98));
  box-shadow:0 4px 14px rgba(0,0,0,.4);
}
.MediaViewer .mv-rate-item{
  padding:.35rem .5rem;border:none;border-radius:.375rem;text-align:center;
  font-size:.8125rem;color:var(--tg-text,#fff);background:transparent;cursor:pointer;
}
.MediaViewer .mv-rate-item:hover{background:rgba(127,127,127,.2)}
.MediaViewer .mv-rate-item.active{color:var(--tg-primary,#8774e1);font-weight:600}

/* ── SeekLine ────────────────────────────────────────────────────────────── */
.MediaViewer .SeekLine{
  position:relative;height:1rem;margin:0 .75rem .25rem;cursor:pointer;touch-action:none;
}
.MediaViewer .mv-seek-track{
  position:absolute;top:50%;left:-.25rem;right:-.25rem;transform:translateY(-50%);
  height:5px;border-radius:1rem;background:rgba(255,255,255,.16);overflow:hidden;
}
.MediaViewer .mv-seek-buffered{
  position:absolute;top:0;height:100%;border-radius:1rem;background:rgba(255,255,255,.45);
}
.MediaViewer .mv-seek-track:has(.mv-seek-played){overflow:visible}
.MediaViewer .mv-seek-played{
  position:absolute;top:0;left:0;height:100%;border-radius:1rem;background:var(--tg-primary,#8774e1);
}
.MediaViewer .mv-seek-played::after{
  content:"";position:absolute;top:50%;right:0;transform:translate(50%,-50%) scale(1);
  width:.75rem;height:.75rem;border-radius:50%;background:var(--tg-primary,#8774e1);
  transition:transform .15s ease;
}
.MediaViewer .mv-seek-played.seeking::after{transform:translate(50%,-50%) scale(1.4)}

@media (prefers-reduced-motion: reduce){
  .MediaViewer,.MediaViewer .mv-stage,.MediaViewer .media-viewer-head,
  .MediaViewer .MediaViewerFooter,.MediaViewer .mv-image{transition:none!important}
}
`;
