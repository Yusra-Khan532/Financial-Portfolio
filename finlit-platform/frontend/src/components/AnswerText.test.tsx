// @vitest-environment jsdom
// Task #201: FinLit AI answers read as short points with the important figures in bold, the source and the disclaimer apart, and a small chart for a series.
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnswerText, seriesOf } from "./AnswerText";

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
  it("keeps the answer's own **bold** and • bullets, and never reads text as HTML", () => {
    const { container } = render(<AnswerText text={"• **Parag Parikh Flexi Cap Fund**: <b>x</b> 6.67%\n• second"} />);
    expect(container.querySelectorAll(".aif-a-pts > li")).toHaveLength(2);
    expect(container.querySelector("li b")!.textContent).toBe("Parag Parikh Flexi Cap Fund");
    expect(container.querySelector("li")!.textContent).toContain("<b>x</b>");
  });
});
