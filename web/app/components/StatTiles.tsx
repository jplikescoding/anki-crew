"use client";
import { useEffect, useState } from "react";
import { personalBest, shiftDays, totals, weekStart, windowFrom } from "@/lib/metrics";
import type { PersonView } from "@/lib/types";
import { CountUp, Tooltip } from "@/app/components/primitives";

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
function Tile({ label, value, numeric, sub, more, tint, glow, help, delay }: {
  label: string; value: string; numeric?: number; sub: string; more?: string;
  tint: string; glow: string; help: string; delay: number;
}) {
  const [over, setOver] = useState(false);
  const [sweepKey, setSweepKey] = useState(0);
  const [live, setLive] = useState(false);

  // Values arrive one after another rather than all at once, so the row reads
  // as three separate facts instead of one block appearing.
  useEffect(() => {
    const t = window.setTimeout(() => setLive(true), delay);
    return () => window.clearTimeout(t);
  }, [delay]);

  return (
    <div
      onMouseEnter={() => { setOver(true); setSweepKey((k) => k + 1); }}
      onMouseLeave={() => setOver(false)}
      className="relative overflow-hidden rounded-[14px] border px-4 py-3.5 transition-[border-color,box-shadow,transform] duration-300"
      style={{
        borderColor: over ? tint : "var(--edge)",
        background: `linear-gradient(158deg, ${glow}, rgba(255,255,255,.04) 62%)`,
        boxShadow: over ? `0 0 26px -12px ${tint}` : "none",
        transform: over ? "translateY(-2px)" : "none",
      }}
    >
      {over && <span key={sweepKey} className="sweep absolute inset-0" />}
      <div className="relative text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
        <Tooltip label={help}><span>{label}</span></Tooltip>
      </div>
      <div className="relative mt-1.5 text-[26px] font-extrabold tabular-nums tracking-[-.035em]"
           style={{ color: tint }}>
        {numeric !== undefined && live
          ? <CountUp to={numeric} from={0} duration={1100} />
          : numeric !== undefined ? "0" : value}
      </div>
      <div className="relative mt-0.5 text-[11px]" style={{ color: "var(--ink-faint)" }}>
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
        value="—"
        numeric={best ? best.reviews : undefined}
        sub={best ? prettyDate(best.date) : "no sessions yet"}
        more={bestDetail}
        tint="var(--violet-soft)"
        glow="rgba(124,58,237,.20)"
        delay={60}
        help="The most cards you have ever reviewed in a single day. Beat it and this tile updates."
      />
      <Tile
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
      <Tile
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
