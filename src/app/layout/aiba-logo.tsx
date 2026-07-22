import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * Animated logo. At REST it shows the crisp SVG monogram. On hover the SVG
 * cross-fades out and the brand build-up video plays from the start. On
 * mouse-leave, if the clip is still running we let it finish first, then
 * cross-fade the SVG back in (handled in onEnded).
 *
 * The .webm is VP9 with a real alpha channel — the browser renders it
 * transparent (ffmpeg can't decode the alpha, so we can't crop server-side).
 * We CSS-crop with absolute positioning + percentage size so the FULL animation
 * (the eagle's spread wings peak at a ~876px box centred at 968,571 in the
 * 1920×1080 frame) fits with no clipping: width 219%, height 123%, left -60.5%,
 * top -15.2%. The video's final logo lands at ~60% of the slot, so the resting
 * SVG is sized/positioned to match it exactly for a seamless hand-off.
 */
export function AnimatedLogo({ className, active }: { className?: string; active?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const hovering = useRef(false);
  const [showSvg, setShowSvg] = useState(true);

  const start = () => {
    hovering.current = true;
    const v = ref.current;
    if (v) {
      v.currentTime = 0;
      void v.play().catch(() => {});
    }
    setShowSvg(false);
  };
  const end = () => {
    hovering.current = false;
    const v = ref.current;
    // Already finished → reveal the SVG now. Still playing → let it run to
    // the end; onEnded reveals the SVG.
    if (!v || v.ended || v.paused) setShowSvg(true);
  };

  // Controlled mode: a parent (e.g. the whole "powered by AIBA" badge) drives
  // the hover via `active`, so the animation plays on hovering the block, not
  // just the logo. Uncontrolled (active === undefined): use own mouse events.
  useEffect(() => {
    if (active === undefined) return;
    if (active) start();
    else end();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <span
      className={cn("relative block overflow-hidden", className)}
      onMouseEnter={active === undefined ? start : undefined}
      onMouseLeave={active === undefined ? end : undefined}
    >
      <video
        ref={ref}
        src="/logo-anim.webm"
        muted
        playsInline
        preload="auto"
        onEnded={() => {
          if (!hovering.current) setShowSvg(true);
        }}
        className={cn(
          "pointer-events-none absolute transition-opacity duration-300",
          showSvg ? "opacity-0" : "opacity-100",
        )}
        style={{ width: "219%", height: "123%", left: "-60.5%", top: "-15.2%", maxWidth: "none" }}
      />
      <AibaLogo
        className={cn(
          "pointer-events-none absolute left-1/2 top-[47.5%] size-[60%] -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300",
          showSvg ? "opacity-100" : "opacity-0",
        )}
      />
    </span>
  );
}

/** Метка «работает на AIBA» в форме «язычка-вкладки»: зафиксирована у нижнего
 *  края экрана, закруглена сверху, приклеена к низу. Анимация лого — при
 *  наведении на весь блок, клик ведёт на aiba.uz. Ставится один раз в шелле. */
export function PoweredByAiba({ className }: { className?: string }) {
  const [hovered, setHovered] = useState(false);
  return (
    <a
      href="https://aiba.uz/"
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "inline-flex items-center gap-1 rounded-t-2xl border border-b-0 border-[#EDEEF0] bg-white pb-2 pl-2.5 pr-4 pt-1.5 shadow-[0_-6px_20px_rgba(68,83,113,0.10)] transition-all duration-300 hover:pb-3.5",
        className,
      )}
    >
      <AnimatedLogo active={hovered} className="size-7 shrink-0" />
      <span className="-ml-1 text-[12px] font-medium leading-tight text-[#83888B]">
        Работает на <span className="font-bold text-[#101010]">AIBA</span>
      </span>
    </a>
  );
}

export function AibaLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="4.8 4.8 35 36.4"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="AIBA"
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M17.9672 16.9018C18.154 16.962 18.3327 17.0197 18.4997 17.0738C15.2413 18.7841 13.0657 16.8528 13.346 15.2432C13.708 15.527 16.2031 16.3324 17.9672 16.9018Z"
        fill="url(#aiba_g0)"
      />
      <path
        d="M21.6525 5.00024C31.4625 5.00024 39.4151 13.0591 39.4151 23.0001C39.4151 30.8964 34.3976 37.6052 27.4171 40.0309C25.6095 40.659 23.6702 41 21.6525 41C15.053 41 9.29408 37.3529 6.23153 31.9392C5.12036 17.0394 24.0796 18.8965 25.9705 24.8305C26.6507 22.517 26.9499 20.5375 21.9182 18.0106C18.8324 12.4823 13.034 10.825 7.80437 11.7266C11.0601 7.62509 16.0537 5.00024 21.6525 5.00024Z"
        fill="url(#aiba_g1)"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M6.23153 31.9391C9.29408 37.3528 15.053 40.9999 21.6525 40.9999C23.6702 40.9999 25.6095 40.6589 27.4171 40.0308C21.3771 41.4351 12.5093 38.9553 13.1759 30.8269C13.7591 23.7188 20.6782 21.7466 25.9705 24.8304C24.0796 18.8964 5.12036 17.0393 6.23153 31.9391Z"
        fill="url(#aiba_g2)"
      />
      <defs>
        <linearGradient id="aiba_g0" x1="22.7999" y1="-5.42064" x2="22.7999" y2="41.0001" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34D759" />
          <stop offset="1" stopColor="#18C0EB" />
        </linearGradient>
        <linearGradient id="aiba_g1" x1="22.7998" y1="-5.42073" x2="22.7998" y2="41" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34D759" />
          <stop offset="1" stopColor="#18C0EB" />
        </linearGradient>
        <linearGradient id="aiba_g2" x1="18.6246" y1="4.39646" x2="17.687" y2="48.8097" gradientUnits="userSpaceOnUse">
          <stop stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
