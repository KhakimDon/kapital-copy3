// Bell toggle for the chat-list header — turns browser push notifications on
// or off. Hidden entirely on browsers that can't do Web Push. Reflects the
// live subscription + permission state so the icon always matches reality.
import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import {
  disablePush,
  enablePush,
  isPushEnabled,
  pushPermission,
  pushSupported,
} from "./push";

export function PushToggle({ tr }: { tr: (k: string, d: string) => string }) {
  const [supported] = useState(() => pushSupported());
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>(() => pushPermission());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let alive = true;
    void isPushEnabled().then((on) => {
      if (alive) setEnabled(on);
    });
    return () => {
      alive = false;
    };
  }, [supported]);

  if (!supported) return null;

  const denied = permission === "denied";
  const label = denied
    ? tr("notifBlocked", "Bildirishnomalar brauzerda bloklangan")
    : enabled
      ? tr("notifOn", "Bildirishnomalar yoqilgan")
      : tr("notifEnable", "Bildirishnomalarni yoqish");

  const onClick = async () => {
    if (busy || denied) return;
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
      } else {
        const ok = await enablePush();
        setEnabled(ok);
      }
      setPermission(pushPermission());
    } finally {
      setBusy(false);
    }
  };

  const Icon = denied ? BellOff : enabled ? Bell : BellRing;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || denied}
      title={label}
      aria-label={label}
      aria-pressed={enabled}
      className={cn(
        "relative grid size-10 shrink-0 place-items-center rounded-full transition-colors",
        denied
          ? "cursor-not-allowed text-muted-foreground/50"
          : enabled
            ? "text-[#3390ec] hover:bg-muted"
            : "text-muted-foreground hover:bg-muted",
      )}
    >
      <Icon className="size-5" />
      {/* attention dot when it's actionable but not yet on */}
      {!enabled && !denied && (
        <span className="absolute right-2 top-2 size-2 rounded-full bg-[#3390ec] ring-2 ring-background" />
      )}
    </button>
  );
}
