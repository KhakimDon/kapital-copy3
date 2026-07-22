import {
  Bell,
  CalendarDays,
  ListChecks,
  Mail,
  MessageCircle,
  Send,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

/**
 * Maps a notification's source key (`icon`/`module`) to a macOS-style app tile:
 * a soft coloured rounded square with the source's glyph. Shared by the toast
 * host and the header bell so both read the same visual language.
 */
type Source = "messenger" | "telegram" | "tasks" | "calendar" | "mail" | "system";

// Solid, saturated gradients + white glyph — a real macOS "app icon" look
// (as opposed to soft tints), so the toast reads like a native notification.
const MAP: Record<Source, { Icon: typeof Bell; tile: string }> = {
  telegram: { Icon: Send, tile: "bg-gradient-to-b from-sky-400 to-blue-500 text-white" },
  messenger: { Icon: MessageCircle, tile: "bg-gradient-to-b from-sky-500 to-blue-600 text-white" },
  tasks: { Icon: ListChecks, tile: "bg-gradient-to-b from-violet-500 to-violet-600 text-white" },
  calendar: { Icon: CalendarDays, tile: "bg-gradient-to-b from-rose-500 to-red-500 text-white" },
  mail: { Icon: Mail, tile: "bg-gradient-to-b from-amber-400 to-orange-500 text-white" },
  system: { Icon: Bell, tile: "bg-gradient-to-b from-slate-500 to-slate-600 text-white" },
};

function resolve(source: string | undefined): { Icon: typeof Bell; tile: string } {
  return (source && MAP[source as Source]) || MAP.system;
}

/** The source app tile — a macOS app-icon squircle: saturated gradient, white
 *  glyph, hairline ring + soft shadow. Shared by the toast host and the bell. */
export function SourceIcon({
  source,
  className,
}: {
  source: string | undefined;
  className?: string;
}) {
  const { Icon, tile } = resolve(source);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-[26%] shadow-sm ring-1 ring-black/5 [&_svg]:size-[55%]",
        tile,
        className,
      )}
      aria-hidden="true"
    >
      <Icon />
    </span>
  );
}
