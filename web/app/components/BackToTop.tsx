"use client";
import { useEffect, useState } from "react";

/** Smooth unless the person has asked their system for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}

export function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: scrollBehavior() });
}

/** Out of the way until you're a screen down, which is when you'd want it. */
export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      data-testid="back-to-top"
      aria-label="Back to top"
      aria-hidden={!show}
      tabIndex={show ? 0 : -1}
      onClick={scrollToTop}
      className="fixed right-5 z-40 flex h-11 w-11 items-center justify-center rounded-full border text-[16px] shadow-[0_8px_24px_rgba(0,0,0,.4)] backdrop-blur-md transition duration-200 hover:bg-[rgba(28,34,58,.9)]! active:scale-95"
      style={{
        // Clear of the home indicator on phones that have one.
        bottom: "max(1.25rem, calc(env(safe-area-inset-bottom) + .75rem))",
        borderColor: "var(--edge-lit)",
        background: "rgba(18,23,42,.78)",
        color: "var(--ink)",
        opacity: show ? 1 : 0,
        transform: show ? "none" : "translateY(8px)",
        pointerEvents: show ? "auto" : "none",
      }}
    >
      ↑
    </button>
  );
}
