# Streak Ranks and the Winner's Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the streak star with five metal ranks (crest + framed row), play a rank-up and a crumble once per viewer with sound, and give last week's Silver-or-better winner a swaying banner.

**Architecture:** A pure `lib/ranks.ts` turns a person into a "confirmed" streak and a rank. Per-viewer "rank last shown" lives in the existing competition hash and feeds two new moment kinds through the existing pill → tap → `playNext` flow. Visuals are SVG/CSS components lifted from the approved mockup. The Board holds a person's old streak until their moment plays.

**Tech Stack:** Next.js (App Router; read `web/AGENTS.md`: this Next version differs from your training data), React, TypeScript, Vitest + Testing Library, Upstash Redis, Web Audio. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-10-streak-ranks-design.md`. Visual reference: `docs/superpowers/specs/2026-11-10-streak-ranks-mockup.html`. Lift its crest, frame-corner and banner SVG and its animation timings; it's prototype code, so restructure freely.

## Global Constraints

- Work on branch `ranks`, cut from `master`. All commands run from `web/`; tests run with `npx vitest run <path>`; the full suite is `npm test` and must stay green (524 tests before this work).
- Thresholds stay `STREAK_TIERS = [3, 7, 14, 30, 100]`: Bronze, Silver, Gold, Platinum, Diamond. Under 3 means no rank.
- Nothing moves over text: no sheens, no rotating or swirling borders. The only idle motion on a row is Diamond's corner gems glinting (outside the text), plus the banner's cloth.
- Every glow is soft: no `brightness()` above 1.3 and no white flash. Any `fill: "forwards"` animation must be cancelled when its moment ends (the mockup's stuck-bright crest was exactly this bug).
- Banner: earned from Silver up. Colours: Silver `#5b21b6 → #2e1065`, Gold `#1e3a8a → #0b1437`, Platinum `#047857 → #022c22`, Diamond `#27272a → #09090b`. The trim is always gold. Cloth ripple about 3.4s; the rod and crown stay still. A no-rank or Bronze champion keeps the 👑. Board rows only.
- Sounds are synthesised (no audio files) and peak near gain 0.11, like `ring()` in `lib/sound.ts`.
- `prefers-reduced-motion`: no shatter, crumble or fly-in. The crest and frame swap straight to the new state; sound still plays.
- Never put real tokens or keys in tests (public repo).
- One What's new entry, in JP's voice: one short, colloquial item.

## Review Focus

1. **Several moments at once** (a roundup, Adam reached Gold, JP's streak crumbled): they play in order. Each row keeps its old streak until its own moment swaps it, and the rows not yet played stay held. *Test: Task 6, "holds each row until its own moment plays".*
2. **A late sync:** someone hasn't synced today and yesterday shows no reviews. No crumble yet. A second day with no sync does crumble. *Test: Task 1, "doesn't break a streak on a day that hasn't synced yet" and "breaks it once a second day passes without a sync".*
3. **A first visit or a new crew member** (Max): no moments; their current ranks are recorded silently. *Test: Task 3, "records ranks silently for anyone not seen before".*
4. **A phone-width row:** the crest, frame and banner never cover the cards number. jsdom can't check this: verify by eye on the preview deploy at 390px. *Test: Task 4 checks that the banner and crest render; the layout check is manual in Task 6, Step 7.*
5. **Reduced motion:** the queue still advances and the row ends on the new rank. *Test: Task 5, "swaps straight away under reduced motion".*

---

### Task 1: Ranks from a confirmed streak

**Files:**
- Create: `web/lib/ranks.ts`
- Modify: `web/lib/types.ts` (add `Rank`, `ShownRank`)
- Modify: `web/lib/competition.ts:42-58` (export `zoneFor`)
- Test: `web/lib/__tests__/ranks.test.ts`

**Interfaces:**
- Produces:
  - `type Rank = "bronze" | "silver" | "gold" | "platinum" | "diamond"` (in `types.ts`)
  - `type ShownRank = { rank: Rank | null; streak: number }` (in `types.ts`)
  - `RANKS: readonly Rank[]`, lowest first
  - `RANK_NAME: Record<Rank, string>` ("Bronze"…)
  - `rankFor(streak: number): Rank | null`
  - `rankOrder(rank: Rank | null): number` (−1 for null, else the index in `RANKS`)
  - `rankStreak(p: PersonView): number`
  - `shownRank(p: PersonView): ShownRank`
  - `bannerColors(rank: Rank | null): [string, string] | null` (null below Silver)
  - `zoneFor(p: PersonView): string` (exported from `competition.ts`; `dayNow` now uses it)

- [ ] **Step 1: Create the branch.** `git checkout -b ranks`.

- [ ] **Step 2: Write the failing tests** in `ranks.test.ts`. Use the same `person`/`day` helper style as `lib/__tests__/moments.test.ts`, with tz `America/New_York` and `todayKey: "2026-11-11"` (a Wednesday).
  - `rankFor`: 0→null, 2→null, 3→"bronze", 6→"bronze", 7→"silver", 14→"gold", 30→"platinum", 99→"platinum", 100→"diamond", 400→"diamond".
  - `bannerColors`: null for null and "bronze"; `["#5b21b6", "#2e1065"]` for silver; `["#27272a", "#09090b"]` for diamond.
  - "counts today once it has synced": days studied 07..11 Nov, `lastPublishAt` = 2026-11-11 15:00 New York → `rankStreak` 5.
  - "doesn't break a streak on a day that hasn't synced yet": studied 07..09 Nov, nothing on the 10th, `lastPublishAt` = 2026-11-09 22:00 New York → 3.
  - "breaks it once that day is confirmed by a later sync": same days, `lastPublishAt` = 2026-11-11 09:00 New York → 0.
  - "breaks it once a second day passes without a sync": studied 07..08 Nov, `lastPublishAt` = 2026-11-08 22:00, today the 11th → 0.
  - "never synced is no streak, not a crash": `lastPublishAt: 0`, no days → 0.
  - `shownRank`: 14-day confirmed streak → `{ rank: "gold", streak: 14 }`.

- [ ] **Step 3: Run them to make sure they fail.** `npx vitest run lib/__tests__/ranks.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 4: Implement `lib/ranks.ts`** and the `zoneFor` export. `rankStreak` is the one algorithm the signature doesn't settle:

```ts
// A missed day only counts once a sync after it confirms it, or once a second
// day has gone by: the publisher only sends when Anki closes.
const synced = currentDayKey(zoneFor(p), "", p.meta.lastPublishAt);
const floor = shiftDays(p.meta.todayKey, -1);
const asOf = synced >= p.meta.todayKey ? p.meta.todayKey : synced > floor ? synced : floor;
return currentStreak(p.days, asOf);
```

  `rankFor` goes through `streakTier(streak).tier` (tier 0 means null). `zoneFor` returns `p.profile.tz` when the zone is known, else `"Etc/GMT+12"`, exactly as `dayNow` does now.

- [ ] **Step 5: Run the tests.** `npx vitest run lib/__tests__/ranks.test.ts lib/__tests__/competition.test.ts`. Expected: PASS.

- [ ] **Step 6: Commit.** `git commit -m "Rank a streak, and only break it once a sync confirms the missed day"`

---

### Task 2: Remember the rank each viewer last saw

**Files:**
- Modify: `web/lib/types.ts` (`CompetitionState.ranks?`)
- Modify: `web/lib/store.ts:311-337`
- Modify: `web/app/api/competition/route.ts`
- Test: `web/lib/__tests__/store.test.ts`, `web/app/api/__tests__/competition.test.ts`

**Interfaces:**
- Consumes: `Rank`, `ShownRank`, `RANKS` (Task 1)
- Produces: `CompetitionState.ranks?: Record<string, ShownRank>` (person id → what this viewer last saw). It's stored in the same hash, one field per person: `"k:" + id` → JSON. `getCompetition` sets `ranks` only when at least one such field exists, so `{ results: {} }` stays the empty shape.

- [ ] **Step 1: Write the failing tests.**
  - store.test: "keeps the ranks a viewer has seen, one person at a time". Save `{ ranks: { adam: { rank: "gold", streak: 14 } } }`, then save `{ ranks: { jp: { rank: null, streak: 1 } } }`. `getCompetition("jp").ranks` equals both entries. The existing "nobody → `{ results: {} }`" test stays unchanged.
  - competition.test: "saves ranks for the key holder". POST `{ ranks: { adam: { rank: "gold", streak: 14 } } }` → 200, and `saved` holds that patch.
  - competition.test: "rejects a rank it doesn't know, a negative streak, or too many people". `rank: "mithril"` → 400; `streak: -1` → 400; 21 ids → 400.

- [ ] **Step 2: Run them to make sure they fail.** `npx vitest run lib/__tests__/store.test.ts app/api/__tests__/competition.test.ts`

- [ ] **Step 3: Implement it.** In the route, add `asRanks(v: unknown): Record<string, ShownRank> | null`, mirroring `asResults`. It uses `MAX_PEOPLE`, `isId` and `isCount` (with an integer check), and checks that `rank` is null or in `RANKS`. Wire it into the patch the same way `results` is. Add `ranks` to `saveCompetition` and `getCompetition`.

- [ ] **Step 4: Run the tests.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.** `git commit -m "Remember the rank each viewer last saw for each person"`

---

### Task 3: Rank-up and crumble moments

**Files:**
- Modify: `web/lib/moments.ts`
- Test: `web/lib/__tests__/moments.test.ts`

**Interfaces:**
- Consumes: `shownRank`, `rankOrder`, `RANK_NAME` (Task 1); `CompetitionState.ranks` (Task 2)
- Produces:
  - `Moment` gains `| { kind: "rankUp"; id: string; from: Rank | null; to: Rank }` and `| { kind: "crumble"; id: string; from: Rank; to: Rank | null }`
  - `pendingMoments`: after `results`/`late` and before passes, one rank moment per person whose current rank differs from `state.ranks[id].rank`, in `people` order. People with no entry get no moment.
  - `ackPatch` adds `ranks: Object.fromEntries(people.map((p) => [id, shownRank(p)]))`
  - `silentPatch` adds `ranks` for every person missing from `state.ranks` (everyone when it's undefined)
  - `heldStreaks(state: CompetitionState, moments: Moment[]): Record<string, number>` → for each rank moment, `id → state.ranks[id].streak`
  - `isRankMoment(m: Moment): boolean`

- [ ] **Step 1: Write the failing tests** (`describe("rank moments")`). Use `lastPublishAt` = today 12:00 New York so streaks are confirmed.
  - "plays a rank-up when someone climbs": Adam is now 14 days, `state.ranks.adam = { rank: "silver", streak: 13 }` → `{ kind: "rankUp", id: "adam", from: "silver", to: "gold" }`.
  - "plays a crumble when a streak breaks, down to whatever it is now": `state.ranks.adam = { rank: "gold", streak: 20 }`, now 4 days → `{ kind: "crumble", id: "adam", from: "gold", to: "bronze" }`.
  - "records ranks silently for anyone not seen before": `state.ranks` undefined → no rank moments, and `silentPatch(...).ranks` has every person. Then with `ranks: { jp: … }` only, `silentPatch` adds just `adam`.
  - "says nothing when the rank is unchanged, even if the number moved": `{ rank: "gold", streak: 15 }` vs now 16 → none.
  - "orders roundup, then ranks, then passes": a pending result, a rank-up and a pass → kinds `["results", "rankUp", "passed"]`.
  - `momentHeadline`: rankUp for the viewer → `"🛡 You reached Gold"`; for Adam → `"🛡 Adam reached Gold"`; crumble for the viewer → `"Your Gold streak crumbled"`; for Adam → `"Adam's Gold streak crumbled"`.
  - `heldStreaks`: one pending crumble for Adam with stored streak 20 → `{ adam: 20 }`.
  - `ackPatch(...).ranks.adam` equals `shownRank(adam)`.

- [ ] **Step 2: Run them to make sure they fail.** `npx vitest run lib/__tests__/moments.test.ts`

- [ ] **Step 3: Implement the additions** in `moments.ts`.

- [ ] **Step 4: Run the tests.** `npx vitest run lib/__tests__/moments.test.ts` → PASS.

- [ ] **Step 5: Commit.** `git commit -m "Queue a rank-up or a crumble once per viewer"`

---

### Task 4: Crests, frames and the banner on the Board

**Files:**
- Create: `web/app/components/RankArt.tsx`
- Modify: `web/app/components/primitives.tsx:117-145` (replace `StreakStar` with `StreakRank`)
- Modify: `web/app/components/Board.tsx`, `PersonPanel.tsx:61-63`, `PlayerCard.tsx:135`, `StatTiles.tsx:43`
- Test: `web/app/components/__tests__/Board.test.tsx`, plus any tests that reference the star

**Interfaces:**
- Consumes: `rankFor`, `rankStreak`, `bannerColors`, `RANK_NAME` (Task 1)
- Produces:
  - `RankCrest({ rank, size }: { rank: Rank; size: number })`, an `<svg data-testid={`crest-${rank}`}>`. Gradient ids come from `useId()`, because many crests share the page.
  - `RankFrame({ rank }: { rank: Rank })`, an absolutely positioned, `aria-hidden` overlay (`data-testid={`frame-${rank}`}`): metal edge, inner bevel line, corner pieces. Diamond's corner gems glint.
  - `WinnerBanner({ rank, week }: { rank: Rank; week: number })`, `data-testid="banner"` with `data-rank={rank}`. It shows `WK {week}` and is coloured by `bannerColors(rank)`.
  - `StreakRank({ streak }: { streak: number })`: crest (when ranked), number, and rank name in small caps.
  - Board's new props: `held?: Record<string, number>` (the displayed streak overrides) and `championWeek?: number`.

- [ ] **Step 1: Write the failing tests** in Board.test:
  - "frames a ranked row in its metal and leaves an unranked row plain": JP on a 7-day confirmed streak → `frame-silver` in `row-jp`; Andy on 2 days → no `frame-*` in `row-andy`.
  - "shows the crest and rank name in the streak column": `crest-silver` and the text "Silver" in `row-jp`.
  - "hangs a banner for a Silver-or-better champion, coloured by rank": champion `jp` (silver), `championWeek={7}` → `banner` with `data-rank="silver"` and text "WK 7"; no `crown`.
  - "keeps the crown for a champion below Silver": champion `andy` → `crown`, no `banner`.
  - "shows a held streak instead of the live one": `held={{ jp: 20 }}` → `frame-gold`, and the text "20".
  - Update the existing "crowns the champion" test to use an unranked champion.
  - Give the test `person` helper a `lastPublishAt` of today so streaks are confirmed.

- [ ] **Step 2: Run them to make sure they fail.** `npx vitest run app/components/__tests__/Board.test.tsx`

- [ ] **Step 3: Implement it.**
  - **Layout:** the row's displayed streak is `held?.[id] ?? rankStreak(p)`. On `sm+`, the streak cell shows `StreakRank`. Below `sm` (the cell is hidden today), show the crest at 22px with the number, next to the cards figure, with no rank name. The frame replaces the row's border colour; the lead row keeps its lift. With a banner, the row's left padding grows so the banner sits clear of the rank number and never covers the numbers.
  - **Tooltips:** keep today's content with rank names: "18 days running. 12 more to reach Platinum." / "104 days running — Diamond, the top rank." / the unchanged 0-day text. Change both "The star changes at…" help strings to "The crest changes at 3, 7, 14, 30 and 100 days."
  - **Elsewhere:** PersonPanel, PlayerCard and StatTiles use `rankStreak(p)` and `StreakRank` instead of `currentStreak` and `StreakStar`. They get no frame.
  - Delete `StreakStar` and its now-unused tier style.

- [ ] **Step 4: Run the full suite.** `npm test` → all PASS. Fix any snapshot or text assertions that mention the star.

- [ ] **Step 5: Commit.** `git commit -m "Show streaks as metal ranks, and hang a banner on a Silver-or-better champion"`

---

### Task 5: The rank moment animation and its sounds

**Files:**
- Create: `web/app/components/RankMoment.tsx`
- Modify: `web/lib/sound.ts`
- Modify: `web/app/globals.css` (keyframes, if you use CSS rather than WAAPI)
- Test: `web/app/components/__tests__/RankMoment.test.tsx`

**Interfaces:**
- Consumes: `RankCrest`, `RankFrame` (Task 4)
- Produces:
  - `playChing(): void` and `playCrumble(): void` in `sound.ts`. Pull `playCelebration`'s wait-for-first-touch logic into a private `whenAllowed(play: (ctx: AudioContext) => void)` that all three use, so a blocked sound waits instead of dropping.
  - `RankMoment({ kind, from, to, onSwap, onDone }: { kind: "rankUp" | "crumble"; from: Rank | null; to: Rank | null; onSwap: () => void; onDone: () => void })`. It renders absolutely inside the row (the row is `relative`). `onSwap` fires when the row should show the new rank; `onDone` fires at the end and cancels every animation it started.

- [ ] **Step 1: Write the failing tests** (fake timers; mock `@/lib/sound`):
  - "rank-up swaps mid-way, chimes on landing, then finishes": render rankUp silver→gold. Advance 1.7s → `onSwap` called once. Advance to 3.4s → `playChing` called once, `onDone` called once.
  - "crumble cracks with its own sound": crumble gold→null → `playCrumble` called, `onSwap` then `onDone` called; `playChing` not called.
  - "swaps straight away under reduced motion": mock `matchMedia('(prefers-reduced-motion: reduce)')` to match → `onSwap` and `onDone` are called with no timers advanced, and the sound still plays.

- [ ] **Step 2: Run them to make sure they fail.** `npx vitest run app/components/__tests__/RankMoment.test.tsx`

- [ ] **Step 3: Implement the sounds and the component.**
  - **Ching:** two sine partials at 1318.5 Hz and 2637 Hz, plus a quiet 3951 Hz shimmer. 5ms attack, exponential decay over about 0.6s, peak gain 0.1.
  - **Crumble:** a 0.6s white-noise buffer through a lowpass filter sweeping 900 → 200 Hz, layered with a 70 Hz sine thump. Peak gain 0.09, never harsh.
  - **Rank-up sequence** (from the mockup): row veil; old crest charge then shatter into shards of its metal (0–0.45s); big crest bursts in with soft rays, a ring and the dark "RANKED UP · GOLD" plate in metal lettering (0.45s); light traces the frame once (1.25s) and `onSwap` fires halfway round (about 1.7s); the big crest flies into its slot (1.9s) and `playChing` fires as it lands (about 2.45s); `onDone` at 3.4s.
  - **Crumble sequence:** the crest cracks (`playCrumble` at about 0.3s); pieces fall and fade downward in the old metal; `onSwap` at about 0.9s, as the frame's metal fades; `onDone` at about 2s.

- [ ] **Step 4: Run the tests.** Same command → PASS.

- [ ] **Step 5: Commit.** `git commit -m "Play a rank-up and a crumble, each with its own sound"`

---

### Task 6: Wire it into the page, with the sound hint and What's new

**Files:**
- Modify: `web/app/page.tsx` (load, `playNext`, `playMoments`, Board props)
- Modify: `web/app/components/Board.tsx` (`rankPlay` / `onRankSwap` / `onRankDone` props that render `RankMoment` in that row)
- Modify: `web/app/components/MomentPill.tsx`
- Modify: `web/lib/whatsNew.ts`
- Test: `web/app/__tests__/page.test.tsx`, `web/app/components/__tests__/Board.test.tsx`

**Interfaces:**
- Consumes: everything above
- Produces:
  - Board props `rankPlay?: { id: string; kind: "rankUp" | "crumble"; from: Rank | null; to: Rank | null } | null`, `onRankSwap?: () => void` and `onRankDone?: () => void`
  - MomentPill prop `soundHint?: boolean`, which renders `data-testid="sound-hint"` with the text "🔊 These have sound, turn it up". A crumble at the head of the queue uses the rose style, like `passedBy`.

- [ ] **Step 1: Write the failing page tests** (mock `@/lib/sound`; the server state has `ranks.adam = { rank: "silver", streak: 13 }`, and Adam is now on 14):
  - "names a rank-up on the pill and holds the old rank until it plays": the pill reads "🛡 Adam reached Gold", and `row-adam` shows `frame-silver` and "13".
  - "plays the rank-up on the board, then shows the new rank": tap the pill; the ack POST body includes `ranks.adam = { rank: "gold", streak: 14 }`. Advance through the moment and `row-adam` shows `frame-gold` and "14"; `playChing` was called.
  - "holds each row until its own moment plays": Adam rankUp plus JP crumble. After Adam's swap, `row-jp` still shows its held rank; after JP's moment, it shows the new one.
  - "shows the sound hint once": the first load with a rank moment shows `sound-hint`; after playing, a reload with another rank moment does not. The stored key is `anki-crew:sound-hint`.
  - "a first visit records ranks without a pill": no `ranks` in state → no pill, and the silent POST includes `ranks`.

- [ ] **Step 2: Run them to make sure they fail.** `npx vitest run app/__tests__/page.test.tsx`

- [ ] **Step 3: Implement it.**
  - **On load:** the page sets `held` state from `heldStreaks(state, pending)`.
  - **On tap:** `playMoments` acks as today (`ackPatch` now includes ranks) but leaves `held` alone. It also sets the sound-hint key if the hint was showing.
  - **`playNext`, for a rank moment:** switch to the board tab, set `rankPlay`. `onRankSwap` deletes that id from `held`; `onRankDone` clears `rankPlay` and calls `next()`.
  - **Champion week:** `championWeek` is `crewWeek` of the latest shown result's week.
  - **What's new:** add a top entry, `id: "2026-11-ranks"`, `date: "November 2026"`, `title: "Streak ranks"`, with one item, e.g. "Your streak's a rank now — Bronze at 3 days up to Diamond at 100. Rank up and the crew sees it; let it slip and it crumbles. Win a week at Silver or better and you get a banner."

- [ ] **Step 4: Run the full suite.** `npm test` → all PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit.** `git commit -m "Play rank moments from the pill, holding each row until its turn"`

- [ ] **Step 6: Preview deploy.** `npx vercel` (not `--prod`) from `web/`. Give JP the preview URL with his `?key=` (from `web/.env.local`'s READ_KEYS; never print the others).

- [ ] **Step 7: Manual check at 390px wide** (phone) and on desktop. No crest, frame or banner covers the cards number or the streak. The banner cloth moves and nothing else idles except Diamond's gems. After a moment, the crest is at normal brightness and size.
