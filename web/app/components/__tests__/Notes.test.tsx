import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import Notes from "@/app/components/Notes";
import type { CrewNote, PersonView } from "@/lib/types";

function person(id: string, name: string): PersonView {
  return {
    profile: { id, displayName: name, tz: "America/New_York", joinedAt: 0 },
    meta: { lastPublishAt: 0, streak: 0, todayKey: "2026-09-28", allTimeReviews: 0, firstReviewAt: 0 },
    days: [],
  };
}

const people = ["jp", "adam", "peter", "harry", "jamie"].map((id) => person(id, id[0].toUpperCase() + id.slice(1)));
const note = (id: string, user: string, createdAt: number): CrewNote => ({ id, user, text: `text ${id}`, createdAt });

function view(notes: CrewNote[], extra = {}) {
  const handlers = { onAdd: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
  const utils = render(<Notes notes={notes} people={people} viewer="jp" canWrite {...handlers} {...extra} />);
  return { ...handlers, ...utils };
}

const ids = () => screen.getAllByTestId(/^note-(?!text|card|edit|delete)/).map((el) => el.dataset.testid);

describe("Notes", () => {
  it("lists newest first", () => {
    view([note("a", "adam", 100), note("b", "jp", 300), note("c", "peter", 200)]);
    expect(ids()).toEqual(["note-b", "note-c", "note-a"]);
  });

  it("filters by author, listing only people who wrote something, with counts", () => {
    view([note("a", "adam", 100), note("b", "adam", 300), note("c", "peter", 200)]);
    const filter = screen.getByTestId("notes-filter");
    const options = within(filter).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual(["Everyone", "Adam (2)", "Peter (1)"]);
    fireEvent.change(filter, { target: { value: "peter" } });
    expect(ids()).toEqual(["note-c"]);
  });

  it("falls back to Everyone when the chosen author has no notes left", () => {
    const { rerender } = view([note("a", "adam", 100), note("c", "peter", 200)]);
    fireEvent.change(screen.getByTestId("notes-filter"), { target: { value: "peter" } });
    rerender(<Notes notes={[note("a", "adam", 100)]} people={people} viewer="jp" canWrite
                    onAdd={() => {}} onEdit={() => {}} onDelete={() => {}} />);
    expect(ids()).toEqual(["note-a"]);
    expect(screen.queryByTestId("notes-filter")).toBeNull(); // only one author left: nothing to choose
  });

  it("shows an empty state and no filter when there are no notes", () => {
    view([]);
    expect(screen.getByTestId("notes-empty")).toHaveTextContent("Tap 📝 on any card in the Feed");
    expect(screen.queryByTestId("notes-filter")).toBeNull();
  });

  it("writes a free-standing note", () => {
    const { onAdd } = view([]);
    fireEvent.click(screen.getByTestId("new-note"));
    fireEvent.change(screen.getByTestId("note-input"), { target: { value: "は marks the topic" } });
    fireEvent.click(screen.getByTestId("note-save"));
    expect(onAdd).toHaveBeenCalledWith("は marks the topic");
    expect(screen.queryByTestId("note-input")).toBeNull();
  });

  it("offers edit and delete on your notes only, wired to the note id", () => {
    const { onEdit, onDelete } = view([note("mine", "jp", 2), note("theirs", "adam", 1)]);
    expect(screen.queryByTestId("note-edit-theirs")).toBeNull();
    fireEvent.click(screen.getByTestId("note-edit-mine"));
    fireEvent.change(screen.getByTestId("note-input"), { target: { value: "v2" } });
    fireEvent.click(screen.getByTestId("note-save"));
    expect(onEdit).toHaveBeenCalledWith("mine", "v2");
    fireEvent.click(screen.getByTestId("note-delete-mine"));
    fireEvent.click(screen.getByTestId("note-delete-confirm-mine"));
    expect(onDelete).toHaveBeenCalledWith("mine");
  });

  it("has no New note button without a key to write with", () => {
    view([], { canWrite: false });
    expect(screen.queryByTestId("new-note")).toBeNull();
  });
});
