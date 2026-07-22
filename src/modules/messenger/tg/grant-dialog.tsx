// Telegram bridge — "grant chat access" dialog. An ADMIN opens this from a chat's
// context menu (a chat-list row or the chat header ⋯ menu) to give a specific
// AIBA user access to THIS corporate Telegram chat: pick the user (same server
// user-search the grants admin panel uses), choose read-only or read/write, and
// grant. Employees have no Telegram of their own — they only work the corporate
// account's chats they've been granted, so this is the doorway that opens one.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, KeyRound, Loader2, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { cn } from "@/shared/lib/utils";
import { useDebounced, useUserSearch, type UserHit } from "../api";
import { ChatAvatar } from "../avatar";
import { useAddTgGrant, useTgGrants } from "./api";

export function TgGrantDialog({
  accountId,
  chatId,
  onClose,
}: {
  accountId: number;
  chatId: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  // Picked AIBA user + live server search (debounced), mirroring the grants panel.
  const [picked, setPicked] = useState<UserHit | null>(null);
  const [query, setQuery] = useState("");
  // Access level — read-only is the safer default; the admin opts into writing.
  const [canWrite, setCanWrite] = useState(false);

  // `includeSelf` — granting a chat to YOUR OWN AIBA account is legitimate here
  // (the "new chat" picker excludes you, this one must not).
  const userHits = useUserSearch(useDebounced(query, 300), true);
  const grants = useTgGrants(accountId);
  const add = useAddTgGrant();

  // Already granted this exact (chat, user) pair? Block a confusing re-grant.
  const isDuplicate = useMemo(() => {
    if (!picked) return false;
    return (grants.data ?? []).some(
      (g) => g.tgChatId === chatId && g.username === picked.username,
    );
  }, [grants.data, chatId, picked]);

  const canSubmit = !!picked && !isDuplicate && !add.isPending;

  const submit = () => {
    if (!picked) return;
    add.mutate(
      { accountId, tgChatId: chatId, username: picked.username, canWrite },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-5 text-primary" />
            {tr("grantAccess", "Ruxsat berish")}
          </DialogTitle>
          <DialogDescription>
            {tr(
              "grantDialogSubtitle",
              "AIBA foydalanuvchisiga ushbu suhbatga kirish huquqini bering",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* user picker — reuses the messenger user-search hook */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {tr("selectUser", "Foydalanuvchini tanlang")}
            </label>
            {picked ? (
              <div className="flex items-center gap-2.5 rounded-xl border bg-background px-2.5 py-2">
                <ChatAvatar seed={picked.username} name={picked.name} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{picked.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    @{picked.username}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                  aria-label={tr("clear", "Tozalash")}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <div className="rounded-xl border bg-background">
                <div className="flex items-center gap-2 border-b px-2.5">
                  <Search className="size-3.5 shrink-0 text-muted-foreground" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={tr("grants.searchUser", "Foydalanuvchi qidirish")}
                    className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    autoFocus
                  />
                </div>
                <div className="max-h-52 overflow-y-auto p-1">
                  {!query.trim() ? (
                    <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                      {tr("grants.typeToSearch", "Qidirish uchun yozing")}
                    </div>
                  ) : userHits.isLoading ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (userHits.data ?? []).length === 0 ? (
                    <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                      {tr("grants.noUsers", "Foydalanuvchi topilmadi")}
                    </div>
                  ) : (
                    (userHits.data ?? []).map((u) => (
                      <button
                        key={u.username}
                        type="button"
                        onClick={() => setPicked(u)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                      >
                        <ChatAvatar seed={u.username} name={u.name} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{u.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            @{u.username}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* access level — read-only vs read/write */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {tr("accessLevel", "Ruxsat darajasi")}
            </label>
            <RadioGroup
              value={canWrite ? "write" : "read"}
              onValueChange={(v) => setCanWrite(v === "write")}
              className="gap-2"
            >
              <label
                onClick={() => setCanWrite(false)}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                  !canWrite && "border-primary bg-primary/5",
                )}
              >
                <RadioGroupItem value="read" className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{tr("canRead", "Faqat o'qish")}</span>
                  <span className="block text-xs text-muted-foreground">
                    {tr("canReadHint", "Suhbatni ko'radi, lekin javob yoza olmaydi")}
                  </span>
                </span>
              </label>
              <label
                onClick={() => setCanWrite(true)}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                  canWrite && "border-primary bg-primary/5",
                )}
              >
                <RadioGroupItem value="write" className="mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {tr("canWrite", "O'qish va yozish")}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {tr("canWriteHint", "Suhbatni ko'radi va uning nomidan javob yoza oladi")}
                  </span>
                </span>
              </label>
            </RadioGroup>
          </div>

          {isDuplicate && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              {tr("grants.duplicate", "Bu foydalanuvchiga ushbu suhbat allaqachon ochilgan")}
            </p>
          )}
          {add.isError && (
            <p className="text-xs text-destructive">
              {tr("grants.addError", "Ruxsat berishda xatolik yuz berdi")}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {tr("cancel", "Bekor qilish")}
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {add.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" />
            )}
            {tr("grants.grant", "Ruxsat berish")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
