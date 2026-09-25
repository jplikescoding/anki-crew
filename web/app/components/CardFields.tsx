"use client";
import { guessMapping, plainText, resolveCard, ROLES } from "@/lib/fields";
import type { FeedItem, FieldMap, FieldMaps, FieldRole } from "@/lib/types";

const LABEL: Record<FieldRole, string> = { word: "Word", meaning: "Meaning", sentence: "Sentence" };

/**
 * Which field is the word, meaning and sentence, per note type. Guessed from
 * field names; a choice here changes how everyone sees your cards, old ones
 * included, because the dashboard resolves fields on every load.
 */
export default function CardFields({ noteTypes, fieldMaps, items, onSave }: {
  noteTypes: Record<string, string[]>;
  fieldMaps: FieldMaps;
  /** Your own feed items, for a preview. */
  items: FeedItem[];
  onSave: (noteType: string, map: FieldMap) => void;
}) {
  const types = Object.keys(noteTypes);
  if (types.length === 0) return null;

  return (
    <section data-testid="card-fields" className="pane mx-3 mt-2.5 px-4 py-3">
      <h3 className="text-[10.5px]" style={{ color: "var(--ink-dim)" }}>Card fields</h3>
      <p className="mt-1 text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
        How your cards show up for everyone. We guess from the field names; fix anything that&apos;s off.
      </p>
      <ul className="mt-3 space-y-4">
        {types.map((nt) => {
          const map = fieldMaps[nt] ?? {};
          const guess = guessMapping(noteTypes[nt]);
          const sample = items.find((i) => i.noteType === nt);
          const card = sample ? resolveCard(sample, map) : null;
          const set = (role: FieldRole, value: string) => {
            const next: FieldMap = { ...map };
            if (value === "") delete next[role]; else next[role] = value;
            onSave(nt, next);
          };
          return (
            <li key={nt}>
              <div className="text-[12.5px] font-semibold">{nt}</div>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {ROLES.map((role) => (
                  <label key={role} className="text-[10.5px]" style={{ color: "var(--ink-faint)" }}>
                    {LABEL[role]}
                    <select
                      aria-label={`${nt} ${LABEL[role]}`}
                      value={map[role] ?? ""}
                      onChange={(e) => set(role, e.target.value)}
                      className="mt-1 block min-h-8 w-full rounded-lg border px-1.5 text-[12px]"
                      style={{ borderColor: "var(--edge)", color: "var(--ink)", background: "var(--pane)" }}
                    >
                      <option value="">auto ({guess[role] ?? "none"})</option>
                      {noteTypes[nt].map((f) => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              {card && (
                <p data-testid={`card-fields-preview-${nt}`} className="jp mt-2 text-[12.5px]" style={{ color: "var(--ink-dim)" }}>
                  {plainText(card.word)} — {plainText(card.meaning)}
                  {card.sentence && (
                    <span className="block text-[11.5px]" style={{ color: "var(--ink-faint)" }}>
                      {plainText(card.sentence)}
                    </span>
                  )}
                </p>
              )}
              {Object.keys(map).length > 0 && (
                <button onClick={() => onSave(nt, {})} className="mt-1.5 min-h-8 text-[11px]" style={{ color: "var(--cyan-soft)" }}>
                  Reset to auto
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
