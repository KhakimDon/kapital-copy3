/**
 * AI Yordamchi (aichat) — top-level module page.
 *
 * Layout:
 *   ┌─ Header (Sparkles + title + active company hint)
 *   └─ 2-col panel
 *       ├─ <ChatList> sidebar (280px)  — Yangi suhbat, search, chat rows
 *       └─ <ChatPanel> main pane       — messages, SSE stream, composer
 *
 * Reads come from /api/v2/aichat (backend reads nc_uic). Sends are proxied
 * to settings.aiba_backend_url where the LLM + ~110 tools live.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Sparkles } from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { ChatList } from "./chat-list";
import { ChatPanel } from "./chat-panel";
import { useChats } from "./api";

export function AichatPage() {
  const { t } = useTranslation();
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;

  const [activeChatId, setActiveChatId] = React.useState<number | null>(null);

  // Resolve active chat's name from the chat-list cache so the header can
  // show it without a separate fetch. Updates as the chat list refetches
  // (e.g. after rename / first message / new chat).
  const { data: chats } = useChats();
  const activeChat = React.useMemo(
    () => chats?.items.find((c) => c.id === activeChatId) ?? null,
    [chats, activeChatId],
  );

  return (
    <div className="-mx-4 -my-4 sm:-mx-6 sm:-my-6">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-2.5">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="size-5 text-primary" />
          {t("modules.aichat.title")}
        </h1>
        {company?.name && (
          <span className="hidden text-xs text-muted-foreground sm:inline">
            {company.name}
          </span>
        )}
      </div>

      <div className="flex h-[calc(100vh-9rem)] min-h-[480px] overflow-hidden">
        <ChatList
          activeChatId={activeChatId}
          onSelect={setActiveChatId}
          companyId={companyId != null ? String(companyId) : null}
        />
        <ChatPanel
          chatId={activeChatId}
          chatName={activeChat?.name || ""}
          companyId={companyId != null ? String(companyId) : null}
          onDeleted={() => setActiveChatId(null)}
        />
      </div>
    </div>
  );
}
