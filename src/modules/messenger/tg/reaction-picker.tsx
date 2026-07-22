// Full reaction picker for the Telegram surface — a faithful port of the real
// Telegram Web A ("A" client) ReactionPicker (middle/message/reactions/
// ReactionPicker.tsx): the floating popover the quick-reaction strip's
// "show more" chevron opens. It carries the reference's two-surface structure —
// a unicode-emoji tab (searchable, categorised) + a custom-emoji tab — inside a
// bubble that floats over the message, anchored to the chevron and clamped to
// the viewport.
//
// The unicode tab reuses this module's own EmojiPicker (search + category strip
// + grid, already a 1:1 EmojiPicker port); its bordered card chrome is stripped
// by reaction-picker.css so it merges into the picker shell. The custom-emoji
// tab renders a graceful empty state: Telegram gates custom-emoji reactions
// behind Premium + per-chat reaction sets, neither of which the backend surfaces
// yet (see the module report). Picking a unicode emoji calls `onPick`, which the
// menu turns into a toggle-reaction against the message.
//
// Renders through a portal to <body>; the portal wrapper carries `tg-surface`
// so the scoped `.tg-surface .tg-reaction-picker…` rules match AND the
// `--color-*` / `--tg-*` tokens resolve (both defined on `.tg-surface`).
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Sticker } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { EmojiPicker } from "./emoji-picker";
import "./reaction-picker.css";

type Tr = (k: string, d: string) => string;

export function TgReactionPicker({
  x,
  y,
  mine,
  tr,
  onPick,
  onClose,
}: {
  /** Anchor (viewport coords) — the "show more" chevron's position. */
  x: number;
  y: number;
  /** Own message → the anchoring menu is right-aligned, so pivot from the right. */
  mine: boolean;
  tr: Tr;
  /** A unicode emoji was chosen — the menu toggles it as a reaction. */
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tab, setTab] = useState<"emoji" | "custom">("emoji");
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

  // Clamp the popover to the viewport (offsetWidth/Height are the untransformed
  // layout box, so the clamp stays accurate through the open animation).
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const pad = 8;
    // own → right-anchored (grow leftwards from the chevron), peer → left-anchored
    let left = mine ? x - width : x;
    let top = y + 6;
    if (left + width + pad > window.innerWidth) left = window.innerWidth - width - pad;
    if (left < pad) left = pad;
    if (top + height + pad > window.innerHeight) top = Math.max(pad, y - height - 6);
    if (top < pad) top = pad;
    setPos({ left, top });
  }, [x, y, mine]);

  // Esc closes. The EmojiPicker already handles Esc for the unicode tab (capture
  // + stopPropagation, so this non-capture listener won't double-fire there);
  // this covers the custom tab, where the EmojiPicker isn't mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="tg-surface fixed inset-0 z-[70]"
      onMouseDown={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={wrapRef}
        style={{ left: pos.left, top: pos.top }}
        onMouseDown={(e) => e.stopPropagation()}
        className={cn("tg-reaction-picker", mine ? "from-right" : "from-left")}
      >
        <div className="tg-reaction-picker__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "emoji"}
            className={cn("tg-reaction-picker__tab", tab === "emoji" && "active")}
            onClick={() => setTab("emoji")}
          >
            {tr("reactionsTabEmoji", "Emoji")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "custom"}
            className={cn("tg-reaction-picker__tab", tab === "custom" && "active")}
            onClick={() => setTab("custom")}
          >
            {tr("reactionsTabCustom", "Maxsus")}
          </button>
        </div>

        {tab === "emoji" ? (
          // The unicode EmojiPicker: search + category tabs + grid. `embedded`
          // drops its standalone card chrome and defers close/outside to us (this
          // picker's backdrop + Esc own that), so it slots cleanly under the tabs.
          <div className="tg-reaction-picker__body">
            <EmojiPicker embedded onPick={onPick} onClose={onClose} />
          </div>
        ) : (
          <div className="tg-reaction-picker__custom-empty" role="tabpanel">
            <Sticker />
            <div>{tr("reactionsCustomEmpty", "Maxsus emoji reaksiyalari hozircha mavjud emas")}</div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
