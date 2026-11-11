"use client";
import { useEffect, useRef, type CSSProperties } from "react";
import { RANK_NAME } from "@/lib/ranks";
import type { Rank } from "@/lib/types";
import { playChing, playCrumble } from "@/lib/sound";
import { METAL, RANK_FONT, RANK_INK, RankCrest, RankFrame } from "@/app/components/RankArt";

/*
 * A rank changing, played once over its board row. The rank-up is the approved
 * mockup's sequence (docs/superpowers/specs/2026-11-10-streak-ranks-mockup.html);
 * the crumble is its quieter twin: the crest cracks like stone and falls away.
 *
 * The row owns the real crest and frame. While this plays it hides the row's
 * crests (globals.css, [data-rank-hold]) and draws its own copies, and calls
 * onSwap when the row should switch to the new rank underneath. Every glow is
 * soft, and every animation it starts is cancelled when it ends.
 */

type Kind = "rankUp" | "crumble";

const HOLD = "data-rank-hold";
const EASE = "cubic-bezier(.2,.8,.2,1)";
const UP_MS = { burst: 450, trace: 1250, swap: 1700, fly: 1900, land: 2440, done: 3400 };
const DOWN_MS = { crack: 300, split: 480, fade: 600, swap: 900, reveal: 1400, done: 2000 };

/** A rank's metal as a CSS gradient. */
const metal = (r: Rank) => `linear-gradient(135deg, ${METAL[r].map(([o, c]) => `${c} ${o * 100}%`).join(", ")})`;

/** The plate's dark ground, tinted toward each metal. */
const PLATE: Record<Rank, [string, string]> = {
  bronze: ["#1f140b", "#0e0905"],
  silver: ["#161a21", "#0a0c10"],
  gold: ["#1c1608", "#0d0a04"],
  platinum: ["#0b1c1a", "#050d0c"],
  diamond: ["#15123a", "#0a0820"],
};

/** The light that runs round the frame: each metal's palest tint, never white. */
const TRACE: Record<Rank, string> = {
  bronze: "#ffe6cc",
  silver: "#eef3f9",
  gold: "#fff6d0",
  platinum: "#e6fffb",
  diamond: "#f0e6ff",
};

/*
 * The crumble's pieces: six cuts from one point near the shield's heart, each
 * cut kinking once before it reaches the shield's edge. The crack drawn on the
 * crest runs along the same lines, so when the pieces part, they part on it.
 */
const PIECES = [
  "52% 50%, 47% 27%, 50% 0%, 100% 0%, 100% 30%, 72% 38%",
  "52% 50%, 72% 38%, 100% 30%, 100% 80%, 69% 63%",
  "52% 50%, 69% 63%, 100% 80%, 100% 100%, 55% 100%, 58% 76%",
  "52% 50%, 58% 76%, 55% 100%, 0% 100%, 0% 90%, 32% 66%",
  "52% 50%, 32% 66%, 0% 90%, 0% 25%, 28% 40%",
  "52% 50%, 28% 40%, 0% 25%, 0% 0%, 50% 0%, 47% 27%",
];
/** Where each piece goes: a little outward, mostly down, turning as it falls. */
const FALL = [
  { x: 0.25, y: 1.3, r: 18 },
  { x: 0.45, y: 1.5, r: 26 },
  { x: 0.2, y: 1.8, r: 12 },
  { x: -0.15, y: 1.9, r: -14 },
  { x: -0.45, y: 1.55, r: -24 },
  { x: -0.25, y: 1.35, r: -16 },
];
const CRACK =
  "M52 50 L50 41 L47 27 L45 22 M52 50 L61 45 L72 38 M52 50 L60 56 L69 63 L72 68 " +
  "M52 50 L56 63 L58 76 M52 50 L43 57 L32 66 M52 50 L40 46 L28 40 L26 37";

/** Something positioned on the row's crest. */
const AT_SLOT: CSSProperties = {
  position: "absolute",
  left: "var(--sx)",
  top: "var(--sy)",
  width: "var(--ss)",
  height: "var(--ss)",
  margin: "calc(var(--ss) / -2) 0 0 calc(var(--ss) / -2)",
  opacity: 0,
};

/** The visible crest the row itself draws (desktop and phone each have one). */
function rowCrest(row: Element, root: Element): SVGElement | null {
  const all = Array.from(row.querySelectorAll<SVGElement>('[data-testid^="crest-"]'));
  return all.find((el) => !root.contains(el) && el.getBoundingClientRect().width > 0) ?? null;
}

export function RankMoment({
  kind, from, to, onSwap, onDone,
}: {
  kind: Kind;
  from: Rank | null;
  to: Rank | null;
  onSwap: () => void;
  onDone: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const swapRef = useRef(onSwap);
  const doneRef = useRef(onDone);
  // Each beat happens once, even if the effect is run twice (React's dev check).
  const fired = useRef({ run: "", beats: new Set<string>() });
  useEffect(() => {
    swapRef.current = onSwap;
    doneRef.current = onDone;
  });

  useEffect(() => {
    const root = rootRef.current;
    const row = root?.parentElement;
    if (!root || !row) return;

    const anims: Animation[] = [];
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => { timers.push(window.setTimeout(fn, ms)); };
    const part = (n: string) => root.querySelector<HTMLElement>(`[data-part="${n}"]`);
    const parts = (n: string) => Array.from(root.querySelectorAll<HTMLElement>(`[data-part="${n}"]`));
    // jsdom (and very old browsers) have no Web Animations; the beats still land on time.
    const animate = (el: Element | null, kf: Keyframe[], o: KeyframeAnimationOptions) => {
      if (el && typeof el.animate === "function") anims.push(el.animate(kf, o));
    };
    const show = (el: HTMLElement | null, on: boolean) => { if (el) el.style.opacity = on ? "1" : "0"; };
    const run = `${kind}:${from}:${to}`;
    if (fired.current.run !== run) fired.current = { run, beats: new Set() };
    const beats = fired.current.beats;
    const once = (k: string, fn: () => void) => {
      if (beats.has(k)) return;
      beats.add(k);
      fn();
    };
    const sound = () => once("sound", kind === "rankUp" ? playChing : playCrumble);
    const swap = () => once("swap", () => swapRef.current());
    const release = () => row.removeAttribute(HOLD);
    const stop = () => {
      timers.forEach((t) => window.clearTimeout(t));
      anims.forEach((a) => a.cancel());
      anims.length = 0;
      release();
    };
    const finish = () => {
      stop();
      once("done", () => doneRef.current());
    };

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      // No shatter, crumble or fly-in: straight to the new rank, sound and all.
      sound();
      swap();
      finish();
      return;
    }

    // Measure the row's crest, so the copies sit exactly on it.
    const box = root.getBoundingClientRect();
    const slot = (): { x: number; y: number; size: number } => {
      const c = rowCrest(row, root)?.getBoundingClientRect();
      return c
        ? { x: c.left - box.left + c.width / 2, y: c.top - box.top + c.height / 2, size: c.width }
        : { x: box.width - 80, y: box.height / 2, size: 30 };
    };
    const s = slot();
    root.style.setProperty("--sx", `${s.x}px`);
    root.style.setProperty("--sy", `${s.y}px`);
    root.style.setProperty("--ss", `${s.size}px`);
    row.setAttribute(HOLD, "");
    show(part("old-frame"), true);
    const veil = part("veil");

    if (kind === "rankUp") {
      const old = part("old-crest");
      const big = part("big");
      const ink = to ? RANK_INK[to] : "#ffd76a";

      // 1. The old crest gathers itself; the row dims.
      show(old, true);
      animate(old, [
        { transform: "scale(1)" },
        { transform: "scale(.85) rotate(-6deg)" },
        { transform: "scale(1.15)" },
      ], { duration: 450, easing: "ease-in", fill: "forwards" });
      animate(veil, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }],
        { duration: 2600, fill: "forwards" });

      at(UP_MS.burst, () => {
        // 2. It shatters into shards of its own metal.
        show(old, false);
        parts("shard").forEach((el, i, all) => {
          const a = (i / all.length) * Math.PI * 2;
          const d = 50 + Math.random() * 50;
          animate(el, [
            { transform: "rotate(0)", opacity: 1 },
            { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) rotate(${360 * Math.random()}deg)`, opacity: 0 },
          ], { duration: 700, easing: "cubic-bezier(.1,.7,.3,1)", fill: "forwards" });
        });
        // 3. The new crest bursts out large over the row, with rays, a ring and its plate.
        animate(big, [
          { opacity: 0, transform: "scale(.2)" },
          { opacity: 1, transform: "scale(1.25)", offset: 0.55 },
          { opacity: 1, transform: "scale(1)" },
        ], { duration: 600, easing: EASE, fill: "forwards" });
        animate(part("rays"), [
          { opacity: 0, transform: "rotate(0) scale(.6)" },
          { opacity: 1, transform: "rotate(40deg) scale(1)", offset: 0.3 },
          { opacity: 0, transform: "rotate(110deg) scale(1.1)" },
        ], { duration: 1900, easing: "ease-out", fill: "forwards" });
        animate(part("ring"), [{ opacity: 0.9, transform: "scale(.3)" }, { opacity: 0, transform: "scale(4)" }],
          { duration: 900, easing: "ease-out", fill: "forwards" });
        animate(part("plate"), [
          { opacity: 0, transform: "translateX(-50%) translateY(10px) scale(.7)" },
          { opacity: 1, transform: "translateX(-50%) scale(1.1)", offset: 0.12 },
          { opacity: 1, transform: "translateX(-50%) scale(1)", offset: 0.2 },
          { opacity: 1, transform: "translateX(-50%) scale(1)", offset: 0.85 },
          { opacity: 0, transform: "translateX(-50%) translateY(-6px)" },
        ], { duration: 2800, fill: "forwards" });
      });

      at(UP_MS.trace, () => {
        // 4. Light runs once round the frame; halfway round, the frame turns the new metal.
        const trace = part("trace");
        trace?.setAttribute("width", String(box.width + 2));
        trace?.setAttribute("height", String(box.height + 2));
        const rect = trace?.querySelector("rect") ?? null;
        rect?.setAttribute("width", String(box.width));
        rect?.setAttribute("height", String(box.height));
        show(trace, true);
        animate(rect, [{ strokeDashoffset: 0 }, { strokeDashoffset: -118 }],
          { duration: 900, easing: "ease-in-out", fill: "forwards" });
      });

      at(UP_MS.swap, () => {
        swap();
        animate(part("old-frame"), [{ opacity: 1 }, { opacity: 0 }], { duration: 350, easing: "ease-out", fill: "forwards" });
      });

      at(UP_MS.fly, () => {
        // 5. The big crest flies down into its slot (re-measured: the row has the new rank now).
        const t = slot();
        const dx = t.x - box.width / 2;
        const dy = t.y - box.height / 2;
        animate(big, [
          { opacity: 1, transform: "translate(0, 0) scale(1)" },
          { opacity: 1, transform: `translate(${dx}px, ${dy}px) scale(${t.size / 120})` },
        ], { duration: 550, easing: "cubic-bezier(.6,0,.3,1)", fill: "forwards" });
      });

      at(UP_MS.land, () => {
        // It lands: the big one goes, the row's own crest returns with a soft pulse, and it chimes.
        big?.getAnimations?.().forEach((a) => a.cancel());
        release();
        const shadow = "drop-shadow(0 2px 4px rgba(0,0,0,.6))";
        animate(rowCrest(row, root), [
          { transform: "scale(1.3)", filter: `${shadow} drop-shadow(0 0 8px ${ink}55)` },
          { transform: "scale(1)", filter: `${shadow} drop-shadow(0 0 0 transparent)` },
        ], { duration: 600, easing: EASE });
        sound();
      });

      at(UP_MS.done, finish);
    } else {
      const pieces = part("pieces");

      // 1. The crest trembles and dulls; the row dims, less than for a rank-up.
      show(pieces, true);
      animate(veil, [{ opacity: 0 }, { opacity: 0.7, offset: 0.12 }, { opacity: 0.7, offset: 0.75 }, { opacity: 0 }],
        { duration: DOWN_MS.done, fill: "forwards" });
      animate(pieces, [
        { transform: "none", filter: "none" },
        { transform: "translate(-1px, 0) rotate(-2deg)", offset: 0.25 },
        { transform: "translate(1px, 0) rotate(2deg)", offset: 0.5 },
        { transform: "translate(-1px, 1px) rotate(-1deg)", offset: 0.75 },
        { transform: "translate(0, 1px)", filter: "saturate(.6) brightness(.85)" },
      ], { duration: DOWN_MS.crack, easing: "linear", fill: "forwards" });

      at(DOWN_MS.crack, () => {
        // 2. It cracks, with its sound.
        parts("crack").forEach((el) => {
          show(el, true);
          el.querySelectorAll("path").forEach((p) =>
            animate(p, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 160, easing: "ease-out", fill: "forwards" }));
        });
        sound();
      });

      at(DOWN_MS.split, () => {
        // 3. The pieces fall away and fade, in the old metal, with a little dust.
        parts("piece").forEach((el, i) => {
          const f = FALL[i];
          animate(el, [
            { transform: "none", opacity: 1 },
            { opacity: 1, offset: 0.3 },
            { transform: `translate(${f.x * s.size}px, ${f.y * s.size + 12}px) rotate(${f.r}deg)`, opacity: 0 },
          ], { duration: 900 + i * 40, delay: i * 30, easing: "cubic-bezier(.45,0,.8,.6)", fill: "forwards" });
        });
        parts("dust").forEach((el, i) => {
          animate(el, [
            { transform: "none", opacity: 0.8 },
            { transform: `translate(${(i - 3.5) * 3}px, ${22 + (i % 3) * 9}px)`, opacity: 0 },
          ], { duration: 700 + (i % 4) * 90, delay: i * 25, easing: "cubic-bezier(.4,0,.9,.6)", fill: "forwards" });
        });
      });

      at(DOWN_MS.fade, () => {
        // 4. The frame's metal dulls and fades out; the row swaps beneath it.
        animate(part("old-frame"), [
          { opacity: 1, filter: "none" },
          { opacity: 0.6, filter: "saturate(.5) brightness(.75)", offset: 0.4 },
          { opacity: 0, filter: "saturate(.3) brightness(.6)" },
        ], { duration: 800, easing: "ease-in-out", fill: "forwards" });
      });

      at(DOWN_MS.swap, swap);

      at(DOWN_MS.reveal, () => {
        // Whatever the row shows now comes up gently.
        release();
        animate(rowCrest(row, root), [{ opacity: 0 }, { opacity: 1 }], { duration: 500, easing: "ease-out" });
      });

      at(DOWN_MS.done, finish);
    }

    return stop;
  }, [kind, from, to]);

  const ink = to ? RANK_INK[to] : "#ffd76a";
  const fill = "[&_svg]:h-full [&_svg]:w-full";

  return (
    <div ref={rootRef} data-rank-moment="" aria-hidden="true" className="pointer-events-none absolute inset-0 z-[3]">
      {from && (
        <div data-part="old-frame" className="absolute inset-0" style={{ opacity: 0 }}>
          <RankFrame rank={from} />
        </div>
      )}
      <div data-part="veil" className="absolute inset-0 rounded-[13px]" style={{ background: "rgba(4,5,12,.75)", opacity: 0 }} />

      {kind === "rankUp" && to && (
        <>
          {from && (
            <>
              <div data-part="old-crest" className={fill} style={{ ...AT_SLOT, filter: `drop-shadow(0 0 6px ${RANK_INK[from]}40)` }}>
                <RankCrest rank={from} size={100} />
              </div>
              {Array.from({ length: 12 }, (_, i) => (
                <span
                  key={i}
                  data-part="shard"
                  style={{
                    position: "absolute", left: "var(--sx)", top: "var(--sy)", width: 10, height: 14,
                    margin: "-7px 0 0 -5px", opacity: 0,
                    clipPath: "polygon(50% 0, 100% 100%, 0 80%)", background: metal(from),
                  }}
                />
              ))}
            </>
          )}
          <div
            data-part="rays"
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: 300, height: 300, margin: "-150px 0 0 -150px", opacity: 0,
              background: `repeating-conic-gradient(from 0deg, ${ink}33 0 6deg, transparent 6deg 22deg)`,
              WebkitMask: "radial-gradient(circle, #000 18%, transparent 68%)",
              mask: "radial-gradient(circle, #000 18%, transparent 68%)",
            }}
          />
          <div
            data-part="ring"
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{ width: 80, height: 80, margin: "-40px 0 0 -40px", border: `2px solid ${ink}66`, opacity: 0 }}
          />
          <div
            data-part="big"
            className={`absolute left-1/2 top-1/2 ${fill}`}
            style={{ width: 120, height: 120, margin: "-60px 0 0 -60px", opacity: 0, filter: `drop-shadow(0 0 16px ${ink}38)` }}
          >
            <RankCrest rank={to} size={120} />
          </div>
          <svg data-part="trace" className="absolute" style={{ left: -1, top: -1, overflow: "visible", opacity: 0 }}>
            <rect
              x="1" y="1" rx="14" pathLength={100} strokeDasharray="18 100"
              fill="none" stroke={TRACE[to]} strokeWidth="2" strokeOpacity=".6"
              style={{ filter: `drop-shadow(0 0 4px ${ink}59)` }}
            />
          </svg>
          <div
            data-part="plate"
            className="absolute left-1/2 whitespace-nowrap rounded-[4px] border uppercase"
            style={{
              top: -30, padding: "6px 18px", opacity: 0, transform: "translateX(-50%)",
              fontFamily: RANK_FONT, fontWeight: 900, fontSize: 13, letterSpacing: ".26em",
              background: `linear-gradient(180deg, ${PLATE[to][0]}, ${PLATE[to][1]})`,
              borderColor: METAL[to][1][1],
              boxShadow: `0 0 14px ${ink}2e, inset 0 1px 0 ${ink}26`,
            }}
          >
            <span aria-hidden="true" className="absolute right-full top-1/2 mr-1.5 h-[2px] w-[26px]"
              style={{ background: `linear-gradient(90deg, transparent, ${ink})` }} />
            <span style={{ background: metal(to), WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>
              Ranked up · {RANK_NAME[to]}
            </span>
            <span aria-hidden="true" className="absolute left-full top-1/2 ml-1.5 h-[2px] w-[26px]"
              style={{ background: `linear-gradient(270deg, transparent, ${ink})` }} />
          </div>
        </>
      )}

      {kind === "crumble" && from && (
        <div data-part="pieces" style={AT_SLOT}>
          {PIECES.map((poly) => (
            <div key={poly} data-part="piece" className={`absolute inset-0 ${fill}`} style={{ clipPath: `polygon(${poly})` }}>
              <RankCrest rank={from} size={100} />
              <svg data-part="crack" viewBox="0 0 100 100" className="absolute inset-0" style={{ opacity: 0, overflow: "visible" }}>
                <path d={CRACK} pathLength={1} strokeDasharray="1" strokeDashoffset="1" fill="none"
                  stroke={RANK_INK[from]} strokeOpacity=".35" strokeWidth="1.4" transform="translate(1 1)" strokeLinecap="round" />
                <path d={CRACK} pathLength={1} strokeDasharray="1" strokeDashoffset="1" fill="none"
                  stroke="#0c0a08" strokeOpacity=".9" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </div>
          ))}
          {Array.from({ length: 8 }, (_, i) => (
            <span
              key={i}
              data-part="dust"
              className="absolute rounded-full"
              style={{
                left: `${34 + i * 4.5}%`, top: "72%", width: 2 + (i % 2), height: 2 + (i % 2), opacity: 0,
                background: METAL[from][1][1],
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
