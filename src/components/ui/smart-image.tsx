import { useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";

/**
 * Image with a shimmer preloader that stays up for at least `minMs` (default
 * 500ms) so pictures fade in smoothly instead of popping in abruptly. Works for
 * data-URLs (which load instantly) and network images alike.
 */
export function SmartImage({
  src,
  alt = "",
  className,
  imgClassName,
  minMs = 500,
  rounded = "rounded-lg",
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  imgClassName?: string;
  minMs?: number;
  rounded?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const started = useRef<number>(0);
  if (started.current === 0) started.current = performance.now();

  useEffect(() => {
    if (!loaded) return;
    const wait = Math.max(0, minMs - (performance.now() - started.current));
    const id = setTimeout(() => setReady(true), wait);
    return () => clearTimeout(id);
  }, [loaded, minMs]);

  return (
    <span className={cn("relative inline-block overflow-hidden", rounded, className)}>
      {!ready && <span className={cn("absolute inset-0 animate-pulse bg-muted", rounded)} aria-hidden />}
      {src && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(true)}
          className={cn("h-full w-full object-cover transition-opacity duration-300", ready ? "opacity-100" : "opacity-0", imgClassName)}
        />
      )}
    </span>
  );
}
