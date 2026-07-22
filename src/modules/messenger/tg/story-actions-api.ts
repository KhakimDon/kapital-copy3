// Telegram Stories — the story-level action endpoints (reaction + own-story
// views), split out of the main tg/api.ts so the viewer can own them without
// touching the shared contract file. Mirrors the backend
// `/messenger/tg/accounts/:id/stories/:peerId/:storyId/*` routes.
//
// Everything here is DEFENSIVE, exactly like `useTgStories` / `useTgPinnedMessages`
// in api.ts: the endpoints may not exist until the backend ships, so a 404/500
// resolves to a no-op / empty stats instead of throwing — a missing endpoint can
// never crash the story viewer, it just degrades to "no reaction persisted" and
// "no views footer".
//
// Story REPLIES are NOT here — they reuse the existing chat send endpoint
// (`useSendTgMessage` in ./api), since a story reply is just a message to the
// story's author (the peer id IS the author).
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

const BASE = "/messenger/tg";

// ── own-story views (StoryFooter + StoryViewModal port) ───────────────────────

/** One viewer of an OWN story: who saw it, the reaction they left (if any), and
 *  when they viewed it. `date` is unix seconds (a string ISO is tolerated too). */
export type TgStoryView = {
  id: number;
  name: string;
  /** The emoji reaction this viewer left on the story, if any. */
  reaction?: string | null;
  /** When they viewed it — unix seconds (or an ISO string; both are formatted). */
  date?: number | string | null;
};

/** Aggregate view stats for an OWN story: the totals plus the recent viewer rows
 *  (the endpoint returns the recent slice; an own story with no views is empty). */
export type TgStoryViews = {
  count: number;
  reactionsCount: number;
  viewers: TgStoryView[];
};

const EMPTY_VIEWS: TgStoryViews = { count: 0, reactionsCount: 0, viewers: [] };

export const tgStoryViewsKey = (accountId: number, peerId: number, storyId: number) =>
  ["tg", "storyViews", accountId, peerId, storyId] as const;

/** Views + reactions for an OWN story (self only). DEFENSIVE: a missing/failing
 *  endpoint (404/500 before the backend ships, or a story that isn't ours)
 *  resolves to empty stats, so the footer simply hides. Only enabled when
 *  `enabled` is true (the caller passes `peer.isSelf || item.isOut`). */
export function useTgStoryViews(
  accountId: number,
  peerId: number | null | undefined,
  storyId: number | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: tgStoryViewsKey(accountId, peerId ?? 0, storyId ?? 0),
    queryFn: async (): Promise<TgStoryViews> => {
      try {
        const r = await api.get<Partial<TgStoryViews> | null>(
          `${BASE}/accounts/${accountId}/stories/${peerId}/${storyId}/views`,
        );
        const d = r.data ?? {};
        return {
          count: Number(d.count ?? 0) || 0,
          reactionsCount: Number(d.reactionsCount ?? 0) || 0,
          viewers: Array.isArray(d.viewers) ? d.viewers : [],
        };
      } catch {
        return EMPTY_VIEWS;
      }
    },
    enabled:
      enabled &&
      Number.isFinite(accountId) &&
      accountId > 0 &&
      peerId != null &&
      storyId != null,
    retry: false,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
}

// ── story reaction ────────────────────────────────────────────────────────────

/** Send (or, with `reaction: ""`, remove) our reaction on a story. DEFENSIVE:
 *  swallows errors so a 404 never crashes the viewer — the caller shows the
 *  chosen reaction optimistically regardless, then reconciles nothing (there is
 *  no per-story "my reaction" field to invalidate). Returns `{ ok }`. */
export function useReactTgStory() {
  return useMutation({
    mutationFn: async (p: {
      accountId: number;
      peerId: number;
      storyId: number;
      /** The reaction emoji to send; an empty string removes the reaction. */
      reaction: string;
    }): Promise<{ ok: boolean }> => {
      try {
        const r = await api.post<{ ok?: boolean }>(
          `${BASE}/accounts/${p.accountId}/stories/${p.peerId}/${p.storyId}/react`,
          { reaction: p.reaction },
        );
        return { ok: r.data?.ok ?? true };
      } catch {
        return { ok: false };
      }
    },
  });
}
