import i18n from "i18next";
import { initReactI18next } from "react-i18next";

// Lazy per-language loading: only the ACTIVE locale is fetched up front (each
// translation file is ~140 kB gzipped), the rest load on demand when the user
// switches. This keeps the login/initial bundle from carrying all four.
const SUPPORTED = ["uz", "uz_Cyrl", "ru", "en"] as const;
const STORAGE_KEY = "i18nextLng";

const loaders: Record<string, () => Promise<Record<string, unknown>>> = {
  uz: () => import("./uz").then((m) => m.uz),
  uz_Cyrl: () => import("./uz_Cyrl").then((m) => m.uz_Cyrl),
  ru: () => import("./ru").then((m) => m.ru),
  en: () => import("./en").then((m) => m.en),
};

function detect(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && loaders[stored]) return stored;
  } catch { /* localStorage unavailable */ }
  const nav = (navigator.language || "uz").toLowerCase();
  if (nav.startsWith("ru")) return "ru";
  if (nav.startsWith("en")) return "en";
  return "uz";
}

/** Load a locale bundle into i18next (no-op if already loaded). */
export async function loadLanguage(lng: string): Promise<void> {
  if (loaders[lng] && !i18n.hasResourceBundle(lng, "translation")) {
    const res = await loaders[lng]();
    i18n.addResourceBundle(lng, "translation", res, true, true);
  }
}

/** Switch language, fetching its bundle first so there's no missing-key flash. */
export async function setLanguage(lng: string): Promise<void> {
  await loadLanguage(lng);
  await i18n.changeLanguage(lng);
  try { localStorage.setItem(STORAGE_KEY, lng); } catch { /* ignore */ }
}

/** Initialise i18next with ONLY the active locale; call before rendering. */
export async function initI18n(): Promise<typeof i18n> {
  const lng = detect();
  const res = await loaders[lng]();
  await i18n.use(initReactI18next).init({
    lng,
    fallbackLng: "uz",
    supportedLngs: SUPPORTED as unknown as string[],
    interpolation: { escapeValue: false },
    resources: { [lng]: { translation: res } },
    react: { useSuspense: false },
  });
  // Warm the fallback in the background (skipped when it's already the active
  // one) so a rare missing key still resolves — never blocks first paint.
  if (lng !== "uz") void loadLanguage("uz");
  return i18n;
}

export default i18n;
