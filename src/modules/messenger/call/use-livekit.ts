// LiveKit media session hook. Given a room {url, token} it connects a
// livekit-client `Room`, publishes the mic (and camera for video calls), and
// exposes a React-friendly snapshot of every participant + their tracks plus
// the local controls. Track *attachment* to <video>/<audio> is left to the
// overlay (it calls track.attach() on refs) — this hook only surfaces the track
// objects and re-renders whenever the room's shape changes.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ConnectionQuality,
  LocalParticipant,
  Room,
  RoomEvent,
  Track,
  type LocalTrackPublication,
  type Participant,
} from "livekit-client";

export type DeviceKind = "audioinput" | "videoinput" | "audiooutput";

/** One participant tile snapshot the overlay renders. */
export type CallTile = {
  /** Stable id (identity, falls back to sid). */
  id: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  quality: ConnectionQuality;
  /** Video track to attach (screen-share wins over camera when both exist). */
  video?: Track;
  /** True when `video` is a screen-share (don't mirror it). */
  isScreen: boolean;
  /** Remote microphone track to attach to a hidden <audio> (undefined locally). */
  audio?: Track;
};

export type CallConnState = "connecting" | "connected" | "reconnecting" | "disconnected";

export type LiveDevices = {
  mics: MediaDeviceInfo[];
  cams: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
  current: { mic?: string; cam?: string; speaker?: string };
};

export type UseLivekit = {
  tiles: CallTile[];
  micOn: boolean;
  camOn: boolean;
  screenOn: boolean;
  /** Local playback of remote audio (a "speaker" mute toggle). */
  speakerOn: boolean;
  connState: CallConnState;
  error: string | null;
  devices: LiveDevices;
  toggleMic: () => void;
  toggleCam: () => void;
  toggleScreenShare: () => void;
  toggleSpeaker: () => void;
  switchCamera: () => void;
  selectDevice: (kind: DeviceKind, deviceId: string) => void;
  disconnect: () => void;
};

function tileFor(p: Participant, isLocal: boolean): CallTile {
  const camPub = p.getTrackPublication(Track.Source.Camera);
  const screenPub = p.getTrackPublication(Track.Source.ScreenShare);
  const micPub = p.getTrackPublication(Track.Source.Microphone);
  const screenTrack = screenPub?.track;
  const camTrack = camPub?.track;
  return {
    id: p.identity || p.sid,
    name: p.name || p.identity || "—",
    isLocal,
    isSpeaking: p.isSpeaking,
    micEnabled: !!micPub && !micPub.isMuted,
    camEnabled: !!camPub && !camPub.isMuted && !!camTrack,
    quality: p.connectionQuality,
    video: (screenTrack ?? camTrack) as Track | undefined,
    isScreen: !!screenTrack,
    audio: isLocal ? undefined : (micPub?.track as Track | undefined),
  };
}

export function useLivekit(opts: {
  url: string | null;
  token: string | null;
  video: boolean;
  enabled: boolean;
  onConnected?: () => void;
  onError?: (e: unknown) => void;
  onRemoteEmpty?: () => void;
}): UseLivekit {
  const { url, token, enabled } = opts;

  const roomRef = useRef<Room | null>(null);
  // Keep the latest callbacks/flags without re-running the connect effect.
  const cbRef = useRef(opts);
  cbRef.current = opts;
  const facingRef = useRef<"user" | "environment">("user");

  const [tiles, setTiles] = useState<CallTile[]>([]);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(opts.video);
  const [screenOn, setScreenOn] = useState(false);
  const [speakerOn, setSpeakerOn] = useState(true);
  const [connState, setConnState] = useState<CallConnState>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<LiveDevices>({
    mics: [],
    cams: [],
    speakers: [],
    current: {},
  });

  // Rebuild the participant snapshot + local flags from the live room.
  const sync = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const local = room.localParticipant;
    const list: CallTile[] = [
      tileFor(local, true),
      ...[...room.remoteParticipants.values()].map((p) => tileFor(p, false)),
    ];
    setTiles(list);
    setMicOn(local.isMicrophoneEnabled);
    setCamOn(local.isCameraEnabled);
    setScreenOn(local.isScreenShareEnabled);
  }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const [mics, cams, speakers] = await Promise.all([
        Room.getLocalDevices("audioinput").catch(() => []),
        Room.getLocalDevices("videoinput").catch(() => []),
        Room.getLocalDevices("audiooutput").catch(() => []),
      ]);
      const room = roomRef.current;
      setDevices({
        mics,
        cams,
        speakers,
        current: {
          mic: room?.getActiveDevice("audioinput"),
          cam: room?.getActiveDevice("videoinput"),
          speaker: room?.getActiveDevice("audiooutput"),
        },
      });
    } catch {
      /* enumeration blocked — ignore */
    }
  }, []);

  useEffect(() => {
    if (!enabled || !url || !token) return;

    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    setError(null);
    setConnState("connecting");

    const onChange = () => sync();
    const onConn = () => setConnState("connected");
    const onReconnecting = () => setConnState("reconnecting");
    const onReconnected = () => {
      setConnState("connected");
      sync();
    };
    const onDisconnected = () => {
      setConnState("disconnected");
      sync();
    };
    const onParticipantLeft = () => {
      sync();
      if (roomRef.current && roomRef.current.remoteParticipants.size === 0) {
        cbRef.current.onRemoteEmpty?.();
      }
    };

    room
      .on(RoomEvent.ParticipantConnected, onChange)
      .on(RoomEvent.ParticipantDisconnected, onParticipantLeft)
      .on(RoomEvent.TrackSubscribed, onChange)
      .on(RoomEvent.TrackUnsubscribed, onChange)
      .on(RoomEvent.TrackMuted, onChange)
      .on(RoomEvent.TrackUnmuted, onChange)
      .on(RoomEvent.LocalTrackPublished, onChange)
      .on(RoomEvent.LocalTrackUnpublished, onChange)
      .on(RoomEvent.ActiveSpeakersChanged, onChange)
      .on(RoomEvent.ConnectionQualityChanged, onChange)
      .on(RoomEvent.Connected, onConn)
      .on(RoomEvent.Reconnecting, onReconnecting)
      .on(RoomEvent.Reconnected, onReconnected)
      .on(RoomEvent.Disconnected, onDisconnected)
      .on(RoomEvent.MediaDevicesChanged, () => void refreshDevices());

    let cancelled = false;
    (async () => {
      try {
        await room.connect(url, token);
        if (cancelled) {
          await room.disconnect();
          return;
        }
        await room.localParticipant.setMicrophoneEnabled(true);
        if (cbRef.current.video) {
          await room.localParticipant.setCameraEnabled(true);
        }
        setConnState("connected");
        sync();
        void refreshDevices();
        cbRef.current.onConnected?.();
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
        setConnState("disconnected");
        cbRef.current.onError?.(e);
      }
    })();

    return () => {
      cancelled = true;
      room.removeAllListeners();
      void room.disconnect();
      if (roomRef.current === room) roomRef.current = null;
    };
    // Reconnect only when the target room identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, url, token]);

  const toggleMic = useCallback(() => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    lp.setMicrophoneEnabled(!lp.isMicrophoneEnabled).then(sync).catch(() => {});
  }, [sync]);

  const toggleCam = useCallback(() => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    lp.setCameraEnabled(!lp.isCameraEnabled).then(sync).catch(() => {});
  }, [sync]);

  const toggleScreenShare = useCallback(() => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    lp.setScreenShareEnabled(!lp.isScreenShareEnabled).then(sync).catch(() => {});
  }, [sync]);

  const toggleSpeaker = useCallback(() => setSpeakerOn((v) => !v), []);

  const switchCamera = useCallback(() => {
    const lp = roomRef.current?.localParticipant as LocalParticipant | undefined;
    if (!lp) return;
    const pub = lp.getTrackPublication(Track.Source.Camera) as LocalTrackPublication | undefined;
    const track = pub?.track;
    if (!track || !("restartTrack" in track)) return;
    facingRef.current = facingRef.current === "user" ? "environment" : "user";
    (track as unknown as { restartTrack: (o: { facingMode: string }) => Promise<void> })
      .restartTrack({ facingMode: facingRef.current })
      .then(sync)
      .catch(() => {});
  }, [sync]);

  const selectDevice = useCallback((kind: DeviceKind, deviceId: string) => {
    roomRef.current
      ?.switchActiveDevice(kind, deviceId)
      .then(() => refreshDevices())
      .catch(() => {});
  }, [refreshDevices]);

  const disconnect = useCallback(() => {
    void roomRef.current?.disconnect();
  }, []);

  return {
    tiles,
    micOn,
    camOn,
    screenOn,
    speakerOn,
    connState,
    error,
    devices,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    toggleSpeaker,
    switchCamera,
    selectDevice,
    disconnect,
  };
}
