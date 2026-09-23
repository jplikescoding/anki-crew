"use client";
import {
  crewDailyTotals, gapToNext, rankBy, rankDeltas, retention, shiftDays, totals, weekStart, windowFrom,
} from "@/lib/metrics";
import type { DayRow, PersonView } from "@/lib/types";
import { CountUp, StreakStar, Tooltip, Track, type TrackDay } from "@/app/components/primitives";

export type Range = "today" | "week" | "all";

const STALE_AFTER_MS = 1000 * 60 * 60 * 6;

const RETENTION_HELP =
  "Of the cards Anki showed you, the share you got right. A card you pressed Again on counts as a miss; Hard, Good and Easy all count as a hit. Cram sessions are excluded.";
const CARDS_HELP =
  "Cards reviewed — every card Anki put in front of you, counted once per review. Filtered and crammed sessions don't count, so nobody can pad it.";
const STREAK_HELP_COL = "Consecutive days with at least one review. The star changes at 3, 7, 14, 30 and 100 days.";

function daysFor(person: PersonView, range: Range): DayRow[] {
  if (range === "all") return person.days;
  if (range === "today") return person.days.filter((d) => d.date === person.meta.todayKey);
  return windowFrom(person.days, weekStart(person.meta.todayKey));
}

/**
 * The seasonal abbreviation for a zone, e.g. "PDT" in September and "PST" in
 * January. Returns null for a zone Intl does not know, including the literal
 * "local" that setup.py writes when nobody typed a timezone.
 */
function tzTag(tz: string, dateKey: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
      .formatToParts(new Date(dateKey));
    return parts.find((p) => p.type === "timeZoneName")?.value ?? null;
  } catch {
    return null;
  }
}

function sinceLabel(ms: number): string {
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function trackFor(person: PersonView): TrackDay[] {
  const by = new Map(person.days.map((d) => [d.date, d]));
  return Array.from({ length: 14 }, (_, i) => {
    const date = shiftDays(person.meta.todayKey, i - 13);
    const d = by.get(date);
    return {
      date,
      reviews: d?.reviews ?? 0,
      minutes: d?.minutes,
      retention: d ? retention([d]) : null,
    };
  });
}

export default function Board({
  people, viewer, range, seen, justPassed, onSelect,
}: {
  people: PersonView[];
  viewer: string | null;
  range: Range;
  seen?: Record<string, number>;
  justPassed?: string | null;
  /** Opens that person's panel. A row that reacts to a click should go somewhere. */
  onSelect?: (id: string) => void;
}) {
  if (people.length === 0) {
    return (
      <div data-testid="board-empty" className="px-6 py-16 text-center">
        <p className="text-[15px]" style={{ color: "var(--ink-dim)" }}>
          Nothing here yet.
        </p>
        <p className="mx-auto mt-2 max-w-sm text-[13px]" style={{ color: "var(--ink-faint)" }}>
          Finish an Anki session and your first numbers land here a minute or two after you close it.
        </p>
      </div>
    );
  }

  const score = (p: PersonView) => totals(daysFor(p, range)).reviews;
  const ranked = rankBy(people, score);
  const deltas = rankDeltas(people, people[0].meta.todayKey);
  const gap = gapToNext(people, viewer, score);
  const crewToday = crewDailyTotals(people, people[0].meta.todayKey, 1)[0]?.total ?? 0;
  // Only zones that differ from the viewer's get a tag: labelling everyone is
  // noise, and the tag exists so a lagging "today" reads as a timezone rather
  // than as somebody slacking.
  const home = people.find((p) => p.profile.id === viewer) ?? people[0];
  const homeTag = tzTag(home.profile.tz, home.meta.todayKey);

  return (
    <section>
      <ol className="space-y-2 px-3">
        {ranked.map((p, i) => {
          const id = p.profile.id;
          const scoped = daysFor(p, range);
          const sums = totals(scoped);
          const ret = retention(scoped);
          const you = id === viewer;
          const lead = i === 0;
          const stale = Date.now() - p.meta.lastPublishAt > STALE_AFTER_MS;
          const delta = deltas[id] ?? 0;
          const passed = justPassed && p.profile.displayName === justPassed;

          return (
            <li key={id}>
              <div
                data-testid={`row-${id}`}
                data-you={String(you)}
                onClick={() => onSelect?.(id)}
                className={`lane-enter relative grid items-center gap-x-3 gap-y-1 rounded-[14px] border px-4 py-3
                            transition-[transform,border-color] duration-150 active:scale-[.992]
                            ${onSelect ? "cursor-pointer" : ""} ${passed ? "overtaken" : ""}`}
                style={{
                  gridTemplateColumns: "26px minmax(0,1fr) auto",
                  background: lead ? "var(--pane-lift)" : "var(--pane)",
                  borderColor: lead ? "var(--edge-lit)" : "var(--edge)",
                  animationDelay: `${i * 70}ms`,
                  opacity: stale ? 0.72 : 1,
                }}
              >
                {/* rank + movement */}
                <div className="flex flex-col items-center">
                  <span
                    className="text-[15px] font-extrabold tabular-nums"
                    style={{ color: lead ? "var(--violet-soft)" : "var(--ink-faint)" }}
                  >
                    {i + 1}
                  </span>
                  {delta !== 0 && (
                    <span
                      data-testid={`delta-${id}`}
                      className="text-[9px] font-semibold leading-none"
                      style={{ color: delta > 0 ? "var(--jade)" : "var(--rose)" }}
                      title={delta > 0 ? `Up ${delta} since yesterday` : `Down ${-delta} since yesterday`}
                    >
                      {delta > 0 ? "▲" : "▼"}{Math.abs(delta)}
                    </span>
                  )}
                </div>

                {/* name + sync state */}
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <button
                      type="button"
                      data-testid="board-name"
                      onClick={(e) => { e.stopPropagation(); onSelect?.(id); }}
                      className="truncate text-left text-[15px] font-semibold hover:underline"
                      style={{ textUnderlineOffset: "3px" }}
                    >
                      {p.profile.displayName}
                    </button>
                    {you && (
                      <span
                        className="rounded-full px-2 py-[1px] text-[9.5px] font-medium"
                        style={{ background: "rgba(124,58,237,.30)", color: "#DDD6FE" }}
                      >
                        you
                      </span>
                    )}
                    {(() => {
                      const tag = tzTag(p.profile.tz, p.meta.todayKey);
                      return tag && tag !== homeTag ? (
                        <span
                          className="rounded-full px-2 py-[1px] text-[9.5px]"
                          style={{ background: "rgba(255,255,255,.08)", color: "var(--ink-faint)" }}
                        >
                          {tag}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  <div className="mt-[3px] text-[10.5px]" style={{ color: stale ? "var(--gold)" : "var(--ink-faint)" }}>
                    {stale && <span data-testid={`stale-${id}`}>offline · </span>}
                    synced {sinceLabel(p.meta.lastPublishAt)}
                  </div>
                </div>

                {/* numbers */}
                <div className="flex items-center gap-4 sm:gap-6">
                  <div className="text-right">
                    <CountUp
                      data-testid="reviews"
                      to={sums.reviews}
                      from={you ? seen?.[id] : undefined}
                      className={`text-[22px] ${lead ? "figure" : "figure-plain"}`}
                    />
                    <div className="text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                      {Math.round(sums.minutes)} min
                    </div>
                  </div>
                  <div className="hidden text-right text-[13px] sm:block" style={{ color: "var(--ink-dim)" }}>
                    <StreakStar streak={p.meta.streak} />
                    <div data-testid="retention" className="mt-[3px] text-[11.5px]" style={{ color: ret === null ? "var(--ink-ghost)" : "var(--jade)" }}>
                      {ret === null ? "—" : `${ret}%`}
                    </div>
                  </div>
                  <Track days={trackFor(p)} lit={lead} />
                </div>
              </div>

              {/* One line, on your row only, about you. */}
              {you && gap && (
                <p data-testid="gap-line" className="px-5 pt-1.5 text-[11.5px]" style={{ color: "var(--ink-dim)" }}>
                  {justPassed ? (
                    <>You passed <b style={{ color: "var(--violet-soft)" }}>{justPassed}</b> while you were away — {gap.amount} ahead now.</>
                  ) : gap.kind === "leading" ? (
                    <>Leading <b style={{ color: "var(--ink)" }}>{gap.name}</b> by {gap.amount}.</>
                  ) : gap.amount === 0 ? (
                    <>Level with <b style={{ color: "var(--ink)" }}>{gap.name}</b>. One card breaks the tie.</>
                  ) : (
                    <><b style={{ color: "var(--cyan-soft)" }}>{gap.amount}</b> behind {gap.name}.</>
                  )}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 flex items-center justify-between px-6 text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
        <Tooltip label={CARDS_HELP}><span>Cards</span></Tooltip>
        <Tooltip label={STREAK_HELP_COL}><span>Streak</span></Tooltip>
        <Tooltip label={RETENTION_HELP}><span>Retention</span></Tooltip>
        <span>{crewToday.toLocaleString()} between you today</span>
      </div>
    </section>
  );
}
