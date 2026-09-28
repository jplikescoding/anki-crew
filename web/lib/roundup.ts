// The roundup's words. Deterministic from the week's data, so a replay reads
// exactly like the first showing.
import { trophies, type WeekResult } from "@/lib/competition";
import { shiftDays } from "@/lib/metrics";
import type { PersonView } from "@/lib/types";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const n = (x: number) => x.toLocaleString("en-US");

function verb(margin: number, runnerUp: number): string {
  const share = runnerUp === 0 ? Infinity : margin / runnerUp;
  if (share < 0.05) return "edges";
  if (share < 0.25) return "holds off";
  if (share < 0.6) return "beats";
  return "cruises past";
}

/** "Adam holds off JP by 213 to go back-to-back". `history` runs up to and including `result`. */
export function headline(result: WeekResult, history: WeekResult[], names: Record<string, string>): string {
  const name = (id: string) => names[id] ?? id;
  const [first, second] = result.standings;
  if (!result.winner) return `Dead heat: ${name(first.id)} and ${name(second.id)} both on ${n(first.cards)}`;

  const margin = first.cards - second.cards;
  const upTo = history.slice(0, history.findIndex((h) => h.week === result.week) + 1);
  const before = upTo.slice(0, -1);
  const prev = before[before.length - 1];
  if (prev?.winner && prev.winner !== result.winner) {
    const ended = trophies(prev.winner, before).run;
    if (ended >= 2) return `${name(result.winner)} snaps ${name(prev.winner)}'s ${ended}-week run, by ${n(margin)}`;
  }

  const { run, weeksWon } = trophies(result.winner, upTo);
  const suffix = run >= 3 ? ` to make it ${run} straight`
    : run === 2 ? " to go back-to-back"
    : weeksWon === 1 ? " for a first ever win"
    : "";
  return `${name(result.winner)} ${verb(margin, second.cards)} ${name(second.id)} by ${n(margin)}${suffix}`;
}

function cardsOn(p: PersonView | undefined, date: string): number {
  return p?.days.find((d) => d.date === date)?.reviews ?? 0;
}

/**
 * The week's story in a sentence or two: the biggest single day, and whether
 * the winner had to come from behind to take it.
 */
export function swingLine(result: WeekResult, people: PersonView[], names: Record<string, string>): string | null {
  const name = (id: string) => names[id] ?? id;
  const byId = new Map(people.map((p) => [p.profile.id, p]));

  // Earliest day wins a tie, then the higher finisher.
  let best: { id: string; i: number; cards: number } | null = null;
  for (let i = 0; i < 7; i++) {
    const date = shiftDays(result.week, i);
    for (const s of result.standings) {
      const cards = cardsOn(byId.get(s.id), date);
      if (cards > 0 && (!best || cards > best.cards)) best = { id: s.id, i, cards };
    }
  }
  if (!best) return null;

  let line = best.id === result.winner
    ? `${WEEKDAYS[best.i]} swung it — ${name(best.id)}'s ${n(best.cards)} was the biggest day of the week.`
    : `${name(best.id)}'s ${n(best.cards)} on ${WEEKDAYS[best.i]} was the biggest day of the week.`;

  if (result.winner) {
    const runnerUp = result.standings[1].id;
    let w = 0;
    let r = 0;
    let trailed = -1;
    let gap = 0;
    for (let i = 0; i < 6; i++) {
      const date = shiftDays(result.week, i);
      w += cardsOn(byId.get(result.winner), date);
      r += cardsOn(byId.get(runnerUp), date);
      if (r > w) { trailed = i; gap = r - w; }
    }
    if (trailed >= 0) line += ` ${name(runnerUp)} was ${n(gap)} ahead going into ${WEEKDAYS[trailed + 1]}.`;
  }
  return line;
}
