import { describe, it, expect } from "vitest";
import {
  rankDeltas,
  currentDayKey,
  gapToNext,
  streakTier,
  personalBest,
  crewDailyTotals,
  STREAK_TIERS,
} from "@/lib/metrics";
import type { DayRow, PersonView } from "@/lib/types";

function day(date: string, reviews: number): DayRow {
  return {
    date, reviews, minutes: 0, newCards: 0,
    ease1: 0, ease2: 0, ease3: 0, ease4: 0, perDeck: {},
  };
}

function person(id: string, name: string, days: DayRow[], streak = 0): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/New_York", joinedAt: 0 },
    meta: {
      lastPublishAt: 0, streak, todayKey: "2026-09-21",
      allTimeReviews: days.reduce((s, d) => s + d.reviews, 0), firstReviewAt: 1,
    },
    days,
  };
}

const TODAY = "2026-09-21";
const YESTERDAY = "2026-09-20";

describe("rankDeltas", () => {
  it("reports a climb as positive", () => {
    // JP was second yesterday, first today.
    const jp = person("jp", "JP", [day(YESTERDAY, 10), day(TODAY, 300)]);
    const pete = person("peter", "Peter", [day(YESTERDAY, 200), day(TODAY, 100)]);
    const d = rankDeltas([jp, pete], "today");
    expect(d.jp).toBe(1);
    expect(d.peter).toBe(-1);
  });

  it("is zero when nothing moved", () => {
    const jp = person("jp", "JP", [day(YESTERDAY, 300), day(TODAY, 300)]);
    const pete = person("peter", "Peter", [day(YESTERDAY, 100), day(TODAY, 100)]);
    expect(rankDeltas([jp, pete], "today")).toEqual({ jp: 0, peter: 0 });
  });

  it("treats a missing yesterday as no movement rather than a fake climb", () => {
    const jp = person("jp", "JP", [day(TODAY, 300)]);
    const pete = person("peter", "Peter", [day(TODAY, 100)]);
    expect(rankDeltas([jp, pete], "today")).toEqual({ jp: 0, peter: 0 });
  });

  it("handles a single person", () => {
    expect(rankDeltas([person("jp", "JP", [day(TODAY, 5)])], "today")).toEqual({ jp: 0 });
  });

  it("compares each person on their own day, not someone else's", () => {
    // Peter is a day ahead. His today (22nd) beats JP's today (21st), and
    // yesterday it was the other way round, so Peter climbed.
    const jp = person("jp", "JP", [day("2026-09-20", 50), day(TODAY, 100)]);
    const pete = person("peter", "Peter", [day(TODAY, 10), day("2026-09-22", 300)]);
    pete.meta.todayKey = "2026-09-22";
    expect(rankDeltas([jp, pete], "today")).toEqual({ jp: -1, peter: 1 });
  });

  it("ranks the week on the seven days ending today vs ending yesterday", () => {
    // Today alone JP overtakes, but over the week Peter is still ahead both
    // days, so nobody moved.
    const jp = person("jp", "JP", [day(YESTERDAY, 0), day(TODAY, 200)]);
    const pete = person("peter", "Peter", [day("2026-09-16", 500), day(YESTERDAY, 300), day(TODAY, 0)]);
    expect(rankDeltas([jp, pete], "today")).toEqual({ jp: 1, peter: -1 });
    expect(rankDeltas([jp, pete], "week")).toEqual({ jp: 0, peter: 0 });
  });

  it("drops the day that fell out of the week window", () => {
    // Yesterday's window (09-14..09-20) still held Peter's big day; today's doesn't.
    const jp = person("jp", "JP", [day(YESTERDAY, 100), day(TODAY, 100)]);
    const pete = person("peter", "Peter", [day("2026-09-14", 500), day(TODAY, 50)]);
    expect(rankDeltas([jp, pete], "week")).toEqual({ jp: 1, peter: -1 });
  });

  it("ranks all time on the total vs the total before today", () => {
    const jp = person("jp", "JP", [day("2026-01-01", 1000), day(TODAY, 0)]);
    const pete = person("peter", "Peter", [day("2026-01-01", 900), day(TODAY, 200)]);
    expect(rankDeltas([jp, pete], "all")).toEqual({ jp: -1, peter: 1 });
  });
});

describe("currentDayKey", () => {
  // 2026-09-22 15:00 UTC is 11:00 in New York, 00:00 on the 23rd in Tokyo.
  const NOON_ISH = Date.UTC(2026, 8, 22, 15);

  it("moves a stale day up to today in that person's zone", () => {
    expect(currentDayKey("America/New_York", "2026-09-21", NOON_ISH)).toBe("2026-09-22");
  });

  it("keeps the previous day until the 4am rollover", () => {
    // Midnight in Tokyo is still the 22nd's Anki day.
    expect(currentDayKey("Asia/Tokyo", "2026-09-21", NOON_ISH)).toBe("2026-09-22");
    expect(currentDayKey("Asia/Tokyo", "2026-09-21", NOON_ISH + 4 * 3600_000)).toBe("2026-09-23");
  });

  it("leaves a current day alone", () => {
    expect(currentDayKey("America/New_York", "2026-09-22", NOON_ISH)).toBe("2026-09-22");
  });

  it("never moves a day backwards", () => {
    expect(currentDayKey("America/New_York", "2026-09-23", NOON_ISH)).toBe("2026-09-23");
  });

  it("trusts the reported day when the zone isn't real", () => {
    expect(currentDayKey("local", "2026-09-21", NOON_ISH)).toBe("2026-09-21");
  });
});

describe("gapToNext", () => {
  const jp = person("jp", "JP", [day(TODAY, 247)]);
  const pete = person("peter", "Peter", [day(TODAY, 198)]);
  const adam = person("adam", "Adam", [day(TODAY, 64)]);
  const pick = (p: PersonView) => p.days[0]?.reviews ?? 0;

  it("tells a trailing viewer how far behind the person directly ahead", () => {
    expect(gapToNext([jp, pete, adam], "adam", pick))
      .toEqual({ kind: "behind", name: "Peter", amount: 134 });
  });

  it("uses the person directly ahead, not the leader", () => {
    expect(gapToNext([jp, pete, adam], "peter", pick))
      .toEqual({ kind: "behind", name: "JP", amount: 49 });
  });

  it("tells the leader their margin over second", () => {
    expect(gapToNext([jp, pete, adam], "jp", pick))
      .toEqual({ kind: "leading", name: "Peter", amount: 49 });
  });

  it("returns null when the viewer is not on the board", () => {
    expect(gapToNext([jp, pete], "nobody", pick)).toBeNull();
  });

  it("returns null for a lone participant", () => {
    expect(gapToNext([jp], "jp", pick)).toBeNull();
  });

  it("reports a tie as a zero gap rather than omitting it", () => {
    const tied = person("peter", "Peter", [day(TODAY, 247)]);
    expect(gapToNext([jp, tied], "peter", pick))
      .toEqual({ kind: "behind", name: "JP", amount: 0 });
  });
});

describe("streakTier", () => {
  it("gives a fresh streak no tier but names the first rung", () => {
    const t = streakTier(1);
    expect(t.tier).toBe(0);
    expect(t.nextAt).toBe(3);
    expect(t.daysToNext).toBe(2);
  });

  it("reaches the first tier at three days, so the feature is discoverable early", () => {
    expect(streakTier(3).tier).toBe(1);
    expect(streakTier(6).tier).toBe(1);
  });

  it("steps at one week and two weeks", () => {
    expect(streakTier(7).tier).toBe(2);
    expect(streakTier(13).tier).toBe(2);
    expect(streakTier(14).tier).toBe(3);
  });

  it("steps at thirty and a hundred", () => {
    expect(streakTier(30).tier).toBe(4);
    expect(streakTier(99).tier).toBe(4);
    expect(streakTier(100).tier).toBe(5);
  });

  it("has nothing left to climb at the top tier", () => {
    const t = streakTier(365);
    expect(t.tier).toBe(5);
    expect(t.nextAt).toBeNull();
    expect(t.daysToNext).toBeNull();
  });

  it("handles a zero streak", () => {
    expect(streakTier(0).tier).toBe(0);
  });

  it("exposes its thresholds so the UI and the tooltip cannot disagree", () => {
    expect(STREAK_TIERS).toEqual([3, 7, 14, 30, 100]);
  });
});

describe("personalBest", () => {
  it("finds the single best day", () => {
    const days = [day("2026-09-19", 100), day("2026-09-20", 312), day("2026-09-21", 40)];
    expect(personalBest(days)).toEqual({ date: "2026-09-20", reviews: 312 });
  });

  it("keeps the earliest day on a tie, so the record has one owner", () => {
    const days = [day("2026-09-19", 312), day("2026-09-20", 312)];
    expect(personalBest(days)?.date).toBe("2026-09-19");
  });

  it("returns null with no history", () => {
    expect(personalBest([])).toBeNull();
  });

  it("ignores days with no reviews", () => {
    expect(personalBest([day("2026-09-19", 0)])).toBeNull();
  });
});

describe("crewDailyTotals", () => {
  const jp = person("jp", "JP", [day("2026-09-20", 10), day(TODAY, 20)]);
  const pete = person("peter", "Peter", [day(TODAY, 5)]);

  it("produces one entry per day in the window, newest last", () => {
    const rows = crewDailyTotals([jp, pete], TODAY, 3);
    expect(rows.map((r) => r.date)).toEqual(["2026-09-19", "2026-09-20", TODAY]);
  });

  it("splits each day by person and totals it", () => {
    const rows = crewDailyTotals([jp, pete], TODAY, 2);
    expect(rows[1]).toEqual({ date: TODAY, perPerson: { jp: 20, peter: 5 }, total: 25 });
  });

  it("fills days nobody studied with zeros rather than gaps", () => {
    const rows = crewDailyTotals([jp, pete], TODAY, 3);
    expect(rows[0]).toEqual({ date: "2026-09-19", perPerson: { jp: 0, peter: 0 }, total: 0 });
  });

  it("handles an empty crew", () => {
    expect(crewDailyTotals([], TODAY, 2)).toEqual([
      { date: "2026-09-20", perPerson: {}, total: 0 },
      { date: TODAY, perPerson: {}, total: 0 },
    ]);
  });
});
