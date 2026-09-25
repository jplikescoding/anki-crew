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
});
