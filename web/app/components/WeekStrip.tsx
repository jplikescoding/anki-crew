"use client";
import { isoWeek, trophies, type WeekResult } from "@/lib/competition";
import type { PersonView } from "@/lib/types";

/** Last week's result, all week, one line. Click to watch the roundup again. */
export default function WeekStrip({ result, history, people, onReplay }: {
  result: WeekResult;
  history: WeekResult[];
  people: PersonView[];
  onReplay: () => void;
}) {
  const name = (id: string) => people.find((p) => p.profile.id === id)?.profile.displayName ?? id;
  const run = result.winner ? trophies(result.winner, history).run : 0;
  const scores = result.standings.map((s) => `${name(s.id)} ${s.cards.toLocaleString("en-US")}`).join(" · ");
  return (
    <button
      data-testid="week-strip"
      onClick={onReplay}
      title="Watch the roundup again"
      className="flex min-w-0 items-center gap-2 rounded-full border px-3 py-1 text-left text-[11.5px]"
      style={{ background: "linear-gradient(90deg,rgba(251,191,36,.12),rgba(251,191,36,.02))", borderColor: "rgba(251,191,36,.25)" }}
    >
      <span>{result.winner ? "👑" : "🤝"}</span>
      <span className="truncate"><b>Week {isoWeek(result.week)}:</b> {scores}</span>
      {run >= 2 && <span style={{ color: "var(--gold)" }}>🔥 {run}</span>}
      <span className="shrink-0" style={{ color: "var(--ink-faint)" }}>replay ▸</span>
    </button>
  );
}
