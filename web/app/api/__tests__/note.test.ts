import { describe, it, expect, beforeEach, vi } from "vitest";
import type { CrewNote } from "@/lib/types";

const { notes } = vi.hoisted(() => ({ notes: new Map<string, CrewNote>() }));

vi.mock("@/lib/store", () => ({
  getNote: async (id: string) => notes.get(id) ?? null,
  putNote: async (n: CrewNote) => { notes.set(n.id, n); },
  deleteNote: async (id: string) => { notes.delete(id); },
}));

import { POST, PUT, DELETE } from "@/app/api/note/route";

function req(method: string, body: unknown, key = "key_jp") {
  return new Request(`https://x.test/api/note?key=${key}`, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const peters: CrewNote = { id: "peter:1:ab", user: "peter", text: "peter's", createdAt: 1 };
const mine: CrewNote = { id: "jp:1:cd", user: "jp", text: "mine", createdAt: 1 };

beforeEach(() => {
  notes.clear();
  notes.set(peters.id, peters);
  notes.set(mine.id, mine);
  process.env.READ_KEYS = JSON.stringify({ key_jp: "jp", key_p: "peter" });
});

describe("POST /api/note", () => {
  it("creates a note by the key holder, whatever the body claims", async () => {
    const res = await POST(req("POST", { text: "  で = by means of  ", user: "adam" }));
    expect(res.status).toBe(200);
    const { note } = await res.json();
    expect(note).toMatchObject({ user: "jp", text: "で = by means of" });
    expect(note.id).toMatch(/^jp:\d+:[a-z0-9]{4}$/);
    expect(notes.get(note.id)).toEqual(note);
  });

  it("keeps the card copy", async () => {
    const card = { itemId: "adam:9", word: "一人", meaning: "alone", sentence: "今日は一人で映画を見ます。" };
    const { note } = await (await POST(req("POST", { text: "x", card }))).json();
    expect(note.card).toEqual(card);
  });

  it("rejects a bad body, bad JSON and a bad key", async () => {
    expect((await POST(req("POST", { text: "  " }))).status).toBe(400);
    expect((await POST(req("POST", "{nope"))).status).toBe(400);
    expect((await POST(req("POST", { text: "x" }, "nope"))).status).toBe(401);
    expect(notes.size).toBe(2);
  });
});

describe("PUT /api/note", () => {
  it("edits your own note and stamps editedAt", async () => {
    const res = await PUT(req("PUT", { id: mine.id, text: "better" }));
    expect(res.status).toBe(200);
    const got = notes.get(mine.id)!;
    expect(got.text).toBe("better");
    expect(got.editedAt).toBeGreaterThan(0);
    expect(got.createdAt).toBe(1);
  });

  it("refuses someone else's note, and an unknown one", async () => {
    expect((await PUT(req("PUT", { id: peters.id, text: "hacked" }))).status).toBe(403);
    expect(notes.get(peters.id)!.text).toBe("peter's");
    expect((await PUT(req("PUT", { id: "jp:9:zz", text: "x" }))).status).toBe(404);
  });

  it("never changes the card", async () => {
    notes.set(mine.id, { ...mine, card: { itemId: "a:1", word: "w", meaning: "m" } });
    await PUT(req("PUT", { id: mine.id, text: "t", card: { itemId: "b:2", word: "x", meaning: "y" } }));
    expect(notes.get(mine.id)!.card?.itemId).toBe("a:1");
  });
});

describe("DELETE /api/note", () => {
  it("deletes your own note", async () => {
    expect((await DELETE(req("DELETE", { id: mine.id }))).status).toBe(200);
    expect(notes.has(mine.id)).toBe(false);
  });

  it("refuses someone else's, and 404s an unknown one", async () => {
    expect((await DELETE(req("DELETE", { id: peters.id }))).status).toBe(403);
    expect(notes.has(peters.id)).toBe(true);
    expect((await DELETE(req("DELETE", { id: "nope" }))).status).toBe(404);
    expect((await DELETE(req("DELETE", { id: mine.id }, ""))).status).toBe(401);
  });
});
