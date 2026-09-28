"use client";
import { useEffect } from "react";
import { Avatar } from "@/app/components/Avatar";
import { tzTag } from "@/app/components/Board";
import { StreakStar } from "@/app/components/primitives";
import { champion, headToHead, isoWeek, trophies, trophyCopy, type TileCopy, type WeekResult } from "@/lib/competition";
import { currentStreak, daysLeftInWeek, personalBest, scoreNow } from "@/lib/metrics";
import type { PersonView } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function studyingSince(p: PersonView): string | null {
  const first = p.days.find((d) => d.reviews > 0)?.date;
  if (!first) return null;
  const d = new Date(`${first}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function Trophy({ label, copy, testId }: { label: string; copy: TileCopy; testId: string }) {
  return (
    <div
      data-testid={testId}
      className="rounded-[12px] border px-3 py-2"
      style={copy.earned
        ? { borderColor: "rgba(251,191,36,.35)", background: "rgba(251,191,36,.08)" }
        : { borderColor: "var(--edge)", background: "var(--pane)" }}
    >
      <div className="text-[9px] uppercase tracking-[.16em]" style={{ color: "var(--ink-faint)" }}>{label}</div>
      <div className="text-[19px] font-extrabold" style={{ color: copy.earned ? "var(--gold)" : "var(--ink-faint)" }}>{copy.value}</div>
      <div className="text-[10px] leading-snug" style={{ color: "var(--ink-faint)" }}>{copy.sub}</div>
    </div>
  );
}

/** Someone's trophies and your record against them, over whatever you were looking at. */
export default function PlayerCard({ person, people, viewer, results, onClose, onFullStats }: {
  person: PersonView;
  people: PersonView[];
  viewer: string | null;
  results: WeekResult[];
  onClose: () => void;
  onFullStats: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const id = person.profile.id;
  const name = person.profile.displayName;
  const copy = trophyCopy(trophies(id, results));
  const isChamp = champion(results) === id;
  const lastWeek = results[results.length - 1];
  const me = people.find((p) => p.profile.id === viewer && p.profile.id !== id);
  const h2h = me ? headToHead(me.profile.id, id, results) : null;
  const best = personalBest(person.days);
  const since = studyingSince(person);
  const tag = tzTag(person.profile.tz, person.meta.todayKey);

  let race = "";
  if (me) {
    const diff = scoreNow(me, "week", me.meta.todayKey) - scoreNow(person, "week", me.meta.todayKey);
    const left = daysLeftInWeek(me.meta.todayKey);
    const tail = left === 0 ? "last day" : `${left} day${left === 1 ? "" : "s"} left`;
    race = diff > 0 ? `This week you're ${diff.toLocaleString()} ahead — ${tail}`
      : diff < 0 ? `This week ${name}'s ${(-diff).toLocaleString()} ahead — ${tail}`
      : `Level this week — ${tail}`;
  }

  return (
    <div
      data-testid="player-card-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(3,5,12,.72)" }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`${name}'s card`}
        data-testid="player-card"
        onClick={(e) => e.stopPropagation()}
        className="card-rise relative w-full max-w-[340px] overflow-hidden rounded-[22px] border pb-4"
        style={{
          background: "linear-gradient(165deg,#1A1433 0%,#0E1224 55%,#0B0E1B 100%)",
          borderColor: isChamp ? "rgba(251,191,36,.40)" : "var(--edge-lit)",
          boxShadow: `0 30px 80px rgba(0,0,0,.6)${isChamp ? ", 0 0 50px rgba(251,191,36,.12)" : ""}`,
        }}
      >
        <div
          className="relative h-[120px]"
          style={{
            background: `${isChamp ? "radial-gradient(260px 150px at 50% 110%, rgba(251,191,36,.28), transparent 70%), " : ""}linear-gradient(135deg, rgba(124,58,237,.45), rgba(34,211,238,.25))`,
          }}
        >
          {isChamp && lastWeek && (
            <span className="absolute left-4 top-3 text-[10px] uppercase tracking-[.16em]" style={{ color: "var(--gold)" }}>
              👑 Champion · week {isoWeek(lastWeek.week)}
            </span>
          )}
          <button onClick={onClose} aria-label="Close" className="absolute right-3 top-2 px-1 text-[14px]" style={{ color: "var(--ink-faint)" }}>✕</button>
          <span className="absolute bottom-[-38px] left-1/2 -translate-x-1/2 rounded-full" style={{ boxShadow: "0 0 0 4px #0E1224" }}>
            <Avatar profile={person.profile} size={80} index={people.findIndex((p) => p.profile.id === id)} interactive={false} />
          </span>
        </div>

        <div className="mt-[44px] text-center">
          <div className="text-[21px] font-extrabold tracking-[-.02em]">{name}</div>
          <div className="text-[11px]" style={{ color: "var(--ink-faint)" }}>
            {[since && `Studying since ${since}`, tag].filter(Boolean).join(" · ")}
          </div>
        </div>

        <div className="mx-4 mt-3 grid grid-cols-2 gap-2">
          <Trophy label="Weeks won" copy={copy.weeks} testId="card-weeks-won" />
          <Trophy label="Winning run" copy={copy.run} testId="card-run" />
        </div>

        {me && h2h && (
          <div data-testid="card-h2h" className="pane mx-4 mt-2 px-3.5 py-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] uppercase tracking-[.16em]" style={{ color: "var(--ink-faint)" }}>You vs {name}</span>
              <b className="text-[19px]">
                <span style={{ color: h2h.a > h2h.b ? "var(--jade)" : "var(--ink-dim)" }}>{h2h.a}</span>
                <span style={{ color: "var(--ink-faint)" }}> – </span>
                <span style={{ color: h2h.b > h2h.a ? "var(--rose)" : "var(--ink-dim)" }}>{h2h.b}</span>
              </b>
            </div>
            <div className="mt-0.5 text-[12px]" style={{ color: "var(--ink-dim)" }}>{race}</div>
          </div>
        )}

        <div className="mx-5 mt-3 flex justify-between text-[12px]">
          <span><span style={{ color: "var(--ink-faint)" }}>All time</span> <b>{person.meta.allTimeReviews.toLocaleString()}</b></span>
          <span><span style={{ color: "var(--ink-faint)" }}>Streak</span> <b><StreakStar streak={currentStreak(person.days, person.meta.todayKey)} /></b></span>
          <span><span style={{ color: "var(--ink-faint)" }}>Best day</span> <b>{best ? best.reviews.toLocaleString() : "—"}</b></span>
        </div>

        <div className="mt-3 text-center">
          <button onClick={onFullStats} className="text-[12px]" style={{ color: "var(--violet-soft)" }}>Full stats ▸</button>
        </div>
      </div>
    </div>
  );
}
