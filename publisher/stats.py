"""Per-day rollups from the review log.

Deliberately stores the raw ease breakdown rather than a finished retention
percentage: retention and any future ranking metric are derived in the web app,
so the group can renegotiate what counts without touching this script or
losing history.
"""
from datetime import date, timedelta

from daybuckets import day_key

# learn, review, relearn. Filtered/cram (3) and manual reschedule (4) are
# excluded so a cram session cannot manufacture a leaderboard win.
REAL_TYPES = "(0, 1, 2)"

_EMPTY = {"reviews": 0, "newCards": 0,
          "ease1": 0, "ease2": 0, "ease3": 0, "ease4": 0}


def daily_rows(con, rollover, decks):
    buckets = {}
    # LEFT JOIN, because Anki keeps revlog rows after a card is deleted. An
    # inner join would hide those reviews here while all_time still counted
    # them, so the daily rows and the all-time total must span the same rows.
    query = ("SELECT r.id, r.ease, r.time, c.did FROM revlog r "
             "LEFT JOIN cards c ON c.id = r.cid WHERE r.type IN %s" % REAL_TYPES)
    for rid, ease, time_ms, did in con.execute(query):
        key = day_key(rid, rollover)
        row = buckets.get(key)
        if row is None:
            row = dict(_EMPTY, date=key, _ms=0, perDeck={})
            buckets[key] = row
        row["reviews"] += 1
        row["_ms"] += time_ms or 0
        if isinstance(ease, int) and 1 <= ease <= 4:
            row["ease%d" % ease] += 1
        name = decks.get(did, "Unknown")
        row["perDeck"][name] = row["perDeck"].get(name, 0) + 1

    # A card is "new" on the day of its first genuine review.
    first_seen = ("SELECT cid, MIN(id) FROM revlog WHERE type IN %s GROUP BY cid"
                  % REAL_TYPES)
    for _cid, first in con.execute(first_seen):
        row = buckets.get(day_key(first, rollover))
        if row is not None:
            row["newCards"] += 1

    rows = []
    for key in sorted(buckets):
        row = buckets[key]
        row["minutes"] = round(row.pop("_ms") / 60000.0, 1)
        rows.append(row)
    return rows


def all_time(con):
    total, first = con.execute(
        "SELECT COUNT(*), MIN(id) FROM revlog WHERE type IN %s" % REAL_TYPES).fetchone()
    return {"reviews": total or 0, "firstReviewAt": first or 0}


def current_streak(rows, today):
    """Consecutive studied days ending today, or yesterday if today is still empty."""
    studied = {r["date"] for r in rows if r.get("reviews", 0) > 0}
    if not studied:
        return 0
    day = date.fromisoformat(today)
    if day.isoformat() not in studied:
        day -= timedelta(days=1)
        if day.isoformat() not in studied:
            return 0
    count = 0
    while day.isoformat() in studied:
        count += 1
        day -= timedelta(days=1)
    return count
