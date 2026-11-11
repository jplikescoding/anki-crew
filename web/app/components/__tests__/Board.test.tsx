// web/app/components/__tests__/Board.test.tsx
import { describe, it, expect, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import Board from "@/app/components/Board";
import type { DayRow, Look, PersonView } from "@/lib/types";
import { shiftDays } from "@/lib/metrics";

vi.mock("@/lib/sound", () => ({ playChing: vi.fn(), playCrumble: vi.fn() }));

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

  it("counts this week from Monday", () => {
    // 21 Sep 2026 is a Monday; the Sunday before belongs to last week.
    const busy = person("jp", "JP", "America/New_York", [
      day("2026-09-20", { reviews: 100 }), day("2026-09-21", { reviews: 43 })]);
    render(<Board people={[busy]} viewer="jp" range="week" />);
    expect(within(screen.getByTestId("row-jp")).getByTestId("reviews").textContent).toBe("43");
  });

  it("counts a friend's week on the viewer's week after their own has rolled over", () => {
    // JP is still on Sunday 4 Oct; Andy is already on Monday 5 Oct.
    const jp = { ...person("jp", "JP", "America/Los_Angeles", [day("2026-10-01", { reviews: 300 })]) };
    jp.meta = { ...jp.meta, todayKey: "2026-10-04" };
    const andy = person("andy", "Andy", "America/New_York", [
      day("2026-09-30", { reviews: 500, minutes: 50 }), day("2026-10-05", { reviews: 3, minutes: 1 })]);
    andy.meta = { ...andy.meta, todayKey: "2026-10-05" };
    render(<Board people={[jp, andy]} viewer="jp" range="week" />);
    expect(screen.getAllByTestId("board-name").map((n) => n.textContent)).toEqual(["Andy", "JP"]);
    expect(within(screen.getByTestId("row-andy")).getByTestId("reviews").textContent).toBe("500");
    expect(within(screen.getByTestId("row-andy")).getByText("50 min")).toBeTruthy();
  });

  it("renders an empty state when nobody has published", () => {
    render(<Board people={[]} viewer={null} range="today" />);
    expect(screen.getByTestId("board-empty")).toBeTruthy();
  });

  const NY = "America/New_York";
  const lookAt = (jp: number, andy: number): Look => ({
    at: Date.now(), day: "2026-09-21", week: "2026-09-21",
    scores: { jp: { today: jp, week: jp, all: jp }, andy: { today: andy, week: andy, all: andy } },
  });

  it("moves the arrows since you last looked", () => {
    const jp = person("jp", "JP", NY, [day("2026-09-21", { reviews: 200 })]);
    const andy = person("andy", "Andy", NY, [day("2026-09-21", { reviews: 150 })]);
    render(<Board people={[jp, andy]} viewer="jp" range="today" look={lookAt(10, 100)} />);
    expect(screen.getByTestId("delta-jp").textContent).toBe("▲1");
    expect(screen.getByTestId("delta-jp")).toHaveAttribute("title", "Up 1 since you last looked");
    expect(screen.getByTestId("delta-andy").textContent).toBe("▼1");
  });

  it("shows no arrows on a first visit", () => {
    const jp = person("jp", "JP", NY, [day("2026-09-21", { reviews: 200 })]);
    const andy = person("andy", "Andy", NY, [day("2026-09-21", { reviews: 150 })]);
    render(<Board people={[jp, andy]} viewer="jp" range="today" />);
    expect(screen.queryByTestId("delta-jp")).toBeNull();
    expect(screen.queryByTestId("momentum-jp")).toBeNull();
  });

  it("shows the chase when nobody changed places", () => {
    const jp = person("jp", "JP", NY, [day("2026-09-21", { reviews: 40 })]);
    const andy = person("andy", "Andy", NY, [day("2026-09-21", { reviews: 100 })]);
    render(<Board people={[jp, andy]} viewer="jp" range="week" look={lookAt(10, 90)} />);
    expect(screen.getByTestId("momentum-jp").textContent).toBe("▲");
    expect(screen.getByTestId("momentum-jp")).toHaveAttribute("title", "20 closer to Andy since you last looked");
  });

  it("counts the days left in the week on your gap line", () => {
    const jp = person("jp", "JP", NY, [day("2026-09-21", { reviews: 40 })]);
    const andy = person("andy", "Andy", NY, [day("2026-09-21", { reviews: 100 })]);
    render(<Board people={[jp, andy]} viewer="jp" range="week" />);
    expect(screen.getByTestId("gap-line")).toHaveTextContent("60 behind Andy · 6 days left");
  });

  it("crowns the champion", () => {
    // Andy has no rank, so he keeps the crown rather than a banner.
    render(<Board people={[JP, ANDY]} viewer="jp" range="today" champion="andy" />);
    expect(within(screen.getByTestId("row-andy")).getByTestId("crown")).toBeTruthy();
    expect(within(screen.getByTestId("row-jp")).queryByTestId("crown")).toBeNull();
  });

  /** Studied every day for `n` days, ending on todayKey. */
  const run = (n: number) =>
    Array.from({ length: n }, (_, i) => day(shiftDays("2026-09-21", i - n + 1), { reviews: 10 }));
  const SILVER_JP = person("jp", "JP", NY, run(7));
  const ANDY_2 = person("andy", "Andy", NY, run(2));

  it("frames a ranked row in its metal and leaves an unranked row plain", () => {
    render(<Board people={[SILVER_JP, ANDY_2]} viewer="jp" range="today" />);
    expect(within(screen.getByTestId("row-jp")).getByTestId("frame-silver")).toBeTruthy();
    expect(within(screen.getByTestId("row-andy")).queryByTestId(/^frame-/)).toBeNull();
  });

  it("shows the crest and rank name in the streak column", () => {
    render(<Board people={[SILVER_JP, ANDY_2]} viewer="jp" range="today" />);
    const row = within(screen.getByTestId("row-jp"));
    expect(row.getAllByTestId("crest-silver").length).toBeGreaterThan(0);
    expect(row.getByText("Silver")).toBeTruthy();
  });

  it("hangs a banner for a Silver-or-better champion, coloured by rank", () => {
    render(<Board people={[SILVER_JP, ANDY_2]} viewer="jp" range="today" champion="jp" championWeek={7} />);
    const banner = within(screen.getByTestId("row-jp")).getByTestId("banner");
    expect(banner).toHaveAttribute("data-rank", "silver");
    expect(banner).toHaveTextContent("WK 7");
    expect(screen.queryByTestId("crown")).toBeNull();
  });

  it("keeps the crown for a champion below Silver", () => {
    render(<Board people={[SILVER_JP, ANDY_2]} viewer="jp" range="today" champion="andy" championWeek={7} />);
    expect(within(screen.getByTestId("row-andy")).getByTestId("crown")).toBeTruthy();
    expect(screen.queryByTestId("banner")).toBeNull();
  });

  it("shows a held streak instead of the live one", () => {
    render(<Board people={[SILVER_JP, ANDY_2]} viewer="jp" range="today" held={{ jp: 20 }} />);
    const row = within(screen.getByTestId("row-jp"));
    expect(row.getByTestId("frame-gold")).toBeTruthy();
    expect(row.getAllByText("20").length).toBeGreaterThan(0);
  });

  it("plays a rank moment over that row only, and reports its swap and its end", () => {
    vi.useFakeTimers();
    try {
      const onSwap = vi.fn();
      const onDone = vi.fn();
      render(
        <Board people={[SILVER_JP, ANDY_2]} viewer="jp" range="today"
          rankPlay={{ id: "jp", kind: "rankUp", from: "bronze", to: "silver" }}
          onRankSwap={onSwap} onRankDone={onDone} />,
      );
      // A direct child of the row: it finds the row through its parent.
      expect(screen.getByTestId("row-jp").querySelector(":scope > [data-rank-moment]")).not.toBeNull();
      expect(screen.getByTestId("row-andy").querySelector("[data-rank-moment]")).toBeNull();
      act(() => { vi.advanceTimersByTime(1700); });
      expect(onSwap).toHaveBeenCalledTimes(1);
      expect(onDone).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(1700); });
      expect(onDone).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lifts a stale row out of its dimming while its rank moment plays", () => {
    const old = { lastPublishAt: Date.now() - 1000 * 60 * 60 * 9 };
    const jp = { ...SILVER_JP, meta: { ...SILVER_JP.meta, ...old } };
    const andy = { ...ANDY_2, meta: { ...ANDY_2.meta, ...old } };
    render(
      <Board people={[jp, andy]} viewer="jp" range="today"
        rankPlay={{ id: "jp", kind: "crumble", from: "silver", to: null }} />,
    );
    const playing = screen.getByTestId("row-jp");
    expect(playing.style.opacity).toBe("1");
    expect(playing.style.zIndex).toBe("10");
    const other = screen.getByTestId("row-andy");
    expect(other.style.opacity).toBe("0.72");
    expect(other.style.zIndex).toBe("");
  });

  it("sweeps your row gold for a pass and rose for being passed", () => {
    const { rerender } = render(<Board people={[JP, ANDY]} viewer="jp" range="today" celebrate={{ id: "jp", tone: "gold" }} />);
    expect(screen.getByTestId("row-jp").className).toContain("overtaken");
    rerender(<Board people={[JP, ANDY]} viewer="jp" range="today" celebrate={{ id: "jp", tone: "rose" }} />);
    expect(screen.getByTestId("row-jp").className).toContain("overtaken-rose");
  });
});
