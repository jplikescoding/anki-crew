# Sample sentences + "is it in my deck?" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Feed cards show the real word, meaning and sample sentence for any note type. Friends' cards carry a badge saying whether that word is in your decks and how well you know it.

**Architecture:**
- The publisher (Python, read-only on a copy of the Anki collection) adds three things to each publish:
  - every card's named fields;
  - the note types' field names;
  - a word index, re-sent only when it changes.
- The web app (Next.js + Upstash Redis) stores them, and guesses word/meaning/sentence from the field names in a shared `lib/fields.ts`. Each person can override a guess per note type.
- `/api/crew` resolves friends' words and looks them up in the viewer's index with one `HMGET`, returning `inMyDeck`.

**Tech Stack:** Python 3.11 stdlib + unittest (publisher); Next.js (this repo's version — read `web/node_modules/next/dist/docs/` before touching Next APIs), React, TypeScript, Tailwind, `@upstash/redis` 1.39, vitest + Testing Library (web).

**Spec:** `docs/superpowers/specs/2026-09-25-sentences-deck-lookup-design.md`

## Global Constraints

- Publisher never writes to Anki; it only reads the temp copy from `anki_reader.open_collection_copy`.
- Never use `ORDER BY name` (or any text ORDER BY) on real Anki tables: they use the `unicase` collation, and plain sqlite3 raises `no such collation sequence: unicase`. Order by integer columns only.
- Feed field values: HTML stripped except `<b>`/`</b>`, `[sound:…]` stripped, entities unescaped. Max 200 characters per value. At most the first 30 non-empty fields.
- `noteTypes`: at most 50 note types, 50 names each. `words`: at most 50,000 entries in total. Each index word is 1–20 characters and contains kana or kanji.
- Word normalization is identical on both sides: remove `<b>`/`</b>` (case-insensitive), remove `[…]`, remove all whitespace. It's pinned by `publisher/tests/contract/normalize.cases.json`.
- Status: `known` = review card (`type = 2`) with `ivl >= 21`; `learning` = `type` 1, 2 or 3; `new` = `type = 0`. Only suspended cards (`queue = -1`) are ignored.
- Ingest limits: `fields` ≤ 30 entries with values ≤ 200 characters; `noteType` ≤ 100 characters; `noteTypes` ≤ 50 entries of ≤ 50 strings; `words` ≤ 50,000 entries of ≤ 20 characters.
- Old publishers (no new keys) must keep working unchanged. So must old stored feed items (no `fields`).
- Sentences are rendered as React text nodes via `boldParts`, never with `dangerouslySetInnerHTML`.
- The What's new entry is ONE short blurb (a single `items` entry, a sentence or two).
- Commit messages: imperative, plain English, like the existing log. End each with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Publisher tests: `cd publisher && python -m unittest discover -s tests -t .`. Web tests: `cd web && npx vitest run <path>`. Types: `cd web && npx tsc --noEmit -p .`.

## Review Focus

1. **The same card stored twice, with and without fields.** After someone updates, the publisher resends recent cards with `fields`. Redis keeps the old, field-less member under the same id and score, and the current `getFeed` dedupe keeps whichever sorts first, which is the *old* one (`}` sorts after `,`). Expected: the version with fields wins. The test is in Task 6.
2. **Sentence-only note types (JP's iKnow notes).** The "word" is a whole sentence, so it must get no badge instead of "not in your deck". The test is in Task 7, and the guess table in Task 4.
3. **A viewer who hasn't updated yet.** They have no index, so `inMyDeck` must be `{}` and no badges show, instead of every card saying "not in your deck". The test is in Task 7.
4. **A failed save in Card fields.** It must revert to the server's state and say it didn't save, not stay showing an unsaved choice. The test is in Task 9.
5. **A note type with more than 30 fields, or a collection with more than 50k index words.** The publisher trims to the limits so its own payload is never rejected with a 400, which would stop all publishing. The tests are in Tasks 1 and 2.

---

## File Structure

**Publisher**
- `publisher/anki_reader.py` (modify): add `notetype_names(con)` and `field_names(con)`.
- `publisher/feed.py` (modify): add `clean_rich`, `note_fields`, and `noteType`/`fields` on each item.
- `publisher/words.py` (create): `normalize_word`, `note_types`, `word_index`, `words_hash`.
- `publisher/publish.py` (modify): payload keys, the hash skip, state, and the dry-run summary.
- `publisher/tests/fixtures.py` (modify): add `add_notetype`.
- `publisher/tests/test_feed.py`, `tests/test_words.py` (new), `tests/test_publish.py` (modify).
- `publisher/tests/contract/payload.sample.json` (modify) and `normalize.cases.json` (create).

**Web**
- `web/lib/types.ts` (modify): new types.
- `web/lib/fields.ts` (create): `guessMapping`, `resolveCard`, `normalizeWord`, `boldParts`, `plainText`, `deckWord`, `ROLES`.
- `web/app/api/ingest/route.ts` (modify): validation.
- `web/lib/store.ts` (modify): note types, the word hash, field maps, and the getFeed dedupe fix.
- `web/app/api/crew/route.ts` (modify): `fieldMaps`, `noteTypes`, `inMyDeck`.
- `web/app/api/fieldmap/route.ts` (create).
- `web/app/components/FeedCard.tsx`, `Feed.tsx`, `FeedFilters.tsx`, `PersonPanel.tsx` (modify).
- `web/app/components/CardFields.tsx` (create).
- `web/app/page.tsx` (modify): wiring.
- `web/lib/whatsNew.ts` (modify): the note.
- Tests next to each file, in the existing `__tests__` folders.

---

### Task 1: Publisher — named fields on feed items

**Files:**
- Modify: `publisher/anki_reader.py` (append after `deck_names`)
- Modify: `publisher/feed.py`
- Modify: `publisher/tests/fixtures.py` (append)
- Modify: `publisher/tests/test_feed.py`
- Modify: `publisher/tests/contract/payload.sample.json`

**Interfaces:**
- Produces:
  - `anki_reader.notetype_names(con) -> dict[int, str]`
  - `anki_reader.field_names(con) -> dict[int, list[str]]`
  - `feed.clean_rich(s) -> str`
  - `feed.note_fields(flds: str, names: list[str]) -> dict[str, str]`
  - `feed.MAX_FIELD_LEN = 200`, `feed.MAX_FIELDS = 30`
  - Feed items gain `"noteType": str` and `"fields": dict`.
  - Test fixture: `add_notetype(con, ntid, name, field_names)`.

- [ ] **Step 1: Add the fixture helper**

Append to `publisher/tests/fixtures.py`:

```python
def add_notetype(con, ntid, name, field_names):
    con.execute("INSERT INTO notetypes(id, name) VALUES (?, ?)", (ntid, name))
    for i, field in enumerate(field_names):
        con.execute("INSERT INTO fields(ntid, ord, name) VALUES (?, ?, ?)", (ntid, i, field))
    con.commit()
```

- [ ] **Step 2: Write the failing tests**

Append to `publisher/tests/test_feed.py`. Also add `add_notetype` to its fixtures import line, and `import anki_reader`:

```python
VOCAB = ["Expression", "Meaning", "Reading", "Audio", "Sentence",
         "Sentence-Kana", "Sentence-English", "Sentence Audio", "Image_URI"]


class TestCleanRich(unittest.TestCase):
    def test_keeps_bold_and_strips_everything_else(self):
        self.assertEqual(F.clean_rich('<font color="#008000"><b>金曜日</b>の夜</font>'),
                         "<b>金曜日</b>の夜")

    def test_keeps_bold_case_insensitively(self):
        self.assertEqual(F.clean_rich("<B>話す</B>"), "<b>話す</b>")

    def test_strips_sound_and_unescapes(self):
        self.assertEqual(F.clean_rich("a &amp; b[sound:x.mp3]"), "a & b")


class TestNoteFields(unittest.TestCase):
    def test_names_each_value_and_drops_empty_audio_and_image_fields(self):
        flds = SEP.join(["<b>金曜日</b>", "Friday", "きんようび", "[sound:a.mp3]",
                         "<b>金曜日</b>の夜は出かけます。", "", "I go out on Friday night.",
                         "[sound:b.mp3]", '<img src="x.jpg" />'])
        self.assertEqual(F.note_fields(flds, VOCAB), {
            "Expression": "<b>金曜日</b>", "Meaning": "Friday", "Reading": "きんようび",
            "Sentence": "<b>金曜日</b>の夜は出かけます。",
            "Sentence-English": "I go out on Friday night.",
        })

    def test_a_field_that_is_only_bold_tags_counts_as_empty(self):
        self.assertEqual(F.note_fields(SEP.join(["<b></b>", "x"]), ["A", "B"]), {"B": "x"})

    def test_caps_each_value(self):
        out = F.note_fields("y" * 500, ["A"])
        self.assertEqual(len(out["A"]), F.MAX_FIELD_LEN)

    def test_sends_at_most_thirty_non_empty_fields(self):
        names = ["F%d" % i for i in range(40)]
        out = F.note_fields(SEP.join("v%d" % i for i in range(40)), names)
        self.assertEqual(list(out), names[:F.MAX_FIELDS])

    def test_values_without_a_name_are_dropped(self):
        self.assertEqual(F.note_fields(SEP.join(["a", "b"]), ["A"]), {"A": "a"})


class TestReaderNames(unittest.TestCase):
    def test_note_type_and_field_names_in_order(self):
        con = _seeded()
        add_notetype(con, 7, "Japanese Vocab Dynamic", VOCAB)
        self.assertEqual(anki_reader.notetype_names(con), {7: "Japanese Vocab Dynamic"})
        self.assertEqual(anki_reader.field_names(con), {7: VOCAB})


class TestFeedItemFields(unittest.TestCase):
    def test_items_carry_note_type_and_named_fields(self):
        con = _seeded()
        add_notetype(con, 7, "Japanese Vocab Dynamic", VOCAB)
        add_note(con, 100, 7, ["金曜日", "Friday", "", "", "金曜日の夜", "", "", "", ""])
        add_card(con, 200, 100, 5)
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200)
        item = F.feed_items(con, DECKS, "jp")[0]
        self.assertEqual(item["noteType"], "Japanese Vocab Dynamic")
        self.assertEqual(item["fields"], {"Expression": "金曜日", "Meaning": "Friday",
                                          "Sentence": "金曜日の夜"})
        # Old dashboards still read these.
        self.assertEqual((item["front"], item["back"]), ("金曜日", "Friday"))

    def test_unknown_note_type_gets_an_empty_name_and_no_fields(self):
        con = _seeded()
        add_note(con, 100, 99, ["話す", "to speak"])
        add_card(con, 200, 100, 5)
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200)
        item = F.feed_items(con, DECKS, "jp")[0]
        self.assertEqual((item["noteType"], item["fields"]), ("", {}))
```

- [ ] **Step 3: Run the tests to check they fail**

Run: `cd publisher && python -m unittest tests.test_feed -v`
Expected: FAIL/ERROR (`clean_rich`, `note_fields`, `notetype_names` don't exist).

- [ ] **Step 4: Implement the reader helpers**

Append to `publisher/anki_reader.py`:

```python
def notetype_names(con):
    """Note type id -> name."""
    return {int(ntid): name for ntid, name in con.execute("SELECT id, name FROM notetypes")}


def field_names(con):
    """Note type id -> its field names in order. Ordered by integers only:
    Anki's text columns use a collation plain sqlite3 doesn't have."""
    out = {}
    for ntid, _ord, name in con.execute("SELECT ntid, ord, name FROM fields ORDER BY ntid, ord"):
        out.setdefault(int(ntid), []).append(name)
    return out
```

- [ ] **Step 5: Implement the field extraction in `feed.py`**

At the top, add `import anki_reader`. After `MAX_LEN = 120`, add:

```python
MAX_FIELD_LEN = 200
MAX_FIELDS = 30

_BOLD_OPEN = re.compile(r"<b>", re.I)
_BOLD_CLOSE = re.compile(r"</b>", re.I)
# Private-use characters stand in for <b> while every other tag is stripped.
_OPEN_MARK, _CLOSE_MARK = "", ""
```

After `clean_field`, add:

```python
def clean_rich(s):
    """Like clean_field, but <b> survives so the dashboard can bold the word in its sentence."""
    if not s:
        return ""
    s = _BOLD_CLOSE.sub(_CLOSE_MARK, _BOLD_OPEN.sub(_OPEN_MARK, s))
    return clean_field(s).replace(_OPEN_MARK, "<b>").replace(_CLOSE_MARK, "</b>")


def note_fields(flds, names):
    """A note's non-empty fields by name, cleaned and capped. Audio- and
    image-only fields clean down to nothing, so they drop out here."""
    out = {}
    for name, raw in zip(names, (flds or "").split(SEP)):
        value = clean_rich(raw)[:MAX_FIELD_LEN]
        if not _BOLD_CLOSE.sub("", _BOLD_OPEN.sub("", value)).strip():
            continue
        out[name] = value
        if len(out) >= MAX_FIELDS:
            break
    return out
```

In `feed_items`, add `n.mid` to the SELECT and load the names once:

```python
    ntnames = anki_reader.notetype_names(con)
    fnames = anki_reader.field_names(con)
    query = (
        "SELECT r.id, r.cid, r.ease, c.ivl, c.did, n.mid, n.flds FROM revlog r "
        "JOIN cards c ON c.id = r.cid JOIN notes n ON n.id = c.nid "
        "WHERE r.type IN %s ORDER BY r.id DESC" % REAL_TYPES)
    seen = set()
    out = []
    for rid, cid, ease, ivl, did, mid, flds in con.execute(query):
```

Then extend the appended dict with:

```python
                    "noteType": ntnames.get(mid, ""),
                    "fields": note_fields(flds, fnames.get(mid, [])),
```

Update the module docstring's first paragraph so it no longer says field extraction is "deliberately generic". It should say that front/back stay as the first two fields for older dashboards, and that named `fields` are sent so the dashboard can pick word/meaning/sentence by name.

- [ ] **Step 6: Update the contract sample**

In `publisher/tests/contract/payload.sample.json`, add to `recentCards[0]` (after `"ts"`):

```json
      "noteType": "Japanese Vocab Dynamic",
      "fields": {
        "Expression": "話しかける",
        "Meaning": "to speak to, to address",
        "Sentence": "友達に<b>話しかける</b>。",
        "Sentence-English": "I speak to a friend."
      }
```

In `publisher/tests/test_publish.py`, make `_seeded()` create a note type so the contract comparison sees real keys. Add `add_notetype` to the import, and before `add_note(...)`:

```python
    add_notetype(con, 1, "Japanese Vocab Dynamic", ["Expression", "Meaning"])
```

- [ ] **Step 7: Run all publisher tests**

Run: `cd publisher && python -m unittest discover -s tests -t .`
Expected: all pass. (The `test_payload_has_every_contract_key` key list is top-level only and unchanged in this task.)

- [ ] **Step 8: Check the web ingest still accepts the sample**

Run: `cd web && npx vitest run app/api/__tests__/ingest.test.ts`
Expected: PASS (unknown item keys are ignored by the current validator).

- [ ] **Step 9: Commit**

```bash
git add publisher
git commit -m "Send each feed card's fields by name, keeping bold"
```

---

### Task 2: Publisher — note types and the word index

**Files:**
- Create: `publisher/words.py`
- Create: `publisher/tests/test_words.py`
- Create: `publisher/tests/contract/normalize.cases.json`
- Modify: `publisher/publish.py` (`build_payload`, imports)
- Modify: `publisher/tests/test_publish.py`
- Modify: `publisher/tests/contract/payload.sample.json`

**Interfaces:**
- Consumes: `anki_reader.notetype_names`, `anki_reader.field_names`, `feed.clean_rich` (Task 1).
- Produces:
  - `words.normalize_word(s) -> str`
  - `words.note_types(con) -> dict[str, list[str]]`
  - `words.word_index(con) -> {"known": [...], "learning": [...], "new": [...]}` (each list sorted)
  - `words.words_hash(index) -> str` (hex sha256)
  - `words.MAX_WORDS = 50000`
  - `build_payload` output gains `"noteTypes"` and `"words"`.

- [ ] **Step 1: Write the shared normalization cases**

Create `publisher/tests/contract/normalize.cases.json`:

```json
[
  ["<b>近</b>く", "近く"],
  ["<B>近く</B>", "近く"],
  ["近[ちか]く", "近く"],
  ["私[わたし]の 家[いえ]", "私の家"],
  [" 金曜日　", "金曜日"],
  ["きんようび", "きんようび"]
]
```

- [ ] **Step 2: Write the failing tests**

Create `publisher/tests/test_words.py`:

```python
import json, os, tempfile, unittest
from tests.fixtures import build_db, add_deck, add_note, add_card, add_notetype
import words as W

CASES = os.path.join(os.path.dirname(__file__), "contract", "normalize.cases.json")
VOCAB = ["Expression", "Meaning", "Reading", "Sentence"]


def _con():
    con = build_db(os.path.join(tempfile.mkdtemp(), "c.anki2"))
    add_deck(con, 5, "Core")
    add_notetype(con, 7, "Japanese Vocab Dynamic", VOCAB)
    return con


class TestNormalizeWord(unittest.TestCase):
    def test_matches_the_shared_cases(self):
        # The dashboard's normalizeWord runs the same file. Both must agree.
        with open(CASES, encoding="utf-8") as fh:
            for raw, expected in json.load(fh):
                self.assertEqual(W.normalize_word(raw), expected, raw)


class TestWordIndex(unittest.TestCase):
    def test_indexes_word_kana_and_furigana_but_not_sentences(self):
        con = _con()
        add_note(con, 1, 7, ["近く", "vicinity", "近[ちか]く",
                             "私の家は駅の<b>近く</b>です。とても便利。"])
        add_card(con, 10, 1, 5, ctype=2, queue=2, ivl=30)
        idx = W.word_index(con)
        self.assertEqual(idx["known"], ["近く"])
        self.assertEqual((idx["learning"], idx["new"]), ([], []))

    def test_skips_fields_without_japanese(self):
        con = _con()
        add_note(con, 1, 7, ["5261", "Friday", "きんようび", ""])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        self.assertEqual(W.word_index(con)["new"], ["きんようび"])

    def test_status_is_the_best_of_the_notes_cards(self):
        con = _con()
        add_note(con, 1, 7, ["話す", "", "", ""])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        add_card(con, 11, 1, 5, ctype=2, queue=2, ivl=5, ord_=1)
        self.assertEqual(W.word_index(con)["learning"], ["話す"])

    def test_mature_means_twenty_one_days(self):
        con = _con()
        add_note(con, 1, 7, ["話す", "", "", ""])
        add_card(con, 10, 1, 5, ctype=2, queue=2, ivl=20)
        add_note(con, 2, 7, ["聞く", "", "", ""])
        add_card(con, 11, 2, 5, ctype=2, queue=2, ivl=21)
        idx = W.word_index(con)
        self.assertEqual((idx["learning"], idx["known"]), (["話す"], ["聞く"]))

    def test_suspended_cards_are_ignored_but_buried_ones_count(self):
        con = _con()
        add_note(con, 1, 7, ["話す", "", "", ""])
        add_card(con, 10, 1, 5, ctype=2, queue=-1, ivl=30)
        add_note(con, 2, 7, ["聞く", "", "", ""])
        add_card(con, 11, 2, 5, ctype=2, queue=-3, ivl=30)
        idx = W.word_index(con)
        self.assertEqual(idx["known"], ["聞く"])
        self.assertNotIn("話す", idx["learning"] + idx["new"])

    def test_a_word_in_two_notes_keeps_its_best_status_once(self):
        con = _con()
        add_note(con, 1, 7, ["話す", "", "", ""])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        add_note(con, 2, 7, ["話す", "", "", ""])
        add_card(con, 11, 2, 5, ctype=2, queue=2, ivl=40)
        idx = W.word_index(con)
        self.assertEqual((idx["known"], idx["new"]), (["話す"], []))

    def test_caps_the_index_keeping_known_words_first(self):
        con = _con()
        add_note(con, 1, 7, ["話す", "", "", ""])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        add_note(con, 2, 7, ["聞く", "", "", ""])
        add_card(con, 11, 2, 5, ctype=2, queue=2, ivl=40)
        old = W.MAX_WORDS
        W.MAX_WORDS = 1
        try:
            idx = W.word_index(con)
        finally:
            W.MAX_WORDS = old
        self.assertEqual(idx, {"known": ["聞く"], "learning": [], "new": []})


class TestNoteTypes(unittest.TestCase):
    def test_lists_types_that_have_an_unsuspended_card(self):
        con = _con()
        add_notetype(con, 8, "Unused", ["Front", "Back"])
        add_notetype(con, 9, "All suspended", ["Front", "Back"])
        add_note(con, 1, 7, ["話す", "", "", ""])
        add_card(con, 10, 1, 5)
        add_note(con, 2, 9, ["聞く", ""])
        add_card(con, 11, 2, 5, queue=-1)
        self.assertEqual(W.note_types(con), {"Japanese Vocab Dynamic": VOCAB})


class TestWordsHash(unittest.TestCase):
    def test_same_index_same_hash_and_any_change_differs(self):
        a = {"known": ["話す"], "learning": [], "new": []}
        b = {"known": ["話す"], "learning": [], "new": ["聞く"]}
        self.assertEqual(W.words_hash(a), W.words_hash(dict(a)))
        self.assertNotEqual(W.words_hash(a), W.words_hash(b))
```

Add to `publisher/tests/test_publish.py`'s `TestBuildPayload`:

```python
    def test_payload_carries_note_types_and_the_word_index(self):
        payload = P.build_payload(_seeded(), "jp", "JP", "UTC", 4)
        self.assertEqual(payload["noteTypes"], {"Japanese Vocab Dynamic": ["Expression", "Meaning"]})
        self.assertEqual(payload["words"]["known"], ["話す"])
```

Update `test_payload_has_every_contract_key`'s expected list to:

```python
            ["allTime", "days", "displayName", "generatedAt", "noteTypes", "recentCards",
             "streak", "todayKey", "tz", "user", "words"])
```

- [ ] **Step 3: Run the tests to check they fail**

Run: `cd publisher && python -m unittest tests.test_words tests.test_publish -v`
Expected: ERROR (`No module named 'words'`) and FAIL on the payload keys.

- [ ] **Step 4: Implement `publisher/words.py`**

```python
"""What's in this collection, for the dashboard's "is it in my deck?" badge.

The index doesn't know which field is the word: it takes every short field
with Japanese in it (the word, its kana, its furigana form) and leaves
sentences out by length. The dashboard maps fields separately, so a mapping
fix never needs a new index.
"""
import hashlib
import json
import re

import anki_reader
from feed import SEP, clean_rich

MAX_WORD_LEN = 20
MAX_WORDS = 50000
MAX_NOTE_TYPES = 50
MAX_FIELD_NAMES = 50

_BOLD = re.compile(r"</?b>", re.I)
_FURIGANA = re.compile(r"\[[^\]]*\]")
_JAPANESE = re.compile(r"[぀-ヿ㐀-䶿一-鿿]")

# Best first. Must match the dashboard's DeckStatus.
_RANKS = ("known", "learning", "new")


def normalize_word(s):
    """Must match normalizeWord in web/lib/fields.ts (see normalize.cases.json)."""
    s = _FURIGANA.sub("", _BOLD.sub("", s or ""))
    return "".join(s.split())


def _status(ctype, ivl):
    if ctype == 2 and (ivl or 0) >= 21:
        return 0
    if ctype in (1, 2, 3):
        return 1
    return 2


def _live_notes(con):
    """(note id, note type id, flds, best status rank) for notes with an unsuspended card."""
    best = {}
    for nid, mid, flds, ctype, ivl in con.execute(
            "SELECT n.id, n.mid, n.flds, c.type, c.ivl FROM cards c "
            "JOIN notes n ON n.id = c.nid WHERE c.queue != -1"):
        rank = _status(ctype, ivl)
        cur = best.get(nid)
        if cur is None or rank < cur[2]:
            best[nid] = (mid, flds, rank)
    return best


def note_types(con):
    """Note type name -> field names, for types with at least one unsuspended card."""
    names = anki_reader.notetype_names(con)
    fields = anki_reader.field_names(con)
    mids = sorted({mid for mid, _flds, _rank in _live_notes(con).values()})
    out = {}
    for mid in mids[:MAX_NOTE_TYPES]:
        if mid in names:
            out[names[mid]] = fields.get(mid, [])[:MAX_FIELD_NAMES]
    return out


def word_index(con):
    words = {}
    for _mid, flds, rank in _live_notes(con).values():
        for raw in (flds or "").split(SEP):
            word = normalize_word(clean_rich(raw))
            if not (0 < len(word) <= MAX_WORD_LEN) or not _JAPANESE.search(word):
                continue
            if word not in words or rank < words[word]:
                words[word] = rank
    out = {name: [] for name in _RANKS}
    kept = sorted(words.items(), key=lambda kv: (kv[1], kv[0]))[:MAX_WORDS]
    for word, rank in kept:
        out[_RANKS[rank]].append(word)
    return out


def words_hash(index):
    return hashlib.sha256(
        json.dumps(index, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
```

- [ ] **Step 5: Add the keys to `build_payload`**

In `publisher/publish.py`, add `import words as words_mod` next to the other module imports. In `build_payload`'s returned dict, after `"recentCards"`, add:

```python
        "noteTypes": words_mod.note_types(con),
        "words": words_mod.word_index(con),
```

- [ ] **Step 6: Update the contract sample**

Add these top-level keys to `publisher/tests/contract/payload.sample.json`, after `"recentCards"`:

```json
  "noteTypes": {
    "Japanese Vocab Dynamic": ["Expression", "Meaning", "Reading", "Audio", "Sentence", "Sentence-English"]
  },
  "words": { "known": ["話しかける"], "learning": ["聞き取る"], "new": ["作り上げる"] }
```

- [ ] **Step 7: Run all publisher tests**

Run: `cd publisher && python -m unittest discover -s tests -t .`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add publisher
git commit -m "Send note types and an index of the words in each collection"
```

---

### Task 3: Publisher — send the index only when it changed, and a useful dry run

**Files:**
- Modify: `publisher/publish.py` (`main`, and a new `without_unchanged_words`, `summary`)
- Modify: `publisher/tests/test_publish.py`

**Interfaces:**
- Consumes: `words.words_hash` (Task 2).
- Produces:
  - `publish.without_unchanged_words(payload, last_hash) -> (payload, hash)`
  - `publish.summary(payload) -> str`
  - `state.json` gains a `"wordsHash"` key.

- [ ] **Step 1: Write the failing tests**

Append to `publisher/tests/test_publish.py`:

```python
class TestWordsHashSkip(unittest.TestCase):
    def test_drops_the_index_when_the_server_already_has_it(self):
        payload = {"user": "jp", "words": {"known": ["話す"], "learning": [], "new": []}}
        _, h = P.without_unchanged_words(payload, None)
        sent, h2 = P.without_unchanged_words(payload, h)
        self.assertNotIn("words", sent)
        self.assertEqual(h, h2)
        self.assertIn("words", payload)  # the original is left alone

    def test_sends_the_index_when_it_changed(self):
        payload = {"user": "jp", "words": {"known": ["話す"], "learning": [], "new": []}}
        sent, _ = P.without_unchanged_words(payload, "stale")
        self.assertIn("words", sent)


class TestMainState(unittest.TestCase):
    def _setup(self):
        tmp = tempfile.mkdtemp()
        src = os.path.join(tmp, "collection.anki2")
        con = build_db(src)
        set_config(con, "rollover", 4)
        add_deck(con, 5, "Core")
        add_notetype(con, 1, "Japanese Vocab Dynamic", ["Expression", "Meaning"])
        add_note(con, 100, 1, ["話す", "to speak"])
        add_card(con, 200, 100, 5, ivl=21)
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200)
        con.close()
        cfg = os.path.join(tmp, "config.json")
        with open(cfg, "w", encoding="utf-8") as fh:
            json.dump({"user": "jp", "displayName": "JP", "endpoint": "https://x.test",
                       "token": "t", "collection": src}, fh)
        return cfg, os.path.join(tmp, "state.json")

    def test_second_publish_leaves_out_an_unchanged_index(self):
        cfg, state = self._setup()
        sent = []
        with mock.patch.object(P, "STATE_FILE", state), \
             mock.patch.object(P, "post_payload", lambda e, t, p: sent.append(p) or {}), \
             mock.patch.object(P.sys, "stdout", io.StringIO()):
            self.assertEqual(P.main(["--config", cfg]), 0)
            self.assertEqual(P.main(["--config", cfg]), 0)
        self.assertIn("words", sent[0])
        self.assertNotIn("words", sent[1])
        self.assertIn("wordsHash", P.read_state(state))

    def test_a_failed_send_does_not_record_the_hash(self):
        cfg, state = self._setup()

        def fail(*_a):
            raise OSError("offline")

        with mock.patch.object(P, "STATE_FILE", state), \
             mock.patch.object(P, "post_payload", fail), \
             mock.patch.object(P.sys, "stderr", io.StringIO()):
            self.assertEqual(P.main(["--config", cfg]), 4)
        self.assertNotIn("wordsHash", P.read_state(state))

    def test_dry_run_prints_sizes_and_note_types_without_posting(self):
        cfg, state = self._setup()
        out = io.StringIO()
        with mock.patch.object(P, "STATE_FILE", state), \
             mock.patch.object(P, "post_payload", mock.Mock(side_effect=AssertionError)), \
             mock.patch.object(P.sys, "stdout", out):
            self.assertEqual(P.main(["--config", cfg, "--dry-run"]), 0)
        text = out.getvalue()
        self.assertIn("Japanese Vocab Dynamic: Expression, Meaning", text)
        self.assertIn("words: 1 known, 0 learning, 0 new", text)
        self.assertIn("payload:", text)
        self.assertEqual(P.read_state(state), {})
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `cd publisher && python -m unittest tests.test_publish -v`
Expected: ERROR (`without_unchanged_words` doesn't exist) and FAIL on the state and dry-run tests.

- [ ] **Step 3: Implement**

In `publisher/publish.py`, add after `post_payload`:

```python
def without_unchanged_words(payload, last_hash):
    """The payload to send, and the index's hash. The word index is the bulk of
    a publish and rarely changes, so it's left out when the server already has it."""
    h = words_mod.words_hash(payload["words"])
    if h == last_hash:
        payload = {k: v for k, v in payload.items() if k != "words"}
    return payload, h


def summary(payload):
    """What --dry-run prints: sizes and field names, not the whole payload."""
    w = payload["words"]
    lines = ["payload: %d KB, %d feed cards" % (
        len(json.dumps(payload, ensure_ascii=False).encode("utf-8")) // 1024,
        len(payload["recentCards"]))]
    lines.append("words: %d known, %d learning, %d new"
                 % (len(w["known"]), len(w["learning"]), len(w["new"])))
    for name, fields in payload["noteTypes"].items():
        lines.append("%s: %s" % (name, ", ".join(fields)))
    return "\n".join(lines)
```

In `main`, read state for every run (not only `--on-change`). Replace:

```python
    mtime = None
    state = {}
    if args.on_change:
```

with:

```python
    mtime = None
    state = read_state(STATE_FILE)
    if args.on_change:
```

Inside the `if args.on_change:` block, delete the line `state = read_state()`.

Replace the dry-run block:

```python
    if args.dry_run:
        print(summary(payload))
        return 0

    sent, words_hash = without_unchanged_words(payload, state.get("wordsHash"))
```

Change `post_payload(cfg["endpoint"], cfg["token"], payload)` to `post_payload(cfg["endpoint"], cfg["token"], sent)`.

Replace the success state write:

```python
    if args.on_change and mtime is not None:
        write_state(STATE_FILE, {"lastMtime": mtime, "lastPublishAt": time.time()})
```

with:

```python
    new_state = {k: v for k, v in state.items() if k != "lastFailAt"}
    new_state["wordsHash"] = words_hash
    if args.on_change and mtime is not None:
        new_state.update(lastMtime=mtime, lastPublishAt=time.time())
    write_state(STATE_FILE, new_state)
```

The module docstring says "no local state file". Change that sentence to say every run sends the whole history, and that `state.json` only records when to publish and which word index the server already has.

- [ ] **Step 4: Run all publisher tests**

Run: `cd publisher && python -m unittest discover -s tests -t .`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add publisher
git commit -m "Send the word index only when it changes, and summarise a dry run"
```

---

### Task 4: Web — types and `lib/fields.ts`

**Files:**
- Modify: `web/lib/types.ts`
- Create: `web/lib/fields.ts`
- Create: `web/lib/__tests__/fields.test.ts`

**Interfaces:**
- Produces (types.ts):
  - `DeckStatus = "known" | "learning" | "new"`
  - `WordIndex = Record<DeckStatus, string[]>`
  - `FieldRole = "word" | "meaning" | "sentence"`
  - `FieldMap = Partial<Record<FieldRole, string>>`
  - `FieldMaps = Record<string, FieldMap>` (note type → map)
  - `FeedItem.noteType?: string`, `FeedItem.fields?: Record<string, string>`
  - `IngestBody.noteTypes?: Record<string, string[]>`, `IngestBody.words?: WordIndex`
  - `CrewResponse.fieldMaps?: Record<string, FieldMaps>` (user → maps), `CrewResponse.noteTypes?: Record<string, string[]>`, `CrewResponse.inMyDeck?: Record<string, DeckStatus | "none">`
- Produces (fields.ts):
  - `ROLES: FieldRole[]`
  - `guessMapping(names: string[]): Guess` where `Guess = { word: string | null; meaning: string | null; sentence: string | null; translation: string | null }`
  - `resolveCard(item: FeedItem, override?: FieldMap): Resolved` where `Resolved = { word: string; meaning: string; sentence?: string; translation?: string }`
  - `normalizeWord(s: string): string`
  - `boldParts(s: string): { text: string; bold: boolean }[]`
  - `plainText(s: string): string`
  - `deckWord(item: FeedItem, override?: FieldMap): string | null` (the normalized word to look up, or null for no badge)

- [ ] **Step 1: Add the types**

In `web/lib/types.ts`, add to `FeedItem` (after `ts`):

```ts
  /** From publishers that send named fields. Absent on older items. */
  noteType?: string;
  fields?: Record<string, string>;   // may contain <b>…</b>, nothing else
```

Add to `IngestBody` (after `recentCards`):

```ts
  noteTypes?: Record<string, string[]>;
  /** Left out when unchanged since the last publish. */
  words?: WordIndex;
```

Add near the top, after `DayRow`:

```ts
export type DeckStatus = "known" | "learning" | "new";
export type WordIndex = Record<DeckStatus, string[]>;
export type FieldRole = "word" | "meaning" | "sentence";
/** One person's choices for one note type. Only overridden roles are present. */
export type FieldMap = Partial<Record<FieldRole, string>>;
/** Note type name -> choices. */
export type FieldMaps = Record<string, FieldMap>;
```

Add to `CrewResponse`:

```ts
  /** Everyone's field overrides, by user id. */
  fieldMaps?: Record<string, FieldMaps>;
  /** The viewer's own note types and their field names. */
  noteTypes?: Record<string, string[]>;
  /** Friends' cards only: is that word in the viewer's decks. */
  inMyDeck?: Record<string, DeckStatus | "none">;
```

- [ ] **Step 2: Write the failing tests**

Create `web/lib/__tests__/fields.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { boldParts, deckWord, guessMapping, normalizeWord, plainText, resolveCard } from "@/lib/fields";
import type { FeedItem } from "@/lib/types";

const CASES = path.resolve(process.cwd(), "../publisher/tests/contract/normalize.cases.json");

const VOCAB_DYNAMIC = ["Expression", "Meaning", "Reading", "Audio", "Sentence", "Sentence-Kana",
  "Sentence-English", "Sentence Audio", "Image_URI"];
const IKNOW = ["Expression", "Meaning", "Reading", "Audio", "Image_URI"];
const CORE_75658 = ["Vocabulary-Kanji", "Vocabulary-Furigana", "Vocabulary-Kana", "Vocabulary-English",
  "Vocabulary-Audio", "Vocabulary-Pos", "Caution", "Expression", "Reading", "Sentence-Kana",
  "Sentence-English", "Sentence-Clozed", "Sentence-Audio", "Sentence-Image", "Notes", "Core-Index",
  "Optimized-Voc-Index", "Optimized-Sent-Index"];
// Adam's layout: the index number comes first.
const CORE_INDEX_FIRST = ["Core-Index", ...CORE_75658.filter((n) => n !== "Core-Index")];

function item(fields?: Record<string, string>, over: Partial<FeedItem> = {}): FeedItem {
  return { id: "adam:1", user: "adam", front: "5493", back: "作り上げる", deck: "Core",
           ease: 3, ivl: 1, ts: 1, ...(fields ? { noteType: "T", fields } : {}), ...over };
}

describe("guessMapping", () => {
  it.each([
    ["Japanese Vocab Dynamic", VOCAB_DYNAMIC,
      { word: "Expression", meaning: "Meaning", sentence: "Sentence", translation: "Sentence-English" }],
    ["iKnow sentences", IKNOW,
      { word: "Expression", meaning: "Meaning", sentence: null, translation: null }],
    ["Core 2k/6k (75658)", CORE_75658,
      { word: "Vocabulary-Kanji", meaning: "Vocabulary-English", sentence: "Expression", translation: "Sentence-English" }],
    ["Core with the index first", CORE_INDEX_FIRST,
      { word: "Vocabulary-Kanji", meaning: "Vocabulary-English", sentence: "Expression", translation: "Sentence-English" }],
    ["Basic", ["Front", "Back"],
      { word: "Front", meaning: "Back", sentence: null, translation: null }],
  ])("%s", (_name, names, expected) => {
    expect(guessMapping(names)).toEqual(expected);
  });

  it("uses the meaning as the translation when the sentence is Expression and nothing else translates it", () => {
    expect(guessMapping(["Vocab", "Meaning", "Expression"]))
      .toEqual({ word: "Vocab", meaning: "Meaning", sentence: "Expression", translation: "Meaning" });
  });
});

describe("resolveCard", () => {
  it("shows front and back for items from older publishers", () => {
    expect(resolveCard(item())).toEqual({ word: "5493", meaning: "作り上げる" });
    expect(resolveCard(item({}))).toEqual({ word: "5493", meaning: "作り上げる" });
  });

  it("picks word, meaning, sentence and translation by name", () => {
    const r = resolveCard(item({ "Core-Index": "5493", "Vocabulary-Kanji": "作り上げる",
      "Vocabulary-English": "to build up", Expression: "夢を<b>作り上げる</b>。",
      "Sentence-English": "Build a dream." }));
    expect(r).toEqual({ word: "作り上げる", meaning: "to build up",
      sentence: "夢を<b>作り上げる</b>。", translation: "Build a dream." });
  });

  it("lets an override win, role by role", () => {
    const r = resolveCard(item({ A: "作る", B: "to make", C: "作る。" }), { word: "A", meaning: "B", sentence: "C" });
    expect(r).toEqual({ word: "作る", meaning: "to make", sentence: "作る。" });
  });

  it("falls back to the guess when an overridden field is empty on this card", () => {
    const r = resolveCard(item({ Expression: "話す", Meaning: "to speak" }), { word: "Missing" });
    expect(r.word).toBe("話す");
  });

  it("skips an all-digit field when nothing matches by name", () => {
    expect(resolveCard(item({ Num: "5261", Thing: "話す" })).word).toBe("話す");
  });
});

describe("normalizeWord", () => {
  it("matches the publisher on the shared cases", () => {
    const cases: [string, string][] = JSON.parse(fs.readFileSync(CASES, "utf-8"));
    for (const [raw, expected] of cases) expect(normalizeWord(raw)).toBe(expected);
  });
});

describe("boldParts and plainText", () => {
  it("splits on bold tags", () => {
    expect(boldParts("夢を<b>作り上げる</b>。")).toEqual([
      { text: "夢を", bold: false }, { text: "作り上げる", bold: true }, { text: "。", bold: false }]);
  });

  it("drops an unmatched tag instead of showing it", () => {
    expect(boldParts("夢を<b>作り")).toEqual([{ text: "夢を作り", bold: false }]);
  });

  it("never turns other markup into anything but text", () => {
    expect(boldParts("<img src=x onerror=alert(1)>")).toEqual([{ text: "<img src=x onerror=alert(1)>", bold: false }]);
  });

  it("plainText joins the parts", () => {
    expect(plainText("<b>話す</b>")).toBe("話す");
  });
});

describe("deckWord", () => {
  it("is the normalized word", () => {
    expect(deckWord(item({ Expression: "<b>近[ちか]く</b>", Meaning: "near" }))).toBe("近く");
  });

  it("is null for a sentence card, which the index never holds", () => {
    expect(deckWord(item({ Expression: "今日は一人で映画を見ます。とても楽しかった。", Meaning: "…" }))).toBeNull();
  });

  it("is null for items without fields", () => {
    expect(deckWord(item())).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to check they fail**

Run: `cd web && npx vitest run lib/__tests__/fields.test.ts`
Expected: FAIL (cannot resolve `@/lib/fields`).

- [ ] **Step 4: Implement `web/lib/fields.ts`**

```ts
// Which of a card's named fields is the word, the meaning and the sentence.
// Guessed from field names, so a new note type works with no setup; each
// person can override the guess per note type (see CardFields).
import type { FeedItem, FieldMap, FieldRole } from "@/lib/types";

export const ROLES: FieldRole[] = ["word", "meaning", "sentence"];

export type Guess = {
  word: string | null; meaning: string | null; sentence: string | null; translation: string | null;
};
export type Resolved = { word: string; meaning: string; sentence?: string; translation?: string };

// Exact names, lowercase, first match wins.
const WORD = ["vocabulary-kanji", "expression", "word", "vocab", "kanji", "front"];
const MEANING = ["vocabulary-english", "meaning", "english", "definition", "back"];
const NOT_A_SENTENCE = ["kana", "english", "translation", "audio", "clozed", "image", "furigana"];

const vocabish = (n: string) => n.startsWith("vocabulary-") || n === "word" || n === "vocab" || n === "kanji";
const sentenceish = (n: string) => n.includes("sentence") || n.includes("example");

export function guessMapping(names: string[]): Guess {
  const lower = names.map((n) => n.toLowerCase());
  const byName = (candidates: string[]) => {
    for (const c of candidates) {
      const i = lower.indexOf(c);
      if (i >= 0) return names[i];
    }
    return null;
  };
  // With a proper vocab field present, Expression is the example sentence.
  const hasVocab = lower.some(vocabish);
  const word = byName(WORD.filter((c) => !(hasVocab && c === "expression")));
  const meaning = byName(MEANING);
  let sentence: string | null =
    names.find((_, i) => sentenceish(lower[i]) && !NOT_A_SENTENCE.some((s) => lower[i].includes(s))) ?? null;
  let translation: string | null =
    names.find((_, i) => sentenceish(lower[i]) && (lower[i].includes("english") || lower[i].includes("translation"))) ?? null;
  if (!sentence) {
    const i = lower.indexOf("expression");
    if (i >= 0 && names[i] !== word) {
      sentence = names[i];
      translation = translation ?? meaning;
    }
  }
  return { word, meaning, sentence, translation };
}

export function resolveCard(item: FeedItem, override: FieldMap = {}): Resolved {
  const f = item.fields;
  if (!f || Object.keys(f).length === 0) return { word: item.front, meaning: item.back };
  const guess = guessMapping(Object.keys(f));
  const pick = (role: FieldRole) => {
    for (const name of [override[role], guess[role]]) if (name && f[name]) return f[name];
    return undefined;
  };
  const word = pick("word") ?? Object.values(f).find((v) => !/^\d+$/.test(v.trim())) ?? item.front;
  const meaning = pick("meaning") ?? item.back;
  const sentence = pick("sentence");
  const translation = sentence && guess.translation ? f[guess.translation] : undefined;
  return {
    word, meaning,
    ...(sentence ? { sentence } : {}),
    ...(translation ? { translation } : {}),
  };
}

/** Must match normalize_word in publisher/words.py (see normalize.cases.json). */
export function normalizeWord(s: string): string {
  return s.replace(/<\/?b>/gi, "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, "");
}

/**
 * Bold runs as data, for rendering as React text. Nothing here is ever HTML:
 * a stray <b> or </b> is dropped, and any other markup stays literal text.
 */
export function boldParts(s: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const plain = (t: string) => {
    const text = t.replace(/<\/?b>/gi, "");
    if (!text) return;
    const last = out[out.length - 1];
    if (last && !last.bold) last.text += text; else out.push({ text, bold: false });
  };
  const re = /<b>([\s\S]*?)<\/b>/gi;
  let at = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    plain(s.slice(at, m.index));
    if (m[1]) out.push({ text: m[1], bold: true });
    at = re.lastIndex;
  }
  plain(s.slice(at));
  return out;
}

export function plainText(s: string): string {
  return boldParts(s).map((p) => p.text).join("");
}

/** Mirrors the publisher's index: no badge for anything it would never hold. */
const MAX_WORD_LEN = 20;

export function deckWord(item: FeedItem, override?: FieldMap): string | null {
  if (!item.fields || Object.keys(item.fields).length === 0) return null;
  const word = normalizeWord(resolveCard(item, override).word);
  return word.length > 0 && word.length <= MAX_WORD_LEN ? word : null;
}
```

- [ ] **Step 5: Run the tests and the type check**

Run: `cd web && npx vitest run lib/__tests__/fields.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/lib/types.ts web/lib/fields.ts web/lib/__tests__/fields.test.ts
git commit -m "Guess each card's word, meaning and sentence from its field names"
```

---

### Task 5: Web — ingest accepts and checks the new keys

**Files:**
- Modify: `web/app/api/ingest/route.ts`
- Modify: `web/app/api/__tests__/ingest.test.ts`

**Interfaces:**
- Consumes: the `IngestBody` types (Task 4).
- Produces: exported limits `MAX_FIELDS = 30`, `MAX_FIELD_CHARS = 200`, `MAX_NOTE_TYPES = 50`, `MAX_FIELD_NAMES = 50`, `MAX_WORDS = 50000`, `MAX_WORD_CHARS = 20`.

- [ ] **Step 1: Write the failing tests**

Append inside the `describe("POST /api/ingest", …)` block in `web/app/api/__tests__/ingest.test.ts`:

```ts
  it("accepts a payload from an older publisher with none of the new keys", async () => {
    const payload = contract();
    delete payload.noteTypes; delete payload.words;
    delete payload.recentCards[0].noteType; delete payload.recentCards[0].fields;
    expect((await POST(req(payload))).status).toBe(200);
  });

  it("accepts a publish that left out an unchanged word index", async () => {
    const payload = contract();
    delete payload.words;
    expect((await POST(req(payload))).status).toBe(200);
  });

  it.each([
    ["fields that aren't strings", (p: any) => { p.recentCards[0].fields = { A: 5 }; }],
    ["too many fields", (p: any) => {
      p.recentCards[0].fields = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`F${i}`, "x"])); }],
    ["a field over 200 characters", (p: any) => { p.recentCards[0].fields = { A: "x".repeat(201) }; }],
    ["a note type name that isn't a string", (p: any) => { p.recentCards[0].noteType = 7; }],
    ["noteTypes that aren't lists of names", (p: any) => { p.noteTypes = { T: "Expression" }; }],
    ["too many note types", (p: any) => {
      p.noteTypes = Object.fromEntries(Array.from({ length: 51 }, (_, i) => [`T${i}`, []])); }],
    ["a word list missing a status", (p: any) => { p.words = { known: [], learning: [] }; }],
    ["a word over 20 characters", (p: any) => { p.words.new = ["あ".repeat(21)]; }],
    ["too many words", (p: any) => { p.words.new = Array.from({ length: 50001 }, (_, i) => `w${i}`); }],
  ])("rejects %s", async (_name, mangle) => {
    const payload = contract();
    mangle(payload);
    expect((await POST(req(payload))).status).toBe(400);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `cd web && npx vitest run app/api/__tests__/ingest.test.ts`
Expected: the "rejects …" cases FAIL (they currently return 200).

- [ ] **Step 3: Implement**

In `web/app/api/ingest/route.ts`, after `MAX_RECENT_CARDS`, add:

```ts
// Caps for the named-fields release. The publisher trims to these itself, so
// hitting one means a bug or a forged payload, not a big collection.
export const MAX_FIELDS = 30;
export const MAX_FIELD_CHARS = 200;
export const MAX_NOTE_TYPES = 50;
export const MAX_FIELD_NAMES = 50;
export const MAX_WORDS = 50000;
export const MAX_WORD_CHARS = 20;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function looksLikeFields(v: unknown): boolean {
  if (!isRecord(v)) return false;
  const entries = Object.entries(v);
  return entries.length <= MAX_FIELDS
    && entries.every(([, s]) => typeof s === "string" && s.length <= MAX_FIELD_CHARS);
}

function looksLikeNoteTypes(v: unknown): boolean {
  if (!isRecord(v)) return false;
  const entries = Object.entries(v);
  return entries.length <= MAX_NOTE_TYPES && entries.every(([, names]) =>
    Array.isArray(names) && names.length <= MAX_FIELD_NAMES && names.every((n) => typeof n === "string"));
}

function looksLikeWords(v: unknown): boolean {
  if (!isRecord(v)) return false;
  const lists = (["known", "learning", "new"] as const).map((k) => v[k]);
  if (!lists.every(Array.isArray)) return false;
  const all = (lists as unknown[][]).flat();
  return all.length <= MAX_WORDS
    && all.every((w) => typeof w === "string" && w.length > 0 && w.length <= MAX_WORD_CHARS);
}
```

In `looksLikeFeedItem`, change the return to:

```ts
  return typeof c.id === "string" && typeof c.front === "string"
    && typeof c.ts === "number"
    && (c.noteType === undefined || (typeof c.noteType === "string" && c.noteType.length <= 100))
    && (c.fields === undefined || looksLikeFields(c.fields));
```

In `looksLikeIngestBody`, append to the returned expression:

```ts
    && (b.noteTypes === undefined || looksLikeNoteTypes(b.noteTypes))
    && (b.words === undefined || looksLikeWords(b.words));
```

- [ ] **Step 4: Run the tests**

Run: `cd web && npx vitest run app/api/__tests__/ingest.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/app/api/ingest/route.ts web/app/api/__tests__/ingest.test.ts
git commit -m "Accept and check named fields, note types and the word index on ingest"
```

---

### Task 6: Web — store note types, the word index and field maps; prefer fielded feed items

**Files:**
- Modify: `web/lib/store.ts`
- Modify: `web/lib/__tests__/store.test.ts`

**Interfaces:**
- Consumes: the types from Task 4.
- Produces:
  - `getNoteTypes(id: string): Promise<Record<string, string[]>>` (`{}` if none)
  - `getWordStatuses(id: string, words: string[]): Promise<Record<string, DeckStatus> | null>` (null means no index at all)
  - `getFieldMaps(id: string): Promise<FieldMaps>` (`{}` if none)
  - `setFieldMap(id: string, noteType: string, map: FieldMap): Promise<FieldMaps>` (an empty map removes that note type)
  - `saveSnapshot` stores `noteTypes` and `words` when present.
  - `getFeed` prefers, for one id, the stored copy that has `fields`.

- [ ] **Step 1: Extend the in-memory Redis mock**

In `web/lib/__tests__/store.test.ts`, add these methods inside the mocked `Redis` class (after `lrange`):

```ts
    async del(key: string) { state.hashes.delete(key); state.strings.delete(key); }
    async exists(key: string) { return state.hashes.has(key) || state.strings.has(key) ? 1 : 0; }
    async hmget(key: string, ...fields: string[]) {
      const h = state.hashes.get(key);
      if (!h) return null;
      return Object.fromEntries(fields.map((f) => [f, h.get(f) ?? null]));
    }
    multi() {
      const ops: (() => Promise<unknown>)[] = [];
      const tx = {
        del: (k: string) => { ops.push(() => this.del(k)); return tx; },
        hset: (k: string, e: Record<string, string>) => { ops.push(() => this.hset(k, e)); return tx; },
        exec: async () => { for (const op of ops) await op(); return []; },
      };
      return tx;
    }
```

Add `getNoteTypes, getWordStatuses, getFieldMaps, setFieldMap` to the import from `@/lib/store`.

- [ ] **Step 2: Write the failing tests**

Append inside `describe("store", …)`:

```ts
  it("keeps note types and replaces the word index wholesale", async () => {
    await saveSnapshot(body({ noteTypes: { T: ["Expression", "Meaning"] },
      words: { known: ["話す"], learning: ["聞く"], new: [] } }));
    expect(await getNoteTypes("jp")).toEqual({ T: ["Expression", "Meaning"] });
    expect(await getWordStatuses("jp", ["話す", "聞く", "見る"])).toEqual({ 話す: "known", 聞く: "learning" });

    await saveSnapshot(body({ words: { known: [], learning: [], new: ["見る"] } }));
    expect(await getWordStatuses("jp", ["話す", "見る"])).toEqual({ 見る: "new" });
  });

  it("leaves the word index alone when a publish leaves it out", async () => {
    await saveSnapshot(body({ words: { known: ["話す"], learning: [], new: [] } }));
    await saveSnapshot(body());
    expect(await getWordStatuses("jp", ["話す"])).toEqual({ 話す: "known" });
  });

  it("tells no index apart from no matches", async () => {
    expect(await getWordStatuses("jp", ["話す"])).toBeNull();
    await saveSnapshot(body({ words: { known: [], learning: [], new: [] } }));
    // An empty index is still no index: nothing to compare against.
    expect(await getWordStatuses("jp", ["話す"])).toBeNull();
    await saveSnapshot(body({ words: { known: ["聞く"], learning: [], new: [] } }));
    expect(await getWordStatuses("jp", ["話す"])).toEqual({});
  });

  it("saves, merges and resets field maps per note type", async () => {
    expect(await getFieldMaps("jp")).toEqual({});
    await setFieldMap("jp", "A", { word: "Front" });
    expect(await setFieldMap("jp", "B", { meaning: "Back" })).toEqual({ A: { word: "Front" }, B: { meaning: "Back" } });
    expect(await setFieldMap("jp", "A", {})).toEqual({ B: { meaning: "Back" } });
  });

  it("keeps the copy of a card that has fields over an older copy without", async () => {
    // Both are stored under one id and score after someone updates their publisher.
    const bare = card("jp:1", 100);
    const fielded = { ...bare, noteType: "T", fields: { Expression: "話す" } };
    await saveSnapshot(body({ recentCards: [bare] }));
    await saveSnapshot(body({ recentCards: [fielded] }));
    expect((await getFeed()).find((i) => i.id === "jp:1")?.fields).toEqual({ Expression: "話す" });
  });
```

- [ ] **Step 3: Run the tests to check they fail**

Run: `cd web && npx vitest run lib/__tests__/store.test.ts`
Expected: FAIL (the functions aren't exported, and the dedupe test gets `undefined`).

- [ ] **Step 4: Implement**

In `web/lib/store.ts`, extend the type import with `DeckStatus, FieldMap, FieldMaps`. After `seenKey`, add:

```ts
const noteTypesKey = (id: string) => `user:${id}:notetypes`;
const wordsKey = (id: string) => `user:${id}:words`;
const fieldMapKey = (id: string) => `user:${id}:fieldmap`;
```

At the end of `saveSnapshot` (after the feed block), add:

```ts
  if (body.noteTypes) await redis.set(noteTypesKey(id), JSON.stringify(body.noteTypes));

  // Replaced in one transaction so a lookup never sees half an old index.
  // Left alone when the publisher skipped an unchanged one.
  if (body.words) {
    const entries: Record<string, DeckStatus> = {};
    // Best status last, so it wins if a word somehow appears twice.
    for (const status of ["new", "learning", "known"] as const) {
      for (const w of body.words[status]) entries[w] = status;
    }
    const tx = redis.multi();
    tx.del(wordsKey(id));
    if (Object.keys(entries).length > 0) tx.hset(wordsKey(id), entries);
    await tx.exec();
  }
```

In `getFeed`, replace the dedupe loop body so a fielded copy beats a bare one:

```ts
  for (const r of raw) {
    const item = parse<FeedItem>(r);
    const kept = byId.get(item.id);
    // After a publisher update the same card is stored twice, once with named
    // fields. The richer copy wins whatever order Redis returns them in.
    if (!kept || (!kept.fields && item.fields)) byId.set(item.id, item);
  }
```

Update the comment above that loop to mention this second reason for duplicates.

Append a new section at the end of the file:

```ts
/* ------------------------------------------------------ fields and words */

export async function getNoteTypes(id: string): Promise<Record<string, string[]>> {
  const raw = await redis.get(noteTypesKey(id));
  return raw ? parse<Record<string, string[]>>(raw) : {};
}

/**
 * Which of `words` are in this person's decks, and at what stage. Null when
 * they have no index at all (not updated yet), so the caller can show no
 * badge rather than "not in your deck" everywhere.
 */
export async function getWordStatuses(id: string, words: string[]): Promise<Record<string, DeckStatus> | null> {
  if ((await redis.exists(wordsKey(id))) === 0) return null;
  if (words.length === 0) return {};
  const got = (await redis.hmget<Record<string, unknown>>(wordsKey(id), ...words)) ?? {};
  const out: Record<string, DeckStatus> = {};
  for (const [w, s] of Object.entries(got)) {
    if (s === "known" || s === "learning" || s === "new") out[w] = s;
  }
  return out;
}

export async function getFieldMaps(id: string): Promise<FieldMaps> {
  const raw = await redis.get(fieldMapKey(id));
  return raw ? parse<FieldMaps>(raw) : {};
}

export async function setFieldMap(id: string, noteType: string, map: FieldMap): Promise<FieldMaps> {
  const all = await getFieldMaps(id);
  if (Object.keys(map).length === 0) delete all[noteType]; else all[noteType] = map;
  await redis.set(fieldMapKey(id), JSON.stringify(all));
  return all;
}
```

- [ ] **Step 5: Run the tests**

Run: `cd web && npx vitest run lib/__tests__/store.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 6: Commit**

```bash
git add web/lib/store.ts web/lib/__tests__/store.test.ts
git commit -m "Store note types, the word index and field choices; prefer cards with fields"
```

---

### Task 7: Web — `inMyDeck` in `/api/crew`, and `POST /api/fieldmap`

**Files:**
- Modify: `web/app/api/crew/route.ts`
- Modify: `web/app/api/__tests__/crew.test.ts`
- Create: `web/app/api/fieldmap/route.ts`
- Modify: `web/app/api/__tests__/engagement.test.ts` (fieldmap tests live with the other write routes)

**Interfaces:**
- Consumes: `deckWord` (Task 4); `getNoteTypes`, `getWordStatuses`, `getFieldMaps`, `setFieldMap` (Task 6); `userForRequest` (`lib/identity`).
- Produces:
  - `/api/crew` JSON gains `fieldMaps`, `noteTypes` and `inMyDeck`.
  - `POST /api/fieldmap?key=…` with body `{ noteType: string, map: FieldMap }` returns `{ ok: true, fieldMaps: FieldMaps }`.

- [ ] **Step 1: Write the failing crew tests**

In `web/app/api/__tests__/crew.test.ts`:

1. Add `FeedItem` to the type import.
2. Make the feed and the new store calls controllable. Replace the `vi.hoisted` block and the `vi.mock("@/lib/store", …)` call with:

```ts
const { getSeen, store } = vi.hoisted(() => ({
  getSeen: vi.fn(async (_id: string) => ({ _floor: 42, "peter:1": 7 })),
  store: {
    feed: [] as FeedItem[],
    fieldMaps: {} as Record<string, Record<string, Record<string, string>>>,
    statuses: null as Record<string, string> | null,
  },
}));

vi.mock("@/lib/store", () => ({
  listUsers: async () => ["jp"],
  getPerson: async (id: string) => (id === "jp" ? person : null),
  getFeed: async () => store.feed,
  getEngagement: async () => ({}),
  getSeen,
  getNoteTypes: async (id: string) => (id === "jp" ? { T: ["Expression", "Meaning"] } : {}),
  getFieldMaps: async (id: string) => store.fieldMaps[id] ?? {},
  getWordStatuses: vi.fn(async (_id: string, words: string[]) =>
    store.statuses === null ? null
      : Object.fromEntries(words.filter((w) => store.statuses![w]).map((w) => [w, store.statuses![w]]))),
}));
```

3. In the existing `beforeEach`, also reset: `store.feed = []; store.fieldMaps = {}; store.statuses = null;`
4. Append a new describe inside the top-level describe:

```ts
  describe("is it in my deck", () => {
    const friend = (id: string, fields: Record<string, string>): FeedItem => ({
      id, user: "adam", front: "5493", back: "", deck: "Core", ease: 3, ivl: 1, ts: 1, noteType: "Core", fields });

    it("marks friends' cards with the viewer's status, and skips the viewer's own", async () => {
      store.statuses = { 話す: "known" };
      store.feed = [
        friend("adam:1", { "Vocabulary-Kanji": "話す" }),
        friend("adam:2", { "Vocabulary-Kanji": "聞く" }),
        { ...friend("jp:1", { Expression: "話す" }), user: "jp" },
        { id: "adam:3", user: "adam", front: "x", back: "", deck: "Core", ease: 3, ivl: 1, ts: 1 },
      ];
      const json = await (await GET(new Request("https://x.test/api/crew?key=key_jp"))).json();
      expect(json.inMyDeck).toEqual({ "adam:1": "known", "adam:2": "none" });
    });

    it("shows no badges at all to a viewer with no index yet", async () => {
      store.feed = [friend("adam:1", { "Vocabulary-Kanji": "話す" })];
      const json = await (await GET(new Request("https://x.test/api/crew?key=key_jp"))).json();
      expect(json.inMyDeck).toEqual({});
    });

    it("gives a sentence card no badge", async () => {
      store.statuses = {};
      store.feed = [friend("adam:1", { Expression: "今日は一人で映画を見ます。とても楽しかった。" })];
      const json = await (await GET(new Request("https://x.test/api/crew?key=key_jp"))).json();
      expect(json.inMyDeck).toEqual({});
    });

    it("reads a friend's card through that friend's own field choices", async () => {
      store.statuses = { 作る: "learning" };
      store.fieldMaps = { adam: { Core: { word: "Odd" } } };
      store.feed = [friend("adam:1", { "Vocabulary-Kanji": "違う", Odd: "作る" })];
      const json = await (await GET(new Request("https://x.test/api/crew?key=key_jp"))).json();
      expect(json.inMyDeck).toEqual({ "adam:1": "learning" });
      expect(json.fieldMaps).toEqual({ jp: {} });
    });

    it("sends the viewer their note types", async () => {
      const json = await (await GET(new Request("https://x.test/api/crew?key=key_jp"))).json();
      expect(json.noteTypes).toEqual({ T: ["Expression", "Meaning"] });
    });
  });
```

Note: `fieldMaps` is built from the people list (only `jp` in this mock). The override test still works because the route also reads maps for feed owners who aren't in `people` (see Step 3).

- [ ] **Step 2: Write the failing fieldmap tests**

In `web/app/api/__tests__/engagement.test.ts`:
- Add `const setFieldMap = vi.fn<AnyFn>(async () => ({ T: { word: "Expression" } }));` next to the other mocks.
- Add to the store mock: `setFieldMap: (...a: unknown[]) => setFieldMap(...a),` and `getNoteTypes: async (id: string) => (id === "jp" ? { T: ["Expression", "Meaning"] } : {}),`
- Add `setFieldMap.mockClear();` to `beforeEach`.
- Add `import { POST as fieldmap } from "@/app/api/fieldmap/route";`

Then append:

```ts
describe("POST /api/fieldmap", () => {
  it("saves the key holder's choice for one of their note types", async () => {
    const res = await fieldmap(req({ noteType: "T", map: { word: "Expression" } }));
    expect(res.status).toBe(200);
    expect(setFieldMap).toHaveBeenCalledWith("jp", "T", { word: "Expression" });
    expect((await res.json()).fieldMaps).toEqual({ T: { word: "Expression" } });
  });

  it("resets to auto on an empty map", async () => {
    await fieldmap(req({ noteType: "T", map: {} }));
    expect(setFieldMap).toHaveBeenCalledWith("jp", "T", {});
  });

  it("rejects a missing or unknown key", async () => {
    expect((await fieldmap(req({ noteType: "T", map: {} }, "nope"))).status).toBe(401);
  });

  it.each([
    ["a note type you don't have", { noteType: "Other", map: { word: "Expression" } }],
    ["a field that note type doesn't have", { noteType: "T", map: { word: "Nope" } }],
    ["a role that doesn't exist", { noteType: "T", map: { colour: "Expression" } }],
    ["a map that isn't an object", { noteType: "T", map: "Expression" }],
  ])("rejects %s", async (_name, body) => {
    expect((await fieldmap(req(body))).status).toBe(400);
    expect(setFieldMap).not.toHaveBeenCalled();
  });

  it("can only change your own cards", async () => {
    // Peter's key has no note type T, so it can't borrow JP's.
    expect((await fieldmap(req({ noteType: "T", map: { word: "Expression" } }, "key_p"))).status).toBe(400);
  });
});
```

- [ ] **Step 3: Run the tests to check they fail**

Run: `cd web && npx vitest run app/api/__tests__/crew.test.ts app/api/__tests__/engagement.test.ts`
Expected: FAIL (`inMyDeck` undefined; the fieldmap route module isn't found).

- [ ] **Step 4: Implement the crew route**

Replace `web/app/api/crew/route.ts`'s store import and body with:

```ts
import { NextResponse } from "next/server";
import { deckWord } from "@/lib/fields";
import { userForReadKey } from "@/lib/identity";
import { currentDayKey } from "@/lib/metrics";
import {
  getEngagement, getFeed, getFieldMaps, getNoteTypes, getPerson, getSeen, getWordStatuses, listUsers,
} from "@/lib/store";
import type { CrewResponse, DeckStatus, FieldMaps, PersonView } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const viewer = userForReadKey(key);
  if (!viewer) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const ids = await listUsers();
  const loaded = await Promise.all(ids.map((id) => getPerson(id)));
  // A publisher reports its day only when it syncs. Bring everyone up to the
  // day it is now for them, so a stale "today" reads as nothing yet rather
  // than as yesterday's cards.
  const now = Date.now();
  const people = loaded
    .filter((p): p is PersonView => p !== null)
    .map((p) => ({ ...p, meta: { ...p.meta, todayKey: currentDayKey(p.profile.tz, p.meta.todayKey, now) } }));
  const feed = await getFeed();
  const engagement = await getEngagement(feed.map((f) => f.id));
  const seen = await getSeen(viewer);

  // How each card owner has chosen to show their note types.
  const owners = [...new Set([...people.map((p) => p.profile.id), ...feed.map((f) => f.user)])];
  const maps = Object.fromEntries(await Promise.all(owners.map(async (id) => [id, await getFieldMaps(id)] as const)));
  const fieldMaps: Record<string, FieldMaps> = Object.fromEntries(people.map((p) => [p.profile.id, maps[p.profile.id]]));

  // Friends' cards only, looked up in the viewer's index in one read.
  const wanted = new Map<string, string>();
  for (const item of feed) {
    if (item.user === viewer) continue;
    const word = deckWord(item, maps[item.user]?.[item.noteType ?? ""]);
    if (word) wanted.set(item.id, word);
  }
  const statuses = await getWordStatuses(viewer, [...new Set(wanted.values())]);
  const inMyDeck: Record<string, DeckStatus | "none"> = {};
  if (statuses) for (const [id, word] of wanted) inMyDeck[id] = statuses[word] ?? "none";

  const noteTypes = await getNoteTypes(viewer);

  const body: CrewResponse = { viewer, people, feed, engagement, seen, fieldMaps, noteTypes, inMyDeck };
  return NextResponse.json(body);
}
```

- [ ] **Step 5: Implement the fieldmap route**

Create `web/app/api/fieldmap/route.ts`:

```ts
import { NextResponse } from "next/server";
import { userForRequest } from "@/lib/identity";
import { ROLES } from "@/lib/fields";
import { getNoteTypes, setFieldMap } from "@/lib/store";
import type { FieldMap, FieldRole } from "@/lib/types";

/** Your own choice of which field is the word, meaning or sentence, for one note type. */
export async function POST(req: Request) {
  const user = userForRequest(req);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const b = body as { noteType?: unknown; map?: unknown };
  if (typeof b?.noteType !== "string" || typeof b.map !== "object" || b.map === null || Array.isArray(b.map)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // Only your own note types, and only their real field names.
  const fields = (await getNoteTypes(user))[b.noteType];
  if (!fields) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const map: FieldMap = {};
  for (const [role, name] of Object.entries(b.map as Record<string, unknown>)) {
    if (!ROLES.includes(role as FieldRole) || typeof name !== "string" || !fields.includes(name)) {
      return NextResponse.json({ error: "bad request" }, { status: 400 });
    }
    map[role as FieldRole] = name;
  }

  const fieldMaps = await setFieldMap(user, b.noteType, map);
  return NextResponse.json({ ok: true, fieldMaps });
}
```

- [ ] **Step 6: Run the tests and the type check**

Run: `cd web && npx vitest run app/api && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add web/app/api
git commit -m "Tell each viewer whether friends' words are in their decks, and save field choices"
```

---

### Task 8: Web — feed cards show word, meaning, sentences and the badge

**Files:**
- Modify: `web/app/components/FeedCard.tsx`
- Modify: `web/app/components/Feed.tsx`
- Modify: `web/app/components/FeedFilters.tsx`
- Modify: `web/app/components/PersonPanel.tsx`
- Modify: `web/app/page.tsx` (pass the new props)
- Create: `web/app/components/__tests__/FeedSentences.test.tsx`
- Modify: `web/app/components/__tests__/PersonPanel.test.tsx`

**Interfaces:**
- Consumes: `resolveCard`, `boldParts`, `plainText` (Task 4); `CrewResponse.fieldMaps`/`inMyDeck` (Task 7).
- Produces:
  - `Feed` gains optional props `fieldMaps?: Record<string, FieldMaps>` and `inMyDeck?: Record<string, DeckStatus | "none">`.
  - `FeedFilters` gains required props `sentences: boolean` and `onSentences: () => void`.
  - `FeedCard` gains required `card: Resolved` and `sentencesOn: boolean`, plus optional `deckStatus?: DeckStatus | "none"`.
  - `PersonPanel` gains optional `fieldMaps?: FieldMaps`.
  - localStorage key `anki-crew:sentences` (`"1"`/`"0"`).
  - Test ids: `deck-status-<itemId>`, `sentence-<itemId>`, `sentence-toggle-<itemId>`, `filter-sentences`.

- [ ] **Step 1: Write the failing tests**

Create `web/app/components/__tests__/FeedSentences.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Feed from "@/app/components/Feed";
import type { FeedItem, PersonView } from "@/lib/types";

const person = (id: string, name: string): PersonView => ({
  profile: { id, displayName: name, tz: "America/New_York", joinedAt: 0 },
  meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-21", allTimeReviews: 0, firstReviewAt: 0 }, days: [],
});
const people = [person("jp", "JP"), person("adam", "Adam")];

const adams: FeedItem = {
  id: "adam:1", user: "adam", front: "5493", back: "作り上げる", deck: "Core", ease: 3, ivl: 1, ts: 1000,
  noteType: "Core",
  fields: { "Core-Index": "5493", "Vocabulary-Kanji": "作り上げる", "Vocabulary-English": "to build up",
            Expression: "夢を<b>作り上げる</b>。", "Sentence-English": "Build a dream." },
};
const old: FeedItem = { id: "adam:0", user: "adam", front: "話す", back: "to speak", deck: "Core", ease: 3, ivl: 1, ts: 500 };

beforeEach(() => { localStorage.clear(); cleanup(); });

describe("feed cards with named fields", () => {
  it("show the word and meaning instead of the index number", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" />);
    expect(screen.getByText("作り上げる")).toBeInTheDocument();
    expect(screen.getByText("to build up")).toBeInTheDocument();
    expect(screen.queryByText("5493")).toBeNull();
  });

  it("still show front and back for cards from older publishers", () => {
    render(<Feed items={[old]} people={people} viewer="jp" />);
    expect(screen.getByText("話す")).toBeInTheDocument();
    expect(screen.getByText("to speak")).toBeInTheDocument();
  });

  it("apply the owner's field choice", () => {
    render(<Feed items={[adams]} people={people} viewer="jp"
                 fieldMaps={{ adam: { Core: { meaning: "Sentence-English" } } }} />);
    expect(screen.getByText("Build a dream.")).toBeInTheDocument();
  });
});

describe("sentences", () => {
  it("are hidden until the feed switch is on, and the switch is remembered", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" />);
    expect(screen.queryByTestId("sentence-adam:1")).toBeNull();
    fireEvent.click(screen.getByTestId("filter-sentences"));
    const s = screen.getByTestId("sentence-adam:1");
    expect(s).toHaveTextContent("夢を作り上げる。");
    expect(s.querySelector("b")).toHaveTextContent("作り上げる");
    expect(s).toHaveTextContent("Build a dream.");
    expect(localStorage.getItem("anki-crew:sentences")).toBe("1");

    cleanup();
    render(<Feed items={[adams]} people={people} viewer="jp" />);
    expect(screen.getByTestId("sentence-adam:1")).toBeInTheDocument();
  });

  it("can be flipped on one card without the switch", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" />);
    fireEvent.click(screen.getByTestId("sentence-toggle-adam:1"));
    expect(screen.getByTestId("sentence-adam:1")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("sentence-toggle-adam:1"));
    expect(screen.queryByTestId("sentence-adam:1")).toBeNull();
  });

  it("offer no 例 button on a card without a sentence", () => {
    render(<Feed items={[old]} people={people} viewer="jp" />);
    expect(screen.queryByTestId("sentence-toggle-adam:0")).toBeNull();
  });

  it("don't open the thread when tapped", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" apiKey="k" />);
    fireEvent.click(screen.getByTestId("sentence-toggle-adam:1"));
    fireEvent.click(screen.getByTestId("sentence-adam:1"));
    expect(screen.queryByTestId("comment-input-adam:1")).toBeNull();
  });
});

describe("deck badge", () => {
  it.each([
    ["known", "known"], ["learning", "learning"], ["new", "not seen yet"], ["none", "not in your deck"],
  ] as const)("reads %s as '%s'", (status, label) => {
    render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{ "adam:1": status }} />);
    expect(screen.getByTestId("deck-status-adam:1")).toHaveTextContent(label);
  });

  it("is absent when the server sent nothing for the card", () => {
    render(<Feed items={[adams]} people={people} viewer="jp" inMyDeck={{}} />);
    expect(screen.queryByTestId("deck-status-adam:1")).toBeNull();
  });
});
```

Append to `web/app/components/__tests__/PersonPanel.test.tsx`, inside the describe:

```tsx
  it("lists recent cards by their real word, not an index number", () => {
    const items = [{ id: "jp:9", user: "jp", front: "5493", back: "作り上げる", deck: "Core", ease: 3, ivl: 1, ts: 9,
      noteType: "Core", fields: { "Core-Index": "5493", "Vocabulary-Kanji": "作り上げる", "Vocabulary-English": "to build up" } }];
    render(<PersonPanel person={person} items={items} />);
    expect(screen.getByText("作り上げる")).toBeTruthy();
    expect(screen.getByText("to build up")).toBeTruthy();
    expect(screen.queryByText("5493")).toBeNull();
  });
```

- [ ] **Step 2: Run the tests to check they fail**

Run: `cd web && npx vitest run app/components/__tests__/FeedSentences.test.tsx app/components/__tests__/PersonPanel.test.tsx`
Expected: FAIL (it shows "5493", and there's no `filter-sentences`).

- [ ] **Step 3: Add the Sentences switch to `FeedFilters.tsx`**

Add `sentences, onSentences` to the destructured props and to the prop type:

```ts
  /** Sample sentences under every card. */
  sentences: boolean;
  onSentences: () => void;
```

After the `filter-unread` `Toggle`, add:

```tsx
        <Toggle testid="filter-sentences" on={sentences} onClick={onSentences}>
          <span className="jp">例</span>&nbsp;Sentences
        </Toggle>
```

- [ ] **Step 4: Update `FeedCard.tsx`**

1. Imports: change the first React import to `import { useState, type CSSProperties, type ReactNode, type Ref } from "react";`. Add `import { Tooltip } from "@/app/components/primitives";`, `import { boldParts, plainText, type Resolved } from "@/lib/fields";`, and add `DeckStatus` to the types import.
2. After `ago`, add:

```tsx
const DECK_HELP = "Is this word in any of your decks, and how well you know it.";
const STATUS_LABEL: Record<DeckStatus | "none", string> = {
  known: "known", learning: "learning", new: "not seen yet", none: "not in your deck",
};
const STATUS_STYLE: Record<DeckStatus | "none", CSSProperties> = {
  known: { color: "var(--jade)", background: "rgba(52,211,153,.12)" },
  learning: { color: "var(--cyan-soft)", background: "rgba(34,211,238,.12)" },
  new: { color: "var(--ink-dim)", background: "rgba(255,255,255,.07)" },
  none: { color: "var(--ink-faint)", boxShadow: "inset 0 0 0 1px var(--edge)" },
};
const BLUR: CSSProperties = { color: "transparent", textShadow: "0 0 11px rgba(165,174,196,.85)" };
```

3. Add to the props (destructuring and type): `card`, `deckStatus`, `sentencesOn`:

```ts
  /** Word, meaning and sentence, resolved from the card's fields. */
  card: Resolved;
  /** Friends' cards: is the word in your decks. Absent means no badge. */
  deckStatus?: DeckStatus | "none";
  /** The feed-wide Sentences switch. */
  sentencesOn: boolean;
```

4. At the top of the body, add:

```tsx
  // This card's 例 button flips the feed-wide switch, for this card only.
  const [flipped, setFlipped] = useState(false);
  const showSentence = Boolean(card.sentence) && sentencesOn !== flipped;
```

5. Replace the word and meaning spans inside the top button:

```tsx
          <span className="jp block text-[19px] font-medium leading-snug">{plainText(card.word)}</span>
          {card.meaning && (
            <span
              className="mt-[3px] block text-[13px]"
              style={hidden ? BLUR : { color: "var(--ink-dim)" }}
            >
              {plainText(card.meaning)}
            </span>
          )}
```

6. In the meta line, after `<span>{item.deck}</span>`, add:

```tsx
            {deckStatus && (
              <>
                {' · '}
                <Tooltip label={DECK_HELP}>
                  <span data-testid={`deck-status-${item.id}`} className="rounded-full px-1.5 py-[1px]"
                        style={STATUS_STYLE[deckStatus]}>
                    {STATUS_LABEL[deckStatus]}
                  </span>
                </Tooltip>
              </>
            )}
```

7. Directly after the top `</button>` (before the reactions `div`), add the sentence block. It's outside the quiz button, so tapping it does nothing:

```tsx
      {showSentence && card.sentence && (
        <div data-testid={`sentence-${item.id}`} className="pl-[54px] pr-4 pt-2">
          <p className="jp text-[14px] leading-relaxed" style={{ color: "var(--ink)" }}>
            {boldParts(card.sentence).map((p, i) => p.bold
              ? <b key={i} style={{ color: "var(--violet-soft)" }}>{p.text}</b>
              : <span key={i}>{p.text}</span>)}
          </p>
          {card.translation && (
            <p className="mt-0.5 text-[12px]" style={hidden ? BLUR : { color: "var(--ink-faint)" }}>
              {plainText(card.translation)}
            </p>
          )}
        </div>
      )}
```

8. In the reactions row, after the `EMOJI.map(…)` block and before the thread button, add:

```tsx
        {card.sentence && (
          <button
            data-testid={`sentence-toggle-${item.id}`}
            aria-pressed={showSentence}
            onClick={() => setFlipped((f) => !f)}
            title={showSentence ? "Hide the sentence" : "Show the sentence"}
            className="jp inline-flex min-h-7 items-center rounded-full px-2 text-[12px] transition-colors"
            style={{
              color: showSentence ? "var(--violet-soft)" : "var(--ink-faint)",
              background: showSentence ? "var(--pane-lift)" : "transparent",
            }}
          >
            例
          </button>
        )}
```

- [ ] **Step 5: Update `Feed.tsx`**

1. Imports: add `import { resolveCard } from "@/lib/fields";` and add `DeckStatus, FieldMaps` to the types import.
2. Props: add `fieldMaps, inMyDeck` to the destructuring and type:

```ts
  /** Everyone's field choices, by user id. */
  fieldMaps?: Record<string, FieldMaps>;
  /** Friends' cards: is the word in the viewer's decks. */
  inMyDeck?: Record<string, DeckStatus | "none">;
```

3. Above the component, add:

```ts
const SENTENCES_KEY = "anki-crew:sentences";

function readSentences(): boolean {
  try {
    return localStorage.getItem(SENTENCES_KEY) === "1";
  } catch {
    return false; // storage blocked: off, and just not remembered
  }
}
```

4. In the component, after the `filter` state:

```ts
  const [sentences, setSentences] = useState(readSentences);
  const toggleSentences = () => {
    const next = !sentences;
    setSentences(next);
    try { localStorage.setItem(SENTENCES_KEY, next ? "1" : "0"); } catch { /* not remembered */ }
  };
```

5. Pass `sentences={sentences}` and `onSentences={toggleSentences}` to `<FeedFilters …>`.
6. On `<FeedCard …>`, add:

```tsx
                    card={resolveCard(item, fieldMaps?.[item.user]?.[item.noteType ?? ""])}
                    deckStatus={inMyDeck?.[item.id]}
                    sentencesOn={sentences}
```

- [ ] **Step 6: Update `PersonPanel.tsx`**

Add `import { plainText, resolveCard } from "@/lib/fields";` and `FieldMaps` to the types import. Change the signature to:

```tsx
export default function PersonPanel({ person, items, fieldMaps }: {
  person: PersonView; items: FeedItem[]; fieldMaps?: FieldMaps;
}) {
```

In the "Recent cards" `mine.map`, resolve each item:

```tsx
            {mine.map((item) => {
              const c = resolveCard(item, fieldMaps?.[item.noteType ?? ""]);
              return (
                <li key={item.id} className="flex items-baseline gap-3">
                  <span className="jp text-[15px] font-medium">{plainText(c.word)}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px]" style={{ color: "var(--ink-faint)" }}>{plainText(c.meaning)}</span>
                </li>
              );
            })}
```

- [ ] **Step 7: Pass the data from `page.tsx`**

On `<Feed …>` add `fieldMaps={data.fieldMaps}` and `inMyDeck={data.inMyDeck}`. On `<PersonPanel …>` add `fieldMaps={data.fieldMaps?.[selected.profile.id]}`.

- [ ] **Step 8: Run the whole web suite and the type check**

Run: `cd web && npx vitest run && npx tsc --noEmit -p .`
Expected: all pass (the existing Feed/FeedNavigation tests still pass, since items without fields render as before).

- [ ] **Step 9: Commit**

```bash
git add web/app
git commit -m "Show each card's real word, its sentence on demand, and whether it's in your deck"
```

---

### Task 9: Web — Card fields editor in the You tab, and the What's new note

**Files:**
- Create: `web/app/components/CardFields.tsx`
- Create: `web/app/components/__tests__/CardFields.test.tsx`
- Modify: `web/app/page.tsx`
- Modify: `web/app/__tests__/page.test.tsx`
- Modify: `web/lib/whatsNew.ts`

**Interfaces:**
- Consumes: `guessMapping`, `resolveCard`, `plainText`, `ROLES` (Task 4); `POST /api/fieldmap` (Task 7); `CrewResponse.noteTypes`/`fieldMaps` (Task 7); `send(path, body, failedMessage)` in `page.tsx`, which reloads and shows the message on failure.
- Produces: `CardFields({ noteTypes, fieldMaps, items, onSave })`. Test ids `card-fields`, `card-fields-preview-<noteType>`; select `aria-label` is `"<noteType> Word|Meaning|Sentence"`.

- [ ] **Step 1: Write the failing component tests**

Create `web/app/components/__tests__/CardFields.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CardFields from "@/app/components/CardFields";
import type { FeedItem } from "@/lib/types";

const noteTypes = { Core: ["Core-Index", "Vocabulary-Kanji", "Vocabulary-English", "Expression"] };
const mine: FeedItem = { id: "jp:1", user: "jp", front: "5493", back: "", deck: "Core", ease: 3, ivl: 1, ts: 1,
  noteType: "Core", fields: { "Core-Index": "5493", "Vocabulary-Kanji": "作る", "Vocabulary-English": "to make",
                              Expression: "<b>作る</b>。" } };

describe("CardFields", () => {
  it("shows the guess as 'auto' and previews a real card", () => {
    render(<CardFields noteTypes={noteTypes} fieldMaps={{}} items={[mine]} onSave={() => {}} />);
    expect(screen.getByLabelText("Core Word")).toHaveValue("");
    expect(screen.getByRole("option", { name: "auto (Vocabulary-Kanji)" })).toBeInTheDocument();
    expect(screen.getByTestId("card-fields-preview-Core")).toHaveTextContent("作る — to make");
  });

  it("saves a change for that note type only", () => {
    const onSave = vi.fn();
    render(<CardFields noteTypes={noteTypes} fieldMaps={{ Core: { sentence: "Expression" } }} items={[mine]} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Core Meaning"), { target: { value: "Expression" } });
    expect(onSave).toHaveBeenCalledWith("Core", { sentence: "Expression", meaning: "Expression" });
  });

  it("choosing auto drops that override, and Reset clears them all", () => {
    const onSave = vi.fn();
    render(<CardFields noteTypes={noteTypes} fieldMaps={{ Core: { word: "Expression", meaning: "Expression" } }}
                       items={[]} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Core Word"), { target: { value: "" } });
    expect(onSave).toHaveBeenLastCalledWith("Core", { meaning: "Expression" });
    fireEvent.click(screen.getByRole("button", { name: "Reset to auto" }));
    expect(onSave).toHaveBeenLastCalledWith("Core", {});
  });

  it("renders nothing before the publisher sends note types", () => {
    const { container } = render(<CardFields noteTypes={{}} fieldMaps={{}} items={[]} onSave={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Write the failing page tests**

In `web/app/__tests__/page.test.tsx`, change `crew()` so the response carries note types. Add to the returned object:

```ts
    noteTypes: { Core: ["Vocabulary-Kanji", "Vocabulary-English"] },
    fieldMaps: { jp: {}, peter: {} },
    inMyDeck: {},
```

Append:

```tsx
describe("card fields", () => {
  it("saves your choice and applies it straight away", async () => {
    await mount();
    fireEvent.keyDown(window, { key: "3" });
    fireEvent.change(screen.getByLabelText("Core Word"), { target: { value: "Vocabulary-English" } });
    const call = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/fieldmap"));
    expect(JSON.parse(call![1].body)).toEqual({ noteType: "Core", map: { word: "Vocabulary-English" } });
    expect(screen.getByLabelText("Core Word")).toHaveValue("Vocabulary-English");
  });

  it("goes back to what was saved, and says so, when the save fails", async () => {
    writeReply = new Response("{}", { status: 500 });
    await mount();
    fireEvent.keyDown(window, { key: "3" });
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Core Word"), { target: { value: "Vocabulary-English" } });
    });
    await waitFor(() => expect(screen.getByLabelText("Core Word")).toHaveValue(""));
    expect(screen.getByTestId("sync-note")).toHaveTextContent(/didn't save/i);
  });
});
```

- [ ] **Step 3: Run the tests to check they fail**

Run: `cd web && npx vitest run app/components/__tests__/CardFields.test.tsx app/__tests__/page.test.tsx`
Expected: FAIL (`CardFields` module not found; no "Core Word" label on the page).

- [ ] **Step 4: Implement `CardFields.tsx`**

```tsx
"use client";
import { guessMapping, plainText, resolveCard, ROLES } from "@/lib/fields";
import type { FeedItem, FieldMap, FieldMaps, FieldRole } from "@/lib/types";

const LABEL: Record<FieldRole, string> = { word: "Word", meaning: "Meaning", sentence: "Sentence" };

/**
 * Which field is the word, meaning and sentence, per note type. Guessed from
 * field names; a choice here changes how everyone sees your cards, old ones
 * included, because the dashboard resolves fields on every load.
 */
export default function CardFields({ noteTypes, fieldMaps, items, onSave }: {
  noteTypes: Record<string, string[]>;
  fieldMaps: FieldMaps;
  /** Your own feed items, for a preview. */
  items: FeedItem[];
  onSave: (noteType: string, map: FieldMap) => void;
}) {
  const types = Object.keys(noteTypes);
  if (types.length === 0) return null;

  return (
    <section data-testid="card-fields" className="pane mx-3 mt-2.5 px-4 py-3">
      <h3 className="text-[10.5px]" style={{ color: "var(--ink-dim)" }}>Card fields</h3>
      <p className="mt-1 text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
        How your cards show up for everyone. We guess from the field names; fix anything that&apos;s off.
      </p>
      <ul className="mt-3 space-y-4">
        {types.map((nt) => {
          const map = fieldMaps[nt] ?? {};
          const guess = guessMapping(noteTypes[nt]);
          const sample = items.find((i) => i.noteType === nt);
          const card = sample ? resolveCard(sample, map) : null;
          const set = (role: FieldRole, value: string) => {
            const next: FieldMap = { ...map };
            if (value === "") delete next[role]; else next[role] = value;
            onSave(nt, next);
          };
          return (
            <li key={nt}>
              <div className="text-[12.5px] font-semibold">{nt}</div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {ROLES.map((role) => (
                  <label key={role} className="text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
                    {LABEL[role]}
                    <select
                      aria-label={`${nt} ${LABEL[role]}`}
                      value={map[role] ?? ""}
                      onChange={(e) => set(role, e.target.value)}
                      className="mt-1 block min-h-8 w-full rounded-lg border px-1.5 text-[12px]"
                      style={{ borderColor: "var(--edge)", color: "var(--ink)", background: "var(--pane)" }}
                    >
                      <option value="">auto ({guess[role] ?? "none"})</option>
                      {noteTypes[nt].map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {card && (
                <p data-testid={`card-fields-preview-${nt}`} className="jp mt-2 text-[12.5px]" style={{ color: "var(--ink-dim)" }}>
                  {plainText(card.word)} — {plainText(card.meaning)}
                  {card.sentence && (
                    <span className="block text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
                      {plainText(card.sentence)}
                    </span>
                  )}
                </p>
              )}
              {Object.keys(map).length > 0 && (
                <button onClick={() => onSave(nt, {})} className="mt-1.5 min-h-8 text-[11px]" style={{ color: "var(--cyan-soft)" }}>
                  Reset to auto
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Wire it into `page.tsx`**

Add `import CardFields from "@/app/components/CardFields";` and `FieldMap` to the types import. After the `comment` callback, add:

```tsx
  /** Applied locally first; a failed save reloads, which puts back what the server has. */
  const saveFieldMap = useCallback((noteType: string, map: FieldMap) => {
    if (!data?.viewer) return;
    const me = data.viewer;
    setData((d) => d && ({
      ...d,
      fieldMaps: { ...d.fieldMaps, [me]: { ...(d.fieldMaps?.[me] ?? {}), [noteType]: map } },
    }));
    send("/api/fieldmap", { noteType, map }, "your card fields didn't save");
  }, [data?.viewer, send]);
```

In the You tab, between the avatar `div` and `<PersonPanel …>`, add:

```tsx
          {selected.profile.id === data.viewer && (
            <CardFields
              noteTypes={data.noteTypes ?? {}}
              fieldMaps={data.fieldMaps?.[data.viewer] ?? {}}
              items={data.feed.filter((i) => i.user === data.viewer)}
              onSave={saveFieldMap}
            />
          )}
```

- [ ] **Step 6: Add the What's new note**

At the top of `NOTES` in `web/lib/whatsNew.ts`:

```ts
  {
    id: "2026-09-sentences",
    date: "September 2026",
    title: "Sentences + is it in my deck?",
    items: [
      "Cards show the real word now, tap 例 (or the Sentences switch) for the example sentence, and friends' cards tell you if that word's in your deck — git pull your publisher to get the badges.",
    ],
  },
```

- [ ] **Step 7: Run everything**

Run: `cd web && npx vitest run && npx tsc --noEmit -p . && npx next build`
Expected: all tests pass, no type errors, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add web
git commit -m "Let everyone fix how their cards' fields are read, and note the release"
```

---

### Task 10: Real-data check (no code unless it finds a bug)

- [ ] **Step 1: Dry run against JP's real collection**

Run: `cd publisher && PYTHONIOENCODING=utf-8 python publish.py --dry-run`

Expected:
- The payload is well under 1 MB.
- `words:` shows thousands of known/learning/new entries (JP has ~6,000 vocab notes).
- The note types listed are `iKnow! Sentences Japanese`, `Japanese Vocab Dynamic` and `Japanese-75658`, with the field names shown in Global Constraints.

If the payload is over 1 MB, stop and report: Upstash's request limit may need checking.

- [ ] **Step 2: Check the guesses on those note types**

The guess table in Task 4 already covers these three field lists. Compare the dry-run field names with them. If any differ, add the real list to the `guessMapping` table test and fix the rules.

- [ ] **Step 3: Run the app locally and look**

`web/.env.local` points at the production database. Only *read*: don't change any Card fields dropdown, and don't publish.
1. Run `cd web && npx next build && npx next start -p 3100`.
2. Open `http://localhost:3100/?key=<JP's read key>` at 390×844.
3. Check the feed renders exactly as before for cards without fields (nobody has published fields yet).
4. Check the Sentences switch appears, and that the You tab shows no Card fields section yet.

Stop the server.

- [ ] **Step 4: Report the rollout order to JP**

1. Deploy the dashboard (`npx vercel --prod` from `web/`).
2. JP `git pull`s his publisher, runs `python publish.py` once, and checks the badges on Adam's cards and the Card fields section.
3. Adam and Peter `git pull`.
