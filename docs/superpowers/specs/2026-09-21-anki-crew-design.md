# Anki Crew — Shared Study Dashboard

**Date:** 2026-09-21
**Status:** Design approved; ready for implementation planning

## Problem

Three friends study Japanese in Anki with different decks and different levels. Nobody can see anyone else's activity, so there is no accountability, no competition, and no cross-pollination between decks. The goal is one page all three open to see each other's numbers and — more importantly — what each person is actually studying.

## Participants

| | Level | Situation | Timezone |
|---|---|---|---|
| **JP** | N5–N4 | Core 2k/6k deck. Girlfriend is Japanese; wants to speak well with her. Windows. | EST |
| **Friend A** | ~N4 | Wife is Japanese; wants to teach his kids. | EST |
| **Friend B** | Strong spoken | Raised by a Japanese mother — fluent in household context, weak on reading and formal/outside-the-home register. Not focused on kanji. | PST |

All three are software engineers. All three prioritize **speaking**. All three are competitive.

**Hard constraint (JP only):** JP will not update Anki or install/update any add-on. His data must be read directly from a copy of `collection.anki2`. This constraint is personal to JP, but the chosen design applies the same script-based approach to everyone, so it holds universally.

## Goals

1. One view of everyone's study activity: cards reviewed, time studied, streak, retention.
2. See what others are actually studying, as a live feed of real cards — for motivation and for picking up vocabulary from decks you don't own.
3. A competitive framing that all three will actually engage with.
4. Setup cheap enough (~5 minutes, for engineers) that a lukewarm participant still opts in.
5. Useful to JP even if one or both friends flake.

## Non-goals for v1

- Reactions, comments, or any social layer beyond looking (v2 — hooks built in v1, see section 8).
- Saving a friend's word into your own deck / CSV export (v2).
- A self-declared "what I'm working on" status line.
- Any measurement of speaking practice. Anki cannot see it; pretending otherwise would be dishonest data.
- Authentication beyond unlisted secret links.
- Writing anything back into anyone's Anki collection. Ever. The publisher is strictly read-only, on a copy.

## 1. Key decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | **Raw cards reviewed is the ranking metric.** Time, streak, and retention shown alongside. | JP's call, overriding a proposed goal-normalized ranking. All three are competitive and want a real scoreboard; deck differences are accepted as noise. The storage model (D4) keeps the formula changeable later without data loss. |
| D2 | **Only revlog types 0, 1, 2 count** (learn, review, relearn). Filtered/cram (3) and manual reschedule (4) are excluded. | Cram sessions and deck reschedules can manufacture hundreds of "reviews." Three competitive engineers will find this. Better principled on day one than patched after an argument. |
| D3 | **Per-person local day boundaries**, using each collection's own rollover hour (Anki default 4am). | Two participants are EST, one is PST. "Today" should mean your local today, as in every streak app. Weekly and all-time totals are sums of local days and therefore unaffected. The PST row carries a `PST` tag so a close live race is not confusing. |
| D4 | **Daily rollups plus a capped feed** — not a raw event log, not pre-baked stats. | Storing per-day ease breakdowns rather than a finished retention percentage means any future ranking formula is computed in the web app alone — no script edits, no history loss. Also makes re-publishing idempotent and self-healing. |
| D5 | **New repo**, reusing `anki_stats.py` from `anki-progress-dashboard`. | The collection reader is the proven, hard-won part. The existing app has a different audience, a cutesy design, and an unmerged v1.1 branch — keeping them separate avoids entangling both. |
| D6 | **Publisher script for all three.** No Anki add-on. | Participants are software engineers, so script setup is trivial for them. Also satisfies JP's no-add-on constraint with one codebase instead of two ingestion paths. |
| D7 | **Live card feed including card content.** | The highest-value feature: it makes the page worth opening daily and produces genuine cross-deck learning. All three participants accept that card content leaves their machine. |
| D8 | **Clean and sharp visual design, not cute.** | Audience is three engineers, not a partner. Dense readable tables, good typography, a scrollable feed, dark mode. Deliberately not the treatment the girlfriend dashboard received. |
| D9 | **v2 hooks built into v1** (see section 8). | Reactions and comments are only low-lift later if stable ids, key-to-identity mapping, and engagement-aware feed eviction exist from the start. Costs about an hour in v1; avoids a migration. |

## 2. Architecture

```
  Each participant's PC                Vercel                   Any browser
 +--------------------+        +--------------------+       +--------------+
 | collection.anki2   |        |  Next.js app       |       |  /?key=<k>   |
 |   | copy, RO       | HTTPS  |   /api/ingest  <---+- POST |              |
 | crew_publish.py    +------->|   /api/crew    ----+------>|  Board       |
 |   ^ hourly task    | bearer |         |          |       |  Feed        |
 +--------------------+ token  |  Upstash Redis     |       |  Person      |
                               +--------------------+       +--------------+
```

Three independent publishers, one dumb server, one page. A publisher going dark degrades that person's row to "stale" and nothing else.

## 3. Data model (Upstash Redis)

```
crew:users                    SET    of user ids
user:<id>:profile             JSON   {displayName, tz, joinedAt}
user:<id>:days                HASH   field = "YYYY-MM-DD"
                                     value = JSON {reviews, minutes, newCards,
                                      ease1, ease2, ease3, ease4,
                                      perDeck: {deckName: count}}
user:<id>:meta                JSON   {lastPublishAt, streak, allTimeReviews,
                                      firstReviewAt}
feed                          ZSET   score = review timestamp (ms)
                                     member = JSON feed item (below)
feed:engaged                  SET    of feed item ids exempt from capping
```

**Feed item:**

```json
{
  "id": "jp:1758412345678",
  "user": "jp",
  "front": "話しかける",
  "back": "to speak to, to address",
  "deck": "Core 2k/6k",
  "ease": 3,
  "ivl": 21,
  "ts": 1758412345678
}
```

`id` is `<userId>:<revlogId>` — deterministic, so a re-publish cannot duplicate a feed item, and so reactions and comments in v2 attach to a stable key.

**Retention is derived, never stored.** `ease1` is a lapse; `ease2` through `ease4` are passes. Retention, "percent correct on mature cards", and any future metric are computed in the web app from the stored daily rows.

**One hash per person, not one key per day.** Upstash bills per command, and a key-per-day model would cost one write per day per publish — roughly 800 writes an hour for JP alone, which blows through the free tier immediately. A single hash means the *entire* history is written in one `HSET`.

**Every run publishes the full history**, and day fields are overwritten by date. There is no incremental window, no local state file tracking what was last sent, and therefore no way for the publisher and the server to disagree. A PC that was off for two days self-heals on the next run because the next run sends everything. This is both simpler and cheaper than an incremental protocol.

**Streak lives in `meta` rather than being derived.** Unlike retention, a streak depends on that collection's local rollover hour, which only the publisher knows. Computing it server-side would require the web app to model three participants' day boundaries; computing it publisher-side is a few lines against data already in hand.

## 4. Publisher (`crew_publish.py`)

Python 3, **standard library only**, cross-platform. Derived from `anki-progress-dashboard/publisher/anki_stats.py`.

**Flow:**

1. **Locate the collection.** Auto-detect by OS:
   - Windows: `%APPDATA%\Anki2\<profile>\collection.anki2`
   - macOS: `~/Library/Application Support/Anki2/<profile>/collection.anki2`
   - Linux: `~/.local/share/Anki2/<profile>/collection.anki2`

   Multiple profiles: prompt at setup, store the chosen path in config.
2. **Copy** to a temp path, open the copy read-only via `sqlite3`. Anki may be running; the original is never opened or locked.
3. **Read `revlog`**, filtering to `type IN (0,1,2)` per D2.
4. **Bucket into local days** using the collection's rollover hour, per D3. On schema 18 this lives in the `config` table under key `rollover` as a JSON-encoded byte string (JP's reads `b'4'`) — **not** in `col.conf`, which is an empty string on modern collections. Default to 4 when absent.
5. **Aggregate per day:** review count, total milliseconds converted to minutes, new cards (distinct cards whose first-ever review falls on that day), ease1 through ease4 counts, and a per-deck count.
6. **Extract feed cards** for recent reviews: join `revlog` to `cards` to `notes`, resolve deck names from the `decks` table, strip HTML from note fields, take the first two non-empty fields as front and back, truncate to a sane length.
7. **POST** to `/api/ingest` with that participant's bearer token.

**Schema floor: collection version 18 or newer**, which means Anki 2.1.28 (2020) or later. JP's frozen install is version 18 and has the modern `decks`, `fields`, `templates`, `notetypes`, and `config` tables, so no legacy compatibility layer is needed. Older collections are detected and rejected with a message naming the version found and the minimum required — a clear error beats speculative support for a schema nobody in the group is running.

**Every run publishes the entire revlog history**, so day one shows every participant's full history and real streaks before anyone studies a single new card. This matters specifically for a participant who is not yet sold: they open the link and see their own years of history, not an empty table. It also means there is no first-run/subsequent-run distinction to get wrong.

**Setup (`setup.py`):** detect collection, prompt for display name and ingest token, write `config.json` (gitignored), then install the hourly schedule. On Windows it installs the `schtasks` entry; on macOS and Linux it prints the `launchd` or `cron` line rather than installing magic behind an engineer's back.

## 5. API

**`POST /api/ingest`** — `Authorization: Bearer <INGEST_TOKEN>`

Tokens map server-side to user ids via a single environment variable holding a JSON map. Body:

```json
{
  "user": "jp",
  "displayName": "JP",
  "tz": "America/New_York",
  "generatedAt": 1758412345678,
  "days": [{ "//": "full history, every run", "date": "2026-09-21", "reviews": 143, "minutes": 22.4,
             "newCards": 20, "ease1": 18, "ease2": 9, "ease3": 96,
             "ease4": 20, "perDeck": { "Core 2k/6k": 143 } }],
  "allTime": { "reviews": 48201, "firstReviewAt": 1600000000000 },
  "recentCards": [ "feed items, without user — the server stamps it" ]
}
```

The server validates the token, rejects a mismatched `user`, writes all day fields in one `HSET`, upserts profile and meta, merges feed items (`ZADD`; the deterministic id makes this idempotent), then trims `feed` to 500 entries **excluding anything in `feed:engaged`**.

**`GET /api/crew?key=<READ_KEY>`**

Per-person read key. It maps server-side to a user id, which is how the page knows which row is yours — and, in v2, how a reaction is attributed. Returns all profiles, the trailing 60 days per person, meta, and the feed.

## 6. Dashboard

Next.js App Router on Vercel. Three sections, tabs on mobile.

- **Board** — today / this week / all-time toggle. Per person: rank, cards reviewed, minutes, streak, retention, and a 14-day sparkline. Your row highlighted. The PST participant is tagged.
- **Feed** — the scroll, and the reason to come back. Reverse-chronological cards from everyone: who, word, reading and meaning, deck, relative time. Filter chips per person.
- **Person** — tap a name for 30-day bars, deck breakdown, all-time totals, and their recent cards.

**The header shows last-published time per person**, so a dead PC reads as "stale," not as "he stopped studying." This distinction is load-bearing for a dashboard built on other people's always-on computers.

Feed field extraction starts **generic** (first two non-empty fields, HTML stripped). The friends' deck layouts are unknown until real data arrives; per-deck tuning is a follow-up once we can see what actually renders.

## 7. Testing

- **Publisher:** tests build a synthetic `collection.anki2` in memory and assert on rollover bucketing across a day boundary, the type-0/1/2 filter (a cram session must not inflate counts), HTML stripping, multi-deck splits, legacy versus modern deck storage, and backfill idempotency.
- **Web:** ingest auth and validation, token/user mismatch rejection, leaderboard math derived from stored ease counts, feed capping with the engagement exemption, and read-key-to-identity mapping.
- **Contract:** one shared fixture JSON consumed by both test suites. The publisher-to-web JSON contract is where the last project's bug lived; this is the guard.

## 8. v2, in order

Each is independently shippable, in this order, if the project picks up steam:

1. **Reactions** — a `reactions:<itemId>` hash, authenticated by the existing read-key-to-identity mapping. A few hours.
2. **Comments** — a `comments:<itemId>` list. Half a day. The two-way notes endpoint in `anki-progress-dashboard` is the pattern to lift.
3. **Cross-pollination** — star a card in a friend's feed, collect it, export CSV for import into your own deck. The feed already stores full card content and a stable id, so this needs no data migration.

v1 pays about an hour for these: stable feed ids, key-to-identity mapping, and the `feed:engaged` eviction exemption.

## 9. Risks

| Risk | Mitigation |
|---|---|
| A participant's PC is off, so their data goes stale | Per-person "last published" in the header; backfill on the next run means nothing is lost, only delayed. |
| The feed renders badly for unfamiliar deck layouts | Generic extraction in v1, per-deck tuning once real data lands. Expected, not a defect. |
| Card counts are not comparable across decks | Accepted per D1. The ease-breakdown storage model means the metric can be renegotiated later without losing history. |
| A participant loses interest | The board and feed must be worth opening with one active participant. Full-history backfill makes day one non-empty. |
| Card content leaving a machine | Agreed by all three (D7). Japanese study decks only; no personal notes expected. An opt-out config flag is the fallback if that ever changes. |

## 10. Success criteria

1. All three publishers post successfully on a schedule, from three different machines and two timezones.
2. The board shows correct per-person local-day counts, verified against each person's own Anki stats screen.
3. A cram session does not inflate anyone's count.
4. The feed shows readable Japanese cards from all three decks.
5. JP can send one link into the group chat and both friends are set up in under ten minutes each.
