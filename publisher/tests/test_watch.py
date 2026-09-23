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


class TestCollectionMtime(unittest.TestCase):
    """Anki writes reviews into collection.anki2-wal while you study, and only
    folds them into the main file at a checkpoint or on close."""

    def setUp(self):
        self.src = os.path.join(tempfile.mkdtemp(), "collection.anki2")
        open(self.src, "w").close()
        os.utime(self.src, (1000, 1000))

    def test_uses_the_main_file_when_there_is_no_wal(self):
        self.assertEqual(P.collection_mtime(self.src), 1000)

    def test_sees_a_session_that_has_only_reached_the_wal(self):
        open(self.src + "-wal", "w").close()
        os.utime(self.src + "-wal", (2000, 2000))
        self.assertEqual(P.collection_mtime(self.src), 2000)

    def test_ignores_a_wal_older_than_the_main_file(self):
        open(self.src + "-wal", "w").close()
        os.utime(self.src + "-wal", (500, 500))
        self.assertEqual(P.collection_mtime(self.src), 1000)


class TestBackingOff(unittest.TestCase):
    """A failed send leaves the collection 'changed', so without a pause every
    minute would copy the whole thing again until the network came back."""

    def test_waits_after_a_recent_failure(self):
        self.assertTrue(P.backing_off({"lastFailAt": 1000}, now=1000 + 60))

    def test_tries_again_once_the_pause_is_over(self):
        self.assertFalse(P.backing_off({"lastFailAt": 1000}, now=1000 + P.RETRY_SECONDS))

    def test_does_not_wait_when_nothing_has_failed(self):
        self.assertFalse(P.backing_off({}, now=1000))


if __name__ == "__main__":
    unittest.main()
