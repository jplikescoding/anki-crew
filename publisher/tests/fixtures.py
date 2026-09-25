"""Builds a synthetic collection shaped like Anki schema 18.

Only the tables and columns this project reads are present. Values that Anki
stores as JSON-encoded bytes (the `config` table) are stored that way here, so
tests exercise the real decoding path rather than a convenient fiction.
"""
import json
import sqlite3
from datetime import datetime

SEP = "\x1f"


def ms(dt: datetime) -> int:
    return int(dt.timestamp() * 1000)


def build_db(path: str) -> sqlite3.Connection:
    con = sqlite3.connect(path)
    con.executescript(
        """
        CREATE TABLE col(id INTEGER PRIMARY KEY, crt INTEGER, ver INTEGER, conf TEXT);
        CREATE TABLE config(key TEXT PRIMARY KEY, val BLOB);
        CREATE TABLE decks(id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE notetypes(id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE fields(ntid INTEGER, ord INTEGER, name TEXT);
        CREATE TABLE templates(ntid INTEGER, ord INTEGER, name TEXT);
        CREATE TABLE notes(id INTEGER PRIMARY KEY, mid INTEGER, flds TEXT, tags TEXT);
        CREATE TABLE cards(id INTEGER PRIMARY KEY, nid INTEGER, did INTEGER,
                           ord INTEGER, queue INTEGER, due INTEGER, type INTEGER,
                           ivl INTEGER, reps INTEGER);
        CREATE TABLE revlog(id INTEGER PRIMARY KEY, cid INTEGER, ease INTEGER,
                            ivl INTEGER, time INTEGER, type INTEGER);
        """
    )
    con.execute("INSERT INTO col(id, crt, ver, conf) VALUES (1, 0, 18, '')")
    con.commit()
    return con


def set_config(con, key, value):
    con.execute("INSERT OR REPLACE INTO config(key, val) VALUES (?, ?)",
                (key, json.dumps(value).encode("utf-8")))
    con.commit()


def set_schema_version(con, ver):
    con.execute("UPDATE col SET ver=?", (ver,))
    con.commit()


def add_deck(con, did, name):
    con.execute("INSERT INTO decks(id, name) VALUES (?, ?)", (did, name))
    con.commit()


def add_note(con, nid, mid, fields):
    con.execute("INSERT INTO notes(id, mid, flds, tags) VALUES (?, ?, ?, '')",
                (nid, mid, SEP.join(fields)))
    con.commit()


def add_card(con, cid, nid, did, ivl=0, reps=0, ctype=2, queue=2, due=0, ord_=0):
    con.execute(
        "INSERT INTO cards(id, nid, did, ord, queue, due, type, ivl, reps) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (cid, nid, did, ord_, queue, due, ctype, ivl, reps))
    con.commit()


def add_review(con, rid_ms, cid, ease=3, rtype=1, time_ms=5000, ivl=1):
    con.execute(
        "INSERT INTO revlog(id, cid, ease, ivl, time, type) VALUES (?, ?, ?, ?, ?, ?)",
        (rid_ms, cid, ease, ivl, time_ms, rtype))
    con.commit()


def add_notetype(con, ntid, name, field_names):
    con.execute("INSERT INTO notetypes(id, name) VALUES (?, ?)", (ntid, name))
    for i, field in enumerate(field_names):
        con.execute("INSERT INTO fields(ntid, ord, name) VALUES (?, ?, ?)", (ntid, i, field))
    con.commit()
