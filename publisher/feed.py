"""Turns recent reviews into shareable feed items.

The first two non-empty fields are sent as front/back for older dashboards.
Named fields are sent so the dashboard can pick word/meaning/sentence by name.
"""
import html
import re
import anki_reader

SEP = "\x1f"
MAX_LEN = 120
MAX_FIELD_LEN = 200
MAX_FIELDS = 30

_BOLD_OPEN = re.compile(r"<b>", re.I)
_BOLD_CLOSE = re.compile(r"</b>", re.I)
# Private-use characters stand in for <b> while every other tag is stripped.
_OPEN_MARK, _CLOSE_MARK = "", ""

_SOUND = re.compile(r"\[sound:[^\]]*\]")
_TAG = re.compile(r"<[^>]+>")

# Must match stats.REAL_TYPES: cram and manual reschedules never reach the feed.
REAL_TYPES = "(0, 1, 2)"


def clean_field(s):
    """Strip Anki markup down to plain text."""
    if not s:
        return ""
    s = _SOUND.sub(" ", s)
    # Tags become a space, not nothing, so "speak<br>talk" does not join up.
    s = _TAG.sub(" ", s)
    s = html.unescape(s)
    return " ".join(s.split())


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


def extract_front_back(flds):
    """First two non-empty fields of a note, cleaned and truncated."""
    parts = [clean_field(p) for p in (flds or "").split(SEP)]
    usable = [p for p in parts if p]
    front = usable[0][:MAX_LEN] if usable else ""
    back = usable[1][:MAX_LEN] if len(usable) > 1 else ""
    return front, back


def feed_items(con, decks, user_id, limit=200):
    """Newest reviews first, one item per card, newest review of that card kept.

    Deduplicating by card stops a learning session -- where one card is seen
    three times in ten minutes -- from flooding the feed.
    """
    ntnames = anki_reader.notetype_names(con)
    fnames = anki_reader.field_names(con)
    query = (
        "SELECT r.id, r.cid, r.ease, c.ivl, c.did, n.mid, n.flds FROM revlog r "
        "JOIN cards c ON c.id = r.cid JOIN notes n ON n.id = c.nid "
        "WHERE r.type IN %s ORDER BY r.id DESC" % REAL_TYPES)
    seen = set()
    out = []
    for rid, cid, ease, ivl, did, mid, flds in con.execute(query):
        if cid in seen:
            continue
        seen.add(cid)
        front, back = extract_front_back(flds)
        if not front:
            continue
        out.append({"id": "%s:%d" % (user_id, rid), "user": user_id,
                    "front": front, "back": back,
                    "deck": decks.get(did, "Unknown"),
                    "ease": ease, "ivl": ivl or 0, "ts": rid,
                    "noteType": ntnames.get(mid, ""),
                    "fields": note_fields(flds, fnames.get(mid, []))})
        if len(out) >= limit:
            break
    return out
