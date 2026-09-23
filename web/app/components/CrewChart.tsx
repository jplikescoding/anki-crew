"use client";
import { useState } from "react";
import { crewDailyTotals } from "@/lib/metrics";
import type { PersonView } from "@/lib/types";

// Fixed hues per position so a person keeps their colour between the chart,
// the legend and the feed. Volume colours stay in the violet→cyan family;
// gold is borrowed only when there is a third person.
const HUES = ["var(--violet)", "var(--cyan)", "var(--gold)"];

function prettyDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

/** Fourteen days, stacked, everyone at once — who has actually been showing up. */
export default function CrewChart({ people }: { people: PersonView[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (people.length === 0) return null;

  const rows = crewDailyTotals(people, people[0].meta.todayKey, 14);
  const peak = Math.max(1, ...rows.map((r) => r.total));
  const active = hover === null ? null : rows[hover];

  return (
    <section className="px-3 pt-4">
      <div className="pane relative px-4 pb-3 pt-3">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-[11px] font-medium" style={{ color: "var(--ink-dim)" }}>Last 14 days</h2>
          <span className="text-[10px]" style={{ color: "var(--ink-faint)" }}>
            {active ? prettyDate(active.date) : "hover a day"}
          </span>
        </div>

        <div className="flex h-[84px] items-end gap-[5px]">
          {rows.map((r, i) => (
            <div
              key={r.date}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="flex flex-1 cursor-default flex-col-reverse gap-[2px] rounded-sm transition-opacity"
              style={{ opacity: hover === null || hover === i ? 1 : 0.42 }}
            >
              {people.map((p, pi) => {
                const v = r.perPerson[p.profile.id] ?? 0;
                if (v === 0) return null;
                return (
                  <span
                    key={p.profile.id}
                    className="block rounded-[2px]"
                    style={{ height: `${Math.max(2, (v / peak) * 78)}px`, background: HUES[pi % HUES.length] }}
                  />
                );
              })}
              {r.total === 0 && (
                <span className="block rounded-[2px]" style={{ height: "2px", background: "rgba(255,255,255,.08)" }} />
              )}
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10.5px]" style={{ color: "var(--ink-dim)" }}>
          {people.map((p, pi) => (
            <span key={p.profile.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: HUES[pi % HUES.length] }} />
              {p.profile.displayName}
              {active && (
                <b className="tabular-nums" style={{ color: "var(--ink)" }}>
                  {active.perPerson[p.profile.id] ?? 0}
                </b>
              )}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
