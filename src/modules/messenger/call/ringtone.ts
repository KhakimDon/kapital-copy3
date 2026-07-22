// Call ring/ringback tones — synthesized with the Web Audio API (no audio file,
// nothing copyrighted), mirroring sound.ts's lazy-context + gesture-unlock
// approach. Two distinct looping patterns:
//   • "incoming" → a bright double-ring burst every ~3s (someone is calling you)
//   • "outgoing" → a single lower ringback tone, 1s on / ~3s cadence (you're
//                  calling out and waiting for the peer to pick up)
// Only one loop plays at a time; startRinging() replaces any running loop.
let ctx: AudioContext | null = null;
let gestureHooked = false;
let loopTimer: ReturnType<typeof setInterval> | null = null;
let masterGain: GainNode | null = null;

export type RingMode = "incoming" | "outgoing";

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

/** Schedule one tone burst (freq, start-offset, duration) on the master bus. */
function burst(ac: AudioContext, master: GainNode, freq: number, at: number, dur: number): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t0 = ac.currentTime + at;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.14, t0 + 0.04);
  g.gain.setValueAtTime(0.14, t0 + dur - 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** Play one cycle of the given pattern (called immediately, then on interval). */
function playCycle(mode: RingMode): void {
  const ac = getCtx();
  const master = masterGain;
  if (!ac || !master) return;
  if (ac.state === "suspended") ac.resume().catch(() => {});
  try {
    if (mode === "incoming") {
      // Classic double-ring: two short bright bursts close together.
      burst(ac, master, 880, 0, 0.32);
      burst(ac, master, 760, 0.16, 0.32);
      burst(ac, master, 880, 0.5, 0.32);
      burst(ac, master, 760, 0.66, 0.32);
    } else {
      // Ringback: a single longer, lower tone.
      burst(ac, master, 440, 0, 0.9);
    }
  } catch {
    /* context closed — ignore */
  }
}

/** Start (or replace) a looping ring/ringback. Safe to call repeatedly. */
export function startRinging(mode: RingMode): void {
  const ac = getCtx();
  if (!ac) return;
  hookGesture();
  stopRinging();
  masterGain = ac.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(ac.destination);
  playCycle(mode);
  // Both patterns repeat on a ~3s telephone cadence.
  loopTimer = setInterval(() => playCycle(mode), 3000);
}

/** Stop any running loop and tear down its bus. */
export function stopRinging(): void {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  if (masterGain) {
    try {
      masterGain.disconnect();
    } catch {
      /* noop */
    }
    masterGain = null;
  }
}
