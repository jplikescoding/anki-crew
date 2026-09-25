import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { boldParts, deckWord, guessMapping, normalizeWord, plainText, resolveCard } from "@/lib/fields";
import type { FeedItem } from "@/lib/types";

const CASES = path.resolve(process.cwd(), "../publisher/tests/contract/normalize.cases.json");

const VOCAB_DYNAMIC = ["Expression", "Meaning", "Reading", "Audio", "Sentence", "Sentence-Kana",
  "Sentence-English", "Sentence Audio", "Image_URI"];
const IKNOW = ["Expression", "Meaning", "Reading", "Audio", "Image_URI"];
const CORE_75658 = ["Vocabulary-Kanji", "Vocabulary-Furigana", "Vocabulary-Kana", "Vocabulary-English",
  "Vocabulary-Audio", "Vocabulary-Pos", "Caution", "Expression", "Reading", "Sentence-Kana",
  "Sentence-English", "Sentence-Clozed", "Sentence-Audio", "Sentence-Image", "Notes", "Core-Index",
  "Optimized-Voc-Index", "Optimized-Sent-Index"];
// Adam's layout: the index number comes first.
const CORE_INDEX_FIRST = ["Core-Index", ...CORE_75658.filter((n) => n !== "Core-Index")];

function item(fields?: Record<string, string>, over: Partial<FeedItem> = {}): FeedItem {
  return { id: "adam:1", user: "adam", front: "5493", back: "作り上げる", deck: "Core",
           ease: 3, ivl: 1, ts: 1, ...(fields ? { noteType: "T", fields } : {}), ...over };
}

describe("guessMapping", () => {
  it.each([
    ["Japanese Vocab Dynamic", VOCAB_DYNAMIC,
      { word: "Expression", meaning: "Meaning", sentence: "Sentence", translation: "Sentence-English" }],
    ["iKnow sentences", IKNOW,
      { word: "Expression", meaning: "Meaning", sentence: null, translation: null }],
    ["Core 2k/6k (75658)", CORE_75658,
      { word: "Vocabulary-Kanji", meaning: "Vocabulary-English", sentence: "Expression", translation: "Sentence-English" }],
    ["Core with the index first", CORE_INDEX_FIRST,
      { word: "Vocabulary-Kanji", meaning: "Vocabulary-English", sentence: "Expression", translation: "Sentence-English" }],
    ["Basic", ["Front", "Back"],
      { word: "Front", meaning: "Back", sentence: null, translation: null }],
  ])("%s", (_name, names, expected) => {
    expect(guessMapping(names)).toEqual(expected);
  });

  it("uses the meaning as the translation when the sentence is Expression and nothing else translates it", () => {
    expect(guessMapping(["Vocab", "Meaning", "Expression"]))
      .toEqual({ word: "Vocab", meaning: "Meaning", sentence: "Expression", translation: "Meaning" });
  });
});

describe("resolveCard", () => {
  it("shows front and back for items from older publishers", () => {
    expect(resolveCard(item())).toEqual({ word: "5493", meaning: "作り上げる" });
    expect(resolveCard(item({}))).toEqual({ word: "5493", meaning: "作り上げる" });
  });

  it("picks word, meaning, sentence and translation by name", () => {
    const r = resolveCard(item({ "Core-Index": "5261", "Vocabulary-Kanji": "作り上げる",
      "Vocabulary-English": "to build up", Expression: "夢を<b>作り上げる</b>。",
      "Sentence-English": "Build a dream." }));
    expect(r).toEqual({ word: "作り上げる", meaning: "to build up",
      sentence: "夢を<b>作り上げる</b>。", translation: "Build a dream." });
  });

  it("lets an override win, role by role", () => {
    const r = resolveCard(item({ A: "作る", B: "to make", C: "作る。" }), { word: "A", meaning: "B", sentence: "C" });
    expect(r).toEqual({ word: "作る", meaning: "to make", sentence: "作る。" });
  });

  it("falls back to the guess when an overridden field is empty on this card", () => {
    const r = resolveCard(item({ Expression: "話す", Meaning: "to speak" }), { word: "Missing" });
    expect(r.word).toBe("話す");
  });

  it("skips an all-digit field when nothing matches by name", () => {
    expect(resolveCard(item({ Num: "5261", Thing: "話す" })).word).toBe("話す");
  });
});

describe("normalizeWord", () => {
  it("matches the publisher on the shared cases", () => {
    const cases: [string, string][] = JSON.parse(fs.readFileSync(CASES, "utf-8"));
    for (const [raw, expected] of cases) expect(normalizeWord(raw)).toBe(expected);
  });
});

describe("boldParts and plainText", () => {
  it("splits on bold tags", () => {
    expect(boldParts("夢を<b>作り上げる</b>。")).toEqual([
      { text: "夢を", bold: false }, { text: "作り上げる", bold: true }, { text: "。", bold: false }]);
  });

  it("drops an unmatched tag instead of showing it", () => {
    expect(boldParts("夢を<b>作り")).toEqual([{ text: "夢を作り", bold: false }]);
  });

  it("never turns other markup into anything but text", () => {
    expect(boldParts("<img src=x onerror=alert(1)>")).toEqual([{ text: "<img src=x onerror=alert(1)>", bold: false }]);
  });

  it("plainText joins the parts", () => {
    expect(plainText("<b>話す</b>")).toBe("話す");
  });
});

describe("deckWord", () => {
  it("is the normalized word", () => {
    expect(deckWord(item({ Expression: "<b>近[ちか]く</b>", Meaning: "near" }))).toBe("近く");
  });

  it("is null for a sentence card, which the index never holds", () => {
    expect(deckWord(item({ Expression: "今日は一人で映画を見ます。とても楽しかった。", Meaning: "…" }))).toBeNull();
  });

  it("is null for a short sentence card", () => {
    expect(deckWord(item({ Expression: "今日は一人で映画を見ます。", Meaning: "…" }))).toBeNull();
  });

  it("keeps a word that carries a parenthetical note", () => {
    expect(deckWord(item({ Expression: "毎年 (xnen)", Meaning: "every year" }))).toBe("毎年");
  });

  it("is null for items without fields", () => {
    expect(deckWord(item())).toBeNull();
  });

  it("keeps a 20-character word made of non-BMP kanji, counted in code points", () => {
    const w = "𠮟".repeat(20);
    expect(deckWord(item({ Expression: w, Meaning: "scold" }))).toBe(w);
  });
});
