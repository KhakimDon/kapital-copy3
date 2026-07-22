// Telegram bridge — middle column, composed from the ported Telegram-Web-A
// pieces: a header (TgChatHeader) with an in-chat search toggle, the message
// scrollback in Telegram bubbles (TgMessageList — grouping, tails, date
// separators, media, animations, in-chat search, and our unique AIBA-author
// attribution), and a composer (TgComposer). Clicking the header title opens the
// chat's info panel (TgChatInfo); clicking a sender in a group opens that
// person's profile (TgUserProfile). Both slide in from the right.
//
// This file is the chat ORCHESTRATOR: it owns the reply/edit draft state and the
// per-message actions (reply / edit / delete / forward / react / pin / jump),
// exposed to the bubbles + their context menu via TgChatActionsProvider so the
// wiring doesn't have to thread through the message list. Because ONE corporate
// TG account is shared by many AIBA users, every message we send carries an
// `author` badge inside the bubble (handled in message-bubble.tsx).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useDeleteTgMessages,
  useForwardTgMessages,
  useJoinTgChat,
  useMarkTgRead,
  usePinTgMessage,
  useReactTgMessage,
  useTgDialogs,
  useTgMessages,
  useTgMuteChat,
  useTgPeer,
  type TgMessage,
} from "./api";
import { TgChatActionsProvider, type TgChatActions } from "./chat-actions";
import { TgChatHeader } from "./chat-header";
import { TgMessageList } from "./message-list";
import { TgNowPlayingBar } from "./now-playing";
import { TgComposer } from "./composer";
import { TgForwardDialog } from "./forward-picker";
import { TgDeleteMessageDialog } from "./delete-message-dialog";
import { TgChatInfo } from "./chat-info";
import { TgUserProfile } from "./chat-info";
import { useProfileIntent } from "./profile-intent";

// The right-side panel can show the chat's own info, or a clicked person's
// profile. `null` = closed.
type Panel = null | { kind: "chat" } | { kind: "user"; id: number | null; name: string };

export function TgChatPane({
  accountId,
  chatId,
  onBack,
  onOpenChat,
}: {
  accountId: number;
  chatId: number;
  onBack?: () => void;
  /** Switch the active conversation (e.g. tapping a profile's personal channel
   *  opens that channel). Wired to the workspace's chat selector. */
  onOpenChat?: (chatId: number) => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const msgsQ = useTgMessages(accountId, chatId);
  const dialogsQ = useTgDialogs(accountId);
  const markRead = useMarkTgRead();
  const deleteMsgs = useDeleteTgMessages();
  const reactMsg = useReactTgMessage();
  const pinMsg = usePinTgMessage();
  const forwardMsgs = useForwardTgMessages();
  const joinChat = useJoinTgChat();
  const muteChat = useTgMuteChat();

  const messages = useMemo(() => msgsQ.data ?? [], [msgsQ.data]);
  const dialog = useMemo(
    () => (dialogsQ.data ?? []).find((d) => d.chatId === chatId) ?? null,
    [dialogsQ.data, chatId],
  );

  // Posting rights decide composer vs Join / read-only bar. Users & bots always
  // get the composer; a megagroup ("group") needs membership; a broadcast
  // ("channel") needs admin rights — only admins post there. Defaults stay
  // permissive so DMs/groups and older backends keep the composer.
  const peerDetail = useTgPeer(accountId, chatId).data;
  const pkind = peerDetail?.kind ?? dialog?.kind ?? "user";
  // "Joined" = the chat is in our dialog list (i.e. we're subscribed). The backend
  // `left` flag is unreliable for a *previewed* public channel (getFullChannel/
  // resolveUsername can report left=false for a non-member), so trust the dialog
  // list: a channel/group we're a member of appears there, a previewed one doesn't.
  const joined =
    peerDetail?.kind === "channel" || peerDetail?.kind === "group" ? !!dialog : true;
  const canManage =
    peerDetail?.kind === "channel" || peerDetail?.kind === "group"
      ? !!peerDetail.canManage
      : false;
  // A read-only GRANT (this AIBA user may view but not send here) overrides all
  // posting rights — the backend rejects sends too. `canWrite === false` is the
  // explicit read-only signal; undefined (admin / older backend) means allowed.
  const readOnlyGrant = dialog?.canWrite === false;
  const canPost =
    !readOnlyGrant && (pkind === "channel" ? canManage : pkind === "group" ? joined : true);

  const [panel, setPanel] = useState<Panel>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  // Composer drafts: replying to / editing a message (mutually exclusive).
  const [replyTo, setReplyTo] = useState<TgMessage | null>(null);
  const [editing, setEditing] = useState<TgMessage | null>(null);
  // Forward flow: the message chosen to forward (opens the chat picker).
  const [forwarding, setForwarding] = useState<TgMessage | null>(null);
  // Delete flow: the message pending deletion — the dialog asks "for me" vs
  // "for everyone" (Telegram's revoke), instead of a bare browser confirm().
  const [deleting, setDeleting] = useState<TgMessage | null>(null);

  // Fresh messages for the stable resolveMessage/jumpTo callbacks.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Clear the unread badge (TG-side + our dialog list) once per chat open, and
  // reset the panel / search / drafts when switching chats.
  useEffect(() => {
    markRead.mutate({ accountId, chatId });
    // If the user arrived here by tapping a chat-list avatar, open the info panel
    // straight away (Telegram behaviour); otherwise reset it on chat switch.
    if (useProfileIntent.getState().chatId === chatId) {
      useProfileIntent.getState().clear();
      setPanel({ kind: "chat" });
    } else {
      setPanel(null);
    }
    setSearchOpen(false);
    setReplyTo(null);
    setEditing(null);
    setForwarding(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, chatId]);

  // Scroll a message into view + flash it (used by a reply-quote click).
  const jumpTo = useCallback((msgId: number) => {
    const el = document.querySelector<HTMLElement>(`[data-msgid="${msgId}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    const bubble = el.querySelector<HTMLElement>(".tg-bubble");
    if (bubble) {
      bubble.classList.add("tg-bubble--match");
      window.setTimeout(() => bubble.classList.remove("tg-bubble--match"), 1000);
    }
  }, []);

  const actions = useMemo<TgChatActions>(
    () => ({
      accountId,
      chatId,
      reply: (msg) => {
        setEditing(null);
        setReplyTo(msg);
      },
      edit: (msg) => {
        setReplyTo(null);
        setEditing(msg);
      },
      remove: (msg) => setDeleting(msg),
      forward: (msg) => setForwarding(msg),
      react: (msg, emoji) => reactMsg.mutate({ accountId, chatId, msgId: msg.id, emoji }),
      pin: (msg) => pinMsg.mutate({ accountId, chatId, msgId: msg.id, pinned: !msg.pinned }),
      jumpTo,
      resolveMessage: (msgId) => messagesRef.current.find((m) => m.id === msgId),
    }),
    // tr/deleteMsgs/reactMsg/pinMsg are stable enough; re-create only on chat change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountId, chatId, jumpTo],
  );

  return (
    <TgChatActionsProvider value={actions}>
      <div className="relative flex h-full min-w-0 flex-1 flex-col">
        <TgChatHeader
          accountId={accountId}
          chatId={chatId}
          dialog={dialog}
          onBack={onBack}
          onOpenInfo={() => setPanel((p) => (p?.kind === "chat" ? null : { kind: "chat" }))}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
        />

        {/* Now-playing bar — shows while a voice/audio message is playing (like
            Telegram's AudioPlayer header). Self-hides when nothing plays. */}
        <TgNowPlayingBar />

        <TgMessageList
          accountId={accountId}
          chatId={chatId}
          messages={messages}
          isLoading={msgsQ.isLoading}
          hasOlder={!!msgsQ.hasNextPage}
          loadingOlder={msgsQ.isFetchingNextPage}
          loadOlder={() => {
            if (msgsQ.hasNextPage && !msgsQ.isFetchingNextPage) void msgsQ.fetchNextPage();
          }}
          unreadCount={dialog?.unread ?? 0}
          searchOpen={searchOpen}
          onSearchOpenChange={setSearchOpen}
          onOpenProfile={(id, name) => setPanel({ kind: "user", id, name })}
        />

        {canPost ? (
          <TgComposer
            accountId={accountId}
            chatId={chatId}
            replyTo={replyTo}
            editing={editing}
            onCancelReply={() => setReplyTo(null)}
            onCancelEdit={() => setEditing(null)}
            onSent={() => {
              setReplyTo(null);
              setEditing(null);
            }}
          />
        ) : readOnlyGrant ? (
          // This AIBA user has READ-ONLY access to the corporate chat → no
          // composer, just an honest note (the backend rejects sends too).
          <div className="tg-chat-actionbar">
            <span className="tg-chat-actionbar-note">
              {tr("readOnlyNote", "Sizda faqat o'qish ruxsati")}
            </span>
          </div>
        ) : !joined ? (
          // Not a member → a full-width Join button (real Telegram's bottom bar
          // for a channel/group you're only previewing).
          <div className="tg-chat-actionbar">
            <button
              type="button"
              className="tg-chat-actionbar-btn"
              disabled={joinChat.isPending}
              onClick={() => joinChat.mutate({ accountId, chatId })}
            >
              {joinChat.isPending
                ? tr("joining", "Qo'shilmoqda…")
                : pkind === "channel"
                  ? tr("joinChannel", "Kanalga obuna bo'lish")
                  : tr("joinGroup", "Guruhga qo'shilish")}
            </button>
          </div>
        ) : (
          // A joined broadcast channel we can't post to → the Mute/Unmute toggle,
          // exactly like Telegram (no composer for non-admins).
          <div className="tg-chat-actionbar">
            <button
              type="button"
              className="tg-chat-actionbar-btn tg-chat-actionbar-btn--subtle"
              disabled={muteChat.isPending}
              onClick={() => muteChat.mutate({ accountId, chatId, muted: !dialog?.muted })}
            >
              {dialog?.muted ? tr("unmute", "Ovozni yoqish") : tr("mute", "Ovozsiz qilish")}
            </button>
          </div>
        )}

        {/* Info / profile panel — slides in from the right over the chat. */}
        {panel && (
          <div className="absolute inset-0 z-30 flex justify-end">
            <button
              type="button"
              aria-label={tr("close", "Yopish")}
              onClick={() => setPanel(null)}
              className="flex-1 animate-in bg-black/35 fade-in-0 duration-200"
            />
            <div className="h-full animate-in shadow-2xl slide-in-from-right-4 fade-in-0 duration-200 ease-out motion-reduce:animate-none">
              {panel.kind === "chat" ? (
                <TgChatInfo
                  accountId={accountId}
                  chatId={chatId}
                  dialog={dialog}
                  onClose={() => setPanel(null)}
                  onOpenChat={onOpenChat}
                />
              ) : (
                <TgUserProfile
                  accountId={accountId}
                  id={panel.id}
                  name={panel.name}
                  onClose={() => setPanel(null)}
                  onOpenChat={onOpenChat}
                />
              )}
            </div>
          </div>
        )}

        {/* Forward → pick a destination chat. */}
        {forwarding && (
          <TgForwardDialog
            accountId={accountId}
            dialogs={dialogsQ.data ?? []}
            onClose={() => setForwarding(null)}
            onPick={(toChatId) => {
              forwardMsgs.mutate({ accountId, chatId, toChatId, ids: [forwarding.id] });
              setForwarding(null);
            }}
          />
        )}

        {/* Delete → "for me" vs "for everyone" (Telegram's revoke). Revoking is
            offered for our OWN messages, and for anyone's when we can manage the
            chat (admin) — matching Telegram's rules. */}
        <TgDeleteMessageDialog
          open={!!deleting}
          canRevoke={!!deleting?.out || canManage}
          onCancel={() => setDeleting(null)}
          onDelete={(revoke) => {
            if (deleting) {
              deleteMsgs.mutate({ accountId, chatId, ids: [deleting.id], revoke });
            }
            setDeleting(null);
          }}
        />
      </div>
    </TgChatActionsProvider>
  );
}
