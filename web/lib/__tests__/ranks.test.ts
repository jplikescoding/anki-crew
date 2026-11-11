import { describe, it, expect } from "vitest";
import { bannerColors, rankFor, rankStreak, shownRank } from "@/lib/ranks";
import type { DayRow, PersonView } from "@/lib/types";

function day(date: string): DayRow {
  return { date, reviews: 10, minutes: 0, newCards: 0, ease1: 0, ease2: 0, ease3: 0, ease4: 0, perDeck: {} };
}
// Wednesday 11 Nov 2026 by default.
function person(days: DayRow[], lastPublishAt: number, todayKey = "2026-11-11"): PersonView {
  return {
    profile: { id: "jp", displayName: "JP", tz: "America/New_York", joinedAt: Date.UTC(2026, 8, 22) },
    meta: { lastPublishAt, streak: 0, todayKey, allTimeReviews: 0, firstReviewAt: 0 },
    days,
  };
}
const run = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => day(`2026-11-${String(from + i).padStart(2, "0")}`));
// New York is UTC-5 in November.
const ny = (d: number, h: number) => Date.UTC(2026, 10, d, h + 5);

describe("rankFor", () => {
  it("maps streaks to ranks", () => {
    const cases: [number, string | null][] = [
      [0, null], [2, null], [3, "bronze"], [6, "bronze"], [7, "silver"],
      [14, "gold"], [30, "platinum"], [99, "platinum"], [100, "diamond"], [400, "diamond"],
    ];
    for (const [n, r] of cases) expect(rankFor(n)).toBe(r);
  });
});

describe("bannerColors", () => {
  it("has none below Silver", () => {
    expect(bannerColors(null)).toBeNull();
    expect(bannerColors("bronze")).toBeNull();
  });
  it("gives two colors from Silver up", () => {
    expect(bannerColors("silver")).toEqual(["#5b21b6", "#2e1065"]);
    expect(bannerColors("gold")).toEqual(["#1e3a8a", "#0b1437"]);
    expect(bannerColors("platinum")).toEqual(["#047857", "#022c22"]);
    expect(bannerColors("diamond")).toEqual(["#27272a", "#09090b"]);
  });
});

describe("rankStreak", () => {
  it("counts today once it has synced", () => {
    expect(rankStreak(person(run(7, 11), ny(11, 15)))).toBe(5);
  });
  it("doesn't break a streak on a day that hasn't synced yet", () => {
    expect(rankStreak(person(run(7, 9), ny(9, 22)))).toBe(3);
  });
  it("breaks it once that day is confirmed by a later sync", () => {
    expect(rankStreak(person(run(7, 9), ny(11, 9)))).toBe(0);
  });
  it("breaks it once a second day passes without a sync", () => {
    expect(rankStreak(person(run(7, 8), ny(8, 22)))).toBe(0);
  });
  it("never synced is no streak, not a crash", () => {
    expect(rankStreak(person([], 0))).toBe(0);
  });
});

describe("shownRank", () => {
  it("pairs the rank with the confirmed streak", () => {
    expect(shownRank(person(run(1, 14), ny(14, 12), "2026-11-14"))).toEqual({ rank: "gold", streak: 14 });
  });
});
