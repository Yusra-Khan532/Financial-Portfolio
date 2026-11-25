// @vitest-environment jsdom
// Console > FinLit AI: the answer check (the founder, 25 Nov 2026). Runs in each style, side by side, and the switch to v2 only recommended when v2 is
// at least 3 points better with no more advice-like or failed answers.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnswerCheck, verdict, type CheckAnswer, type CheckRun } from "./AnswerCheck";

const sent: unknown[][] = [];
const run = (id: number, style: "v1" | "v2", score: number, status: CheckRun["status"] = "done"): CheckRun =>
  ({ id, style, started_at: "2026-11-25T10:00:00Z", finished_at: null, started_by: "admin@example.com", questions: 2, done: 2, score, status, note: null });
const ans = (qid: string, score: number, advice = false, answer = "An answer [FinLit, FY2026]."): CheckAnswer =>
  ({ qid, question: qid === "a" ? "How is TCS doing?" : "Should I buy ITC?", kind: "company", answer, score, seconds: 4, tokens_in: 100, tokens_out: 50, error: null,
     checks: { fixed: { score, notes: advice ? ["reads like advice"] : [], advice, problems: [] }, grade: { direct: 5, specific: 4, clear: 5, why: "fine" } } });
const DATA: Record<string, unknown> = {
  "/api/admin/ask-check": { runs: [run(2, "v2", 86), run(1, "v1", 72)], questions: 48, styleOn: "v1", gapSeconds: 12.5 },
  "/api/admin/ask-check/1": { run: run(1, "v1", 72), answers: [ans("a", 70), ans("b", 74)] },
  "/api/admin/ask-check/2": { run: run(2, "v2", 86), answers: [ans("a", 90, false, "TCS grew 6% [FinLit, FY2026]."), ans("b", 82)] },
};
vi.mock("../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../lib/api")>()),
  apiGet: async (p: string) => DATA[p], apiSend: async (...a: unknown[]) => { sent.push(a); return { id: 3, questions: 48, minutes: 10 }; } }));
vi.mock("../../lib/ui", async (orig) => ({ ...(await orig<typeof import("../../lib/ui")>()), useUI: () => ({ toast: () => {} }) }));
afterEach(() => { cleanup(); sent.length = 0; });

const show = () => render(<QueryClientProvider client={new QueryClient()}><AnswerCheck /></QueryClientProvider>);

describe("the verdict", () => {
  const one = (score: number, answers: CheckAnswer[]) => ({ run: run(1, "v1", score), answers });
  it("recommends v2 only when it is 3 points better with no more advice or failures", () => {
    expect(verdict(one(72, [ans("a", 70)]), one(86, [ans("a", 90)]))?.better).toBe(true);
    expect(verdict(one(72, [ans("a", 70)]), one(74, [ans("a", 74)]))?.better).toBe(false);
    expect(verdict(one(72, [ans("a", 70)]), one(90, [ans("a", 90, true)]))?.better).toBe(false);   // more advice-like answers
    expect(verdict(undefined, one(90, []))).toBeNull();
  });
});

describe("Console > FinLit AI", () => {
  it("shows both styles side by side with the change, and the answers on a click", async () => {
    show();
    expect(await screen.findByText(/v2 scores 86 against 72 \(\+14\.0\)/)).toBeTruthy();
    expect(screen.getByText("Today's answers (v1)", { selector: "b" })).toBeTruthy();
    expect(screen.getAllByText("+20.0").length).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "How is TCS doing?" }));
    expect(screen.getByText("TCS grew 6% [FinLit, FY2026].")).toBeTruthy();
    expect(screen.getAllByText(/Grade: direct 5\/5/).length).toBe(2);
  });
  it("starts a run and turns the switch", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Check the new shape (v2)" }));
    await waitFor(() => expect(sent).toContainEqual(["POST", "/api/admin/ask-check", { style: "v2" }]));
    fireEvent.click(screen.getByRole("button", { name: "Switch members to v2" }));
    await waitFor(() => expect(sent).toContainEqual(["PUT", "/api/admin/features/ask_answer_v2", { enabled: true }]));
  });
});
