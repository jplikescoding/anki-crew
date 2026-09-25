"""What's in this collection, for the dashboard's "is it in my deck?" badge.

The index doesn't know which field is the word: it takes every short field
with Japanese in it (the word, its kana, its furigana form), skipping fields
named like a sentence and values with sentence punctuation or spaces. The
dashboard maps fields separately, so a mapping fix never needs a new index.
"""
import hashlib
import json
import re

import anki_reader
from feed import SEP, clean_rich, MAX_NOTE_TYPE_LEN

MAX_WORD_LEN = 20
MAX_WORDS = 50000
MAX_NOTE_TYPES = 50
MAX_FIELD_NAMES = 50

_BOLD = re.compile(r"</?b>", re.I)
_FURIGANA = re.compile(r"\[[^\]]*\]")
_PAREN = re.compile(r"\([^)]*\)|（[^）]*）")
_JAPANESE = re.compile(r"[぀-ヿ㐀-䶿一-鿿]")
_SENTENCE_PUNCT = re.compile(r"[。、！？!?．，]")
_SENTENCE_NAMES = ("sentence", "example")

# Best first. Must match the dashboard's DeckStatus.
_RANKS = ("known", "learning", "new")


def normalize_word(s):
    """Must match normalizeWord in web/lib/fields.ts (see normalize.cases.json)."""
    s = _PAREN.sub("", _FURIGANA.sub("", _BOLD.sub("", s or "")))
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
            out[names[mid][:MAX_NOTE_TYPE_LEN]] = fields.get(mid, [])[:MAX_FIELD_NAMES]
    return out


def word_index(con):
    fields = anki_reader.field_names(con)
    words = {}
    for mid, flds, rank in _live_notes(con).values():
        names = fields.get(mid, [])
        for name, raw in zip(names, (flds or "").split(SEP)):
            if any(frag in name.lower() for frag in _SENTENCE_NAMES):
                continue
            cleaned = clean_rich(raw)
            no_paren = _PAREN.sub("", cleaned)
            if _SENTENCE_PUNCT.search(no_paren):
                continue
            stripped = no_paren.strip()
            if " " in stripped or "　" in stripped:
                continue
            word = normalize_word(cleaned)
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
