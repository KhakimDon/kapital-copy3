// Incoming-message notification blip — a short, soft two-note tone synthesized
// with the Web Audio API (no audio file, nothing copyrighted). One lazily
// created AudioContext is reused; autoplay policies are handled by resuming the
// context on the first user gesture and swallowing any play errors.
let ctx: AudioContext | null = null;
let gestureHooked = false;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctx: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    return ctx;
  } catch {
    return null;
  }
}

/** Resume a suspended context on the first user gesture (autoplay unlock). */
function hookGesture(): void {
  if (gestureHooked) return;
  gestureHooked = true;
  const resume = () => {
    ctx?.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", resume, { once: true });
  window.addEventListener("keydown", resume, { once: true });
}

/** Play a ~120ms soft blip (two quick notes). Safe to call unconditionally. */
export function playIncoming(): void {
  const ac = getCtx();
  if (!ac) return;
  hookGesture();
  if (ac.state === "suspended") {
    ac.resume().catch(() => {});
  }
  try {
    const now = ac.currentTime;
    const master = ac.createGain();
    master.gain.value = 0.0001;
    master.connect(ac.destination);

    // Two rising notes (E6 → A6) for a gentle "ding-dong".
    const notes: [number, number][] = [
      [1318.5, 0],
      [1760.0, 0.07],
    ];
    for (const [freq, at] of notes) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = now + at;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(t0 + 0.14);
    }
    master.gain.setValueAtTime(1, now);
  } catch {
    /* autoplay blocked / context closed — ignore */
  }
}
