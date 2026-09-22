import { describe, it, expect, beforeEach, vi } from "vitest";

// In-memory stand-in for the handful of Redis commands the store uses.
const state = { hashes: new Map<string, Map<string, string>>(),
                strings: new Map<string, unknown>(),
                sets: new Map<string, Set<string>>(),
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
  },
}));

import { saveSnapshot, listUsers, getPerson, getFeed, markEngaged, FEED_CAP } from "@/lib/store";
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
    state.hashes.clear(); state.strings.clear(); state.sets.clear(); state.zsets.clear();
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
