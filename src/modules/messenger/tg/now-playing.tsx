// Shared "now playing" state + the top-bar mini player for the Telegram surface.
//
// Telegram Web A plays audio through ONE global player (the middle/AudioPlayer
// header pane), and every inline voice/audio row just reflects + drives that
// single player — so only one track is ever audible and the header always shows
// what's playing. We mirror that here: a single module-level <audio> engine owns
// playback, this zustand store holds the currently-playing item + live progress,
// the inline rows in message-media.tsx call `play()` / reflect the store, and
// `TgNowPlayingBar` renders the header pane. Bytes come from the auth'd media
// endpoint via `fetchTgMediaBlobUrl` (a plain <audio src> can't carry the JWT).
import { create } from "zustand";
import { Loader2, Mic, Music, Pause, Play, X } from "lucide-react";
import { fetchTgMediaBlobUrl } from "./media";
import "./tgweb-message.css";

export type NowPlayingKind = "voice" | "audio";

/** The track the shared player is on. `url` is the auth'd media endpoint
 *  (`tgMediaUrl`) and doubles as the identity across the store + the inline
 *  rows; `accountId`/`chatId`/`msgId` locate the source message. */
export type NowPlayingItem = {
  accountId: number;
  chatId: number;
  msgId: number;
  url: string;
  name: string;
  kind: NowPlayingKind;
  /** Known duration (seconds) — used as the progress denominator until (or if)
   *  the streamed blob reports a finite `duration` (voice opus often doesn't). */
  duration?: number;
};

type NowPlayingState = {
  /** The current track, or null when nothing is playing. */
  current: NowPlayingItem | null;
  /** Whether the engine is actually playing (mirrors the media element). */
  playing: boolean;
  /** Elapsed fraction 0..1 of the current track. */
  progress: number;
  /** Elapsed seconds. */
  elapsed: number;
  /** Total seconds (0 until known). */
  duration: number;
  /** Fetching the bytes for a freshly-selected track. */
  loading: boolean;

  /** Select + start a track (or resume if it's already the current one). */
  play: (item: NowPlayingItem) => void;
  /** Stop, release the element and clear `current` (hides the bar). */
  stop: () => void;
  /** Play/pause the current track. */
  toggle: () => void;
  /** Seek the current track to `ratio` (0..1). */
  seek: (ratio: number) => void;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ── the single shared <audio> engine (one track plays surface-wide, like
//    Telegram's global player) ─────────────────────────────────────────────────
let el: HTMLAudioElement | null = null;
// Bumped on every track switch / stop so a blob fetch that resolves late can't
// hijack a newer selection.
let token = 0;

function engine(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  if (el) return el;
  const a = new Audio();
  a.preload = "metadata";
  const sync = () => {
    const known = useNowPlaying.getState().duration;
    const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : known;
    useNowPlaying.setState({
      elapsed: a.currentTime,
      duration: dur,
      progress: dur > 0 ? clamp01(a.currentTime / dur) : 0,
    });
  };
  a.addEventListener("play", () => useNowPlaying.setState({ playing: true }));
  a.addEventListener("playing", () => useNowPlaying.setState({ playing: true }));
  a.addEventListener("pause", () => useNowPlaying.setState({ playing: false }));
  a.addEventListener("timeupdate", sync);
  a.addEventListener("loadedmetadata", sync);
  a.addEventListener("ended", () => useNowPlaying.getState().stop());
  el = a;
  return a;
}

export const useNowPlaying = create<NowPlayingState>((set, get) => ({
  current: null,
  playing: false,
  progress: 0,
  elapsed: 0,
  duration: 0,
  loading: false,

  play: (item) => {
    const a = engine();
    if (!a) return;
    // Same track already selected → just (re)start / resume it.
    if (get().current?.url === item.url) {
      void a.play().catch(() => {});
      return;
    }
    // New track → reset state, stream the bytes, then start. Bumping `token`
    // stops the previous track and invalidates any in-flight fetch.
    const my = ++token;
    a.pause();
    set({
      current: item,
      playing: false,
      progress: 0,
      elapsed: 0,
      duration: item.duration && item.duration > 0 ? item.duration : 0,
      loading: true,
    });
    fetchTgMediaBlobUrl(item.url).then(
      (src) => {
        if (my !== token) return; // superseded by a newer selection / stop
        a.src = src;
        set({ loading: false });
        void a.play().catch(() => {});
      },
      () => {
        if (my === token) set({ loading: false });
      },
    );
  },

  stop: () => {
    token++; // ignore any in-flight fetch and stop the ended handler re-entering
    if (el) {
      el.pause();
      // Rewind so re-selecting this same track later restarts from the top
      // (after `ended` the element sits at its duration). Guarded: currentTime
      // can't be set before a source has loaded.
      try {
        el.currentTime = 0;
      } catch {
        /* no source loaded yet — nothing to rewind */
      }
    }
    set({ current: null, playing: false, progress: 0, elapsed: 0, duration: 0, loading: false });
  },

  toggle: () => {
    if (!el || !get().current) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  },

  seek: (ratio) => {
    if (!el || !get().current) return;
    const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : get().duration;
    if (!dur) return;
    const t = clamp01(ratio) * dur;
    try {
      el.currentTime = t; // can throw if the source hasn't loaded metadata yet
    } catch {
      return;
    }
    set({ elapsed: t, progress: clamp01(t / dur) });
  },
}));

// ── TgNowPlayingBar — the header pane (mounted by the chat pane) ────────────────

/** The compact "now playing" top bar. Renders nothing until a track is selected,
 *  then mirrors Telegram's AudioPlayer header: a primary play/pause control, the
 *  track title, a thin (clickable) seek line and a ✕ that stops playback. Reads
 *  the shared engine above — takes NO props. */
export function TgNowPlayingBar() {
  const current = useNowPlaying((s) => s.current);
  const playing = useNowPlaying((s) => s.playing);
  const loading = useNowPlaying((s) => s.loading);
  const progress = useNowPlaying((s) => s.progress);

  if (!current) return null;

  const KindIcon = current.kind === "voice" ? Mic : Music;

  return (
    <div className="tg-nowplaying">
      <button
        type="button"
        className="tg-nowplaying-btn"
        aria-label={playing ? "Pause" : "Play"}
        onClick={() => useNowPlaying.getState().toggle()}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : playing ? (
          <Pause className="size-4" fill="currentColor" />
        ) : (
          <Play className="size-4 translate-x-px" fill="currentColor" />
        )}
      </button>

      <div className="tg-nowplaying-body">
        <div className="tg-nowplaying-title">
          <KindIcon className="tg-nowplaying-kind size-3.5" />
          <span className="tg-nowplaying-name">{current.name}</span>
        </div>
        <div
          className="tg-nowplaying-track"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            useNowPlaying.getState().seek((e.clientX - r.left) / r.width);
          }}
        >
          <span className="tg-nowplaying-fill" style={{ width: `${clamp01(progress) * 100}%` }} />
        </div>
      </div>

      <button
        type="button"
        className="tg-nowplaying-close"
        aria-label="Close"
        onClick={() => useNowPlaying.getState().stop()}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
