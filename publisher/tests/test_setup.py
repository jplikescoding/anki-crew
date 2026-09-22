import json, os, tempfile, unittest
from unittest import mock
import setup as S


class TestChooseCollection(unittest.TestCase):
    def test_single_collection_needs_no_prompt(self):
        self.assertEqual(S.choose_collection(["/a/collection.anki2"], lambda _: "x"),
                         "/a/collection.anki2")

    def test_multiple_collections_prompt_by_number(self):
        found = ["/a/collection.anki2", "/b/collection.anki2"]
        self.assertEqual(S.choose_collection(found, lambda _: "2"), "/b/collection.anki2")

    def test_no_collections_returns_empty_for_manual_entry(self):
        self.assertEqual(S.choose_collection([], lambda _: ""), "")


class TestScheduleCommand(unittest.TestCase):
    def test_windows_uses_schtasks_hourly(self):
        with mock.patch.object(S.sys, "platform", "win32"):
            cmd = S.schedule_command("python.exe", r"C:\anki-crew\publisher")
        self.assertIn("schtasks", cmd)
        self.assertIn("/sc hourly", cmd.lower())
        self.assertIn("AnkiCrewPublish", cmd)

    def test_unix_prints_a_cron_line(self):
        with mock.patch.object(S.sys, "platform", "darwin"):
            cmd = S.schedule_command("/usr/bin/python3", "/home/x/anki-crew/publisher")
        self.assertTrue(cmd.startswith("0 * * * *"))
        self.assertIn("publish.py", cmd)


class TestWriteConfig(unittest.TestCase):
    def test_writes_readable_json(self):
        path = os.path.join(tempfile.mkdtemp(), "config.json")
        S.write_config(path, {"user": "jp", "token": "t"})
        with open(path, encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["user"], "jp")


if __name__ == "__main__":
    unittest.main()
