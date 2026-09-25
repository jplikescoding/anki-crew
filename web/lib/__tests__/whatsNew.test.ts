import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NOTES, markNotesSeen, notesOnArrival, unseenNotes, type Note } from "@/lib/whatsNew";

const KEY = "anki-crew:whatsnew:v1";
const note = (id: string): Note => ({ id, date: id, title: id, items: [id] });
const c = note("c"), b = note("b"), a = note("a");
const notes = [c, b, a]; // newest first

describe("unseenNotes", () => {
  it("shows what came out after the last note you saw, newest first", () => {
    expect(unseenNotes(notes, "a", true)).toEqual([c, b]);
    expect(unseenNotes(notes, "b", false)).toEqual([c]);
  });

  it("shows nothing once you've seen the newest", () => {
    expect(unseenNotes(notes, "c", true)).toEqual([]);
  });

  it("shows nothing for an id it doesn't know, rather than guess", () => {
    expect(unseenNotes(notes, "gone", true)).toEqual([]);
  });

  it("shows only the newest to someone who was here before notes existed", () => {
    expect(unseenNotes(notes, null, true)).toEqual([c]);
  });

  it("shows nothing to someone brand new", () => {
    expect(unseenNotes(notes, null, false)).toEqual([]);
  });

  it("shows nothing when there are no notes", () => {
    expect(unseenNotes([], null, true)).toEqual([]);
    expect(unseenNotes([], "a", true)).toEqual([]);
  });
});

describe("NOTES", () => {
  it("has unique ids", () => {
    expect(new Set(NOTES.map((n) => n.id)).size).toBe(NOTES.length);
  });
});

describe("notesOnArrival", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("marks a newcomer current and shows them nothing, even when asked twice", () => {
    expect(notesOnArrival(false, notes)).toEqual([]);
    expect(localStorage.getItem(KEY)).toBe("c");
    // Strict mode runs mount effects twice.
    expect(notesOnArrival(false, notes)).toEqual([]);
  });

  it("shows a returning person the newest note without storing anything yet", () => {
    expect(notesOnArrival(true, notes)).toEqual([c]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("uses what was stored", () => {
    localStorage.setItem(KEY, "a");
    expect(notesOnArrival(true, notes)).toEqual([c, b]);
  });

  it("shows nothing and doesn't throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(notesOnArrival(false, notes)).toEqual([]);
  });
});

describe("markNotesSeen", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("stores the newest id", () => {
    markNotesSeen(notes);
    expect(localStorage.getItem(KEY)).toBe("c");
  });

  it("does nothing with no notes", () => {
    markNotesSeen([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("doesn't throw when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => markNotesSeen(notes)).not.toThrow();
  });
});
