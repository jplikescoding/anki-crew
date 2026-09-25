"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Board, { type Range } from "@/app/components/Board";
import CrewChart from "@/app/components/CrewChart";
import Feed, { ago } from "@/app/components/Feed";
import PersonPanel from "@/app/components/PersonPanel";
import StatTiles from "@/app/components/StatTiles";
import { Avatar, AvatarUploader } from "@/app/components/Avatar";
import { rankBy } from "@/lib/metrics";
import { readSeen, whoYouPassed, writeSeen, type Seen } from "@/lib/seen";
import { playCelebration } from "@/lib/sound";
import { FLOOR, mergeSeen, unreadCount, type SeenMap } from "@/lib/unread";
import type { CrewResponse, Engagement, PersonView } from "@/lib/types";

type Tab = "board" | "feed" | "you";
const TABS: Tab[] = ["board", "feed", "you"];
const RANGES: Range[] = ["today", "week", "all"];
const HINT_KEY = "anki-crew:hinted:v1";
const BAD_LINK = "That link isn't valid. Check the key on the end of the URL, or ask JP for yours.";

function todayReviews(p: PersonView): number {
  return p.days.find((d) => d.date === p.meta.todayKey)?.reviews ?? 0;
}

export default function Page() {
  const [data, setData] = useState<CrewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [range, setRange] = useState<Range>("today");
  const [who, setWho] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Kept true for at least one whole rotation: a 200ms request that stops the
  // icon a fifth of the way round reads as "it didn't work".
  const [spinning, setSpinning] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [hint, setHint] = useState(false);
  const [engagement, setEngagement] = useState<Record<string, Engagement>>({});
  const [jumpSignal, setJumpSignal] = useState(0);
  // Something that went wrong after the page was already showing: a refresh
  // that failed, or a reaction or comment the server did not keep.
  const [problem, setProblem] = useState<string | null>(null);
  const loaded = useRef(false);
  const [apiKey, setApiKey] = useState("");
  // What you've read, per thread. Server copy merged with anything opened
  // since, so a refresh that raced a save can't un-read it.
  const [seen, setSeen] = useState<SeenMap>({});
  const chimedFor = useRef<string | null>(null);

  // What the previous visit showed, captured once so the roll-up has a floor.
  const before = useRef<Seen | null>(null);
  const [passed, setPassed] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setSpinning(true);
    const startedAt = Date.now();
    try {
      const key = new URLSearchParams(window.location.search).get("key") ?? "";
      const res = await fetch(`/api/crew?key=${encodeURIComponent(key)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      const next: CrewResponse = await res.json();

      if (before.current === null) before.current = readSeen();
      const order = rankBy(next.people, (p) => todayReviews(p)).map((p) => p.profile.id);
      const scalp = whoYouPassed(before.current, order, next.viewer);
      const names = new Map(next.people.map((p) => [p.profile.id, p.profile.displayName]));
      const scalpName = scalp ? names.get(scalp) ?? null : null;
      setPassed(scalpName);
      // `before` is fixed for the session, so every refresh finds the same
      // overtake again. Ring once for it, not on every return to the tab.
      if (scalpName && scalp !== chimedFor.current) {
        chimedFor.current = scalp;
        playCelebration();
      }

      setData(next);
      loaded.current = true;
      setEngagement(next.engagement ?? {});
      setSeen((prev) => mergeSeen(prev, next.seen ?? {}));
      writeSeen({
        totals: Object.fromEntries(next.people.map((p) => [p.profile.id, todayReviews(p)])),
        order,
        at: Date.now(),
      });
      setError(null);
      setProblem(null);
    } catch (e) {
      // A failed refresh must not replace a dashboard that is already showing:
      // waking a laptop fires one before the network is back.
      if (loaded.current) setProblem("couldn't refresh — check your connection");
      else setError(e instanceof Error && e.message === "401"
        ? BAD_LINK
        : "Couldn't reach the dashboard. Try again in a minute.");
    } finally {
      setBusy(false);
      const elapsed = Date.now() - startedAt;
      window.setTimeout(() => setSpinning(false), Math.max(0, 720 - elapsed));
    }
  }, []);

  useEffect(() => {
    setApiKey(new URLSearchParams(window.location.search).get("key") ?? "");
    void load();
  }, [load]);

  // The only refresh trigger that earns its cost: you came back to look.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  useEffect(() => {
    try { if (!localStorage.getItem(HINT_KEY)) setHint(true); } catch { /* storage blocked */ }
  }, []);

  /**
   * Sends a write the page has already shown. If the server does not keep it,
   * reload so the screen matches what was stored, then say so -- after the
   * reload, whose success would otherwise clear the message.
   *
   * Except /api/seen: mergeSeen keeps the local read mark through that
   * reload, on purpose, so a failed save can't ask again, fail again, and
   * reload forever.
   */
  const send = useCallback((path: string, body: object, failed: string) => {
    fetch(`${path}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then((res) => { if (!res.ok) throw new Error(String(res.status)); })
      .catch(async () => {
        await load();
        setProblem(failed);
      });
  }, [apiKey, load]);

  /** Applied locally first: a reaction that waits on a round trip feels broken. */
  const react = useCallback((itemId: string, emoji: string | null) => {
    if (!data?.viewer) return;
    const me = data.viewer;
    setEngagement((prev) => {
      const cur = prev[itemId] ?? { reactions: {}, comments: [] };
      const reactions = { ...cur.reactions };
      if (emoji === null) delete reactions[me]; else reactions[me] = emoji;
      return { ...prev, [itemId]: { ...cur, reactions } };
    });
    send("/api/react", { itemId, emoji }, "your reaction didn't save");
  }, [data?.viewer, send]);

  const comment = useCallback((itemId: string, text: string) => {
    if (!data?.viewer) return;
    const mine = { user: data.viewer, text, at: Date.now() };
    setEngagement((prev) => {
      const cur = prev[itemId] ?? { reactions: {}, comments: [] };
      return { ...prev, [itemId]: { ...cur, comments: [...cur.comments, mine] } };
    });
    send("/api/comment", { itemId, text }, "your comment didn't post");
  }, [data?.viewer, send]);

  /**
   * Opening a thread reads it, up to the newest comment it showed. Applied
   * locally first so the badge drops as you tap.
   */
  const markSeen = useCallback((itemId: string, upTo: number) => {
    setSeen((prev) => mergeSeen(prev, { [itemId]: upTo }));
    send("/api/seen", { itemId, upTo }, "couldn't mark that as read");
  }, [send]);

  const markAllSeen = useCallback((upTo: number) => {
    setSeen((prev) => mergeSeen(prev, { [FLOOR]: upTo }));
    send("/api/seen", { all: true, upTo }, "couldn't mark everything read");
  }, [send]);

  const dismissHint = () => {
    setHint(false);
    try { localStorage.setItem(HINT_KEY, "1"); } catch { /* storage blocked */ }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // Letters are only shortcuts when you are not typing them.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const k = e.key.toLowerCase();
      if (k === "?") { setShortcuts((s) => !s); return; }
      if (k === "escape") { setShortcuts(false); return; }
      if (k === "1") { setTab("board"); setJumpSignal(0); }
      else if (k === "2") { setTab("feed"); setJumpSignal(0); }
      else if (k === "3") { setTab("you"); setJumpSignal(0); }
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
  const unreadComments = unreadCount(engagement, data.viewer, seen);
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
          {/* Your stats land a minute or two after you close Anki, so "when did
              mine last arrive" is what a refresh is really asking. */}
          {(problem || me) && (
            <p data-testid="sync-note" className="mt-0.5 text-[11.5px]"
               style={{ color: problem ? "var(--rose)" : "var(--ink-dim)" }}>
              {problem ?? `you published ${ago(me!.meta.lastPublishAt, Date.now())} ago`}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <nav className="flex gap-1 text-[11.5px]">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setTab(t);
                  if (t === "feed" && unreadComments > 0) setJumpSignal((n) => n + 1);
                  else setJumpSignal(0);
                }}
                aria-pressed={tab === t}
                className="relative rounded-full px-3 py-1.5 capitalize transition-colors"
                style={{
                  background: tab === t ? "var(--pane-lift)" : "transparent",
                  color: tab === t ? "var(--ink)" : "var(--ink-faint)",
                }}
              >
                {t}
                {t === "feed" && unreadComments > 0 && (
                  <span
                    key={unreadComments}
                    data-testid="unread-badge"
                    title={`${unreadComments} unread — tap to go through them`}
                    className="badge-pop absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                    style={{ background: "var(--cyan)", color: "#04121A" }}
                  >
                    {unreadComments}
                  </span>
                )}
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
            <span
              className="inline-block"
              style={{
                transition: spinning ? "none" : "transform .2s",
                animation: spinning ? "spin 720ms linear infinite" : "none",
              }}
            >
              ↻
            </span>
          </button>
          {/* The hint bubble is dismissed once and never returns, so shortcuts
              need a permanent way in. */}
          <button
            data-testid="shortcuts-button"
            onClick={() => setShortcuts(true)}
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts"
            className="rounded-full px-2.5 py-1.5 text-[13px] font-semibold transition-colors"
            style={{ color: "var(--ink-faint)" }}
          >
            ?
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
            <Board
              people={data.people}
              viewer={data.viewer}
              range={range}
              seen={seenTotals}
              justPassed={passed}
              onSelect={(id) => { setWho(id); setTab("you"); }}
            />
          </div>
          <StatTiles people={data.people} viewer={data.viewer} />
          <CrewChart people={data.people} />
        </>
      )}

      {tab === "feed" && (
        <Feed
          items={data.feed}
          people={data.people}
          engagement={engagement}
          viewer={data.viewer}
          apiKey={apiKey}
          onReact={react}
          onComment={comment}
          seen={seen}
          onSeen={markSeen}
          onMarkAllSeen={markAllSeen}
          jumpSignal={jumpSignal}
        />
      )}

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
          <div className="px-5 pt-4">
            {selected.profile.id === data.viewer ? (
              <AvatarUploader
                profile={selected.profile}
                index={data.people.findIndex((p) => p.profile.id === selected.profile.id)}
                apiKey={apiKey}
                onChange={(image) =>
                  setData((d) => d && ({
                    ...d,
                    people: d.people.map((p) =>
                      p.profile.id === selected.profile.id
                        ? { ...p, profile: { ...p.profile, avatar: image } }
                        : p),
                  }))}
              />
            ) : (
              <Avatar
                profile={selected.profile}
                size={40}
                index={data.people.findIndex((p) => p.profile.id === selected.profile.id)}
              />
            )}
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
              {[["1 2 3", "Board, Feed, You"], ["t w a", "Today, week, all time"], ["n", "Next unread comment"], ["g", "Back to top"], ["r", "Refresh"], ["?", "This list"]].map(
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
