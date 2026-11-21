// @vitest-environment jsdom
// Task #290 (the team, 21 Nov 2026: "in this first image shows current ans format but i want all ans to be presented in a specific format which can be
// seen in second image"): numbered sections, each a heading over short points; a point's source in brackets is drawn small after it.
import { cleanup, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AnswerText, sectionsOf } from "./AnswerText";

afterEach(cleanup);
const ICICI = [
  "ICICI Bank grew profit and deposits in the September 2026 quarter while its margin narrowed.",
  "1. Business growth",
  "- Net profit rose 20.1% year on year to ₹14,843 crore [results filing, 17 Oct 2026, p.26]",
  "- Total deposits grew 27.1% year on year, 17.0% excluding FCNR(B) [presentation, 17 Oct 2026, p.6]",
  "2. Asset quality",
  "- Gross NPA fell to 1.20% from 1.58% a year earlier [presentation, 17 Oct 2026, p.18]",
  "- Net NPA was 0.30% [presentation, 17 Oct 2026, p.18]",
  "3. Margin and deposit costs",
  "- Net interest margin fell to 4.18% from 4.36% in Q1 [results filing, 17 Oct 2026, p.27]",
  "4. Share price and valuation",
  "- Share at ₹1,641, up 18.7% in one month and 18.7% in a year [FinLit company page, 20 Nov 2026]",
  "**Stance: Mixed (positive on growth and asset quality, negative on margins).**",
  "Profit, deposits and asset quality improved, while the margin narrowed.",
].join("\n");

describe("task #290: answers in numbered sections", () => {
  it("draws the direct line, then one block per section with its heading over its points", () => {
    const { container } = render(<AnswerText text={ICICI} />);
    expect(container.querySelector(".aif-a-lead")!.textContent).toBe("ICICI Bank grew profit and deposits in the September 2026 quarter while its margin narrowed.");
    const secs = [...container.querySelectorAll(".aif-a-sec")];
    expect(secs.map((s) => s.querySelector(".aif-a-h")!.textContent)).toEqual(["1. Business growth", "2. Asset quality", "3. Margin and deposit costs", "4. Share price and valuation"]);
    expect(secs.map((s) => s.querySelectorAll("li").length)).toEqual([2, 2, 1, 1]);
    const first = secs[0].querySelector("li")!;
    expect(first.textContent).toBe("Net profit rose 20.1% year on year to ₹14,843 crore results filing, 17 Oct 2026, p.26");
    expect(first.querySelector(".aif-a-cite")!.textContent).toBe(" results filing, 17 Oct 2026, p.26");          // the source, small, without its brackets
    expect([...first.querySelectorAll(".aif-a-n")].map((b) => b.textContent)).toEqual(["20.1%", "₹14,843 crore"]);   // figures still bold
    expect(secs[0].querySelectorAll("li")[1].textContent).toMatch(/excluding FCNR\(B\)/);                             // brackets inside a point stay
    expect(container.querySelector(".aif-a-st")!.textContent).toMatch(/Stance: Mixed.*Profit, deposits and asset quality improved/);   // task #270 kept
  });
  it("an answer without numbered headings is drawn as before, and one heading alone is not a section list", () => {
    const { container } = render(<AnswerText text={"Net profit rose 20.1% [results filing, 17 Oct 2026]\nDeposits grew 27.1%"} />);
    expect(container.querySelector(".aif-a-sec")).toBeNull();
    expect(container.querySelectorAll(".aif-a-pts li")).toHaveLength(2);
    expect(within(container.querySelector(".aif-a-pts li")!).getByText(/results filing/).className).toBe("aif-a-cite");
    expect(sectionsOf(["1. Only one", "- a point"])).toBeNull();
    expect(sectionsOf(["**1. Growth**", "- a", "## 2. Quality", "- b"])!.sections.map((s) => s.title)).toEqual(["Growth", "Quality"]);
    expect(sectionsOf(["- 1. a point that starts with a number", "- 2. another"])).toBeNull();     // numbered points are not headings
  });
});
