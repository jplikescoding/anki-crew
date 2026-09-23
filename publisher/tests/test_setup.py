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
        body = open(path, encoding="utf-8").read()
        self.assertIn("com.ankicrew.publish", body)
        self.assertIn("--on-change", body)
        self.assertIn("<key>StartInterval</key><integer>60</integer>", body)
        self.assertIn("RunAtLoad", body)

    def test_linux_prints_a_cron_line(self):
        with mock.patch.object(S.sys, "platform", "linux"):
            cmd = S.schedule_command("/usr/bin/python3", "/home/x/anki-crew/publisher")
        self.assertTrue(cmd.startswith("* * * * *"))
        self.assertIn("--on-change", cmd)
        self.assertIn("publish.py", cmd)


class TestWriteConfig(unittest.TestCase):
    def test_writes_readable_json(self):
        path = os.path.join(tempfile.mkdtemp(), "config.json")
        S.write_config(path, {"user": "jp", "token": "t"})
        with open(path, encoding="utf-8") as fh:
            self.assertEqual(json.load(fh)["user"], "jp")


if __name__ == "__main__":
    unittest.main()
