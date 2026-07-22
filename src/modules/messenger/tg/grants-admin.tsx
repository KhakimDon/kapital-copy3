// Telegram group-access (ACL) admin panel — an admin grants a specific AIBA
// user access to a specific Telegram GROUP of a corporate TG account. Pick the
// account, review/remove existing grants (group title resolved from the
// account's dialogs), and add a new grant by choosing a TG group + an AIBA user.
// Content-only: the caller wraps this in its own admin surface.
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Loader2, Plus, Search, ShieldCheck, Trash2, UsersRound, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounced, useUserSearch, type UserHit } from "../api";
import { ChatAvatar } from "../avatar";
import {
  useAddTgGrant,
  useRemoveTgGrant,
  useTgAccounts,
  useTgDialogs,
  useTgGrants,
  type TgDialog,
} from "./api";

export function TgGrantsAdmin({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const accounts = useTgAccounts();
  const [accountId, setAccountId] = useState<number | null>(null);

  // Default to the first account once the list loads (respect an explicit pick).
  const activeId = accountId ?? accounts.data?.[0]?.id ?? null;

  const dialogs = useTgDialogs(activeId);
  const grants = useTgGrants(activeId);

  // chatId → title, to render each grant row against a human name.
  const titleById = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of dialogs.data ?? []) m.set(d.chatId, d.title);
    return m;
  }, [dialogs.data]);

  // Only groups/channels are grantable targets.
  const groups = useMemo(
    () => (dialogs.data ?? []).filter((d) => d.kind === "group" || d.kind === "channel"),
    [dialogs.data],
  );

  // ── add-grant form state ─────────────────────────────────────────────────
  const [pickedGroup, setPickedGroup] = useState<TgDialog | null>(null);
  const [pickedUser, setPickedUser] = useState<UserHit | null>(null);
  const [groupQ, setGroupQ] = useState("");
  const [userQ, setUserQ] = useState("");

  const userHits = useUserSearch(useDebounced(userQ, 300));

  const filteredGroups = useMemo(() => {
    const q = groupQ.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.title.toLowerCase().includes(q));
  }, [groups, groupQ]);

  const add = useAddTgGrant();
  const remove = useRemoveTgGrant();

  // Already granted this exact (group, user) pair?
  const isDuplicate = useMemo(() => {
    if (!pickedGroup || !pickedUser) return false;
    return (grants.data ?? []).some(
      (g) => g.tgChatId === pickedGroup.chatId && g.username === pickedUser.username,
    );
  }, [grants.data, pickedGroup, pickedUser]);

  const canSubmit = !!activeId && !!pickedGroup && !!pickedUser && !isDuplicate && !add.isPending;

  const resetForm = () => {
    setPickedGroup(null);
    setPickedUser(null);
    setGroupQ("");
    setUserQ("");
  };

  const submit = async () => {
    if (!activeId || !pickedGroup || !pickedUser) return;
    await add.mutateAsync({
      accountId: activeId,
      tgChatId: pickedGroup.chatId,
      username: pickedUser.username,
    });
    resetForm();
  };

  const grantRows = grants.data ?? [];

  return (
    <div className="flex max-h-[85vh] w-full flex-col gap-4 sm:min-w-[30rem]">
      {/* header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-semibold leading-tight">
              {tr("grants.title", "Telegram guruh dostupi")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {tr(
                "grants.subtitle",
                "AIBA foydalanuvchisiga aniq Telegram guruhida ishlash huquqini bering",
              )}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={tr("close", "Yopish")}>
          <X className="size-4" />
        </Button>
      </div>

      {/* account selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          {tr("grants.account", "Korporativ akkaunt")}
        </label>
        {accounts.isLoading ? (
          <div className="flex h-10 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {tr("loading", "Yuklanmoqda…")}
          </div>
        ) : (accounts.data ?? []).length === 0 ? (
          <div className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            {tr("grants.noAccounts", "Ulangan Telegram akkaunt yo'q")}
          </div>
        ) : (
          <Select
            value={activeId != null ? String(activeId) : undefined}
            onValueChange={(v) => {
              setAccountId(Number(v));
              resetForm();
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={tr("grants.pickAccount", "Akkauntni tanlang")} />
            </SelectTrigger>
            <SelectContent>
              {(accounts.data ?? []).map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.title}
                  {a.phone ? ` · ${a.phone}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {activeId != null && (
        <>
          {/* add grant */}
          <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <Plus className="size-4 text-primary" />
              {tr("grants.add", "Yangi dostup berish")}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {/* group picker */}
              <GroupPicker
                picked={pickedGroup}
                query={groupQ}
                setQuery={setGroupQ}
                results={filteredGroups}
                loading={dialogs.isLoading}
                onPick={setPickedGroup}
                onClear={() => setPickedGroup(null)}
                tr={tr}
              />

              {/* user picker */}
              <UserPicker
                picked={pickedUser}
                query={userQ}
                setQuery={setUserQ}
                results={userHits.data ?? []}
                loading={userHits.isLoading}
                onPick={setPickedUser}
                onClear={() => setPickedUser(null)}
                tr={tr}
              />
            </div>

            {isDuplicate && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {tr("grants.duplicate", "Bu foydalanuvchiga ushbu guruh allaqachon berilgan")}
              </p>
            )}
            {add.isError && (
              <p className="text-xs text-destructive">
                {tr("grants.addError", "Dostup berishda xatolik yuz berdi")}
              </p>
            )}

            <Button className="w-full sm:w-auto" disabled={!canSubmit} onClick={() => void submit()}>
              {add.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {tr("grants.grant", "Dostup berish")}
            </Button>
          </div>

          {/* existing grants */}
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
            <div className="text-xs font-medium text-muted-foreground">
              {tr("grants.existing", "Berilgan dostuplar")}
              {grantRows.length > 0 ? ` · ${grantRows.length}` : ""}
            </div>

            {grants.isLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : grantRows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-8 text-center">
                <UsersRound className="size-6 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground">
                  {tr("grants.empty", "Hali dostup berilmagan")}
                </p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {grantRows.map((g) => {
                  const title = titleById.get(g.tgChatId);
                  return (
                    <li
                      key={g.id}
                      className="flex items-center gap-3 rounded-xl border px-3 py-2"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#3390ec]/10 text-[#3390ec]">
                        <UsersRound className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">
                          {title ?? (
                            <span className="text-muted-foreground">
                              {tr("grants.unknownGroup", "Guruh")} #{g.tgChatId}
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">@{g.username}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={remove.isPending}
                        onClick={() =>
                          void remove.mutateAsync({ accountId: activeId, grantId: g.id })
                        }
                        aria-label={tr("grants.remove", "Olib tashlash")}
                      >
                        {remove.isPending && remove.variables?.grantId === g.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── pickers ─────────────────────────────────────────────────────────────────

type Tr = (k: string, d: string) => string;

/** Searchable single-select over the account's TG groups. */
function GroupPicker({
  picked,
  query,
  setQuery,
  results,
  loading,
  onPick,
  onClear,
  tr,
}: {
  picked: TgDialog | null;
  query: string;
  setQuery: (v: string) => void;
  results: TgDialog[];
  loading: boolean;
  onPick: (d: TgDialog) => void;
  onClear: () => void;
  tr: Tr;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {tr("grants.group", "Telegram guruh")}
      </label>
      {picked ? (
        <SelectedChip
          seed={String(picked.chatId)}
          name={picked.title}
          group
          onClear={onClear}
        />
      ) : (
        <div className="rounded-xl border bg-background">
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("grants.searchGroup", "Guruh qidirish")}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-40 overflow-y-auto p-1">
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                {tr("grants.noGroups", "Guruh topilmadi")}
              </div>
            ) : (
              results.map((g) => (
                <button
                  key={g.chatId}
                  type="button"
                  onClick={() => onPick(g)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                >
                  <ChatAvatar seed={String(g.chatId)} name={g.title} size={30} group />
                  <span className="min-w-0 flex-1 truncate text-sm">{g.title}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Searchable single-select over the AIBA member roster (server user search). */
function UserPicker({
  picked,
  query,
  setQuery,
  results,
  loading,
  onPick,
  onClear,
  tr,
}: {
  picked: UserHit | null;
  query: string;
  setQuery: (v: string) => void;
  results: UserHit[];
  loading: boolean;
  onPick: (u: UserHit) => void;
  onClear: () => void;
  tr: Tr;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">
        {tr("grants.user", "AIBA foydalanuvchi")}
      </label>
      {picked ? (
        <SelectedChip seed={picked.username} name={picked.name} sub={`@${picked.username}`} onClear={onClear} />
      ) : (
        <div className="rounded-xl border bg-background">
          <div className="flex items-center gap-2 border-b px-2.5">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr("grants.searchUser", "Foydalanuvchi qidirish")}
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <div className="max-h-40 overflow-y-auto p-1">
            {!query.trim() ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                {tr("grants.typeToSearch", "Qidirish uchun yozing")}
              </div>
            ) : loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : results.length === 0 ? (
              <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                {tr("grants.noUsers", "Foydalanuvchi topilmadi")}
              </div>
            ) : (
              results.map((u) => (
                <button
                  key={u.username}
                  type="button"
                  onClick={() => onPick(u)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted"
                >
                  <ChatAvatar seed={u.username} name={u.name} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{u.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">@{u.username}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SelectedChip({
  seed,
  name,
  sub,
  group = false,
  onClear,
}: {
  seed: string;
  name: string;
  sub?: string;
  group?: boolean;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border bg-background px-2.5 py-2">
      <ChatAvatar seed={seed} name={name} size={30} group={group} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{name}</span>
        {sub && <span className="block truncate text-xs text-muted-foreground">{sub}</span>}
      </span>
      <button
        type="button"
        onClick={onClear}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
        aria-label="clear"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
