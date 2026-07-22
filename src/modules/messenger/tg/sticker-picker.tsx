// Sticker picker — the Stickers tab of the SymbolMenu (port of Telegram Web A's
// middle/composer/StickerPicker.tsx, trimmed to what our backend can feed). It
// loads sticker sets through an OPTIONAL, DEFENSIVE api hook (`useTgStickerSets`)
// that resolves to [] until the backend ships the endpoint, so the tab renders
// an honest empty state instead of erroring. A "Recent" section is synthesised
// from localStorage (the composer records each sent sticker via `rememberSticker`).
// Selecting a sticker calls `onSelect`; the composer routes it through the media
// send path.
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Sticker as StickerIcon, X } from "lucide-react";
import { api } from "@/shared/api/client";
import { AnimatedSticker } from "./animated-sticker";
import { useTgMediaSrc } from "./media";

const BASE = "/messenger/tg";
const RECENT_KEY = "tg-sticker-recent";
const RECENT_MAX = 24;

export type TgStickerItem = {
  id: string;
  emoji?: string | null;
  /** Auth'd url that streams the sticker bytes (webp / tgs Lottie / webm). */
  url?: string | null;
  kind?: "static" | "tgs" | "webm" | null;
  w?: number | null;
  h?: number | null;
};

export type TgStickerSet = {
  id: string;
  title: string;
  stickers: TgStickerItem[];
};

/**
 * Installed sticker sets for the account. DEFENSIVE like `useTgStories`: a
 * missing/failing endpoint (before the backend ships) resolves to an empty list
 * — no throw, no toast — so the Stickers tab just shows its empty state.
 */
export function useTgStickerSets(accountId: number | null, enabled = true) {
  return useQuery({
    queryKey: ["tg", "sticker-sets", accountId ?? 0] as const,
    queryFn: async (): Promise<TgStickerSet[]> => {
      try {
        const r = await api.get<{ sets?: TgStickerSet[]; items?: TgStickerSet[] }>(
          `${BASE}/accounts/${accountId}/sticker-sets`,
        );
        return r.data?.sets ?? r.data?.items ?? [];
      } catch {
        return [];
      }
    },
    enabled: enabled && accountId != null,
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

function readRecent(): TgStickerItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TgStickerItem[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Record a just-sent sticker at the head of the Recent set (best-effort). */
export function rememberSticker(item: TgStickerItem): void {
  try {
    const next = [item, ...readRecent().filter((s) => s.id !== item.id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / private-mode
  }
}

/** A single sticker cell — resolves the auth'd bytes; emoji glyph is the fallback. */
function StickerCell({ item, onSelect }: { item: TgStickerItem; onSelect: () => void }) {
  const { src } = useTgMediaSrc(item.kind === "tgs" || item.kind === "webm" ? null : item.url);
  const tgs = useTgMediaSrc(item.kind === "tgs" ? item.url : null);
  return (
    <button type="button" className="tg-symbol-cell" title={item.emoji ?? ""} onClick={onSelect}>
      {item.kind === "tgs" && tgs.src ? (
        <AnimatedSticker tgsUrl={tgs.src} size={64} className="tg-sticker-media" />
      ) : item.kind === "webm" && item.url ? (
        <StickerVideo url={item.url} />
      ) : src ? (
        <img className="tg-sticker-media" src={src} alt={item.emoji ?? "sticker"} draggable={false} />
      ) : (
        <span className="tg-sticker-fallback">{item.emoji || "🖼️"}</span>
      )}
    </button>
  );
}

function StickerVideo({ url }: { url: string }) {
  const { src } = useTgMediaSrc(url);
  if (!src) return <span className="tg-sticker-fallback">🖼️</span>;
  return <video className="tg-sticker-media" src={src} autoPlay loop muted playsInline />;
}

export function TgStickerPicker({
  accountId,
  onSelect,
  tr,
}: {
  accountId: number;
  onSelect: (item: TgStickerItem) => void;
  tr: (k: string, d: string) => string;
}) {
  const setsQ = useTgStickerSets(accountId);
  const [query, setQuery] = useState("");
  const [recent] = useState<TgStickerItem[]>(() => readRecent());

  const sets = useMemo<TgStickerSet[]>(() => {
    const all: TgStickerSet[] = [];
    if (recent.length) all.push({ id: "recent", title: tr("recentStickers", "So'nggi"), stickers: recent });
    all.push(...(setsQ.data ?? []));
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all
      .map((s) => ({ ...s, stickers: s.stickers.filter((st) => (st.emoji ?? "").toLowerCase().includes(q)) }))
      .filter((s) => s.stickers.length > 0);
  }, [setsQ.data, recent, query, tr]);

  const isEmpty = sets.every((s) => s.stickers.length === 0);

  const pick = (item: TgStickerItem) => {
    rememberSticker(item);
    onSelect(item);
  };

  return (
    <div className="tg-symbol-tab">
      <div className="tg-symbol-search">
        <Search className="size-4 shrink-0 text-[var(--tg-text-secondary)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr("searchStickers", "Stikerlarni qidirish")}
          className="tg-symbol-search-input"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={tr("clear", "Tozalash")}
            className="tg-symbol-search-clear"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      <div className="tg-symbol-scroll custom-scroll">
        {isEmpty ? (
          <div className="tg-symbol-empty">
            <StickerIcon className="size-9 opacity-40" />
            <span>{tr("noStickers", "Hozircha stiker yo'q")}</span>
          </div>
        ) : (
          sets.map((set) => (
            <div key={set.id} className="symbol-set">
              <div className="symbol-set-header">
                <span className="symbol-set-title">{set.title}</span>
              </div>
              <div className="tg-sticker-grid">
                {set.stickers.map((item) => (
                  <StickerCell key={`${set.id}-${item.id}`} item={item} onSelect={() => pick(item)} />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
