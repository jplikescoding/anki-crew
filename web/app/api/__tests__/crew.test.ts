import { describe, it, expect, beforeEach, vi } from "vitest";
import type { PersonView } from "@/lib/types";

const person: PersonView = {
  profile: { id: "jp", displayName: "JP", tz: "America/New_York", joinedAt: 0 },
  meta: { lastPublishAt: 1, streak: 3, todayKey: "2026-09-21", allTimeReviews: 10, firstReviewAt: 1 },
  days: [],
};

const { getSeen } = vi.hoisted(() => ({
  getSeen: vi.fn(async (_id: string) => ({ _floor: 42, "peter:1": 7 })),
}));

vi.mock("@/lib/store", () => ({
  listUsers: async () => ["jp"],
  getPerson: async (id: string) => (id === "jp" ? person : null),
  getFeed: async () => [],
  getEngagement: async () => ({}),
  getSeen,
}));

import { GET } from "@/app/api/crew/route";

describe("GET /api/crew", () => {
  beforeEach(() => { process.env.READ_KEYS = JSON.stringify({ key_jp: "jp" }); });

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
});
