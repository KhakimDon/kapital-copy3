// The animated custom-emoji STATUS that Telegram shows next to a name (premium or
// collectible/gift). Streams the sticker bytes through the auth'd custom-emoji
// endpoint and renders the tgs (Lottie) / webm / static image. A static premium
// star stands in while the bytes load and if they can't resolve, so the badge
// never disappears. Shared by the chat header, the chat-list row and the profile
// panel so the three surfaces render an identical status.
import { Star } from "lucide-react";
import { AnimatedSticker } from "./animated-sticker";
import { useTgCustomEmoji } from "./media";
import { tgCustomEmojiUrl } from "./api";
import { cn } from "@/shared/lib/utils";

export function TgEmojiStatus({
  accountId,
  documentId,
  size = 20,
  className,
}: {
  accountId: number;
  documentId: string;
  /** Rendered box in px (header 22, list 18, profile 22). */
  size?: number;
  className?: string;
}) {
  const { res } = useTgCustomEmoji(tgCustomEmojiUrl(accountId, documentId));
  if (!res) {
    return (
      <Star
        className={cn("tg-emoji-status-fallback", className)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={cn("tg-emoji-status", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {res.kind === "tgs" ? (
        <AnimatedSticker tgsUrl={res.url} size={size} className="h-full w-full" />
      ) : res.kind === "webm" ? (
        <video src={res.url} autoPlay loop muted playsInline className="h-full w-full object-contain" />
      ) : (
        <img src={res.url} alt="" draggable={false} className="h-full w-full object-contain" />
      )}
    </span>
  );
}
