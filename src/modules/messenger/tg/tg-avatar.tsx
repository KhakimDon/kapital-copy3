// Real Telegram avatar — loads the peer's actual profile photo (auth'd blob),
// falling back to the deterministic monogram (ChatAvatar) while loading or when
// the peer has no photo. Same visual footprint as ChatAvatar so it drops in
// anywhere a monogram avatar was used on the TG surface.
import { ChatAvatar } from "../avatar";
import { tgPeerPhotoUrl } from "./api";
import { useTgMediaSrc } from "./media";

export function TgAvatar({
  accountId,
  peerId,
  name,
  size = 54,
  group = false,
  className,
}: {
  accountId: number;
  /** TG peer id (dialog chatId or a sender id). When null, only the monogram shows. */
  peerId: number | null | undefined;
  name: string;
  size?: number;
  group?: boolean;
  className?: string;
}) {
  const { src } = useTgMediaSrc(peerId != null ? tgPeerPhotoUrl(accountId, peerId) : null);
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={className}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
      />
    );
  }
  return <ChatAvatar seed={String(peerId ?? name)} name={name} size={size} group={group} className={className} />;
}
