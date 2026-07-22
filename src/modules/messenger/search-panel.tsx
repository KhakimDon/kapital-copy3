// Internal messenger — LEFT column SEARCH overlay. A mirror of the Telegram
// surface's `tg/search-panel.tsx` (TgSearchPanel) built over OUR internal `Chat`
// model: focusing the search pill swaps the folder strip + rows for this panel,
// which shows a Chats / Groups tab strip, a horizontal "recent contacts" avatar
// row + a clearable "Recent" section while the query is empty, and client-side-
// filtered chat rows (matched on the display title AND any member name/username,
// with the matched title substring highlighted) grouped under a section header
// once the user types. Rows reuse the shared `.Chat`/`.ListItem-button` DOM and
// the `.tgs-*` visual layer from `tg/tgweb-left.css` (already imported by the
// chat-list, and scoped under the `.tg-surface` the left <aside> carries) so they
// read identically to the TG search. Everything is client-side for instant feel.
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, SearchX, Users, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { chatDisplayTitle, chatPartner, fmtListTime, type Chat } from "./api";
import { ChatAvatar } from "./avatar";
import { previewText } from "./message-bubble";

type Tr = (k: string, d: string) => string;

// The two internal search tabs. "Chats" (default) spans every conversation;
// "Groups" scopes to group chats. (No channels/apps/posts in the internal model.)
type SearchTab = "chats" | "groups";
const SEARCH_TABS: { id: SearchTab; key: string; def: string }[] = [
  { id: "chats", key: "searchTabChats", def: "Suhbatlar" },
  { id: "groups", key: "searchTabGroups", def: "Guruhlar" },
];

// How many recent chats / top contacts to surface on the empty-query state.
const RECENT_LIMIT = 8;
const TOP_PEERS_LIMIT = 10;

// Newest-first by ISO updatedAt (ISO strings sort lexicographically = chrono).
const byRecency = (a: Chat, b: Chat) =>
  (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");

export function InternalSearchPanel({
  chats,
  me,
  query,
  onPick,
  onClose,
}: {
  chats: Chat[];
  me: string | null | undefined;
  query: string;
  onPick: (chatId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const tr: Tr = (k, d) => t(`modules.messenger.${k}`, { defaultValue: d });

  const [tab, setTab] = useState<SearchTab>("chats");
  // "Recent" is dismissible locally (no persisted recents store on our side).
  const [recentCleared, setRecentCleared] = useState(false);

  const q = query.trim().toLowerCase();
  const hasQuery = q.length > 0;

  // Escape closes the whole search (mirrors the back affordance).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The tab scopes which chats are eligible before the query filter.
  const base = useMemo(
    () => (tab === "groups" ? chats.filter((c) => c.kind === "group") : chats),
    [chats, tab],
  );

  // Match on the display title OR any member's name / username.
  const results = useMemo(() => {
    if (!q) return [];
    return base.filter(
      (c) =>
        chatDisplayTitle(c, me).toLowerCase().includes(q) ||
        (c.members ?? []).some(
          (m) =>
            m.name.toLowerCase().includes(q) ||
            m.username.toLowerCase().includes(q),
        ),
    );
  }, [base, q, me]);

  // Empty-query state: most-recent chats of the active tab + a top-contacts row.
  const recent = useMemo(
    () => base.slice().sort(byRecency).slice(0, RECENT_LIMIT),
    [base],
  );
  const topPeers = useMemo(
    () =>
      chats
        .filter((c) => c.kind === "dm")
        .sort(byRecency)
        .slice(0, TOP_PEERS_LIMIT),
    [chats],
  );

  const pick = (chatId: string) => {
    onPick(chatId);
    onClose();
  };

  const heading =
    tab === "groups"
      ? tr("searchTabGroups", "Guruhlar")
      : tr("searchTabChats", "Suhbatlar");

  return (
    <div className="tgweb-search">
      {/* SquareTabList — Chats / Groups, underline-active */}
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
        {hasQuery ? (
          // ── typed query → filtered chat rows under a section header ──
          results.length ? (
            <section className="tgs-section">
              <h3 className="tgs-heading">{heading}</h3>
              {results.map((c) => (
                <SearchRow
                  key={c.id}
                  chat={c}
                  me={me}
                  query={q}
                  tr={tr}
                  onPick={pick}
                />
              ))}
            </section>
          ) : (
            <PanelEmpty icon={SearchX} text={tr("noResults", "Topilmadi")} />
          )
        ) : tab === "groups" ? (
          // ── empty query, Groups tab → the recent groups ──
          recent.length ? (
            <section className="tgs-section">
              <h3 className="tgs-heading">{heading}</h3>
              {recent.map((c) => (
                <SearchRow key={c.id} chat={c} me={me} tr={tr} onPick={pick} />
              ))}
            </section>
          ) : (
            <PanelEmpty icon={Users} text={tr("noChats", "Suhbatlar yo'q")} />
          )
        ) : (
          // ── empty query, Chats tab → top contacts + clearable Recent ──
          <>
            {topPeers.length > 0 && (
              <div className="tgs-toppeers">
                {topPeers.map((p) => {
                  const partner = chatPartner(p, me);
                  const title = chatDisplayTitle(p, me);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="tgs-toppeer"
                      onClick={() => pick(p.id)}
                    >
                      <ChatAvatar
                        seed={partner?.username ?? p.id}
                        name={title}
                        image={p.avatar}
                        size={54}
                      />
                      <span className="tgs-toppeer-name">{title}</span>
                    </button>
                  );
                })}
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
                {recent.map((c) => (
                  <SearchRow
                    key={c.id}
                    chat={c}
                    me={me}
                    tr={tr}
                    onPick={pick}
                  />
                ))}
              </section>
            ) : (
              recent.length === 0 && (
                <PanelEmpty
                  icon={Search}
                  text={tr("noChats", "Suhbatlar yo'q")}
                />
              )
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── one search result row — reuses the shared `.Chat` list-row DOM ────────────
function SearchRow({
  chat: c,
  me,
  query,
  tr,
  onPick,
}: {
  chat: Chat;
  me: string | null | undefined;
  /** Lowercased query — the matched substring in the title is highlighted. */
  query?: string;
  tr: Tr;
  onPick: (chatId: string) => void;
}) {
  const isGroup = c.kind === "group";
  const title = chatDisplayTitle(c, me);
  const partner = chatPartner(c, me);
  const last = c.lastMessage;
  const time = fmtListTime(last?.createdAt ?? c.updatedAt);
  const summary = last
    ? previewText(last, tr)
    : tr("noMessages", "Xabarlar yo'q");
  const isEmptyPreview = !last;

  return (
    <div
      className={cn("Chat", isGroup ? "group" : "private")}
      role="button"
      tabIndex={0}
      onClick={() => onPick(c.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick(c.id);
        }
      }}
    >
      <div className="ListItem-button">
        <div className="status status-clickable">
          <div className="avatar-wrapper">
            <ChatAvatar
              seed={isGroup ? c.id : (partner?.username ?? c.id)}
              name={title}
              image={c.avatar}
              size={54}
              group={isGroup}
            />
          </div>
        </div>

        <div className="info">
          <div className="info-row">
            <div className="title">
              <h3 dir="auto" className="fullName">
                {highlight(title, query)}
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
            <p
              dir="auto"
              className={cn(
                "last-message",
                isEmptyPreview && "last-message--empty",
              )}
            >
              <span className="last-message-summary">{summary}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── centered empty / no-results state ─────────────────────────────────────────
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
