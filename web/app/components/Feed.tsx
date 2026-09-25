"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import BackToTop, { scrollBehavior, scrollToTop } from "@/app/components/BackToTop";
import FeedCard from "@/app/components/FeedCard";
import FeedFilters from "@/app/components/FeedFilters";
import {
  applyFilter, emptyMessage, groupByDay, isFiltered, NO_FILTER, type FeedFilter,
} from "@/lib/feedView";
import { isUnread, newestIn, readUpTo, unreadThreads, type SeenMap } from "@/lib/unread";
import { resolveCard } from "@/lib/fields";
import type { DeckStatus, Engagement, FeedItem, FieldMaps, PersonView } from "@/lib/types";

export { EMOJI, ago } from "@/app/components/FeedCard";

/** Cards rendered per step. Five hundred at once is a scroll, not a feed. */
export const PAGE = 30;

const SENTENCES_KEY = "anki-crew:sentences";

function readSentences(): boolean {
  try {
    return localStorage.getItem(SENTENCES_KEY) === "1";
  } catch {
    return false; // storage blocked: off, and just not remembered
  }
}

export default function Feed({
  items, people, engagement = {}, viewer, apiKey,
  onReact, onComment, seen = {}, onSeen, jumpSignal = 0, onMarkAllSeen, fieldMaps, inMyDeck,
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
  /** Mark every comment read up to this time. */
  onMarkAllSeen?: (upTo: number) => void;
  /** Everyone's field choices, by user id. */
  fieldMaps?: Record<string, FieldMaps>;
  /** Friends' cards: is the word in the viewer's decks. */
  inMyDeck?: Record<string, DeckStatus | "none">;
}) {
  const [filter, setFilter] = useState<FeedFilter>(NO_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const [sentences, setSentences] = useState(readSentences);
  const toggleSentences = () => {
    const next = !sentences;
    setSentences(next);
    try { localStorage.setItem(SENTENCES_KEY, next ? "1" : "0"); } catch { /* not remembered */ }
  };
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
  const cardRefs = useRef(new Map<string, HTMLLIElement>());
  // The card to bring into view once it's rendered.
  const [target, setTarget] = useState<string | null>(null);
  // The card you were just taken to, which glows once as it arrives.
  const [arrived, setArrived] = useState<string | null>(null);
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

  // Mark all read takes two taps. The first only arms it, for 3 seconds.
  const [arming, setArming] = useState(false);
  useEffect(() => {
    if (!arming) return;
    const t = window.setTimeout(() => setArming(false), 3000);
    return () => window.clearTimeout(t);
  }, [arming]);

  const markAll = () => {
    if (!arming) { setArming(true); return; }
    setArming(false);
    // Up to the newest comment on screen, so one that lands a second later still notifies.
    onMarkAllSeen?.(Math.max(0, ...Object.values(engagement).map(newestIn)));
    // Let go of the cards kept only because they had been unread.
    setPinned(new Set());
  };

  const goTo = (id: string) => {
    openThreadFor(id);
    setTarget(id);
  };

  const shownIds = new Set(shown.map((i) => i.id));
  // Newest unread first, among what the current filters show.
  const nextUnread = unread.find((id) => id !== openThread && shownIds.has(id)) ?? null;

  const openThreadFor = (id: string) => {
    setBaseline((prev) => ({ ...prev, [id]: readUpTo(seen, id) }));
    setOpenThread(id);
  };
  const toggleThread = (id: string) => (openThread === id ? setOpenThread(null) : openThreadFor(id));
  const freshSince = (id: string) =>
    !me ? Infinity : openThread === id ? (baseline[id] ?? readUpTo(seen, id)) : readUpTo(seen, id);

  // Scroll once the card is rendered, growing the page first if it's further down.
  useEffect(() => {
    if (!target) return;
    const idx = shown.findIndex((i) => i.id === target);
    if (idx < 0) { setTarget(null); return; }
    if (idx >= limit) { setLimit(Math.ceil((idx + 1) / PAGE) * PAGE); return; }
    cardRefs.current.get(target)?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    setArrived(target);
    setTarget(null);
  }, [target, shown, limit]);

  // Once per bump: a refresh that brings in newer comments must not drag you
  // away from whatever you are reading. Other filters are dropped because
  // they could hide the very card the badge is pointing at.
  useEffect(() => {
    if (jumpSignal === 0 || jumpSignal === jumpedFor.current) return;
    jumpedFor.current = jumpSignal;
    changeFilter({ ...NO_FILTER, unread: true });
    if (firstUnreadId) goTo(firstUnreadId);
  }, [jumpSignal, firstUnreadId]);

  // Re-bound every render so it always sees the current next thread.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === "n" && nextUnread) goTo(nextUnread);
      else if (k === "g") scrollToTop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Having a thread open is reading it, including comments that land while it
  // is -- but only while its card is actually on screen. A filter change can
  // leave it open without rendering it; the thread stays open so it resumes
  // correctly if the filter clears, and gets marked read once it's shown again.
  useEffect(() => {
    if (!openThread || !onSeen) return;
    if (!shown.slice(0, limit).some((i) => i.id === openThread)) return;
    const fresh = (engagement[openThread]?.comments ?? [])
      .filter((c) => isUnread(c, openThread, me, seen));
    if (fresh.length === 0) return;
    const upTo = newestIn(engagement[openThread]);
    if (asked.current.get(openThread) === upTo) return;
    asked.current.set(openThread, upTo);
    onSeen(openThread, upTo);
  }, [openThread, engagement, seen, me, onSeen, shown, limit]);

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
        sentences={sentences}
        onSentences={toggleSentences}
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

      {filter.unread && unread.length > 0 && onMarkAllSeen && (
        <div
          className="mx-3 mt-3 flex items-center justify-between gap-3 px-1.5 text-[11.5px]"
          style={{ color: "var(--ink-faint)" }}
        >
          <span className="tabular-nums">
            {unread.length} unread thread{unread.length === 1 ? "" : "s"}
          </span>
          <button
            data-testid="mark-all-read"
            onClick={markAll}
            className="min-h-8 rounded-full px-3 transition-colors duration-150"
            style={{
              color: arming ? "#04121A" : "var(--cyan-soft)",
              background: arming ? "var(--cyan)" : "transparent",
            }}
          >
            {arming ? `Tap again to mark ${unread.length} read` : "Mark all read"}
          </button>
        </div>
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
                className="flex items-baseline gap-1.5 px-1.5 pb-2 pt-5 text-[11.5px] font-semibold tracking-[.01em]"
                style={{ color: "var(--ink-dim)" }}
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
                    card={resolveCard(item, fieldMaps?.[item.user]?.[item.noteType ?? ""])}
                    deckStatus={inMyDeck?.[item.id]}
                    sentencesOn={sentences}
                    cardRef={(el) => {
                      if (el) cardRefs.current.set(item.id, el);
                      else cardRefs.current.delete(item.id);
                    }}
                    arrived={arrived === item.id}
                    footer={openThread === item.id && nextUnread ? (
                      <button
                        data-testid="next-unread"
                        onClick={() => goTo(nextUnread)}
                        className="group mt-2.5 inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-[11.5px] transition duration-150 hover:bg-[rgba(34,211,238,.12)]! active:scale-[.97]"
                        style={{ borderColor: "rgba(34,211,238,.3)", background: "rgba(34,211,238,.06)", color: "var(--cyan-soft)" }}
                      >
                        Next unread <span aria-hidden className="transition-transform duration-150 group-hover:translate-x-0.5">→</span>
                      </button>
                    ) : undefined}
                  />
                ))}
              </ul>
            </section>
          ))}
          {shown.length > limit && (
            <button
              data-testid="show-more"
              onClick={() => setLimit((l) => l + PAGE)}
              className="pane mt-3 min-h-10 w-full text-[12px] tabular-nums transition duration-150 hover:bg-[var(--pane-lift)] active:scale-[.99]"
              style={{ color: "var(--ink-dim)" }}
            >
              Show {Math.min(PAGE, shown.length - limit)} more · {shown.length - limit} left
            </button>
          )}
        </div>
      )}

      <BackToTop />
    </div>
  );
}
