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

/** Position of each person on one day, 1-based, ties broken by name so it never jitters. */
function ranksOn(people: PersonView[], date: string): Record<string, number> {
  const order = rankBy(people, (p) => reviewsOn(p, date));
  const out: Record<string, number> = {};
  order.forEach((p, i) => { out[p.profile.id] = i + 1; });
  return out;
}

/**
 * How many places each person moved since yesterday. Positive means they climbed.
 * With no yesterday to compare against, everyone reads as unmoved rather than as
 * having climbed from nowhere.
 */
export function rankDeltas(people: PersonView[], todayKey: string): Record<string, number> {
  const yesterday = shiftDays(todayKey, -1);
  const noHistory = people.every((p) => reviewsOn(p, yesterday) === 0);
  const before = ranksOn(people, yesterday);
  const now = ranksOn(people, todayKey);
  const out: Record<string, number> = {};
  for (const p of people) {
    out[p.profile.id] = noHistory ? 0 : before[p.profile.id] - now[p.profile.id];
  }
  return out;
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
