import { describe, it, expect } from "vitest";
import {
  MAX_NOTE_CHARS, isPending, newNotesFor, noteCardFrom, notesByCard, parseEdit, parseId, parseNewNote, settleNote,
} from "@/lib/notes";
import type { CrewNote } from "@/lib/types";

function note(id: string, user: string, createdAt: number, over: Partial<CrewNote> = {}): CrewNote {
  return { id, user, text: "hi", createdAt, ...over };
}

describe("parseNewNote", () => {
  it("trims and accepts plain text", () => {
    expect(parseNewNote({ text: "  で = by means of \n" })).toEqual({ text: "で = by means of" });
  });

  it("rejects empty, whitespace-only and non-string text", () => {
    expect(parseNewNote({ text: "" })).toBeNull();
    expect(parseNewNote({ text: " \n\t " })).toBeNull();
    expect(parseNewNote({ text: 5 })).toBeNull();
    expect(parseNewNote(null)).toBeNull();
  });

  it("counts the trimmed length: 1,000 fits even with spaces around it, 1,001 doesn't", () => {
    expect(parseNewNote({ text: `  ${"あ".repeat(MAX_NOTE_CHARS)}  ` })?.text).toHaveLength(1000);
    expect(parseNewNote({ text: "あ".repeat(MAX_NOTE_CHARS + 1) })).toBeNull();
  });

  it("keeps a valid card and drops unknown keys", () => {
    const got = parseNewNote({
      text: "x",
      card: { itemId: "adam:1", word: "一人", meaning: "alone", sentence: "今日は一人で", extra: "no" },
    });
    expect(got).toEqual({ text: "x", card: { itemId: "adam:1", word: "一人", meaning: "alone", sentence: "今日は一人で" } });
  });

  it("allows an empty word but rejects a card over any cap", () => {
    expect(parseNewNote({ text: "x", card: { itemId: "a:1", word: "", meaning: "" } })?.card)
      .toEqual({ itemId: "a:1", word: "", meaning: "" });
    expect(parseNewNote({ text: "x", card: { itemId: "", word: "w", meaning: "" } })).toBeNull();
    expect(parseNewNote({ text: "x", card: { itemId: "a:1", word: "w".repeat(101), meaning: "" } })).toBeNull();
    expect(parseNewNote({ text: "x", card: { itemId: "a:1", word: "w", meaning: "m".repeat(301) } })).toBeNull();
    expect(parseNewNote({ text: "x", card: { itemId: "a:1", word: "w", meaning: "", sentence: "s".repeat(501) } })).toBeNull();
    expect(parseNewNote({ text: "x", card: "a:1" })).toBeNull();
  });
});

describe("parseEdit and parseId", () => {
  it("need a sane id", () => {
    expect(parseEdit({ id: "jp:1:ab", text: " new " })).toEqual({ id: "jp:1:ab", text: "new" });
    expect(parseEdit({ id: "", text: "x" })).toBeNull();
    expect(parseEdit({ id: "x".repeat(129), text: "x" })).toBeNull();
    expect(parseEdit({ id: "jp:1:ab", text: "  " })).toBeNull();
    expect(parseId({ id: "jp:1:ab" })).toEqual({ id: "jp:1:ab" });
    expect(parseId({ id: 3 })).toBeNull();
  });
});

describe("newNotesFor", () => {
  const notes = [note("a", "adam", 300), note("b", "jp", 200), note("c", "peter", 100)];

  it("counts other people's notes after the Notes tab was last opened", () => {
    expect(newNotesFor(notes, "jp", { _notes: 150 }).map((n) => n.id)).toEqual(["a"]);
    expect(newNotesFor(notes, "jp", {}).map((n) => n.id)).toEqual(["a", "c"]);
  });

  it("ignores your own notes, edits, and Mark all read", () => {
    const edited = [note("c", "peter", 100, { editedAt: 999 })];
    expect(newNotesFor(edited, "jp", { _notes: 100 })).toEqual([]);
    expect(newNotesFor(notes, "jp", { _floor: 999 }).map((n) => n.id)).toEqual(["a", "c"]);
  });

  it("is empty with no viewer", () => {
    expect(newNotesFor(notes, null, {})).toEqual([]);
  });
});

describe("notesByCard", () => {
  it("groups card notes, newest first, and skips free-standing ones", () => {
    const byCard = notesByCard([
      note("a", "adam", 100, { card: { itemId: "x:1", word: "w", meaning: "m" } }),
      note("b", "jp", 300, { card: { itemId: "x:1", word: "w", meaning: "m" } }),
      note("c", "jp", 200),
    ]);
    expect(byCard.get("x:1")?.map((n) => n.id)).toEqual(["b", "a"]);
    expect(byCard.size).toBe(1);
  });
});

describe("noteCardFrom", () => {
  it("strips bold and clamps to the server caps so a long card still saves", () => {
    const got = noteCardFrom("adam:1", {
      word: "<b>一人</b>", meaning: "m".repeat(400), sentence: "s".repeat(600),
    });
    expect(got.word).toBe("一人");
    expect(got.meaning).toHaveLength(300);
    expect(got.sentence).toHaveLength(500);
    expect(parseNewNote({ text: "x", card: got })).not.toBeNull();
  });

  it("leaves sentence out when the card has none", () => {
    expect(noteCardFrom("a:1", { word: "w", meaning: "m" })).toEqual({ itemId: "a:1", word: "w", meaning: "m" });
  });
});

describe("settleNote", () => {
  const saved = note("jp:5:ab", "jp", 5);

  it("swaps the temporary note for the saved one", () => {
    expect(settleNote([note("tmp:1", "jp", 1), note("x", "adam", 0)], "tmp:1", saved).map((n) => n.id))
      .toEqual(["jp:5:ab", "x"]);
  });

  it("adds it once when a refresh already dropped the temporary copy", () => {
    expect(settleNote([note("x", "adam", 0)], "tmp:1", saved).map((n) => n.id)).toEqual(["jp:5:ab", "x"]);
  });

  it("doesn't duplicate it when a refresh already brought it back", () => {
    expect(settleNote([saved, note("x", "adam", 0)], "tmp:1", saved).map((n) => n.id)).toEqual(["jp:5:ab", "x"]);
  });
});

describe("isPending", () => {
  it("is true only for temporary ids", () => {
    expect(isPending(note("tmp:1", "jp", 1))).toBe(true);
    expect(isPending(note("jp:1:ab", "jp", 1))).toBe(false);
  });
});
