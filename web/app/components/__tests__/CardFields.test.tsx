import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CardFields from "@/app/components/CardFields";
import type { FeedItem } from "@/lib/types";

const noteTypes = { Core: ["Core-Index", "Vocabulary-Kanji", "Vocabulary-English", "Expression"] };
const mine: FeedItem = { id: "jp:1", user: "jp", front: "5493", back: "", deck: "Core", ease: 3, ivl: 1, ts: 1,
  noteType: "Core", fields: { "Core-Index": "5493", "Vocabulary-Kanji": "作る", "Vocabulary-English": "to make",
                              Expression: "<b>作る</b>。" } };

describe("CardFields", () => {
  it("shows the guess as 'auto' and previews a real card", () => {
    render(<CardFields noteTypes={noteTypes} fieldMaps={{}} items={[mine]} onSave={() => {}} />);
    expect(screen.getByLabelText("Core Word")).toHaveValue("");
    expect(screen.getByRole("option", { name: "auto (Vocabulary-Kanji)" })).toBeInTheDocument();
    expect(screen.getByTestId("card-fields-preview-Core")).toHaveTextContent("作る — to make");
  });

  it("saves a change for that note type only", () => {
    const onSave = vi.fn();
    render(<CardFields noteTypes={noteTypes} fieldMaps={{ Core: { sentence: "Expression" } }} items={[mine]} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Core Meaning"), { target: { value: "Expression" } });
    expect(onSave).toHaveBeenCalledWith("Core", { sentence: "Expression", meaning: "Expression" });
  });

  it("choosing auto drops that override, and Reset clears them all", () => {
    const onSave = vi.fn();
    render(<CardFields noteTypes={noteTypes} fieldMaps={{ Core: { word: "Expression", meaning: "Expression" } }}
                       items={[]} onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Core Word"), { target: { value: "" } });
    expect(onSave).toHaveBeenLastCalledWith("Core", { meaning: "Expression" });
    fireEvent.click(screen.getByRole("button", { name: "Reset to auto" }));
    expect(onSave).toHaveBeenLastCalledWith("Core", {});
  });

  it("renders nothing before the publisher sends note types", () => {
    const { container } = render(<CardFields noteTypes={{}} fieldMaps={{}} items={[]} onSave={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
