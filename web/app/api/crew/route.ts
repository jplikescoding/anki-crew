import { NextResponse } from "next/server";
import { userForReadKey } from "@/lib/identity";
import { getEngagement, getFeed, getPerson, listUsers, getSeen } from "@/lib/store";
import type { CrewResponse, PersonView } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const viewer = userForReadKey(key);
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ids = await listUsers();
  const loaded = await Promise.all(ids.map((id) => getPerson(id)));
  const people = loaded.filter((p): p is PersonView => p !== null);
  const feed = await getFeed();
  const engagement = await getEngagement(feed.map((f) => f.id));
  const seen = await getSeen(viewer);

  const body: CrewResponse = { viewer, people, feed, engagement, seen };
  return NextResponse.json(body);
}
