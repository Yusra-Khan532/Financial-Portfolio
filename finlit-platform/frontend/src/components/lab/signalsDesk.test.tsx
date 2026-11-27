// @vitest-environment jsdom
// Trading Lab > Order Flow > Signals desk (backend finlit/lab/signals.py): the label and the internal-test note always on screen, the stock picker,
// "Run the desk" with each step's progress as it streams, the rating badge on the five-step scale, the trader's plan chart with a hover card on
// every level and session, the size cards, the analyst notes and the debate rounds, the numbered Sources with hover cards, the stopped / Hold /
// limit states and the phone layout. The answers are the backend's own output for RELIANCE (src/lib/__fixtures__/lab-signals-reliance.json, made
// with lab/signals.py, the stored test report and the scripted AI of the backend tests).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { SignalsDesk, planLines } from "./SignalsDesk";
import { SIGNALS_LABEL, capsLine, deskLimitLine, parseBlock, ratingTone, type DeskStep, type LabSignals } from "../../lib/labSignals";
import FIX from "../../lib/__fixtures__/lab-signals-reliance.json";

const NONE = FIX.none as unknown as LabSignals, DONE = FIX.done as unknown as LabSignals, STOPPED = FIX.stopped as unknown as LabSignals, HOLD = FIX.hold as unknown as LabSignals;
const EVENTS = FIX.events as unknown as DeskStep[];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const sse = (ev: string, data: unknown) => `event: ${ev}\ndata: ${JSON.stringify(data)}\n\n`;

let getBody: unknown = NONE, postRun: LabSignals = DONE, postStatus = 200, postError: unknown = null, hold: Promise<void> | null = null;
const calls: { url: string; method: string }[] = [];
/** The run as the server streams it: every step event, a pause (while `hold` is pending), then "done". */
function stream(): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(c) {
      for (const e of EVENTS.slice(0, 3)) c.enqueue(enc.encode(sse("step", e)));
      if (hold) await hold;
      for (const e of EVENTS.slice(3)) c.enqueue(enc.encode(sse("step", e)));
      c.enqueue(enc.encode(sse("done", postRun)));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}
beforeEach(() => {
  getBody = NONE; postRun = DONE; postStatus = 200; postError = null; hold = null; calls.length = 0;
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url), method = init?.method ?? "GET";
    calls.push({ url: u, method });
    if (u.includes("/search-index")) return json({ fields: [], rows: [["RELIANCE", "Reliance Industries Ltd", null, 1], ["TATASTEEL", "Tata Steel Ltd", null, 1]] });
    if (method === "POST") return postStatus !== 200 ? json(postError, postStatus) : stream();
    const sym = u.split("/").pop();
    return json(sym === "RELIANCE" ? getBody : { ...NONE, symbol: sym, name: "Tata Steel Ltd" });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TipLayer><SignalsDesk /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 15)); }); };
const point = (el: Element, pointerType = "mouse") => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 20, clientY: 20 }); Object.defineProperty(e, "pointerType", { value: pointerType }); fireEvent(el, e); };
const pop = () => document.querySelector<HTMLElement>(".oflow-pop");
const button = () => screen.queryByRole("button", { name: /Run the desk|Running the desk/ }) as HTMLButtonElement | null;
const stepsList = () => screen.getByRole("list", { name: "The desk's steps" });

describe("Signals desk, the words", () => {
  it("reads the streamed events and says the limits and caps plainly", () => {
    expect(parseBlock('event: step\ndata: {"id":"analysts","status":"running"}')).toEqual({ type: "step", step: { id: "analysts", status: "running" } });
    expect(parseBlock("event: error\ndata: {\"status\":\"ai_unavailable\",\"detail\":\"x\"}")).toEqual({ type: "error", status: "ai_unavailable", detail: "x" });
    expect(parseBlock(": keep-alive")).toBeNull();
    expect(deskLimitLine(NONE.limit)).toBe("10 of 10 runs left today. A run already made for a stock opens free.");
    expect(deskLimitLine({ ...NONE.limit, left: 0, used: 10 })).toMatch(/^All 10 runs of today are used/);
    expect(capsLine(NONE.caps, false)).toBe("Caps: at most 8 AI calls, 60,000 tokens and 2 debate rounds a run");
    expect(capsLine(DONE.caps, true)).toBe("6 of 8 AI calls · 720 of 60,000 tokens used");
    expect([ratingTone("Buy"), ratingTone("Overweight"), ratingTone("Hold"), ratingTone("Underweight"), ratingTone("Sell")]).toEqual(["good", "good", "mid", "bad", "bad"]);
    expect(NONE.label).toBe(SIGNALS_LABEL);
  });
  it("draws the plan's levels in price order: targets, the entry zone, the stop", () => {
    expect(planLines(DONE.plan!).map((l) => l.key)).toEqual(["t2", "t1", "eh", "el", "stop"]);
    expect(planLines(HOLD.plan!).map((l) => l.name)).toEqual(["Resistance to watch", "Support to watch"]);
  });
});

describe("Signals desk, the tab", () => {
  it("always shows the label and the internal-test note; before a run, the figures and the button, without calling the AI", async () => {
    wrap(); await settle();
    expect(screen.getByRole("heading", { name: /Signals desk/ }).textContent).toContain("Signals on · internal test");
    const notes = screen.getAllByRole("note").map((n) => n.textContent ?? "");
    expect(notes.some((t) => t.includes("Internal test for the FinLit team, not investment advice") && t.includes("SEBI's research-analyst rules"))).toBe(true);
    expect(screen.getByRole("note", { name: "Signals desk disclaimer" }).textContent).toContain(NONE.disclaimer);
    expect(calls.some((c) => c.method === "GET" && c.url.endsWith("/api/lab/signals/RELIANCE"))).toBe(true);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(button()!.disabled).toBe(false);
    expect(screen.getByText("Caps: at most 8 AI calls, 60,000 tokens and 2 debate rounds a run")).toBeTruthy();
    expect(document.querySelectorAll(".lcase-slist li")).toHaveLength(15);
    fireEvent.click(screen.getByRole("button", { name: `Show ${NONE.sources.length - 15} more` }));
    expect(document.querySelectorAll(".lcase-slist li")).toHaveLength(NONE.sources.length);
    expect(document.querySelector(".sdesk-badge")).toBeNull();
  });

  it("runs the desk: each step's progress as it streams, then the rating, the plan, the sizes, the notes and the debate", async () => {
    let release!: () => void;
    hold = new Promise<void>((r) => { release = r; });
    wrap(); await settle();
    fireEvent.click(button()!); await settle();
    expect(button()!.textContent).toBe("Running the desk…");
    expect(button()!.disabled).toBe(true);
    const items = within(stepsList()).getAllByRole("listitem");
    expect(items.map((li) => li.className)).toEqual(["sdesk-step done", "sdesk-step running", "sdesk-step waiting", "sdesk-step waiting", "sdesk-step waiting"]);
    expect(items[1].getAttribute("aria-current")).toBe("step");
    expect(within(items[1]).getByText("Writing…")).toBeTruthy();
    expect(screen.getByText(/The desk is working through five steps/)).toBeTruthy();
    release(); await settle();
    expect(calls.filter((c) => c.method === "POST").map((c) => c.url)).toEqual(["/api/lab/signals/RELIANCE"]);
    expect(within(stepsList()).getAllByRole("listitem").every((li) => li.className === "sdesk-step done")).toBe(true);
    const badge = screen.getByRole("status", { name: "Rating: Buy" });
    expect(badge.textContent).toBe("Buy");
    expect(badge.className).toBe("sdesk-badge good");
    const scale = screen.getByRole("list", { name: "The five-step scale" });
    expect(within(scale).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Buy", "Overweight", "Hold", "Underweight", "Sell"]);
    expect(within(scale).getByText("Buy").getAttribute("aria-current")).toBe("true");
    const rating = document.querySelector<HTMLElement>(".sdesk-rating")!;
    expect(rating.querySelectorAll(".lcase-sents li")).toHaveLength(DONE.rating!.reasons.length);
    expect([...rating.querySelectorAll(".lcase-ref")].map((a) => a.textContent)).toEqual(DONE.rating!.reasons.flatMap((r) => r.sources.map((n) => `[${n}]`)));
    // the plan: the worked-out numbers, the chart inside the enlarge wrapper
    const plan = document.querySelector<HTMLElement>(".sdesk-plan")!;
    expect(within(plan).getByText("Stop").nextElementSibling!.textContent).toBe("₹1,146.51");
    expect(within(plan).getByText("Target 1").nextElementSibling!.textContent).toBe("₹1,219.52 1.23R");
    expect(plan.querySelector(".cz")).toBeTruthy();
    expect(within(plan).getByRole("img", { name: /^RELIANCE: 60 daily closes from .* with Target 2 ₹1,249.12, Target 1 ₹1,219.52, Entry zone top ₹1,184.00, Entry zone bottom ₹1,174.63, Stop ₹1,146.51$/ })).toBeTruthy();
    // the sizes, the four notes, the two rounds
    expect([...document.querySelectorAll(".sdesk-size h3")].map((h) => h.textContent)).toEqual(["Cautious", "Balanced", "Aggressive"]);
    expect(screen.getByRole("img", { name: "Cautious: 15.00% of capital, 0.42% at risk" })).toBeTruthy();
    expect(screen.getAllByText(/held to 15% in one trade/).length).toBeGreaterThan(0);
    for (const t of ["Technical analyst", "Financials analyst", "News and sentiment analyst", "Order Flow analyst"]) expect(screen.getByRole("article", { name: t })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Round 1" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Bear researcher, round 2" })).toBeTruthy();
    expect(screen.getByText("Run just now")).toBeTruthy();
    expect(button()).toBeNull();                                                             // a finished run: no second press
    expect(screen.getByText("6 of 8 AI calls · 720 of 60,000 tokens used")).toBeTruthy();
  });

  it("the plan chart: a hover card on every level and every session; a touch opens none", async () => {
    getBody = { ...DONE, cached: true };
    wrap(); await settle();
    expect(screen.getByText("Opened from the saved run")).toBeTruthy();
    point(document.querySelector(".sdesk-lvl.stop")!);
    expect(pop()!.getAttribute("role")).toBe("tooltip");
    expect(within(pop()!).getByText("Stop")).toBeTruthy();
    expect(within(pop()!).getByText("₹1,146.51")).toBeTruthy();
    expect(within(pop()!).getByText("1.5 ATR under the entry zone")).toBeTruthy();
    expect(pop()!.textContent).toMatch(/-3\.17% from the last close ₹1,184\.00/);
    point(document.querySelector(".sdesk-lvl.target")!);
    expect(within(pop()!).getByText("Target 2")).toBeTruthy();
    point(document.querySelector(".sdesk-zone")!);
    expect(within(pop()!).getByText("Entry zone")).toBeTruthy();
    const days = document.querySelectorAll(".sdesk-hit");
    expect(days).toHaveLength(60);
    point(days[59]);
    expect(within(pop()!).getByText(/^29 Sept? 2026$/)).toBeTruthy();                       // the last session of the stored closes
    expect(within(pop()!).getByText("High")).toBeTruthy();
    expect(days[59].getAttribute("class")).toBe("sdesk-hit hot");
    fireEvent.pointerLeave(document.querySelector(".sdesk-chart")!);
    expect(pop()).toBeNull();
    point(document.querySelector(".sdesk-lvl.stop")!, "touch");
    expect(pop()).toBeNull();
  });

  it("a source number shows its fact and where it is stored, on the pointer and on focus, and links to its row", async () => {
    getBody = { ...DONE, cached: true };
    wrap(); await settle();
    const n = DONE.rating!.reasons[0].sources[0];
    const fact = DONE.sources.find((f) => f.n === n)!;
    const ref = document.querySelector<HTMLAnchorElement>(`.sdesk-rating .lcase-ref[href="#sdesk-src-${n}"]`)!;
    point(ref);
    expect(within(pop()!).getByText(`Source [${n}]`)).toBeTruthy();
    expect(within(pop()!).getByText(fact.text)).toBeTruthy();
    expect(within(pop()!).getByText(fact.source)).toBeTruthy();
    fireEvent.pointerLeave(ref);
    expect(pop()).toBeNull();
    fireEvent.focus(ref);
    expect(within(pop()!).getByText(fact.text)).toBeTruthy();
    fireEvent.blur(ref);
    // a plan source beyond the first 15 opens the full list and is marked
    const late = DONE.plan!.sentences[1].sources[0];
    fireEvent.click(document.querySelector(`.sdesk-plan .lcase-ref[href="#sdesk-src-${late}"]`)!);
    expect(document.getElementById(`sdesk-src-${late}`)!.className).toBe("hot");
    expect(document.getElementById(`sdesk-src-${late}`)!.textContent).toContain("Entry zone ₹1,174.63 to ₹1,184.00");
  });

  it("a run that stopped shows the steps before it and the plain message, never a rating", async () => {
    postRun = STOPPED;
    wrap(); await settle();
    fireEvent.click(button()!); await settle();
    expect(screen.getAllByRole("status").some((s) => s.textContent === STOPPED.message)).toBe(true);
    expect(within(stepsList()).getAllByRole("listitem").map((li) => li.className.replace("sdesk-step ", ""))).toEqual(["done", "failed", "not_run", "not_run", "not_run"]);
    expect(document.querySelector(".sdesk-badge")).toBeNull();
    expect(screen.getByRole("article", { name: "Technical analyst" })).toBeTruthy();
  });

  it("a Hold: the badge, no new trade, the levels to watch and no sizes", async () => {
    getBody = { ...HOLD, cached: true };
    wrap(); await settle();
    expect(screen.getByRole("status", { name: "Rating: Hold" }).className).toBe("sdesk-badge mid");
    expect(screen.getByText(/No new trade/)).toBeTruthy();
    expect(document.querySelectorAll(".sdesk-size")).toHaveLength(0);
    expect(screen.getByText(HOLD.steps[4].note!)).toBeTruthy();
    expect(document.querySelectorAll(".sdesk-lvl.watch")).toHaveLength(2);
  });

  it("the day's limit and a refusal: the button is off and the server's words are said", async () => {
    getBody = { ...NONE, limit: { ...NONE.limit, used: 10, left: 0 } };
    wrap(); await settle();
    expect(button()!.disabled).toBe(true);
    expect(screen.getByText(/^All 10 runs of today are used/)).toBeTruthy();
    cleanup();
    getBody = NONE; postStatus = 403;
    postError = { detail: { status: "signals_off", detail: "Trade signals are switched off for your account. An administrator can switch them on." } };
    wrap(); await settle();
    fireEvent.click(button()!); await settle();
    expect(screen.getByRole("status").textContent).toBe("Trade signals are switched off for your account. An administrator can switch them on.");
  });

  it("another company is chosen from the chips or the search", async () => {
    wrap(); await settle();
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a company" }), { target: { value: "tata" } });
    await settle();
    fireEvent.click(within(screen.getByRole("list", { name: "Matching companies" })).getByRole("button", { name: /TATASTEEL/ }));
    await settle();
    expect(calls.some((c) => c.url.endsWith("/api/lab/signals/TATASTEEL"))).toBe(true);
    expect(screen.getByText("Tata Steel Ltd")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "TCS" }));
    expect(screen.getByRole("button", { name: "TCS" }).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("Signals desk, phone layout", () => {
  const css = readFileSync(resolve(__dirname, "../../styles/orderflow.css"), "utf8");
  const desk = css.slice(css.indexOf("/* ---- Signals desk"));
  it("stacks every grid in one column on a phone, gives the enlarge arrow room and keeps long text wrapping", () => {
    expect(desk).toMatch(/@media \(max-width: 1000px\) \{ \.sdesk-top \{ grid-template-columns: minmax\(0, 1fr\); \} \.sdesk-grid3 \{ grid-template-columns: minmax\(0, 1fr\); \} \}/);
    expect(desk).toMatch(/@media \(max-width: 700px\) \{ \.sdesk-grid2, \.sdesk-grid4 \{ grid-template-columns: minmax\(0, 1fr\); \} \.sdesk-steps \{ grid-template-columns: minmax\(0, 1fr\); \} \}/);
    expect(desk).toMatch(/\.sdesk-plan \{ padding-right: 46px; \}/);
    const phone = desk.slice(desk.indexOf("@media (max-width: 560px)"));
    expect(phone).toMatch(/\.sdesk-plan \{ padding-top: 44px; \}/);
    expect(phone).toMatch(/\.sdesk-badge \{ min-width: 0; width: 100%/);
    expect(desk).toMatch(/\.sdesk-step-t b \{[^}]*overflow-wrap: anywhere/);
    expect(desk).not.toMatch(/prefers-reduced-motion/);                                    // motion is turned off in the file's one last block
    const motion = css.lastIndexOf("@media (prefers-reduced-motion");
    expect(css.slice(motion)).toMatch(/\.sdesk-step\.running \.sdesk-step-n \{ animation: none; \}/);
  });
});
