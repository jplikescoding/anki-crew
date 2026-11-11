import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/** Just enough of an AudioContext to record what each sound asks of it. */
class FakeContext {
  static made: FakeContext[] = [];
  state: AudioContextState = "suspended";
  currentTime = 0;
  sampleRate = 8000;
  destination = {};
  resume = vi.fn(async () => { this.state = "running"; });
  close = vi.fn(async () => { this.state = "closed"; });
  /** Every gain's peak, in the order its node was made. */
  peaks: number[] = [];
  constructor() { FakeContext.made.push(this); }
  private node() {
    const n = {
      connect: () => n, start: vi.fn(), stop: vi.fn(),
      frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      type: "", buffer: null as unknown,
    };
    return n;
  }
  createOscillator = vi.fn(() => this.node());
  createBufferSource = vi.fn(() => this.node());
  createBiquadFilter = vi.fn(() => this.node());
  createGain = vi.fn(() => {
    const i = this.peaks.push(0) - 1;
    const n = this.node();
    return {
      ...n,
      connect: () => n,
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: (v: number) => { this.peaks[i] = Math.max(this.peaks[i], v); },
      },
    };
  });
  createBuffer = vi.fn((_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }));
}

beforeEach(() => {
  FakeContext.made = [];
  vi.resetModules();
  vi.stubGlobal("AudioContext", FakeContext);
});
afterEach(() => vi.unstubAllGlobals());

describe("sound", () => {
  it("unlocks one context on the tap and plays every sound through it", async () => {
    const { unlockSound, playChing, playCrumble } = await import("@/lib/sound");
    unlockSound();
    expect(FakeContext.made).toHaveLength(1);
    const ctx = FakeContext.made[0];
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    playChing();
    playCrumble();
    expect(FakeContext.made).toHaveLength(1);
    expect(ctx.createOscillator).toHaveBeenCalled();
    expect(ctx.createBufferSource).toHaveBeenCalled();
    expect(ctx.close).not.toHaveBeenCalled();
  });

  it("holds a sound for a touch while the context is still suspended", async () => {
    const { playChing } = await import("@/lib/sound");
    playChing();
    const ctx = FakeContext.made[0];
    expect(ctx.createOscillator).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("pointerdown"));
    expect(ctx.resume).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(ctx.createOscillator).toHaveBeenCalled());
    expect(FakeContext.made).toHaveLength(1);
  });

});
