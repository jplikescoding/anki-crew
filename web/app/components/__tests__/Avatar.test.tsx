import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Avatar, PersonCard } from "@/app/components/Avatar";

const adam = { id: "adam", displayName: "Adam" };

describe("Avatar", () => {
  it("opens the person's card on click without triggering what's around it", () => {
    const open = vi.fn();
    const outer = vi.fn();
    render(
      <PersonCard.Provider value={{ open, champion: null }}>
        <button onClick={outer}><Avatar profile={adam} /></button>
      </PersonCard.Provider>,
    );
    fireEvent.click(screen.getByTestId("avatar-adam"));
    expect(open).toHaveBeenCalledWith("adam");
    expect(outer).not.toHaveBeenCalled();
  });

  it("opens on Enter too", () => {
    const open = vi.fn();
    render(<PersonCard.Provider value={{ open, champion: null }}><Avatar profile={adam} /></PersonCard.Provider>);
    fireEvent.keyDown(screen.getByTestId("avatar-adam"), { key: "Enter" });
    expect(open).toHaveBeenCalledWith("adam");
  });

  it("stays a plain picture when told to, or with no card to open", () => {
    render(
      <PersonCard.Provider value={{ open: vi.fn(), champion: null }}>
        <Avatar profile={adam} interactive={false} />
      </PersonCard.Provider>,
    );
    render(<Avatar profile={{ id: "jp", displayName: "JP" }} />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("rings the champion in gold", () => {
    render(<PersonCard.Provider value={{ open: vi.fn(), champion: "adam" }}><Avatar profile={adam} /></PersonCard.Provider>);
    expect(screen.getByTestId("avatar-adam").querySelector("[data-crowned='true']")).toBeTruthy();
  });
});
