import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { userForIngestToken, userForReadKey } from "@/lib/identity";

const ORIGINAL = { ...process.env };

describe("identity", () => {
  beforeEach(() => {
    process.env.INGEST_TOKENS = JSON.stringify({ tok_jp: "jp", tok_a: "andy" });
    process.env.READ_KEYS = JSON.stringify({ key_jp: "jp", key_a: "andy" });
  });
  afterEach(() => { process.env = { ...ORIGINAL }; });

  it("maps an ingest token to a user id", () => {
    expect(userForIngestToken("tok_jp")).toBe("jp");
  });

  it("returns null for an unknown token", () => {
    expect(userForIngestToken("nope")).toBeNull();
  });

  it("maps a read key to a user id", () => {
    expect(userForReadKey("key_a")).toBe("andy");
  });

  it("returns null when the env var is missing", () => {
    delete process.env.READ_KEYS;
    expect(userForReadKey("key_jp")).toBeNull();
  });

  it("returns null rather than throwing when the env var is malformed", () => {
    process.env.INGEST_TOKENS = "{not json";
    expect(userForIngestToken("tok_jp")).toBeNull();
  });

  it("does not treat inherited object properties as users", () => {
    expect(userForReadKey("constructor")).toBeNull();
  });
});
