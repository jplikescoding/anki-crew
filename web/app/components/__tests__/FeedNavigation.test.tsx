import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Feed from "@/app/components/Feed";
import type { Engagement, FeedItem, PersonView } from "@/lib/types";

function person(id: string, name: string): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/New_York", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-25", allTimeReviews: 0, firstReviewAt: 0 },
    days: [],
  };
}
const people = [person("jp", "JP"), person("adam", "Adam")];

const cards: FeedItem[] = Array.from({ length: 45 }, (_, i) => ({
  id: `adam:${i}`, user: "adam", front: `語${i}`, back: "word", deck: "Core",
  ease: 3, ivl: 1, ts: 1_000_000 - i,
}));

const say = (at: number, user = "adam") => ({ reactions: {}, comments: [{ user, text: "hey", at }] });
const base = { items: cards, people, viewer: "jp", apiKey: "key_jp", onSeen: () => {}, seen: { _floor: 100 } };

afterEach(() => vi.restoreAllMocks());

describe("tapping the badge", () => {
  it("switches on Unread and opens the thread with the newest comment", () => {
    const engagement: Record<string, Engagement> = { "adam:3": say(500), "adam:7": say(900) };
    render(<Feed {...base} engagement={engagement} jumpSignal={1} />);
    expect(screen.getByTestId("filter-unread")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("comment-input-adam:7")).toBeInTheDocument();
  });

  it("clears filters that would hide the card it's taking you to", () => {
    const engagement = { "adam:3": say(500) };
    const r = render(<Feed {...base} engagement={engagement} jumpSignal={0} />);
    fireEvent.click(screen.getByTestId("chip-jp"));
    fireEvent.click(screen.getByTestId("outcome-missed"));
    r.rerender(<Feed {...base} engagement={engagement} jumpSignal={1} />);
    expect(screen.getByTestId("chip-jp")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("outcome-all")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("comment-input-adam:3")).toBeInTheDocument();
  });
});

describe("Next unread", () => {
  const engagement: Record<string, Engagement> = { "adam:0": say(900), "adam:40": say(500) };

  it("goes to the next unread thread, even one you haven't paged down to", () => {
    render(<Feed {...base} engagement={engagement} />);
    fireEvent.click(screen.getByTestId("thread-adam:0"));
    fireEvent.click(screen.getByTestId("next-unread"));
    expect(screen.getByTestId("comment-input-adam:40")).toBeInTheDocument();
  });

  it("isn't offered when there's nothing else unread", () => {
    render(<Feed {...base} engagement={{ "adam:0": say(900) }} />);
    fireEvent.click(screen.getByTestId("thread-adam:0"));
    expect(screen.queryByTestId("next-unread")).toBeNull();
  });

  it("is the n key, which leaves you alone while you type", () => {
    render(<Feed {...base} engagement={engagement} />);
    fireEvent.click(screen.getByTestId("thread-adam:0"));
    fireEvent.keyDown(screen.getByTestId("comment-input-adam:0"), { key: "n" });
    expect(screen.queryByTestId("comment-input-adam:40")).toBeNull();
    fireEvent.keyDown(window, { key: "n" });
    expect(screen.getByTestId("comment-input-adam:40")).toBeInTheDocument();
  });
});

describe("Mark all read", () => {
  const engagement: Record<string, Engagement> = { "adam:0": say(900), "adam:5": say(500) };

  it("only shows with the Unread filter on and something unread", () => {
    render(<Feed {...base} engagement={engagement} onMarkAllSeen={() => {}} />);
    expect(screen.queryByTestId("mark-all-read")).toBeNull();
    fireEvent.click(screen.getByTestId("filter-unread"));
    expect(screen.getByTestId("mark-all-read")).toHaveTextContent("Mark all read");
  });

  it("takes a second tap, then marks read up to the newest comment shown", () => {
    const onMarkAllSeen = vi.fn();
    render(<Feed {...base} engagement={engagement} onMarkAllSeen={onMarkAllSeen} />);
    fireEvent.click(screen.getByTestId("filter-unread"));
    fireEvent.click(screen.getByTestId("mark-all-read"));
    expect(onMarkAllSeen).not.toHaveBeenCalled();
    expect(screen.getByTestId("mark-all-read")).toHaveTextContent("Tap again to mark 2 read");
    fireEvent.click(screen.getByTestId("mark-all-read"));
    expect(onMarkAllSeen).toHaveBeenCalledWith(900);
  });

  it("forgets the first tap after 3 seconds", () => {
    vi.useFakeTimers();
    try {
      const onMarkAllSeen = vi.fn();
      render(<Feed {...base} engagement={engagement} onMarkAllSeen={onMarkAllSeen} />);
      fireEvent.click(screen.getByTestId("filter-unread"));
      fireEvent.click(screen.getByTestId("mark-all-read"));
      act(() => { vi.advanceTimersByTime(3000); });
      expect(screen.getByTestId("mark-all-read")).toHaveTextContent("Mark all read");
      fireEvent.click(screen.getByTestId("mark-all-read"));
      expect(onMarkAllSeen).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the list down to the caught-up row", () => {
    const r = render(<Feed {...base} engagement={engagement} onMarkAllSeen={() => {}} />);
    fireEvent.click(screen.getByTestId("filter-unread"));
    fireEvent.click(screen.getByTestId("mark-all-read"));
    fireEvent.click(screen.getByTestId("mark-all-read"));
    r.rerender(<Feed {...base} engagement={engagement} seen={{ _floor: 900 }} onMarkAllSeen={() => {}} />);
    expect(screen.getByTestId("caught-up")).toBeTruthy();
    expect(screen.queryByTestId("item-adam:0")).toBeNull();
    expect(screen.queryByTestId("mark-all-read")).toBeNull();
  });
});

describe("back to top", () => {
  it("appears once you've scrolled a screen down, and takes you up", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<Feed {...base} engagement={{}} />);
    const button = screen.getByTestId("back-to-top");
    expect(button).toHaveAttribute("aria-hidden", "true");

    Object.defineProperty(window, "scrollY", { value: window.innerHeight * 2, configurable: true });
    act(() => { window.dispatchEvent(new Event("scroll")); });
    expect(button).toHaveAttribute("aria-hidden", "false");

    fireEvent.click(button);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("is the g key", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<Feed {...base} engagement={{}} />);
    fireEvent.keyDown(window, { key: "g" });
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});
