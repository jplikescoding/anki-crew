"""Reads this machine's Anki collection and publishes it to the crew dashboard.

Every run sends the entire history. There is no incremental window and no local
state file, so the publisher and the server cannot drift out of sync, and a
machine that was switched off for a week heals itself on the next run.
"""
import argparse
import json
import os
import shutil
import sys
import time
import urllib.error
import urllib.request

import anki_reader
import feed as feed_mod
import stats as stats_mod
from collection_paths import find_collections
from daybuckets import today_key

REQUIRED_KEYS = ("user", "displayName", "endpoint", "token")
DEFAULT_CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


class ConfigError(Exception):
    """config.json is missing or incomplete."""


def load_config(path=DEFAULT_CONFIG):
    if not os.path.exists(path):
        raise ConfigError("%s not found -- run `python setup.py` first" % path)
    with open(path, encoding="utf-8") as fh:
        cfg = json.load(fh)
    missing = [k for k in REQUIRED_KEYS if not cfg.get(k)]
    if missing:
        raise ConfigError("%s is missing: %s" % (path, ", ".join(missing)))
    return cfg


def build_payload(con, user, display_name, tz, rollover, feed_limit=200, now=None):
    decks = anki_reader.deck_names(con)
    days = stats_mod.daily_rows(con, rollover, decks)
    today = today_key(rollover, now)
    return {
        "user": user,
        "displayName": display_name,
        "tz": tz,
        "generatedAt": int(time.time() * 1000),
        # todayKey and streak are computed here, not server-side: only this
        # machine knows its own rollover hour and local clock, and the three
        # participants are not in the same timezone.
        "todayKey": today,
        "streak": stats_mod.current_streak(days, today),
        "days": days,
        "allTime": stats_mod.all_time(con),
        "recentCards": feed_mod.feed_items(con, decks, user, limit=feed_limit),
    }


def post_payload(endpoint, token, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        endpoint, data=data, method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": "Bearer %s" % token})
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body) if body else {}


def resolve_collection(cfg):
    path = cfg.get("collection")
    if path:
        return path
    found = find_collections()
    if not found:
        raise ConfigError("no collection.anki2 found -- set \"collection\" in config.json")
    return str(found[0])


def main(argv=None):
    parser = argparse.ArgumentParser(description="Publish Anki stats to the crew dashboard")
    parser.add_argument("--config", default=DEFAULT_CONFIG)
    parser.add_argument("--dry-run", action="store_true",
                        help="print the payload instead of sending it")
    args = parser.parse_args(argv)

    try:
        cfg = load_config(args.config)
        src = resolve_collection(cfg)
    except ConfigError as exc:
        print("config error: %s" % exc, file=sys.stderr)
        return 2

    con, tmpdir = anki_reader.open_collection_copy(src)
    try:
        anki_reader.check_schema(con)
        rollover = anki_reader.rollover_hour(con)
        payload = build_payload(con, cfg["user"], cfg["displayName"],
                                cfg.get("tz", "local"), rollover)
    except anki_reader.UnsupportedCollection as exc:
        print("unsupported collection: %s" % exc, file=sys.stderr)
        return 3
    finally:
        con.close()
        shutil.rmtree(tmpdir, ignore_errors=True)

    if args.dry_run:
        print(json.dumps(payload, ensure_ascii=False, indent=2)[:4000])
        return 0

    try:
        post_payload(cfg["endpoint"], cfg["token"], payload)
    except urllib.error.HTTPError as exc:
        print("publish failed: HTTP %s %s" % (exc.code, exc.reason), file=sys.stderr)
        return 4
    except urllib.error.URLError as exc:
        print("publish failed: %s" % exc.reason, file=sys.stderr)
        return 4

    today = today_key(rollover)
    todays = next((d for d in payload["days"] if d["date"] == today), None)
    print("published %d days, %d feed cards, %d reviews today"
          % (len(payload["days"]), len(payload["recentCards"]),
             todays["reviews"] if todays else 0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
