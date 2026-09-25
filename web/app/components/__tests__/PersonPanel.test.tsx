import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PersonPanel from "@/app/components/PersonPanel";
import type { DayRow, PersonView } from "@/lib/types";

function day(date: string, over: Partial<DayRow> = {}): DayRow {
  return { date, reviews: 0, minutes: 0, newCards: 0, ease1: 0, ease2: 0,
           ease3: 0, ease4: 0, perDeck: {}, ...over };
}

const person: PersonView = {
  profile: { id: "jp", displayName: "JP", tz: "America/New_York", joinedAt: 0 },
  meta: { lastPublishAt: Date.now(), streak: 7, todayKey: "2026-09-21",
          allTimeReviews: 48201, firstReviewAt: 1600000000000 },
  days: [day("2026-09-20", { reviews: 100, perDeck: { Core: 60, Listening: 40 } }),
         day("2026-09-21", { reviews: 43, perDeck: { Core: 43 } })],
};

describe("PersonPanel", () => {
  it("shows the person's name and all-time total", () => {
    render(<PersonPanel person={person} items={[]} />);
    expect(screen.getByText("JP")).toBeTruthy();
    expect(screen.getByTestId("all-time").textContent).toContain("48,201");
  });

  it("lists decks biggest first", () => {
    render(<PersonPanel person={person} items={[]} />);
    expect(screen.getAllByTestId("deck-name").map((n) => n.textContent))
      .toEqual(["Core", "Listening"]);
  });

  it("renders a bar per day in the 30-day window", () => {
    render(<PersonPanel person={person} items={[]} />);
    expect(screen.getAllByTestId("day-bar")).toHaveLength(30);
  });

  it("shows only this person's recent cards", () => {
    const items = [
      { id: "jp:1", user: "jp", front: "話す", back: "to speak", deck: "Core", ease: 3, ivl: 1, ts: 1 },
      { id: "andy:1", user: "andy", front: "聞く", back: "to hear", deck: "L", ease: 3, ivl: 1, ts: 2 },
    ];
    render(<PersonPanel person={person} items={items} />);
    expect(screen.getByText("話す")).toBeTruthy();
    expect(screen.queryByText("聞く")).toBeNull();
  });

  it("shows their best day with the year", () => {
    render(<PersonPanel person={person} items={[]} />);
    expect(screen.getByTestId("best-day").textContent).toBe("100");
    expect(screen.getByText("Sep 20, 2026")).toBeTruthy();
    expect(screen.getByText(/best 100 on Sep 20, 2026/)).toBeTruthy();
  });
});
