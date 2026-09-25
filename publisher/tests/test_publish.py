import io, json, os, tempfile, unittest
from datetime import datetime
from unittest import mock
from tests.fixtures import build_db, add_deck, add_note, add_card, add_review, add_notetype, set_config, ms
import publish as P

CONTRACT = os.path.join(os.path.dirname(__file__), "contract", "payload.sample.json")


def _seeded():
    con = build_db(os.path.join(tempfile.mkdtemp(), "c.anki2"))
    set_config(con, "rollover", 4)
    add_deck(con, 5, "Core 2k/6k")
    add_notetype(con, 1, "Japanese Vocab Dynamic", ["Expression", "Meaning"])
    add_note(con, 100, 1, ["話す", "to speak"])
    add_card(con, 200, 100, 5, ivl=21)
    add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200, ease=3, time_ms=30000)
    return con


class TestBuildPayload(unittest.TestCase):
    def test_payload_has_every_contract_key(self):
        payload = P.build_payload(_seeded(), "jp", "JP", "America/New_York", 4)
        self.assertEqual(
            sorted(payload),
            ["allTime", "days", "displayName", "generatedAt", "noteTypes", "recentCards",
             "streak", "todayKey", "tz", "user", "words"])

    def test_today_key_and_streak_come_from_the_publisher(self):
        # Only this machine knows its own rollover hour and local clock, so the
        # server can never compute these correctly for three timezones.
        con = _seeded()
        payload = P.build_payload(con, "jp", "JP", "UTC", 4,
                                  now=datetime(2026, 9, 21, 12, 0))
        self.assertEqual(payload["todayKey"], "2026-09-21")
        self.assertEqual(payload["streak"], 1)

    def test_days_carry_the_full_history_not_a_window(self):
        con = _seeded()
        add_review(con, ms(datetime(2020, 1, 1, 10, 0)), 200)
        dates = [d["date"] for d in P.build_payload(con, "jp", "JP", "UTC", 4)["days"]]
        self.assertIn("2020-01-01", dates)

    def test_feed_items_are_stamped_with_the_user(self):
        payload = P.build_payload(_seeded(), "jp", "JP", "UTC", 4)
        self.assertTrue(payload["recentCards"][0]["id"].startswith("jp:"))

    def test_payload_carries_note_types_and_the_word_index(self):
        payload = P.build_payload(_seeded(), "jp", "JP", "UTC", 4)
        self.assertEqual(payload["noteTypes"], {"Japanese Vocab Dynamic": ["Expression", "Meaning"]})
        self.assertEqual(payload["words"]["known"], ["話す"])

    def test_matches_the_committed_contract_fixture(self):
        # The web tests load this same file. If the shape changes, both sides fail.
        with open(CONTRACT, encoding="utf-8") as fh:
            sample = json.load(fh)
        payload = P.build_payload(_seeded(), "jp", "JP", "America/New_York", 4)
        self.assertEqual(sorted(sample), sorted(payload))
        self.assertEqual(sorted(sample["days"][0]), sorted(payload["days"][0]))
        self.assertEqual(sorted(sample["recentCards"][0]), sorted(payload["recentCards"][0]))


class TestPostPayload(unittest.TestCase):
    def test_sends_bearer_token_and_json(self):
        captured = {}

        class FakeResponse:
            status = 200
            def read(self): return b'{"ok":true}'
            def __enter__(self): return self
            def __exit__(self, *a): return False

        def fake_urlopen(req, timeout=None):
            captured["url"] = req.full_url
            captured["auth"] = req.get_header("Authorization")
            captured["body"] = json.loads(req.data.decode("utf-8"))
            return FakeResponse()

        with mock.patch.object(P.urllib.request, "urlopen", fake_urlopen):
            P.post_payload("https://x.test/api/ingest", "tok", {"user": "jp"})
        self.assertEqual(captured["url"], "https://x.test/api/ingest")
        self.assertEqual(captured["auth"], "Bearer tok")
        self.assertEqual(captured["body"], {"user": "jp"})


class TestUnreadableCollection(unittest.TestCase):
    def test_missing_collection_prints_the_path_and_returns_its_own_code(self):
        # An hourly headless task must not end in a shutil traceback.
        tmp = tempfile.mkdtemp()
        missing = os.path.join(tmp, "collection.anki2")
        cfg_path = os.path.join(tmp, "config.json")
        with open(cfg_path, "w", encoding="utf-8") as fh:
            json.dump({"user": "jp", "displayName": "JP", "endpoint": "https://x.test",
                       "token": "t", "collection": missing}, fh)
        err = io.StringIO()
        with mock.patch.object(P.sys, "stderr", err):
            code = P.main(["--config", cfg_path, "--dry-run"])
        self.assertEqual(code, P.EXIT_UNREADABLE_COLLECTION)
        self.assertNotIn(code, (0, 2, 3, 4))
        self.assertIn(missing, err.getvalue())


class TestLoadConfig(unittest.TestCase):
    def test_missing_keys_raise_a_named_error(self):
        path = os.path.join(tempfile.mkdtemp(), "config.json")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"user": "jp"}, fh)
        with self.assertRaises(P.ConfigError) as ctx:
            P.load_config(path)
        self.assertIn("endpoint", str(ctx.exception))


class TestWordsHashSkip(unittest.TestCase):
    def test_drops_the_index_when_the_server_already_has_it(self):
        payload = {"user": "jp", "words": {"known": ["話す"], "learning": [], "new": []}}
        _, h = P.without_unchanged_words(payload, None)
        sent, h2 = P.without_unchanged_words(payload, h)
        self.assertNotIn("words", sent)
        self.assertEqual(h, h2)
        self.assertIn("words", payload)  # the original is left alone

    def test_sends_the_index_when_it_changed(self):
        payload = {"user": "jp", "words": {"known": ["話す"], "learning": [], "new": []}}
        sent, _ = P.without_unchanged_words(payload, "stale")
        self.assertIn("words", sent)


class TestMainState(unittest.TestCase):
    def _setup(self):
        tmp = tempfile.mkdtemp()
        src = os.path.join(tmp, "collection.anki2")
        con = build_db(src)
        set_config(con, "rollover", 4)
        add_deck(con, 5, "Core")
        add_notetype(con, 1, "Japanese Vocab Dynamic", ["Expression", "Meaning"])
        add_note(con, 100, 1, ["話す", "to speak"])
        add_card(con, 200, 100, 5, ivl=21)
        add_review(con, ms(datetime(2026, 9, 21, 10, 0)), 200)
        con.close()
        cfg = os.path.join(tmp, "config.json")
        with open(cfg, "w", encoding="utf-8") as fh:
            json.dump({"user": "jp", "displayName": "JP", "endpoint": "https://x.test",
                       "token": "t", "collection": src}, fh)
        return cfg, os.path.join(tmp, "state.json")

    def test_second_publish_leaves_out_an_unchanged_index(self):
        cfg, state = self._setup()
        sent = []
        with mock.patch.object(P, "STATE_FILE", state), \
             mock.patch.object(P, "post_payload", lambda e, t, p: sent.append(p) or {}), \
             mock.patch.object(P.sys, "stdout", io.StringIO()):
            self.assertEqual(P.main(["--config", cfg]), 0)
            self.assertEqual(P.main(["--config", cfg]), 0)
        self.assertIn("words", sent[0])
        self.assertNotIn("words", sent[1])
        self.assertIn("wordsHash", P.read_state(state))

    def test_a_failed_send_does_not_record_the_hash(self):
        cfg, state = self._setup()

        def fail(*_a):
            raise OSError("offline")

        with mock.patch.object(P, "STATE_FILE", state), \
             mock.patch.object(P, "post_payload", fail), \
             mock.patch.object(P.sys, "stderr", io.StringIO()):
            self.assertEqual(P.main(["--config", cfg]), 4)
        self.assertNotIn("wordsHash", P.read_state(state))

    def test_dry_run_prints_sizes_and_note_types_without_posting(self):
        cfg, state = self._setup()
        out = io.StringIO()
        with mock.patch.object(P, "STATE_FILE", state), \
             mock.patch.object(P, "post_payload", mock.Mock(side_effect=AssertionError)), \
             mock.patch.object(P.sys, "stdout", out):
            self.assertEqual(P.main(["--config", cfg, "--dry-run"]), 0)
        text = out.getvalue()
        self.assertIn("Japanese Vocab Dynamic: Expression, Meaning", text)
        self.assertIn("words: 1 known, 0 learning, 0 new", text)
        self.assertIn("payload:", text)
        self.assertEqual(P.read_state(state), {})


if __name__ == "__main__":
    unittest.main()
