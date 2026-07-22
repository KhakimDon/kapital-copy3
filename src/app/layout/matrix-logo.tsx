import { useEffect, useRef } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * "Matrix rain" build-up of the AIBA mark, shown while a deploy pipeline is
 * running (see usePipelineStatus). Green/cyan katakana rain is clipped to the
 * logo silhouette via a CSS mask, with the outline stroking itself in first.
 * Self-contained canvas — a faithful React port of matrix-logo.html.
 */

const LOGO_PATHS = [
  "M21.6525 5.00024C31.4625 5.00024 39.4151 13.0591 39.4151 23.0001C39.4151 30.8964 34.3976 37.6052 27.4171 40.0309C25.6095 40.659 23.6702 41 21.6525 41C15.053 41 9.29408 37.3529 6.23153 31.9392C5.12036 17.0394 24.0796 18.8965 25.9705 24.8305C26.6507 22.517 26.9499 20.5375 21.9182 18.0106C18.8324 12.4823 13.034 10.825 7.80437 11.7266C11.0601 7.62509 16.0537 5.00024 21.6525 5.00024Z",
  "M6.23153 31.9391C9.29408 37.3528 15.053 40.9999 21.6525 40.9999C23.6702 40.9999 25.6095 40.6589 27.4171 40.0308C21.3771 41.4351 12.5093 38.9553 13.1759 30.8269C13.7591 23.7188 20.6782 21.7466 25.9705 24.8304C24.0796 18.8964 5.12036 17.0393 6.23153 31.9391Z",
  "M17.9672 16.9018C18.154 16.962 18.3327 17.0197 18.4997 17.0738C15.2413 18.7841 13.0657 16.8528 13.346 15.2432C13.708 15.527 16.2031 16.3324 17.9672 16.9018Z",
];

const CHARS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモ" +
  "ヤユヨラリルレロワヲンABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>*+=/";

// Padded viewBox so the outline stroke + neon glow have room and never clip.
// LogoSlot sizes the box up a touch (the mark occupies ~78% of it) so the
// rendered mark still matches the resting logo (~40px).
const CROP = "0 0 46 46";
const MASK_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='" + CROP + "'>" +
  LOGO_PATHS.map((d) => "<path d='" + d + "' fill='white'/>").join("") +
  "</svg>";
const MASK_URL = 'url("data:image/svg+xml,' + encodeURIComponent(MASK_SVG) + '")';

const rndChar = () => CHARS[(Math.random() * CHARS.length) | 0];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function MatrixLogo({ className }: { className?: string }) {
  const stageRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const outlineRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    const outline = outlineRef.current;
    if (!stage || !canvas || !outline) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0,
      H = 0,
      dpr = 1,
      fontSize = 4,
      columns = 1;
    let drops: number[] = [];
    let speed: number[] = [];
    let nextStep: number[] = [];
    let last: (null | { ch: string; y: number })[] = [];
    let grad: CanvasGradient | null = null;
    let running = false;
    let raf = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const introTimers: ReturnType<typeof setTimeout>[] = [];

    const resetColumn = (i: number, initial: boolean) => {
      drops[i] = initial
        ? Math.floor(Math.random() * (H / fontSize))
        : -Math.floor(Math.random() * 3);
      speed[i] = 38 + Math.random() * 72;
      nextStep[i] = 0;
      last[i] = null;
    };

    const setup = () => {
      const rect = stage.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = rect.width;
      H = rect.height;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      fontSize = Math.max(3, Math.round(W / 12));
      columns = Math.ceil(W / fontSize);

      const sw = clamp(W * 0.03, 0.9, 2).toFixed(2);
      outline.style.setProperty("--sw", sw);
      const glow = Math.max(1.5, W * 0.06);
      outline.style.filter = "drop-shadow(0 0 " + glow.toFixed(1) + "px rgba(52,215,89,.55))";

      drops = new Array(columns);
      speed = new Array(columns);
      nextStep = new Array(columns);
      last = new Array(columns);
      for (let i = 0; i < columns; i++) resetColumn(i, true);

      grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0.0, "#3BE06A");
      grad.addColorStop(0.55, "#1FD08F");
      grad.addColorStop(1.0, "#18C0EB");
    };

    const frame = (now: number) => {
      if (!running) return;
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0, 0, 0, 0.055)";
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";

      ctx.font = fontSize + "px ui-monospace, monospace";
      ctx.textBaseline = "top";

      for (let i = 0; i < columns; i++) {
        const x = i * fontSize;
        const y = drops[i] * fontSize;

        const l = last[i];
        if (l && l.y >= 0 && grad) {
          ctx.fillStyle = grad;
          ctx.fillText(l.ch, x, l.y);
        }

        const ch = rndChar();
        if (y >= 0) {
          ctx.fillStyle = "#eafff1";
          ctx.shadowColor = "rgba(120,255,180,0.9)";
          ctx.shadowBlur = fontSize * 0.6;
          ctx.fillText(ch, x, y);
          ctx.shadowBlur = 0;
        }

        if (now >= nextStep[i]) {
          last[i] = { ch, y };
          drops[i]++;
          nextStep[i] = now + speed[i];
          if (y > H && Math.random() > 0.78) resetColumn(i, false);
        }
      }
      raf = requestAnimationFrame(frame);
    };

    const startRain = () => {
      if (running) return;
      running = true;
      canvas.style.opacity = "1";
      raf = requestAnimationFrame(frame);
    };

    const playIntro = () => {
      const paths = Array.from(outline.querySelectorAll<SVGPathElement>(".matrix-ol"));
      paths.forEach((p, i) => {
        const len = p.getTotalLength();
        p.style.strokeDasharray = String(len);
        p.style.strokeDashoffset = String(len);
        void p.getBoundingClientRect();
        p.style.transition =
          "stroke-dashoffset 1.5s cubic-bezier(.6,.05,.2,1) " +
          i * 0.12 +
          "s,opacity 0.5s ease " +
          i * 0.12 +
          "s";
        requestAnimationFrame(() => {
          p.style.strokeDashoffset = "0";
          p.style.opacity = "1";
        });
      });
      introTimers.push(setTimeout(startRain, 1250));
      introTimers.push(
        setTimeout(
          () =>
            paths.forEach((p) => {
              p.style.opacity = "0.85";
              // Drop the dash once drawn: a closed path left with
              // stroke-dasharray renders its seam as two caps, leaving a
              // visible break — `none` restores the continuous join.
              p.style.strokeDasharray = "none";
            }),
          2100,
        ),
      );
    };

    const onResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(setup, 200);
    };

    setup();
    playIntro();
    window.addEventListener("resize", onResize);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
      introTimers.forEach(clearTimeout);
    };
  }, []);

  return (
    <span
      ref={stageRef}
      className={cn("relative block", className)}
      style={{ overflow: "visible" }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full transition-opacity duration-700"
        style={{
          opacity: 0,
          WebkitMaskImage: MASK_URL,
          maskImage: MASK_URL,
          WebkitMaskSize: "contain",
          maskSize: "contain",
          WebkitMaskRepeat: "no-repeat",
          maskRepeat: "no-repeat",
          WebkitMaskPosition: "center",
          maskPosition: "center",
        }}
      />
      <svg
        ref={outlineRef}
        viewBox={CROP}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
      >
        <defs>
          <linearGradient id="matrix-brand" gradientUnits="userSpaceOnUse" x1="23" y1="4" x2="23" y2="42">
            <stop offset="0" stopColor="#34D759" />
            <stop offset="1" stopColor="#18C0EB" />
          </linearGradient>
        </defs>
        {LOGO_PATHS.map((d, i) => (
          <path
            key={i}
            d={d}
            className="matrix-ol"
            fill="none"
            stroke="url(#matrix-brand)"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            style={{ opacity: 0, strokeWidth: "var(--sw, 1.4)" }}
          />
        ))}
      </svg>
    </span>
  );
}
