"use client";
import { useMemo, useState } from "react";
import type { FeedItem, PersonView } from "@/lib/types";

function ago(ts: number, now: number): string {
  const mins = Math.max(0, Math.round((now - ts) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export default function Feed({ items, people }: { items: FeedItem[]; people: PersonView[] }) {
  const [only, setOnly] = useState<string | null>(null);
  const names = useMemo(
    () => new Map(people.map((p) => [p.profile.id, p.profile.displayName])), [people]);
  const now = Date.now();

  const shown = only ? items.filter((i) => i.user === only) : items;

  return (
    <div>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        {people.map((p) => (
          <button key={p.profile.id} data-testid={`chip-${p.profile.id}`}
                  onClick={() => setOnly(only === p.profile.id ? null : p.profile.id)}
                  className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                    only === p.profile.id
                      ? "border-sky-400 bg-sky-500/20 text-sky-200"
                      : "border-neutral-800 text-neutral-400 hover:border-neutral-700"}`}>
            {p.profile.displayName}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p data-testid="feed-empty" className="px-4 py-12 text-center text-sm text-neutral-400">
          No cards yet. They appear as soon as someone studies.
        </p>
      ) : (
        <ul>
          {shown.map((item) => (
            <li key={item.id} data-testid={`item-${item.id}`} data-lapse={String(item.ease === 1)}
                className="flex items-baseline gap-3 border-b border-neutral-900 px-4 py-3">
              <span className="w-14 shrink-0 truncate text-xs text-neutral-500">
                {names.get(item.user) ?? item.user}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-base font-medium">{item.front}</span>
                {item.back && <span className="ml-2 text-sm text-neutral-400">{item.back}</span>}
                <span className="mt-0.5 block text-[11px] text-neutral-600">
                  {item.deck}
                  {item.ease === 1 && <span className="ml-2 text-amber-400/80">missed</span>}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-neutral-600">{ago(item.ts, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
