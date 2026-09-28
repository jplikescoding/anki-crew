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
    ["known", "your deck · known"], ["learning", "your deck · learning"],
    ["new", "your deck · unstudied"], ["none", "not in your deck"],
  ] as const)("reads %s as '%s'", (status, label) => {
    render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{ "adam:1": status }} />);
    expect(screen.getByTestId("deck-status-adam:1")).toHaveTextContent(label);
  });

  it("is absent when the server sent nothing for the card", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{}} />);
    expect(screen.queryByTestId("deck-status-adam:1")).toBeNull();
  });
});

describe("deck badge explanation", () => {
  it("shows a colour key on hover, naming the owner and marking this card's row", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{ "adam:1": "new" }} />);
    fireEvent.mouseEnter(screen.getByTestId("deck-status-adam:1"));
    const tip = screen.getByRole("tooltip");
    expect(tip).toHaveTextContent("Adam's word, in your decks");
    for (const word of ["known", "learning", "unstudied", "not in your deck"]) expect(tip).toHaveTextContent(word);
    expect(tip.querySelector('[data-current="true"]')).toHaveTextContent("unstudied");
  });

  it("sits outside the card, so the card's edge can't cut it off", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{ "adam:1": "new" }} />);
    fireEvent.mouseEnter(screen.getByTestId("deck-status-adam:1"));
    const card = screen.getByTestId("deck-status-adam:1").closest("li")!;
    expect(card.contains(screen.getByRole("tooltip"))).toBe(false);
  });
});

describe("vs. my deck filter", () => {
  const second: FeedItem = { ...adams, id: "adam:2" };
  const mine: FeedItem = { ...adams, id: "jp:1", user: "jp" };
  const deck = { "adam:1": "new", "adam:2": "none" } as const;

  it("lists only statuses that have cards, with counts, and filters to them", () => {
    render(<Feed items={[adams, second, mine]} people={people} viewer="jp" inMyDeck={deck} />);
    const select = screen.getByTestId("filter-deck");
    expect([...select.querySelectorAll("option")].map((o) => o.textContent))
      .toEqual(["Friends' cards vs. my deck", "Unstudied (1)", "Not in my deck (1)"]);
    fireEvent.change(select, { target: { value: "none" } });
    expect(screen.queryByTestId("deck-status-adam:1")).toBeNull();
    expect(screen.getByTestId("deck-status-adam:2")).toBeInTheDocument();
  });

  it("names the person when one is picked, and hides on your own cards", () => {
    render(<Feed items={[adams, mine]} people={people} viewer="jp" inMyDeck={deck} />);
    fireEvent.click(screen.getByTestId("chip-adam"));
    expect(screen.getByTestId("filter-deck").querySelector("option")?.textContent).toBe("Adam's cards vs. my deck");
    fireEvent.click(screen.getByTestId("chip-jp"));
    expect(screen.queryByTestId("filter-deck")).toBeNull();
  });

  it("lets go of the deck filter when you switch to your own cards", () => {
    render(<Feed items={[adams, mine]} people={people} viewer="jp" inMyDeck={deck} />);
    fireEvent.change(screen.getByTestId("filter-deck"), { target: { value: "new" } });
    fireEvent.click(screen.getByTestId("chip-jp"));
    expect(screen.queryByTestId("feed-empty")).toBeNull();
  });

  it("sits right after the person chips, not off the end of the bar", () => {
    render(<Feed items={[adams, mine]} people={people} viewer="jp" inMyDeck={deck} />);
    const select = screen.getByTestId("filter-deck");
    const outcome = screen.getByTestId("outcome-all");
    expect(select.compareDocumentPosition(outcome) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("stays out of the way before your deck index exists", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{}} />);
    expect(screen.queryByTestId("filter-deck")).toBeNull();
  });
});

describe("deck colour guide", () => {
  beforeEach(() => localStorage.clear());

  it("shows the key above the feed once badges exist", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{ "adam:1": "new" }} />);
    const guide = screen.getByTestId("deck-legend");
    for (const word of ["known", "learning", "unstudied", "not in your deck"]) expect(guide).toHaveTextContent(word);
  });

  it("stays gone after Don't show this again", () => {
    const { unmount } = render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{ "adam:1": "new" }} />);
    fireEvent.click(screen.getByTestId("deck-legend-dismiss"));
    expect(screen.queryByTestId("deck-legend")).toBeNull();
    unmount();
    render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{ "adam:1": "new" }} />);
    expect(screen.queryByTestId("deck-legend")).toBeNull();
  });

  it("doesn't show before there are any badges", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{}} />);
    expect(screen.queryByTestId("deck-legend")).toBeNull();
  });
});
