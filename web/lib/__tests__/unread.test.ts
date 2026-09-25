import { describe, it, expect } from "vitest";
import {
  FLOOR, isUnread, mergeSeen, newestIn, readUpTo, unreadCount, unreadThreads,
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

describe("newestIn", () => {
  it("is the latest comment on the card, whoever wrote it", () => {
    expect(newestIn(thread(c("peter", 200), c("jp", 900), c("adam", 300)))).toBe(900);
  });

  it("is zero for a card with no comments", () => {
    expect(newestIn(undefined)).toBe(0);
    expect(newestIn(thread())).toBe(0);
  });
});
