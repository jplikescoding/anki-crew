import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Feed from "@/app/components/Feed";
import type { FeedItem, PersonView } from "@/lib/types";

const person = (id: string, name: string): PersonView => ({
  profile: { id, displayName: name, tz: "America/New_York", joinedAt: 0 },
  meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-21", allTimeReviews: 0, firstReviewAt: 0 }, days: [],
});
const people = [person("jp", "JP"), person("adam", "Adam")];

const adams: FeedItem = {
  id: "adam:1", user: "adam", front: "5493", back: "作り上げる", deck: "Core", ease: 3, ivl: 1, ts: 1000,
  noteType: "Core",
  fields: { "Core-Index": "5493", "Vocabulary-Kanji": "作り上げる", "Vocabulary-English": "to build up",
            Expression: "夢を<b>作り上げる</b>。", "Sentence-English": "Build a dream." },
};
const old: FeedItem = { id: "adam:0", user: "adam", front: "話す", back: "to speak", deck: "Core", ease: 3, ivl: 1, ts: 500 };

beforeEach(() => { localStorage.clear(); cleanup(); });

describe("feed cards with named fields", () => {
  it("show the word and meaning instead of the index number", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" />);
    expect(screen.getByText("作り上げる")).toBeInTheDocument();
    expect(screen.getByText("to build up")).toBeInTheDocument();
    expect(screen.queryByText("5493")).toBeNull();
  });

  it("still show front and back for cards from older publishers", () => {
    render(<Feed items={[old]} people={people} viewer="jp" />);
    expect(screen.getByText("話す")).toBeInTheDocument();
    expect(screen.getByText("to speak")).toBeInTheDocument();
  });

  it("apply the owner's field choice", () => {
    render(<Feed items={[adams]} people={people} viewer="jp"
                 fieldMaps={{ adam: { Core: { meaning: "Sentence-English" } } }} />);
    expect(screen.getByText("Build a dream.")).toBeInTheDocument();
  });
});

describe("sentences", () => {
  it("are hidden until the feed switch is on, and the switch is remembered", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" />);
    expect(screen.queryByTestId("sentence-adam:1")).toBeNull();
    fireEvent.click(screen.getByTestId("filter-sentences"));
    const s = screen.getByTestId("sentence-adam:1");
    expect(s).toHaveTextContent("夢を作り上げる。");
    expect(s.querySelector("b")).toHaveTextContent("作り上げる");
    expect(s).toHaveTextContent("Build a dream.");
    expect(localStorage.getItem("anki-crew:sentences")).toBe("1");

    cleanup();
    render(<Feed items={[adams]} people={people} viewer="jp" />);
    expect(screen.getByTestId("sentence-adam:1")).toBeInTheDocument();
  });

  it("can be flipped on one card without the switch", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" />);
    fireEvent.click(screen.getByTestId("sentence-toggle-adam:1"));
    expect(screen.getByTestId("sentence-adam:1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("sentence-toggle-adam:1"));
    expect(screen.queryByTestId("sentence-adam:1")).toBeNull();
  });

  it("offer no 例 button on a card without a sentence", () => {
    render(<Feed items={[old]} people={people} viewer="jp" />);
    expect(screen.queryByTestId("sentence-toggle-adam:0")).toBeNull();
  });

  it("don't open the thread when tapped", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" apiKey="k" />);
    fireEvent.click(screen.getByTestId("sentence-toggle-adam:1"));
    fireEvent.click(screen.getByTestId("sentence-adam:1"));
    expect(screen.queryByTestId("comment-input-adam:1")).toBeNull();
  });
});

describe("deck badge", () => {
  it.each([
    ["known", "known"], ["learning", "learning"], ["new", "not seen yet"], ["none", "not in your deck"],
  ] as const)("reads %s as '%s'", (status, label) => {
    render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{ "adam:1": status }} />);
    expect(screen.getByTestId("deck-status-adam:1")).toHaveTextContent(label);
  });

  it("is absent when the server sent nothing for the card", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{}} />);
    expect(screen.queryByTestId("deck-status-adam:1")).toBeNull();
  });
});
