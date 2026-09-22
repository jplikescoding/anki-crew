import { NextResponse } from "next/server";
import { userForIngestToken } from "@/lib/identity";
import { saveSnapshot } from "@/lib/store";
import type { IngestBody } from "@/lib/types";

function looksLikeIngestBody(value: unknown): value is IngestBody {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  return typeof b.user === "string"
    && typeof b.displayName === "string"
    && typeof b.tz === "string"
    && typeof b.generatedAt === "number"
    && typeof b.todayKey === "string"
    && typeof b.streak === "number"
    && Array.isArray(b.days)
    && Array.isArray(b.recentCards)
    && typeof b.allTime === "object" && b.allTime !== null;
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
