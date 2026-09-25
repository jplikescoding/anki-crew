"use client";
import type { ReactNode, Ref } from "react";
import { Avatar } from "@/app/components/Avatar";
import type { Comment, Engagement, FeedItem, PersonView } from "@/lib/types";

export const EMOJI = ["🔥", "💀", "😂", "👏", "🎌"];
export const MAX_COMMENT_CHARS = 280;

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

export default function FeedCard({
  item, byId, indexOf, engagement, viewer, canWrite, now, hidden, onToggleQuiz,
  open, onToggleThread, freshSince, draft, onDraft, onSubmit, onReact, cardRef, footer, arrived,
}: {
  item: FeedItem;
  byId: Map<string, PersonView>;
  indexOf: Map<string, number>;
  engagement?: Engagement;
  viewer?: string | null;
  canWrite: boolean;
  now: number;
  hidden: boolean;              // meaning blurred (quiz)
  onToggleQuiz: () => void;
  open: boolean;                // thread open
  onToggleThread: () => void;
  freshSince: number;           // other people's comments after this are "new"
  draft: string;
  onDraft: (text: string) => void;
  onSubmit: () => void;
  onReact?: (itemId: string, emoji: string | null) => void;
  cardRef?: Ref<HTMLLIElement>;
  footer?: ReactNode;           // under the comment box while open
  /** Just navigated to; glows once. */
  arrived?: boolean;
}) {
  const lapse = item.ease === 1;
  const who = byId.get(item.user);
  const idx = indexOf.get(item.user) ?? 0;
  const reactions = engagement?.reactions ?? {};
  const comments = engagement?.comments ?? [];
  const mine = viewer ? reactions[viewer] : undefined;
  const isFresh = (c: Comment) => c.at > freshSince && c.user !== viewer;
  const newOnes = comments.filter(isFresh).length;

  // Group the reactions so five people pressing 🔥 reads as one 🔥 ×5.
  const tally = new Map<string, string[]>();
  for (const [uid, emoji] of Object.entries(reactions)) {
    tally.set(emoji, [...(tally.get(emoji) ?? []), byId.get(uid)?.profile.displayName ?? uid]);
  }

  return (
    <li
      data-testid={`item-${item.id}`}
      data-lapse={String(lapse)}
      ref={cardRef}
      className={`pane overflow-hidden${arrived ? " card-arrive" : ""}`}
      style={{ borderColor: lapse ? "rgba(251,113,133,.24)" : "var(--edge)" }}
    >
      <button
        onClick={onToggleQuiz}
        title="Tap to hide the meaning"
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
          onClick={onToggleThread}
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
                const fresh = isFresh(c);
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
                onChange={(ev) => onDraft(ev.target.value)}
                onKeyDown={(ev) => { if (ev.key === "Enter") onSubmit(); }}
                placeholder="Add a comment"
                className="min-w-0 flex-1 rounded-lg border bg-transparent px-2.5 py-1.5 text-[12.5px] outline-none"
                style={{ borderColor: "var(--edge)", color: "var(--ink)" }}
              />
              <button
                onClick={() => onSubmit()}
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
          {footer}
        </div>
      )}
    </li>
  );
}
