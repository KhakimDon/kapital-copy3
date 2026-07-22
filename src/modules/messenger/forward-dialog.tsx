// Forward dialog — a searchable list of the current user's chats. Picking a
// chat forwards every queued message id into it (server broadcasts message.new
// to the target), then closes. Opened from the bubble context menu (single
// message) or the selection action bar (many).
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { chatDisplayTitle, chatPartner, useChats, useForwardMessage, type Chat } from "./api";
import { ChatAvatar } from "./avatar";

export function ForwardDialog({
  open,
  me,
  messageIds,
  onClose,
  onDone,
}: {
  open: boolean;
  me: string | null | undefined;
  /** Messages to forward (in send order). */
  messageIds: string[];
  onClose: () => void;
  /** Fired after a successful forward with the target chat + how many went. */
  onDone?: (chatId: string, count: number) => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.${k}`, { defaultValue: d });

  const chats = useChats();
  const forward = useForwardMessage();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = chats.data ?? [];
    if (!needle) return list;
    return list.filter((c) => chatDisplayTitle(c, me).toLowerCase().includes(needle));
  }, [chats.data, q, me]);

  const pick = async (chat: Chat) => {
    if (busyId || messageIds.length === 0) return;
    setBusyId(chat.id);
    try {
      for (const id of messageIds) {
        await forward.mutateAsync({ id, toChatId: chat.id });
      }
      onDone?.(chat.id, messageIds.length);
      setQ("");
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setQ("");
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle>
            {tr("forwardTitle", "Yo'naltirish")}
            {messageIds.length > 1 && (
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                ({messageIds.length})
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex h-10 items-center gap-2 rounded-full bg-muted px-3.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tr("forwardSearch", "Suhbat qidirish")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        <div className="max-h-80 min-h-24 overflow-y-auto">
          {chats.isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-6 text-center text-sm text-muted-foreground">
              {tr("noChats", "Suhbatlar topilmadi")}
            </div>
          ) : (
            filtered.map((chat) => {
              const title = chatDisplayTitle(chat, me);
              const partner = chatPartner(chat, me);
              const busy = busyId === chat.id;
              return (
                <button
                  key={chat.id}
                  type="button"
                  disabled={!!busyId}
                  onClick={() => void pick(chat)}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted disabled:opacity-60"
                >
                  <ChatAvatar
                    seed={chat.kind === "dm" ? (partner?.username ?? chat.id) : chat.id}
                    name={title}
                    image={chat.avatar}
                    size={40}
                    group={chat.kind === "group"}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                  {busy && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
