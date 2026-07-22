// /mail — unified webmail CLIENT, Yandex-Mail-style: a folders sidebar (blue
// "Compose" CTA, folder pills, quick filters) + a main column that shows the
// message LIST and swaps to the OPEN MESSAGE in place (2-pane). Search is a modal
// (command-palette style) with a debounced query. Talks to the Rust backend
// (`/api/v2/mail/*`) via ./api.ts. Open account/folder/message live in the URL.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  FileText,
  Flag,
  Inbox,
  Languages,
  Loader2,
  Mail,
  MailOpen,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { useUrlState } from "@/shared/hooks/use-url-state";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAccounts,
  useFolderUnread,
  useMessage,
  useMessages,
  useMoveMessage,
  useSetFlags,
  useSyncAccount,
  useTranslate,
  useMailPrefs,
  useSetMailPref,
  type MailListItem,
} from "./api";
import type { MailFolderId } from "./types";
import { ComposeDialog, type ComposeSeed } from "./compose";
import { AddAccountDialog } from "./add-account-dialog";
import { MailToaster, mailToast } from "./toast";

const FOLDERS: { id: MailFolderId; icon: typeof Inbox; labelKey: string; label: string }[] = [
  { id: "inbox", icon: Inbox, labelKey: "modules.mail.folders.inbox", label: "Inbox" },
  { id: "sent", icon: Send, labelKey: "modules.mail.folders.sent", label: "Sent" },
  { id: "drafts", icon: FileText, labelKey: "modules.mail.folders.drafts", label: "Drafts" },
  { id: "archive", icon: Archive, labelKey: "modules.mail.folders.archive", label: "Archive" },
  { id: "spam", icon: ShieldAlert, labelKey: "modules.mail.folders.spam", label: "Spam" },
  { id: "trash", icon: Trash2, labelKey: "modules.mail.folders.trash", label: "Trash" },
];

type QuickFilter = "unread" | "flagged" | "attachments";
type Tr = (k: string, d: string) => string;

const AVATAR_COLORS = ["#f2994a", "#eb5757", "#27ae60", "#2f80ed", "#9b51e0", "#00bcd4", "#e91e63", "#795548"];
function senderColor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Account avatar initials: first letter of the local-part + first letter of the
// domain (ceo@aiba.uz → "CA").
function accountInitials(email: string): string {
  const [local = "", domainFull = ""] = email.split("@");
  const a = local.trim()[0] || "?";
  const b = domainFull.trim()[0] || "";
  return (a + b).toUpperCase();
}

function fmtDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getTime() === 0) return "";
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (d.getFullYear() === now.getFullYear())
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" });
}

export function MailPage() {
  const { t } = useTranslation();
  const tr: Tr = (k, d) => t(`modules.mail.${k}`, { defaultValue: d });
  const qc = useQueryClient();

  const [account, setAccount] = useUrlState("account", "");
  const [folderRaw, setFolder] = useUrlState("folder", "inbox");
  const folder = (FOLDERS.find((f) => f.id === folderRaw)?.id ?? "inbox") as MailFolderId;
  const [msgId, setMsgId] = useUrlState("msg", "");
  const [searchOpen, setSearchOpen] = useState(false);
  const [quick, setQuick] = useState<QuickFilter | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeSeed, setComposeSeed] = useState<ComposeSeed | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: accounts = [], isLoading: accountsLoading } = useAccounts();
  const { data: lastAccount, isLoading: prefsLoading } = useMailPrefs();
  const setPref = useSetMailPref();
  const { data: unread = {} } = useFolderUnread(account);
  const {
    data: pages,
    isLoading: listLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMessages(account, folder, "");
  const all = useMemo(() => pages?.pages.flat() ?? [], [pages]);
  const list = useMemo(() => {
    if (!quick) return all;
    if (quick === "unread") return all.filter((m) => !m.read);
    if (quick === "flagged") return all.filter((m) => m.starred);
    return all.filter((m) => m.hasAttachments);
  }, [all, quick]);
  const { data: active } = useMessage(msgId || null);

  const setFlags = useSetFlags();
  const move = useMoveMessage();
  const sync = useSyncAccount();

  // Infinite scroll with a client-side THROTTLE: never fire the next page more
  // than once per cooldown, on top of the "one in-flight at a time" guard — so a
  // fast scroll can't spam the backend (which opens IMAP connections).
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const lastLoadRef = useRef(0);
  const COOLDOWN = 900;
  const onSentinel = useCallback((node: HTMLDivElement | null) => {
    sentinelRef.current = node;
  }, []);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || !hasNextPage || isFetchingNextPage) return;
        const now = Date.now();
        const wait = Math.max(0, COOLDOWN - (now - lastLoadRef.current));
        window.setTimeout(() => {
          if (hasNextPage && !isFetchingNextPage) {
            lastLoadRef.current = Date.now();
            fetchNextPage();
          }
        }, wait);
      },
      { rootMargin: "200px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, list.length]);

  // Restore the last-opened account view (persisted per user in the DB) on a
  // fresh open; fall back to the first mailbox. account === "" means "no explicit
  // choice yet" (nav open with no ?account= param).
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    if (account !== "") { restoredRef.current = true; return; } // deep-linked / already chosen
    if (accountsLoading || prefsLoading || accounts.length === 0) return;
    restoredRef.current = true;
    const saved = lastAccount ?? "";
    const valid = saved === "all" || accounts.some((a) => a.id === saved);
    setAccount(valid ? saved : accounts[0]?.id ?? "all");
  }, [account, accountsLoading, prefsLoading, lastAccount, accounts, setAccount]);

  // Multi-select: clear when the view (account / folder / filter) changes.
  useEffect(() => { setSelected(new Set()); }, [account, folder, quick]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === account) ?? null,
    [accounts, account],
  );

  // Switch account view + remember it in the DB for next time.
  const chooseAccount = (id: string) => {
    setAccount(id);
    setMsgId("");
    setPref.mutate(id);
  };
  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  // Apply an action to every selected message, then clear the selection.
  const bulk = (fn: (id: string) => void) => {
    selected.forEach(fn);
    setSelected(new Set());
  };
  const startCompose = (seed: ComposeSeed | null) => {
    setComposeSeed(seed);
    setComposeOpen(true);
  };
  const syncAll = () => {
    const ids = account === "all" ? accounts.map((a) => a.id) : [account];
    ids.forEach((id) => sync.mutate(id));
  };
  const syncing = sync.isPending;
  const defaultSendAccount = selectedAccount?.id ?? accounts[0]?.id ?? "";

  // Empty state: no mailboxes attached yet.
  if (!accountsLoading && accounts.length === 0) {
    return (
      <div className="relative -m-6 grid h-[calc(100dvh-66px)] place-items-center max-md:h-[calc(100dvh-56px)]">
        <div className="flex max-w-sm flex-col items-center gap-4 text-center">
          <div className="grid size-16 place-items-center rounded-2xl bg-primary/10">
            <Mail className="size-8 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">{tr("empty.title", "Pochta qutingizni ulang")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tr("empty.subtitle", "Yandex, Gmail, Mail.ru, iCloud yoki boshqa IMAP qutini ulab, barcha xatlarni shu yerda ko'ring.")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <Plus className="size-4" /> {tr("addAccount", "Pochta qo'shish")}
          </button>
        </div>
        <AddAccountDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={(a) => chooseAccount(a.id)} />
      </div>
    );
  }

  // Open a message. Clear the unread signal OPTIMISTICALLY (list rows + folder
  // counts) the instant it's clicked — the backend also persists \Seen when it
  // lazily fetches the body, so the two stay in sync without a heavy refetch.
  const openMsg = (m: MailListItem) => {
    setMsgId(m.id);
    if (!m.read) {
      qc.setQueriesData<InfiniteData<MailListItem[]> | undefined>({ queryKey: ["mail", "messages"] }, (old) =>
        old ? { ...old, pages: old.pages.map((pg) => pg.map((x) => (x.id === m.id ? { ...x, read: true } : x))) } : old,
      );
      qc.setQueriesData<Record<string, number> | undefined>({ queryKey: ["mail", "folders"] }, (old) =>
        old ? { ...old, [m.folder]: Math.max(0, (old[m.folder] ?? 0) - 1) } : old,
      );
    }
  };
  const folderLabel = t(FOLDERS.find((f) => f.id === folder)?.labelKey ?? "", { defaultValue: folder });

  return (
    <div className="relative -m-6 flex h-[calc(100dvh-66px)] overflow-hidden bg-background max-md:h-[calc(100dvh-56px)]">
      {/* folders sidebar */}
      <aside className={cn("w-64 shrink-0 flex-col border-r bg-muted/20 md:flex", msgId ? "hidden md:flex" : "flex")}>
        {/* header: title + search */}
        <div className="flex items-center justify-between px-4 pt-4">
          <h1 className="text-lg font-bold">{tr("title", "Pochta")}</h1>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label={tr("search", "Qidirish")}
          >
            <Search className="size-4" />
          </button>
        </div>

        {/* account switcher — avatar (initials) + email */}
        <div className="px-3 pt-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-muted">
                <span
                  className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white"
                  style={{ background: selectedAccount?.color || "#5b6cff" }}
                >
                  {selectedAccount ? accountInitials(selectedAccount.email) : "@"}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {selectedAccount ? selectedAccount.email : tr("allMailboxes", "Barcha qutilar")}
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuItem onClick={() => chooseAccount("all")}>
                <Mail className="mr-2 size-4" /> {tr("allMailboxes", "Barcha qutilar")}
              </DropdownMenuItem>
              {accounts.length > 0 && <DropdownMenuSeparator />}
              {accounts.map((a) => (
                <DropdownMenuItem key={a.id} onClick={() => chooseAccount(a.id)}>
                  <span
                    className="mr-2 grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-semibold text-white"
                    style={{ background: a.color || "#888" }}
                  >
                    {accountInitials(a.email)}
                  </span>
                  <span className="truncate">{a.email}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 size-4" /> {tr("addAccount", "Pochta qo'shish")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* blue Compose CTA */}
        <div className="px-3 py-3">
          <button
            type="button"
            onClick={() => startCompose(null)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            <Pencil className="size-4" /> {tr("composeCta", "Xat yozish")}
          </button>
        </div>

        {/* folders */}
        <nav className="flex flex-col gap-0.5 px-2">
          {FOLDERS.map((f) => {
            const Ic = f.icon;
            const n = unread[f.id] ?? 0;
            const activeF = folder === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => { setFolder(f.id); setMsgId(""); setQuick(null); }}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  activeF ? "bg-muted font-medium" : "text-foreground/90 hover:bg-muted/60",
                )}
              >
                <Ic className={cn("size-[18px] shrink-0", activeF ? "text-blue-600" : "text-muted-foreground")} />
                <span className="flex-1 text-left">{t(f.labelKey, { defaultValue: f.label })}</span>
                {n > 0 && <span className="text-xs font-medium text-muted-foreground">{n}</span>}
              </button>
            );
          })}
        </nav>

        {/* quick filters */}
        <div className="flex items-center gap-2 px-4 py-3">
          <QuickBtn active={quick === "flagged"} onClick={() => setQuick((v) => (v === "flagged" ? null : "flagged"))} title={tr("flagged", "Bayroqli")}>
            <Flag className={cn("size-4", quick === "flagged" && "fill-current")} />
          </QuickBtn>
          <QuickBtn active={quick === "unread"} onClick={() => setQuick((v) => (v === "unread" ? null : "unread"))} title={tr("unreadOnly", "O'qilmagan")}>
            <MailOpen className="size-4" />
          </QuickBtn>
          <QuickBtn active={quick === "attachments"} onClick={() => setQuick((v) => (v === "attachments" ? null : "attachments"))} title={tr("withAttach", "Ilovali")}>
            <Paperclip className="size-4" />
          </QuickBtn>
        </div>
      </aside>

      {/* main column: list, or the open message in place */}
      <main className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <MessageView
            active={active}
            tr={tr}
            onBack={() => setMsgId("")}
            onReply={() =>
              startCompose({
                accountId: active.accountId,
                to: active.from.email,
                subject: active.subject.startsWith("Re:") ? active.subject : `Re: ${active.subject}`,
                quote: active.bodyText || "",
              })
            }
            onForward={() =>
              startCompose({
                accountId: active.accountId,
                subject: active.subject.startsWith("Fwd:") ? active.subject : `Fwd: ${active.subject}`,
                quote: active.bodyText || "",
              })
            }
            onArchive={() => { move.mutate({ id: active.id, folder: "archive" }); setMsgId(""); }}
            onDelete={() => { move.mutate({ id: active.id, folder: "trash" }); setMsgId(""); }}
            onFlag={() => setFlags.mutate({ id: active.id, starred: !active.starred })}
            onMarkUnread={() => { setFlags.mutate({ id: active.id, read: false }); setMsgId(""); }}
            onSpam={() => { move.mutate({ id: active.id, folder: "spam" }); setMsgId(""); }}
          />
        ) : (
          <>
            {/* list header — a bulk-action bar takes over while messages are selected */}
            {selected.size > 0 ? (
              <div className="flex h-12 items-center gap-1 border-b px-2">
                <ToolbarBtn icon={X} label={tr("cancel", "Bekor qilish")} onClick={() => setSelected(new Set())} />
                <span className="mr-1 text-sm font-medium">{selected.size}</span>
                <div className="mx-1 h-5 w-px bg-border" />
                <ToolbarBtn icon={MailOpen} label={tr("markRead", "O'qilgan deb belgilash")} onClick={() => bulk((id) => setFlags.mutate({ id, read: true }))} />
                <ToolbarBtn icon={Archive} label={tr("archive", "Arxiv")} onClick={() => bulk((id) => move.mutate({ id, folder: "archive" }))} />
                <ToolbarBtn icon={Trash2} label={tr("delete", "O'chirish")} onClick={() => bulk((id) => move.mutate({ id, folder: "trash" }))} />
              </div>
            ) : (
              <div className="flex h-12 items-center gap-2 border-b px-3">
                <span className="font-medium">{folderLabel}</span>
                {quick && (
                  <button type="button" onClick={() => setQuick(null)} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {quick === "flagged" ? tr("flagged", "Bayroqli") : quick === "unread" ? tr("unreadOnly", "O'qilmagan") : tr("withAttach", "Ilovali")}
                    <X className="size-3" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={syncAll}
                  disabled={syncing}
                  title={tr("sync", "Yangilash")}
                  className="ml-auto grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-muted disabled:opacity-60"
                >
                  <RotateCw className={cn("size-4", syncing && "animate-spin")} />
                </button>
              </div>
            )}
            <div className="min-h-0 flex-1 overflow-y-auto">
              {listLoading ? (
                <div className="grid h-full place-items-center p-6 text-muted-foreground">
                  <Loader2 className="size-5 animate-spin" />
                </div>
              ) : list.length === 0 ? (
                <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
                  {tr("emptyFolder", "Bu papkada xat yo'q")}
                </div>
              ) : (
                <>
                  {list.map((m, i) => (
                    <MessageRow
                      key={m.id}
                      index={i}
                      m={m}
                      folder={folder}
                      tr={tr}
                      selected={selected.has(m.id)}
                      onSelect={() => toggleSelect(m.id)}
                      onOpen={() => openMsg(m)}
                      onFlag={() => setFlags.mutate({ id: m.id, starred: !m.starred })}
                      onToggleRead={() => setFlags.mutate({ id: m.id, read: !m.read })}
                      onArchive={() => move.mutate({ id: m.id, folder: "archive" })}
                      onDelete={() => move.mutate({ id: m.id, folder: "trash" })}
                    />
                  ))}
                  <div ref={onSentinel} />
                  {isFetchingNextPage && (
                    <div className="grid place-items-center py-4 text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>

      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        account={account}
        folder={folder}
        tr={tr}
        onOpen={(id) => { setMsgId(id); setSearchOpen(false); }}
      />
      <ComposeDialog
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        accounts={accounts}
        defaultAccountId={defaultSendAccount}
        seed={composeSeed}
      />
      <AddAccountDialog open={addOpen} onClose={() => setAddOpen(false)} onAdded={(a) => chooseAccount(a.id)} />
      <MailToaster />
    </div>
  );
}

/** Command-palette-style search modal with a debounced query (fires ~350ms after
 *  you stop typing). Results are the backend's cache search for the current
 *  account + folder; clicking one opens it. */
function SearchDialog({
  open,
  onClose,
  account,
  folder,
  tr,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  account: string;
  folder: MailFolderId;
  tr: Tr;
  onOpen: (id: string) => void;
}) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");

  // Reset when opened.
  useEffect(() => {
    if (open) {
      setText("");
      setQ("");
    }
  }, [open]);

  // Debounce: apply the query ~350ms after the last keystroke.
  useEffect(() => {
    const h = window.setTimeout(() => setQ(text.trim()), 350);
    return () => window.clearTimeout(h);
  }, [text]);

  const { data: pages, isFetching } = useMessages(account, folder === "starred" ? "inbox" : folder, q);
  const results = q ? pages?.pages.flat() ?? [] : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="top-[12%] w-[38rem] max-w-[95vw] translate-y-0 gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tr("search", "Qidirish")}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {q && isFetching && <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>
        <div className="max-h-[60vh] min-h-[8rem] overflow-y-auto">
          {!q ? (
            <div className="grid h-32 place-items-center p-6 text-center text-sm text-muted-foreground">
              {tr("searchHint", "Qidirish uchun yozing")}
            </div>
          ) : results.length === 0 && !isFetching ? (
            <div className="grid h-32 place-items-center p-6 text-center text-sm text-muted-foreground">
              {tr("noResults", "Natija topilmadi")}
            </div>
          ) : (
            results.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpen(m.id)}
                className="flex w-full items-center gap-3 border-b px-4 py-2.5 text-left transition-colors hover:bg-muted/60"
              >
                <Avatar name={m.from.name} email={m.from.email || m.from.name} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.from.name || m.from.email || "—"}</div>
                  <div className="truncate text-[13px] text-foreground/80">{m.subject || tr("noSubject", "(mavzusiz)")}</div>
                  <div className="truncate text-xs text-muted-foreground">{m.preview}</div>
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">{fmtDate(m.date)}</span>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QuickBtn({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "grid size-9 place-items-center rounded-full border transition-colors",
        active ? "border-blue-500 bg-blue-500/10 text-blue-600" : "border-transparent bg-muted text-muted-foreground hover:bg-muted-foreground/10",
      )}
    >
      {children}
    </button>
  );
}

function Avatar({ name, email }: { name: string; email: string }) {
  const letter = (name || email || "?").slice(0, 1).toUpperCase();
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
      style={{ background: senderColor(email || name || "?") }}
    >
      {letter}
    </span>
  );
}

function MessageRow({
  m,
  index,
  folder,
  tr,
  selected,
  onSelect,
  onOpen,
  onFlag,
  onToggleRead,
  onArchive,
  onDelete,
}: {
  m: MailListItem;
  index: number;
  folder: MailFolderId;
  tr: Tr;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onFlag: () => void;
  onToggleRead: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const outbound = folder === "sent" || folder === "drafts";
  const who = outbound ? m.to[0]?.name || m.to[0]?.email || "—" : m.from.name || m.from.email || "—";
  const avatarKey = outbound ? m.to[0]?.email || who : m.from.email || who;
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {/* single-line Yandex-style row: [checkbox] avatar · sender · subject/preview · date */}
        <div
          onClick={onOpen}
          className={cn(
            "group flex cursor-pointer items-center gap-2.5 border-b border-border/60 px-3 py-2 transition-colors hover:bg-muted/50",
            index % 2 === 1 && "bg-muted/40",
            !m.read && !selected && "bg-blue-500/[0.06]",
            selected && "bg-blue-500/10",
          )}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={cn("shrink-0 transition-opacity", selected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}
          >
            <Checkbox checked={selected} onCheckedChange={() => onSelect()} aria-label="select" />
          </div>
          <Avatar name={who} email={avatarKey} />
          <span className={cn("w-40 shrink-0 truncate text-sm max-xl:w-32 max-md:w-24", !m.read ? "font-semibold" : "font-medium text-foreground/90")}>
            {who}
          </span>
          {!m.read && <span className="size-2 shrink-0 rounded-full bg-amber-400" />}
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className={cn("max-w-[55%] shrink-0 truncate text-[13px]", !m.read ? "font-semibold text-foreground" : "text-foreground/80")}>
              {m.subject || tr("noSubject", "(mavzusiz)")}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{m.preview}</span>
          </div>
          {m.hasAttachments && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFlag(); }}
            className={cn(
              "shrink-0 rounded p-1 opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100",
              m.starred ? "text-red-500 opacity-100" : "text-muted-foreground/50",
            )}
            aria-label="flag"
          >
            <Flag className={cn("size-4", m.starred && "fill-current")} />
          </button>
          <span className="w-12 shrink-0 text-right text-[11px] text-muted-foreground">{fmtDate(m.date)}</span>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={onOpen}>
          <MailOpen className="mr-2 size-4" /> {tr("open", "Ochish")}
        </ContextMenuItem>
        <ContextMenuItem onClick={onToggleRead}>
          <Mail className="mr-2 size-4" />
          {m.read ? tr("markUnread", "O'qilmagan deb belgilash") : tr("markRead", "O'qilgan deb belgilash")}
        </ContextMenuItem>
        <ContextMenuItem onClick={onFlag}>
          <Flag className={cn("mr-2 size-4", m.starred && "fill-current text-red-500")} />
          {m.starred ? tr("unstar", "Bayroqni olib tashlash") : tr("star", "Bayroqcha")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onArchive}>
          <Archive className="mr-2 size-4" /> {tr("archive", "Arxiv")}
        </ContextMenuItem>
        <ContextMenuItem onClick={onDelete} className="text-red-600 focus:text-red-600">
          <Trash2 className="mr-2 size-4" /> {tr("delete", "O'chirish")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

// Yandex-style reply glyph (the exact mark the user supplied). Forward is the
// same glyph mirrored horizontally.
function ReplyIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M8.017 2.182a.75.75 0 00-1.25-.558l-6.48 5.82a.75.75 0 000 1.114l6.478 5.84a.75.75 0 001.252-.558v-2.874c3.67.502 6.48 3.28 7.54 4.481.153.173.44.064.42-.165-.193-2.193-1.325-8.73-7.96-10.048V2.182z"
        fill="currentColor"
      />
    </svg>
  );
}
function ForwardIcon({ className }: { className?: string }) {
  return <ReplyIcon className={cn(className, "-scale-x-100")} />;
}

function stripHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return (doc.body.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
  } catch {
    return html.replace(/<[^>]+>/g, " ");
  }
}

function MessageView({
  active,
  tr,
  onBack,
  onReply,
  onForward,
  onArchive,
  onDelete,
  onFlag,
  onMarkUnread,
  onSpam,
}: {
  active: NonNullable<ReturnType<typeof useMessage>["data"]>;
  tr: Tr;
  onBack: () => void;
  onReply: () => void;
  onForward: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onFlag: () => void;
  onMarkUnread: () => void;
  onSpam: () => void;
}) {
  const { i18n } = useTranslation();
  const translate = useTranslate();
  const [translated, setTranslated] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Reset translation state when switching messages.
  useEffect(() => {
    setTranslated(null);
    setShowOriginal(false);
    setDismissed(false);
  }, [active.id]);

  const sourceText = useMemo(
    () => active.bodyText || (active.bodyHtml ? stripHtml(active.bodyHtml) : ""),
    [active.bodyText, active.bodyHtml],
  );
  const target = i18n.language?.startsWith("ru")
    ? ("translate_ru" as const)
    : i18n.language?.startsWith("en")
      ? ("translate_en" as const)
      : ("translate_uz" as const);

  const doTranslate = async () => {
    if (!sourceText.trim()) return;
    try {
      const out = await translate.mutateAsync({ action: target, text: sourceText.slice(0, 8000) });
      setTranslated(out);
      setShowOriginal(false);
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      mailToast(detail || tr("translateUnavailable", "Tarjima hozircha mavjud emas"), "error");
    }
  };

  const showBanner = !translated && !dismissed && !!sourceText.trim();

  return (
    <>
      {/* toolbar — icon + label, like Yandex */}
      <div className="flex h-12 items-center gap-0.5 border-b px-2">
        <ToolbarBtn icon={ArrowLeft} label={tr("back", "Orqaga")} onClick={onBack} />
        <div className="mx-1 h-5 w-px bg-border" />
        <LabeledBtn icon={ReplyIcon} label={tr("reply", "Javob")} onClick={onReply} />
        <LabeledBtn icon={ForwardIcon} label={tr("forward", "Uzatish")} onClick={onForward} />
        <LabeledBtn icon={Trash2} label={tr("delete", "O'chirish")} onClick={onDelete} />
        <LabeledBtn icon={Archive} label={tr("archive", "Arxiv")} onClick={onArchive} />
        <LabeledBtn icon={MailOpen} label={tr("unread", "O'qilmagan")} onClick={onMarkUnread} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted"
              aria-label={tr("more", "Yana")}
            >
              <MoreHorizontal className="size-[18px]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onFlag}>
              <Flag className={cn("mr-2 size-4", active.starred && "fill-current text-red-500")} />
              {active.starred ? tr("unstar", "Bayroqni olib tashlash") : tr("star", "Bayroqcha")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSpam}>
              <ShieldAlert className="mr-2 size-4" /> {tr("spam", "Spam")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <h1 className="text-xl font-semibold tracking-tight">{active.subject || tr("noSubject", "(mavzusiz)")}</h1>
        <div className="mt-4 flex items-center gap-3 border-b pb-4">
          <Avatar name={active.from.name} email={active.from.email} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{active.from.name || active.from.email}</div>
            <div className="truncate text-xs text-muted-foreground">{active.from.email}</div>
            <div className="truncate text-xs text-muted-foreground">
              {tr("to", "Kimga")}: {active.to.map((a) => a.name || a.email).join(", ") || "—"}
            </div>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(active.date)}</span>
        </div>

        {/* translation banner (below the sender, like Yandex) */}
        {showBanner && (
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5 text-sm">
            <Languages className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-foreground/80">{tr("translateBanner", "Xatni tarjima qilaymi?")}</span>
            <button
              type="button"
              onClick={doTranslate}
              disabled={translate.isPending}
              className="shrink-0 rounded-md bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted disabled:opacity-60"
            >
              {translate.isPending ? tr("translating", "Tarjima qilinmoqda…") : tr("translate", "Tarjima")}
            </button>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted"
              aria-label={tr("close", "Yopish")}
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {translated && (
          <div className="mt-4 flex items-center gap-3 rounded-lg bg-blue-500/10 px-3 py-2.5 text-sm">
            <Languages className="size-4 shrink-0 text-blue-600" />
            <span className="min-w-0 flex-1 text-foreground/80">{tr("translatedNote", "Tarjima qilingan")}</span>
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-500/10"
            >
              {showOriginal ? tr("showTranslation", "Tarjimani ko'rsatish") : tr("showOriginal", "Aslini ko'rsatish")}
            </button>
          </div>
        )}

        {translated && !showOriginal ? (
          <div className="whitespace-pre-wrap py-4 text-[15px] leading-relaxed text-foreground">{translated}</div>
        ) : (
          <MailBody html={active.bodyHtml} text={active.bodyText} />
        )}

        {active.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t pt-4">
            {active.attachments.map((a, i) => (
              <span key={i} className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                <Paperclip className="size-4 text-muted-foreground" /> {a.name}
                <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(a.size / 1024))} KB</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/** Toolbar button with an icon AND a text label (Yandex-style). */
function LabeledBtn({
  icon: Ic,
  label,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted"
    >
      <Ic className="size-[17px]" />
      <span className="max-lg:hidden">{label}</span>
    </button>
  );
}

/** Renders an email body. HTML goes into a sandboxed iframe (no scripts). */
function MailBody({ html, text }: { html: string | null; text: string | null }) {
  const [height, setHeight] = useState(200);
  if (html) {
    const doc = `<!doctype html><html><head><meta charset="utf-8"><base target="_blank"><style>body{margin:0;padding:0;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.5;color:#111;word-wrap:break-word}img{max-width:100%;height:auto}a{color:#3390ec}@media(prefers-color-scheme:dark){body{color:#e5e5e5;background:transparent}}</style></head><body>${html}</body></html>`;
    return (
      <iframe
        title="email"
        sandbox="allow-same-origin allow-popups"
        srcDoc={doc}
        className="w-full border-0 py-2"
        style={{ height }}
        onLoad={(e) => {
          try {
            const b = e.currentTarget.contentDocument?.body;
            if (b) setHeight(Math.min(4000, b.scrollHeight + 24));
          } catch {
            /* ignore */
          }
        }}
      />
    );
  }
  return <div className="whitespace-pre-wrap py-4 text-[15px] leading-relaxed text-foreground">{text || ""}</div>;
}

function ToolbarBtn({
  icon: Ic,
  label,
  onClick,
  active,
  activeClass,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn("grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted", active && (activeClass || "text-amber-500"))}
    >
      <Ic className={cn("size-[18px]", active && "fill-current")} />
    </button>
  );
}
