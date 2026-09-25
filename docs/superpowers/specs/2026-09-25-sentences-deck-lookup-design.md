# Sample sentences + "is it in my deck?" — design

Date: 2026-09-25 · Status: approved in brainstorm, awaiting spec review

## 1. Why

Two things the feed can't do yet:

- **Show the word properly, with its sentence.** The feed shows each note's
  first two fields. For Adam's Core 6000 notes that's an index number ("5493")
  and the word, with no meaning and no sentence. JP learns most from breaking
  sample sentences down.
- **Answer "do I have this word too?"** When a friend reviews 作り上げる, you
  can't tell whether it's in your own deck, or how well you know it.

**Success:**
- Every card in the feed shows word + meaning, whatever its note type, with
  no setup.
- The sentence is one tap away, or always on if you like.
- Every friend's card says whether the word is in your decks and at what
  stage.
- A person whose fields are guessed wrong can fix it themselves in the You
  tab, and the fix applies to all their cards immediately.

## 2. Scope

In: one publisher release (fields, note types, word index), server storage
and lookup, feed card display, sentence toggles, deck badges, the Card fields
editor in the You tab, and a What's new note.

Out (each its own later spec): saving friends' words, a word search box, the
Notes tab, the low-lift install/self-update, the profile card.

## 3. Publisher payload (`publisher/feed.py`, `publish.py`, new `words.py`)

Everything stays read-only on a copy of the collection.

### 3.1 Feed items

Each item keeps `front`/`back` exactly as today (old dashboards and rollbacks
keep working) and adds:

- `noteType`: the note type's name, e.g. `"Japanese Vocab Dynamic"`.
- `fields`: `{ fieldName: value }` for the note, in field order.
  - Values are cleaned like `clean_field`, except `<b>` and `</b>` survive, so
    the sentence can bold the word. Every other tag and `[sound:…]` is
    stripped, and HTML entities are unescaped.
  - Fields that are empty after cleaning are dropped. That includes audio-only
    and image-only fields.
  - Each value is capped at 200 characters.

Field names come from the `fields` table (`ntid`, `ord`, `name`). Note type
names come from `notetypes`.

### 3.2 `noteTypes`

`{ noteTypeName: [fieldName, …] }` for every note type that has a card in a
counted deck, with fields in `ord` order. It's small and is sent on every
publish.

### 3.3 `words` — the word index

`{ "known": [...], "learning": [...], "new": [...] }`.

- **Candidates:** for every note that has at least one card counted below,
  every field whose cleaned value:
  - has `<b>` tags and `[…]` furigana readings removed, and whitespace
    stripped;
  - is 1–20 characters long;
  - contains at least one kana or kanji character.

  This picks up the word, its kana and its furigana form without knowing which
  field is which, and leaves sentences out.
- **Status per note, best of its cards:**
  - `known`: a review card (`type = 2`) with `ivl >= 21`.
  - `learning`: any other card that has been seen (`type` 1, 2 or 3).
  - `new`: `type = 0`.
  - Suspended (`queue = -1`) and buried cards (`queue` -2/-3) are ignored.
    A note whose cards are all ignored contributes nothing.
- A word found in several notes takes its best status. Each word appears in
  exactly one list.
- **Send only when changed:** the publisher hashes (sha256) the sorted index
  and stores `wordsHash` in `state.json`. If the hash is unchanged it leaves
  `words` out of the payload. It records the new hash only after a successful
  post.

The normalization (strip `<b>`, strip `[…]`, strip whitespace) must match the
dashboard's `normalizeWord` in §5.1. The contract sample gets a case that
pins both sides.

### 3.4 Compatibility

Old publishers send none of the new keys. The dashboard treats missing
`noteType`/`fields` as "show front/back as today", and a missing index as "no
badges".

## 4. Server

### 4.1 Ingest (`app/api/ingest/route.ts`)

New optional keys are validated. A bad value rejects the whole payload with
400, as today:

- `fields`: object of string → string, ≤ 20 entries, values ≤ 200 characters.
- `noteType`: string ≤ 100 characters.
- `noteTypes`: ≤ 50 entries, each an array of ≤ 30 strings.
- `words`: the three arrays, ≤ 50,000 entries in total, each ≤ 20 characters.

### 4.2 Storage (`lib/store.ts`)

- Feed items store `noteType` and `fields` as part of the existing JSON
  member. The trim invariant (parse/stringify round-trip) still holds.
- `user:{id}:notetypes`: one JSON string, overwritten on each publish that
  carries `noteTypes`.
- `user:{id}:words`: a hash of word → `"known" | "learning" | "new"`. When
  `words` is present it's replaced in one `MULTI`: `DEL`, then a single
  `HSET` with all entries. An empty index still `DEL`s.
- `user:{id}:fieldmap`: one JSON string,
  `{ noteType: { word?: string; meaning?: string; sentence?: string } }`.
  Only fields the person has overridden are present.

### 4.3 `GET /api/crew`

Adds:

- `fieldMaps: Record<userId, FieldMap>`: everyone's overrides.
- `noteTypes: Record<string, string[]>`: the viewer's own only.
- `inMyDeck: Record<itemId, "known" | "learning" | "new" | "none">`: only for
  feed items whose owner isn't the viewer.
  1. For each item that has `fields`, resolve its word (§5.1) using the
     owner's field map.
  2. Normalize it.
  3. Look all the words up in one `HMGET` against the viewer's hash. A miss
     is `"none"`.

  If the viewer has no index at all (the key doesn't exist), `inMyDeck` is
  `{}`, so no badges show rather than every card claiming "none". Items
  without `fields` get no entry.

### 4.4 `POST /api/fieldmap`

- Body: `{ key, noteType, map: { word?, meaning?, sentence? } }`.
- The read key identifies the person, with the same auth as comments. You
  can only set your own map.
- Each value must be one of that note type's field names from the person's
  stored `noteTypes`.
- An empty `map` removes the override for that note type ("Reset to auto").
- Returns the person's full field map.

## 5. Dashboard

### 5.1 `lib/fields.ts` (shared by the server and the client)

- `guessMapping(fieldNames)` returns `{ word, meaning, sentence, translation }`
  (field names or null). Rules, first match wins, all case-insensitive:
  - **word:** `vocabulary-kanji`, `expression`, `word`, `vocab`, `kanji`,
    `front`.
    - If the note type has a vocab-style field (`vocabulary-*`, `word`,
      `vocab`, `kanji`), `expression` is skipped for word.
    - If nothing matches, it's the first field that isn't all digits in the
      item's values. That's resolved per item, which is why
      `resolveCard` takes the values too.
  - **meaning:** `vocabulary-english`, `meaning`, `english`, `definition`,
    `back`, excluding anything that starts with `sentence`.
  - **sentence:**
    - A field containing `sentence` or `example` that doesn't also contain
      `kana`, `english`, `translation`, `audio`, `clozed`, `image` or
      `furigana`.
    - Otherwise, `expression` when it wasn't used as the word, as in JP's
      iKnow notes.
  - **translation:** a field containing `sentence` or `example` and also
    `english` or `translation`. When the sentence came from `expression`,
    the note's `meaning` field is the translation instead.
- `resolveCard(item, override?)` returns
  `{ word, meaning, sentence?, translation? }` as strings (they may contain
  `<b>`).
  - The override replaces the guess field by field. `translation` is always
    guessed.
  - With no `fields` it returns `{ word: front, meaning: back }`.
  - A mapped field that's missing on this item falls back to the guess, then
    to front/back.
- `normalizeWord(s)`: strip `<b>`/`</b>`, strip `[…]` (furigana), strip all
  whitespace.
- `boldParts(s)`: splits on `<b>…</b>` into `{ text, bold }` pieces. It's
  rendered as React text nodes and never as HTML. Unmatched tags are treated
  as plain text.

### 5.2 Feed card (`FeedCard.tsx`)

- The big line is `word`, the small line is `meaning` (both through
  `boldParts`, with bold dropped for these two).
- On friends' cards, a badge sits next to the deck name, from `inMyDeck`:
  - **known** in jade
  - **learning** in cyan
  - **not seen yet** in grey
  - **not in your deck** as a faint outline

  No entry means no badge. The badge has a `?`-style tooltip: "Is this word
  in any of your decks, and how well you know it."
- **Sentences:**
  - Shown when `sentence` exists and either the feed-wide switch is on or
    this card's "例" button is toggled.
  - The per-card toggle flips the feed-wide default for that card, and lives
    in component state (not persisted).
  - The sentence renders with the bold parts bold. The translation sits under
    it in dim text.
  - Clicks inside the sentence area and on the 例 button don't open the
    thread.

### 5.3 Feed switch (`FeedFilters.tsx`)

A **Sentences** toggle button in the filter row, off by default, stored in
`localStorage` under `anki-crew:sentences` (wrapped in try/catch, per-browser).

### 5.4 Card fields editor (You tab, your own page only)

- New component `CardFields.tsx`, placed under the avatar uploader when
  viewing yourself.
- One-line explainer: "How your cards show up for everyone. We guess from the
  field names; fix anything that's off."
- For each of your `noteTypes`: the name, and three selects (Word / Meaning /
  Sentence).
  - The options are that type's field names plus "auto (Guess)". The current
    value is the override, or "auto".
  - A preview line uses your newest feed item of that note type, if any:
    word — meaning, with the sentence below.
- A change saves immediately via `POST /api/fieldmap`. It's optimistic: on
  failure it reverts and shows the existing "didn't save" note. "Reset to
  auto" sends an empty map.
- Hidden when `noteTypes` is empty, i.e. before you've updated the publisher.

### 5.5 What's new

One note at the top of `NOTES`:
- cards show the real word and meaning;
- the Sentences switch and the 例 button;
- the deck badge;
- "update your publisher (`git pull`) to get badges on your friends' cards".

It's written briefly and colloquially.

## 6. Rollout

1. Merge and deploy the dashboard. Nothing changes until publishers update,
   except that no badges show.
2. JP updates his publisher (`git pull`) and checks the badges on Adam's
   cards.
3. Adam and Peter `git pull`. Peter installs on the current README this
   weekend and pulls after this ships.

## 7. Testing

**Publisher (pytest), with fixtures shaped like the real note types:**
- Japanese Vocab Dynamic, iKnow Sentences, Japanese-75658 / Core with
  `Core-Index` first.
- `fields` cleaning keeps `<b>`, and drops audio, images and empty fields.
- Index candidates: word, kana and furigana forms in; sentences out; an
  all-digit field out.
- Status precedence, and suspended/buried cards excluded.
- The hash-skip: unchanged means no `words` key, and the hash is kept only
  after a successful post.
- The contract sample is updated.

**Web (vitest):**
- `guessMapping` against a table of real field-name sets (all three of JP's
  note types plus Adam's Core layout).
- `resolveCard` fallbacks, `normalizeWord`, and `boldParts`, including
  unmatched tags.
- Ingest validation for each new key.
- The store: index replacement, and the notetypes/fieldmap round-trip.
- `/api/crew` `inMyDeck`:
  - hit, miss, own cards skipped;
  - no index means `{}`;
  - resolution uses the owner's override.
- `/api/fieldmap`: auth, unknown field rejected, reset.
- The feed card with and without fields, and badge states.
- The sentence switch and the per-card toggle, and that a click on the
  sentence doesn't open the thread.
- The Card fields editor: saves, and reverts on failure.

**Real data:** a dry-run flag, `publish.py --dry-run`, prints the payload's
sizes and the per-note-type guesses from JP's real collection without
posting. It's checked before JP updates.
