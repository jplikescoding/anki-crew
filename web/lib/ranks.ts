import { currentDayKey, currentStreak, shiftDays, streakTier } from "@/lib/metrics";
import { zoneFor } from "@/lib/competition";
import type { PersonView, Rank, ShownRank } from "@/lib/types";

export const RANKS: readonly Rank[] = ["bronze", "silver", "gold", "platinum", "diamond"];

export const RANK_NAME: Record<Rank, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
  platinum: "Platinum",
  diamond: "Diamond",
};

/** Bronze at the first streak tier, one rank per tier after. */
export function rankFor(streak: number): Rank | null {
  const { tier } = streakTier(streak);
  return tier === 0 ? null : RANKS[tier - 1];
}

export function rankOrder(rank: Rank | null): number {
  return rank === null ? -1 : RANKS.indexOf(rank);
}

/**
 * The streak a rank is judged on. A missed day only counts once a sync after
 * it confirms it, or once a second day has gone by: the publisher only sends
 * when Anki closes.
 */
export function rankStreak(p: PersonView): number {
  const synced = currentDayKey(zoneFor(p), "", p.meta.lastPublishAt);
  const floor = shiftDays(p.meta.todayKey, -1);
  const asOf = synced >= p.meta.todayKey ? p.meta.todayKey : synced > floor ? synced : floor;
  return currentStreak(p.days, asOf);
}

export function shownRank(p: PersonView): ShownRank {
  const streak = rankStreak(p);
  return { rank: rankFor(streak), streak };
}

const BANNER: Record<Rank, [string, string] | null> = {
  bronze: null,
  silver: ["#5b21b6", "#2e1065"],
  gold: ["#1e3a8a", "#0b1437"],
  platinum: ["#047857", "#022c22"],
  diamond: ["#27272a", "#09090b"],
};

/** Winner's banner gradient; none below Silver. */
export function bannerColors(rank: Rank | null): [string, string] | null {
  return rank === null ? null : BANNER[rank];
}
