import { NextResponse } from "next/server";
import { userForRequest } from "@/lib/identity";
import { parseEdit, parseId, parseNewNote } from "@/lib/notes";
import { deleteNote, getNote, putNote } from "@/lib/store";
import type { CrewNote } from "@/lib/types";

const bad = () => NextResponse.json({ error: "bad request" }, { status: 400 });
const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });

async function json(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

/** The note, if it exists and belongs to `user`; otherwise the response to send. */
async function ownNote(id: string, user: string): Promise<CrewNote | NextResponse> {
  const note = await getNote(id);
  if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (note.user !== user) return NextResponse.json({ error: "not yours" }, { status: 403 });
  return note;
}

export async function POST(req: Request) {
  const user = userForRequest(req);
  if (!user) return unauthorized();
  const input = parseNewNote(await json(req));
  if (!input) return bad();

  // Authorship comes from the key, never from the body.
  const now = Date.now();
  const note: CrewNote = {
    id: `${user}:${now}:${Math.random().toString(36).slice(2, 6).padEnd(4, "0")}`,
    user,
    text: input.text,
    createdAt: now,
    ...(input.card ? { card: input.card } : {}),
  };
  await putNote(note);
  return NextResponse.json({ ok: true, note });
}

export async function PUT(req: Request) {
  const user = userForRequest(req);
  if (!user) return unauthorized();
  const input = parseEdit(await json(req));
  if (!input) return bad();
  const found = await ownNote(input.id, user);
  if (found instanceof NextResponse) return found;

  // Only the text changes: the card is what the note was written about.
  const note: CrewNote = { ...found, text: input.text, editedAt: Date.now() };
  await putNote(note);
  return NextResponse.json({ ok: true, note });
}

export async function DELETE(req: Request) {
  const user = userForRequest(req);
  if (!user) return unauthorized();
  const input = parseId(await json(req));
  if (!input) return bad();
  const found = await ownNote(input.id, user);
  if (found instanceof NextResponse) return found;

  await deleteNote(input.id);
  return NextResponse.json({ ok: true });
}
