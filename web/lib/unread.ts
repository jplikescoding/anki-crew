import type { Comment, Engagement } from "@/lib/types";

/**
 * What you have and haven't read.
 *
 * Read state is per thread, not per visit: a comment stays unread until you
 * open the card it is on. Glancing at the feed reads nothing. That is the whole
 * fix for a comment getting lost behind a badge that cleared too early.
 */

/** Reserved field: comments at or before it count as read everywhere. */
export const FLOOR = "_floor";

/** Card id -> when you last opened its thread, plus FLOOR. */
export type SeenMap = Record<string, number>;

export function readUpTo(seen: SeenMap, itemId: string): number {
  return Math.max(seen[itemId] ?? 0, seen[FLOOR] ?? 0);
}

export function isUnread(c: Comment, itemId: string, viewer: string | null, seen: SeenMap): boolean {
  if (!viewer) return false;
  return c.user !== viewer && c.at > readUpTo(seen, itemId);
}

export function unreadCount(
  engagement: Record<string, Engagement>, viewer: string | null, seen: SeenMap,
): number {
  let n = 0;
  for (const [id, e] of Object.entries(engagement)) {
    n += e.comments.filter((c) => isUnread(c, id, viewer, seen)).length;
  }
  return n;
}

/** Threads with anything unread, the one with the newest unread comment first. */
export function unreadThreads(
  engagement: Record<string, Engagement>, viewer: string | null, seen: SeenMap,
): string[] {
  const newest: [string, number][] = [];
  for (const [id, e] of Object.entries(engagement)) {
    const ats = e.comments.filter((c) => isUnread(c, id, viewer, seen)).map((c) => c.at);
    if (ats.length > 0) newest.push([id, Math.max(...ats)]);
  }
  return newest.sort((x, y) => y[1] - x[1]).map(([id]) => id);
}

/**
 * Local and server read state, combined. Opening a thread is saved in the
 * background, so a refresh can return a copy from before the save landed;
 * taking the later time per thread means that copy can't un-read anything.
 */
export function mergeSeen(a: SeenMap, b: SeenMap): SeenMap {
  const out: SeenMap = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? 0, v);
  return out;
}

/**
 * The newest comment on a card. "Mark read" sends this rather than the clock,
 * so a comment that arrived after your last refresh, one you never saw, stays
 * unread.
 */
export function newestIn(e: Engagement | undefined): number {
  return Math.max(0, ...(e?.comments ?? []).map((c) => c.at));
}
