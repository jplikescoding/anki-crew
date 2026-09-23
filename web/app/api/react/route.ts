import { NextResponse } from "next/server";
import { userForRequest } from "@/lib/identity";
import { setReaction } from "@/lib/store";

/** A deliberately short list. Five options is a reaction; thirty is a menu. */
export const ALLOWED_EMOJI = ["🔥", "💀", "😂", "👏", "🎌"];

export async function POST(req: Request) {
  const user = userForRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const b = body as { itemId?: unknown; emoji?: unknown };
  if (typeof b?.itemId !== "string" || b.itemId.length === 0 || b.itemId.length > 128) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const clearing = b.emoji === null;
  if (!clearing && (typeof b.emoji !== "string" || !ALLOWED_EMOJI.includes(b.emoji))) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // The reaction is attributed from the key, never from the body: you cannot
  // react as somebody else.
  await setReaction(b.itemId, user, clearing ? null : (b.emoji as string));
  return NextResponse.json({ ok: true });
}
