// @vitest-environment jsdom
// Task #220 round B (FinLit Prism report handover, 18 Nov 2026): removals (README 0, 3.1, 3.6), the shared parts (1.1 to 1.6) and the top of the page
// (2.1, 2.2). The figures and screenshots that need a browser are in the pull request; these tests pin the words and the structure.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import wording from "../../lib/technicalWording.json";
import { PAGE_FAQS as FAQS } from "../../content/pageFaqs";
import { nearRightEdge, TIP_ROOM } from "../../stock/PrismCardView";
import { PRISM_DISCLAIMER, PZ_SECTIONS, PzHead, PzProp, TopDisclaimer } from "./pzr/Shell";

afterEach(cleanup);
const src = (f: string) => readFileSync(join(__dirname, "../..", f), "utf8");

describe("removals (README 0, 3.1, 3.6)", () => {
  it("no PDF or download wording on the report page, its FAQ, the menu or the tools list", () => {
    for (const f of ["pages/Prism.tsx", "components/prism/ReportView.tsx", "components/prism/pzr/Landing.tsx", "lib/nav.ts", "lib/platformTools.ts"]) {
      const code = src(f).replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(code, f).not.toMatch(/\bPDF\b|Download report/);
    }
    const prism = FAQS.find((f) => f.id === "finlit-prism")!;
    expect(JSON.stringify(prism)).not.toMatch(/pdf|download/i);
    expect(prism.items).toHaveLength(8);
    expect(prism.items[0].a.endsWith(", and the inputs that are missing.")).toBe(true);
  });
  it("the trend alignment tip has no band cut-offs: its text (and so its aria-label) is the pack's sentence", () => {
    expect(wording.alignment.rule).toBe("Each score falls in a band: up, sideways or down.");
    expect(src("stock/PrismCardView.tsx")).toContain("<InfoTip text={al.rule} />");
    expect(src("stock/PrismCardView.tsx")).toMatch(/role="img" aria-label=\{text\}/);
  });
  it("the three copies of the wording file stay identical (page, research API, site backend)", () => {
    const a = readFileSync(join(__dirname, "../../lib/technicalWording.json"));
    expect(readFileSync(join(__dirname, "../../../../backend/finlit/technical_wording.json")).equals(a)).toBe(true);
    expect(readFileSync(join(__dirname, "../../../../site-api/backend/technical_wording.json")).equals(a)).toBe(true);
  });
});

describe("shared parts (README 1.1, 1.2, 1.4, 1.5, 1.6)", () => {
  it("numbered headings: number, rule, title, description; colours as the table", () => {
    render(<PzHead no="03" id="h3" title="Financial history" desc="From the company's filings." />);
    const h = document.querySelector(".pzh")!;
    expect(h.querySelector(".pzh-n")!.textContent).toBe("03"); expect(h.querySelector(".pzh-rule")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("Financial history");
    expect((h as HTMLElement).style.getPropertyValue("--sc")).toBe("var(--gain)");
    expect(PZ_SECTIONS.map((s) => [s.no, s.color])).toEqual([["01", "var(--p-growth)"], ["02", "#2a78d6"], ["03", "var(--gain)"], ["04", "var(--p-quality)"], ["05", "var(--muted)"]]);
    const css = src("styles/prism220.css");
    expect(css).toMatch(/\.pzh-n \{[^}]*var\(--fs-40, 40px\)/); expect(css).toMatch(/\.pzh-t h3 \{[^}]*var\(--fs-24, 24px\)/); expect(css).toMatch(/\.pzh-t p \{[^}]*var\(--fs-13, 13px\)/);
    expect(css).toMatch(/@media \(max-width: 700px\) \{ \.pzh-n \{ font-size: var\(--fs-32, 32px\); \} \.pzh-t h3 \{ font-size: var\(--fs-20, 20px\); \} \}/);
  });
  it("the sections bar has seven items and its FAQ inside the report's container", () => {
    const shell = src("components/prism/pzr/Shell.tsx");
    expect(shell).toContain('const ITEMS = [{ id: "prism", no: "", nav: "Score" }, ...PZ_SECTIONS, { id: "faq", no: "", nav: "Questions" }];');
    expect(shell).not.toMatch(/\.scrollIntoView\(/);
    const page = src("pages/Prism.tsx");
    expect(page.indexOf("<PrismSecNav")).toBeLessThan(page.indexOf("<PageFaqs inline />"));
    expect(src("components/PageFaqs.tsx")).toMatch(/\/\^\\\/prism\\\/\[\^\/\]\+\/\.test\(pathname\)/);
  });
  it("proprietary note in 01 with the exact text; the disclaimer ends with the proprietary sentence", () => {
    render(<PzProp lead="These are some of the parameters FinLit Prism is based on.">The full set of parameters, how each is read, their weights and how the model combines them are proprietary to FinLit Ventures.</PzProp>);
    expect(screen.getByRole("note").textContent).toBe("These are some of the parameters FinLit Prism is based on. The full set of parameters, how each is read, their weights and how the model combines them are proprietary to FinLit Ventures.");
    expect(src("components/prism/pzr/Factors.tsx")).toContain('<PzProp lead="These are some of the parameters FinLit Prism is based on.">The full set of parameters, how each is read, their weights and how the model combines them are proprietary to FinLit Ventures.</PzProp>');
    expect(PRISM_DISCLAIMER.endsWith("The FinLit Prism model, its parameters and how it combines them are proprietary to FinLit Ventures.")).toBe(true);
  });
  it("an i near the right edge opens to the left (within 340 px)", () => {
    expect(TIP_ROOM).toBe(340);
    expect(nearRightEdge(1300, 1440)).toBe(true); expect(nearRightEdge(900, 1440)).toBe(false);
  });
  it("the sort menu is 13 px on desktop; phones keep 16 px", () => {
    expect(src("styles/prism220.css")).toMatch(/@media \(min-width: 701px\) \{ \.pzr-rep #factors \.pzr-tools select \{ font-size: var\(--fs-13, 13px\) !important; \} \}/);
  });
});

describe("top of the page (README 2.1, 2.2)", () => {
  it("the disclaimer drop-down is closed on load, opens by click, and reads the same as the footer", () => {
    const { container } = render(<TopDisclaimer />);
    const d = container.querySelector("details.pz-tdisc")!;
    expect(d.hasAttribute("open")).toBe(false);
    expect(d.querySelector("summary")!.textContent).toBe("DisclaimerInformation only, not investment advice. Please read before using this report.");
    fireEvent.click(d.querySelector("summary")!); d.setAttribute("open", "");
    expect(d.querySelector(".pz-tdisc-b p")!.textContent).toBe(PRISM_DISCLAIMER);
    expect(src("components/prism/ReportView.tsx")).toContain("<p>{PRISM_DISCLAIMER}</p>");
  });
  it("layout B from 1,000 px; the ring goes above the parts when the financial-health side is under 670 px", () => {
    const css = src("styles/prism220.css");
    expect(css).toMatch(/@media \(min-width: 1000px\) \{\s*\.pzr-cardtop \.pcx-body \{ display: grid;/);
    expect(css).toContain(".pzr-cardtop .pcx-sec.fund { container: pfund / inline-size; }");
    expect(css).toMatch(/@container pfund \(max-width: 670px\) \{\s*\.pzr-cardtop \.pcx-body \.pcx-fb \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
  it("\"review notes below\" links to 05 Notes", () => {
    expect(src("components/prism/ReportView.tsx")).toContain('<a className="pzc-link" href="#notes">review notes below</a>');
    expect(src("components/prism/pzr/Health.tsx")).toContain('<section className="pzr-sec pzs" id="notes"');
  });
});
