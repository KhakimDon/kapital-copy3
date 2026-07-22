import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { create } from "zustand";
import { X, Download } from "lucide-react";
import { cn } from "@/shared/lib/utils";

/** Global image lightbox with a shared-element (FLIP) zoom: the image POPS IN
 *  from the exact spot it was clicked and POPS OUT back to it on close. The
 *  source element is hidden for the duration so it reads as one image flying.
 *  Imperative `openLightbox(src, alt, sourceEl)` + one `<LightboxHost/>` at the
 *  app root — callers never manage dialog state. */

type Rect = { left: number; top: number; width: number; height: number };

type LightboxState = {
  src: string | null;
  alt: string;
  /** The clicked element — re-measured on close so the pop-out lands exactly
   *  where the thumbnail is NOW (it may have scrolled). */
  sourceEl: HTMLElement | null;
  /** Rect captured at open time — the fallback if the source unmounts. */
  rect: Rect | null;
  open: (src: string, alt?: string, sourceEl?: HTMLElement | null) => void;
  close: () => void;
};

export const useLightbox = create<LightboxState>((set) => ({
  src: null,
  alt: "",
  sourceEl: null,
  rect: null,
  open: (src, alt = "", sourceEl = null) =>
    set({ src, alt, sourceEl, rect: sourceEl ? sourceEl.getBoundingClientRect() : null }),
  close: () => set({ src: null, alt: "", sourceEl: null, rect: null }),
}));

export const openLightbox = (src: string, alt = "", sourceEl: HTMLElement | null = null) =>
  useLightbox.getState().open(src, alt, sourceEl);

/** Capture-phase click handler for containers whose HTML may contain <img>
 *  (contentEditable descriptions, wiki blocks). Opens the clicked image in the
 *  lightbox instead of letting the click select/caret into the editor. */
export function interceptImageClick(e: React.MouseEvent) {
  const t = e.target as HTMLElement;
  if (t instanceof HTMLImageElement && t.src) {
    e.preventDefault();
    e.stopPropagation();
    openLightbox(t.src, t.alt || "", t);
  }
}

const FLY_MS = 300;
const EASE = "cubic-bezier(0.22, 0.9, 0.26, 1)";

/** Where the image should land: its natural aspect fitted into the viewport
 *  (object-cover + an aspect-true target box ⇒ no crop once landed, while the
 *  flight from a square thumbnail still reads as a clean crop-morph). */
function targetBox(natW: number, natH: number): Rect {
  const maxW = window.innerWidth * 0.94;
  const maxH = window.innerHeight * 0.9;
  const s = Math.min(maxW / (natW || 1), maxH / (natH || 1));
  const width = (natW || 1) * s;
  const height = (natH || 1) * s;
  return { left: (window.innerWidth - width) / 2, top: (window.innerHeight - height) / 2, width, height };
}

const apply = (el: HTMLElement, r: Rect) => {
  el.style.left = `${r.left}px`;
  el.style.top = `${r.top}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
};

export function LightboxHost() {
  const { src, alt, rect, sourceEl, close } = useLightbox();
  const imgRef = useRef<HTMLImageElement>(null);
  // "enter" → flying in, "open" → landed (controls visible), "closing" → flying back
  const [phase, setPhase] = useState<"enter" | "open" | "closing">("enter");

  // ── pop-in: start at the source rect, fly to center once loaded ──────────
  useLayoutEffect(() => {
    if (!src) return;
    setPhase("enter");
    const el = imgRef.current;
    if (!el) return;

    // Hide the source so the flight reads as the same image moving.
    if (sourceEl) sourceEl.style.visibility = "hidden";

    const from: Rect =
      rect ?? {
        // no source (programmatic open) — start slightly shrunk at center
        left: window.innerWidth / 2 - 40,
        top: window.innerHeight / 2 - 30,
        width: 80,
        height: 60,
      };
    el.style.transition = "none";
    el.style.opacity = rect ? "1" : "0";
    el.style.borderRadius = "10px";
    apply(el, from);

    const fly = () => {
      // double-rAF: guarantee the "from" frame is committed before we animate
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = `left ${FLY_MS}ms ${EASE}, top ${FLY_MS}ms ${EASE}, width ${FLY_MS}ms ${EASE}, height ${FLY_MS}ms ${EASE}, opacity 200ms ease`;
          el.style.opacity = "1";
          apply(el, targetBox(el.naturalWidth, el.naturalHeight));
          window.setTimeout(() => setPhase("open"), FLY_MS);
        });
      });
    };
    if (el.complete && el.naturalWidth) fly();
    else el.onload = fly;

    // Safety: restore the source if we unmount without a proper close.
    return () => {
      if (sourceEl) sourceEl.style.visibility = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  // ── pop-out: fly back to where the thumbnail is NOW, then unmount ─────────
  const doClose = () => {
    const el = imgRef.current;
    const back: Rect | null =
      sourceEl && sourceEl.isConnected ? sourceEl.getBoundingClientRect() : rect;
    if (!el || !back) {
      if (sourceEl) sourceEl.style.visibility = "";
      close();
      return;
    }
    setPhase("closing");
    el.style.transition = `left ${FLY_MS}ms ${EASE}, top ${FLY_MS}ms ${EASE}, width ${FLY_MS}ms ${EASE}, height ${FLY_MS}ms ${EASE}, opacity ${FLY_MS}ms ease`;
    apply(el, back);
    window.setTimeout(() => {
      if (sourceEl) sourceEl.style.visibility = "";
      close();
    }, FLY_MS - 20);
  };

  // Escape closes the lightbox ONLY (window capture runs before Radix's
  // document-level dialog handlers, so the underlying card dialog stays open).
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        doClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, sourceEl, rect]);

  if (!src) return null;
  const landed = phase === "open";
  return (
    <div
      className={cn(
        // pointer-events-auto: a Radix dialog (the task drawer) sets
        // `body { pointer-events: none }` while open, which would otherwise make
        // the lightbox unclickable (only Esc worked) since it lives at the root.
        "pointer-events-auto fixed inset-0 z-[200] transition-[background-color,backdrop-filter] duration-300",
        phase === "closing" ? "bg-black/0" : "bg-black/85 backdrop-blur-sm",
      )}
      onClick={doClose}
      role="dialog"
      aria-modal="true"
    >
      {/* the flying image — fixed-positioned, geometry driven imperatively */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        className="fixed select-none object-cover shadow-2xl"
        style={{ borderRadius: 10 }}
        onClick={(e) => e.stopPropagation()}
        draggable={false}
      />
      {/* caption + controls fade in only once landed */}
      {alt && (
        <div
          className={cn(
            "pointer-events-none absolute bottom-5 left-1/2 max-w-[80vw] -translate-x-1/2 truncate rounded-full bg-black/60 px-4 py-1.5 text-sm text-white/90 transition-opacity duration-200",
            landed ? "opacity-100" : "opacity-0",
          )}
        >
          {alt}
        </div>
      )}
      <div
        className={cn(
          "absolute right-4 top-4 flex gap-2 transition-opacity duration-200",
          landed ? "opacity-100" : "opacity-0",
        )}
      >
        <a
          href={src}
          download={alt || "image"}
          onClick={(e) => e.stopPropagation()}
          className="rounded-full bg-white/10 p-2.5 text-white/90 transition-colors hover:bg-white/20"
          title="Download"
        >
          <Download className="size-5" />
        </a>
        <button
          type="button"
          onClick={doClose}
          className="rounded-full bg-white/10 p-2.5 text-white/90 transition-colors hover:bg-white/20"
          title="Close"
        >
          <X className="size-5" />
        </button>
      </div>
    </div>
  );
}
