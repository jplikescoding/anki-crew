import { describe, it, expect, beforeEach, vi } from "vitest";

const { saved } = vi.hoisted(() => ({ saved: [] as [string, unknown][] }));

vi.mock("@/lib/store", () => ({
  saveCompetition: async (id: string, patch: unknown) => { saved.push([id, patch]); },
}));

import { POST } from "@/app/api/competition/route";

function req(body: unknown, key = "key_jp") {
  return new Request(`https://x.test/api/competition?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const look = { at: 5, day: "2026-09-29", week: "2026-09-28", scores: { jp: { today: 1, week: 2, all: 3 } } };

beforeEach(() => {
  saved.length = 0;
  process.env.READ_KEYS = JSON.stringify({ key_jp: "jp" });
});

describe("POST /api/competition", () => {
  it("saves a look, a standing and results for the key holder", async () => {
    const body = { look, standing: { week: "2026-09-28", order: ["adam", "jp"] }, results: { "2026-09-21": "adam" } };
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(saved).toEqual([["jp", body]]);
  });

  it("caps a look's time at now", async () => {
    await POST(req({ look: { ...look, at: Date.now() + 1e9 } }));
    expect((saved[0][1] as { look: { at: number } }).look.at).toBeLessThanOrEqual(Date.now());
  });

  it("rejects a bad key, bad JSON, an empty body and malformed parts", async () => {
    expect((await POST(req({ look }, "nope"))).status).toBe(401);
    expect((await POST(req("{nope"))).status).toBe(400);
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req(null))).status).toBe(400);
    expect((await POST(req({ look: { ...look, day: "Monday" } }))).status).toBe(400);
    expect((await POST(req({ look: { ...look, scores: { jp: { today: -1, week: 0, all: 0 } } } }))).status).toBe(400);
    expect((await POST(req({ standing: { week: "2026-09-28", order: ["x".repeat(65)] } }))).status).toBe(400);
    expect((await POST(req({ results: { "week 39": "adam" } }))).status).toBe(400);
    expect((await POST(req({ results: { "2026-09-21": 7 } }))).status).toBe(400);
    expect(saved).toEqual([]);
  });
});
