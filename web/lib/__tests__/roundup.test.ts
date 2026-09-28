import { describe, it, expect } from "vitest";
import { headline, swingLine } from "@/lib/roundup";
import type { WeekResult } from "@/lib/competition";
import type { DayRow, PersonView } from "@/lib/types";

const names = { jp: "JP", adam: "Adam", peter: "Peter" };
const r = (week: string, standings: [string, number][], winner: string | null): WeekResult =>
  ({ week, standings: standings.map(([id, cards]) => ({ id, cards })), winner, podium: null });

describe("headline", () => {
  it("picks the verb from the margin", () => {
    const cases: [number, number, string][] = [
      [1000, 990, "edges"], [1284, 1071, "holds off"], [1000, 700, "beats"], [894, 88, "cruises past"],
    ];
    for (const [a, b, verb] of cases) {
      // Adam has won before (not a first win) and JP won last week with a run of 1 (not a snapped run).
      const history = [
        r("2026-09-07", [["adam", 5], ["jp", 1]], "adam"),
        r("2026-09-14", [["jp", 5], ["adam", 1]], "jp"),
      ];
      const week = r("2026-09-21", [["adam", a], ["jp", b]], "adam");
      expect(headline(week, [...history, week], names)).toBe(`Adam ${verb} JP by ${(a - b).toLocaleString("en-US")}`);
    }
  });

  it("celebrates a first ever win", () => {
    const week = r("2026-09-21", [["adam", 894], ["jp", 88]], "adam");
    expect(headline(week, [week], names)).toBe("Adam cruises past JP by 806 for a first ever win");
  });

  it("says back-to-back, then N straight", () => {
    const w1 = r("2026-09-21", [["adam", 894], ["jp", 88]], "adam");
    const w2 = r("2026-09-28", [["adam", 1284], ["jp", 1071]], "adam");
    const w3 = r("2026-10-05", [["adam", 1000], ["jp", 700]], "adam");
    expect(headline(w2, [w1, w2], names)).toBe("Adam holds off JP by 213 to go back-to-back");
    expect(headline(w3, [w1, w2, w3], names)).toBe("Adam beats JP by 300 to make it 3 straight");
  });

  it("calls out a snapped run", () => {
    const w1 = r("2026-09-21", [["adam", 9], ["jp", 1]], "adam");
    const w2 = r("2026-09-28", [["adam", 9], ["jp", 1]], "adam");
    const w3 = r("2026-10-05", [["jp", 500], ["adam", 450]], "jp");
    expect(headline(w3, [w1, w2, w3], names)).toBe("JP snaps Adam's 2-week run, by 50");
  });

  it("calls a tie a dead heat", () => {
    const week = r("2026-09-21", [["adam", 300], ["jp", 300]], null);
    expect(headline(week, [week], names)).toBe("Dead heat: Adam and JP both on 300");
  });
});

function day(date: string, reviews: number): DayRow {
  return { date, reviews, minutes: 0, newCards: 0, ease1: 0, ease2: 0, ease3: 0, ease4: 0, perDeck: {} };
}
function person(id: string, days: DayRow[]): PersonView {
  return {
    profile: { id, displayName: names[id as keyof typeof names], tz: "UTC", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-10-04", allTimeReviews: 0, firstReviewAt: 0 },
    days,
  };
}

describe("swingLine", () => {
  const week = "2026-09-28";

  it("credits the winner's biggest day and notes a comeback", () => {
    // JP leads 238 to 200 after Wednesday; Adam's 412 on Thursday swings it.
    const jp = person("jp", [day("2026-09-28", 120), day("2026-09-29", 60), day("2026-09-30", 58), day("2026-10-01", 50)]);
    const adam = person("adam", [day("2026-09-28", 100), day("2026-09-30", 100), day("2026-10-01", 412)]);
    const result = r(week, [["adam", 612], ["jp", 288]], "adam");
    expect(swingLine(result, [jp, adam], names)).toBe(
      "Thursday swung it — Adam's 412 was the biggest day of the week. JP was 38 ahead going into Thursday.",
    );
  });

  it("gives the loser credit for the biggest day without saying it swung anything", () => {
    const jp = person("jp", [day("2026-09-28", 300)]);
    const adam = person("adam", [day("2026-09-28", 10), day("2026-09-29", 200), day("2026-09-30", 200)]);
    const result = r(week, [["adam", 410], ["jp", 300]], "adam");
    expect(swingLine(result, [jp, adam], names)).toBe(
      "JP's 300 on Monday was the biggest day of the week. JP was 90 ahead going into Wednesday.",
    );
  });

  it("is null when nobody studied", () => {
    expect(swingLine(r(week, [["adam", 0], ["jp", 0]], null), [person("jp", []), person("adam", [])], names)).toBeNull();
  });
});
