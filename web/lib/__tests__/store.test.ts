import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory stand-in for the handful of Redis commands the store uses.
const state = { hashes: new Map<string, Map<string, string>>(),
                strings: new Map<string, unknown>(),
                sets: new Map<string, Set<string>>(),
                lists: new Map<string, string[]>(),
                zsets: new Map<string, Map<string, number>>() };

vi.mock("@upstash/redis", () => ({
  Redis: class {
    async hset(key: string, entries: Record<string, string>) {
      const h = state.hashes.get(key) ?? new Map();
      for (const [f, v] of Object.entries(entries)) h.set(f, v);
      state.hashes.set(key, h);
    }
    async hgetall(key: string) {
      const h = state.hashes.get(key);
      return h ? Object.fromEntries(h) : null;
    }
    async hget(key: string, field: string) {
      return state.hashes.get(key)?.get(field) ?? null;
    }
    async set(key: string, value: unknown) { state.strings.set(key, value); }
    async get(key: string) { return state.strings.get(key) ?? null; }
    async sadd(key: string, member: string) {
      const s = state.sets.get(key) ?? new Set(); s.add(member); state.sets.set(key, s);
    }
    async smembers(key: string) { return [...(state.sets.get(key) ?? [])]; }
    async zadd(key: string, ...entries: { score: number; member: string }[]) {
      const z = state.zsets.get(key) ?? new Map();
      for (const e of entries) z.set(e.member, e.score);
      state.zsets.set(key, z);
    }
    async zrange(key: string, start: number, stop: number, _o?: unknown) {
      const z = [...(state.zsets.get(key) ?? new Map())]
        .sort((a, b) => b[1] - a[1]).map(([m]) => m);
      return z.slice(start, stop === -1 ? undefined : stop + 1);
    }
    async zcard(key: string) { return (state.zsets.get(key) ?? new Map()).size; }
    async zrem(key: string, ...members: string[]) {
      const z = state.zsets.get(key); members.forEach((m) => z?.delete(m));
    }
    async hdel(key: string, field: string) { state.hashes.get(key)?.delete(field); }
    async lpush(key: string, value: string) {
      const l = state.lists.get(key) ?? []; l.unshift(value); state.lists.set(key, l);
    }
    async ltrim(key: string, start: number, stop: number) {
      const l = state.lists.get(key) ?? [];
      state.lists.set(key, l.slice(start, stop === -1 ? undefined : stop + 1));
    }
    async lrange(key: string, start: number, stop: number) {
      const l = state.lists.get(key) ?? [];
      return l.slice(start, stop === -1 ? undefined : stop + 1);
    }
  },
}));

import {
  saveSnapshot, listUsers, getPerson, getFeed, markEngaged, setReaction, addComment,
  getEngagement, setAvatar, getSeen, markSeen, markAllSeen, FEED_CAP, COMMENT_CAP,
} from "@/lib/store";
import type { IngestBody, FeedItem } from "@/lib/types";

function body(over: Partial<IngestBody> = {}): IngestBody {
  return {
    user: "jp", displayName: "JP", tz: "America/New_York",
    generatedAt: 1, todayKey: "2026-09-21", streak: 3,
    days: [{ date: "2026-09-21", reviews: 10, minutes: 5, newCards: 2,
             ease1: 1, ease2: 0, ease3: 8, ease4: 1, perDeck: { Core: 10 } }],
    allTime: { reviews: 100, firstReviewAt: 5 },
    recentCards: [], ...over,
  };
}

function card(id: string, ts: number): FeedItem {
  return { id, user: "jp", front: "話す", back: "to speak", deck: "Core",
           ease: 3, ivl: 1, ts };
}

describe("store", () => {
  beforeEach(() => {
    state.hashes.clear(); state.strings.clear(); state.sets.clear();
    state.zsets.clear(); state.lists.clear();
  });

  it("registers the user and round-trips a snapshot", async () => {
    await saveSnapshot(body());
    expect(await listUsers()).toEqual(["jp"]);
    const person = await getPerson("jp");
    expect(person?.profile.displayName).toBe("JP");
    expect(person?.meta.streak).toBe(3);
    expect(person?.days).toHaveLength(1);
  });

  it("overwrites a day by date instead of duplicating it", async () => {
    await saveSnapshot(body());
    await saveSnapshot(body({ days: [{ date: "2026-09-21", reviews: 99, minutes: 5,
      newCards: 2, ease1: 1, ease2: 0, ease3: 8, ease4: 1, perDeck: { Core: 99 } }] }));
    const person = await getPerson("jp");
    expect(person?.days).toHaveLength(1);
    expect(person?.days[0].reviews).toBe(99);
  });

  it("returns days sorted ascending by date", async () => {
    await saveSnapshot(body({ days: [
      { date: "2026-09-21", reviews: 1, minutes: 1, newCards: 0, ease1: 0, ease2: 0, ease3: 1, ease4: 0, perDeck: {} },
      { date: "2026-09-19", reviews: 1, minutes: 1, newCards: 0, ease1: 0, ease2: 0, ease3: 1, ease4: 0, perDeck: {} },
    ] }));
    expect((await getPerson("jp"))?.days.map((d) => d.date))
      .toEqual(["2026-09-19", "2026-09-21"]);
  });

  it("returns null for an unknown person", async () => {
    expect(await getPerson("nobody")).toBeNull();
  });

  it("returns null for a person with profile but no meta (incomplete publish)", async () => {
    // Simulate an interruption between setting profile and meta
    const profile = { id: "jp", displayName: "JP", tz: "America/New_York", joinedAt: 100 };
    const strings = (state as any).strings;
    strings.set("user:jp:profile", JSON.stringify(profile));
    // Intentionally don't set user:jp:meta
    expect(await getPerson("jp")).toBeNull();
  });

  it("merges feed items newest first", async () => {
    await saveSnapshot(body({ recentCards: [card("jp:1", 1), card("jp:3", 3)] }));
    expect((await getFeed()).map((f) => f.id)).toEqual(["jp:3", "jp:1"]);
  });

  it("re-publishing the same card does not duplicate it", async () => {
    await saveSnapshot(body({ recentCards: [card("jp:1", 1)] }));
    await saveSnapshot(body({ recentCards: [card("jp:1", 1)] }));
    expect(await getFeed()).toHaveLength(1);
  });

  it("survives a day row already in Redis that has no date", async () => {
    // Before the ingest predicate validated day rows, a row without a date was
    // written under the hash field "undefined"; reading it threw on
    // a.date.localeCompare and 500d /api/crew for everyone, with no delete path.
    await saveSnapshot(body());
    state.hashes.get("user:jp:days")!.set("undefined", JSON.stringify({ reviews: 3 }));
    const person = await getPerson("jp");
    expect(person?.days.map((d) => d.date)).toEqual(["2026-09-21"]);
  });

  it("keeps one item per id when the same card was published twice with different content", async () => {
    // "Set Due Date" changes cards.ivl, so the same revlog id republishes with
    // different content. The member differs byte-wise; the id does not.
    await saveSnapshot(body({ recentCards: [card("jp:1", 1)] }));
    await saveSnapshot(body({ recentCards: [{ ...card("jp:1", 2), ivl: 99 }] }));
    const feed = await getFeed();
    expect(feed).toHaveLength(1);
    expect(feed[0].ivl).toBe(99);
  });

  it("trims the feed to the cap", async () => {
    const many = Array.from({ length: FEED_CAP + 20 }, (_, i) => card(`jp:${i}`, i));
    await saveSnapshot(body({ recentCards: many }));
    expect(await getFeed(FEED_CAP + 50)).toHaveLength(FEED_CAP);
  });

  it("never trims an item someone has engaged with", async () => {
    await saveSnapshot(body({ recentCards: [card("jp:0", 0)] }));
    await markEngaged("jp:0");
    const many = Array.from({ length: FEED_CAP + 20 }, (_, i) => card(`jp:${i + 1}`, i + 1));
    await saveSnapshot(body({ recentCards: many }));
    const ids = (await getFeed(FEED_CAP + 50)).map((f) => f.id);
    expect(ids).toContain("jp:0");
  });
});

describe("engagement", () => {
  beforeEach(() => {
    state.hashes.clear(); state.strings.clear(); state.sets.clear();
    state.zsets.clear(); state.lists.clear();
  });

  const comment = (text: string, at: number, user = "peter") => ({ user, text, at });

  it("records a reaction and returns it", async () => {
    await setReaction("jp:1", "peter", "🔥");
    const e = await getEngagement(["jp:1"]);
    expect(e["jp:1"].reactions).toEqual({ peter: "🔥" });
  });

  it("replaces a person's reaction rather than adding a second", async () => {
    await setReaction("jp:1", "peter", "🔥");
    await setReaction("jp:1", "peter", "💀");
    expect((await getEngagement(["jp:1"]))["jp:1"].reactions).toEqual({ peter: "💀" });
  });

  it("clears a reaction when the emoji is null", async () => {
    await setReaction("jp:1", "peter", "🔥");
    await setReaction("jp:1", "peter", null);
    expect(await getEngagement(["jp:1"])).toEqual({});
  });

  it("keeps different people's reactions side by side", async () => {
    await setReaction("jp:1", "peter", "🔥");
    await setReaction("jp:1", "adam", "😂");
    expect((await getEngagement(["jp:1"]))["jp:1"].reactions)
      .toEqual({ peter: "🔥", adam: "😂" });
  });

  it("returns comments oldest first, the way a conversation reads", async () => {
    await addComment("jp:1", comment("second", 200));
    await addComment("jp:1", comment("first", 100));
    expect((await getEngagement(["jp:1"]))["jp:1"].comments.map((c) => c.text))
      .toEqual(["first", "second"]);
  });

  it("caps the number of comments kept on one card", async () => {
    for (let i = 0; i < COMMENT_CAP + 10; i++) await addComment("jp:1", comment(`c${i}`, i));
    expect((await getEngagement(["jp:1"]))["jp:1"].comments).toHaveLength(COMMENT_CAP);
  });

  it("marks a card engaged so the feed cap cannot evict the conversation", async () => {
    await addComment("jp:1", comment("hi", 1));
    expect([...state.sets.get("feed:engaged")!]).toContain("jp:1");
  });

  it("says nothing about cards nobody has touched", async () => {
    await setReaction("jp:1", "peter", "🔥");
    expect(await getEngagement(["jp:2", "jp:3"])).toEqual({});
  });

  it("only looks up ids that are actually in the feed it was asked about", async () => {
    await setReaction("jp:1", "peter", "🔥");
    await setReaction("jp:99", "peter", "😂");
    expect(Object.keys(await getEngagement(["jp:1"]))).toEqual(["jp:1"]);
  });
});

describe("setAvatar", () => {
  beforeEach(() => {
    state.hashes.clear(); state.strings.clear(); state.sets.clear();
    state.zsets.clear(); state.lists.clear();
  });

  it("attaches an image to an existing profile", async () => {
    await saveSnapshot(body());
    expect(await setAvatar("jp", "data:image/webp;base64,AAA")).toBe(true);
    expect((await getPerson("jp"))?.profile.avatar).toBe("data:image/webp;base64,AAA");
  });

  it("refuses a person who has never published", async () => {
    expect(await setAvatar("ghost", "data:image/webp;base64,AAA")).toBe(false);
  });

  it("survives a later publish, which knows nothing about avatars", async () => {
    await saveSnapshot(body());
    await setAvatar("jp", "data:image/webp;base64,AAA");
    await saveSnapshot(body({ displayName: "JP again" }));
    const p = await getPerson("jp");
    expect(p?.profile.avatar).toBe("data:image/webp;base64,AAA");
    expect(p?.profile.displayName).toBe("JP again");
  });
});

describe("read state", () => {
  beforeEach(() => { state.hashes.clear(); });

  it("leaves every comment unread for someone who hasn't read anything, however old", async () => {
    expect(await getSeen("peter")).toEqual({ _floor: 0 });
  });

  it("remembers how far each thread was read", async () => {
    await markSeen("jp", "peter:1", 5000);
    expect((await getSeen("jp"))["peter:1"]).toBe(5000);
  });

  it("never moves a thread backwards, so a stale device can't un-read it", async () => {
    await markSeen("jp", "peter:1", 9000);
    await markSeen("jp", "peter:1", 5000);
    expect((await getSeen("jp"))["peter:1"]).toBe(9000);
  });

  it("keeps each person's read state to themselves", async () => {
    await markSeen("jp", "peter:1", 5000);
    expect((await getSeen("adam"))["peter:1"]).toBeUndefined();
  });

  it("raises the floor when everything is marked read, and never lowers it", async () => {
    const later = 1_800_000_000_000;
    await markAllSeen("jp", later);
    await markAllSeen("jp", later - 1000);
    expect((await getSeen("jp"))._floor).toBe(later);
  });

  it("reads times that Redis hands back as strings", async () => {
    state.hashes.set("seen:jp", new Map([["peter:1", "123"]]));
    expect((await getSeen("jp"))["peter:1"]).toBe(123);
  });
});
