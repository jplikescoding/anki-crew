# Weekly competition — design

Date: 2026-09-28 · Status: approved in conversation, awaiting spec review

Covers roadmap items 3 (profile card + lapsed streak), 4 (pass moment
redesign) and 4a (misleading momentum arrows), designed together because they
are one idea: make the crew rivalry feel alive, honest and premium.

## 1. Purpose

Give the crew a weekly race with a result. Every Monday somebody wins the week;
wins, winning runs and head-to-head records accumulate; the dashboard marks each
of those moments with a premium, dopamine-y reveal instead of a silent number
change. Numbers must be honest: a lapsed streak reads 0, arrows mean something
you can state in one sentence.

**Success:**
- On Monday you open the dashboard and get a roundup of last week that makes
  the winner feel like a champion and tells the loser by how much and why.
- Clicking anyone's avatar shows a player card with their trophies and your
  head-to-head record against them.
- "You passed Adam" / "Adam passed you" reliably lands, with sound, once.
- Nothing on the board contradicts anything else (arrows, gap line, moments).
- The board stays uncluttered: the new things on it are one strip, one pill, a
  crown.

Laptop first; everyone but maybe Harry uses a laptop.

## 2. Out of scope (parked)

- **Music** for the roundup (JP wants a couple of rotating songs later; the
  roundup is opened by a tap precisely so audio can be added then).
- **Monthly roundup** with side awards (biggest day, sharpest recall, most
  improved, iron streak) — its own brainstorm, next on the roadmap.
- **Phone layout** of the roundup (stacked column, "B" in the mockups) — build
  when someone studies on a phone.
- **Phone-only studiers** (Harry, if he joins): the publisher reads desktop
  Anki, so phone-only reviews never arrive. An install problem, not this one.
- Best week tile, season resets, notifications outside the dashboard.

## 3. Rules

### 3.1 Weeks

- A week is **Monday–Sunday in each person's own Anki days** (their timezone,
  4am rollover — the same day keys `DayRow.date` already uses).
- Weeks are named by ISO week number of their Monday: **Week 40** =
  28 Sep – 4 Oct 2026. Shown with its range, e.g. "Week 40 · 28 Sep – 4 Oct".
- The board's **Week** range becomes **This week**: Monday so far, not a
  rolling 7 days. `weekStart(todayKey)` returns that day's Monday.
- The crew tile "Crew this week" compares this week so far against the **same
  days of last week** (Mon..today vs Mon..same weekday), not a full week.

### 3.2 Who competes in a week

- The season starts with **Week 39** (21–27 Sep 2026), `SEASON_START = "2026-09-21"`.
  Earlier weeks never count, however much Anki history someone has.
- **Founders** — anyone whose `joinedAt` falls on or before the end of Week 39 —
  compete from Week 39. (Today that is JP, joined 22 Sep, and Adam, 24 Sep.)
- **Everyone else** competes from the first Monday **after** the day they
  joined (in their own zone). The week they join in doesn't count for them.
- A competitor with 0 cards in a week still competes (and loses) that week —
  going quiet is not a way to protect a record.
- A week with fewer than 2 competitors has no result.

### 3.3 Winning

- **Most cards reviewed** in the week wins (same number the board ranks on).
- A tie for first: no winner that week.
- **Podium**: when the week had **4 or more competitors**, 2nd and 3rd are also
  recorded (🥈 🥉). With 2–3 competitors only the winner is recorded. Decided per
  week, so early two-person weeks stay winner-only.
- **Weeks won**: count of weeks won. **Winning run**: consecutive weeks won by
  the same person up to the latest finished week; a week they don't win (a loss
  or a tie) ends it. **Best run**: longest run ever.
- **Head-to-head (H2H)**, always pairwise: for viewer V and person X, over weeks
  where both competed, V's wins = weeks V had more cards than X, X's wins = the
  reverse; equal weeks count for neither. Independent of anyone else's result,
  so the lower half of a bigger crew still has races to win.

### 3.4 When a week is final

- A week's result is **revealed** once it is Monday (past 4am) for **every
  competitor's timezone** — i.e. nobody can still add Sunday cards on the clock.
  This is purely clock-based: nobody's sync is waited for. Someone MIA simply
  shows what they had.
- Results are always **derived live** from stored days, never frozen. If a late
  sync changes a revealed result, the viewer gets one short **"Late sync"**
  moment ("Late sync: Peter took week 40 after all").

### 3.5 Streaks (the lapsed-streak fix)

- The dashboard computes streaks itself from each person's days and their
  current day key (the server already bumps `todayKey` by timezone):
  consecutive days with ≥1 review ending today, or ending yesterday if today is
  still empty. Miss a whole day and it reads 0, even if their Anki never syncs
  again. `meta.streak` from the publisher is no longer displayed.
- **Best streak** = longest run of consecutive studied days in their history.
- Everywhere a streak shows (board, crew "Longest streak" tile, stats, card)
  uses the computed value.

## 4. What people see

### 4.1 Board

- **Moment pill** (only when there is an unseen moment) centered above the
  board, showing the actual headline, e.g. `🏆 Week 40 results are in · tap ▸`,
  `⚡ You passed Adam this week · tap ▸`, `Adam passed you — 12 behind · tap ▸`.
  Several pending: first headline + `+ 1 more`. Gold for wins/results, rose
  for being passed.
- **Week strip** beside the range tabs, all week after a result exists:
  `👑 Week 40: Adam 1,284 · JP 1,071 · 🔥 2   replay ▸`. Click replays the
  roundup. Hidden before the first result.
- **Champion** (last finished week's winner) wears a 👑 after their name and a
  gold ring on their avatar on the board and person chips, until the next result.
- Range tabs read `Today · This week · All time`.
- **Arrows** (§4.5) and the existing gap line under your row
  (`12 behind Adam · 5 days left` on This week).

### 4.2 Weekly roundup (laptop: split stage)

A centered modal over the dimmed board, ~760px wide, gold-edged.

- **Left, the ceremony:** `Week 40 · 28 Sep – 4 Oct`, gold rays, 👑, winner's
  avatar large with a gold ring, their total as a big gold number, and a
  **podium** (winner centre and tallest; others at heights proportional to
  their totals; two columns when only two competed).
- **Right, the story:**
  - `FINAL` label and a `🔥 N weeks in a row` badge when the winner's run ≥ 2.
  - **Headline**, generated (§5): "Adam holds off JP by 213 to go back-to-back".
  - **Swing line**, generated (§5): "Thursday swung it — Adam's 412 was the
    biggest day of the week. JP was 38 ahead going into it."
  - **Your head-to-head** list: one row per other competitor that week —
    avatar, `vs Adam`, season H2H `1–3` (jade if you lead, rose if behind),
    and this week's margin `lost by 213` / `won by 729`. With two people it's a
    single row.
  - Close button. Esc and clicking the backdrop also close.
- **Plays in beats** (~2.5s total, skippable by click): ① crown + number drop
  in, ② podium bars rise, ③ right side fades in. The chime plays at ① when the
  viewer won (tap already unlocked audio). No music yet.
- Viewer didn't compete that week (e.g. joined late): same roundup, no H2H
  section.
- Winner's run events belong here: run extended ("makes it 3 straight"),
  first ever win, or a run ended ("JP snaps Adam's 4-week run").

### 4.3 Player card

Opens from **any avatar** (board rows, feed cards, notes, person chips) and
from a board row click; floats over the current view (modal, Esc/backdrop/✕
closes), so you don't lose your place.

- Header band (violet→cyan with gold glow if champion): `👑 Champion · week 40`
  when they hold the title; big avatar with gold ring if champion.
- Name; `Studying since <Mon YYYY> · <tz tag>` (first day in their history).
- Two tiles: **🏆 Weeks won** (with `🥇 2 · 🥈 1 · 🥉 0` once any podium week
  exists) and **🔥 Winning run** (live run; if none, `Best run 🔥 3`, muted).
  Gold only once earned, muted otherwise (§4.4 wording).
- **You vs <name>** (not on your own card): H2H `0 – 2`, and a line about
  this week: `This week he's 12 ahead — 5 days left` / `you're 38 ahead`.
- Three headline stats: All time · Streak (★, computed) · Best day.
- `Full stats ▸` → You tab on that person (today's behaviour of a row click).

### 4.4 You tab (full stats)

The tile grid becomes **3 × 2**:

| Weeks won | Winning run | Streak |
|---|---|---|
| **All time** (sub: `N new cards`) | **Recall** | **Best day** (sub: date · minutes) |

- New cards folds into All time's sub-line; Best day stops being full width.
- Weeks won / Winning run are gold once earned; before that muted with a nudge:
  `🏆 0 · first win up for grabs`, `— · win this week to start one`, or with a
  past run `Best run 🔥 3 · win this week to start a new one`.
- Streak gains `best N days`.
- Everything below the tiles (30-day chart, decks, recent cards) unchanged.

### 4.5 Arrows: "since you last looked"

- Rank arrows (▲1/▼1) compare each person's place **now** vs **at your last
  visit**, on the range the board shows. Hover: `Up 1 since you last looked (Sat)`.
- Chase arrows (small ▲/▼ when no place changed): the gap to the person ahead
  (leader: to second) grew or shrank since your last visit. Hover:
  `Adam gained 40 on you since Saturday` / `Lead over JP grew by 40 since Saturday`.
- No arrows when nothing changed, on a first visit, or when the range's period
  has rolled over since your last visit (new day for Today, new week for This
  week).
- "Last visit" = the snapshot saved on your previous page load (§6.2), held
  fixed for the life of the tab so refreshes don't erase the arrows.

### 4.6 Moments

Everything that happened since you last looked, played once, in this order:

1. **Week results** (§4.2) — also carries run extended / snapped / first win.
2. **Late sync** correction (§3.4) — a small version of the roundup's headline card.
3. **You passed someone** on This week: your row slides up past theirs with a
   gold shimmer, then the chime.
4. **Someone passed you** on This week: quieter rose slide, no chime, with
   `Adam's 12 ahead — 4 days left`.

Rules:
- Passes are net since you last acknowledged the standings: passed and got
  re-passed before you looked = nothing.
- **No pass moments on Monday** (your Monday) — everyone restarts at 0, and
  Monday belongs to the roundup. The Monday baseline is updated silently so
  Tuesday compares against it.
- Tapping the pill plays the moments and acknowledges them. The pill has no
  separate dismiss; it stays until tapped. Pass moments not played by the end
  of their week are dropped.
- A moment is acknowledged server-side, so each plays **once across devices**.
- Animations start after the board's entry animation has finished.

## 5. Generated text

Pure functions in a new `lib/roundup.ts`, deterministic from the week's data
(same input → same words), so the same roundup reads the same on every replay.

**Headline** `<winner> <verb> <runner-up> by <margin><suffix>`:
- verb by margin as a share of runner-up's total: < 5% `edges`, < 25%
  `holds off`, < 60% `beats`, else `cruises past`.
- suffix: run 2 `to go back-to-back`; run ≥ 3 `to make it N straight`; first
  ever win `for a first ever win`; ended someone else's run of ≥ 2 → headline
  becomes `<winner> snaps <prev>'s N-week run, by <margin>`.
- Tie for first: `Dead heat: <a> and <b> both on <n>` (no winner).

**Swing line**:
- `<Weekday> swung it — <name>'s <n> was the biggest day of the week.` using
  the single biggest day among competitors (earliest wins ties).
- If the winner trailed the runner-up on cumulative total after some day,
  append `<runner-up> was <gap> ahead going into <weekday>.` for the last day
  they trailed.

## 6. Data and architecture

No publisher change. The crew response already carries every person's full
day history and `joinedAt`.

### 6.1 Computation (browser)

New `lib/competition.ts`, pure and unit-tested:

- `weekKey(date)` (Monday), `isoWeek(monday)`, `weekRange(monday)`.
- `competitorsOf(week, people)` (§3.2), `weekResult(week, people)` →
  `{ standings: {id, cards}[], winner: id | null, podium?: id[] }`.
- `finishedWeeks(people, now)` using §3.4's "Monday for everyone" rule
  (`currentDayKey` per tz).
- `trophies(id, results)` → `{ weeksWon, medals, run, bestRun }`.
- `headToHead(a, b, results)` → `{ a, b }`.
- `champion(results)` → id | null.

`lib/metrics.ts` changes: `weekStart` → Monday; `streak(days, todayKey)` and
`bestStreak(days)`; `rankDeltas`/`momentum` take a "last look" snapshot instead
of "yesterday". Board, StatTiles, PersonPanel use the computed streak.

### 6.2 Server state (per viewer, Redis)

One hash `competition:<userId>`, returned with `/api/crew` for the viewer and
written by a new `POST /api/competition` (same key-in-query auth as `/api/seen`):

- `look` — snapshot from the previous page load: `{ at, day, week,
  scores: { id: { today, week, all } } }`. The page reads it on load (and keeps
  that copy for the tab's life), then writes the new one.
- `standing` — the This week order you last acknowledged: `{ week, order }`.
  Pass moments = diff of current order vs this. Acknowledging (or Monday's
  silent update) rewrites it.
- `results` — week → winner id you were shown, or `"none"` for a tie
  (`"2026-W40": "adam"`). The **latest** finished week absent here = roundup
  pending; older unshown weeks (e.g. you were away two Mondays) are recorded
  silently, only the latest gets a roundup. Present but different from the
  live winner = late-sync moment.

Validation mirrors `/api/seen`: 401 without a valid key, 400 on malformed
bodies, ids and week keys length-capped, timestamps capped at now.

`lib/seen.ts` (localStorage last-visit + `whoYouPassed` on today's order) is
removed; its job moves to the server state above.

### 6.3 Components

- `MomentPill`, `WeeklyRoundup` (modal + beats), `PassMoment` (row animation
  hook on Board), `PlayerCard` (modal), `WeekStrip`.
- `Avatar` gets an optional `onClick` → opens `PlayerCard`; a single
  page-level state `cardFor: id | null`.
- `PersonPanel` tile grid per §4.4.
- `lib/sound.ts` unchanged (chime reused).
- `whatsNew.ts` gets one short blurb for the release.

## 7. Edge cases

- **Only one competitor / nobody joined yet:** no results, no strip, no
  trophies section on cards (tiles stay muted).
- **Everyone 0 in a week:** tie → no winner.
- **Viewer not a competitor that week:** roundup without H2H; no pass moments.
- **Zone `local` (unknown tz):** that person's current day is their reported
  `todayKey`, as today; §3.4 treats it as already-Monday once their reported
  day is Monday.
- **New device:** server state means moments and arrows carry over; first ever
  load has no `look`, so no arrows.
- **Storage/API failure writing competition state:** page still renders;
  moments may replay next load. No error shown.
- **Week 39 today:** JP and Adam are founders; Adam won 894–88. The first
  load after release shows the Week 39 roundup as pending (and, from Monday
  5 Oct, Week 40's).

## 8. Testing

- `competition.test.ts`: week keys/ISO numbers across year ends; founders vs
  late joiners; 0-card competitors; ties; podium only at ≥4; runs (extend,
  break on tie, best run); H2H symmetry; "Monday for everyone" across PDT/EDT;
  late-sync detection.
- `metrics.test.ts`: Monday `weekStart`; computed streak (today empty,
  yesterday missed, lapsed publisher); best streak; arrows vs a snapshot
  (no snapshot, rolled-over period, rank change, chase).
- `roundup.test.ts`: every headline/verb/suffix branch; swing line with and
  without a comeback.
- API: auth, validation, round-trip of `look`/`standing`/`results`.
- Components: pill shows headline and count; roundup renders both sides and
  H2H rows; card opens from an avatar, shows H2H only for others, muted vs gold
  tiles; 3 × 2 grid; strip and crown appear only with a result.
- Manual: run locally against JP's real data; confirm the Week 39 roundup
  (Adam 894, JP 88), card for Adam, and a pass moment with sound after a tap.
