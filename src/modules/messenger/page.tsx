// /messenger — Telegram-Web-A-structured chat: chat-list column, message
// pane and a toggleable info panel, all realtime over one WS. Tenant-wide
// (no company scoping); the open chat lives in `?chat=` so it survives
// refresh and works as the mobile list↔pane switch.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/shared/lib/utils";
import { useMe } from "@/shared/api/me";
import { useUrlState } from "@/shared/hooks/use-url-state";
import {
  appendMessage,
  bumpChatPreview,
  patchChat,
  patchMemberReadAt,
  patchMessage,
  invalidateChats,
  useChats,
  type Chat,
} from "./api";
import { useMessengerSocket, type ServerEvent } from "./ws";
import { autoEnablePush } from "./push";
import {
  useTgConfigured,
  useTgAccounts,
  useTgDialogs,
  useTgGrants,
  tgDialogsKey,
  tgMessagesKey,
  appendTgMessage,
  patchTgMessage,
  removeTgMessages,
  type TgDialog,
  type TgMessage,
} from "./tg/api";
import { useTgTyping } from "./tg/typing-store";
import { useTgSettings } from "./tg/settings-store";
import { TgWorkspace, type MsgMode } from "./tg/workspace";
import { TgChatPane } from "./tg/chat-pane";
import { playIncoming } from "./sound";
import { ChatList } from "./chat-list";
import { ChatPane } from "./chat-pane";
import { InfoPanel } from "./info-panel";
import { NewChatDialog } from "./new-chat";
import { CallOverlay } from "./call/call-overlay";
import { useCallStore } from "./call/call-store";
import { postRejectCall } from "./call/call-api";

const TYPING_TTL = 4000;

export function MessengerPage() {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.${k}`, { defaultValue: d });

  const me = useMe();
  const myUsername = me.data?.username ?? null;
  const qc = useQueryClient();

  const [chatId, setChatId] = useUrlState("chat", "");
  const chats = useChats();

  // Internal ⇄ Telegram mode. The TG surface only appears once the backend has
  // Telegram credentials configured.
  const isAdmin = !!(me.data?.is_admin || me.data?.is_superadmin);
  const tgConfigured = useTgConfigured();
  const [modeRaw, setMode] = useUrlState("mode", "internal");
  const mode: MsgMode = modeRaw === "tg" && tgConfigured.data ? "tg" : "internal";

  // ── Telegram chats opened to ME ────────────────────────────────────────────
  // Employees have no Telegram of their own — they only work the corporate
  // account's chats they've been GRANTED. So those surface right here in the
  // internal list instead of hiding behind the separate "Telegram" mode.
  const tgAccountId = useTgAccounts().data?.[0]?.id ?? null;
  const tgReady = !!tgConfigured.data && tgAccountId != null;
  const tgDialogsQ = useTgDialogs(tgReady ? tgAccountId : null);
  // Only an ADMIN may list grants; for everyone else the backend already filters
  // the dialog list down to exactly the chats granted to them.
  const tgGrantsQ = useTgGrants(tgReady && isAdmin ? tgAccountId : null);
  const myTgChats: TgDialog[] = useMemo(() => {
    const dialogs = tgDialogsQ.data ?? [];
    if (!isAdmin) return dialogs;
    if (!myUsername) return [];
    const mine = new Set(
      (tgGrantsQ.data ?? []).filter((g) => g.username === myUsername).map((g) => g.tgChatId),
    );
    return dialogs.filter((d) => mine.has(d.chatId));
  }, [tgDialogsQ.data, tgGrantsQ.data, isAdmin, myUsername]);
  // A granted Telegram chat opened INSIDE the internal messenger — the employee
  // works the group entirely from here; we never bounce them to the TG surface.
  const [tgChatRaw, setTgChatParam] = useUrlState("tgchat", "");
  const openTgChatId = tgChatRaw ? Number(tgChatRaw) : null;

  // If the user already granted notification permission (and hasn't opted out),
  // silently (re)subscribe on mount so a fresh push endpoint reaches the backend.
  useEffect(() => {
    void autoEnablePush();
  }, []);
  const activeChat: Chat | null = (chats.data ?? []).find((c) => c.id === chatId) ?? null;

  // Fresh chats snapshot for the stable WS handler (mute lookup on new message).
  const chatsRef = useRef(chats.data);
  chatsRef.current = chats.data;

  const [search, setSearch] = useState("");
  const [infoOpen, setInfoOpen] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newChatTab, setNewChatTab] = useState<"dm" | "group">("dm");
  const openNewChat = (tab: "dm" | "group" = "dm") => {
    setNewChatTab(tab);
    setNewChatOpen(true);
  };

  // typing: chatId → {name, until} (cleared 4s after the last event)
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});
  const typingTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    const timers = typingTimers.current;
    return () => {
      for (const id of timers.values()) clearTimeout(id);
      timers.clear();
    };
  }, []);

  const noteTyping = useCallback((cid: string, name: string) => {
    setTyping((m) => ({ ...m, [cid]: { name, until: Date.now() + TYPING_TTL } }));
    const timers = typingTimers.current;
    const prev = timers.get(cid);
    if (prev) clearTimeout(prev);
    timers.set(
      cid,
      setTimeout(() => {
        timers.delete(cid);
        setTyping((m) => {
          if (!m[cid] || m[cid].until > Date.now()) return m;
          const { [cid]: _gone, ...rest } = m;
          return rest;
        });
      }, TYPING_TTL + 50),
    );
  }, []);

  // Keep refs so the stable WS handler always sees fresh values.
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;
  const meRef = useRef(myUsername);
  meRef.current = myUsername;

  const onEvent = useCallback(
    (ev: ServerEvent) => {
      switch (ev.type) {
        case "message.new": {
          const msg = ev.data;
          appendMessage(qc, msg);
          const isOpen = chatIdRef.current === msg.chatId && document.hasFocus();
          const mine = msg.sender === meRef.current;
          bumpChatPreview(qc, msg, !mine && !isOpen);
          // Notification blip: incoming, chat not muted, and not the focused chat.
          const muted = (chatsRef.current ?? []).find((c) => c.id === msg.chatId)?.muted ?? false;
          if (!mine && !muted && !isOpen) playIncoming();
          // A message from someone clears their typing pill instantly.
          if (!mine) {
            setTyping((m) => {
              if (!m[msg.chatId]) return m;
              const { [msg.chatId]: _gone, ...rest } = m;
              return rest;
            });
          }
          break;
        }
        case "message.edit": {
          const msg = ev.data;
          patchMessage(qc, msg.chatId, msg.id, msg);
          break;
        }
        case "message.delete": {
          const d = ev.data;
          if (d.chatId && d.id) patchMessage(qc, d.chatId, d.id, { deleted: true, body: "", attachment: null });
          break;
        }
        case "chat.upsert":
          // The signal carries only {id} (create / update / member change /
          // delete). Refetch the authoritative list rather than merge a
          // partial object into the cache (which would leave a members-less
          // chat and crash rendering).
          invalidateChats(qc);
          break;
        case "read": {
          // Our own read on another device zeroes the badge; a peer's read
          // bumps their `readAt` so our outgoing ticks turn blue live.
          if (ev.data.username === meRef.current) patchChat(qc, ev.data.chatId, { unread: 0 });
          else patchMemberReadAt(qc, ev.data.chatId, ev.data.username, new Date().toISOString());
          break;
        }
        case "typing": {
          const d = ev.data;
          if (d.username !== meRef.current) noteTyping(d.chatId, d.name || d.username);
          break;
        }
        // ── calls ──────────────────────────────────────────────────────────
        case "call.ring": {
          const d = ev.data;
          const call = useCallStore.getState();
          // Busy → auto-reject the newcomer and keep the current call.
          if (call.status !== "idle") {
            void postRejectCall(d.callId).catch(() => {});
            break;
          }
          const chat = (chatsRef.current ?? []).find((c) => c.id === d.chatId);
          call.receiveIncoming({
            callId: d.callId,
            chatId: d.chatId,
            room: d.room,
            kind: d.kind,
            peer: { name: d.callerName || d.caller, avatar: d.callerAvatar ?? null },
            isGroup: chat?.kind === "group",
          });
          break;
        }
        case "call.accepted":
          // The peer picked up — the caller's outgoing session goes active.
          useCallStore.getState().markAccepted();
          break;
        case "call.rejected":
        case "call.ended":
        case "call.missed":
          // Any terminal signal for the live call tears it down.
          if (useCallStore.getState().callId === ev.data.callId) useCallStore.getState().reset();
          break;
        case "tg.message": {
          // New message in a bridged Telegram chat → merge it into the loaded
          // message pages (no full refetch, so scroll position is preserved) and
          // refresh the dialog list preview.
          const d = ev.data;
          appendTgMessage(qc, d.accountId, d.chatId, d.message);
          void qc.invalidateQueries({ queryKey: tgDialogsKey(d.accountId) });
          // Soft blip for an incoming (not our own) TG message, if the TG sound
          // pref is on. Reads the store imperatively to keep this handler stable.
          if (!d.message.out && useTgSettings.getState().soundOn) playIncoming();
          break;
        }
        case "tg.edit": {
          // A message was edited on Telegram → patch it in place.
          const d = ev.data;
          patchTgMessage(qc, d.accountId, d.chatId, d.message.id, d.message);
          void qc.invalidateQueries({ queryKey: tgDialogsKey(d.accountId) });
          break;
        }
        case "tg.delete": {
          // Message(s) deleted on Telegram → drop them from the loaded pages.
          const d = ev.data;
          removeTgMessages(qc, d.accountId, d.chatId, d.ids);
          void qc.invalidateQueries({ queryKey: tgDialogsKey(d.accountId) });
          break;
        }
        case "tg.read": {
          // Our outgoing messages were read up to maxId → refresh the dialog list
          // (unread badge) so the surface reflects the read state.
          void qc.invalidateQueries({ queryKey: tgDialogsKey(ev.data.accountId) });
          break;
        }
        case "tg.reaction": {
          // A message's reactions changed → patch just that message.
          const d = ev.data;
          patchTgMessage(qc, d.accountId, d.chatId, d.msgId, { reactions: d.reactions });
          break;
        }
        case "tg.typing": {
          // Someone is typing in a bridged TG chat. The backend can't name them
          // (a raw typing update carries no display name), so resolve it from the
          // cached messages by sender id; fall back to the generic hint.
          const d = ev.data;
          let name = d.name;
          if (!name && d.userId != null) {
            // The message cache is paginated (InfiniteData); scan its pages for a
            // message from this sender to resolve a display name.
            const cached = qc.getQueryData<{ pages: TgMessage[][] }>(
              tgMessagesKey(d.accountId, d.chatId),
            );
            for (const page of cached?.pages ?? []) {
              const hit = page.find((m) => m.senderId === d.userId);
              if (hit?.senderName) {
                name = hit.senderName;
                break;
              }
            }
          }
          useTgTyping.getState().note(d.accountId, d.chatId, d.userId, name);
          break;
        }
      }
    },
    [qc, noteTyping],
  );

  const sendTyping = useMessengerSocket(onEvent);

  const openChat = (id: string) => {
    setChatId(id);
    // Opening an AIBA chat closes any granted-Telegram chat shown in this pane.
    setTgChatParam("");
    setInfoOpen(false);
  };

  // Esc closes the open chat (Telegram-style) — but only when no input/textarea
  // is focused (the composer/search handle their own Esc first) and no dialog is
  // capturing it (Radix dialogs stop propagation before this bubbles to window).
  useEffect(() => {
    if (!chatId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (el as HTMLElement | null)?.isContentEditable) return;
      setChatId("");
      setInfoOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatId, setChatId]);

  const typingNames: Record<string, string> = {};
  for (const [cid, v] of Object.entries(typing)) typingNames[cid] = v.name;

  return (
    // Desktop: fill the tab's content box EXACTLY. The tab host renders pages
    // inside `absolute inset-0 overflow-auto` > `min-h-full p-6`, so absolutely
    // positioning against that (already-positioned) scroll container gives us
    // the true available height and bleeds through the p-6 — no `100dvh - <chrome>`
    // guess, which was short by the real chrome height and clipped the bottom.
    // Mobile keeps the viewport calc (its shell has its own chrome).
    <div className="relative -m-6 flex h-[calc(100dvh-56px)] gap-0 overflow-hidden md:absolute md:inset-0 md:m-0 md:h-auto">
      {mode === "tg" ? (
        <TgWorkspace isAdmin={isAdmin} onMode={setMode} />
      ) : (
        <>
      {/* LEFT — chat list (hidden on mobile when a chat is open) */}
      <aside
        className={cn(
          "tg-surface relative z-10 flex w-[26rem] max-w-full shrink-0 flex-col border-r border-[var(--color-borders)] bg-[var(--color-background)]",
          "max-md:w-full max-md:border-r-0",
          chatId && "max-md:hidden",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <ChatList
            chats={chats.data ?? []}
            activeId={chatId}
            me={myUsername}
            search={search}
            onSearch={setSearch}
            typing={typingNames}
            onSelect={openChat}
            onNewChat={openNewChat}
            onSwitchTg={tgConfigured.data ? () => setMode("tg") : undefined}
            tgChats={myTgChats}
            tgAccountId={tgAccountId}
            activeTgChatId={openTgChatId}
            onOpenTgChat={(id) => {
              // Open it right here in the internal messenger (NOT the TG surface).
              setTgChatParam(String(id));
              setChatId("");
            }}
          />
        </div>
      </aside>

      {/* MIDDLE — chat pane / empty state (over the chat wallpaper) */}
      <main
        className={cn(
          "tg-surface tg-wallpaper relative flex min-w-0 flex-1 flex-col",
          !chatId && openTgChatId == null && "max-md:hidden",
        )}
      >
        {openTgChatId != null && tgAccountId != null ? (
          // A granted corporate-Telegram group, worked ENTIRELY from here — the
          // full TG pane (messages, composer, stickers, media) inside the
          // internal messenger, no jump to a separate Telegram mode.
          <TgChatPane
            accountId={tgAccountId}
            chatId={openTgChatId}
            onBack={() => setTgChatParam("")}
            onOpenChat={(id) => setTgChatParam(String(id))}
          />
        ) : activeChat ? (
          <ChatPane
            chat={activeChat}
            me={myUsername}
            typingName={typingNames[activeChat.id] ?? null}
            onBack={() => {
              setChatId("");
              setInfoOpen(false);
            }}
            onToggleInfo={() => setInfoOpen((v) => !v)}
            sendTyping={sendTyping}
          />
        ) : (
          <div className="grid h-full place-items-center">
            <div className="flex flex-col items-center gap-2">
              <span className="rounded-full bg-black/35 px-4 py-1.5 text-sm text-white shadow-sm backdrop-blur">
                {tr("pickChat", "Suhbatni tanlang")}
              </span>
            </div>
          </div>
        )}

        {/* info panel as an overlay drawer below lg */}
        {infoOpen && activeChat && (
          <div className="absolute inset-0 z-30 flex justify-end lg:hidden">
            <button
              type="button"
              aria-label={tr("close", "Yopish")}
              onClick={() => setInfoOpen(false)}
              className="flex-1 bg-black/35 animate-in fade-in-0 duration-200"
            />
            <div className="tg-surface h-full w-[22rem] max-w-[90vw] shadow-2xl animate-in slide-in-from-right-4 fade-in-0 duration-200 ease-out motion-reduce:animate-none">
              <InfoPanel chat={activeChat} me={myUsername} onClose={() => setInfoOpen(false)} />
            </div>
          </div>
        )}
      </main>

      {/* RIGHT — static info panel on lg+ (glides in from the right) */}
      {infoOpen && activeChat && (
        <aside className="tg-surface panel-in relative z-10 hidden w-[22rem] shrink-0 lg:block">
          <InfoPanel chat={activeChat} me={myUsername} onClose={() => setInfoOpen(false)} />
        </aside>
      )}
        </>
      )}

      <NewChatDialog
        open={newChatOpen}
        initialTab={newChatTab}
        me={myUsername}
        onClose={() => setNewChatOpen(false)}
        onCreated={(chat) => {
          setNewChatOpen(false);
          openChat(chat.id);
        }}
      />

      {/* Global call UI — renders null while idle. */}
      <CallOverlay />
    </div>
  );
}
