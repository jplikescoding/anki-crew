"""One-time setup: find the collection, write config.json, print the schedule line."""
import json
import os
import plistlib
import sys

from collection_paths import find_collections

TASK_NAME = "AnkiCrewPublish"


def choose_collection(found, prompt):
    if not found:
        return ""
    if len(found) == 1:
        return str(found[0])
    lines = ["Multiple Anki profiles found:"]
    for i, path in enumerate(found, 1):
        lines.append("  %d) %s" % (i, path))
    lines.append("Which one? [1] ")
    answer = prompt("\n".join(lines)).strip()
    index = int(answer) - 1 if answer.isdigit() else 0
    return str(found[index]) if 0 <= index < len(found) else str(found[0])


def quiet_python(python_exe):
    """pythonw.exe runs with no console, so nothing flashes on the desktop."""
    if sys.platform.startswith("win"):
        quiet = os.path.join(os.path.dirname(python_exe), "pythonw.exe")
        if os.path.exists(quiet):
            return quiet
    return python_exe


def write_task_script(script_dir, python_exe):
    """
    Writes a PowerShell installer for the scheduled task and returns its path.

    Windows scheduling is written to a file rather than printed as a one-liner
    because the `schtasks` form needs nested escaped quotes that PowerShell and
    Git Bash both mangle -- it works only in cmd.exe, which is not where anyone
    is standing any more. A file you can read before running it is also easier
    to trust than a wall of escaping.
    """
    publish = os.path.join(script_dir, "publish.py")
    path = os.path.join(script_dir, "install_task.ps1")
    body = (
        "# Publishes your Anki stats once your collection goes quiet.\n"
        "# Runs every minute, but does nothing at all unless you have studied.\n"
        "$action  = New-ScheduledTaskAction -Execute '%s' -Argument '\"%s\" --on-change'\n"
        "$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) "
        "-RepetitionInterval (New-TimeSpan -Minutes 1) "
        "-RepetitionDuration (New-TimeSpan -Days 3650)\n"
        "$set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries "
        "-DontStopIfGoingOnBatteries -StartWhenAvailable "
        "-ExecutionTimeLimit (New-TimeSpan -Minutes 5)\n"
        "Register-ScheduledTask -TaskName '%s' -Action $action -Trigger $trigger "
        "-Settings $set -Force | Out-Null\n"
        "Write-Host 'Installed. It will publish a minute or two after you close Anki.'\n"
        % (quiet_python(python_exe), publish, TASK_NAME)
    )
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(body)
    return path


AGENT_LABEL = "com.ankicrew.publish"


def write_agent_plist(script_dir, python_exe):
    """
    Writes a launchd agent and returns its path.

    launchd rather than cron because both of these machines are laptops: cron
    does not run while a Mac is asleep and never catches up afterwards, so a
    lid that stays shut until Thursday would simply lose the week. launchd
    fires a missed StartInterval when the machine wakes.
    """
    path = os.path.join(script_dir, "%s.plist" % AGENT_LABEL)
    # A background job's output goes nowhere unless it is sent somewhere, and
    # this is the only way to see why a Mac is not publishing.
    log = os.path.join(script_dir, "publish.log")
    agent = {
        "Label": AGENT_LABEL,
        "ProgramArguments": [python_exe, os.path.join(script_dir, "publish.py"), "--on-change"],
        # Every minute, but a run with nothing new costs one file stat.
        "StartInterval": 60,
        "RunAtLoad": True,
        "StandardOutPath": log,
        "StandardErrorPath": log,
    }
    with open(path, "wb") as fh:
        plistlib.dump(agent, fh)
    return path


# macOS privacy protection stops a background job reading these folders, so a
# publisher cloned into one of them installs fine and then never runs.
PROTECTED_MAC_FOLDERS = ("Desktop", "Documents", "Downloads")


def protected_folder(script_dir, home=None):
    """The protected folder script_dir sits in, or None."""
    home = (home or os.path.expanduser("~")).rstrip("/")
    for name in PROTECTED_MAC_FOLDERS:
        root = "%s/%s" % (home, name)  # macOS-only, so always "/"
        if script_dir == root or script_dir.startswith(root + "/"):
            return name
    return None


def schedule_command(python_exe, script_dir):
    """The command a person runs to turn on automatic publishing."""
    if sys.platform.startswith("win"):
        return 'powershell -ExecutionPolicy Bypass -File "%s"' % os.path.join(
            script_dir, "install_task.ps1")
    if sys.platform == "darwin":
        plist = os.path.join(script_dir, "%s.plist" % AGENT_LABEL)
        target = "~/Library/LaunchAgents/%s.plist" % AGENT_LABEL
        # LaunchAgents does not exist on a fresh Mac, so create it first --
        # otherwise the copy fails and the person is stuck on step one.
        # `launchctl load` refuses an agent that is already loaded, so a second
        # run of setup unloads the old one first.
        return ('mkdir -p ~/Library/LaunchAgents && cp "%s" %s && '
                '(launchctl unload %s 2>/dev/null || true) && launchctl load %s'
                % (plist, target, target, target))
    publish = os.path.join(script_dir, "publish.py")
    return '* * * * * "%s" "%s" --on-change >/dev/null 2>&1' % (python_exe, publish)


def write_config(path, cfg):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, indent=2)
        fh.write("\n")


def main(argv=None):
    here = os.path.dirname(os.path.abspath(__file__))
    blocked = protected_folder(here) if sys.platform == "darwin" else None
    if blocked:
        print("macOS won't let the background publisher read files in your %s folder.\n"
              "Move the anki-crew folder to your home folder, then run setup again:\n\n"
              '  mv "%s" ~/ && cd ~/anki-crew/publisher && python3 setup.py'
              % (blocked, os.path.dirname(here)))
        return 1
    found = find_collections()
    collection = choose_collection(found, input)
    if not collection:
        collection = input("Full path to collection.anki2: ").strip()

    cfg = {
        "user": input("Short id (lowercase, no spaces, e.g. jp): ").strip(),
        "displayName": input("Display name: ").strip(),
        "tz": input("Timezone label (e.g. America/New_York): ").strip() or "local",
        "endpoint": input("Ingest URL (ends in /api/ingest): ").strip(),
        "token": input("Your ingest token: ").strip(),
        "collection": collection,
    }
    path = os.path.join(here, "config.json")
    write_config(path, cfg)
    print("\nWrote %s" % path)
    py = "python" if sys.platform.startswith("win") else "python3"
    print("\nTest it:\n  %s publish.py --dry-run" % py)
    # --dry-run never touches the network, so without this the first real send
    # would happen in the background, where a failure is easy to miss.
    print("\nThen send it once for real, and check it says 'published':\n  %s publish.py" % py)
    if sys.platform.startswith("win"):
        write_task_script(here, sys.executable)
        print("\nThen turn on automatic publishing:\n  %s"
              % schedule_command(sys.executable, here))
    elif sys.platform == "darwin":
        write_agent_plist(here, sys.executable)
        print("\nThen turn on automatic publishing:\n  %s"
              % schedule_command(sys.executable, here))
    else:
        print("\nThen add this line to your crontab (`crontab -e`):\n  %s"
              % schedule_command(sys.executable, here))
    return 0


if __name__ == "__main__":
    sys.exit(main())
