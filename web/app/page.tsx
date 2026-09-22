"use client";
import { useEffect, useState } from "react";
import Board, { type Range } from "@/app/components/Board";
import Feed from "@/app/components/Feed";
import PersonPanel from "@/app/components/PersonPanel";
import type { CrewResponse } from "@/lib/types";

type Tab = "board" | "feed" | "person";

export default function Page() {
  const [data, setData] = useState<CrewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("board");
  const [range, setRange] = useState<Range>("today");
  const [who, setWho] = useState<string | null>(null);

  useEffect(() => {
    const key = new URLSearchParams(window.location.search).get("key") ?? "";
    fetch(`/api/crew?key=${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setError("That link is not valid. Check the key at the end of the URL."));
  }, []);

  if (error) return <p className="p-8 text-sm text-neutral-400">{error}</p>;
  if (!data) return <p className="p-8 text-sm text-neutral-500">Loading…</p>;

  const selected = data.people.find((p) => p.profile.id === (who ?? data.viewer)) ?? data.people[0];

  return (
    <main className="mx-auto max-w-2xl">
      <header className="flex items-center justify-between border-b border-neutral-800 px-4 py-4">
        <h1 className="text-base font-semibold tracking-tight">Anki Crew</h1>
        <nav className="flex gap-1 text-xs">
          {(["board", "feed", "person"] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
                    className={`rounded px-2.5 py-1 capitalize ${
                      tab === t ? "bg-neutral-800 text-neutral-100" : "text-neutral-500"}`}>
              {t}
            </button>
          ))}
        </nav>
      </header>

      {tab === "board" && (
        <>
          <div className="flex gap-1 px-4 py-3 text-xs">
            {(["today", "week", "all"] as Range[]).map((r) => (
              <button key={r} onClick={() => setRange(r)}
                      className={`rounded px-2.5 py-1 capitalize ${
                        range === r ? "bg-neutral-800 text-neutral-100" : "text-neutral-500"}`}>
                {r}
              </button>
            ))}
          </div>
          <Board people={data.people} viewer={data.viewer} range={range} />
        </>
      )}

      {tab === "feed" && <Feed items={data.feed} people={data.people} />}

      {tab === "person" && !selected && (
        <p className="px-4 py-12 text-center text-sm text-neutral-400">
          Nobody has published yet. Run the publisher and refresh.
        </p>
      )}

      {tab === "person" && selected && (
        <>
          <div className="flex gap-1 px-4 pt-3 text-xs">
            {data.people.map((p) => (
              <button key={p.profile.id} onClick={() => setWho(p.profile.id)}
                      className={`rounded px-2.5 py-1 ${
                        selected.profile.id === p.profile.id
                          ? "bg-neutral-800 text-neutral-100" : "text-neutral-500"}`}>
                {p.profile.displayName}
              </button>
            ))}
          </div>
          <PersonPanel person={selected} items={data.feed} />
        </>
      )}
    </main>
  );
}
