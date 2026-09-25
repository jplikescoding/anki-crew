import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import Feed from "@/app/components/Feed";
import type { Engagement, FeedItem, PersonView } from "@/lib/types";

function person(id: string, name: string): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/New_York", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-21", allTimeReviews: 0, firstReviewAt: 0 },
    days: [],
  };
}

const people = [person("jp", "JP"), person("peter", "Peter")];

const card: FeedItem = {
  id: "peter:1", user: "peter", front: "話しかける", back: "to speak to",
  deck: "Core", ease: 3, ivl: 21, ts: Date.now() - 60_000,
};

function view(engagement: Record<string, Engagement> = {}, extra = {}) {
  const onReact = vi.fn();
  const onComment = vi.fn();
  render(
    <Feed
      items={[card]}
      people={people}
      engagement={engagement}
      viewer="jp"
      apiKey="key_jp"
      onReact={onReact}
      onComment={onComment}
      {...extra}
    />,
  );
  return { onReact, onComment };
}

describe("reactions", () => {
  it("sends the emoji you tapped", () => {
    const { onReact } = view();
    fireEvent.click(screen.getByTestId("react-peter:1-🔥"));
    expect(onReact).toHaveBeenCalledWith("peter:1", "🔥");
  });

  it("clears your reaction when you tap the one you already chose", () => {
    const { onReact } = view({ "peter:1": { reactions: { jp: "🔥" }, comments: [] } });
    fireEvent.click(screen.getByTestId("react-peter:1-🔥"));
    expect(onReact).toHaveBeenCalledWith("peter:1", null);
  });

  it("marks your own reaction as pressed and leaves the others alone", () => {
    view({ "peter:1": { reactions: { jp: "🔥" }, comments: [] } });
    expect(screen.getByTestId("react-peter:1-🔥")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("react-peter:1-💀")).toHaveAttribute("aria-pressed", "false");
  });

  it("counts several people on the same emoji as one tally", () => {
    view({ "peter:1": { reactions: { jp: "🔥", peter: "🔥" }, comments: [] } });
    expect(screen.getByTestId("react-peter:1-🔥").textContent).toContain("2");
  });
});

describe("comments", () => {
  const withComment = {
    "peter:1": {
      reactions: {},
      comments: [{ user: "peter", text: "this one keeps getting me", at: 1000 }],
    },
  };

  it("shows how many there are without opening the thread", () => {
    view(withComment);
    expect(screen.getByTestId("thread-peter:1").textContent).toContain("1 comment");
  });

  it("opens the thread and shows the author", () => {
    view(withComment);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    expect(screen.getByText("this one keeps getting me")).toBeTruthy();
    expect(within(screen.getByTestId("item-peter:1")).getAllByText("Peter").length).toBeGreaterThan(0);
  });

  it("submits a comment and clears the box", () => {
    const { onComment } = view(withComment);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    const input = screen.getByTestId("comment-input-peter:1") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "  brutal  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onComment).toHaveBeenCalledWith("peter:1", "brutal");
    expect(input.value).toBe("");
  });

  it("refuses to submit an empty comment", () => {
    const { onComment } = view(withComment);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    const input = screen.getByTestId("comment-input-peter:1");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onComment).not.toHaveBeenCalled();
  });

  it("flags other people's comments you haven't read, but not your own", () => {
    view({
      "peter:1": {
        reactions: {},
        comments: [
          { user: "peter", text: "theirs", at: 5000 },
          { user: "jp", text: "mine", at: 6000 },
        ],
      },
    }, { seen: { _floor: 4000 } });
    expect(screen.getByTestId("thread-peter:1").textContent).toContain("1 new");
  });

  it("says nothing is new once you've opened the thread since", () => {
    view(withComment, { seen: { _floor: 0, "peter:1": 9999 } });
    expect(screen.getByTestId("thread-peter:1").textContent).not.toContain("new");
  });
});

describe("reading a thread", () => {
  const unread = {
    "peter:1": { reactions: {}, comments: [{ user: "peter", text: "hi", at: 5000 }] },
  };
  const base = { items: [card], people, viewer: "jp", apiKey: "key_jp" };

  it("happens when you open it", () => {
    const onSeen = vi.fn();
    render(<Feed {...base} engagement={unread} seen={{ _floor: 1000 }} onSeen={onSeen} />);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    // The newest comment on screen, not the clock: anything newer is unseen.
    expect(onSeen).toHaveBeenCalledWith("peter:1", 5000);
  });

  it("doesn't happen for a thread with nothing unread", () => {
    const onSeen = vi.fn();
    render(<Feed {...base} engagement={unread} seen={{ _floor: 9000 }} onSeen={onSeen} />);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    expect(onSeen).not.toHaveBeenCalled();
  });

  it("isn't asked for twice when the save didn't stick", () => {
    const onSeen = vi.fn();
    const r = render(<Feed {...base} engagement={unread} seen={{ _floor: 1000 }} onSeen={onSeen} />);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    // A reload after a failed save brings back the same stale read state.
    r.rerender(<Feed {...base} engagement={{ ...unread }} seen={{ _floor: 1000 }} onSeen={onSeen} />);
    expect(onSeen).toHaveBeenCalledTimes(1);
  });

  it("happens again when a new comment lands in the thread you have open", () => {
    const onSeen = vi.fn();
    const r = render(<Feed {...base} engagement={unread} seen={{ _floor: 1000 }} onSeen={onSeen} />);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    const more = { "peter:1": { reactions: {}, comments: [
      ...unread["peter:1"].comments, { user: "peter", text: "also", at: 7000 },
    ] } };
    r.rerender(<Feed {...base} engagement={more} seen={{ _floor: 1000, "peter:1": 6000 }} onSeen={onSeen} />);
    expect(onSeen).toHaveBeenCalledTimes(2);
    expect(onSeen).toHaveBeenLastCalledWith("peter:1", 7000);
  });

  it("keeps the new pills while you're reading, even after it's marked read", () => {
    const r = render(<Feed {...base} engagement={unread} seen={{ _floor: 1000 }} onSeen={() => {}} />);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    r.rerender(<Feed {...base} engagement={unread} seen={{ _floor: 1000, "peter:1": 99999 }} onSeen={() => {}} />);
    expect(screen.getByText("new")).toBeInTheDocument();
  });
});

describe("drafts", () => {
  const other: FeedItem = { ...card, id: "peter:2", front: "食べる", back: "to eat" };

  function twoCards() {
    const onComment = vi.fn();
    render(<Feed items={[card, other]} people={people} engagement={{}} viewer="jp" apiKey="key_jp" onComment={onComment} />);
    return { onComment };
  }

  it("stay with the card you wrote them on", () => {
    const { onComment } = twoCards();
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    fireEvent.change(screen.getByTestId("comment-input-peter:1"), { target: { value: "half a thought" } });

    fireEvent.click(screen.getByTestId("thread-peter:2"));
    const second = screen.getByTestId("comment-input-peter:2") as HTMLInputElement;
    expect(second.value).toBe("");
    fireEvent.keyDown(second, { key: "Enter" });
    expect(onComment).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("thread-peter:1"));
    expect((screen.getByTestId("comment-input-peter:1") as HTMLInputElement).value).toBe("half a thought");
  });
});

describe("jumping to the first unread comment", () => {
  it("happens once per request, not again when new comments arrive", () => {
    const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
    const other: FeedItem = { ...card, id: "peter:0", ts: card.ts + 1000 };
    const unread = (id: string) => ({ [id]: { reactions: {}, comments: [{ user: "peter", text: "hi", at: 5000 }] } });
    const props = { items: [other, card], people, viewer: "jp", apiKey: "key_jp", seen: { _floor: 1000 }, jumpSignal: 1 };

    const r = render(<Feed {...props} engagement={unread("peter:1")} />);
    expect(scroll).toHaveBeenCalledTimes(1);

    // A refresh brings a newer unread comment on an earlier card.
    r.rerender(<Feed {...props} engagement={{ ...unread("peter:1"), ...unread("peter:0") }} />);
    expect(scroll).toHaveBeenCalledTimes(1);
    scroll.mockRestore();
  });
});

describe("read-only viewing", () => {
  it("hides the reaction buttons nobody has used when you cannot write", () => {
    render(<Feed items={[card]} people={people} engagement={{}} />);
    expect(screen.queryByTestId("react-peter:1-🔥")).toBeNull();
  });
});
