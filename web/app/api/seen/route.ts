import { NextResponse } from "next/server";
import { userForRequest } from "@/lib/identity";
import { markAllSeen, markSeen } from "@/lib/store";
import { FLOOR } from "@/lib/unread";

const bad = () => NextResponse.json({ error: "bad request" }, { status: 400 });

export async function POST(req: Request) {
  const user = userForRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad();
  }

  const b = body as { itemId?: unknown; all?: unknown; upTo?: unknown };
  // upTo is the newest comment the page had shown, not the server clock, so a
  // comment posted after your last refresh stays unread until you see it.
  if (typeof b?.upTo !== "number" || !Number.isFinite(b.upTo) || b.upTo <= 0) return bad();
  const at = Math.min(b.upTo, Date.now());

  if (b.all === true) {
    if (b.itemId !== undefined) return bad();
    await markAllSeen(user, at);
    return NextResponse.json({ ok: true, at });
  }

  // The floor shares the hash with thread ids. Only the explicit "all" path
  // may move it.
  if (typeof b.itemId !== "string" || b.itemId.length === 0 || b.itemId.length > 128
      || b.itemId === FLOOR) {
    return bad();
  }
  await markSeen(user, b.itemId, at);
  return NextResponse.json({ ok: true, at });
}
