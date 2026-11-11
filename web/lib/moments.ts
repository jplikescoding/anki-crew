// What happened since you last looked, and the bookkeeping that makes each
// moment play once. Pure: the page decides when to show and when to save.
import { competesIn, crewWeek, type WeekResult } from "@/lib/competition";
import { rankBy, scoreNow, weekStart } from "@/lib/metrics";
import { RANK_NAME, rankOrder, shownRank } from "@/lib/ranks";
import type { CompetitionState, PersonView, Rank, Standing } from "@/lib/types";

export type Moment =
  | { kind: "results"; result: WeekResult }
  | { kind: "late"; result: WeekResult }
  | { kind: "rankUp"; id: string; from: Rank | null; to: Rank }
  | { kind: "crumble"; id: string; from: Rank; to: Rank | null }
  | { kind: "passed"; ids: string[] }
  | { kind: "passedBy"; ids: string[] };

const shownAs = (r: WeekResult) => r.winner ?? "none";
const isMonday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() === 1;

/** This week's order among the people competing in it, most cards first. */
export function standingNow(people: PersonView[], viewerDay: string): Standing {
  const week = weekStart(viewerDay);
  const racing = people.filter((p) => competesIn(p, week));
  return { week, order: rankBy(racing, (p) => scoreNow(p, "week", viewerDay)).map((p) => p.profile.id) };
}

/**
 * In the order they play: the latest roundup, then late corrections, then
 * rank-ups and crumbles (against the rank you last saw), then passes on this week. Passes are net against the standing you last
 * acknowledged, so passing and being re-passed before you looked is nothing.
 * None on a Monday: everyone restarts at 0, and Monday is the roundup's.
 */
export function pendingMoments(
  people: PersonView[], viewer: string | null, state: CompetitionState, results: WeekResult[],
): Moment[] {
  const me = people.find((p) => p.profile.id === viewer);
  if (!me) return [];
  const out: Moment[] = [];

  const latest = results[results.length - 1];
  if (latest && state.results[latest.week] === undefined) out.push({ kind: "results", result: latest });
  for (const r of results) {
    const shown = state.results[r.week];
    if (shown !== undefined && shown !== shownAs(r)) out.push({ kind: "late", result: r });
  }

  for (const p of people) {
    const was = state.ranks?.[p.profile.id];
    if (!was) continue;
    const now = shownRank(p).rank;
    if (now === was.rank) continue;
    if (rankOrder(now) > rankOrder(was.rank)) out.push({ kind: "rankUp", id: p.profile.id, from: was.rank, to: now as Rank });
    else out.push({ kind: "crumble", id: p.profile.id, from: was.rank as Rank, to: now });
  }

  const today = me.meta.todayKey;
  const now = standingNow(people, today);
  const was = state.standing;
  if (!isMonday(today) && was && was.week === now.week) {
    const meWas = was.order.indexOf(me.profile.id);
    const meNow = now.order.indexOf(me.profile.id);
    if (meWas >= 0 && meNow >= 0) {
      const others = now.order.filter((id) => id !== me.profile.id && was.order.includes(id));
      const passed = others.filter((id) => was.order.indexOf(id) < meWas && now.order.indexOf(id) > meNow);
      const passedBy = others.filter((id) => was.order.indexOf(id) > meWas && now.order.indexOf(id) < meNow);
      if (passed.length > 0) out.push({ kind: "passed", ids: passed });
      if (passedBy.length > 0) out.push({ kind: "passedBy", ids: passedBy });
    }
  }
  return out;
}

/** Everything marked as seen. Sent when the pill is tapped. */
export function ackPatch(people: PersonView[], viewer: string | null, results: WeekResult[]): Partial<CompetitionState> {
  const me = people.find((p) => p.profile.id === viewer);
  return {
    results: Object.fromEntries(results.map((r) => [r.week, shownAs(r)])),
    ranks: Object.fromEntries(people.map((p) => [p.profile.id, shownRank(p)])),
    ...(me ? { standing: standingNow(people, me.meta.todayKey) } : {}),
  };
}

/**
 * Bookkeeping that needs no tap: older roundups you missed (only the latest
 * gets a showing), and a fresh standing baseline for a new week, a first
 * visit, or a Monday. Null when there is nothing to save.
 */
export function silentPatch(
  people: PersonView[], viewer: string | null, state: CompetitionState, results: WeekResult[],
): Partial<CompetitionState> | null {
  const me = people.find((p) => p.profile.id === viewer);
  if (!me) return null;
  const patch: Partial<CompetitionState> = {};
  const missed = results.slice(0, -1).filter((r) => state.results[r.week] === undefined);
  if (missed.length > 0) patch.results = Object.fromEntries(missed.map((r) => [r.week, shownAs(r)]));
  const now = standingNow(people, me.meta.todayKey);
  if (!state.standing || state.standing.week !== now.week || isMonday(me.meta.todayKey)) patch.standing = now;
  const unseen = people.filter((p) => !state.ranks?.[p.profile.id]);
  if (unseen.length > 0) patch.ranks = Object.fromEntries(unseen.map((p) => [p.profile.id, shownRank(p)]));
  return Object.keys(patch).length > 0 ? patch : null;
}

export const isRankMoment = (m: Moment) => m.kind === "rankUp" || m.kind === "crumble";

/** The streak each pending rank moment should keep showing until it plays. */
export function heldStreaks(state: CompetitionState, moments: Moment[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of moments) {
    if (m.kind !== "rankUp" && m.kind !== "crumble") continue;
    const was = state.ranks?.[m.id];
    if (was) out[m.id] = was.streak;
  }
  return out;
}

/** The line on the pill: what happened, not "something happened". */
export function momentHeadline(m: Moment, people: PersonView[], viewer: string | null): string {
  const byId = new Map(people.map((p) => [p.profile.id, p]));
  const name = (id: string) => byId.get(id)?.profile.displayName ?? id;
  const list = (ids: string[]) => ids.map(name).join(" and ");
  switch (m.kind) {
    case "results":
      return `🏆 Week ${crewWeek(m.result.week)} results are in`;
    case "late":
      return m.result.winner
        ? `Late sync: ${name(m.result.winner)} took week ${crewWeek(m.result.week)} after all`
        : `Late sync: week ${crewWeek(m.result.week)} ended level after all`;
    case "rankUp":
      return `🛡 ${m.id === viewer ? "You" : name(m.id)} reached ${RANK_NAME[m.to]}`;
    case "crumble":
      return `${m.id === viewer ? "Your" : `${name(m.id)}'s`} ${RANK_NAME[m.from]} streak crumbled`;
    case "passed":
      return `⚡ You passed ${list(m.ids)} this week`;
    case "passedBy": {
      const me = viewer ? byId.get(viewer) : undefined;
      const day = me?.meta.todayKey ?? "";
      const top = Math.max(...m.ids.map((id) => { const p = byId.get(id); return p ? scoreNow(p, "week", day) : 0; }));
      const gap = top - (me ? scoreNow(me, "week", day) : 0);
      return `${list(m.ids)} passed you this week — ${gap.toLocaleString("en-US")} behind`;
    }
  }
}
