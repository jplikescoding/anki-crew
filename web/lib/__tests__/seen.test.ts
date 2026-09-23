import { describe, it, expect, beforeEach } from "vitest";
import { readSeen, writeSeen, whoYouPassed, type Seen } from "@/lib/seen";

const seen = (order: string[], totals: Record<string, number> = {}): Seen => ({
  order, totals, at: 1,
});

describe("readSeen / writeSeen", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips", () => {
    writeSeen(seen(["jp", "peter"], { jp: 10 }));
    expect(readSeen()?.order).toEqual(["jp", "peter"]);
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

describe("whoYouPassed", () => {
  it("names the person you moved ahead of", () => {
    const prev = seen(["peter", "jp", "adam"]);
    expect(whoYouPassed(prev, ["jp", "peter", "adam"], "jp")).toBe("peter");
  });

  it("names the strongest of several you passed", () => {
    const prev = seen(["peter", "adam", "jp"]);
    // jp jumps from last to first, passing both.
    expect(whoYouPassed(prev, ["jp", "peter", "adam"], "jp")).toBe("peter");
  });

  it("says nothing when you did not move", () => {
    const prev = seen(["jp", "peter"]);
    expect(whoYouPassed(prev, ["jp", "peter"], "jp")).toBeNull();
  });

  it("says nothing when you lost ground", () => {
    const prev = seen(["jp", "peter"]);
    expect(whoYouPassed(prev, ["peter", "jp"], "jp")).toBeNull();
  });

  it("says nothing on a first visit", () => {
    expect(whoYouPassed(null, ["jp", "peter"], "jp")).toBeNull();
  });

  it("says nothing without a viewer", () => {
    expect(whoYouPassed(seen(["peter", "jp"]), ["jp", "peter"], null)).toBeNull();
  });

  it("says nothing when the viewer is new to the board", () => {
    expect(whoYouPassed(seen(["peter"]), ["jp", "peter"], "jp")).toBeNull();
  });

  it("ignores someone who merely dropped out of view", () => {
    // adam was ahead and is gone entirely; jp did not overtake him on the board.
    const prev = seen(["adam", "jp"]);
    expect(whoYouPassed(prev, ["jp"], "jp")).toBeNull();
  });
});
