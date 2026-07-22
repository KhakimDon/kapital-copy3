// Real animated-sticker / TGS renderer. Telegram ships stickers & animated emoji
// as `.tgs` = gzip-compressed Lottie JSON. This decodes them natively with
// `DecompressionStream('gzip')` (no extra dependency) and renders with the
// already-installed `lottie-web` — so TGS actually animates, matching the source
// AnimatedSticker's behaviour (play / loop / size). RLottie-WASM in the original
// is a perf optimization; lottie-web produces the same visual result.
import { useEffect, useRef } from "react";
import lottie, { type AnimationItem } from "lottie-web";

type LottieData = Record<string, unknown>;

async function loadTgs(url: string): Promise<LottieData> {
  const res = await fetch(url);
  const gz = res.body;
  if (gz && typeof DecompressionStream !== "undefined") {
    const stream = gz.pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text()) as LottieData;
  }
  // Fallback: already-decompressed .json Lottie
  return (await res.json()) as LottieData;
}

export function AnimatedSticker({
  tgsUrl,
  size = 128,
  play = true,
  noLoop = false,
  className,
}: {
  tgsUrl: string;
  size?: number;
  play?: boolean;
  noLoop?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTgs(tgsUrl)
      .then((data) => {
        if (cancelled || !containerRef.current) return;
        animRef.current = lottie.loadAnimation({
          container: containerRef.current,
          renderer: "svg",
          loop: !noLoop,
          autoplay: play,
          animationData: data,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      animRef.current?.destroy();
      animRef.current = null;
    };
  }, [tgsUrl, noLoop, play]);

  return <div ref={containerRef} className={className} style={{ width: size, height: size }} />;
}
