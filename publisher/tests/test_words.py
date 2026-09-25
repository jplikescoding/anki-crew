import json, os, tempfile, unittest
from tests.fixtures import build_db, add_deck, add_note, add_card, add_notetype
import words as W

CASES = os.path.join(os.path.dirname(__file__), "contract", "normalize.cases.json")
VOCAB = ["Expression", "Meaning", "Reading", "Sentence"]


def _con():
    con = build_db(os.path.join(tempfile.mkdtemp(), "c.anki2"))
    add_deck(con, 5, "Core")
    add_notetype(con, 7, "Japanese Vocab Dynamic", VOCAB)
    return con


class TestNormalizeWord(unittest.TestCase):
    def test_matches_the_shared_cases(self):
        # The dashboard's normalizeWord runs the same file. Both must agree.
        with open(CASES, encoding="utf-8") as fh:
            for raw, expected in json.load(fh):
                self.assertEqual(W.normalize_word(raw), expected, raw)


class TestWordIndex(unittest.TestCase):
    def test_indexes_word_kana_and_furigana_but_not_sentences(self):
        con = _con()
        add_note(con, 1, 7, ["近く", "vicinity", "近[ちか]く",
                             "私の家は駅の<b>近く</b>です。毎朝歩いて行けるのでとても便利です。"])
        add_card(con, 10, 1, 5, ctype=2, queue=2, ivl=30)
        idx = W.word_index(con)
        self.assertEqual(idx["known"], ["近く"])
        self.assertEqual((idx["learning"], idx["new"]), ([], []))

    def test_includes_bold_words_that_normalize_to_short_form(self):
        con = _con()
        # This field is 21 chars raw but only 14 chars after removing <b> tags.
        # It should be indexed because the normalized length is ≤ MAX_WORD_LEN.
        add_note(con, 1, 7, ["<b>" + "話" * 14 + "</b>", "", "", ""])
        add_card(con, 10, 1, 5, ctype=2, queue=2, ivl=30)
        idx = W.word_index(con)
        self.assertEqual(idx["known"], ["話" * 14])

    def test_skips_fields_without_japanese(self):
        con = _con()
        add_note(con, 1, 7, ["5261", "Friday", "きんようび", ""])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        self.assertEqual(W.word_index(con)["new"], ["きんようび"])

    def test_status_is_the_best_of_the_notes_cards(self):
        con = _con()
        add_note(con, 1, 7, ["話す", "", "", ""])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        add_card(con, 11, 1, 5, ctype=2, queue=2, ivl=5, ord_=1)
        self.assertEqual(W.word_index(con)["learning"], ["話す"])

    def test_mature_means_twenty_one_days(self):
        con = _con()
        add_note(con, 1, 7, ["話す", "", "", ""])
        add_card(con, 10, 1, 5, ctype=2, queue=2, ivl=20)
        add_note(con, 2, 7, ["聞く", "", "", ""])
        add_card(con, 11, 2, 5, ctype=2, queue=2, ivl=21)
        idx = W.word_index(con)
        self.assertEqual((idx["learning"], idx["known"]), (["話す"], ["聞く"]))

    def test_suspended_cards_are_ignored_but_buried_ones_count(self):
        con = _con()
        add_note(con, 1, 7, ["話す", "", "", ""])
        add_card(con, 10, 1, 5, ctype=2, queue=-1, ivl=30)
        add_note(con, 2, 7, ["聞く", "", "", ""])
        add_card(con, 11, 2, 5, ctype=2, queue=-3, ivl=30)
        idx = W.word_index(con)
        self.assertEqual(idx["known"], ["聞く"])
        self.assertNotIn("話す", idx["learning"] + idx["new"])

    def test_a_word_in_two_notes_keeps_its_best_status_once(self):
        con = _con()
        add_note(con, 1, 7, ["話す", "", "", ""])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        add_note(con, 2, 7, ["話す", "", "", ""])
        add_card(con, 11, 2, 5, ctype=2, queue=2, ivl=40)
        idx = W.word_index(con)
        self.assertEqual((idx["known"], idx["new"]), (["話す"], []))

    def test_skips_fields_named_like_sentences(self):
        con = _con()
        add_notetype(con, 8, "Sentence Notes", ["Expression", "Sentence", "Example"])
        add_note(con, 1, 8, ["話す", "短い文", "例文"])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        idx = W.word_index(con)
        self.assertEqual(idx["new"], ["話す"])

    def test_skips_values_with_sentence_punctuation(self):
        con = _con()
        add_note(con, 1, 7, ["蚊に足を刺された。", "", "", ""])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        add_note(con, 2, 7, ["本当？", "", "", ""])
        add_card(con, 11, 2, 5, ctype=0, queue=0)
        idx = W.word_index(con)
        self.assertEqual(idx["new"], [])

    def test_skips_spaced_kana(self):
        con = _con()
        add_note(con, 1, 7, ["", "", "きんようび の よる", ""])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        add_note(con, 2, 7, ["", "", "きんようび", ""])
        add_card(con, 11, 2, 5, ctype=0, queue=0)
        idx = W.word_index(con)
        self.assertEqual(idx["new"], ["きんようび"])

    def test_values_without_a_field_name_are_skipped(self):
        con = _con()
        add_notetype(con, 9, "One Field", ["Word"])
        add_note(con, 1, 9, ["話す", "聞く"])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        idx = W.word_index(con)
        self.assertEqual(idx["new"], ["話す"])

    def test_indexes_words_with_parenthetical_notes(self):
        con = _con()
        add_note(con, 1, 7, ["毎年 (xnen)", "", "", ""])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        idx = W.word_index(con)
        self.assertEqual(idx["new"], ["毎年"])

    def test_caps_the_index_keeping_known_words_first(self):
        con = _con()
        add_note(con, 1, 7, ["話す", "", "", ""])
        add_card(con, 10, 1, 5, ctype=0, queue=0)
        add_note(con, 2, 7, ["聞く", "", "", ""])
        add_card(con, 11, 2, 5, ctype=2, queue=2, ivl=40)
        old = W.MAX_WORDS
        W.MAX_WORDS = 1
        try:
            idx = W.word_index(con)
        finally:
            W.MAX_WORDS = old
        self.assertEqual(idx, {"known": ["聞く"], "learning": [], "new": []})


class TestNoteTypes(unittest.TestCase):
    def test_lists_types_that_have_an_unsuspended_card(self):
        con = _con()
        add_notetype(con, 8, "Unused", ["Front", "Back"])
        add_notetype(con, 9, "All suspended", ["Front", "Back"])
        add_note(con, 1, 7, ["話す", "", "", ""])
        add_card(con, 10, 1, 5)
        add_note(con, 2, 9, ["聞く", ""])
        add_card(con, 11, 2, 5, queue=-1)
        self.assertEqual(W.note_types(con), {"Japanese Vocab Dynamic": VOCAB})


class TestWordsHash(unittest.TestCase):
    def test_same_index_same_hash_and_any_change_differs(self):
        a = {"known": ["話す"], "learning": [], "new": []}
        b = {"known": ["話す"], "learning": [], "new": ["聞く"]}
        self.assertEqual(W.words_hash(a), W.words_hash(dict(a)))
        self.assertNotEqual(W.words_hash(a), W.words_hash(b))
