// @vitest-environment jsdom
// Ask FinLit AI (task #46): Landing -> Choose a segment -> Company context with tabs -> Ask & get an answer -> Keep exploring (company kept), with Q1 to Q4 for results.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Assistant, OPEN_AI } from "./Assistant";
import { bankGroups, STARTERS } from "../lib/questionBank";
import { CATEGORIES, QUARTERS, SEGMENTS, TABS, quarterQuestion, related, tabQuestions } from "../lib/askFlow";

const ask = vi.fn(async (q: string, _h?: unknown) => ({ response: "answer to " + q }));
vi.mock("../lib/siteApi", () => ({ askAssistant: (q: string, h: unknown) => ask(q, h) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: async () => ({ fields: [], rows: [["RELIANCE", "Reliance Industries Ltd", null, 1], ["TCS", "Tata Consultancy Services Ltd", null, 1]] }) }));
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterEach(() => { cleanup(); ask.mockClear(); });

const open = (path = "/stocks/reliance", sector?: string) => {
  const r = render(<MemoryRouter initialEntries={[path]}><Assistant sector={sector} /></MemoryRouter>);
  act(() => { dispatchEvent(new Event(OPEN_AI)); });   // the "Ask FinLit AI" button in the header bar fires this
  return r;
};

describe("flow data", () => {
  it("has the four landing categories, the four segments and the five company tabs", () => {
    expect(CATEGORIES.map((c) => c.title)).toEqual(["Explore a company", "Market & economy", "Investment concepts", "Platform & tools"]);
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
    expect((screen.getByLabelText("Your question") as HTMLInputElement).placeholder).toBe("Ask a follow-up about RELIANCE");
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
    expect(ask).toHaveBeenCalledWith(expect.stringContaining("Q2 (Jul–Sep)"), expect.anything());
    expect(await screen.findByText(/answer to .*Q2 \(Jul–Sep\)/)).toBeTruthy();
    expect(screen.getByText("Related questions")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Related questions" })).getAllByRole("button").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "← More about RELIANCE" }));
    expect(screen.getByRole("tab", { name: "Financials" })).toBeTruthy();
  });
  it("a tapped question is sent as it is written, with the company in it", async () => {
    open();
    fireEvent.click(screen.getByRole("tab", { name: "Financials" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "What are RELIANCE's 3-year and 5-year profit CAGRs?" })); });
    expect(ask).toHaveBeenCalledWith("What are RELIANCE's 3-year and 5-year profit CAGRs?", expect.anything());
  });
  it("a typed follow-up keeps the company in context", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Your question"), { target: { value: "How is the debt trend?" } });
    await act(async () => { fireEvent.submit(screen.getByLabelText("Your question").closest("form")!); });
    expect(ask).toHaveBeenCalledWith("About RELIANCE: How is the debt trend?", expect.anything());
    expect(screen.getByText("How is the debt trend?")).toBeTruthy();   // the user sees what they typed
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
    const input = screen.getByLabelText("Your question") as HTMLInputElement;
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
  it("starts with the greeting and the four categories", () => {
    open("/about");
    expect(screen.getByText("Hi, I'm FinLit AI")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "What would you like to explore?" })).getAllByRole("button")).toHaveLength(4);
    expect((screen.getByLabelText("Your question") as HTMLInputElement).placeholder).toBe("Ask a question or choose a topic");
  });
  it("Explore a company -> segment -> search a company -> that company's tab", async () => {
    open("/about");
    fireEvent.click(screen.getByRole("button", { name: /Explore a company/ }));
    expect(within(screen.getByRole("list", { name: "Choose a segment" })).getAllByRole("button")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: /Valuation & returns/ }));
    fireEvent.change(screen.getByLabelText("Which company?"), { target: { value: "reli" } });
    fireEvent.click(await screen.findByRole("button", { name: /RELIANCE.*Reliance Industries/ }));
    await waitFor(() => expect(screen.getByRole("tab", { name: "Valuation" }).getAttribute("aria-selected")).toBe("true"));
  });
  it("Investment concepts and Platform & tools answer at once from the written answers, without the model", async () => {
    open("/about");
    fireEvent.click(screen.getByRole("button", { name: /Investment concepts/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "What is the difference between a mutual fund and an ETF?" })); });
    expect(ask).not.toHaveBeenCalled();
    expect(screen.getByText(/ETF trades on the stock exchange/)).toBeTruthy();
  });
  it("Market & economy questions go to the assistant", async () => {
    open("/about");
    fireEvent.click(screen.getByRole("button", { name: /Market & economy/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /FII and DII flows/ })); });
    expect(ask).toHaveBeenCalledWith("What do FII and DII flows tell us about the market?", expect.anything());
  });
  it("the back arrow returns one step", () => {
    open("/about");
    fireEvent.click(screen.getByRole("button", { name: /Explore a company/ }));
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
