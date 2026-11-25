// @vitest-environment jsdom
// Task #349 PR 2: FinLit AI's question memory in the browser. The Chat History view reads the server's history for a signed-in Silver or Gold member
// (date, subject, question, delete one, tap to ask again) and keeps the browser-only list for visitors and Basic; the notice under the input; Account >
// FinLit AI (remember toggle, count, "Clear my AI history" with a confirm step); the prefs field (older saved prefs still load, default on).
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ gets: [] as string[], sends: [] as [string, string][], history: null as null | Record<string, unknown>, failGet: false, failSend: false }));
vi.mock("../lib/api", async (orig) => ({
  ...(await orig<typeof import("../lib/api")>()),
  apiGet: async (path: string) => {
    api.gets.push(path);
    if (path.startsWith("/api/ask/history")) { if (api.failGet) throw new Error("down"); return api.history; }
    return { fields: [], rows: [["TCS", "Tata Consultancy Services Ltd", null, 1]] };
  },
  apiSend: async (method: string, path: string) => {
    api.sends.push([method, path]);
    if (api.failSend) throw new Error("down");
    return path === "/api/ask/history" ? { status: "cleared", deleted: 3 } : { status: "deleted" };
  },
}));
const who = vi.hoisted(() => ({ user: null as null | { id: string }, plan: "basic" as "basic" | "silver" | "gold" }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: who.user, plan: who.plan }) }));
vi.mock("../lib/askAi", async (orig) => ({ ...(await orig<typeof import("../lib/askAi")>()), useAskQuota: () => ({ data: who.user ? { enabled: true, signedIn: true, limit: 50, left: 40, used: 10 } : { enabled: true, signedIn: false } }),
  askAi: async () => undefined }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueryClient: () => ({ invalidateQueries: async () => {} }) }));

import { Assistant, OPEN_AI } from "./Assistant";
import { AskHistoryView, AskMemoryNotice } from "./AskHistory";
import { AccountAiHistory } from "./AccountAiHistory";
import { askedOn, memoryApplies, subjectLabel, MEMORY_NOTICE } from "../lib/askMemory";
import { normalisePrefs, prefs } from "../lib/prefs";

const HIST = { items: [
  { id: 7, askedAt: "2026-11-22T09:00:00Z", topic: "company:TCS:results", subjectKind: "company", subjectId: "TCS", intent: "results", question: "TCS Q2 results?" },
  { id: 5, askedAt: "2026-11-01T09:00:00Z", topic: "sector:pharma:overview", subjectKind: "sector", subjectId: "pharma", intent: "overview", question: "pharma sector outlook" },
], count: 2, remember: true, retentionDays: 180, maxRows: 200 };

beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
beforeEach(() => { api.gets = []; api.sends = []; api.history = JSON.parse(JSON.stringify(HIST)); api.failGet = false; api.failSend = false; prefs.set({ aiMemory: true }, true); });
afterEach(() => { cleanup(); who.user = null; who.plan = "basic"; try { localStorage.clear(); } catch { /* none */ } });

const inRouter = (el: React.ReactElement) => render(<MemoryRouter>{el}</MemoryRouter>);

describe("the history view: the server's for Silver and Gold, the browser's for everyone else", () => {
  it("a signed-in member sees the server's questions with their date and subject, asks one again with a tap and deletes one", async () => {
    const onAsk = vi.fn();
    inRouter(<AskHistoryView server recent={["only in this browser"]} onAsk={onAsk} onClearLocal={() => {}} />);
    const list = await screen.findByRole("list", { name: "Your FinLit AI questions" });
    expect(api.gets).toEqual(["/api/ask/history?limit=50"]);
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("TCS Q2 results?");
    expect(rows[0].textContent).toContain(`${askedOn("2026-11-22T09:00:00Z")} · TCS`);
    expect(rows[1].textContent).toContain("Pharma and healthcare sector");
    // task #349 fix E: a browser-only question is not in the server list; it shows below it, marked "On this device", never hidden
    expect(within(list).queryByText("only in this browser")).toBeNull();
    expect(within(screen.getByRole("list", { name: "Questions asked on this device" })).getByText("only in this browser")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Manage in Account" }).getAttribute("href")).toBe("/account/ai");
    fireEvent.click(within(rows[1]).getByTitle("Ask again"));
    expect(onAsk).toHaveBeenCalledWith("pharma sector outlook");
    fireEvent.click(screen.getByRole("button", { name: "Delete from history: TCS Q2 results?" }));
    await waitFor(() => expect(screen.queryByText("TCS Q2 results?")).toBeNull());
    expect(api.sends).toEqual([["DELETE", "/api/ask/history/7"]]);
  });
  it("a visitor (or Basic) keeps the browser-only list and the server is never asked", () => {
    const clear = vi.fn();
    inRouter(<AskHistoryView server={false} recent={["What is P/E?"]} onAsk={() => {}} onClearLocal={clear} />);
    expect(screen.getByText("Your recent questions, kept in this browser only.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "What is P/E?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear history" }));
    expect(clear).toHaveBeenCalled();
    expect(api.gets).toEqual([]);
  });
  it("says so when the server's list cannot be read, and shows this browser's instead; says when remembering is off", async () => {
    api.failGet = true;
    inRouter(<AskHistoryView server recent={["What is ROE?"]} onAsk={() => {}} onClearLocal={() => {}} />);
    expect(await screen.findByText(/could not be read just now/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "What is ROE?" })).toBeTruthy();
    cleanup();
    api.failGet = false; api.history = { ...HIST, items: [], count: 0, remember: false };
    inRouter(<AskHistoryView server recent={[]} onAsk={() => {}} onClearLocal={() => {}} />);
    expect(await screen.findByText(/New questions are not being kept/)).toBeTruthy();
    expect(screen.getByText(/No questions kept yet/)).toBeTruthy();
  });
  it("memoryApplies only to signed-in Silver and Gold; subjects read in words", () => {
    expect([memoryApplies(false, "gold"), memoryApplies(true, "basic"), memoryApplies(true, "silver"), memoryApplies(true, "gold"), memoryApplies(true, undefined)])
      .toEqual([false, false, true, true, false]);
    expect(subjectLabel({ subjectKind: "economy", subjectId: "india" })).toBe("Economy");
    expect(subjectLabel({ subjectKind: "concept", subjectId: "pe-ratio" })).toBe("Term: pe ratio");
    expect(subjectLabel({ subjectKind: "fund", subjectId: "all" })).toBe("Funds");
    // task #349 fix D: by subject: Economy, Sectors, Market, Funds, Your holdings; the symbol only for a company question
    expect(["sector", "market", "mine", "company"].map((k) => subjectLabel({ subjectKind: k, subjectId: k === "company" ? "BSE" : k === "sector" ? "all" : "india" }))).toEqual(["Sectors", "Market", "Your holdings", "BSE"]);
    expect(subjectLabel({ subjectKind: "sector", subjectId: "pharma" })).toBe("Pharma and healthcare sector");
  });
});

const openFull = (path = "/dashboard") => {
  try { localStorage.setItem("finlit-ai-full", "1"); } catch { /* none */ }
  const r = render(<MemoryRouter initialEntries={[path]}><Assistant /></MemoryRouter>);
  act(() => { dispatchEvent(new Event(OPEN_AI)); });
  return r;
};

describe("in the FinLit AI panel", () => {
  it("Chat History reads the server for a signed-in Silver member, with the notice under the input linking to Account", async () => {
    who.user = { id: "u1" }; who.plan = "silver";
    openFull();
    const notice = screen.getAllByText((_, el) => el?.className === "aim-note")[0];
    expect(notice.textContent).toBe(MEMORY_NOTICE);
    expect(within(notice).getByRole("link").getAttribute("href")).toBe("/account/ai");
    fireEvent.click(screen.getAllByRole("button", { name: "Chat History" })[0]);
    expect(await screen.findByText("TCS Q2 results?")).toBeTruthy();
    expect(api.gets).toContain("/api/ask/history?limit=50");
  });
  it("no notice while remembering is switched off", () => {
    who.user = { id: "u1" }; who.plan = "gold";
    prefs.set({ aiMemory: false }, true);
    openFull();
    expect(document.querySelector(".aim-note")).toBeNull();
    cleanup();
    inRouter(<AskMemoryNotice />);
    expect(document.querySelector(".aim-note")).toBeNull();
  });
  it("a visitor sees no notice and the browser-only Chat History, and the server is not asked", () => {
    openFull();
    expect(document.querySelector(".aim-note")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Chat History" })[0]);
    expect(screen.getByText("Your recent questions, kept in this browser only.")).toBeTruthy();
    expect(api.gets.some((g) => g.startsWith("/api/ask/history"))).toBe(false);
  });
  it("a Basic member is as before: no notice, the browser-only list", () => {
    who.user = { id: "u2" }; who.plan = "basic";
    openFull();
    expect(document.querySelector(".aim-note")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: "Chat History" })[0]);
    expect(screen.getByText("Your recent questions, kept in this browser only.")).toBeTruthy();
  });
});

describe("Chat History on phones and narrow windows (the header's History button)", () => {
  const openSmall = (path = "/dashboard") => {
    try { localStorage.setItem("finlit-ai-full", "0"); } catch { /* none */ }
    const r = render(<MemoryRouter initialEntries={[path]}><Assistant /></MemoryRouter>);
    act(() => { dispatchEvent(new Event(OPEN_AI)); });
    return r;
  };
  it("the small window (a phone's panel) has no side menu, and the header's History button opens the same history view", async () => {
    who.user = { id: "u1" }; who.plan = "gold";
    openSmall();
    expect(document.querySelector(".aif-side")).toBeNull();                         // no side menu here: the header is the way in
    const btn = screen.getByRole("button", { name: "Chat History" });
    expect(btn.closest("header")).toBeTruthy();
    expect(btn.className).toContain("ui-btn");
    fireEvent.click(btn);
    expect(await screen.findByText("TCS Q2 results?")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Chat History" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Chat History" })).toBeNull();       // already there: no button to itself
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("button", { name: "Chat History" })).toBeTruthy();
  });
  it("a visitor's header button opens the browser-only list", () => {
    openSmall();
    fireEvent.click(screen.getByRole("button", { name: "Chat History" }));
    expect(screen.getByText("Your recent questions, kept in this browser only.")).toBeTruthy();
  });
  it("the stylesheet hides the header button only where the full window's side menu shows (981px and up, menu open)", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync(`${process.cwd()}/src/styles/ask-memory.css`, "utf8");
    expect(css).toMatch(/@media \(min-width: 981px\) \{ \.aif\.full:not\(\.nomenu\) \.aim-hist \{ display: none; \} \}/);
    expect(css).not.toMatch(/:[^;{}\n]*#[0-9a-f]{3,8}\b/i);                                       // tokens only
  });
});

describe("Account > FinLit AI history", () => {
  it("shows the count, and clears only after the confirm step", async () => {
    who.user = { id: "u1" }; who.plan = "gold";
    api.history = { ...HIST, count: 3 };
    inRouter(<AccountAiHistory />);
    expect(screen.getByRole("heading", { name: "FinLit AI history" })).toBeTruthy();
    expect(await screen.findByText("3 questions are kept.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear my AI history" }));
    expect(api.sends).toEqual([]);                                                      // nothing deleted yet: the confirm step
    const box = screen.getByRole("group", { name: "Confirm clearing your FinLit AI history" });
    expect(box.textContent).toContain("Delete all 3 kept questions?");
    fireEvent.click(within(box).getByRole("button", { name: "Keep them" }));
    expect(screen.queryByRole("group", { name: /Confirm clearing/ })).toBeNull();
    expect(api.sends).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Clear my AI history" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, clear my AI history" }));
    expect(await screen.findByText("3 questions were deleted.")).toBeTruthy();
    expect(api.sends).toEqual([["DELETE", "/api/ask/history"]]);
    expect(screen.getByText("0 questions are kept.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Clear my AI history" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("the remember toggle is prefs.aiMemory", async () => {
    who.user = { id: "u1" }; who.plan = "silver";
    inRouter(<AccountAiHistory />);
    const box = screen.getByRole("checkbox", { name: "Remember my FinLit AI questions" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    expect(prefs.get().aiMemory).toBe(false);
    expect(screen.getByText(/Switched off: new questions are not kept/)).toBeTruthy();
    await screen.findByText("2 questions are kept.");
  });
  it("a failed clear says so and keeps the count", async () => {
    who.user = { id: "u1" }; who.plan = "gold";
    api.failSend = true;
    inRouter(<AccountAiHistory />);
    await screen.findByText("2 questions are kept.");
    fireEvent.click(screen.getByRole("button", { name: "Clear my AI history" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, clear my AI history" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText("2 questions are kept.")).toBeTruthy();
  });
});

describe("prefs.aiMemory", () => {
  it("defaults to on; older saved prefs without the field still load, as on; false stays false", () => {
    expect(normalisePrefs(null).aiMemory).toBe(true);
    const old = normalisePrefs({ palette: "gold", density: "compact" } as never);
    expect(old.aiMemory).toBe(true);
    expect(old.density).toBe("compact");
    expect(normalisePrefs({ aiMemory: false }).aiMemory).toBe(false);
    expect(normalisePrefs({ aiMemory: "no" as never }).aiMemory).toBe(true);
    prefs.set({ aiMemory: false }, true);
    expect(prefs.get().aiMemory).toBe(false);
  });
});
