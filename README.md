# Anki Crew

A shared dashboard for the three of us — who studied what, how much, and the actual cards we're each getting wrong.

## Setup

Takes about five minutes. Python 3.9 or newer, standard library only — no `pip install`, nothing else to set up.

```bash
git clone <repo-url>
cd anki-crew/publisher
python setup.py
python publish.py --dry-run
```

`setup.py` finds your Anki collection, asks for a display name and the ingest token we'll send you, and writes a local config file. `publish.py --dry-run` prints exactly what *would* be sent, without sending it — read it before you trust it.

`setup.py` finishes by printing one more command that turns on automatic publishing. Run that and you're done.

- **macOS** — it writes a launchd agent and prints a `cp` + `launchctl load` line. launchd rather than cron because cron doesn't run while your Mac is asleep and never catches up; launchd runs the missed check when you open the lid.
- **Windows** — it writes `install_task.ps1` and prints a one-line `powershell` command to run it.
- **Linux** — it prints a crontab line.

## How it syncs

The check runs every minute, but it does almost nothing: it looks at one file's timestamp and exits. It only publishes once your collection has changed *and* gone quiet for about 45 seconds — which in practice means **a minute or two after you close Anki**.

So the loop is: open the dashboard, study, close Anki, look again. There's also a refresh button, and `python publish.py` pushes immediately if you're impatient.

**If your machine was off, nothing is lost.** Every publish sends your entire history, not just what changed, so one run after a week away restores everything — every day, every streak, every card.

## What it touches

It never opens your real collection and never writes to it. It copies `collection.anki2` (and its `-wal`/`-shm` files) to a temp folder, reads the copy, and deletes it. Anki doesn't need to be closed. No add-on is installed, and nothing about your Anki setup changes.

## What gets shared

Once you're publishing, the other two can see:

- Your daily review counts, minutes studied, new cards, and the again/hard/good/easy breakdown
- Your current streak and all-time totals
- Which decks you've been studying
- **The front and back text of your ~200 most recently reviewed cards**

That last one is the point of the feed — you see the actual Japanese the others are working on, not just a number going up. Cram sessions and manual reschedules are excluded everywhere, so nobody can pad their numbers.

If that's more than you want to share, say so before you run `setup.py`.

You can also react to and comment on any card, and upload a profile picture from the **You** tab.

## Your dashboard

`<dashboard-url>/?key=<your-read-key>` — we'll send you your own link. Anyone with the link can see everything, so don't post it anywhere public.

## Running the dashboard yourself

Four environment variables, documented in `web/.env.example`:

| Name | What it is |
| --- | --- |
| `INGEST_TOKENS` | JSON object mapping ingest token → user id, e.g. `{"<token>":"jp"}`. One entry per person. |
| `READ_KEYS` | JSON object mapping read key → user id. The key is the `?key=` on that person's link. |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token. |

**Every token and key must be generated, never chosen.** The whole security model is that the links are unguessable, so `?key=jp` would hand the dashboard to anyone who tried it. Use `openssl rand -hex 16` or `python -c "import secrets; print(secrets.token_hex(16))"`, and send each person theirs privately.

All four are read at runtime, so rotating one is an env var edit plus a redeploy. None is needed at build time — `@upstash/redis` warns about missing config rather than throwing, so `next build` succeeds without a database attached.

## Tests

```bash
cd publisher && python -m unittest discover -s tests -t .   # 93
cd web && npm test                                          # 156
```
