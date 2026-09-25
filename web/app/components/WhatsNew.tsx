"use client";
import { useEffect } from "react";
import type { Note } from "@/lib/whatsNew";

/** Release notes over the page. Every way out counts as read. */
export default function WhatsNew({ notes, onClose }: { notes: Note[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-testid="whats-new"
      role="dialog"
      aria-label="What's new"
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{ background: "rgba(3,5,12,.72)" }}
      onClick={onClose}
    >
      <div className="pane w-full max-w-sm px-5 py-4" style={{ background: "#12172A" }} onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-[13px] font-semibold">What&apos;s new</h2>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {notes.map((n) => (
            <section key={n.id}>
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[12.5px] font-semibold">{n.title}</h3>
                <span className="shrink-0 text-[11px]" style={{ color: "var(--ink-faint)" }}>{n.date}</span>
              </div>
              <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[12px]" style={{ color: "var(--ink-dim)" }}>
                {n.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="text-[11px]" style={{ color: "var(--cyan-soft)" }}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
