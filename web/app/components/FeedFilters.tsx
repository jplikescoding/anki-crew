"use client";
import type { ReactNode } from "react";
import { Avatar } from "@/app/components/Avatar";
import type { FeedFilter, Outcome } from "@/lib/feedView";
import type { PersonView } from "@/lib/types";

// Rose and jade already mean "missed" and "got it" everywhere else in the app.
const OUTCOMES: [Outcome, string, string][] = [
  ["all", "All", "var(--ink)"],
  ["missed", "Missed", "var(--rose)"],
  ["got", "Got it", "var(--jade)"],
];

function Toggle({ testid, on, onClick, children }: {
  testid: string; on: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      data-testid={testid}
      aria-pressed={on}
      onClick={onClick}
      className="inline-flex min-h-8 shrink-0 items-center rounded-full border px-3 text-[11.5px] transition-colors duration-150"
      style={{
        borderColor: on ? "var(--edge-lit)" : "var(--edge)",
        background: on ? "var(--pane-lift)" : "transparent",
        color: on ? "var(--ink)" : "var(--ink-dim)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Pinned under the header so the feed can be re-sliced from anywhere in it,
 * not just from the top.
 */
export default function FeedFilters({ people, indexOf, filter, onChange, unreadCount }: {
  people: PersonView[];
  indexOf: Map<string, number>;
  filter: FeedFilter;
  onChange: (f: FeedFilter) => void;
  /** Threads with something unread. */
  unreadCount: number;
}) {
  const set = (patch: Partial<FeedFilter>) => onChange({ ...filter, ...patch });

  return (
    <div
      data-testid="feed-filters"
      className="sticky top-0 z-30 border-b backdrop-blur-md"
      style={{ background: "rgba(7,9,18,.74)", borderColor: "var(--edge)" }}
    >
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-4 py-2.5">
        {people.map((p) => {
          const on = filter.person === p.profile.id;
          return (
            <button
              key={p.profile.id}
              data-testid={`chip-${p.profile.id}`}
              aria-pressed={on}
              onClick={() => set({ person: on ? null : p.profile.id })}
              className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] transition-colors duration-150"
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

        <span aria-hidden className="h-4 w-px shrink-0" style={{ background: "var(--edge)" }} />

        <div role="group" aria-label="Outcome"
             className="flex shrink-0 rounded-full border p-0.5" style={{ borderColor: "var(--edge)" }}>
          {OUTCOMES.map(([value, label, color]) => {
            const on = filter.outcome === value;
            return (
              <button
                key={value}
                data-testid={`outcome-${value}`}
                aria-pressed={on}
                onClick={() => set({ outcome: value })}
                className="min-h-7 rounded-full px-2.5 text-[11.5px] transition-colors duration-150"
                style={{
                  background: on ? "var(--pane-lift)" : "transparent",
                  color: on ? color : "var(--ink-faint)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <Toggle testid="filter-comments" on={filter.comments}
                onClick={() => set({ comments: !filter.comments })}>
          💬&nbsp;Comments
        </Toggle>
        <Toggle testid="filter-unread" on={filter.unread}
                onClick={() => set({ unread: !filter.unread })}>
          Unread
          {unreadCount > 0 && (
            <span
              className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold tabular-nums"
              style={{ background: "var(--cyan)", color: "#04121A" }}
            >
              {unreadCount}
            </span>
          )}
        </Toggle>
      </div>
    </div>
  );
}
