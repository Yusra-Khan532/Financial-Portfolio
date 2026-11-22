// @vitest-environment jsdom
// Task #195 (dashboard pack, 15 Nov 2026): the shared sections bar with numbered steps, the callout cards with a dropdown ("Open all / Close all", grouped chips,
// at most 8 then "+N more"), the shared score ring (site bands, one arc per part or fund), the glance cards on it, the one-line strips, the tools, and the
// Watchlist by band counts next to their labels.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { StepHeading, StepsBar, stepInView, type Step } from "../StepsBar";
import { Callout, CalloutOpenAll, CHIP_LIMIT } from "../Callout";
import { ScoreRing, bandWord } from "../ScoreRing";
import { DashCardsProvider, cardIds } from "./DashCards";
import { SignalCards } from "./Signals";
import { glance, colourOf } from "./Portfolio";
import { DASH_STEPS, WIDGETS, normaliseLayout, stepGroups } from "../../lib/prefs";
import type { Signal } from "../../lib/dashPack";
import type { Row } from "../../lib/screener";

afterEach(cleanup);
const wrap = (ui: React.ReactNode) => render(<MemoryRouter><DashCardsProvider userId="t195">{ui}</DashCardsProvider></MemoryRouter>);

describe("sections bar with numbered steps", () => {
  const groups = stepGroups(normaliseLayout(null).filter((w) => w.on));
  const meta = Object.fromEntries(WIDGETS.map((w) => [w.id, w]));
  const steps: Step[] = groups.map((g) => ({ id: "s-" + g.step.id, n: g.step.n, title: g.step.title, sections: g.blocks.map((b) => ({ id: "b-" + b.id, label: meta[b.id].nav ?? meta[b.id].label })) }));
  it("shows 5 numbered steps with arrows between them, the first in view underlined, and no old My stocks / Market / News tabs", () => {
    wrap(<StepsBar steps={steps} label="Dashboard sections" />);
    const bar = screen.getByRole("navigation", { name: "Dashboard sections" });
    const chips = within(bar).getAllByRole("button").filter((b) => b.className === "stb-chip");
    expect(chips.map((c) => c.textContent)).toEqual(["1Your money", "2Your watchlist", "3The market", "4Results and news", "5Tools"]);
    expect(bar.querySelectorAll(".stb-arrow")).toHaveLength(4);
    expect(chips[0].getAttribute("aria-current")).toBe("step");
    expect(screen.queryByRole("tab")).toBeNull();
  });
  it("\"All sections\" lists every card, grouped by step, and closes on Escape", () => {
    wrap(<StepsBar steps={steps} />);
    fireEvent.click(screen.getByRole("button", { name: /All sections/ }));
    const pop = screen.getByRole("dialog", { name: "All sections" });
    expect([...pop.querySelectorAll("h5")].map((h) => h.textContent)).toEqual(["1 · Your money", "2 · Your watchlist", "3 · The market", "4 · Results and news", "5 · Tools"]);
    expect(within(pop).getAllByRole("button").map((b) => b.textContent)).toEqual(["Your investments today", "What your stocks say", "Your shares at a glance", "Your mutual funds at a glance", "Your ETFs",
      "Watchlist movers", "Worth a second look", "Watchlist by band", "Market today", "Global markets", "What it adds up to", "Market snapshot", "Sectors today", "FII / DII flows", "Index heatmap",
      "Results today", "Filings and news", "Latest quarter results", "IPOs", "Alerts and saved screens", "Stress Lab", "DCF calculator", "Term of the day"]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("underlines the step whose heading has passed under the bar", () => {
    const tops = [{ id: "a", top: -900 }, { id: "b", top: 90 }, { id: "c", top: 600 }];
    expect(stepInView(tops, 140)).toBe("b"); expect(stepInView(tops, 60)).toBe("a"); expect(stepInView([], 100)).toBeNull();
  });
  it("hides a step whose cards are all switched off", () => {
    const ids = stepGroups(normaliseLayout(null).filter((w) => w.on && !["movers", "second", "buckets"].includes(w.id))).map((g) => g.step.title);
    expect(ids).toEqual(["Your money", "The market", "Results and news", "Tools"]);
  });
  it("draws a step heading with its circle, title and one-line description", () => {
    wrap(<StepHeading id="s1" n={1} title={DASH_STEPS[0].title} line={DASH_STEPS[0].line} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Step 1: Your money");
    expect(screen.getByText("What you hold, how it did on the last trading day, and what it says.")).toBeTruthy();
  });
});

describe("What your stocks say: callout cards with a dropdown", () => {
  const many = Array.from({ length: 11 }, (_, i) => ({ symbol: "S" + i, label: "S" + i, note: `−${i + 1}.0%` }));
  const sig = (o: Partial<Signal>): Signal => ({ kind: "good", title: "Profit grew at 15 of 17", line: "of your shares that have reported the September quarter, against a year ago.", meter: [{ n: 15, word: "grew", tone: "up" }, { n: 2, word: "fell", tone: "down" }], more: "See the 2 that fell", groups: [{ label: "Profit fell, against a year ago · 2", tone: "down", chips: many.slice(0, 2) }], ...o });
  const two = [sig({}), sig({ kind: "insight", title: "7 lead their peers, 4 lag", line: "Price strength.", more: "See the names", groups: [{ label: "Lead · 11", tone: "up", chips: many }, { label: "Lag · 1", tone: "down", chips: many.slice(0, 1) }], note: "4 are not ranked." })];
  it("shows the kind, the headline, one line and the count bar; the names stay in the closed dropdown", () => {
    wrap(<SignalCards id="say" title="What your stocks say" sub="x" signals={two} loading={false} />);
    const cards = document.querySelectorAll(".cl");
    expect(cards).toHaveLength(2);
    expect(cards[0].className).toContain("cl-good"); expect(cards[1].className).toContain("cl-insight");
    expect(cards[0].querySelector(".cl-k")!.textContent).toBe("Good sign");
    expect(cards[0].querySelector("h3")!.textContent).toBe("Profit grew at 15 of 17");
    expect(cards[0].querySelector(".cl-meter")!.getAttribute("aria-label")).toBe("15 grew, 2 fell");
    expect(cards[0].querySelector(".cl-body")!.hasAttribute("hidden")).toBe(true);
    expect(cards[0].textContent).not.toMatch(/S0, S1/);   // no paragraph that lists every symbol
  });
  it("opens a dropdown to grouped, coloured chips with their figures; at most 8 a group, then +N more", () => {
    wrap(<SignalCards id="say" title="What your stocks say" sub="x" signals={two} loading={false} />);
    fireEvent.click(screen.getByRole("button", { name: /See the names/ }));
    const lead = document.querySelectorAll(".cl-g.up")[0];
    expect(lead.querySelectorAll(".cl-chip")).toHaveLength(CHIP_LIMIT);
    expect(within(lead as HTMLElement).getByRole("button", { name: "+3 more" })).toBeTruthy();
    expect(lead.querySelector(".cl-chip")!.textContent).toBe("S0−1.0%");
    expect(document.querySelectorAll(".cl")[1].querySelector(".cl-g.down .cl-gl")!.textContent).toBe("Lag · 1");
    fireEvent.click(within(lead as HTMLElement).getByRole("button", { name: "+3 more" }));
    expect(document.querySelectorAll(".cl-g.up")[0].querySelectorAll(".cl-chip")).toHaveLength(11);
  });
  it("Open all / Close all opens and closes every card's dropdown", () => {
    wrap(<SignalCards id="say" title="What your stocks say" sub="x" signals={two} loading={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Open all" }));
    expect([...document.querySelectorAll(".cl-body")].every((b) => !b.hasAttribute("hidden"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Close all" }));
    expect([...document.querySelectorAll(".cl-body")].every((b) => b.hasAttribute("hidden"))).toBe(true);
  });
  it("names an empty set plainly and has no Open all for one card", () => {
    wrap(<SignalCards id="say" title="What your stocks say" sub="x" signals={[]} loading={false} />);
    expect(screen.getByText(/No signal stands out yet/)).toBeTruthy();
    cleanup();
    wrap(<SignalCards id="say" title="What your stocks say" sub="x" signals={[]} loading={false} empty="Follow stocks first." />);
    expect(screen.getByText("Follow stocks first.")).toBeTruthy();
    cleanup();
    wrap(<><Callout id={cardIds("one", 1)[0]} kind="watch" title="One" /><CalloutOpenAll scope="one" n={1} /></>);
    expect(screen.queryByRole("button", { name: "Open all" })).toBeNull();
  });
});

describe("score rings (the Prism ring) in the site bands", () => {
  it("names the bands: Strong 80+, Healthy 65–79, Average 50–64, Weak 35–49, Poor below 35", () => {
    expect([80, 79, 65, 64, 50, 49, 35, 34, null].map((v) => bandWord(v).word)).toEqual(["Strong", "Healthy", "Healthy", "Average", "Average", "Weak", "Weak", "Poor", "No score"]);
    expect([69, 42, 29].map((v) => bandWord(v).band)).toEqual(["hi", "lo", "lo"]);   // 69 is green, as on the ring
  });
  it("draws one arc per part, ticks and a disc, and 65 / 100 HEALTHY inside", () => {
    const { container } = render(<ScoreRing parts={[{ key: "growth", value: 80 }, { key: "valuation", value: 42 }, { key: "quality", value: 69 }, { key: "risk", value: 69 }]} score={65} />);
    expect(container.querySelectorAll(".srg-fill")).toHaveLength(4);
    expect(container.querySelectorAll(".srg-tk")).toHaveLength(60);
    expect(container.querySelector(".srg-disc")).toBeTruthy();
    expect([...container.querySelectorAll("text")].map((t) => t.textContent)).toEqual(["65", "/ 100", "HEALTHY"]);
    const colours = [...container.querySelectorAll(".srg-fill")].map((p) => (p.parentElement as HTMLElement).style.getPropertyValue("--pc"));
    expect(colours).toEqual(["var(--band-hi)", "var(--band-lo)", "var(--band-hi)", "var(--band-hi)"]);
  });
  it("one fund: one arc filled to its score, 29 / 100 POOR; no ETFs: an empty ring, — NONE YET", () => {
    const one = render(<ScoreRing parts={[{ key: "f1", value: 29 }]} score={29} word="Poor" />).container;
    expect(one.querySelectorAll(".srg-fill")).toHaveLength(1);
    expect([...one.querySelectorAll("text")].map((t) => t.textContent)).toEqual(["29", "/ 100", "POOR"]);
    cleanup();
    const none = render(<ScoreRing parts={[]} score={null} />).container;
    expect(none.querySelectorAll(".srg-fill")).toHaveLength(0);
    expect([...none.querySelectorAll("text")].map((t) => t.textContent)).toEqual(["—", "NONE YET"]);
    cleanup();
    expect([...render(<ScoreRing parts={[]} score={null} size={56} />).container.querySelectorAll("text")].map((t) => t.textContent)).toEqual(["—"]);   // the strip's small ring
  });
  it("counts the shares' score bands and colours the part bars in the same bands", () => {
    expect([69, 65, 64, 50, 49, null].map(colourOf)).toEqual(["g", "g", "o", "o", "r", "n"]);
    const rows = [{ symbol: "A", prism_final: 67, prism_fundamental: 80, prism_valuation: 42, prism_quality: 69, prism_risk: 69 }, { symbol: "B", prism_final: 40 }] as unknown as Row[];
    const g = glance(["A", "B"], rows);
    expect(g.colours).toEqual({ g: 1, o: 0, r: 1, n: 0 });   // 67 is Healthy: green, not "average"
    expect(g.parts.map((p) => p.key)).toEqual(["growth", "valuation", "quality", "risk"]);
  });
});

describe("layout rules in the stylesheets", () => {
  const css = (f: string) => readFileSync(join(process.cwd(), "src/styles", f), "utf8");
  it("puts each Watchlist by band count right after its label (bug 1), in every copy of the rule", () => {
    const acc = css("account.css");
    expect(acc).not.toMatch(/\.bandk b \{[^}]*margin-left:\s*auto/);
    expect(acc.match(/\.bandk b \{/g)?.length).toBe(2);
  });
  it("has a 12-column grid with full, half, third and quarter widths; tools 2 by 2 on a tablet and 1 on a phone", () => {
    const d = css("dashboard.css");
    expect(d).toMatch(/\.dsh-grid \{ display: grid; grid-template-columns: repeat\(12, minmax\(0, 1fr\)\)/);
    expect(d).toMatch(/\.dsh-cell\.full \{ grid-column: span 12; \} \.dsh-cell\.third \{ grid-column: span 4; \} \.dsh-cell\.quarter \{ grid-column: span 3; \}/);
    expect(d).toMatch(/max-width: 1100px\) \{ \.dsh-cell\.third, \.dsh-cell\.quarter \{ grid-column: span 6; \} \}/);
    expect(d).toMatch(/max-width: 899px\) \{ \.dsh-cell, \.dsh-cell\.third, \.dsh-cell\.half, \.dsh-cell\.quarter \{ grid-column: span 12; \}/);   // tools: 1 on a phone
    expect(d).not.toMatch(/\.dsh-tabs/);
  });
  it("keeps the market read at 18px, card titles in the H2 role (task #310: serif 24px/500), and 24px between the investments columns", () => {
    const d = css("dashboard.css");
    expect(d).toMatch(/\.dsh-mr-lead \{ font: 400 var\(--fs-18\)/); expect(d).toMatch(/\.dsh-rd-v \{ font: 600 var\(--fs-18\)/);
    expect(d).toMatch(/\.dsh \.dsh-card h2 \{ font: var\(--ui-fw-medium\) var\(--ui-fs-h2\)/);
    expect(d).toMatch(/column-gap: 24px/); expect(d).toMatch(/span:nth-child\(6\) \{ padding-left: 12px; \}/);
  });
});
