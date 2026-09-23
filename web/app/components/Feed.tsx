"use client";
import { useMemo, useState } from "react";
import type { FeedItem, PersonView } from "@/lib/types";

const HUES = ["var(--violet-soft)", "var(--cyan-soft)", "var(--gold)"];

/**
 * Relative age. Each unit is derived from the original millisecond delta rather
 * than from a previously rounded one, so a card reviewed 23½ hours ago reads as
 * hours and not as a day.
 */
function ago(ts: number, now: number): string {
  const ms = Math.max(0, now - ts);
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  if (ms < 24 * 60 * 60 * 1000) return `${Math.round(ms / 3600000)}h`;
  return `${Math.round(ms / 86400000)}d`;
}

export default function Feed({ items, people }: { items: FeedItem[]; people: PersonView[] }) {
  const [only, setOnly] = useState<string | null>(null);
  const [quizzed, setQuizzed] = useState<Set<string>>(new Set());

  const names = useMemo(
    () => new Map(people.map((p) => [p.profile.id, p.profile.displayName])), [people]);
  const hue = useMemo(
    () => new Map(people.map((p, i) => [p.profile.id, HUES[i % HUES.length]])), [people]);

  const now = Date.now();
  const shown = only ? items.filter((i) => i.user === only) : items;

  const toggleQuiz = (id: string) =>
    setQuizzed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

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
              className="rounded-full border px-3 py-1 text-[11.5px] transition-colors"
              style={{
                borderColor: on ? "var(--edge-lit)" : "var(--edge)",
                background: on ? "var(--pane-lift)" : "transparent",
                color: on ? "var(--ink)" : "var(--ink-dim)",
              }}
            >
              {p.profile.displayName}
            </button>
          );
        })}
        <span className="ml-auto text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
          tap a card to hide the meaning
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
            return (
              <li key={item.id} data-testid={`item-${item.id}`} data-lapse={String(lapse)}>
                <button
                  onClick={() => toggleQuiz(item.id)}
                  className="pane flex w-full items-start gap-3 px-4 py-3 text-left transition-colors"
                  style={{ borderColor: lapse ? "rgba(251,113,133,.24)" : "var(--edge)" }}
                >
                  <span
                    className="mt-[3px] w-11 shrink-0 truncate text-[10.5px] font-medium"
                    style={{ color: hue.get(item.user) ?? "var(--ink-faint)" }}
                  >
                    {names.get(item.user) ?? item.user}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="jp block text-[19px] font-medium leading-snug">{item.front}</span>
                    {item.back && (
                      <span
                        className="mt-[3px] block text-[13px] transition-all"
                        style={{
                          color: hidden ? "transparent" : "var(--ink-dim)",
                          textShadow: hidden ? "0 0 11px rgba(165,174,196,.85)" : "none",
                        }}
                      >
                        {item.back}
                      </span>
                    )}
                    <span className="mt-1.5 block text-[10px]" style={{ color: "var(--ink-ghost)" }}>
                      {item.deck}
                      {lapse && <span style={{ color: "var(--rose)" }}> · missed it</span>}
                    </span>
                  </span>

                  <span className="shrink-0 text-[10.5px] tabular-nums" style={{ color: "var(--ink-ghost)" }}>
                    {ago(item.ts, now)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
