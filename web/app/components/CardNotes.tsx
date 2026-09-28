"use client";
import { useState } from "react";
import NoteComposer from "@/app/components/NoteComposer";
import NoteItem from "@/app/components/NoteItem";
import type { CrewNote, PersonView } from "@/lib/types";

/** A card's notes, opened from its 📝. The card is right above, so no quote. */
export default function CardNotes({ notes, byId, indexOf, viewer, canWrite, now, onAdd, onEdit, onDelete }: {
  notes: CrewNote[];
  byId: Map<string, PersonView>;
  indexOf: Map<string, number>;
  viewer?: string | null;
  canWrite: boolean;
  now: number;
  onAdd: (text: string) => void;
  onEdit: (id: string, text: string) => void;
  onDelete: (id: string) => void;
}) {
  // A composer that reopens after each save, so a second note is one tap away.
  const [round, setRound] = useState(0);

  return (
    <div className="border-t px-4 py-3" style={{ borderColor: "var(--edge)" }}>
      {notes.length > 0 && (
        <ul className="mb-3 space-y-3">
          {notes.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              author={byId.get(n.user)}
              index={indexOf.get(n.user) ?? 0}
              now={now}
              mine={n.user === viewer}
              showCard={false}
              onEdit={(text) => onEdit(n.id, text)}
              onDelete={() => onDelete(n.id)}
            />
          ))}
        </ul>
      )}
      {canWrite && (
        <NoteComposer
          key={round}
          autoFocus={notes.length === 0}
          onSave={(text) => { onAdd(text); setRound((r) => r + 1); }}
          onCancel={() => setRound((r) => r + 1)}
        />
      )}
    </div>
  );
}
