import { create } from "zustand";
import { persist } from "zustand/middleware";
import { WALLPAPER_LQIP } from "./wallpaper-lqip";

/**
 * Desktop wallpaper behind the app window. Photo wallpapers served from
 * /public/wallpapers. Swappable from the profile dropdown.
 *
 * `color` (average colour) + `lqip` (40px blur-up placeholder) come from
 * `wallpaper-lqip.ts` and drive the login blur-up so there's no white flash
 * while the full-res photo loads.
 */
export type Wallpaper = { id: string; name: string; css: string; color: string; lqip: string; file: string };

const img = (file: string) => `url('/wallpapers/${file}')`;
const wp = (id: string, name: string, file: string): Wallpaper => ({
  id, name, css: img(file), file: `/wallpapers/${file}`, ...WALLPAPER_LQIP[id],
});

export const WALLPAPERS: Wallpaper[] = [
  wp("rain", "Rain", "rain.jpg"),
  wp("sami", "Aurora", "sami.jpg"),
  wp("kc-welch", "Sky", "kc-welch.jpg"),
  wp("jack-anstey", "Coast", "jack-anstey.jpg"),
  wp("anders", "Fjord", "anders.jpg"),
];

export function wallpaperCss(id: string): string {
  return (WALLPAPERS.find((w) => w.id === id) ?? WALLPAPERS[0]).css;
}

type WallpaperState = {
  id: string;
  setWallpaper: (id: string) => void;
};

export const useWallpaper = create<WallpaperState>()(
  persist(
    (set) => ({
      id: WALLPAPERS[0].id,
      setWallpaper: (id) => set({ id }),
    }),
    {
      name: "aiba.wallpaper",
      // v3: gradient presets removed — keep a valid photo id, else fall back.
      version: 3,
      migrate: (persisted) => {
        const id = (persisted as { id?: string } | undefined)?.id;
        return { id: WALLPAPERS.some((w) => w.id === id) ? (id as string) : "rain" };
      },
    },
  ),
);
