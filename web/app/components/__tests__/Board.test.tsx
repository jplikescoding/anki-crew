// web/app/components/__tests__/Board.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import Board from "@/app/components/Board";
import type { DayRow, PersonView } from "@/lib/types";

function day(date: string, over: Partial<DayRow> = {}): DayRow {
  return { date, reviews: 0, minutes: 0, newCards: 0, ease1: 0, ease2: 0,
           ease3: 0, ease4: 0, perDeck: {}, ...over };
}

function person(id: string, name: string, tz: string, days: DayRow[], streak = 0): PersonView {
  return {
    profile: { id, displayName: name, tz, joinedAt: 0 },
    meta: { lastPublishAt: Date.now(), streak, todayKey: "2026-09-21",
            allTimeReviews: days.reduce((s, d) => s + d.reviews, 0), firstReviewAt: 1 },
    days,
  };
}

const JP = person("jp", "JP", "America/New_York", [day("2026-09-21", { reviews: 143, minutes: 22 })], 7);
const ANDY = person("andy", "Andy", "America/Los_Angeles", [day("2026-09-21", { reviews: 200, minutes: 30 })], 2);

describe("Board", () => {
  it("ranks by reviews, highest first", () => {
    render(<Board people={[JP, ANDY]} viewer="jp" range="today" />);
    const names = screen.getAllByTestId("board-name").map((n) => n.textContent);
    expect(names).toEqual(["Andy", "JP"]);
  });

  it("marks the viewer's own row", () => {
    render(<Board people={[JP, ANDY]} viewer="jp" range="today" />);
    expect(screen.getByTestId("row-jp")).toHaveAttribute("data-you", "true");
    expect(screen.getByTestId("row-andy")).toHaveAttribute("data-you", "false");
  });

  it("tags a participant in a different timezone, with the seasonal abbreviation", () => {
    // todayKey is in September, so Los Angeles is on daylight time: PDT, not PST.
    render(<Board people={[JP, ANDY]} viewer="jp" range="today" />);
    expect(within(screen.getByTestId("row-andy")).getByText("PDT")).toBeTruthy();
    expect(within(screen.getByTestId("row-jp")).queryByText(/PDT|PST|EDT|EST/)).toBeNull();
  });

  it("tags nobody when everyone shares the viewer's zone", () => {
    const sameZone = person("sam", "Sam", "America/New_York", [day("2026-09-21", { reviews: 5 })]);
    render(<Board people={[JP, sameZone]} viewer="jp" range="today" />);
    expect(screen.queryByText(/EDT|EST/)).toBeNull();
  });

  it("shows a dash rather than 0% when nothing has been graded", () => {
    render(<Board people={[JP]} viewer="jp" range="today" />);
    expect(within(screen.getByTestId("row-jp")).getByTestId("retention").textContent).toBe("—");
  });

  it("flags a stale publisher instead of implying they stopped studying", () => {
    const stale = { ...JP, meta: { ...JP.meta, lastPublishAt: Date.now() - 1000 * 60 * 60 * 9 } };
    render(<Board people={[stale]} viewer="jp" range="today" />);
    expect(screen.getByTestId("stale-jp")).toBeTruthy();
  });

  it("sums the whole week when range is week", () => {
    const busy = person("jp", "JP", "America/New_York", [
      day("2026-09-20", { reviews: 100 }), day("2026-09-21", { reviews: 43 })]);
    render(<Board people={[busy]} viewer="jp" range="week" />);
    expect(within(screen.getByTestId("row-jp")).getByTestId("reviews").textContent).toBe("143");
  });

  it("renders an empty state when nobody has published", () => {
    render(<Board people={[]} viewer={null} range="today" />);
    expect(screen.getByTestId("board-empty")).toBeTruthy();
  });

  it("moves the arrows with the range", () => {
    // JP overtook Andy today, but Andy's big day earlier in the week keeps him
    // ahead on the week both yesterday and today.
    const jp = person("jp", "JP", "America/New_York",
      [day("2026-09-20", { reviews: 0 }), day("2026-09-21", { reviews: 200 })]);
    const andy = person("andy", "Andy", "America/New_York",
      [day("2026-09-16", { reviews: 900 }), day("2026-09-20", { reviews: 50 })]);
    const { rerender } = render(<Board people={[jp, andy]} viewer="jp" range="today" />);
    expect(screen.getByTestId("delta-jp").textContent).toBe("▲1");
    expect(screen.getByTestId("delta-andy").textContent).toBe("▼1");

    rerender(<Board people={[jp, andy]} viewer="jp" range="week" />);
    expect(screen.queryByTestId("delta-jp")).toBeNull();
    expect(screen.queryByTestId("delta-andy")).toBeNull();
  });
});
