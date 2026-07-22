import { useTranslation } from "react-i18next";
import { AlertCircle, Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { fmtSize } from "./lib";
import { useUploads } from "./uploads";

/** Proton-style transfer manager: a floating bottom-right panel listing every
 *  upload with a live progress bar; collapsible; clearable once finished. */
export function UploadManager() {
  const { t: tr } = useTranslation();
  const { items, minimized, toggleMinimized, clearFinished } = useUploads();
  if (!items.length) return null;

  const active = items.filter((i) => i.status === "queued" || i.status === "uploading");
  const failed = items.filter((i) => i.status === "error").length;
  const title = active.length
    ? tr("modules.files.uploadingN", { defaultValue: "Yuklanmoqda — {{n}} ta fayl", n: active.length })
    : failed
      ? tr("modules.files.uploadFailedN", { defaultValue: "{{n}} ta fayl yuklanmadi", n: failed })
      : tr("modules.files.uploadDone", { defaultValue: "Yuklash tugadi" });

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] overflow-hidden rounded-xl border bg-card shadow-2xl animate-in slide-in-from-bottom-4 fade-in-0 duration-200">
      <div className="flex items-center gap-2 border-b bg-muted/60 px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <button
          type="button"
          onClick={toggleMinimized}
          className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {minimized ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {active.length === 0 && (
          <button
            type="button"
            onClick={clearFinished}
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            title={tr("modules.files.close", { defaultValue: "Yopish" })}
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      {!minimized && (
        <div className="max-h-72 overflow-y-auto p-1.5">
          {items.map((it) => (
            <div key={it.id} className="rounded-lg px-2 py-1.5 hover:bg-muted/50">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[13px]">{it.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{fmtSize(it.size)}</span>
                {it.status === "done" && <Check className="size-3.5 shrink-0 text-green-600" />}
                {it.status === "error" && <AlertCircle className="size-3.5 shrink-0 text-destructive" />}
                {(it.status === "uploading" || it.status === "queued") && (
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{it.progress}%</span>
                )}
              </div>
              {it.status === "error" ? (
                <div className="mt-0.5 truncate text-[11px] text-destructive">{it.error}</div>
              ) : (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-200",
                      it.status === "done" ? "bg-green-500" : "bg-primary",
                    )}
                    style={{ width: `${it.status === "queued" ? 0 : it.progress}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
