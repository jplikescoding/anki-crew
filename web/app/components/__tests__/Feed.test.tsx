// web/app/components/__tests__/Feed.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Feed from "@/app/components/Feed";
import type { Engagement, FeedItem, PersonView } from "@/lib/types";

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

  it("exposes aria-pressed state for active chip", () => {
    render(<Feed items={items} people={people} />);
    // Initially, no chip is active
    expect(screen.getByTestId("chip-jp").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("chip-andy").getAttribute("aria-pressed")).toBe("false");

    // Click Andy's chip to activate it
    fireEvent.click(screen.getByTestId("chip-andy"));
    expect(screen.getByTestId("chip-andy").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("chip-jp").getAttribute("aria-pressed")).toBe("false");

    // Click Andy's chip again to deactivate it
    fireEvent.click(screen.getByTestId("chip-andy"));
    expect(screen.getByTestId("chip-andy").getAttribute("aria-pressed")).toBe("false");
  });
});

describe("ago() function", () => {
  it("formats just under 1 hour", () => {
    render(<Feed items={[{ id: "test", user: "jp", front: "text", back: "text", deck: "Deck", ease: 3, ivl: 1, ts: Date.now() - 59 * 60000 }]} people={people} />);
    expect(screen.getByText("59m")).toBeTruthy();
  });

  it("formats just over 1 hour", () => {
    render(<Feed items={[{ id: "test", user: "jp", front: "text", back: "text", deck: "Deck", ease: 3, ivl: 1, ts: Date.now() - 61 * 60000 }]} people={people} />);
    expect(screen.getByText("1h")).toBeTruthy();
  });

  it("formats ~23.5 hours as hours, not days", () => {
    render(<Feed items={[{ id: "test", user: "jp", front: "text", back: "text", deck: "Deck", ease: 3, ivl: 1, ts: Date.now() - Math.round(23.5 * 60 * 60 * 1000) }]} people={people} />);
    expect(screen.getByText("24h")).toBeTruthy();
    expect(screen.queryByText("1d")).toBeNull();
  });

  it("formats just over 24 hours as days", () => {
    render(<Feed items={[{ id: "test", user: "jp", front: "text", back: "text", deck: "Deck", ease: 3, ivl: 1, ts: Date.now() - 25 * 60 * 60 * 1000 }]} people={people} />);
    expect(screen.getByText("1d")).toBeTruthy();
  });

  it("formats future timestamp as 0m", () => {
    render(<Feed items={[{ id: "test", user: "jp", front: "text", back: "text", deck: "Deck", ease: 3, ivl: 1, ts: Date.now() + 1000 }]} people={people} />);
    expect(screen.getByText("0m")).toBeTruthy();
  });
});

describe("filter bar", () => {
  it("shows only misses, or only successes", () => {
    render(<Feed items={items} people={people} />);
    fireEvent.click(screen.getByTestId("outcome-missed"));
    expect(screen.queryByTestId("item-jp:2")).toBeNull();
    expect(screen.getByTestId("item-andy:1")).toBeTruthy();
    fireEvent.click(screen.getByTestId("outcome-got"));
    expect(screen.getByTestId("item-jp:2")).toBeTruthy();
    expect(screen.queryByTestId("item-andy:1")).toBeNull();
  });

  it("shows only cards with comments", () => {
    const talk: Record<string, Engagement> = {
      "andy:1": { reactions: {}, comments: [{ user: "jp", text: "oof", at: 1 }] },
    };
    render(<Feed items={items} people={people} engagement={talk} viewer="jp" />);
    fireEvent.click(screen.getByTestId("filter-comments"));
    expect(screen.queryByTestId("item-jp:2")).toBeNull();
    expect(screen.getByTestId("item-andy:1")).toBeTruthy();
  });

  it("combines a person with an outcome, and names both when nothing matches", () => {
    render(<Feed items={items} people={people} />);
    fireEvent.click(screen.getByTestId("chip-andy"));
    fireEvent.click(screen.getByTestId("outcome-got"));
    expect(screen.getByTestId("feed-empty")).toHaveTextContent("No successful cards from Andy yet");
    fireEvent.click(screen.getByTestId("clear-filters"));
    expect(screen.getAllByTestId(/^item-/)).toHaveLength(2);
  });
});

describe("the unread filter", () => {
  const talk: Record<string, Engagement> = {
    "andy:1": { reactions: {}, comments: [{ user: "andy", text: "argh", at: 5000 }] },
  };
  const base = { items, people, viewer: "jp", apiKey: "key_jp", onSeen: () => {} };

  it("shows only threads you haven't read", () => {
    render(<Feed {...base} engagement={talk} seen={{ _floor: 1000 }} />);
    fireEvent.click(screen.getByTestId("filter-unread"));
    expect(screen.queryByTestId("item-jp:2")).toBeNull();
    expect(screen.getByTestId("item-andy:1")).toBeTruthy();
  });

  it("keeps a card listed after you read it, until you switch the filter off", () => {
    const r = render(<Feed {...base} engagement={talk} seen={{ _floor: 1000 }} />);
    fireEvent.click(screen.getByTestId("filter-unread"));
    r.rerender(<Feed {...base} engagement={talk} seen={{ _floor: 1000, "andy:1": 9000 }} />);
    expect(screen.getByTestId("item-andy:1")).toBeTruthy();
    expect(screen.getByTestId("caught-up")).toHaveTextContent("All caught up");

    fireEvent.click(screen.getByTestId("filter-unread"));
    fireEvent.click(screen.getByTestId("filter-unread"));
    expect(screen.queryByTestId("item-andy:1")).toBeNull();
    expect(screen.getByTestId("caught-up")).toBeTruthy();
    expect(screen.queryByTestId("feed-empty")).toBeNull();
  });
});

describe("day headers", () => {
  it("group cards under Today in the viewer's time zone, with a count", () => {
    const now = Date.now();
    const today = [
      { ...items[0], id: "jp:10", ts: now - 1000 },
      { ...items[0], id: "jp:11", ts: now - 2000 },
    ];
    render(<Feed items={today} people={people} viewer="jp" />);
    const labels = screen.getAllByTestId("day-label").map((n) => n.textContent);
    expect(labels[0]).toBe("Today");
    expect(screen.getAllByTestId(/^day-\d/)[0]).toHaveTextContent("· 2");
  });
});

describe("paging", () => {
  const many = Array.from({ length: 45 }, (_, i) => ({
    ...items[0], id: `jp:${100 - i}`, ts: 100_000 - i, ease: i % 2 ? 1 : 3,
  }));

  it("renders 30, then 30 more at a time", () => {
    render(<Feed items={many} people={people} />);
    expect(screen.getAllByTestId(/^item-/)).toHaveLength(30);
    expect(screen.getByTestId("show-more")).toHaveTextContent("Show 15 more · 15 left");
    fireEvent.click(screen.getByTestId("show-more"));
    expect(screen.getAllByTestId(/^item-/)).toHaveLength(45);
    expect(screen.queryByTestId("show-more")).toBeNull();
  });

  it("goes back to 30 when a filter changes", () => {
    render(<Feed items={many} people={people} />);
    fireEvent.click(screen.getByTestId("show-more"));
    fireEvent.click(screen.getByTestId("outcome-got"));
    fireEvent.click(screen.getByTestId("outcome-all"));
    expect(screen.getAllByTestId(/^item-/)).toHaveLength(30);
  });
});
