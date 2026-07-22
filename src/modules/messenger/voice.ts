// MediaRecorder helper for voice messages — start → {stop(): blob+duration,
// cancel()}. Prefers audio/webm;codecs=opus, falls back to whatever the
// browser supports (Safari records audio/mp4).
export type VoiceRecorder = {
  /** Mime the recorder actually produces (send with the upload). */
  mime: string;
  /** Live frequency analyser for the recording visualizer (null if unsupported). */
  analyser: AnalyserNode | null;
  /** Stop and collect — resolves with the audio blob and duration seconds. */
  stop: () => Promise<{ blob: Blob; duration: number }>;
  /** Abort and drop everything (also releases the microphone). */
  cancel: () => void;
};

const CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* noop */
    }
  }
  return "";
}

/** Ask for the microphone and start recording. Throws when denied/unsupported. */
export async function startVoiceRecording(): Promise<VoiceRecorder> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks: BlobPart[] = [];
  const startedAt = Date.now();

  // Live level analyser for the recording visualizer (best-effort).
  let audioCtx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  try {
    const Ctx: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audioCtx = new Ctx();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.75;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
  } catch {
    audioCtx = null;
    analyser = null;
  }

  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.start(250);

  const release = () => {
    for (const t of stream.getTracks()) {
      try {
        t.stop();
      } catch {
        /* noop */
      }
    }
    if (audioCtx) {
      void audioCtx.close().catch(() => {});
      audioCtx = null;
      analyser = null;
    }
  };

  return {
    mime: rec.mimeType || mime || "audio/webm",
    analyser,
    stop: () =>
      new Promise((resolve, reject) => {
        rec.onstop = () => {
          release();
          const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
          resolve({ blob: new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" }), duration });
        };
        rec.onerror = () => {
          release();
          reject(new Error("recording failed"));
        };
        try {
          rec.stop();
        } catch (e) {
          release();
          reject(e as Error);
        }
      }),
    cancel: () => {
      rec.onstop = null;
      rec.ondataavailable = null;
      try {
        rec.stop();
      } catch {
        /* noop */
      }
      release();
    },
  };
}

/** Extension for the recorded mime — used to name the uploaded voice file. */
export const voiceExt = (mime: string): string =>
  mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
