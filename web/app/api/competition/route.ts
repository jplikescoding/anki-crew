import { NextResponse } from "next/server";
import { userForRequest } from "@/lib/identity";
import { saveCompetition } from "@/lib/store";
import type { CompetitionState, Look, LookScores, Standing } from "@/lib/types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PEOPLE = 20;
const MAX_WEEKS = 200;
const MAX_ID = 64;

const bad = () => NextResponse.json({ error: "bad request" }, { status: 400 });
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function asLook(v: unknown): Look | null {
  if (!isObject(v) || !isCount(v.at) || typeof v.day !== "string" || !DAY.test(v.day)
      || typeof v.week !== "string" || !DAY.test(v.week) || !isObject(v.scores)) return null;
  const entries = Object.entries(v.scores);
  if (entries.length > MAX_PEOPLE) return null;
  const scores: Record<string, LookScores> = {};
  for (const [id, s] of entries) {
    if (!isId(id) || !isObject(s) || !isCount(s.today) || !isCount(s.week) || !isCount(s.all)) return null;
    scores[id] = { today: s.today, week: s.week, all: s.all };
  }
  return { at: Math.min(v.at, Date.now()), day: v.day, week: v.week, scores };
}

function asStanding(v: unknown): Standing | null {
  if (!isObject(v) || typeof v.week !== "string" || !DAY.test(v.week) || !Array.isArray(v.order)) return null;
  if (v.order.length > MAX_PEOPLE || !v.order.every(isId)) return null;
  return { week: v.week, order: v.order };
}

function asResults(v: unknown): Record<string, string> | null {
  if (!isObject(v)) return null;
  const entries = Object.entries(v);
  if (entries.length > MAX_WEEKS) return null;
  for (const [week, winner] of entries) if (!DAY.test(week) || !isId(winner)) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

/** Saves what the key holder has seen: their last look, acknowledged standing, and results shown. */
export async function POST(req: Request) {
  const user = userForRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad();
  }
  if (!isObject(body)) return bad();

  const patch: Partial<CompetitionState> = {};
  if (body.look !== undefined) {
    const look = asLook(body.look);
    if (!look) return bad();
    patch.look = look;
  }
  if (body.standing !== undefined) {
    const standing = asStanding(body.standing);
    if (!standing) return bad();
    patch.standing = standing;
  }
  if (body.results !== undefined) {
    const results = asResults(body.results);
    if (!results) return bad();
    patch.results = results;
  }
  if (Object.keys(patch).length === 0) return bad();

  await saveCompetition(user, patch);
  return NextResponse.json({ ok: true });
}
