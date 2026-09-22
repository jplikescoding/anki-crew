"""Maps review timestamps onto Anki's notion of a study day.

Anki's day rolls over at a configurable hour (default 4am local), so a review
at 3am counts toward the previous day. Timestamps are converted using the
machine's own local time, which means each participant's days are bucketed in
their own timezone -- exactly what the spec calls for with two people on EST
and one on PST.
"""
from datetime import datetime, timedelta


def day_key(ts_ms, rollover_hour=4):
    """The ISO date (YYYY-MM-DD) of the Anki day containing this timestamp."""
    local = datetime.fromtimestamp(ts_ms / 1000)
    return (local - timedelta(hours=rollover_hour)).date().isoformat()


def today_key(rollover_hour=4, now=None):
    """The ISO date of the Anki day in progress right now."""
    local = now or datetime.now()
    return (local - timedelta(hours=rollover_hour)).date().isoformat()
