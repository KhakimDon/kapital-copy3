// The middle column's scrollback — the Telegram Web A message list, rebuilt on
// our stack. This is the INNER scroll area only; the `.tg-wallpaper` background
// stays on the parent (chat-pane), so we don't double it here.
//
// Owns:
//   • the scroll container, stuck to the bottom on mount / chat switch / new
//     message (effect on the last message id + chatId);
//   • PAGINATION — page 0 is the newest block; scrolling near the top loads
//     older blocks, and scroll position is compensated on prepend so the view
//     doesn't jump. A small top spinner shows while an older page is in flight;
//   • the UNREAD divider — a full-width pill drawn before the first unread msg;
//   • the SCROLL-TO-BOTTOM FAB — a floating round button (with an unread count
//     badge) shown while the user is scrolled up;
//   • loading spinner and the floating empty-state pill;
//   • DATE SEPARATORS — a centred, sticky floating pill per calendar day;
//   • same-sender GROUPING — consecutive messages from the same side + sender on
//     the same day are tightened, and for incoming group chats the sender avatar
//     is shown once at the bottom-left of each group (with a gutter reserved so
//     every bubble in the group lines up);
//   • the sender profile popover (SenderCard) state.
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Loader2, MessageSquare, Search, X } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { TgAvatar } from "./tg-avatar";
import type { TgMessage } from "./api";
import { fmtDateSep, isNewDay } from "./shared";
import { TgMessageBubble, type BubbleGroup } from "./message-bubble";
import { SenderCard } from "./message-menu";
import { TgDateJumpModal } from "./date-jump-modal";

const AVATAR = 34; // px — incoming group avatar / left gutter width

type Row = {
  /** The representative message (meta / date / sender / reply / forward). For an
   *  album this is its caption bearer, else its last message. */
  msg: TgMessage;
  group: BubbleGroup;
  /** The album's member messages when this row is an album (length > 1), else
   *  undefined; passed to the bubble to render one mosaic. */
  album?: TgMessage[];
  /** Every message id this row covers (all album members, or just `msg.id`) —
   *  used for search / jump targeting and the unread divider. */
  ids: number[];
};

/** One calendar day's worth of rows — the sticky date pill sticks across the
 *  whole section (its containing block), exactly like Telegram. */
type DayGroup = {
  key: string;
  date: string;
  rows: Row[];
};

/** Same side + same sender + same calendar day → part of one visual group. */
function sameGroup(a: TgMessage | undefined, b: TgMessage): boolean {
  if (!a) return false;
  if (a.out !== b.out) return false;
  if (a.senderId !== b.senderId) return false;
  return !isNewDay(a.date, b.date);
}

export function TgMessageList({
  accountId,
  chatId,
  messages,
  isLoading,
  hasOlder,
  loadingOlder,
  loadOlder,
  unreadCount,
  searchOpen,
  onSearchOpenChange,
  onOpenProfile,
}: {
  accountId: number;
  chatId: number;
  messages: TgMessage[];
  isLoading: boolean;
  /** More older history exists past the currently-loaded pages. */
  hasOlder: boolean;
  /** An older page is currently being fetched (guards the top loader + trigger). */
  loadingOlder: boolean;
  /** Fetch the next older page — safe to call repeatedly (it self-guards). */
  loadOlder: () => void;
  /** Count of unread (newest) messages — drives the divider + FAB badge. */
  unreadCount: number;
  /** In-chat search — controlled by the header's search button via chat-pane.
   *  When these are omitted the list falls back to its own internal toggle. */
  searchOpen?: boolean;
  onSearchOpenChange?: (open: boolean) => void;
  /** When provided, a sender-name click opens the full profile panel instead of
   *  the lightweight SenderCard popover (wired by the orchestrator). */
  onOpenProfile?: (id: number | null, name: string) => void;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // A group sender's profile popover (TG sender info — not an AIBA user).
  const [senderCard, setSenderCard] = useState<{
    x: number;
    y: number;
    id: number | null;
    name: string;
  } | null>(null);

  // ── in-chat search (over the LOADED messages only) ──────────────────────────
  const [internalSearch, setInternalSearch] = useState(false);
  const open = searchOpen ?? internalSearch;
  const setOpen = (v: boolean) => (onSearchOpenChange ? onSearchOpenChange(v) : setInternalSearch(v));
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Matching message ids in display order (chronological → newest last).
  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as number[];
    return messages.filter((m) => m.text && m.text.toLowerCase().includes(q)).map((m) => m.id);
  }, [messages, query]);

  // A fresh query starts at the newest match (like Telegram); clear when closed.
  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    searchInputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    setActiveIdx(matchIds.length ? matchIds.length - 1 : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const activeMatchId = matchIds[activeIdx] ?? null;

  // Scroll the current match into view (centred) whenever it changes.
  useEffect(() => {
    if (activeMatchId == null) return;
    // Match the row directly, or the album row that contains this member id.
    const el = scrollRef.current?.querySelector(
      `[data-msgid="${activeMatchId}"], [data-msgids~="${activeMatchId}"]`,
    );
    el?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }, [activeMatchId, reduceMotion]);

  const stepMatch = (dir: 1 | -1) => {
    if (!matchIds.length) return;
    setActiveIdx((i) => (i + dir + matchIds.length) % matchIds.length);
  };

  // Treat the chat as a "group chat" (sender attribution + avatar gutter) when
  // any incoming message carries a sender name — 1:1 user chats don't.
  const hasSenders = useMemo(
    () => messages.some((m) => !m.out && !!m.senderName),
    [messages],
  );

  // Collapse consecutive same-`groupedId` messages into ONE album unit (rendered
  // as a single mosaic bubble). A unit's representative is its caption bearer (or
  // its last message) — that drives the meta / reply / forward / grouping.
  type Unit = { main: TgMessage; album?: TgMessage[]; ids: number[] };
  const units = useMemo<Unit[]>(() => {
    const out: Unit[] = [];
    let i = 0;
    while (i < messages.length) {
      const m = messages[i];
      const gid = m.groupedId;
      if (gid) {
        const run: TgMessage[] = [m];
        let j = i + 1;
        while (j < messages.length && messages[j].groupedId === gid) {
          run.push(messages[j]);
          j++;
        }
        if (run.length > 1) {
          const main = run.find((x) => x.text && x.text.trim()) ?? run[run.length - 1];
          out.push({ main, album: run, ids: run.map((x) => x.id) });
          i = j;
          continue;
        }
      }
      out.push({ main: m, ids: [m.id] });
      i++;
    }
    return out;
  }, [messages]);

  // Precompute same-sender grouping over units, then bucket rows by calendar day
  // so each day's sticky pill sticks across exactly its own messages.
  const dayGroups = useMemo<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    units.forEach((unit, i) => {
      const msg = unit.main;
      const prev = units[i - 1]?.main;
      const next = units[i + 1]?.main;
      const first = !sameGroup(prev, msg);
      const last = !sameGroup(next, msg);
      const row: Row = {
        msg,
        album: unit.album,
        ids: unit.ids,
        group: {
          first,
          last,
          showSender: hasSenders && first && !msg.out && !!msg.senderName,
          showAvatar: hasSenders && last && !msg.out,
        },
      };
      if (i === 0 || isNewDay(prev?.date, msg.date)) {
        groups.push({ key: `${msg.id}-day`, date: msg.date, rows: [row] });
      } else {
        groups[groups.length - 1].rows.push(row);
      }
    });
    return groups;
  }, [units, hasSenders]);

  // First unread message id — the unread block is the LAST `unreadCount` messages.
  // Only marked when there's a read message before it (never above the very first
  // loaded message), so the divider sits mid-history like Telegram's.
  const firstUnreadId = useMemo(() => {
    if (unreadCount <= 0 || unreadCount >= messages.length) return null;
    return messages[messages.length - unreadCount]?.id ?? null;
  }, [messages, unreadCount]);

  // ── animation gating — only messages that arrive AFTER the initial page of a
  // chat animate in; the opening history renders statically (mirrors the tab
  // strip's post-mount-only motion). ────────────────────────────────────────────
  const seenRef = useRef<Set<number>>(new Set());
  const seededChatRef = useRef<number | null>(null);
  if (seededChatRef.current !== chatId) {
    // New chat: forget prior ids; seed (without animation) once the first page
    // has actually arrived, so an empty→loaded transition doesn't animate all.
    seenRef.current = new Set();
    if (messages.length > 0) {
      for (const m of messages) seenRef.current.add(m.id);
      seededChatRef.current = chatId;
    }
  }
  useEffect(() => {
    // Once shown (and possibly animated), mark seen so it won't animate again.
    for (const m of messages) seenRef.current.add(m.id);
  }, [messages]);

  // ── bottom-stick — instant on chat switch / initial load, smooth when a new
  // message arrives AND the user was already near the bottom. ──────────────────
  const lastId = messages[messages.length - 1]?.id ?? null;
  const atBottomRef = useRef(true);
  const stuckChatRef = useRef<number | null>(null);
  const prevLastIdRef = useRef<number | null>(null);
  // Whether the scroll-to-bottom FAB is shown (state so it re-renders; the
  // bottom-stick still reads `atBottomRef` synchronously).
  const [scrolledUp, setScrolledUp] = useState(false);
  // Scroll height captured just before an older page is fetched, so the layout
  // effect can compensate scrollTop once the prepended messages render.
  const pendingPrependRef = useRef<number | null>(null);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    atBottomRef.current = fromBottom < 120;
    setScrolledUp(fromBottom > 200);
    // Near the TOP → pull the next older page. Capture the current scroll height
    // first so the prepend-compensation effect can keep the view anchored.
    // Prefetch the next older page well before the very top (Telegram-style) so
    // scrolling up stays seamless even with tall messages — ~1.5 screens of slack.
    const nearTop = el.scrollTop < Math.max(600, el.clientHeight * 1.5);
    if (nearTop && hasOlder && !loadingOlder) {
      pendingPrependRef.current = el.scrollHeight;
      loadOlder();
    }
  };

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;
    if (stuckChatRef.current !== chatId) {
      // initial load / chat switch → jump instantly to the bottom
      el.scrollTop = el.scrollHeight;
      stuckChatRef.current = chatId;
      prevLastIdRef.current = lastId;
      atBottomRef.current = true;
      pendingPrependRef.current = null; // drop any stale prepend from the old chat
      return;
    }
    if (lastId !== prevLastIdRef.current) {
      // A message was APPENDED (newest id changed) — stick to bottom if we were
      // already there. Prepends leave lastId untouched, so they never trip this.
      prevLastIdRef.current = lastId;
      if (atBottomRef.current) {
        el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
      }
    }
  }, [lastId, chatId, messages.length, reduceMotion]);

  // ── prepend compensation — when the FIRST id changes (an older page rendered),
  // add the height gained above the viewport back onto scrollTop so the messages
  // the user was looking at stay put. Runs after the bottom-stick effect, which
  // is a no-op on prepends (lastId unchanged). ─────────────────────────────────
  const firstId = messages[0]?.id ?? null;
  const prevFirstIdRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (
      prevFirstIdRef.current !== null &&
      firstId !== prevFirstIdRef.current &&
      pendingPrependRef.current !== null
    ) {
      el.scrollTop += el.scrollHeight - pendingPrependRef.current;
      pendingPrependRef.current = null;
    }
    prevFirstIdRef.current = firstId;
  }, [firstId]);

  // Smooth-scroll to the newest message (FAB click).
  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  };

  // ── date-jump — clicking a date pill opens a calendar; picking a day scrolls
  // to the FIRST loaded message on-or-after that day (loading older pages first
  // when the target predates the oldest loaded message). ──────────────────────
  const MAX_JUMP_PAGES = 20;
  const startOfDay = (d: Date | string) => {
    const x = typeof d === "string" ? new Date(d) : d;
    return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  };
  // The month-seed for the open calendar (null = closed).
  const [jumpSeed, setJumpSeed] = useState<Date | null>(null);
  // In-flight jump: the target day + how many older pages we've pulled for it.
  const jumpRef = useRef<{ targetStart: number; pages: number } | null>(null);

  // Scroll a message to the top of the viewport (a hair below the sticky pill).
  const scrollMsgToTop = (id: number) => {
    const container = scrollRef.current;
    const node = container?.querySelector<HTMLElement>(
      `[data-msgid="${id}"], [data-msgids~="${id}"]`,
    );
    if (!container || !node) return;
    const top =
      node.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      8;
    container.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? "auto" : "smooth" });
  };

  // Advance a pending jump: if the target is older than the oldest loaded
  // message, pull another older page and wait; otherwise resolve + scroll.
  const resolveJump = () => {
    const pending = jumpRef.current;
    const el = scrollRef.current;
    if (!pending || !el || messages.length === 0) return;
    const oldestDay = startOfDay(messages[0].date);
    if (pending.targetStart < oldestDay && hasOlder && pending.pages < MAX_JUMP_PAGES) {
      // Not far enough back yet — fetch the next older page (self-guards on
      // loadingOlder) and keep the view anchored via the prepend compensation.
      if (!loadingOlder) {
        pending.pages += 1;
        pendingPrependRef.current = el.scrollHeight;
        loadOlder();
      }
      return; // the messages-change effect re-runs resolveJump when it arrives
    }
    jumpRef.current = null;
    // First message whose calendar day is on-or-after the target (messages run
    // oldest → newest). None ⇒ the target is newer than everything → go bottom.
    let hit: TgMessage | undefined;
    for (const m of messages) {
      if (startOfDay(m.date) >= pending.targetStart) {
        hit = m;
        break;
      }
    }
    const hitId = hit?.id ?? null;
    // Scroll after paint so the (possibly just-prepended) rows are laid out.
    requestAnimationFrame(() => {
      if (hitId != null) scrollMsgToTop(hitId);
      else scrollToBottom();
    });
  };

  const jumpToDate = (date: Date) => {
    jumpRef.current = { targetStart: startOfDay(date), pages: 0 };
    resolveJump();
  };

  // Drive multi-page jump loads: each time messages / pagination flags change,
  // re-attempt the pending jump (load another page or finish + scroll).
  useEffect(() => {
    if (jumpRef.current) resolveJump();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loadingOlder, hasOlder]);

  // Cancel any open/pending jump when the chat switches.
  useEffect(() => {
    setJumpSeed(null);
    jumpRef.current = null;
  }, [chatId]);

  const matchCount = matchIds.length;

  return (
    // Relative wrapper so the scroll-to-bottom FAB can overlay the list without
    // scrolling with it; the scroll area itself fills this box absolutely.
    <div className="relative min-h-0 flex-1">
      {/* pt-16 clears the floating header; pb-3 keeps the LAST message from
          sitting flush against the composer edge, where it looked cut off. */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="absolute inset-0 overflow-y-auto pt-16 pb-3"
      >
        {/* in-chat search bar — pinned to the top, spans the full scroll width.
            Searches the LOADED messages only (full-history search needs the
            backend). */}
        {open && (
          <div className="tg-search-bar sticky top-16 z-30 mb-2 flex items-center gap-2 border-b border-[var(--tg-border)] bg-[var(--tg-panel)] px-3 py-2">
            <Search className="size-4 shrink-0 text-[var(--tg-text-secondary)]" />
            <input
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  e.preventDefault();
                  setOpen(false);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  stepMatch(e.shiftKey ? 1 : -1);
                }
              }}
              placeholder={tr("searchLoaded", "Yuklangan xabarlarda qidirish")}
              className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--tg-text)] outline-none placeholder:text-[var(--tg-placeholder)]"
              aria-label={tr("search", "Qidirish")}
            />
            {query.trim() && (
              <span className="shrink-0 tabular-nums text-xs text-[var(--tg-text-secondary)]">
                {matchCount ? `${activeIdx + 1}/${matchCount}` : tr("searchNone", "0/0")}
              </span>
            )}
            <button
              type="button"
              onClick={() => stepMatch(-1)}
              disabled={!matchCount}
              aria-label={tr("searchPrev", "Oldingi")}
              className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--tg-text-secondary)] hover:bg-[var(--tg-hover)] disabled:opacity-40"
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => stepMatch(1)}
              disabled={!matchCount}
              aria-label={tr("searchNext", "Keyingi")}
              className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--tg-text-secondary)] hover:bg-[var(--tg-hover)] disabled:opacity-40"
            >
              <ChevronDown className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={tr("close", "Yopish")}
              className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--tg-text-secondary)] hover:bg-[var(--tg-hover)]"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* top loader — a small spinner above the first date section while an
            older page is being fetched. */}
        {loadingOlder && (
          <div className="flex justify-center py-3">
            <Loader2 className="size-5 animate-spin text-[var(--tg-text-secondary)]" />
          </div>
        )}

        {isLoading ? (
          <div className="grid h-full place-items-center">
            <Loader2 className="size-5 animate-spin text-[var(--tg-text-secondary)]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="grid h-full place-items-center">
            <span className="tg-pill tg-fade-in flex items-center gap-2">
              <MessageSquare className="size-4" />
              {tr("empty", "Xabarlar yo'q. Birinchi bo'lib yozing!")}
            </span>
          </div>
        ) : (
          // Centred message column — the scroll area is full-width (scrollbar at
          // the edge) but bubbles + pills live in a capped, centred wrapper so
          // they never stretch across a wide screen.
          <div className="mx-auto flex w-full max-w-[47.5rem] flex-col px-4 py-3">
            {dayGroups.map((day) => (
              <section key={day.key} className="flex flex-col">
                {/* centred floating date pill — sticks across this day's messages;
                    clicking it opens the calendar to jump to another date */}
                <div className="sticky top-16 z-10 my-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => {
                      const d = new Date(day.date);
                      setJumpSeed(isNaN(d.getTime()) ? new Date() : d);
                    }}
                    aria-label={tr("jumpToDate", "Jump to date")}
                    title={tr("jumpToDate", "Jump to date")}
                    className="tg-pill tg-fade-in cursor-pointer transition-colors hover:bg-black/55"
                  >
                    {fmtDateSep(day.date, tr)}
                  </button>
                </div>
                {day.rows.map(({ msg, group, album, ids }, i) => {
                  const isNew = seededChatRef.current === chatId && !seenRef.current.has(msg.id);
                  const isActive = open && activeMatchId != null && ids.includes(activeMatchId);
                  const bubble = (
                    <div
                      key={msg.id}
                      data-msgid={msg.id}
                      data-msgids={ids.join(" ")}
                      className={cn(
                        group.first && i > 0 ? "mt-2" : "mt-0.5",
                        isNew && (msg.out ? "tg-anim-out" : "tg-anim-in"),
                      )}
                      style={hasSenders && !msg.out ? { paddingLeft: `${AVATAR + 8}px` } : undefined}
                    >
                      <div className="relative">
                        {/* incoming group avatar — once, bottom-left of the group */}
                        {group.showAvatar && (
                          <div className="absolute bottom-0" style={{ left: `-${AVATAR + 8}px` }}>
                            <TgAvatar
                              accountId={accountId}
                              peerId={msg.senderId}
                              name={msg.senderName ?? "?"}
                              size={AVATAR}
                            />
                          </div>
                        )}
                        <TgMessageBubble
                          msg={msg}
                          accountId={accountId}
                          chatId={chatId}
                          group={group}
                          album={album}
                          tr={tr}
                          onSenderClick={(x, y, id, name) => setSenderCard({ x, y, id, name })}
                          onOpenProfile={onOpenProfile}
                          query={open ? query : ""}
                          activeMatch={isActive}
                        />
                      </div>
                    </div>
                  );
                  // Unread divider — a full-width centred pill on a subtle line,
                  // drawn immediately before the row holding the first unread
                  // message (which may be an album member). Sticky so it stays
                  // pinned under the date pill while its section scrolls.
                  if (firstUnreadId != null && ids.includes(firstUnreadId)) {
                    return (
                      <Fragment key={`${msg.id}-unread`}>
                        <div className="sticky top-16 z-[8] my-3 flex items-center justify-center">
                          <span
                            aria-hidden
                            className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-[var(--tg-border)]"
                          />
                          <span className="tg-pill relative z-[1]">
                            {tr("unread", "Yangi xabarlar")}
                          </span>
                        </div>
                        {bubble}
                      </Fragment>
                    );
                  }
                  return bubble;
                })}
              </section>
            ))}
          </div>
        )}

        {senderCard && (
          <SenderCard
            x={senderCard.x}
            y={senderCard.y}
            id={senderCard.id}
            name={senderCard.name}
            tr={tr}
            onClose={() => setSenderCard(null)}
          />
        )}
      </div>

      {/* scroll-to-bottom FAB — a floating round button (Telegram look) shown only
          while scrolled up; carries an unread count badge when there are unread
          messages. Overlays the list, pinned above the composer. */}
      {scrolledUp && !isLoading && messages.length > 0 && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label={tr("scrollToBottom", "Pastga o'tish")}
          className="absolute bottom-4 right-4 z-20 grid size-11 place-items-center rounded-full border border-[var(--tg-border)] bg-[var(--tg-panel)] text-[var(--tg-text-secondary)] shadow-lg transition-colors hover:text-[var(--tg-text)]"
        >
          <ChevronDown className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 left-1/2 grid h-5 min-w-5 -translate-x-1/2 place-items-center rounded-full bg-[var(--tg-primary)] px-1 text-[11px] font-semibold leading-none text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      )}

      {/* date-jump calendar — seeded to the clicked pill's month */}
      {jumpSeed && (
        <TgDateJumpModal
          seed={jumpSeed}
          maxDate={new Date()}
          tr={tr}
          onPick={(date) => {
            setJumpSeed(null);
            jumpToDate(date);
          }}
          onGoToLatest={() => {
            setJumpSeed(null);
            scrollToBottom();
          }}
          onClose={() => setJumpSeed(null)}
        />
      )}
    </div>
  );
}
