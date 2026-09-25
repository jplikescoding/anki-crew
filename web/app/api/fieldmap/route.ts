import { NextResponse } from "next/server";
import { userForRequest } from "@/lib/identity";
import { ROLES } from "@/lib/fields";
import { getNoteTypes, setFieldMap } from "@/lib/store";
import type { FieldMap, FieldRole } from "@/lib/types";

/** Your own choice of which field is the word, meaning or sentence, for one note type. */
export async function POST(req: Request) {
  const user = userForRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const b = body as { noteType?: unknown; map?: unknown };
  if (typeof b?.noteType !== "string" || typeof b.map !== "object" || b.map === null || Array.isArray(b.map)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // Only your own note types, and only their real field names.
  const fields = (await getNoteTypes(user))[b.noteType];
  if (!fields) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const map: FieldMap = {};
  for (const [role, name] of Object.entries(b.map as Record<string, unknown>)) {
    if (!ROLES.includes(role as FieldRole) || typeof name !== "string" || !fields.includes(name)) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    map[role as FieldRole] = name;
  }

  const fieldMaps = await setFieldMap(user, b.noteType, map);
  return NextResponse.json({ ok: true, fieldMaps });
}
