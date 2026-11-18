// @vitest-environment jsdom
// Task #203: the FinLit AI theme "Mutual funds & ETFs": the 20 segments, a search, and a question about one fund asks for the fund first, then answers.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/api", () => ({ apiGet: vi.fn(async (path: string) => {
  if (path.startsWith("/api/mf?") && path.includes("q=")) return { total: 1, items: [{ code: 122639, name: "Parag Parikh Flexi Cap Fund", plan: "Direct", option: "Growth" }] };
  if (path === "/api/mf/122639") return { code: 122639, name: "Parag Parikh Flexi Cap Fund", plan: "Direct", option: "Growth", optionClass: "Growth", nav: 94.4817, navDate: "2026-11-16", prevNav: 94.2594, prevDate: "2026-11-13", change: 0.24, returns: {}, risk: {}, family: [] };
  throw new Error("not mocked: " + path);
}) }));
import { AskFunds } from "./AskFunds";
import type { FundCtx } from "../lib/askFunds";

afterEach(cleanup);
function view() {
  const asked: { q: string; a: string }[] = [];
  let ctx: FundCtx = {};
  const r = render(<AskFunds ctx={ctx} setCtx={(c) => { ctx = c; r.rerender(<AskFunds ctx={ctx} setCtx={() => undefined} onAnswer={onAnswer} />); }} onAnswer={onAnswer} />);
  function onAnswer(q: string, a: Promise<{ text: string }>) { void a.then((x) => asked.push({ q, a: x.text })); }
  return asked;
}

describe("Mutual funds & ETFs theme (task #203)", () => {
  it("lists the 20 segments with their question counts; a segment opens its sub-segments and questions", async () => {
    view();
    await waitFor(() => expect(screen.getAllByRole("button", { expanded: false }).length).toBe(20));
    const seg = screen.getByRole("button", { name: /Fund discovery.*317 questions/ });
    fireEvent.click(seg);
    expect(seg.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("region", { name: "By category" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Show me all Large Cap funds/ })).toBeTruthy();
  });
  it("searches all 1,391 questions", async () => {
    view();
    const box = await screen.findByPlaceholderText(/Search 1,391 questions/);
    fireEvent.change(box, { target: { value: "exit load" } });
    const list = screen.getByRole("list", { name: "Matching questions" });
    expect(within(list).getAllByRole("button").length).toBeGreaterThan(2);
    for (const b of within(list).getAllByRole("button")) expect(b.textContent!.toLowerCase()).toContain("exit load");
  });
  it("a question about one fund asks which fund, then answers from its data", async () => {
    const asked = view();
    fireEvent.change(await screen.findByPlaceholderText(/Search 1,391 questions/), { target: { value: "latest NAV of" } });
    fireEvent.click(within(screen.getByRole("list", { name: "Matching questions" })).getAllByRole("button")[0]);
    expect(screen.getByText(/What is the latest NAV of a fund\?/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Which fund?"), { target: { value: "parag" } });
    fireEvent.click(await screen.findByRole("button", { name: /Parag Parikh Flexi Cap Fund/ }));
    await waitFor(() => expect(asked).toHaveLength(1));
    expect(asked[0].q).toBe("What is the latest NAV of Parag Parikh Flexi Cap Fund?");
    expect(asked[0].a).toMatch(/latest NAV \*\*₹94\.4817\*\* on 16 Nov 2026/);
    expect(asked[0].a).toMatch(/Information only, not investment advice\./);
  });
});
