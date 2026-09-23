"use client";
import { personalBest, shiftDays, totals, weekStart, windowFrom } from "@/lib/metrics";
import type { PersonView } from "@/lib/types";
import { Tooltip } from "@/app/components/primitives";

function prettyDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    day: "numeric", month: "short", timeZone: "UTC",
  });
}

function Tile({ label, value, sub, tint, help }: {
  label: string; value: string; sub: string; tint: string; help: string;
}) {
  return (
    <div className="pane px-4 py-3.5">
      <div className="text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
        <Tooltip label={help}><span>{label}</span></Tooltip>
      </div>
      <div className="mt-1.5 text-[24px] font-extrabold tabular-nums tracking-[-.03em]" style={{ color: tint }}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px]" style={{ color: "var(--ink-faint)" }}>{sub}</div>
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
        tint="var(--violet-soft)"
        help="The most cards you have ever reviewed in a single day. Beat it and this tile updates."
      />
      <Tile
        label="Crew this week"
        value={thisWeek.toLocaleString()}
        sub={trend === null ? "first week on record" : `${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend)}% on last week`}
        tint="var(--cyan-soft)"
        help="Everyone's reviews over the last seven days, added together, against the seven days before that."
      />
      <Tile
        label="Longest streak"
        value={longest.streak > 0 ? `${longest.streak}` : "—"}
        sub={longest.streak > 0 ? longest.who : "nobody has one yet"}
        tint="var(--gold)"
        help="The longest run of consecutive study days anyone in the crew is currently holding."
      />
    </div>
  );
}
