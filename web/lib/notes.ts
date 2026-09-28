/**
 * Crew notes: the rules, kept apart from React and Redis so both sides of a
 * write agree on them. The route validates with these; the page counts and
 * groups with them.
 */
import { plainText, type Resolved } from "@/lib/fields";
import type { CrewNote, NoteCard } from "@/lib/types";
import { NOTES_SEEN, type SeenMap } from "@/lib/unread";

export const MAX_NOTE_CHARS = 1000;
export const CARD_CAPS = { itemId: 128, word: 100, meaning: 300, sentence: 500 } as const;
const MAX_ID = 128;

function cleanText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const text = v.trim();
  return text.length === 0 || text.length > MAX_NOTE_CHARS ? null : text;
}

function cleanId(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 && v.length <= MAX_ID ? v : null;
}

const within = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;

/** Undefined for no card, null for a card that's malformed. */
function cleanCard(v: unknown): NoteCard | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "object" || v === null) return null;
  const c = v as Record<string, unknown>;
  if (!within(c.itemId, CARD_CAPS.itemId) || c.itemId.length === 0) return null;
  if (!within(c.word, CARD_CAPS.word) || !within(c.meaning, CARD_CAPS.meaning)) return null;
  if (c.sentence !== undefined && !within(c.sentence, CARD_CAPS.sentence)) return null;
  const card: NoteCard = { itemId: c.itemId, word: c.word, meaning: c.meaning };
  if (typeof c.sentence === "string") card.sentence = c.sentence;
  return card;
}

export function parseNewNote(body: unknown): { text: string; card?: NoteCard } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const text = cleanText(b.text);
  const card = cleanCard(b.card);
  if (text === null || card === null) return null;
  return card ? { text, card } : { text };
}

export function parseEdit(body: unknown): { id: string; text: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const id = cleanId(b.id);
  const text = cleanText(b.text);
  return id && text ? { id, text } : null;
}

export function parseId(body: unknown): { id: string } | null {
  if (typeof body !== "object" || body === null) return null;
  const id = cleanId((body as Record<string, unknown>).id);
  return id ? { id } : null;
}

/**
 * Other people's notes written since you last opened the Notes tab. By
 * creation time only: fixing a typo shouldn't ping everyone again.
 */
export function newNotesFor(notes: CrewNote[], viewer: string | null, seen: SeenMap): CrewNote[] {
  if (!viewer) return [];
  const since = seen[NOTES_SEEN] ?? 0;
  return notes.filter((n) => n.user !== viewer && n.createdAt > since);
}

/** Card id -> its notes, newest first. Free-standing notes aren't on any card. */
export function notesByCard(notes: CrewNote[]): Map<string, CrewNote[]> {
  const out = new Map<string, CrewNote[]>();
  for (const n of [...notes].sort((a, b) => b.createdAt - a.createdAt)) {
    if (!n.card) continue;
    const list = out.get(n.card.itemId) ?? [];
    list.push(n);
    out.set(n.card.itemId, list);
  }
  return out;
}

/**
 * The copy of a card a note keeps, as everyone saw it. Clamped to the server's
 * caps: a long Core sentence must not be the reason a note fails to save.
 */
export function noteCardFrom(itemId: string, card: Resolved): NoteCard {
  const out: NoteCard = {
    itemId,
    word: plainText(card.word).slice(0, CARD_CAPS.word),
    meaning: plainText(card.meaning).slice(0, CARD_CAPS.meaning),
  };
  if (card.sentence) out.sentence = plainText(card.sentence).slice(0, CARD_CAPS.sentence);
  return out;
}

/** Written on this screen, not yet confirmed by the server. */
export function isPending(note: CrewNote): boolean {
  return note.id.startsWith("tmp:");
}

/**
 * Replaces an optimistic note with the saved one. A refresh can land in
 * between and either drop the temporary copy or already include the saved
 * one; either way the note ends up listed exactly once, newest first.
 */
export function settleNote(notes: CrewNote[], tempId: string, saved: CrewNote): CrewNote[] {
  const rest = notes.filter((n) => n.id !== tempId && n.id !== saved.id);
  return [saved, ...rest].sort((a, b) => b.createdAt - a.createdAt);
}
