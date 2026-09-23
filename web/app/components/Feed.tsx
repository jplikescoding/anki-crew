"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/app/components/Avatar";
import type { Engagement, FeedItem, PersonView } from "@/lib/types";

export const EMOJI = ["🔥", "💀", "😂", "👏", "🎌"];
const MAX_COMMENT_CHARS = 280;

/**
 * Relative age. Each unit comes from the original millisecond delta rather than
 * from a previously rounded one, so a card reviewed 23½ hours ago reads as
 * hours and not as a day.
 */
export function ago(ts: number, now: number): string {
  const ms = Math.max(0, now - ts);
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  if (ms < 24 * 60 * 60 * 1000) return `${Math.round(ms / 3600000)}h`;
  return `${Math.round(ms / 86400000)}d`;
}

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
          {shown.map((item) => {
            const lapse = item.ease === 1;
            const hidden = quizzed.has(item.id);
            const who = byId.get(item.user);
            const idx = indexOf.get(item.user) ?? 0;
            const e = engagement[item.id];
            const reactions = e?.reactions ?? {};
            const comments = e?.comments ?? [];
            const mine = viewer ? reactions[viewer] : undefined;
            const newOnes = comments.filter((c) => c.at > unreadSince && c.user !== viewer).length;
            const open = openThread === item.id;
            const draft = drafts[item.id] ?? "";

            // Group the reactions so five people pressing 🔥 reads as one 🔥 ×5.
            const tally = new Map<string, string[]>();
            for (const [uid, emoji] of Object.entries(reactions)) {
              tally.set(emoji, [...(tally.get(emoji) ?? []), byId.get(uid)?.profile.displayName ?? uid]);
            }

            return (
              <li
                key={item.id}
                data-testid={`item-${item.id}`}
                data-lapse={String(lapse)}
                ref={item.id === firstUnreadId ? unreadRef : undefined}
                className="pane overflow-hidden"
                style={{ borderColor: lapse ? "rgba(251,113,133,.24)" : "var(--edge)" }}
              >
                <button
                  onClick={() => toggleQuiz(item.id)}
                  className="flex w-full items-start gap-3 px-4 pt-3 text-left"
                >
                  {who
                    ? <Avatar profile={who.profile} size={26} index={idx} />
                    : <span className="w-[26px]" />}
                  <span className="min-w-0 flex-1">
                    <span className="jp block text-[19px] font-medium leading-snug">{item.front}</span>
                    {item.back && (
                      <span
                        className="mt-[3px] block text-[13px]"
                        style={{
                          color: hidden ? "transparent" : "var(--ink-dim)",
                          textShadow: hidden ? "0 0 11px rgba(165,174,196,.85)" : "none",
                        }}
                      >
                        {item.back}
                      </span>
                    )}
                    <span className="mt-1.5 block text-[10px]" style={{ color: "var(--ink-ghost)" }}>
                      {who?.profile.displayName ?? item.user}
                      {' · '}
                      <span>{item.deck}</span>
                      {lapse && <span style={{ color: "var(--rose)" }}> · missed it</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10.5px] tabular-nums" style={{ color: "var(--ink-ghost)" }}>
                    {ago(item.ts, now)}
                  </span>
                </button>

                <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2.5 pt-2">
                  {EMOJI.map((emoji) => {
                    const names = tally.get(emoji) ?? [];
                    const picked = mine === emoji;
                    if (!canWrite && names.length === 0) return null;
                    return (
                      <button
                        key={emoji}
                        data-testid={`react-${item.id}-${emoji}`}
                        aria-pressed={picked}
                        title={names.length ? names.join(", ") : `React ${emoji}`}
                        onClick={() => onReact?.(item.id, picked ? null : emoji)}
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[12px] transition-all duration-150 hover:scale-105 active:scale-95"
                        style={{
                          borderColor: picked ? "var(--edge-lit)" : "transparent",
                          background: picked ? "var(--pane-lift)" : names.length ? "rgba(255,255,255,.045)" : "transparent",
                          opacity: names.length || picked ? 1 : 0.4,
                        }}
                      >
                        <span>{emoji}</span>
                        {names.length > 0 && (
                          <span className="text-[10px] tabular-nums" style={{ color: "var(--ink-dim)" }}>
                            {names.length}
                          </span>
                        )}
                      </button>
                    );
                  })}

                  <button
                    data-testid={`thread-${item.id}`}
                    onClick={() => setOpenThread(open ? null : item.id)}
                    className="ml-auto rounded-full px-2 py-[3px] text-[11px] transition-colors"
                    style={{ color: newOnes > 0 ? "var(--cyan-soft)" : "var(--ink-faint)" }}
                  >
                    {comments.length === 0
                      ? (canWrite ? "say something" : "")
                      : `${comments.length} comment${comments.length === 1 ? "" : "s"}`}
                    {newOnes > 0 && <span className="ml-1">· {newOnes} new</span>}
                  </button>
                </div>

                {open && (
                  <div className="border-t px-4 py-3" style={{ borderColor: "var(--edge)" }}>
                    {comments.length > 0 && (
                      <ul className="mb-2.5 space-y-2">
                        {comments.map((c, i) => {
                          const author = byId.get(c.user);
                          const fresh = c.at > unreadSince && c.user !== viewer;
                          return (
                            <li key={`${c.at}-${i}`} className="flex items-start gap-2">
                              {author && <Avatar profile={author.profile} size={20} index={indexOf.get(c.user) ?? 0} />}
                              <span className="min-w-0 flex-1 text-[12.5px]">
                                <span className="font-semibold" style={{ color: "var(--ink)" }}>
                                  {author?.profile.displayName ?? c.user}
                                </span>{" "}
                                <span style={{ color: "var(--ink-dim)" }}>{c.text}</span>
                                {fresh && (
                                  <span className="ml-1.5 rounded px-1 text-[9px]"
                                        style={{ background: "rgba(34,211,238,.18)", color: "var(--cyan-soft)" }}>
                                    new
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 text-[10px] tabular-nums" style={{ color: "var(--ink-ghost)" }}>
                                {ago(c.at, now)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {canWrite && (
                      <div className="flex items-center gap-2">
                        <input
                          data-testid={`comment-input-${item.id}`}
                          value={draft}
                          maxLength={MAX_COMMENT_CHARS}
                          onChange={(ev) => setDrafts((prev) => ({ ...prev, [item.id]: ev.target.value }))}
                          onKeyDown={(ev) => { if (ev.key === "Enter") submit(item.id); }}
                          placeholder="Add a comment"
                          className="min-w-0 flex-1 rounded-lg border bg-transparent px-2.5 py-1.5 text-[12.5px] outline-none"
                          style={{ borderColor: "var(--edge)", color: "var(--ink)" }}
                        />
                        <button
                          onClick={() => submit(item.id)}
                          disabled={draft.trim().length === 0}
                          className="rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-opacity"
                          style={{
                            background: "var(--pane-lift)",
                            color: "var(--ink)",
                            opacity: draft.trim().length === 0 ? 0.35 : 1,
                          }}
                        >
                          Post
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
