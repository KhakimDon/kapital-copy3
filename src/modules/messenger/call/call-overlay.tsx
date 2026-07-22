// Full-screen call UI (voice + video). Mounted once at the messenger page root;
// renders null while idle. Drives the LiveKit session from the call store's
// state machine, plays the ring/ringback, and offers incoming / outgoing /
// active (audio · 1:1 video · group grid) layouts plus a draggable minimized
// pill so the user can keep chatting mid-call.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { ConnectionQuality } from "livekit-client";
import { MicOff, Minimize2, Phone, PhoneOff } from "lucide-react";
import { ChatAvatar } from "../avatar";
import { useCallStore } from "./call-store";
import { postEndCall, postRejectCall, useAcceptCall } from "./call-api";
import { startRinging, stopRinging } from "./ringtone";
import { useLivekit, type CallTile } from "./use-livekit";
import {
  CamButton,
  DeviceMenu,
  HangupButton,
  MicButton,
  ScreenButton,
  SpeakerButton,
  SwitchCamButton,
} from "./call-controls";
import { cn } from "@/shared/lib/utils";

// ── media attachment helpers ──────────────────────────────────────────────────

/** Attach a LiveKit video track to a <video> element for its lifetime. */
function VideoView({
  track,
  mirror,
  className,
}: {
  track: CallTile["video"];
  mirror?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={className}
      style={mirror ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}

/** Attach a remote audio track to a hidden <audio autoplay>. */
function AudioSink({ track, muted }: { track: NonNullable<CallTile["audio"]>; muted: boolean }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);
  return <audio ref={ref} autoPlay className="hidden" />;
}

// ── small hooks ───────────────────────────────────────────────────────────────

/** Live "mm:ss" (or "h:mm:ss") since `startedAt`, ticking each second. */
function useDuration(startedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  if (!startedAt) return "00:00";
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

/** Pointer-drag a floating element; returns a translate offset + a handle. */
function useDraggable() {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const base = { ...pos };
      const move = (ev: PointerEvent) => {
        setPos({ x: base.x + (ev.clientX - startX), y: base.y + (ev.clientY - startY) });
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [pos],
  );
  return { pos, onPointerDown };
}

// ── participant tile (group grid + 1:1 video) ─────────────────────────────────

function QualityDot({ quality }: { quality: ConnectionQuality }) {
  if (quality !== ConnectionQuality.Poor && quality !== ConnectionQuality.Lost) return null;
  return <span className="size-2 rounded-full bg-amber-400 shadow" />;
}

function ParticipantTile({ tile, youLabel }: { tile: CallTile; youLabel: string }) {
  const showVideo = tile.camEnabled && !!tile.video;
  return (
    <div
      className={cn(
        "relative flex min-h-0 items-center justify-center overflow-hidden rounded-2xl bg-neutral-800",
        tile.isSpeaking && "ring-2 ring-[#3390ec]",
      )}
    >
      {showVideo ? (
        <VideoView
          track={tile.video}
          mirror={tile.isLocal && !tile.isScreen}
          className="h-full w-full object-cover"
        />
      ) : (
        <ChatAvatar seed={tile.name} name={tile.name} size={88} />
      )}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/60 to-transparent px-2.5 py-1.5">
        {!tile.micEnabled && <MicOff className="size-3.5 shrink-0 text-white/80" />}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-white">
          {tile.isLocal ? youLabel : tile.name}
        </span>
        <QualityDot quality={tile.quality} />
      </div>
    </div>
  );
}

// ── main overlay ──────────────────────────────────────────────────────────────

export function CallOverlay() {
  const { t } = useTranslation();
  const tr = useCallback(
    (k: string, d: string) => t(`modules.messenger.call.${k}`, { defaultValue: d }),
    [t],
  );

  const s = useCallStore();
  const accept = useAcceptCall();

  const connectEnabled =
    (s.status === "outgoing" || s.status === "connecting" || s.status === "active") &&
    !!s.url &&
    !!s.token;

  const onConnected = useCallback(() => useCallStore.getState().markConnected(), []);
  const onError = useCallback(
    () => useCallStore.getState().setError(tr("connectFail", "Qo'ng'iroq serveriga ulanib bo'lmadi")),
    [tr],
  );
  const onRemoteEmpty = useCallback(() => {
    if (useCallStore.getState().status === "active") useCallStore.getState().reset();
  }, []);

  const lk = useLivekit({
    url: s.url,
    token: s.token,
    video: s.kind === "video",
    enabled: connectEnabled,
    onConnected,
    onError,
    onRemoteEmpty,
  });

  const duration = useDuration(s.startedAt);
  const pip = useDraggable();

  // Ring / ringback follows the state machine; always cleaned up.
  useEffect(() => {
    if (s.status === "incoming") startRinging("incoming");
    else if (s.status === "outgoing") startRinging("outgoing");
    else stopRinging();
    return () => stopRinging();
  }, [s.status]);

  // ── actions ─────────────────────────────────────────────────────────────────
  const onAccept = useCallback(() => {
    const callId = useCallStore.getState().callId;
    if (!callId) return;
    accept.mutate(callId, {
      onSuccess: (payload) => useCallStore.getState().setConnecting(payload),
      onError,
    });
  }, [accept, onError]);

  const onDecline = useCallback(() => {
    const callId = useCallStore.getState().callId;
    if (callId) void postRejectCall(callId).catch(() => {});
    useCallStore.getState().reset();
  }, []);

  const onHangup = useCallback(() => {
    const callId = useCallStore.getState().callId;
    if (callId) void postEndCall(callId).catch(() => {});
    useCallStore.getState().reset();
  }, []);

  const remoteTiles = useMemo(() => lk.tiles.filter((x) => !x.isLocal), [lk.tiles]);
  const localTile = useMemo(() => lk.tiles.find((x) => x.isLocal) ?? null, [lk.tiles]);
  const remoteHasCam = remoteTiles.some((x) => x.camEnabled);
  const videoLayout = s.isGroup || s.kind === "video" || lk.camOn || remoteHasCam;

  if (s.status === "idle") return null;

  const peerName = s.peer?.name ?? "—";
  const peerAvatar = s.peer?.avatar ?? null;
  const kindLabel =
    s.kind === "video" ? tr("videoCall", "Video qo'ng'iroq") : tr("audioCall", "Audio qo'ng'iroq");

  // Hidden audio sinks — keep remote audio playing regardless of visible chrome.
  const audioSinks = remoteTiles
    .filter((x) => x.audio)
    .map((x) => <AudioSink key={x.id} track={x.audio!} muted={!lk.speakerOn} />);

  const deviceLabels = {
    mic: tr("micDevice", "Mikrofon"),
    cam: tr("camDevice", "Kamera"),
    speaker: tr("speakerDevice", "Karnay"),
  };

  // ── minimized pill ────────────────────────────────────────────────────────
  const canMinimize = s.status === "active" || s.status === "outgoing" || s.status === "connecting";
  if (s.minimized && canMinimize) {
    return (
      <>
        {audioSinks}
        <div
          className="fixed bottom-4 right-4 z-[100] touch-none select-none"
          style={{ transform: `translate(${pip.pos.x}px, ${pip.pos.y}px)` }}
        >
          <div className="flex items-center gap-2 rounded-full bg-neutral-900/95 py-1.5 pl-1.5 pr-2 text-white shadow-2xl backdrop-blur">
            <button
              type="button"
              onPointerDown={pip.onPointerDown}
              onClick={() => useCallStore.getState().setMinimized(false)}
              className="flex cursor-grab items-center gap-2 active:cursor-grabbing"
              aria-label={tr("expand", "Kattalashtirish")}
            >
              <ChatAvatar seed={peerName} name={peerName} src={peerAvatar} size={32} />
              <span className="flex flex-col items-start leading-tight">
                <span className="max-w-[7rem] truncate text-xs font-medium">{peerName}</span>
                <span className="text-[11px] tabular-nums text-emerald-400">
                  {s.status === "active" ? duration : tr("calling", "Chaqirilmoqda…")}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={onHangup}
              className="grid size-8 place-items-center rounded-full bg-destructive text-white transition-transform hover:scale-105 active:scale-95"
              aria-label={tr("hangUp", "Tugatish")}
            >
              <PhoneOff className="size-4" />
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── error ──────────────────────────────────────────────────────────────────
  if (s.status === "error") {
    return (
      <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 backdrop-blur-sm">
        <div className="mx-4 flex max-w-sm flex-col items-center gap-4 rounded-2xl bg-neutral-900 p-6 text-center text-white shadow-2xl">
          <div className="grid size-14 place-items-center rounded-full bg-destructive/20 text-destructive">
            <PhoneOff className="size-7" />
          </div>
          <p className="text-sm text-white/80">
            {s.error || tr("connectFail", "Qo'ng'iroq serveriga ulanib bo'lmadi")}
          </p>
          <button
            type="button"
            onClick={() => useCallStore.getState().reset()}
            className="rounded-full bg-white/15 px-6 py-2 text-sm font-medium transition-colors hover:bg-white/25"
          >
            {tr("close", "Yopish")}
          </button>
        </div>
      </div>
    );
  }

  const reconnecting = lk.connState === "reconnecting";

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-neutral-950 text-white">
      {audioSinks}

      {/* ── INCOMING ── */}
      {s.status === "incoming" && (
        <div className="flex flex-1 flex-col items-center justify-between py-16">
          <div className="flex flex-col items-center gap-6">
            <div className="relative grid place-items-center">
              <span className="absolute inset-0 rounded-full bg-[#3390ec]/30 motion-safe:animate-ping" />
              <span className="absolute -inset-3 rounded-full bg-[#3390ec]/15 motion-safe:animate-pulse" />
              <ChatAvatar seed={peerName} name={peerName} src={peerAvatar} size={132} className="relative" />
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold">{peerName}</div>
              <div className="mt-1 text-sm text-white/60">{kindLabel}</div>
            </div>
          </div>
          <div className="flex items-end gap-16">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onDecline}
                className="grid size-16 place-items-center rounded-full bg-destructive shadow-lg transition-transform hover:scale-105 active:scale-95"
                aria-label={tr("decline", "Rad etish")}
              >
                <PhoneOff className="size-7" />
              </button>
              <span className="text-xs text-white/70">{tr("decline", "Rad etish")}</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                onClick={onAccept}
                disabled={accept.isPending}
                className="grid size-16 place-items-center rounded-full bg-emerald-500 shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-60 motion-safe:animate-bounce"
                aria-label={tr("accept", "Qabul qilish")}
              >
                <Phone className="size-7" />
              </button>
              <span className="text-xs text-white/70">{tr("accept", "Qabul qilish")}</span>
            </div>
          </div>
        </div>
      )}

      {/* ── OUTGOING / CONNECTING ── */}
      {(s.status === "outgoing" || s.status === "connecting") && (
        <div className="flex flex-1 flex-col items-center justify-between py-16">
          <div className="flex flex-col items-center gap-6">
            <div className="relative grid place-items-center">
              <span className="absolute inset-0 rounded-full bg-white/10 motion-safe:animate-ping" />
              <ChatAvatar seed={peerName} name={peerName} src={peerAvatar} size={132} className="relative" />
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold">{peerName}</div>
              <div className="mt-1 text-sm text-white/60">
                {s.status === "connecting" ? tr("connecting", "Ulanmoqda…") : tr("calling", "Chaqirilmoqda…")}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onHangup}
              className="grid size-16 place-items-center rounded-full bg-destructive shadow-lg transition-transform hover:scale-105 active:scale-95"
              aria-label={tr("cancel", "Bekor qilish")}
            >
              <PhoneOff className="size-7" />
            </button>
            <span className="text-xs text-white/70">{tr("cancel", "Bekor qilish")}</span>
          </div>
        </div>
      )}

      {/* ── ACTIVE ── */}
      {s.status === "active" && (
        <>
          {/* top bar */}
          <div className="flex items-center gap-3 px-4 pt-4">
            <button
              type="button"
              onClick={() => useCallStore.getState().setMinimized(true)}
              className="grid size-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
              aria-label={tr("minimize", "Kichraytirish")}
            >
              <Minimize2 className="size-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{peerName}</div>
              <div className="text-xs tabular-nums text-white/60">
                {reconnecting ? tr("reconnecting", "Qayta ulanmoqda…") : duration}
              </div>
            </div>
          </div>

          {/* stage */}
          {videoLayout ? (
            s.isGroup ? (
              <GroupGrid tiles={lk.tiles} youLabel={tr("you", "Siz")} />
            ) : (
              <div className="relative min-h-0 flex-1">
                {remoteTiles[0]?.camEnabled && remoteTiles[0].video ? (
                  <VideoView track={remoteTiles[0].video} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center">
                    <ChatAvatar seed={peerName} name={peerName} src={peerAvatar} size={132} />
                  </div>
                )}
                {/* local camera PIP (draggable) */}
                {localTile?.camEnabled && localTile.video && (
                  <div
                    onPointerDown={pip.onPointerDown}
                    style={{ transform: `translate(${pip.pos.x}px, ${pip.pos.y}px)` }}
                    className="absolute bottom-4 right-4 aspect-[3/4] w-28 cursor-grab touch-none overflow-hidden rounded-xl border border-white/20 bg-neutral-800 shadow-xl active:cursor-grabbing"
                  >
                    <VideoView track={localTile.video} mirror className="h-full w-full object-cover" />
                  </div>
                )}
              </div>
            )
          ) : (
            // audio call — centered avatar
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5">
              <ChatAvatar seed={peerName} name={peerName} src={peerAvatar} size={140} />
              <div className="text-center">
                <div className="text-2xl font-semibold">{peerName}</div>
                <div className="mt-1 text-sm tabular-nums text-white/60">
                  {reconnecting ? tr("reconnecting", "Qayta ulanmoqda…") : duration}
                </div>
              </div>
            </div>
          )}

          {/* controls bar */}
          <div className="flex items-end justify-center gap-4 px-4 pb-10 pt-4">
            <MicButton on={lk.micOn} onToggle={lk.toggleMic} label={tr("mic", "Mikrofon")} />
            <CamButton on={lk.camOn} onToggle={lk.toggleCam} label={tr("camera", "Kamera")} />
            {videoLayout ? (
              <>
                <ScreenButton
                  on={lk.screenOn}
                  onToggle={lk.toggleScreenShare}
                  label={tr("screen", "Ekran")}
                />
                <SwitchCamButton onClick={lk.switchCamera} label={tr("flip", "Almashtirish")} />
              </>
            ) : (
              <SpeakerButton on={lk.speakerOn} onToggle={lk.toggleSpeaker} label={tr("speaker", "Karnay")} />
            )}
            <DeviceMenu
              devices={lk.devices}
              onSelect={lk.selectDevice}
              showCam={videoLayout}
              label={tr("devices", "Qurilmalar")}
              labels={deviceLabels}
            />
            <HangupButton onClick={onHangup} label={tr("hangUp", "Tugatish")} />
          </div>
        </>
      )}
    </div>
  );
}

// ── responsive group grid ─────────────────────────────────────────────────────

function GroupGrid({ tiles, youLabel }: { tiles: CallTile[]; youLabel: string }) {
  const n = tiles.length;
  const cols = n <= 1 ? "grid-cols-1" : n <= 4 ? "grid-cols-2" : n <= 9 ? "grid-cols-3" : "grid-cols-4";
  return (
    <div className={cn("grid min-h-0 flex-1 gap-2 p-3", cols)}>
      {tiles.map((tile) => (
        <ParticipantTile key={tile.id} tile={tile} youLabel={youLabel} />
      ))}
    </div>
  );
}
