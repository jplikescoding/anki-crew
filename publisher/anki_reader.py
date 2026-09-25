"""Opens a throwaway copy of a collection and reads the few things we need.

The original collection is never opened. Anki may be running while this
executes; copying first is what makes that safe, and it is also why the copy
can be opened read-write without risk.
"""
import json
import os
import shutil
import sqlite3
import tempfile

MIN_SCHEMA = 18
_WAL_SIBLINGS = ("-wal", "-shm")


class UnsupportedCollection(Exception):
    """The collection is older than this tool supports."""


def open_collection_copy(src):
    """Copy the collection (and any WAL siblings) to a temp dir and open it.

    Returns (connection, tmpdir). The caller closes the connection and removes
    tmpdir. WAL siblings matter because recent reviews may live there and not
    yet in the main database file.
    """
    tmpdir = tempfile.mkdtemp(prefix="ankicrew-")
    try:
        dst = os.path.join(tmpdir, "collection.anki2")
        shutil.copy2(src, dst)
        for suffix in _WAL_SIBLINGS:
            sibling = str(src) + suffix
            if os.path.exists(sibling):
                shutil.copy2(sibling, dst + suffix)
        return sqlite3.connect(dst), tmpdir
    except Exception:
        # Nobody holds tmpdir yet, so an hourly task that fails here would
        # otherwise leave one behind on every run.
        shutil.rmtree(tmpdir, ignore_errors=True)
        raise


def check_schema(con):
    row = con.execute("SELECT ver FROM col").fetchone()
    ver = row[0] if row else 0
    if ver < MIN_SCHEMA:
        raise UnsupportedCollection(
            "collection schema v%s found, but v%s or newer is required "
            "(Anki 2.1.28, released 2020)" % (ver, MIN_SCHEMA))
    return ver


def get_config(con, key, default=None):
    """Read a key from the schema-18 `config` table.

    Values are JSON encoded and stored as bytes, e.g. rollover is b'4'.
    """
    row = con.execute("SELECT val FROM config WHERE key=?", (key,)).fetchone()
    if row is None:
        return default
    val = row[0]
    if isinstance(val, (bytes, bytearray)):
        val = bytes(val).decode("utf-8")
    try:
        return json.loads(val)
    except (ValueError, TypeError):
        return default


def rollover_hour(con):
    """The hour at which this collection's day rolls over. Anki's default is 4am."""
    val = get_config(con, "rollover", 4)
    return val if isinstance(val, int) and 0 <= val <= 23 else 4


def deck_names(con):
    """Deck id -> display name, with schema 18's \\x1f nesting separator normalised."""
    return {int(did): name.replace("\x1f", "::")
            for did, name in con.execute("SELECT id, name FROM decks")}


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
