import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const saveSnapshot = vi.fn();
vi.mock("@/lib/store", () => ({ saveSnapshot: (b: unknown) => saveSnapshot(b) }));

import { MAX_DAYS, MAX_RECENT_CARDS, POST } from "@/app/api/ingest/route";

// Vitest runs from web/, so the contract fixture is one level up in publisher/.
// Using cwd rather than __dirname keeps this working under ESM.
const CONTRACT = path.resolve(process.cwd(), "../publisher/tests/contract/payload.sample.json");

// The committed contract fixture, freshly parsed so a test can mangle one field.
function contract(): any {
  return JSON.parse(fs.readFileSync(CONTRACT, "utf-8"));
}

function req(body: unknown, token = "tok_jp") {
  return new Request("https://x.test/api/ingest", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/ingest", () => {
  beforeEach(() => {
    saveSnapshot.mockReset();
    process.env.INGEST_TOKENS = JSON.stringify({ tok_jp: "jp", tok_a: "andy" });
  });

  it("accepts the publisher's real contract payload", async () => {
    const payload = JSON.parse(fs.readFileSync(CONTRACT, "utf-8"));
    const res = await POST(req(payload));
    expect(res.status).toBe(200);
    expect(saveSnapshot).toHaveBeenCalledOnce();
  });

  it("rejects a missing token", async () => {
    const res = await POST(new Request("https://x.test/api/ingest", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it("rejects an unknown token", async () => {
    const res = await POST(req({ user: "jp" }, "nope"));
    expect(res.status).toBe(401);
  });

  it("rejects a token publishing as somebody else", async () => {
    // andy's token must never be able to overwrite jp's numbers.
    const payload = JSON.parse(fs.readFileSync(CONTRACT, "utf-8"));
    const res = await POST(req(payload, "tok_a"));
    expect(res.status).toBe(403);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const res = await POST(new Request("https://x.test/api/ingest", {
      method: "POST", headers: { authorization: "Bearer tok_jp" }, body: "{not json",
    }));
    expect(res.status).toBe(400);
  });

  it("rejects a payload missing required fields", async () => {
    const res = await POST(req({ user: "jp", displayName: "JP" }));
    expect(res.status).toBe(400);
  });

  it("rejects days that are not an array", async () => {
    const res = await POST(req({ ...contract(), days: "lots" }));
    expect(res.status).toBe(400);
  });

  // A day row without a usable date used to be written to Redis under the
  // field name "undefined", after which every /api/crew read threw on
  // a.date.localeCompare and the dashboard 500d for all three viewers.
  it("rejects a day row with no date", async () => {
    const payload = contract();
    delete payload.days[0].date;
    const res = await POST(req(payload));
    expect(res.status).toBe(400);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it("rejects a day row whose date is not YYYY-MM-DD", async () => {
    const payload = contract();
    payload.days[0].date = "21/09/2026";
    expect((await POST(req(payload))).status).toBe(400);
  });

  it("rejects a day row with a non-numeric counter", async () => {
    const payload = contract();
    payload.days[0].reviews = "143";
    expect((await POST(req(payload))).status).toBe(400);
  });

  it("rejects a day row missing a counter entirely", async () => {
    const payload = contract();
    delete payload.days[0].ease4;
    expect((await POST(req(payload))).status).toBe(400);
  });

  it("rejects a non-numeric allTime.reviews", async () => {
    const payload = contract();
    payload.allTime.reviews = null;
    expect((await POST(req(payload))).status).toBe(400);
  });

  it("rejects a non-numeric allTime.firstReviewAt", async () => {
    const payload = contract();
    payload.allTime.firstReviewAt = "yesterday";
    expect((await POST(req(payload))).status).toBe(400);
  });

  it("rejects a feed item without a string id", async () => {
    const payload = contract();
    delete payload.recentCards[0].id;
    expect((await POST(req(payload))).status).toBe(400);
  });

  it("rejects a feed item without a string front", async () => {
    const payload = contract();
    payload.recentCards[0].front = 42;
    expect((await POST(req(payload))).status).toBe(400);
  });

  it("rejects a feed item without a numeric ts", async () => {
    const payload = contract();
    payload.recentCards[0].ts = "now";
    expect((await POST(req(payload))).status).toBe(400);
  });

  it("rejects more days than the cap", async () => {
    const payload = contract();
    const [day] = payload.days;
    payload.days = Array.from({ length: MAX_DAYS + 1 },
      (_, i) => ({ ...day, date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}` }));
    const res = await POST(req(payload));
    expect(res.status).toBe(400);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it("rejects more feed items than the cap", async () => {
    const payload = contract();
    const [item] = payload.recentCards;
    payload.recentCards = Array.from({ length: MAX_RECENT_CARDS + 1 }, (_, i) => ({ ...item, id: `jp:${i}` }));
    const res = await POST(req(payload));
    expect(res.status).toBe(400);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });

  it("accepts a payload from an older publisher with none of the new keys", async () => {
    const payload = contract();
    delete payload.noteTypes; delete payload.words;
    delete payload.recentCards[0].noteType; delete payload.recentCards[0].fields;
    expect((await POST(req(payload))).status).toBe(200);
  });

  it("accepts a publish that left out an unchanged word index", async () => {
    const payload = contract();
    delete payload.words;
    expect((await POST(req(payload))).status).toBe(200);
  });

  // Python truncates field/word values to 200/20 code points; a naive .length
  // check in JS counts UTF-16 units, rejecting non-BMP characters (emoji,
  // rare kanji) well under the real limit.
  it("accepts a field of 200 non-BMP characters, measured in code points", async () => {
    const payload = contract();
    payload.recentCards[0].fields = { A: "😀".repeat(200) };
    expect((await POST(req(payload))).status).toBe(200);
  });

  it("rejects a field of 201 non-BMP characters", async () => {
    const payload = contract();
    payload.recentCards[0].fields = { A: "😀".repeat(201) };
    expect((await POST(req(payload))).status).toBe(400);
  });

  it("accepts a words entry of 20 non-BMP kanji characters", async () => {
    const payload = contract();
    payload.words.new = ["𠮟".repeat(20)];
    expect((await POST(req(payload))).status).toBe(200);
  });

  it("accepts a noteType of 100 non-BMP characters, measured in code points", async () => {
    const payload = contract();
    payload.recentCards[0].noteType = "😀".repeat(100);
    expect((await POST(req(payload))).status).toBe(200);
  });

  it.each([
    ["fields that aren't strings", (p: any) => { p.recentCards[0].fields = { A: 5 }; }],
    ["too many fields", (p: any) => {
      p.recentCards[0].fields = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`F${i}`, "x"])); }],
    ["a field over 200 characters", (p: any) => { p.recentCards[0].fields = { A: "x".repeat(201) }; }],
    ["a note type name that isn't a string", (p: any) => { p.recentCards[0].noteType = 7; }],
    ["noteTypes that aren't lists of names", (p: any) => { p.noteTypes = { T: "Expression" }; }],
    ["too many note types", (p: any) => {
      p.noteTypes = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`T${i}`, []])); }],
    ["a word list missing a status", (p: any) => { p.words = { known: [], learning: [] }; }],
    ["a word over 20 characters", (p: any) => { p.words.new = ["あ".repeat(21)]; }],
    ["too many words", (p: any) => { p.words.new = Array.from({ length: 50001 }, (_, i) => `w${i}`); }],
  ])("rejects %s", async (_name, mangle) => {
    const payload = contract();
    mangle(payload);
    expect((await POST(req(payload))).status).toBe(400);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });
});
