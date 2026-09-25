# What's new — design

Date: 2026-09-25 · Status: approved in brainstorm, awaiting spec review

## 1. Why

Releases change how the dashboard works, and nobody reads a changelog or a
text from JP. The first one to need this is feed navigation: Adam's first look
at the new feed should come with a short explanation, inside the app.

**Success:** after a release, each existing person sees the new note once when
they open the app, can close it, and can find it again later. Someone brand
new sees nothing, because nothing has changed for them.

## 2. Scope

In: a notes list in code, a pop-up on arrival, a permanent link in the `?`
panel, the first note (feed navigation).

Out: server-side "seen" state (per-browser is enough; see §4), a welcome tour
for newcomers, any admin UI for writing notes. Future features that aren't
self-explanatory should add their own line to the `?` panel or a walkthrough;
that is their job, not this spec's.

## 3. Notes

`web/lib/whatsNew.ts` exports the notes, newest first:

```ts
export type Note = { id: string; date: string; title: string; items: string[] };
export const NOTES: Note[] = [ /* newest first */ ];
```

- `id` is stable and unique (e.g. `"2026-09-feed"`). `date` is display text.
- Items are one line each, brief and colloquial: what's new or what you can do.
- Each release that people will notice adds one entry in the same branch as
  the feature. Claude writes it; JP edits.

## 4. When the pop-up shows

Per browser, in localStorage key `anki-crew:whatsnew:v1` = id of the newest
note this browser has seen. One pure function decides:

```ts
unseenNotes(notes: Note[], lastSeenId: string | null, visitedBefore: boolean): Note[]
```

| Stored id | Visited before? | Result |
|---|---|---|
| present, found in `notes` | — | notes newer than it (may be empty) |
| present, not found in `notes` | — | `[]` (don't guess) |
| absent | yes | newest note only |
| absent | no | `[]`, and the page stores the newest id |

`visitedBefore` = `anki-crew:seen:v1` exists in localStorage. The page writes
that key on every load, so it must be read **before** the first load writes
it — i.e. at mount, alongside the hint check, before any `writeSeen`.

Closing the pop-up stores `NOTES[0].id`. Storage blocked or corrupt → treated
as absent / not visited → nothing shows, nothing breaks. With no notes at all,
nothing shows.

Accepted trade-off: someone using a phone and a laptop sees the pop-up once
on each; opening the app on a brand-new device after a release shows nothing
there (the `?` link still has it).

## 5. UI

- **Pop-up:** same overlay and pane styling as the shortcuts panel. Heading
  "What's new"; each note shows its title, date and bulleted items; multiple
  notes stack newest first. A **Got it** button closes it; tapping the backdrop
  or pressing Esc also closes it. All three count as seen.
- **Permanent link:** a "What's new" button at the bottom of the `?` panel
  opens the same pop-up showing all notes. Reopening from here changes nothing
  in storage beyond re-storing the newest id.
- If the pop-up and the first-visit hint bubble would both show, the pop-up
  sits above it (it's modal). In practice newcomers get only the hint and
  existing people have already dismissed it.
- Component: `web/app/components/WhatsNew.tsx` (presentational: takes notes and
  `onClose`). State and storage live in `page.tsx`, like the hint.

## 6. First note

> **Feed got an upgrade**
> - New comments show a number on Feed. Tap it to jump through them one by one ("Next unread" at the bottom of each).
> - Filter the feed to just misses, just comments, just one person, or just unread.
> - "Mark all read" if you're behind, ↑ to get back to the top.

## 7. Testing

- `web/lib/__tests__/whatsNew.test.ts`: every row of the §4 table, plus
  several missed notes returned newest first, plus empty `notes`.
- Page test: with `seen:v1` present and no whatsnew key, the pop-up shows;
  Got it closes it and stores the newest id; a remount doesn't show it again;
  with neither key, nothing shows and the id is stored; the `?` panel link
  reopens it.
- Full suite and `next build` pass.

## 8. Shipping

Ships on the `feed-navigation` branch together with feed navigation. Merge to
master and push (which deploys) only with JP's explicit yes.
