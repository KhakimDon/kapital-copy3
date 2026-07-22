/**
 * Left sidebar: Yangi suhbat button + search + scrollable list of chats.
 *
 * Cloud parity: each row shows chat name (truncated), relative time
 * (Hozir / N daqiqa oldin / Bugun HH:MM / Kecha / dd.MM.yyyy), and a 3-dot
 * popover menu with Tahrirlash / O'chirish actions on hover. Active chat
 * highlighted via bg-sidebar-accent.
 */
import * as React from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/shared/lib/utils";
import { useUrlSearch } from "@/shared/hooks/use-url-state";
import { type ChatRow, relativeTimeUz, useChats, useCreateChat, useDeleteChat, useRenameChat } from "./api";

type Props = {
  activeChatId: number | null;
  onSelect: (chatId: number | null) => void;
  companyId?: string | number | null;
};

export function ChatList({ activeChatId, onSelect, companyId }: Props) {
  const { t } = useTranslation();
  const [search, committedSearch, setSearch] = useUrlSearch("q");
  const { data, isLoading, isError } = useChats();
  const createMut = useCreateChat();
  const deleteMut = useDeleteChat();
  const renameMut = useRenameChat();

  const [renameTarget, setRenameTarget] = React.useState<ChatRow | null>(null);
  const [renameVal, setRenameVal] = React.useState("");
  const [confirmDel, setConfirmDel] = React.useState<ChatRow | null>(null);

  const items = data?.items ?? [];
  const q = committedSearch.trim().toLowerCase();
  const filtered = q
    ? items.filter((c) => (c.name || "").toLowerCase().includes(q))
    : items;

  const handleNew = async () => {
    try {
      const fresh = await createMut.mutateAsync({
        name: "",
        company_id: companyId != null ? String(companyId) : null,
      });
      onSelect(fresh.id);
    } catch {
      // toast UI not present — silent fallback; mutation error surfaces via react-query state
    }
  };

  const startRename = (c: ChatRow) => {
    setRenameTarget(c);
    setRenameVal(c.name || "");
  };
  const submitRename = async () => {
    if (!renameTarget) return;
    const name = renameVal.trim();
    if (!name || name === renameTarget.name) {
      setRenameTarget(null);
      return;
    }
    await renameMut.mutateAsync({ chatId: renameTarget.id, name });
    setRenameTarget(null);
  };

  const confirmDelete = async () => {
    if (!confirmDel) return;
    const target = confirmDel;
    setConfirmDel(null);
    await deleteMut.mutateAsync(target.id);
    if (activeChatId === target.id) onSelect(null);
  };

  return (
    <aside className="flex w-[280px] shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="space-y-2 border-b border-border p-3">
        <Button
          onClick={handleNew}
          disabled={createMut.isPending}
          className="w-full justify-center gap-2"
          size="default"
        >
          {createMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          <span>{t("modules.aichat.newChat")}</span>
        </Button>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("modules.aichat.searchPlaceholder")}
            className="pl-8"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            <span>Yuklanmoqda…</span>
          </div>
        ) : isError ? (
          <div className="p-6 text-center text-sm text-destructive">
            Suhbatlarni yuklab bo'lmadi
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
            <MessageSquare className="size-5 opacity-50" />
            <span>{q ? "Hech narsa topilmadi" : "Hali suhbat yo'q"}</span>
          </div>
        ) : (
          <ul className="space-y-0.5 p-2">
            {filtered.map((c) => (
              <ChatRowItem
                key={c.id}
                chat={c}
                active={activeChatId === c.id}
                onSelect={() => onSelect(c.id)}
                onRename={() => startRename(c)}
                onDelete={() => setConfirmDel(c)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Rename dialog (use shadcn Dialog rather than inline input — cleaner). */}
      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Suhbat nomini o'zgartirish</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitRename();
              if (e.key === "Escape") setRenameTarget(null);
            }}
            placeholder="Yangi nom"
            maxLength={255}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setRenameTarget(null)}>
              Bekor qilish
            </Button>
            <Button size="sm" onClick={submitRename} disabled={renameMut.isPending}>
              {renameMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "Saqlash"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!confirmDel} onOpenChange={(open) => !open && setConfirmDel(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Suhbatni o'chirish</DialogTitle>
            <DialogDescription>
              "{confirmDel?.name || t("modules.aichat.newChatLabel")}" — barcha xabarlar bilan o'chiriladi. Buni qaytarib bo'lmaydi.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDel(null)}>
              Bekor qilish
            </Button>
            <Button variant="destructive" size="sm" onClick={confirmDelete} disabled={deleteMut.isPending}>
              {deleteMut.isPending ? <Loader2 className="size-4 animate-spin" /> : "O'chirish"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function ChatRowItem({
  chat,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  chat: ChatRow;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const name = chat.name?.trim() || t("modules.aichat.newChatLabel");
  const ts = relativeTimeUz(chat.updated_at || chat.created_at);
  return (
    <li className="group relative">
      <Button
        variant="ghost"
        onClick={onSelect}
        className={cn(
          "flex h-auto w-full items-start justify-start gap-2 rounded-md px-2.5 py-2 text-left text-sm font-normal transition-colors",
          active
            ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent"
            : "text-foreground hover:bg-sidebar-accent/60",
        )}
      >
        <MessageSquare className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-medium leading-tight">{name}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{ts}</div>
        </div>
      </Button>

      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Amallar"
            className={cn(
              "absolute right-1 top-1.5 size-7 rounded-md text-muted-foreground transition-opacity",
              menuOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100",
              "hover:bg-muted hover:text-foreground",
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-44 p-1">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setMenuOpen(false);
              onRename();
            }}
            className="flex h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal hover:bg-muted"
          >
            <Pencil className="size-4" />
            Tahrirlash
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setMenuOpen(false);
              onDelete();
            }}
            className="flex h-auto w-full justify-start gap-2 rounded-md px-2 py-1.5 text-left text-sm font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
            O'chirish
          </Button>
        </PopoverContent>
      </Popover>
    </li>
  );
}
