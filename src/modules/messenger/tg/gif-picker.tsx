// GIF picker — the GIFs tab of the SymbolMenu (port of Telegram Web A's
// middle/composer/GifPicker.tsx). Loads GIFs through an OPTIONAL, DEFENSIVE api
// hook (`useTgGifs`) that resolves to [] until the backend ships, so the tab
// shows an honest empty state. A search box queries by keyword (Telegram's GIF
// search); with no query it shows the account's saved GIFs. Selecting a GIF
// calls `onSelect` — the composer routes it through the media send path.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clapperboard, Search, X } from "lucide-react";
import { api } from "@/shared/api/client";
import { useTgMediaSrc } from "./media";

const BASE = "/messenger/tg";

export type TgGifItem = {
  id: string;
  /** Auth'd url that streams the GIF bytes (mp4 / webm). */
  url?: string | null;
  /** Poster/thumbnail url (auth'd). */
  thumbUrl?: string | null;
  w?: number | null;
  h?: number | null;
};

/**
 * Saved / searched GIFs for the account. DEFENSIVE: a missing/failing endpoint
 * (before the backend ships) resolves to an empty list — no throw, no toast — so
 * the GIFs tab just shows its empty state.
 */
export function useTgGifs(accountId: number | null, query: string, enabled = true) {
  const q = query.trim();
  return useQuery({
    queryKey: ["tg", "gifs", accountId ?? 0, q] as const,
    queryFn: async (): Promise<TgGifItem[]> => {
      try {
        const r = await api.get<{ items?: TgGifItem[]; gifs?: TgGifItem[] }>(
          `${BASE}/accounts/${accountId}/gifs`,
          { params: { q: q || undefined } },
        );
        return r.data?.items ?? r.data?.gifs ?? [];
      } catch {
        return [];
      }
    },
    enabled: enabled && accountId != null,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/** A single GIF cell — autoplaying muted loop, poster while the bytes resolve. */
function GifCell({ item, onSelect }: { item: TgGifItem; onSelect: () => void }) {
  const { src } = useTgMediaSrc(item.url);
  const poster = useTgMediaSrc(item.thumbUrl);
  return (
    <button type="button" className="tg-gif-cell" onClick={onSelect}>
      {src ? (
        <video className="tg-gif-media" src={src} autoPlay loop muted playsInline />
      ) : poster.src ? (
        <img className="tg-gif-media" src={poster.src} alt="gif" draggable={false} />
      ) : (
        <span className="tg-gif-skeleton" />
      )}
    </button>
  );
}

export function TgGifPicker({
  accountId,
  onSelect,
  tr,
}: {
  accountId: number;
  onSelect: (item: TgGifItem) => void;
  tr: (k: string, d: string) => string;
}) {
  const [query, setQuery] = useState("");
  const gifsQ = useTgGifs(accountId, query);
  const gifs = gifsQ.data ?? [];

  return (
    <div className="tg-symbol-tab">
      <div className="tg-symbol-search">
        <Search className="size-4 shrink-0 text-[var(--tg-text-secondary)]" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr("searchGifs", "GIF qidirish")}
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
        {gifs.length === 0 ? (
          <div className="tg-symbol-empty">
            <Clapperboard className="size-9 opacity-40" />
            <span>{tr("noGifs", "Hozircha GIF yo'q")}</span>
          </div>
        ) : (
          <div className="tg-gif-grid">
            {gifs.map((item) => (
              <GifCell key={item.id} item={item} onSelect={() => onSelect(item)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
