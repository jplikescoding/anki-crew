"use client";
import { deckTotals, retention, shiftDays, totals } from "@/lib/metrics";
import type { FeedItem, PersonView } from "@/lib/types";

export default function PersonPanel({ person, items }: { person: PersonView; items: FeedItem[] }) {
  const byDate = new Map(person.days.map((d) => [d.date, d]));
  const window30 = Array.from({ length: 30 }, (_, i) => {
    const date = shiftDays(person.meta.todayKey, i - 29);
    return { date, reviews: byDate.get(date)?.reviews ?? 0 };
  });
  const peak = Math.max(1, ...window30.map((d) => d.reviews));
  const sums = totals(person.days);
  const ret = retention(person.days);
  const mine = items.filter((i) => i.user === person.profile.id).slice(0, 20);

  return (
    <section className="px-4 py-4">
      <header className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">{person.profile.displayName}</h2>
        <span className="text-xs text-neutral-500">{person.profile.tz}</span>
      </header>

      <dl className="mb-6 grid grid-cols-4 gap-3 text-center">
        <div><dt className="text-[11px] uppercase text-neutral-500">All time</dt>
          <dd data-testid="all-time" className="tabular-nums text-lg font-semibold">
            {person.meta.allTimeReviews.toLocaleString()}</dd></div>
        <div><dt className="text-[11px] uppercase text-neutral-500">Streak</dt>
          <dd className="tabular-nums text-lg font-semibold">{person.meta.streak}</dd></div>
        <div><dt className="text-[11px] uppercase text-neutral-500">New</dt>
          <dd className="tabular-nums text-lg font-semibold">{sums.newCards}</dd></div>
        <div><dt className="text-[11px] uppercase text-neutral-500">Retention</dt>
          <dd className="tabular-nums text-lg font-semibold">{ret === null ? "—" : `${ret}%`}</dd></div>
      </dl>

      <div className="mb-6 flex h-20 items-end gap-[3px]">
        {window30.map((d) => (
          <span key={d.date} data-testid="day-bar" title={`${d.date}: ${d.reviews}`}
                className="flex-1 rounded-sm bg-sky-400/70"
                style={{ height: `${Math.max(2, (d.reviews / peak) * 80)}px`,
                         opacity: d.reviews === 0 ? 0.2 : 1 }} />
        ))}
      </div>

      <h3 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Decks</h3>
      <ul className="mb-6 space-y-1 text-sm">
        {deckTotals(person.days).map(([deck, count]) => (
          <li key={deck} className="flex justify-between border-b border-neutral-900 py-1">
            <span data-testid="deck-name" className="text-neutral-300">{deck}</span>
            <span className="tabular-nums text-neutral-500">{count.toLocaleString()}</span>
          </li>
        ))}
      </ul>

      <h3 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">Recent cards</h3>
      <ul className="space-y-1 text-sm">
        {mine.map((item) => (
          <li key={item.id} className="flex items-baseline gap-2 border-b border-neutral-900 py-1">
            <span className="font-medium">{item.front}</span>
            <span className="text-neutral-500">{item.back}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
