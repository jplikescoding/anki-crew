# Weekly Competition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the board into a weekly race: Monday–Sunday weeks with a winner, winning runs and head-to-head records, a premium weekly roundup, a player card on every avatar, honest streaks, and "since you last looked" arrows and pass moments that play once across devices.

**Architecture:** Everything competitive is derived in the browser from the full day history `/api/crew` already returns (`lib/competition.ts`, `lib/roundup.ts`, `lib/moments.ts`, pure and unit-tested). The only new server piece is a per-viewer Redis hash `competition:<id>` (last look, acknowledged standing, results shown), read with `/api/crew` and written by `POST /api/competition`. The page computes pending moments on load, shows a pill with the headline, and plays them on a tap.

**Tech Stack:** Next.js App Router (client page), React, TypeScript, Tailwind v4, Upstash Redis, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-09-28-weekly-competition-design.md`

## Global Constraints

- All commands run from `web/`. Full check: `npm test` (runs `tsc --noEmit && vitest run`).
- Weeks are Monday–Sunday in each person's own Anki day keys (`DayRow.date`, `meta.todayKey`); week keys are the Monday's `YYYY-MM-DD`.
- `SEASON_START = "2026-09-21"` (Week 39). Founders = joined on or before 27 Sep 2026 (their own clock); everyone else competes from the Monday after the week they joined.
- Winner = most cards reviewed; tie for first = no winner. Podium (🥈 🥉) only in weeks with ≥ 4 competitors. A week needs ≥ 2 competitors.
- A week is final once it is Monday (past 4am) for every competitor's zone; unknown zones read as `Etc/GMT+12`. Nobody's sync is waited for.
- Streaks are computed from days (`currentStreak`), never shown from `meta.streak`.
- No publisher change. No music. No phone roundup layout. No monthly roundup.
- Colours only from existing tokens (`--gold`, `--jade`, `--rose`, `--violet*`, `--cyan*`, `--ink*`, `--pane*`, `--edge*`). Gold = earned/winning, rose = lost ground.
- Commit messages: plain sentence in the repo's style (e.g. "Count weeks from Monday"), ending with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01HJZ1G54D8DTRvKcUZzukRz
  ```

## Review Focus

1. **The clock moving on after load / tests run on a later date** — anything that calls `Date.now()` in week logic must take `now` as a parameter; page tests pin the date with `vi.useFakeTimers({ toFake: ["Date"] })`. Pinned in Task 2 (`finishedResults` takes `now`) and Task 9 (page tests fake Date).
2. **A crewmate with tz `"local"` who goes MIA** must not hold a week open forever. Pinned in Task 2 ("an unknown zone doesn't hold the week open").
3. **Refreshing the page must not erase the arrows or replay a moment** — the first load's `look` is held in a ref for the tab's life; moments are acknowledged on tap. Pinned in Task 9 ("keeps the arrows through a refresh", "stays quiet once the week has been shown").
4. **Existing users must still see this release's What's new** even though the server has no `look` for them yet — `notesOnArrival` keeps reading the per-browser `readSeen()`. Pinned in Task 9 (seen.ts keeps `readSeen`).
5. **Avatars inside other controls** (upload button, feed filter chips, feed card's tap-to-hide button) must not open the card when they aren't meant to, and the feed card's avatar must not also toggle the quiz. Pinned in Task 6 (Avatar tests: `interactive={false}` renders no button; click stops propagation).

---

## File map

| File | Responsibility |
|---|---|
| `web/lib/metrics.ts` (modify) | Monday `weekStart`, `daysLeftInWeek`, `currentStreak`, `bestStreak`, `scoreNow`, `lookFrom`, `sinceWhen`, look-based `rankDeltas`/`momentum` |
| `web/lib/competition.ts` (create) | Weeks, competitors, results, finality, trophies, H2H, champion, tile copy |
| `web/lib/roundup.ts` (create) | Generated headline and swing line |
| `web/lib/moments.ts` (create) | Pending moments, ack/silent patches, pill headline text |
| `web/lib/types.ts` (modify) | `Look`, `LookScores`, `Standing`, `CompetitionState`, `CrewResponse.competition` |
| `web/lib/store.ts` (modify) | `getCompetition`, `saveCompetition` |
| `web/app/api/competition/route.ts` (create) | Validated POST of look/standing/results |
| `web/app/api/crew/route.ts` (modify) | Returns the viewer's `competition` state |
| `web/lib/seen.ts` (modify) | Drop `whoYouPassed` and `order` |
| `web/app/components/Board.tsx` (modify) | Look-based arrows, days left, computed streak, crown, pass animation |
| `web/app/components/StatTiles.tsx` (modify) | Same-days-last-week comparison, computed streak |
| `web/app/components/Avatar.tsx` (modify) | `PersonCard` context: click opens card, champion ring |
| `web/app/components/PlayerCard.tsx` (create) | The player card modal |
| `web/app/components/PersonPanel.tsx` (modify) | 3 × 2 tiles with trophies |
| `web/app/components/primitives.tsx` (modify) | `StatTile` gets an optional `edge` colour |
| `web/app/components/WeeklyRoundup.tsx` (create) | Split-stage roundup modal |
| `web/app/components/WeekStrip.tsx` (create) | Slim result strip with replay |
| `web/app/components/MomentPill.tsx` (create) | The headline pill |
| `web/app/globals.css` (modify) | Roundup beats, rays, card rise, rose pass sweep |
| `web/app/page.tsx` (modify) | Wiring: results, moments, look, card, roundup, strip |
| `web/lib/whatsNew.ts` (modify) | One release blurb |

---

### Task 1: Calendar weeks, honest streaks, arrows since you last looked

**Files:**
- Modify: `web/lib/types.ts`, `web/lib/metrics.ts`, `web/app/components/Board.tsx`, `web/app/components/StatTiles.tsx`, `web/app/components/PersonPanel.tsx:62-70` (streak only), `web/app/page.tsx` (range label, shortcuts text)
- Test: `web/lib/__tests__/metrics.test.ts`, `web/lib/__tests__/metrics-engagement.test.ts`, `web/app/components/__tests__/Board.test.tsx`, `web/app/components/__tests__/StatTiles.test.tsx`

**Interfaces:**
- Produces (types.ts):
  ```ts
  export type LookScores = { today: number; week: number; all: number };
  export type Look = { at: number; day: string; week: string; scores: Record<string, LookScores> };
  ```
- Produces (metrics.ts): `weekStart(todayKey: string): string` (Monday), `daysLeftInWeek(todayKey: string): number`, `currentStreak(days: DayRow[], todayKey: string): number`, `bestStreak(days: DayRow[]): number`, `scoreNow(p: PersonView, range: Range): number`, `lookFrom(people: PersonView[], viewerDay: string, at: number): Look`, `sinceWhen(at: number, now: number): string`, `rankDeltas(people, range, look: Look | null, viewerDay: string): Record<string, number>`, `momentum(people, range, look: Look | null, viewerDay: string): Record<string, Momentum | null>`.
- Produces (Board.tsx): `export function tzTag(tz: string, dateKey: string): string | null`; Board prop `look?: Look | null`.

- [ ] **Step 1: Write the failing metrics tests**

In `web/lib/__tests__/metrics.test.ts` replace the whole `describe("weekStart", …)` block with:

```ts
describe("weekStart", () => {
  it("returns the Monday of the week", () => {
    expect(weekStart("2026-10-01")).toBe("2026-09-28"); // Thursday
  });

  it("is the day itself on a Monday", () => {
    expect(weekStart("2026-09-28")).toBe("2026-09-28");
  });

  it("goes back six days on a Sunday", () => {
    expect(weekStart("2026-10-04")).toBe("2026-09-28");
  });

  it("crosses a month boundary", () => {
    expect(weekStart("2026-10-02")).toBe("2026-09-28");
  });
});
```

In `web/lib/__tests__/metrics-engagement.test.ts`:
- change the import to
  ```ts
  import {
    rankDeltas, momentum, currentDayKey, gapToNext, streakTier, personalBest, crewDailyTotals, STREAK_TIERS,
    currentStreak, bestStreak, daysLeftInWeek, sinceWhen, weekStart,
  } from "@/lib/metrics";
  import type { DayRow, Look, LookScores, PersonView } from "@/lib/types";
  ```
- delete the whole `describe("rankDeltas", …)` and `describe("momentum", …)` blocks and add:

```ts
function look(scores: Record<string, Partial<LookScores>>, day = TODAY, at = 0): Look {
  return {
    at, day, week: weekStart(day),
    scores: Object.fromEntries(Object.entries(scores).map(([id, s]) => [id, { today: 0, week: 0, all: 0, ...s }])),
  };
}

describe("rankDeltas", () => {
  const jp = person("jp", "JP", [day(TODAY, 30)]);
  const pete = person("peter", "Peter", [day(TODAY, 20)]);

  it("reports a climb since you last looked as positive", () => {
    expect(rankDeltas([jp, pete], "today", look({ jp: { today: 5 }, peter: { today: 10 } }), TODAY))
      .toEqual({ jp: 1, peter: -1 });
  });

  it("is zero on a first visit", () => {
    expect(rankDeltas([jp, pete], "today", null, TODAY)).toEqual({ jp: 0, peter: 0 });
  });

  it("is zero on Today once the day has rolled over since the look", () => {
    expect(rankDeltas([jp, pete], "today", look({ jp: { today: 5 }, peter: { today: 10 } }, YESTERDAY), TODAY))
      .toEqual({ jp: 0, peter: 0 });
  });

  it("is zero on the week once a new week has started", () => {
    // TODAY (21 Sep 2026) is a Monday, so a look from the day before belongs to last week.
    expect(rankDeltas([jp, pete], "week", look({ jp: { week: 5 }, peter: { week: 10 } }, YESTERDAY), TODAY))
      .toEqual({ jp: 0, peter: 0 });
  });

  it("ranks all time against the look's totals", () => {
    expect(rankDeltas([jp, pete], "all", look({ jp: { all: 1 }, peter: { all: 2 } }, YESTERDAY), TODAY))
      .toEqual({ jp: 1, peter: -1 });
  });
});

describe("momentum", () => {
  const jp = person("jp", "JP", [day(TODAY, 40)]);
  const pete = person("peter", "Peter", [day(TODAY, 100)]);

  it("says the chaser gained on the person above and the leader lost ground", () => {
    const m = momentum([jp, pete], "today", look({ jp: { today: 10 }, peter: { today: 90 } }), TODAY);
    expect(m.jp).toEqual({ dir: 1, amount: 20, rival: "Peter", leading: false });
    expect(m.peter).toEqual({ dir: -1, amount: 20, rival: "JP", leading: true });
  });

  it("is null when the gap didn't change", () => {
    const m = momentum([jp, pete], "today", look({ jp: { today: 0 }, peter: { today: 60 } }), TODAY);
    expect(m).toEqual({ jp: null, peter: null });
  });

  it("is null without a look", () => {
    expect(momentum([jp, pete], "today", null, TODAY)).toEqual({ jp: null, peter: null });
  });
});

describe("currentStreak", () => {
  it("counts back from today", () => {
    expect(currentStreak([day("2026-09-19", 1), day("2026-09-20", 1), day(TODAY, 1)], TODAY)).toBe(3);
  });

  it("counts from yesterday while today is still empty", () => {
    expect(currentStreak([day("2026-09-19", 1), day(YESTERDAY, 1)], TODAY)).toBe(2);
  });

  it("is 0 once a whole day was missed, whatever the publisher last said", () => {
    expect(currentStreak([day("2026-09-18", 1), day("2026-09-19", 1)], TODAY)).toBe(0);
  });

  it("ignores days with no reviews", () => {
    expect(currentStreak([day(YESTERDAY, 0), day(TODAY, 5)], TODAY)).toBe(1);
  });
});

describe("bestStreak", () => {
  it("finds the longest run ever", () => {
    const days = ["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-05", "2026-09-06"].map((d) => day(d, 1));
    expect(bestStreak(days)).toBe(3);
  });

  it("is 0 with no history", () => {
    expect(bestStreak([])).toBe(0);
  });
});

describe("daysLeftInWeek", () => {
  it("is 6 on a Monday and 0 on a Sunday", () => {
    expect(daysLeftInWeek("2026-09-28")).toBe(6);
    expect(daysLeftInWeek("2026-10-04")).toBe(0);
  });
});

describe("sinceWhen", () => {
  it("says 'since you last looked' the same day", () => {
    expect(sinceWhen(new Date(2026, 8, 28, 8).getTime(), new Date(2026, 8, 28, 9).getTime()))
      .toBe("since you last looked");
  });

  it("names the weekday of an earlier look", () => {
    expect(sinceWhen(new Date(2026, 8, 26, 12).getTime(), new Date(2026, 8, 28, 9).getTime()))
      .toBe("since Saturday");
  });

  it("dates a look more than six days old", () => {
    expect(sinceWhen(new Date(2026, 8, 1, 12).getTime(), new Date(2026, 8, 28, 9).getTime()))
      .toBe("since Sep 1");
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run lib/__tests__/metrics.test.ts lib/__tests__/metrics-engagement.test.ts`
Expected: FAIL — `weekStart` returns the rolling start, `currentStreak`/`bestStreak`/`daysLeftInWeek`/`sinceWhen` are not exported, `rankDeltas` has the wrong arity.

- [ ] **Step 3: Add the `Look` types**

Append to `web/lib/types.ts`:

```ts
/** Everyone's scores as a viewer last saw them, for the "since you last looked" arrows. */
export type LookScores = { today: number; week: number; all: number };
export type Look = {
  at: number;              // epoch ms of that page load
  day: string;             // the viewer's day key then
  week: string;            // the Monday of that day
  scores: Record<string, LookScores>;
};
```

- [ ] **Step 4: Implement the metrics changes**

In `web/lib/metrics.ts`:

1. Change the type import to `import type { DayRow, Look, LookScores, PersonView } from "@/lib/types";`
2. Replace `weekStart` with:

```ts
/** Monday of the week `todayKey` falls in. Weeks run Monday to Sunday. */
export function weekStart(todayKey: string): string {
  const dow = new Date(`${todayKey}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return shiftDays(todayKey, -((dow + 6) % 7));
}

/** Whole days left in the week after today: 6 on a Monday, 0 on a Sunday. */
export function daysLeftInWeek(todayKey: string): number {
  return 6 - ((new Date(`${todayKey}T00:00:00Z`).getUTCDay() + 6) % 7);
}

/**
 * Consecutive studied days ending today, or ending yesterday while today is
 * still empty. Worked out here rather than trusted from the publisher: one
 * that stops syncing would otherwise show its last streak forever.
 */
export function currentStreak(days: DayRow[], todayKey: string): number {
  const studied = new Set(days.filter((d) => d.reviews > 0).map((d) => d.date));
  let day = studied.has(todayKey) ? todayKey : shiftDays(todayKey, -1);
  let n = 0;
  while (studied.has(day)) {
    n++;
    day = shiftDays(day, -1);
  }
  return n;
}

/** The longest run of consecutive studied days in someone's history. */
export function bestStreak(days: DayRow[]): number {
  const dates = days.filter((d) => d.reviews > 0).map((d) => d.date).sort();
  let best = 0;
  let run = 0;
  let prev = "";
  for (const d of dates) {
    run = prev && shiftDays(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return best;
}
```

3. Delete `scoreAsOf`, `ranksAsOf`, the old `rankDeltas` and the old `momentum` (with their doc comments) and put this in their place (keep `reviewsOn`, `Range`, and the `Momentum` type):

```ts
/** A person's score on a range, as of now, on their own day. */
export function scoreNow(person: PersonView, range: Range): number {
  if (range === "today") return reviewsOn(person, person.meta.todayKey);
  if (range === "week") return totals(windowFrom(person.days, weekStart(person.meta.todayKey))).reviews;
  return totals(person.days).reviews;
}

/** What to remember as "what you saw", so the next visit can draw arrows. */
export function lookFrom(people: PersonView[], viewerDay: string, at: number): Look {
  const scores: Record<string, LookScores> = {};
  for (const p of people) {
    scores[p.profile.id] = { today: scoreNow(p, "today"), week: scoreNow(p, "week"), all: scoreNow(p, "all") };
  }
  return { at, day: viewerDay, week: weekStart(viewerDay), scores };
}

/**
 * The look's score for each person on a range, or null when there is nothing
 * fair to compare against: no look yet, or the range's period has rolled over
 * since (a new day for Today, a new week for This week).
 */
function scoresThen(look: Look | null, range: Range, viewerDay: string): ((p: PersonView) => number) | null {
  if (!look) return null;
  if (range === "today" && look.day !== viewerDay) return null;
  if (range === "week" && look.week !== weekStart(viewerDay)) return null;
  return (p) => look.scores[p.profile.id]?.[range] ?? 0;
}

/** Position of each person, 1-based, ties broken by name so it never jitters. */
function ranksBy(people: PersonView[], pick: (p: PersonView) => number): Record<string, number> {
  const out: Record<string, number> = {};
  rankBy(people, pick).forEach((p, i) => { out[p.profile.id] = i + 1; });
  return out;
}

/**
 * How many places each person moved since you last looked, on the range the
 * board is showing. Positive means they climbed.
 */
export function rankDeltas(
  people: PersonView[], range: Range, look: Look | null, viewerDay: string,
): Record<string, number> {
  const then = scoresThen(look, range, viewerDay);
  const now = ranksBy(people, (p) => scoreNow(p, range));
  const before = then ? ranksBy(people, then) : now;
  const out: Record<string, number> = {};
  for (const p of people) out[p.profile.id] = before[p.profile.id] - now[p.profile.id];
  return out;
}

/**
 * Whether each person gained or lost ground on the person just above them
 * (the leader: on second place) since you last looked. Rank arrows only move
 * on an overtake; this is the chase in between.
 */
export function momentum(
  people: PersonView[], range: Range, look: Look | null, viewerDay: string,
): Record<string, Momentum | null> {
  const then = scoresThen(look, range, viewerDay);
  const ranked = rankBy(people, (p) => scoreNow(p, range));
  const out: Record<string, Momentum | null> = {};
  ranked.forEach((p, i) => {
    const rival = i === 0 ? ranked[1] : ranked[i - 1];
    if (!then || !rival) { out[p.profile.id] = null; return; }
    const change = (scoreNow(p, range) - scoreNow(rival, range)) - (then(p) - then(rival));
    out[p.profile.id] = change === 0 ? null : {
      dir: change > 0 ? 1 : -1,
      amount: Math.abs(change),
      rival: rival.profile.displayName,
      leading: i === 0,
    };
  });
  return out;
}

/** "since you last looked" for a look earlier today, else "since Saturday" or "since Sep 1". */
export function sinceWhen(at: number, now: number): string {
  const then = new Date(at);
  if (then.toDateString() === new Date(now).toDateString()) return "since you last looked";
  if (now - at > 6 * 86_400_000) {
    return `since ${then.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  return `since ${then.toLocaleDateString("en-US", { weekday: "long" })}`;
}
```

- [ ] **Step 5: Run the metrics tests**

Run: `npx vitest run lib/__tests__/metrics.test.ts lib/__tests__/metrics-engagement.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing Board and StatTiles tests**

In `web/app/components/__tests__/Board.test.tsx`:
- add `import type { Look } from "@/lib/types";` (merge into the existing type import).
- replace the test `"sums the whole week when range is week"` with:

```tsx
  it("counts this week from Monday", () => {
    // 21 Sep 2026 is a Monday; the Sunday before belongs to last week.
    const busy = person("jp", "JP", "America/New_York", [
      day("2026-09-20", { reviews: 100 }), day("2026-09-21", { reviews: 43 })]);
    render(<Board people={[busy]} viewer="jp" range="week" />);
    expect(within(screen.getByTestId("row-jp")).getByTestId("reviews").textContent).toBe("43");
  });
```

- delete the tests `"moves the arrows with the range"`, `"shows who gained ground on the week when nobody changed places"` and `"keeps Today to rank arrows only"`, and add:

```tsx
  const NY = "America/New_York";
  const lookAt = (jp: number, andy: number): Look => ({
    at: Date.now(), day: "2026-09-21", week: "2026-09-21",
    scores: { jp: { today: jp, week: jp, all: jp }, andy: { today: andy, week: andy, all: andy } },
  });

  it("moves the arrows since you last looked", () => {
    const jp = person("jp", "JP", NY, [day("2026-09-21", { reviews: 200 })]);
    const andy = person("andy", "Andy", NY, [day("2026-09-21", { reviews: 150 })]);
    render(<Board people={[jp, andy]} viewer="jp" range="today" look={lookAt(10, 100)} />);
    expect(screen.getByTestId("delta-jp").textContent).toBe("▲1");
    expect(screen.getByTestId("delta-jp")).toHaveAttribute("title", "Up 1 since you last looked");
    expect(screen.getByTestId("delta-andy").textContent).toBe("▼1");
  });

  it("shows no arrows on a first visit", () => {
    const jp = person("jp", "JP", NY, [day("2026-09-21", { reviews: 200 })]);
    const andy = person("andy", "Andy", NY, [day("2026-09-21", { reviews: 150 })]);
    render(<Board people={[jp, andy]} viewer="jp" range="today" />);
    expect(screen.queryByTestId("delta-jp")).toBeNull();
    expect(screen.queryByTestId("momentum-jp")).toBeNull();
  });

  it("shows the chase when nobody changed places", () => {
    const jp = person("jp", "JP", NY, [day("2026-09-21", { reviews: 40 })]);
    const andy = person("andy", "Andy", NY, [day("2026-09-21", { reviews: 100 })]);
    render(<Board people={[jp, andy]} viewer="jp" range="week" look={lookAt(10, 90)} />);
    expect(screen.getByTestId("momentum-jp").textContent).toBe("▲");
    expect(screen.getByTestId("momentum-jp")).toHaveAttribute("title", "20 closer to Andy since you last looked");
  });

  it("counts the days left in the week on your gap line", () => {
    const jp = person("jp", "JP", NY, [day("2026-09-21", { reviews: 40 })]);
    const andy = person("andy", "Andy", NY, [day("2026-09-21", { reviews: 100 })]);
    render(<Board people={[jp, andy]} viewer="jp" range="week" />);
    expect(screen.getByTestId("gap-line")).toHaveTextContent("60 behind Andy · 6 days left");
  });
```

In `web/app/components/__tests__/StatTiles.test.tsx` add inside the `describe`:

```tsx
  it("compares this week with the same days of last week", () => {
    // Wednesday 23 Sep: Mon–Wed this week vs Mon–Wed last week, not all of last week.
    const p: PersonView = {
      ...jp,
      meta: { ...jp.meta, todayKey: "2026-09-23" },
      days: [day("2026-09-14", 10), day("2026-09-16", 10), day("2026-09-17", 1000),
             day("2026-09-21", 15), day("2026-09-23", 15)],
    };
    render(<StatTiles people={[p]} viewer="jp" />);
    expect(screen.getByText("▲ 50% on this point last week")).toBeTruthy();
  });

  it("ignores a streak the publisher reported once it has lapsed", () => {
    const lapsed: PersonView = {
      ...jp,
      meta: { ...jp.meta, streak: 9, todayKey: "2026-09-23" },
      days: [day("2026-09-18", 5), day("2026-09-19", 5)],
    };
    render(<StatTiles people={[lapsed]} viewer="jp" />);
    expect(screen.getByText("nobody has one yet")).toBeTruthy();
  });
```

- [ ] **Step 7: Run them to see them fail**

Run: `npx vitest run app/components/__tests__/Board.test.tsx app/components/__tests__/StatTiles.test.tsx`
Expected: FAIL (Board doesn't accept `look`, gap line has no days left, StatTiles compares whole weeks and trusts `meta.streak`).

- [ ] **Step 8: Update Board**

In `web/app/components/Board.tsx`:

1. Imports become (keep the local `daysFor` function unchanged — rows still use it for minutes and retention):
```tsx
import {
  crewDailyTotals, currentStreak, daysLeftInWeek, gapToNext, momentum, rankBy, rankDeltas, retention,
  scoreNow, shiftDays, sinceWhen, totals, weekStart, windowFrom,
} from "@/lib/metrics";
import type { Momentum, Range } from "@/lib/metrics";
import type { DayRow, Look, PersonView } from "@/lib/types";
```
2. (No change to `daysFor` or `trackFor`.)
3. `function tzTag` → `export function tzTag` (PlayerCard uses it).
4. Replace `momentumLabel` with:
```tsx
function momentumLabel(m: Momentum, since: string): string {
  if (m.leading) return `Lead over ${m.rival} ${m.dir > 0 ? "grew" : "shrank"} by ${m.amount} ${since}`;
  return m.dir > 0
    ? `${m.amount} closer to ${m.rival} ${since}`
    : `${m.amount} further behind ${m.rival} ${since}`;
}
```
5. Add `look` to the props (`look?: Look | null;` with doc comment `/** What you saw on your previous visit; arrows compare against it. */`) and replace the block from `const score = …` through `const homeTag = …` with:
```tsx
  // Only zones that differ from the viewer's get a tag: labelling everyone is
  // noise, and the tag exists so a lagging "today" reads as a timezone rather
  // than as somebody slacking.
  const home = people.find((p) => p.profile.id === viewer) ?? people[0];
  const homeTag = tzTag(home.profile.tz, home.meta.todayKey);
  const viewerDay = home.meta.todayKey;
  const score = (p: PersonView) => scoreNow(p, range);
  const ranked = rankBy(people, score);
  const deltas = rankDeltas(people, range, look ?? null, viewerDay);
  const moves = momentum(people, range, look ?? null, viewerDay);
  const since = look ? sinceWhen(look.at, Date.now()) : "";
  const gap = gapToNext(people, viewer, score);
  const left = daysLeftInWeek(viewerDay);
  const weekTail = range !== "week" ? "" : left === 0 ? " · last day" : ` · ${left} day${left === 1 ? "" : "s"} left`;
  const crewToday = crewDailyTotals(people, people[0].meta.todayKey, 1)[0]?.total ?? 0;
```
6. Rank arrow `title` becomes ``title={delta > 0 ? `Up ${delta} ${since}` : `Down ${-delta} ${since}`}``; momentum `title={momentumLabel(move, since)}`.
7. `<StreakStar streak={p.meta.streak} />` → `<StreakStar streak={currentStreak(p.days, p.meta.todayKey)} />`.
8. In the gap line, the two non-justPassed endings gain `{weekTail}`:
```tsx
                  ) : gap.kind === "leading" ? (
                    <>Leading <b style={{ color: "var(--ink)" }}>{gap.name}</b> by {gap.amount}{weekTail}.</>
                  ) : gap.amount === 0 ? (
                    <>Level with <b style={{ color: "var(--ink)" }}>{gap.name}</b>. One card breaks the tie{weekTail}.</>
                  ) : (
                    <><b style={{ color: "var(--cyan-soft)" }}>{gap.amount}</b> behind {gap.name}{weekTail}</>
                  )}
```
(The last variant has no trailing full stop, so the test string `60 behind Andy · 6 days left` matches.)

- [ ] **Step 9: Update StatTiles**

In `web/app/components/StatTiles.tsx`:
1. Import line: `import { currentStreak, personalBest, shiftDays, totals, weekStart } from "@/lib/metrics";`
2. Replace the `thisWeek` … `longest` block with:
```tsx
  // This week so far against the same days of last week: a Wednesday shouldn't
  // look like a collapse just because last week had a Thursday to Sunday.
  const monday = weekStart(todayKey);
  const inRange = (from: string, to: string) => people.reduce(
    (s, p) => s + totals(p.days.filter((d) => d.date >= from && d.date <= to)).reviews, 0);
  const thisWeek = inRange(monday, todayKey);
  const lastWeek = inRange(shiftDays(monday, -7), shiftDays(todayKey, -7));
  const trend = lastWeek === 0 ? null : Math.round(((thisWeek - lastWeek) / lastWeek) * 100);

  const longest = people.reduce((top, p) => {
    const streak = currentStreak(p.days, p.meta.todayKey);
    return streak > top.streak ? { streak, who: p.profile.displayName } : top;
  }, { streak: 0, who: "" });
```
3. The "Crew this week" tile:
```tsx
        sub={trend === null ? "first week on record" : `${trend >= 0 ? "▲" : "▼"} ${Math.abs(trend)}% on this point last week`}
        more={lastWeek > 0 ? `${lastWeek.toLocaleString()} by this point last week` : undefined}
        help="Everyone's reviews since Monday, added together, against the same days of last week."
```
4. Drop `windowFrom` from the import if now unused.

- [ ] **Step 10: PersonPanel streak and page labels**

- `web/app/components/PersonPanel.tsx`: import `currentStreak` and change `<StreakStar streak={person.meta.streak} />` to `<StreakStar streak={currentStreak(person.days, person.meta.todayKey)} />`.
- `web/app/page.tsx`: the range button text `{r === "all" ? "all time" : r}` → `{r === "all" ? "all time" : r === "week" ? "this week" : r}`; the shortcuts row `["t w a", "Today, week, all time"]` → `["t w a", "Today, this week, all time"]`.

- [ ] **Step 11: Full check**

Run: `npm test`
Expected: PASS (tsc clean; all suites green).

- [ ] **Step 12: Commit**

```bash
git add web/lib web/app
git commit -m "Count weeks from Monday, work out streaks ourselves, and point arrows at your last visit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HJZ1G54D8DTRvKcUZzukRz"
```

---

### Task 2: The weekly race (`lib/competition.ts`)

**Files:**
- Create: `web/lib/competition.ts`
- Test: `web/lib/__tests__/competition.test.ts`

**Interfaces:**
- Consumes: `currentDayKey`, `rankBy`, `shiftDays`, `weekStart` from `lib/metrics`.
- Produces:
  ```ts
  export const SEASON_START = "2026-09-21";
  export type Entry = { id: string; cards: number };
  export type WeekResult = { week: string; standings: Entry[]; winner: string | null; podium: string[] | null };
  export type Trophies = { weeksWon: number; silver: number; bronze: number; run: number; bestRun: number };
  export type TileCopy = { value: string; sub: string; earned: boolean };
  export function isoWeek(monday: string): number;
  export function weekLabel(monday: string): string;           // "Week 40 · 28 Sep – 4 Oct"
  export function dayNow(p: PersonView, now: number): string;
  export function firstWeek(p: PersonView): string;
  export function competesIn(p: PersonView, week: string): boolean;
  export function weekCards(p: PersonView, week: string): number;
  export function weekResult(week: string, people: PersonView[]): WeekResult | null;
  export function isFinal(week: string, people: PersonView[], now: number): boolean;
  export function finishedResults(people: PersonView[], now: number): WeekResult[];   // oldest first
  export function trophies(id: string, results: WeekResult[]): Trophies;
  export function headToHead(a: string, b: string, results: WeekResult[]): { a: number; b: number };
  export function champion(results: WeekResult[]): string | null;
  export function trophyCopy(t: Trophies): { weeks: TileCopy; run: TileCopy };
  ```

- [ ] **Step 1: Write the failing tests**

Create `web/lib/__tests__/competition.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  champion, competesIn, finishedResults, firstWeek, headToHead, isFinal, isoWeek, trophies, trophyCopy,
  weekLabel, weekResult, type WeekResult,
} from "@/lib/competition";
import type { DayRow, PersonView } from "@/lib/types";

function day(date: string, reviews: number): DayRow {
  return { date, reviews, minutes: 0, newCards: 0, ease1: 0, ease2: 0, ease3: 0, ease4: 0, perDeck: {} };
}

const TUE_22_SEP = Date.UTC(2026, 8, 22, 21, 42);     // JP's real join, 5:42pm New York
const THU_24_SEP_LA = Date.UTC(2026, 8, 25, 4, 22);   // Adam's real join, 9:22pm Los Angeles on the 24th

function person(id: string, days: DayRow[], o: { tz?: string; joinedAt?: number; todayKey?: string } = {}): PersonView {
  return {
    profile: { id, displayName: id.toUpperCase(), tz: o.tz ?? "America/New_York", joinedAt: o.joinedAt ?? TUE_22_SEP },
    meta: { lastPublishAt: 0, streak: 0, todayKey: o.todayKey ?? "2026-09-27", allTimeReviews: 0, firstReviewAt: 0 },
    days,
  };
}

const W39 = "2026-09-21";
const W40 = "2026-09-28";
const result = (week: string, standings: [string, number][], winner: string | null, podium: string[] | null = null): WeekResult =>
  ({ week, standings: standings.map(([id, cards]) => ({ id, cards })), winner, podium });

describe("isoWeek and weekLabel", () => {
  it("numbers weeks the ISO way", () => {
    expect(isoWeek(W39)).toBe(39);
    expect(isoWeek(W40)).toBe(40);
    expect(isoWeek("2025-12-29")).toBe(1);
    expect(isoWeek("2026-12-28")).toBe(53);
  });

  it("labels a week with its range", () => {
    expect(weekLabel(W40)).toBe("Week 40 · 28 Sep – 4 Oct");
  });
});

describe("who competes", () => {
  it("counts founders from week 39", () => {
    expect(firstWeek(person("jp", []))).toBe(W39);
    expect(firstWeek(person("adam", [], { tz: "America/Los_Angeles", joinedAt: THU_24_SEP_LA }))).toBe(W39);
  });

  it("starts a later joiner on the Monday after the week they joined", () => {
    expect(firstWeek(person("peter", [], { joinedAt: Date.UTC(2026, 8, 30, 16) }))).toBe("2026-10-05");
  });

  it("sits out the week they joined in, even when they join on a Monday", () => {
    expect(firstWeek(person("geoff", [], { joinedAt: Date.UTC(2026, 9, 5, 16) }))).toBe("2026-10-12");
  });

  it("never counts a week before the season", () => {
    expect(competesIn(person("jp", []), "2026-09-14")).toBe(false);
  });
});

describe("weekResult", () => {
  it("crowns whoever reviewed most", () => {
    const r = weekResult(W39, [person("jp", [day("2026-09-22", 88)]), person("adam", [day("2026-09-26", 894)])]);
    expect(r).toEqual(result(W39, [["adam", 894], ["jp", 88]], "adam"));
  });

  it("has no winner on a tie for first", () => {
    const r = weekResult(W39, [person("jp", [day("2026-09-22", 50)]), person("adam", [day("2026-09-23", 50)])]);
    expect(r?.winner).toBeNull();
  });

  it("keeps a competitor who did nothing, at 0", () => {
    const r = weekResult(W39, [person("jp", []), person("adam", [day("2026-09-23", 5)])]);
    expect(r?.standings).toEqual([{ id: "adam", cards: 5 }, { id: "jp", cards: 0 }]);
  });

  it("has no result with fewer than two competitors", () => {
    expect(weekResult(W39, [person("jp", [day("2026-09-22", 5)])])).toBeNull();
  });

  it("only records a podium with four or more competitors", () => {
    const three = ["a", "b", "c"].map((id, i) => person(id, [day("2026-09-22", 10 - i)]));
    expect(weekResult(W39, three)?.podium).toBeNull();
    const four = ["a", "b", "c", "d"].map((id, i) => person(id, [day("2026-09-22", 10 - i)]));
    expect(weekResult(W39, four)?.podium).toEqual(["a", "b", "c"]);
  });

  it("only counts days inside the week", () => {
    const r = weekResult(W39, [person("jp", [day("2026-09-20", 500), day("2026-09-28", 500), day("2026-09-27", 1)]), person("adam", [])]);
    expect(r?.standings[0]).toEqual({ id: "jp", cards: 1 });
  });
});

describe("isFinal", () => {
  const jp = person("jp", []);
  const adam = person("adam", [], { tz: "America/Los_Angeles", joinedAt: THU_24_SEP_LA });

  it("waits until it is Monday past 4am in every competitor's zone", () => {
    // 9:00 UTC Monday = 5am New York (Monday) but 2am Los Angeles (still Sunday's Anki day).
    expect(isFinal(W39, [jp, adam], Date.UTC(2026, 8, 28, 9))).toBe(false);
    // 11:30 UTC = 4:30am Los Angeles.
    expect(isFinal(W39, [jp, adam], Date.UTC(2026, 8, 28, 11, 30))).toBe(true);
  });

  it("doesn't let an unknown zone hold the week open", () => {
    const local = person("peter", [], { tz: "local" });
    expect(isFinal(W39, [jp, local], Date.UTC(2026, 8, 28, 15))).toBe(false);
    expect(isFinal(W39, [jp, local], Date.UTC(2026, 8, 28, 16, 30))).toBe(true);
  });
});

describe("finishedResults", () => {
  const jp = person("jp", [day("2026-09-22", 88), day("2026-09-29", 300)]);
  const adam = person("adam", [day("2026-09-26", 894), day("2026-09-30", 200)], { tz: "America/Los_Angeles", joinedAt: THU_24_SEP_LA });

  it("lists every finished week, oldest first", () => {
    const got = finishedResults([jp, adam], Date.UTC(2026, 9, 6, 12));
    expect(got.map((r) => [r.week, r.winner])).toEqual([[W39, "adam"], [W40, "jp"]]);
  });

  it("leaves out the week still being played", () => {
    expect(finishedResults([jp, adam], Date.UTC(2026, 8, 30, 12)).map((r) => r.week)).toEqual([W39]);
  });

  it("is empty with nobody", () => {
    expect(finishedResults([], Date.UTC(2026, 9, 6))).toEqual([]);
  });
});

describe("trophies", () => {
  const history = [
    result("2026-09-21", [["adam", 9], ["jp", 1]], "adam"),
    result("2026-09-28", [["adam", 9], ["jp", 1]], "adam"),
    result("2026-10-05", [["jp", 5], ["adam", 5]], null),
    result("2026-10-12", [["adam", 9], ["jp", 1]], "adam"),
  ];

  it("counts wins, the live run and the best run; a tie ends a run", () => {
    expect(trophies("adam", history)).toEqual({ weeksWon: 3, silver: 0, bronze: 0, run: 1, bestRun: 2 });
    expect(trophies("jp", history)).toEqual({ weeksWon: 0, silver: 0, bronze: 0, run: 0, bestRun: 0 });
  });

  it("counts silver and bronze from podium weeks", () => {
    const r = [result("2026-10-19", [["a", 4], ["b", 3], ["c", 2], ["d", 1]], "a", ["a", "b", "c"])];
    expect(trophies("b", r).silver).toBe(1);
    expect(trophies("c", r).bronze).toBe(1);
  });

  it("names the latest winner champion, nobody after a tie", () => {
    expect(champion(history)).toBe("adam");
    expect(champion(history.slice(0, 3))).toBeNull();
    expect(champion([])).toBeNull();
  });
});

describe("headToHead", () => {
  it("counts weeks each had more, from both sides, skipping ties and weeks one sat out", () => {
    const r = [
      result("2026-09-21", [["adam", 9], ["jp", 1]], "adam"),
      result("2026-09-28", [["jp", 9], ["adam", 1]], "jp"),
      result("2026-10-05", [["jp", 5], ["adam", 5]], null),
      result("2026-10-12", [["jp", 9], ["peter", 1]], "jp"),
      result("2026-10-19", [["jp", 9], ["adam", 3]], "jp"),
    ];
    expect(headToHead("jp", "adam", r)).toEqual({ a: 2, b: 1 });
    expect(headToHead("adam", "jp", r)).toEqual({ a: 1, b: 2 });
  });
});

describe("trophyCopy", () => {
  it("nudges before the first win", () => {
    expect(trophyCopy({ weeksWon: 0, silver: 0, bronze: 0, run: 0, bestRun: 0 })).toEqual({
      weeks: { value: "🏆 0", sub: "first win up for grabs", earned: false },
      run: { value: "—", sub: "win this week to start one", earned: false },
    });
  });

  it("shows a live run in gold", () => {
    expect(trophyCopy({ weeksWon: 2, silver: 0, bronze: 0, run: 2, bestRun: 2 })).toEqual({
      weeks: { value: "🏆 2", sub: "weeks won", earned: true },
      run: { value: "🔥 2", sub: "best ever 2", earned: true },
    });
  });

  it("falls back to the best run, muted, when the run is over", () => {
    expect(trophyCopy({ weeksWon: 3, silver: 0, bronze: 0, run: 0, bestRun: 3 }).run)
      .toEqual({ value: "🔥 3", sub: "best run · win this week to start a new one", earned: false });
  });

  it("lists medals once any podium week exists", () => {
    expect(trophyCopy({ weeksWon: 1, silver: 2, bronze: 0, run: 0, bestRun: 1 }).weeks.sub).toBe("🥇 1 · 🥈 2 · 🥉 0");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/__tests__/competition.test.ts`
Expected: FAIL — cannot resolve `@/lib/competition`.

- [ ] **Step 3: Implement**

Create `web/lib/competition.ts`:

```ts
// The weekly race. Everything here is derived from stored days on every load,
// never frozen, so a late sync corrects a result instead of contradicting it.
import { currentDayKey, rankBy, shiftDays, weekStart } from "@/lib/metrics";
import type { PersonView } from "@/lib/types";

/** Week 39 of 2026, the week the crew started. Earlier weeks never count. */
export const SEASON_START = "2026-09-21";
const SEASON_END = shiftDays(SEASON_START, 6);

export type Entry = { id: string; cards: number };
export type WeekResult = {
  week: string;              // its Monday
  standings: Entry[];        // everyone competing, most cards first
  winner: string | null;     // null on a tie for first
  podium: string[] | null;   // first three, only with four or more competitors
};
export type Trophies = { weeksWon: number; silver: number; bronze: number; run: number; bestRun: number };
export type TileCopy = { value: string; sub: string; earned: boolean };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO week number of a Monday: the week belongs to the year its Thursday is in. */
export function isoWeek(monday: string): number {
  const thursday = new Date(`${shiftDays(monday, 3)}T00:00:00Z`);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
}

/** "Week 40 · 28 Sep – 4 Oct" */
export function weekLabel(monday: string): string {
  const short = (key: string) => {
    const d = new Date(`${key}T00:00:00Z`);
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  };
  return `Week ${isoWeek(monday)} · ${short(monday)} – ${short(shiftDays(monday, 6))}`;
}

function knownZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The Anki day it is now for someone. A zone Intl doesn't know (setup writes
 * "local" when left blank) is read as the last zone on Earth, so an unknown
 * clock can never hold a week open.
 */
export function dayNow(p: PersonView, now: number): string {
  return currentDayKey(knownZone(p.profile.tz) ? p.profile.tz : "Etc/GMT+12", p.meta.todayKey, now);
}

function joinDay(p: PersonView): string {
  return currentDayKey(knownZone(p.profile.tz) ? p.profile.tz : "UTC", "", p.profile.joinedAt);
}

/** Week 39 for founders; for anyone else, the Monday after the week they joined. */
export function firstWeek(p: PersonView): string {
  const joined = joinDay(p);
  return joined <= SEASON_END ? SEASON_START : shiftDays(weekStart(joined), 7);
}

export function competesIn(p: PersonView, week: string): boolean {
  return week >= SEASON_START && week >= firstWeek(p);
}

export function weekCards(p: PersonView, week: string): number {
  const end = shiftDays(week, 6);
  return p.days.reduce((s, d) => (d.date >= week && d.date <= end ? s + d.reviews : s), 0);
}

export function weekResult(week: string, people: PersonView[]): WeekResult | null {
  const racing = people.filter((p) => competesIn(p, week));
  if (racing.length < 2) return null;
  const standings = rankBy(racing, (p) => weekCards(p, week))
    .map((p) => ({ id: p.profile.id, cards: weekCards(p, week) }));
  const winner = standings[0].cards > standings[1].cards ? standings[0].id : null;
  const podium = winner && standings.length >= 4 ? standings.slice(0, 3).map((s) => s.id) : null;
  return { week, standings, winner, podium };
}

/** Final once it's past Sunday for every competitor. Clock only: nobody's sync is waited for. */
export function isFinal(week: string, people: PersonView[], now: number): boolean {
  const next = shiftDays(week, 7);
  return people.filter((p) => competesIn(p, week)).every((p) => dayNow(p, now) >= next);
}

/** Every finished week that has a result, oldest first. */
export function finishedResults(people: PersonView[], now: number): WeekResult[] {
  if (people.length === 0) return [];
  const latest = people.map((p) => weekStart(dayNow(p, now))).sort().pop()!;
  const out: WeekResult[] = [];
  for (let w = SEASON_START; w < latest; w = shiftDays(w, 7)) {
    if (!isFinal(w, people, now)) break;
    const r = weekResult(w, people);
    if (r) out.push(r);
  }
  return out;
}

export function trophies(id: string, results: WeekResult[]): Trophies {
  const t: Trophies = { weeksWon: 0, silver: 0, bronze: 0, run: 0, bestRun: 0 };
  for (const r of results) {
    if (r.winner === id) {
      t.weeksWon++;
      t.run++;
      t.bestRun = Math.max(t.bestRun, t.run);
    } else if (r.standings.some((s) => s.id === id)) {
      t.run = 0; // a loss or a tie ends it
    }
    if (r.podium?.[1] === id) t.silver++;
    if (r.podium?.[2] === id) t.bronze++;
  }
  return t;
}

/** Weeks `a` had more cards than `b`, and the reverse, over weeks both competed in. */
export function headToHead(a: string, b: string, results: WeekResult[]): { a: number; b: number } {
  const out = { a: 0, b: 0 };
  for (const r of results) {
    const ca = r.standings.find((s) => s.id === a)?.cards;
    const cb = r.standings.find((s) => s.id === b)?.cards;
    if (ca === undefined || cb === undefined) continue;
    if (ca > cb) out.a++;
    else if (cb > ca) out.b++;
  }
  return out;
}

/** Whoever won the latest finished week; nobody after a tie. */
export function champion(results: WeekResult[]): string | null {
  return results.length > 0 ? results[results.length - 1].winner : null;
}

/** The words on the Weeks won and Winning run tiles. Gold once earned; a nudge before. */
export function trophyCopy(t: Trophies): { weeks: TileCopy; run: TileCopy } {
  const medals = t.silver + t.bronze > 0 ? `🥇 ${t.weeksWon} · 🥈 ${t.silver} · 🥉 ${t.bronze}` : null;
  const weeks: TileCopy = t.weeksWon > 0
    ? { value: `🏆 ${t.weeksWon}`, sub: medals ?? (t.weeksWon === 1 ? "week won" : "weeks won"), earned: true }
    : { value: "🏆 0", sub: medals ?? "first win up for grabs", earned: medals !== null };
  const run: TileCopy = t.run > 0
    ? { value: `🔥 ${t.run}`, sub: `best ever ${t.bestRun}`, earned: true }
    : t.bestRun > 0
      ? { value: `🔥 ${t.bestRun}`, sub: "best run · win this week to start a new one", earned: false }
      : { value: "—", sub: "win this week to start one", earned: false };
  return { weeks, run };
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/__tests__/competition.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/competition.ts web/lib/__tests__/competition.test.ts
git commit -m "Work out each week's winner, runs and head-to-heads from the days we already store" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HJZ1G54D8DTRvKcUZzukRz"
```

---

### Task 3: The roundup's words (`lib/roundup.ts`)

**Files:**
- Create: `web/lib/roundup.ts`
- Test: `web/lib/__tests__/roundup.test.ts`

**Interfaces:**
- Consumes: `trophies`, `WeekResult` (Task 2); `shiftDays` (metrics).
- Produces:
  ```ts
  export function headline(result: WeekResult, history: WeekResult[], names: Record<string, string>): string;
  export function swingLine(result: WeekResult, people: PersonView[], names: Record<string, string>): string | null;
  ```
  `history` = every result up to and including `result`, oldest first.

- [ ] **Step 1: Write the failing tests**

Create `web/lib/__tests__/roundup.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { headline, swingLine } from "@/lib/roundup";
import type { WeekResult } from "@/lib/competition";
import type { DayRow, PersonView } from "@/lib/types";

const names = { jp: "JP", adam: "Adam", peter: "Peter" };
const r = (week: string, standings: [string, number][], winner: string | null): WeekResult =>
  ({ week, standings: standings.map(([id, cards]) => ({ id, cards })), winner, podium: null });

describe("headline", () => {
  it("picks the verb from the margin", () => {
    const cases: [number, number, string][] = [
      [1000, 990, "edges"], [1284, 1071, "holds off"], [1000, 700, "beats"], [894, 88, "cruises past"],
    ];
    for (const [a, b, verb] of cases) {
      // Adam has won before (not a first win) and JP won last week with a run of 1 (not a snapped run).
      const history = [
        r("2026-09-07", [["adam", 5], ["jp", 1]], "adam"),
        r("2026-09-14", [["jp", 5], ["adam", 1]], "jp"),
      ];
      const week = r("2026-09-21", [["adam", a], ["jp", b]], "adam");
      expect(headline(week, [...history, week], names)).toBe(`Adam ${verb} JP by ${(a - b).toLocaleString("en-US")}`);
    }
  });

  it("celebrates a first ever win", () => {
    const week = r("2026-09-21", [["adam", 894], ["jp", 88]], "adam");
    expect(headline(week, [week], names)).toBe("Adam cruises past JP by 806 for a first ever win");
  });

  it("says back-to-back, then N straight", () => {
    const w1 = r("2026-09-21", [["adam", 894], ["jp", 88]], "adam");
    const w2 = r("2026-09-28", [["adam", 1284], ["jp", 1071]], "adam");
    const w3 = r("2026-10-05", [["adam", 1000], ["jp", 700]], "adam");
    expect(headline(w2, [w1, w2], names)).toBe("Adam holds off JP by 213 to go back-to-back");
    expect(headline(w3, [w1, w2, w3], names)).toBe("Adam beats JP by 300 to make it 3 straight");
  });

  it("calls out a snapped run", () => {
    const w1 = r("2026-09-21", [["adam", 9], ["jp", 1]], "adam");
    const w2 = r("2026-09-28", [["adam", 9], ["jp", 1]], "adam");
    const w3 = r("2026-10-05", [["jp", 500], ["adam", 450]], "jp");
    expect(headline(w3, [w1, w2, w3], names)).toBe("JP snaps Adam's 2-week run, by 50");
  });

  it("calls a tie a dead heat", () => {
    const week = r("2026-09-21", [["adam", 300], ["jp", 300]], null);
    expect(headline(week, [week], names)).toBe("Dead heat: Adam and JP both on 300");
  });
});

function day(date: string, reviews: number): DayRow {
  return { date, reviews, minutes: 0, newCards: 0, ease1: 0, ease2: 0, ease3: 0, ease4: 0, perDeck: {} };
}
function person(id: string, days: DayRow[]): PersonView {
  return {
    profile: { id, displayName: names[id as keyof typeof names], tz: "UTC", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-10-04", allTimeReviews: 0, firstReviewAt: 0 },
    days,
  };
}

describe("swingLine", () => {
  const week = "2026-09-28";

  it("credits the winner's biggest day and notes a comeback", () => {
    // JP leads 238 to 200 after Wednesday; Adam's 412 on Thursday swings it.
    const jp = person("jp", [day("2026-09-28", 120), day("2026-09-29", 60), day("2026-09-30", 58), day("2026-10-01", 50)]);
    const adam = person("adam", [day("2026-09-28", 100), day("2026-09-30", 100), day("2026-10-01", 412)]);
    const result = r(week, [["adam", 612], ["jp", 288]], "adam");
    expect(swingLine(result, [jp, adam], names)).toBe(
      "Thursday swung it — Adam's 412 was the biggest day of the week. JP was 38 ahead going into Thursday.",
    );
  });

  it("gives the loser credit for the biggest day without saying it swung anything", () => {
    const jp = person("jp", [day("2026-09-28", 300)]);
    const adam = person("adam", [day("2026-09-28", 10), day("2026-09-29", 200), day("2026-09-30", 200)]);
    const result = r(week, [["adam", 410], ["jp", 300]], "adam");
    expect(swingLine(result, [jp, adam], names)).toBe(
      "JP's 300 on Monday was the biggest day of the week. JP was 90 ahead going into Wednesday.",
    );
  });

  it("is null when nobody studied", () => {
    expect(swingLine(r(week, [["adam", 0], ["jp", 0]], null), [person("jp", []), person("adam", [])], names)).toBeNull();
  });
});
```

(Check of the loser case: after Mon JP 300 vs Adam 10; after Tue 300 vs 210 → JP ahead by 90; after Wed 300 vs 410 → Adam ahead. Last day Adam trailed = Tuesday (index 1), gap 90, "going into Wednesday".)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/__tests__/roundup.test.ts`
Expected: FAIL — cannot resolve `@/lib/roundup`.

- [ ] **Step 3: Implement**

Create `web/lib/roundup.ts`:

```ts
// The roundup's words. Deterministic from the week's data, so a replay reads
// exactly like the first showing.
import { trophies, type WeekResult } from "@/lib/competition";
import { shiftDays } from "@/lib/metrics";
import type { PersonView } from "@/lib/types";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const n = (x: number) => x.toLocaleString("en-US");

function verb(margin: number, runnerUp: number): string {
  const share = runnerUp === 0 ? Infinity : margin / runnerUp;
  if (share < 0.05) return "edges";
  if (share < 0.25) return "holds off";
  if (share < 0.6) return "beats";
  return "cruises past";
}

/** "Adam holds off JP by 213 to go back-to-back". `history` runs up to and including `result`. */
export function headline(result: WeekResult, history: WeekResult[], names: Record<string, string>): string {
  const name = (id: string) => names[id] ?? id;
  const [first, second] = result.standings;
  if (!result.winner) return `Dead heat: ${name(first.id)} and ${name(second.id)} both on ${n(first.cards)}`;

  const margin = first.cards - second.cards;
  const upTo = history.slice(0, history.findIndex((h) => h.week === result.week) + 1);
  const before = upTo.slice(0, -1);
  const prev = before[before.length - 1];
  if (prev?.winner && prev.winner !== result.winner) {
    const ended = trophies(prev.winner, before).run;
    if (ended >= 2) return `${name(result.winner)} snaps ${name(prev.winner)}'s ${ended}-week run, by ${n(margin)}`;
  }

  const { run, weeksWon } = trophies(result.winner, upTo);
  const suffix = run >= 3 ? ` to make it ${run} straight`
    : run === 2 ? " to go back-to-back"
    : weeksWon === 1 ? " for a first ever win"
    : "";
  return `${name(result.winner)} ${verb(margin, second.cards)} ${name(second.id)} by ${n(margin)}${suffix}`;
}

function cardsOn(p: PersonView | undefined, date: string): number {
  return p?.days.find((d) => d.date === date)?.reviews ?? 0;
}

/**
 * The week's story in a sentence or two: the biggest single day, and whether
 * the winner had to come from behind to take it.
 */
export function swingLine(result: WeekResult, people: PersonView[], names: Record<string, string>): string | null {
  const name = (id: string) => names[id] ?? id;
  const byId = new Map(people.map((p) => [p.profile.id, p]));

  // Earliest day wins a tie, then the higher finisher.
  let best: { id: string; i: number; cards: number } | null = null;
  for (let i = 0; i < 7; i++) {
    const date = shiftDays(result.week, i);
    for (const s of result.standings) {
      const cards = cardsOn(byId.get(s.id), date);
      if (cards > 0 && (!best || cards > best.cards)) best = { id: s.id, i, cards };
    }
  }
  if (!best) return null;

  let line = best.id === result.winner
    ? `${WEEKDAYS[best.i]} swung it — ${name(best.id)}'s ${n(best.cards)} was the biggest day of the week.`
    : `${name(best.id)}'s ${n(best.cards)} on ${WEEKDAYS[best.i]} was the biggest day of the week.`;

  if (result.winner) {
    const runnerUp = result.standings[1].id;
    let w = 0;
    let r = 0;
    let trailed = -1;
    let gap = 0;
    for (let i = 0; i < 6; i++) {
      const date = shiftDays(result.week, i);
      w += cardsOn(byId.get(result.winner), date);
      r += cardsOn(byId.get(runnerUp), date);
      if (r > w) { trailed = i; gap = r - w; }
    }
    if (trailed >= 0) line += ` ${name(runnerUp)} was ${n(gap)} ahead going into ${WEEKDAYS[trailed + 1]}.`;
  }
  return line;
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/__tests__/roundup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/lib/roundup.ts web/lib/__tests__/roundup.test.ts
git commit -m "Write each week's headline and what swung it" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HJZ1G54D8DTRvKcUZzukRz"
```

---

### Task 4: Remembering what each viewer has seen (server)

**Files:**
- Modify: `web/lib/types.ts`, `web/lib/store.ts`, `web/app/api/crew/route.ts`
- Create: `web/app/api/competition/route.ts`
- Test: `web/lib/__tests__/store.test.ts`, `web/app/api/__tests__/competition.test.ts`, `web/app/api/__tests__/crew.test.ts`

**Interfaces:**
- Consumes: `Look`, `LookScores` (Task 1).
- Produces (types.ts):
  ```ts
  export type Standing = { week: string; order: string[] };
  export type CompetitionState = { look?: Look; standing?: Standing; results: Record<string, string> };
  // CrewResponse gains:  competition?: CompetitionState;
  ```
- Produces (store.ts): `getCompetition(userId: string): Promise<CompetitionState>`, `saveCompetition(userId: string, patch: Partial<CompetitionState>): Promise<void>` (results merge key by key).
- Produces (HTTP): `POST /api/competition?key=…` body `{ look?, standing?, results? }` → `200 {ok:true}` | `400` | `401`.

- [ ] **Step 1: Write the failing tests**

Append to `web/lib/__tests__/store.test.ts` (add `getCompetition, saveCompetition` to the existing `import { … } from "@/lib/store"`):

```ts
describe("competition state", () => {
  it("is empty for someone who has never been", async () => {
    expect(await getCompetition("nobody")).toEqual({ results: {} });
  });

  it("round-trips a look and a standing, and merges results week by week", async () => {
    const look = { at: 5, day: "2026-09-29", week: "2026-09-28", scores: { jp: { today: 1, week: 2, all: 3 } } };
    await saveCompetition("jp", { look, standing: { week: "2026-09-28", order: ["adam", "jp"] }, results: { "2026-09-21": "adam" } });
    await saveCompetition("jp", { results: { "2026-09-28": "none" } });
    expect(await getCompetition("jp")).toEqual({
      look,
      standing: { week: "2026-09-28", order: ["adam", "jp"] },
      results: { "2026-09-21": "adam", "2026-09-28": "none" },
    });
  });
});
```

Create `web/app/api/__tests__/competition.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

const { saved } = vi.hoisted(() => ({ saved: [] as [string, unknown][] }));

vi.mock("@/lib/store", () => ({
  saveCompetition: async (id: string, patch: unknown) => { saved.push([id, patch]); },
}));

import { POST } from "@/app/api/competition/route";

function req(body: unknown, key = "key_jp") {
  return new Request(`https://x.test/api/competition?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const look = { at: 5, day: "2026-09-29", week: "2026-09-28", scores: { jp: { today: 1, week: 2, all: 3 } } };

beforeEach(() => {
  saved.length = 0;
  process.env.READ_KEYS = JSON.stringify({ key_jp: "jp" });
});

describe("POST /api/competition", () => {
  it("saves a look, a standing and results for the key holder", async () => {
    const body = { look, standing: { week: "2026-09-28", order: ["adam", "jp"] }, results: { "2026-09-21": "adam" } };
    const res = await POST(req(body));
    expect(res.status).toBe(200);
    expect(saved).toEqual([["jp", body]]);
  });

  it("caps a look's time at now", async () => {
    await POST(req({ look: { ...look, at: Date.now() + 1e9 } }));
    expect((saved[0][1] as { look: { at: number } }).look.at).toBeLessThanOrEqual(Date.now());
  });

  it("rejects a bad key, bad JSON, an empty body and malformed parts", async () => {
    expect((await POST(req({ look }, "nope"))).status).toBe(401);
    expect((await POST(req("{nope"))).status).toBe(400);
    expect((await POST(req({}))).status).toBe(400);
    expect((await POST(req(null))).status).toBe(400);
    expect((await POST(req({ look: { ...look, day: "Monday" } }))).status).toBe(400);
    expect((await POST(req({ look: { ...look, scores: { jp: { today: -1, week: 0, all: 0 } } } }))).status).toBe(400);
    expect((await POST(req({ standing: { week: "2026-09-28", order: ["x".repeat(65)] } }))).status).toBe(400);
    expect((await POST(req({ results: { "week 39": "adam" } }))).status).toBe(400);
    expect((await POST(req({ results: { "2026-09-21": 7 } }))).status).toBe(400);
    expect(saved).toEqual([]);
  });
});
```

In `web/app/api/__tests__/crew.test.ts`, add to the `vi.mock("@/lib/store", …)` factory:
```ts
  getCompetition: async (id: string) => ({ results: id === "jp" ? { "2026-09-21": "adam" } : {} }),
```
and add a test inside `describe("GET /api/crew", …)`:
```ts
  it("returns what the viewer has already seen of the competition", async () => {
    const res = await GET(new Request("https://x.test/api/crew?key=key_jp"));
    expect((await res.json()).competition).toEqual({ results: { "2026-09-21": "adam" } });
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run lib/__tests__/store.test.ts app/api/__tests__/competition.test.ts app/api/__tests__/crew.test.ts`
Expected: FAIL — `getCompetition`/`saveCompetition` and the route don't exist; crew has no `competition`.

- [ ] **Step 3: Types**

Append to `web/lib/types.ts`:

```ts
/** The This week order a viewer last acknowledged. Passes are measured against it. */
export type Standing = { week: string; order: string[] };

/** Per-viewer competition memory, on the server so each moment plays once across devices. */
export type CompetitionState = {
  look?: Look;
  standing?: Standing;
  /** A week's Monday -> the winner id you were shown, or "none" for a tie. */
  results: Record<string, string>;
};
```

and add to `CrewResponse` (after `notes?`):

```ts
  /** What the viewer has already seen of the weekly race. */
  competition?: CompetitionState;
```

- [ ] **Step 4: Store**

In `web/lib/store.ts`: add `CompetitionState, Look, Standing` to the type import; add `const competitionKey = (id: string) => \`competition:${id}\`;` beside the other key helpers; append:

```ts
/* ------------------------------------------------------------ competition */

const RESULT = "r:";

/**
 * What this viewer has seen of the weekly race: their last look, the standing
 * they last acknowledged, and which week results they were shown. One hash, so
 * a result is one field and marking one never rewrites the others.
 */
export async function getCompetition(userId: string): Promise<CompetitionState> {
  const raw = (await redis.hgetall<Record<string, unknown>>(competitionKey(userId))) ?? {};
  const out: CompetitionState = { results: {} };
  for (const [k, v] of Object.entries(raw)) {
    if (k === "look") out.look = parse<Look>(v);
    else if (k === "standing") out.standing = parse<Standing>(v);
    else if (k.startsWith(RESULT)) out.results[k.slice(RESULT.length)] = String(v);
  }
  return out;
}

export async function saveCompetition(userId: string, patch: Partial<CompetitionState>): Promise<void> {
  const fields: Record<string, string> = {};
  if (patch.look) fields.look = JSON.stringify(patch.look);
  if (patch.standing) fields.standing = JSON.stringify(patch.standing);
  for (const [week, winner] of Object.entries(patch.results ?? {})) fields[RESULT + week] = winner;
  if (Object.keys(fields).length > 0) await redis.hset(competitionKey(userId), fields);
}
```

- [ ] **Step 5: Route**

Create `web/app/api/competition/route.ts`:

```ts
import { NextResponse } from "next/server";
import { userForRequest } from "@/lib/identity";
import { saveCompetition } from "@/lib/store";
import type { CompetitionState, Look, LookScores, Standing } from "@/lib/types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PEOPLE = 20;
const MAX_WEEKS = 200;
const MAX_ID = 64;

const bad = () => NextResponse.json({ error: "bad request" }, { status: 400 });
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= MAX_ID;
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function asLook(v: unknown): Look | null {
  if (!isObject(v) || !isCount(v.at) || typeof v.day !== "string" || !DAY.test(v.day)
      || typeof v.week !== "string" || !DAY.test(v.week) || !isObject(v.scores)) return null;
  const entries = Object.entries(v.scores);
  if (entries.length > MAX_PEOPLE) return null;
  const scores: Record<string, LookScores> = {};
  for (const [id, s] of entries) {
    if (!isId(id) || !isObject(s) || !isCount(s.today) || !isCount(s.week) || !isCount(s.all)) return null;
    scores[id] = { today: s.today, week: s.week, all: s.all };
  }
  return { at: Math.min(v.at, Date.now()), day: v.day, week: v.week, scores };
}

function asStanding(v: unknown): Standing | null {
  if (!isObject(v) || typeof v.week !== "string" || !DAY.test(v.week) || !Array.isArray(v.order)) return null;
  if (v.order.length > MAX_PEOPLE || !v.order.every(isId)) return null;
  return { week: v.week, order: v.order };
}

function asResults(v: unknown): Record<string, string> | null {
  if (!isObject(v)) return null;
  const entries = Object.entries(v);
  if (entries.length > MAX_WEEKS) return null;
  for (const [week, winner] of entries) if (!DAY.test(week) || !isId(winner)) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

/** Saves what the key holder has seen: their last look, acknowledged standing, and results shown. */
export async function POST(req: Request) {
  const user = userForRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return bad();
  }
  if (!isObject(body)) return bad();

  const patch: Partial<CompetitionState> = {};
  if (body.look !== undefined) {
    const look = asLook(body.look);
    if (!look) return bad();
    patch.look = look;
  }
  if (body.standing !== undefined) {
    const standing = asStanding(body.standing);
    if (!standing) return bad();
    patch.standing = standing;
  }
  if (body.results !== undefined) {
    const results = asResults(body.results);
    if (!results) return bad();
    patch.results = results;
  }
  if (Object.keys(patch).length === 0) return bad();

  await saveCompetition(user, patch);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Crew route**

In `web/app/api/crew/route.ts`: import `getCompetition`; after `const notes = await getNotes();` add `const competition = await getCompetition(viewer);`; add `competition` to the `body` object.

- [ ] **Step 7: Full check**

Run: `npm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add web/lib web/app/api
git commit -m "Remember per viewer what they've seen of the weekly race" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HJZ1G54D8DTRvKcUZzukRz"
```

---

### Task 5: Moments (`lib/moments.ts`) and the board's crown and pass sweep

**Files:**
- Create: `web/lib/moments.ts`
- Modify: `web/app/components/Board.tsx`, `web/app/globals.css`
- Test: `web/lib/__tests__/moments.test.ts`, `web/app/components/__tests__/Board.test.tsx`

**Interfaces:**
- Consumes: `competesIn`, `isoWeek`, `WeekResult` (Task 2); `rankBy`, `scoreNow`, `weekStart` (Task 1); `CompetitionState`, `Standing` (Task 4).
- Produces:
  ```ts
  export type Moment =
    | { kind: "results"; result: WeekResult }
    | { kind: "late"; result: WeekResult }
    | { kind: "passed"; ids: string[] }
    | { kind: "passedBy"; ids: string[] };
  export function standingNow(people: PersonView[], viewerDay: string): Standing;
  export function pendingMoments(people: PersonView[], viewer: string | null, state: CompetitionState, results: WeekResult[]): Moment[];
  export function ackPatch(people: PersonView[], viewer: string | null, results: WeekResult[]): Partial<CompetitionState>;
  export function silentPatch(people: PersonView[], viewer: string | null, state: CompetitionState, results: WeekResult[]): Partial<CompetitionState> | null;
  export function momentHeadline(m: Moment, people: PersonView[], viewer: string | null): string;
  ```
- Produces (Board): props `champion?: string | null`, `celebrate?: { id: string; tone: "gold" | "rose" } | null` (replaces `justPassed`).

- [ ] **Step 1: Write the failing moments tests**

Create `web/lib/__tests__/moments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ackPatch, momentHeadline, pendingMoments, silentPatch, standingNow } from "@/lib/moments";
import type { WeekResult } from "@/lib/competition";
import type { CompetitionState, DayRow, PersonView } from "@/lib/types";

function day(date: string, reviews: number): DayRow {
  return { date, reviews, minutes: 0, newCards: 0, ease1: 0, ease2: 0, ease3: 0, ease4: 0, perDeck: {} };
}
function person(id: string, name: string, days: DayRow[], todayKey = "2026-09-29"): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/New_York", joinedAt: Date.UTC(2026, 8, 22) },
    meta: { lastPublishAt: 0, streak: 0, todayKey, allTimeReviews: 0, firstReviewAt: 0 },
    days,
  };
}

const W39: WeekResult = { week: "2026-09-21", standings: [{ id: "adam", cards: 894 }, { id: "jp", cards: 88 }], winner: "adam", podium: null };
const W40: WeekResult = { week: "2026-09-28", standings: [{ id: "jp", cards: 900 }, { id: "adam", cards: 800 }], winner: "jp", podium: null };

// Tuesday 29 Sep: JP 50, Adam 40 this week.
const jp = person("jp", "JP", [day("2026-09-29", 50)]);
const adam = person("adam", "Adam", [day("2026-09-28", 40)]);
const state = (s: Partial<CompetitionState> = {}): CompetitionState => ({ results: {}, ...s });

describe("pendingMoments", () => {
  it("offers the latest week's roundup until it has been shown", () => {
    expect(pendingMoments([jp, adam], "jp", state(), [W39])).toEqual([{ kind: "results", result: W39 }]);
    expect(pendingMoments([jp, adam], "jp", state({ results: { "2026-09-21": "adam" } }), [W39])).toEqual([]);
  });

  it("only offers the latest roundup, not every missed week", () => {
    expect(pendingMoments([jp, adam], "jp", state(), [W39, W40])).toEqual([{ kind: "results", result: W40 }]);
  });

  it("corrects a result a late sync changed", () => {
    const shown = state({ results: { "2026-09-21": "jp" } });
    expect(pendingMoments([jp, adam], "jp", shown, [W39])).toEqual([{ kind: "late", result: W39 }]);
  });

  it("reports passing and being passed against the standing you last acknowledged", () => {
    const was = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["adam", "jp"] } });
    expect(pendingMoments([jp, adam], "jp", was, [W39])).toEqual([{ kind: "passed", ids: ["adam"] }]);
    expect(pendingMoments([jp, adam], "adam", was, [W39])).toEqual([{ kind: "passedBy", ids: ["jp"] }]);
  });

  it("says nothing when the order is unchanged, or the standing is from last week", () => {
    const same = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["jp", "adam"] } });
    expect(pendingMoments([jp, adam], "jp", same, [W39])).toEqual([]);
    const old = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-21", order: ["adam", "jp"] } });
    expect(pendingMoments([jp, adam], "jp", old, [W39])).toEqual([]);
  });

  it("has no pass moments on a Monday", () => {
    const mon = [person("jp", "JP", [day("2026-09-28", 5)], "2026-09-28"), person("adam", "Adam", [], "2026-09-28")];
    const was = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["adam", "jp"] } });
    expect(pendingMoments(mon, "jp", was, [W39])).toEqual([]);
  });

  it("has nothing for a viewer who isn't on the board", () => {
    expect(pendingMoments([jp, adam], null, state(), [W39])).toEqual([]);
  });
});

describe("patches", () => {
  it("acknowledges every result and the current order", () => {
    expect(ackPatch([jp, adam], "jp", [W39, W40])).toEqual({
      results: { "2026-09-21": "adam", "2026-09-28": "jp" },
      standing: { week: "2026-09-28", order: ["jp", "adam"] },
    });
  });

  it("records a tie as 'none'", () => {
    const tie = { ...W39, winner: null };
    expect(ackPatch([jp, adam], "jp", [tie]).results).toEqual({ "2026-09-21": "none" });
  });

  it("silently records missed older weeks and a first standing", () => {
    expect(silentPatch([jp, adam], "jp", state(), [W39, W40])).toEqual({
      results: { "2026-09-21": "adam" },
      standing: { week: "2026-09-28", order: ["jp", "adam"] },
    });
  });

  it("leaves a pending pass alone mid-week", () => {
    const was = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["adam", "jp"] } });
    expect(silentPatch([jp, adam], "jp", was, [W39])).toBeNull();
  });

  it("resets the baseline on Monday", () => {
    const mon = [person("jp", "JP", [day("2026-09-28", 5)], "2026-09-28"), person("adam", "Adam", [], "2026-09-28")];
    const was = state({ results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["adam", "jp"] } });
    expect(silentPatch(mon, "jp", was, [W39])).toEqual({ standing: { week: "2026-09-28", order: ["jp", "adam"] } });
  });

  it("orders the standing among this week's competitors only", () => {
    const late = { ...person("peter", "Peter", [day("2026-09-29", 999)]), profile: { id: "peter", displayName: "Peter", tz: "America/New_York", joinedAt: Date.UTC(2026, 8, 29) } };
    expect(standingNow([jp, adam, late], "2026-09-29")).toEqual({ week: "2026-09-28", order: ["jp", "adam"] });
  });
});

describe("momentHeadline", () => {
  it("names what happened", () => {
    expect(momentHeadline({ kind: "results", result: W39 }, [jp, adam], "jp")).toBe("🏆 Week 39 results are in");
    expect(momentHeadline({ kind: "late", result: W39 }, [jp, adam], "jp")).toBe("Late sync: Adam took week 39 after all");
    expect(momentHeadline({ kind: "passed", ids: ["adam"] }, [jp, adam], "jp")).toBe("⚡ You passed Adam this week");
    expect(momentHeadline({ kind: "passedBy", ids: ["jp"] }, [jp, adam], "adam")).toBe("JP passed you this week — 10 behind");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run lib/__tests__/moments.test.ts`
Expected: FAIL — cannot resolve `@/lib/moments`.

- [ ] **Step 3: Implement**

Create `web/lib/moments.ts`:

```ts
// What happened since you last looked, and the bookkeeping that makes each
// moment play once. Pure: the page decides when to show and when to save.
import { competesIn, isoWeek, type WeekResult } from "@/lib/competition";
import { rankBy, scoreNow, weekStart } from "@/lib/metrics";
import type { CompetitionState, PersonView, Standing } from "@/lib/types";

export type Moment =
  | { kind: "results"; result: WeekResult }
  | { kind: "late"; result: WeekResult }
  | { kind: "passed"; ids: string[] }
  | { kind: "passedBy"; ids: string[] };

const shownAs = (r: WeekResult) => r.winner ?? "none";
const isMonday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay() === 1;

/** This week's order among the people competing in it, most cards first. */
export function standingNow(people: PersonView[], viewerDay: string): Standing {
  const week = weekStart(viewerDay);
  const racing = people.filter((p) => competesIn(p, week));
  return { week, order: rankBy(racing, (p) => scoreNow(p, "week")).map((p) => p.profile.id) };
}

/**
 * In the order they play: the latest roundup, then late corrections, then
 * passes on this week. Passes are net against the standing you last
 * acknowledged, so passing and being re-passed before you looked is nothing.
 * None on a Monday: everyone restarts at 0, and Monday is the roundup's.
 */
export function pendingMoments(
  people: PersonView[], viewer: string | null, state: CompetitionState, results: WeekResult[],
): Moment[] {
  const me = people.find((p) => p.profile.id === viewer);
  if (!me) return [];
  const out: Moment[] = [];

  const latest = results[results.length - 1];
  if (latest && state.results[latest.week] === undefined) out.push({ kind: "results", result: latest });
  for (const r of results) {
    const shown = state.results[r.week];
    if (shown !== undefined && shown !== shownAs(r)) out.push({ kind: "late", result: r });
  }

  const today = me.meta.todayKey;
  const now = standingNow(people, today);
  const was = state.standing;
  if (!isMonday(today) && was && was.week === now.week) {
    const meWas = was.order.indexOf(me.profile.id);
    const meNow = now.order.indexOf(me.profile.id);
    if (meWas >= 0 && meNow >= 0) {
      const others = now.order.filter((id) => id !== me.profile.id && was.order.includes(id));
      const passed = others.filter((id) => was.order.indexOf(id) < meWas && now.order.indexOf(id) > meNow);
      const passedBy = others.filter((id) => was.order.indexOf(id) > meWas && now.order.indexOf(id) < meNow);
      if (passed.length > 0) out.push({ kind: "passed", ids: passed });
      if (passedBy.length > 0) out.push({ kind: "passedBy", ids: passedBy });
    }
  }
  return out;
}

/** Everything marked as seen. Sent when the pill is tapped. */
export function ackPatch(people: PersonView[], viewer: string | null, results: WeekResult[]): Partial<CompetitionState> {
  const me = people.find((p) => p.profile.id === viewer);
  return {
    results: Object.fromEntries(results.map((r) => [r.week, shownAs(r)])),
    ...(me ? { standing: standingNow(people, me.meta.todayKey) } : {}),
  };
}

/**
 * Bookkeeping that needs no tap: older roundups you missed (only the latest
 * gets a showing), and a fresh standing baseline for a new week, a first
 * visit, or a Monday. Null when there is nothing to save.
 */
export function silentPatch(
  people: PersonView[], viewer: string | null, state: CompetitionState, results: WeekResult[],
): Partial<CompetitionState> | null {
  const me = people.find((p) => p.profile.id === viewer);
  if (!me) return null;
  const patch: Partial<CompetitionState> = {};
  const missed = results.slice(0, -1).filter((r) => state.results[r.week] === undefined);
  if (missed.length > 0) patch.results = Object.fromEntries(missed.map((r) => [r.week, shownAs(r)]));
  const now = standingNow(people, me.meta.todayKey);
  if (!state.standing || state.standing.week !== now.week || isMonday(me.meta.todayKey)) patch.standing = now;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** The line on the pill: what happened, not "something happened". */
export function momentHeadline(m: Moment, people: PersonView[], viewer: string | null): string {
  const byId = new Map(people.map((p) => [p.profile.id, p]));
  const name = (id: string) => byId.get(id)?.profile.displayName ?? id;
  const list = (ids: string[]) => ids.map(name).join(" and ");
  switch (m.kind) {
    case "results":
      return `🏆 Week ${isoWeek(m.result.week)} results are in`;
    case "late":
      return m.result.winner
        ? `Late sync: ${name(m.result.winner)} took week ${isoWeek(m.result.week)} after all`
        : `Late sync: week ${isoWeek(m.result.week)} ended level after all`;
    case "passed":
      return `⚡ You passed ${list(m.ids)} this week`;
    case "passedBy": {
      const me = viewer ? byId.get(viewer) : undefined;
      const top = Math.max(...m.ids.map((id) => { const p = byId.get(id); return p ? scoreNow(p, "week") : 0; }));
      const gap = top - (me ? scoreNow(me, "week") : 0);
      return `${list(m.ids)} passed you this week — ${gap.toLocaleString("en-US")} behind`;
    }
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run lib/__tests__/moments.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing Board tests**

Add to `web/app/components/__tests__/Board.test.tsx`:

```tsx
  it("crowns the champion", () => {
    render(<Board people={[JP, ANDY]} viewer="jp" range="today" champion="andy" />);
    expect(within(screen.getByTestId("row-andy")).getByTestId("crown")).toBeTruthy();
    expect(within(screen.getByTestId("row-jp")).queryByTestId("crown")).toBeNull();
  });

  it("sweeps your row gold for a pass and rose for being passed", () => {
    const { rerender } = render(<Board people={[JP, ANDY]} viewer="jp" range="today" celebrate={{ id: "jp", tone: "gold" }} />);
    expect(screen.getByTestId("row-jp").className).toContain("overtaken");
    rerender(<Board people={[JP, ANDY]} viewer="jp" range="today" celebrate={{ id: "jp", tone: "rose" }} />);
    expect(screen.getByTestId("row-jp").className).toContain("overtaken-rose");
  });
```

- [ ] **Step 6: Run to see them fail**

Run: `npx vitest run app/components/__tests__/Board.test.tsx`
Expected: FAIL (no `champion`/`celebrate` props).

- [ ] **Step 7: Board and CSS**

In `web/app/components/Board.tsx`:
1. Props: remove `justPassed?: string | null;` and add
```tsx
  /** Last finished week's winner; wears the crown until someone takes it. */
  champion?: string | null;
  /** The row playing a pass moment right now. */
  celebrate?: { id: string; tone: "gold" | "rose" } | null;
```
and destructure `champion, celebrate` instead of `justPassed`.
2. Replace `const passed = justPassed && p.profile.displayName === justPassed;` with
```tsx
          const sweep = celebrate?.id === id ? (celebrate.tone === "gold" ? "overtaken" : "overtaken-rose") : "";
```
and `${passed ? "overtaken" : ""}` with `${sweep}`.
3. After the name `<button …>{p.profile.displayName}</button>` add:
```tsx
                    {champion === id && (
                      <span data-testid="crown" title="Won last week" className="text-[12px]">👑</span>
                    )}
```
4. In the gap line, delete the `justPassed ? (…) :` branch so it starts at `gap.kind === "leading" ? (`.

Append to `web/app/globals.css` (before the `prefers-reduced-motion` block):

```css
/* Being passed: the same sweep, in the colour of lost ground. */
.overtaken-rose {
  background-image: linear-gradient(100deg, transparent 20%, rgba(251,113,133,.20) 50%, transparent 80%);
  background-size: 220% 100%;
  animation: overtake-sweep 1100ms ease-out 1;
}
```

- [ ] **Step 8: Full check**

Run: `npm test`
Expected: tsc FAILS on `page.tsx` still passing `justPassed={passed}`. Fix now: in `web/app/page.tsx` delete the `justPassed={passed}` line (the rest of the old pass logic, including the now-unread `passed` state, is removed in Task 9; `strict` doesn't flag unused locals). Re-run `npm test` → PASS.

- [ ] **Step 9: Commit**

```bash
git add web/lib/moments.ts web/lib/__tests__/moments.test.ts web/app
git commit -m "Work out what happened since you last looked, and crown last week's winner" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HJZ1G54D8DTRvKcUZzukRz"
```

---

### Task 6: Player card on every avatar

**Files:**
- Modify: `web/app/components/Avatar.tsx`, `web/app/components/FeedFilters.tsx:86`, `web/app/globals.css`
- Create: `web/app/components/PlayerCard.tsx`
- Test: `web/app/components/__tests__/Avatar.test.tsx` (create), `web/app/components/__tests__/PlayerCard.test.tsx` (create)

**Interfaces:**
- Consumes: `trophies`, `trophyCopy`, `headToHead`, `champion`, `WeekResult` (Task 2); `currentStreak`, `daysLeftInWeek`, `personalBest`, `scoreNow` (Task 1); `tzTag` (Task 1, Board).
- Produces:
  ```ts
  // Avatar.tsx
  export const PersonCard: React.Context<{ open: (id: string) => void; champion: string | null } | null>;
  export function Avatar(props: { profile: Pick<Profile, "displayName" | "avatar"> & { id?: string }; size?: number; index?: number; interactive?: boolean }): JSX.Element;
  // PlayerCard.tsx
  export default function PlayerCard(props: { person: PersonView; people: PersonView[]; viewer: string | null; results: WeekResult[]; onClose: () => void; onFullStats: () => void }): JSX.Element;
  ```

- [ ] **Step 1: Write the failing tests**

Create `web/app/components/__tests__/Avatar.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Avatar, PersonCard } from "@/app/components/Avatar";

const adam = { id: "adam", displayName: "Adam" };

describe("Avatar", () => {
  it("opens the person's card on click without triggering what's around it", () => {
    const open = vi.fn();
    const outer = vi.fn();
    render(
      <PersonCard.Provider value={{ open, champion: null }}>
        <button onClick={outer}><Avatar profile={adam} /></button>
      </PersonCard.Provider>,
    );
    fireEvent.click(screen.getByTestId("avatar-adam"));
    expect(open).toHaveBeenCalledWith("adam");
    expect(outer).not.toHaveBeenCalled();
  });

  it("opens on Enter too", () => {
    const open = vi.fn();
    render(<PersonCard.Provider value={{ open, champion: null }}><Avatar profile={adam} /></PersonCard.Provider>);
    fireEvent.keyDown(screen.getByTestId("avatar-adam"), { key: "Enter" });
    expect(open).toHaveBeenCalledWith("adam");
  });

  it("stays a plain picture when told to, or with no card to open", () => {
    render(
      <PersonCard.Provider value={{ open: vi.fn(), champion: null }}>
        <Avatar profile={adam} interactive={false} />
      </PersonCard.Provider>,
    );
    render(<Avatar profile={{ id: "jp", displayName: "JP" }} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("rings the champion in gold", () => {
    render(<PersonCard.Provider value={{ open: vi.fn(), champion: "adam" }}><Avatar profile={adam} /></PersonCard.Provider>);
    expect(screen.getByTestId("avatar-adam").querySelector("[data-crowned='true']")).toBeTruthy();
  });
});
```

Create `web/app/components/__tests__/PlayerCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import PlayerCard from "@/app/components/PlayerCard";
import type { WeekResult } from "@/lib/competition";
import type { DayRow, PersonView } from "@/lib/types";

function day(date: string, reviews: number): DayRow {
  return { date, reviews, minutes: 0, newCards: 0, ease1: 0, ease2: 0, ease3: 0, ease4: 0, perDeck: {} };
}
function person(id: string, name: string, days: DayRow[]): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/Los_Angeles", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-29", allTimeReviews: 18402, firstReviewAt: 0 },
    days,
  };
}

const jp = person("jp", "JP", [day("2026-09-29", 50)]);
const adam = person("adam", "Adam", [day("2024-03-02", 10), day("2026-09-28", 62)]);
const results: WeekResult[] = [
  { week: "2026-09-21", standings: [{ id: "adam", cards: 894 }, { id: "jp", cards: 88 }], winner: "adam", podium: null },
];

const show = (who: PersonView, viewer = "jp", onFullStats = vi.fn(), onClose = vi.fn()) =>
  render(<PlayerCard person={who} people={[jp, adam]} viewer={viewer} results={results} onClose={onClose} onFullStats={onFullStats} />);

describe("PlayerCard", () => {
  it("shows the champion's title, trophies and history", () => {
    show(adam);
    expect(screen.getByText("👑 Champion · week 39")).toBeTruthy();
    expect(screen.getByTestId("card-weeks-won")).toHaveTextContent("🏆 1");
    expect(screen.getByTestId("card-run")).toHaveTextContent("🔥 1");
    expect(screen.getByText(/Studying since Mar 2024/)).toBeTruthy();
  });

  it("shows your head-to-head and this week's race on someone else's card", () => {
    show(adam);
    expect(screen.getByTestId("card-h2h")).toHaveTextContent("You vs Adam");
    expect(screen.getByTestId("card-h2h")).toHaveTextContent("0 – 1");
    expect(screen.getByTestId("card-h2h")).toHaveTextContent("This week Adam's 12 ahead — 5 days left");
  });

  it("has no head-to-head on your own card, and muted trophies before a win", () => {
    show(jp);
    expect(screen.queryByTestId("card-h2h")).toBeNull();
    expect(screen.getByTestId("card-weeks-won")).toHaveTextContent("first win up for grabs");
  });

  it("goes to full stats, and closes on Esc and on the backdrop", () => {
    const onFullStats = vi.fn();
    const onClose = vi.fn();
    show(adam, "jp", onFullStats, onClose);
    fireEvent.click(screen.getByText("Full stats ▸"));
    expect(onFullStats).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByTestId("player-card-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

(Check: Adam's week 40 so far = 62 (28 Sep), JP's = 50 (29 Sep) → Adam 12 ahead; JP's todayKey 29 Sep is a Tuesday → 5 days left.)

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run app/components/__tests__/Avatar.test.tsx app/components/__tests__/PlayerCard.test.tsx`
Expected: FAIL (no `PersonCard`, no `PlayerCard`).

- [ ] **Step 3: Avatar**

Replace `Avatar` in `web/app/components/Avatar.tsx` (and change the React import to `import { createContext, useContext, useRef, useState } from "react";`):

```tsx
/**
 * Set once by the page. Any avatar with an id becomes a way into that person's
 * card, and the champion's wears gold wherever it appears -- no prop threading
 * through the feed and notes.
 */
export const PersonCard = createContext<{ open: (id: string) => void; champion: string | null } | null>(null);

export function Avatar({ profile, size = 28, index = 0, interactive = true }: {
  profile: Pick<Profile, "displayName" | "avatar"> & { id?: string };
  size?: number;
  index?: number;
  /** Off where the avatar sits inside another control, like the upload button or a filter chip. */
  interactive?: boolean;
}) {
  const card = useContext(PersonCard);
  const crowned = Boolean(profile.id && card?.champion === profile.id);
  const ring = crowned ? "var(--gold)" : RING[index % RING.length];
  const face = (
    <span
      data-crowned={String(crowned)}
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border"
      style={{
        width: size, height: size, borderColor: ring,
        background: profile.avatar ? "transparent" : "var(--pane-lift)",
        boxShadow: crowned ? "0 0 0 1px var(--gold), 0 0 14px rgba(251,191,36,.45)" : undefined,
        fontSize: Math.max(9, size * 0.36),
        fontWeight: 700,
        color: ring,
      }}
      aria-hidden="true"
    >
      {profile.avatar
        // eslint-disable-next-line @next/next/no-img-element -- a data URL, already sized to 128px
        ? <img src={profile.avatar} alt="" width={size} height={size} style={{ objectFit: "cover", width: "100%", height: "100%" }} />
        : initials(profile.displayName)}
    </span>
  );
  if (!interactive || !card || !profile.id) return face;

  const id = profile.id;
  // A span, not a button: feed cards put avatars inside their own button.
  return (
    <span
      role="button"
      tabIndex={0}
      data-testid={`avatar-${id}`}
      title={`${profile.displayName}'s card`}
      className="inline-flex shrink-0 cursor-pointer rounded-full transition-transform duration-150 hover:scale-105"
      onClick={(e) => { e.stopPropagation(); card.open(id); }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        e.stopPropagation();
        card.open(id);
      }}
    >
      {face}
    </span>
  );
}
```

In `AvatarUploader`, change `<Avatar profile={profile} size={40} index={index} />` to `<Avatar profile={profile} size={40} index={index} interactive={false} />`. In `web/app/components/FeedFilters.tsx:86` add `interactive={false}` to the `<Avatar … />`.

- [ ] **Step 4: PlayerCard**

Append to `web/app/globals.css` (before `prefers-reduced-motion`):

```css
/* The player card lifts in like a card being dealt. */
@keyframes card-rise {
  from { opacity: 0; transform: translateY(14px) scale(.97); }
  to   { opacity: 1; transform: none; }
}
.card-rise { animation: card-rise 360ms cubic-bezier(.22,.8,.3,1) both; }
```

Create `web/app/components/PlayerCard.tsx`:

```tsx
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
    const diff = scoreNow(me, "week") - scoreNow(person, "week");
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
                <span style={{ color: h2h.a >= h2h.b ? "var(--jade)" : "var(--ink-dim)" }}>{h2h.a}</span>
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
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run app/components/__tests__/Avatar.test.tsx app/components/__tests__/PlayerCard.test.tsx`
Expected: PASS. Then `npm test` → PASS (existing Feed/Notes tests render Avatar without a provider, so avatars stay plain there).

- [ ] **Step 6: Commit**

```bash
git add web/app
git commit -m "Open a player card from any avatar, with trophies and your head-to-head" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HJZ1G54D8DTRvKcUZzukRz"
```

---

### Task 7: Trophy tiles on the full stats page

**Files:**
- Modify: `web/app/components/PersonPanel.tsx`, `web/app/components/primitives.tsx` (`StatTile`)
- Test: `web/app/components/__tests__/PersonPanel.test.tsx`

**Interfaces:**
- Consumes: `trophies`, `trophyCopy`, `WeekResult` (Task 2); `bestStreak`, `currentStreak` (Task 1).
- Produces: `PersonPanel` prop `results?: WeekResult[]` (default `[]`); `StatTile` prop `edge?: string`.

- [ ] **Step 1: Write the failing tests**

Add to `web/app/components/__tests__/PersonPanel.test.tsx` (import `type WeekResult` from `@/lib/competition` and `within` from Testing Library):

```tsx
  it("leads with the trophies, streak best and all-time new cards in a 3 × 2 grid", () => {
    const results: WeekResult[] = [
      { week: "2026-09-14", standings: [{ id: "jp", cards: 9 }, { id: "adam", cards: 1 }], winner: "jp", podium: null },
    ];
    render(<PersonPanel person={person} items={[]} results={results} />);
    const tiles = screen.getByTestId("stat-grid").children;
    expect(tiles).toHaveLength(6);
    expect(within(tiles[0] as HTMLElement).getByText("🏆 1")).toBeTruthy();
    expect(within(tiles[1] as HTMLElement).getByText("🔥 1")).toBeTruthy();
    expect(within(tiles[2] as HTMLElement).getByText("best 2 days")).toBeTruthy();
    expect(within(tiles[3] as HTMLElement).getByText("0 new cards")).toBeTruthy();
  });

  it("nudges before a first win", () => {
    render(<PersonPanel person={person} items={[]} />);
    expect(screen.getByText("first win up for grabs")).toBeTruthy();
    expect(screen.getByText("win this week to start one")).toBeTruthy();
  });
```

(The fixture `person` has reviews on 20 and 21 Sep → best streak 2, newCards 0.)

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run app/components/__tests__/PersonPanel.test.tsx`
Expected: FAIL (no `stat-grid`, no trophy tiles).

- [ ] **Step 3: `StatTile` edge**

In `web/app/components/primitives.tsx`, add `edge?: string;` to `StatTile`'s props (destructure it) with the doc comment `/** Resting border colour; gold on an earned trophy. */`, and change `borderColor: over ? tint : "var(--edge)",` to `borderColor: over ? tint : edge ?? "var(--edge)",`.

- [ ] **Step 4: PersonPanel grid**

In `web/app/components/PersonPanel.tsx`:
1. Imports: `import { bestStreak, currentStreak, deckTotals, personalBest, retention, shiftDays, totals } from "@/lib/metrics";`, `import { trophies, trophyCopy, type TileCopy, type WeekResult } from "@/lib/competition";`.
2. Props: add `results = []` with type `results?: WeekResult[];`.
3. Before `return`, add:
```tsx
  const copy = trophyCopy(trophies(person.profile.id, results));
  const trophyTile = (label: string, c: TileCopy, delay: number, help: string) => (
    <StatTile
      label={label}
      value={c.value}
      sub={c.sub}
      tint={c.earned ? "var(--gold)" : "var(--ink-faint)"}
      glow={c.earned ? "rgba(251,191,36,.18)" : "rgba(255,255,255,.03)"}
      edge={c.earned ? "rgba(251,191,36,.40)" : undefined}
      delay={delay}
      help={help}
    />
  );
```
4. Replace the whole `<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">…</div>` with:
```tsx
      {/* Competition first: the gold row is what this page is for now. */}
      <div data-testid="stat-grid" className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {trophyTile("Weeks won", copy.weeks, 60, "Weeks finished with the most cards in the crew. Weeks run Monday to Sunday.")}
        {trophyTile("Winning run", copy.run, 140, "Weeks won in a row. A loss or a tie ends it.")}
        <StatTile
          label="Streak"
          sub={`best ${bestStreak(person.days)} days`}
          tint="var(--gold)"
          glow="rgba(251,191,36,.15)"
          delay={220}
          help="Consecutive days with at least one review. Miss a whole day and it starts again. The star changes at 3, 7, 14, 30 and 100 days."
        >
          <StreakStar streak={currentStreak(person.days, person.meta.todayKey)} />
        </StatTile>
        <StatTile
          label="All time"
          numeric={person.meta.allTimeReviews}
          sub={`${sums.newCards.toLocaleString()} new cards`}
          tint="var(--violet-soft)"
          glow="rgba(124,58,237,.20)"
          delay={300}
          help="Every review ever recorded in this collection. New cards are the ones seen for the very first time."
        >
          <span data-testid="all-time">{person.meta.allTimeReviews.toLocaleString()}</span>
        </StatTile>
        <StatTile
          label="Recall"
          value={ret === null ? "—" : `${ret}%`}
          tint="var(--jade)"
          glow="rgba(52,211,153,.14)"
          delay={380}
          help="Of the cards Anki showed, the share recalled. Again is a miss; Hard, Good and Easy are hits."
        />
        <StatTile
          label="Best day"
          sub={best ? prettyDate(best.date, true) : "no sessions yet"}
          more={bestRow ? `${Math.round(bestRow.minutes)} min · ${bestRow.newCards} new` : undefined}
          tint="var(--violet-soft)"
          glow="rgba(124,58,237,.20)"
          delay={460}
          help="The most cards they have ever reviewed in a single day."
        >
          <span data-testid="best-day">{best ? best.reviews.toLocaleString() : "—"}</span>
        </StatTile>
      </div>
```
(Task 1 already changed the Streak tile's `StreakStar`; this block replaces it.)

- [ ] **Step 5: Run the tests**

Run: `npx vitest run app/components/__tests__/PersonPanel.test.tsx` → PASS, then `npm test` → PASS.

- [ ] **Step 6: Commit**

```bash
git add web/app
git commit -m "Put weeks won and the winning run at the top of everyone's stats" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HJZ1G54D8DTRvKcUZzukRz"
```

---

### Task 8: The roundup, the strip and the pill

**Files:**
- Create: `web/app/components/WeeklyRoundup.tsx`, `web/app/components/WeekStrip.tsx`, `web/app/components/MomentPill.tsx`
- Modify: `web/app/globals.css`
- Test: `web/app/components/__tests__/WeeklyRoundup.test.tsx` (create)

**Interfaces:**
- Consumes: `headline`, `swingLine` (Task 3); `headToHead`, `isoWeek`, `trophies`, `weekLabel`, `WeekResult` (Task 2); `Moment`, `momentHeadline` (Task 5); `Avatar` (Task 6).
- Produces:
  ```ts
  export default function WeeklyRoundup(props: { result: WeekResult; history: WeekResult[]; people: PersonView[]; viewer: string | null; late?: boolean; onClose: () => void }): JSX.Element;
  export default function WeekStrip(props: { result: WeekResult; history: WeekResult[]; people: PersonView[]; onReplay: () => void }): JSX.Element;
  export default function MomentPill(props: { moments: Moment[]; people: PersonView[]; viewer: string | null; onPlay: () => void }): JSX.Element | null;
  ```

- [ ] **Step 1: Write the failing tests**

Create `web/app/components/__tests__/WeeklyRoundup.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import MomentPill from "@/app/components/MomentPill";
import WeekStrip from "@/app/components/WeekStrip";
import WeeklyRoundup from "@/app/components/WeeklyRoundup";
import type { WeekResult } from "@/lib/competition";
import type { DayRow, PersonView } from "@/lib/types";

function day(date: string, reviews: number): DayRow {
  return { date, reviews, minutes: 0, newCards: 0, ease1: 0, ease2: 0, ease3: 0, ease4: 0, perDeck: {} };
}
function person(id: string, name: string, days: DayRow[]): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/New_York", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-10-06", allTimeReviews: 0, firstReviewAt: 0 },
    days,
  };
}

const jp = person("jp", "JP", [day("2026-09-22", 88), day("2026-09-29", 1071)]);
const adam = person("adam", "Adam", [day("2026-09-26", 894), day("2026-10-01", 1284)]);
const W39: WeekResult = { week: "2026-09-21", standings: [{ id: "adam", cards: 894 }, { id: "jp", cards: 88 }], winner: "adam", podium: null };
const W40: WeekResult = { week: "2026-09-28", standings: [{ id: "adam", cards: 1284 }, { id: "jp", cards: 1071 }], winner: "adam", podium: null };

describe("WeeklyRoundup", () => {
  it("tells the week's story with your head-to-head", () => {
    render(<WeeklyRoundup result={W40} history={[W39, W40]} people={[jp, adam]} viewer="jp" onClose={vi.fn()} />);
    expect(screen.getByText("Week 40 · 28 Sep – 4 Oct")).toBeTruthy();
    expect(screen.getByTestId("roundup-headline")).toHaveTextContent("Adam holds off JP by 213 to go back-to-back");
    expect(screen.getByTestId("roundup-swing")).toHaveTextContent("Thursday swung it — Adam's 1,284 was the biggest day of the week.");
    expect(screen.getByTestId("roundup-run")).toHaveTextContent("🔥 2 weeks in a row");
    expect(screen.getByTestId("h2h-adam")).toHaveTextContent("vs Adam");
    expect(screen.getByTestId("h2h-adam")).toHaveTextContent("0–2");
    expect(screen.getByTestId("h2h-adam")).toHaveTextContent("lost by 213");
    expect(screen.getAllByTestId("podium-bar")).toHaveLength(2);
  });

  it("leaves out the head-to-head for someone who didn't compete", () => {
    render(<WeeklyRoundup result={W40} history={[W39, W40]} people={[jp, adam]} viewer="peter" onClose={vi.fn()} />);
    expect(screen.queryByText("Your head-to-head")).toBeNull();
  });

  it("closes on the button, Esc and the backdrop", () => {
    const onClose = vi.fn();
    render(<WeeklyRoundup result={W40} history={[W39, W40]} people={[jp, adam]} viewer="jp" onClose={onClose} />);
    fireEvent.click(screen.getByText("Close"));
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByTestId("roundup-backdrop"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe("WeekStrip", () => {
  it("sums up the latest week and replays it", () => {
    const onReplay = vi.fn();
    render(<WeekStrip result={W40} history={[W39, W40]} people={[jp, adam]} onReplay={onReplay} />);
    expect(screen.getByTestId("week-strip")).toHaveTextContent("Week 40: Adam 1,284 · JP 1,071");
    expect(screen.getByTestId("week-strip")).toHaveTextContent("🔥 2");
    fireEvent.click(screen.getByTestId("week-strip"));
    expect(onReplay).toHaveBeenCalled();
  });
});

describe("MomentPill", () => {
  it("shows the first headline and how many more", () => {
    const onPlay = vi.fn();
    render(<MomentPill moments={[{ kind: "results", result: W40 }, { kind: "passed", ids: ["adam"] }]} people={[jp, adam]} viewer="jp" onPlay={onPlay} />);
    expect(screen.getByTestId("moment-pill")).toHaveTextContent("🏆 Week 40 results are in + 1 more");
    fireEvent.click(screen.getByTestId("moment-pill"));
    expect(onPlay).toHaveBeenCalled();
  });

  it("renders nothing with nothing to show", () => {
    const { container } = render(<MomentPill moments={[]} people={[jp, adam]} viewer="jp" onPlay={vi.fn()} />);
    expect(container.innerHTML).toBe("");
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run app/components/__tests__/WeeklyRoundup.test.tsx`
Expected: FAIL — components don't exist.

- [ ] **Step 3: CSS for the beats**

Append to `web/app/globals.css` (before `prefers-reduced-motion`, which already shortens all of these to nothing):

```css
/* The roundup plays in three beats: crown and number, podium, story. */
@keyframes beat-drop {
  from { opacity: 0; transform: translateY(-18px) scale(.9); }
  to   { opacity: 1; transform: none; }
}
@keyframes beat-rise {
  from { transform: scaleY(0); }
  to   { transform: scaleY(1); }
}
@keyframes beat-fade {
  from { opacity: 0; transform: translateX(10px); }
  to   { opacity: 1; transform: none; }
}
.beat-1 { animation: beat-drop 520ms cubic-bezier(.22,.8,.3,1) 120ms both; }
.beat-2 { transform-origin: bottom; animation: beat-rise 620ms cubic-bezier(.22,.8,.3,1) 700ms both; }
.beat-3 { animation: beat-fade 520ms ease-out 1300ms both; }

/* Slow gold rays behind the winner. */
@keyframes rays-turn { to { transform: rotate(360deg); } }
.roundup-rays {
  position: absolute; left: 50%; top: 120px; width: 460px; height: 460px; margin: -230px 0 0 -230px;
  border-radius: 999px; pointer-events: none;
  background: conic-gradient(from 0deg,
    transparent 0 8deg, rgba(251,191,36,.10) 8deg 14deg, transparent 14deg 30deg,
    rgba(251,191,36,.08) 30deg 36deg, transparent 36deg 52deg, rgba(251,191,36,.10) 52deg 58deg,
    transparent 58deg 90deg, rgba(251,191,36,.08) 90deg 96deg, transparent 96deg 180deg,
    rgba(251,191,36,.10) 180deg 186deg, transparent 186deg 270deg, rgba(251,191,36,.08) 270deg 276deg,
    transparent 276deg 360deg);
  animation: rays-turn 40s linear infinite;
}
```

- [ ] **Step 4: WeeklyRoundup**

Create `web/app/components/WeeklyRoundup.tsx`:

```tsx
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
```

- [ ] **Step 5: WeekStrip and MomentPill**

Create `web/app/components/WeekStrip.tsx`:

```tsx
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
```

Create `web/app/components/MomentPill.tsx`:

```tsx
"use client";
import { momentHeadline, type Moment } from "@/lib/moments";
import type { PersonView } from "@/lib/types";

/** What happened while you were away, named, waiting for a tap. The tap is also what lets sound play. */
export default function MomentPill({ moments, people, viewer, onPlay }: {
  moments: Moment[];
  people: PersonView[];
  viewer: string | null;
  onPlay: () => void;
}) {
  if (moments.length === 0) return null;
  const rose = moments[0].kind === "passedBy";
  return (
    <div className="flex justify-center px-5 pb-2">
      <button
        data-testid="moment-pill"
        onClick={onPlay}
        className="badge-pop flex items-center gap-2 rounded-full border px-4 py-2 text-[12.5px]"
        style={rose
          ? { background: "rgba(251,113,133,.10)", borderColor: "rgba(251,113,133,.40)", boxShadow: "0 0 30px rgba(251,113,133,.15)" }
          : { background: "rgba(251,191,36,.10)", borderColor: "rgba(251,191,36,.40)", boxShadow: "0 0 30px rgba(251,191,36,.15)", color: "#FDE68A" }}
      >
        <span>{momentHeadline(moments[0], people, viewer)}</span>
        {moments.length > 1 && <span style={{ color: "var(--ink-faint)" }}>+ {moments.length - 1} more</span>}
        <span style={{ color: "var(--ink-faint)" }}>tap ▸</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Run the tests**

Run: `npx vitest run app/components/__tests__/WeeklyRoundup.test.tsx` → PASS; `npm test` → PASS.

(Check of the swing assertion: in W40 Adam's only day is Thu 1 Oct with 1,284; JP's Tue 29 Sep 1,071. Biggest day = Adam's Thursday. Cumulative after Tue: JP 1,071 vs Adam 0 → JP trailed? No — JP is the runner-up and was *ahead*, so the line gets the comeback sentence: after Tue and Wed JP leads by 1,071. The assertion uses `toHaveTextContent` with the first sentence only, which is a substring match, so the appended "JP was 1,071 ahead going into Thursday." is fine.)

- [ ] **Step 7: Commit**

```bash
git add web/app
git commit -m "Add the weekly roundup, the result strip and the moment pill" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HJZ1G54D8DTRvKcUZzukRz"
```

---

### Task 9: Wire it into the page

**Files:**
- Modify: `web/app/page.tsx`, `web/lib/seen.ts`, `web/lib/whatsNew.ts`
- Test: `web/app/__tests__/page.test.tsx`, `web/lib/__tests__/seen.test.ts`

**Interfaces:**
- Consumes: everything above: `finishedResults`, `champion` (Task 2); `pendingMoments`, `silentPatch`, `ackPatch`, `Moment` (Task 5); `lookFrom` (Task 1); `PersonCard`, `PlayerCard`, `WeeklyRoundup`, `WeekStrip`, `MomentPill` (Tasks 6, 8); `POST /api/competition` (Task 4).
- Produces: `Seen` becomes `{ totals: Record<string, number>; at: number }`; `whoYouPassed` removed.

- [ ] **Step 1: Write the failing page tests**

In `web/app/__tests__/page.test.tsx`:
- delete the `describe("the overtake chime", …)` block and the `const SEEN = …` line.
- add:

```tsx
describe("the weekly race", () => {
  beforeEach(() => {
    // Tuesday of week 40. Only Date is faked; promises and timers stay real.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  function racer(id: string, name: string, days: [string, number][]): PersonView {
    return {
      profile: { id, displayName: name, tz: "America/New_York", joinedAt: Date.UTC(2026, 8, 22) },
      meta: { lastPublishAt: Date.now(), streak: 0, todayKey: "2026-09-29", allTimeReviews: 0, firstReviewAt: 0 },
      days: days.map(([date, reviews]) => ({ date, reviews, minutes: 1, newCards: 0, ease1: 0, ease2: 0, ease3: reviews, ease4: 0, perDeck: {} })),
    };
  }
  const race = (competition: CrewResponse["competition"], week40: [number, number] = [0, 0]) => ok({
    ...crew(),
    people: [
      racer("jp", "JP", [["2026-09-22", 88], ["2026-09-29", week40[0]]]),
      racer("adam", "Adam", [["2026-09-26", 894], ["2026-09-29", week40[1]]]),
    ],
    competition,
  });
  const competitionPosts = () => fetchMock.mock.calls
    .filter(([url]) => String(url).startsWith("/api/competition"))
    .map(([, init]) => JSON.parse(init.body));

  it("names the result in the pill, plays it on a tap and marks it seen", async () => {
    crewReplies.push(race({ results: {} }));
    await mount();
    const pill = await screen.findByTestId("moment-pill");
    expect(pill).toHaveTextContent("🏆 Week 39 results are in");
    fireEvent.click(pill);
    expect(screen.getByTestId("roundup-headline")).toHaveTextContent("Adam cruises past JP by 806 for a first ever win");
    expect(competitionPosts().some((b) => b.results?.["2026-09-21"] === "adam")).toBe(true);
    expect(playCelebration).not.toHaveBeenCalled(); // JP didn't win it
  });

  it("stays quiet once the week has been shown, and keeps the strip", async () => {
    crewReplies.push(race({ results: { "2026-09-21": "adam" } }));
    await mount();
    expect(screen.queryByTestId("moment-pill")).toBeNull();
    expect(screen.getByTestId("week-strip")).toHaveTextContent("Week 39: Adam 894 · JP 88");
    expect(within(screen.getByTestId("row-adam")).getByTestId("crown")).toBeTruthy();
  });

  it("rings for a pass only after the tap", async () => {
    crewReplies.push(race(
      { results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["adam", "jp"] } },
      [50, 40],
    ));
    await mount();
    const pill = await screen.findByTestId("moment-pill");
    expect(pill).toHaveTextContent("⚡ You passed Adam this week");
    expect(playCelebration).not.toHaveBeenCalled();
    fireEvent.click(pill);
    expect(playCelebration).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("row-jp").className).toContain("overtaken");
  });

  it("saves this load as your last look, and keeps the previous one for the arrows through a refresh", async () => {
    const earlier = { at: Date.UTC(2026, 8, 29, 12), day: "2026-09-29", week: "2026-09-28",
      scores: { jp: { today: 0, week: 0, all: 0 }, adam: { today: 30, week: 30, all: 924 } } };
    crewReplies.push(race({ results: { "2026-09-21": "adam" }, look: earlier }, [50, 40]));
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "this week" }));
    expect(screen.getByTestId("delta-jp").textContent).toBe("▲1");
    const saved = competitionPosts().find((b) => b.look);
    expect(saved.look.day).toBe("2026-09-29");
    expect(saved.look.scores.jp.week).toBe(50);

    crewReplies.push(race({ results: { "2026-09-21": "adam" }, look: saved.look }, [50, 40]));
    await refresh();
    expect(screen.getByTestId("delta-jp").textContent).toBe("▲1");
  });

  it("opens a player card from a board avatar", async () => {
    crewReplies.push(race({ results: { "2026-09-21": "adam" } }));
    await mount();
    fireEvent.click(screen.getByTestId("avatar-adam"));
    expect(screen.getByTestId("player-card")).toHaveTextContent("Adam");
    fireEvent.click(screen.getByText("Full stats ▸"));
    expect(screen.queryByTestId("player-card")).toBeNull();
    expect(screen.getByTestId("stat-grid")).toBeTruthy();
  });
});
```

(`getAllByTestId("avatar-adam")` may find more than one once the You tab chips gain avatars; the board is the only tab mounted here, so `getByTestId` is fine.)

In `web/lib/__tests__/seen.test.ts`: delete the whole `describe("whoYouPassed", …)` block and its import; in the remaining round-trip test drop `order` from the stored object.

- [ ] **Step 2: Run to see them fail**

Run: `npx vitest run app/__tests__/page.test.tsx lib/__tests__/seen.test.ts`
Expected: FAIL (no pill, strip, card; seen test still imports `whoYouPassed` until edited — after editing, the seen suite passes and the page suite fails).

- [ ] **Step 3: Trim `lib/seen.ts`**

- `Seen` becomes:
```ts
export type Seen = {
  /** Today's review count per person, as of your last visit. */
  totals: Record<string, number>;
  at: number;
};
```
- Delete `whoYouPassed` and its doc comment. Update the file's top comment's last line to note passes now live on the server:
```ts
 * Passes and the board's arrows are measured on the server (competition:<id>),
 * so they play once across devices; this only drives the "+N since you last
 * looked" line, the count-up, and What's new's "been here before".
```

- [ ] **Step 4: Wire the page**

In `web/app/page.tsx`:

1. Imports — replace the `seen`/`sound` imports and add the new ones:
```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MomentPill from "@/app/components/MomentPill";
import PlayerCard from "@/app/components/PlayerCard";
import WeekStrip from "@/app/components/WeekStrip";
import WeeklyRoundup from "@/app/components/WeeklyRoundup";
import { Avatar, AvatarUploader, PersonCard } from "@/app/components/Avatar";
import { champion, finishedResults, type WeekResult } from "@/lib/competition";
import { lookFrom } from "@/lib/metrics";
import { ackPatch, pendingMoments, silentPatch, type Moment } from "@/lib/moments";
import { readSeen, writeSeen, type Seen } from "@/lib/seen";
import { playCelebration } from "@/lib/sound";
import type { CrewNote, CrewResponse, Engagement, FieldMap, Look, NoteCard, PersonView } from "@/lib/types";
```
(`rankBy` is no longer needed; drop it.)

2. Replace the state block from `const chimedFor = …` through `const [passed, setPassed] = …` with:
```tsx
  // What the previous visit showed, captured once so the roll-up has a floor.
  const before = useRef<Seen | null>(null);
  // The server's copy of your previous look, held for the tab's life so a
  // refresh -- which saves a new look -- doesn't wipe the arrows.
  const look = useRef<Look | null | undefined>(undefined);
  const [results, setResults] = useState<WeekResult[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const queue = useRef<Moment[]>([]);
  const [roundup, setRoundup] = useState<{ result: WeekResult; late: boolean } | null>(null);
  const [celebrate, setCelebrate] = useState<{ id: string; tone: "gold" | "rose" } | null>(null);
  const [cardFor, setCardFor] = useState<string | null>(null);
```

3. In `load`, replace everything from `if (before.current === null) before.current = readSeen();` through the `playCelebration(); }` block with:
```tsx
      if (before.current === null) before.current = readSeen();
      const now = Date.now();
      const finished = finishedResults(next.people, now);
      const state = next.competition ?? { results: {} };
      if (look.current === undefined) look.current = state.look ?? null;
      setResults(finished);
      setMoments(pendingMoments(next.people, next.viewer, state, finished));
      const me = next.people.find((p) => p.profile.id === next.viewer);
      if (me) {
        // Best effort: a lost save only means a moment may show once more.
        void fetch(`/api/competition?key=${encodeURIComponent(key)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...silentPatch(next.people, next.viewer, state, finished),
            look: lookFrom(next.people, me.meta.todayKey, now),
          }),
        }).catch(() => {});
      }
```
and change the `writeSeen({ … })` call to drop `order`:
```tsx
      writeSeen({
        totals: Object.fromEntries(next.people.map((p) => [p.profile.id, todayReviews(p)])),
        at: Date.now(),
      });
```

4. After `closeNotes`, add the moment player:
```tsx
  /**
   * Plays queued moments one after another. A roundup waits for its Close; a
   * pass sweeps your row, then moves on. The tap that started this is what
   * lets the chime play at all.
   */
  const playNext = useCallback(function next() {
    const m = queue.current.shift();
    const me = data?.viewer;
    if (!m || !me) { setCelebrate(null); return; }
    if (m.kind === "results" || m.kind === "late") {
      setRoundup({ result: m.result, late: m.kind === "late" });
      if (m.result.winner === me) playCelebration();
      return;
    }
    setTab("board");
    setRange("week");
    setCelebrate({ id: me, tone: m.kind === "passed" ? "gold" : "rose" });
    if (m.kind === "passed") playCelebration();
    window.setTimeout(next, 1800);
  }, [data?.viewer]);

  const playMoments = useCallback(() => {
    if (!data) return;
    queue.current = [...moments];
    setMoments([]);
    void send("/api/competition", ackPatch(data.people, data.viewer, results), "couldn't save that you've seen it");
    playNext();
  }, [data, moments, results, send, playNext]);

  const cardContext = useMemo(() => ({ open: setCardFor, champion: champion(results) }), [results]);
```
(`useMemo` sits above the early `return`s, like the other hooks.)

5. The board section becomes:
```tsx
      {tab === "board" && (
        <>
          <MomentPill moments={moments} people={data.people} viewer={data.viewer} onPlay={playMoments} />
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-1 text-[11.5px]">
            <div className="flex gap-1">
              {RANGES.map((r) => (
                /* …the existing range buttons, unchanged… */
              ))}
            </div>
            {results.length > 0 && (
              <WeekStrip
                result={results[results.length - 1]}
                history={results}
                people={data.people}
                onReplay={() => setRoundup({ result: results[results.length - 1], late: false })}
              />
            )}
          </div>
          <div className="pt-2">
            <Board
              people={data.people}
              viewer={data.viewer}
              range={range}
              seen={seenTotals}
              look={look.current ?? null}
              champion={champion(results)}
              celebrate={celebrate}
              onSelect={setCardFor}
            />
          </div>
          <StatTiles people={data.people} viewer={data.viewer} />
          <CrewChart people={data.people} />
        </>
      )}
```
(Move the existing `{RANGES.map(…)}` buttons into the inner `<div className="flex gap-1">` exactly as they are.)

6. In the You tab person chips, after `{p.profile.displayName}` add `{champion(results) === p.profile.id && " 👑"}`. Pass results to the panel: `<PersonPanel person={selected} items={data.feed} fieldMaps={…} results={results} />`.

7. Wrap everything inside `<main …>` in `<PersonCard.Provider value={cardContext}> … </PersonCard.Provider>`, and add, next to the `WhatsNew` render at the bottom:
```tsx
        {roundup && (
          <WeeklyRoundup
            result={roundup.result}
            history={results}
            people={data.people}
            viewer={data.viewer}
            late={roundup.late}
            onClose={() => { setRoundup(null); playNext(); }}
          />
        )}
        {cardFor && (() => {
          const p = data.people.find((x) => x.profile.id === cardFor);
          return p ? (
            <PlayerCard
              person={p}
              people={data.people}
              viewer={data.viewer}
              results={results}
              onClose={() => setCardFor(null)}
              onFullStats={() => { setWho(p.profile.id); setTab("you"); setCardFor(null); }}
            />
          ) : null;
        })()}
```

8. What's new: in `web/lib/whatsNew.ts` add at the top of `NOTES`:
```ts
  {
    id: "2026-09-weekly",
    date: "September 2026",
    title: "Win the week",
    items: [
      "Weeks now run Monday to Sunday and whoever reviews most wins it — Monday brings the roundup. Click anyone's picture for their card: weeks won, winning run, and your head-to-head.",
    ],
  },
```

- [ ] **Step 5: Full check**

Run: `npm test`
Expected: PASS. If `whatsNew.test.ts` pins the first note's id, update it to `"2026-09-weekly"`.

- [ ] **Step 6: Commit**

```bash
git add web/app web/lib
git commit -m "Play the week's moments on a tap, open player cards, and show last week's result on the board" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HJZ1G54D8DTRvKcUZzukRz"
```

---

### Task 10: See it on real data

**Files:** none (verification only)

- [ ] **Step 1: Run the app locally against production data**

From `web/`: `npm run dev` (in the background). Build JP's keyed link from `.env.local` (`READ_KEYS`, JP's key) as `http://localhost:3000/?key=<jp key>` — never ask JP for keys.

- [ ] **Step 2: Walk through it (use the `run` skill or a browser)**

Check, and note anything off:
1. Board shows the pill **"🏆 Week 39 results are in"**; tapping it opens the roundup: **Adam 894**, podium with JP 88, headline **"Adam cruises past JP by 806 for a first ever win"**, your H2H row **vs Adam 0–1 · lost by 806**. No chime (JP didn't win).
2. After closing: the strip **"👑 Week 39: Adam 894 · JP 88 · replay ▸"** and a 👑 on Adam's row and gold ring on his avatar.
3. Range tabs read **Today · This week · All time**; This week counts from Monday 28 Sep.
4. Clicking Adam's avatar opens his player card (Champion · week 39, 🏆 1, 🔥 1, You vs Adam 0 – 1). Full stats goes to his You page with the 3 × 2 tiles.
5. JP's streak reads what his days say (production showed `streak 0` for JP on 28 Sep), not a stale publisher value.
6. Reload: no pill (it was acknowledged), arrows still behave.

Note: this writes JP's real `competition:jp` state in production Redis (acknowledging week 39). That's intended; it's JP's own state.

- [ ] **Step 3: Report**

Tell JP what you saw, with a screenshot of the roundup and the card, and stop the dev server. Deploying (`npx vercel --prod` in `web/`) is JP's call.

---

## Self-review notes

- Spec coverage: §3.1 weeks → T1; §3.2–3.4 → T2 (+ late-sync moment T5); §3.5 streaks → T1/T7; §4.1 board → T1/T5/T9; §4.2 roundup → T3/T8; §4.3 card → T6; §4.4 tiles → T7; §4.5 arrows → T1/T9; §4.6 moments → T5/T8/T9; §6.2 server → T4; What's new → T9; manual check → T10.
- Deliberate small deviations from the spec, all consistent with it: chase-arrow hover keeps today's wording pattern ("20 closer to Adam since Saturday") rather than "Adam gained 40 on you since Saturday"; the rose "being passed" sweep plays on your own row; ties for 2nd/3rd on a podium break by name (like every other ranking here).
