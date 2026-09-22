import { describe, it, expect } from "vitest";
import { retention, totals, windowFrom, weekStart, shiftDays, rankBy, deckTotals } from "@/lib/metrics";
import type { DayRow, PersonView } from "@/lib/types";

function day(date: string, over: Partial<DayRow> = {}): DayRow {
  return { date, reviews: 0, minutes: 0, newCards: 0, ease1: 0, ease2: 0,
           ease3: 0, ease4: 0, perDeck: {}, ...over };
}

describe("retention", () => {
  it("treats ease1 as the only failure", () => {
    const days = [day("2026-09-21", { ease1: 1, ease2: 1, ease3: 7, ease4: 1 })];
    expect(retention(days)).toBe(90);
  });

  it("returns null with no graded reviews rather than a fake 0%", () => {
    expect(retention([day("2026-09-21")])).toBeNull();
    expect(retention([])).toBeNull();
  });

  it("aggregates across days", () => {
    const days = [day("2026-09-20", { ease1: 1, ease3: 1 }),
                  day("2026-09-21", { ease1: 1, ease3: 1 })];
    expect(retention(days)).toBe(50);
  });
});

describe("totals", () => {
  it("sums reviews, minutes and new cards", () => {
    const days = [day("2026-09-20", { reviews: 10, minutes: 2.5, newCards: 3 }),
                  day("2026-09-21", { reviews: 5, minutes: 1.5, newCards: 1 })];
    expect(totals(days)).toEqual({ reviews: 15, minutes: 4, newCards: 4 });
  });

  it("handles an empty history", () => {
    expect(totals([])).toEqual({ reviews: 0, minutes: 0, newCards: 0 });
  });
});

describe("windowFrom", () => {
  it("keeps days on or after the boundary", () => {
    const days = [day("2026-09-18"), day("2026-09-20"), day("2026-09-21")];
    expect(windowFrom(days, "2026-09-20").map((d) => d.date))
      .toEqual(["2026-09-20", "2026-09-21"]);
  });
});

describe("weekStart", () => {
  it("returns the date six days before today, inclusive of today", () => {
    expect(weekStart("2026-09-21")).toBe("2026-09-15");
  });

  it("crosses a month boundary", () => {
    expect(weekStart("2026-10-03")).toBe("2026-09-27");
  });
});

describe("shiftDays", () => {
  it("moves forward", () => {
    expect(shiftDays("2026-09-21", 3)).toBe("2026-09-24");
  });

  it("moves backward across a month boundary", () => {
    expect(shiftDays("2026-10-01", -2)).toBe("2026-09-29");
  });

  it("is a no-op at zero", () => {
    expect(shiftDays("2026-09-21", 0)).toBe("2026-09-21");
  });
});

describe("rankBy", () => {
  const person = (id: string, reviews: number): PersonView => ({
    profile: { id, displayName: id, tz: "UTC", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-21", allTimeReviews: 0, firstReviewAt: 0 },
    days: [day("2026-09-21", { reviews })],
  });

  it("sorts highest first", () => {
    const ranked = rankBy([person("a", 5), person("b", 50)], (p) => p.days[0].reviews);
    expect(ranked.map((p) => p.profile.id)).toEqual(["b", "a"]);
  });

  it("breaks ties by display name so the order never jitters between loads", () => {
    const ranked = rankBy([person("zed", 5), person("amy", 5)], (p) => p.days[0].reviews);
    expect(ranked.map((p) => p.profile.id)).toEqual(["amy", "zed"]);
  });
});

describe("deckTotals", () => {
  it("sums per-deck counts across days, biggest first", () => {
    const days = [day("2026-09-20", { perDeck: { Core: 5, Listening: 1 } }),
                  day("2026-09-21", { perDeck: { Core: 5 } })];
    expect(deckTotals(days)).toEqual([["Core", 10], ["Listening", 1]]);
  });
});
