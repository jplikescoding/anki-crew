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
    def test_windows_runs_a_powershell_installer(self):
        # The schtasks one-liner needs nested escaped quotes that PowerShell and
        # Git Bash both mangle, so Windows gets a file to run instead.
        with mock.patch.object(S.sys, "platform", "win32"):
            cmd = S.schedule_command("python.exe", r"C:\anki-crew\publisher")
        self.assertIn("powershell", cmd)
        self.assertIn("install_task.ps1", cmd)

    def test_windows_installer_script_names_the_task_and_the_quiet_python(self):
        import tempfile
        d = tempfile.mkdtemp()
        py = os.path.join(d, "python.exe")
        open(py, "w").close()
        open(os.path.join(d, "pythonw.exe"), "w").close()
        with mock.patch.object(S.sys, "platform", "win32"):
            path = S.write_task_script(d, py)
        body = open(path, encoding="utf-8").read()
        self.assertIn("AnkiCrewPublish", body)
        self.assertIn("--on-change", body)
        self.assertIn("pythonw.exe", body)
        self.assertIn("RepetitionInterval", body)

    def test_prefers_pythonw_so_no_console_ever_flashes(self):
        # A console window popping up every minute is what gets a task disabled.
        bindir = tempfile.mkdtemp()
        open(os.path.join(bindir, "pythonw.exe"), "wb").close()
        with mock.patch.object(S.sys, "platform", "win32"):
            self.assertIn("pythonw.exe", S.quiet_python(os.path.join(bindir, "python.exe")))

    def test_falls_back_when_pythonw_is_absent(self):
        bindir = tempfile.mkdtemp()
        exe = os.path.join(bindir, "python.exe")
        with mock.patch.object(S.sys, "platform", "win32"):
            self.assertEqual(S.quiet_python(exe), exe)

    def test_macos_loads_a_launch_agent_rather_than_a_cron_line(self):
        # cron does not run while a Mac sleeps and never catches up; launchd
        # fires the missed interval on wake, which is the whole point for a
        # laptop that stays shut for days.
        with mock.patch.object(S.sys, "platform", "darwin"):
            cmd = S.schedule_command("/usr/bin/python3", "/Users/x/anki-crew/publisher")
        self.assertIn("launchctl load", cmd)
        self.assertIn("LaunchAgents", cmd)
        self.assertNotIn("crontab", cmd)

    def test_macos_creates_the_launchagents_folder_first(self):
        # It does not exist on a fresh Mac; without this the copy fails.
        with mock.patch.object(S.sys, 'platform', 'darwin'):
            cmd = S.schedule_command('/usr/bin/python3', '/Users/x/anki-crew/publisher')
        self.assertTrue(cmd.startswith('mkdir -p ~/Library/LaunchAgents'))

    def test_macos_plist_runs_publish_on_change_every_minute(self):
        d = tempfile.mkdtemp()
        with mock.patch.object(S.sys, "platform", "darwin"):
            path = S.write_agent_plist(d, "/usr/bin/python3")
        import plistlib
        with open(path, "rb") as fh:
            agent = plistlib.load(fh)
        self.assertEqual(agent["Label"], "com.ankicrew.publish")
        self.assertIn("--on-change", agent["ProgramArguments"])
        self.assertEqual(agent["StartInterval"], 60)
        self.assertTrue(agent["RunAtLoad"])

    def test_linux_prints_a_cron_line(self):
        with mock.patch.object(S.sys, "platform", "linux"):
            cmd = S.schedule_command("/usr/bin/python3", "/home/x/anki-crew/publisher")
        self.assertTrue(cmd.startswith("* * * * *"))
        self.assertIn("--on-change", cmd)
        self.assertIn("publish.py", cmd)


class TestMacAgent(unittest.TestCase):
    def test_plist_is_valid_and_logs_somewhere_you_can_read(self):
        # With no log a background failure on a Mac is invisible.
        import plistlib
        d = tempfile.mkdtemp()
        with mock.patch.object(S.sys, "platform", "darwin"):
            path = S.write_agent_plist(d, "/usr/bin/python3")
        with open(path, "rb") as fh:
            agent = plistlib.load(fh)
        self.assertEqual(agent["StandardErrorPath"], os.path.join(d, "publish.log"))
        self.assertEqual(agent["StandardOutPath"], os.path.join(d, "publish.log"))

    def test_plist_survives_a_path_with_xml_characters(self):
        import plistlib
        d = os.path.join(tempfile.mkdtemp(), "R&D")
        os.makedirs(d)
        path = S.write_agent_plist(d, "/usr/bin/python3")
        with open(path, "rb") as fh:
            agent = plistlib.load(fh)
        self.assertEqual(agent["ProgramArguments"][1], os.path.join(d, "publish.py"))

    def test_rerunning_the_command_replaces_a_loaded_agent(self):
        # `launchctl load` refuses an agent that is already loaded.
        with mock.patch.object(S.sys, "platform", "darwin"):
            cmd = S.schedule_command("/usr/bin/python3", "/Users/x/anki-crew/publisher")
        self.assertLess(cmd.index("launchctl unload"), cmd.index("launchctl load"))

    def test_spots_folders_a_background_job_cannot_read(self):
        home = "/Users/x"
        self.assertEqual(S.protected_folder("/Users/x/Downloads/anki-crew/publisher", home), "Downloads")
        self.assertEqual(S.protected_folder("/Users/x/Documents/anki-crew/publisher", home), "Documents")
        self.assertEqual(S.protected_folder("/Users/x/Desktop/anki-crew/publisher", home), "Desktop")
        self.assertIsNone(S.protected_folder("/Users/x/anki-crew/publisher", home))
        self.assertIsNone(S.protected_folder("/Users/x/Documentsish/publisher", home))


class TestWriteConfig(unittest.TestCase):
    def test_writes_readable_json(self):
        path = os.path.join(tempfile.mkdtemp(), "config.json")
        S.write_config(path, {"user": "jp", "token": "t"})
        with open(path, encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["user"], "jp")


TOKEN = "0123456789abcdef0123456789abcdef"


class TestParseInvite(unittest.TestCase):
    def test_splits_user_and_token(self):
        self.assertEqual(S.parse_invite("harry-" + TOKEN), ("harry", TOKEN))

    def test_forgives_stray_whitespace_from_pasting(self):
        self.assertEqual(S.parse_invite("  harry-%s \n" % TOKEN), ("harry", TOKEN))

    def test_rejects_anything_else(self):
        for bad in ("", TOKEN, "harry", "harry-", "harry-" + TOKEN[:-1], "Harry-" + TOKEN):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                S.parse_invite(bad)


class TestEasySetup(unittest.TestCase):
    def run_easy(self, answers, found=("C:/anki/User 1/collection.anki2",),
                 publish_code=0, task_code=0):
        here = tempfile.mkdtemp()
        prompts = []

        def prompt(text):
            prompts.append(text)
            return answers.pop(0)

        publish_main = mock.Mock(return_value=publish_code)
        run_task = mock.Mock(return_value=task_code)
        with mock.patch("sys.stdout"):
            code = S.easy_setup(here, prompt, list(found), publish_main, run_task)
        cfg_path = os.path.join(here, "config.json")
        cfg = json.load(open(cfg_path, encoding="utf-8")) if os.path.exists(cfg_path) else None
        return code, cfg, prompts, publish_main, run_task

    def test_asks_only_for_invite_and_name_then_publishes_and_schedules(self):
        code, cfg, prompts, publish_main, run_task = self.run_easy(["harry-" + TOKEN, "Harry"])
        self.assertEqual(code, 0)
        self.assertEqual(len(prompts), 2)
        self.assertEqual(cfg, {
            "user": "harry", "displayName": "Harry", "tz": "local",
            "endpoint": S.DEFAULT_ENDPOINT, "token": TOKEN,
            "collection": "C:/anki/User 1/collection.anki2",
        })
        publish_main.assert_called_once_with([])
        run_task.assert_called_once()

    def test_asks_again_after_a_mistyped_invite(self):
        code, cfg, prompts, _, _ = self.run_easy(["harry", "harry-" + TOKEN, "Harry"])
        self.assertEqual(code, 0)
        self.assertEqual(len(prompts), 3)
        self.assertEqual(cfg["user"], "harry")

    def test_blank_name_falls_back_to_the_invite_id(self):
        _, cfg, _, _, _ = self.run_easy(["harry-" + TOKEN, "  "])
        self.assertEqual(cfg["displayName"], "harry")

    def test_stops_without_anki_before_asking_anything(self):
        code, cfg, prompts, publish_main, _ = self.run_easy([], found=())
        self.assertNotEqual(code, 0)
        self.assertEqual(prompts, [])
        self.assertIsNone(cfg)
        publish_main.assert_not_called()

    def test_failed_publish_does_not_schedule(self):
        code, _, _, _, run_task = self.run_easy(["harry-" + TOKEN, "Harry"], publish_code=4)
        self.assertNotEqual(code, 0)
        run_task.assert_not_called()

    def test_failed_schedule_is_reported(self):
        code, _, _, _, _ = self.run_easy(["harry-" + TOKEN, "Harry"], task_code=1)
        self.assertNotEqual(code, 0)


if __name__ == "__main__":
    unittest.main()
