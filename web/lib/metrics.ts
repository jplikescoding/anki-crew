// Every number the dashboard shows is derived here from stored daily rows.
// Nothing is pre-baked by the publisher, so changing what the leaderboard
// rewards is a change to this file alone -- no script edits, no lost history.
import type { DayRow, PersonView } from "@/lib/types";

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

export function weekStart(todayKey: string): string {
  return shiftDays(todayKey, -6);
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

/**
 * A person's score for a range, as of `back` days before their own today.
 * `back` is 1 for "as of yesterday": the week ending yesterday, or the total
 * before today.
 */
function scoreAsOf(person: PersonView, range: Range, back: number): number {
  const end = shiftDays(person.meta.todayKey, -back);
  if (range === "today") return reviewsOn(person, end);
  const from = range === "week" ? weekStart(end) : "";
  return totals(person.days.filter((d) => d.date >= from && d.date <= end)).reviews;
}

/** Position of each person, 1-based, ties broken by name so it never jitters. */
function ranksAsOf(people: PersonView[], range: Range, back: number): Record<string, number> {
  const order = rankBy(people, (p) => scoreAsOf(p, range, back));
  const out: Record<string, number> = {};
  order.forEach((p, i) => { out[p.profile.id] = i + 1; });
  return out;
}

/**
 * How many places each person moved since yesterday, on the range the board is
 * showing. Positive means they climbed. Everyone is measured on their own day,
 * so a crewmate in another zone isn't compared on the wrong date. With no
 * yesterday to compare against, everyone reads as unmoved rather than as
 * having climbed from nowhere.
 */
export function rankDeltas(people: PersonView[], range: Range): Record<string, number> {
  const noHistory = people.every((p) => scoreAsOf(p, range, 1) === 0);
  const before = ranksAsOf(people, range, 1);
  const now = ranksAsOf(people, range, 0);
  const out: Record<string, number> = {};
  for (const p of people) {
    out[p.profile.id] = noHistory ? 0 : before[p.profile.id] - now[p.profile.id];
  }
  return out;
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
