"""Where Anki keeps collection.anki2, per platform."""
import os
import sys
from pathlib import Path


def candidate_roots():
    """Directories that may contain one profile folder per Anki profile."""
    if sys.platform.startswith("win"):
        appdata = os.environ.get("APPDATA")
        return [Path(appdata) / "Anki2"] if appdata else []
    if sys.platform == "darwin":
        return [Path.home() / "Library" / "Application Support" / "Anki2"]
    return [Path.home() / ".local" / "share" / "Anki2", Path.home() / "Anki2"]


def find_collections():
    """Every collection.anki2 found, sorted. Empty list if Anki is not installed."""
    out = []
    for root in candidate_roots():
        if not root.is_dir():
            continue
        out.extend(sorted(root.glob("*/collection.anki2")))
    return out
