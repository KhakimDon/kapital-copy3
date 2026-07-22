// Dashboard widget contributed by the Messenger module: chats with unread
// messages. Consumed by the dashboard registry.
import { MessageSquare } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  WidgetCard,
  EmptyRow,
  ListSkeleton,
  type WidgetDef,
} from "@/modules/dashboard/widget-kit";
import { useChats, chatDisplayTitle } from "./api";

function MessagesWidget() {
  const { t } = useTranslation();
  const q = useChats();
  const unreadChats = (q.data ?? []).filter((c) => c.unread > 0);
  const totalUnread = unreadChats.reduce((n, c) => n + c.unread, 0);
  return (
    <WidgetCard
      title={t("modules.dashboard.widget.messages", { defaultValue: "Xabarlar" })}
      icon={<MessageSquare className="size-4" />}
      footer={
        <Link to="/messenger" className="hover:underline">
          {t("modules.dashboard.footer.goToMessenger", { defaultValue: "Messenjerga o'tish" })}
        </Link>
      }
    >
      {q.isLoading ? (
        <ListSkeleton rows={3} />
      ) : !unreadChats.length ? (
        <EmptyRow text={t("modules.dashboard.empty.noUnread", { defaultValue: "O'qilmagan xabar yo'q" })} />
      ) : (
        <>
          <div className="mb-2 flex items-baseline gap-2">
            <span className="text-2xl font-semibold tabular-nums leading-tight">{totalUnread}</span>
            <span className="text-xs text-muted-foreground">
              {t("modules.dashboard.labels.unread", { defaultValue: "o'qilmagan" })}
            </span>
          </div>
          <ul className="space-y-1.5 animate-in fade-in-0 duration-300">
            {unreadChats.slice(0, 3).map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium text-foreground">{chatDisplayTitle(c, null)}</div>
                  {c.lastMessage && (
                    <div className="truncate text-muted-foreground">
                      {c.lastMessage.body || c.lastMessage.senderName}
                    </div>
                  )}
                </div>
                <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                  {c.unread}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </WidgetCard>
  );
}

export const WIDGETS: WidgetDef[] = [
  {
    type: "messages",
    module: "messenger",
    titleKey: "modules.dashboard.widget.messages",
    title: "Xabarlar",
    icon: MessageSquare,
    defaultColspan: 1,
    Component: MessagesWidget,
  },
];
