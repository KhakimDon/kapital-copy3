// Live "typing…" indicators for the Telegram surface. The messenger WS handler
// (page.tsx) writes incoming `tg.typing` events here; TgChatHeader subscribes to
// its chat's entry to show the hint. Entries self-expire after a TTL (Telegram
// clears a typing state ~5s after the last signal), so a chat that goes quiet
// stops showing the hint even without an explicit "stopped" event.
import { create } from "zustand";

const TTL = 5000;

export const typingKey = (accountId: number, chatId: number) => `${accountId}:${chatId}`;

type Entry = { userId: number | null; name: string | null; until: number };

type TypingState = {
  /** `${accountId}:${chatId}` → the people currently typing there. */
  byChat: Record<string, Entry[]>;
  note: (accountId: number, chatId: number, userId: number | null, name: string | null) => void;
};

export const useTgTyping = create<TypingState>((set, get) => ({
  byChat: {},
  note: (accountId, chatId, userId, name) => {
    const k = typingKey(accountId, chatId);
    const now = Date.now();
    set((s) => {
      const list = (s.byChat[k] ?? []).filter((e) => e.until > now && e.userId !== userId);
      list.push({ userId, name, until: now + TTL });
      return { byChat: { ...s.byChat, [k]: list } };
    });
    // Sweep this chat's expired entries once the TTL elapses.
    setTimeout(() => {
      const s = get();
      const cur = s.byChat[k] ?? [];
      const alive = cur.filter((e) => e.until > Date.now());
      if (alive.length !== cur.length) set({ byChat: { ...s.byChat, [k]: alive } });
    }, TTL + 60);
  },
}));
