import { describe, it, expect, beforeEach, vi } from "vitest";

type AnyFn = (...args: unknown[]) => unknown;
const setReaction = vi.fn<AnyFn>();
const addComment = vi.fn<AnyFn>();
const setAvatar = vi.fn<AnyFn>(async () => true);
const markSeen = vi.fn<AnyFn>();
const markAllSeen = vi.fn<AnyFn>();

vi.mock("@/lib/store", () => ({
  setReaction: (...a: unknown[]) => setReaction(...a),
  addComment: (...a: unknown[]) => addComment(...a),
  setAvatar: (...a: unknown[]) => setAvatar(...a),
  markSeen: (...a: unknown[]) => markSeen(...a),
  markAllSeen: (...a: unknown[]) => markAllSeen(...a),
  MAX_COMMENT_CHARS: 280,
}));

import { POST as react } from "@/app/api/react/route";
import { POST as comment } from "@/app/api/comment/route";
import { POST as avatar } from "@/app/api/avatar/route";
import { POST as seen } from "@/app/api/seen/route";

function req(body: unknown, key = "key_jp") {
  return new Request(`https://x.test/api/thing?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  setReaction.mockClear();
  addComment.mockClear();
  setAvatar.mockClear();
  markSeen.mockClear();
  markAllSeen.mockClear();
  setAvatar.mockResolvedValue(true as unknown as never);
  process.env.READ_KEYS = JSON.stringify({ key_jp: "jp", key_p: "peter" });
});

describe("POST /api/react", () => {
  it("records an allowed emoji, attributed to the key holder", async () => {
    const res = await react(req({ itemId: "peter:1", emoji: "🔥" }));
    expect(res.status).toBe(200);
    expect(setReaction).toHaveBeenCalledWith("peter:1", "jp", "🔥");
  });

  it("attributes to the key, not to anything in the body", async () => {
    await react(req({ itemId: "peter:1", emoji: "🔥", user: "adam" }, "key_p"));
    expect(setReaction).toHaveBeenCalledWith("peter:1", "peter", "🔥");
  });

  it("clears a reaction on an explicit null", async () => {
    const res = await react(req({ itemId: "peter:1", emoji: null }));
    expect(res.status).toBe(200);
    expect(setReaction).toHaveBeenCalledWith("peter:1", "jp", null);
  });

  it("rejects an emoji that is not on the list", async () => {
    const res = await react(req({ itemId: "peter:1", emoji: "🍕" }));
    expect(res.status).toBe(400);
    expect(setReaction).not.toHaveBeenCalled();
  });

  it("rejects a missing key", async () => {
    const res = await react(req({ itemId: "peter:1", emoji: "🔥" }, ""));
    expect(res.status).toBe(401);
    expect(setReaction).not.toHaveBeenCalled();
  });

  it("rejects an unknown key", async () => {
    expect((await react(req({ itemId: "a", emoji: "🔥" }, "nope"))).status).toBe(401);
  });

  it("rejects a missing itemId", async () => {
    expect((await react(req({ emoji: "🔥" }))).status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const bad = new Request("https://x.test/api/react?key=key_jp", { method: "POST", body: "{nope" });
    expect((await react(bad)).status).toBe(400);
  });
});

describe("POST /api/comment", () => {
  it("stores a trimmed comment attributed to the key holder", async () => {
    const res = await comment(req({ itemId: "peter:1", text: "  brutal card  " }));
    expect(res.status).toBe(200);
    expect(addComment).toHaveBeenCalledWith("peter:1",
      expect.objectContaining({ user: "jp", text: "brutal card" }));
  });

  it("rejects an empty or whitespace-only comment", async () => {
    expect((await comment(req({ itemId: "peter:1", text: "   " }))).status).toBe(400);
    expect(addComment).not.toHaveBeenCalled();
  });

  it("rejects a comment past the length limit", async () => {
    expect((await comment(req({ itemId: "peter:1", text: "x".repeat(281) }))).status).toBe(400);
  });

  it("accepts a comment exactly at the limit", async () => {
    expect((await comment(req({ itemId: "peter:1", text: "x".repeat(280) }))).status).toBe(200);
  });

  it("rejects a missing key", async () => {
    expect((await comment(req({ itemId: "a", text: "hi" }, ""))).status).toBe(401);
  });

  it("returns the stored comment so the page can show it without refetching", async () => {
    const res = await comment(req({ itemId: "peter:1", text: "lol" }));
    expect((await res.json()).comment).toMatchObject({ user: "jp", text: "lol" });
  });
});

describe("POST /api/avatar", () => {
  it("accepts a small image and attaches it to the key holder", async () => {
    const res = await avatar(req({ image: "data:image/webp;base64,AAAA" }));
    expect(res.status).toBe(200);
    expect(setAvatar).toHaveBeenCalledWith("jp", "data:image/webp;base64,AAAA");
  });

  it("rejects anything that is not an image data URL", async () => {
    expect((await avatar(req({ image: "https://evil.test/x.png" }))).status).toBe(400);
    expect((await avatar(req({ image: "data:text/html;base64,AAAA" }))).status).toBe(400);
    expect(setAvatar).not.toHaveBeenCalled();
  });

  it("rejects an oversized image", async () => {
    const huge = "data:image/webp;base64," + "A".repeat(80_001);
    expect((await avatar(req({ image: huge }))).status).toBe(400);
  });

  it("rejects a missing key", async () => {
    expect((await avatar(req({ image: "data:image/png;base64,AA" }, ""))).status).toBe(401);
  });

  it("explains that you have to publish before you can have a picture", async () => {
    setAvatar.mockResolvedValue(false as unknown as never);
    const res = await avatar(req({ image: "data:image/png;base64,AA" }));
    expect(res.status).toBe(409);
  });
});

describe("POST /api/seen", () => {
  it("records how far the key holder has read a thread", async () => {
    const res = await seen(req({ itemId: "peter:1", upTo: 5000 }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, at: 5000 });
    expect(markSeen).toHaveBeenCalledWith("jp", "peter:1", 5000);
  });

  it("never records a time in the future", async () => {
    const res = await seen(req({ itemId: "peter:1", upTo: Date.now() + 3_600_000 }));
    const { at } = await res.json();
    expect(at).toBeLessThanOrEqual(Date.now());
    expect(markSeen).toHaveBeenCalledWith("jp", "peter:1", at);
  });

  it("marks everything read up to a time", async () => {
    const res = await seen(req({ all: true, upTo: 7000 }));
    expect(res.status).toBe(200);
    expect(markAllSeen).toHaveBeenCalledWith("jp", 7000);
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("rejects a missing, non-numeric or non-positive upTo", async () => {
    // Infinity serialises to null in JSON, so it arrives as a non-number.
    for (const upTo of [undefined, "5000", 0, -1, Infinity]) {
      expect((await seen(req({ itemId: "peter:1", upTo }))).status).toBe(400);
    }
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("rejects a missing or oversized itemId", async () => {
    expect((await seen(req({ upTo: 5000 }))).status).toBe(400);
    expect((await seen(req({ itemId: "x".repeat(129), upTo: 5000 }))).status).toBe(400);
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("refuses to treat the floor as a thread", async () => {
    expect((await seen(req({ itemId: "_floor", upTo: 5000 }))).status).toBe(400);
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("rejects a body that asks for one thread and everything at once", async () => {
    expect((await seen(req({ all: true, itemId: "peter:1", upTo: 5000 }))).status).toBe(400);
    expect(markAllSeen).not.toHaveBeenCalled();
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("rejects a missing key", async () => {
    expect((await seen(req({ itemId: "peter:1", upTo: 5000 }, ""))).status).toBe(401);
  });
});
