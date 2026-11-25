// @vitest-environment jsdom
// FinLit AI History: the ⋯ menu on a chat (owner, 25 Nov 2026): Pin, Rename, Save to Saved Questions, Copy question, Delete, each with its letter.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AskChatItem } from "./AskChatMenu";
import { loadNames, loadPinned, loadRecent, pushRecent, removeRecent, renameChat, sideList, togglePinned } from "../lib/askExplorer";

afterEach(cleanup);
beforeEach(() => localStorage.clear());
const Q = "How is the banking sector doing on Sector Rotation?";
const mount = (o: Partial<Parameters<typeof AskChatItem>[0]> = {}) => {
  const fn = { onAsk: vi.fn(), onPin: vi.fn(), onRename: vi.fn(), onSave: vi.fn(), onDelete: vi.fn(), onCopied: vi.fn() };
  render(<ul><AskChatItem text={Q} pinned={false} saved={false} {...fn} {...o} /></ul>);
  return fn;
};

describe("a History chat's ⋯ menu", () => {
  it("the chat asks again on a click; ⋯ opens Pin, Rename, Save, Copy and Delete with their letters", () => {
    const fn = mount();
    fireEvent.click(screen.getByRole("button", { name: Q }));
    expect(fn.onAsk).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `More for “${Q}”` }));
    const items = screen.getAllByRole("menuitem");
    expect(items.map((b) => b.textContent)).toEqual(["PinP", "RenameR", "Save to Saved QuestionsS", "Copy questionC", "DeleteD"]);
    expect(document.activeElement).toBe(items[0]);                                   // the keyboard lands in the menu
    fireEvent.click(items[0]); expect(fn.onPin).toHaveBeenCalled();
    expect(screen.queryByRole("menu")).toBeNull();
  });
  it("the letters work, the arrows move, Esc closes and gives focus back to ⋯", () => {
    const fn = mount({ pinned: true, saved: true });
    const more = screen.getByRole("button", { name: `More for “${Q}”` });
    fireEvent.click(more);
    expect(screen.getAllByRole("menuitem").map((b) => b.textContent)).toEqual(["UnpinP", "RenameR", "Remove from Saved QuestionsS", "Copy questionC", "DeleteD"]);
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });
    expect(document.activeElement?.textContent).toBe("RenameR");
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull(); expect(document.activeElement).toBe(more);
    fireEvent.click(more); fireEvent.keyDown(screen.getByRole("menu"), { key: "d" });
    expect(fn.onDelete).toHaveBeenCalled();
    fireEvent.click(more); fireEvent.keyDown(screen.getByRole("menu"), { key: "s" });
    expect(fn.onSave).toHaveBeenCalled();
  });
  it("Rename edits in place: Enter keeps the new name, Esc leaves the old one; a renamed chat shows its name and asks its question", () => {
    const fn = mount();
    fireEvent.click(screen.getByRole("button", { name: `More for “${Q}”` }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "r" });
    const box = screen.getByRole("textbox", { name: `New name for “${Q}”` }) as HTMLInputElement;
    expect(box.value).toBe(Q);
    fireEvent.change(box, { target: { value: "Banks on Rotation" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(fn.onRename).toHaveBeenCalledWith("Banks on Rotation");
    cleanup();
    const f2 = mount({ name: "Banks on Rotation", pinned: true });
    const chat = screen.getByRole("button", { name: "Banks on Rotation" });
    expect(chat.getAttribute("title")).toBe(`Banks on Rotation: ${Q}`);
    expect(chat.querySelector(".aif-pin-i")).toBeTruthy();                          // a pinned chat carries the pin
    fireEvent.click(chat); expect(f2.onAsk).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "More for “Banks on Rotation”" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "r" });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(f2.onRename).not.toHaveBeenCalled();
  });
  it("Copy question puts the question itself on the clipboard", async () => {
    const write = vi.fn(async () => {}); Object.assign(navigator, { clipboard: { writeText: write } });
    const fn = mount({ name: "Banks" });
    fireEvent.click(screen.getByRole("button", { name: "More for “Banks”" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "c" });
    expect(write).toHaveBeenCalledWith(Q);
    await vi.waitFor(() => expect(fn.onCopied).toHaveBeenCalled());
  });
});

describe("what the menu keeps (this browser)", () => {
  it("pinned chats come first and stay even when newer questions push them out; the rest are the newest five", () => {
    let r: string[] = [];
    for (let i = 1; i <= 8; i++) r = pushRecent(r, `q${i}`);
    let p = togglePinned([], "q1");
    expect(sideList(r, p).map((x) => `${x.text}${x.pinned ? "*" : ""}`)).toEqual(["q1*", "q8", "q7", "q6", "q5", "q4"]);
    for (let i = 9; i <= 30; i++) r = pushRecent(r, `q${i}`);
    expect(r).not.toContain("q1");
    expect(sideList(r, p)[0]).toEqual({ text: "q1", pinned: true });
    p = togglePinned(p, "q1"); expect(p).toEqual([]); expect(loadPinned()).toEqual([]);
  });
  it("a name is kept, an empty name brings the question back, and Delete takes the chat out of History", () => {
    let n = renameChat({}, Q, "  Banks  ");
    expect(n).toEqual({ [Q]: "Banks" }); expect(loadNames()).toEqual({ [Q]: "Banks" });
    n = renameChat(n, Q, ""); expect(n).toEqual({}); expect(loadNames()).toEqual({});
    let r = pushRecent(pushRecent([], "a"), Q);
    r = removeRecent(r, Q); expect(r).toEqual(["a"]); expect(loadRecent()).toEqual(["a"]);
    localStorage.setItem("finlit-ai-names", "not json"); expect(loadNames()).toEqual({});     // a damaged store never breaks the panel
  });
});

describe("Chat History page (a phone has no side list)", () => {
  it("lists the browser's questions pinned first, each with its ⋯ menu", async () => {
    const { AskHistoryView } = await import("./AskHistory");
    const { MemoryRouter } = await import("react-router");
    render(<MemoryRouter><AskHistoryView server={false} recent={["b", "a"]} onAsk={() => {}} onClearLocal={() => {}} order={sideList(["b", "a"], ["a"], 50).map((x) => x.text)}
      item={(t) => <AskChatItem key={t} text={t} pinned={t === "a"} saved={false} onAsk={() => {}} onPin={() => {}} onRename={() => {}} onSave={() => {}} onDelete={() => {}} />} /></MemoryRouter>);
    const list = screen.getByRole("list", { name: "Recent questions" });
    expect(Array.from(list.querySelectorAll(".aif-hq")).map((b) => b.textContent)).toEqual(["a", "b"]);
    expect(screen.getAllByRole("button", { name: /^More for/ })).toHaveLength(2);
  });
});
