# Feed navigation & unread comments — design

Date: 2026-09-25 · Status: approved in brainstorm, awaiting spec review

## 1. Why

Adam joined and started commenting. Two problems surfaced on day one:

1. **A comment got lost.** The Feed badge said 2. Clicking it jumped to one
   thread (軽快); the other comment — Adam's "i recently learned this one too"
   on JP's 行う card from two days earlier — was never shown, and the badge
   had already cleared. Root causes in today's code:
   - Opening the Feed tab marks *everything* read (`page.tsx` effect on `tab`).
   - The jump goes to one card only (`firstUnreadId` in `Feed.tsx`).
   - Read state is per-browser localStorage (`seen.ts` `commentsSeenAt`), so
     phone and laptop disagree.
   - "new" pills only survive the current session.
2. **The feed is an endless scroll.** Up to 500 cards rendered at once, no way
   to narrow to what's interesting (misses, conversations), no way back up.

**Success:** a comment can't be lost — the badge stays until each unread thread
has actually been opened, on any device — and finding the cards worth looking
at (misses, comments, one friend) takes one tap.

## 2. Scope

In: server-side per-thread read state, reworked badge, "Next unread", filter
bar, day headers, paged rendering, back-to-top.

Out (covered by later pieces, see §9): text search, sample sentences, notes,
cross-deck word lookup. Reactions stay non-notifying.

## 3. Read state (server)

**Redis:** `seen:<userId>` — HASH, field `itemId` → epoch ms when that user last
opened that card's thread. Plus one reserved field `_floor` → epoch ms.

**Unread rule** (one pure function, `lib/unread.ts`, shared by badge and Feed):

```
unread(comment, item, viewer, seen) =
  comment.user !== viewer
  && comment.at > max(seen[item.id] ?? 0, seen._floor)
```

**Rollout floor:** the first time `/api/crew` is served to a user whose hash has
no `_floor`, the server writes `_floor = now − 7 days` (HSETNX, so concurrent
first loads agree). Comments older than a week start read; newer ones start
unread — Adam's 行う comment shows up immediately.

**API:**
- `GET /api/crew` additionally returns `seen: Record<string, number>` for the
  viewer (including `_floor`).
- `POST /api/seen?key=…` body `{ itemId }` → sets `seen[itemId] = now`, returns
  `{ at }`. Auth as `/api/comment` (key → user). 400 on missing/oversized
  itemId, 401 on unknown key.
- Posting a comment also marks that thread seen for its author (so your own
  reply doesn't leave older comments in that thread unread).

**Client:** opening a thread calls `onSeen(itemId)`, which updates local `seen`
optimistically and POSTs; on failure it reloads (same pattern as `react`).

`lib/seen.ts` loses `commentsSeenAt`; the rest of it (totals/order for the
Board) is untouched.

## 4. Badge & "Next unread"

- Badge on the Feed tab = count of unread comments across loaded engagement,
  using §3's rule. It only decreases as threads are opened — switching tabs
  does nothing to it.
- Tooltip: "N unread — tap to go through them".
- **Clicking Feed while the badge shows** → switches to Feed, turns on the
  **Unread** filter, scrolls to and opens the newest-commented unread thread.
  Clicking Feed with no badge just switches (no filter change).
- Inside an open thread, when other unread threads exist, a **"Next unread →"**
  pill sits under the comment input. It opens the next unread thread (ordered
  by newest unread comment first) and scrolls it to center. Keyboard: `n`.
- "new" pills inside a thread use the `seen` value from *before* the thread was
  opened, captured when it opens, so marking it read doesn't make the pills
  vanish while you're reading.
- **All caught up:** when the last unread thread is opened, the badge animates
  out and the Unread filter shows a small jade "All caught up ✓" row instead of
  going blank abruptly.

## 5. Filter bar

One row, **sticky** beneath the header (glass: `--pane` background + backdrop
blur, `--edge` bottom hairline) so it's reachable mid-scroll.

- **People** — existing chips, single-select, unchanged behaviour.
- **Outcome** — segmented control: `All · Missed · Got it`
  (`ease === 1` / `ease > 1`). Missed uses `--rose` when active, Got it uses
  `--jade`, matching the palette's existing meaning of those colours.
- **Toggles** — `💬 Comments` (cards with ≥1 comment) and `Unread` (cards
  with ≥1 unread comment, with a cyan count dot).
- All filters AND together; state is client-only and resets on reload.
- **Sticky Unread:** with Unread on, a card stays listed after you read it
  until the filter is toggled off or the tab is left — otherwise the list
  shifts under your thumb as you read.
- Empty result → one quiet line naming the filter ("No missed cards from Adam
  yet"), plus a "Clear filters" link.
- Mobile: the row scrolls horizontally inside itself (no page overflow); the
  "tap a word to hide the meaning" hint moves to the empty/first-load state
  only.

## 6. Less scrolling

- **Day headers** — group by calendar day in the *viewer's* `profile.tz`:
  "Today · 34", "Yesterday · 51", then weekday + date ("Mon 21 Sep · 12").
  Counts reflect the current filter. Small caps-ish label in `--ink-faint`,
  not a heavy divider.
- **Paging** — render the first 30 filtered cards, then a full-width
  "Show 30 more · 412 left" button. Resets to 30 when any filter changes. A
  jump to an unread card beyond the rendered window extends the window to
  include it.
- **Back to top** — floating round glass button, bottom-right, appears after
  ~1 viewport of scroll, smooth-scrolls to the top of the feed. Keyboard: `g`.

## 7. Feel

Stay inside "Aurora Glass" (`globals.css`): colour only when it means
something (rose = miss, jade = got it / caught up, cyan = new/unread). Motion
is short (150–220 ms), eased, and disabled under `prefers-reduced-motion`.
Delight moments are small and earned: the badge count ticking down, the
caught-up row, the opened thread gently highlighted on arrival. Touch targets
≥ 32px on the filter bar. Implementation applies the frontend-design skill
within these constraints.

Shortcuts sheet gains `n` (next unread) and `g` (top).

## 8. Testing

- `lib/unread.ts` — unit: others-only, per-item seen, floor, missing seen.
- `store` — `markSeen`, `getSeen`, `_floor` set-once (HSETNX) behaviour.
- `/api/seen` — 200 / 400 / 401; comment POST marks author's thread seen.
- `/api/crew` — includes `seen`; initialises `_floor` once.
- `Feed` — outcome/comments/unread filters combine; sticky unread; empty
  state; day headers in given tz; 30 + "Show more"; jump into unrendered
  range extends window; Next unread order; new pills persist while open.
- `page` — badge counts from `seen`, doesn't clear on tab switch, decreases on
  thread open; badge click enables Unread filter. Existing badge/jump tests
  are rewritten to the new behaviour.

## 9. Decisions recorded for later pieces

Agreed in the same brainstorm; each gets its own spec.

- **Order:** 1 this spec → 2 sample sentences → 4 Notes tab → 3 save friends'
  words / "does our deck have it".
- **One publisher release for pieces 2 + 3.** The publisher sends *all* note
  fields with field names (not front/back), plus a compact per-deck word
  index. Field mapping (word / meaning / sentence per note type) is chosen in
  the dashboard (You tab), not in setup — fixes Adam's "5261" front with no
  re-setup. Missing mapping falls back to today's first-two-fields display,
  so nobody breaks before updating. Future publisher updates = `git pull`.
  Peter installs after this release.
- **Sentences** show under the word behind a feed "Sentences" toggle.
- **Notes** are shared with the crew and link to cards/words.
- **Saved words** live in the app; the publisher stays read-only on Anki.
