import { describe, it, expect } from "vitest";
import { ackPatch, heldStreaks, isRankMoment, momentHeadline, pendingMoments, silentPatch, standingNow } from "@/lib/moments";
import { shiftDays } from "@/lib/metrics";
import { shownRank } from "@/lib/ranks";
import type { WeekResult } from "@/lib/competition";
import type { CompetitionState, DayRow, PersonView } from "@/lib/types";

function day(date: string, reviews: number): DayRow {
  return { date, reviews, minutes: 0, newCards: 0, ease1: 0, ease2: 0, ease3: 0, ease4: 0, perDeck: {} };
}
function person(id: string, name: string, days: DayRow[], todayKey = "2026-09-29", lastPublishAt = 0): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/New_York", joinedAt: Date.UTC(2026, 8, 22) },
    meta: { lastPublishAt, streak: 0, todayKey, allTimeReviews: 0, firstReviewAt: 0 },
    days,
  };
}

const W39: WeekResult = { week: "2026-09-21", standings: [{ id: "adam", cards: 894 }, { id: "jp", cards: 88 }], winner: "adam", podium: null };
const W40: WeekResult = { week: "2026-09-28", standings: [{ id: "jp", cards: 900 }, { id: "adam", cards: 800 }], winner: "jp", podium: null };

// Tuesday 29 Sep: JP 50, Adam 40 this week.
const jp = person("jp", "JP", [day("2026-09-29", 50)]);
const adam = person("adam", "Adam", [day("2026-09-28", 40)]);
const state = (s: Partial<CompetitionState> = {}): CompetitionState => ({ results: {}, ...s });
const seen = { jp: { rank: null, streak: 0 }, adam: { rank: null, streak: 1 } } as const;

describe("pendingMoments", () => {
  it("offers the latest week's roundup until it has been shown", () => {
    expect(pendingMoments([jp, adam], "jp", state(), [W39])).toEqual([{ kind: "results", result: W39 }]);
    expect(pendingMoments([jp, adam], "jp", state({ results: { "2026-09-21": "adam" } }), [W39])).toEqual([]);
  });

  it("only offers the latest roundup, not every missed week", () => {
    expect(pendingMoments([jp, adam], "jp", state(), [W39, W40])).toEqual([{ kind: "results", result: W40 }]);
  });

  it("corrects a result a late sync changed", () => {
    const shown = state({ results: { "2026-09-21": "jp" } });
    expect(pendingMoments([jp, adam], "jp", shown, [W39])).toEqual([{ kind: "late", result: W39 }]);
  });

  it("reports passing and being passed against the standing you last acknowledged", () => {
    const was = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["adam", "jp"] } });
    expect(pendingMoments([jp, adam], "jp", was, [W39])).toEqual([{ kind: "passed", ids: ["adam"] }]);
    expect(pendingMoments([jp, adam], "adam", was, [W39])).toEqual([{ kind: "passedBy", ids: ["jp"] }]);
  });

  it("says nothing when the order is unchanged, or the standing is from last week", () => {
    const same = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["jp", "adam"] } });
    expect(pendingMoments([jp, adam], "jp", same, [W39])).toEqual([]);
    const old = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-21", order: ["adam", "jp"] } });
    expect(pendingMoments([jp, adam], "jp", old, [W39])).toEqual([]);
  });

  it("has no pass moments on a Monday", () => {
    const mon = [person("jp", "JP", [day("2026-09-28", 5)], "2026-09-28"), person("adam", "Adam", [], "2026-09-28")];
    const was = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["adam", "jp"] } });
    expect(pendingMoments(mon, "jp", was, [W39])).toEqual([]);
  });

  it("scores this week on the viewer's week across the Monday 4am boundary", () => {
    // Mon 5 Oct 09:00Z: JP in New York is on Monday, Adam in LA still on Sunday.
    // JP's 500 in week 40 still count on Adam's board; the 3 from Monday don't.
    const jpMon = { ...person("jp", "JP", [day("2026-09-30", 500), day("2026-10-05", 3)], "2026-10-05") };
    const adamLA = person("adam", "Adam", [day("2026-10-01", 300)], "2026-10-04");
    adamLA.profile.tz = "America/Los_Angeles";
    const was = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["jp", "adam"] } });
    expect(standingNow([jpMon, adamLA], "2026-10-04")).toEqual({ week: "2026-09-28", order: ["jp", "adam"] });
    expect(pendingMoments([jpMon, adamLA], "adam", was, [W39])).toEqual([]);
  });

  it("has nothing for a viewer who isn't on the board", () => {
    expect(pendingMoments([jp, adam], null, state(), [W39])).toEqual([]);
  });
});

describe("patches", () => {
  it("acknowledges every result and the current order", () => {
    expect(ackPatch([jp, adam], "jp", [W39, W40])).toEqual({
      results: { "2026-09-21": "adam", "2026-09-28": "jp" },
      standing: { week: "2026-09-28", order: ["jp", "adam"] },
      ranks: { jp: { rank: null, streak: 0 }, adam: { rank: null, streak: 1 } },
    });
  });

  it("records a tie as 'none'", () => {
    const tie = { ...W39, winner: null };
    expect(ackPatch([jp, adam], "jp", [tie]).results).toEqual({ "2026-09-21": "none" });
  });

  it("silently records missed older weeks and a first standing", () => {
    expect(silentPatch([jp, adam], "jp", state(), [W39, W40])).toEqual({
      results: { "2026-09-21": "adam" },
      standing: { week: "2026-09-28", order: ["jp", "adam"] },
      ranks: { jp: { rank: null, streak: 0 }, adam: { rank: null, streak: 1 } },
    });
  });

  it("leaves a pending pass alone mid-week", () => {
    const was = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["adam", "jp"] }, ranks: seen });
    expect(silentPatch([jp, adam], "jp", was, [W39])).toBeNull();
  });

  it("resets the baseline on Monday", () => {
    const mon = [person("jp", "JP", [day("2026-09-28", 5)], "2026-09-28"), person("adam", "Adam", [], "2026-09-28")];
    const was = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["adam", "jp"] }, ranks: seen });
    expect(silentPatch(mon, "jp", was, [W39])).toEqual({ standing: { week: "2026-09-28", order: ["jp", "adam"] } });
  });

  it("orders the standing among this week's competitors only", () => {
    const late = { ...person("peter", "Peter", [day("2026-09-29", 999)]), profile: { id: "peter", displayName: "Peter", tz: "America/New_York", joinedAt: Date.UTC(2026, 8, 29) } };
    expect(standingNow([jp, adam, late], "2026-09-29")).toEqual({ week: "2026-09-28", order: ["jp", "adam"] });
  });
});

describe("momentHeadline", () => {
  it("names what happened", () => {
    expect(momentHeadline({ kind: "results", result: W39 }, [jp, adam], "jp")).toBe("🏆 Week 1 results are in");
    expect(momentHeadline({ kind: "late", result: W39 }, [jp, adam], "jp")).toBe("Late sync: Adam took week 1 after all");
    expect(momentHeadline({ kind: "passed", ids: ["adam"] }, [jp, adam], "jp")).toBe("⚡ You passed Adam this week");
    expect(momentHeadline({ kind: "passedBy", ids: ["jp"] }, [jp, adam], "adam")).toBe("JP passed you this week — 10 behind");
  });
});

describe("rank moments", () => {
  // Synced today at noon New York, so streaks are confirmed.
  const synced = Date.UTC(2026, 8, 29, 16, 0);
  const streaker = (id: string, name: string, n: number) =>
    person(id, name, Array.from({ length: n }, (_, i) => day(shiftDays("2026-09-29", -i), 10)), "2026-09-29", synced);
  const jpS = streaker("jp", "JP", 1);
  const kinds = (ms: { kind: string }[]) => ms.map((m) => m.kind);

  it("plays a rank-up when someone climbs", () => {
    const a = streaker("adam", "Adam", 14);
    const st = state({ ranks: { adam: { rank: "silver", streak: 13 } } });
    expect(pendingMoments([jpS, a], "jp", st, [])).toEqual([{ kind: "rankUp", id: "adam", from: "silver", to: "gold" }]);
  });

  it("plays a crumble when a streak breaks, down to whatever it is now", () => {
    const a = streaker("adam", "Adam", 4);
    const st = state({ ranks: { adam: { rank: "gold", streak: 20 } } });
    expect(pendingMoments([jpS, a], "jp", st, [])).toEqual([{ kind: "crumble", id: "adam", from: "gold", to: "bronze" }]);
  });

  it("records ranks silently for anyone not seen before", () => {
    const a = streaker("adam", "Adam", 14);
    expect(pendingMoments([jpS, a], "jp", state(), []).filter(isRankMoment)).toEqual([]);
    expect(silentPatch([jpS, a], "jp", state(), [])?.ranks).toEqual({ jp: shownRank(jpS), adam: shownRank(a) });
    const st = state({ ranks: { jp: shownRank(jpS) }, standing: standingNow([jpS, a], "2026-09-29") });
    expect(silentPatch([jpS, a], "jp", st, [])).toEqual({ ranks: { adam: shownRank(a) } });
  });

  it("says nothing when the rank is unchanged, even if the number moved", () => {
    const a = streaker("adam", "Adam", 16);
    const st = state({ ranks: { adam: { rank: "gold", streak: 15 } } });
    expect(pendingMoments([jpS, a], "jp", st, []).filter(isRankMoment)).toEqual([]);
  });

  it("orders roundup, then ranks, then passes", () => {
    const a = streaker("adam", "Adam", 14);
    const st = state({
      ranks: { adam: { rank: "silver", streak: 13 } },
      standing: { week: "2026-09-28", order: ["adam", "jp"] },
    });
    const jpBig = person("jp", "JP", [day("2026-09-29", 500)], "2026-09-29", synced);
    expect(kinds(pendingMoments([jpBig, a], "jp", st, [W39]))).toEqual(["results", "rankUp", "passed"]);
  });

  it("names rank moments in the headline", () => {
    const a = streaker("adam", "Adam", 14);
    const up = { kind: "rankUp" as const, id: "adam", from: "silver" as const, to: "gold" as const };
    expect(momentHeadline({ ...up, id: "jp" }, [jpS, a], "jp")).toBe("🛡 You reached Gold");
    expect(momentHeadline(up, [jpS, a], "jp")).toBe("🛡 Adam reached Gold");
    const down = { kind: "crumble" as const, id: "adam", from: "gold" as const, to: null };
    expect(momentHeadline({ ...down, id: "jp" }, [jpS, a], "jp")).toBe("Your Gold streak crumbled");
    expect(momentHeadline(down, [jpS, a], "jp")).toBe("Adam's Gold streak crumbled");
  });

  it("holds the stored streak for a pending crumble", () => {
    const st = state({ ranks: { adam: { rank: "gold", streak: 20 } } });
    expect(heldStreaks(st, [{ kind: "crumble", id: "adam", from: "gold", to: null }])).toEqual({ adam: 20 });
  });

  it("acknowledges every person's current rank", () => {
    const a = streaker("adam", "Adam", 14);
    expect(ackPatch([jpS, a], "jp", []).ranks?.adam).toEqual(shownRank(a));
  });
});
