import { describe, it, expect, beforeEach } from "vitest";
import { readSeen, writeSeen, type Seen } from "@/lib/seen";

const seen = (totals: Record<string, number> = {}): Seen => ({
  totals, at: 1,
});

describe("readSeen / writeSeen", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips", () => {
    writeSeen(seen({ jp: 10 }));
    expect(readSeen()?.totals.jp).toBe(10);
  });

  it("returns null when nothing has been stored", () => {
    expect(readSeen()).toBeNull();
  });

  it("returns null rather than throwing on a corrupt value", () => {
    localStorage.setItem("anki-crew:seen:v1", "{not json");
    expect(readSeen()).toBeNull();
  });

  it("returns null when the stored value is the wrong shape", () => {
    localStorage.setItem("anki-crew:seen:v1", JSON.stringify({ nope: true }));
    expect(readSeen()).toBeNull();
  });
});
