// web/app/components/__tests__/Feed.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Feed from "@/app/components/Feed";
import type { FeedItem, PersonView } from "@/lib/types";

const people: PersonView[] = [
  { profile: { id: "jp", displayName: "JP", tz: "America/New_York", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-21", allTimeReviews: 0, firstReviewAt: 0 }, days: [] },
  { profile: { id: "andy", displayName: "Andy", tz: "America/Los_Angeles", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-21", allTimeReviews: 0, firstReviewAt: 0 }, days: [] },
];

const items: FeedItem[] = [
  { id: "jp:2", user: "jp", front: "話しかける", back: "to speak to", deck: "Core 2k/6k", ease: 3, ivl: 21, ts: 2000 },
  { id: "andy:1", user: "andy", front: "聞き取る", back: "to catch (words)", deck: "Listening", ease: 1, ivl: 1, ts: 1000 },
];

describe("Feed", () => {
  it("shows each card's word, meaning and deck", () => {
    render(<Feed items={items} people={people} />);
    expect(screen.getByText("話しかける")).toBeTruthy();
    expect(screen.getByText("to speak to")).toBeTruthy();
    expect(screen.getByText("Core 2k/6k")).toBeTruthy();
  });

  it("attributes each card to the person who reviewed it", () => {
    render(<Feed items={items} people={people} />);
    expect(screen.getByTestId("item-andy:1").textContent).toContain("Andy");
  });

  it("renders newest first", () => {
    render(<Feed items={items} people={people} />);
    const ids = screen.getAllByTestId(/^item-/).map((n) => n.getAttribute("data-testid"));
    expect(ids).toEqual(["item-jp:2", "item-andy:1"]);
  });

  it("filters to one person when their chip is clicked", () => {
    render(<Feed items={items} people={people} />);
    fireEvent.click(screen.getByTestId("chip-andy"));
    expect(screen.queryByTestId("item-jp:2")).toBeNull();
    expect(screen.getByTestId("item-andy:1")).toBeTruthy();
  });

  it("clicking the active chip clears the filter", () => {
    render(<Feed items={items} people={people} />);
    fireEvent.click(screen.getByTestId("chip-andy"));
    fireEvent.click(screen.getByTestId("chip-andy"));
    expect(screen.getByTestId("item-jp:2")).toBeTruthy();
  });

  it("marks a lapse so a hard card is visible at a glance", () => {
    render(<Feed items={items} people={people} />);
    expect(screen.getByTestId("item-andy:1").getAttribute("data-lapse")).toBe("true");
    expect(screen.getByTestId("item-jp:2").getAttribute("data-lapse")).toBe("false");
  });

  it("renders an empty state", () => {
    render(<Feed items={[]} people={people} />);
    expect(screen.getByTestId("feed-empty")).toBeTruthy();
  });
});
