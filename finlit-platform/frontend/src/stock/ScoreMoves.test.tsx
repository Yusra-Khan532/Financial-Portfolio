// @vitest-environment jsdom
// "How the scores have moved" (task #216, company report handover README 2.3; the chart rules of tasks #126 and #160 that stay): under the Prism card;
// 1 week on load, 2 weeks and 1 month redraw both charts, the legend and the lead line; the lead line names the biggest move and what did not move; two
// charts (business 0 to 100 with a dashed line at 50, technical −100 to +100 with a dashed line at 0); a legend row per line with the latest value and the
// change over the window; hover / arrow keys show the date and every line's value; solid and hollow dots; a footnote with the recording start.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const hist = vi.hoisted(() => ({ points: [] as unknown[] }));
vi.mock("../lib/premium", () => ({ useGold: () => true }));
vi.mock("../components/ChartZoom", () => ({ ChartZoom: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("../lib/prismHistory", async (orig) => ({ ...(await orig<typeof import("../lib/prismHistory")>()), usePrismHistory: () => ({ data: { points: hist.points }, isLoading: false, isError: false }) }));
import { ScoreMoves, ScoreMovesCard } from "./ScoreMoves";
import type { HistPoint } from "../lib/prismHistory";
import { inRange, leadLine, windowMoves } from "../lib/scoreMoves";

afterEach(cleanup);
const day = (n: number) => new Date(Date.UTC(2026, 10, 1) + n * 86_400_000).toISOString().slice(0, 10);
const none = { fundamental: null, valuation: null, quality: null, risk: null };
// six days (1 to 6 Nov); the business scores are re-rated on the first, the fourth and the last day; the technical views are read every day
const pts: HistPoint[] = Array.from({ length: 6 }, (_, i) => ({ day: day(i), modelVersion: "1", final: 60, label: "HEALTHY", status: "RATED",
  parts: [0, 3, 5].includes(i) ? { fundamental: 76 - i * 2, valuation: 83, quality: 100, risk: 82 } : none, shortTerm: 10 + i * 6, longTerm: 18 + i }));
// 20 days (1 to 20 Nov): one week holds 14 to 20 Nov, two weeks 7 to 20 Nov, one month all of it; the long-term view moves most over the month
const long: HistPoint[] = Array.from({ length: 20 }, (_, i) => ({ day: day(i), modelVersion: "1", final: i < 10 ? 55 : 58.5, label: "AVERAGE", status: "RATED",
  parts: [0, 10, 19].includes(i) ? { fundamental: 58.1, valuation: i < 19 ? 38.9 : 36.2, quality: 78.9, risk: 85.6 } : none, shortTerm: 30 - (i % 3), longTerm: -60 + i }));
const open = (p = pts) => render(<ScoreMoves points={p} range="1m" />);

describe("the two charts (rules kept from tasks #126 and #160)", () => {
  it("draws a dot on every recorded day of every line; a day with no new rating shows the rating in force as a hollow dot", () => {
    const { container } = open();
    const panels = container.querySelectorAll(".scm-panel");
    expect(panels).toHaveLength(2);
    expect(panels[0].querySelectorAll(".scm-dot")).toHaveLength(6 * 5);
    expect(panels[0].querySelectorAll(".scm-dot.carried")).toHaveLength(3 * 4);
    expect(panels[1].querySelectorAll(".scm-dot")).toHaveLength(6 * 2);
    expect([...panels[0].querySelectorAll(".scm-dot.carried title")][0].textContent).toMatch(/on 2 Nov 2026, the rating from 1 Nov 2026 still in force/);
  });
  it("business scores are steps and the technical views a curve; dashed lines at 50 and at 0", () => {
    const { container } = open();
    const [biz, tech] = [...container.querySelectorAll(".scm-panel")];
    expect([...biz.querySelectorAll(".scm-line path")].every((p) => !/C/.test(p.getAttribute("d") ?? ""))).toBe(true);
    expect([...tech.querySelectorAll(".scm-line path")].some((p) => /C/.test(p.getAttribute("d") ?? ""))).toBe(true);
    expect(biz.querySelector("line.scm-mid")!.getAttribute("stroke-dasharray")).toBe("4 4");
    expect(tech.querySelector("line.scm-mid")!.getAttribute("stroke-dasharray")).toBe("4 4");
    expect(container.querySelectorAll(".scm-mark")).toHaveLength(0);   // the pack's charts carry no re-rating marks: the solid and hollow dots say it
  });
  it("hover or the arrow keys show the date and every line's value that day; a business score between ratings says when it was rated", () => {
    const { container } = open();
    const svg = container.querySelectorAll(".scm-panel svg")[0] as SVGSVGElement;
    fireEvent.focus(svg);
    expect(screen.getByRole("status").textContent).toContain("6 Nov 2026");
    fireEvent.keyDown(svg, { key: "Home" }); fireEvent.keyDown(svg, { key: "ArrowRight" });
    const tip = screen.getByRole("status").textContent ?? "";
    expect(tip).toContain("2 Nov 2026"); expect(tip).toContain("Valuation 83"); expect(tip).toContain("rated 1 Nov");
    for (const n of ["Growth & Profitability", "Quality", "Risk"]) expect(tip).toContain(n);
    fireEvent.blur(svg);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("README 2.3: range, lead line, legend", () => {
  it("1 week is selected on load; each button redraws both charts, the legend and the lead line", () => {
    hist.points = long;
    const { container } = render(<ScoreMovesCard symbol="X" statement="consolidated" />);
    const btn = (n: string) => screen.getByRole("button", { name: n });
    expect(btn("1 week").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll(".scm-panel")[1].querySelectorAll(".scm-rug")).toHaveLength(7);   // 14 to 20 Nov
    const lead1 = container.querySelector(".scm-lead")!.textContent, legend1 = container.querySelector(".scm-lgd")!.textContent;
    expect(container.querySelector(".scm-dl")!.textContent).toBe("14 Nov to 20 Nov 2026 · As of 20 Nov 2026");
    fireEvent.click(btn("2 weeks"));
    expect(container.querySelectorAll(".scm-panel")[1].querySelectorAll(".scm-rug")).toHaveLength(14);
    fireEvent.click(btn("1 month"));
    expect(btn("1 month").getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelectorAll(".scm-panel")[1].querySelectorAll(".scm-rug")).toHaveLength(20);
    expect(container.querySelector(".scm-lead")!.textContent).not.toBe(lead1);
    expect(container.querySelector(".scm-lgd")!.textContent).not.toBe(legend1);
    expect(container.querySelector(".scm-dl")!.textContent).toBe("22 Oct to 20 Nov 2026 · As of 20 Nov 2026 · recording began 1 Nov 2026");
  });
  it("the lead line names the biggest move with its from and to, and lists what did not move", () => {
    const m = windowMoves(long, inRange(long, "1m").points);
    expect(leadLine(m)).toEqual({ biggest: "the Long-term view rose 19 pts, from −60 to −41.", unchanged: "Growth & Profitability, Quality, Risk." });
    expect(leadLine([])).toEqual({ biggest: null, unchanged: null });
  });
  it("a legend row per line: name, latest value, change over the window (▲ green, ▼ red, 0 grey)", () => {
    hist.points = long;
    const { container } = render(<ScoreMovesCard symbol="X" statement="consolidated" />);
    fireEvent.click(screen.getByRole("button", { name: "1 month" }));
    const rows = [...container.querySelectorAll(".scm-lgd li")].map((li) => li.textContent);
    expect(rows).toEqual(["Cumulative fundamental score58.5▲ 3.5", "Growth & Profitability58.10", "Valuation36.2▼ 2.7", "Quality78.90", "Risk85.60", "Short-term view+29▼ 1", "Long-term view−41▲ 19"]);
    expect(container.querySelector(".scm-lgd em.up")).toBeTruthy(); expect(container.querySelector(".scm-lgd em.down")).toBeTruthy(); expect(container.querySelector(".scm-lgd em.zero")).toBeTruthy();
  });
  it("the header, the eyebrow and the footnote with the dot key and the recording start; no Daily/Weekly, no 1M/3M/6M/1Y, no summary sentence", () => {
    hist.points = long;
    const { container } = render(<ScoreMovesCard symbol="X" statement="consolidated" />);
    expect(container.querySelector(".scm-eb")!.textContent).toBe("FinLit Prism · score history");
    expect(container.querySelector("h3")!.textContent).toBe("How the scores have moved");
    expect(container.querySelector(".scm-foot")!.textContent).toMatch(/new rating that day.*earlier rating still holds · Valuation: higher means cheaper · Risk: higher means lower risk · Recording began 1 Nov 2026/);
    for (const gone of ["Daily", "Weekly", "1M", "3M", "6M", "1Y", "Business only"]) expect(screen.queryByRole("button", { name: gone })).toBeNull();
    expect(container.textContent).not.toMatch(/Over the last \d/);
  });
  it("the two charts sit side by side and stack under 900 px; the card sits under the Prism card", () => {
    const css = readFileSync(join(__dirname, "../styles/scoremoves.css"), "utf8");
    expect(css).toMatch(/\.scm216 \.scm-two \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
    expect(css).toMatch(/@media \(max-width: 899px\) \{ \.scm216 \.scm-two \{ grid-template-columns: minmax\(0, 1fr\); \} \}/);
    const hero = readFileSync(join(__dirname, "Hero.tsx"), "utf8");
    expect(hero.indexOf("<PrismCompare")).toBeLessThan(hero.indexOf("<ScoreMovesCard"));
  });
  it("describes and never advises", () => {
    hist.points = long;
    const { container } = render(<ScoreMovesCard symbol="X" statement="consolidated" />);
    expect((container.textContent ?? "").toLowerCase()).not.toMatch(/\b(buy|sell|hold|accumulate|target|avoid)\b/);
  });
});
