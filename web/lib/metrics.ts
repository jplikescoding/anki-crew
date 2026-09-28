// Every number the dashboard shows is derived here from stored daily rows.
// Nothing is pre-baked by the publisher, so changing what the leaderboard
// rewards is a change to this file alone -- no script edits, no lost history.
import type { DayRow, Look, LookScores, PersonView } from "@/lib/types";

export function retention(days: DayRow[]): number | null {
  let pass = 0;
  let fail = 0;
  for (const d of days) {
    fail += d.ease1;
    pass += d.ease2 + d.ease3 + d.ease4;
  }
  const graded = pass + fail;
  if (graded === 0) return null;
  return Math.round((1000 * pass) / graded) / 10;
}

export function totals(days: DayRow[]) {
  const out = { reviews: 0, minutes: 0, newCards: 0 };
  for (const d of days) {
    out.reviews += d.reviews;
    out.minutes += d.minutes;
    out.newCards += d.newCards;
  }
  out.minutes = Math.round(out.minutes * 10) / 10;
  return out;
}

export function windowFrom(days: DayRow[], fromDate: string): DayRow[] {
  return days.filter((d) => d.date >= fromDate);
}

/** Monday of the week `todayKey` falls in. Weeks run Monday to Sunday. */
export function weekStart(todayKey: string): string {
  const dow = new Date(`${todayKey}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return shiftDays(todayKey, -((dow + 6) % 7));
}

/** Whole days left in the week after today: 6 on a Monday, 0 on a Sunday. */
export function daysLeftInWeek(todayKey: string): number {
  return 6 - ((new Date(`${todayKey}T00:00:00Z`).getUTCDay() + 6) % 7);
}

/**
 * Consecutive studied days ending today, or ending yesterday while today is
 * still empty. Worked out here rather than trusted from the publisher: one
 * that stops syncing would otherwise show its last streak forever.
 */
export function currentStreak(days: DayRow[], todayKey: string): number {
  const studied = new Set(days.filter((d) => d.reviews > 0).map((d) => d.date));
  let day = studied.has(todayKey) ? todayKey : shiftDays(todayKey, -1);
  let n = 0;
  while (studied.has(day)) {
    n++;
    day = shiftDays(day, -1);
  }
  return n;
}

/** The longest run of consecutive studied days in someone's history. */
export function bestStreak(days: DayRow[]): number {
  const dates = days.filter((d) => d.reviews > 0).map((d) => d.date).sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const d of dates) {
    run = prev && shiftDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}

/** Date arithmetic on YYYY-MM-DD keys, done in UTC so DST never shifts a key. */
export function shiftDays(key: string, delta: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function rankBy(people: PersonView[], pick: (p: PersonView) => number): PersonView[] {
  return [...people].sort((a, b) => {
    const diff = pick(b) - pick(a);
    return diff !== 0 ? diff : a.profile.displayName.localeCompare(b.profile.displayName);
  });
}

export function deckTotals(days: DayRow[]): [string, number][] {
  const sums = new Map<string, number>();
  for (const d of days) {
    for (const [deck, count] of Object.entries(d.perDeck)) {
      sums.set(deck, (sums.get(deck) ?? 0) + count);
    }
  }
  return [...sums.entries()].sort((a, b) => b[1] - a[1]);
}

function reviewsOn(person: PersonView, date: string): number {
  return person.days.find((d) => d.date === date)?.reviews ?? 0;
}

export type Range = "today" | "week" | "all";

export type Momentum = { dir: 1 | -1; amount: number; rival: string; leading: boolean };

/** A person's score on a range, as of now, on their own day. */
export function scoreNow(person: PersonView, range: Range): number {
  if (range === "today") return reviewsOn(person, person.meta.todayKey);
  if (range === "week") return totals(windowFrom(person.days, weekStart(person.meta.todayKey))).reviews;
  return totals(person.days).reviews;
}

/** What to remember as "what you saw", so the next visit can draw arrows. */
export function lookFrom(people: PersonView[], viewerDay: string, at: number): Look {
  const scores: Record<string, LookScores> = {};
  for (const p of people) {
    scores[p.profile.id] = { today: scoreNow(p, "today"), week: scoreNow(p, "week"), all: scoreNow(p, "all") };
  }
  return { at, day: viewerDay, week: weekStart(viewerDay), scores };
}

/**
 * The look's score for each person on a range, or null when there is nothing
 * fair to compare against: no look yet, or the range's period has rolled over
 * since (a new day for Today, a new week for This week).
 */
function scoresThen(look: Look | null, range: Range, viewerDay: string): ((p: PersonView) => number) | null {
  if (!look) return null;
  if (range === "today" && look.day !== viewerDay) return null;
  if (range === "week" && look.week !== weekStart(viewerDay)) return null;
  return (p) => look.scores[p.profile.id]?.[range] ?? 0;
}

/** Position of each person, 1-based, ties broken by name so it never jitters. */
function ranksBy(people: PersonView[], pick: (p: PersonView) => number): Record<string, number> {
  const out: Record<string, number> = {};
  rankBy(people, pick).forEach((p, i) => { out[p.profile.id] = i + 1; });
  return out;
}

/**
 * How many places each person moved since you last looked, on the range the
 * board is showing. Positive means they climbed.
 */
export function rankDeltas(
  people: PersonView[], range: Range, look: Look | null, viewerDay: string,
): Record<string, number> {
  const then = scoresThen(look, range, viewerDay);
  const now = ranksBy(people, (p) => scoreNow(p, range));
  const before = then ? ranksBy(people, then) : now;
  const out: Record<string, number> = {};
  for (const p of people) out[p.profile.id] = before[p.profile.id] - now[p.profile.id];
  return out;
}

/**
 * Whether each person gained or lost ground on the person just above them
 * (the leader: on second place) since you last looked. Rank arrows only move
 * on an overtake; this is the chase in between.
 */
export function momentum(
  people: PersonView[], range: Range, look: Look | null, viewerDay: string,
): Record<string, Momentum | null> {
  const then = scoresThen(look, range, viewerDay);
  const ranked = rankBy(people, (p) => scoreNow(p, range));
  const out: Record<string, Momentum | null> = {};
  ranked.forEach((p, i) => {
    const rival = i === 0 ? ranked[1] : ranked[i - 1];
    if (!then || !rival) { out[p.profile.id] = null; return; }
    const change = (scoreNow(p, range) - scoreNow(rival, range)) - (then(p) - then(rival));
    out[p.profile.id] = change === 0 ? null : {
      dir: change > 0 ? 1 : -1,
      amount: Math.abs(change),
      rival: rival.profile.displayName,
      leading: i === 0,
    };
  });
  return out;
}

/** "since you last looked" for a look earlier today, else "since Saturday" or "since Sep 1". */
export function sinceWhen(at: number, now: number): string {
  const then = new Date(at);
  if (then.toDateString() === new Date(now).toDateString()) return "since you last looked";
  if (now - at > 6 * 86_400_000) {
    return `since ${then.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return `since ${then.toLocaleDateString("en-US", { weekday: "long" })}`;
}

/**
 * The Anki day it is right now for someone, from their zone and Anki's default
 * 4am rollover. A publisher only reports its day when it syncs, so without this
 * last night's cards would still count as "today" until they next study.
 * Never earlier than the reported day, and the reported day stands when the
 * zone isn't a real one (setup writes "local" when left blank).
 */
export function currentDayKey(tz: string, reported: string, now: number): string {
  let local: string;
  try {
    local = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date(now - 4 * 3600_000));
  } catch {
    return reported;
  }
  return local > reported ? local : reported;
}

export type Gap =
  | { kind: "behind"; name: string; amount: number }
  | { kind: "leading"; name: string; amount: number };

/**
 * One comparison, always about the viewer: the person immediately ahead of them,
 * or their margin over second place if they lead. Deliberately not computed for
 * everyone -- two rows each stating the same gap from opposite sides is noise.
 */
export function gapToNext(
  people: PersonView[],
  viewerId: string | null,
  pick: (p: PersonView) => number,
): Gap | null {
  if (!viewerId || people.length < 2) return null;
  const ranked = rankBy(people, pick);
  const i = ranked.findIndex((p) => p.profile.id === viewerId);
  if (i < 0) return null;
  const rival = i === 0 ? ranked[1] : ranked[i - 1];
  const amount = i === 0
    ? pick(ranked[0]) - pick(rival)
    : pick(rival) - pick(ranked[i]);
  return { kind: i === 0 ? "leading" : "behind", name: rival.profile.displayName, amount };
}

/**
 * Streak milestones. The first two rungs are close together on purpose: a reward
 * that takes a month to appear teaches nobody that the reward exists.
 */
export const STREAK_TIERS = [3, 7, 14, 30, 100] as const;

export type StreakTier = { tier: number; nextAt: number | null; daysToNext: number | null };

export function streakTier(streak: number): StreakTier {
  const tier = STREAK_TIERS.filter((t) => streak >= t).length;
  const nextAt = STREAK_TIERS.find((t) => t > streak) ?? null;
  return { tier, nextAt, daysToNext: nextAt === null ? null : nextAt - streak };
}

/** Best single day ever. Ties keep the earliest date, so a record has one owner. */
export function personalBest(days: DayRow[]): { date: string; reviews: number } | null {
  let best: { date: string; reviews: number } | null = null;
  for (const d of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (d.reviews > 0 && (best === null || d.reviews > best.reviews)) {
      best = { date: d.date, reviews: d.reviews };
    }
  }
  return best;
}

export type CrewDay = { date: string; perPerson: Record<string, number>; total: number };

/** The last `n` days for everyone at once, zero-filled so the chart has no gaps. */
export function crewDailyTotals(people: PersonView[], todayKey: string, n: number): CrewDay[] {
  const out: CrewDay[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = shiftDays(todayKey, -i);
    const perPerson: Record<string, number> = {};
    let total = 0;
    for (const p of people) {
      const v = reviewsOn(p, date);
      perPerson[p.profile.id] = v;
      total += v;
    }
    out.push({ date, perPerson, total });
  }
  return out;
}
