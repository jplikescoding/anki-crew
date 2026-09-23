import { NextResponse } from "next/server";
import { userForRequest } from "@/lib/identity";
import { setAvatar } from "@/lib/store";

// The browser resizes to 128px before sending, so anything much bigger than
// this did not come from our uploader.
export const MAX_AVATAR_CHARS = 80_000;

const ALLOWED_PREFIXES = [
  "data:image/webp;base64,",
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
];

export async function POST(req: Request) {
  const user = userForRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  const image = (body as { image?: unknown })?.image;
  if (typeof image !== "string" || image.length > MAX_AVATAR_CHARS) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  if (!ALLOWED_PREFIXES.some((p) => image.startsWith(p))) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // You can only ever change your own picture: the id comes from the key.
  const ok = await setAvatar(user, image);
  if (!ok) {
    return NextResponse.json({ error: "publish first" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
