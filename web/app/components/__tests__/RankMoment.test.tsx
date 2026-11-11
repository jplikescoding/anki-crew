import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sound", () => ({
  playChing: vi.fn(),
  playCrumble: vi.fn(),
  playCelebration: vi.fn(),
}));

import { playChing, playCrumble } from "@/lib/sound";
import { RankMoment } from "@/app/components/RankMoment";

const realMatchMedia = window.matchMedia;

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(playChing).mockClear();
  vi.mocked(playCrumble).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  window.matchMedia = realMatchMedia;
});

function inRow(ui: React.ReactElement) {
  return render(<div className="relative">{ui}</div>);
}

describe("RankMoment", () => {
  it("rank-up swaps mid-way, chimes on landing, then finishes", () => {
    const onSwap = vi.fn();
    const onDone = vi.fn();
    inRow(<RankMoment kind="rankUp" from="silver" to="gold" onSwap={onSwap} onDone={onDone} />);

    expect(screen.getByText("Ranked up · Gold")).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1690); });
    expect(onSwap).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(10); });
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(playChing).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(3400 - 1700); });
    expect(playChing).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(playCrumble).not.toHaveBeenCalled();
  });

  it("crumble cracks with its own sound", () => {
    const calls: string[] = [];
    const onSwap = vi.fn(() => calls.push("swap"));
    const onDone = vi.fn(() => calls.push("done"));
    inRow(<RankMoment kind="crumble" from="gold" to={null} onSwap={onSwap} onDone={onDone} />);

    act(() => { vi.advanceTimersByTime(300); });
    expect(playCrumble).toHaveBeenCalledTimes(1);
    expect(onSwap).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(2000); });
    expect(calls).toEqual(["swap", "done"]);
    expect(playChing).not.toHaveBeenCalled();
  });

  it("swaps straight away under reduced motion", () => {
    window.matchMedia = ((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    const onSwap = vi.fn();
    const onDone = vi.fn();
    inRow(<RankMoment kind="rankUp" from="silver" to="gold" onSwap={onSwap} onDone={onDone} />);

    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(playChing).toHaveBeenCalledTimes(1);
  });

  it("stops its timers if it leaves early", () => {
    const onSwap = vi.fn();
    const onDone = vi.fn();
    const { unmount } = inRow(<RankMoment kind="rankUp" from="silver" to="gold" onSwap={onSwap} onDone={onDone} />);
    act(() => { vi.advanceTimersByTime(500); });
    unmount();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(onSwap).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(playChing).not.toHaveBeenCalled();
  });
});
