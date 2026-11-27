// @vitest-environment jsdom
// Ask FinLit AI (task #46): Landing -> Choose a segment -> Company context with tabs -> Ask & get an answer -> Keep exploring (company kept), with Q1 to Q4 for results.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Assistant, OPEN_AI } from "./Assistant";
import { bankGroups, STARTERS } from "../lib/questionBank";
import { MARKET_ANSWERS, MARKET_QUESTIONS } from "../lib/askFlow";
import { CATEGORIES, QUARTERS, SEGMENTS, TABS, quarterQuestion, related, tabQuestions } from "../lib/askFlow";

// Task #138: no language model; a company question is answered by answerCompany from the company's FinLit figures (tested in lib/askAnswers.test.ts).
const ask = vi.fn(async (id: string, sym: string, _extra?: unknown): Promise<{ text: string; link?: { to: string; label: string } }> => ({ text: `answer to ${id} for ${sym}`, link: { to: `/stocks/${sym}#financials`, label: "See the Profit & Loss" } }));
vi.mock("../lib/askAnswers", async (orig) => ({ ...(await orig<typeof import("../lib/askAnswers")>()), answerCompany: (id: string, sym: string, extra?: unknown) => ask(id, sym, extra) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: async () => ({ fields: [], rows: [["RELIANCE", "Reliance Industries Ltd", null, 1], ["TCS", "Tata Consultancy Services Ltd", null, 1]] }) }));
// Task #211: written answers from FinLit AI. Off by default here (the state of task #138: no key on the server), so every test above them is unchanged;
// the tests at the end switch them on for a signed-in member or a visitor and script the streamed answer.
const ai = vi.hoisted(() => ({ quota: undefined as undefined | Record<string, unknown>, user: null as null | { id: string }, events: [] as unknown[], sent: [] as unknown[][] }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: ai.user }) }));
vi.mock("../lib/askAi", async (orig) => ({ ...(await orig<typeof import("../lib/askAi")>()), useAskQuota: () => ({ data: ai.quota }),
  askAi: async (q: string, history: unknown, symbol: unknown, on: (e: unknown) => void) => { ai.sent.push([q, history, symbol]); ai.events.forEach(on); } }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueryClient: () => ({ invalidateQueries: async () => {} }) }));
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterEach(() => { ai.quota = undefined; ai.user = null; ai.events = []; ai.sent = []; });
afterEach(() => { cleanup(); ask.mockClear(); });

const open = (path = "/stocks/reliance", sector?: string) => {
  const r = render(<MemoryRouter initialEntries={[path]}><Assistant sector={sector} /></MemoryRouter>);
  act(() => { dispatchEvent(new Event(OPEN_AI)); });   // the "Ask FinLit AI" button in the header bar fires this
  return r;
};

describe("flow data", () => {
  it("has the four landing categories, the four segments and the five company tabs", () => {
    expect(CATEGORIES.map((c) => c.title)).toEqual(["Explore a Company", "Markets & Economy", "Financial Concepts", "Explore FinLit Tools"]);   // task #201: the team's names
    expect(SEGMENTS.map((s) => s.title)).toEqual(["Financial performance", "Valuation & returns", "Business & segment analysis", "Outlook & risks"]);
    expect(TABS.map((t) => t.label)).toEqual(["Suggested questions", "Financials", "Valuation", "Business", "Outlook & Risks"]);
  });
  it("puts every one of the 12 question groups in exactly one tab", () => {
    const all = TABS.flatMap((t) => t.groups).sort((a, b) => a - b);
    expect(all).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const n = (["financials", "valuation", "business", "outlook"] as const).reduce((s, t) => s + tabQuestions(t, "RELIANCE", true).length, 0);
    expect(n).toBe(bankGroups("/stocks/reliance", { lender: true }).reduce((s, g) => s + g.items.length, 0));
  });
  it("writes the four quarter questions with their months, and never advises", () => {
    expect(QUARTERS.map((q) => q.months)).toEqual(["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"]);
    expect(quarterQuestion("TCS", QUARTERS[0])).toBe("How did TCS do in Q1 (Apr–Jun) of the latest financial year: revenue, profit and margins against the same quarter a year earlier?");
    const text = [...QUARTERS.map((q) => quarterQuestion("X", q)), ...TABS.flatMap((t) => tabQuestions(t.id, "X", true).map((q) => q.text))].join(" ");
    expect(text).not.toMatch(/\b(buy|sell|accumulate|multibagger|top pick)\b/i);
  });
  it("suggests the next unasked questions, three at most, and never the two-company one", () => {
    const pool = tabQuestions("financials", "RELIANCE", false);
    const r = related(pool, [pool[0].text]);
    expect(r).toHaveLength(3); expect(r.map((q) => q.text)).not.toContain(pool[0].text);
    expect(related(tabQuestions("business", "X", false), []).some((q) => q.needsSecondCompany)).toBe(false);
  });
});

describe("Assistant on a company page", () => {
  it("opens in that company's context with the five tabs and the suggested questions", () => {
    open();
    expect(screen.getAllByText("RELIANCE").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("tablist")).getAllByRole("tab").map((t) => t.textContent)).toEqual(TABS.map((t) => t.label));
    expect(screen.getByRole("tab", { name: "Suggested questions" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("button", { name: /What is RELIANCE's YoY and QoQ revenue growth/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change company" })).toBeTruthy();
    expect((screen.getByLabelText("Search the listed questions") as HTMLInputElement).placeholder).toBe("Search RELIANCE's questions (e.g. debt, dividend, P/E)");
  });
  it("a tab shows its own questions; Financials also shows Q1 to Q4", () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: "Financials" }));
    const g = screen.getByRole("group", { name: /quarter of the financial year/ });
    expect(within(g).getAllByRole("button").map((b) => b.textContent)).toEqual(["Q1Apr–Jun", "Q2Jul–Sep", "Q3Oct–Dec", "Q4Jan–Mar"]);
    expect(screen.getByRole("button", { name: "What are RELIANCE's 3-year and 5-year profit CAGRs?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Valuation" }));
    expect(screen.queryByRole("group", { name: /quarter of the financial year/ })).toBeNull();
    expect(screen.getByRole("button", { name: /What are RELIANCE's current PE, PB, P\/S and EV\/EBITDA/ })).toBeTruthy();
  });
  it("a quarter chip asks that quarter, and the answer comes with related questions and a way back", async () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: "Financials" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /^Q2/ })); });
    expect(ask).toHaveBeenCalledWith("quarter", "RELIANCE", expect.objectContaining({ quarter: 2 }));
    expect(await screen.findByText(/answer to quarter for RELIANCE/)).toBeTruthy();
    expect(screen.getByText("Related questions")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Related questions" })).getAllByRole("button").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "← More about RELIANCE" }));
    expect(screen.getByRole("tab", { name: "Financials" })).toBeTruthy();
  });
  it("a tapped question is sent as it is written, with the company in it", async () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: "Financials" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "What are RELIANCE's 3-year and 5-year profit CAGRs?" })); });
    expect(ask).toHaveBeenCalledWith("C.2.Q7", "RELIANCE", expect.anything());   // the listed question, answered from RELIANCE's own figures
    expect(screen.getByRole("link", { name: /See the Profit & Loss/ }).getAttribute("href")).toBe("/stocks/RELIANCE#financials");   // and a link to where the figures come from
  });
  it("the box searches the listed questions as you type, for this company too, and a pick is answered at once (task #138)", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Search the listed questions"), { target: { value: "borrowings" } });
    const hits = screen.getByRole("listbox", { name: "Suggested questions" });     // task #268: a panel beside the box, grouped, with a note on each
    expect(within(hits).getAllByRole("option").map((b) => b.querySelector(".aif-sgq")!.textContent)).toContain("How have RELIANCE's total borrowings and debt-to-equity ratio changed over the last 5 years?");
    await act(async () => { fireEvent.click(within(hits).getByRole("option", { name: /RELIANCE's total borrowings/ })); });
    expect(ask).toHaveBeenCalledWith("C.3.Q10", "RELIANCE", expect.anything());
  });
  it("the suggestions sit beside the box, grouped under headings with a note, and end with the words as typed (task #268)", () => {
    open();
    const box = screen.getByLabelText("Search the listed questions");
    fireEvent.change(box, { target: { value: "borrowings" } });
    const list = screen.getByRole("listbox", { name: "Suggested questions" });
    expect(box.closest(".aif-inw")!.contains(list)).toBe(true);                   // beside the box, never loose on the page (the bug of the team's picture)
    expect(box.getAttribute("aria-expanded")).toBe("true");
    expect(list.querySelector(".aif-sgh")!.textContent).toBe("RELIANCE · Financials");
    expect(list.querySelector(".aif-sgn")!.textContent).toBe("Answers at once");
    const opts = within(list).getAllByRole("option");
    expect(opts[opts.length - 1].textContent).toContain("Search the listed questions for “borrowings”");   // written answers are off here: the closest listed ones
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("arrow keys move through the suggestions and Enter asks the one picked (task #268)", async () => {
    open();
    const box = screen.getByLabelText("Search the listed questions");
    fireEvent.change(box, { target: { value: "borrowings" } });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    const first = within(screen.getByRole("listbox")).getAllByRole("option")[0];
    expect(first.getAttribute("aria-selected")).toBe("true");
    expect(box.getAttribute("aria-activedescendant")).toBe(first.id);
    await act(async () => { fireEvent.keyDown(box, { key: "Enter" }); });
    expect(ask).toHaveBeenCalledTimes(1);
  });
  it("a typed sentence that is not listed offers the closest listed ones, or says none matches; nothing is sent to any model (task #138)", async () => {
    open();
    const box = () => screen.getByLabelText("Search the listed questions");
    fireEvent.change(box(), { target: { value: "Will the dividend rise much higher next year, do you think?" } });
    await act(async () => { fireEvent.submit(box().closest("form")!); });
    expect(ask).not.toHaveBeenCalled();
    expect(screen.getByText(/FinLit AI answers its listed questions/)).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Closest listed questions" })).getAllByRole("button").map((b) => b.textContent).join(" ")).toMatch(/dividend/i);
    fireEvent.change(box(), { target: { value: "xyzzy plugh" } });
    await act(async () => { fireEvent.submit(box().closest("form")!); });
    expect(screen.getByText(/none matches “xyzzy plugh”/)).toBeTruthy();
  });
  it("shows the banks question only when the page knows the company is a lender", () => {
    const { unmount } = open();
    fireEvent.click(screen.getByRole("tab", { name: "Financials" }));
    expect(screen.queryByText(/NIM, GNPA, NNPA and CASA/)).toBeNull();
    unmount();
    open("/stocks/hdfcbank", "Banks");
    fireEvent.click(screen.getByRole("tab", { name: "Financials" }));
    expect(screen.getByText(/NIM, GNPA, NNPA and CASA/)).toBeTruthy();
  });
  it("puts the two-company question in the input with XYZ selected instead of sending it", () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: "Business" }));
    fireEvent.click(screen.getByRole("button", { name: /compare with XYZ/ }));
    const input = screen.getByLabelText("Search the listed questions") as HTMLInputElement;
    expect(ask).not.toHaveBeenCalled();
    expect(input.value).toBe("How does RELIANCE compare with XYZ on growth, margins, returns and valuation?");
    expect(input.value.slice(input.selectionStart!, input.selectionEnd!)).toBe("XYZ");
    expect(document.activeElement).toBe(input);
  });
  it("Change company goes to the segments with a company search", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Change company" }));
    expect(screen.getByRole("heading", { name: "Explore a company" })).toBeTruthy();
    expect(screen.getByLabelText("Which company?")).toBeTruthy();
  });
});

describe("Assistant away from a company page", () => {
  it("starts with the greeting, a search box above the five theme cards (Mutual funds & ETFs the fifth) and things to try (tasks #201, #203, #268)", () => {
    open("/about");
    expect(screen.getByText("Hi, I'm FinLit AI")).toBeTruthy();
    const cats = within(screen.getByRole("list", { name: "What would you like to explore?" })).getAllByRole("button");
    expect(cats.map((b) => b.querySelector("b")!.textContent)).toEqual(["Explore a Company", "Markets & Economy", "Financial Concepts", "Explore FinLit Tools", "Mutual funds & ETFs"]);   // task #268: the five themes, five cards
    const box = screen.getByLabelText("Ask FinLit AI anything");
    expect(box.compareDocumentPosition(cats[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();   // the search sits above the cards
    expect(screen.getAllByRole("button", { name: /^(Reliance financials|P\/E ratio|Sector outlook|Red flags)$/ })).toHaveLength(4);
    expect(screen.getByRole("button", { name: /Mutual funds & ETFs/ })).toBeTruthy();
    expect((screen.getByLabelText("Search the listed questions") as HTMLInputElement).placeholder).toBe("Search the questions (e.g. P/E, cash flow, debt)");
  });
  it("Explore a company -> segment -> search a company -> that company's tab", async () => {
    open("/about");
    fireEvent.click(screen.getByRole("button", { name: /Explore a Company/ }));
    expect(within(screen.getByRole("list", { name: "Choose a segment" })).getAllByRole("button")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /Valuation & returns/ }));
    fireEvent.change(screen.getByLabelText("Which company?"), { target: { value: "reli" } });
    fireEvent.click(await screen.findByRole("button", { name: /RELIANCE.*Reliance Industries/ }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Valuation" }).getAttribute("aria-selected")).toBe("true"));
  });
  it("Investment concepts and Platform & tools answer at once from the written answers, without the model", async () => {
    open("/about");
    fireEvent.click(screen.getByRole("button", { name: /Financial Concepts/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "What is the difference between a mutual fund and an ETF?" })); });
    expect(ask).not.toHaveBeenCalled();
    expect(screen.getByText(/ETF trades on the stock exchange/)).toBeTruthy();
  });
  it("Market & economy questions answer at once from written text, with no model call (task #138)", async () => {
    open("/about");
    fireEvent.click(screen.getByRole("button", { name: /Markets & Economy/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /FII and DII flows/ })); });
    expect(ask).not.toHaveBeenCalled();
    expect(screen.getByText(/net amounts these groups put into or took out of Indian shares/)).toBeTruthy();
    for (const a of Object.values(MARKET_ANSWERS)) { expect(a).not.toMatch(/\b(buy|sell|hold|reduce|avoid|accumulate|target|best|multibagger|top pick)\b/i); expect(a).toMatch(/not investment advice/); }
    expect(Object.keys(MARKET_ANSWERS)).toEqual(MARKET_QUESTIONS.map((q) => q.text));   // every market question has its written answer
  });
  it("the back arrow returns one step", () => {
    open("/about");
    fireEvent.click(screen.getByRole("button", { name: /Explore a Company/ }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Hi, I'm FinLit AI")).toBeTruthy();
  });
  it("no starter question or answer uses advice wording", () => {
    const { container } = open("/about");
    expect(container.textContent).not.toMatch(/\b(buy|sell|hold|reduce|avoid|accumulate|target|best|multibagger|top pick)\b/i);
    for (const x of STARTERS) expect(x.a).not.toMatch(/\b(buy|sell|hold|reduce|avoid|accumulate|target|best|multibagger|top pick)\b/i);
  });
});

describe("Assistant full window (task #52)", () => {
  it("a button opens the full window, Esc leaves it first and then closes the chat, and the choice is remembered", () => {
    localStorage.removeItem("finlit-ai-full");
    open("/about");
    const dlg = () => screen.getByRole("dialog", { name: "FinLit AI assistant" });
    expect(dlg().className).not.toMatch(/\bfull\b/);
    fireEvent.click(screen.getByRole("button", { name: "Open in a full window" }));
    expect(dlg().className).toMatch(/\bfull\b/); expect(localStorage.getItem("finlit-ai-full")).toBe("1");
    expect(document.body.style.overflow).toBe("hidden");
    act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(dlg().className).not.toMatch(/\bfull\b/); expect(document.body.style.overflow).not.toBe("hidden");
    act(() => { fireEvent.keyDown(document, { key: "Escape" }); });
    expect(screen.queryByRole("dialog")).toBeNull();
    localStorage.removeItem("finlit-ai-full");
  });
});

describe("task #284: the 'Choose a question to ask' tab is gone from FinLit AI", () => {
  it("the full window has no question chooser or topic tabs; its themes and the page's own questions stay", () => {
    localStorage.setItem("finlit-ai-full", "1");
    open("/screener");
    const dlg = screen.getByRole("dialog", { name: "FinLit AI assistant" });
    expect(dlg.className).toMatch(/\bfull\b/);
    expect(within(dlg).queryByText(/Choose a question to ask/)).toBeNull();
    expect(within(dlg).queryByRole("tablist", { name: "Question topics" })).toBeNull();
    expect(within(dlg).queryByPlaceholderText(/Search questions/)).toBeNull();
    expect(within(dlg).getByRole("list", { name: "What would you like to explore?" })).toBeTruthy();
    expect(within(dlg).getByText("Questions about this page")).toBeTruthy();
    localStorage.removeItem("finlit-ai-full");
  });
});

describe("written answers from FinLit AI (task #211)", () => {
  const typeAndSend = async (label: string, text: string) => {
    const box = screen.getByLabelText(label);
    fireEvent.change(box, { target: { value: text } });
    await act(async () => { fireEvent.submit(box.closest("form")!); });
  };
  it("a signed-in member's own question is sent as typed, with the page's company, and the answer streams in with the disclaimer", async () => {
    ai.user = { id: "u1" }; ai.quota = { enabled: true, signedIn: true, limit: 50, used: 12, left: 38, resets: "2026-12-01" };
    ai.events = [{ type: "meta", limit: 50, used: 13, left: 37, resets: "2026-12-01", cached: false }, { type: "status", text: "Reading the ratios (RELIANCE)" },
      { type: "text", text: "Reliance's debt to equity was " }, { type: "text", text: "0.41 in FY2026." }, { type: "done", disclaimer: "Information only, not investment advice.", sources: ["get_ratios"] }];
    open();
    expect(screen.getByText(/FinLit AI: 38 of 50 written answers left this month/)).toBeTruthy();
    await typeAndSend("Your question for FinLit AI", "Will the dividend rise much higher next year, do you think?");
    expect(ai.sent[0][0]).toBe("Will the dividend rise much higher next year, do you think?");
    expect(ai.sent[0][2]).toBe("RELIANCE");
    expect(screen.getByText("Reliance's debt to equity was 0.41 in FY2026.")).toBeTruthy();
    expect(screen.queryByRole("listbox")).toBeNull();                              // the suggestions close once a question is sent
    expect(screen.getByText("Information only, not investment advice.")).toBeTruthy();
    expect(ask).not.toHaveBeenCalled();
  });
  it("for a member with written answers, the last suggestion sends the words as typed to FinLit AI (task #268: listed first, then the model)", async () => {
    ai.user = { id: "u1" }; ai.quota = { enabled: true, signedIn: true, limit: 50, used: 12, left: 38, resets: "2026-12-01" };
    ai.events = [{ type: "text", text: "An answer." }, { type: "done", disclaimer: "Information only, not investment advice.", sources: [] }];
    open();
    const box = screen.getByLabelText("Your question for FinLit AI");
    fireEvent.change(box, { target: { value: "how is the new energy business going" } });
    const opts = within(screen.getByRole("listbox", { name: "Suggested questions" })).getAllByRole("option");
    const last = opts[opts.length - 1];
    expect(last.textContent).toContain("Ask FinLit AI: “how is the new energy business going”");
    expect(last.textContent).toContain("A written answer · 38 left this month");
    await act(async () => { fireEvent.click(last); });
    expect(ai.sent[0][0]).toBe("how is the new energy business going");
  });
  it("a written answer ends with links to the FinLit pages it read, this site's pages only (task #218)", async () => {
    ai.user = { id: "u1" }; ai.quota = { enabled: true, signedIn: true, limit: 50, used: 12, left: 38, resets: "2026-12-01" };
    ai.events = [{ type: "text", text: "Reliance's investor presentation of 30 Oct 2026 gives Jio's ARPU as Rs 210 (page 3)." },
      { type: "done", disclaimer: "Information only, not investment advice.", sources: ["get_company_card", "read_company_document"],
        pages: [{ to: "/stocks/RELIANCE", label: "RELIANCE company report" }, { to: "/documents", label: "Documents" }, { to: "https://evil.example", label: "Elsewhere" }, { to: "//evil.example", label: "Elsewhere" }] }];
    open();
    await typeAndSend("Your question for FinLit AI", "What does the latest investor presentation say about Jio's ARPU?");
    const row = document.querySelector(".aif-acts")!;
    expect(within(row as HTMLElement).getByText("Read on FinLit")).toBeTruthy();
    expect([...row.querySelectorAll("a")].map((a) => [a.getAttribute("href"), a.textContent?.trim()])).toEqual([["/stocks/RELIANCE", "RELIANCE company report"], ["/documents", "Documents"]]);
  });
  it("a listed question still answers at once from FinLit's figures, without using a written answer", async () => {
    ai.user = { id: "u1" }; ai.quota = { enabled: true, signedIn: true, limit: 50, used: 0, left: 50, resets: "2026-12-01" };
    open();
    const first = screen.getAllByRole("button").find((b) => b.className === "aif-q")!;
    await act(async () => { fireEvent.click(first); });
    expect(ask).toHaveBeenCalled();
    expect(ai.sent).toEqual([]);
  });
  it.each([["a visitor", null, { enabled: true, signedIn: false }], ["a Basic member", { id: "b1" }, { enabled: true, signedIn: true, limit: 0, used: 0, left: 0, resets: "2026-12-01" }]])(
    "%s keeps the listed questions only: the closest ones are offered, with a note that written answers are Silver and Gold (founder, 17 Nov 2026)", async (_who, user, quota) => {
      ai.user = user as { id: string } | null; ai.quota = quota;
      open();
      expect(screen.queryByText(/written answers left this month/)).toBeNull();          // no "0 of 0" line for Basic
      await typeAndSend("Search the listed questions", "Will the dividend rise much higher next year, do you think?");
      expect(ai.sent).toEqual([]);
      expect(screen.getByText(/part of the combined plan \(60 a month\), Gold \(100 a month\) and Platinum \(300 a month\)/)).toBeTruthy();
      expect(within(screen.getByRole("list", { name: "Closest listed questions" })).getAllByRole("button").length).toBeGreaterThan(0);
      expect(screen.getByRole("link", { name: /See the plans/ }).getAttribute("href")).toBe("/plans");
    });
  it("with the month's questions used, the box goes back to the listed questions and says when they renew", async () => {
    ai.user = { id: "u1" }; ai.quota = { enabled: true, signedIn: true, limit: 50, used: 50, left: 0, resets: "2026-12-01" };
    open();
    expect(screen.getByText(/0 of 50 written answers left this month; they renew on 1 Dec/)).toBeTruthy();
    await typeAndSend("Search the listed questions", "xyzzy plugh");
    expect(ai.sent).toEqual([]);
    expect(screen.getByText(/none matches “xyzzy plugh”/)).toBeTruthy();
  });
  it("a refusal or a failure is said in the bubble, never left blank", async () => {
    ai.user = { id: "u1" }; ai.quota = { enabled: true, signedIn: true, limit: 50, used: 1, left: 49, resets: "2026-12-01" };
    ai.events = [{ type: "meta", limit: 50, used: 2, left: 48, resets: "2026-12-01", cached: false }, { type: "error", code: "busy", text: "FinLit AI is answering many questions right now. Please try again in a minute." }];
    open();
    await typeAndSend("Your question for FinLit AI", "How has the market done this week?");
    expect(screen.getByText("FinLit AI is answering many questions right now. Please try again in a minute.")).toBeTruthy();
  });
});

