import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Feed from "@/app/components/Feed";
import type { CrewNote, FeedItem, PersonView } from "@/lib/types";

function person(id: string, name: string): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/New_York", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-28", allTimeReviews: 0, firstReviewAt: 0 },
    days: [],
  };
}

const people = [person("jp", "JP"), person("adam", "Adam")];
const card: FeedItem = {
  id: "adam:1", user: "adam", front: "5261", back: "", deck: "Core", ease: 3, ivl: 1, ts: Date.now() - 60_000,
  noteType: "Core",
  fields: { "Core-Index": "5261", "Vocabulary-Kanji": "一人", "Vocabulary-English": "alone",
            "Sentence-Expression": "今日は<b>一人</b>で映画を見ます。" },
};
const onCard = (id: string, user: string, createdAt: number): CrewNote =>
  ({ id, user, text: `note ${id}`, createdAt, card: { itemId: "adam:1", word: "一人", meaning: "alone" } });

function view(notes: CrewNote[] = []) {
  const onAddNote = vi.fn();
  render(<Feed items={[card]} people={people} viewer="jp" apiKey="key_jp" notes={notes} onAddNote={onAddNote}
               onEditNote={vi.fn()} onDeleteNote={vi.fn()} />);
  return { onAddNote };
}

describe("notes on feed cards", () => {
  it("shows a bare 📝 on a card with no notes", () => {
    view();
    expect(screen.getByTestId("notes-adam:1")).toHaveTextContent(/^📝$/);
  });

  it("counts the card's notes", () => {
    view([onCard("n1", "adam", 1), onCard("n2", "jp", 2)]);
    expect(screen.getByTestId("notes-adam:1")).toHaveTextContent("📝 2");
  });

  it("opens the card's notes without repeating the card, newest first", () => {
    view([onCard("n1", "adam", 1), onCard("n2", "jp", 2)]);
    fireEvent.click(screen.getByTestId("notes-adam:1"));
    expect(screen.getAllByTestId(/^note-n\d$/).map((el) => el.dataset.testid)).toEqual(["note-n2", "note-n1"]);
    expect(screen.queryByTestId("note-card-n1")).toBeNull();
  });

  it("saves a note with a plain copy of the card as everyone sees it", () => {
    const { onAddNote } = view();
    fireEvent.click(screen.getByTestId("notes-adam:1"));
    fireEvent.change(screen.getByTestId("note-input"), { target: { value: "で = by means of" } });
    fireEvent.click(screen.getByTestId("note-save"));
    expect(onAddNote).toHaveBeenCalledWith("で = by means of", {
      itemId: "adam:1", word: "一人", meaning: "alone", sentence: "今日は一人で映画を見ます。",
    });
  });

  it("toggles closed again", () => {
    view([onCard("n1", "adam", 1)]);
    fireEvent.click(screen.getByTestId("notes-adam:1"));
    fireEvent.click(screen.getByTestId("notes-adam:1"));
    expect(screen.queryByTestId("note-n1")).toBeNull();
  });
});
