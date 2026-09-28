/**
 * Release notes shown inside the app, so nobody has to be told in person.
 *
 * Each release people will notice adds one entry at the top, in the same
 * branch as the feature. Keep them short: what's new, or what you can do now.
 */
export type Note = { id: string; date: string; title: string; items: string[] };

export const NOTES: Note[] = [
  {
    id: "2026-09-weekly",
    date: "September 2026",
    title: "Win the week",
    items: [
      "Weeks now run Monday to Sunday and whoever reviews most wins it — Monday brings the roundup. Click anyone's picture for their card: weeks won, winning run, and your head-to-head.",
    ],
  },
  {
    id: "2026-09-deck-filter",
    date: "September 2026",
    title: "Friends' cards vs. your deck",
    items: [
      "Badges now say where a friend's word sits in your deck, and the new \"vs. my deck\" filter shows just the ones you know, are learning, haven't studied yet, or don't have.",
    ],
  },
  {
    id: "2026-09-notes",
    date: "September 2026",
    title: "Notes",
    items: [
      "Tap 📝 on any card to jot down what you learned from it — everyone sees it there and in the new Notes tab.",
    ],
  },
  {
    id: "2026-09-momentum",
    date: "September 2026",
    title: "Who's catching up",
    items: [
      "On Week and All time, a little ▲▼ shows who gained or lost ground since yesterday, even without passing anyone (hover it for how much).",
    ],
  },
  {
    id: "2026-09-sentences",
    date: "September 2026",
    title: "Sentences + is it in my deck?",
    items: [
      "Cards show the real word now, tap 例 (or the Sentences switch) for the example sentence, and friends' cards tell you if that word's in your deck — git pull your publisher to get the badges.",
    ],
  },
  {
    id: "2026-09-board",
    date: "September 2026",
    title: "Board fixes",
    items: [
      "Today resets properly at 4am for everyone, the ▲▼ arrows follow Today/Week/All time, and tapping anyone shows their best day (with the year).",
    ],
  },
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
