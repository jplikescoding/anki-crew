"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board, { type Range } from "@/app/components/Board";
import CardFields from "@/app/components/CardFields";
import CrewChart from "@/app/components/CrewChart";
import Feed, { ago } from "@/app/components/Feed";
import MomentPill from "@/app/components/MomentPill";
import Notes from "@/app/components/Notes";
import PersonPanel from "@/app/components/PersonPanel";
import PlayerCard from "@/app/components/PlayerCard";
import StatTiles from "@/app/components/StatTiles";
import WeekStrip from "@/app/components/WeekStrip";
import WeeklyRoundup from "@/app/components/WeeklyRoundup";
import WhatsNew from "@/app/components/WhatsNew";
import { Avatar, AvatarUploader, PersonCard } from "@/app/components/Avatar";
import { champion, finishedResults, type WeekResult } from "@/lib/competition";
import { lookFrom } from "@/lib/metrics";
import { ackPatch, pendingMoments, silentPatch, type Moment } from "@/lib/moments";
import { newNotesFor, settleNote } from "@/lib/notes";
import { readSeen, writeSeen, type Seen } from "@/lib/seen";
import { playCelebration } from "@/lib/sound";
import { FLOOR, NOTES_SEEN, mergeSeen, unreadCount, type SeenMap } from "@/lib/unread";
import { NOTES, markNotesSeen, notesOnArrival, type Note } from "@/lib/whatsNew";
import type { CrewNote, CrewResponse, Engagement, FieldMap, Look, NoteCard, PersonView } from "@/lib/types";

type Tab = "board" | "feed" | "notes" | "you";
const TABS: Tab[] = ["board", "feed", "notes", "you"];
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
  const [notes, setNotes] = useState<Note[]>([]);
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

  // What the previous visit showed, captured once so the roll-up has a floor.
  const before = useRef<Seen | null>(null);
  // The server's copy of your previous look, held for the tab's life so a
  // refresh -- which saves a new look -- doesn't wipe the arrows.
  const look = useRef<Look | null | undefined>(undefined);
  const [results, setResults] = useState<WeekResult[]>([]);
  const [moments, setMoments] = useState<Moment[]>([]);
  const queue = useRef<Moment[]>([]);
  const [roundup, setRoundup] = useState<{ result: WeekResult; late: boolean } | null>(null);
  const [celebrate, setCelebrate] = useState<{ id: string; tone: "gold" | "rose" } | null>(null);
  const [cardFor, setCardFor] = useState<string | null>(null);

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
      const now = Date.now();
      const finished = finishedResults(next.people, now);
      const state = next.competition ?? { results: {} };
      if (look.current === undefined) look.current = state.look ?? null;
      setResults(finished);
      setMoments(pendingMoments(next.people, next.viewer, state, finished));
      const me = next.people.find((p) => p.profile.id === next.viewer);
      if (me) {
        // Best effort: a lost save only means a moment may show once more.
        void fetch(`/api/competition?key=${encodeURIComponent(key)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...silentPatch(next.people, next.viewer, state, finished),
            look: lookFrom(next.people, me.meta.todayKey, now),
          }),
        }).catch(() => {});
      }

      setData(next);
      loaded.current = true;
      setEngagement(next.engagement ?? {});
      setSeen((prev) => mergeSeen(prev, next.seen ?? {}));
      writeSeen({
        totals: Object.fromEntries(next.people.map((p) => [p.profile.id, todayReviews(p)])),
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
    // Before the first load, which writes the snapshot this reads as "been here before".
    setNotes(notesOnArrival(readSeen() !== null));
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
   *
   * Resolves to the server's reply, or null once it has failed and reloaded.
   */
  const send = useCallback((path: string, body: object, failed: string, method = "POST") =>
    fetch(`${path}?key=${encodeURIComponent(apiKey)}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res): Promise<unknown> => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json().catch(() => null);
      })
      .catch(async () => {
        await load();
        setProblem(failed);
        return null;
      }), [apiKey, load]);

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

  /** Applied locally first; a failed save reloads, which puts back what the server has. */
  const saveFieldMap = useCallback((noteType: string, map: FieldMap) => {
    if (!data?.viewer) return;
    const me = data.viewer;
    setData((d) => d && ({
      ...d,
      fieldMaps: { ...d.fieldMaps, [me]: { ...(d.fieldMaps?.[me] ?? {}), [noteType]: map } },
    }));
    send("/api/fieldmap", { noteType, map }, "your card fields didn't save");
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

  const setCrewNotes = useCallback((change: (notes: CrewNote[]) => CrewNote[]) => {
    setData((d) => d && ({ ...d, notes: change(d.notes ?? []) }));
  }, []);

  /** Shown at once; swapped for the server's copy, which has the real id. */
  const addNote = useCallback((text: string, card?: NoteCard) => {
    if (!data?.viewer) return;
    const temp: CrewNote = {
      id: `tmp:${Date.now()}`, user: data.viewer, text, createdAt: Date.now(), ...(card ? { card } : {}),
    };
    setCrewNotes((notes) => [temp, ...notes]);
    void send("/api/note", card ? { text, card } : { text }, "your note didn't save").then((reply) => {
      const saved = (reply as { note?: CrewNote } | null)?.note;
      if (saved) setCrewNotes((notes) => settleNote(notes, temp.id, saved));
    });
  }, [data?.viewer, send, setCrewNotes]);

  const editNote = useCallback((id: string, text: string) => {
    setCrewNotes((notes) => notes.map((n) => (n.id === id ? { ...n, text, editedAt: Date.now() } : n)));
    void send("/api/note", { id, text }, "your note didn't save", "PUT");
  }, [send, setCrewNotes]);

  const deleteNote = useCallback((id: string) => {
    setCrewNotes((notes) => notes.filter((n) => n.id !== id));
    void send("/api/note", { id }, "your note didn't delete", "DELETE");
  }, [send, setCrewNotes]);

  const dismissHint = () => {
    setHint(false);
    try { localStorage.setItem(HINT_KEY, "1"); } catch { /* storage blocked */ }
  };

  const closeNotes = useCallback(() => {
    markNotesSeen();
    setNotes([]);
  }, []);

  /**
   * Plays queued moments one after another. A roundup waits for its Close; a
   * pass sweeps your row, then moves on. The tap that started this is what
   * lets the chime play at all.
   */
  const playNext = useCallback(function next() {
    const m = queue.current.shift();
    const me = data?.viewer;
    if (!m || !me) { setCelebrate(null); return; }
    if (m.kind === "results" || m.kind === "late") {
      setRoundup({ result: m.result, late: m.kind === "late" });
      if (m.result.winner === me) playCelebration();
      return;
    }
    setTab("board");
    setRange("week");
    setCelebrate({ id: me, tone: m.kind === "passed" ? "gold" : "rose" });
    if (m.kind === "passed") playCelebration();
    window.setTimeout(next, 1800);
  }, [data?.viewer]);

  const playMoments = useCallback(() => {
    if (!data) return;
    queue.current = [...moments];
    setMoments([]);
    void send("/api/competition", ackPatch(data.people, data.viewer, results), "couldn't save that you've seen it");
    playNext();
  }, [data, moments, results, send, playNext]);

  const cardContext = useMemo(() => ({ open: setCardFor, champion: champion(results) }), [results]);

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
      else if (k === "3") { setTab("notes"); setJumpSignal(0); }
      else if (k === "4") { setTab("you"); setJumpSignal(0); }
      else if (k === "t") setRange("today");
      else if (k === "w") setRange("week");
      else if (k === "a") setRange("all");
      else if (k === "r") void load();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [load]);

  const newNotes = data ? newNotesFor(data.notes ?? [], data.viewer, seen) : [];
  const newestNewNote = Math.max(0, ...newNotes.map((n) => n.createdAt));
  // Being on the Notes tab is reading it, including notes a refresh brings in.
  useEffect(() => {
    if (tab === "notes" && newestNewNote > 0) markSeen(NOTES_SEEN, newestNewNote);
  }, [tab, newestNewNote, markSeen]);

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
    <PersonCard.Provider value={cardContext}>
    <main className="mx-auto max-w-2xl pb-16">
      <header className="flex items-center justify-between px-5 py-5">
        <div>
          <h1 className="whitespace-nowrap text-[17px] font-bold tracking-[-.02em]">Anki Crew</h1>
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
                className="relative rounded-full px-2 py-1.5 capitalize transition-colors sm:px-3"
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
                {t === "notes" && newNotes.length > 0 && tab !== "notes" && (
                  <span
                    key={newNotes.length}
                    data-testid="notes-badge"
                    title={`${newNotes.length} new note${newNotes.length === 1 ? "" : "s"}`}
                    className="badge-pop absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                    style={{ background: "var(--cyan)", color: "#04121A" }}
                  >
                    {newNotes.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
          <button
            onClick={() => void load()}
            aria-label="Refresh"
            title="Checks for new data. Your own stats publish a minute or two after you close Anki."
            className="ml-1 rounded-full px-2 py-1.5 text-[13px] transition-colors sm:px-2.5"
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
            className="rounded-full px-2 py-1.5 text-[13px] font-semibold transition-colors sm:px-2.5"
            style={{ color: "var(--ink-faint)" }}
          >
            ?
          </button>
        </div>
      </header>

      {tab === "board" && (
        <>
          <MomentPill moments={moments} people={data.people} viewer={data.viewer} onPlay={playMoments} />
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pb-1 text-[11.5px]">
            <div className="flex gap-1">
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
                  {r === "all" ? "all time" : r === "week" ? "this week" : r}
                </button>
              ))}
            </div>
            {results.length > 0 && (
              <WeekStrip
                result={results[results.length - 1]}
                history={results}
                people={data.people}
                onReplay={() => setRoundup({ result: results[results.length - 1], late: false })}
              />
            )}
          </div>
          <div className="pt-2">
            <Board
              people={data.people}
              viewer={data.viewer}
              range={range}
              seen={seenTotals}
              look={look.current ?? null}
              champion={champion(results)}
              celebrate={celebrate}
              onSelect={setCardFor}
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
          fieldMaps={data.fieldMaps}
          inMyDeck={data.inMyDeck}
          notes={data.notes ?? []}
          onAddNote={addNote}
          onEditNote={editNote}
          onDeleteNote={deleteNote}
        />
      )}

      {tab === "notes" && (
        <Notes
          notes={data.notes ?? []}
          people={data.people}
          viewer={data.viewer}
          canWrite={Boolean(apiKey && data.viewer)}
          onAdd={(text) => addNote(text)}
          onEdit={editNote}
          onDelete={deleteNote}
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
                {champion(results) === p.profile.id && " 👑"}
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
          {selected.profile.id === data.viewer && (
            <CardFields
              noteTypes={data.noteTypes ?? {}}
              fieldMaps={data.fieldMaps?.[data.viewer] ?? {}}
              items={data.feed.filter((i) => i.user === data.viewer)}
              onSave={saveFieldMap}
            />
          )}
          <PersonPanel person={selected} items={data.feed} fieldMaps={data.fieldMaps?.[selected.profile.id]} results={results} />
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
              {[["1 2 3 4", "Board, Feed, Notes, You"], ["t w a", "Today, this week, all time"], ["n", "Next unread comment"], ["g", "Back to top"], ["r", "Refresh"], ["?", "This list"]].map(
                ([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt><kbd className="rounded px-1.5 py-0.5" style={{ background: "var(--pane-lift)", color: "var(--ink)" }}>{k}</kbd></dt>
                    <dd>{v}</dd>
                  </div>
                ),
              )}
            </dl>
            <button
              onClick={() => { setShortcuts(false); setNotes(NOTES); }}
              className="mt-4 text-[11.5px]"
              style={{ color: "var(--cyan-soft)" }}
            >
              What&apos;s new
            </button>
          </div>
        </div>
      )}

      {notes.length > 0 && <WhatsNew notes={notes} onClose={closeNotes} />}
      {roundup && (
        <WeeklyRoundup
          result={roundup.result}
          history={results}
          people={data.people}
          viewer={data.viewer}
          late={roundup.late}
          onClose={() => { setRoundup(null); playNext(); }}
        />
      )}
      {cardFor && (() => {
        const p = data.people.find((x) => x.profile.id === cardFor);
        return p ? (
          <PlayerCard
            person={p}
            people={data.people}
            viewer={data.viewer}
            results={results}
            onClose={() => setCardFor(null)}
            onFullStats={() => { setWho(p.profile.id); setTab("you"); setCardFor(null); }}
          />
        ) : null;
      })()}
    </main>
    </PersonCard.Provider>
  );
}
