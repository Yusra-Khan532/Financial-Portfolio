// @vitest-environment jsdom
// Task #349 PR 3: "Since you last asked". The `since` event is read from the stream and checked (safeSince); the card shows one row per change,
// the filings since then as links to FinLit's own pages only, what was said then (folded), and "Full answer", which asks again with `fresh`.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { parseSse, safeSince } from "../lib/askAi";
import { AskSince, sinceWhen } from "./AskSince";
import { Assistant, OPEN_AI } from "./Assistant";

const ai = vi.hoisted(() => ({ runs: [] as unknown[][], sent: [] as unknown[][] }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: async () => ({ fields: [], rows: [["RELIANCE", "Reliance Industries Ltd", null, 1]] }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("../lib/askAi", async (orig) => ({ ...(await orig<typeof import("../lib/askAi")>()),
  useAskQuota: () => ({ data: { enabled: true, signedIn: true, limit: 50, used: 1, left: 49, resets: "2026-12-01" } }),
  askAi: async (q: string, history: unknown, symbol: unknown, on: (e: unknown) => void, _signal?: AbortSignal, _timeoutMs?: number, opts?: unknown) => {
    ai.sent.push([q, history, symbol, opts]);
    (ai.runs.shift() ?? []).forEach(on);
  } }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueryClient: () => ({ invalidateQueries: async () => {} }) }));
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterEach(() => { cleanup(); ai.runs = []; ai.sent = []; });

const SINCE = { askedAt: "2026-11-20T10:22:00+00:00", question: "What is Reliance's share price?", match: "strong",
  changes: ["Price ₹2,880 → ₹2,950, +₹70 (+2.4%) (20 Nov 2026 → 23 Nov 2026)", "FinLit Prism 68 → 71 (+3) (20 Nov 2026 → 23 Nov 2026)"],
  newItems: [{ title: "Outcome of board meeting", date: "2026-11-22", to: "/stocks/RELIANCE#news" }, { title: "Elsewhere", date: "2026-11-22", to: "https://www.nseindia.com/x.pdf" },
    { title: "Protocol-relative", date: "2026-11-22", to: "//evil.example/x" }],
  said: ["Reliance traded at ₹2,880 [FinLit company page, 20 Nov 2026]"] };

describe("the since event (task #349 PR 3)", () => {
  it("is parsed from the stream, before the words", () => {
    const { events } = parseSse(`event: meta\ndata: {"limit":50,"used":2,"left":48,"resets":"2026-12-01","cached":false}\n\nevent: since\ndata: ${JSON.stringify(SINCE)}\n\nevent: text\ndata: {"text":"Since you last asked"}\n\n`);
    expect(events.map((e) => e.type)).toEqual(["meta", "since", "text"]);
    const s = safeSince(events[1]);
    expect(s?.changes).toEqual(SINCE.changes);
    expect(s?.newItems).toEqual([{ title: "Outcome of board meeting", date: "2026-11-22", to: "/stocks/RELIANCE#news" }]);   // on-site links only
    expect(s?.said).toEqual(SINCE.said);
  });
  it("a weak match carries no said-then lines, and a broken event is dropped", () => {
    expect(safeSince({ ...SINCE, match: "weak" })?.said).toEqual([]);
    expect(safeSince({ ...SINCE, askedAt: "not a date" })).toBeNull();
    expect(safeSince(null)).toBeNull();
    expect(safeSince({ askedAt: SINCE.askedAt })).toEqual({ askedAt: SINCE.askedAt, question: "", match: "strong", changes: [], newItems: [], said: [] });
  });
});

describe("AskSince", () => {
  const card = (onFull = vi.fn()) => {
    render(<MemoryRouter><AskSince data={safeSince(SINCE)!} onFull={onFull} /></MemoryRouter>);
    return onFull;
  };
  it("renders the title with the date and time in India time and one row per change", () => {
    card();
    expect(sinceWhen(SINCE.askedAt)).toBe("20 Nov 2026, 3:52 pm");
    expect(screen.getByRole("heading", { name: "Since you last asked · 20 Nov 2026, 3:52 pm" })).toBeTruthy();
    const rows = within(screen.getByRole("list", { name: "What changed" })).getAllByRole("listitem").map((li) => li.textContent);
    expect(rows).toEqual(SINCE.changes);
    expect(screen.getByRole("region", { name: /Since you last asked/ }).className).toContain("ui-card");   // the shared card
  });
  it("lists new filings as links to this site's pages only", () => {
    card();
    const links = within(screen.getByRole("list", { name: "New filings since then" })).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/stocks/RELIANCE#news"]);
    expect(screen.getByText("22 Nov 2026")).toBeTruthy();
    expect(screen.queryByText("Elsewhere")).toBeNull();
  });
  it("unfolds what was said then", () => {
    card();
    expect(screen.queryByRole("list", { name: "What FinLit AI said then" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "What I said then" }));
    expect(within(screen.getByRole("list", { name: "What FinLit AI said then" })).getByText(SINCE.said[0])).toBeTruthy();
  });
  it("Full answer calls back", () => {
    const f = card();
    fireEvent.click(screen.getByRole("button", { name: "Full answer" }));
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("in the panel", () => {
  it("shows the card above the answer, and Full answer asks the same question again with fresh", async () => {
    const Q = "What is Reliance's share price these days?";
    ai.runs = [[{ type: "meta", limit: 50, used: 2, left: 48, resets: "2026-12-01", cached: false }, { type: "since", ...SINCE },
      { type: "text", text: "Since you last asked (20 Nov 2026, 3:52 pm IST): the price rose 2.4%." }, { type: "done", disclaimer: "Information only, not investment advice.", sources: [] }],
      [{ type: "text", text: "Reliance traded at ₹2,950 on 23 Nov 2026." }, { type: "done", disclaimer: "Information only, not investment advice.", sources: [] }]];
    render(<MemoryRouter initialEntries={["/stocks/reliance"]}><Assistant /></MemoryRouter>);
    act(() => { dispatchEvent(new Event(OPEN_AI)); });
    const box = screen.getByLabelText("Your question for FinLit AI");
    fireEvent.change(box, { target: { value: Q } });
    await act(async () => { fireEvent.submit(box.closest("form")!); });
    expect(screen.getByRole("heading", { name: /^Since you last asked · / })).toBeTruthy();
    expect(screen.getByText(SINCE.changes[0])).toBeTruthy();
    expect(ai.sent[0][3]).toEqual({ fresh: false });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Full answer" })); });
    expect(ai.sent.length).toBe(2);
    expect(ai.sent[1][0]).toBe(Q);
    expect(ai.sent[1][1]).toEqual([]);                                                    // a first question again, not a follow-up
    expect(ai.sent[1][3]).toEqual({ fresh: true });
    expect(document.body.textContent).toContain("Reliance traded at ₹2,950 on 23 Nov 2026.");
    expect(screen.getAllByRole("heading", { name: /^Since you last asked · / }).length).toBe(1);   // the full answer has no card
  });
});
