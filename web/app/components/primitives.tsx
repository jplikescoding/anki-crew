"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { streakTier } from "@/lib/metrics";

/* ------------------------------------------------------------------ tooltip */

/**
 * Hover or focus to explain a number. Every metric on this dashboard can be
 * asked "what does that actually mean" — the dotted rule is the invitation.
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span tabIndex={0} className="defined">{children}</span>
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-60 -translate-x-1/2
                     rounded-xl border px-3 py-2 text-left text-[11.5px] leading-relaxed font-normal
                     normal-case tracking-normal shadow-xl"
          style={{
            background: "#12172A",
            borderColor: "var(--edge)",
            color: "var(--ink-dim)",
            letterSpacing: "normal",
          }}
        >
          {label}
        </span>
      )}
    </span>
  );
}

/* ----------------------------------------------------------------- count-up */

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

/**
 * Rolls from what you last saw up to what is true now.
 *
 * Deliberately starts at `from`, not zero: the point is to show the work you
 * did since you last looked, and counting up from nothing would be theatre
 * rather than information.
 */
export function CountUp({
  to, from, className, duration = 900, ...rest
}: {
  to: number; from?: number; className?: string; duration?: number;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const reduced = useReducedMotion();
  const start = from ?? to;
  const [shown, setShown] = useState(start);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reduced || start === to) { setShown(to); return; }
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(start + (to - start) * eased));
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [to, start, duration, reduced]);

  return <span className={className} {...rest}>{shown.toLocaleString()}</span>;
}

/* -------------------------------------------------------------- streak star */

const TIER_STYLE = [
  { color: "var(--ink-ghost)", glow: "none", char: "☆" },
  { color: "#D8C08A", glow: "none", char: "★" },
  { color: "var(--gold)", glow: "none", char: "★" },
  { color: "var(--gold)", glow: "0 0 10px rgba(251,191,36,.45)", char: "★" },
  { color: "#FB923C", glow: "0 0 14px rgba(251,146,60,.55)", char: "★" },
  { color: "#F472B6", glow: "0 0 18px rgba(244,114,182,.6)", char: "✦" },
];

export function StreakStar({ streak }: { streak: number }) {
  const { tier, nextAt, daysToNext } = streakTier(streak);
  const s = TIER_STYLE[tier];
  const label =
    streak === 0
      ? "No streak yet. Study on two days in a row to start one."
      : daysToNext === null
        ? `${streak} days running — the top tier. Nothing left to climb.`
        : `${streak} days running. ${daysToNext} more to reach the ${nextAt}-day tier.`;
  return (
    <Tooltip label={label}>
      <span className="tabular-nums">
        {streak}
        <span style={{ color: s.color, textShadow: s.glow }} className="ml-1">{s.char}</span>
      </span>
    </Tooltip>
  );
}

/* ------------------------------------------------------------------- track */

export type TrackDay = { date: string; reviews: number; minutes?: number; retention?: number | null };

function prettyDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/**
 * Fourteen days as a lane. Reads as a race track under each name rather than a
 * chart widget, because this is three people racing each other.
 */
export function Track({ days, lit }: { days: TrackDay[]; lit: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const peak = Math.max(1, ...days.map((d) => d.reviews));
  const active = hover === null ? null : days[hover];

  return (
    <span className="relative flex h-6 items-end gap-[2px]">
      {days.map((d, i) => {
        const h = d.reviews === 0 ? 2 : Math.max(3, (d.reviews / peak) * 24);
        const share = d.reviews / peak;
        const bg = d.reviews === 0
          ? "rgba(255,255,255,.08)"
          : lit
            ? `color-mix(in oklab, var(--violet) ${100 - share * 70}%, var(--cyan-soft))`
            : `rgba(167,139,250,${0.28 + share * 0.34})`;
        return (
          <span
            key={d.date}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            className="block w-[4px] shrink-0 rounded-[1px] transition-[height] duration-200"
            style={{ height: `${h}px`, background: bg }}
          />
        );
      })}
      {active && (
        <span
          className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-max -translate-x-1/2
                     rounded-lg border px-2.5 py-1.5 text-[11px] whitespace-nowrap"
          style={{ background: "#12172A", borderColor: "var(--edge)", color: "var(--ink-dim)" }}
        >
          <b style={{ color: "var(--ink)" }}>{prettyDate(active.date)}</b>
          {" — "}
          {active.reviews === 0 ? "nothing studied" : `${active.reviews} cards`}
          {active.minutes ? `, ${Math.round(active.minutes)} min` : ""}
          {active.retention != null ? `, ${active.retention}% recalled` : ""}
        </span>
      )}
    </span>
  );
}
