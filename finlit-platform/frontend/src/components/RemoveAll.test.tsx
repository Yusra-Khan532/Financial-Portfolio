// @vitest-environment jsdom
// "Remove all" (task #127): nothing is removed on the first press; the question says how many and what; Cancel and Escape go back; one "Yes" removes once.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoveAll } from "./RemoveAll";

afterEach(cleanup);
describe("RemoveAll", () => {
  it("shows no button when there is nothing to remove", () => {
    const { container } = render(<RemoveAll count={0} noun="share" className="b" onConfirm={vi.fn()} />);
    expect(container.textContent).toBe("");
  });
  it("asks first, with the count, and removes only on 'Yes, remove all'", async () => {
    const yes = vi.fn();
    render(<RemoveAll count={38} noun="share" className="b" note="The quantities you typed go too." onConfirm={yes} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove all" }));
    expect(yes).not.toHaveBeenCalled();                                              // the first press only asks
    expect(screen.getByRole("group", { name: "Remove all 38 shares?" }).textContent).toContain("Remove all 38 shares? The quantities you typed go too.");
    expect(document.activeElement?.textContent).toBe("Cancel");                     // the safe choice has the focus
    fireEvent.click(screen.getByRole("button", { name: "Yes, remove all" }));
    await vi.waitFor(() => expect(yes).toHaveBeenCalledTimes(1));
  });
  it("Cancel and Escape go back without removing anything, and the button gets the focus back", () => {
    const yes = vi.fn();
    render(<RemoveAll count={2} noun="fund" className="b" onConfirm={yes} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove all" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Remove all" })).toBe(document.activeElement);
    fireEvent.click(screen.getByRole("button", { name: "Remove all" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Cancel" }), { key: "Escape" });
    expect(screen.queryByRole("group")).toBeNull(); expect(yes).not.toHaveBeenCalled();
  });
  it("says 'the 1 share' for one, and shows Removing… while it works", () => {
    const { rerender } = render(<RemoveAll count={1} noun="share" className="b" onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove all" }));
    expect(screen.getByRole("group", { name: "Remove the 1 share?" })).toBeTruthy();
    rerender(<RemoveAll count={1} noun="share" className="b" busy onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Removing…" })).toHaveProperty("disabled", true);
  });
});
