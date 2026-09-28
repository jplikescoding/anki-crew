"use client";
import { useMemo, useState } from "react";
import NoteComposer from "@/app/components/NoteComposer";
import NoteItem from "@/app/components/NoteItem";
import type { CrewNote, PersonView } from "@/lib/types";

/**
 * The crew's notes, newest first. The filter lists only people who have
 * written something, so crewmates who never post take no room.
 */
export default function Notes({ notes, people, viewer, canWrite, onAdd, onEdit, onDelete }: {
  notes: CrewNote[];
  people: PersonView[];
  viewer: string | null;
  canWrite: boolean;
  onAdd: (text: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  const [author, setAuthor] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const now = Date.now();

  const byId = useMemo(() => new Map(people.map((p) => [p.profile.id, p])), [people]);
  const indexOf = useMemo(() => new Map(people.map((p, i) => [p.profile.id, i])), [people]);
  const sorted = useMemo(() => [...notes].sort((a, b) => b.createdAt - a.createdAt), [notes]);
  const authors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const n of notes) counts.set(n.user, (counts.get(n.user) ?? 0) + 1);
    return [...counts].map(([id, count]) => ({ id, count, name: byId.get(id)?.profile.displayName ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [notes, byId]);

  // A chosen author whose notes are all gone falls back to everyone.
  const active = author && authors.some((a) => a.id === author) ? author : null;
  const shown = active ? sorted.filter((n) => n.user === active) : sorted;

  return (
    <section className="px-3 pt-1">
      <div className="flex items-center gap-2 px-1.5 pb-2">
        {authors.length > 1 && (
          <select
            data-testid="notes-filter"
            aria-label="Whose notes"
            value={active ?? ""}
            onChange={(e) => setAuthor(e.target.value || null)}
            className="min-h-8 rounded-lg border px-2 text-[12px]"
            style={{ borderColor: "var(--edge)", color: "var(--ink)", background: "var(--pane)" }}
          >
            <option value="">Everyone</option>
            {authors.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.count})</option>)}
          </select>
        )}
        {canWrite && !writing && (
          <button
            data-testid="new-note"
            onClick={() => setWriting(true)}
            className="ml-auto min-h-8 rounded-full border px-3 text-[11.5px]"
            style={{ borderColor: "var(--edge)", color: "var(--cyan-soft)" }}
          >
            + New note
          </button>
        )}
      </div>

      {writing && (
        <div className="pane mb-3 px-4 py-3">
          <NoteComposer
            onSave={(text) => { onAdd(text); setWriting(false); }}
            onCancel={() => setWriting(false)}
          />
        </div>
      )}

      {notes.length === 0 ? (
        <p data-testid="notes-empty" className="px-6 py-16 text-center text-[13px]" style={{ color: "var(--ink-dim)" }}>
          No notes yet. Tap 📝 on any card in the Feed to add what you learned from it.
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((n) => (
            <NoteItem
              key={n.id}
              className="pane px-4 py-3"
              note={n}
              author={byId.get(n.user)}
              index={indexOf.get(n.user) ?? 0}
              now={now}
              mine={n.user === viewer}
              showCard
              onEdit={(text) => onEdit(n.id, text)}
              onDelete={() => onDelete(n.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
