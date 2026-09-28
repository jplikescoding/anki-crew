import { NextResponse } from "next/server";
import { deckWord } from "@/lib/fields";
import { userForReadKey } from "@/lib/identity";
import { dayNow } from "@/lib/competition";
import {
  getCompetition, getEngagement, getFeed, getFieldMaps, getNotes, getNoteTypes, getPerson, getSeen, getWordStatuses, listUsers,
} from "@/lib/store";
import type { CrewResponse, DeckStatus, FieldMaps, PersonView } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const viewer = userForReadKey(key);
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ids = await listUsers();
  const loaded = await Promise.all(ids.map((id) => getPerson(id)));
  // A publisher reports its day only when it syncs. Bring everyone up to the
  // day it is now for them, so a stale "today" reads as nothing yet rather
  // than as yesterday's cards. An unknown zone is read as the last zone on
  // Earth, as the weekly race reads it, so their today and streak still roll.
  const now = Date.now();
  const people = loaded
    .filter((p): p is PersonView => p !== null)
    .map((p) => ({ ...p, meta: { ...p.meta, todayKey: dayNow(p, now) } }));
  const feed = await getFeed();
  const engagement = await getEngagement(feed.map((f) => f.id));
  const seen = await getSeen(viewer);

  // How each card owner has chosen to show their note types.
  const owners = [...new Set([...people.map((p) => p.profile.id), ...feed.map((f) => f.user)])];
  const maps = Object.fromEntries(await Promise.all(owners.map(async (id) => [id, await getFieldMaps(id)] as const)));
  const fieldMaps: Record<string, FieldMaps> = Object.fromEntries(people.map((p) => [p.profile.id, maps[p.profile.id]]));

  // Friends' cards only, looked up in the viewer's index in one read.
  const wanted = new Map<string, string>();
  for (const item of feed) {
    if (item.user === viewer) continue;
    const word = deckWord(item, maps[item.user]?.[item.noteType ?? ""]);
    if (word) wanted.set(item.id, word);
  }
  const statuses = await getWordStatuses(viewer, [...new Set(wanted.values())]);
  const inMyDeck: Record<string, DeckStatus | "none"> = {};
  if (statuses) for (const [id, word] of wanted) inMyDeck[id] = statuses[word] ?? "none";

  const noteTypes = await getNoteTypes(viewer);
  const notes = await getNotes();
  const competition = await getCompetition(viewer);

  const body: CrewResponse = { viewer, people, feed, engagement, seen, fieldMaps, noteTypes, inMyDeck, notes, competition };
  return NextResponse.json(body);
}
