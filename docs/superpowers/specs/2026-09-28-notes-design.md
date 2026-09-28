# Notes — design

Date: 2026-09-28 · Status: approved in conversation, awaiting spec review

## 1. Purpose

A shared crew library of short, hand-written study notes. JP already does deep
AI breakdowns and self-quizzing in Gemini plus a separate dashboard, so this is
not a personal notebook and has no AI. Its value is the crew: an insight one
person had about a card is visible to everyone, tied to the card it came from,
and browsable per person.

Adoption is unknown, so this is the smallest version that could work. If notes
take off, search, tags and replies come later; if not, little is lost.

**Success:** anyone can write a note from a feed card or from scratch in under
ten seconds; everyone can browse all notes or one person's; new notes from
others get noticed.

## 2. Out of scope

AI breakdowns, markdown, search, tags, replies or reactions on notes, quizzing,
notes surfacing on other cards that share the word, a cap on how many notes
exist.

## 3. What people see

### Notes tab

- Header becomes `Board · Feed · Notes · You`. Keys `1`–`4` follow that order,
  so **You moves from `3` to `4`**; the `?` shortcuts panel is updated.
- One compact person filter beside `+ New note`, not a row of chips: a styled
  `<select>` (same look as the card setup selects) reading `Everyone` by
  default, listing only people who have written at least one note, with counts
  — `Adam (3)`. Crew members who haven't joined or written anything take no
  space. Hidden while there are no notes. Session-only; resets to Everyone.
  If the chosen person's notes all get deleted, it falls back to Everyone.
- `+ New note` opens a text box at the top of the list.
- List is newest first (by created time). Each note: author avatar, name,
  relative time ("edited" marker if edited), then the text with line breaks
  kept. A note written from a card shows a small quote above the text:
  **word** — meaning, and the sentence on its own line if there is one.
- Your own notes show `Edit` and `Delete`. Edit swaps the text for the same box
  prefilled. Delete asks `Delete this note?` (inline confirm, not a browser
  dialog) before removing.
- Empty state (no notes at all): "No notes yet. Tap 📝 on any card in the Feed
  to add what you learned from it." (The filter only lists authors, so a
  filtered view is never empty.)

### From the feed

- Each feed card gets a `📝` button beside the reaction buttons. With notes on
  that card it reads `📝 2`.
- Tapping it expands, under the card: that card's notes (same rendering as the
  Notes tab, minus the card quote, which would repeat the card) and a text box
  to add one. Tapping again collapses it.
- Saving from a card stores a frozen copy of the card (§4) so the note stays
  readable after the card leaves the 500-card feed.

### Text box

- Plain text, up to 1,000 characters, with a counter shown from 900 on. Save
  is disabled when empty or over the limit. `Cancel` discards.
- Keyboard: Ctrl/Cmd+Enter saves. While the box has focus the page's single-key
  shortcuts (1–4, `?`) must not fire.

### Getting noticed

- The Notes tab label shows a count of notes by others created since you last
  opened the tab: `Notes 2`. Your own notes never count. Opening the tab clears
  it, on every device (§5).
- One What's new entry, one short sentence.

## 4. Data

```ts
type NoteCard = {
  itemId: string;     // feed item id it was written from
  word: string;
  meaning: string;
  sentence?: string;
};

type Note = {
  id: string;         // "<userId>:<createdAt>:<4 random base36 chars>"
  user: string;
  text: string;
  createdAt: number;  // epoch ms, server clock
  editedAt?: number;
  card?: NoteCard;
};
```

- Redis hash `notes`: field = note id, value = JSON `Note`. Loaded whole with
  one `hgetall`; fine for a crew of five. No cap.
- The card copy is taken in the browser with the existing `resolveCard` +
  `plainText` (so it matches what everyone saw under the owner's card setup),
  then frozen. Stored as plain text — no `<b>`.
- `CrewResponse` gains `notes: Note[]`, sorted newest first by the server.

## 5. Endpoints and read state

### `/api/note`

One route, keyed like the others (`?key=`; author from `userForRequest`, never
from the body).

| Method | Body | Result |
|---|---|---|
| `POST` | `{ text, card? }` | creates; returns `{ ok, note }` |
| `PUT` | `{ id, text }` | edits own note; sets `editedAt`; returns `{ ok, note }` |
| `DELETE` | `{ id }` | deletes own note; `{ ok }` |

Validation (400 unless noted):
- `text` string, trimmed, 1–1,000 chars.
- `card` optional; if present: `itemId` 1–128 chars, `word` 1–100,
  `meaning` 0–300, `sentence` optional 0–500, all strings. Unknown keys dropped.
- `id` string 1–128.
- Missing key → 401. Note not found → 404. Note belongs to someone else → 403.
- Card is not editable after creation; `PUT` only changes text.

### Unseen count

- Reuses the per-user `seen` hash and `/api/seen` with a reserved field
  `_notes` (exported constant beside `FLOOR`). `upTo` is the newest `createdAt`
  the page had shown, as for comments, so a note arriving after your last load
  stays unseen.
- `/api/seen` already rejects `FLOOR` as an `itemId`; `_notes` is allowed there
  on purpose (it is how the tab is marked). No other change to the route.
- Count = notes where `user !== viewer && createdAt > seen._notes`. Edits don't
  re-notify. `_floor` (Mark all read in the feed) does not clear notes.
- Opening the Notes tab marks it seen locally at once and posts in the
  background; `mergeSeen` already keeps the later time per field.

### Client writes

Same pattern as comments: apply locally first, send, and on failure reload and
show `your note didn't save` / `your note didn't delete`. A created note shows
immediately with a temporary id and is replaced by the server's copy on
success.

## 6. Safety

- Text renders as a React text node with `white-space: pre-wrap`; never as
  HTML. A pasted `<script>` shows as text.
- Size caps in §5 bound what one request can store.
- Ownership checked server-side on every edit and delete.

## 7. Files

- `web/lib/types.ts` — `Note`, `NoteCard`; `CrewResponse.notes`.
- `web/lib/store.ts` — `getNotes`, `addNote`, `editNote`, `deleteNote`.
- `web/lib/notes.ts` (new) — pure helpers: validate body, count unseen, notes
  by card id, filter by person.
- `web/lib/unread.ts` — `NOTES_SEEN = "_notes"`.
- `web/app/api/note/route.ts` (new).
- `web/app/api/crew/route.ts` — include notes.
- `web/app/components/Notes.tsx` (new) — tab, chips, list, composer.
- `web/app/components/NoteItem.tsx` (new) — one note + edit/delete; shared by
  the tab and the feed.
- `web/app/components/FeedCard.tsx` — `📝` button and the expanded card notes.
- `web/app/page.tsx` — tab, keys, count, handlers.
- `web/lib/whatsNew.ts` — one entry.

## 8. Testing

- `notes` helpers: validation edges (empty, 1,000 vs 1,001, card field caps,
  unknown keys dropped), unseen count (own excluded, edits don't count, `_notes`
  boundary), grouping by card.
- `/api/note`: 401, create returns author from key, 403 on someone else's
  edit/delete, 404 on unknown id, `editedAt` set.
- `Notes` component: filter lists only authors with counts, filters the list, falls back to Everyone, empty state, edit/delete only
  on own notes, delete confirm, card quote shown.
- `FeedCard`: `📝 2` count, expand shows that card's notes, saving sends a card
  copy built from the card setup.
- `page`: key `3` opens Notes and `4` opens You; count shows and clears on
  opening the tab; shortcuts don't fire while typing a note; failed save
  reloads and says so.
