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
