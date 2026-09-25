// Which of a card's named fields is the word, the meaning and the sentence.
// Guessed from field names, so a new note type works with no setup; each
// person can override the guess per note type (see CardFields).
import type { FeedItem, FieldMap, FieldRole } from "@/lib/types";

export const ROLES: FieldRole[] = ["word", "meaning", "sentence"];

export type Guess = {
  word: string | null; meaning: string | null; sentence: string | null; translation: string | null;
};
export type Resolved = { word: string; meaning: string; sentence?: string; translation?: string };

// Exact names, lowercase, first match wins.
const WORD = ["vocabulary-kanji", "expression", "word", "vocab", "kanji", "front"];
const MEANING = ["vocabulary-english", "meaning", "english", "definition", "back"];
const NOT_A_SENTENCE = ["kana", "english", "translation", "audio", "clozed", "image", "furigana"];

const vocabish = (n: string) => n.startsWith("vocabulary-") || n === "word" || n === "vocab" || n === "kanji";
const sentenceish = (n: string) => n.includes("sentence") || n.includes("example");

export function guessMapping(names: string[]): Guess {
  const lower = names.map((n) => n.toLowerCase());
  const byName = (candidates: string[]) => {
    for (const c of candidates) {
      const i = lower.indexOf(c);
      if (i >= 0) return names[i];
    }
    return null;
  };
  // With a proper vocab field present, Expression is the example sentence.
  const hasVocab = lower.some(vocabish);
  const word = byName(WORD.filter((c) => !(hasVocab && c === "expression")));
  const meaning = byName(MEANING);
  let sentence: string | null =
    names.find((_, i) => sentenceish(lower[i]) && !NOT_A_SENTENCE.some((s) => lower[i].includes(s))) ?? null;
  let translation: string | null =
    names.find((_, i) => sentenceish(lower[i]) && (lower[i].includes("english") || lower[i].includes("translation"))) ?? null;
  if (!sentence) {
    const i = lower.indexOf("expression");
    if (i >= 0 && names[i] !== word) {
      sentence = names[i];
      translation = translation ?? meaning;
    }
  }
  return { word, meaning, sentence, translation };
}

export function resolveCard(item: FeedItem, override: FieldMap = {}): Resolved {
  const f = item.fields;
  if (!f || Object.keys(f).length === 0) return { word: item.front, meaning: item.back };
  const guess = guessMapping(Object.keys(f));
  const pick = (role: FieldRole) => {
    for (const name of [override[role], guess[role]]) if (name && f[name]) return f[name];
    return undefined;
  };
  const word = pick("word") ?? Object.values(f).find((v) => !/^\d+$/.test(v.trim())) ?? item.front;
  const meaning = pick("meaning") ?? item.back;
  const sentence = pick("sentence");
  const translation = sentence && guess.translation ? f[guess.translation] : undefined;
  return {
    word, meaning,
    ...(sentence ? { sentence } : {}),
    ...(translation ? { translation } : {}),
  };
}

/** Must match normalize_word in publisher/words.py (see normalize.cases.json). */
export function normalizeWord(s: string): string {
  return s.replace(/<\/?b>/gi, "").replace(/\[[^\]]*\]/g, "")
    .replace(/\([^)]*\)|（[^）]*）/g, "").replace(/\s+/g, "");
}

/**
 * Bold runs as data, for rendering as React text. Nothing here is ever HTML:
 * a stray <b> or </b> is dropped, and any other markup stays literal text.
 */
export function boldParts(s: string): { text: string; bold: boolean }[] {
  const out: { text: string; bold: boolean }[] = [];
  const plain = (t: string) => {
    const text = t.replace(/<\/?b>/gi, "");
    if (!text) return;
    const last = out[out.length - 1];
    if (last && !last.bold) last.text += text; else out.push({ text, bold: false });
  };
  const re = /<b>([\s\S]*?)<\/b>/gi;
  let at = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    plain(s.slice(at, m.index));
    if (m[1]) out.push({ text: m[1], bold: true });
    at = re.lastIndex;
  }
  plain(s.slice(at));
  return out;
}

export function plainText(s: string): string {
  return boldParts(s).map((p) => p.text).join("");
}

/** Mirrors the publisher's index: no badge for anything it would never hold. */
const MAX_WORD_LEN = 20;
const SENTENCE_PUNCT = /[。、！？!?．，]/;

export function deckWord(item: FeedItem, override?: FieldMap): string | null {
  if (!item.fields || Object.keys(item.fields).length === 0) return null;
  const word = normalizeWord(resolveCard(item, override).word);
  if (word.length === 0 || word.length > MAX_WORD_LEN) return null;
  return SENTENCE_PUNCT.test(word) ? null : word;
}
