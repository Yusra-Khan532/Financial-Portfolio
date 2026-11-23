// @vitest-environment jsdom
// Task #349: a written answer is never left on "Reading…": an interrupted one says so and offers "Ask again"; while an answer streams, Stop ends it;
// the words FinLit AI writes before it reads more data are cleared, and the bubble shows what it is reading again.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Assistant, OPEN_AI } from "./Assistant";

const ai = vi.hoisted(() => ({ runs: [] as unknown[][], sent: [] as unknown[][], hold: false }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: async () => ({ fields: [], rows: [["RELIANCE", "Reliance Industries Ltd", null, 1]] }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("../lib/askAi", async (orig) => ({ ...(await orig<typeof import("../lib/askAi")>()),
  useAskQuota: () => ({ data: { enabled: true, signedIn: true, limit: 50, used: 1, left: 49, resets: "2026-12-01" } }),
  askAi: async (q: string, history: unknown, symbol: unknown, on: (e: unknown) => void, signal?: AbortSignal) => {
    ai.sent.push([q, history, symbol, signal]);
    (ai.runs.shift() ?? []).forEach(on);
    if (ai.hold) await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
  } }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueryClient: () => ({ invalidateQueries: async () => {} }) }));
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterEach(() => { cleanup(); ai.runs = []; ai.sent = []; ai.hold = false; });

const open = () => {
  render(<MemoryRouter initialEntries={["/stocks/reliance"]}><Assistant /></MemoryRouter>);
  act(() => { dispatchEvent(new Event(OPEN_AI)); });
};
const typeAndSend = async (text: string) => {
  const box = screen.getByLabelText("Your question for FinLit AI");
  fireEvent.change(box, { target: { value: text } });
  await act(async () => { fireEvent.submit(box.closest("form")!); });
};
const Q = "Will the dividend rise much higher next year, do you think?";

describe("written answers that do not finish (task #349)", () => {
  it("an interrupted answer says so and offers Ask again, which asks the same question in its place", async () => {
    ai.runs = [[{ type: "text", text: "Reliance's dividend was" }, { type: "error", code: "interrupted", text: "The answer was interrupted. Ask again." }],
      [{ type: "text", text: "Reliance paid Rs 10 a share in FY2026." }, { type: "done", disclaimer: "Information only, not investment advice.", sources: [] }]];
    open();
    await typeAndSend(Q);
    expect(screen.getByText("The answer was interrupted. Ask again.")).toBeTruthy();
    expect(screen.queryByText(/Reading/)).toBeNull();                                  // never left on "Reading…"
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Ask again" })); });
    expect(ai.sent.map((s) => s[0])).toEqual([Q, Q]);
    expect(screen.getByText("Reliance paid Rs 10 a share in FY2026.")).toBeTruthy();
    expect(screen.queryByText("The answer was interrupted. Ask again.")).toBeNull();   // the failed bubble is replaced, not kept
    expect(screen.getAllByText(Q).length).toBe(1);                                      // and the question is not asked twice in the chat
    expect(screen.queryByRole("button", { name: "Ask again" })).toBeNull();
  });

  it("an answer that took too long offers Ask again too", async () => {
    ai.runs = [[{ type: "error", code: "timeout", text: "The answer took too long and was stopped. Ask again." }]];
    open();
    await typeAndSend(Q);
    expect(screen.getByText("The answer took too long and was stopped. Ask again.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Ask again" })).toBeTruthy();
  });

  it("a plain refusal from the server (busy) has no Ask again button: it says when to try", async () => {
    ai.runs = [[{ type: "error", code: "busy", text: "FinLit AI is answering many questions right now. Please try again in a minute." }]];
    open();
    await typeAndSend(Q);
    expect(screen.queryByRole("button", { name: "Ask again" })).toBeNull();
  });

  it("Stop shows while the answer streams and ends it: the request is aborted and the bubble says it was stopped", async () => {
    ai.hold = true;
    ai.runs = [[{ type: "text", text: "Reliance's dividend was Rs 10 a share" }]];
    open();
    await typeAndSend(Q);
    const stop = screen.getByRole("button", { name: "Stop this answer" });
    expect(stop.className).toContain("ui-btn");                                          // the shared button of the ui- system
    await act(async () => { fireEvent.click(stop); });
    expect((ai.sent[0][3] as AbortSignal).aborted).toBe(true);
    expect(screen.getByText("You stopped this answer.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Stop this answer" })).toBeNull();
    expect(screen.getByRole("button", { name: "Ask again" })).toBeTruthy();
  });

  it("the words before FinLit AI reads more data are cleared and the bubble shows what it is reading", async () => {
    ai.hold = true;
    ai.runs = [[{ type: "text", text: "Let me check the ratios." }, { type: "replace", text: "" }, { type: "status", text: "Reading the ratios (RELIANCE)" }]];
    open();
    await typeAndSend(Q);
    expect(screen.queryByText("Let me check the ratios.")).toBeNull();
    expect(screen.getByText(/Reading the ratios \(RELIANCE\)/)).toBeTruthy();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Stop this answer" })); });
  });
});
