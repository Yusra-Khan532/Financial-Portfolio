// @vitest-environment jsdom
// F&O Academy page (/learn/fno-academy): routing (hub, every lesson, the three tools, an unknown address), the quiz flow (answer, every
// option's reason shown, score saved), the module bars and "Continue where you left off", hover cards on the payoff diagram and the Greeks
// explorer, the live-data links only for Trading Lab members, the risk reminder at the end of every lesson, the phone layout rules, the menu
// entry, and no advice words on any rendered page.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ value: null as null | { user: { id: string } | null; features: string[] } }));
vi.mock("../lib/auth", () => ({ useAuthMaybe: () => auth.value, useAuth: () => { if (!auth.value) throw new Error("no provider"); return auth.value; } }));

import { LESSONS, TOOLS } from "../content/academy";
import { BANNED } from "../content/academy/banned";
import { RISK_LINE } from "../content/academy/types";
import { setLast } from "../lib/academy";
import { MENU } from "../lib/nav";
import { prefs } from "../lib/prefs";
import { FOOT, FnoAcademyPage } from "./FnoAcademy";

const at = (path: string) => render(<MemoryRouter initialEntries={[path]}><Routes>
  <Route path="/learn/fno-academy" element={<FnoAcademyPage />} />
  <Route path="/learn/fno-academy/:slug" element={<FnoAcademyPage />} />
  <Route path="*" element={<p>elsewhere</p>} />
</Routes></MemoryRouter>);
const hover = (el: Element, x = 200, y = 120) => {
  const e = new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(e, "pointerType", { value: "mouse" });
  fireEvent(el, e);
};
const textOf = () => document.body.textContent!.replace(FOOT, "");

beforeEach(() => { auth.value = null; localStorage.clear(); prefs.set({ academyDone: [], academyQuiz: [], academyLast: "" }, true); window.scrollTo = vi.fn() as never; });
afterEach(cleanup);

describe("F&O Academy: routing", () => {
  it("is routed in App.tsx under Learn and listed in the Learn menu, open to everyone (no Lab gate)", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain('<Route path="learn/fno-academy" element={<FnoAcademyPage />} />');
    expect(app).toContain('<Route path="learn/fno-academy/:slug" element={<FnoAcademyPage />} />');
    expect(MENU.find((g) => g.id === "learn")!.items.map((i) => i.to)).toContain("/learn/fno-academy");
    expect(readFileSync("src/pages/FnoAcademy.tsx", "utf8")).not.toMatch(/LabGate|labAccess/);
  });
  it("the hub lists all ten modules with a progress bar each and the three tools", () => {
    at("/learn/fno-academy");
    expect(screen.getByRole("heading", { level: 1, name: "F&O Academy" })).toBeTruthy();
    expect(document.querySelectorAll(".fa-mod")).toHaveLength(10);
    expect(screen.getAllByRole("progressbar", { name: /^Module \d+ progress$/ })).toHaveLength(10);
    for (const t of TOOLS) expect(screen.getByRole("link", { name: new RegExp("^" + t.title) }).getAttribute("href")).toBe(`/learn/fno-academy/${t.id}`);
    expect(screen.getByText("Start here")).toBeTruthy();
  });
  it("every lesson opens at its own address and ends with the risk reminder", () => {
    for (const { lesson: l } of LESSONS) {
      at(`/learn/fno-academy/${l.id}`);
      expect(screen.getByRole("heading", { level: 1 }).textContent, l.id).toBe(l.title);
      const risk = document.querySelectorAll(".fa-lesson .fa-risk");
      expect(risk.length, l.id).toBe(1);
      expect(risk[0].textContent).toBe(RISK_LINE);
      expect(risk[0].nextElementSibling?.matches("nav.fa-pn"), l.id).toBe(true);   // only the previous / next links come after it
      cleanup();
    }
  }, 120_000);
  it("the tools open at their addresses; an unknown address says so", () => {
    at("/learn/fno-academy/payoff-diagram");
    expect(screen.getByRole("combobox", { name: "Structure" })).toBeTruthy(); cleanup();
    at("/learn/fno-academy/greeks-explorer");
    expect(document.querySelector('section.fa-widget[aria-label="Greeks explorer"]')).toBeTruthy();
    expect(document.querySelector('section.fa-widget[aria-label="Implied volatility from a premium"]')).toBeTruthy(); cleanup();
    at("/learn/fno-academy/costs-calculator");
    expect(screen.getByRole("list", { name: "Charges on this round trip" })).toBeTruthy(); cleanup();
    at("/learn/fno-academy/no-such-lesson");
    expect(screen.getByText("This lesson is not in the Academy")).toBeTruthy();
  });
});

describe("F&O Academy: quiz and progress", () => {
  it("answering shows whether it is right and the reason for every option; the score is shown and saved; Try again starts over", () => {
    at("/learn/fno-academy/calls-and-puts");
    const quiz = screen.getByRole("region", { name: "Check yourself" });
    const groups = within(quiz).getAllByRole("group");
    expect(groups).toHaveLength(3);
    // question 1: pick a wrong option
    const q1 = within(groups[0]).getAllByRole("button");
    fireEvent.click(q1[0]);
    expect(q1[0].getAttribute("aria-pressed")).toBe("true");
    expect(groups[0].querySelectorAll(".fa-why")).toHaveLength(3);                    // a reason for every option
    expect(groups[0].querySelector(".fa-opt.ok")!.textContent).toContain("The right to hand over the underlying at the strike");
    expect((q1[2] as HTMLButtonElement).disabled).toBe(true);                         // locked once answered
    fireEvent.click(q1[1]);
    expect(q1[1].getAttribute("aria-pressed")).toBe("false");
    expect(within(quiz).getByText("Answered 1 of 3.")).toBeTruthy();
    // questions 2 and 3: the right options
    fireEvent.click(within(groups[1]).getByRole("button", { name: /The writer \(seller\)/ }));
    fireEvent.click(within(groups[2]).getByRole("button", { name: /\+₹11,700, the premium received/ }));
    expect(within(quiz).getByText("Your score: 2 of 3.")).toBeTruthy();
    expect(prefs.get().academyQuiz).toContain("calls-and-puts:2:3");
    expect(prefs.get().academyDone).toContain("calls-and-puts");
    fireEvent.click(within(quiz).getByRole("button", { name: "Try again" }));
    expect(within(quiz).getByText("Answered 0 of 3.")).toBeTruthy();
    expect(within(quiz).getByText(/Your highest score so far: 2 of 3/)).toBeTruthy();
  });
  it("Mark lesson as done fills the module bar; the hub then offers Continue where you left off", () => {
    at("/learn/fno-academy/what-is-a-derivative");
    const bar = screen.getAllByRole("progressbar", { name: "Module 1 progress" })[0];
    expect(bar.getAttribute("aria-valuenow")).toBe("0");
    fireEvent.click(screen.getByRole("button", { name: "Mark lesson as done" }));
    expect(screen.getAllByRole("progressbar", { name: "Module 1 progress" })[0].getAttribute("aria-valuenow")).toBe("1");
    expect(screen.getByRole("button", { name: "✓ Lesson done" }).getAttribute("aria-pressed")).toBe("true");
    expect(prefs.get().academyLast).toBe("what-is-a-derivative");
    cleanup();
    at("/learn/fno-academy");
    expect(screen.getByText("Continue where you left off")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: /1\.2 Why derivatives exist/ })).toBeTruthy();   // the next open lesson
    expect(screen.getByRole("progressbar", { name: "All lessons" }).getAttribute("aria-valuenow")).toBe("1");
  });
  it("continue goes back to an unfinished lesson opened last", () => {
    setLast("max-pain");
    at("/learn/fno-academy");
    expect(screen.getByRole("link", { name: "Continue" }).getAttribute("href")).toBe("/learn/fno-academy/max-pain");
  });
  it("the module's lesson list marks the open lesson aria-current", () => {
    at("/learn/fno-academy/theta");
    const side = screen.getByRole("complementary", { name: "Module 4 lessons" });
    expect(within(side).getByRole("link", { current: "page" }).textContent).toContain("Theta");
  });
});

describe("F&O Academy: interactive pieces", () => {
  it("the payoff diagram is inside ChartZoom, shows its figures, and a hover card at the price under the pointer", () => {
    at("/learn/fno-academy/iron-condor");
    const w = screen.getByRole("region", { name: "Payoff diagram: Iron condor" });
    expect(within(w).getByText("₹5,850")).toBeTruthy();                      // largest profit
    expect(within(w).getByText("₹7,150")).toBeTruthy();                      // largest loss
    expect(within(w).getByText("23,710 and 24,290")).toBeTruthy();
    expect(within(w).getByText("₹5,850.00 received")).toBeTruthy();
    expect(w.querySelector(".cz")).toBeTruthy();                             // the shared enlarge arrow's wrapper
    expect(screen.getByRole("img", { name: /breakeven 23,710 and 24,290; largest profit ₹5,850; largest loss ₹7,150/ })).toBeTruthy();
    const hit = w.querySelector(".fa-hit")!;
    (hit.closest("svg") as unknown as { getBoundingClientRect: () => DOMRect }).getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 300, right: 720, bottom: 300, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    hover(hit, 360);
    const pop = screen.getByRole("tooltip");
    expect(pop.textContent).toMatch(/At expiry [\d,]+/);
    expect(within(pop).getAllByRole("listitem")).toHaveLength(4);           // one line per leg
    expect(w.querySelector(".fa-readout")!.textContent).toMatch(/At expiry [\d,]+: [+−]?₹/);
  });
  it("changing an input redraws the figures; strikes in the wrong order are named", () => {
    at("/learn/fno-academy/call-spread");
    const w = screen.getByRole("region", { name: "Payoff diagram: Call spread (debit)" });
    fireEvent.change(within(w).getByLabelText(/^Lots/), { target: { value: "2" } });
    expect(within(w).getByText("₹14,300")).toBeTruthy();
    fireEvent.change(within(w).getByLabelText(/^Higher strike/), { target: { value: "23900" } });
    expect(within(w).getByRole("alert").textContent).toMatch(/lower strike must be below/);
  });
  it("the straddle can be read from the writer's side", () => {
    at("/learn/fno-academy/straddle");
    const w = screen.getByRole("region", { name: "Payoff diagram: Straddle" });
    fireEvent.click(within(w).getByRole("button", { name: "Writer's side" }));
    expect(within(w).getByRole("button", { name: "Writer's side" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(w).getByText("₹22,100")).toBeTruthy();
    expect(within(w).getAllByText("Not capped").length).toBe(1);
  });
  it("the Greeks explorer shows the model's values, a chart in ChartZoom with three lines and a hover card with every Greek", () => {
    at("/learn/fno-academy/black-scholes-explorer");
    const w = screen.getByRole("region", { name: "Greeks explorer" });
    expect(within(w).getByText("450.57")).toBeTruthy();   // premium, 30 days, IV 14%
    expect(within(w).getByText("0.561")).toBeTruthy();    // delta
    expect(w.querySelector(".cz")).toBeTruthy();
    expect(w.querySelectorAll(".fa-gline")).toHaveLength(3);
    expect(within(w).getByText("30 days left")).toBeTruthy();
    hover(w.querySelector(".fa-hit")!, 300);
    const pop = screen.getByRole("tooltip");
    for (const k of ["Premium", "Delta", "Gamma", "Theta", "Vega"]) expect(within(pop).getByRole("columnheader", { name: k })).toBeTruthy();
    fireEvent.click(within(w).getByRole("button", { name: "Across days left" }));
    expect(within(w).getByText(/\(\+3%\)/)).toBeTruthy();
    fireEvent.click(within(w).getByRole("button", { name: "Theta" }));
    expect(screen.getByRole("img", { name: /^Theta of a call/ })).toBeTruthy();
  });
  it("the implied-volatility box solves a premium and refuses one outside the model's bounds", () => {
    at("/learn/fno-academy/implied-volatility");
    const w = screen.getByRole("region", { name: "Implied volatility from a premium" });
    expect(w.querySelector(".fa-ivout")!.textContent).toContain("12.13% a year");
    fireEvent.change(within(w).getByLabelText(/^Premium/), { target: { value: "30000" } });
    expect(w.querySelector(".fa-ivout")!.textContent).toMatch(/No volatility matches this premium/);
  });
  it("the costs calculator lists every charge with its basis and the total", () => {
    at("/learn/fno-academy/round-trip-costs");
    const list = screen.getByRole("list", { name: "Charges on this round trip" });
    expect(within(list).getAllByRole("listitem").map((li) => li.querySelector("b")!.textContent)).toEqual(["Brokerage", "STT", "Exchange charges", "SEBI fee", "Stamp duty", "GST", "Total charges"]);
    expect(list.textContent).toContain("₹65.11");
    fireEvent.click(screen.getByRole("button", { name: "Futures" }));
    expect(list.textContent).toContain("₹949.88");
    expect(screen.getByText(/NSE\/FA\/73061/)).toBeTruthy();
  });
});

describe("F&O Academy: live data only for Trading Lab members", () => {
  it("module 5 shows the live link to Lab members only", () => {
    at("/learn/fno-academy/put-call-ratio");
    expect(screen.queryByRole("link", { name: /See it on live data/ })).toBeNull(); cleanup();
    auth.value = { user: { id: "u" }, features: [] };
    at("/learn/fno-academy/put-call-ratio");
    expect(screen.queryByRole("link", { name: /See it on live data/ })).toBeNull(); cleanup();
    auth.value = { user: { id: "u" }, features: ["trading_lab"] };
    at("/learn/fno-academy/put-call-ratio");
    expect(screen.getByRole("link", { name: /See it on live data: Option Pulse/ }).getAttribute("href")).toBe("/lab/flow?view=options");
    cleanup();
    at("/learn/fno-academy/delta");
    expect(screen.queryByRole("link", { name: /See it on live data/ })).toBeNull();   // other modules never link to the Lab
  });
});

describe("F&O Academy: wording and phone layout", () => {
  it("no rendered page uses advice or forecast words", () => {
    const bad: string[] = [];
    const scan = (where: string) => { const m = textOf().match(BANNED); if (m) bad.push(`${where}: ${m[0]}`); };
    at("/learn/fno-academy"); scan("hub"); cleanup();
    for (const t of TOOLS) { at(`/learn/fno-academy/${t.id}`); scan(t.id); cleanup(); }
    for (const { lesson: l } of LESSONS) {
      at(`/learn/fno-academy/${l.id}`);
      // answer every question so every reason is on the page too
      for (const g of screen.getByRole("region", { name: "Check yourself" }).querySelectorAll('[role="group"]')) act(() => { (g.querySelector("button") as HTMLButtonElement).click(); });
      scan(l.id); cleanup();
    }
    expect(FOOT).not.toMatch(BANNED);
    expect(bad).toEqual([]);
  }, 120_000);   // renders the hub, the tools and all 55 lessons
  it("phone rules: the enlarge arrow sits above the chart, one column where wide rows would not fit, no fixed widths", () => {
    const css = readFileSync("src/styles/academy.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const phone = css.slice(css.indexOf("@media (max-width: 560px)"));
    expect(css).toMatch(/\.fa-chartbox \{ padding-right: 46px;/);
    expect(phone).toMatch(/\.fa-chartbox \{ padding-right: 0; padding-top: 44px; \}/);
    expect(phone).toMatch(/\.fa-pn \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(phone).toMatch(/\.fa-terms > div \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(css).toMatch(/@media \(max-width: 860px\) \{[^}]*\.fa-mods, \.fa-tools \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(css).toMatch(/@media \(max-width: 1100px\) \{[^}]*\.fa-layout \{ grid-template-columns: minmax\(0, 1fr\); \}/);
    expect(css).not.toMatch(/[{;]\s*width: \d{3,}px/);   // no fixed pixel widths (max-widths and media queries aside)
    expect(css).not.toMatch(/font-weight: 800/);
    for (const m of css.matchAll(/([^{}]+)\{/g)) { const sel = m[1].trim(); if (sel.startsWith("@")) continue; for (const one of sel.split(",")) expect(one.trim(), one).toMatch(/^\.fa/); }   // every class is prefixed
  });
});
