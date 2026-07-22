// New-chat dialog — two tabs: pick a user for a dm (server dedupes), or a
// group with title + multi-select member search.
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/shared/lib/utils";
import { useCreateChat, useDebounced, useUserSearch, type Chat, type UserHit } from "./api";
import { ChatAvatar } from "./avatar";

export function NewChatDialog({
  open,
  initialTab = "dm",
  me,
  onClose,
  onCreated,
}: {
  open: boolean;
  /** Which tab to focus when the dialog opens (menu "new group" vs "new dm"). */
  initialTab?: "dm" | "group";
  me: string | null | undefined;
  onClose: () => void;
  onCreated: (chat: Chat) => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.${k}`, { defaultValue: d });

  const create = useCreateChat();

  const [tab, setTab] = useState<"dm" | "group">(initialTab);

  // Focus the requested tab each time the dialog opens.
  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  const [dmQ, setDmQ] = useState("");
  const [groupQ, setGroupQ] = useState("");
  const [title, setTitle] = useState("");
  const [selected, setSelected] = useState<UserHit[]>([]);

  const dmUsers = useUserSearch(useDebounced(dmQ, 300));
  const groupUsers = useUserSearch(useDebounced(groupQ, 300));

  const reset = () => {
    setTab("dm");
    setDmQ("");
    setGroupQ("");
    setTitle("");
    setSelected([]);
  };

  const startDm = async (u: UserHit) => {
    const chat = await create.mutateAsync({ kind: "dm", memberUsernames: [u.username] });
    reset();
    onCreated(chat);
  };

  const createGroup = async () => {
    if (!title.trim() || selected.length === 0) return;
    const chat = await create.mutateAsync({
      kind: "group",
      title: title.trim(),
      memberUsernames: selected.map((u) => u.username),
    });
    reset();
    onCreated(chat);
  };

  const toggle = (u: UserHit) =>
    setSelected((s) =>
      s.some((x) => x.username === u.username) ? s.filter((x) => x.username !== u.username) : [...s, u],
    );

  const userRow = (u: UserHit, extra?: React.ReactNode, onClick?: () => void) => (
    <button
      key={u.username}
      type="button"
      onClick={onClick}
      disabled={create.isPending}
      className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted"
    >
      <ChatAvatar seed={u.username} name={u.name} size={40} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{u.name}</span>
        <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
      </span>
      {extra}
    </button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md gap-3">
        <DialogHeader>
          <DialogTitle>{tr("newChat", "Yangi suhbat")}</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "dm" | "group")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dm">{tr("newDm", "Yangi suhbat")}</TabsTrigger>
            <TabsTrigger value="group">{tr("newGroup", "Yangi guruh")}</TabsTrigger>
          </TabsList>

          {/* dm */}
          <TabsContent value="dm" className="mt-3 space-y-2">
            <input
              value={dmQ}
              onChange={(e) => setDmQ(e.target.value)}
              placeholder={tr("searchUsers", "Foydalanuvchi qidirish")}
              className="h-10 w-full rounded-full bg-muted px-4 text-sm outline-none ring-primary/40 focus:ring-2 placeholder:text-muted-foreground"
              autoFocus
            />
            <div className="max-h-72 min-h-24 overflow-y-auto">
              {dmUsers.isLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {(dmUsers.data ?? [])
                .filter((u) => u.username !== me)
                .map((u) => userRow(u, undefined, () => void startDm(u)))}
              {!dmQ.trim() && !dmUsers.isLoading && (
                <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                  {tr("typeToSearch", "Qidirish uchun yozing")}
                </div>
              )}
            </div>
          </TabsContent>

          {/* group */}
          <TabsContent value="group" className="mt-3 space-y-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr("groupTitle", "Guruh nomi")}
            />
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selected.map((u) => (
                  <span
                    key={u.username}
                    className="inline-flex items-center gap-1 rounded-full bg-[#3390ec]/10 py-0.5 pl-1 pr-1.5 text-xs text-[#3390ec]"
                  >
                    <ChatAvatar seed={u.username} name={u.name} size={18} />
                    {u.name}
                    <button type="button" onClick={() => toggle(u)} aria-label={tr("remove", "Olib tashlash")}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              value={groupQ}
              onChange={(e) => setGroupQ(e.target.value)}
              placeholder={tr("searchUsers", "Foydalanuvchi qidirish")}
              className="h-10 w-full rounded-full bg-muted px-4 text-sm outline-none ring-primary/40 focus:ring-2 placeholder:text-muted-foreground"
            />
            <div className="max-h-56 min-h-16 overflow-y-auto">
              {groupUsers.isLoading && (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {(groupUsers.data ?? [])
                .filter((u) => u.username !== me)
                .map((u) => {
                  const on = selected.some((x) => x.username === u.username);
                  return userRow(
                    u,
                    <span
                      className={cn(
                        "grid size-5 shrink-0 place-items-center rounded-full border",
                        on ? "border-[#3390ec] bg-[#3390ec] text-white" : "border-muted-foreground/40",
                      )}
                    >
                      {on && <Check className="size-3.5" />}
                    </span>,
                    () => toggle(u),
                  );
                })}
            </div>
            <Button
              className="w-full"
              disabled={!title.trim() || selected.length === 0 || create.isPending}
              onClick={() => void createGroup()}
            >
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : <Users className="size-4" />}
              {tr("createGroup", "Guruh yaratish")}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
