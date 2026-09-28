import type { DeckStatus, Engagement, FeedItem } from "@/lib/types";

/** Shaping the feed: which cards, and under which day. Pure, so it's testable without a DOM. */

export type Outcome = "all" | "missed" | "got";
/** Where a friend's word sits in your decks; "none" is not in them at all. */
export type DeckMatch = DeckStatus | "none";
export type FeedFilter = {
  person: string | null; outcome: Outcome; comments: boolean; unread: boolean; deck: DeckMatch | null;
};
export const NO_FILTER: FeedFilter = { person: null, outcome: "all", comments: false, unread: false, deck: null };

export function isFiltered(f: FeedFilter): boolean {
  return f.person !== null || f.outcome !== "all" || f.comments || f.unread || f.deck !== null;
}

/**
 * `unreadIds` is supplied rather than computed so the Feed can keep a card in
 * the Unread list after you've read it, instead of it vanishing mid-scroll.
 */
export function applyFilter(
  items: FeedItem[], f: FeedFilter,
  engagement: Record<string, Engagement>, unreadIds: Set<string>,
  inMyDeck: Record<string, DeckMatch> = {},
): FeedItem[] {
  return items.filter((i) => {
    if (f.person && i.user !== f.person) return false;
    if (f.outcome === "missed" && i.ease !== 1) return false;
    if (f.outcome === "got" && i.ease === 1) return false;
    if (f.comments && !(engagement[i.id]?.comments.length)) return false;
    if (f.unread && !unreadIds.has(i.id)) return false;
    // Your own cards carry no badge, so any deck filter leaves them out.
    if (f.deck && inMyDeck[i.id] !== f.deck) return false;
    return true;
  });
}

/** How many badged cards of each kind, for everyone or one person: the numbers in the dropdown. */
export function deckCounts(
  items: FeedItem[], inMyDeck: Record<string, DeckMatch>, person: string | null,
): Record<DeckMatch, number> {
  const out: Record<DeckMatch, number> = { known: 0, learning: 0, new: 0, none: 0 };
  for (const i of items) {
    const status = inMyDeck[i.id];
    if (status && (!person || i.user === person)) out[status] += 1;
  }
  return out;
}

const DECK_PHRASE: Record<DeckMatch, string> = {
  known: "you know", learning: "you're learning", new: "unstudied in your deck", none: "not in your deck",
};

export function emptyMessage(f: FeedFilter, personName: string | null): string {
  if (f.deck) {
    return personName
      ? `No cards from ${personName} ${DECK_PHRASE[f.deck]} yet`
      : `No friends' cards ${DECK_PHRASE[f.deck]} yet`;
  }
  const outcome = f.outcome === "missed" ? "missed " : f.outcome === "got" ? "successful " : "";
  const extra = f.unread ? " with unread comments" : f.comments ? " with comments" : "";
  const who = personName ? ` from ${personName}` : "";
  return `No ${outcome}cards${extra}${who} yet`;
}

function dayFormat(tz: string): Intl.DateTimeFormat {
  const opts = { year: "numeric", month: "2-digit", day: "2-digit" } as const;
  try {
    // en-CA formats as YYYY-MM-DD, which also sorts and compares as a string.
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: tz });
  } catch {
    // A zone this runtime doesn't know shouldn't take the feed down with it.
    return new Intl.DateTimeFormat("en-CA", { ...opts, timeZone: "UTC" });
  }
}

export function dayKey(ts: number, tz: string): string {
  return dayFormat(tz).format(ts);
}

export function dayLabel(key: string, now: number, tz: string): string {
  const today = dayKey(now, tz);
  if (key === today) return "Today";
  const y = new Date(`${today}T12:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (key === y.toISOString().slice(0, 10)) return "Yesterday";
  // The key is already a local date; format it as UTC so no zone shifts it again.
  const d = new Date(`${key}T12:00:00Z`);
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { ...o, timeZone: "UTC" }).format(d);
  return `${part({ weekday: "short" })} ${part({ day: "numeric" })} ${part({ month: "short" })}`;
}

export type DayGroup = { key: string; label: string; count: number; items: FeedItem[] };

/**
 * `page` is what's rendered; `all` is everything the filter matched, so a
 * header says how many cards that day has even before you've paged to them.
 * Both are newest first.
 */
export function groupByDay(page: FeedItem[], all: FeedItem[], tz: string, now: number): DayGroup[] {
  const fmt = dayFormat(tz);
  const counts = new Map<string, number>();
  for (const i of all) {
    const k = fmt.format(i.ts);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const groups: DayGroup[] = [];
  for (const item of page) {
    const k = fmt.format(item.ts);
    const last = groups[groups.length - 1];
    if (last && last.key === k) last.items.push(item);
    else groups.push({ key: k, label: dayLabel(k, now, tz), count: counts.get(k) ?? 0, items: [item] });
  }
  return groups;
}
