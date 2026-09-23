import json
import os
import tempfile
import unittest

import publish as P


class TestShouldPublish(unittest.TestCase):
    """
    The publisher runs every minute but must almost never do any work. It
    publishes once your collection goes quiet -- which in practice means a
    minute or so after you close Anki.
    """

    def test_does_nothing_when_the_collection_has_not_changed(self):
        self.assertFalse(P.should_publish(mtime=1000, last_mtime=1000, last_publish_at=900, now=5000))

    def test_does_nothing_while_you_are_still_studying(self):
        # Anki wrote 10 seconds ago and we published 30 seconds ago: mid-session.
        self.assertFalse(P.should_publish(mtime=4990, last_mtime=1000, last_publish_at=4970, now=5000))

    def test_publishes_once_the_collection_goes_quiet(self):
        # Last write was 60 seconds ago -- the session is over.
        self.assertTrue(P.should_publish(mtime=4940, last_mtime=1000, last_publish_at=4900, now=5000))

    def test_publishes_mid_session_if_it_has_been_a_while(self):
        # Still writing, but nothing has gone out for six minutes, so the
        # dashboard climbs during a long session instead of jumping at the end.
        self.assertTrue(P.should_publish(mtime=4995, last_mtime=1000, last_publish_at=4640, now=5000))

    def test_publishes_on_a_first_ever_run(self):
        self.assertTrue(P.should_publish(mtime=1000, last_mtime=None, last_publish_at=None, now=5000))

    def test_ignores_a_collection_older_than_the_last_publish(self):
        # Clock skew or a restored backup: an older file is not new work.
        self.assertFalse(P.should_publish(mtime=900, last_mtime=1000, last_publish_at=1100, now=5000))

    def test_quiet_period_boundary_is_inclusive(self):
        exactly = 5000 - P.QUIET_SECONDS
        self.assertTrue(P.should_publish(mtime=exactly, last_mtime=1, last_publish_at=4999, now=5000))


class TestState(unittest.TestCase):
    def setUp(self):
        self.path = os.path.join(tempfile.mkdtemp(), "state.json")

    def test_missing_state_reads_as_empty(self):
        self.assertEqual(P.read_state(self.path), {})

    def test_round_trips(self):
        P.write_state(self.path, {"lastMtime": 12.5, "lastPublishAt": 99})
        self.assertEqual(P.read_state(self.path)["lastMtime"], 12.5)

    def test_corrupt_state_reads_as_empty_rather_than_crashing(self):
        with open(self.path, "w", encoding="utf-8") as fh:
            fh.write("{not json")
        self.assertEqual(P.read_state(self.path), {})

    def test_state_is_written_atomically_enough_to_survive_a_reread(self):
        for i in range(3):
            P.write_state(self.path, {"lastMtime": i})
        self.assertEqual(P.read_state(self.path)["lastMtime"], 2)
        with open(self.path, encoding="utf-8") as fh:
            json.load(fh)  # must still be valid JSON


if __name__ == "__main__":
    unittest.main()
