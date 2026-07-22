import { useSearchParams } from "react-router-dom";

/**
 * URL-synced string state. Survives refresh + is shareable.
 *
 *   const [day, setDay] = useQueryParam("day", todayIso());
 *
 * Empty/undefined value removes the key from the URL. Uses replace so the
 * back button isn't flooded with every keystroke.
 */
export function useQueryParam(
  key: string,
  fallback: string,
): [string, (v: string | undefined) => void] {
  const [sp, setSp] = useSearchParams();
  const value = sp.get(key) ?? fallback;
  const setValue = (v: string | undefined) => {
    setSp(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (v == null || v === "") next.delete(key);
        else next.set(key, v);
        return next;
      },
      { replace: true },
    );
  };
  return [value, setValue];
}

/** Same, but for an integer query param. */
export function useQueryInt(
  key: string,
  fallback: number,
): [number, (v: number) => void] {
  const [raw, setRaw] = useQueryParam(key, String(fallback));
  const num = Number(raw);
  return [Number.isFinite(num) ? num : fallback, (v) => setRaw(String(v))];
}
