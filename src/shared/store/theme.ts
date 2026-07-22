import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

const MEDIA = "(prefers-color-scheme: dark)";

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MEDIA).matches;
}

/** Resolve a theme choice to the concrete light/dark that should render. */
export function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

/** Toggle the `.dark` class on <html> — the single switch shadcn tokens key off.
 *  Also set `color-scheme` so the browser's NATIVE UI (PDF viewer backdrop,
 *  scrollbars, form controls) follows the app theme instead of the OS. */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
}

type ThemeState = {
  theme: Theme;
  setTheme: (t: Theme) => void;
};

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: "system",
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
    }),
    {
      name: "aiba.theme",
      // Re-apply once the persisted choice rehydrates, so a runtime toggle and
      // the inline first-paint script can never drift apart.
      onRehydrateStorage: () => (state) => applyTheme(state?.theme ?? "system"),
    }
  )
);

// Keep "system" mode live: follow the OS as it flips light/dark.
if (typeof window !== "undefined") {
  window.matchMedia(MEDIA).addEventListener("change", () => {
    if (useTheme.getState().theme === "system") applyTheme("system");
  });
}
