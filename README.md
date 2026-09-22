# Anki Crew

A shared dashboard for the three of us to see each other's Anki study stats and recently reviewed cards.

## Setup (takes a few minutes)

```bash
git clone <repo-url>
cd anki-crew/publisher
python setup.py
python publish.py --dry-run
```

`setup.py` finds your collection, asks for a display name and your ingest token (we'll send you one), and writes a local config file. `publish.py --dry-run` prints what would be sent without sending it, so you can check it before trusting it.

`setup.py` finishes by printing a command to schedule `publish.py` to run hourly (`schtasks` on Windows, a `cron` line on Mac/Linux). Run that printed command to turn it on.

Python 3.9+, standard library only — no `pip install`, nothing else to set up.

## What it does and doesn't touch

It never opens your real collection and never writes to it. It copies `collection.anki2` (and its `-wal`/`-shm` files, if present) to a temp folder, reads the copy, and deletes it. Anki doesn't need to be closed. No add-on gets installed.

## What gets shared

Once you're running hourly, each teammate can see, per person:

- Daily review counts, minutes studied, new cards, and the again/hard/good/easy breakdown, plus a running streak and all-time totals
- Which decks you've been studying
- **The front/back text of your ~200 most recently reviewed cards** (cram/filtered sessions and manual reschedules are excluded)

That last one is the actual point of the feed — you'll see the real Japanese your teammates are studying, not just a number going up. If that's not something you want to share, say so before running `setup.py`.

## Your dashboard

`<dashboard-url>/?key=<your-read-key>` — we'll send you your personal link once the dashboard is deployed.
