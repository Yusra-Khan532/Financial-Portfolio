// @vitest-environment jsdom
// Task #366: Copy and thumbs up / down under AI-written text; the vote is sent to the backend, remembered, and pressing it again withdraws it.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AiFeedback } from "./AiFeedback";
import { askRef } from "../lib/aiFeedback";

const sent: unknown[] = [];
vi.mock("../lib/api", () => ({ apiSend: vi.fn(async (_m: string, _p: string, body: unknown) => { sent.push(body); return { status: "saved" }; }) }));
beforeEach(() => { sent.length = 0; localStorage.clear(); });
afterEach(cleanup);

describe("task #366: copy and rate AI answers", () => {
  it("copies the whole answer", async () => {
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AiFeedback surface="ask" refKey="R|q" text="The whole answer." question="q" />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy this answer" })); });
    expect(writeText).toHaveBeenCalledWith("The whole answer.");
    expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy();
  });
  it("a thumb sends the vote with the question and the answer, stays pressed, and a second press withdraws it", async () => {
    render(<AiFeedback surface="ask" refKey="R|q" text="Answer." question="How is Reliance?" />);
    const down = screen.getByRole("button", { name: "Bad answer" });
    await act(async () => { fireEvent.click(down); });
    expect(sent.at(-1)).toMatchObject({ surface: "ask", ref: "R|q", rating: -1, question: "How is Reliance?", excerpt: "Answer." });
    expect(down.getAttribute("aria-pressed")).toBe("true");
    expect(localStorage.getItem("finlit.aifb.ask.R|q")).toBe("-1");
    await act(async () => { fireEvent.click(down); });
    expect(sent.at(-1)).toMatchObject({ rating: 0 });
    expect(down.getAttribute("aria-pressed")).toBe("false");
  });
  it("names an answer by its company and question", () => {
    expect(askRef("RELIANCE", "  How is  Reliance doing? ")).toBe("RELIANCE|how is reliance doing?");
    expect(askRef(null, "What is ROE?")).toBe("-|what is roe?");
  });
  it("is under every AI-written text: chat answers, the Prism AI summary, concall summaries and the company brief", () => {
    const r = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
    expect(r("components/Assistant.tsx")).toContain('<AiFeedback surface="ask"');
    expect(r("stock/PrismAiSummary.tsx")).toContain('<AiFeedback surface="prism_summary"');
    expect(r("pages/ConcallMonitor.tsx")).toContain('<AiFeedback surface="concall_summary"');
    expect(r("stock/CompanyBrief.tsx")).toContain('<AiFeedback surface="company_brief"');
  });
});
