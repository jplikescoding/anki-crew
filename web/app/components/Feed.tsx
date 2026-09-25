"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import FeedCard from "@/app/components/FeedCard";
import FeedFilters from "@/app/components/FeedFilters";
import {
  applyFilter, emptyMessage, groupByDay, isFiltered, NO_FILTER, type FeedFilter,
} from "@/lib/feedView";
import { isUnread, newestIn, readUpTo, unreadThreads, type SeenMap } from "@/lib/unread";
import type { Engagement, FeedItem, PersonView } from "@/lib/types";

export { EMOJI, ago } from "@/app/components/FeedCard";

/** Cards rendered per step. Five hundred at once is a scroll, not a feed. */
export const PAGE = 30;

export default function Feed({
  items, people, engagement = {}, viewer, apiKey,
  onReact, onComment, seen = {}, onSeen, jumpSignal = 0,
}: {
  items: FeedItem[];
  people: PersonView[];
  engagement?: Record<string, Engagement>;
  viewer?: string | null;
  apiKey?: string;
  onReact?: (itemId: string, emoji: string | null) => void;
  onComment?: (itemId: string, text: string) => void;
  /** How far you've read each thread, plus the floor. See lib/unread. */
  seen?: SeenMap;
  /** A thread with something unread is open; upTo is its newest comment shown. */
  onSeen?: (itemId: string, upTo: number) => void;
  /** Bumping this opens the thread with the newest unread comment. */
  jumpSignal?: number;
}) {
  const [filter, setFilter] = useState<FeedFilter>(NO_FILTER);
  const [limit, setLimit] = useState(PAGE);
  // Every thread that has been unread while the Unread filter is on. Reading
  // one must not pull it out from under you mid-list.
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [quizzed, setQuizzed] = useState<Set<string>>(new Set());
  const [openThread, setOpenThread] = useState<string | null>(null);
  // What counted as read when each thread was opened. Opening one marks it
  // read, and its "new" pills must not vanish while you're reading them.
  const [baseline, setBaseline] = useState<Record<string, number>>({});
  // Keyed by card, so a half-written comment stays on the card it was for.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const unreadRef = useRef<HTMLLIElement | null>(null);
  const jumpedFor = useRef(0);
  // The newest comment each thread was last marked read for. A save that fails
  // reloads the old read state; without this, that would ask again, fail
  // again, and reload forever.
  const asked = useRef(new Map<string, number>());

  const byId = useMemo(() => new Map(people.map((p) => [p.profile.id, p])), [people]);
  const indexOf = useMemo(
    () => new Map(people.map((p, i) => [p.profile.id, i])), [people]);

  const now = Date.now();

  const me = viewer ?? null;
  const unread = useMemo(() => unreadThreads(engagement, me, seen), [engagement, me, seen]);
  const firstUnreadId = unread[0] ?? null;

  const tz = (me && byId.get(me)?.profile.tz) || "UTC";

  useEffect(() => {
    if (!filter.unread) return;
    setPinned((prev) => (unread.every((id) => prev.has(id)) ? prev : new Set([...prev, ...unread])));
  }, [filter.unread, unread]);

  const unreadIds = useMemo(() => new Set([...pinned, ...unread]), [pinned, unread]);
  const shown = useMemo(
    () => applyFilter(items, filter, engagement, unreadIds),
    [items, filter, engagement, unreadIds]);
  const groups = groupByDay(shown.slice(0, limit), shown, tz, now);
  const caughtUp = filter.unread && unread.length === 0;
  const personName = filter.person
    ? byId.get(filter.person)?.profile.displayName ?? filter.person
    : null;

  const changeFilter = (next: FeedFilter) => {
    setFilter(next);
    setLimit(PAGE);
    if (!next.unread) setPinned(new Set());
  };

  const openThreadFor = (id: string) => {
    setBaseline((prev) => ({ ...prev, [id]: readUpTo(seen, id) }));
    setOpenThread(id);
  };
  const toggleThread = (id: string) => (openThread === id ? setOpenThread(null) : openThreadFor(id));
  const freshSince = (id: string) =>
    !me ? Infinity : openThread === id ? (baseline[id] ?? readUpTo(seen, id)) : readUpTo(seen, id);

  // Once per bump: a refresh that moves the first unread card must not drag
  // you away from whatever you are reading.
  useEffect(() => {
    if (jumpSignal > 0 && jumpSignal !== jumpedFor.current && unreadRef.current) {
      jumpedFor.current = jumpSignal;
      unreadRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      if (firstUnreadId) openThreadFor(firstUnreadId);
    }
  }, [jumpSignal, firstUnreadId]);

  // Having a thread open is reading it, including comments that land while it is.
  useEffect(() => {
    if (!openThread || !onSeen) return;
    const fresh = (engagement[openThread]?.comments ?? [])
      .filter((c) => isUnread(c, openThread, me, seen));
    if (fresh.length === 0) return;
    const upTo = newestIn(engagement[openThread]);
    if (asked.current.get(openThread) === upTo) return;
    asked.current.set(openThread, upTo);
    onSeen(openThread, upTo);
  }, [openThread, engagement, seen, me, onSeen]);

  const toggleQuiz = (id: string) =>
    setQuizzed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const submit = (itemId: string) => {
    const text = (drafts[itemId] ?? "").trim();
    if (!text) return;
    onComment?.(itemId, text);
    setDrafts((prev) => ({ ...prev, [itemId]: "" }));
  };

  const canWrite = Boolean(apiKey && viewer);

  return (
    <div>
      <FeedFilters
        people={people}
        indexOf={indexOf}
        filter={filter}
        onChange={changeFilter}
        unreadCount={unread.length}
      />

      {caughtUp && (
        <p
          data-testid="caught-up"
          className="lane-enter mx-3 mt-3 rounded-[var(--r-lane)] border px-4 py-2.5 text-center text-[12px]"
          style={{ borderColor: "rgba(52,211,153,.28)", background: "rgba(52,211,153,.07)", color: "var(--jade)" }}
        >
          All caught up ✓
        </p>
      )}

      {shown.length === 0 ? (
        caughtUp ? null : isFiltered(filter) ? (
          <div data-testid="feed-empty" className="px-6 py-16 text-center">
            <p className="text-[14px]" style={{ color: "var(--ink-dim)" }}>{emptyMessage(filter, personName)}</p>
            <button
              data-testid="clear-filters"
              onClick={() => changeFilter(NO_FILTER)}
              className="mt-2 min-h-8 text-[12px]"
              style={{ color: "var(--cyan-soft)" }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div data-testid="feed-empty" className="px-6 py-16 text-center">
            <p className="text-[15px]" style={{ color: "var(--ink-dim)" }}>No cards yet.</p>
            <p className="mx-auto mt-2 max-w-sm text-[13px]" style={{ color: "var(--ink-faint)" }}>
              Whatever any of you reviews next shows up here, in whatever deck it came from.
            </p>
          </div>
        )
      ) : (
        <div className="px-3 pb-6">
          {groups.map((g) => (
            <section key={g.key} data-testid={`day-${g.key}`}>
              <h3
                className="flex items-baseline gap-1.5 px-1.5 pb-2 pt-4 text-[10.5px] font-semibold uppercase tracking-[.09em]"
                style={{ color: "var(--ink-faint)" }}
              >
                <span data-testid="day-label">{g.label}</span>
                <span className="font-normal tabular-nums" style={{ color: "var(--ink-ghost)" }}>· {g.count}</span>
              </h3>
              <ul className="space-y-2">
                {g.items.map((item) => (
                  <FeedCard
                    key={item.id}
                    item={item}
                    byId={byId}
                    indexOf={indexOf}
                    engagement={engagement[item.id]}
                    viewer={viewer}
                    canWrite={canWrite}
                    now={now}
                    hidden={quizzed.has(item.id)}
                    onToggleQuiz={() => toggleQuiz(item.id)}
                    open={openThread === item.id}
                    onToggleThread={() => toggleThread(item.id)}
                    freshSince={freshSince(item.id)}
                    draft={drafts[item.id] ?? ""}
                    onDraft={(text) => setDrafts((prev) => ({ ...prev, [item.id]: text }))}
                    onSubmit={() => submit(item.id)}
                    onReact={onReact}
                    cardRef={item.id === firstUnreadId ? unreadRef : undefined}
                  />
                ))}
              </ul>
            </section>
          ))}
          {shown.length > limit && (
            <button
              data-testid="show-more"
              onClick={() => setLimit((l) => l + PAGE)}
              className="pane mt-3 min-h-10 w-full text-[12px] transition-colors duration-150 hover:bg-[var(--pane-lift)]"
              style={{ color: "var(--ink-dim)" }}
            >
              Show {Math.min(PAGE, shown.length - limit)} more · {shown.length - limit} left
            </button>
          )}
        </div>
      )}
    </div>
  );
}
