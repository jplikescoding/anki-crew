"""One-time setup: find the collection, write config.json, print the schedule line."""
import json
import os
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


def schedule_command(python_exe, script_dir):
    script = os.path.join(script_dir, "publish.py")
    if sys.platform.startswith("win"):
        # Runs every minute, but --on-change means a run with nothing new costs
        # one file stat and exits: no network, no database, no window. pythonw.exe
        # has no console, so nothing ever flashes on the desktop.
        quiet = os.path.join(os.path.dirname(python_exe), "pythonw.exe")
        if os.path.exists(quiet):
            python_exe = quiet
        return ('schtasks /create /tn %s /sc minute /mo 1 /f '
                '/tr "\\"%s\\" \\"%s\\" --on-change"'
                % (TASK_NAME, python_exe, script))
    return '* * * * * "%s" "%s" --on-change >/dev/null 2>&1' % (python_exe, script)


def write_config(path, cfg):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(cfg, fh, indent=2)
        fh.write("\n")


def main(argv=None):
    here = os.path.dirname(os.path.abspath(__file__))
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
    print("\nTest it:\n  python publish.py --dry-run")
    print("\nThen schedule it hourly:\n  %s" % schedule_command(sys.executable, here))
    return 0


if __name__ == "__main__":
    sys.exit(main())
