import { NextResponse } from "next/server";
import { userForIngestToken } from "@/lib/identity";
import { saveSnapshot } from "@/lib/store";
import type { IngestBody } from "@/lib/types";

// A day row written under a missing date becomes a hash field named
// "undefined" that nothing can delete and that breaks every later read, so
// rows are validated here rather than trusted. The caps bound one publish:
// MAX_DAYS is ~22 years of daily rows, and MAX_RECENT_CARDS matches the feed
// cap, above which the extra items would be trimmed away anyway.
export const MAX_DAYS = 8000;
export const MAX_RECENT_CARDS = 500;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const COUNTERS = ["reviews", "minutes", "newCards",
                  "ease1", "ease2", "ease3", "ease4"] as const;

function looksLikeDay(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  if (typeof d.date !== "string" || !DATE.test(d.date)) return false;
  return COUNTERS.every((k) => typeof d[k] === "number");
}

function looksLikeFeedItem(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  return typeof c.id === "string" && typeof c.front === "string"
    && typeof c.ts === "number";
}

function looksLikeIngestBody(value: unknown): value is IngestBody {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  if (typeof b.allTime !== "object" || b.allTime === null) return false;
  const allTime = b.allTime as Record<string, unknown>;
  return typeof b.user === "string"
    && typeof b.displayName === "string"
    && typeof b.tz === "string"
    && typeof b.generatedAt === "number"
    && typeof b.todayKey === "string"
    && typeof b.streak === "number"
    && typeof allTime.reviews === "number"
    && typeof allTime.firstReviewAt === "number"
    && Array.isArray(b.days) && b.days.every(looksLikeDay)
    && Array.isArray(b.recentCards) && b.recentCards.every(looksLikeFeedItem);
}

function tooLarge(value: unknown): boolean {
  const b = value as Record<string, unknown>;
  return (Array.isArray(b.days) && b.days.length > MAX_DAYS)
    || (Array.isArray(b.recentCards) && b.recentCards.length > MAX_RECENT_CARDS);
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const user = userForIngestToken(token);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof body === "object" && body !== null && tooLarge(body)) {
    return NextResponse.json({ error: "payload too large" }, { status: 400 });
  }
  if (!looksLikeIngestBody(body)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  // A token publishes for exactly one person and cannot overwrite another's row.
  if (body.user !== user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await saveSnapshot(body);
  return NextResponse.json({ ok: true, days: body.days.length });
}
