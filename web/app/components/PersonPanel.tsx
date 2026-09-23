"use client";
import { deckTotals, personalBest, retention, shiftDays, totals } from "@/lib/metrics";
import type { FeedItem, PersonView } from "@/lib/types";
import { StatTile, StreakStar } from "@/app/components/primitives";

function prettyDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
}

export default function PersonPanel({ person, items }: { person: PersonView; items: FeedItem[] }) {
  const byDate = new Map(person.days.map((d) => [d.date, d]));
  const window30 = Array.from({ length: 30 }, (_, i) => {
    const date = shiftDays(person.meta.todayKey, i - 29);
    return { date, reviews: byDate.get(date)?.reviews ?? 0 };
  });
  const peak = Math.max(1, ...window30.map((d) => d.reviews));
  const best = personalBest(person.days);
  const sums = totals(person.days);
  const ret = retention(person.days);
  const mine = items.filter((i) => i.user === person.profile.id).slice(0, 20);
  const decks = deckTotals(person.days);

  return (
    <section className="px-3 pt-3">
      <header className="flex items-baseline justify-between px-2 pb-3">
        <h2 className="text-[17px] font-bold tracking-[-.02em]">{person.profile.displayName}</h2>
        <span className="text-[10.5px]" style={{ color: "var(--ink-faint)" }}>{person.profile.tz}</span>
      </header>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile
          label="All time"
          numeric={person.meta.allTimeReviews}
          tint="var(--violet-soft)"
          glow="rgba(124,58,237,.20)"
          delay={60}
          help="Every review ever recorded in this collection. Cram sessions and manual reschedules are excluded."
        >
          <span data-testid="all-time">{person.meta.allTimeReviews.toLocaleString()}</span>
        </StatTile>
        <StatTile
          label="New cards"
          numeric={sums.newCards}
          tint="var(--cyan-soft)"
          glow="rgba(6,182,212,.16)"
          delay={180}
          help="Cards seen for the very first time — the ones that grow the deck rather than maintain it."
        />
        <StatTile
          label="Recall"
          value={ret === null ? "—" : `${ret}%`}
          tint="var(--jade)"
          glow="rgba(52,211,153,.14)"
          delay={300}
          help="Of the cards Anki showed, the share recalled. Again is a miss; Hard, Good and Easy are hits."
        />
        <StatTile
          label="Streak"
          tint="var(--gold)"
          glow="rgba(251,191,36,.15)"
          delay={420}
          help="Consecutive days with at least one review. The star changes at 3, 7, 14, 30 and 100 days."
        >
          <StreakStar streak={person.meta.streak} />
        </StatTile>
      </div>

      <div className="pane mt-2.5 px-4 pb-3 pt-3">
        <div className="mb-2 flex items-baseline justify-between text-[10.5px]">
          <span style={{ color: "var(--ink-dim)" }}>Last 30 days</span>
          {best && (
            <span style={{ color: "var(--ink-faint)" }}>
              best {best.reviews.toLocaleString()} on {prettyDate(best.date)}
            </span>
          )}
        </div>
        <div className="flex h-[74px] items-end gap-[3px]">
          {window30.map((d) => {
            const isBest = best !== null && d.date === best.date;
            return (
              <span
                key={d.date}
                data-testid="day-bar"
                title={`${prettyDate(d.date)}: ${d.reviews} cards`}
                className="flex-1 rounded-[2px]"
                style={{
                  height: `${Math.max(2, (d.reviews / peak) * 70)}px`,
                  background: d.reviews === 0
                    ? "rgba(255,255,255,.07)"
                    : isBest
                      ? "var(--gold)"
                      : "color-mix(in oklab, var(--violet) 55%, var(--cyan))",
                }}
              />
            );
          })}
        </div>
      </div>

      {decks.length > 0 && (
        <div className="pane mt-2.5 px-4 py-3">
          <h3 className="mb-2 text-[10.5px]" style={{ color: "var(--ink-dim)" }}>Decks</h3>
          <ul className="space-y-1.5">
            {decks.map(([deck, count]) => {
              const share = count / decks[0][1];
              return (
                <li key={deck} className="flex items-center gap-3 text-[12.5px]">
                  <span data-testid="deck-name" className="min-w-0 flex-1 truncate" style={{ color: "var(--ink-dim)" }}>{deck}</span>
                  <span className="h-[3px] w-20 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.07)" }}>
                    <span className="block h-full rounded-full"
                          style={{ width: `${Math.max(4, share * 100)}%`, background: "color-mix(in oklab, var(--violet) 50%, var(--cyan))" }} />
                  </span>
                  <span className="w-14 text-right tabular-nums" style={{ color: "var(--ink-faint)" }}>{count.toLocaleString()}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {mine.length > 0 && (
        <div className="pane mt-2.5 px-4 py-3">
          <h3 className="mb-2 text-[10.5px]" style={{ color: "var(--ink-dim)" }}>Recent cards</h3>
          <ul className="space-y-2">
            {mine.map((item) => (
              <li key={item.id} className="flex items-baseline gap-3">
                <span className="jp text-[15px] font-medium">{item.front}</span>
                <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--ink-faint)" }}>{item.back}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
