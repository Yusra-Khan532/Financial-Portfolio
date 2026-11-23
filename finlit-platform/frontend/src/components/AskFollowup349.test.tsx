// @vitest-environment jsdom
// Task #349 PR 5: follow-ups keep the earlier figures. The `done` event carries the server's "figures read" summary; the panel keeps it on the
// answer and sends it back with that turn of the history, so "and its margins?" is answered from the figures already read.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { FIGURES_CHARS, safeFigures, type AskTurn } from "../lib/askAi";
import { Assistant, OPEN_AI } from "./Assistant";

const FIGS = "RELIANCE, read 23 Nov 2026: price ₹2,950 (21 Nov 2026, 3:30 pm IST); Operating margin 17.2% (TTM); ROE 9.2% (TTM)";
const ai = vi.hoisted(() => ({ calls: [] as { q: string; history: AskTurn[] }[], runs: [] as unknown[][] }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: async () => ({ fields: [], rows: [] }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: "u1" }, plan: "gold" }) }));
vi.mock("../lib/askAi", async (orig) => ({ ...(await orig<typeof import("../lib/askAi")>()),
  useAskQuota: () => ({ data: { enabled: true, signedIn: true, limit: 100, used: 1, left: 99, resets: "2026-12-01" } }),
  askAi: async (q: string, history: AskTurn[], _s: unknown, on: (e: unknown) => void) => { ai.calls.push({ q, history }); (ai.runs.shift() ?? []).forEach(on); } }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueryClient: () => ({ invalidateQueries: async () => {} }) }));
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterEach(() => { cleanup(); ai.calls = []; ai.runs = []; vi.unstubAllGlobals(); });

const answer = (text: string, figures?: string) => [{ type: "text", text }, { type: "done", disclaimer: "Information only, not investment advice.", sources: [], ...(figures !== undefined ? { figures } : {}) }];
const askIt = async (q: string) => {
  const box = screen.getByLabelText("Your question for FinLit AI");
  fireEvent.change(box, { target: { value: q } });
  await act(async () => { fireEvent.submit(box.closest("form")!); });
};

describe("follow-ups keep the earlier figures (task #349 PR 5)", () => {
  it("keeps only plain text of at most 600 characters", () => {
    expect(safeFigures(` ${FIGS} `)).toBe(FIGS);
    expect(safeFigures("")).toBeUndefined();
    expect(safeFigures(42)).toBeUndefined();
    expect(safeFigures("x".repeat(FIGURES_CHARS + 1))).toBeUndefined();
  });
  it("sends an answer's figures back with it on the follow-up", async () => {
    ai.runs = [answer("Reliance reads as steady.", FIGS), answer("Its operating margin was 17.2% (TTM).")];
    render(<MemoryRouter initialEntries={["/stocks/reliance"]}><Assistant /></MemoryRouter>);
    act(() => { dispatchEvent(new Event(OPEN_AI)); });
    await askIt("How is Reliance doing these days?");
    await askIt("and its margins?");
    expect(ai.calls.map((c) => c.q)).toEqual(["How is Reliance doing these days?", "and its margins?"]);
    expect(ai.calls[1].history).toEqual([{ role: "user", content: "How is Reliance doing these days?" },
      { role: "assistant", content: "Reliance reads as steady.", figures: FIGS }]);
    expect(document.body.textContent).toContain("Its operating margin was 17.2% (TTM).");
    expect(document.body.textContent).not.toContain("read 23 Nov 2026");                 // kept for the server, never shown
  });
  it("sends no figures when the answer carried none", async () => {
    ai.runs = [answer("P/E is price over earnings."), answer("A high P/E means ...")];
    render(<MemoryRouter initialEntries={["/"]}><Assistant /></MemoryRouter>);
    act(() => { dispatchEvent(new Event(OPEN_AI)); });
    await act(async () => { fireEvent.change(screen.getAllByLabelText("Ask FinLit AI anything")[0], { target: { value: "Explain a price to earnings multiple" } }); });
    await act(async () => { fireEvent.submit(screen.getAllByLabelText("Ask FinLit AI anything")[0].closest("form")!); });
    await askIt("and when is it high?");
    expect(ai.calls[1].history[1]).toEqual({ role: "assistant", content: "P/E is price over earnings." });
  });
  it("goes over the wire with the turn", async () => {
    let body: { history?: AskTurn[] } = {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return new Response("event: done\ndata: {\"disclaimer\":\"d\",\"sources\":[]}\n\n", { status: 200, headers: { "Content-Type": "text/event-stream" } });
    }));
    const real = await vi.importActual<typeof import("../lib/askAi")>("../lib/askAi");
    await real.askAi("and its margins?", [{ role: "user", content: "q" }, { role: "assistant", content: "a", figures: FIGS }], "RELIANCE", () => {});
    expect(body.history).toEqual([{ role: "user", content: "q" }, { role: "assistant", content: "a", figures: FIGS }]);
  });
});
