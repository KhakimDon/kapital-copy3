/**
 * Floating bottom-right toasts — mirrors cloud `.aiba-av-1c-toast` and
 * `.aiba-av-mining-toast`. Two banners, stacked:
 *
 *   - 1C sync banner   — shown while the "1C bilan tekshirish" POST is
 *                        in flight. Closes automatically when polling
 *                        completes, or on user click.
 *   - AI mining banner — shown while AI auto-classify is queueing rows.
 *                        Carries a progress bar (0–100%) and a sub-line
 *                        with the current step ("Pattern + embedding
 *                        sync"). Auto-fades when complete.
 *
 * In the poc neither dispatcher exists, so both banners are short-lived
 * UI affordances driven by the calling page's mutation lifecycle. The
 * shapes match cloud so wiring a real dispatcher later is a drop-in.
 */
import { useEffect, useState } from "react";
import { Brain, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/utils";

export function Sync1CBanner({
  open, onClose, title, sub,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  sub?: string;
}) {
  if (!open) return null;
  return (
    <aside className="fixed bottom-4 right-4 z-40 w-[320px] rounded-lg border border-info/30 bg-card p-3 shadow-lg">
      <div className="flex items-center gap-2">
        <RefreshCw className="size-4 animate-spin text-info" />
        <strong className="flex-1 text-sm">
          {title || "1C bilan sinxronlanmoqda..."}
        </strong>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-6 text-muted-foreground hover:text-foreground"
          aria-label="Yopish"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {sub || "Birinchi marta — bir necha o'n soniya olishi mumkin"}
      </div>
    </aside>
  );
}

export function MiningBanner({
  open, onClose, onRestart, title, sub, percent, meta,
}: {
  open: boolean;
  onClose: () => void;
  onRestart?: () => void;
  title?: string;
  sub?: string;
  percent?: number;
  meta?: string;
}) {
  // Animate the bar so the progress feels alive even when the value
  // hasn't changed yet (most "queued" responses arrive instantly).
  const [animated, setAnimated] = useState(0);
  useEffect(() => {
    if (!open) {
      setAnimated(0);
      return;
    }
    const target = Math.max(0, Math.min(100, Math.round(percent ?? 0)));
    if (target === animated) return;
    const t = window.setTimeout(() => setAnimated(target), 100);
    return () => window.clearTimeout(t);
  }, [open, percent, animated]);

  if (!open) return null;

  return (
    <aside className={cn(
      "fixed right-4 z-40 w-[320px] rounded-lg border border-primary/30 bg-card p-3 shadow-lg",
      "bottom-4",
    )}
    style={{ bottom: "calc(1rem + 96px)" }}
    >
      <div className="flex items-center gap-2">
        <Brain className="size-4 text-primary" />
        <strong className="flex-1 text-sm">
          {title || "AI 1C ma'lumotlarini o'rganmoqda..."}
        </strong>
        {onRestart && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRestart}
            className="size-6 text-muted-foreground hover:text-foreground"
            aria-label="Qayta boshlash"
            title="Qayta boshlash"
          >
            <RefreshCw className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-6 text-muted-foreground hover:text-foreground"
          aria-label="Yopish"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {sub || "Pattern + embedding sync"}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div
            className="h-1.5 rounded-full bg-primary transition-all duration-300"
            style={{ width: `${animated}%` }}
          />
        </div>
        <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
          {animated}%
        </span>
      </div>
      {meta && (
        <div className="mt-1 text-[11px] text-muted-foreground">{meta}</div>
      )}
    </aside>
  );
}
