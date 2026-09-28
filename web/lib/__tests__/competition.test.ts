import { describe, it, expect } from "vitest";
import {
  champion, competesIn, finishedResults, firstWeek, headToHead, isFinal, isoWeek, trophies, trophyCopy,
  weekLabel, weekResult, type WeekResult,
} from "@/lib/competition";
import type { DayRow, PersonView } from "@/lib/types";

function day(date: string, reviews: number): DayRow {
  return { date, reviews, minutes: 0, newCards: 0, ease1: 0, ease2: 0, ease3: 0, ease4: 0, perDeck: {} };
}

const TUE_22_SEP = Date.UTC(2026, 8, 22, 21, 42);     // JP's real join, 5:42pm New York
const THU_24_SEP_LA = Date.UTC(2026, 8, 25, 4, 22);   // Adam's real join, 9:22pm Los Angeles on the 24th

function person(id: string, days: DayRow[], o: { tz?: string; joinedAt?: number; todayKey?: string } = {}): PersonView {
  return {
    profile: { id, displayName: id.toUpperCase(), tz: o.tz ?? "America/New_York", joinedAt: o.joinedAt ?? TUE_22_SEP },
    meta: { lastPublishAt: 0, streak: 0, todayKey: o.todayKey ?? "2026-09-27", allTimeReviews: 0, firstReviewAt: 0 },
    days,
  };
}

const W39 = "2026-09-21";
const W40 = "2026-09-28";
const result = (week: string, standings: [string, number][], winner: string | null, podium: string[] | null = null): WeekResult =>
  ({ week, standings: standings.map(([id, cards]) => ({ id, cards })), winner, podium });

describe("isoWeek and weekLabel", () => {
  it("numbers weeks the ISO way", () => {
    expect(isoWeek(W39)).toBe(39);
    expect(isoWeek(W40)).toBe(40);
    expect(isoWeek("2025-12-29")).toBe(1);
    expect(isoWeek("2026-12-28")).toBe(53);
  });

  it("labels a week with its range", () => {
    expect(weekLabel(W40)).toBe("Week 40 · 28 Sep – 4 Oct");
  });
});

describe("who competes", () => {
  it("counts founders from week 39", () => {
    expect(firstWeek(person("jp", []))).toBe(W39);
    expect(firstWeek(person("adam", [], { tz: "America/Los_Angeles", joinedAt: THU_24_SEP_LA }))).toBe(W39);
  });

  it("starts a later joiner on the Monday after the week they joined", () => {
    expect(firstWeek(person("peter", [], { joinedAt: Date.UTC(2026, 8, 30, 16) }))).toBe("2026-10-05");
  });

  it("sits out the week they joined in, even when they join on a Monday", () => {
    expect(firstWeek(person("geoff", [], { joinedAt: Date.UTC(2026, 9, 5, 16) }))).toBe("2026-10-12");
  });

  it("never counts a week before the season", () => {
    expect(competesIn(person("jp", []), "2026-09-14")).toBe(false);
  });
});

describe("weekResult", () => {
  it("crowns whoever reviewed most", () => {
    const r = weekResult(W39, [person("jp", [day("2026-09-22", 88)]), person("adam", [day("2026-09-26", 894)])]);
    expect(r).toEqual(result(W39, [["adam", 894], ["jp", 88]], "adam"));
  });

  it("has no winner on a tie for first", () => {
    const r = weekResult(W39, [person("jp", [day("2026-09-22", 50)]), person("adam", [day("2026-09-23", 50)])]);
    expect(r?.winner).toBeNull();
  });

  it("keeps a competitor who did nothing, at 0", () => {
    const r = weekResult(W39, [person("jp", []), person("adam", [day("2026-09-23", 5)])]);
    expect(r?.standings).toEqual([{ id: "adam", cards: 5 }, { id: "jp", cards: 0 }]);
  });

  it("has no result with fewer than two competitors", () => {
    expect(weekResult(W39, [person("jp", [day("2026-09-22", 5)])])).toBeNull();
  });

  it("only records a podium with four or more competitors", () => {
    const three = ["a", "b", "c"].map((id, i) => person(id, [day("2026-09-22", 10 - i)]));
    expect(weekResult(W39, three)?.podium).toBeNull();
    const four = ["a", "b", "c", "d"].map((id, i) => person(id, [day("2026-09-22", 10 - i)]));
    expect(weekResult(W39, four)?.podium).toEqual(["a", "b", "c"]);
  });

  it("only counts days inside the week", () => {
    const r = weekResult(W39, [person("jp", [day("2026-09-20", 500), day("2026-09-28", 500), day("2026-09-27", 1)]), person("adam", [])]);
    expect(r?.standings[0]).toEqual({ id: "jp", cards: 1 });
  });
});

describe("isFinal", () => {
  const jp = person("jp", []);
  const adam = person("adam", [], { tz: "America/Los_Angeles", joinedAt: THU_24_SEP_LA });

  it("waits until it is Monday past 4am in every competitor's zone", () => {
    // 9:00 UTC Monday = 5am New York (Monday) but 2am Los Angeles (still Sunday's Anki day).
    expect(isFinal(W39, [jp, adam], Date.UTC(2026, 8, 28, 9))).toBe(false);
    // 11:30 UTC = 4:30am Los Angeles.
    expect(isFinal(W39, [jp, adam], Date.UTC(2026, 8, 28, 11, 30))).toBe(true);
  });

  it("doesn't let an unknown zone hold the week open", () => {
    const local = person("peter", [], { tz: "local" });
    expect(isFinal(W39, [jp, local], Date.UTC(2026, 8, 28, 15))).toBe(false);
    expect(isFinal(W39, [jp, local], Date.UTC(2026, 8, 28, 16, 30))).toBe(true);
  });
});

describe("finishedResults", () => {
  const jp = person("jp", [day("2026-09-22", 88), day("2026-09-29", 300)]);
  const adam = person("adam", [day("2026-09-26", 894), day("2026-09-30", 200)], { tz: "America/Los_Angeles", joinedAt: THU_24_SEP_LA });

  it("lists every finished week, oldest first", () => {
    const got = finishedResults([jp, adam], Date.UTC(2026, 9, 6, 12));
    expect(got.map((r) => [r.week, r.winner])).toEqual([[W39, "adam"], [W40, "jp"]]);
  });

  it("leaves out the week still being played", () => {
    expect(finishedResults([jp, adam], Date.UTC(2026, 8, 30, 12)).map((r) => r.week)).toEqual([W39]);
  });

  it("is empty with nobody", () => {
    expect(finishedResults([], Date.UTC(2026, 9, 6))).toEqual([]);
  });
});

describe("trophies", () => {
  const history = [
    result("2026-09-21", [["adam", 9], ["jp", 1]], "adam"),
    result("2026-09-28", [["adam", 9], ["jp", 1]], "adam"),
    result("2026-10-05", [["jp", 5], ["adam", 5]], null),
    result("2026-10-12", [["adam", 9], ["jp", 1]], "adam"),
  ];

  it("counts wins, the live run and the best run; a tie ends a run", () => {
    expect(trophies("adam", history)).toEqual({ weeksWon: 3, silver: 0, bronze: 0, run: 1, bestRun: 2 });
    expect(trophies("jp", history)).toEqual({ weeksWon: 0, silver: 0, bronze: 0, run: 0, bestRun: 0 });
  });

  it("counts silver and bronze from podium weeks", () => {
    const r = [result("2026-10-19", [["a", 4], ["b", 3], ["c", 2], ["d", 1]], "a", ["a", "b", "c"])];
    expect(trophies("b", r).silver).toBe(1);
    expect(trophies("c", r).bronze).toBe(1);
  });

  it("names the latest winner champion, nobody after a tie", () => {
    expect(champion(history)).toBe("adam");
    expect(champion(history.slice(0, 3))).toBeNull();
    expect(champion([])).toBeNull();
  });
});

describe("headToHead", () => {
  it("counts weeks each had more, from both sides, skipping ties and weeks one sat out", () => {
    const r = [
      result("2026-09-21", [["adam", 9], ["jp", 1]], "adam"),
      result("2026-09-28", [["jp", 9], ["adam", 1]], "jp"),
      result("2026-10-05", [["jp", 5], ["adam", 5]], null),
      result("2026-10-12", [["jp", 9], ["peter", 1]], "jp"),
      result("2026-10-19", [["jp", 9], ["adam", 3]], "jp"),
    ];
    expect(headToHead("jp", "adam", r)).toEqual({ a: 2, b: 1 });
    expect(headToHead("adam", "jp", r)).toEqual({ a: 1, b: 2 });
  });
});

describe("trophyCopy", () => {
  it("nudges before the first win", () => {
    expect(trophyCopy({ weeksWon: 0, silver: 0, bronze: 0, run: 0, bestRun: 0 })).toEqual({
      weeks: { value: "🏆 0", sub: "first win up for grabs", earned: false },
      run: { value: "—", sub: "win this week to start one", earned: false },
    });
  });

  it("shows a live run in gold", () => {
    expect(trophyCopy({ weeksWon: 2, silver: 0, bronze: 0, run: 2, bestRun: 2 })).toEqual({
      weeks: { value: "🏆 2", sub: "weeks won", earned: true },
      run: { value: "🔥 2", sub: "best ever 2", earned: true },
    });
  });

  it("falls back to the best run, muted, when the run is over", () => {
    expect(trophyCopy({ weeksWon: 3, silver: 0, bronze: 0, run: 0, bestRun: 3 }).run)
      .toEqual({ value: "🔥 3", sub: "best run · win this week to start a new one", earned: false });
  });

  it("lists medals once any podium week exists", () => {
    expect(trophyCopy({ weeksWon: 1, silver: 2, bronze: 0, run: 0, bestRun: 1 }).weeks.sub).toBe("🥇 1 · 🥈 2 · 🥉 0");
  });
});
