// @vitest-environment jsdom
// Task #201: FinLit AI answers read as short points with the important figures in bold, the source and the disclaimer apart, and a small chart for a series.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnswerText, seriesOf, stanceOf } from "./AnswerText";

afterEach(cleanup);
const ANSWER = ["RELIANCE's revenue, last 5 years: FY22 ₹7.22 L Cr, FY23 ₹8.93 L Cr, FY24 ₹9.14 L Cr, FY25 ₹9.80 L Cr, FY26 ₹10.76 L Cr.",
  "5-year CAGR 10.5%, operating margin 17.2% and P/E 24.3×.", "Source: FinLit, the company's consolidated statements.",
  "Describes the company's financial health from its filings and prices; not a recommendation.", "Information only, not investment advice."].join("\n");

describe("AnswerText (task #201)", () => {
  it("each line is a point; the source and the disclaimer sit apart under them", () => {
    const { container } = render(<AnswerText text={ANSWER} />);
    expect([...container.querySelectorAll(".aif-a-pts > li")]).toHaveLength(2);
    expect(container.querySelector(".aif-a-src")!.textContent).toMatch(/^Source: FinLit/);
    expect([...container.querySelectorAll(".aif-a-disc")].map((p) => p.textContent)).toEqual(["Describes the company's financial health from its filings and prices; not a recommendation.", "Information only, not investment advice."]);
  });
  it("figures with a unit are bold: money, percentages, multiples; plain years stay plain", () => {
    const { container } = render(<AnswerText text={ANSWER} />);
    const bold = [...container.querySelectorAll("b.aif-a-n")].map((b) => b.textContent);
    expect(bold).toEqual(expect.arrayContaining(["₹7.22 L Cr", "₹10.76 L Cr", "10.5%", "17.2%", "24.3×"]));
    expect(bold).not.toContain("5");
  });
  it("a line listing three or more periods in one unit gets a small bar chart with every value", () => {
    const { container } = render(<AnswerText text={ANSWER} />);
    const svg = container.querySelector("svg.aif-a-bars")!;
    expect(svg.getAttribute("aria-label")).toBe("FY22 7.22L Cr, FY23 8.93L Cr, FY24 9.14L Cr, FY25 9.80L Cr, FY26 10.76L Cr");   // as the answer wrote them
    expect(svg.querySelectorAll("rect")).toHaveLength(5);
    expect(seriesOf("Last quarters: Dec 2025 ₹2.69 L Cr, Mar 2026 ₹2.99 L Cr, Jun 2026 ₹3.12 L Cr")!.points.map((p) => p.label)).toEqual(["Dec 2025", "Mar 2026", "Jun 2026"]);
    const q = render(<AnswerText text={"Last quarters: Dec 2025 ₹2.69 L Cr, Mar 2026 ₹2.99 L Cr, Jun 2026 ₹3.12 L Cr"} />).container;
    expect([...q.querySelectorAll(".aif-a-l")].map((t) => t.textContent)).toEqual(["Dec ’25", "Mar ’26", "Jun ’26"]);   // short labels so eight quarters fit
    expect(seriesOf("FY24 ₹9.14 L Cr, FY25 12%, FY26 ₹10 Cr")).toBeNull();   // mixed units: no chart
    expect(seriesOf("FY25 ₹9.80 L Cr and FY26 ₹10.76 L Cr")).toBeNull();     // two points: no chart
  });
  it("labels every bar when the figures fit, and every other one (always the latest) on a narrow phone chart", () => {
    const q8 = "Quarters: Dec 2024 ₹2.44 L Cr, Mar 2025 ₹2.65 L Cr, Jun 2025 ₹2.49 L Cr, Sep 2025 ₹2.59 L Cr, Dec 2025 ₹2.69 L Cr, Mar 2026 ₹2.99 L Cr, Jun 2026 ₹3.12 L Cr, Sep 2026 ₹3.33 L Cr";
    const wide = render(<AnswerText text={q8} />).container;   // 440px wide before it is measured: all eight fit
    expect(wide.querySelectorAll(".aif-a-l")).toHaveLength(8);
    const RO = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class { constructor(private cb: () => void) {} observe() { this.cb(); } disconnect() {} unobserve() {} } as unknown as typeof ResizeObserver;
    const gbr = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () { return { width: 252, height: 64, top: 0, left: 0, right: 252, bottom: 64, x: 0, y: 0, toJSON() {} } as DOMRect; };
    try {
      const narrow = render(<AnswerText text={q8} />).container;
      expect([...narrow.querySelectorAll(".aif-a-l")].map((t) => t.textContent)).toEqual(["Mar ’25", "Sep ’25", "Mar ’26", "Sep ’26"]);
      expect([...narrow.querySelectorAll(".aif-a-l")].pop()!.getAttribute("text-anchor")).toBe("end");   // pinned inside the right edge
      expect(narrow.querySelectorAll("rect")).toHaveLength(8);   // every bar is still drawn
    } finally { globalThis.ResizeObserver = RO; Element.prototype.getBoundingClientRect = gbr; }
  });
  it("keeps the answer's own **bold** and • bullets, and never reads text as HTML", () => {
    const { container } = render(<AnswerText text={"• **Parag Parikh Flexi Cap Fund**: <b>x</b> 6.67%\n• second"} />);
    expect(container.querySelectorAll(".aif-a-pts > li")).toHaveLength(2);
    expect(container.querySelector("li b")!.textContent).toBe("Parag Parikh Flexi Cap Fund");
    expect(container.querySelector("li")!.textContent).toContain("<b>x</b>");
  });
});

describe("task #270: the two-line stance at the end of an answer", () => {
  const ANSWER = [
    "India's economy is still growing solidly, but inflation has picked up. Real GDP grew 7.82% in Q1 FY27 (NSO/MoSPI).",
    "CPI inflation rose to 6.09% in October 2026 (MoSPI, 31 Oct 2026), above the RBI's 6% upper limit.",
    "**Stance: Cautiously negative (negative on inflation, positive on growth).**",
    "Growth is holding up, but inflation above the RBI's band and higher rates weigh on spending and costs.",
    "Sources: FinLit India economy page (MoSPI, RBI)",
  ].join("\n");
  it("draws the stance and its summary as one box after the points, before the sources; they are not bullets", () => {
    const { container: c } = render(<AnswerText text={ANSWER} />);
    expect([...c.querySelectorAll(".aif-a-pts li")].map((li) => li.textContent)).toHaveLength(2);
    const box = c.querySelector(".aif-a-st")!;
    expect(box.className).toBe("aif-a-st cneg");
    expect(box.querySelector(".aif-a-st-h")!.textContent).toBe("Stance: Cautiously negative (negative on inflation, positive on growth)");
    expect(box.querySelector(".aif-a-st-s")!.textContent).toBe("Growth is holding up, but inflation above the RBI's band and higher rates weigh on spending and costs.");
    expect(box.compareDocumentPosition(c.querySelector(".aif-a-src")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("reads the stance however it is marked, and an answer without one is drawn as before", () => {
    expect(stanceOf(["- Stance: Mixed (strong growth, high valuation)", "One line."])).toEqual({ at: 0, word: "Mixed", why: "strong growth, high valuation", sum: "One line." });
    expect(stanceOf(["**Stance: Positive.**"])).toEqual({ at: 0, word: "Positive", why: "", sum: null });
    const { container: c } = render(<AnswerText text={"Reliance's P/E is 24.1x (15 Nov 2026).\nSources: FinLit"} />);
    expect(c.querySelector(".aif-a-st")).toBeNull();
    expect(c.querySelectorAll(".aif-a-pts li")).toHaveLength(1);
  });
});
