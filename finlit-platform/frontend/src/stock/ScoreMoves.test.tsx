// @vitest-environment jsdom
// "How the scores have moved": every recorded day is a dot on its line and a tick under the chart; the arrow keys read each day; a day between two ratings shows the rating in force.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/premium", () => ({ useGold: () => true }));
vi.mock("../components/ChartZoom", () => ({ ChartZoom: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
import { ScoreMoves } from "./ScoreMoves";
import type { HistPoint } from "../lib/prismHistory";

afterEach(cleanup);
const day = (n: number) => new Date(Date.UTC(2026, 10, 1) + n * 86_400_000).toISOString().slice(0, 10);
const none = { fundamental: null, valuation: null, quality: null, risk: null };
// six days; the four business scores are recorded on the first, the fourth and the last day only (re-ratings), the technical views every day
const pts: HistPoint[] = Array.from({ length: 6 }, (_, i) => ({ day: day(i), modelVersion: "1", final: 60, label: "HEALTHY", status: "RATED",
  parts: [0, 3, 5].includes(i) ? { fundamental: 76 - i * 2, valuation: 83, quality: 100, risk: 82 } : none, shortTerm: 10 + i * 6, longTerm: 18 + i }));
const open = () => render(<ScoreMoves points={pts} />);

describe("ScoreMoves chart", () => {
  it("draws a dot on every recorded day of every line (a rating in force shows as a hollow dot), and a tick for every recorded day", () => {
    const { container } = open();
    const panels = container.querySelectorAll(".scm-panel");
    expect(panels).toHaveLength(2);
    expect(panels[0].querySelectorAll(".scm-dot")).toHaveLength(6 * 4);          // four business scores x all six days
    expect(panels[0].querySelectorAll(".scm-dot.carried")).toHaveLength(3 * 4);  // three of those days have no new rating: hollow, the rating still in force
    expect(panels[0].querySelectorAll(".scm-dot:not(.carried)")).toHaveLength(3 * 4);
    expect(panels[1].querySelectorAll(".scm-dot")).toHaveLength(6 * 2);          // two technical views x six days
    expect(panels[0].querySelectorAll(".scm-rug")).toHaveLength(6); expect(panels[1].querySelectorAll(".scm-rug")).toHaveLength(6);
    expect(panels[1].querySelector(".scm-dot title")?.textContent).toMatch(/view \+?\d+(\.\d)? on \d+ \w+ 2026/);
  });
  it("a hollow dot says which rating it shows, and a period that starts after a rating still shows it", () => {
    const { container } = open();
    const titles = [...container.querySelectorAll(".scm-panel")[0].querySelectorAll(".scm-dot.carried title")].map((t) => t.textContent ?? "");
    expect(titles[0]).toMatch(/on 2 Nov 2026, the rating from 1 Nov 2026 still in force/);
    expect(container.querySelector(".scm-lg")?.textContent).toMatch(/Solid dot: new rating that day.*Hollow dot: earlier rating still holds/);
  });
  it("labels every day under a short chart", () => {
    const { container } = open();
    expect(container.querySelectorAll(".scm-panel")[0].querySelectorAll("text.scm-ax:not([text-anchor='end'])").length).toBeGreaterThan(0);
    const labels = [...container.querySelectorAll(".scm-panel")[1].querySelectorAll("svg > text.scm-ax")].map((t) => t.textContent).filter((t) => /^\d+ \w+$/.test(t ?? ""));
    expect(labels).toHaveLength(6);
  });
  it("the chart can be read with the arrow keys: a day between two ratings shows the rating in force and when it was made", () => {
    const { container } = open();
    const svg = container.querySelectorAll(".scm-panel svg")[0] as SVGSVGElement;
    expect(svg.getAttribute("tabindex")).toBe("0");
    fireEvent.focus(svg);                                                         // lands on the newest day
    expect(screen.getByRole("status").textContent).toContain("6 Nov 2026");
    fireEvent.keyDown(svg, { key: "Home" });
    fireEvent.keyDown(svg, { key: "ArrowRight" });                                // 2 Nov: no rating that day
    const tip = screen.getByRole("status").textContent ?? "";
    expect(tip).toContain("2 Nov 2026"); expect(tip).toContain("Valuation 83"); expect(tip).toContain("rated 1 Nov");
    expect(tip).not.toContain("–");
    fireEvent.blur(svg);
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("the technical tooltip never carries a figure forward: a day with no reading says so", () => {
    const gap: HistPoint[] = pts.map((p, i) => (i === 2 ? { ...p, shortTerm: null } : p));
    const { container } = render(<ScoreMoves points={gap} />);
    const svg = container.querySelectorAll(".scm-panel svg")[1] as SVGSVGElement;
    fireEvent.focus(svg); fireEvent.keyDown(svg, { key: "Home" }); fireEvent.keyDown(svg, { key: "ArrowRight" }); fireEvent.keyDown(svg, { key: "ArrowRight" });
    expect(screen.getByRole("status").textContent).toContain("Short-term view no figure yet");
  });
});

// task #126: the team's sample. One card per group with its tag, title and pattern line; the key shows the change in the period; business scores are steps,
// technical views a curve; Growth & Profitability and the long-term view are dashed and drawn on top; the re-rating days are labelled; every date is written.
const NOV = ["2026-11-05", "2026-11-06", "2026-11-07", "2026-11-09", "2026-11-10", "2026-11-12", "2026-11-13", "2026-11-14"];
const ST = [-3.6, -4.5, -6, 5.5, 11.5, 29, 33, 19.8], LT = [-63, -63, -63, -57, -49, -49, -49, -49.5];
const RATED: Record<string, HistPoint["parts"]> = { "2026-11-05": { fundamental: 97, valuation: 97.3, quality: 79, risk: 29 }, "2026-11-13": { fundamental: 97, valuation: 95, quality: 79, risk: 31.4 }, "2026-11-14": { fundamental: 76.2, valuation: 96.1, quality: 73, risk: 31.4 } };
const team: HistPoint[] = NOV.map((d, i) => ({ day: d, modelVersion: "1", final: 70, label: "HEALTHY", status: "RATED", parts: RATED[d] ?? none, shortTerm: ST[i], longTerm: LT[i] }));

describe("How the scores have moved, as in the team's sample (task #126)", () => {
  const grp = (c: HTMLElement, k: "biz" | "tech") => c.querySelector(`.scm-grp.scm-g-${k}`) as HTMLElement;
  it("1-3. two cards, Fundamental and Technical, each with its title and the line that says how it moves", () => {
    const { container } = render(<ScoreMoves points={team} />);
    const b = grp(container, "biz"), t = grp(container, "tech");
    expect(b.querySelector(".scm-tag")?.textContent).toBe("Fundamental"); expect(b.querySelector("h4")?.textContent).toBe("Business scores · 0 to 100");
    expect(b.querySelector(".scm-pat")?.textContent).toBe("Step pattern: flat lines that jump only when Prism re-rates the company.");
    expect(t.querySelector(".scm-tag")?.textContent).toBe("Technical"); expect(t.querySelector("h4")?.textContent).toBe("Technical views · −100 to +100");
    expect(t.querySelector(".scm-pat")?.textContent).toBe("Continuous pattern: moves every trading evening. Short term reads 5 to 20 sessions, long term 6 to 18 months.");
    expect(b.querySelectorAll(".scm-panel")).toHaveLength(1); expect(t.querySelectorAll(".scm-panel")).toHaveLength(1);   // each card holds its own chart
  });
  it("4. every key shows the latest figure and the change since the start of the period", () => {
    const { container } = render(<ScoreMoves points={team} />);
    const keys = [...container.querySelectorAll(".scm-key")].map((k) => k.textContent);
    expect(keys).toEqual(["Growth & Profitability 76.2 −20.8 since 5 Nov", "Valuation 96.1 −1.2 since 5 Nov", "Quality 73 −6 since 5 Nov", "Risk 31.4 +2.4 since 5 Nov",
      "Short-term view +19.8 +23.4 since 5 Nov", "Long-term view −49.5 +13.5 since 5 Nov"]);
  });
  it("4. a line with a single figure in the period says so instead of leaving the change blank", () => {
    const one = team.map((p, i) => ({ ...p, longTerm: i === 7 ? -49.5 : null }));
    const { container } = render(<ScoreMoves points={one} />);
    expect([...container.querySelectorAll(".scm-key")].pop()?.textContent).toBe("Long-term view −49.5 only one figure in this period");
  });
  it("5. business scores are steps (only flat and upright moves) and 11. technical views a smooth curve", () => {
    const { container } = render(<ScoreMoves points={team} />);
    for (const path of grp(container, "biz").querySelectorAll(".scm-line > path")) expect(path.getAttribute("d")).toMatch(/^M[\d.]+,[\d.]+([HV][\d.]+)+$/);
    for (const path of grp(container, "tech").querySelectorAll(".scm-line > path")) expect(path.getAttribute("d")).toMatch(/^M[\d.]+,[\d.]+(C[\d., -]+)+$/);
  });
  it("6-7. Growth & Profitability and the long-term view are dashed, drawn on top, and dashed in their keys", () => {
    const { container } = render(<ScoreMoves points={team} />);
    const order = [...grp(container, "biz").querySelectorAll(".scm-line")].map((g) => g.getAttribute("data-series"));
    expect(order[order.length - 1]).toBe("fundamental");                                // last, so Valuation at the same figure cannot hide it
    const dash = (s: string) => container.querySelector(`.scm-line[data-series=${s}] > path`)?.getAttribute("stroke-dasharray");
    expect(dash("fundamental")).toBe("6 4"); expect(dash("longTerm")).toBe("6 4"); expect(dash("valuation")).toBeNull(); expect(dash("shortTerm")).toBeNull();
    const sw = [...container.querySelectorAll(".scm-key i")].map((i) => (i as HTMLElement).style.background);
    expect(sw[0]).toMatch(/repeating-linear-gradient/); expect(sw[5]).toMatch(/repeating-linear-gradient/); expect(sw[1]).not.toMatch(/gradient/);
  });
  it("8. every re-rating day has its dotted line, its triangle and the word Re-rated, including one that follows days with no rating", () => {
    const { container } = render(<ScoreMoves points={team} />);
    const marks = grp(container, "biz").querySelectorAll(".scm-mark");
    expect([...marks].map((m) => m.querySelector("title")?.textContent)).toEqual(["Prism re-rated on 13 Nov 2026", "Prism re-rated on 14 Nov 2026"]);
    expect([...marks].map((m) => m.querySelector(".scm-mk")?.textContent)).toEqual(["Re-rated", "Re-rated"]);
    expect(grp(container, "tech").querySelectorAll(".scm-mark")).toHaveLength(0);      // the technical views are not re-rated: they move every evening
  });
  it("9. the business card says how to read the dots and the dotted line", () => {
    const { container } = render(<ScoreMoves points={team} />);
    expect([...grp(container, "biz").querySelectorAll(".scm-lg li")].map((l) => l.textContent)).toEqual(["Solid dot: new rating that day", "Hollow dot: earlier rating still holds", "Dotted line: re-rating event"]);
  });
  it("10. every recorded day has its date under both charts (8 days, 8 dates)", () => {
    const { container } = render(<ScoreMoves points={team} />);
    for (const k of ["biz", "tech"] as const) {
      const dates = [...grp(container, k).querySelectorAll("svg > text.scm-ax")].map((t) => t.textContent).filter((t) => /^\d+ \w+$/.test(t ?? ""));
      expect(dates).toEqual(["5 Nov", "6 Nov", "7 Nov", "9 Nov", "10 Nov", "12 Nov", "13 Nov", "14 Nov"]);
    }
  });
  it("Business only and Technical only show one card; a hidden line keeps its key so it can be shown again", () => {
    const { container, getByRole } = render(<ScoreMoves points={team} />);
    fireEvent.click(getByRole("button", { name: "Technical only" }));
    expect(container.querySelector(".scm-g-biz")).toBeNull(); expect(container.querySelector(".scm-g-tech")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Business only" }));
    expect(container.querySelector(".scm-g-tech")).toBeNull();
    for (const k of container.querySelectorAll(".scm-g-biz .scm-key")) fireEvent.click(k);
    expect(container.querySelector(".scm-g-biz .scm-panel")).toBeNull();
    expect(container.querySelector(".scm-g-biz .scm-empty")?.textContent).toBe("No line is selected here. Press a score above to draw it.");
    expect(container.querySelectorAll(".scm-g-biz .scm-key")).toHaveLength(4);
  });
  it("describes and never advises", () => {
    const { container } = render(<ScoreMoves points={team} />);
    expect(container.textContent).not.toMatch(/\b(buy|sell|hold|target|best)\b/i);
  });
});

describe("Re-rated words never overlap (task #126)", () => {
  it("on a long period with re-ratings on neighbouring days, the newest keeps its word and a close neighbour does not", () => {
    const days = Array.from({ length: 200 }, (_, i) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
    const rated = new Set([0, 60, 198, 199]);                                        // the last two re-ratings are a day apart
    const long: HistPoint[] = days.map((d, i) => ({ day: d, modelVersion: "1", final: 60, label: "HEALTHY", status: "RATED",
      parts: rated.has(i) ? { fundamental: 50 + i / 10, valuation: 60, quality: 70, risk: 40 } : none, shortTerm: 0, longTerm: 0 }));
    const { container, getByRole } = render(<ScoreMoves points={long} />);
    fireEvent.click(getByRole("button", { name: "1Y" }));
    const marks = [...container.querySelectorAll(".scm-g-biz .scm-mark")];
    expect(marks).toHaveLength(3);                                                   // 60, 198 and 199: three days a rating changed
    expect(marks.map((m) => !!m.querySelector(".scm-mk"))).toEqual([true, false, true]);
    const xs = [...container.querySelectorAll(".scm-g-biz .scm-mk")].map((t) => Number(t.getAttribute("x")));
    expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(64);
  });
});
