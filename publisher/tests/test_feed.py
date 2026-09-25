import os, tempfile, unittest
from datetime import datetime
from tests.fixtures import build_db, add_deck, add_note, add_card, add_review, add_notetype, ms, SEP
import feed as F
import anki_reader

DECKS = {5: "Core 2k/6k"}


def _seeded():
    con = build_db(os.path.join(tempfile.mkdtemp(), "c.anki2"))
    add_deck(con, 5, "Core 2k/6k")
    return con


class TestCleanField(unittest.TestCase):
    def test_strips_html_tags(self):
        self.assertEqual(F.clean_field("<b>話す</b>"), "話す")

    def test_strips_sound_references(self):
        self.assertEqual(F.clean_field("話す[sound:a.mp3]"), "話す")

    def test_unescapes_entities(self):
        self.assertEqual(F.clean_field("a &amp; b"), "a & b")

    def test_br_becomes_a_space_not_a_join(self):
        # Replacing tags with a space stops "to speak<br>to talk" becoming "speakto".
        self.assertEqual(F.clean_field("to speak<br>to talk"), "to speak to talk")

    def test_empty_input(self):
        self.assertEqual(F.clean_field(""), "")
        self.assertEqual(F.clean_field(None), "")


class TestExtractFrontBack(unittest.TestCase):
    def test_takes_the_first_two_non_empty_fields(self):
        self.assertEqual(F.extract_front_back(SEP.join(["話す", "to speak"])),
                         ("話す", "to speak"))

    def test_skips_empty_fields(self):
        self.assertEqual(F.extract_front_back(SEP.join(["", "話す", "", "to speak"])),
                         ("話す", "to speak"))

    def test_single_field_note_has_empty_back(self):
        self.assertEqual(F.extract_front_back("話す"), ("話す", ""))

    def test_truncates_long_fields(self):
        long = "x" * 500
        front, _ = F.extract_front_back(long)
        self.assertEqual(len(front), F.MAX_LEN)

    def test_empty_note(self):
        self.assertEqual(F.extract_front_back(""), ("", ""))


class TestFeedItems(unittest.TestCase):
    def test_item_shape_and_stable_id(self):
        con = _seeded()
        add_note(con, 100, 1, ["話す", "to speak"])
        add_card(con, 200, 100, 5, ivl=21)
        rid = ms(datetime(2026, 9, 21, 10, 0))
        add_review(con, rid, 200, ease=3)
        item = F.feed_items(con, DECKS, "jp")[0]
        self.assertEqual(item, {"id": "jp:%d" % rid, "user": "jp",
                                "front": "話す", "back": "to speak",
                                "deck": "Core 2k/6k", "ease": 3, "ivl": 21, "ts": rid,
                                "noteType": "", "fields": {}})

    def test_id_is_deterministic_across_runs(self):
        con = _seeded()
        add_note(con, 100, 1, ["話す", "to speak"])
        add_card(con, 200, 100, 5)
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200)
        self.assertEqual(F.feed_items(con, DECKS, "jp")[0]["id"],
                         F.feed_items(con, DECKS, "jp")[0]["id"])

    def test_one_item_per_card_keeping_the_latest_review(self):
        con = _seeded()
        add_note(con, 100, 1, ["話す", "to speak"])
        add_card(con, 200, 100, 5)
        older = ms(datetime(2026, 9, 21, 10, 0))
        newer = ms(datetime(2026, 9, 21, 10, 5))
        add_review(con, older, 200)
        add_review(con, newer, 200)
        items = F.feed_items(con, DECKS, "jp")
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["ts"], newer)

    def test_newest_first(self):
        con = _seeded()
        for i, nid in enumerate((100, 101)):
            add_note(con, nid, 1, ["word%d" % i, "meaning"])
            add_card(con, 200 + i, nid, 5)
            add_review(con, ms(datetime(2026, 9, 21, 10, i)), 200 + i)
        items = F.feed_items(con, DECKS, "jp")
        self.assertGreater(items[0]["ts"], items[1]["ts"])

    def test_cram_reviews_never_reach_the_feed(self):
        con = _seeded()
        add_note(con, 100, 1, ["話す", "to speak"])
        add_card(con, 200, 100, 5)
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200, rtype=3)
        self.assertEqual(F.feed_items(con, DECKS, "jp"), [])

    def test_notes_with_no_usable_text_are_skipped(self):
        con = _seeded()
        add_note(con, 100, 1, ["[sound:a.mp3]", ""])
        add_card(con, 200, 100, 5)
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200)
        self.assertEqual(F.feed_items(con, DECKS, "jp"), [])

    def test_respects_the_limit(self):
        con = _seeded()
        for i in range(5):
            add_note(con, 100 + i, 1, ["word%d" % i, "meaning"])
            add_card(con, 200 + i, 100 + i, 5)
            add_review(con, ms(datetime(2026, 9, 21, 10, i)), 200 + i)
        self.assertEqual(len(F.feed_items(con, DECKS, "jp", limit=2)), 2)


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

    def test_trims_a_long_note_type_name(self):
        con = _seeded()
        add_notetype(con, 7, "x" * 150, VOCAB)
        add_note(con, 100, 7, ["話す", "to speak"])
        add_card(con, 200, 100, 5)
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200)
        item = F.feed_items(con, DECKS, "jp")[0]
        self.assertEqual(item["noteType"], "x" * F.MAX_NOTE_TYPE_LEN)


if __name__ == "__main__":
    unittest.main()
