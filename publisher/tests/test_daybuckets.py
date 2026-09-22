import unittest
from datetime import datetime
from tests.fixtures import ms
import daybuckets as D


class TestDayKey(unittest.TestCase):
    def test_midday_review_belongs_to_that_calendar_day(self):
        self.assertEqual(D.day_key(ms(datetime(2026, 9, 21, 13, 0)), 4), "2026-09-21")

    def test_review_before_rollover_belongs_to_the_previous_day(self):
        # 3:30am with a 4am rollover is still "yesterday" to Anki.
        self.assertEqual(D.day_key(ms(datetime(2026, 9, 21, 3, 30)), 4), "2026-09-20")

    def test_rollover_hour_itself_starts_the_new_day(self):
        self.assertEqual(D.day_key(ms(datetime(2026, 9, 21, 4, 0)), 4), "2026-09-21")

    def test_one_minute_before_rollover_is_still_the_previous_day(self):
        self.assertEqual(D.day_key(ms(datetime(2026, 9, 21, 3, 59)), 4), "2026-09-20")

    def test_custom_rollover_hour_is_honoured(self):
        self.assertEqual(D.day_key(ms(datetime(2026, 9, 21, 1, 30)), 2), "2026-09-20")
        self.assertEqual(D.day_key(ms(datetime(2026, 9, 21, 2, 30)), 2), "2026-09-21")

    def test_zero_rollover_is_plain_midnight(self):
        self.assertEqual(D.day_key(ms(datetime(2026, 9, 21, 0, 5)), 0), "2026-09-21")

    def test_month_boundary(self):
        self.assertEqual(D.day_key(ms(datetime(2026, 10, 1, 2, 0)), 4), "2026-09-30")


class TestTodayKey(unittest.TestCase):
    def test_uses_supplied_now(self):
        self.assertEqual(D.today_key(4, now=datetime(2026, 9, 21, 3, 0)), "2026-09-20")


if __name__ == "__main__":
    unittest.main()
