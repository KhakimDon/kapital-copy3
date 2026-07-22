// Faithful React port of the real Telegram Web A `common/spoiler/Spoiler.tsx`
// (Teact → React, 1:1). The concealed look is the REAL tiled dot texture
// (spoiler-dots-black/white.png) with the exact `pulse-opacity` animation from
// Spoiler.scss — not an approximation. Click reveals every spoiler that shares
// the same `containerId` at once (Telegram behaviour).
import { memo, useCallback, useEffect, useState } from "react";
import { createClassNameBuilder } from "./_foundation/build-class-name";
import "./spoiler.css";

const cn = createClassNameBuilder("Spoiler");
const revealByContainerId = new Map<string, (() => void)[]>();

function SpoilerImpl({ children, containerId }: { children?: React.ReactNode; containerId?: string }) {
  const [isRevealed, setRevealed] = useState(false);
  const reveal = useCallback(() => setRevealed(true), []);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLSpanElement>) => {
      if (!containerId) return;
      if (!isRevealed) {
        e.preventDefault();
        e.stopPropagation();
      }
      revealByContainerId.get(containerId)?.forEach((r) => r());
    },
    [containerId, isRevealed],
  );

  useEffect(() => {
    if (!containerId) return undefined;
    const existing = revealByContainerId.get(containerId);
    if (existing) existing.push(reveal);
    else revealByContainerId.set(containerId, [reveal]);
    return () => {
      revealByContainerId.delete(containerId);
    };
  }, [containerId, reveal]);

  return (
    <span
      className={cn("&", !isRevealed && "concealed", !isRevealed && Boolean(containerId) && "animated")}
      onClick={containerId && !isRevealed ? handleClick : undefined}
    >
      <span className={cn("content")}>{children}</span>
    </span>
  );
}

export const Spoiler = memo(SpoilerImpl);
