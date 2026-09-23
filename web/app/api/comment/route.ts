import { NextResponse } from "next/server";
import { userForRequest } from "@/lib/identity";
import { addComment, MAX_COMMENT_CHARS } from "@/lib/store";

export async function POST(req: Request) {
  const user = userForRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const b = body as { itemId?: unknown; text?: unknown };
  if (typeof b?.itemId !== "string" || b.itemId.length === 0 || b.itemId.length > 128) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (typeof b.text !== "string") {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const text = b.text.trim();
  if (text.length === 0 || text.length > MAX_COMMENT_CHARS) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // Authorship comes from the key, never from the body.
  const comment = { user, text, at: Date.now() };
  await addComment(b.itemId, comment);
  return NextResponse.json({ ok: true, comment });
}
