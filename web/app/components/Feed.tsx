"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/app/components/Avatar";
import FeedCard from "@/app/components/FeedCard";
import type { Engagement, FeedItem, PersonView } from "@/lib/types";

export { EMOJI, ago } from "@/app/components/FeedCard";

export default function Feed({
  items, people, engagement = {}, viewer, apiKey,
  onReact, onComment, unreadSince = 0, jumpSignal = 0,
}: {
  items: FeedItem[];
  people: PersonView[];
  engagement?: Record<string, Engagement>;
  viewer?: string | null;
  apiKey?: string;
  onReact?: (itemId: string, emoji: string | null) => void;
  onComment?: (itemId: string, text: string) => void;
  /** Comments newer than this are marked as new. */
  unreadSince?: number;
  /** Bumping this scrolls to the first card with an unread comment. */
  jumpSignal?: number;
}) {
  const [only, setOnly] = useState<string | null>(null);
  const [quizzed, setQuizzed] = useState<Set<string>>(new Set());
  const [openThread, setOpenThread] = useState<string | null>(null);
  // Keyed by card, so a half-written comment stays on the card it was for.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const unreadRef = useRef<HTMLLIElement | null>(null);
  const jumpedFor = useRef(0);

  const byId = useMemo(() => new Map(people.map((p) => [p.profile.id, p])), [people]);
  const indexOf = useMemo(
    () => new Map(people.map((p, i) => [p.profile.id, i])), [people]);

  const now = Date.now();
  const shown = only ? items.filter((i) => i.user === only) : items;

  const firstUnreadId = useMemo(() => {
    for (const item of items) {
      const cs = engagement[item.id]?.comments ?? [];
      if (cs.some((c) => c.at > unreadSince && c.user !== viewer)) return item.id;
    }
    return null;
  }, [items, engagement, unreadSince, viewer]);

  // Once per bump: a refresh that moves the first unread card must not drag
  // you away from whatever you are reading.
  useEffect(() => {
    if (jumpSignal > 0 && jumpSignal !== jumpedFor.current && unreadRef.current) {
      jumpedFor.current = jumpSignal;
      unreadRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      if (firstUnreadId) setOpenThread(firstUnreadId);
    }
  }, [jumpSignal, firstUnreadId]);

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
      <div className="flex flex-wrap items-center gap-2 px-4 py-3">
        {people.map((p) => {
          const on = only === p.profile.id;
          return (
            <button
              key={p.profile.id}
              data-testid={`chip-${p.profile.id}`}
              aria-pressed={on}
              onClick={() => setOnly(on ? null : p.profile.id)}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] transition-colors"
              style={{
                borderColor: on ? "var(--edge-lit)" : "var(--edge)",
                background: on ? "var(--pane-lift)" : "transparent",
                color: on ? "var(--ink)" : "var(--ink-dim)",
              }}
            >
              <Avatar profile={p.profile} size={16} index={indexOf.get(p.profile.id) ?? 0} />
              {p.profile.displayName}
            </button>
          );
        })}
        <span className="ml-auto text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
          tap a word to hide the meaning
        </span>
      </div>

      {shown.length === 0 ? (
        <div data-testid="feed-empty" className="px-6 py-16 text-center">
          <p className="text-[15px]" style={{ color: "var(--ink-dim)" }}>No cards yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px]" style={{ color: "var(--ink-faint)" }}>
            Whatever any of you reviews next shows up here, in whatever deck it came from.
          </p>
        </div>
      ) : (
        <ul className="space-y-2 px-3 pb-6">
          {shown.map((item) => (
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
              onToggleThread={() => setOpenThread(openThread === item.id ? null : item.id)}
              freshSince={unreadSince}
              draft={drafts[item.id] ?? ""}
              onDraft={(text) => setDrafts((prev) => ({ ...prev, [item.id]: text }))}
              onSubmit={() => submit(item.id)}
              onReact={onReact}
              cardRef={item.id === firstUnreadId ? unreadRef : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
