// Minimal self-contained snackbar for the mail module (the app has no global
// toast system). `mailToast(msg)` pushes a toast; `<MailToaster/>` (mounted once
// by MailPage) renders them bottom-center via a portal so they float above the
// compose dialog. Auto-dismisses; click to dismiss early.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";

type ToastKind = "success" | "error";
type Toast = { id: number; message: string; kind: ToastKind };

let toasts: Toast[] = [];
let listeners: Array<(t: Toast[]) => void> = [];
let counter = 1;

function emit() {
  for (const l of listeners) l(toasts);
}

/** Show a snackbar. Returns the toast id. */
export function mailToast(message: string, kind: ToastKind = "success", ttl = 3500): number {
  const id = counter++;
  toasts = [...toasts, { id, message, kind }];
  emit();
  window.setTimeout(() => dismiss(id), ttl);
  return id;
}

function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function MailToaster() {
  const [items, setItems] = useState<Toast[]>(toasts);
  useEffect(() => {
    const l = (t: Toast[]) => setItems([...t]);
    listeners.push(l);
    return () => {
      listeners = listeners.filter((x) => x !== l);
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[200] flex flex-col items-center gap-2">
      {items.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cn(
            "pointer-events-auto flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-sm font-medium text-white shadow-lg",
            "animate-in fade-in slide-in-from-bottom-2",
            t.kind === "success" ? "bg-neutral-900 dark:bg-neutral-800" : "bg-red-600",
          )}
        >
          {t.kind === "success" ? (
            <CheckCircle2 className="size-4 text-green-400" />
          ) : (
            <AlertCircle className="size-4" />
          )}
          <span>{t.message}</span>
          <X className="size-3.5 opacity-50" />
        </button>
      ))}
    </div>,
    document.body,
  );
}
