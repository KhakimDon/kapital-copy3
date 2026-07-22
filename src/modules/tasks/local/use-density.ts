// UI density for the Tasks module: "full" (spacious — two-row header with the
// Jira-style view-tab strip) vs "compact" (a single-row header, denser board).
// Persisted in localStorage so it survives reloads and is shared by every Tasks
// surface — future compact/full-aware tweaks should read this one signal.
import { useSyncExternalStore } from "react";

export type Density = "full" | "compact";

const KEY = "aiba:tasks:density";
const listeners = new Set<() => void>();

function read(): Density {
  try {
    return localStorage.getItem(KEY) === "compact" ? "compact" : "full";
  } catch {
    return "full";
  }
}

export function setDensity(d: Density) {
  try {
    localStorage.setItem(KEY, d);
  } catch {
    /* ignore (private mode) */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  // Cross-tab sync: another tab flipping the pref updates this one too.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** Current Tasks density; re-renders when it changes (this tab or another). */
export function useDensity(): Density {
  return useSyncExternalStore(subscribe, read, () => "full");
}
