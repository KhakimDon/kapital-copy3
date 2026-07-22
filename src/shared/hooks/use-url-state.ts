import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * Query-string-backed page state — filters, pagination, search, active sub-tab,
 * sort. Reads/writes go through the tab's router `?search`, which the history
 * bridge (tabs-host.tsx) mirrors into the browser URL. So the state survives
 * refresh, is deep-linkable / shareable, and Back/Forward restores it.
 *
 * Writes default to `replace` (in-place URL update, no extra Back entry) so
 * changing a filter doesn't pollute history — pass `push = true` only for a
 * change that should be its own Back step. The value equal to `def` is omitted
 * from the URL to keep it clean.
 *
 * ONLY use this for navigational / query state ("where am I, what am I looking
 * at"). Keep ephemeral UI (modal/drawer open, hover, uncommitted form fields)
 * in plain `useState`.
 */
// react-router's functional `setSearchParams(prev => …)` does NOT compose across
// multiple synchronous calls — each `prev` is the same committed params, so a
// handler doing `setStatus(x); setPage(1)` would keep only the last write. We
// batch within a tick: the first setter snapshots the live params into a shared
// draft, every setter mutates that draft, and each flushes the accumulated draft
// (non-functional). The draft clears on the next microtask.
//
// The draft is keyed by the snapshotted `base` string. Multiple setters in ONE
// handler share the same committed `base` (React hasn't re-rendered) so they
// compose into one draft. But two DIFFERENT tabs' pages can mount in the same
// tick (e.g. an "open in new window" restores the previous tab AND adds the new
// one — both fire their reset-to-page-1 effect): those have different bases, so
// keying prevents one tab's draft (missing the other's `?section=…`) from
// clobbering the other tab's URL.
let draft: URLSearchParams | null = null;
let draftBase: string | null = null;
function applyToDraft(base: URLSearchParams, key: string, v: string, def: string): URLSearchParams {
  const baseStr = base.toString();
  if (draft === null || draftBase !== baseStr) {
    draft = new URLSearchParams(base);
    draftBase = baseStr;
    queueMicrotask(() => {
      draft = null;
      draftBase = null;
    });
  }
  if (v === def || v === "") draft.delete(key);
  else draft.set(key, v);
  return new URLSearchParams(draft);
}

export function useUrlState(
  key: string,
  def = "",
  push = false,
): [string, (v: string) => void] {
  const [sp, setSp] = useSearchParams();
  const value = sp.get(key) ?? def;
  const set = useCallback(
    (v: string) => {
      setSp(applyToDraft(sp, key, v, def), { replace: !push });
    },
    [sp, key, def, push, setSp],
  );
  return [value, set];
}

/** Numeric variant of {@link useUrlState} (e.g. page, year, month). */
export function useUrlNumber(
  key: string,
  def: number,
  push = false,
): [number, (v: number) => void] {
  const [raw, setRaw] = useUrlState(key, String(def), push);
  const parsed = Number(raw);
  const value = Number.isFinite(parsed) ? parsed : def;
  const set = useCallback((v: number) => setRaw(String(v)), [setRaw]);
  return [value, set];
}

/**
 * Debounced search bound to the URL. Returns `[input, committed, setInput]`:
 *  - `input`    — bind to the text box for instant typing feedback,
 *  - `committed`— the debounced value (also in the URL `?<key>=`); use it to query,
 *  - `setInput` — onChange handler for the box.
 * The committed value is written with `replace`, and Back/Forward (which changes
 * the URL) flows back into the box.
 */
export function useUrlSearch(
  key = "q",
  delay = 300,
): [string, string, (v: string) => void] {
  const [committed, setCommitted] = useUrlState(key);
  const [input, setInput] = useState(committed);
  const last = useRef(committed);

  // Debounce box → URL.
  useEffect(() => {
    if (input === last.current) return;
    const id = setTimeout(() => {
      last.current = input;
      setCommitted(input);
    }, delay);
    return () => clearTimeout(id);
  }, [input, delay, setCommitted]);

  // URL → box (Back/Forward, deep-link) without re-triggering the debounce.
  useEffect(() => {
    if (committed !== last.current) {
      last.current = committed;
      setInput(committed);
    }
  }, [committed]);

  return [input, committed, setInput];
}
