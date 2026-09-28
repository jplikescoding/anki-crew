// The weekly race. Everything here is derived from stored days on every load,
// never frozen, so a late sync corrects a result instead of contradicting it.
import { currentDayKey, rankBy, shiftDays, weekCards, weekStart } from "@/lib/metrics";
export { weekCards };
import type { PersonView } from "@/lib/types";

/** Week 1: the week the crew started (21 Sep 2026). Earlier weeks never count. */
export const SEASON_START = "2026-09-21";
const SEASON_END = shiftDays(SEASON_START, 6);

export type Entry = { id: string; cards: number };
export type WeekResult = {
  week: string;              // its Monday
  standings: Entry[];        // everyone competing, most cards first
  winner: string | null;     // null on a tie for first
  podium: string[] | null;   // first three, only with four or more competitors
};
export type Trophies = { weeksWon: number; silver: number; bronze: number; run: number; bestRun: number };
export type TileCopy = { value: string; sub: string; earned: boolean };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A Monday's week number counted from the crew's first week, which is Week 1.
 * Calendar week numbers made the first week read "Week 39", as if the crew
 * had been at it for most of a year.
 */
export function crewWeek(monday: string): number {
  const days = (Date.parse(`${monday}T00:00:00Z`) - Date.parse(`${SEASON_START}T00:00:00Z`)) / 86_400_000;
  return Math.round(days / 7) + 1;
}

/** "Week 2 · 28 Sep – 4 Oct" */
export function weekLabel(monday: string): string {
  const short = (key: string) => {
    const d = new Date(`${key}T00:00:00Z`);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  };
  return `Week ${crewWeek(monday)} · ${short(monday)} – ${short(shiftDays(monday, 6))}`;
}

function knownZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The Anki day it is now for someone. A zone Intl doesn't know (setup writes
 * "local" when left blank) is read as the last zone on Earth, so an unknown
 * clock can never hold a week open.
 */
export function dayNow(p: PersonView, now: number): string {
  return currentDayKey(knownZone(p.profile.tz) ? p.profile.tz : "Etc/GMT+12", p.meta.todayKey, now);
}

function joinDay(p: PersonView): string {
  return currentDayKey(knownZone(p.profile.tz) ? p.profile.tz : "UTC", "", p.profile.joinedAt);
}

/** Week 1 for founders; for anyone else, the Monday after the week they joined. */
export function firstWeek(p: PersonView): string {
  const joined = joinDay(p);
  return joined <= SEASON_END ? SEASON_START : shiftDays(weekStart(joined), 7);
}

export function competesIn(p: PersonView, week: string): boolean {
  return week >= SEASON_START && week >= firstWeek(p);
}

export function weekResult(week: string, people: PersonView[]): WeekResult | null {
  const racing = people.filter((p) => competesIn(p, week));
  if (racing.length < 2) return null;
  const standings = rankBy(racing, (p) => weekCards(p, week))
    .map((p) => ({ id: p.profile.id, cards: weekCards(p, week) }));
  const winner = standings[0].cards > standings[1].cards ? standings[0].id : null;
  const podium = winner && standings.length >= 4 ? standings.slice(0, 3).map((s) => s.id) : null;
  return { week, standings, winner, podium };
}

/** Final once it's past Sunday for every competitor. Clock only: nobody's sync is waited for. */
export function isFinal(week: string, people: PersonView[], now: number): boolean {
  const next = shiftDays(week, 7);
  return people.filter((p) => competesIn(p, week)).every((p) => dayNow(p, now) >= next);
}

/** Every finished week that has a result, oldest first. */
export function finishedResults(people: PersonView[], now: number): WeekResult[] {
  if (people.length === 0) return [];
  const latest = people.map((p) => weekStart(dayNow(p, now))).sort().pop()!;
  const out: WeekResult[] = [];
  for (let w = SEASON_START; w < latest; w = shiftDays(w, 7)) {
    if (!isFinal(w, people, now)) break;
    const r = weekResult(w, people);
    if (r) out.push(r);
  }
  return out;
}

export function trophies(id: string, results: WeekResult[]): Trophies {
  const t: Trophies = { weeksWon: 0, silver: 0, bronze: 0, run: 0, bestRun: 0 };
  for (const r of results) {
    if (r.winner === id) {
      t.weeksWon++;
      t.run++;
      t.bestRun = Math.max(t.bestRun, t.run);
    } else if (r.standings.some((s) => s.id === id)) {
      t.run = 0; // a loss or a tie ends it
    }
    if (r.podium?.[1] === id) t.silver++;
    if (r.podium?.[2] === id) t.bronze++;
  }
  return t;
}

/** Weeks `a` had more cards than `b`, and the reverse, over weeks both competed in. */
export function headToHead(a: string, b: string, results: WeekResult[]): { a: number; b: number } {
  const out = { a: 0, b: 0 };
  for (const r of results) {
    const ca = r.standings.find((s) => s.id === a)?.cards;
    const cb = r.standings.find((s) => s.id === b)?.cards;
    if (ca === undefined || cb === undefined) continue;
    if (ca > cb) out.a++;
    else if (cb > ca) out.b++;
  }
  return out;
}

/** Whoever won the latest finished week; nobody after a tie. */
export function champion(results: WeekResult[]): string | null {
  return results.length > 0 ? results[results.length - 1].winner : null;
}

/** The words on the Weeks won and Winning run tiles. Gold once earned; a nudge before. */
export function trophyCopy(t: Trophies): { weeks: TileCopy; run: TileCopy } {
  const medals = t.silver + t.bronze > 0 ? `🥇 ${t.weeksWon} · 🥈 ${t.silver} · 🥉 ${t.bronze}` : null;
  const weeks: TileCopy = t.weeksWon > 0
    ? { value: `🏆 ${t.weeksWon}`, sub: medals ?? (t.weeksWon === 1 ? "week won" : "weeks won"), earned: true }
    : { value: "🏆 0", sub: medals ?? "first win up for grabs", earned: medals !== null };
  const run: TileCopy = t.run > 0
    ? { value: `🔥 ${t.run}`, sub: `best ever ${t.bestRun}`, earned: true }
    : t.bestRun > 0
      ? { value: `🔥 ${t.bestRun}`, sub: "best run · win this week to start a new one", earned: false }
      : { value: "—", sub: "win this week to start one", earned: false };
  return { weeks, run };
}
