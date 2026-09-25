# Feed Navigation & Unread Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make it impossible to lose a comment (server-side per-thread read state, a badge that only clears as threads are opened, "Next unread") and make the feed navigable (filter bar, day headers, paging, back-to-top).

**Architecture:** A per-user Redis hash `seen:<id>` records when each thread was opened, plus a `_floor`. One pure module (`lib/unread.ts`) decides what is unread; the badge and the Feed both use it. Feed filtering/grouping lives in a second pure module (`lib/feedView.ts`). `Feed.tsx` is split so the card markup lives in `FeedCard.tsx` and the bar in `FeedFilters.tsx`, leaving `Feed` to orchestrate state.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, `@upstash/redis`, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-25-feed-navigation-design.md`

## Global Constraints

- All commands run from `web/`. `npm test` = `tsc --noEmit && vitest run`; it must be green at the end of every task (baseline: 13 files, 170 tests).
- No new dependencies.
- Colours only from the "Aurora Glass" tokens in `web/app/globals.css`: rose = miss, jade = got it / caught up, cyan = new/unread. Anything else is grey (`--ink-*`).
- Motion 150–220 ms for interactions; the global `prefers-reduced-motion` rule in `globals.css` already neutralises CSS animation; JS scrolling must use `scrollBehavior()` (Task 8).
- Touch targets on the filter bar ≥ 32 px (`min-h-8`).
- Rollout floor = now − 7 days, set once per user with HSETNX.
- `itemId` accepted by APIs: non-empty string, ≤ 128 chars.
- Page size = 30.
- Comments keep the existing voice: short, explain *why*, no restating code.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A failed "mark read" save must not loop.** If `/api/seen` fails, the page reloads; stale server state must not make the Feed POST again and reload again forever. → `asked` guard test in Task 6, `mergeSeen` test in Task 1 and page test in Task 9.
2. **A refresh landing just after you open a thread must not un-read it.** The server's copy may predate the POST. → `mergeSeen` keeps the max per key (Task 1), page test (Task 9).
3. **Posting `itemId: "_floor"` to `/api/seen` must be rejected** — it would silently mark every comment read. → Task 3 test.
4. **A profile with an unknown/garbage `tz` must not crash the feed.** `Intl.DateTimeFormat` throws `RangeError`. → fallback to UTC, Task 4 test.
5. **Tapping the badge while a person/outcome filter hides the unread card must still land on it.** → jump resets other filters, Task 8 test.

---

### Task 1: Unread rules (`lib/unread.ts`)

**Files:**
- Create: `web/lib/unread.ts`
- Test: `web/lib/__tests__/unread.test.ts`

**Interfaces:**
- Consumes: `Comment`, `Engagement` from `@/lib/types`.
- Produces:
  - `FLOOR = "_floor"`
  - `type SeenMap = Record<string, number>`
  - `readUpTo(seen: SeenMap, itemId: string): number`
  - `isUnread(c: Comment, itemId: string, viewer: string | null, seen: SeenMap): boolean`
  - `unreadCount(engagement: Record<string, Engagement>, viewer: string | null, seen: SeenMap): number`
  - `unreadThreads(engagement: Record<string, Engagement>, viewer: string | null, seen: SeenMap): string[]` — item ids, newest unread comment first
  - `mergeSeen(a: SeenMap, b: SeenMap): SeenMap` — per-key max

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/__tests__/unread.test.ts
import { describe, it, expect } from "vitest";
import {
  FLOOR, isUnread, mergeSeen, readUpTo, unreadCount, unreadThreads,
} from "@/lib/unread";
import type { Engagement } from "@/lib/types";

const c = (user: string, at: number) => ({ user, text: "x", at });
const thread = (...comments: ReturnType<typeof c>[]): Engagement => ({ reactions: {}, comments });

describe("readUpTo", () => {
  it("is the later of the thread's open time and the floor", () => {
    expect(readUpTo({ [FLOOR]: 100, a: 50 }, "a")).toBe(100);
    expect(readUpTo({ [FLOOR]: 100, a: 500 }, "a")).toBe(500);
  });

  it("is zero for someone with no read state at all", () => {
    expect(readUpTo({}, "a")).toBe(0);
  });
});

describe("isUnread", () => {
  const seen = { [FLOOR]: 100, a: 300 };

  it("is true for someone else's comment after you last opened the thread", () => {
    expect(isUnread(c("peter", 301), "a", "jp", seen)).toBe(true);
  });

  it("is false for your own comment", () => {
    expect(isUnread(c("jp", 999), "a", "jp", seen)).toBe(false);
  });

  it("is false at or before the time you opened it", () => {
    expect(isUnread(c("peter", 300), "a", "jp", seen)).toBe(false);
  });

  it("uses the floor for threads you never opened", () => {
    expect(isUnread(c("peter", 99), "b", "jp", seen)).toBe(false);
    expect(isUnread(c("peter", 101), "b", "jp", seen)).toBe(true);
  });

  it("is false when nobody is viewing", () => {
    expect(isUnread(c("peter", 999), "a", null, seen)).toBe(false);
  });
});

describe("unreadCount", () => {
  it("adds up unread comments across every thread", () => {
    const engagement = {
      a: thread(c("peter", 200), c("adam", 250), c("jp", 260)),
      b: thread(c("adam", 50)),
    };
    expect(unreadCount(engagement, "jp", { [FLOOR]: 100 })).toBe(2);
  });
});

describe("unreadThreads", () => {
  it("orders threads by their newest unread comment and skips read ones", () => {
    const engagement = {
      old: thread(c("peter", 200)),
      fresh: thread(c("adam", 900)),
      read: thread(c("adam", 950)),
    };
    const seen = { [FLOOR]: 100, read: 1000 };
    expect(unreadThreads(engagement, "jp", seen)).toEqual(["fresh", "old"]);
  });

  it("ranks by the unread comment, not by your own later reply", () => {
    const engagement = {
      a: thread(c("peter", 200), c("jp", 5000)),
      b: thread(c("adam", 300)),
    };
    expect(unreadThreads(engagement, "jp", { [FLOOR]: 100 })).toEqual(["b", "a"]);
  });
});

describe("mergeSeen", () => {
  it("keeps the later time for each thread and every key from both", () => {
    expect(mergeSeen({ a: 5, b: 9 }, { a: 7, c: 1 })).toEqual({ a: 7, b: 9, c: 1 });
  });

  it("does not let an older server copy un-read a thread you just opened", () => {
    const local = { [FLOOR]: 100, a: 9000 };
    const server = { [FLOOR]: 100 };
    expect(mergeSeen(local, server).a).toBe(9000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/unread.test.ts`
Expected: FAIL — cannot resolve `@/lib/unread`.

- [ ] **Step 3: Write the implementation**

```ts
// web/lib/unread.ts
import type { Comment, Engagement } from "@/lib/types";

/**
 * What you have and haven't read.
 *
 * Read state is per thread, not per visit: a comment stays unread until you
 * open the card it is on. Glancing at the feed reads nothing. That is the whole
 * fix for a comment getting lost behind a badge that cleared too early.
 */

/** Reserved field: comments at or before it count as read everywhere. */
export const FLOOR = "_floor";

/** Card id -> when you last opened its thread, plus FLOOR. */
export type SeenMap = Record<string, number>;

export function readUpTo(seen: SeenMap, itemId: string): number {
  return Math.max(seen[itemId] ?? 0, seen[FLOOR] ?? 0);
}

export function isUnread(c: Comment, itemId: string, viewer: string | null, seen: SeenMap): boolean {
  if (!viewer) return false;
  return c.user !== viewer && c.at > readUpTo(seen, itemId);
}

export function unreadCount(
  engagement: Record<string, Engagement>, viewer: string | null, seen: SeenMap,
): number {
  let n = 0;
  for (const [id, e] of Object.entries(engagement)) {
    n += e.comments.filter((c) => isUnread(c, id, viewer, seen)).length;
  }
  return n;
}

/** Threads with anything unread, the one with the newest unread comment first. */
export function unreadThreads(
  engagement: Record<string, Engagement>, viewer: string | null, seen: SeenMap,
): string[] {
  const newest: [string, number][] = [];
  for (const [id, e] of Object.entries(engagement)) {
    const ats = e.comments.filter((c) => isUnread(c, id, viewer, seen)).map((c) => c.at);
    if (ats.length > 0) newest.push([id, Math.max(...ats)]);
  }
  return newest.sort((x, y) => y[1] - x[1]).map(([id]) => id);
}

/**
 * Local and server read state, combined. Opening a thread is saved in the
 * background, so a refresh can return a copy from before the save landed;
 * taking the later time per thread means that copy can't un-read anything.
 */
export function mergeSeen(a: SeenMap, b: SeenMap): SeenMap {
  const out: SeenMap = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/__tests__/unread.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/unread.ts web/lib/__tests__/unread.test.ts
git commit -m "Decide unread per thread instead of per visit

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Read state in the store

**Files:**
- Modify: `web/lib/store.ts` (key helpers near line 17; new section after `getEngagement`, before the `avatar` divider ~line 166)
- Test: `web/lib/__tests__/store.test.ts` (mock class ~line 13; import ~line 57; new `describe` at end)

**Interfaces:**
- Consumes: `FLOOR`, `SeenMap` from `@/lib/unread` (Task 1).
- Produces:
  - `SEEN_FLOOR_MS = 7 * 24 * 60 * 60 * 1000`
  - `getSeen(userId: string, now?: number): Promise<SeenMap>` — sets `_floor` once, returns numbers
  - `markSeen(userId: string, itemId: string, at: number): Promise<void>`

- [ ] **Step 1: Add `hsetnx` to the in-memory Redis mock**

In `web/lib/__tests__/store.test.ts`, inside the mocked `Redis` class, directly after the `hgetall` method, add:

```ts
    async hsetnx(key: string, field: string, value: unknown) {
      const h = state.hashes.get(key) ?? new Map();
      if (h.has(field)) return 0;
      h.set(field, value as string);
      state.hashes.set(key, h);
      return 1;
    }
```

Add `getSeen, markSeen, SEEN_FLOOR_MS` to the existing `import { … } from "@/lib/store";` list.

- [ ] **Step 2: Write the failing tests** (append to the end of the file)

```ts
describe("read state", () => {
  beforeEach(() => { state.hashes.clear(); });

  it("starts someone new a week back, so recent comments still show as unread", async () => {
    const seen = await getSeen("jp", 1_000_000_000_000);
    expect(seen._floor).toBe(1_000_000_000_000 - SEEN_FLOOR_MS);
  });

  it("sets the floor once and never moves it", async () => {
    await getSeen("jp", 1_000_000_000_000);
    const later = await getSeen("jp", 2_000_000_000_000);
    expect(later._floor).toBe(1_000_000_000_000 - SEEN_FLOOR_MS);
  });

  it("remembers when each thread was opened", async () => {
    await markSeen("jp", "peter:1", 5000);
    expect((await getSeen("jp"))["peter:1"]).toBe(5000);
  });

  it("keeps each person's read state to themselves", async () => {
    await markSeen("jp", "peter:1", 5000);
    expect((await getSeen("adam"))["peter:1"]).toBeUndefined();
  });

  it("reads times that Redis hands back as strings", async () => {
    state.hashes.set("seen:jp", new Map([["_floor", "10"], ["peter:1", "123"]]));
    expect(await getSeen("jp")).toEqual({ _floor: 10, "peter:1": 123 });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run lib/__tests__/store.test.ts`
Expected: FAIL — `getSeen` is not exported.

- [ ] **Step 4: Implement**

In `web/lib/store.ts`:

Add to the imports:

```ts
import { FLOOR, type SeenMap } from "@/lib/unread";
```

After `const metaKey = …` add:

```ts
const seenKey = (id: string) => `seen:${id}`;
```

After `getEngagement` (before the `/* ---… avatar */` divider) add:

```ts
/* ------------------------------------------------------------- read state */

/** How much backlog counts as unread the first time someone's state is made. */
export const SEEN_FLOOR_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * When `userId` last opened each thread. The first call ever lays down a floor
 * a week back: older comments start read, anything newer waits to be opened.
 * HSETNX so two tabs loading at once agree on one floor.
 */
export async function getSeen(userId: string, now = Date.now()): Promise<SeenMap> {
  await redis.hsetnx(seenKey(userId), FLOOR, now - SEEN_FLOOR_MS);
  const raw = (await redis.hgetall<Record<string, unknown>>(seenKey(userId))) ?? {};
  const out: SeenMap = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

export async function markSeen(userId: string, itemId: string, at: number): Promise<void> {
  await redis.hset(seenKey(userId), { [itemId]: at });
}
```

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS (all prior tests + 5 new).

- [ ] **Step 6: Commit**

```bash
git add web/lib/store.ts web/lib/__tests__/store.test.ts
git commit -m "Keep per-thread read state in Redis

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: APIs — `/api/seen`, comment marks read, crew returns `seen`

**Files:**
- Create: `web/app/api/seen/route.ts`
- Modify: `web/app/api/comment/route.ts`, `web/app/api/crew/route.ts`, `web/lib/types.ts:68-72`
- Modify (fixture only): `web/app/__tests__/page.test.tsx` `crew()` helper
- Test: `web/app/api/__tests__/engagement.test.ts`, `web/app/api/__tests__/crew.test.ts`

**Interfaces:**
- Consumes: `getSeen`, `markSeen` (Task 2); `FLOOR` (Task 1).
- Produces:
  - `POST /api/seen?key=…` body `{ itemId }` → `200 { ok: true, at }` | 400 | 401
  - `CrewResponse.seen: Record<string, number>`
  - `/api/comment` now also calls `markSeen(user, itemId, comment.at)`

- [ ] **Step 1: Write the failing tests**

In `web/app/api/__tests__/engagement.test.ts`:

Add a mock fn next to the others and to the `vi.mock` factory:

```ts
const markSeen = vi.fn<AnyFn>();
```

```ts
  markSeen: (...a: unknown[]) => markSeen(...a),
```

Import the new route next to the others:

```ts
import { POST as seen } from "@/app/api/seen/route";
```

Add `markSeen.mockClear();` to the `beforeEach`.

Inside `describe("POST /api/comment", …)` add:

```ts
  it("marks the thread read for whoever posted, so their reply doesn't leave it unread", async () => {
    const res = await comment(req({ itemId: "peter:1", text: "same" }));
    const { comment: stored } = await res.json();
    expect(markSeen).toHaveBeenCalledWith("jp", "peter:1", stored.at);
  });
```

Append:

```ts
describe("POST /api/seen", () => {
  it("records that the key holder opened the thread", async () => {
    const before = Date.now();
    const res = await seen(req({ itemId: "peter:1" }));
    expect(res.status).toBe(200);
    const { at } = await res.json();
    expect(at).toBeGreaterThanOrEqual(before);
    expect(markSeen).toHaveBeenCalledWith("jp", "peter:1", at);
  });

  it("rejects a missing or oversized itemId", async () => {
    expect((await seen(req({}))).status).toBe(400);
    expect((await seen(req({ itemId: "x".repeat(129) }))).status).toBe(400);
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("refuses to move the floor, which would mark every comment read", async () => {
    expect((await seen(req({ itemId: "_floor" }))).status).toBe(400);
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("rejects a missing key", async () => {
    expect((await seen(req({ itemId: "peter:1" }, ""))).status).toBe(401);
  });
});
```

In `web/app/api/__tests__/crew.test.ts`, add to the `vi.mock` factory:

```ts
  getSeen: async (id: string) => (id === "jp" ? { _floor: 42, "peter:1": 7 } : {}),
```

and inside the `describe`:

```ts
  it("includes what the viewer has read", async () => {
    const res = await GET(new Request("https://x.test/api/crew?key=key_jp"));
    expect((await res.json()).seen).toEqual({ _floor: 42, "peter:1": 7 });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/api/__tests__`
Expected: FAIL — `@/app/api/seen/route` missing; crew `seen` undefined; comment test: `markSeen` not called.

- [ ] **Step 3: Implement**

`web/lib/types.ts` — add to `CrewResponse`:

```ts
  /** When the viewer last opened each thread, plus "_floor". See lib/unread. */
  seen: Record<string, number>;
```

`web/app/api/seen/route.ts`:

```ts
import { NextResponse } from "next/server";
import { userForRequest } from "@/lib/identity";
import { markSeen } from "@/lib/store";
import { FLOOR } from "@/lib/unread";

export async function POST(req: Request) {
  const user = userForRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const b = body as { itemId?: unknown };
  // The floor shares the hash with thread ids; letting a client write it would
  // mark every comment read in one request.
  if (typeof b?.itemId !== "string" || b.itemId.length === 0 || b.itemId.length > 128
      || b.itemId === FLOOR) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const at = Date.now();
  await markSeen(user, b.itemId, at);
  return NextResponse.json({ ok: true, at });
}
```

`web/app/api/comment/route.ts` — import `markSeen` alongside `addComment`, and after `await addComment(b.itemId, comment);` add:

```ts
  // Replying means you've read the thread, including anything above your reply.
  await markSeen(user, b.itemId, comment.at);
```

`web/app/api/crew/route.ts` — import `getSeen`, and replace the body construction:

```ts
  const engagement = await getEngagement(feed.map((f) => f.id));
  const seen = await getSeen(viewer);

  const body: CrewResponse = { viewer, people, feed, engagement, seen };
```

`web/app/__tests__/page.test.tsx` — the `crew()` helper's return object gains `seen: {},` (after `engagement,`) so the file still type-checks. Behaviour tests come in Task 9.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/api web/lib/types.ts web/app/__tests__/page.test.tsx
git commit -m "Save when a thread is opened, and send read state with the crew

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Feed view helpers (`lib/feedView.ts`)

**Files:**
- Create: `web/lib/feedView.ts`
- Test: `web/lib/__tests__/feedView.test.ts`

**Interfaces:**
- Consumes: `Engagement`, `FeedItem` from `@/lib/types`.
- Produces:
  - `type Outcome = "all" | "missed" | "got"`
  - `type FeedFilter = { person: string | null; outcome: Outcome; comments: boolean; unread: boolean }`
  - `NO_FILTER: FeedFilter`
  - `isFiltered(f: FeedFilter): boolean`
  - `applyFilter(items: FeedItem[], f: FeedFilter, engagement: Record<string, Engagement>, unreadIds: Set<string>): FeedItem[]`
  - `emptyMessage(f: FeedFilter, personName: string | null): string`
  - `dayKey(ts: number, tz: string): string` — `YYYY-MM-DD`
  - `dayLabel(key: string, now: number, tz: string): string`
  - `type DayGroup = { key: string; label: string; count: number; items: FeedItem[] }`
  - `groupByDay(page: FeedItem[], all: FeedItem[], tz: string, now: number): DayGroup[]`

- [ ] **Step 1: Write the failing test**

```ts
// web/lib/__tests__/feedView.test.ts
import { describe, it, expect } from "vitest";
import {
  applyFilter, dayKey, dayLabel, emptyMessage, groupByDay, isFiltered, NO_FILTER,
} from "@/lib/feedView";
import type { FeedItem } from "@/lib/types";

const NY = "America/New_York";
const NOW = Date.UTC(2026, 8, 25, 16); // Fri 25 Sep 2026, noon in New York

function item(id: string, user: string, ease: number, ts = NOW): FeedItem {
  return { id, user, front: "語", back: "word", deck: "Core", ease, ivl: 1, ts };
}

const items = [
  item("jp:1", "jp", 3),
  item("jp:2", "jp", 1),
  item("adam:1", "adam", 1),
  item("adam:2", "adam", 4),
];
const talk = { "jp:1": { reactions: {}, comments: [{ user: "adam", text: "hi", at: 1 }] } };

describe("applyFilter", () => {
  const ids = (f = NO_FILTER, unread = new Set<string>()) =>
    applyFilter(items, f, talk, unread).map((i) => i.id);

  it("keeps everything with no filter", () => {
    expect(ids()).toEqual(["jp:1", "jp:2", "adam:1", "adam:2"]);
  });

  it("keeps only misses, or only successes", () => {
    expect(ids({ ...NO_FILTER, outcome: "missed" })).toEqual(["jp:2", "adam:1"]);
    expect(ids({ ...NO_FILTER, outcome: "got" })).toEqual(["jp:1", "adam:2"]);
  });

  it("keeps only cards with comments", () => {
    expect(ids({ ...NO_FILTER, comments: true })).toEqual(["jp:1"]);
  });

  it("keeps only the unread set it is given", () => {
    expect(ids({ ...NO_FILTER, unread: true }, new Set(["adam:2"]))).toEqual(["adam:2"]);
  });

  it("combines filters", () => {
    expect(ids({ ...NO_FILTER, person: "adam", outcome: "missed" })).toEqual(["adam:1"]);
  });
});

describe("isFiltered", () => {
  it("is false only for the empty filter", () => {
    expect(isFiltered(NO_FILTER)).toBe(false);
    expect(isFiltered({ ...NO_FILTER, comments: true })).toBe(true);
  });
});

describe("emptyMessage", () => {
  it("names what you filtered for", () => {
    expect(emptyMessage({ ...NO_FILTER, outcome: "missed", person: "adam" }, "Adam"))
      .toBe("No missed cards from Adam yet");
    expect(emptyMessage({ ...NO_FILTER, outcome: "got", comments: true }, null))
      .toBe("No successful cards with comments yet");
    expect(emptyMessage({ ...NO_FILTER, unread: true }, null))
      .toBe("No cards with unread comments yet");
  });
});

describe("dayKey", () => {
  const lateEvening = Date.UTC(2026, 8, 25, 3); // 11pm on the 24th in New York

  it("uses the given time zone's calendar day", () => {
    expect(dayKey(lateEvening, NY)).toBe("2026-09-24");
    expect(dayKey(lateEvening, "UTC")).toBe("2026-09-25");
  });

  it("falls back to UTC for a zone this runtime doesn't know", () => {
    expect(dayKey(lateEvening, "Not/AZone")).toBe("2026-09-25");
  });
});

describe("dayLabel", () => {
  it("says Today and Yesterday, then weekday and date", () => {
    expect(dayLabel("2026-09-25", NOW, NY)).toBe("Today");
    expect(dayLabel("2026-09-24", NOW, NY)).toBe("Yesterday");
    expect(dayLabel("2026-09-21", NOW, NY)).toBe("Mon 21 Sep");
    expect(dayLabel("2025-12-31", NOW, NY)).toBe("Wed 31 Dec");
  });
});

describe("groupByDay", () => {
  const day = 24 * 60 * 60 * 1000;
  const all = [item("a", "jp", 3, NOW), item("b", "jp", 3, NOW - 60_000), item("c", "jp", 3, NOW - day)];

  it("groups newest first and counts the whole day even when only part is shown", () => {
    const groups = groupByDay(all.slice(0, 1), all, NY, NOW);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ key: "2026-09-25", label: "Today", count: 2 });
    expect(groups[0].items.map((i) => i.id)).toEqual(["a"]);
  });

  it("starts a new group when the day changes", () => {
    const groups = groupByDay(all, all, NY, NOW);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([["Today", 2], ["Yesterday", 1]]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run lib/__tests__/feedView.test.ts`
Expected: FAIL — cannot resolve `@/lib/feedView`.

- [ ] **Step 3: Implement**

```ts
// web/lib/feedView.ts
import type { Engagement, FeedItem } from "@/lib/types";

/** Shaping the feed: which cards, and under which day. Pure, so it's testable without a DOM. */

export type Outcome = "all" | "missed" | "got";
export type FeedFilter = { person: string | null; outcome: Outcome; comments: boolean; unread: boolean };
export const NO_FILTER: FeedFilter = { person: null, outcome: "all", comments: false, unread: false };

export function isFiltered(f: FeedFilter): boolean {
  return f.person !== null || f.outcome !== "all" || f.comments || f.unread;
}

/**
 * `unreadIds` is supplied rather than computed so the Feed can keep a card in
 * the Unread list after you've read it, instead of it vanishing mid-scroll.
 */
export function applyFilter(
  items: FeedItem[], f: FeedFilter,
  engagement: Record<string, Engagement>, unreadIds: Set<string>,
): FeedItem[] {
  return items.filter((i) => {
    if (f.person && i.user !== f.person) return false;
    if (f.outcome === "missed" && i.ease !== 1) return false;
    if (f.outcome === "got" && i.ease === 1) return false;
    if (f.comments && !(engagement[i.id]?.comments.length)) return false;
    if (f.unread && !unreadIds.has(i.id)) return false;
    return true;
  });
}

export function emptyMessage(f: FeedFilter, personName: string | null): string {
  const outcome = f.outcome === "missed" ? "missed " : f.outcome === "got" ? "successful " : "";
  const extra = f.unread ? " with unread comments" : f.comments ? " with comments" : "";
  const who = personName ? ` from ${personName}` : "";
  return `No ${outcome}cards${extra}${who} yet`;
}

function dayFormat(tz: string): Intl.DateTimeFormat {
  const opts = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
  try {
    // en-CA formats as YYYY-MM-DD, which also sorts and compares as a string.
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: tz });
  } catch {
    // A zone this runtime doesn't know shouldn't take the feed down with it.
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: "UTC" });
  }
}

export function dayKey(ts: number, tz: string): string {
  return dayFormat(tz).format(ts);
}

export function dayLabel(key: string, now: number, tz: string): string {
  const today = dayKey(now, tz);
  if (key === today) return "Today";
  const y = new Date(`${today}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (key === y.toISOString().slice(0, 10)) return "Yesterday";
  // The key is already a local date; format it as UTC so no zone shifts it again.
  const d = new Date(`${key}T12:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(d);
  return `${part({ weekday: "short" })} ${part({ day: "numeric" })} ${part({ month: "short" })}`;
}

export type DayGroup = { key: string; label: string; count: number; items: FeedItem[] };

/**
 * `page` is what's rendered; `all` is everything the filter matched, so a
 * header says how many cards that day has even before you've paged to them.
 * Both are newest first.
 */
export function groupByDay(page: FeedItem[], all: FeedItem[], tz: string, now: number): DayGroup[] {
  const fmt = dayFormat(tz);
  const counts = new Map<string, number>();
  for (const i of all) {
    const k = fmt.format(i.ts);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const groups: DayGroup[] = [];
  for (const item of page) {
    const k = fmt.format(item.ts);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(item);
    else groups.push({ key: k, label: dayLabel(k, now, tz), count: counts.get(k) ?? 0, items: [item] });
  }
  return groups;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run lib/__tests__/feedView.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add web/lib/feedView.ts web/lib/__tests__/feedView.test.ts
git commit -m "Add feed filtering and day grouping helpers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Extract `FeedCard` from `Feed` (no behaviour change)

`Feed.tsx` is ~290 lines and is about to gain filters, paging, grouping and navigation. The card markup moves out first, unchanged, so the later diffs are about behaviour only.

**Files:**
- Create: `web/app/components/FeedCard.tsx`
- Modify: `web/app/components/Feed.tsx`
- Test: existing `Feed.test.tsx` and `FeedEngagement.test.tsx` must pass unchanged.

**Interfaces:**
- Produces (`FeedCard.tsx`): `EMOJI`, `MAX_COMMENT_CHARS`, `ago(ts, now)` (moved), and default `FeedCard` with props:

```ts
{
  item: FeedItem;
  byId: Map<string, PersonView>;
  indexOf: Map<string, number>;
  engagement?: Engagement;
  viewer?: string | null;
  canWrite: boolean;
  now: number;
  hidden: boolean;              // meaning blurred (quiz)
  onToggleQuiz: () => void;
  open: boolean;                // thread open
  onToggleThread: () => void;
  freshSince: number;           // other people's comments after this are "new"
  draft: string;
  onDraft: (text: string) => void;
  onSubmit: () => void;
  onReact?: (itemId: string, emoji: string | null) => void;
  cardRef?: Ref<HTMLLIElement>;
  footer?: ReactNode;           // under the comment box while open
}
```

- `Feed.tsx` re-exports `EMOJI` and `ago` so `page.tsx`'s `import Feed, { ago } from "@/app/components/Feed"` keeps working.

- [ ] **Step 1: Confirm the baseline**

Run: `npx vitest run app/components`
Expected: PASS.

- [ ] **Step 2: Create `FeedCard.tsx`**

Move, verbatim, from `Feed.tsx`: `EMOJI`, `MAX_COMMENT_CHARS`, `ago()` with its doc comment, and the whole `<li>…</li>` returned inside `shown.map(...)`. Then rewire the few references to Feed state:

```tsx
"use client";
import type { ReactNode, Ref } from "react";
import { Avatar } from "@/app/components/Avatar";
import type { Comment, Engagement, FeedItem, PersonView } from "@/lib/types";

export const EMOJI = ["🔥", "💀", "😂", "👏", "🎌"];
export const MAX_COMMENT_CHARS = 280;

/* ago() — moved here unchanged, doc comment included */

export default function FeedCard({
  item, byId, indexOf, engagement, viewer, canWrite, now, hidden, onToggleQuiz,
  open, onToggleThread, freshSince, draft, onDraft, onSubmit, onReact, cardRef, footer,
}: { /* the props listed above, each with the one-line doc shown there */ }) {
  const lapse = item.ease === 1;
  const who = byId.get(item.user);
  const idx = indexOf.get(item.user) ?? 0;
  const reactions = engagement?.reactions ?? {};
  const comments = engagement?.comments ?? [];
  const mine = viewer ? reactions[viewer] : undefined;
  const isFresh = (c: Comment) => c.at > freshSince && c.user !== viewer;
  const newOnes = comments.filter(isFresh).length;

  // Group the reactions so five people pressing 🔥 reads as one 🔥 ×5.
  const tally = new Map<string, string[]>();
  for (const [uid, emoji] of Object.entries(reactions)) {
    tally.set(emoji, [...(tally.get(emoji) ?? []), byId.get(uid)?.profile.displayName ?? uid]);
  }

  return (
    /* the <li> from Feed, with exactly these substitutions: */
  );
}
```

Substitutions inside the moved `<li>`:

| In Feed.tsx today | In FeedCard |
|---|---|
| `key={item.id}` on the `<li>` | removed (the key goes on `<FeedCard>`) |
| `ref={item.id === firstUnreadId ? unreadRef : undefined}` | `ref={cardRef}` |
| `onClick={() => toggleQuiz(item.id)}` | `onClick={onToggleQuiz}` |
| `onClick={() => setOpenThread(open ? null : item.id)}` | `onClick={onToggleThread}` |
| `const fresh = c.at > unreadSince && c.user !== viewer;` | `const fresh = isFresh(c);` |
| `onChange={(ev) => setDrafts((prev) => ({ ...prev, [item.id]: ev.target.value }))}` | `onChange={(ev) => onDraft(ev.target.value)}` |
| `submit(item.id)` (Enter key and Post button) | `onSubmit()` |
| after the `{canWrite && (…)}` block inside the open thread `<div>` | add `{footer}` |

The variables `hidden`, `open`, `draft`, `now`, `canWrite`, `onReact` come from props under the same names.

- [ ] **Step 3: Slim `Feed.tsx`**

- Delete `EMOJI`, `MAX_COMMENT_CHARS`, `ago` and add after the imports:

```ts
export { EMOJI, ago } from "@/app/components/FeedCard";
```

- Import `FeedCard from "@/app/components/FeedCard"`.
- Replace the body of `<ul className="space-y-2 px-3 pb-6">` with:

```tsx
          {shown.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              byId={byId}
              indexOf={indexOf}
              engagement={engagement[item.id]}
              viewer={viewer}
              canWrite={canWrite}
              now={now}
              hidden={quizzed.has(item.id)}
              onToggleQuiz={() => toggleQuiz(item.id)}
              open={openThread === item.id}
              onToggleThread={() => setOpenThread(openThread === item.id ? null : item.id)}
              freshSince={unreadSince}
              draft={drafts[item.id] ?? ""}
              onDraft={(text) => setDrafts((prev) => ({ ...prev, [item.id]: text }))}
              onSubmit={() => submit(item.id)}
              onReact={onReact}
              cardRef={item.id === firstUnreadId ? unreadRef : undefined}
            />
          ))}
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS with the same count as before this task (no test edits).

- [ ] **Step 5: Commit**

```bash
git add web/app/components/Feed.tsx web/app/components/FeedCard.tsx
git commit -m "Move the feed card into its own component

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Feed reads per-thread state

**Files:**
- Modify: `web/app/components/Feed.tsx`
- Test: `web/app/components/__tests__/FeedEngagement.test.tsx`

**Interfaces:**
- Consumes: `isUnread`, `readUpTo`, `unreadThreads`, `SeenMap` (Task 1); `FeedCard` (Task 5).
- Produces — Feed props change:
  - removed: `unreadSince`
  - added: `seen?: SeenMap`, `onSeen?: (itemId: string) => void`
  - `jumpSignal` kept; now targets the thread with the newest unread comment.

- [ ] **Step 1: Rewrite the unread tests**

In `FeedEngagement.test.tsx`, replace the two tests `"flags comments written since you last looked, but not your own"` and `"says nothing is new when everything predates your last visit"` with the following, and add `act` to the Testing Library import:

```tsx
  it("flags other people's comments you haven't read, but not your own", () => {
    view({
      "peter:1": {
        reactions: {},
        comments: [
          { user: "peter", text: "theirs", at: 5000 },
          { user: "jp", text: "mine", at: 6000 },
        ],
      },
    }, { seen: { _floor: 4000 } });
    expect(screen.getByTestId("thread-peter:1").textContent).toContain("1 new");
  });

  it("says nothing is new once you've opened the thread since", () => {
    view(withComment, { seen: { _floor: 0, "peter:1": 9999 } });
    expect(screen.getByTestId("thread-peter:1").textContent).not.toContain("new");
  });
});

describe("reading a thread", () => {
  const unread = {
    "peter:1": { reactions: {}, comments: [{ user: "peter", text: "hi", at: 5000 }] },
  };
  const base = { items: [card], people, viewer: "jp", apiKey: "key_jp" };

  it("happens when you open it", () => {
    const onSeen = vi.fn();
    render(<Feed {...base} engagement={unread} seen={{ _floor: 1000 }} onSeen={onSeen} />);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    expect(onSeen).toHaveBeenCalledWith("peter:1");
  });

  it("doesn't happen for a thread with nothing unread", () => {
    const onSeen = vi.fn();
    render(<Feed {...base} engagement={unread} seen={{ _floor: 9000 }} onSeen={onSeen} />);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    expect(onSeen).not.toHaveBeenCalled();
  });

  it("isn't asked for twice when the save didn't stick", () => {
    const onSeen = vi.fn();
    const r = render(<Feed {...base} engagement={unread} seen={{ _floor: 1000 }} onSeen={onSeen} />);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    // A reload after a failed save brings back the same stale read state.
    r.rerender(<Feed {...base} engagement={{ ...unread }} seen={{ _floor: 1000 }} onSeen={onSeen} />);
    expect(onSeen).toHaveBeenCalledTimes(1);
  });

  it("happens again when a new comment lands in the thread you have open", () => {
    const onSeen = vi.fn();
    const r = render(<Feed {...base} engagement={unread} seen={{ _floor: 1000 }} onSeen={onSeen} />);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    const more = { "peter:1": { reactions: {}, comments: [
      ...unread["peter:1"].comments, { user: "peter", text: "also", at: 7000 },
    ] } };
    r.rerender(<Feed {...base} engagement={more} seen={{ _floor: 1000, "peter:1": 6000 }} onSeen={onSeen} />);
    expect(onSeen).toHaveBeenCalledTimes(2);
  });

  it("keeps the new pills while you're reading, even after it's marked read", () => {
    const r = render(<Feed {...base} engagement={unread} seen={{ _floor: 1000 }} onSeen={() => {}} />);
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    r.rerender(<Feed {...base} engagement={unread} seen={{ _floor: 1000, "peter:1": 99999 }} onSeen={() => {}} />);
    expect(screen.getByText("new")).toBeInTheDocument();
  });
});
```

(The closing `});` of `describe("comments")` moves up to follow the second rewritten test, as shown.)

In the `"jumping to the first unread comment"` test, change `unreadSince: 1000` to `seen: { _floor: 1000 }`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/components/__tests__/FeedEngagement.test.tsx`
Expected: FAIL — `seen` isn't a Feed prop yet; "1 new" not shown; `onSeen` never called.

- [ ] **Step 3: Implement in `Feed.tsx`**

Imports:

```ts
import { isUnread, readUpTo, unreadThreads, type SeenMap } from "@/lib/unread";
```

Props: remove `unreadSince` (and its doc line) from both the destructuring and the type; add:

```ts
  /** When you last opened each thread, plus the floor. See lib/unread. */
  seen?: SeenMap;
  /** Called when a thread with something unread in it is open. */
  onSeen?: (itemId: string) => void;
  /** Bumping this opens the thread with the newest unread comment. */
  jumpSignal?: number;
```

with defaults `seen = {}` and `onSeen` in the destructuring.

State, after `openThread`:

```ts
  // What counted as read when each thread was opened. Opening one marks it
  // read, and its "new" pills must not vanish while you're reading them.
  const [baseline, setBaseline] = useState<Record<string, number>>({});
```

Refs, after `jumpedFor`:

```ts
  // The newest comment each thread was last marked read for. A save that fails
  // reloads the old read state; without this, that would ask again, fail
  // again, and reload forever.
  const asked = useRef(new Map<string, number>());
```

Replace the `firstUnreadId` `useMemo` with:

```ts
  const me = viewer ?? null;
  const unread = useMemo(() => unreadThreads(engagement, me, seen), [engagement, me, seen]);
  const firstUnreadId = unread[0] ?? null;

  const openThreadFor = (id: string) => {
    setBaseline((prev) => ({ ...prev, [id]: readUpTo(seen, id) }));
    setOpenThread(id);
  };
  const toggleThread = (id: string) => (openThread === id ? setOpenThread(null) : openThreadFor(id));
  const freshSince = (id: string) =>
    !me ? Infinity : openThread === id ? (baseline[id] ?? readUpTo(seen, id)) : readUpTo(seen, id);
```

In the jump effect, replace `if (firstUnreadId) setOpenThread(firstUnreadId);` with `if (firstUnreadId) openThreadFor(firstUnreadId);`.

After the jump effect add:

```ts
  // Having a thread open is reading it, including comments that land while it is.
  useEffect(() => {
    if (!openThread || !onSeen) return;
    const fresh = (engagement[openThread]?.comments ?? [])
      .filter((c) => isUnread(c, openThread, me, seen));
    if (fresh.length === 0) return;
    const newest = Math.max(...fresh.map((c) => c.at));
    if (asked.current.get(openThread) === newest) return;
    asked.current.set(openThread, newest);
    onSeen(openThread);
  }, [openThread, engagement, seen, me, onSeen]);
```

In the `<FeedCard …>` props: `onToggleThread={() => toggleThread(item.id)}` and `freshSince={freshSince(item.id)}`.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: FAIL only in `web/app/page.tsx` type-check (it still passes `unreadSince`). Fix minimally so this task stands alone: in `page.tsx` replace `unreadSince={unreadSince.current}` with `seen={{ _floor: unreadSince.current }}`. (Task 9 replaces this properly.) Re-run `npm test` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/components/Feed.tsx web/app/components/__tests__/FeedEngagement.test.tsx web/app/page.tsx
git commit -m "Mark a thread read when it is opened, not when the feed is

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Filter bar, day headers, paging

**Files:**
- Create: `web/app/components/FeedFilters.tsx`
- Modify: `web/app/components/Feed.tsx`, `web/app/components/FeedCard.tsx` (hint moves to a tooltip), `web/app/globals.css`
- Modify: `docs/superpowers/specs/2026-09-25-feed-navigation-design.md` (two wording fixes, Step 6)
- Test: `web/app/components/__tests__/Feed.test.tsx`

**Interfaces:**
- Consumes: everything in `lib/feedView.ts` (Task 4); `unreadThreads` (Task 1).
- Produces:
  - `FeedFilters` default export, props `{ people: PersonView[]; indexOf: Map<string, number>; filter: FeedFilter; onChange: (f: FeedFilter) => void; unreadCount: number }`
  - `PAGE = 30` exported from `Feed.tsx`
  - test ids: `chip-<user>` (kept), `outcome-all|missed|got`, `filter-comments`, `filter-unread`, `feed-filters`, `day-<YYYY-MM-DD>`, `day-label`, `show-more`, `feed-empty`, `clear-filters`, `caught-up`

- [ ] **Step 1: Write the failing tests** (append to `Feed.test.tsx`; add `within` to the Testing Library import and `Engagement` to the type import)

```tsx
describe("filter bar", () => {
  it("shows only misses, or only successes", () => {
    render(<Feed items={items} people={people} />);
    fireEvent.click(screen.getByTestId("outcome-missed"));
    expect(screen.queryByTestId("item-jp:2")).toBeNull();
    expect(screen.getByTestId("item-andy:1")).toBeTruthy();
    fireEvent.click(screen.getByTestId("outcome-got"));
    expect(screen.getByTestId("item-jp:2")).toBeTruthy();
    expect(screen.queryByTestId("item-andy:1")).toBeNull();
  });

  it("shows only cards with comments", () => {
    const talk: Record<string, Engagement> = {
      "andy:1": { reactions: {}, comments: [{ user: "jp", text: "oof", at: 1 }] },
    };
    render(<Feed items={items} people={people} engagement={talk} viewer="jp" />);
    fireEvent.click(screen.getByTestId("filter-comments"));
    expect(screen.queryByTestId("item-jp:2")).toBeNull();
    expect(screen.getByTestId("item-andy:1")).toBeTruthy();
  });

  it("combines a person with an outcome, and names both when nothing matches", () => {
    render(<Feed items={items} people={people} />);
    fireEvent.click(screen.getByTestId("chip-andy"));
    fireEvent.click(screen.getByTestId("outcome-got"));
    expect(screen.getByTestId("feed-empty")).toHaveTextContent("No successful cards from Andy yet");
    fireEvent.click(screen.getByTestId("clear-filters"));
    expect(screen.getAllByTestId(/^item-/)).toHaveLength(2);
  });
});

describe("the unread filter", () => {
  const talk: Record<string, Engagement> = {
    "andy:1": { reactions: {}, comments: [{ user: "andy", text: "argh", at: 5000 }] },
  };
  const base = { items, people, viewer: "jp", apiKey: "key_jp", onSeen: () => {} };

  it("shows only threads you haven't read", () => {
    render(<Feed {...base} engagement={talk} seen={{ _floor: 1000 }} />);
    fireEvent.click(screen.getByTestId("filter-unread"));
    expect(screen.queryByTestId("item-jp:2")).toBeNull();
    expect(screen.getByTestId("item-andy:1")).toBeTruthy();
  });

  it("keeps a card listed after you read it, until you switch the filter off", () => {
    const r = render(<Feed {...base} engagement={talk} seen={{ _floor: 1000 }} />);
    fireEvent.click(screen.getByTestId("filter-unread"));
    r.rerender(<Feed {...base} engagement={talk} seen={{ _floor: 1000, "andy:1": 9000 }} />);
    expect(screen.getByTestId("item-andy:1")).toBeTruthy();
    expect(screen.getByTestId("caught-up")).toHaveTextContent("All caught up");

    fireEvent.click(screen.getByTestId("filter-unread"));
    fireEvent.click(screen.getByTestId("filter-unread"));
    expect(screen.queryByTestId("item-andy:1")).toBeNull();
    expect(screen.getByTestId("caught-up")).toBeTruthy();
    expect(screen.queryByTestId("feed-empty")).toBeNull();
  });
});

describe("day headers", () => {
  it("group cards under Today in the viewer's time zone, with a count", () => {
    const now = Date.now();
    const today = [
      { ...items[0], id: "jp:10", ts: now - 1000 },
      { ...items[0], id: "jp:11", ts: now - 2000 },
    ];
    render(<Feed items={today} people={people} viewer="jp" />);
    const labels = screen.getAllByTestId("day-label").map((n) => n.textContent);
    expect(labels[0]).toBe("Today");
    expect(screen.getAllByTestId(/^day-\d/)[0]).toHaveTextContent("· 2");
  });
});

describe("paging", () => {
  const many = Array.from({ length: 45 }, (_, i) => ({
    ...items[0], id: `jp:${100 - i}`, ts: 100_000 - i, ease: i % 2 ? 1 : 3,
  }));

  it("renders 30, then 30 more at a time", () => {
    render(<Feed items={many} people={people} />);
    expect(screen.getAllByTestId(/^item-/)).toHaveLength(30);
    expect(screen.getByTestId("show-more")).toHaveTextContent("Show 15 more · 15 left");
    fireEvent.click(screen.getByTestId("show-more"));
    expect(screen.getAllByTestId(/^item-/)).toHaveLength(45);
    expect(screen.queryByTestId("show-more")).toBeNull();
  });

  it("goes back to 30 when a filter changes", () => {
    render(<Feed items={many} people={people} />);
    fireEvent.click(screen.getByTestId("show-more"));
    fireEvent.click(screen.getByTestId("outcome-got"));
    fireEvent.click(screen.getByTestId("outcome-all"));
    expect(screen.getAllByTestId(/^item-/)).toHaveLength(30);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/components/__tests__/Feed.test.tsx`
Expected: FAIL — `outcome-missed` etc. not found.

- [ ] **Step 3: Create `FeedFilters.tsx`**

```tsx
"use client";
import type { ReactNode } from "react";
import { Avatar } from "@/app/components/Avatar";
import type { FeedFilter, Outcome } from "@/lib/feedView";
import type { PersonView } from "@/lib/types";

// Rose and jade already mean "missed" and "got it" everywhere else in the app.
const OUTCOMES: [Outcome, string, string][] = [
  ["all", "All", "var(--ink)"],
  ["missed", "Missed", "var(--rose)"],
  ["got", "Got it", "var(--jade)"],
];

function Toggle({ testid, on, onClick, children }: {
  testid: string; on: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      data-testid={testid}
      aria-pressed={on}
      onClick={onClick}
      className="inline-flex min-h-8 shrink-0 items-center rounded-full border px-3 text-[11.5px] transition-colors duration-150"
      style={{
        borderColor: on ? "var(--edge-lit)" : "var(--edge)",
        background: on ? "var(--pane-lift)" : "transparent",
        color: on ? "var(--ink)" : "var(--ink-dim)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Pinned under the header so the feed can be re-sliced from anywhere in it,
 * not just from the top.
 */
export default function FeedFilters({ people, indexOf, filter, onChange, unreadCount }: {
  people: PersonView[];
  indexOf: Map<string, number>;
  filter: FeedFilter;
  onChange: (f: FeedFilter) => void;
  /** Threads with something unread. */
  unreadCount: number;
}) {
  const set = (patch: Partial<FeedFilter>) => onChange({ ...filter, ...patch });

  return (
    <div
      data-testid="feed-filters"
      className="sticky top-0 z-30 border-b backdrop-blur-md"
      style={{ background: "rgba(7,9,18,.74)", borderColor: "var(--edge)" }}
    >
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 py-2.5">
        {people.map((p) => {
          const on = filter.person === p.profile.id;
          return (
            <button
              key={p.profile.id}
              data-testid={`chip-${p.profile.id}`}
              aria-pressed={on}
              onClick={() => set({ person: on ? null : p.profile.id })}
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] transition-colors duration-150"
              style={{
                borderColor: on ? "var(--edge-lit)" : "var(--edge)",
                background: on ? "var(--pane-lift)" : "transparent",
                color: on ? "var(--ink)" : "var(--ink-dim)",
              }}
            >
              <Avatar profile={p.profile} size={16} index={indexOf.get(p.profile.id) ?? 0} />
              {p.profile.displayName}
            </button>
          );
        })}

        <span aria-hidden className="h-4 w-px shrink-0" style={{ background: "var(--edge)" }} />

        <div role="group" aria-label="Outcome"
             className="flex shrink-0 rounded-full border p-0.5" style={{ borderColor: "var(--edge)" }}>
          {OUTCOMES.map(([value, label, color]) => {
            const on = filter.outcome === value;
            return (
              <button
                key={value}
                data-testid={`outcome-${value}`}
                aria-pressed={on}
                onClick={() => set({ outcome: value })}
                className="min-h-7 rounded-full px-2.5 text-[11.5px] transition-colors duration-150"
                style={{
                  background: on ? "var(--pane-lift)" : "transparent",
                  color: on ? color : "var(--ink-faint)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <Toggle testid="filter-comments" on={filter.comments}
                onClick={() => set({ comments: !filter.comments })}>
          💬&nbsp;Comments
        </Toggle>
        <Toggle testid="filter-unread" on={filter.unread}
                onClick={() => set({ unread: !filter.unread })}>
          Unread
          {unreadCount > 0 && (
            <span
              className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums"
              style={{ background: "var(--cyan)", color: "#04121A" }}
            >
              {unreadCount}
            </span>
          )}
        </Toggle>
      </div>
    </div>
  );
}
```

Add to `web/app/globals.css` after the `.pane` rule:

```css
/* A row that scrolls sideways on a phone shouldn't show a scrollbar doing it. */
.no-scrollbar { scrollbar-width: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }
```

- [ ] **Step 4: Rework `Feed.tsx`**

Imports become:

```ts
import { useEffect, useMemo, useRef, useState } from "react";
import FeedCard from "@/app/components/FeedCard";
import FeedFilters from "@/app/components/FeedFilters";
import {
  applyFilter, emptyMessage, groupByDay, isFiltered, NO_FILTER, type FeedFilter,
} from "@/lib/feedView";
import { isUnread, readUpTo, unreadThreads, type SeenMap } from "@/lib/unread";
import type { Engagement, FeedItem, PersonView } from "@/lib/types";

export { EMOJI, ago } from "@/app/components/FeedCard";

/** Cards rendered per step. Five hundred at once is a scroll, not a feed. */
export const PAGE = 30;
```

(`Avatar` is no longer imported by Feed; the chips moved to `FeedFilters`.)

Replace `const [only, setOnly] = useState<string | null>(null);` with:

```ts
  const [filter, setFilter] = useState<FeedFilter>(NO_FILTER);
  const [limit, setLimit] = useState(PAGE);
  // Every thread that has been unread while the Unread filter is on. Reading
  // one must not pull it out from under you mid-list.
  const [pinned, setPinned] = useState<Set<string>>(new Set());
```

Replace `const shown = only ? items.filter((i) => i.user === only) : items;` — delete it, and after the `unread`/`firstUnreadId` lines add:

```ts
  const tz = (me && byId.get(me)?.profile.tz) || "UTC";

  useEffect(() => {
    if (!filter.unread) return;
    setPinned((prev) => (unread.every((id) => prev.has(id)) ? prev : new Set([...prev, ...unread])));
  }, [filter.unread, unread]);

  const unreadIds = useMemo(() => new Set([...pinned, ...unread]), [pinned, unread]);
  const shown = useMemo(
    () => applyFilter(items, filter, engagement, unreadIds),
    [items, filter, engagement, unreadIds]);
  const groups = groupByDay(shown.slice(0, limit), shown, tz, now);
  const caughtUp = filter.unread && unread.length === 0;
  const personName = filter.person
    ? byId.get(filter.person)?.profile.displayName ?? filter.person
    : null;

  const changeFilter = (next: FeedFilter) => {
    setFilter(next);
    setLimit(PAGE);
    if (!next.unread) setPinned(new Set());
  };
```

Replace the whole returned JSX with:

```tsx
  return (
    <div>
      <FeedFilters
        people={people}
        indexOf={indexOf}
        filter={filter}
        onChange={changeFilter}
        unreadCount={unread.length}
      />

      {caughtUp && (
        <p
          data-testid="caught-up"
          className="lane-enter mx-3 mt-3 rounded-[var(--r-lane)] border px-4 py-2.5 text-center text-[12px]"
          style={{ borderColor: "rgba(52,211,153,.28)", background: "rgba(52,211,153,.07)", color: "var(--jade)" }}
        >
          All caught up ✓
        </p>
      )}

      {shown.length === 0 ? (
        caughtUp ? null : isFiltered(filter) ? (
          <div data-testid="feed-empty" className="px-6 py-16 text-center">
            <p className="text-[14px]" style={{ color: "var(--ink-dim)" }}>{emptyMessage(filter, personName)}</p>
            <button
              data-testid="clear-filters"
              onClick={() => changeFilter(NO_FILTER)}
              className="mt-2 min-h-8 text-[12px]"
              style={{ color: "var(--cyan-soft)" }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div data-testid="feed-empty" className="px-6 py-16 text-center">
            <p className="text-[15px]" style={{ color: "var(--ink-dim)" }}>No cards yet.</p>
            <p className="mx-auto mt-2 max-w-sm text-[13px]" style={{ color: "var(--ink-faint)" }}>
              Whatever any of you reviews next shows up here, in whatever deck it came from.
            </p>
          </div>
        )
      ) : (
        <div className="px-3 pb-6">
          {groups.map((g) => (
            <section key={g.key} data-testid={`day-${g.key}`}>
              <h3
                className="flex items-baseline gap-1.5 px-1.5 pb-2 pt-4 text-[10.5px] font-semibold uppercase tracking-[.09em]"
                style={{ color: "var(--ink-faint)" }}
              >
                <span data-testid="day-label">{g.label}</span>
                <span className="font-normal tabular-nums" style={{ color: "var(--ink-ghost)" }}>· {g.count}</span>
              </h3>
              <ul className="space-y-2">
                {g.items.map((item) => (
                  <FeedCard
                    key={item.id}
                    /* …every prop exactly as after Task 6… */
                  />
                ))}
              </ul>
            </section>
          ))}
          {shown.length > limit && (
            <button
              data-testid="show-more"
              onClick={() => setLimit((l) => l + PAGE)}
              className="pane mt-3 min-h-10 w-full text-[12px] transition-colors duration-150 hover:bg-[var(--pane-lift)]"
              style={{ color: "var(--ink-dim)" }}
            >
              Show {Math.min(PAGE, shown.length - limit)} more · {shown.length - limit} left
            </button>
          )}
        </div>
      )}
    </div>
  );
```

`<FeedCard>` props are unchanged from Task 6 (write them out in full — `key`, `item`, `byId`, `indexOf`, `engagement={engagement[item.id]}`, `viewer`, `canWrite`, `now`, `hidden`, `onToggleQuiz`, `open`, `onToggleThread`, `freshSince`, `draft`, `onDraft`, `onSubmit`, `onReact`, `cardRef`).

The "tap a word to hide the meaning" line was in the removed chip row. In `FeedCard.tsx` add `title="Tap to hide the meaning"` to the word `<button>` so the hint survives as a tooltip.

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS. Existing chip tests pass unchanged (same test ids and behaviour).

- [ ] **Step 6: Align the spec with two small deviations**

In the spec, §5 last bullet: replace "the "tap a word to hide the meaning" hint moves to the empty/first-load state only" with "the "tap a word to hide the meaning" hint becomes a tooltip on the word". In §4 **All caught up**: replace "the badge animates out and the Unread filter shows" with "the badge counts down to nothing and the Unread filter shows".

- [ ] **Step 7: Commit**

```bash
git add web/app/components web/app/globals.css docs/superpowers/specs/2026-09-25-feed-navigation-design.md
git commit -m "Filter the feed, group it by day, and page it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Getting around — jump, Next unread, back to top

**Files:**
- Create: `web/app/components/BackToTop.tsx`
- Modify: `web/app/components/Feed.tsx`, `web/app/components/FeedCard.tsx`, `web/app/globals.css`
- Test: `web/app/components/__tests__/FeedNavigation.test.tsx` (new), `web/app/components/__tests__/FeedEngagement.test.tsx` (jump test stays green)

**Interfaces:**
- Consumes: Feed state from Task 7.
- Produces:
  - `BackToTop.tsx`: `scrollBehavior(): ScrollBehavior`, `scrollToTop(): void`, default `BackToTop` (test id `back-to-top`)
  - `FeedCard` gains `arrived?: boolean` (adds `card-arrive` class)
  - test id `next-unread`; keys `n` (next unread), `g` (top)

- [ ] **Step 1: Write the failing tests**

```tsx
// web/app/components/__tests__/FeedNavigation.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Feed from "@/app/components/Feed";
import type { Engagement, FeedItem, PersonView } from "@/lib/types";

function person(id: string, name: string): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/New_York", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-25", allTimeReviews: 0, firstReviewAt: 0 },
    days: [],
  };
}
const people = [person("jp", "JP"), person("adam", "Adam")];

const cards: FeedItem[] = Array.from({ length: 45 }, (_, i) => ({
  id: `adam:${i}`, user: "adam", front: `語${i}`, back: "word", deck: "Core",
  ease: 3, ivl: 1, ts: 1_000_000 - i,
}));

const say = (at: number, user = "adam") => ({ reactions: {}, comments: [{ user, text: "hey", at }] });
const base = { items: cards, people, viewer: "jp", apiKey: "key_jp", onSeen: () => {}, seen: { _floor: 100 } };

afterEach(() => vi.restoreAllMocks());

describe("tapping the badge", () => {
  it("switches on Unread and opens the thread with the newest comment", () => {
    const engagement: Record<string, Engagement> = { "adam:3": say(500), "adam:7": say(900) };
    render(<Feed {...base} engagement={engagement} jumpSignal={1} />);
    expect(screen.getByTestId("filter-unread")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("comment-input-adam:7")).toBeInTheDocument();
  });

  it("clears filters that would hide the card it's taking you to", () => {
    const engagement = { "adam:3": say(500) };
    const r = render(<Feed {...base} engagement={engagement} jumpSignal={0} />);
    fireEvent.click(screen.getByTestId("chip-jp"));
    fireEvent.click(screen.getByTestId("outcome-missed"));
    r.rerender(<Feed {...base} engagement={engagement} jumpSignal={1} />);
    expect(screen.getByTestId("chip-jp")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("outcome-all")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("comment-input-adam:3")).toBeInTheDocument();
  });
});

describe("Next unread", () => {
  const engagement: Record<string, Engagement> = { "adam:0": say(900), "adam:40": say(500) };

  it("goes to the next unread thread, even one you haven't paged down to", () => {
    render(<Feed {...base} engagement={engagement} />);
    fireEvent.click(screen.getByTestId("thread-adam:0"));
    fireEvent.click(screen.getByTestId("next-unread"));
    expect(screen.getByTestId("comment-input-adam:40")).toBeInTheDocument();
  });

  it("isn't offered when there's nothing else unread", () => {
    render(<Feed {...base} engagement={{ "adam:0": say(900) }} />);
    fireEvent.click(screen.getByTestId("thread-adam:0"));
    expect(screen.queryByTestId("next-unread")).toBeNull();
  });

  it("is the n key, which leaves you alone while you type", () => {
    render(<Feed {...base} engagement={engagement} />);
    fireEvent.click(screen.getByTestId("thread-adam:0"));
    fireEvent.keyDown(screen.getByTestId("comment-input-adam:0"), { key: "n" });
    expect(screen.queryByTestId("comment-input-adam:40")).toBeNull();
    fireEvent.keyDown(window, { key: "n" });
    expect(screen.getByTestId("comment-input-adam:40")).toBeInTheDocument();
  });
});

describe("back to top", () => {
  it("appears once you've scrolled a screen down, and takes you up", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<Feed {...base} engagement={{}} />);
    const button = screen.getByTestId("back-to-top");
    expect(button).toHaveAttribute("aria-hidden", "true");

    Object.defineProperty(window, "scrollY", { value: window.innerHeight * 2, configurable: true });
    act(() => { window.dispatchEvent(new Event("scroll")); });
    expect(button).toHaveAttribute("aria-hidden", "false");

    fireEvent.click(button);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });

  it("is the g key", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    render(<Feed {...base} engagement={{}} />);
    fireEvent.keyDown(window, { key: "g" });
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/components/__tests__/FeedNavigation.test.tsx`
Expected: FAIL — Unread not switched on by the jump; `next-unread` and `back-to-top` not found.

- [ ] **Step 3: Create `BackToTop.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";

/** Smooth unless the person has asked their system for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

/** Out of the way until you're a screen down, which is when you'd want it. */
export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      data-testid="back-to-top"
      aria-label="Back to top"
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      onClick={scrollToTop}
      className="fixed bottom-5 right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border text-[16px] backdrop-blur-md transition-all duration-200"
      style={{
        borderColor: "var(--edge-lit)",
        background: "rgba(18,23,42,.78)",
        color: "var(--ink)",
        opacity: show ? 1 : 0,
        transform: show ? "none" : "translateY(8px)",
        pointerEvents: show ? "auto" : "none",
      }}
    >
      ↑
    </button>
  );
}
```

- [ ] **Step 4: Wire navigation into `Feed.tsx`**

Import `BackToTop, { scrollBehavior, scrollToTop } from "@/app/components/BackToTop"`.

Replace `const unreadRef = useRef<HTMLLIElement | null>(null);` with:

```ts
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  // The card to bring into view once it's rendered.
  const [target, setTarget] = useState<string | null>(null);
  // The card you were just taken to, which glows once as it arrives.
  const [arrived, setArrived] = useState<string | null>(null);
```

After `changeFilter`, add:

```ts
  const goTo = (id: string) => {
    openThreadFor(id);
    setTarget(id);
  };

  const shownIds = new Set(shown.map((i) => i.id));
  // Newest unread first, among what the current filters show.
  const nextUnread = unread.find((id) => id !== openThread && shownIds.has(id)) ?? null;
```

Replace the existing jump effect with these two:

```ts
  // Scroll once the card is rendered, growing the page first if it's further down.
  useEffect(() => {
    if (!target) return;
    const idx = shown.findIndex((i) => i.id === target);
    if (idx < 0) { setTarget(null); return; }
    if (idx >= limit) { setLimit(Math.ceil((idx + 1) / PAGE) * PAGE); return; }
    cardRefs.current.get(target)?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    setArrived(target);
    setTarget(null);
  }, [target, shown, limit]);

  // Once per bump: a refresh that brings in newer comments must not drag you
  // away from whatever you are reading. Other filters are dropped because
  // they could hide the very card the badge is pointing at.
  useEffect(() => {
    if (jumpSignal === 0 || jumpSignal === jumpedFor.current) return;
    jumpedFor.current = jumpSignal;
    changeFilter({ ...NO_FILTER, unread: true });
    if (firstUnreadId) goTo(firstUnreadId);
  }, [jumpSignal, firstUnreadId]);

  // Re-bound every render so it always sees the current next thread.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === "n" && nextUnread) goTo(nextUnread);
      else if (k === "g") scrollToTop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
```

On `<FeedCard>` replace the `cardRef` prop and add two props:

```tsx
                    cardRef={(el) => {
                      if (el) cardRefs.current.set(item.id, el);
                      else cardRefs.current.delete(item.id);
                    }}
                    arrived={arrived === item.id}
                    footer={openThread === item.id && nextUnread ? (
                      <button
                        data-testid="next-unread"
                        onClick={() => goTo(nextUnread)}
                        className="mt-2.5 inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-[11.5px] transition-colors duration-150"
                        style={{ borderColor: "rgba(34,211,238,.3)", background: "rgba(34,211,238,.06)", color: "var(--cyan-soft)" }}
                      >
                        Next unread <span aria-hidden>→</span>
                      </button>
                    ) : undefined}
```

Render `<BackToTop />` as the last child of the outer `<div>`.

In `FeedCard.tsx`, add the prop `arrived?: boolean` (doc: `/** Just navigated to; glows once. */`) and change the `<li>` class to:

```tsx
className={`pane overflow-hidden${arrived ? " card-arrive" : ""}`}
```

In `globals.css`, after `.lane-enter`:

```css
/* The card you were taken to glows once as it lands, so the eye finds it. */
@keyframes card-arrive {
  from { box-shadow: 0 0 0 1px rgba(103,232,249,.45), 0 0 26px rgba(103,232,249,.16); }
  to   { box-shadow: 0 0 0 1px transparent, 0 0 0 transparent; }
}
.card-arrive { animation: card-arrive 900ms cubic-bezier(.22,.8,.3,1) 1; }
```

- [ ] **Step 5: Run the suite**

Run: `npm test`
Expected: PASS, including the existing `"jumping to the first unread comment … happens once per request"` test.

- [ ] **Step 6: Commit**

```bash
git add web/app/components web/app/globals.css
git commit -m "Walk through unread threads, and get back to the top

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Page — server read state drives the badge

**Files:**
- Modify: `web/app/page.tsx`, `web/lib/seen.ts`, `web/app/globals.css`
- Test: `web/app/__tests__/page.test.tsx`

**Interfaces:**
- Consumes: `mergeSeen`, `unreadCount`, `SeenMap` (Task 1); Feed props `seen`, `onSeen`, `jumpSignal` (Tasks 6/8); `POST /api/seen` (Task 3).
- Produces: final wiring; `Seen.commentsSeenAt` removed.

- [ ] **Step 1: Rewrite the page tests**

In `page.test.tsx`, give `crew()` a third parameter and use it:

```ts
function crew(
  engagement: Record<string, Engagement> = {},
  jpPublishedAt = Date.now(),
  seen: Record<string, number> = {},
): CrewResponse {
  return {
    viewer: "jp",
    people: [person("jp", "JP", 10, jpPublishedAt), person("peter", "Peter", 5)],
    feed: [card],
    engagement,
    seen,
  };
}
```

Replace the whole `describe("unread comments", …)` block with:

```tsx
describe("unread comments", () => {
  const banter = { "peter:1": { reactions: {}, comments: [{ user: "peter", text: "nice", at: 5000 }] } };
  const unreadCrew = () => ok(crew(banter, Date.now(), { _floor: 1000 }));
  const seenCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/seen"));

  it("counts what the server says you haven't read", async () => {
    crewReplies.push(unreadCrew());
    await mount();
    expect(screen.getByTestId("unread-badge")).toHaveTextContent("1");
  });

  it("don't clear just because you looked at the feed", async () => {
    crewReplies.push(unreadCrew());
    await mount();
    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByTestId("unread-badge")).toHaveTextContent("1");
    expect(seenCalls()).toHaveLength(0);
  });

  it("clear when you open the thread, and tell the server", async () => {
    crewReplies.push(unreadCrew());
    await mount();
    fireEvent.keyDown(window, { key: "2" });
    await act(async () => { fireEvent.click(screen.getByTestId("thread-peter:1")); });
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
    expect(JSON.parse(seenCalls()[0][1].body)).toEqual({ itemId: "peter:1" });
  });

  it("open the Unread filter at the newest thread when you tap the badge", async () => {
    crewReplies.push(unreadCrew());
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^feed/ })); });
    expect(screen.getByTestId("filter-unread")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("comment-input-peter:1")).toBeInTheDocument();
  });

  it("stay read when a refresh returns read state from before you opened it", async () => {
    crewReplies.push(unreadCrew(), unreadCrew());
    await mount();
    fireEvent.keyDown(window, { key: "2" });
    await act(async () => { fireEvent.click(screen.getByTestId("thread-peter:1")); });
    await refresh();
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });
});
```

In `describe("keyboard shortcuts")` → `"leave you alone while you type a comment"`, extend the key list to `["r", "1", "3", "w", "?", "n", "g"]`.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run app/__tests__/page.test.tsx`
Expected: FAIL — the badge still derives from localStorage; opening a thread doesn't POST `/api/seen`.

- [ ] **Step 3: Implement**

`web/lib/seen.ts`: delete the `commentsSeenAt` field and its doc comment from `Seen`.

`web/app/page.tsx`:

1. Imports: add `import { mergeSeen, unreadCount, type SeenMap } from "@/lib/unread";`
2. Delete the `unreadSince` ref and `badgeSince` state (and their comments). Add:

```ts
  // What you've read, per thread. Server copy merged with anything opened
  // since, so a refresh that raced a save can't un-read it.
  const [seen, setSeen] = useState<SeenMap>({});
```

3. In `load`: delete the `if (unreadSince.current === 0) { … }` block; after `setEngagement(next.engagement ?? {});` add:

```ts
      setSeen((prev) => mergeSeen(prev, next.seen ?? {}));
```

   In the `writeSeen({ … })` call delete the `commentsSeenAt` line and the two comment lines above it.
4. Add after `comment`:

```ts
  /** Opening a thread reads it. Local first, so the badge drops as you tap. */
  const markSeen = useCallback((itemId: string) => {
    setSeen((prev) => ({ ...prev, [itemId]: Date.now() }));
    send("/api/seen", { itemId }, "couldn't mark that as read");
  }, [send]);
```

   In `comment`, after the `setEngagement(...)` call add (the server does the same on its side):

```ts
    setSeen((prev) => ({ ...prev, [itemId]: mine.at }));
```

5. Delete the whole `useEffect` headed `// Opening the feed is what clears the badge; …`.
6. Replace the `unreadComments` computation with:

```ts
  const unreadComments = unreadCount(engagement, data.viewer, seen);
```

7. Badge `<span>`: add `key={unreadComments}`, add `badge-pop` to its `className`, and change `title` to `` `${unreadComments} unread — tap to go through them` ``.
8. `<Feed>`: replace `seen={{ _floor: unreadSince.current }}` with `seen={seen}` and add `onSeen={markSeen}`.
9. Shortcuts list: `[["1 2 3", "Board, Feed, You"], ["t w a", "Today, week, all time"], ["n", "Next unread comment"], ["g", "Back to top"], ["r", "Refresh"], ["?", "This list"]]`.

`web/app/globals.css`, after `.card-arrive`:

```css
/* The unread count ticks as you read; each new number lands with a small pop. */
@keyframes badge-pop {
  from { transform: scale(.55); }
  to   { transform: none; }
}
.badge-pop { animation: badge-pop 180ms cubic-bezier(.3,1.5,.5,1) 1; }
```

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS. `grep -rn "commentsSeenAt\|unreadSince\|badgeSince" web/app web/lib` → no matches.

- [ ] **Step 5: Commit**

```bash
git add web/app/page.tsx web/lib/seen.ts web/app/globals.css web/app/__tests__/page.test.tsx
git commit -m "Keep the badge until each unread thread is opened

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Visual pass, real-app check, ship

**Files:** whatever the visual pass touches, limited to `FeedFilters.tsx`, `FeedCard.tsx`, `Feed.tsx`, `BackToTop.tsx`, `globals.css`.

- [ ] **Step 1: Visual pass with the frontend-design skill**

Invoke `frontend-design:frontend-design`. Brief: "Refine the new feed filter bar, day headers, Show-more button, Next-unread pill, caught-up row, back-to-top button and badge pop in `web/app/components/{FeedFilters,Feed,FeedCard,BackToTop}.tsx` and `web/app/globals.css`. Stay inside Aurora Glass (tokens in globals.css; colour only when it carries meaning). Premium, quiet, fast; delight is small and earned. Must hold at 375 px wide with no page overflow. Do not change test ids, props, or behaviour." Keep changes to classes/styles/CSS.

- [ ] **Step 2: Suite + build**

Run: `npm test && npm run build`
Expected: both succeed.

- [ ] **Step 3: See it in the real app**

Invoke the `run` skill (or `npm run dev`) and open `http://localhost:3000/?key=<JP's read key from web/.env.local READ_KEYS>`. Note: `.env.local` points at the production Upstash database, so opening threads here really marks them read for JP.
Check, at desktop width and at 375 px:
- Badge shows JP's unread count (Adam's 行う comment should be one of them).
- Tapping the badge → Unread on, 行う thread open and glowing, badge drops.
- "Next unread →" walks the rest; last one → "All caught up ✓".
- Missed / Got it / 💬 / person chips narrow the list; day headers read Today / Yesterday / weekday.
- Show more; ↑ appears after a screen of scroll; `n`, `g` work.
- Filter bar stays pinned while scrolling; no horizontal page scroll on a phone width.

- [ ] **Step 4: Commit the visual pass**

```bash
git add web/app
git commit -m "Polish the feed's new controls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Ask JP before shipping**

Pushing `master` to `origin` is what deploys. Stop and ask JP to confirm the push; do not push without a yes.
