// Custom video player for the Telegram media viewer (lightbox) — a faithful port
// of Telegram Web A's `VideoPlayer` + `VideoPlayerControls` + `SeekLine`. It
// replaces the browser-native `controls` attribute with our own chrome:
//   • a custom seek line that paints the BUFFERED ranges (from `video.buffered`)
//     behind a played-progress bar with a draggable thumb;
//   • play / pause, a hover-expand volume slider + mute, a playback-rate menu
//     (0.5×–2×), Picture-in-Picture and Fullscreen toggles, and a time readout;
//   • auto-hiding controls (fade out ~3s into playback, back on pointer move).
//
// It is used ONLY inside media-viewer.tsx, which injects the `.VideoPlayer` /
// `.VideoPlayerControls` / `.SeekLine` CSS (ported from the reference .scss) — so
// this file carries the behaviour and the reference DOM/classes, the viewer
// carries the matching styles. `src` is an already-resolved blob object-URL (the
// auth'd bytes are fetched once via the shared blob cache), so the <video> here
// needs no JWT. A `gif` renders as a bare autoplay/muted/looping <video> with no
// control bar, exactly like the reference.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";

type Tr = (k: string, d: string) => string;

const PLAYBACK_RATES = [0.5, 1, 1.5, 2] as const;
const HIDE_CONTROLS_MS = 3000;
const REWIND_STEP = 5; // seconds (fullscreen arrow-key seek)

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** seconds → m:ss (or h:mm:ss) — mirrors the reference `formatMediaDuration`. */
function fmtMediaDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const total = Math.floor(sec);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

type Range = { start: number; end: number };

/** Read a <video>'s buffered TimeRanges as 0..1 fractions of its duration. */
function readBuffered(v: HTMLVideoElement): Range[] {
  const out: Range[] = [];
  const d = v.duration;
  if (!d || !Number.isFinite(d)) return out;
  for (let i = 0; i < v.buffered.length; i++) {
    out.push({ start: v.buffered.start(i) / d, end: v.buffered.end(i) / d });
  }
  return out;
}

export function TgVideoPlayer({
  src,
  poster,
  isGif = false,
  autoPlay = true,
  name,
  tr,
  className,
}: {
  /** Resolved blob object-URL for the video bytes (null while still loading). */
  src?: string | null;
  poster?: string | null;
  /** GIF → bare autoplay/muted/looping video with no control bar. */
  isGif?: boolean;
  autoPlay?: boolean;
  name?: string | null;
  tr?: Tr;
  className?: string;
}) {
  const t: Tr = tr ?? ((_k, d) => d);
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const seekRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [buffered, setBuffered] = useState<Range[]>([]);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(isGif);
  const [rate, setRate] = useState(1);
  const [isFs, setIsFs] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const [seeking, setSeeking] = useState(false);
  const [visible, setVisible] = useState(true);

  // Mirror state the auto-hide + keyboard effects read, so they never re-subscribe.
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const seekingRef = useRef(seeking);
  seekingRef.current = seeking;
  const rateOpenRef = useRef(rateOpen);
  rateOpenRef.current = rateOpen;

  const pipSupported =
    typeof document !== "undefined" && (document as Document).pictureInPictureEnabled === true;

  // ── controls auto-hide ─────────────────────────────────────────────────────
  const showControls = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (playingRef.current && !seekingRef.current && !rateOpenRef.current) setVisible(false);
    }, HIDE_CONTROLS_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  // Keep the control bar up whenever playback is paused / seeking / menu open.
  useEffect(() => {
    if (!playing || seeking || rateOpen) {
      setVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    } else {
      showControls();
    }
  }, [playing, seeking, rateOpen, showControls]);

  // ── imperative <video> sync ────────────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (v) v.volume = volume;
  }, [volume]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.muted = muted;
  }, [muted]);

  useEffect(() => {
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
  }, [rate]);

  // Chrome won't always autoplay on `src` swap even with the attribute — force it.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src || !autoPlay) return;
    void v.play().catch(() => {
      /* autoplay blocked → the big center play button covers it */
    });
  }, [src, autoPlay]);

  // ── fullscreen / PiP tracking ──────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFs(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const togglePlay = useCallback((e?: { stopPropagation?: () => void }) => {
    e?.stopPropagation?.();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) void v.play().catch(() => {});
    else v.pause();
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen().catch(() => {});
  }, []);

  const togglePip = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
    else void v.requestPictureInPicture().catch(() => {});
  }, []);

  // ── keyboard (space/enter toggle; arrows seek only while fullscreen so the
  //    viewer keeps arrows for prev/next when not fullscreen) ──────────────────
  useEffect(() => {
    if (isGif) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        togglePlay();
      } else if (
        document.fullscreenElement === wrapRef.current &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        e.preventDefault();
        e.stopPropagation();
        const v = videoRef.current;
        if (v && Number.isFinite(v.duration)) {
          v.currentTime = clamp(
            v.currentTime + (e.key === "ArrowRight" ? REWIND_STEP : -REWIND_STEP),
            0,
            v.duration,
          );
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isGif, togglePlay]);

  // ── seek line drag ─────────────────────────────────────────────────────────
  const seekToClientX = useCallback((clientX: number) => {
    const el = seekRef.current;
    const v = videoRef.current;
    if (!el || !v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    const r = el.getBoundingClientRect();
    const ratio = clamp((clientX - r.left) / r.width, 0, 1);
    v.currentTime = ratio * v.duration;
    setCur(v.currentTime);
  }, []);

  const onSeekPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      setSeeking(true);
      seekToClientX(e.clientX);
      const move = (ev: PointerEvent) => seekToClientX(ev.clientX);
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        setSeeking(false);
        showControls();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [seekToClientX, showControls],
  );

  // ── GIF: bare looping video, no chrome ─────────────────────────────────────
  if (isGif) {
    return (
      <div ref={wrapRef} className={cn("VideoPlayer", className)}>
        <div className="mv-video-box">
          <video
            ref={videoRef}
            src={src ?? undefined}
            poster={poster ?? undefined}
            autoPlay={autoPlay}
            loop
            muted
            playsInline
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    );
  }

  const progress = dur > 0 ? clamp(cur / dur, 0, 1) : 0;
  const volIcon = muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const VolIcon = volIcon;

  return (
    <div
      ref={wrapRef}
      className={cn("VideoPlayer", visible && "controls-visible", className)}
      onMouseMove={showControls}
    >
      <div className="mv-video-box">
        <video
          ref={videoRef}
          src={src ?? undefined}
          poster={poster ?? undefined}
          autoPlay={autoPlay}
          playsInline
          muted={muted}
          onClick={(e) => {
            e.stopPropagation();
            if (!isFs) togglePlay();
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          onPlay={() => {
            setPlaying(true);
            setWaiting(false);
          }}
          onPause={() => setPlaying(false)}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onEnded={() => setPlaying(false)}
          onDurationChange={(e) => setDur(e.currentTarget.duration || 0)}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
          onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
          onProgress={(e) => setBuffered(readBuffered(e.currentTarget))}
        />
      </div>

      {/* buffering / initial spinner */}
      {(waiting || (!src && autoPlay)) && (
        <div className="mv-video-spinner">
          <Loader2 className="size-10 animate-spin" />
        </div>
      )}

      {/* big center play affordance while paused */}
      {!playing && !waiting && src && (
        <button
          type="button"
          className="mv-video-bigplay"
          aria-label={t("play", "Play")}
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
        >
          <Play className="size-8 translate-x-0.5" fill="currentColor" />
        </button>
      )}

      {/* control bar */}
      <div
        className={cn("VideoPlayerControls", visible && "active")}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* seek line: buffered track under a played track + thumb */}
        <div className="SeekLine" ref={seekRef} onPointerDown={onSeekPointerDown}>
          <div className="mv-seek-track">
            {buffered.map((b, i) => (
              <div
                key={`${b.start}-${b.end}-${i}`}
                className="mv-seek-buffered"
                style={{ left: `${b.start * 100}%`, right: `${100 - b.end * 100}%` }}
              />
            ))}
          </div>
          <div className="mv-seek-track">
            <div className={cn("mv-seek-played", seeking && "seeking")} style={{ width: `${progress * 100}%` }} />
          </div>
        </div>

        <div className="mv-controls-row">
          <button type="button" className="mv-cbtn play" aria-label={t("playPause", "Play/Pause")} onClick={togglePlay}>
            {playing ? <Pause className="size-5" fill="currentColor" /> : <Play className="size-5 translate-x-px" fill="currentColor" />}
          </button>

          <div className="mv-volume">
            <button
              type="button"
              className="mv-cbtn volume"
              aria-label={t("volume", "Volume")}
              onClick={() => setMuted((m) => !m)}
            >
              <VolIcon className="size-5" />
            </button>
            <input
              className="mv-volume-slider"
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : Math.round(volume * 100)}
              aria-label={t("volume", "Volume")}
              onChange={(e) => {
                const v = Number(e.currentTarget.value) / 100;
                setVolume(v);
                setMuted(v === 0);
              }}
            />
          </div>

          <div className="mv-time">
            {fmtMediaDuration(cur)} / {fmtMediaDuration(dur)}
          </div>

          <div className="mv-spacer" />

          <div className="mv-rate">
            <button
              type="button"
              className="mv-cbtn playback-rate"
              aria-label={t("playbackRate", "Playback rate")}
              onClick={() => setRateOpen((o) => !o)}
            >
              {rate}x
            </button>
            {rateOpen && (
              <div className="mv-rate-menu" role="menu">
                {PLAYBACK_RATES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="menuitemradio"
                    aria-checked={rate === r}
                    className={cn("mv-rate-item", rate === r && "active")}
                    onClick={() => {
                      setRate(r);
                      setRateOpen(false);
                    }}
                  >
                    {r}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {pipSupported && (
            <button type="button" className="mv-cbtn" aria-label={t("pip", "Picture in picture")} onClick={togglePip}>
              <PictureInPicture2 className="size-5" />
            </button>
          )}

          <button
            type="button"
            className="mv-cbtn fullscreen"
            aria-label={t("fullscreen", "Fullscreen")}
            onClick={toggleFullscreen}
          >
            {isFs ? <Minimize className="size-5" /> : <Maximize className="size-5" />}
          </button>
        </div>
      </div>

      {name ? <span className="sr-only">{name}</span> : null}
    </div>
  );
}
