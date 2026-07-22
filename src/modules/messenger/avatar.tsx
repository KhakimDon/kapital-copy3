// Initials avatar on a deterministic per-user gradient (seeded by username),
// with an <img> when the chat/user has a picture set. Kept local to the
// messenger so its palette can differ from the tasks-module avatars.
import { Users } from "lucide-react";

const PALETTE: [string, string][] = [
  ["#ff885e", "#ff516a"], // orange→red
  ["#ffcd6a", "#ffa85c"], // yellow→orange
  ["#82b1ff", "#665fff"], // blue→violet
  ["#a0de7e", "#54cb68"], // green
  ["#53edd6", "#28c9b7"], // teal
  ["#72d5fd", "#2a9ef1"], // sky
  ["#e0a2f3", "#d669ed"], // pink-violet
  ["#f9819b", "#ec5b79"], // rose
];

function gradientFor(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) & 0x7fffffff;
  return PALETTE[h % PALETTE.length];
}

export const initials = (name?: string | null): string => {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

export function ChatAvatar({
  seed,
  name,
  image,
  src,
  size = 48,
  group = false,
  className = "",
}: {
  /** Deterministic color seed — username for people, chat id for groups. */
  seed: string;
  name: string;
  image?: string | null;
  /** Alias for `image` — an actual picture URL (dm partner / group / sender). */
  src?: string | null;
  size?: number;
  /** Render a group glyph when there is no name to derive initials from. */
  group?: boolean;
  className?: string;
}) {
  const px = `${size}px`;
  const pic = src ?? image;
  if (pic) {
    return (
      <img
        src={pic}
        alt={name}
        className={`shrink-0 rounded-full object-cover ${className}`}
        style={{ width: px, height: px }}
        draggable={false}
      />
    );
  }
  const [from, to] = gradientFor(seed || name);
  const text = initials(name);
  return (
    <span
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold text-white ${className}`}
      style={{
        width: px,
        height: px,
        fontSize: size * 0.38,
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
      title={name}
    >
      {group && text === "?" ? <Users style={{ width: size * 0.5, height: size * 0.5 }} /> : text}
    </span>
  );
}
