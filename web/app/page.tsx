"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Board, { type Range } from "@/app/components/Board";
import CrewChart from "@/app/components/CrewChart";
import Feed from "@/app/components/Feed";
import PersonPanel from "@/app/components/PersonPanel";
import StatTiles from "@/app/components/StatTiles";
import { rankBy, totals, weekStart, windowFrom } from "@/lib/metrics";
import { readSeen, whoYouPassed, writeSeen, type Seen } from "@/lib/seen";
import type { CrewResponse, PersonView } from "@/lib/types";

type Tab = "board" | "feed" | "you";
const TABS: Tab[] = ["board", "feed", "you"];
const RANGES: Range[] = ["today", "week", "all"];
const HINT_KEY = "anki-crew:hinted:v1";

function todayReviews(p: PersonView): number {
  return p.days.find((d) => d.date === p.meta.todayKey)?.reviews ?? 0;
}

function scoreFor(p: PersonView, range: Range): number {
  if (range === "all") return totals(p.days).reviews;
  if (range === "today") return todayReviews(p);
  return totals(windowFrom(p.days, weekStart(p.meta.todayKey))).reviews;
}

export default function Page() {
  const [data, setData] = useState<CrewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [range, setRange] = useState<Range>("today");
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [hint, setHint] = useState(false);

  // What the previous visit showed, captured once so the roll-up has a floor.
  const before = useRef<Seen | null>(null);
  const [passed, setPassed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const key = new URLSearchParams(window.location.search).get("key") ?? "";
      const res = await fetch(`/api/crew?key=${encodeURIComponent(key)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next: CrewResponse = await res.json();

      if (before.current === null) before.current = readSeen();
      const order = rankBy(next.people, (p) => todayReviews(p)).map((p) => p.profile.id);
      const scalp = whoYouPassed(before.current, order, next.viewer);
      const names = new Map(next.people.map((p) => [p.profile.id, p.profile.displayName]));
      setPassed(scalp ? names.get(scalp) ?? null : null);

      setData(next);
      writeSeen({
        totals: Object.fromEntries(next.people.map((p) => [p.profile.id, todayReviews(p)])),
        order,
        at: Date.now(),
      });
      setError(null);
    } catch {
      setError("That link isn't valid. Check the key on the end of the URL, or ask JP for yours.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // The only refresh trigger that earns its cost: you came back to look.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  useEffect(() => {
    try { if (!localStorage.getItem(HINT_KEY)) setHint(true); } catch { /* storage blocked */ }
  }, []);

  const dismissHint = () => {
    setHint(false);
    try { localStorage.setItem(HINT_KEY, "1"); } catch { /* storage blocked */ }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "?") { setShortcuts((s) => !s); return; }
      if (k === "escape") { setShortcuts(false); return; }
      if (k === "1") setTab("board");
      else if (k === "2") setTab("feed");
      else if (k === "3") setTab("you");
      else if (k === "t") setRange("today");
      else if (k === "w") setRange("week");
      else if (k === "a") setRange("all");
      else if (k === "r") void load();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [load]);

  if (error) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-[15px]" style={{ color: "var(--ink-dim)" }}>{error}</p>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center">
        <p className="text-[13px]" style={{ color: "var(--ink-faint)" }}>Loading…</p>
      </main>
    );
  }

  const selected = data.people.find((p) => p.profile.id === (who ?? data.viewer)) ?? data.people[0];
  const me = data.people.find((p) => p.profile.id === data.viewer);
  const gained = me ? todayReviews(me) - (before.current?.totals[me.profile.id] ?? todayReviews(me)) : 0;
  const seenTotals = before.current?.totals;

  return (
    <main className="mx-auto max-w-2xl pb-16">
      <header className="flex items-center justify-between px-5 py-5">
        <div>
          <h1 className="text-[17px] font-bold tracking-[-.02em]">Anki Crew</h1>
          {gained > 0 && (
            <p data-testid="gained" className="mt-0.5 text-[11.5px]" style={{ color: "var(--cyan-soft)" }}>
              +{gained.toLocaleString()} since you last looked
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <nav className="flex gap-1 text-[11.5px]">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className="rounded-full px-3 py-1.5 capitalize transition-colors"
                style={{
                  background: tab === t ? "var(--pane-lift)" : "transparent",
                  color: tab === t ? "var(--ink)" : "var(--ink-faint)",
                }}
              >
                {t}
              </button>
            ))}
          </nav>
          <button
            onClick={() => void load()}
            aria-label="Refresh"
            title="Checks for new data. Your own stats publish a minute or two after you close Anki."
            className="ml-1 rounded-full px-2.5 py-1.5 text-[13px] transition-colors"
            style={{ color: busy ? "var(--cyan-soft)" : "var(--ink-faint)" }}
          >
            <span className={busy ? "inline-block animate-spin" : "inline-block"}>↻</span>
          </button>
        </div>
      </header>

      {tab === "board" && (
        <>
          <div className="flex gap-1 px-5 pb-1 text-[11.5px]">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                aria-pressed={range === r}
                className="rounded-full px-3 py-1 capitalize transition-colors"
                style={{
                  background: range === r ? "var(--pane-lift)" : "transparent",
                  color: range === r ? "var(--ink)" : "var(--ink-faint)",
                }}
              >
                {r === "all" ? "all time" : r}
              </button>
            ))}
          </div>
          <div className="pt-2">
            <Board people={data.people} viewer={data.viewer} range={range} seen={seenTotals} justPassed={passed} />
          </div>
          <StatTiles people={data.people} viewer={data.viewer} />
          <CrewChart people={data.people} />
        </>
      )}

      {tab === "feed" && <Feed items={data.feed} people={data.people} />}

      {tab === "you" && !selected && (
        <div className="px-6 py-16 text-center">
          <p className="text-[15px]" style={{ color: "var(--ink-dim)" }}>Nobody has published yet.</p>
          <p className="mx-auto mt-2 max-w-sm text-[13px]" style={{ color: "var(--ink-faint)" }}>
            Run the publisher once and this fills in with your whole history, not just today.
          </p>
        </div>
      )}

      {tab === "you" && selected && (
        <>
          <div className="flex gap-1 px-5 pt-2 text-[11.5px]">
            {data.people.map((p) => (
              <button
                key={p.profile.id}
                onClick={() => setWho(p.profile.id)}
                aria-pressed={selected.profile.id === p.profile.id}
                className="rounded-full px-3 py-1 transition-colors"
                style={{
                  background: selected.profile.id === p.profile.id ? "var(--pane-lift)" : "transparent",
                  color: selected.profile.id === p.profile.id ? "var(--ink)" : "var(--ink-faint)",
                }}
              >
                {p.profile.displayName}
              </button>
            ))}
          </div>
          <PersonPanel person={selected} items={data.feed} />
        </>
      )}

      {hint && (
        <div className="fixed inset-x-4 bottom-4 z-40 mx-auto max-w-md">
          <div className="pane flex items-center gap-3 px-4 py-3 text-[12px]" style={{ background: "#12172A" }}>
            <span style={{ color: "var(--ink-dim)" }}>
              Your numbers update a minute or two after you close Anki. Press{" "}
              <kbd className="rounded px-1" style={{ background: "var(--pane-lift)" }}>?</kbd> for shortcuts.
            </span>
            <button onClick={dismissHint} className="ml-auto shrink-0 text-[11px]" style={{ color: "var(--cyan-soft)" }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {shortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "rgba(3,5,12,.72)" }}
          onClick={() => setShortcuts(false)}
        >
          <div className="pane w-full max-w-xs px-5 py-4" style={{ background: "#12172A" }} onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-3 text-[13px] font-semibold">Shortcuts</h2>
            <dl className="space-y-1.5 text-[12px]" style={{ color: "var(--ink-dim)" }}>
              {[["1 2 3", "Board, Feed, You"], ["t w a", "Today, week, all time"], ["r", "Refresh"], ["?", "This list"]].map(
                ([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt><kbd className="rounded px-1.5 py-0.5" style={{ background: "var(--pane-lift)", color: "var(--ink)" }}>{k}</kbd></dt>
                    <dd>{v}</dd>
                  </div>
                ),
              )}
            </dl>
          </div>
        </div>
      )}
    </main>
  );
}
