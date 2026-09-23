/**
 * A short synthesised chime, played when you overtake someone.
 *
 * No preference to turn it off, on purpose: this fires perhaps twice a week, so
 * a setting for it would be clutter. It is deliberately not wired to hovering
 * or navigation -- a sound heard thirty times a session gets the whole tab
 * muted, which would take this one with it.
 */
type Ctor = typeof AudioContext;

function audioContext(): AudioContext | null {
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  const C = w.AudioContext ?? w.webkitAudioContext;
  return C ? new C() : null;
}

/** Two notes, a rising interval, ~450ms. Synthesised so there is no asset to load. */
export function playCelebration(): void {
  let ctx: AudioContext | null = null;
  try {
    ctx = audioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    [
      { f: 587.33, at: 0, len: 0.22 },    // D5
      { f: 880.0, at: 0.11, len: 0.34 },  // A5
    ].forEach(({ f, at, len }) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = "sine";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0, now + at);
      gain.gain.linearRampToValueAtTime(0.11, now + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(now + at);
      osc.stop(now + at + len + 0.02);
    });
    window.setTimeout(() => { void ctx?.close(); }, 900);
  } catch {
    void ctx?.close();
  }
}
