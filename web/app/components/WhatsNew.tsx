"use client";
import { useEffect } from "react";
import type { Note } from "@/lib/whatsNew";

/** Release notes over the page. Every way out counts as read. */
export default function WhatsNew({ notes, onClose }: { notes: Note[]; onClose: () => void }) {
  useEffect(() => {
    // Caught first and stopped here, so the page's own shortcuts don't fire
    // behind the pop-up. Default behaviour (Tab, scrolling) still happens.
    const onKey = (e: KeyboardEvent) => {
      e.stopImmediatePropagation();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
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
          <button
            onClick={onClose}
            className="min-h-[44px] rounded-full px-6 text-[13px] font-semibold"
            style={{ background: "var(--pane-lift)", color: "var(--cyan-soft)" }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
