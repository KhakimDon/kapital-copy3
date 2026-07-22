// Media bodies for a Telegram bubble — FULL Telegram Web A parity. Every media
// kind grammers exposes gets its real rendering here:
//   • photo    — inline rounded image, click → full-screen TgMediaViewer;
//   • video    — poster (thumb) + ▶ + duration badge, click → inline <video>;
//                round videos render as a circle;
//   • gif      — autoplay muted looping <video> with a "GIF" badge;
//   • audio    — a music player row (play/pause, title/performer, seek, times);
//   • voice    — a voice player (play/pause, waveform, elapsed/duration);
//   • sticker  — static webp <img>, tgs Lottie (AnimatedSticker), or webm <video>,
//                with NO bubble background (transparent, like real TG);
//   • document — the classic Telegram file row (round icon + name + size);
//   • location/venue — a static OpenStreetMap preview + title/address + open link;
//   • contact  — a contact card (monogram avatar + name + phone);
//   • poll      — a read-only poll card (question + option bars + voter total);
//   • webpage  — a link-preview card (site name + title + description + photo).
//
// All bytes come through the auth'd media endpoint (a plain <img src> can't carry
// the JWT), resolved to a cached blob object-URL via `useTgMediaSrc`. Colors come
// from the scoped `--tg-*` theme vars so light + dark are free.
import { useState } from "react";
import {
  Download,
  File as FileIcon,
  FileText,
  Loader2,
  MapPin,
  Music,
  Pause,
  Play,
} from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { initials } from "../avatar";
import type { TgMedia } from "./api";
import { downloadTgMedia, fmtSize, useTgMediaSrc } from "./media";
import { senderColor } from "./shared";
import { AnimatedSticker } from "./animated-sticker";
import { TgMediaViewer } from "./media-viewer";
import { useNowPlaying, type NowPlayingItem, type NowPlayingKind } from "./now-playing";

type Tr = (k: string, d: string) => string;

/** The small thumbnail (video/gif poster) URL for a media message — mirrors
 *  `tgThumbUrl` (which just appends `?thumb=1` to the bytes endpoint). */
const thumbOf = (url: string) => `${url}${url.includes("?") ? "&" : "?"}thumb=1`;

/** Visual media that renders edge-to-edge WITHOUT the solid bubble background
 *  when it carries no caption (photo / video / gif / sticker). `message-bubble`
 *  reads this to drop the bubble background and overlay the meta on the media,
 *  exactly like real Telegram. */
export function isBubblelessMedia(media: TgMedia): boolean {
  return (
    media.type === "photo" ||
    media.type === "video" ||
    media.type === "gif" ||
    media.type === "sticker"
  );
}

/** seconds → m:ss (or h:mm:ss). Guards null / NaN → "0:00". */
function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "0:00";
  const total = Math.floor(sec);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${ss}`;
  return `${m}:${ss}`;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The time+ticks meta pill overlaid bottom-right on media-only visual bodies. */
function MetaScrim({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute bottom-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-[10px] bg-black/45 px-1.5 py-0.5 text-[11px] leading-none text-white">
      {children}
    </span>
  );
}

// ── dispatcher ─────────────────────────────────────────────────────────────────

/** Dispatch a media attachment to the right body. `meta` is the time+ticks node
 *  overlaid on media-only visual bodies; `hasCaption` is true when bubble text
 *  follows (so the media keeps its bottom square and does not overlay the meta). */
export function TgMediaBody({
  media,
  url,
  tr,
  meta,
  hasCaption,
  roundTop = true,
}: {
  media: TgMedia;
  url: string;
  tr: Tr;
  meta?: React.ReactNode;
  hasCaption?: boolean;
  /** Round the media's top corners — false when a sender name sits above it. */
  roundTop?: boolean;
}) {
  const cap = !!hasCaption;
  switch (media.type) {
    case "photo":
      return <PhotoBody media={media} url={url} meta={meta} hasCaption={cap} roundTop={roundTop} />;
    case "video":
      return (
        <VideoBody media={media} url={url} meta={meta} hasCaption={cap} roundTop={roundTop} />
      );
    case "gif":
      return <GifBody media={media} url={url} meta={meta} hasCaption={cap} roundTop={roundTop} />;
    case "audio":
      return <AudioBody media={media} url={url} tr={tr} />;
    case "voice":
      return <VoiceBody media={media} url={url} tr={tr} />;
    case "sticker":
      return <StickerBody media={media} url={url} meta={meta} />;
    case "document":
      return <DocumentBody media={media} url={url} tr={tr} />;
    case "location":
    case "venue":
      return <LocationBody media={media} tr={tr} />;
    case "contact":
      return <ContactBody media={media} tr={tr} />;
    case "poll":
      return <PollBody media={media} tr={tr} />;
    case "webpage":
      return <WebpageBody media={media} url={url} />;
    default:
      return (
        <div className="flex items-center gap-2 px-2.5 py-1.5 text-[13px] text-[var(--tg-text-secondary)]">
          <FileIcon className="size-4 shrink-0" />
          {media.name || tr("attachment", "Ilova")}
        </div>
      );
  }
}

// ── photo — edge to edge, click → full-screen viewer ────────────────────────────

function PhotoBody({
  media,
  url,
  meta,
  hasCaption,
  roundTop,
}: {
  media: TgMedia;
  url: string;
  meta?: React.ReactNode;
  hasCaption: boolean;
  roundTop: boolean;
}) {
  const { src, loading, failed } = useTgMediaSrc(media.downloadable === false ? null : url);
  const [viewer, setViewer] = useState(false);

  const round = cn(
    roundTop && "rounded-t-[var(--tg-radius)]",
    !hasCaption && "rounded-b-[var(--tg-radius)]",
  );
  // A computed frame (like Telegram's `calculateMediaDimensions`): the box keeps
  // the photo's aspect — clamped so ultra-wide/tall images still fill a sane box —
  // capped at a max height, and the image COVERS it (no grey letterbox bands).
  // Placeholders reuse the frame so there's no reflow when the bytes resolve.
  const ratio = media.w && media.h ? Math.min(3.2, Math.max(0.4, media.w / media.h)) : null;
  const frameStyle: React.CSSProperties = ratio
    ? { aspectRatio: String(ratio), maxHeight: "26rem" }
    : { maxHeight: "26rem" };
  const phStyle: React.CSSProperties = ratio ? frameStyle : { height: "13rem" };

  if (media.downloadable === false || failed) {
    return (
      <div
        className={cn("grid w-[min(20rem,66vw)] place-items-center bg-black/10", round)}
        style={phStyle}
      >
        <FileIcon className="size-7 text-[var(--tg-text-secondary)]" />
      </div>
    );
  }

  if (loading || !src) {
    return (
      <div
        className={cn("grid w-[min(20rem,66vw)] place-items-center bg-black/10", round)}
        style={phStyle}
      >
        <Loader2 className="size-5 animate-spin text-[var(--tg-text-secondary)]" />
      </div>
    );
  }

  return (
    <div className={cn("relative w-[min(20rem,66vw)] overflow-hidden", round)} style={frameStyle}>
      <img
        src={src}
        alt={media.name ?? ""}
        className={cn(
          "cursor-zoom-in object-cover",
          // Known dims → the image absolutely fills the aspect-ratio frame (covers,
          // centered, no letterbox). Unknown dims → it sizes the box naturally.
          ratio ? "absolute inset-0 block size-full" : "block max-h-[26rem] w-full",
        )}
        onClick={() => setViewer(true)}
        draggable={false}
      />
      {!hasCaption && meta && <MetaScrim>{meta}</MetaScrim>}
      {viewer && (
        <TgMediaViewer
          src={src}
          kind="photo"
          name={media.name ?? ""}
          onClose={() => setViewer(false)}
        />
      )}
    </div>
  );
}

// ── video — poster + play, click → inline; round videos render as a circle ──────

function VideoBody({
  media,
  url,
  meta,
  hasCaption,
  roundTop,
}: {
  media: TgMedia;
  url: string;
  meta?: React.ReactNode;
  hasCaption: boolean;
  roundTop: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const isRound = !!media.round;
  const canPlay = media.downloadable !== false;

  // Poster only until play; the full bytes only once the user hits ▶.
  const { src: poster } = useTgMediaSrc(playing || !canPlay ? null : thumbOf(url));
  const { src: videoSrc } = useTgMediaSrc(playing ? url : null);

  const round = isRound
    ? "rounded-full"
    : cn(
        roundTop && "rounded-t-[var(--tg-radius)]",
        !hasCaption && "rounded-b-[var(--tg-radius)]",
      );
  const box = isRound ? "size-[min(15rem,58vw)]" : "w-[min(20rem,66vw)]";

  if (playing) {
    return (
      <div className={cn("relative overflow-hidden bg-black", box, round)}>
        <video
          src={videoSrc ?? undefined}
          autoPlay
          playsInline
          controls={!isRound}
          onClick={
            isRound
              ? (e) => {
                  const v = e.currentTarget;
                  if (v.paused) void v.play();
                  else v.pause();
                }
              : undefined
          }
          onEnded={() => setPlaying(false)}
          className={cn(
            "block h-full w-full",
            isRound ? "object-cover" : "max-h-[26rem] object-contain",
          )}
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={!canPlay}
      onClick={() => canPlay && setPlaying(true)}
      className={cn("relative block overflow-hidden bg-black/20", box, round)}
    >
      {poster ? (
        <img src={poster} alt="" className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className={cn("grid w-full place-items-center", isRound ? "h-full" : "h-44")}>
          <Loader2 className="size-5 animate-spin text-white/70" />
        </span>
      )}
      {/* play button */}
      <span className="absolute inset-0 grid place-items-center">
        <span className="grid size-12 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm">
          <Play className="size-6 translate-x-0.5" fill="currentColor" />
        </span>
      </span>
      {/* duration badge */}
      {media.duration != null && media.duration > 0 && (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[11px] font-medium leading-none text-white">
          {fmtDuration(media.duration)}
        </span>
      )}
      {!hasCaption && meta && <MetaScrim>{meta}</MetaScrim>}
    </button>
  );
}

// ── gif — autoplay muted loop ───────────────────────────────────────────────────

function GifBody({
  media,
  url,
  meta,
  hasCaption,
  roundTop,
}: {
  media: TgMedia;
  url: string;
  meta?: React.ReactNode;
  hasCaption: boolean;
  roundTop: boolean;
}) {
  const canPlay = media.downloadable !== false;
  const { src, failed } = useTgMediaSrc(canPlay ? url : null);
  const { src: poster } = useTgMediaSrc(canPlay ? thumbOf(url) : null);

  const round = cn(
    roundTop && "rounded-t-[var(--tg-radius)]",
    !hasCaption && "rounded-b-[var(--tg-radius)]",
  );
  const aspect = media.w && media.h ? media.w / media.h : undefined;

  return (
    <div className={cn("relative w-[min(20rem,66vw)] overflow-hidden bg-black/20", round)}>
      {src && !failed ? (
        <video
          src={src}
          poster={poster ?? undefined}
          autoPlay
          loop
          muted
          playsInline
          className="block max-h-[26rem] w-full object-contain"
        />
      ) : poster ? (
        // fallback: the poster still shows the frame if the <video> can't load
        <img src={poster} alt="" className="block max-h-[26rem] w-full object-contain" />
      ) : (
        <div
          className="grid w-full place-items-center"
          style={aspect ? { aspectRatio: String(aspect) } : { height: "11rem" }}
        >
          <Loader2 className="size-5 animate-spin text-white/70" />
        </div>
      )}
      <span className="absolute left-1.5 top-1.5 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold leading-none tracking-wide text-white">
        GIF
      </span>
      {!hasCaption && meta && <MetaScrim>{meta}</MetaScrim>}
    </div>
  );
}

// ── shared audio playback (single global track via the now-playing engine) ───────
// Voice + audio rows don't own an <audio> anymore: they drive the ONE shared
// player in `now-playing.tsx` (so a second voice/audio can't play over the first,
// and the top bar reflects whatever is playing) and reflect its live state only
// while THIS row is the current track — idle rows read constants, so a playback
// tick never re-renders every audio bubble in the chat.

const TG_MEDIA_ID_RE = /accounts\/(-?\d+)\/chats\/(-?\d+)\/messages\/(-?\d+)/;

/** Recover the source message coordinates from an auth'd media url
 *  (`.../accounts/{a}/chats/{c}/messages/{m}/media`) for the now-playing item. */
function tgMediaIds(url: string): { accountId: number; chatId: number; msgId: number } {
  const m = TG_MEDIA_ID_RE.exec(url);
  return {
    accountId: m ? Number(m[1]) : 0,
    chatId: m ? Number(m[2]) : 0,
    msgId: m ? Number(m[3]) : 0,
  };
}

/** Build the now-playing item for a voice/audio row. */
function nowPlayingItem(url: string, media: TgMedia, kind: NowPlayingKind, tr: Tr): NowPlayingItem {
  const name =
    kind === "audio"
      ? media.title || media.name || media.performer || tr("audio", "Audio")
      : tr("voice", "Ovozli xabar");
  return { ...tgMediaIds(url), url, name, kind, duration: media.duration ?? undefined };
}

/** Bridge a single voice/audio row to the shared now-playing engine: click
 *  actions drive the store; playing / progress / times are reflected back ONLY
 *  when this row is the current track. */
function useMediaPlayer(item: NowPlayingItem | null, canPlay: boolean, fallbackDur: number) {
  const isCurrent = useNowPlaying((s) => !!item && s.current?.url === item.url);
  const playing = useNowPlaying((s) => (isCurrent ? s.playing : false));
  const loading = useNowPlaying((s) => (isCurrent ? s.loading : false));
  const frac = useNowPlaying((s) => (isCurrent ? s.progress : 0));
  const elapsed = useNowPlaying((s) => (isCurrent ? s.elapsed : 0));
  const storeDur = useNowPlaying((s) => (isCurrent ? s.duration : 0));

  const len = isCurrent && storeDur > 0 ? storeDur : fallbackDur;
  const cur = isCurrent ? elapsed : 0;

  const toggle = () => {
    if (!canPlay || !item) return;
    const s = useNowPlaying.getState();
    if (s.current?.url === item.url) s.toggle();
    else s.play(item);
  };
  const seekTo = (ratio: number) => {
    if (!canPlay || !item) return;
    const s = useNowPlaying.getState();
    if (s.current?.url === item.url) s.seek(ratio);
    else s.play(item);
  };

  return { playing, busy: loading, cur, len, frac: clamp01(frac), toggle, seekTo };
}

/** Round play/pause button used by the audio + voice rows. */
function PlayPauseBtn({
  playing,
  busy,
  onClick,
}: {
  playing: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--tg-primary)] text-white"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : playing ? (
        <Pause className="size-5" fill="currentColor" />
      ) : (
        <Play className="size-5 translate-x-0.5" fill="currentColor" />
      )}
    </button>
  );
}

// ── audio (music) — player row ──────────────────────────────────────────────────

function AudioBody({ media, url, tr }: { media: TgMedia; url: string; tr: Tr }) {
  const canPlay = media.downloadable !== false;
  const item = canPlay ? nowPlayingItem(url, media, "audio", tr) : null;
  const { playing, cur, len, frac, toggle, seekTo, busy } = useMediaPlayer(
    item,
    canPlay,
    media.duration ?? 0,
  );
  const pct = frac * 100;

  return (
    <div className="flex min-w-[15rem] max-w-[19rem] items-center gap-2.5 px-2.5 py-1.5">
      <PlayPauseBtn playing={playing} busy={busy} onClick={toggle} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 truncate text-[14px] font-medium">
          <Music className="size-3.5 shrink-0 text-[var(--tg-text-secondary)]" />
          {media.title || media.name || tr("audio", "Audio")}
        </span>
        {media.performer && (
          <span className="block truncate text-xs text-[var(--tg-text-secondary)]">
            {media.performer}
          </span>
        )}
        <span
          role="slider"
          aria-label="seek"
          aria-valuenow={Math.round(pct)}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - r.left) / r.width);
          }}
          className="mt-1 block h-1 cursor-pointer overflow-hidden rounded-full bg-black/15 dark:bg-white/20"
        >
          <span className="block h-full rounded-full bg-[var(--tg-primary)]" style={{ width: `${pct}%` }} />
        </span>
        <span className="mt-0.5 flex justify-between text-[10px] tabular-nums text-[var(--tg-text-secondary)]">
          <span>{fmtDuration(cur)}</span>
          <span>{fmtDuration(len)}</span>
        </span>
      </span>
    </div>
  );
}

// ── voice — player with a waveform ──────────────────────────────────────────────

/** Normalise a raw TG waveform (0–31 amplitudes, or any scale) into 0..1 bar
 *  heights, downsampled to `want` bars. Empty → a flat low waveform. */
function waveBars(wf: number[] | null | undefined, want = 44): number[] {
  if (!wf || wf.length === 0) return Array.from({ length: want }, () => 0.35);
  const peak = Math.max(1, ...wf);
  const scale = peak <= 31 ? 31 : peak;
  const norm = wf.map((v) => clamp01(v / scale));
  if (norm.length <= want) return norm;
  const out: number[] = [];
  const step = norm.length / want;
  for (let i = 0; i < want; i++) {
    const a = Math.floor(i * step);
    const b = Math.max(a + 1, Math.floor((i + 1) * step));
    let sum = 0;
    let cnt = 0;
    for (let j = a; j < b && j < norm.length; j++) {
      sum += norm[j];
      cnt++;
    }
    out.push(cnt ? sum / cnt : 0);
  }
  return out;
}

function VoiceBody({ media, url, tr }: { media: TgMedia; url: string; tr: Tr }) {
  const canPlay = media.downloadable !== false;
  const item = canPlay ? nowPlayingItem(url, media, "voice", tr) : null;
  const { playing, cur, len, frac, toggle, seekTo, busy } = useMediaPlayer(
    item,
    canPlay,
    media.duration ?? 0,
  );
  const bars = waveBars(media.waveform);
  const progress = frac;

  return (
    <div className="flex min-w-[13rem] max-w-[18rem] items-center gap-2.5 px-2.5 py-1.5">
      <PlayPauseBtn playing={playing} busy={busy} onClick={toggle} />
      <span className="min-w-0 flex-1">
        <span
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            seekTo((e.clientX - r.left) / r.width);
          }}
          className="flex h-6 cursor-pointer items-center gap-[2px]"
          aria-label={tr("voice", "Ovozli xabar")}
        >
          {bars.map((v, i) => {
            const active = i / bars.length <= progress;
            return (
              <span
                key={i}
                className={cn(
                  "w-[2px] shrink-0 rounded-full",
                  active ? "bg-[var(--tg-primary)]" : "bg-black/20 dark:bg-white/25",
                )}
                style={{ height: `${Math.max(12, v * 100)}%` }}
              />
            );
          })}
        </span>
        <span className="mt-0.5 block text-[10px] tabular-nums text-[var(--tg-text-secondary)]">
          {fmtDuration(playing || cur > 0 ? cur : len)}
        </span>
      </span>
    </div>
  );
}

// ── sticker — static / tgs / webm, NO bubble background ─────────────────────────

/** Cap a sticker to ~180px on its longer side, preserving aspect (default square
 *  when dimensions are unknown — real TG stickers are 512×512). */
function stickerBox(w?: number | null, h?: number | null): { w: number; h: number } {
  const MAX = 180;
  if (!w || !h) return { w: MAX, h: MAX };
  const s = Math.min(MAX / w, MAX / h, 1) || 1;
  return { w: Math.round(w * s) || MAX, h: Math.round(h * s) || MAX };
}

function StickerBody({ media, url, meta }: { media: TgMedia; url: string; meta?: React.ReactNode }) {
  const canPlay = media.downloadable !== false;
  const { src, loading } = useTgMediaSrc(canPlay ? url : null);
  const kind = media.kind ?? "static";
  const box = stickerBox(media.w, media.h);

  return (
    <div className="relative" style={{ width: box.w, height: box.h }}>
      {!src ? (
        <span className="grid h-full w-full place-items-center">
          {loading ? (
            <Loader2 className="size-6 animate-spin text-[var(--tg-text-secondary)]" />
          ) : (
            <span className="text-4xl leading-none">{media.emoji || "🖼️"}</span>
          )}
        </span>
      ) : kind === "tgs" ? (
        <AnimatedSticker tgsUrl={src} size={Math.max(box.w, box.h)} className="!h-full !w-full" />
      ) : kind === "webm" ? (
        <video
          src={src}
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-contain"
        />
      ) : (
        <img
          src={src}
          alt={media.emoji ?? ""}
          className="h-full w-full object-contain"
          draggable={false}
        />
      )}
      {meta && (
        <span className="pointer-events-none absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-[10px] bg-black/35 px-1.5 py-0.5 text-[11px] leading-none text-white">
          {meta}
        </span>
      )}
    </div>
  );
}

// ── document — round icon + name + size/type ────────────────────────────────────

function DocumentBody({ media, url, tr }: { media: TgMedia; url: string; tr: Tr }) {
  const [busy, setBusy] = useState(false);
  const canDownload = media.downloadable !== false;
  return (
    <button
      type="button"
      disabled={!canDownload || busy}
      className="flex min-w-[13rem] items-center gap-2.5 px-2.5 py-1.5 text-left disabled:opacity-60"
      onClick={async () => {
        if (busy || !canDownload) return;
        setBusy(true);
        try {
          await downloadTgMedia(url, media.name ?? "file");
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--tg-primary)] text-white">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">
          {media.name || tr("file", "Fayl")}
        </span>
        <span className="flex items-center gap-1 text-xs text-[var(--tg-text-secondary)]">
          {fmtSize(media.size) || tr("document", "Hujjat")}
          {canDownload && <Download className="size-3" />}
        </span>
      </span>
    </button>
  );
}

// ── location / venue — static OpenStreetMap preview ─────────────────────────────

/** The layered-gradient faux map used while / if the OSM tile can't load. */
function FauxMap() {
  return (
    <div
      className="h-full w-full"
      style={{
        backgroundColor: "#a7d3a1",
        backgroundImage:
          "linear-gradient(115deg, rgba(255,255,255,0.35) 0%, transparent 45%)," +
          "linear-gradient(0deg, rgba(0,0,0,0.06) 1px, transparent 1px)," +
          "linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)",
        backgroundSize: "100% 100%, 26px 26px, 26px 26px",
      }}
    />
  );
}

function LocationBody({ media, tr }: { media: TgMedia; tr: Tr }) {
  const lat = media.lat ?? 0;
  const lon = media.lon ?? 0;
  const [tileFailed, setTileFailed] = useState(false);
  const staticUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=15&size=280x150&markers=${lat},${lon},red`;
  const osmLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;

  return (
    <a
      href={osmLink}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-[min(18rem,64vw)] overflow-hidden rounded-[calc(var(--tg-radius)-4px)]"
    >
      <div className="relative h-[150px] w-full bg-[#a7d3a1]">
        {tileFailed ? (
          <FauxMap />
        ) : (
          <img
            src={staticUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            onError={() => setTileFailed(true)}
          />
        )}
        {/* the OSM tile carries its own red marker; only draw a pin on the faux map */}
        {tileFailed && (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full">
            <MapPin className="size-7 fill-[var(--tg-primary)] text-white drop-shadow" />
          </span>
        )}
      </div>
      <div className="bg-black/5 px-2.5 py-1.5 dark:bg-white/5">
        {media.title ? (
          <span className="block truncate text-[14px] font-medium">{media.title}</span>
        ) : (
          <span className="block text-[13px] font-medium tabular-nums">
            {lat.toFixed(5)}, {lon.toFixed(5)}
          </span>
        )}
        {media.address && (
          <span className="block truncate text-xs text-[var(--tg-text-secondary)]">
            {media.address}
          </span>
        )}
        <span className="text-xs text-[var(--tg-link)]">{tr("openOnMap", "Xaritada ochish")}</span>
      </div>
    </a>
  );
}

// ── contact — monogram avatar + name + phone ────────────────────────────────────

function ContactBody({ media, tr }: { media: TgMedia; tr: Tr }) {
  const name =
    [media.firstName, media.lastName].filter(Boolean).join(" ") ||
    media.name ||
    tr("contact", "Kontakt");
  return (
    <div className="flex min-w-[13rem] max-w-[18rem] items-center gap-2.5 px-2.5 py-1.5">
      <span
        className="grid size-10 shrink-0 place-items-center rounded-full text-[15px] font-medium text-white"
        style={{ background: senderColor(String(media.userId ?? name)) }}
      >
        {initials(name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium">{name}</span>
        {media.phone ? (
          <a
            href={`tel:${media.phone}`}
            onClick={(e) => e.stopPropagation()}
            className="block truncate text-xs text-[var(--tg-link)]"
          >
            {media.phone}
          </a>
        ) : (
          <span className="block truncate text-xs text-[var(--tg-text-secondary)]">
            {tr("contact", "Kontakt")}
          </span>
        )}
      </span>
    </div>
  );
}

// ── poll — read-only card with option bars ──────────────────────────────────────

function PollBody({ media, tr }: { media: TgMedia; tr: Tr }) {
  const options = media.options ?? [];
  const total =
    media.totalVoters ?? options.reduce((sum, o) => sum + (o.voters || 0), 0);

  return (
    <div className="min-w-[15rem] max-w-[20rem] px-2.5 py-1.5">
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--tg-text-secondary)]">
        {media.closed ? tr("pollClosed", "So'rovnoma yopilgan") : tr("poll", "So'rovnoma")}
      </div>
      {media.question && <div className="mb-2 text-[14px] font-medium">{media.question}</div>}
      <div className="flex flex-col gap-2">
        {options.map((o, i) => {
          const pct = total > 0 ? Math.round((o.voters / total) * 100) : 0;
          return (
            <div key={i}>
              <div className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate">{o.text}</span>
                <span className="shrink-0 tabular-nums text-[var(--tg-text-secondary)]">{pct}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <div
                  className="h-full rounded-full bg-[var(--tg-primary)] transition-[width] duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-xs text-[var(--tg-text-secondary)]">
        {total > 0
          ? `${total} ${tr("pollVotes", "ovoz")}`
          : tr("pollNoVotes", "Hali ovoz berilmagan")}
      </div>
    </div>
  );
}

// ── webpage — link-preview card ─────────────────────────────────────────────────

function WebpageBody({ media, url }: { media: TgMedia; url: string }) {
  const link = media.url ?? "";
  let host = link;
  try {
    host = new URL(link).host;
  } catch {
    /* keep the raw url as the label */
  }
  const site = media.siteName || host;
  const wantPhoto = !!media.hasPhoto && media.downloadable !== false;
  const { src: photo } = useTgMediaSrc(wantPhoto ? url : null);
  const [photoBroken, setPhotoBroken] = useState(false);
  const hasBody = !!media.title || !!media.description;

  return (
    <a
      href={link || undefined}
      target="_blank"
      rel="noopener noreferrer"
      className="mx-2.5 my-1 block rounded-r-md border-l-[3px] border-[var(--tg-primary)] bg-[rgba(var(--tg-primary-rgb),0.08)] px-2.5 py-1.5"
    >
      {site && (
        <span className="block truncate text-[13px] font-medium text-[var(--tg-primary)]">
          {site}
        </span>
      )}
      {media.title && <span className="block text-[13px] font-semibold">{media.title}</span>}
      {media.description && (
        <span className="mt-0.5 line-clamp-3 block text-[13px] text-[var(--tg-text-secondary)]">
          {media.description}
        </span>
      )}
      {photo && !photoBroken && (
        <img
          src={photo}
          alt=""
          onError={() => setPhotoBroken(true)}
          className="mt-1.5 max-h-52 w-full rounded-md object-cover"
        />
      )}
      {!hasBody && link && (
        <span className="block truncate text-xs text-[var(--tg-text-secondary)]">{link}</span>
      )}
    </a>
  );
}
