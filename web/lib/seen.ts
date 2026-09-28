/**
 * What this browser last showed you.
 *
 * The dashboard's payoff is the difference between what you saw last time and
 * what is true now, so that "last time" has to live somewhere. It lives here,
 * per browser, and never leaves the device — it is a display detail, not data.
 *
 * Passes and the board's arrows are measured on the server (competition:<id>),
 * so they play once across devices; this only drives the "+N since you last
 * looked" line, the count-up, and What's new's "been here before".
 */
const KEY = "anki-crew:seen:v1";

export type Seen = {
  /** Today's review count per person, as of your last visit. */
  totals: Record<string, number>;
  at: number;
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
