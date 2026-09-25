import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { FeedItem, PersonView } from "@/lib/types";

const person: PersonView = {
  profile: { id: "jp", displayName: "JP", tz: "America/New_York", joinedAt: 0 },
  meta: { lastPublishAt: 1, streak: 3, todayKey: "2026-09-21", allTimeReviews: 10, firstReviewAt: 1 },
  days: [],
};

const { getSeen, store } = vi.hoisted(() => ({
  getSeen: vi.fn(async (_id: string) => ({ _floor: 42, "peter:1": 7 })),
  store: {
    feed: [] as FeedItem[],
    fieldMaps: {} as Record<string, Record<string, Record<string, string>>>,
    statuses: null as Record<string, string> | null,
  },
}));

vi.mock("@/lib/store", () => ({
  listUsers: async () => ["jp"],
  getPerson: async (id: string) => (id === "jp" ? person : null),
  getFeed: async () => store.feed,
  getEngagement: async () => ({}),
  getSeen,
  getNoteTypes: async (id: string) => (id === "jp" ? { T: ["Expression", "Meaning"] } : {}),
  getFieldMaps: async (id: string) => store.fieldMaps[id] ?? {},
  getWordStatuses: vi.fn(async (_id: string, words: string[]) =>
    store.statuses === null ? null
      : Object.fromEntries(words.filter((w) => store.statuses![w]).map((w) => [w, store.statuses![w]]))),
}));

import { GET } from "@/app/api/crew/route";

describe("GET /api/crew", () => {
  beforeEach(() => {
    process.env.READ_KEYS = JSON.stringify({ key_jp: "jp" });
    store.feed = [];
    store.fieldMaps = {};
    store.statuses = null;
  });

  it("rejects a missing key", async () => {
    const res = await GET(new Request("https://x.test/api/crew"));
    expect(res.status).toBe(401);
  });

  it("rejects an unknown key", async () => {
    const res = await GET(new Request("https://x.test/api/crew?key=nope"));
    expect(res.status).toBe(401);
  });

  it("returns the crew and names the viewer", async () => {
    const res = await GET(new Request("https://x.test/api/crew?key=key_jp"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.viewer).toBe("jp");
    expect(json.people).toHaveLength(1);
    expect(json.people[0].profile.displayName).toBe("JP");
  });

  it("includes what the viewer has read", async () => {
    const res = await GET(new Request("https://x.test/api/crew?key=key_jp"));
    expect((await res.json()).seen).toEqual({ _floor: 42, "peter:1": 7 });
    expect(getSeen).toHaveBeenCalledWith("jp");
  });

  describe("each person's day", () => {
    afterEach(() => { vi.useRealTimers(); });

    it("moves on to today for someone who hasn't synced since yesterday", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.UTC(2026, 8, 22, 15)); // 11am in New York
      const res = await GET(new Request("https://x.test/api/crew?key=key_jp"));
      expect((await res.json()).people[0].meta.todayKey).toBe("2026-09-22");
    });
  });

  describe("is it in my deck", () => {
    const friend = (id: string, fields: Record<string, string>): FeedItem => ({
      id, user: "adam", front: "5493", back: "", deck: "Core", ease: 3, ivl: 1, ts: 1, noteType: "Core", fields });

    it("marks friends' cards with the viewer's status, and skips the viewer's own", async () => {
      store.statuses = { 話す: "known" };
      store.feed = [
        friend("adam:1", { "Vocabulary-Kanji": "話す" }),
        friend("adam:2", { "Vocabulary-Kanji": "聞く" }),
        { ...friend("jp:1", { Expression: "話す" }), user: "jp" },
        { id: "adam:3", user: "adam", front: "x", back: "", deck: "Core", ease: 3, ivl: 1, ts: 1 },
      ];
      const json = await (await GET(new Request("https://x.test/api/crew?key=key_jp"))).json();
      expect(json.inMyDeck).toEqual({ "adam:1": "known", "adam:2": "none" });
    });

    it("shows no badges at all to a viewer with no index yet", async () => {
      store.feed = [friend("adam:1", { "Vocabulary-Kanji": "話す" })];
      const json = await (await GET(new Request("https://x.test/api/crew?key=key_jp"))).json();
      expect(json.inMyDeck).toEqual({});
    });

    it("gives a sentence card no badge", async () => {
      store.statuses = {};
      store.feed = [friend("adam:1", { Expression: "今日は一人で映画を見ます。とても楽しかった。" })];
      const json = await (await GET(new Request("https://x.test/api/crew?key=key_jp"))).json();
      expect(json.inMyDeck).toEqual({});
    });

    it("reads a friend's card through that friend's own field choices", async () => {
      store.statuses = { 作る: "learning" };
      store.fieldMaps = { adam: { Core: { word: "Odd" } } };
      store.feed = [friend("adam:1", { "Vocabulary-Kanji": "違う", Odd: "作る" })];
      const json = await (await GET(new Request("https://x.test/api/crew?key=key_jp"))).json();
      expect(json.inMyDeck).toEqual({ "adam:1": "learning" });
      expect(json.fieldMaps).toEqual({ jp: {} });
    });

    it("sends the viewer their note types", async () => {
      const json = await (await GET(new Request("https://x.test/api/crew?key=key_jp"))).json();
      expect(json.noteTypes).toEqual({ T: ["Expression", "Meaning"] });
    });
  });
});
