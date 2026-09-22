import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const saveSnapshot = vi.fn();
vi.mock("@/lib/store", () => ({ saveSnapshot: (b: unknown) => saveSnapshot(b) }));

import { POST } from "@/app/api/ingest/route";

// Vitest runs from web/, so the contract fixture is one level up in publisher/.
// Using cwd rather than __dirname keeps this working under ESM.
const CONTRACT = path.resolve(process.cwd(), "../publisher/tests/contract/payload.sample.json");

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
    const payload = JSON.parse(fs.readFileSync(CONTRACT, "utf-8"));
    const res = await POST(req({ ...payload, days: "lots" }));
    expect(res.status).toBe(400);
  });
});
