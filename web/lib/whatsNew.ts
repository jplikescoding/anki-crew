/**
 * Release notes shown inside the app, so nobody has to be told in person.
 *
 * Each release people will notice adds one entry at the top, in the same
 * branch as the feature. Keep them short: what's new, or what you can do now.
 */
export type Note = { id: string; date: string; title: string; items: string[] };

export const NOTES: Note[] = [
  {
    id: "2026-09-feed",
    date: "September 2026",
    title: "Feed got an upgrade",
    items: [
      "New comments show a number on Feed. Tap it to jump through them one by one (\"Next unread\" at the bottom of each).",
      "Filter the feed to just misses, just comments, just one person, or just unread.",
      "\"Mark all read\" if you're behind, ↑ to get back to the top.",
    ],
  },
];

const KEY = "anki-crew:whatsnew:v1";

/**
 * The notes to pop up. Someone brand new gets none: nothing changed for them.
 * Someone who was here before notes existed gets just the newest. An id we
 * don't recognise gets none, rather than a guess at what they missed.
 */
export function unseenNotes(notes: Note[], lastSeenId: string | null, visitedBefore: boolean): Note[] {
  if (lastSeenId !== null) {
    const i = notes.findIndex((n) => n.id === lastSeenId);
    return i < 0 ? [] : notes.slice(0, i);
  }
  return visitedBefore ? notes.slice(0, 1) : [];
}

function readLastSeen(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked — treated as never seen
  }
}

export function markNotesSeen(notes: Note[] = NOTES): void {
  if (notes.length === 0) return;
  try {
    localStorage.setItem(KEY, notes[0].id);
  } catch {
    /* storage blocked; the pop-up just won't remember */
  }
}

/** What to show on arrival. A newcomer is marked current so later releases are measured from now. */
export function notesOnArrival(visitedBefore: boolean, notes: Note[] = NOTES): Note[] {
  const last = readLastSeen();
  if (last === null && !visitedBefore) markNotesSeen(notes);
  return unseenNotes(notes, last, visitedBefore);
}
