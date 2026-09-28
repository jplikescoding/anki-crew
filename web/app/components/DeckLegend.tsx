"use client";
import { useState, type CSSProperties } from "react";
import type { DeckMatch } from "@/lib/feedView";

const KEY = "anki-crew:deck-legend-hidden:v1";

/** Same colours as the badges, so the key teaches them. */
const DOT: Record<DeckMatch, CSSProperties> = {
  known: { background: "var(--jade)" },
  learning: { background: "var(--cyan-soft)" },
  new: { background: "var(--ink-dim)" },
  none: { boxShadow: "inset 0 0 0 1.5px var(--ink-faint)" },
};
const ROWS: [DeckMatch, string, string][] = [
  ["known", "known", "you've learned it"],
  ["learning", "learning", "you're partway through"],
  ["new", "unstudied", "in your deck, not reached yet"],
  ["none", "not in your deck", "you don't have it"],
];

function Dot({ status }: { status: DeckMatch }) {
  return <span aria-hidden className="inline-block h-2 w-2 shrink-0 rounded-full" style={DOT[status]} />;
}

/** The hover on a badge: a four-line key, with this card's row lit. */
export function DeckKey({ owner, current }: { owner: string; current: DeckMatch }) {
  return (
    <span className="block">
      <span className="mb-1 block" style={{ color: "var(--ink)" }}>{owner}&apos;s word, in your decks:</span>
      {ROWS.map(([status, label, meaning]) => (
        <span key={status} data-current={String(status === current)}
              className="flex items-center gap-2"
              style={{ color: status === current ? "var(--ink)" : "var(--ink-faint)" }}>
          <Dot status={status} />
          <span className="w-[112px] shrink-0">{label}</span>
          <span>{meaning}</span>
        </span>
      ))}
    </span>
  );
}

function readHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked: shown, and just not remembered
  }
}

/** One line above the feed until you've got it. The hover key stays for later. */
export default function DeckLegend() {
  const [hidden, setHidden] = useState(readHidden);
  if (hidden) return null;
  const hide = () => {
    setHidden(true);
    try { localStorage.setItem(KEY, "1"); } catch { /* not remembered */ }
  };

  return (
    <div data-testid="deck-legend"
         className="mx-3 mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-[var(--r-lane)] border px-3 py-2 text-[11px]"
         style={{ borderColor: "var(--edge)", color: "var(--ink-dim)" }}>
      <span style={{ color: "var(--ink-faint)" }}>Friends&apos; words in your decks:</span>
      {ROWS.map(([status, label]) => (
        <span key={status} className="inline-flex items-center gap-1.5"><Dot status={status} />{label}</span>
      ))}
      <button data-testid="deck-legend-dismiss" onClick={hide}
              className="ml-auto min-h-8 text-[11px]" style={{ color: "var(--ink-faint)" }}>
        Don&apos;t show again ✕
      </button>
    </div>
  );
}
