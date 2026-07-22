// Telegram bridge — GLOBAL + MESSAGE search API. A faithful port of Telegram
// Web A's `searchMessagesGlobal` + peer search (see `left/search/ChatResults`):
// ONE server call returns both the global peer matches (chats / contacts / public
// peers you have NO local dialog with) and full-text message hits across every
// chat, so the left-search panel can fill its "Global" and "Messages" sections.
//
// DEFENSIVE BY DESIGN: the backend `…/search` route is built in parallel, so a
// missing / failing endpoint (404 / 500 / network) resolves to EMPTY results —
// never a throw, never a toast — and the panel keeps showing its instant local
// substring filter. The caller DEBOUNCES the query (~300ms) before it reaches
// this hook; `retry:false` keeps a hard error from hammering the backend.
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/shared/api/client";
import type { TgDialog, TgDialogKind, TgMessage } from "./api";

const BASE = "/messenger/tg";

/** Which peers/messages the server search covers — mirrors Telegram's
 *  `ApiMessageSearchContext` (the chat-results context menu). Driven here by the
 *  active search tab: Chats → `all`, Channels → `channels`. */
export type TgSearchScope = "all" | "users" | "groups" | "channels";

/** One cross-chat message match: the owning peer (id / title / kind, so a result
 *  row can render an avatar + name without a second lookup) plus the matched
 *  message itself (reusing the shared `TgMessage` shape). */
export type TgMessageHit = {
  chatId: number;
  chatTitle: string;
  chatKind: TgDialogKind;
  message: TgMessage;
};

/** The `GET …/search` payload: global peer `chats` + `messages` hits, with an
 *  opaque `nextOffset` cursor for paging older message matches (reserved — the
 *  panel currently renders the first page). */
export type TgGlobalSearchResult = {
  chats: TgDialog[];
  messages: TgMessageHit[];
  nextOffset?: number | null;
};

/** Stable empty result — shared so callers can treat "no data" and "error" alike. */
export const EMPTY_SEARCH: TgGlobalSearchResult = { chats: [], messages: [] };

export const tgGlobalSearchKey = (accountId: number, scope: TgSearchScope, query: string) =>
  ["tg", "global-search", accountId, scope, query] as const;

/** Server-backed global + message search for a TG account.
 *
 *  Contract: `GET /messenger/tg/accounts/:id/search?q=<query>&scope=<all|users|
 *  groups|channels>&beforeId=<offset>` → `{ chats, messages, nextOffset? }`.
 *
 *  The hook only fires for a non-empty (already-debounced) query and NEVER throws:
 *  any transport / HTTP error yields `EMPTY_SEARCH`. Previous results stay
 *  on-screen while the next query is in flight (`keepPreviousData`) so the list
 *  doesn't flash empty between keystrokes; `isFetching` drives the panel spinner. */
export function useTgGlobalSearch(
  accountId: number | null,
  query: string,
  scope: TgSearchScope = "all",
  beforeId?: number | null,
) {
  const q = query.trim();
  return useQuery({
    queryKey: [...tgGlobalSearchKey(accountId ?? 0, scope, q), beforeId ?? null] as const,
    queryFn: async (): Promise<TgGlobalSearchResult> => {
      try {
        const r = await api.get<Partial<TgGlobalSearchResult> | null>(
          `${BASE}/accounts/${accountId}/search`,
          { params: { q, scope, beforeId: beforeId ?? undefined } },
        );
        const d = r.data ?? {};
        // Trust nothing off the wire — coerce each field to its expected shape so a
        // partial / malformed body can never crash a render.
        return {
          chats: Array.isArray(d.chats) ? d.chats : [],
          messages: Array.isArray(d.messages) ? d.messages : [],
          nextOffset: typeof d.nextOffset === "number" ? d.nextOffset : null,
        };
      } catch {
        return EMPTY_SEARCH;
      }
    },
    enabled: accountId != null && q.length > 0,
    retry: false,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    placeholderData: keepPreviousData,
  });
}
