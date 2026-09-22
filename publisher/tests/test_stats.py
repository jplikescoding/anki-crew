import os, tempfile, unittest
from datetime import datetime
from tests.fixtures import build_db, add_deck, add_note, add_card, add_review, ms
import stats as S

DECKS = {5: "Core 2k/6k", 6: "Listening"}


def _seeded():
    con = build_db(os.path.join(tempfile.mkdtemp(), "c.anki2"))
    add_deck(con, 5, "Core 2k/6k")
    add_deck(con, 6, "Listening")
    add_note(con, 100, 1, ["話す", "to speak"])
    add_note(con, 101, 1, ["聞く", "to listen"])
    add_card(con, 200, 100, 5)
    add_card(con, 201, 101, 6)
    return con


class TestDailyRows(unittest.TestCase):
    def test_counts_reviews_and_minutes_per_day(self):
        con = _seeded()
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200, time_ms=30000)
        add_review(con, ms(datetime(2026, 9, 21, 10, 1)), 201, time_ms=30000)
        rows = S.daily_rows(con, 4, DECKS)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["date"], "2026-09-21")
        self.assertEqual(rows[0]["reviews"], 2)
        self.assertEqual(rows[0]["minutes"], 1.0)

    def test_cram_and_manual_reviews_are_excluded(self):
        # A cram session (type 3) and a reschedule (type 4) must not inflate counts.
        con = _seeded()
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200, rtype=1)
        add_review(con, ms(datetime(2026, 9, 21, 10, 1)), 200, rtype=3)
        add_review(con, ms(datetime(2026, 9, 21, 10, 2)), 200, rtype=4)
        rows = S.daily_rows(con, 4, DECKS)
        self.assertEqual(rows[0]["reviews"], 1)

    def test_learn_and_relearn_do_count(self):
        con = _seeded()
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200, rtype=0)
        add_review(con, ms(datetime(2026, 9, 21, 10, 1)), 200, rtype=2)
        self.assertEqual(S.daily_rows(con, 4, DECKS)[0]["reviews"], 2)

    def test_ease_counts_are_broken_out(self):
        con = _seeded()
        for i, ease in enumerate((1, 1, 3, 4)):
            add_review(con, ms(datetime(2026, 9, 21, 10, ease)) + ease + i, 200, ease=ease)
        row = S.daily_rows(con, 4, DECKS)[0]
        self.assertEqual((row["ease1"], row["ease2"], row["ease3"], row["ease4"]),
                         (2, 0, 1, 1))

    def test_per_deck_counts_split_by_deck_name(self):
        con = _seeded()
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200)
        add_review(con, ms(datetime(2026, 9, 21, 10, 1)), 201)
        add_review(con, ms(datetime(2026, 9, 21, 10, 2)), 201)
        self.assertEqual(S.daily_rows(con, 4, DECKS)[0]["perDeck"],
                         {"Core 2k/6k": 1, "Listening": 2})

    def test_early_morning_review_lands_on_the_previous_day(self):
        con = _seeded()
        add_review(con, ms(datetime(2026, 9, 21, 2, 0)), 200)
        self.assertEqual(S.daily_rows(con, 4, DECKS)[0]["date"], "2026-09-20")

    def test_new_cards_counted_on_the_day_of_their_first_review(self):
        con = _seeded()
        add_review(con, ms(datetime(2026, 9, 20, 10, 0)), 200, rtype=0)
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200, rtype=1)
        add_review(con, ms(datetime(2026, 9, 21, 10, 1)), 201, rtype=0)
        rows = {r["date"]: r for r in S.daily_rows(con, 4, DECKS)}
        self.assertEqual(rows["2026-09-20"]["newCards"], 1)
        self.assertEqual(rows["2026-09-21"]["newCards"], 1)

    def test_rows_are_sorted_ascending(self):
        con = _seeded()
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200)
        add_review(con, ms(datetime(2026, 9, 19, 10, 0)), 201)
        self.assertEqual([r["date"] for r in S.daily_rows(con, 4, DECKS)],
                         ["2026-09-19", "2026-09-21"])

    def test_unknown_deck_id_does_not_crash(self):
        con = _seeded()
        add_card(con, 202, 100, 999)
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 202)
        self.assertIn("Unknown", S.daily_rows(con, 4, DECKS)[0]["perDeck"])


class TestAllTime(unittest.TestCase):
    def test_totals_exclude_cram(self):
        con = _seeded()
        first = ms(datetime(2026, 9, 19, 10, 0))
        add_review(con, first, 200)
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200, rtype=3)
        self.assertEqual(S.all_time(con), {"reviews": 1, "firstReviewAt": first})

    def test_empty_collection(self):
        con = _seeded()
        self.assertEqual(S.all_time(con), {"reviews": 0, "firstReviewAt": 0})


class TestStreak(unittest.TestCase):
    def _rows(self, *dates):
        return [{"date": d, "reviews": 1} for d in dates]

    def test_counts_back_from_today(self):
        rows = self._rows("2026-09-19", "2026-09-20", "2026-09-21")
        self.assertEqual(S.current_streak(rows, "2026-09-21"), 3)

    def test_gap_breaks_the_streak(self):
        rows = self._rows("2026-09-18", "2026-09-20", "2026-09-21")
        self.assertEqual(S.current_streak(rows, "2026-09-21"), 2)

    def test_yesterday_only_still_counts_since_today_is_not_over(self):
        rows = self._rows("2026-09-19", "2026-09-20")
        self.assertEqual(S.current_streak(rows, "2026-09-21"), 2)

    def test_nothing_yesterday_or_today_is_zero(self):
        rows = self._rows("2026-09-01")
        self.assertEqual(S.current_streak(rows, "2026-09-21"), 0)

    def test_zero_review_days_do_not_extend_a_streak(self):
        rows = [{"date": "2026-09-20", "reviews": 0}, {"date": "2026-09-21", "reviews": 1}]
        self.assertEqual(S.current_streak(rows, "2026-09-21"), 1)

    def test_no_history_is_zero(self):
        self.assertEqual(S.current_streak([], "2026-09-21"), 0)


if __name__ == "__main__":
    unittest.main()
