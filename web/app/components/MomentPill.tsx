"use client";
import { momentHeadline, type Moment } from "@/lib/moments";
import type { PersonView } from "@/lib/types";

/** What happened while you were away, named, waiting for a tap. The tap is also what lets sound play. */
export default function MomentPill({ moments, people, viewer, onPlay }: {
  moments: Moment[];
  people: PersonView[];
  viewer: string | null;
  onPlay: () => void;
}) {
  if (moments.length === 0) return null;
  const rose = moments[0].kind === "passedBy";
  return (
    <div className="flex justify-center px-5 pb-2">
      <button
        data-testid="moment-pill"
        onClick={onPlay}
        className="badge-pop flex items-center gap-2 rounded-full border px-4 py-2 text-[12.5px]"
        style={rose
          ? { background: "rgba(251,113,133,.10)", borderColor: "rgba(251,113,133,.40)", boxShadow: "0 0 30px rgba(251,113,133,.15)" }
          : { background: "rgba(251,191,36,.10)", borderColor: "rgba(251,191,36,.40)", boxShadow: "0 0 30px rgba(251,191,36,.15)", color: "#FDE68A" }}
      >
        <span>{momentHeadline(moments[0], people, viewer)}</span>
        {moments.length > 1 && <span style={{ color: "var(--ink-faint)" }}> + {moments.length - 1} more</span>}
        <span style={{ color: "var(--ink-faint)" }}>tap ▸</span>
      </button>
    </div>
  );
}
