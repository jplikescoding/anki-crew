import os, sqlite3, tempfile, unittest
from datetime import datetime
from tests.fixtures import (build_db, add_deck, add_note, add_card, add_review,
                            set_config, ms, SEP)


def _con():
    return build_db(os.path.join(tempfile.mkdtemp(), "c.anki2"))


class TestFixtures(unittest.TestCase):
    def test_builds_schema_18_shaped_collection(self):
        con = _con()
        self.assertEqual(con.execute("SELECT ver FROM col").fetchone()[0], 18)

    def test_rollover_is_stored_as_json_bytes_like_anki(self):
        con = _con()
        set_config(con, "rollover", 4)
        val = con.execute("SELECT val FROM config WHERE key='rollover'").fetchone()[0]
        self.assertEqual(bytes(val), b"4")

    def test_rows_round_trip(self):
        con = _con()
        add_deck(con, 5, "Core 2k/6k")
        add_note(con, 100, 1, ["話しかける", "to speak to"])
        add_card(con, 200, 100, 5, ivl=21)
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200, ease=3, rtype=1, time_ms=8000)
        row = con.execute(
            "SELECT c.did, n.flds, r.ease FROM revlog r "
            "JOIN cards c ON c.id=r.cid JOIN notes n ON n.id=c.nid").fetchone()
        self.assertEqual(row[0], 5)
        self.assertEqual(row[1].split(SEP)[1], "to speak to")
        self.assertEqual(row[2], 3)


if __name__ == "__main__":
    unittest.main()
