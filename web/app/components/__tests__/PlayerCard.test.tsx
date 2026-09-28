import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PlayerCard from "@/app/components/PlayerCard";
import type { WeekResult } from "@/lib/competition";
import type { DayRow, PersonView } from "@/lib/types";

function day(date: string, reviews: number): DayRow {
  return { date, reviews, minutes: 0, newCards: 0, ease1: 0, ease2: 0, ease3: 0, ease4: 0, perDeck: {} };
}
function person(id: string, name: string, days: DayRow[]): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/Los_Angeles", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-29", allTimeReviews: 18402, firstReviewAt: 0 },
    days,
  };
}

const jp = person("jp", "JP", [day("2026-09-29", 50)]);
const adam = person("adam", "Adam", [day("2024-03-02", 10), day("2026-09-28", 62)]);
const results: WeekResult[] = [
  { week: "2026-09-21", standings: [{ id: "adam", cards: 894 }, { id: "jp", cards: 88 }], winner: "adam", podium: null },
];

const show = (who: PersonView, viewer = "jp", onFullStats = vi.fn(), onClose = vi.fn()) =>
  render(<PlayerCard person={who} people={[jp, adam]} viewer={viewer} results={results} onClose={onClose} onFullStats={onFullStats} />);

describe("PlayerCard", () => {
  it("shows the champion's title, trophies and history", () => {
    show(adam);
    expect(screen.getByText("👑 Champion · week 1")).toBeTruthy();
    expect(screen.getByTestId("card-weeks-won")).toHaveTextContent("🏆 1");
    expect(screen.getByTestId("card-run")).toHaveTextContent("🔥 1");
    expect(screen.getByText(/Studying since Mar 2024/)).toBeTruthy();
  });

  it("shows your head-to-head and this week's race on someone else's card", () => {
    show(adam);
    expect(screen.getByTestId("card-h2h")).toHaveTextContent("You vs Adam");
    expect(screen.getByTestId("card-h2h")).toHaveTextContent("0 – 1");
    expect(screen.getByTestId("card-h2h")).toHaveTextContent("This week Adam's 12 ahead — 5 days left");
  });

  it("races on your week when theirs has already rolled over", () => {
    const me = { ...person("jp", "JP", [day("2026-10-01", 300)]) };
    me.meta = { ...me.meta, todayKey: "2026-10-04" };
    const them = person("adam", "Adam", [day("2026-09-30", 500), day("2026-10-05", 3)]);
    them.meta = { ...them.meta, todayKey: "2026-10-05" };
    render(<PlayerCard person={them} people={[me, them]} viewer="jp" results={results} onClose={vi.fn()} onFullStats={vi.fn()} />);
    expect(screen.getByTestId("card-h2h")).toHaveTextContent("This week Adam's 200 ahead — last day");
  });

  it("doesn't colour your head-to-head as winning on a tie", () => {
    render(<PlayerCard person={adam} people={[jp, adam]} viewer="jp" results={[]} onClose={vi.fn()} onFullStats={vi.fn()} />);
    const mine = screen.getByTestId("card-h2h").querySelector("b > span") as HTMLElement;
    expect(mine.textContent).toBe("0");
    expect(mine.style.color).toBe("var(--ink-dim)");
  });

  it("has no head-to-head on your own card, and muted trophies before a win", () => {
    show(jp);
    expect(screen.queryByTestId("card-h2h")).toBeNull();
    expect(screen.getByTestId("card-weeks-won")).toHaveTextContent("first win up for grabs");
  });

  it("goes to full stats, and closes on Esc and on the backdrop", () => {
    const onFullStats = vi.fn();
    const onClose = vi.fn();
    show(adam, "jp", onFullStats, onClose);
    fireEvent.click(screen.getByText("Full stats ▸"));
    expect(onFullStats).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByTestId("player-card-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
