"""Turns recent reviews into shareable feed items.

Field extraction is deliberately generic. Each participant studies a different
deck with different field names, and the layouts are unknown until real data
arrives, so this takes the first two non-empty fields rather than guessing at
names like "Expression" or "Meaning". Per-deck tuning comes later, once we can
see what actually renders.
"""
import html
import re

SEP = "\x1f"
MAX_LEN = 120

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
    query = (
        "SELECT r.id, r.cid, r.ease, c.ivl, c.did, n.flds FROM revlog r "
        "JOIN cards c ON c.id = r.cid JOIN notes n ON n.id = c.nid "
        "WHERE r.type IN %s ORDER BY r.id DESC" % REAL_TYPES)
    seen = set()
    out = []
    for rid, cid, ease, ivl, did, flds in con.execute(query):
        if cid in seen:
            continue
        seen.add(cid)
        front, back = extract_front_back(flds)
        if not front:
            continue
        out.append({"id": "%s:%d" % (user_id, rid), "user": user_id,
                    "front": front, "back": back,
                    "deck": decks.get(did, "Unknown"),
                    "ease": ease, "ivl": ivl or 0, "ts": rid})
        if len(out) >= limit:
            break
    return out
