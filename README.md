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

## Deploying the dashboard

The web app needs four environment variables, documented in `web/.env.example`.
Set them on the Vercel project (and in `web/.env.local` for local development):

| Name | What it is |
| --- | --- |
| `INGEST_TOKENS` | JSON object mapping ingest token -> user id, e.g. `{"<token>":"jp"}`. One entry per person. |
| `READ_KEYS` | JSON object mapping read key -> user id. The key is the `?key=` in that person's dashboard link. |
| `KV_REST_API_URL` | Upstash Redis REST URL. The Vercel Upstash integration sets this for you. |
| `KV_REST_API_TOKEN` | Upstash Redis REST token, likewise. |

**Every token and key must be generated, never chosen.** The whole security
model is that the links are unguessable, so `?key=jp` would hand the dashboard
to anyone who tried it. Generate each one with `openssl rand -hex 16` or
`python -c "import secrets; print(secrets.token_hex(16))"`, and send each
person their own over a private channel.

All four are read at runtime, so rotating a token or key is an env var edit plus
a redeploy. None of them is needed at build time: `@upstash/redis` only warns
about missing config rather than throwing, so `next build` succeeds without a
database attached.

## Your dashboard

`<dashboard-url>/?key=<your-read-key>` — we'll send you your personal link once the dashboard is deployed.
