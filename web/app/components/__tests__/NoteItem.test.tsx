import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import NoteComposer from "@/app/components/NoteComposer";
import NoteItem from "@/app/components/NoteItem";
import type { CrewNote } from "@/lib/types";

const card = { itemId: "adam:1", word: "一人", meaning: "alone", sentence: "今日は一人で映画を見ます。" };
const note: CrewNote = { id: "jp:1:ab", user: "jp", text: "で = by means of\nnot location here", createdAt: Date.now() - 120_000, card };

function item(over: Partial<Parameters<typeof NoteItem>[0]> = {}) {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  render(<NoteItem note={note} index={0} now={Date.now()} mine showCard onEdit={onEdit} onDelete={onDelete} {...over} />);
  return { onEdit, onDelete };
}

describe("NoteComposer", () => {
  it("saves trimmed text, and won't save whitespace", () => {
    const onSave = vi.fn();
    render(<NoteComposer onSave={onSave} onCancel={() => {}} />);
    const save = screen.getByTestId("note-save");
    fireEvent.change(screen.getByTestId("note-input"), { target: { value: "   \n " } });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByTestId("note-input"), { target: { value: "  は vs が  " } });
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith("は vs が");
  });

  it("saves on Ctrl+Enter and shows a counter near the limit", () => {
    const onSave = vi.fn();
    render(<NoteComposer onSave={onSave} onCancel={() => {}} />);
    const input = screen.getByTestId("note-input");
    fireEvent.change(input, { target: { value: "x".repeat(950) } });
    expect(screen.getByTestId("note-count")).toHaveTextContent("950 / 1000");
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true });
    expect(onSave).toHaveBeenCalledWith("x".repeat(950));
  });

  it("hides the counter well under the limit", () => {
    render(<NoteComposer onSave={() => {}} onCancel={() => {}} />);
    fireEvent.change(screen.getByTestId("note-input"), { target: { value: "short" } });
    expect(screen.queryByTestId("note-count")).toBeNull();
  });
});

describe("NoteItem", () => {
  it("shows the card quote and keeps line breaks", () => {
    item();
    expect(screen.getByTestId("note-card-jp:1:ab")).toHaveTextContent("一人 — alone");
    expect(screen.getByText("今日は一人で映画を見ます。")).toBeInTheDocument();
    expect(screen.getByTestId("note-text-jp:1:ab").textContent).toBe(note.text);
    expect(screen.getByTestId("note-text-jp:1:ab")).toHaveStyle({ whiteSpace: "pre-wrap" });
  });

  it("renders pasted HTML as text", () => {
    item({ note: { ...note, text: "<script>alert(1)</script>" } });
    expect(screen.getByTestId("note-text-jp:1:ab").textContent).toBe("<script>alert(1)</script>");
    expect(document.querySelector("script")).toBeNull();
  });

  it("leaves the card quote out when asked", () => {
    item({ showCard: false });
    expect(screen.queryByTestId("note-card-jp:1:ab")).toBeNull();
  });

  it("edits your own note in place", () => {
    const { onEdit } = item();
    fireEvent.click(screen.getByTestId("note-edit-jp:1:ab"));
    expect(screen.getByTestId("note-input")).toHaveValue(note.text);
    fireEvent.change(screen.getByTestId("note-input"), { target: { value: "fixed" } });
    fireEvent.click(screen.getByTestId("note-save"));
    expect(onEdit).toHaveBeenCalledWith("fixed");
    expect(screen.queryByTestId("note-input")).toBeNull();
  });

  it("asks before deleting", () => {
    const { onDelete } = item();
    fireEvent.click(screen.getByTestId("note-delete-jp:1:ab"));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText("Delete this note?")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("note-delete-confirm-jp:1:ab"));
    expect(onDelete).toHaveBeenCalled();
  });

  it("offers no edit or delete on someone else's note", () => {
    item({ mine: false });
    expect(screen.queryByTestId("note-edit-jp:1:ab")).toBeNull();
    expect(screen.queryByTestId("note-delete-jp:1:ab")).toBeNull();
  });

  it("offers no edit or delete while the note is still saving", () => {
    item({ note: { ...note, id: "tmp:1" } });
    expect(screen.queryByTestId("note-edit-tmp:1")).toBeNull();
    expect(screen.queryByTestId("note-delete-tmp:1")).toBeNull();
  });

  it("marks an edited note", () => {
    item({ note: { ...note, editedAt: Date.now() } });
    expect(screen.getByText(/edited/)).toBeInTheDocument();
  });
});
