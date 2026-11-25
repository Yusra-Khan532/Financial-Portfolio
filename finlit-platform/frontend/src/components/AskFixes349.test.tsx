// @vitest-environment jsdom
// Task #349 fixes after the founder's signed-in Gold QA (24 Nov 2026), panel side:
//   B  "New chat" starts an empty thread (Home and reopening kept adding to the same one); an answer still arriving never lands in the new thread.
//   C  with BSE pinned, an RBI or sector answer (meta.subject economy / sector) shows no BSE tag, no BSE report link, no BSE related questions and
//      not the company disclaimer; a BSE answer keeps all of them.
//   E  the browser's older questions show in Chat History under the server's, marked "On this device"; nothing silently disappears.
//   F  a source in square brackets in the middle of a line is drawn as a source, not as plain text.
//   G  the financial year reads whole.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MemoryRouter } from "react-router";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { COMPANY_ASK_DISCLAIMER, FIELD_ASK_DISCLAIMER, aboutPinned, disclaimerFor, pagesFor, safeSubject } from "../lib/askAi";
import { AnswerText } from "./AnswerText";
import { onDevice } from "./AskHistory";
import { Assistant, OPEN_AI, fyLabel } from "./Assistant";

const ai = vi.hoisted(() => ({ runs: [] as unknown[][], hold: null as null | ((on: (e: unknown) => void) => Promise<void>) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: async () => ({ fields: [], rows: [["BSE", "BSE Ltd", null, 1]] }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: { id: "u1" }, plan: "basic" }) }));
vi.mock("../lib/askAi", async (orig) => ({ ...(await orig<typeof import("../lib/askAi")>()),
  useAskQuota: () => ({ data: { enabled: true, signedIn: true, limit: 100, used: 1, left: 99, resets: "2026-12-01" } }),
  askAi: async (_q: string, _h: unknown, _s: unknown, on: (e: unknown) => void) => { if (ai.hold) return ai.hold(on); (ai.runs.shift() ?? []).forEach(on); } }));
vi.mock("@tanstack/react-query", async (orig) => ({ ...(await orig<typeof import("@tanstack/react-query")>()), useQueryClient: () => ({ invalidateQueries: async () => {} }) }));
beforeAll(() => { Element.prototype.scrollIntoView = () => {}; });
afterEach(() => { cleanup(); ai.runs = []; ai.hold = null; try { localStorage.clear(); } catch { /* none */ } });

const meta = (subject?: unknown) => ({ type: "meta", limit: 100, used: 2, left: 98, resets: "2026-12-01", cached: false, ...(subject ? { subject } : {}) });
const TAG = { type: "relation", tags: [{ kind: "hold", text: "In your portfolio list", tip: "On your Equity portfolio with no quantity saved" }] };

async function openOnBse() {
  try { localStorage.setItem("finlit-ai-full", "0"); } catch { /* none */ }
  render(<MemoryRouter initialEntries={["/stocks/BSE"]}><Assistant /></MemoryRouter>);
  act(() => { dispatchEvent(new Event(OPEN_AI)); });
}
async function ask(q: string) {
  const box = screen.getByLabelText("Your question for FinLit AI");
  fireEvent.change(box, { target: { value: q } });
  await act(async () => { fireEvent.submit(box.closest("form")!); });
}
const lastBot = () => { const b = document.querySelectorAll(".bub.bot"); return b[b.length - 1] as HTMLElement; };

describe("C: the pinned company stays out of field answers", () => {
  it("an RBI answer asked with BSE pinned shows no BSE tag, link, related questions or company disclaimer", async () => {
    // the server sends the relation and the company link only for a company answer; the panel holds the line even if one slipped through
    ai.runs = [[meta({ kind: "economy", id: "india" }), TAG, { type: "text", text: "The RBI kept the repo rate at 5.25%." },
      { type: "done", disclaimer: COMPANY_ASK_DISCLAIMER, sources: [], pages: [{ to: "/stocks/BSE", label: "BSE company report" }, { to: "/macro", label: "India economy" }] }]];
    await openOnBse();
    await ask("What did the RBI do on interest rates?");
    const bot = lastBot();
    expect(bot.textContent).toContain("The RBI kept the repo rate at 5.25%.");
    expect(bot.textContent).not.toContain("In your portfolio list");
    expect([...bot.querySelectorAll(".aif-acts a")].map((a) => a.getAttribute("href"))).toEqual(["/macro"]);
    expect(bot.querySelector(".aif-disc")?.textContent).toBe(FIELD_ASK_DISCLAIMER);
    expect(screen.queryByRole("list", { name: "Related questions" })).toBeNull();
  });
  it("a BSE answer keeps BSE's tag, link, related questions and the company disclaimer", async () => {
    ai.runs = [[meta({ kind: "company", id: "BSE" }), TAG, { type: "text", text: "BSE is on your Equity portfolio (no quantity saved)." },
      { type: "done", disclaimer: COMPANY_ASK_DISCLAIMER, sources: [], pages: [{ to: "/stocks/BSE", label: "BSE company report" }] }]];
    await openOnBse();
    await ask("How is BSE doing these days for me?");
    const bot = lastBot();
    expect(bot.textContent).toContain("In your portfolio list");
    expect(bot.querySelector(".aif-acts a")?.getAttribute("href")).toBe("/stocks/BSE");
    expect(bot.querySelector(".aif-disc")?.textContent).toBe(COMPANY_ASK_DISCLAIMER);
    expect(screen.getByRole("list", { name: "Related questions" })).toBeTruthy();
  });
  it("reads the subject safely", () => {
    expect(safeSubject({ kind: "company", id: "bse" })).toEqual({ kind: "company", id: "BSE" });
    expect(safeSubject({ kind: "economy", id: "India" })).toEqual({ kind: "economy", id: "india" });
    expect(safeSubject({ kind: "buy", id: "x" })).toBeNull();
    expect(safeSubject(undefined)).toBeNull();
    expect([aboutPinned({ kind: "company", id: "BSE" }, "BSE"), aboutPinned({ kind: "company", id: "TCS" }, "BSE"), aboutPinned({ kind: "sector", id: "all" }, "BSE"), aboutPinned(null, "BSE")])
      .toEqual([true, false, false, true]);
    expect(disclaimerFor({ kind: "market", id: "india" }, COMPANY_ASK_DISCLAIMER)).toBe(FIELD_ASK_DISCLAIMER);
    expect(disclaimerFor({ kind: "company", id: "BSE" }, COMPANY_ASK_DISCLAIMER)).toBe(COMPANY_ASK_DISCLAIMER);
    expect(pagesFor({ kind: "sector", id: "all" }, [{ to: "/prism/BSE", label: "p" }, { to: "/sectors", label: "s" }])).toEqual([{ to: "/sectors", label: "s" }]);
  });
});

describe("B: New chat", () => {
  it("starts an empty thread; the earlier question stays in the history list", async () => {
    ai.runs = [[meta({ kind: "economy", id: "india" }), { type: "text", text: "First answer." }, { type: "done", disclaimer: FIELD_ASK_DISCLAIMER, sources: [] }]];
    await openOnBse();
    await ask("What did the RBI do on interest rates?");
    expect(document.querySelectorAll(".bub.me").length).toBe(1);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "New chat" })); });
    expect(document.querySelectorAll(".bub").length).toBe(0);
    expect(JSON.parse(localStorage.getItem("finlit-ai-recent") || "[]")).toContain("What did the RBI do on interest rates?");
    ai.runs = [[meta({ kind: "sector", id: "all" }), { type: "text", text: "Second answer." }, { type: "done", disclaimer: FIELD_ASK_DISCLAIMER, sources: [] }]];
    await ask("How is the banking sector doing?");
    expect([...document.querySelectorAll(".bub.me")].map((b) => b.textContent)).toEqual(["How is the banking sector doing?"]);
  });
  it("an answer still arriving when New chat is pressed never lands in the new thread", async () => {
    let send: (e: unknown) => void = () => {};
    let finish: () => void = () => {};
    ai.hold = (on) => new Promise<void>((res) => { send = on; finish = res; });
    await openOnBse();
    await ask("What did the RBI do on interest rates?");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "New chat" })); });
    await act(async () => { send({ type: "text", text: "Late words." }); finish(); });
    expect(document.body.textContent).not.toContain("Late words.");
    expect(document.querySelectorAll(".bub").length).toBe(0);
  });
});

describe("E: older questions on this device", () => {
  it("are the browser's questions the server does not hold, newest first", () => {
    expect(onDevice(["How is BSE doing?", "hows relance is doing ?", "What is the FinLit IQ?"], [{ question: "how is  BSE doing?" }]))
      .toEqual(["hows relance is doing ?", "What is the FinLit IQ?"]);
    expect(onDevice([], [{ question: "x" }])).toEqual([]);
  });
});

describe("F: a source in the middle of a line", () => {
  it("is drawn as a source, not as plain text in brackets", () => {
    const { container } = render(<AnswerText text={"BSE is on your Equity portfolio (no quantity saved) [FinLit portfolio page, 24 Nov 2026]; no shares are counted.\n- Price ₹3,757 [BSE company report, 24 Nov 2026]"} />);
    expect(container.textContent).not.toContain("[FinLit portfolio page");
    expect([...container.querySelectorAll(".aif-a-cite")].map((c) => c.textContent!.trim())).toEqual(["FinLit portfolio page, 24 Nov 2026", "BSE company report, 24 Nov 2026"]);
    expect(within(container).getByText(/no shares are counted/)).toBeTruthy();
  });
  it("leaves a Markdown link and a bracket that is no source as they are", () => {
    const { container } = render(<AnswerText text={"See [the page](https://x.y) and [a note] here, then more words."} />);
    expect(container.querySelector(".aif-a-cite")).toBeNull();
  });
});

describe("G: the financial year reads whole", () => {
  it("is short, with its months", () => {
    expect(fyLabel("FY26")).toBe("FY26 (Apr ’25–Mar ’26)");
    expect(fyLabel("FY27").length).toBeLessThan("FY26 (Apr 2025 to Mar 2026)".length);
  });
  it("the side menu never scrolls sideways: its lists are one column the menu's width, long items end in an ellipsis", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/ask-ai.css"), "utf8");
    expect(css).toMatch(/\.aif-side \{ overflow-x: hidden; \}/);
    expect(css).toMatch(/\.aif-hist, \.aif-pop \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(css).toMatch(/\.aif-pop button > span \{ min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
  });
});

describe("H: the report header's Prism dots never run under the price", () => {
  it("wrap inside their column (measured in the browser at 1280, 1440, 1534 and 390, light and dark)", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/report216.css"), "utf8");
    expect(css).toMatch(/\.hx-d \.hx-dots \.hs-dots ul \{ flex-wrap: wrap; row-gap: 6px; \}/);
    expect(css).toMatch(/\.hx-d \.hx-dots \{ min-width: 0; \}/);
  });
});
