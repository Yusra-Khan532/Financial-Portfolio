// @vitest-environment jsdom
// Task #349 PR 4: holdings-aware answers. The `relation` event is read from the stream and checked (safeRelation); the answer carries ui Chip
// tags ("You hold this" with the shares and weight as its tooltip, "In 2 of your funds", "In your ETF", "On your watchlist", "Alert set");
// a signed-out visitor sees none.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { askAi, parseSse, safeRelation, type AskEvent } from "../lib/askAi";
import { AskRelation } from "./AskRelation";
import { Assistant, OPEN_AI } from "./Assistant";

const ai = vi.hoisted(() => ({ runs: [] as unknown[][], user: { id: "u1" } as { id: string } | null }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: async () => ({ fields: [], rows: [["RELIANCE", "Reliance Industries Ltd", null, 1]] }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: ai.user }) }));
vi.mock("../lib/askAi", async (orig) => ({ ...(await orig<typeof import("../lib/askAi")>()),
  useAskQuota: () => ({ data: { enabled: true, signedIn: true, limit: 50, used: 1, left: 49, resets: "2026-12-01" } }),
  askAi: async (_q: string, _h: unknown, _s: unknown, on: (e: unknown) => void) => { (ai.runs.shift() ?? []).forEach(on); } }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueryClient: () => ({ invalidateQueries: async () => {} }) }));
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterEach(() => { cleanup(); ai.runs = []; ai.user = { id: "u1" }; vi.unstubAllGlobals(); });

const TAGS = [{ kind: "hold", text: "You hold this", tip: "40 shares · 12.4% of your Equity portfolio by value (close 21 Nov 2026)" },
  { kind: "fund", text: "In 2 of your funds", tip: "Parag Parikh Flexi Cap Fund 4.1% (31 Oct 2026 disclosure)" }, { kind: "etf", text: "In your ETF" },
  { kind: "watch", text: "On your watchlist", tip: "Energy" }, { kind: "alert", text: "Alert set", tip: "price above ₹3,000, active, not fired yet" }];
const sse = (name: string, data: unknown) => `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;

describe("the relation event (task #349 PR 4)", () => {
  it("is parsed from the stream, right after meta and before the words", () => {
    const { events } = parseSse(sse("meta", { limit: 50, used: 2, left: 48, resets: "2026-12-01", cached: false }) + sse("relation", { tags: TAGS }) + sse("text", { text: "You hold 40 shares." }));
    expect(events.map((e) => e.type)).toEqual(["meta", "relation", "text"]);
    expect(safeRelation(events[1])).toEqual(TAGS);
  });
  it("reaches the panel through askAi", async () => {
    const enc = new TextEncoder();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream<Uint8Array>({ start(c) {
      [sse("meta", { limit: 50, used: 1, left: 49, resets: "2026-12-01", cached: false }), sse("relation", { tags: TAGS }), sse("text", { text: "x" }), sse("done", { disclaimer: "d", sources: [] })]
        .forEach((p) => c.enqueue(enc.encode(p))); c.close(); } }), { status: 200, headers: { "Content-Type": "text/event-stream" } })));
    const real = await vi.importActual<typeof import("../lib/askAi")>("../lib/askAi");
    const got: AskEvent[] = [];
    await real.askAi("Reliance?", [], "RELIANCE", (e) => got.push(e));
    expect(got.map((e) => e.type)).toEqual(["meta", "relation", "text", "done"]);
    expect(got[1]).toEqual({ type: "relation", tags: TAGS });
    expect(typeof askAi).toBe("function");
  });
  it("drops unknown kinds, empty and repeated texts, and keeps at most 10", () => {
    expect(safeRelation({ tags: [{ kind: "buy", text: "Buy more" }, { kind: "hold", text: "" }, { kind: "hold", text: "You hold this" }, { kind: "watch", text: "You hold this" }] }))
      .toEqual([{ kind: "hold", text: "You hold this" }]);
    expect(safeRelation(null)).toEqual([]);
    expect(safeRelation({ tags: Array.from({ length: 14 }, (_, i) => ({ kind: "watch", text: `List ${i}` })) }).length).toBe(10);
  });
});

describe("AskRelation", () => {
  it("renders one ui Chip per tag, the holding with its shares and weight as the tooltip", () => {
    render(<AskRelation tags={safeRelation({ tags: TAGS })} signedIn />);
    const list = screen.getByRole("list", { name: "How you are linked to this company" });
    const chips = within(list).getAllByRole("listitem").map((li) => li.firstElementChild as HTMLElement);
    expect(chips.map((c) => c.firstChild?.textContent)).toEqual(["You hold this", "In 2 of your funds", "In your ETF", "On your watchlist", "Alert set"]);
    expect(chips.every((c) => c.classList.contains("ui-chip"))).toBe(true);
    expect(chips[0].getAttribute("title")).toBe("40 shares · 12.4% of your Equity portfolio by value (close 21 Nov 2026)");
    expect(chips[0].className).toContain("ui-chip--gold");
    expect(chips[2].getAttribute("title")).toBeNull();
  });
  it("shows nothing to a signed-out visitor, or with no tags", () => {
    const { container, rerender } = render(<AskRelation tags={safeRelation({ tags: TAGS })} signedIn={false} />);
    expect(container.innerHTML).toBe("");
    rerender(<AskRelation tags={[]} signedIn />);
    expect(container.innerHTML).toBe("");
  });
});

describe("in the panel", () => {
  const run = async () => {
    ai.runs = [[{ type: "meta", limit: 50, used: 2, left: 48, resets: "2026-12-01", cached: false }, { type: "relation", tags: TAGS },
      { type: "text", text: "You hold 40 shares; at ₹2,950 they are worth ₹1,18,000." }, { type: "done", disclaimer: "Information only, not investment advice.", sources: [] }]];
    render(<MemoryRouter initialEntries={["/stocks/reliance"]}><Assistant /></MemoryRouter>);
    act(() => { dispatchEvent(new Event(OPEN_AI)); });
    const box = screen.getByLabelText("Your question for FinLit AI");
    fireEvent.change(box, { target: { value: "How is my Reliance holding doing lately?" } });
    await act(async () => { fireEvent.submit(box.closest("form")!); });
  };
  it("shows the tags on the answer for a signed-in member", async () => {
    await run();
    const list = screen.getByRole("list", { name: "How you are linked to this company" });
    expect(within(list).getAllByRole("listitem").length).toBe(5);
    expect(list.closest(".bub")?.textContent).toContain("You hold 40 shares; at ₹2,950 they are worth ₹1,18,000.");
  });
  it("shows no tags when signed out (a visitor's panel never sends a written question, and AskRelation needs a member)", async () => {
    ai.user = null;
    ai.runs = [[{ type: "relation", tags: TAGS }]];
    render(<MemoryRouter initialEntries={["/stocks/reliance"]}><Assistant /></MemoryRouter>);
    act(() => { dispatchEvent(new Event(OPEN_AI)); });
    expect(screen.queryByRole("list", { name: "How you are linked to this company" })).toBeNull();
    expect(screen.queryByText("You hold this")).toBeNull();
  });
});
