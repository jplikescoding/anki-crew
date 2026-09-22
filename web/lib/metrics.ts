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
