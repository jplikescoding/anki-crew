"use client";
import { personalBest, shiftDays, totals, weekStart, windowFrom } from "@/lib/metrics";
import type { PersonView } from "@/lib/types";
import { StatTile } from "@/app/components/primitives";

function prettyDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

/**
 * Hovering reveals a second line rather than animating the box. Motion that
 * tells you something beats motion that only moves -- and a hover-bounce on
 * every card is the commonest tell of a templated design.
 */
/**
 * Records, not today's numbers. The board already answers "who is winning" —
 * these answer "what is worth chasing", which is what keeps someone going on a
 * day they are clearly not going to win.
 */
export default function StatTiles({ people, viewer }: { people: PersonView[]; viewer: string | null }) {
  if (people.length === 0) return null;
  const todayKey = people[0].meta.todayKey;

  const me = people.find((p) => p.profile.id === viewer) ?? people[0];
  const best = personalBest(me.days);
  const bestRow = best ? me.days.find((d) => d.date === best.date) : undefined;
  const bestDetail = bestRow
    ? `${Math.round(bestRow.minutes)} min · ${bestRow.newCards} new`
    : undefined;

  const thisWeek = people.reduce(
    (s, p) => s + totals(windowFrom(p.days, weekStart(todayKey))).reviews, 0);
  const lastWeekStart = shiftDays(weekStart(todayKey), -7);
  const lastWeek = people.reduce((s, p) => {
    const rows = p.days.filter((d) => d.date >= lastWeekStart && d.date < weekStart(todayKey));
    return s + totals(rows).reviews;
  }, 0);
  const trend = lastWeek === 0 ? null : Math.round(((thisWeek - lastWeek) / lastWeek) * 100);

  const longest = people.reduce(
    (top, p) => (p.meta.streak > top.streak ? { streak: p.meta.streak, who: p.profile.displayName } : top),
    { streak: 0, who: "" });

  return (
    <div className="grid grid-cols-3 gap-2.5 px-3 pt-3">
      <StatTile
        label="Your best day"
        value="—"
        numeric={best ? best.reviews : undefined}
        sub={best ? prettyDate(best.date) : "no sessions yet"}
        more={bestDetail}
        tint="var(--violet-soft)"
        glow="rgba(124,58,237,.20)"
        delay={60}
        help="The most cards you have ever reviewed in a single day. Beat it and this tile updates."
      />
      <StatTile
        label="Crew this week"
        value="—"
        numeric={thisWeek}
        sub={trend === null ? "first week on record" : `${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend)}% on last week`}
        more={lastWeek > 0 ? `${lastWeek.toLocaleString()} the week before` : undefined}
        tint="var(--cyan-soft)"
        glow="rgba(6,182,212,.16)"
        delay={200}
        help="Everyone's reviews over the last seven days, added together, against the seven days before that."
      />
      <StatTile
        label="Longest streak"
        value="—"
        numeric={longest.streak > 0 ? longest.streak : undefined}
        sub={longest.streak > 0 ? longest.who : "nobody has one yet"}
        more={longest.streak > 0 ? `${longest.who} — ${longest.streak} days unbroken` : undefined}
        tint="var(--gold)"
        glow="rgba(251,191,36,.15)"
        delay={340}
        help="The longest run of consecutive study days anyone in the crew is currently holding."
      />
    </div>
  );
}
