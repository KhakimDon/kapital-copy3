import { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";
import { cn } from "@/shared/lib/utils";

// A full Lottie sticker (large JSON, many layers, 60 fps) is far too heavy to run
// once PER card — a board full of them ballooned the tab to >1 GB. Instead we run
// exactly ONE hidden lottie animation per sticker (`cacheKey`) and blit its frame
// onto each on-screen card's small <canvas>. Memory is then bounded to a single
// animation + N tiny canvases, no matter how many cards show the sticker.

type Source = {
  anim?: AnimationItem;
  canvas?: HTMLCanvasElement | null;
  targets: Set<HTMLCanvasElement>;
  raf: number;
};

const sources = new Map<string, Source>();
let lottieMod: typeof import("lottie-web").default | null = null;

async function ensureSource(cacheKey: string, load: () => Promise<unknown>): Promise<Source> {
  const existing = sources.get(cacheKey);
  if (existing) return existing;

  const src: Source = { targets: new Set(), raf: 0, canvas: null };
  sources.set(cacheKey, src);

  const mod = lottieMod ?? (lottieMod = (await import("lottie-web")).default);
  const data = await load();

  // One hidden, small (96px) offscreen host renders the sticker just once.
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:fixed;left:-9999px;top:0;width:96px;height:96px;pointer-events:none";
  document.body.appendChild(host);

  src.anim = mod.loadAnimation({
    container: host,
    renderer: "canvas",
    loop: true,
    autoplay: true,
    animationData: data as object,
  });
  src.canvas = host.querySelector("canvas");

  const tick = () => {
    const s = sources.get(cacheKey);
    if (!s) return;
    if (!s.targets.size) {
      // Nothing on screen — pause the source so it burns no CPU.
      if (s.anim && !s.anim.isPaused) s.anim.pause();
    } else {
      if (s.anim && s.anim.isPaused) s.anim.play();
      if (s.canvas) {
        for (const c of s.targets) {
          const ctx = c.getContext("2d");
          if (!ctx) continue;
          ctx.clearRect(0, 0, c.width, c.height);
          try {
            ctx.drawImage(s.canvas, 0, 0, c.width, c.height);
          } catch {
            /* source not painted yet this frame */
          }
        }
      }
    }
    s.raf = requestAnimationFrame(tick);
  };
  src.raf = requestAnimationFrame(tick);
  return src;
}

/**
 * Renders a Lottie sticker as a small inline icon by copying frames from a single
 * shared source animation. `load` lazily provides the JSON; `cacheKey` identifies
 * the shared source. Only paints while on-screen (IntersectionObserver).
 */
export function LottieIcon({
  load,
  cacheKey,
  className,
}: {
  load: () => Promise<unknown>;
  cacheKey: string;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    // Back the canvas at the displayed size × dpr for a crisp retina blit.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(1, Math.round((canvas.getBoundingClientRect().width || 24) * dpr));
    canvas.width = px;
    canvas.height = px;

    let src: Source | undefined;
    let joined = false;

    const io = new IntersectionObserver(
      (entries) => {
        const on = entries[0]?.isIntersecting;
        if (on && !joined) {
          joined = true;
          void ensureSource(cacheKey, loadRef.current).then((s) => {
            src = s;
            if (joined) s.targets.add(canvas);
          });
        } else if (!on && joined) {
          joined = false;
          src?.targets.delete(canvas);
        }
      },
      { rootMargin: "120px" },
    );
    io.observe(canvas);

    return () => {
      io.disconnect();
      src?.targets.delete(canvas);
    };
  }, [cacheKey]);

  return <canvas ref={ref} className={cn("pointer-events-none", className)} aria-hidden />;
}
