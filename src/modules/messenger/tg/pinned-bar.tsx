// Telegram bridge — the pinned-messages bar under the chat header, ported from
// Telegram Web A's HeaderPinnedMessage (components/middle/panes/HeaderPinnedMessage
// .tsx + .module.scss). A floating rounded "island" that hovers directly below the
// MiddleHeader and shows the pinned count (as a "#N" title + a vertical navigation
// strip), the pinned message's preview, and jumps the scrollback to that message
// on click (cycling to the next pin on each subsequent click, like the real
// client's shift-click cycle).
//
// DEFENSIVE by design: the pinned messages come from the additive `useTgPinnedMessages`
// reader, which yields an EMPTY list until the backend ships `…/pinned`. With no
// pins this component renders `null`, so it neither shows nor affects layout — the
// backend fills the data later and the bar simply appears.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/shared/lib/utils";
import { useTgPinnedMessages, type TgPinnedMessage } from "./api";

type Tr = (k: string, d: string) => string;

/** Preview line for a pinned message — its text, or a media-kind label when the
 *  pin is media-only (mirrors the message-list's media fallbacks). */
function previewText(m: TgPinnedMessage, tr: Tr): string {
  if (m.text && m.text.trim()) return m.text.trim();
  switch (m.mediaType) {
    case "photo":
      return tr("mPhoto", "Rasm");
    case "document":
      return tr("mFile", "Hujjat");
    case "location":
      return tr("mLocation", "Joylashuv");
    case "webpage":
      return tr("mLink", "Havola");
    default:
      return tr("pinnedMessage", "Mahkamlangan xabar");
  }
}

/** Jump the loaded scrollback to a message and flash it — mirrors chat-pane's
 *  `jumpTo` so a pinned-bar click behaves exactly like a reply-quote click. When
 *  the message isn't in the DOM yet (not loaded), this is a no-op (safe). */
function jumpToMessage(msgId: number) {
  const el = document.querySelector<HTMLElement>(`[data-msgid="${msgId}"]`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  const bubble = el.querySelector<HTMLElement>(".tg-bubble");
  if (bubble) {
    bubble.classList.add("tg-bubble--match");
    window.setTimeout(() => bubble.classList.remove("tg-bubble--match"), 1000);
  }
}

export function TgPinnedBar({ accountId, chatId }: { accountId: number; chatId: number }) {
  const { t } = useTranslation();
  const tr: Tr = (k, d) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  // Which pin is currently shown; clicking advances through them (cycle).
  const [index, setIndex] = useState(0);

  const pinnedQ = useTgPinnedMessages(accountId, chatId);
  const items = pinnedQ.data ?? [];
  if (items.length === 0) return null;

  const count = items.length;
  const active = index % count;
  const current = items[active];
  // Newest pin is "#count"; older pins count down (matches Telegram's numbering).
  const number = count - active;
  // Cap the vertical nav strip so a chat with many pins keeps a tidy header.
  const segs = Math.min(count, 5);

  const onClick = () => {
    jumpToMessage(current.id);
    if (count > 1) setIndex((i) => (i + 1) % count);
  };

  return (
    <div className="MiddleHeaderPanes">
      <div className="HeaderPinnedMessageWrapper">
        <button
          type="button"
          className="pinnedMessage"
          onClick={onClick}
          aria-label={tr("pinnedMessage", "Mahkamlangan xabar")}
        >
          <span className="pinned-nav" aria-hidden="true">
            {Array.from({ length: segs }).map((_, i) => (
              <span key={i} className={cn("pinned-nav-bar", i === active % segs && "active")} />
            ))}
          </span>
          <span className="messageText">
            <span className="title">
              {count === 1
                ? tr("pinnedMessage", "Mahkamlangan xabar")
                : `${tr("pinnedMessage", "Mahkamlangan xabar")} #${number}`}
            </span>
            <span className="summary">{previewText(current, tr)}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
