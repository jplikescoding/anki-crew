"use client";
import { useState } from "react";
import { MAX_NOTE_CHARS } from "@/lib/notes";

/** The counter only appears once it's worth knowing about. */
const COUNT_FROM = 900;

export default function NoteComposer({ initial = "", onSave, onCancel, autoFocus = true, testid = "note-input" }: {
  initial?: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
  testid?: string;
}) {
  const [text, setText] = useState(initial);
  const trimmed = text.trim();
  const ok = trimmed.length > 0 && trimmed.length <= MAX_NOTE_CHARS;
  const save = () => { if (ok) onSave(trimmed); };

  return (
    <div>
      <textarea
        data-testid={testid}
        value={text}
        autoFocus={autoFocus}
        maxLength={MAX_NOTE_CHARS}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }}
        placeholder="What did you learn from it?"
        className="block w-full resize-y rounded-lg border bg-transparent px-2.5 py-2 text-[12.5px] outline-none"
        style={{ borderColor: "var(--edge)", color: "var(--ink)" }}
      />
      <div className="mt-1.5 flex items-center gap-2">
        {text.length >= COUNT_FROM && (
          <span data-testid="note-count" className="text-[10.5px] tabular-nums" style={{ color: "var(--ink-faint)" }}>
            {text.length} / {MAX_NOTE_CHARS}
          </span>
        )}
        <button data-testid="note-cancel" onClick={onCancel} className="ml-auto min-h-8 px-2 text-[12px]"
                style={{ color: "var(--ink-faint)" }}>
          Cancel
        </button>
        <button
          data-testid="note-save"
          onClick={save}
          disabled={!ok}
          className="min-h-8 rounded-lg px-3 text-[12px] font-medium transition-opacity"
          style={{ background: "var(--pane-lift)", color: "var(--ink)", opacity: ok ? 1 : 0.35 }}
        >
          Save
        </button>
      </div>
    </div>
  );
}
