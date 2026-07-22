/**
 * Right-side chat panel: header (editable name + Eksport / O'chirish actions)
 * + scrollable messages list (user/assistant/widget) + bottom input.
 *
 * Streaming model — incoming SSE events build up an "ephemeral" assistant
 * bubble in component state. On `event: end`, react-query refetches the chat
 * (the backend persists the final text + widgets), and the ephemeral
 * disappears as the canonical history takes over. While streaming the input
 * is disabled and a Stop button replaces Send.
 *
 * Widget rendering is delegated to <WidgetRenderer/> (chat-widgets.tsx — owned
 * by a parallel agent). To avoid breaking before that file lands, we import
 * lazily and degrade to a JSON pre-block if the module is missing.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Send, StopCircle, Trash2, Sparkles, Pencil, Check, X, Loader2, Bot, User as UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import { MdRenderer } from "./md-renderer";
import {
  type MessageRow, useChatMessages, useDeleteChat, useRenameChat, streamMessage,
} from "./api";

// Widget rendering — delegated to chat-widgets.tsx. The sibling's
// WidgetRenderer takes { widget_type, widget_json }; we adapt to
// { type, data } so the chat panel can call <Widget type=... data=... />
// uniformly. Lazy-loaded so the widget bundle splits out.
type WidgetProps = { type: string; data: unknown };
const WidgetRenderer: React.LazyExoticComponent<React.ComponentType<WidgetProps>> = React.lazy(async () => {
  try {
    const mod = await import("./chat-widgets");
    const Sibling = mod?.WidgetRenderer;
    if (Sibling) {
      const Adapted: React.FC<WidgetProps> = ({ type, data }) => (
        <Sibling widget_type={type} widget_json={data} />
      );
      Adapted.displayName = "WidgetRendererAdapter";
      return { default: Adapted };
    }
  } catch {
    /* fall through to fallback */
  }
  return { default: FallbackWidget };
});

function FallbackWidget({ type, data }: WidgetProps) {
  return (
    <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
      <div className="mb-1 font-semibold text-muted-foreground">{type}</div>
      <pre className="overflow-x-auto text-[11px] leading-snug text-foreground">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}

type Props = {
  chatId: number | null;
  chatName: string;
  companyId?: string | number | null;
  onDeleted: () => void;
};

// In-flight assistant bubble carries optional widgets emitted before the
// final text so the user sees them in the order the cloud renders.
type EphemeralAssistant = {
  text: string;
  widgets: { type: string; data: unknown }[];
  statusMessage?: string; // last tool-status hint
  errorMessage?: string;  // stream failure surface (HTTP/422 detail etc.)
};

export function ChatPanel({ chatId, chatName, companyId, onDeleted }: Props) {
  const qc = useQueryClient();
  const msgsQuery = useChatMessages(chatId);
  const deleteMut = useDeleteChat();
  const renameMut = useRenameChat();

  const [draft, setDraft] = React.useState("");
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = React.useRef<HTMLDivElement | null>(null);

  const [streaming, setStreaming] = React.useState(false);
  const [eph, setEph] = React.useState<EphemeralAssistant | null>(null);
  // Pending user bubble — shown immediately on send so the conversation feels
  // responsive even before the backend echoes back the persisted message.
  const [pendingUser, setPendingUser] = React.useState<string | null>(null);
  const ctrlRef = React.useRef<AbortController | null>(null);

  // Inline rename
  const [renaming, setRenaming] = React.useState(false);
  const [renameVal, setRenameVal] = React.useState(chatName);
  React.useEffect(() => setRenameVal(chatName), [chatName]);

  const [confirmDel, setConfirmDel] = React.useState(false);

  // Auto-grow textarea + auto-scroll on new messages.
  React.useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [draft]);

  const messages = msgsQuery.data?.items ?? [];

  React.useEffect(() => {
    // Auto-scroll to bottom when message list grows or ephemeral updates.
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, eph?.text, eph?.widgets.length, pendingUser]);

  // If chatId changes mid-stream, abort the previous stream.
  React.useEffect(() => {
    return () => {
      ctrlRef.current?.abort();
    };
  }, [chatId]);

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || streaming) return;
    setDraft("");
    setStreaming(true);
    setPendingUser(text);
    setEph({ text: "", widgets: [], statusMessage: undefined });

    // Last 20 history turns for context (user + assistant content only).
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-20)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    let createdChatId = chatId;
    try {
      const { ctrl, done } = await streamMessage(
        {
          chat_id: chatId ?? 0,
          content: text,
          company_id: companyId != null ? String(companyId) : null,
          history,
        },
        {
          onStart: (cid) => {
            createdChatId = cid;
          },
          onDelta: (chunk) => {
            setEph((cur) => (cur ? { ...cur, text: cur.text + chunk, statusMessage: undefined } : cur));
          },
          onStatus: (_tool, message) => {
            setEph((cur) => (cur ? { ...cur, statusMessage: message } : cur));
          },
          onWidget: (type, data) => {
            setEph((cur) =>
              cur ? { ...cur, widgets: [...cur.widgets, { type, data }] } : cur,
            );
          },
          onEnd: () => {
            // Refresh canonical history + chat list (updated_at moved this
            // chat to the top, and name may have been auto-derived from the
            // first user message on a fresh chat).
            qc.invalidateQueries({ queryKey: ["aichat", "chats"] });
            if (createdChatId) {
              qc.invalidateQueries({ queryKey: ["aichat", "messages", createdChatId] });
            }
            setStreaming(false);
            setEph(null);
            setPendingUser(null);
            ctrlRef.current = null;
          },
          onError: (err) => {
            setStreaming(false);
            // Keep the pending user bubble visible so the user knows their
            // message wasn't lost (just not delivered). Surface the cause
            // inside the ephemeral bubble — never silently disappear.
            setEph((cur) => (cur
              ? { ...cur, errorMessage: err.message }
              : { text: "", widgets: [], errorMessage: err.message }
            ));
          },
        },
      );
      ctrlRef.current = ctrl;
      await done;
    } catch (e) {
      setStreaming(false);
      // DO NOT clear pendingUser — leave the user's text visible on screen
      // so they can copy/edit/resend. onError above already populated
      // ephemeral.errorMessage; if the throw bypassed it (network abort
      // before onError fired), fall back to a generic notice.
      setEph((cur) => {
        const msg = (e as Error)?.message || "Tarmoq xatosi";
        return cur
          ? { ...cur, errorMessage: cur.errorMessage || msg }
          : { text: "", widgets: [], errorMessage: msg };
      });
      ctrlRef.current = null;
    }
  };

  const handleStop = () => {
    ctrlRef.current?.abort();
    setStreaming(false);
    // Keep ephemeral text visible — it gets cleared on next send anyway.
  };

  const submitRename = async () => {
    if (!chatId) return;
    const name = renameVal.trim();
    if (!name || name === chatName) {
      setRenaming(false);
      return;
    }
    await renameMut.mutateAsync({ chatId, name });
    setRenaming(false);
  };

  const handleDelete = async () => {
    if (!chatId) return;
    setConfirmDel(false);
    await deleteMut.mutateAsync(chatId);
    onDeleted();
  };

  // Empty-state when no chat is selected.
  if (!chatId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
        <Sparkles className="size-10 opacity-60" />
        <div className="text-sm">
          Chap tarafdan suhbat tanlang yoki <span className="font-medium">"Yangi suhbat"</span> tugmasini bosing.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col min-w-0 bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        {renaming ? (
          <div className="flex flex-1 items-center gap-1.5">
            <Input
              autoFocus
              value={renameVal}
              onChange={(e) => setRenameVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              maxLength={255}
              className="h-8"
            />
            <Button size="icon" variant="ghost" onClick={submitRename} disabled={renameMut.isPending}>
              {renameMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            </Button>
            <Button size="icon" variant="ghost" onClick={() => setRenaming(false)}>
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setRenaming(true)}
              className="group flex h-auto min-w-0 flex-1 items-center justify-start gap-2 px-0 py-0 text-left font-normal hover:bg-transparent [&_svg]:size-3.5"
              title="Tahrirlash uchun bosing"
            >
              <span className="truncate text-base font-semibold">{chatName || "Yangi suhbat"}</span>
              <Pencil className="size-3.5 opacity-0 transition-opacity group-hover:opacity-50" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmDel(true)}
            >
              <Trash2 className="size-4" />
              <span className="hidden sm:inline">O'chirish</span>
            </Button>
          </>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {msgsQuery.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Yuklanmoqda…</span>
          </div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            {messages.length === 0 && !pendingUser && !eph && (
              <EmptyChat />
            )}
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {pendingUser && (
              <UserBubble content={pendingUser} />
            )}
            {eph && (
              <AssistantBubble
                text={eph.text}
                widgets={eph.widgets}
                statusMessage={eph.statusMessage}
                errorMessage={eph.errorMessage}
                streaming={streaming}
                onRetry={() => {
                  // Pop the failed user text back into the composer so the
                  // user can edit + retry without re-typing.
                  if (pendingUser) {
                    setDraft(pendingUser);
                    setPendingUser(null);
                    setEph(null);
                  }
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-border bg-background p-3">
        <div className="mx-auto flex max-w-3xl items-end gap-2">
          <Textarea
            ref={taRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={streaming}
            placeholder={streaming ? "Yozayapti…" : "Savolingizni yozing… (Enter — yuborish, Shift+Enter — yangi qator)"}
            rows={1}
            className={cn(
              "min-h-[42px] max-h-[200px] flex-1 resize-none rounded-lg border-2 border-input bg-background px-3 py-2.5 text-[15px]",
              "ring-offset-background placeholder:text-muted-foreground",
              "focus-visible:border-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-1",
              "disabled:cursor-not-allowed disabled:opacity-70",
            )}
          />
          {streaming ? (
            <Button
              type="button"
              variant="destructive"
              size="icon"
              onClick={handleStop}
              title="To'xtatish"
              className="size-[42px]"
            >
              <StopCircle className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={handleSend}
              disabled={!draft.trim()}
              title="Yuborish"
              className="size-[42px]"
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
        {streaming && eph?.statusMessage && (
          <div className="mx-auto mt-1.5 flex max-w-3xl items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <span>{eph.statusMessage}</span>
          </div>
        )}
      </div>

      <Dialog open={confirmDel} onOpenChange={setConfirmDel}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Suhbatni o'chirish</DialogTitle>
            <DialogDescription>
              "{chatName || "Yangi suhbat"}" — barcha xabarlar bilan o'chiriladi. Buni qaytarib bo'lmaydi.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDel(false)}>
              Bekor qilish
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "O'chirish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// --- bubbles ----------------------------------------------------------------

function EmptyChat() {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
      <Sparkles className="size-10 opacity-60" />
      <div className="space-y-1">
        <div className="text-base font-medium text-foreground">AI Yordamchi tayyor</div>
        <div className="text-sm">
          Hujjat, soliq, bank yoki kontragent haqida so'rang.
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: MessageRow }) {
  const { role, content, widget_type, widget_json } = message;

  if (role === "widget" || widget_type) {
    return (
      <div className="flex items-start gap-2">
        <BotAvatar />
        <div className="min-w-0 max-w-[calc(100%-2.5rem)] flex-1">
          <React.Suspense fallback={<div className="text-xs text-muted-foreground">Yuklanmoqda…</div>}>
            <WidgetRenderer type={String(widget_type || "")} data={widget_json} />
          </React.Suspense>
        </div>
      </div>
    );
  }

  if (role === "user") return <UserBubble content={content} />;
  if (role === "assistant") return <AssistantBubble text={content} widgets={[]} streaming={false} />;
  // 'tool' / 'system' — usually hidden from the cloud UI; render nothing.
  return null;
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex items-start justify-end gap-2">
      <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-primary px-4 py-2 text-[14px] text-primary-foreground">
        <MdRenderer source={content} className="aiba-md" />
      </div>
      <UserAvatar />
    </div>
  );
}

function AssistantBubble({
  text,
  widgets,
  statusMessage,
  errorMessage,
  streaming,
  onRetry,
}: {
  text: string;
  widgets: { type: string; data: unknown }[];
  statusMessage?: string;
  errorMessage?: string;
  streaming: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <BotAvatar />
      <div className="min-w-0 max-w-[calc(100%-2.5rem)] flex-1 space-y-2">
        {widgets.map((w, i) => (
          <React.Suspense key={i} fallback={null}>
            <WidgetRenderer type={w.type} data={w.data} />
          </React.Suspense>
        ))}
        {text || streaming || statusMessage ? (
          <div className="rounded-2xl rounded-tl-md border border-border bg-card px-4 py-2 text-[14px] text-card-foreground">
            {text ? (
              <MdRenderer source={text} className="aiba-md" />
            ) : statusMessage ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                <span>{statusMessage}</span>
              </div>
            ) : streaming ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                <span>Yozayapti…</span>
              </div>
            ) : null}
            {streaming && text && (
              <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-muted-foreground/60 align-middle" />
            )}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-2xl rounded-tl-md border border-destructive/40 bg-destructive/5 px-4 py-2 text-[13px] text-destructive">
            <div className="font-medium">Yuborib bo'lmadi</div>
            <div className="mt-0.5 text-[12px] opacity-90">{errorMessage}</div>
            {onRetry ? (
              <Button
                type="button"
                variant="link"
                onClick={onRetry}
                className="mt-1.5 h-auto justify-start p-0 text-[12px] font-semibold text-destructive underline-offset-2 hover:underline"
              >
                Qayta urinib ko'rish
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BotAvatar() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Bot className="size-4" />
    </div>
  );
}
function UserAvatar() {
  return (
    <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <UserIcon className="size-4" />
    </div>
  );
}
