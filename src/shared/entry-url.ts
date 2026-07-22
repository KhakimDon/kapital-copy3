// The URL the app was loaded at. We can't rely on reading window.location in an
// effect: by then the tab history-bridge has already rewritten it to the
// restored active tab's path, dropping a deep link's query (e.g. an "open in
// new window" of "…/documents?section=outgoing" would arrive as plain
// /documents → Исходящие shown as Входящие).
//
// The PerformanceNavigationTiming entry keeps the ORIGINAL navigation URL —
// query intact — regardless of later history.replaceState calls, so we derive
// the entry URL from it (falling back to location for very old browsers / SSR).
function readEntryUrl(): string {
  if (typeof window === "undefined") return "/dashboard";
  const nav = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  const raw = nav?.name || window.location.href;
  try {
    const u = new URL(raw, window.location.origin);
    return u.pathname + u.search;
  } catch {
    return window.location.pathname + window.location.search;
  }
}

export const ENTRY_URL = readEntryUrl();
