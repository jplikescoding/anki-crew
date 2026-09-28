import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import PersonPanel from "@/app/components/PersonPanel";
import type { DayRow, PersonView } from "@/lib/types";
import type { WeekResult } from "@/lib/competition";

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

  it("lists recent cards by their real word, not an index number", () => {
    const items = [{ id: "jp:9", user: "jp", front: "5493", back: "作り上げる", deck: "Core", ease: 3, ivl: 1, ts: 9,
      noteType: "Core", fields: { "Core-Index": "5493", "Vocabulary-Kanji": "作り上げる", "Vocabulary-English": "to build up" } }];
    render(<PersonPanel person={person} items={items} />);
    expect(screen.getByText("作り上げる")).toBeTruthy();
    expect(screen.getByText("to build up")).toBeTruthy();
    expect(screen.queryByText("5493")).toBeNull();
  });

  it("leads with the trophies, streak best and all-time new cards in a 3 × 2 grid", () => {
    const results: WeekResult[] = [
      { week: "2026-09-14", standings: [{ id: "jp", cards: 9 }, { id: "adam", cards: 1 }], winner: "jp", podium: null },
    ];
    render(<PersonPanel person={person} items={[]} results={results} />);
    const tiles = screen.getByTestId("stat-grid").children;
    expect(tiles).toHaveLength(6);
    expect(within(tiles[0] as HTMLElement).getByText("🏆 1")).toBeTruthy();
    expect(within(tiles[1] as HTMLElement).getByText("🔥 1")).toBeTruthy();
    expect(within(tiles[2] as HTMLElement).getByText("best 2 days")).toBeTruthy();
    expect(within(tiles[3] as HTMLElement).getByText("0 new cards")).toBeTruthy();
  });

  it("nudges before a first win", () => {
    render(<PersonPanel person={person} items={[]} />);
    expect(screen.getByText("first win up for grabs")).toBeTruthy();
    expect(screen.getByText("win this week to start one")).toBeTruthy();
  });
});
