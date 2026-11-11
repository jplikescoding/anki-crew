"use client";
import { useId, type CSSProperties } from "react";
import { bannerColors, rankOrder } from "@/lib/ranks";
import type { Rank } from "@/lib/types";
import { useReducedMotion } from "@/app/components/useReducedMotion";

/*
 * The crest, frame and banner art, lifted from the approved mockup
 * (docs/superpowers/specs/2026-11-10-streak-ranks-mockup.html). Each rank keeps
 * everything the last had and adds a piece.
 *
 * Gradient ids come from useId(): a board holds several crests and frames at
 * once, and SVG ids are global to the page.
 */

/** The colour a rank's name is lettered in. */
export const RANK_INK: Record<Rank, string> = {
  bronze: "#e0a36c",
  silver: "#e1e8f0",
  gold: "#ffd76a",
  platinum: "#8ff0e3",
  diamond: "#c7b8ff",
};

export const RANK_FONT = "var(--font-cinzel), Georgia, serif";

/** Each rank's metal, as gradient stops from highlight to shadow. */
export const METAL: Record<Rank, [number, string][]> = {
  bronze: [[0, "#f3c493"], [0.45, "#b0703a"], [1, "#4e2a10"]],
  silver: [[0, "#ffffff"], [0.45, "#aab4c3"], [1, "#4a5361"]],
  gold: [[0, "#fff4c4"], [0.4, "#f2b51c"], [1, "#7a4d05"]],
  platinum: [[0, "#f0fffd"], [0.45, "#6fd9cc"], [1, "#1a5c56"]],
  diamond: [[0, "#ffffff"], [0.3, "#b9a8ff"], [0.65, "#5fd3f0"], [1, "#3424a8"]],
};

/** "url(#…)" for this instance's copy of a gradient. */
function useIds() {
  const uid = useId().replace(/[^\w-]/g, "");
  return { id: (n: string) => `${uid}-${n}`, url: (n: string) => `url(#${uid}-${n})` };
}

function Metal({ id, rank }: { id: string; rank: Rank }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      {METAL[rank].map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
    </linearGradient>
  );
}

function Gems({ id }: { id: (n: string) => string }) {
  return (
    <>
      <linearGradient id={id("gem-red")} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#ffb3a6" /><stop offset=".5" stopColor="#e2412f" /><stop offset="1" stopColor="#6e1209" />
      </linearGradient>
      <linearGradient id={id("gem-teal")} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#e6fffb" /><stop offset=".5" stopColor="#2fc4b2" /><stop offset="1" stopColor="#0c4d46" />
      </linearGradient>
    </>
  );
}

/* -------------------------------------------------------------------- crest */

const SHIELD = "M50 20 L74 29 V52 C74 68 63 79 50 85 C37 79 26 68 26 52 V29 Z";
const SHIELD_IN = "M50 26 L68 33 V52 C68 64.5 60 73 50 78 C40 73 32 64.5 32 52 V33 Z";

function Feathers({ fill, n, spread }: { fill: string; n: number; spread: number }) {
  const wing = Array.from({ length: n }, (_, i) => {
    const y = 36 + i * 7, len = spread - i * 5;
    return (
      <path
        key={i}
        d={`M30 ${y} Q${30 - len * 0.55} ${y - 10} ${30 - len} ${y - 14 + i * 2} Q${30 - len * 0.6} ${y + 2} 30 ${y + 6} Z`}
        fill={fill} stroke="rgba(0,0,0,.35)" strokeWidth=".6"
      />
    );
  });
  return (
    <>
      <g>{wing}</g>
      <g transform="translate(100 0) scale(-1 1)">{wing}</g>
    </>
  );
}

const RAYS = Array.from({ length: 12 }, (_, i) => {
  const at = (a: number) => `${50 + 48 * Math.cos(a)} ${52 + 48 * Math.sin(a)}`;
  const a = (i * Math.PI) / 6;
  return `M50 52 L${at(a - 0.06)} L${at(a + 0.06)} Z`;
});

export function RankCrest({ rank, size }: { rank: Rank; size: number }) {
  const { id, url } = useIds();
  const L = rankOrder(rank);
  const m = url("m");

  return (
    <svg
      data-testid={`crest-${rank}`}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      aria-hidden="true"
      className="shrink-0"
      style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,.6))", overflow: "visible" }}
    >
      <defs>
        <Metal id={id("m")} rank={rank} />
        <Gems id={id} />
        <linearGradient id={id("dark")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b1f33" /><stop offset="1" stopColor="#0a0c18" />
        </linearGradient>
        <radialGradient id={id("halo")}>
          <stop offset=".55" stopColor="rgba(143,240,227,0)" />
          <stop offset=".72" stopColor="rgba(143,240,227,.55)" />
          <stop offset=".8" stopColor="rgba(143,240,227,0)" />
        </radialGradient>
        <radialGradient id={id("halo-d")}>
          <stop offset=".5" stopColor="rgba(185,168,255,0)" />
          <stop offset=".7" stopColor="rgba(185,168,255,.6)" />
          <stop offset=".82" stopColor="rgba(95,211,240,0)" />
        </radialGradient>
      </defs>

      {/* halo, and rays for Diamond */}
      {L >= 3 && <circle cx="50" cy="52" r="46" fill={url(L >= 4 ? "halo-d" : "halo")} />}
      {L >= 4 && RAYS.map((d) => <path key={d} d={d} fill="rgba(220,210,255,.18)" />)}

      {/* wings */}
      {L >= 2 && <Feathers fill={m} n={L >= 3 ? 4 : 3} spread={L >= 3 ? 30 : 22} />}

      {/* side blades */}
      {L >= 1 && (
        <>
          <path d="M28 34 L8 46 L28 58 Z" fill={m} stroke="rgba(0,0,0,.4)" strokeWidth=".7" />
          <path d="M72 34 L92 46 L72 58 Z" fill={m} stroke="rgba(0,0,0,.4)" strokeWidth=".7" />
        </>
      )}

      {/* laurels at the foot */}
      <g fill={m} stroke="rgba(0,0,0,.35)" strokeWidth=".5">
        <ellipse cx="34" cy="84" rx="6" ry="2.6" transform="rotate(-30 34 84)" />
        <ellipse cx="29" cy="78" rx="6" ry="2.6" transform="rotate(-55 29 78)" />
        <ellipse cx="66" cy="84" rx="6" ry="2.6" transform="rotate(30 66 84)" />
        <ellipse cx="71" cy="78" rx="6" ry="2.6" transform="rotate(55 71 78)" />
      </g>

      {/* body: a shield, or cut crystal for Diamond */}
      {L >= 4 ? (
        <>
          <path d="M50 16 L76 34 L66 76 L50 88 L34 76 L24 34 Z" fill={m} stroke="#fff" strokeOpacity=".6" strokeWidth="1" />
          <path d="M50 16 L60 38 L50 88 L40 38 Z" fill="rgba(255,255,255,.35)" />
          <path d="M24 34 L40 38 L34 76 Z" fill="rgba(40,30,140,.35)" />
          <path d="M76 34 L60 38 L66 76 Z" fill="rgba(255,255,255,.18)" />
          <path d="M24 34 L50 16 L76 34 L60 38 L50 32 L40 38 Z" fill="rgba(255,255,255,.45)" />
        </>
      ) : (
        <>
          <path d={SHIELD} fill={m} stroke="rgba(255,255,255,.5)" strokeWidth="1" />
          <path d={SHIELD_IN} fill={url("dark")} stroke={m} strokeWidth="1.2" />
          <path d="M50 26 L68 33 V40 L50 34 L32 40 V33 Z" fill="rgba(255,255,255,.08)" />
          {L >= 3 ? (
            <>
              <path d="M50 38 L60 50 L50 66 L40 50 Z" fill={url("gem-teal")} stroke="#eafffc" strokeWidth=".8" />
              <path d="M50 38 L55 50 L50 66 Z" fill="rgba(255,255,255,.25)" />
            </>
          ) : L >= 2 ? (
            <>
              <path d="M50 40 L58 51 L50 63 L42 51 Z" fill={url("gem-red")} stroke="#ffe7d6" strokeWidth=".8" />
              <path d="M50 40 L54 51 L50 63 Z" fill="rgba(255,255,255,.25)" />
            </>
          ) : (
            <path
              d="M50 39 l3.6 7.3 8 1.2-5.8 5.6 1.4 8-7.2-3.8-7.2 3.8 1.4-8-5.8-5.6 8-1.2z"
              fill={m} stroke="rgba(255,255,255,.5)" strokeWidth=".6"
            />
          )}
        </>
      )}

      {/* crown (Gold up) */}
      {L >= 2 && (
        <>
          <path d="M37 22 L40 10 L45 17 L50 6 L55 17 L60 10 L63 22 Z" fill={m} stroke="rgba(0,0,0,.4)" strokeWidth=".7" />
          <circle cx="50" cy="6" r="2.2" fill={url(L >= 3 ? "gem-teal" : "gem-red")} />
        </>
      )}
    </svg>
  );
}

/* -------------------------------------------------------------------- frame */

/** Outer metal edge, inner bevel line, and resting glow, per rank. */
const FRAME: Record<Rank, { edge: string; bevel: string; glow: string }> = {
  bronze: {
    edge: "linear-gradient(115deg,#4e2a10,#f3c493 30%,#9a5c2a 55%,#ffd9b0 78%,#4e2a10)",
    bevel: "rgba(224,163,108,.25)",
    glow: "none",
  },
  silver: {
    edge: "linear-gradient(115deg,#4b5462,#eef3f9 30%,#8791a1 55%,#ffffff 78%,#4b5462)",
    bevel: "rgba(225,232,240,.25)",
    glow: "none",
  },
  gold: {
    edge: "linear-gradient(115deg,#6e4505,#ffe08a 30%,#b07a12 55%,#fff1b8 78%,#6e4505)",
    bevel: "rgba(255,215,106,.3)",
    glow: "0 0 24px -10px rgba(251,191,36,.55)",
  },
  platinum: {
    edge: "linear-gradient(115deg,#1f6b64,#c9fff7 30%,#3fa99c 55%,#eafffc 78%,#1f6b64)",
    bevel: "rgba(143,240,227,.3)",
    glow: "0 0 26px -10px rgba(95,214,200,.55)",
  },
  diamond: {
    edge: "linear-gradient(115deg,#3b2fb0,#f0e6ff 25%,#7f6bff 45%,#9ff0ff 65%,#c7b8ff 82%,#3b2fb0)",
    bevel: "rgba(199,184,255,.35)",
    glow: "0 0 30px -10px rgba(139,120,255,.6)",
  },
};

const CORNERS: { at: CSSProperties; flip: string; delay: string }[] = [
  { at: { left: -5, top: -5 }, flip: "none", delay: "0s" },
  { at: { right: -5, top: -5 }, flip: "scaleX(-1)", delay: "2.7s" },
  { at: { right: -5, bottom: -5 }, flip: "scale(-1,-1)", delay: "1.3s" },
  { at: { left: -5, bottom: -5 }, flip: "scaleY(-1)", delay: "4s" },
];

function Corner({ L, metal, gem, glint, delay }: { L: number; metal: string; gem: string; glint: boolean; delay: string }) {
  return (
    <>
      <path d="M4 26 V8 Q4 4 8 4 H26" fill="none" stroke={metal} strokeWidth="3" strokeLinecap="round" />
      {L >= 1 && <path d="M10 22 V11 Q10 10 11 10 H22" fill="none" stroke={metal} strokeWidth="1.4" strokeLinecap="round" />}
      {L >= 2 && (
        <>
          <path d="M26 4 q4 0 4 4 q0 3-3 3" fill="none" stroke={metal} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M4 26 q0 4 4 4 q3 0 3-3" fill="none" stroke={metal} strokeWidth="1.8" strokeLinecap="round" />
          <rect x="3.6" y="3.6" width="6.5" height="6.5" rx="1" transform="rotate(45 6.85 6.85)" fill={gem} stroke={metal} />
        </>
      )}
      {/* Diamond's gems catch the light now and then: a soft four-point glint. */}
      {glint && (
        <path
          className="gem-glint"
          style={{ animationDelay: delay }}
          d="M6.85 1.6 L7.6 6.1 L12.1 6.85 L7.6 7.6 L6.85 12.1 L6.1 7.6 L1.6 6.85 L6.1 6.1 Z"
          fill="#f4eeff"
        />
      )}
    </>
  );
}

/**
 * A still metal frame over a board row. Sits on the row's border; nothing in
 * it crosses the text, and only Diamond's corner gems ever move.
 */
export function RankFrame({ rank }: { rank: Rank }) {
  const { id, url } = useIds();
  const L = rankOrder(rank);
  const f = FRAME[rank];

  return (
    <span
      data-testid={`frame-${rank}`}
      aria-hidden="true"
      className="pointer-events-none absolute inset-[-1px] rounded-[15px]"
    >
      <span className="absolute inset-0 rounded-[inherit]" style={{ boxShadow: f.glow }} />
      <span className="rank-edge absolute inset-0 rounded-[inherit]" style={{ background: f.edge }} />
      <span className="absolute inset-[5px] rounded-[10px] border" style={{ borderColor: f.bevel }} />
      <svg width="0" height="0" className="absolute">
        <defs>
          <Metal id={id("m")} rank={rank} />
          <Gems id={id} />
        </defs>
      </svg>
      {CORNERS.map((c) => (
        <svg
          key={c.delay}
          viewBox="0 0 30 30"
          width="30"
          height="30"
          className="absolute"
          style={{ ...c.at, transform: c.flip, overflow: "visible" }}
        >
          <Corner L={L} metal={url("m")} gem={url(L >= 3 ? "gem-teal" : "gem-red")} glint={L >= 4} delay={c.delay} />
        </svg>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------- banner */

const CLOTH = [
  "M3 3 H37 V40 C37 56 37 66 37 76 L20 66 L3 76 C3 66 3 56 3 40 Z",
  "M3 3 H37 V40 C38 56 36 66 39 77 L21 67 L5 75 C4 66 2 56 3 40 Z",
  "M3 3 H37 V40 C36 56 38 66 35 75 L19 65 L1 77 C2 66 4 56 3 40 Z",
  "M3 3 H37 V40 C37 56 37 66 37 76 L20 66 L3 76 C3 66 3 56 3 40 Z",
];

/**
 * Last week's winner's swallowtail banner, hung from the row's top-left edge.
 * Dyed by the winner's rank, trimmed in gold. Only the cloth ripples; the rod
 * and the crown stay still.
 */
export function WinnerBanner({ rank, week }: { rank: Rank; week?: number }) {
  const { id, url } = useIds();
  const reduced = useReducedMotion();
  const [top, bottom] = bannerColors(rank) ?? ["#5b21b6", "#2e1065"];

  return (
    <svg
      data-testid="banner"
      data-rank={rank}
      viewBox="0 0 40 84"
      width="40"
      height="84"
      aria-label={week === undefined ? "Won last week" : `Won week ${week}`}
      role="img"
      className="pointer-events-none absolute z-[2]"
      style={{ left: 12, top: -14, filter: "drop-shadow(0 4px 8px rgba(0,0,0,.45))" }}
    >
      <defs>
        <linearGradient id={id("trim")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b07a12" /><stop offset=".5" stopColor="#ffe08a" /><stop offset="1" stopColor="#b07a12" />
        </linearGradient>
        <linearGradient id={id("cloth")} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} /><stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <path d={CLOTH[0]} fill={url("cloth")} stroke={url("trim")} strokeWidth="1.4">
        {!reduced && (
          <animate
            attributeName="d"
            dur="3.4s"
            repeatCount="indefinite"
            calcMode="spline"
            keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1"
            values={CLOTH.join(";")}
          />
        )}
      </path>
      <rect x="0" y="0" width="40" height="4" rx="2" fill={url("trim")} />
      <path transform="translate(10 18)" d="M0 0 l4 6 6-9 6 9 4-6-2 13h-16z" fill={url("trim")} />
      {week !== undefined && (
        <text
          x="20" y="44" textAnchor="middle" fontWeight="900" fontSize="7" fill="#ffe08a" letterSpacing="1"
          style={{ fontFamily: RANK_FONT }}
        >
          WK {week}
        </text>
      )}
    </svg>
  );
}
