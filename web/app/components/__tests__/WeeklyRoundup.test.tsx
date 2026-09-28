import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MomentPill from "@/app/components/MomentPill";
import WeekStrip from "@/app/components/WeekStrip";
import WeeklyRoundup from "@/app/components/WeeklyRoundup";
import type { WeekResult } from "@/lib/competition";
import type { DayRow, PersonView } from "@/lib/types";

function day(date: string, reviews: number): DayRow {
  return { date, reviews, minutes: 0, newCards: 0, ease1: 0, ease2: 0, ease3: 0, ease4: 0, perDeck: {} };
}
function person(id: string, name: string, days: DayRow[]): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/New_York", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-10-06", allTimeReviews: 0, firstReviewAt: 0 },
    days,
  };
}

const jp = person("jp", "JP", [day("2026-09-22", 88), day("2026-09-29", 1071)]);
const adam = person("adam", "Adam", [day("2026-09-26", 894), day("2026-10-01", 1284)]);
const W39: WeekResult = { week: "2026-09-21", standings: [{ id: "adam", cards: 894 }, { id: "jp", cards: 88 }], winner: "adam", podium: null };
const W40: WeekResult = { week: "2026-09-28", standings: [{ id: "adam", cards: 1284 }, { id: "jp", cards: 1071 }], winner: "adam", podium: null };

describe("WeeklyRoundup", () => {
  it("tells the week's story with your head-to-head", () => {
    render(<WeeklyRoundup result={W40} history={[W39, W40]} people={[jp, adam]} viewer="jp" onClose={vi.fn()} />);
    expect(screen.getByText("Week 40 · 28 Sep – 4 Oct")).toBeTruthy();
    expect(screen.getByTestId("roundup-headline")).toHaveTextContent("Adam holds off JP by 213 to go back-to-back");
    expect(screen.getByTestId("roundup-swing")).toHaveTextContent("Thursday swung it — Adam's 1,284 was the biggest day of the week.");
    expect(screen.getByTestId("roundup-run")).toHaveTextContent("🔥 2 weeks in a row");
    expect(screen.getByTestId("h2h-adam")).toHaveTextContent("vs Adam");
    expect(screen.getByTestId("h2h-adam")).toHaveTextContent("0–2");
    expect(screen.getByTestId("h2h-adam")).toHaveTextContent("lost by 213");
    expect(screen.getAllByTestId("podium-bar")).toHaveLength(2);
  });

  it("leaves out the head-to-head for someone who didn't compete", () => {
    render(<WeeklyRoundup result={W40} history={[W39, W40]} people={[jp, adam]} viewer="peter" onClose={vi.fn()} />);
    expect(screen.queryByText("Your head-to-head")).toBeNull();
  });

  it("skips the beats on a click inside, without closing", () => {
    const onClose = vi.fn();
    render(<WeeklyRoundup result={W40} history={[W39, W40]} people={[jp, adam]} viewer="jp" onClose={onClose} />);
    expect(screen.getByTestId("roundup")).not.toHaveClass("skip-beats");
    fireEvent.click(screen.getByTestId("roundup-headline"));
    expect(screen.getByTestId("roundup")).toHaveClass("skip-beats");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on the button, Esc and the backdrop", () => {
    const onClose = vi.fn();
    render(<WeeklyRoundup result={W40} history={[W39, W40]} people={[jp, adam]} viewer="jp" onClose={onClose} />);
    fireEvent.click(screen.getByText("Close"));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByTestId("roundup-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe("WeekStrip", () => {
  it("sums up the latest week and replays it", () => {
    const onReplay = vi.fn();
    render(<WeekStrip result={W40} history={[W39, W40]} people={[jp, adam]} onReplay={onReplay} />);
    expect(screen.getByTestId("week-strip")).toHaveTextContent("Week 40: Adam 1,284 · JP 1,071");
    expect(screen.getByTestId("week-strip")).toHaveTextContent("🔥 2");
    fireEvent.click(screen.getByTestId("week-strip"));
    expect(onReplay).toHaveBeenCalled();
  });
});

describe("MomentPill", () => {
  it("shows the first headline and how many more", () => {
    const onPlay = vi.fn();
    render(<MomentPill moments={[{ kind: "results", result: W40 }, { kind: "passed", ids: ["adam"] }]} people={[jp, adam]} viewer="jp" onPlay={onPlay} />);
    expect(screen.getByTestId("moment-pill")).toHaveTextContent("🏆 Week 40 results are in + 1 more");
    fireEvent.click(screen.getByTestId("moment-pill"));
    expect(onPlay).toHaveBeenCalled();
  });

  it("renders nothing with nothing to show", () => {
    const { container } = render(<MomentPill moments={[]} people={[jp, adam]} viewer="jp" onPlay={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
