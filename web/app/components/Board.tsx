// web/app/components/Board.tsx
"use client";
import { retention, totals, rankBy, shiftDays, windowFrom, weekStart } from "@/lib/metrics";
import type { DayRow, PersonView } from "@/lib/types";

export type Range = "today" | "week" | "all";

const STALE_AFTER_MS = 1000 * 60 * 60 * 6;

// Seasonal abbreviation for that person's current day -- "PDT" in September,
// "PST" in January. Returns null for a zone Intl does not know, including the
// literal "local" that setup.py writes when nobody typed a timezone.
function tzTag(tz: string, dateKey: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date(dateKey));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? null;
  } catch {
    return null;
  }
}

function daysFor(person: PersonView, range: Range): DayRow[] {
  if (range === "all") return person.days;
  if (range === "today") return person.days.filter((d) => d.date === person.meta.todayKey);
  return windowFrom(person.days, weekStart(person.meta.todayKey));
}

function Sparkline({ days, todayKey }: { days: DayRow[]; todayKey: string }) {
  const recent = windowFrom(days, shiftDays(todayKey, -13));
  const byDate = new Map(recent.map((d) => [d.date, d.reviews]));
  const values = Array.from({ length: 14 }, (_, i) => byDate.get(shiftDays(todayKey, i - 13)) ?? 0);
  const peak = Math.max(1, ...values);
  return (
    <div className="flex h-6 items-end gap-[2px]" aria-hidden="true">
      {values.map((v, i) => (
        <span key={i} className="w-[3px] rounded-sm bg-sky-400/70"
              style={{ height: `${Math.max(2, (v / peak) * 24)}px`, opacity: v === 0 ? 0.25 : 1 }} />
      ))}
    </div>
  );
}

export default function Board({ people, viewer, range }:
  { people: PersonView[]; viewer: string | null; range: Range }) {
  if (people.length === 0) {
    return (
      <p data-testid="board-empty" className="px-4 py-12 text-center text-sm text-neutral-400">
        Nobody has published yet. Run the publisher and refresh.
      </p>
    );
  }

  const ranked = rankBy(people, (p) => totals(daysFor(p, range)).reviews);
  const now = Date.now();
  // The viewer's own zone is home and goes untagged; only the people whose
  // clocks differ from the reader's carry one.
  const home = people.find((p) => p.profile.id === viewer) ?? people[0];
  const homeTag = tzTag(home.profile.tz, home.meta.todayKey);

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-neutral-800 text-left text-xs uppercase tracking-wide text-neutral-500">
          <th className="py-2 pl-4 pr-2 font-medium">#</th>
          <th className="py-2 pr-2 font-medium">Who</th>
          <th className="py-2 pr-2 text-right font-medium">Cards</th>
          <th className="py-2 pr-2 text-right font-medium">Min</th>
          <th className="py-2 pr-2 text-right font-medium">Streak</th>
          <th className="py-2 pr-2 text-right font-medium">Retention</th>
          <th className="py-2 pr-4 font-medium">14 days</th>
        </tr>
      </thead>
      <tbody>
        {ranked.map((p, i) => {
          const scoped = daysFor(p, range);
          const sums = totals(scoped);
          const ret = retention(scoped);
          const abbr = tzTag(p.profile.tz, p.meta.todayKey);
          const tag = abbr === homeTag ? null : abbr;
          const stale = now - p.meta.lastPublishAt > STALE_AFTER_MS;
          const you = p.profile.id === viewer;
          return (
            <tr key={p.profile.id} data-testid={`row-${p.profile.id}`} data-you={String(you)}
                className={`border-b border-neutral-900 ${you ? "bg-sky-500/10" : ""}`}>
              <td className="py-3 pl-4 pr-2 tabular-nums text-neutral-500">{i + 1}</td>
              <td className="py-3 pr-2">
                <span data-testid="board-name" className="font-medium">{p.profile.displayName}</span>
                {tag && <span className="ml-2 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">{tag}</span>}
                {stale && (
                  <span data-testid={`stale-${p.profile.id}`}
                        className="ml-2 text-[10px] text-amber-400/80" title="PC offline — numbers may lag">
                    stale
                  </span>
                )}
              </td>
              <td data-testid="reviews" className="py-3 pr-2 text-right tabular-nums font-semibold">{sums.reviews}</td>
              <td className="py-3 pr-2 text-right tabular-nums text-neutral-400">{Math.round(sums.minutes)}</td>
              <td className="py-3 pr-2 text-right tabular-nums text-neutral-400">{p.meta.streak}</td>
              <td data-testid="retention" className="py-3 pr-2 text-right tabular-nums text-neutral-400">
                {ret === null ? "—" : `${ret}%`}
              </td>
              <td className="py-3 pr-4"><Sparkline days={p.days} todayKey={p.meta.todayKey} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
