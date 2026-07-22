// Telegram composer — real Unicode emoji picker popover.
//
// Self-contained (no external emoji package): dataset + keywords live in
// ./emoji-data.ts and glyphs render with the system font. Layout mirrors
// Telegram Web A's EmojiPicker — a category tab strip, a scrollable grid whose
// active tab tracks scroll position, a keyword search box, and a "Recent" set
// persisted to localStorage. Styled entirely with the tg-* theme vars so it
// matches the composer in light and dark. Closes on outside-click / Esc.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Clock,
  Coffee,
  Dumbbell,
  Flag,
  Hash,
  Lightbulb,
  PawPrint,
  Plane,
  Search,
  Smile,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { EMOJI_GROUPS, type EmojiEntry } from "./emoji-data";

const RECENT_KEY = "tg-emoji-recent";
const RECENT_MAX = 36;

const CATEGORY_META: { id: string; icon: LucideIcon }[] = [
  { id: "recent", icon: Clock },
  { id: "people", icon: Smile },
  { id: "nature", icon: PawPrint },
  { id: "food", icon: Coffee },
  { id: "activity", icon: Dumbbell },
  { id: "travel", icon: Plane },
  { id: "objects", icon: Lightbulb },
  { id: "symbols", icon: Hash },
  { id: "flags", icon: Flag },
];

const CATEGORY_LABEL: Record<string, { key: string; d: string }> = {
  recent: { key: "emojiCatRecent", d: "So'nggi" },
  people: { key: "emojiCatSmileys", d: "Smaylik va odamlar" },
  nature: { key: "emojiCatNature", d: "Hayvonlar va tabiat" },
  food: { key: "emojiCatFood", d: "Ovqat va ichimlik" },
  activity: { key: "emojiCatActivity", d: "Faoliyat" },
  travel: { key: "emojiCatTravel", d: "Sayohat va joylar" },
  objects: { key: "emojiCatObjects", d: "Buyumlar" },
  symbols: { key: "emojiCatSymbols", d: "Belgilar" },
  flags: { key: "emojiCatFlags", d: "Bayroqlar" },
};

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string").slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

function writeRecent(next: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, RECENT_MAX)));
  } catch {
    // ignore quota / private-mode errors — recents are best-effort.
  }
}

export function EmojiPicker({
  onPick,
  onClose,
  wrapRef,
  embedded = false,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
  /** Wrapper enclosing BOTH this popover and its trigger button, so a click on
   *  the trigger is not treated as an outside-click (which would flicker it).
   *  Optional when `embedded` — the host (SymbolMenu) then owns close/outside. */
  wrapRef?: React.RefObject<HTMLElement | null>;
  /** Rendered as a tab inside the SymbolMenu: drop the standalone card chrome
   *  (border / shadow / fixed size) and let the parent own closing. */
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const tr = (k: string, d: string) => t(`modules.messenger.tg.${k}`, { defaultValue: d });

  const [recent, setRecent] = useState<string[]>(() => readRecent());
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string>(recent.length ? "recent" : "people");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const searchRef = useRef<HTMLInputElement | null>(null);

  // Ordered category list — "recent" only when non-empty.
  const categories = useMemo(
    () => CATEGORY_META.filter((c) => c.id !== "recent" || recent.length > 0),
    [recent.length],
  );

  // Filtered flat list while searching (name/keyword match, de-duplicated).
  const q = query.trim().toLowerCase();
  const searchResults = useMemo<EmojiEntry[]>(() => {
    if (!q) return [];
    const seen = new Set<string>();
    const out: EmojiEntry[] = [];
    for (const g of EMOJI_GROUPS) {
      for (const item of g.emojis) {
        if (item.k.includes(q) && !seen.has(item.e)) {
          seen.add(item.e);
          out.push(item);
        }
      }
    }
    return out;
  }, [q]);

  // Focus search on open.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Close on Esc / outside-click (outside = beyond the shared wrapper). When
  // embedded, the SymbolMenu host owns both, so we stay out of the way.
  useEffect(() => {
    if (embedded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      const w = wrapRef?.current;
      if (w && e.target instanceof Node && !w.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose, wrapRef, embedded]);

  // Track the top-most visible section to highlight its tab.
  const onScroll = () => {
    if (q) return;
    const cont = scrollRef.current;
    if (!cont) return;
    const top = cont.scrollTop;
    let current = categories[0]?.id ?? "people";
    for (const c of categories) {
      const el = sectionRefs.current[c.id];
      if (el && el.offsetTop - cont.offsetTop <= top + 8) current = c.id;
    }
    setActiveId(current);
  };

  const goToCategory = (id: string) => {
    setActiveId(id);
    const el = sectionRefs.current[id];
    const cont = scrollRef.current;
    if (el && cont) cont.scrollTo({ top: el.offsetTop - cont.offsetTop, behavior: "smooth" });
  };

  const pick = (emoji: string) => {
    const next = [emoji, ...recent.filter((x) => x !== emoji)].slice(0, RECENT_MAX);
    setRecent(next);
    writeRecent(next);
    onPick(emoji);
  };

  return (
    <div
      role="dialog"
      aria-label={tr("emoji", "Emoji")}
      className={cn(
        "flex flex-col overflow-hidden text-[var(--tg-text)]",
        embedded
          ? "h-full w-full bg-transparent"
          : "h-[360px] w-[320px] max-w-[92vw] rounded-[var(--tg-radius)] border border-[var(--tg-border)] bg-[var(--tg-panel)] shadow-[var(--tg-bubble-shadow)]",
      )}
    >
      {/* search */}
      <div className="flex items-center gap-2 border-b border-[var(--tg-border)] px-3 py-2">
        <Search className="size-4 shrink-0 text-[var(--tg-text-secondary)]" />
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr("emojiSearch", "Emoji qidirish")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--tg-placeholder)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              searchRef.current?.focus();
            }}
            aria-label={tr("clear", "Tozalash")}
            className="grid size-5 shrink-0 place-items-center rounded-full text-[var(--tg-text-secondary)] hover:bg-[var(--tg-hover)]"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* category tab strip (hidden while searching) */}
      {!q && (
        <div className="flex shrink-0 items-center gap-0.5 border-b border-[var(--tg-border)] px-1.5 py-1">
          {categories.map((c) => {
            const Icon = c.icon;
            const label = CATEGORY_LABEL[c.id];
            const active = activeId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => goToCategory(c.id)}
                title={label ? tr(label.key, label.d) : c.id}
                aria-label={label ? tr(label.key, label.d) : c.id}
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg transition-colors hover:bg-[var(--tg-hover)]",
                  active ? "text-[var(--tg-primary)]" : "text-[var(--tg-text-secondary)]",
                )}
              >
                <Icon className="size-[18px]" />
              </button>
            );
          })}
        </div>
      )}

      {/* grid */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto overflow-x-hidden px-2 py-1.5">
        {q ? (
          searchResults.length ? (
            <EmojiGrid items={searchResults} onPick={pick} />
          ) : (
            <div className="py-8 text-center text-sm text-[var(--tg-text-secondary)]">
              {tr("emojiNone", "Hech narsa topilmadi")}
            </div>
          )
        ) : (
          categories.map((c) => {
            const label = CATEGORY_LABEL[c.id];
            const items: EmojiEntry[] =
              c.id === "recent"
                ? recent.map((e) => ({ e, k: "" }))
                : (EMOJI_GROUPS.find((g) => g.id === c.id)?.emojis ?? []);
            return (
              <div
                key={c.id}
                ref={(el) => {
                  sectionRefs.current[c.id] = el;
                }}
                className="mb-1.5 last:mb-0"
              >
                <div className="px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--tg-text-secondary)]">
                  {label ? tr(label.key, label.d) : c.id}
                </div>
                <EmojiGrid items={items} onPick={pick} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function EmojiGrid({ items, onPick }: { items: EmojiEntry[]; onPick: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {items.map((item, i) => (
        <button
          key={`${item.e}-${i}`}
          type="button"
          onClick={() => onPick(item.e)}
          className="grid aspect-square place-items-center rounded-lg text-[22px] leading-none transition-colors hover:bg-[var(--tg-hover)]"
        >
          {item.e}
        </button>
      ))}
    </div>
  );
}
