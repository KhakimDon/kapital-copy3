// Per-browser Telegram-surface settings. This is a CORPORATE SHARED TG account,
// so account-level Telegram settings (privacy, sessions, 2FA, …) don't apply —
// what's meaningful here is purely LOCAL surface/appearance + notification
// preferences, so this store is persisted to localStorage (key `tg-settings`)
// and never touches the backend. It mirrors the SharedSettings / settings.byKey
// slices Telegram Web A drives from `left/settings/*`:
//   • appearance  — wallpaper (+ custom solid colour / blur), message text size
//   • chat        — send-on-Enter combo
//   • notifications — web/offline/sound, per-peer-type mute + previews, misc
//   • performance — animation level + interface/media autoplay toggles
// Appearance values are surfaced by the workspace as data-attributes on the
// `.tg-surface` roots and applied by CSS (settings.css + tgweb-settings.css); the
// custom wallpaper colour and blur can't be stamped there (workspace isn't ours),
// so — exactly like shared/store/theme.ts — they're pushed onto <html> as a CSS
// var / data-attribute from module scope here. `sendOnEnter` (composer) and
// `soundOn` (message toast sound in messenger/page.tsx) are read by other files.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** Built-in chat-background presets shown as tiles. `default` keeps the signature
 *  doodle wallpaper from theme.css; `solid`/`ocean`/`sunset`/`forest` are defined
 *  in settings.css. `custom` is the user-picked solid colour (see below) and is
 *  driven by the colour picker rather than a tile. */
export type TgWallpaper = "default" | "solid" | "ocean" | "sunset" | "forest" | "custom";
/** The preset TILES (order matters). `custom` is intentionally excluded — it is
 *  selected implicitly by choosing a colour in the "Solid colour" section. */
export const TG_WALLPAPERS: readonly TgWallpaper[] = [
  "default",
  "solid",
  "ocean",
  "sunset",
  "forest",
] as const;

/** Solid-colour swatches offered under Chat background (a subset of the reference
 *  `SettingsGeneralBackgroundColor` PREDEFINED_COLORS). */
export const TG_WP_SWATCHES: readonly string[] = [
  "#e6ebee",
  "#b2cee1",
  "#008dd0",
  "#c6e7cb",
  "#60b16e",
  "#fdd7af",
  "#fdb76e",
  "#dd8851",
] as const;
/** Default custom colour — matches settings.css's light `solid` grey. */
export const TG_WP_COLOR_DEFAULT = "#d5dbe3";

/** Message-bubble text size in px. Mirrors the reference SharedSettings
 *  `messageTextSize` RangeSlider (12–20). Stamped as `data-tg-textsize` and
 *  mapped to `--tg-msg-size` by tgweb-settings.css. */
export const TG_TEXT_SIZE_MIN = 12;
export const TG_TEXT_SIZE_MAX = 20;
export const TG_TEXT_SIZE_DEFAULT = 15;

/** Animation performance level. Stamped as `data-tg-anim` on the `.tg-surface`
 *  roots by the workspace and gated by tg-anim.css:
 *    • `full`    — everything runs (no CSS overrides).
 *    • `reduced` — heavy / looping / decorative + entrance animations are
 *                  dropped; basic hover / opacity transitions are kept.
 *    • `none`    — every animation & transition is collapsed to an instant.
 *  Mirrors the reference AnimationLevel (min / med / max) as three named steps. */
export type TgAnimationLevel = "full" | "reduced" | "none";

export type TgSettingsState = {
  // ── appearance ────────────────────────────────────────────────────────────
  wallpaper: TgWallpaper;
  /** Hex colour for `wallpaper === "custom"`. */
  wallpaperColor: string;
  /** Blur the wallpaper IMAGE layer (reference `isBlurred`). */
  wallpaperBlur: boolean;
  /** Bubble text size in px (12–20). */
  bubbleTextSize: number;
  /** Send on Enter (true) vs Ctrl/Cmd+Enter (false). Read by composer.tsx. */
  sendOnEnter: boolean;

  // ── notifications ─────────────────────────────────────────────────────────
  /** Play a sound on an incoming message. Read by messenger/page.tsx. */
  soundOn: boolean;
  hasWebNotifications: boolean;
  hasPushNotifications: boolean;
  notifyPrivate: boolean;
  previewPrivate: boolean;
  notifyGroups: boolean;
  previewGroups: boolean;
  notifyChannels: boolean;
  previewChannels: boolean;
  contactJoined: boolean;
  pinnedMessages: boolean;

  // ── performance ───────────────────────────────────────────────────────────
  animationLevel: TgAnimationLevel;
  interfaceAnimations: boolean;
  autoplayStickers: boolean;
  autoplayGifs: boolean;

  // ── setters ───────────────────────────────────────────────────────────────
  setWallpaper: (w: TgWallpaper) => void;
  setWallpaperColor: (c: string) => void;
  setWallpaperBlur: (v: boolean) => void;
  setBubbleTextSize: (px: number) => void;
  setSendOnEnter: (v: boolean) => void;

  setSoundOn: (v: boolean) => void;
  setHasWebNotifications: (v: boolean) => void;
  setHasPushNotifications: (v: boolean) => void;
  setNotifyPrivate: (v: boolean) => void;
  setPreviewPrivate: (v: boolean) => void;
  setNotifyGroups: (v: boolean) => void;
  setPreviewGroups: (v: boolean) => void;
  setNotifyChannels: (v: boolean) => void;
  setPreviewChannels: (v: boolean) => void;
  setContactJoined: (v: boolean) => void;
  setPinnedMessages: (v: boolean) => void;

  setAnimationLevel: (l: TgAnimationLevel) => void;
  setInterfaceAnimations: (v: boolean) => void;
  setAutoplayStickers: (v: boolean) => void;
  setAutoplayGifs: (v: boolean) => void;
};

// ── DOM side-effects (values the workspace can't stamp itself) ────────────────
/** Push the custom wallpaper colour onto <html> as `--tg-wp-color`; the
 *  `[data-tg-wallpaper="custom"]` rule in tgweb-settings.css reads it. */
function applyWallpaperColor(color: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--tg-wp-color", color);
}
/** Toggle the wallpaper-image blur via `data-tg-blur` on <html>. */
function applyWallpaperBlur(on: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-tg-blur", on ? "true" : "false");
}

const clampTextSize = (px: number): number =>
  Math.min(TG_TEXT_SIZE_MAX, Math.max(TG_TEXT_SIZE_MIN, Math.round(px)));

export const useTgSettings = create<TgSettingsState>()(
  persist(
    (set) => ({
      // appearance
      wallpaper: "default",
      wallpaperColor: TG_WP_COLOR_DEFAULT,
      wallpaperBlur: false,
      bubbleTextSize: TG_TEXT_SIZE_DEFAULT,
      sendOnEnter: true,

      // notifications
      soundOn: true,
      hasWebNotifications: true,
      hasPushNotifications: false,
      notifyPrivate: true,
      previewPrivate: true,
      notifyGroups: true,
      previewGroups: true,
      notifyChannels: true,
      previewChannels: true,
      contactJoined: true,
      pinnedMessages: true,

      // performance
      animationLevel: "full",
      interfaceAnimations: true,
      autoplayStickers: true,
      autoplayGifs: true,

      // setters
      setWallpaper: (wallpaper) => set({ wallpaper }),
      setWallpaperColor: (wallpaperColor) => {
        applyWallpaperColor(wallpaperColor);
        // Choosing a colour implies the custom solid wallpaper.
        set({ wallpaperColor, wallpaper: "custom" });
      },
      setWallpaperBlur: (wallpaperBlur) => {
        applyWallpaperBlur(wallpaperBlur);
        set({ wallpaperBlur });
      },
      setBubbleTextSize: (px) => set({ bubbleTextSize: clampTextSize(px) }),
      setSendOnEnter: (sendOnEnter) => set({ sendOnEnter }),

      setSoundOn: (soundOn) => set({ soundOn }),
      setHasWebNotifications: (hasWebNotifications) =>
        set(
          hasWebNotifications
            ? { hasWebNotifications }
            : { hasWebNotifications, hasPushNotifications: false },
        ),
      setHasPushNotifications: (hasPushNotifications) => set({ hasPushNotifications }),
      setNotifyPrivate: (notifyPrivate) => set({ notifyPrivate }),
      setPreviewPrivate: (previewPrivate) => set({ previewPrivate }),
      setNotifyGroups: (notifyGroups) => set({ notifyGroups }),
      setPreviewGroups: (previewGroups) => set({ previewGroups }),
      setNotifyChannels: (notifyChannels) => set({ notifyChannels }),
      setPreviewChannels: (previewChannels) => set({ previewChannels }),
      setContactJoined: (contactJoined) => set({ contactJoined }),
      setPinnedMessages: (pinnedMessages) => set({ pinnedMessages }),

      setAnimationLevel: (animationLevel) => set({ animationLevel }),
      setInterfaceAnimations: (interfaceAnimations) => set({ interfaceAnimations }),
      setAutoplayStickers: (autoplayStickers) => set({ autoplayStickers }),
      setAutoplayGifs: (autoplayGifs) => set({ autoplayGifs }),
    }),
    {
      name: "tg-settings",
      version: 3,
      storage: createJSONStorage(() => localStorage),
      // v1 stored bubbleTextSize as "s" | "m" | "l"; map it onto the px scale.
      // v2 stored animationLevel as a 0|1|2 number; map it onto the named scale.
      migrate: (persisted, version) => {
        const state = persisted as Partial<TgSettingsState> & {
          bubbleTextSize?: unknown;
          animationLevel?: unknown;
        };
        if (version < 2 && typeof state?.bubbleTextSize === "string") {
          const map: Record<string, number> = { s: 13, m: 15, l: 17 };
          state.bubbleTextSize = map[state.bubbleTextSize] ?? TG_TEXT_SIZE_DEFAULT;
        }
        if (version < 3 && typeof state?.animationLevel === "number") {
          const map: Record<number, TgAnimationLevel> = { 0: "none", 1: "reduced", 2: "full" };
          state.animationLevel = map[state.animationLevel] ?? "full";
        }
        return state as TgSettingsState;
      },
      // Re-apply the DOM-only values once the persisted choice rehydrates.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        applyWallpaperColor(state.wallpaperColor);
        applyWallpaperBlur(state.wallpaperBlur);
      },
    },
  ),
);

// Apply the DOM-only values on first load (covers first paint before any change
// and the case where rehydration already ran synchronously above).
if (typeof window !== "undefined") {
  const s = useTgSettings.getState();
  applyWallpaperColor(s.wallpaperColor);
  applyWallpaperBlur(s.wallpaperBlur);
}
