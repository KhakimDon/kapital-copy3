/**
 * Floating "AI Yordamchi" button — global, bottom-right.
 *
 * Replaces the TanStack Query devtools palm-tree position. Click opens a
 * right-edge Sheet hosting the same <ChatList> + <ChatPanel> as `/aichat`,
 * so the assistant is reachable from every screen (mirrors cloud's `.aic-fab`
 * → `.aic-win` behavior — see cloud-os/.../aiba_integration/js/ai-chat.js).
 *
 * Hides itself on `/aichat` to avoid duplicating the page-level chat UI.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, Maximize2, Minimize2 } from "lucide-react";
import { useCompany } from "@/shared/store/company";
import { useTabs } from "@/shared/store/tabs";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/lib/utils";
import { ChatList } from "./chat-list";
import { ChatPanel } from "./chat-panel";
import { useChats } from "./api";

export function ChatFab() {
  const { t } = useTranslation();
  // Active tab path — the shell renders outside any Router, so no useLocation.
  const tabs = useTabs((s) => s.tabs);
  const activeId = useTabs((s) => s.activeId);
  const activePath = tabs.find((x) => x.id === activeId)?.path ?? "";

  const [open, setOpen] = React.useState(false);
  const [maximised, setMaximised] = React.useState(false);
  const company = useCompany((s) => s.current);
  const companyId = company?.id ?? null;
  const [activeChatId, setActiveChatId] = React.useState<number | null>(null);

  // Resolve active chat name from the list cache (the same hook the page uses).
  const { data: chats } = useChats();
  const activeChat = React.useMemo(
    () => chats?.items.find((c) => c.id === activeChatId) ?? null,
    [chats, activeChatId],
  );

  // Hide on the dedicated chat page — checked after hooks to keep order stable.
  if (activePath.startsWith("/aichat")) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => setOpen(true)}
        aria-label={t("modules.aichat.title")}
        className={cn(
          "fixed bottom-6 right-6 z-50 h-auto rounded-full px-5 py-3 [&_svg]:size-5",
          "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 hover:text-primary-foreground",
          "transition-all duration-200 ease-out",
          "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/40",
          "active:translate-y-0 active:scale-95",
          // Hide while the sheet is open so it doesn't peek through the overlay.
          open ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        <Sparkles className="size-5" />
        <span className="hidden text-sm font-semibold sm:inline">{t("modules.aichat.title")}</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className={cn(
            "flex flex-col gap-0 p-0",
            // Maximised → full-screen overlay; normal → ~640px right rail.
            maximised
              ? "w-full sm:max-w-full"
              : "w-full sm:max-w-[640px] md:max-w-[720px]",
          )}
        >
          <header className="flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-2.5">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Sparkles className="size-5 text-primary" />
              {t("modules.aichat.title")}
              {company?.name && (
                <span className="hidden text-xs font-normal text-muted-foreground sm:inline">
                  · {company.name}
                </span>
              )}
            </h2>
            {/* Sheet's default close X sits at right-4 top-4; we slot the
                maximise toggle beside it. */}
            <Button
              size="icon"
              variant="ghost"
              className="mr-8 size-8"
              title={maximised ? t("common.close") : t("common.open")}
              onClick={() => setMaximised((m) => !m)}
            >
              {maximised ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </Button>
          </header>

          <div className="flex min-h-0 flex-1 overflow-hidden">
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
        </SheetContent>
      </Sheet>
    </>
  );
}
