// A one-shot cross-component signal: "open the profile panel for this chat".
// The chat LIST and the chat PANE are siblings (workspace), so tapping a row's
// avatar can't reach the pane's local panel state directly. The avatar sets the
// intent + navigates to the chat; the pane, on arriving at that chat, opens its
// info panel and clears the intent. Matches Telegram (avatar tap → profile).
import { create } from "zustand";

type ProfileIntent = {
  /** The chatId whose profile should open once its pane mounts, else null. */
  chatId: number | null;
  open: (chatId: number) => void;
  clear: () => void;
};

export const useProfileIntent = create<ProfileIntent>((set) => ({
  chatId: null,
  open: (chatId) => set({ chatId }),
  clear: () => set({ chatId: null }),
}));
