// @vitest-environment jsdom
// Task #183 (COMMON-RULES 10): the Clear portfolio dialog and its 10-second Undo.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClearPortfolio } from "./ClearPortfolio";

afterEach(() => { cleanup(); vi.useRealTimers(); });
const GOES = ["the quantities you added", "the figures worked out from them: score, diversification and risk"];
const open = (over: Partial<Parameters<typeof ClearPortfolio>[0]> = {}) => {
  const onClear = vi.fn(async () => {}), onUndo = vi.fn(async () => {});
  render(<ClearPortfolio count={39} noun="share" kind="equity" goes={GOES} className="b" onClear={onClear} onUndo={onUndo} {...over} />);
  fireEvent.click(screen.getByRole("button", { name: "Clear portfolio" }));
  return { onClear, onUndo };
};

describe("Clear portfolio", () => {
  it("the dialog names the count, lists what goes, says what stays, and starts on Keep my portfolio", () => {
    open();
    const d = screen.getByRole("dialog", { name: "Clear your equity portfolio?" });
    expect(d.textContent).toContain("This removes all 39 shares from this portfolio, with:");
    expect([...d.querySelectorAll("li")].map((l) => l.textContent)).toEqual(GOES);
    expect(d.textContent).toContain("Your watchlists, alerts and other portfolios are not touched. You can undo for 10 seconds.");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep my portfolio" }));
    expect(screen.getByRole("button", { name: "Clear 39 shares" })).toBeTruthy();
  });
  it("Escape, a click outside and Keep my portfolio close it without clearing", () => {
    const { onClear } = open();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear portfolio" }));
    fireEvent.mouseDown(document.querySelector(".cpf-back")!);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Clear portfolio" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep my portfolio" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onClear).not.toHaveBeenCalled();
  });
  it("clearing shows '39 shares removed. Undo'; Undo within 10 seconds puts the list back", async () => {
    const { onClear, onUndo } = open();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Clear 39 shares" })); });
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toBe("39 shares removed.Undo");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Undo" })); });
    expect(onUndo).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("after 10 seconds the Undo goes and the clear is final", async () => {
    vi.useFakeTimers();
    open();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Clear 39 shares" })); });
    expect(screen.getByRole("button", { name: "Undo" })).toBeTruthy();
    for (let i = 0; i < 10; i++) await act(async () => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });
  it("no button to press when the list is empty", () => {
    render(<ClearPortfolio count={0} noun="share" kind="equity" goes={GOES} className="b" onClear={async () => {}} onUndo={async () => {}} />);
    expect((screen.getByRole("button", { name: "Clear portfolio" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
