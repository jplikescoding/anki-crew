import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import Page from "@/app/page";
import { playCelebration } from "@/lib/sound";
import type { CrewResponse, Engagement, PersonView } from "@/lib/types";

vi.mock("@/lib/sound", () => ({ playCelebration: vi.fn() }));

const TODAY = "2026-09-23";
const SEEN = "anki-crew:seen:v1";

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

function crew(engagement: Record<string, Engagement> = {}, jpPublishedAt = Date.now()): CrewResponse {
  return {
    viewer: "jp",
    people: [person("jp", "JP", 10, jpPublishedAt), person("peter", "Peter", 5)],
    feed: [card],
    engagement,
    seen: {},
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

    for (const key of ["r", "1", "3", "w", "?"]) fireEvent.keyDown(input, { key });

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

describe("the overtake chime", () => {
  it("rings once, not on every refresh", async () => {
    localStorage.setItem(SEEN, JSON.stringify({ totals: {}, order: ["peter", "jp"], at: 0 }));
    await mount();
    await refresh();
    await refresh();
    expect(playCelebration).toHaveBeenCalledTimes(1);
  });
});

describe("unread comments", () => {
  const banter = { "peter:1": { reactions: {}, comments: [{ user: "peter", text: "nice", at: 5000 }] } };

  it("clear the badge when you open the feed", async () => {
    localStorage.setItem(SEEN, JSON.stringify({ totals: {}, order: [], at: 0, commentsSeenAt: 1000 }));
    crewReplies.push(ok(crew(banter)));
    await mount();
    expect(screen.getByTestId("unread-badge")).toHaveTextContent("1");
    fireEvent.click(screen.getByRole("button", { name: /^feed/ }));
    expect(screen.queryByTestId("unread-badge")).not.toBeInTheDocument();
  });

  it("stay read after a refresh", async () => {
    localStorage.setItem(SEEN, JSON.stringify({ totals: {}, order: [], at: 0, commentsSeenAt: 1000 }));
    crewReplies.push(ok(crew(banter)), ok(crew(banter)));
    await mount();
    fireEvent.click(screen.getByRole("button", { name: /^feed/ }));
    await refresh();
    expect(JSON.parse(localStorage.getItem(SEEN)!).commentsSeenAt).toBeGreaterThan(5000);
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
