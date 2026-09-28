import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import StatTiles from "@/app/components/StatTiles";
import type { DayRow, PersonView } from "@/lib/types";

function day(date: string, reviews: number): DayRow {
  return { date, reviews, minutes: 0, newCards: 0, ease1: 0, ease2: 0,
           ease3: 0, ease4: 0, perDeck: {} };
}

const jp: PersonView = {
  profile: { id: "jp", displayName: "JP", tz: "America/New_York", joinedAt: 0 },
  meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-21", allTimeReviews: 400, firstReviewAt: 1 },
  days: [day("2025-10-29", 400)],
};

describe("StatTiles", () => {
  it("dates your best day with the year", () => {
    render(<StatTiles people={[jp]} viewer="jp" />);
    expect(screen.getByText("Oct 29, 2025")).toBeTruthy();
  });

  it("compares this week with the same days of last week", () => {
    // Wednesday 23 Sep: Mon–Wed this week vs Mon–Wed last week, not all of last week.
    const p: PersonView = {
      ...jp,
      meta: { ...jp.meta, todayKey: "2026-09-23" },
      days: [day("2026-09-14", 10), day("2026-09-16", 10), day("2026-09-17", 1000),
             day("2026-09-21", 15), day("2026-09-23", 15)],
    };
    render(<StatTiles people={[p]} viewer="jp" />);
    expect(screen.getByText("▲ 50% on this point last week")).toBeTruthy();
  });

  it("ignores a streak the publisher reported once it has lapsed", () => {
    const lapsed: PersonView = {
      ...jp,
      meta: { ...jp.meta, streak: 9, todayKey: "2026-09-23" },
      days: [day("2026-09-18", 5), day("2026-09-19", 5)],
    };
    render(<StatTiles people={[lapsed]} viewer="jp" />);
    expect(screen.getByText("nobody has one yet")).toBeTruthy();
  });
});
