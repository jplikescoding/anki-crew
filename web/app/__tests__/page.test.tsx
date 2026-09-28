import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within, cleanup } from "@testing-library/react";
import Page from "@/app/page";
import { playCelebration } from "@/lib/sound";
import { NOTES } from "@/lib/whatsNew";
import type { CrewNote, CrewResponse, Engagement, PersonView } from "@/lib/types";

vi.mock("@/lib/sound", () => ({ playCelebration: vi.fn() }));

const TODAY = "2026-09-23";

function person(id: string, name: string, today: number, lastPublishAt = Date.now()): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/New_York", joinedAt: 0 },
    meta: { lastPublishAt, streak: 1, todayKey: TODAY, allTimeReviews: today, firstReviewAt: 0 },
    days: [{ date: TODAY, reviews: today, minutes: 1, newCards: 0, ease1: 0, ease2: 0, ease3: today, ease4: 0, perDeck: {} }],
  };
}

const card = {
  id: "peter:1", user: "peter", front: "話しかける", back: "to speak to",
  deck: "Core", ease: 3, ivl: 21, ts: Date.now() - 60_000,
};

function crew(
  engagement: Record<string, Engagement> = {},
  jpPublishedAt = Date.now(),
  seen: Record<string, number> = {},
): CrewResponse {
  return {
    viewer: "jp",
    people: [person("jp", "JP", 10, jpPublishedAt), person("peter", "Peter", 5)],
    feed: [card],
    engagement,
    seen,
    noteTypes: { Core: ["Vocabulary-Kanji", "Vocabulary-English"] },
    fieldMaps: { jp: {}, peter: {} },
    inMyDeck: {},
  };
}

type Reply = Response | Error;
let crewReplies: Reply[];
let writeReply: Reply;
let fetchMock: ReturnType<typeof vi.fn>;

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function crewCalls(): number {
  return fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/crew")).length;
}

async function mount() {
  render(<Page />);
  await screen.findByText("Anki Crew");
}

async function refresh() {
  await act(async () => { fireEvent.click(screen.getByLabelText("Refresh")); });
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/?key=key_jp");
  crewReplies = [];
  writeReply = ok({ ok: true });
  fetchMock = vi.fn(async (url: string) => {
    const reply = String(url).startsWith("/api/crew") ? (crewReplies.shift() ?? ok(crew())) : writeReply;
    if (reply instanceof Error) throw reply;
    return reply;
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(playCelebration).mockClear();
});

afterEach(() => vi.unstubAllGlobals());

describe("keyboard shortcuts", () => {
  it("leave you alone while you type a comment", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /^feed/ }));
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    const input = screen.getByTestId("comment-input-peter:1");
    const before = crewCalls();

    for (const key of ["r", "1", "3", "w", "?", "n", "g"]) fireEvent.keyDown(input, { key });

    expect(crewCalls()).toBe(before);
    expect(screen.getByTestId("comment-input-peter:1")).toBeInTheDocument();
    expect(screen.queryByText("Shortcuts")).not.toBeInTheDocument();
  });

  it("still work everywhere else", async () => {
    await mount();
    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByTestId("thread-peter:1")).toBeInTheDocument();
  });
});

describe("refresh failures", () => {
  it("keep the dashboard on screen and say the refresh failed", async () => {
    await mount();
    crewReplies.push(new TypeError("offline"));
    await refresh();
    expect(screen.getByText("Anki Crew")).toBeInTheDocument();
    expect(screen.getByTestId("sync-note")).toHaveTextContent(/couldn't refresh/i);
  });

  it("clear once a refresh works again", async () => {
    await mount();
    crewReplies.push(new TypeError("offline"));
    await refresh();
    await refresh();
    expect(screen.getByTestId("sync-note")).not.toHaveTextContent(/couldn't/i);
  });

  it("blame the link only when the server rejected the key", async () => {
    crewReplies.push(new Response("{}", { status: 401 }));
    render(<Page />);
    expect(await screen.findByText(/link isn't valid/)).toBeInTheDocument();
  });

  it("do not blame the link for a network failure on first load", async () => {
    crewReplies.push(new TypeError("offline"));
    render(<Page />);
    expect(await screen.findByText(/couldn't reach/i)).toBeInTheDocument();
    expect(screen.queryByText(/link isn't valid/)).not.toBeInTheDocument();
  });
});

describe("the sync line", () => {
  it("says when your own stats last arrived", async () => {
    crewReplies.push(ok(crew({}, Date.now() - 3 * 60_000)));
    await mount();
    expect(screen.getByTestId("sync-note")).toHaveTextContent("you published 3m ago");
  });
});

describe("unread comments", () => {
  const banter = { "peter:1": { reactions: {}, comments: [{ user: "peter", text: "nice", at: 5000 }] } };
  const unreadCrew = () => ok(crew(banter, Date.now(), { _floor: 1000 }));
  const seenCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).startsWith("/api/seen"));

  it("counts what the server says you haven't read", async () => {
    crewReplies.push(unreadCrew());
    await mount();
    expect(screen.getByTestId("unread-badge")).toHaveTextContent("1");
  });

  it("don't clear just because you looked at the feed", async () => {
    crewReplies.push(unreadCrew());
    await mount();
    fireEvent.keyDown(window, { key: "2" });
    expect(screen.getByTestId("unread-badge")).toHaveTextContent("1");
    expect(seenCalls()).toHaveLength(0);
  });

  it("clear when you open the thread, and tell the server", async () => {
    crewReplies.push(unreadCrew());
    await mount();
    fireEvent.keyDown(window, { key: "2" });
    await act(async () => { fireEvent.click(screen.getByTestId("thread-peter:1")); });
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
    expect(JSON.parse(seenCalls()[0][1].body)).toEqual({ itemId: "peter:1", upTo: 5000 });
  });

  it("open the Unread filter at the newest thread when you tap the badge", async () => {
    crewReplies.push(unreadCrew());
    await mount();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^feed/ })); });
    expect(screen.getByTestId("filter-unread")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("comment-input-peter:1")).toBeInTheDocument();
  });

  it("stay read when a refresh returns read state from before you opened it", async () => {
    crewReplies.push(unreadCrew(), unreadCrew());
    await mount();
    fireEvent.keyDown(window, { key: "2" });
    await act(async () => { fireEvent.click(screen.getByTestId("thread-peter:1")); });
    await refresh();
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });

  it("all clear at once with Mark all read", async () => {
    crewReplies.push(unreadCrew());
    await mount();
    fireEvent.keyDown(window, { key: "2" });
    fireEvent.click(screen.getByTestId("filter-unread"));
    fireEvent.click(screen.getByTestId("mark-all-read"));
    await act(async () => { fireEvent.click(screen.getByTestId("mark-all-read")); });
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
    expect(JSON.parse(seenCalls()[0][1].body)).toEqual({ all: true, upTo: 5000 });
  });
});

describe("writes that fail", () => {
  it("undo the reaction and say it didn't save", async () => {
    writeReply = new Response("{}", { status: 500 });
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /^feed/ }));
    await act(async () => { fireEvent.click(screen.getByTestId("react-peter:1-🔥")); });
    await waitFor(() =>
      expect(screen.getByTestId("react-peter:1-🔥")).toHaveAttribute("aria-pressed", "false"));
    expect(screen.getByTestId("sync-note")).toHaveTextContent(/didn't save/i);
  });

  it("drop the comment and say it didn't post", async () => {
    writeReply = new TypeError("offline");
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /^feed/ }));
    fireEvent.click(screen.getByTestId("thread-peter:1"));
    fireEvent.change(screen.getByTestId("comment-input-peter:1"), { target: { value: "がんばれ" } });
    await act(async () => { fireEvent.click(screen.getByText("Post")); });
    await waitFor(() => expect(screen.queryByText("がんばれ")).not.toBeInTheDocument());
    expect(screen.getByTestId("sync-note")).toHaveTextContent(/didn't post/i);
  });
});

describe("what's new", () => {
  const WHATS_NEW = "anki-crew:whatsnew:v1";
  const SEEN = "anki-crew:seen:v1";
  const visited = () => localStorage.setItem(SEEN, JSON.stringify({ totals: {}, at: 0 }));

  it("pops up once for someone who was here before this release", async () => {
    visited();
    await mount();
    const card = screen.getByTestId("whats-new");
    expect(card).toHaveTextContent(NOTES[0].title);

    fireEvent.click(within(card).getByRole("button", { name: "Got it" }));
    expect(screen.queryByTestId("whats-new")).toBeNull();
    expect(localStorage.getItem(WHATS_NEW)).toBe(NOTES[0].id);

    cleanup();
    await mount();
    expect(screen.queryByTestId("whats-new")).toBeNull();
  });

  it("leaves the hint bubble alone when it closes", async () => {
    visited();
    await mount();
    expect(screen.getByText(/Your numbers update/)).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("whats-new")).getByRole("button", { name: "Got it" }));
    expect(screen.getByText(/Your numbers update/)).toBeInTheDocument();
  });

  it("closes on the backdrop and on Esc, and both count as seen", async () => {
    visited();
    await mount();
    fireEvent.click(screen.getByTestId("whats-new"));
    expect(screen.queryByTestId("whats-new")).toBeNull();
    expect(localStorage.getItem(WHATS_NEW)).toBe(NOTES[0].id);

    cleanup();
    localStorage.removeItem(WHATS_NEW);
    await mount();
    // The first render lands outside act, so let the pop-up's Esc listener attach.
    await act(async () => {});
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("whats-new")).toBeNull();
    expect(localStorage.getItem(WHATS_NEW)).toBe(NOTES[0].id);
  });

  it("keeps page shortcuts from firing behind it", async () => {
    visited();
    await mount();
    await act(async () => {});
    const before = crewCalls();
    for (const key of ["2", "w", "r", "?"]) fireEvent.keyDown(window, { key });

    expect(crewCalls()).toBe(before);
    expect(screen.queryByTestId("thread-peter:1")).toBeNull();
    expect(screen.queryByText("Shortcuts")).toBeNull();
    expect(screen.getByTestId("whats-new")).toBeInTheDocument();
  });

  it("shows nothing to someone brand new, and counts them as current", async () => {
    await mount();
    expect(screen.queryByTestId("whats-new")).toBeNull();
    expect(localStorage.getItem(WHATS_NEW)).toBe(NOTES[0].id);
  });

  it("can be read again from the ? panel", async () => {
    await mount();
    fireEvent.click(screen.getByTestId("shortcuts-button"));
    fireEvent.click(screen.getByRole("button", { name: "What's new" }));
    const card = screen.getByTestId("whats-new");
    expect(card).toHaveTextContent(NOTES[0].title);
    expect(screen.queryByText("Shortcuts")).toBeNull();

    fireEvent.click(within(card).getByRole("button", { name: "Got it" }));
    expect(screen.queryByTestId("whats-new")).toBeNull();
    expect(localStorage.getItem(WHATS_NEW)).toBe(NOTES[0].id);
  });
});

describe("card fields", () => {
  it("saves your choice and applies it straight away", async () => {
    await mount();
    fireEvent.keyDown(window, { key: "4" });
    fireEvent.click(screen.getByRole("button", { name: /card setup/i }));
    fireEvent.change(screen.getByLabelText("Core Word"), { target: { value: "Vocabulary-English" } });
    const call = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/fieldmap"));
    expect(JSON.parse(call![1].body)).toEqual({ noteType: "Core", map: { word: "Vocabulary-English" } });
    expect(screen.getByLabelText("Core Word")).toHaveValue("Vocabulary-English");
  });

  it("goes back to what was saved, and says so, when the save fails", async () => {
    writeReply = new Response("{}", { status: 500 });
    await mount();
    fireEvent.keyDown(window, { key: "4" });
    fireEvent.click(screen.getByRole("button", { name: /card setup/i }));
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Core Word"), { target: { value: "Vocabulary-English" } });
    });
    await waitFor(() => expect(screen.getByLabelText("Core Word")).toHaveValue(""));
    expect(screen.getByTestId("sync-note")).toHaveTextContent(/didn't save/i);
  });
});

describe("notes", () => {
  const theirs: CrewNote = { id: "peter:5:ab", user: "peter", text: "は marks the topic", createdAt: Date.now() - 5_000 };
  const mine: CrewNote = { id: "jp:4:cd", user: "jp", text: "my own", createdAt: Date.now() - 4_000 };
  const withNotes = (notes: CrewNote[], seen: Record<string, number> = {}) => ok({ ...crew({}, Date.now(), seen), notes });

  it("puts Notes on 3 and You on 4", async () => {
    await mount();
    fireEvent.keyDown(window, { key: "3" });
    expect(screen.getByTestId("notes-empty")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "4" });
    expect(screen.getByRole("button", { name: /card setup/i })).toBeInTheDocument();
  });

  it("counts other people's new notes on the tab and clears it on opening", async () => {
    crewReplies = [withNotes([theirs, mine])];
    await mount();
    expect(screen.getByTestId("notes-badge")).toHaveTextContent("1");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^notes/ })); });
    expect(screen.queryByTestId("notes-badge")).toBeNull();
    const call = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/seen"));
    expect(JSON.parse(call![1].body)).toEqual({ itemId: "_notes", upTo: theirs.createdAt });
  });

  it("shows no count for notes already seen", async () => {
    crewReplies = [withNotes([theirs], { _notes: theirs.createdAt })];
    await mount();
    expect(screen.queryByTestId("notes-badge")).toBeNull();
  });

  it("shows a new note at once and keeps the server's copy", async () => {
    const saved: CrewNote = { id: "jp:9:zz", user: "jp", text: "で = by means of", createdAt: Date.now() };
    writeReply = ok({ ok: true, note: saved });
    await mount();
    fireEvent.keyDown(window, { key: "3" });
    fireEvent.click(screen.getByTestId("new-note"));
    fireEvent.change(screen.getByTestId("note-input"), { target: { value: "で = by means of" } });
    await act(async () => { fireEvent.click(screen.getByTestId("note-save")); });
    const call = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/note"));
    expect(call![1].method).toBe("POST");
    expect(JSON.parse(call![1].body)).toEqual({ text: "で = by means of" });
    await waitFor(() => expect(screen.getByTestId("note-jp:9:zz")).toBeInTheDocument());
  });

  it("says so when a note didn't save", async () => {
    writeReply = new Response("{}", { status: 500 });
    await mount();
    fireEvent.keyDown(window, { key: "3" });
    fireEvent.click(screen.getByTestId("new-note"));
    fireEvent.change(screen.getByTestId("note-input"), { target: { value: "lost" } });
    await act(async () => { fireEvent.click(screen.getByTestId("note-save")); });
    await waitFor(() => expect(screen.getByTestId("sync-note")).toHaveTextContent("your note didn't save"));
    expect(screen.queryByText("lost")).toBeNull();
  });

  it("deletes your note with DELETE", async () => {
    crewReplies = [withNotes([mine])];
    await mount();
    fireEvent.keyDown(window, { key: "3" });
    fireEvent.click(screen.getByTestId("note-delete-jp:4:cd"));
    await act(async () => { fireEvent.click(screen.getByTestId("note-delete-confirm-jp:4:cd")); });
    const call = fetchMock.mock.calls.find(([url]) => String(url).startsWith("/api/note"));
    expect(call![1].method).toBe("DELETE");
    expect(JSON.parse(call![1].body)).toEqual({ id: "jp:4:cd" });
    expect(screen.queryByTestId("note-jp:4:cd")).toBeNull();
  });

  it("leaves shortcuts alone while typing a note", async () => {
    await mount();
    fireEvent.keyDown(window, { key: "3" });
    fireEvent.click(screen.getByTestId("new-note"));
    const input = screen.getByTestId("note-input");
    for (const key of ["1", "2", "4", "?"]) fireEvent.keyDown(input, { key });
    expect(screen.getByTestId("note-input")).toBeInTheDocument();
  });
});

describe("the weekly race", () => {
  beforeEach(() => {
    // Tuesday of week 40. Only Date is faked; promises and timers stay real.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-29T15:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  function racer(id: string, name: string, days: [string, number][]): PersonView {
    return {
      profile: { id, displayName: name, tz: "America/New_York", joinedAt: Date.UTC(2026, 8, 22) },
      meta: { lastPublishAt: Date.now(), streak: 0, todayKey: "2026-09-29", allTimeReviews: 0, firstReviewAt: 0 },
      days: days.map(([date, reviews]) => ({ date, reviews, minutes: 1, newCards: 0, ease1: 0, ease2: 0, ease3: reviews, ease4: 0, perDeck: {} })),
    };
  }
  const race = (competition: CrewResponse["competition"], week40: [number, number] = [0, 0]) => ok({
    ...crew(),
    people: [
      racer("jp", "JP", [["2026-09-22", 88], ["2026-09-29", week40[0]]]),
      racer("adam", "Adam", [["2026-09-26", 894], ["2026-09-29", week40[1]]]),
    ],
    competition,
  });
  const competitionPosts = () => fetchMock.mock.calls
    .filter(([url]) => String(url).startsWith("/api/competition"))
    .map(([, init]) => JSON.parse(init.body));

  it("names the result in the pill, plays it on a tap and marks it seen", async () => {
    crewReplies.push(race({ results: {} }));
    await mount();
    const pill = await screen.findByTestId("moment-pill");
    expect(pill).toHaveTextContent("🏆 Week 39 results are in");
    fireEvent.click(pill);
    expect(screen.getByTestId("roundup-headline")).toHaveTextContent("Adam cruises past JP by 806 for a first ever win");
    expect(competitionPosts().some((b) => b.results?.["2026-09-21"] === "adam")).toBe(true);
    expect(playCelebration).not.toHaveBeenCalled(); // JP didn't win it
  });

  it("stays quiet once the week has been shown, and keeps the strip", async () => {
    crewReplies.push(race({ results: { "2026-09-21": "adam" } }));
    await mount();
    expect(screen.queryByTestId("moment-pill")).toBeNull();
    expect(screen.getByTestId("week-strip")).toHaveTextContent("Week 39: Adam 894 · JP 88");
    expect(within(screen.getByTestId("row-adam")).getByTestId("crown")).toBeTruthy();
  });

  it("rings for a pass only after the tap", async () => {
    crewReplies.push(race(
      { results: { "2026-09-21": "adam" }, standing: { week: "2026-09-28", order: ["adam", "jp"] } },
      [50, 40],
    ));
    await mount();
    const pill = await screen.findByTestId("moment-pill");
    expect(pill).toHaveTextContent("⚡ You passed Adam this week");
    expect(playCelebration).not.toHaveBeenCalled();
    fireEvent.click(pill);
    expect(playCelebration).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("row-jp").className).toContain("overtaken");
  });

  it("saves this load as your last look, and keeps the previous one for the arrows through a refresh", async () => {
    const earlier = { at: Date.UTC(2026, 8, 29, 12), day: "2026-09-29", week: "2026-09-28",
      scores: { jp: { today: 0, week: 0, all: 0 }, adam: { today: 30, week: 30, all: 924 } } };
    crewReplies.push(race({ results: { "2026-09-21": "adam" }, look: earlier }, [50, 40]));
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "this week" }));
    expect(screen.getByTestId("delta-jp").textContent).toBe("▲1");
    const saved = competitionPosts().find((b) => b.look);
    expect(saved.look.day).toBe("2026-09-29");
    expect(saved.look.scores.jp.week).toBe(50);

    crewReplies.push(race({ results: { "2026-09-21": "adam" }, look: saved.look }, [50, 40]));
    await refresh();
    expect(screen.getByTestId("delta-jp").textContent).toBe("▲1");
  });

  it("opens a player card from a board avatar", async () => {
    crewReplies.push(race({ results: { "2026-09-21": "adam" } }));
    await mount();
    fireEvent.click(screen.getByTestId("avatar-adam"));
    expect(screen.getByTestId("player-card")).toHaveTextContent("Adam");
    fireEvent.click(screen.getByText("Full stats ▸"));
    expect(screen.queryByTestId("player-card")).toBeNull();
    expect(screen.getByTestId("stat-grid")).toBeTruthy();
  });
});
