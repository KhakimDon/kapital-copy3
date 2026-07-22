// Shared-media reader for the RIGHT-column profile panel — the paginated
// photo/video/file/link/voice/gif/music listing behind the Telegram-Web-A
// `SharedMedia` tabs. Mirrors the backend contract:
//
//   GET /messenger/tg/accounts/:id/chats/:chatId/media
//       ?filter=<photo|video|document|url|voice|gif|music>&beforeId=<id>
//   → { items: TgMessage[], nextBeforeId: number | null }
//
// DEFENSIVE, like the stories / pinned readers in ./api: the endpoint may not
// exist until the backend ships it, so any failure resolves to an empty page
// (no toast, no throw) and the grid simply renders its empty state. Each filter
// is its own infinite query keyed by (account, chat, filter); scrolling to the
// bottom advances it via `beforeId`.
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import { type TgMessage } from "./api";

const BASE = "/messenger/tg";

/** The seven backend media filters. The panel's "Media" tab merges photo+video;
 *  every other tab maps to exactly one filter. */
export type TgSharedMediaFilter =
  | "photo"
  | "video"
  | "document"
  | "url"
  | "voice"
  | "gif"
  | "music";

/** How many messages a shared-media page fetches. */
export const TG_MEDIA_PAGE = 40;

/** One page of the shared-media listing. */
export type TgMediaPage = { items: TgMessage[]; nextBeforeId: number | null };

export const tgSharedMediaKey = (
  accountId: number,
  chatId: number,
  filter: TgSharedMediaFilter,
) => ["tg", "shared-media", accountId, chatId, filter] as const;

/**
 * Paginated shared media for a chat, by filter. DEFENSIVE: a missing/failing
 * endpoint yields an empty page, so the tab shows its empty state until the
 * backend ships `…/media`. Page 0 is the newest block; each `fetchNextPage()`
 * loads the next-older block via `beforeId` (the server returns `nextBeforeId`,
 * null when the top of history is reached). No retry, no focus refetch.
 */
export function useTgSharedMedia(
  accountId: number,
  chatId: number,
  filter: TgSharedMediaFilter,
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: tgSharedMediaKey(accountId, chatId, filter),
    initialPageParam: undefined as number | undefined,
    queryFn: async ({ pageParam }): Promise<TgMediaPage> => {
      try {
        const r = await api.get<TgMediaPage>(
          `${BASE}/accounts/${accountId}/chats/${chatId}/media`,
          { params: { filter, beforeId: pageParam ?? undefined, limit: TG_MEDIA_PAGE } },
        );
        return { items: r.data?.items ?? [], nextBeforeId: r.data?.nextBeforeId ?? null };
      } catch {
        return { items: [], nextBeforeId: null };
      }
    },
    getNextPageParam: (last) => last.nextBeforeId ?? undefined,
    enabled: enabled && accountId > 0 && Number.isFinite(chatId),
    retry: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Flatten the infinite pages into one newest→oldest list (page 0 is newest and
 *  each page is already newest→oldest, so a straight concat preserves order).
 *  Accepts the query's `data` as-is (react-query widens the page-param generic to
 *  `unknown`), so callers can pass `query.data` without a cast. */
export function flattenSharedMedia(data: InfiniteData<TgMediaPage> | undefined): TgMessage[] {
  if (!data) return [];
  return data.pages.flatMap((p) => p.items);
}
