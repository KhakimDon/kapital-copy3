// SymbolMenu — the tabbed emoji / stickers / GIFs popover above the composer's
// left button, ported from Telegram Web A's middle/composer/SymbolMenu.tsx +
// SymbolMenuFooter.tsx. It stacks a `.SymbolMenu-main` (the active tab's picker)
// over a `.SymbolMenu-footer` tab strip (Emoji / Stickers / GIFs) with a
// backspace/delete button on the emoji tab. Each picker owns its own search box.
// Esc / outside-click closes it (via the shared `wrapRef`, so a click on the
// trigger button isn't treated as "outside").
import { useEffect, useState } from "react";
import { Clapperboard, Delete, Smile, Sticker as StickerIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { EmojiPicker } from "./emoji-picker";
import { TgStickerPicker, type TgStickerItem } from "./sticker-picker";
import { TgGifPicker, type TgGifItem } from "./gif-picker";

export type SymbolTab = "emoji" | "stickers" | "gifs";

export function TgSymbolMenu({
  accountId,
  wrapRef,
  onEmojiSelect,
  onStickerSelect,
  onGifSelect,
  onRemoveSymbol,
  onClose,
  tr,
}: {
  accountId: number;
  /** Wrapper enclosing BOTH this popover and its trigger button. */
  wrapRef: React.RefObject<HTMLElement | null>;
  onEmojiSelect: (emoji: string) => void;
  onStickerSelect: (item: TgStickerItem) => void;
  onGifSelect: (item: TgGifItem) => void;
  /** Backspace: delete the char before the caret (emoji tab). */
  onRemoveSymbol: () => void;
  onClose: () => void;
  tr: (k: string, d: string) => string;
}) {
  const [tab, setTab] = useState<SymbolTab>("emoji");

  // Esc / outside-click closes (outside = beyond the shared wrapper).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      const w = wrapRef.current;
      if (w && e.target instanceof Node && !w.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose, wrapRef]);

  const TABS: { id: SymbolTab; icon: typeof Smile; key: string; d: string }[] = [
    { id: "emoji", icon: Smile, key: "emoji", d: "Emoji" },
    { id: "stickers", icon: StickerIcon, key: "stickers", d: "Stikerlar" },
    { id: "gifs", icon: Clapperboard, key: "gifs", d: "GIF" },
  ];

  return (
    <div role="dialog" aria-label={tr("emoji", "Emoji")} className="SymbolMenu tg-symbol-menu">
      <div className="SymbolMenu-main">
        {tab === "emoji" && <EmojiPicker embedded onPick={onEmojiSelect} onClose={onClose} />}
        {tab === "stickers" && (
          <TgStickerPicker accountId={accountId} onSelect={onStickerSelect} tr={tr} />
        )}
        {tab === "gifs" && <TgGifPicker accountId={accountId} onSelect={onGifSelect} tr={tr} />}
      </div>

      <div className="SymbolMenu-footer">
        <div className="symbol-tabs">
          {TABS.map(({ id, icon: Icon, key, d }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              title={tr(key, d)}
              aria-label={tr(key, d)}
              className={cn("symbol-tab-button", tab === id && "activated")}
            >
              <Icon className="size-[22px]" />
            </button>
          ))}
        </div>
        {tab === "emoji" && (
          <button
            type="button"
            onClick={onRemoveSymbol}
            title={tr("backspace", "O'chirish")}
            aria-label={tr("backspace", "O'chirish")}
            className="symbol-delete-button"
          >
            <Delete className="size-5" />
          </button>
        )}
      </div>
    </div>
  );
}
