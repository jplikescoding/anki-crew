"use client";
import { useEffect } from "react";
import { Avatar } from "@/app/components/Avatar";
import { headToHead, trophies, weekLabel, type Entry, type WeekResult } from "@/lib/competition";
import { headline, swingLine } from "@/lib/roundup";
import type { PersonView } from "@/lib/types";

const n = (x: number) => x.toLocaleString("en-US");

/** Second, first, third: the winner stands in the middle. */
function podiumOrder(top: Entry[]): Entry[] {
  return [top[1], top[0], top[2]].filter((e): e is Entry => e !== undefined);
}

/** Monday's roundup: the ceremony on the left, the story on the right. */
export default function WeeklyRoundup({ result, history, people, viewer, late = false, onClose }: {
  result: WeekResult;
  /** Every result, oldest first; runs and head-to-heads are read up to this week. */
  history: WeekResult[];
  people: PersonView[];
  viewer: string | null;
  /** Shown because a late sync changed a result you'd already seen. */
  late?: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const names = Object.fromEntries(people.map((p) => [p.profile.id, p.profile.displayName]));
  const byId = new Map(people.map((p) => [p.profile.id, p]));
  const indexOf = (id: string) => Math.max(0, people.findIndex((p) => p.profile.id === id));
  const upTo = history.slice(0, history.findIndex((r) => r.week === result.week) + 1);
  const top = result.standings[0];
  const hero = byId.get(result.winner ?? top.id);
  const run = result.winner ? trophies(result.winner, upTo).run : 0;
  const swing = swingLine(result, people, names);
  const max = Math.max(1, top.cards);
  const mine = viewer ? result.standings.find((s) => s.id === viewer) : undefined;
  const rivals = mine ? result.standings.filter((s) => s.id !== viewer) : [];

  return (
    <div
      data-testid="roundup-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto px-4 py-6"
      style={{ background: "rgba(3,5,12,.78)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={weekLabel(result.week)}
        data-testid="roundup"
        onClick={(e) => e.stopPropagation()}
        className="card-rise relative flex w-full max-w-[760px] flex-col overflow-hidden rounded-[20px] border sm:flex-row"
        style={{
          background: "linear-gradient(180deg,#121628,#0B0E1B)",
          borderColor: "rgba(251,191,36,.35)",
          boxShadow: "0 30px 80px rgba(0,0,0,.6), 0 0 60px rgba(251,191,36,.12)",
        }}
      >
        {/* The ceremony */}
        <section className="relative w-full shrink-0 overflow-hidden px-6 py-6 text-center sm:w-[320px] sm:border-r" style={{ borderColor: "rgba(255,255,255,.07)" }}>
          {result.winner && <div className="roundup-rays" aria-hidden="true" />}
          <p className="relative text-[10px] uppercase tracking-[.18em]" style={{ color: "var(--gold)" }}>{weekLabel(result.week)}</p>
          <div className="beat-1 relative">
            <div className="mt-3 text-[26px]">{result.winner ? "👑" : "🤝"}</div>
            {hero && (
              <span className="inline-flex rounded-full" style={{ boxShadow: result.winner ? "0 0 40px rgba(251,191,36,.45)" : undefined }}>
                <Avatar profile={hero.profile} size={78} index={indexOf(hero.profile.id)} interactive={false} />
              </span>
            )}
            <div
              className="mt-2 text-[40px] font-extrabold tabular-nums tracking-[-.03em]"
              style={{ background: "linear-gradient(90deg,#FDE68A,#FBBF24)", WebkitBackgroundClip: "text", color: "transparent" }}
            >
              {n(top.cards)}
            </div>
            <div className="text-[11.5px]" style={{ color: "var(--ink-dim)" }}>
              {result.winner ? `${names[result.winner]} takes the week` : "Dead heat"}
            </div>
          </div>
          <div className="relative mt-4 flex items-end justify-center gap-1.5">
            {podiumOrder(result.standings.slice(0, 3)).map((e) => {
              const first = e.id === result.winner;
              return (
                <div key={e.id} className="w-[78px]">
                  <div className="truncate text-[11px]" style={{ color: first ? "var(--gold)" : "var(--ink-dim)" }}>{names[e.id] ?? e.id}</div>
                  <div
                    data-testid="podium-bar"
                    className="beat-2 mt-1 flex items-center justify-center rounded-[12px] border text-[13px] font-bold tabular-nums"
                    style={{
                      height: `${Math.round(30 + 44 * (e.cards / max))}px`,
                      background: first ? "linear-gradient(180deg,rgba(251,191,36,.35),rgba(251,191,36,.08))" : "var(--pane)",
                      borderColor: first ? "rgba(251,191,36,.45)" : "var(--edge)",
                    }}
                  >
                    {n(e.cards)}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* The story */}
        <section className="beat-3 flex flex-1 flex-col px-7 py-6">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-[.18em]" style={{ color: "var(--ink-faint)" }}>{late ? "Late sync · final" : "Final"}</span>
            {run >= 2 && (
              <span data-testid="roundup-run" className="rounded-full border px-2.5 py-1 text-[11px]"
                    style={{ color: "var(--gold)", background: "rgba(251,191,36,.14)", borderColor: "rgba(251,191,36,.4)" }}>
                🔥 {run} weeks in a row
              </span>
            )}
          </div>
          <h2 data-testid="roundup-headline" className="mt-3 text-[24px] font-extrabold leading-[1.15] tracking-[-.02em]">
            {headline(result, history, names)}
          </h2>
          {swing && (
            <p data-testid="roundup-swing" className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>{swing}</p>
          )}
          {mine && rivals.length > 0 && viewer && (
            <>
              <p className="mt-5 text-[10px] uppercase tracking-[.18em]" style={{ color: "var(--ink-faint)" }}>Your head-to-head</p>
              <ul className="pane mt-2 space-y-2 px-3.5 py-2.5">
                {rivals.map((s) => {
                  const h = headToHead(viewer, s.id, upTo);
                  const margin = mine.cards - s.cards;
                  const who = byId.get(s.id);
                  return (
                    <li key={s.id} data-testid={`h2h-${s.id}`} className="flex items-center gap-2 text-[13px]">
                      {who && <Avatar profile={who.profile} size={22} index={indexOf(s.id)} interactive={false} />}
                      <span className="flex-1">vs {names[s.id] ?? s.id}</span>
                      <b style={{ color: h.a > h.b ? "var(--jade)" : h.b > h.a ? "var(--rose)" : "var(--ink-dim)" }}>{h.a}–{h.b}</b>
                      <span className="w-[110px] text-right text-[11px]" style={{ color: "var(--ink-faint)" }}>
                        {margin > 0 ? `won by ${n(margin)}` : margin < 0 ? `lost by ${n(-margin)}` : "level"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <div className="flex-1" />
          <div className="mt-5 flex justify-end">
            <button onClick={onClose} className="rounded-full border px-4 py-1.5 text-[12px]" style={{ borderColor: "rgba(255,255,255,.15)", color: "var(--ink-dim)" }}>
              Close
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
