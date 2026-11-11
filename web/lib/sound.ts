/**
 * Short synthesised sounds: a chime when you overtake someone, and a ching or
 * a crumble when a crewmate's rank goes up or breaks.
 *
 * No preference to turn them off, on purpose: each fires perhaps twice a week,
 * so a setting would be clutter. It is deliberately not wired to hovering
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
function ring(ctx: AudioContext): void {
  const now = ctx.currentTime;
  [
    { f: 587.33, at: 0, len: 0.22 },    // D5
    { f: 880.0, at: 0.11, len: 0.34 },  // A5
  ].forEach(({ f, at, len }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, now + at);
    gain.gain.linearRampToValueAtTime(0.11, now + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + at);
    osc.stop(now + at + len + 0.02);
  });
  window.setTimeout(() => { void ctx.close(); }, 900);
}

/**
 * A bright "ching" as the new crest lands: two sine partials an octave apart
 * (E6, E7) and a quiet shimmer above them, struck and left to ring out.
 */
function ching(ctx: AudioContext): void {
  const now = ctx.currentTime;
  [
    { f: 1318.5, peak: 0.1 },
    { f: 2637, peak: 0.05 },
    { f: 3951, peak: 0.015 },
  ].forEach(({ f, peak }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.62);
  });
  window.setTimeout(() => { void ctx.close(); }, 900);
}

/**
 * Stone giving way: a short burst of noise, muffled as it falls (a lowpass
 * sweeping 900 -> 200 Hz), over a low, soft thump. Never harsh.
 */
function crumble(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const len = 0.6;

  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(900, now);
  filter.frequency.exponentialRampToValueAtTime(200, now + len);
  const hiss = ctx.createGain();
  hiss.gain.setValueAtTime(0, now);
  hiss.gain.linearRampToValueAtTime(0.09, now + 0.02);
  hiss.gain.exponentialRampToValueAtTime(0.0001, now + len);
  noise.connect(filter).connect(hiss).connect(ctx.destination);
  noise.start(now);
  noise.stop(now + len);

  const thump = ctx.createOscillator();
  const body = ctx.createGain();
  thump.type = "sine";
  thump.frequency.value = 70;
  body.gain.setValueAtTime(0, now);
  body.gain.linearRampToValueAtTime(0.09, now + 0.01);
  body.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  thump.connect(body).connect(ctx.destination);
  thump.start(now);
  thump.stop(now + 0.37);

  window.setTimeout(() => { void ctx.close(); }, 900);
}

const waiting = new Set<(ctx: AudioContext) => void>();

/**
 * Plays a sound, or holds it until you touch something.
 *
 * Browsers refuse to start audio before a click or key press, and an overtake
 * is discovered on page load -- exactly when nothing has been touched yet. So
 * a blocked sound is not dropped: it waits for your first interaction and
 * plays then, which is when you are looking at the row anyway.
 */
function whenAllowed(play: (ctx: AudioContext) => void): void {
  let ctx: AudioContext | null = null;
  try {
    ctx = audioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.close();
      if (waiting.has(play)) return;
      waiting.add(play);
      const fire = () => {
        waiting.delete(play);
        window.removeEventListener("pointerdown", fire);
        window.removeEventListener("keydown", fire);
        whenAllowed(play);
      };
      window.addEventListener("pointerdown", fire);
      window.addEventListener("keydown", fire);
      return;
    }
    play(ctx);
  } catch {
    void ctx?.close();
  }
}

/** The overtake chime. */
export function playCelebration(): void {
  whenAllowed(ring);
}

/** A rank-up's new crest landing in its slot. */
export function playChing(): void {
  whenAllowed(ching);
}

/** A broken streak's crest cracking. */
export function playCrumble(): void {
  whenAllowed(crumble);
}
