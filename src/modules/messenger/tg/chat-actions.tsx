// Per-chat message actions, provided by chat-pane and consumed deep in the tree
// (message bubbles + their context menu) via context — so the action wiring
// doesn't have to thread through message-list. Every handler takes the target
// TgMessage; the provider (chat-pane) owns the reply/edit state + the api hooks.
import { createContext, useContext } from "react";
import type { TgMessage } from "./api";

export type TgChatActions = {
  accountId: number;
  chatId: number;
  /** Start replying to this message (opens the composer reply strip). */
  reply: (msg: TgMessage) => void;
  /** Start editing this (own, text) message (opens the composer in edit mode). */
  edit: (msg: TgMessage) => void;
  /** Delete this message (confirms, then revokes for everyone when allowed). */
  remove: (msg: TgMessage) => void;
  /** Forward this message to another chat (opens the forward picker). */
  forward: (msg: TgMessage) => void;
  /** Toggle a quick reaction on this message (emoji, or null to clear). */
  react: (msg: TgMessage, emoji: string | null) => void;
  /** Pin / unpin this message in the chat. */
  pin: (msg: TgMessage) => void;
  /** Scroll to a message by id (used by a reply-quote click). */
  jumpTo: (msgId: number) => void;
  /** Look up a loaded message by id (to build a reply-quote preview when the
   *  backend didn't inline the quoted text). */
  resolveMessage: (msgId: number) => TgMessage | undefined;
};

const noop = () => {};
const TgChatActionsContext = createContext<TgChatActions>({
  accountId: 0,
  chatId: 0,
  reply: noop,
  edit: noop,
  remove: noop,
  forward: noop,
  react: noop,
  pin: noop,
  jumpTo: noop,
  resolveMessage: () => undefined,
});

export const TgChatActionsProvider = TgChatActionsContext.Provider;

export function useTgChatActions(): TgChatActions {
  return useContext(TgChatActionsContext);
}
