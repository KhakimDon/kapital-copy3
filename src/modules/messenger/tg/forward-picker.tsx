// Forward destination picker — a modal listing the account's dialogs so a
// message can be forwarded to another chat. Kept intentionally small: search +
// a scrollable dialog list; picking a row forwards immediately.
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/utils";
import { ChatAvatar } from "../avatar";
import { KindGlyph } from "./shared";
import type { TgDialog } from "./api";

export function TgForwardDialog({
  accountId,
  dialogs,
  onPick,
  onClose,
}: {
  accountId: number;
  dialogs: TgDialog[];
  onPick: (toChatId: number) => void;
  onClose: () => void;
}) {
  void accountId;
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.tg.${k}`, { defaultValue: d });
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return dialogs;
    return dialogs.filter((d) => d.title.toLowerCase().includes(s));
  }, [dialogs, q]);

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        className="tg-surface flex max-h-[80vh] w-[26rem] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--tg-border)] bg-[var(--tg-panel)] shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-[var(--tg-border)] p-3">
          <span className="flex-1 text-[15px] font-semibold text-[var(--tg-text)]">
            {tr("forwardTo", "Kimga yo'naltirish")}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr("close", "Yopish")}
            className="grid size-8 place-items-center rounded-full text-[var(--tg-text-secondary)] hover:bg-[var(--tg-hover)]"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-2.5">
          <div className="flex h-9 items-center gap-2 rounded-full bg-[var(--tg-secondary)] px-3.5">
            <Search className="size-[18px] shrink-0 text-[var(--tg-text-secondary)]" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tr("search", "Qidirish")}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-[var(--tg-text)] outline-none placeholder:text-[var(--tg-placeholder)]"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-[var(--tg-text-secondary)]">
              {tr("noResults", "Hech narsa topilmadi")}
            </div>
          ) : (
            filtered.map((d) => (
              <button
                key={d.chatId}
                type="button"
                onClick={() => onPick(d.chatId)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--tg-hover)]",
                )}
              >
                <div className="relative shrink-0">
                  <ChatAvatar seed={String(d.chatId)} name={d.title || "?"} size={42} group={d.kind !== "user"} />
                  <span className="absolute -bottom-0.5 -right-0.5 grid size-[16px] place-items-center rounded-full border-2 border-[var(--tg-panel)] bg-[var(--tg-secondary)] text-[var(--tg-text-secondary)]">
                    <KindGlyph kind={d.kind} className="size-2.5" />
                  </span>
                </div>
                <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-[var(--tg-text)]">
                  {d.title}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
