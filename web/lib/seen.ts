/**
 * What this browser last showed you.
 *
 * The dashboard's payoff is the difference between what you saw last time and
 * what is true now, so that "last time" has to live somewhere. It lives here,
 * per browser, and never leaves the device — it is a display detail, not data.
 */
const KEY = "anki-crew:seen:v1";

export type Seen = {
  /** Today's review count per person, as of your last visit. */
  totals: Record<string, number>;
  /** Standings as of your last visit, best first. */
  order: string[];
  at: number;
  /** When you last opened the feed. Comments after this are new to you. */
  commentsSeenAt?: number;
};

export function readSeen(): Seen | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Seen;
    return v && typeof v === "object" && v.totals ? v : null;
  } catch {
    return null; // private mode, blocked storage, corrupt value — all fine.
  }
}

export function writeSeen(seen: Seen): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen));
  } catch {
    /* storage unavailable; the page still works, it just stops celebrating */
  }
}

/**
 * The best person you have overtaken since you last looked, or null.
 *
 * Only reports a genuine change in standings — being ahead of someone you were
 * already ahead of is not an event, and announcing it would cheapen the ones
 * that are.
 */
export function whoYouPassed(
  prev: Seen | null,
  nowOrder: string[],
  viewerId: string | null,
): string | null {
  if (!prev || !viewerId) return null;
  const was = prev.order.indexOf(viewerId);
  const now = nowOrder.indexOf(viewerId);
  if (was < 0 || now < 0 || now >= was) return null;

  // Everyone who was ahead of you and no longer is. prev.order is best-first,
  // so the first survivor of the filter is the strongest scalp — that is the
  // one worth naming.
  const overtaken = prev.order
    .slice(0, was)
    .filter((id) => nowOrder.indexOf(id) > now);
  return overtaken[0] ?? null;
}
