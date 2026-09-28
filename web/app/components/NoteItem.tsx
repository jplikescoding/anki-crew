"use client";
import { useState } from "react";
import { Avatar } from "@/app/components/Avatar";
import { ago } from "@/app/components/FeedCard";
import NoteComposer from "@/app/components/NoteComposer";
import { isPending } from "@/lib/notes";
import type { CrewNote, PersonView } from "@/lib/types";

/** One note, in the Notes tab or under a feed card. Only yours can change. */
export default function NoteItem({ note, author, index, now, mine, showCard, onEdit, onDelete, className = "" }: {
  note: CrewNote;
  author?: PersonView;
  index: number;
  now: number;
  mine: boolean;
  /** Off under a feed card, where the card is right there already. */
  showCard: boolean;
  onEdit: (text: string) => void;
  onDelete: () => void;
  /** Extra classes for the row, e.g. the Notes tab's pane. */
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Until the server has it, there is no id to edit or delete by.
  const canChange = mine && !isPending(note);

  return (
    <li data-testid={`note-${note.id}`} className={`flex items-start gap-2.5 ${className}`}>
      {author && <Avatar profile={author.profile} size={24} index={index} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-[11px]" style={{ color: "var(--ink-faint)" }}>
          <span className="text-[12.5px] font-semibold" style={{ color: "var(--ink)" }}>
            {author?.profile.displayName ?? note.user}
          </span>
          <span className="tabular-nums">{ago(note.createdAt, now)}</span>
          {note.editedAt && <span>· edited</span>}
        </div>

        {showCard && note.card && (
          <div data-testid={`note-card-${note.id}`} className="jp mt-1 border-l-2 pl-2 text-[12px]"
               style={{ borderColor: "var(--edge-lit)", color: "var(--ink-dim)" }}>
            <b style={{ color: "var(--ink)" }}>{note.card.word}</b>{note.card.meaning && <> — {note.card.meaning}</>}
            {note.card.sentence && (
              <span className="block text-[11.5px]" style={{ color: "var(--ink-faint)" }}>{note.card.sentence}</span>
            )}
          </div>
        )}

        {editing ? (
          <div className="mt-1.5">
            <NoteComposer
              initial={note.text}
              onSave={(text) => { onEdit(text); setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          </div>
        ) : (
          <p data-testid={`note-text-${note.id}`} className="jp mt-1 text-[12.5px]"
             style={{ color: "var(--ink-dim)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {note.text}
          </p>
        )}

        {canChange && !editing && (
          <div className="mt-1 flex items-center gap-3 text-[11px]">
            {confirming ? (
              <>
                <span style={{ color: "var(--ink-dim)" }}>Delete this note?</span>
                <button data-testid={`note-delete-confirm-${note.id}`} onClick={onDelete}
                        className="min-h-8" style={{ color: "var(--rose)" }}>
                  Delete
                </button>
                <button onClick={() => setConfirming(false)} className="min-h-8" style={{ color: "var(--ink-faint)" }}>
                  Keep
                </button>
              </>
            ) : (
              <>
                <button data-testid={`note-edit-${note.id}`} onClick={() => setEditing(true)}
                        className="min-h-8" style={{ color: "var(--ink-faint)" }}>
                  Edit
                </button>
                <button data-testid={`note-delete-${note.id}`} onClick={() => setConfirming(true)}
                        className="min-h-8" style={{ color: "var(--ink-faint)" }}>
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
