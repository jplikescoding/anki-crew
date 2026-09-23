"use client";
import { useState } from "react";
import { personalBest, shiftDays, totals, weekStart, windowFrom } from "@/lib/metrics";
import type { PersonView } from "@/lib/types";
import { Tooltip } from "@/app/components/primitives";

function prettyDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
}

/**
 * Hovering reveals a second line rather than animating the box. Motion that
 * tells you something beats motion that only moves -- and a hover-bounce on
 * every card is the commonest tell of a templated design.
 */
function Tile({ label, value, sub, more, tint, help }: {
  label: string; value: string; sub: string; more?: string; tint: string; help: string;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className="pane px-4 py-3.5 transition-colors duration-200"
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => setOver(false)}
      style={{ borderColor: over ? tint : "var(--edge)" }}
    >
      <div className="text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
        <Tooltip label={help}><span>{label}</span></Tooltip>
      </div>
      <div
        className="mt-1.5 text-[24px] font-extrabold tabular-nums tracking-[-.03em] transition-transform duration-200"
        style={{ color: tint, transform: over ? "translateY(-1px)" : "none" }}
      >
        {value}
      </div>
      <div className="mt-0.5 text-[11px] transition-colors duration-200" style={{ color: "var(--ink-faint)" }}>
        {over && more ? more : sub}
      </div>
    </div>
  );
}

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
      <Tile
        label="Your best day"
        value={best ? best.reviews.toLocaleString() : "—"}
        sub={best ? prettyDate(best.date) : "no sessions yet"}
        more={bestDetail}
        tint="var(--violet-soft)"
        help="The most cards you have ever reviewed in a single day. Beat it and this tile updates."
      />
      <Tile
        label="Crew this week"
        value={thisWeek.toLocaleString()}
        sub={trend === null ? "first week on record" : `${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend)}% on last week`}
        more={lastWeek > 0 ? `${lastWeek.toLocaleString()} the week before` : undefined}
        tint="var(--cyan-soft)"
        help="Everyone's reviews over the last seven days, added together, against the seven days before that."
      />
      <Tile
        label="Longest streak"
        value={longest.streak > 0 ? `${longest.streak}` : "—"}
        sub={longest.streak > 0 ? longest.who : "nobody has one yet"}
        more={longest.streak > 0 ? `${longest.who} — ${longest.streak} days unbroken` : undefined}
        tint="var(--gold)"
        help="The longest run of consecutive study days anyone in the crew is currently holding."
      />
    </div>
  );
}
