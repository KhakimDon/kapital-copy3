// Telegram bridge — LEFT column SEARCH overlay. A faithful port of Telegram
// Web A's `left/search/*` (LeftSearch → SquareTabList + ChatResults + ChatMessage
// + RecentContacts): focusing the search pill swaps the folder strip + rows for
// this panel. It shows a Chats / Channels / Apps / Posts tab strip, a horizontal
// "top contacts" avatar row + a clearable "Recent" section while the query is
// empty, and — once the user types — three result sections that mirror the
// reference ChatResults:
//
//   1. "Chats and Contacts"  — INSTANT local substring filter over the already
//                              loaded dialogs (works fully offline). Collapsed to
//                              5 rows with a Show-more toggle, like the reference.
//   2. "Global"              — chats / contacts / public peers you have NO local
//                              dialog with, from the server (min ~4 chars), also
//                              Show-more past 5.
//   3. "Messages"            — full-text message matches across every chat: each
//                              row is the peer avatar + name + the matched snippet
//                              (query highlighted) + date; clicking opens that chat
//                              (best-effort scroll to the message once it renders).
//
// The Global + Messages sections are SERVER-backed (`useTgGlobalSearch`, debounced
// ~300ms) and render DEFENSIVELY: a loading spinner while in flight, an honest
// "Nothing found" state, and — since the backend `…/search` route ships in
// parallel — empty (never a crash) on 404 / 500. Rows reuse the shared
// `.Chat`/`.ListItem-button` DOM from tgweb-left.css so they read as list rows;
// the visual layer (tabs / sections / top-peers / highlight) lives in the
// `.tgs-*` block of that stylesheet.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LayoutGrid, Loader2, Newspaper, Search, SearchX, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { ChatAvatar } from "../avatar";
import { fmtDialogTime, mediaPreviewLabel } from "./shared";
import type { TgDialog, TgDialogKind } from "./api";
import {
  EMPTY_SEARCH,
  useTgGlobalSearch,
  type TgMessageHit,
  type TgSearchScope,
} from "./search-api";

type Tr = (k: string, d: string) => string;

// The four faithful left-search tabs. "Chats" is the default; "Channels" filters
// dialogs to channels; "Apps"/"Posts" have no bridge data → an empty state.
type SearchTab = "chats" | "channels" | "apps" | "posts";
const SEARCH_TABS: { id: SearchTab; key: string; def: string }[] = [
  { id: "chats", key: "searchTabChats", def: "Suhbatlar" },
  { id: "channels", key: "searchTabChannels", def: "Kanallar" },
  { id: "apps", key: "searchTabApps", def: "Ilovalar" },
  { id: "posts", key: "searchTabPosts", def: "Postlar" },
];
// Only these tabs run the server search (Apps/Posts have no bridge data).
const SERVER_TABS = new Set<SearchTab>(["chats", "channels"]);

// How many recent dialogs / top contacts to surface on the empty-query state.
const RECENT_LIMIT = 8;
const TOP_PEERS_LIMIT = 10;
// A result section collapses to this many rows, with a Show-more toggle past it
// (mirrors ChatResults' LESS_LIST_ITEMS_AMOUNT).
const LESS_ITEMS = 5;
// Global PEER search kicks in only past this length (ChatResults'
// MIN_QUERY_LENGTH_FOR_GLOBAL_SEARCH) — full-text message search has no minimum.
const MIN_GLOBAL = 4;
// Debounce before the server search fires (the local filter stays instant).
const DEBOUNCE_MS = 300;
// Characters of context kept to the LEFT of a message match so the hit is visible
// before the single-line row ellipsis truncates the tail.
const SNIPPET_LEAD = 24;

// Newest-first by ISO lastDate (ISO strings sort lexicographically = chrono).
const byRecency = (a: TgDialog, b: TgDialog) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "");

export function TgSearchPanel({
  accountId,
  dialogs,
  query,
  onPick,
  onClose,
}: {
  /** Owning TG account — scopes the server-backed global + message search. */
  accountId: number;
  dialogs: TgDialog[];
  query: string;
  /** Open a chat. `messageId` (message results) is passed best-effort — the panel
   *  also scrolls that message into view once the chat renders; the caller may
   *  ignore it and simply open the chat. */
  onPick: (chatId: number, messageId?: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tr: Tr = (k, d) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const [tab, setTab] = useState<SearchTab>("chats");
  // "Recent" is dismissible locally (the bridge has no persisted recents store).
  const [recentCleared, setRecentCleared] = useState(false);
  // Per-section Show-more toggles (reset when the query / tab changes).
  const [showMoreLocal, setShowMoreLocal] = useState(false);
  const [showMoreGlobal, setShowMoreGlobal] = useState(false);

  const q = query.trim().toLowerCase();
  const hasQuery = q.length > 0;

  // Debounced query → the server search (the local substring filter below stays
  // instant off the raw query). Scope follows the active tab.
  const debounced = useDebounced(query.trim(), DEBOUNCE_MS);
  const scope: TgSearchScope = tab === "channels" ? "channels" : "all";
  const serverQuery = SERVER_TABS.has(tab) ? debounced : "";
  const searchQ = useTgGlobalSearch(accountId, serverQuery, scope);
  const server = searchQ.data ?? EMPTY_SEARCH;

  // Escape closes the whole search (mirrors the back affordance).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Collapse both sections again whenever the query text or tab changes.
  useEffect(() => {
    setShowMoreLocal(false);
    setShowMoreGlobal(false);
  }, [q, tab]);

  // The tab scopes which dialogs are eligible before the query filter.
  const base = useMemo(
    () => (tab === "channels" ? dialogs.filter((d) => d.kind === "channel") : dialogs),
    [dialogs, tab],
  );

  // ── section 1: instant LOCAL substring filter (offline) ──
  const localResults = useMemo(() => {
    if (!hasQuery) return [];
    return base.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        (d.lastMessage ?? "").toLowerCase().includes(q),
    );
  }, [base, q, hasQuery]);

  // Every locally-known peer id — used to drop server "global" hits we already
  // have a dialog with (Global = peers you have NO local dialog with).
  const localIds = useMemo(() => new Set(dialogs.map((d) => d.chatId)), [dialogs]);

  // ── section 2: GLOBAL peers (server), deduped against local, min ~4 chars ──
  const globalChats = useMemo(() => {
    if (debounced.length < MIN_GLOBAL) return [];
    return server.chats.filter(
      (c) => !localIds.has(c.chatId) && (tab !== "channels" || c.kind === "channel"),
    );
  }, [server.chats, localIds, debounced, tab]);

  // ── section 3: MESSAGE hits (server), guarded against malformed rows ──
  const serverMessages = useMemo(
    () => server.messages.filter((m) => m && m.message && Number.isFinite(m.chatId)),
    [server.messages],
  );

  // The server call is "busy" while the debounce is settling OR the query is in
  // flight — drives the spinner and suppresses the empty state until it settles.
  const debouncePending = hasQuery && query.trim() !== debounced;
  const serverBusy = SERVER_TABS.has(tab) && hasQuery && (debouncePending || searchQ.isFetching);
  const nothingFound =
    hasQuery &&
    !serverBusy &&
    localResults.length === 0 &&
    globalChats.length === 0 &&
    serverMessages.length === 0;

  // Empty-query state: most-recent dialogs of the active tab + a top-contacts row.
  const recent = useMemo(() => base.slice().sort(byRecency).slice(0, RECENT_LIMIT), [base]);
  const topPeers = useMemo(
    () =>
      dialogs
        .filter((d) => d.kind === "user")
        .sort(byRecency)
        .slice(0, TOP_PEERS_LIMIT),
    [dialogs],
  );

  const pick = (chatId: number) => {
    onPick(chatId);
    onClose();
  };
  const pickMessage = (chatId: number, msgId: number) => {
    onPick(chatId, msgId);
    onClose();
    // Best-effort: once the chat pane mounts and the message renders, scroll it
    // into view + flash it (mirrors chat-pane's reply-quote jump). Silent no-op
    // if the message isn't in the freshly loaded page.
    focusMessageSoon(msgId);
  };

  const localHeading =
    tab === "channels"
      ? tr("searchSectionMyChannels", "Mening kanallarim")
      : tr("searchSectionChats", "Suhbatlar va kontaktlar");
  const recentHeading =
    tab === "channels"
      ? tr("searchTabChannels", "Kanallar")
      : tr("searchTabChats", "Suhbatlar");

  return (
    <div className="tgweb-search">
      {/* SquareTabList — Chats / Channels / Apps / Posts, underline-active */}
      <div className="tgs-tabs" role="tablist">
        {SEARCH_TABS.map((tb) => (
          <button
            key={tb.id}
            type="button"
            role="tab"
            aria-selected={tab === tb.id}
            className={cn("tgs-tab", tab === tb.id && "active")}
            onClick={() => setTab(tb.id)}
          >
            <span className="tgs-tab-label">
              {tr(tb.key, tb.def)}
              <i className="tgs-tab-underline" />
            </span>
          </button>
        ))}
      </div>

      <div className="tgs-content">
        {tab === "apps" ? (
          <PanelEmpty icon={LayoutGrid} text={tr("searchComingSoon", "Tez orada")} />
        ) : tab === "posts" ? (
          <PanelEmpty icon={Newspaper} text={tr("searchComingSoon", "Tez orada")} />
        ) : hasQuery ? (
          // ── typed query → local + global + messages sections ──
          <>
            {localResults.length > 0 && (
              <ResultSection
                heading={localHeading}
                total={localResults.length}
                expanded={showMoreLocal}
                onToggle={() => setShowMoreLocal((v) => !v)}
                tr={tr}
              >
                {(showMoreLocal ? localResults : localResults.slice(0, LESS_ITEMS)).map((d) => (
                  <SearchRow key={d.chatId} dialog={d} query={q} tr={tr} onPick={pick} />
                ))}
              </ResultSection>
            )}

            {globalChats.length > 0 && (
              <ResultSection
                heading={tr("searchSectionGlobal", "Global qidiruv")}
                total={globalChats.length}
                expanded={showMoreGlobal}
                onToggle={() => setShowMoreGlobal((v) => !v)}
                tr={tr}
              >
                {(showMoreGlobal ? globalChats : globalChats.slice(0, LESS_ITEMS)).map((d) => (
                  <SearchRow key={d.chatId} dialog={d} query={q} tr={tr} onPick={pick} isGlobal />
                ))}
              </ResultSection>
            )}

            {serverMessages.length > 0 && (
              <section className="tgs-section">
                <h3 className="tgs-heading">{tr("searchMessages", "Xabarlar")}</h3>
                {serverMessages.map((hit) => (
                  <MessageRow
                    key={`${hit.chatId}:${hit.message.id}`}
                    hit={hit}
                    query={q}
                    tr={tr}
                    onPick={pickMessage}
                  />
                ))}
              </section>
            )}

            {serverBusy && <PanelSpinner label={tr("searching", "Qidirilmoqda…")} />}
            {nothingFound && (
              <PanelEmpty icon={SearchX} text={tr("noResults", "Hech narsa topilmadi")} />
            )}
          </>
        ) : tab === "channels" ? (
          // ── empty query, Channels tab → the account's channels ──
          recent.length ? (
            <section className="tgs-section">
              <h3 className="tgs-heading">{recentHeading}</h3>
              {recent.map((d) => (
                <SearchRow key={d.chatId} dialog={d} tr={tr} onPick={pick} />
              ))}
            </section>
          ) : (
            <PanelEmpty icon={Search} text={tr("noDialogs", "Suhbatlar yo'q")} />
          )
        ) : (
          // ── empty query, Chats tab → top contacts + clearable Recent ──
          <>
            {topPeers.length > 0 && (
              <div className="tgs-toppeers">
                {topPeers.map((p) => (
                  <button
                    key={p.chatId}
                    type="button"
                    className="tgs-toppeer"
                    onClick={() => pick(p.chatId)}
                  >
                    <ChatAvatar seed={String(p.chatId)} name={p.title || "?"} size={54} />
                    <span className="tgs-toppeer-name">{p.title}</span>
                  </button>
                ))}
              </div>
            )}
            {!recentCleared && recent.length > 0 ? (
              <section className="tgs-section">
                <h3 className="tgs-heading">
                  {tr("searchRecent", "Oxirgi")}
                  <button
                    type="button"
                    className="tgs-clear"
                    aria-label={tr("clear", "Tozalash")}
                    title={tr("clear", "Tozalash")}
                    onClick={() => setRecentCleared(true)}
                  >
                    <X className="size-[1.125rem]" />
                  </button>
                </h3>
                {recent.map((d) => (
                  <SearchRow key={d.chatId} dialog={d} tr={tr} onPick={pick} />
                ))}
              </section>
            ) : (
              recent.length === 0 && (
                <PanelEmpty icon={Search} text={tr("noDialogs", "Suhbatlar yo'q")} />
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── a result section with a heading + optional Show-more/less toggle ──────────
// Mirrors ChatResults' `.search-section`: the heading carries a right-aligned
// Link that expands the section past the first `LESS_ITEMS` rows.
function ResultSection({
  heading,
  total,
  expanded,
  onToggle,
  tr,
  children,
}: {
  heading: string;
  total: number;
  expanded: boolean;
  onToggle: () => void;
  tr: Tr;
  children: React.ReactNode;
}) {
  return (
    <section className="tgs-section">
      <h3 className="tgs-heading">
        <span>{heading}</span>
        {total > LESS_ITEMS && (
          <button
            type="button"
            onClick={onToggle}
            // .tgs-heading is a flexbox — push the link to the trailing edge and
            // give it the reference's primary-coloured "Link" look inline (no CSS
            // file to add a rule to from here).
            style={{
              marginInlineStart: "auto",
              background: "none",
              cursor: "pointer",
              color: "var(--color-primary)",
              fontSize: "0.875rem",
              fontWeight: 500,
            }}
          >
            {expanded ? tr("searchShowLess", "Kamroq") : tr("searchShowMore", "Ko'proq")}
          </button>
        )}
      </h3>
      {children}
    </section>
  );
}

// ── one chat/contact result row — reuses the shared `.Chat` list-row DOM ──────
function SearchRow({
  dialog: d,
  query,
  tr,
  onPick,
  isGlobal,
}: {
  dialog: TgDialog;
  /** Lowercased query — the matched substring in the title is highlighted. */
  query?: string;
  tr: Tr;
  onPick: (chatId: number) => void;
  /** A Global-section peer (no local dialog) — falls back to a kind label instead
   *  of an empty "—" preview. */
  isGlobal?: boolean;
}) {
  const time = fmtDialogTime(d.lastDate);
  const mediaLabel = mediaPreviewLabel(d.lastMediaType ?? undefined, tr);
  const fallback = isGlobal ? kindLabel(d.kind, tr) : tr("noMessages", "—");
  const previewText = d.lastMessage || mediaLabel || fallback;
  const isEmptyPreview = !d.lastMessage && !d.lastMediaType;

  return (
    <div
      className={cn("Chat", d.kind === "user" ? "private" : "group")}
      role="button"
      tabIndex={0}
      onClick={() => onPick(d.chatId)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(d.chatId);
        }
      }}
    >
      <div className="ListItem-button">
        <div className="status status-clickable">
          <div className="avatar-wrapper">
            <ChatAvatar
              seed={String(d.chatId)}
              name={d.title || "?"}
              size={54}
              group={d.kind !== "user"}
            />
          </div>
        </div>

        <div className="info">
          <div className="info-row">
            <div className="title">
              <h3 dir="auto" className="fullName">
                {highlight(d.title, query)}
              </h3>
            </div>
            <div className="separator" />
            {time && (
              <div className="LastMessageMeta">
                <span className="time">{time}</span>
              </div>
            )}
          </div>

          <div className="subtitle">
            <p dir="auto" className={cn("last-message", isEmptyPreview && "last-message--empty")}>
              <span className="last-message-summary">{previewText}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── one MESSAGE result row (ChatMessage) — peer avatar + name + matched snippet ─
// Reuses the same `.Chat` DOM so it reads as a list row: the title is the owning
// peer, the subtitle is the matched message text with the query highlighted, and
// the meta time is the message date. Clicking opens that chat at the message.
function MessageRow({
  hit,
  query,
  tr,
  onPick,
}: {
  hit: TgMessageHit;
  query?: string;
  tr: Tr;
  onPick: (chatId: number, msgId: number) => void;
}) {
  const { chatId, chatTitle, chatKind, message } = hit;
  const isGroup = chatKind !== "user";
  const time = fmtDialogTime(message.date);
  // Preview prefix: "Siz:" for our own message, else "{sender}:" in groups.
  const prefix = message.out
    ? tr("youPrefix", "Siz: ")
    : isGroup && message.senderName
      ? `${message.senderName}: `
      : "";
  const body =
    message.text?.trim() ||
    mediaPreviewLabel(message.media?.type ?? undefined, tr) ||
    tr("noMessages", "—");

  const open = () => onPick(chatId, message.id);

  return (
    <div
      className={cn("Chat", isGroup ? "group" : "private")}
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
    >
      <div className="ListItem-button">
        <div className="status status-clickable">
          <div className="avatar-wrapper">
            <ChatAvatar seed={String(chatId)} name={chatTitle || "?"} size={54} group={isGroup} />
          </div>
        </div>

        <div className="info">
          <div className="info-row">
            <div className="title">
              <h3 dir="auto" className="fullName">
                {chatTitle || tr("noMessages", "—")}
              </h3>
            </div>
            <div className="separator" />
            {time && (
              <div className="LastMessageMeta">
                <span className="time">{time}</span>
              </div>
            )}
          </div>

          <div className="subtitle">
            <p dir="auto" className="last-message">
              {prefix && <span className="sender-name">{prefix}</span>}
              <span className="last-message-summary">{renderSnippet(body, query)}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── compact in-list loading spinner (server search in flight) ─────────────────
function PanelSpinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-4 text-[var(--color-text-secondary)]">
      <Loader2 className="size-4 animate-spin" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// ── centered empty / coming-soon state (stand-in for the real NothingFound) ───
function PanelEmpty({
  icon: Icon,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
}) {
  return (
    <div className="tgs-empty">
      <Icon className="tgs-empty-icon" />
      <p className="tgs-empty-text">{text}</p>
    </div>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────

/** Debounce a changing value (server search only; the local filter is instant). */
function useDebounced<T>(value: T, delay: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

/** Human label for a peer kind — the Global-row fallback when a public peer has
 *  no last message to preview. */
function kindLabel(kind: TgDialogKind, tr: Tr): string {
  if (kind === "channel") return tr("kindChannel", "Kanal");
  if (kind === "group") return tr("kindGroup", "Guruh");
  return tr("kindUser", "Foydalanuvchi");
}

/** Best-effort scroll-to-message once the chat pane has rendered it. Mirrors
 *  chat-pane's reply-quote `jumpTo` (DOM `[data-msgid]` + a 1s `--match` flash),
 *  retried briefly because the destination chat mounts + loads asynchronously
 *  after the search closes. Pure no-op if the message never appears (e.g. it's
 *  deep in history, not on the first loaded page). */
function focusMessageSoon(msgId: number): void {
  let tries = 0;
  const attempt = () => {
    const el = document.querySelector<HTMLElement>(`[data-msgid="${msgId}"]`);
    if (el) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const bubble = el.querySelector<HTMLElement>(".tg-bubble");
      if (bubble) {
        bubble.classList.add("tg-bubble--match");
        window.setTimeout(() => bubble.classList.remove("tg-bubble--match"), 1000);
      }
      return;
    }
    if (tries++ < 20) window.setTimeout(attempt, 150);
  };
  window.setTimeout(attempt, 150);
}

// Split `text` around every (case-insensitive) occurrence of the lowercased
// `query`, wrapping the matched runs in the `.tgs-hl` highlight span. The
// original casing is preserved via slices of the source string.
function highlight(text: string, query?: string): React.ReactNode {
  const q = query?.trim();
  if (!q) return text;
  const lower = text.toLowerCase();
  const out: React.ReactNode[] = [];
  let from = 0;
  let idx = lower.indexOf(q);
  let key = 0;
  while (idx !== -1) {
    if (idx > from) out.push(text.slice(from, idx));
    out.push(
      <span key={key++} className="tgs-hl">
        {text.slice(idx, idx + q.length)}
      </span>,
    );
    from = idx + q.length;
    idx = lower.indexOf(q, from);
  }
  if (from < text.length) out.push(text.slice(from));
  return out;
}

/** Render a message body as a single-line snippet with the query highlighted.
 *  Trims context to the LEFT of the first match (prefixed with an ellipsis) so
 *  the hit stays visible before the row's `.last-message-summary` truncates the
 *  tail; falls back to plain highlight when the match isn't in our visible text
 *  (e.g. the server matched a normalized form we don't have). */
function renderSnippet(text: string, query?: string): React.ReactNode {
  const q = query?.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q);
  if (idx <= SNIPPET_LEAD) return highlight(text, q);
  const start = idx - SNIPPET_LEAD;
  return (
    <>
      {"…"}
      {highlight(text.slice(start), q)}
    </>
  );
}
