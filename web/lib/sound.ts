/**
 * A tiny synthesised chime for the two moments that earn one: overtaking
 * someone, and beating your own record.
 *
 * Deliberately not wired to navigation. A sound you hear thirty times a session
 * gets muted by the end of the week; one you hear twice stays a reward. Off by
 * default either way — nobody's first visit should make a noise.
 */
const PREF_KEY = "anki-crew:sound:v1";

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === "on";
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch {
    /* storage blocked; the toggle just won't persist */
  }
}

type Ctor = typeof AudioContext;

function audioContext(): AudioContext | null {
  const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
  const C = w.AudioContext ?? w.webkitAudioContext;
  return C ? new C() : null;
}

/** Two notes, a rising interval, ~450ms. Synthesised so there is no asset to load. */
export function playCelebration(): void {
  if (!soundEnabled()) return;
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
