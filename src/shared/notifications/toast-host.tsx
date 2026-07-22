import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useTabs } from "@/shared/store/tabs";
import { useMarkNotificationsRead, type NotificationItem } from "@/shared/api/notifications";
import { useToastStore } from "./store";
import { SourceIcon } from "./icon-map";

/** How long a toast stays before auto-dismissing (paused while hovered). */
const AUTO_DISMISS_MS = 7000;
/** Exit animation duration — keep in sync with the CSS transition below. */
const EXIT_MS = 220;
/** Max cards shown at once; the rest wait as a subtle "+N" hint. */
const VISIBLE = 4;

/** Compact relative time — "hozir" / "2m" / "3h" / "1d". */
function relTime(iso: string | null, nowLabel: string): string {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 60_000) return nowLabel;
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

/**
 * macOS-style toast host — a fixed top-right stack of notification cards fed by
 * the toast store (pushed by the notifications socket). Newest on top; auto-
 * dismiss with hover-to-pause; click the body to open the deep link + mark read;
 * click the X to dismiss the toast only (it stays in the bell / server history).
 */
export function NotificationsToastHost() {
  const { t } = useTranslation();
  const toast = useToastStore((s) => s.toast);
  const dismiss = useToastStore((s) => s.dismiss);
  const open = useTabs((s) => s.open);
  const markRead = useMarkNotificationsRead();

  if (toast.length === 0) return null;

  const visible = toast.slice(0, VISIBLE);
  const overflow = toast.length - visible.length;

  const onOpen = (n: NotificationItem) => {
    if (n.link) open(n.link);
    else if (n.taskId) open(`/tasks?card=${n.taskId}`);
    markRead.mutate(n.id);
    dismiss(n.id);
  };

  return (
    <div
      className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[384px] max-w-[calc(100vw-2rem)] flex-col gap-2.5"
      aria-live="polite"
      role="region"
    >
      {visible.map((n) => (
        <ToastCard
          key={n.id}
          item={n}
          nowLabel={t("notifications.now", { defaultValue: "hozir" })}
          closeLabel={t("notifications.dismiss", { defaultValue: "Yopish" })}
          onOpen={() => onOpen(n)}
          onDismiss={() => dismiss(n.id)}
        />
      ))}
      {overflow > 0 && (
        <div className="pointer-events-none flex justify-center">
          <span className="rounded-full bg-foreground/10 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur-sm">
            {t("notifications.more", { defaultValue: "+{{n}} ta", n: overflow })}
          </span>
        </div>
      )}
    </div>
  );
}

function ToastCard({
  item,
  nowLabel,
  closeLabel,
  onOpen,
  onDismiss,
}: {
  item: NotificationItem;
  nowLabel: string;
  closeLabel: string;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  // Enter animation: mount off-screen, then flip `shown` on next frame.
  const [shown, setShown] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Play the exit animation, THEN remove from the store.
  const close = () => {
    if (leaving) return;
    clearTimer();
    setLeaving(true);
    exitRef.current = setTimeout(onDismiss, EXIT_MS);
  };

  const startTimer = () => {
    clearTimer();
    timerRef.current = setTimeout(close, AUTO_DISMISS_MS);
  };

  useEffect(() => {
    const raf = requestAnimationFrame(() => setShown(true));
    startTimer();
    return () => {
      cancelAnimationFrame(raf);
      clearTimer();
      if (exitRef.current) clearTimeout(exitRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      onMouseEnter={clearTimer}
      onMouseLeave={startTimer}
      className={cn(
        // macOS notification: soft squircle, frosted/vibrant background, a large
        // diffuse low-opacity shadow, hairline border. Airy padding.
        "group pointer-events-auto relative flex cursor-pointer items-center gap-3.5 rounded-[22px] p-3.5 pr-4 text-left",
        "border border-black/[0.06] bg-white/80 text-neutral-900 shadow-[0_16px_50px_-12px_rgba(0,0,0,0.28)] backdrop-blur-2xl backdrop-saturate-150",
        "dark:border-white/10 dark:bg-neutral-800/80 dark:text-neutral-50",
        "transition-all duration-300 ease-out will-change-transform motion-reduce:transition-none",
        "hover:shadow-[0_22px_60px_-12px_rgba(0,0,0,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        shown && !leaving ? "translate-x-0 opacity-100" : "translate-x-[115%] opacity-0",
      )}
    >
      <SourceIcon source={item.icon || item.module} className="size-11" />

      <div className="min-w-0 flex-1 pr-8">
        <div className="truncate text-[15px] font-semibold leading-tight">{item.title}</div>
        {item.body && (
          <div className="mt-1 line-clamp-2 text-[13px] leading-snug text-neutral-500 dark:text-neutral-400">
            {item.body}
          </div>
        )}
      </div>

      {/* Top-right slot: relative time, replaced by the close (X) on hover. */}
      <span className="absolute right-4 top-3.5 text-xs tabular-nums text-neutral-400 transition-opacity group-hover:opacity-0 dark:text-neutral-500">
        {relTime(item.createdAt, nowLabel)}
      </span>
      <button
        type="button"
        aria-label={closeLabel}
        onClick={(e) => {
          e.stopPropagation();
          close();
        }}
        className={cn(
          "absolute right-2 top-2 flex size-6 items-center justify-center rounded-full",
          "bg-foreground/5 text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground",
          "group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
