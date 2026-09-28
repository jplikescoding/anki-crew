import { describe, it, expect } from "vitest";
import {
  rankDeltas, momentum, currentDayKey, gapToNext, streakTier, personalBest, crewDailyTotals, STREAK_TIERS,
  currentStreak, bestStreak, daysLeftInWeek, sinceWhen, weekStart,
} from "@/lib/metrics";
import type { DayRow, Look, LookScores, PersonView } from "@/lib/types";

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

function look(scores: Record<string, Partial<LookScores>>, day = TODAY, at = 0): Look {
  return {
    at, day, week: weekStart(day),
    scores: Object.fromEntries(Object.entries(scores).map(([id, s]) => [id, { today: 0, week: 0, all: 0, ...s }])),
  };
}

describe("rankDeltas", () => {
  const jp = person("jp", "JP", [day(TODAY, 30)]);
  const pete = person("peter", "Peter", [day(TODAY, 20)]);

  it("reports a climb since you last looked as positive", () => {
    expect(rankDeltas([jp, pete], "today", look({ jp: { today: 5 }, peter: { today: 10 } }), TODAY))
      .toEqual({ jp: 1, peter: -1 });
  });

  it("is zero on a first visit", () => {
    expect(rankDeltas([jp, pete], "today", null, TODAY)).toEqual({ jp: 0, peter: 0 });
  });

  it("is zero on Today once the day has rolled over since the look", () => {
    expect(rankDeltas([jp, pete], "today", look({ jp: { today: 5 }, peter: { today: 10 } }, YESTERDAY), TODAY))
      .toEqual({ jp: 0, peter: 0 });
  });

  it("is zero on the week once a new week has started", () => {
    // TODAY (21 Sep 2026) is a Monday, so a look from the day before belongs to last week.
    expect(rankDeltas([jp, pete], "week", look({ jp: { week: 5 }, peter: { week: 10 } }, YESTERDAY), TODAY))
      .toEqual({ jp: 0, peter: 0 });
  });

  it("ranks all time against the look's totals", () => {
    expect(rankDeltas([jp, pete], "all", look({ jp: { all: 1 }, peter: { all: 2 } }, YESTERDAY), TODAY))
      .toEqual({ jp: 1, peter: -1 });
  });
});

describe("momentum", () => {
  const jp = person("jp", "JP", [day(TODAY, 40)]);
  const pete = person("peter", "Peter", [day(TODAY, 100)]);

  it("says the chaser gained on the person above and the leader lost ground", () => {
    const m = momentum([jp, pete], "today", look({ jp: { today: 10 }, peter: { today: 90 } }), TODAY);
    expect(m.jp).toEqual({ dir: 1, amount: 20, rival: "Peter", leading: false });
    expect(m.peter).toEqual({ dir: -1, amount: 20, rival: "JP", leading: true });
  });

  it("is null when the gap didn't change", () => {
    const m = momentum([jp, pete], "today", look({ jp: { today: 0 }, peter: { today: 60 } }), TODAY);
    expect(m).toEqual({ jp: null, peter: null });
  });

  it("is null without a look", () => {
    expect(momentum([jp, pete], "today", null, TODAY)).toEqual({ jp: null, peter: null });
  });
});

describe("currentStreak", () => {
  it("counts back from today", () => {
    expect(currentStreak([day("2026-09-19", 1), day("2026-09-20", 1), day(TODAY, 1)], TODAY)).toBe(3);
  });

  it("counts from yesterday while today is still empty", () => {
    expect(currentStreak([day("2026-09-19", 1), day(YESTERDAY, 1)], TODAY)).toBe(2);
  });

  it("is 0 once a whole day was missed, whatever the publisher last said", () => {
    expect(currentStreak([day("2026-09-18", 1), day("2026-09-19", 1)], TODAY)).toBe(0);
  });

  it("ignores days with no reviews", () => {
    expect(currentStreak([day(YESTERDAY, 0), day(TODAY, 5)], TODAY)).toBe(1);
  });
});

describe("bestStreak", () => {
  it("finds the longest run ever", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06"].map((d) => day(d, 1));
    expect(bestStreak(days)).toBe(3);
  });

  it("is 0 with no history", () => {
    expect(bestStreak([])).toBe(0);
  });
});

describe("daysLeftInWeek", () => {
  it("is 6 on a Monday and 0 on a Sunday", () => {
    expect(daysLeftInWeek("2026-09-28")).toBe(6);
    expect(daysLeftInWeek("2026-10-04")).toBe(0);
  });
});

describe("sinceWhen", () => {
  it("says 'since you last looked' the same day", () => {
    expect(sinceWhen(new Date(2026, 8, 28, 8).getTime(), new Date(2026, 8, 28, 9).getTime()))
      .toBe("since you last looked");
  });

  it("names the weekday of an earlier look", () => {
    expect(sinceWhen(new Date(2026, 8, 26, 12).getTime(), new Date(2026, 8, 28, 9).getTime()))
      .toBe("since Saturday");
  });

  it("dates a look more than six days old", () => {
    expect(sinceWhen(new Date(2026, 8, 1, 12).getTime(), new Date(2026, 8, 28, 9).getTime()))
      .toBe("since Sep 1");
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
