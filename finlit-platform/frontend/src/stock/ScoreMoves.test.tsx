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
  it("draws a dot for every recorded value on every line, and a tick for every recorded day", () => {
    const { container } = open();
    const panels = container.querySelectorAll(".scm-panel");
    expect(panels).toHaveLength(2);
    expect(panels[0].querySelectorAll(".scm-dot")).toHaveLength(3 * 4);          // four business scores x three rating days
    expect(panels[1].querySelectorAll(".scm-dot")).toHaveLength(6 * 2);          // two technical views x six days
    expect(panels[0].querySelectorAll(".scm-rug")).toHaveLength(6); expect(panels[1].querySelectorAll(".scm-rug")).toHaveLength(6);
    expect(panels[1].querySelector(".scm-dot title")?.textContent).toMatch(/view \+?\d+(\.\d)? on \d+ \w+ 2026/);
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
