// @vitest-environment jsdom
// Task #189: the DCF calculator's sticky bar of eight section buttons, each with an (i); a click scrolls to the section without hiding anything (a closed
// group opens), the section on screen is marked, and result sections are greyed out with the reason until the inputs give a value.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./Info", () => ({ Info: ({ g }: { g: { label: string; what: string; note?: string } }) => <button type="button" className="info" aria-label={`What is ${g.label}?`} data-what={g.what} data-note={g.note ?? ""}>i</button> }));
import { SectionNav } from "./SectionNav";
import type { SectionItem } from "./SectionNav";

// The DCF calculator dropped its bar in task #302 (the redesign); the bar itself stays for the pages that use it, tested here with the same eight items.
function dcfNav(hasResult: boolean, hasErrors: boolean): SectionItem[] {
  const why = hasResult ? null : hasErrors ? "Fix the inputs marked in red to see this section." : "Shown once the inputs give a value.";
  const about = "A short explanation of this section, long enough to read as one.";
  return [["company", "Company Inputs"], ["cash", "Cash Flow & Growth"], ["rate", "Discount Rate & Risk"], ["balance", "Balance Sheet"], ["value", "DCF Valuation"],
    ["sens", "Sensitivity Analysis"], ["cases", "Bear / Base / Bull Scenarios"], ["save", "Save & Export"]].map(([id, label], k) => ({ id, label, about, off: k >= 4 ? why : null }));
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const NAMES = ["Company Inputs", "Cash Flow & Growth", "Discount Rate & Risk", "Balance Sheet", "DCF Valuation", "Sensitivity Analysis", "Bear / Base / Bull Scenarios", "Save & Export"];

describe("DCF section bar (task #189)", () => {
  it("has the eight buttons the task names, in page order, each with a short explanation", () => {
    const items = dcfNav(true, false);
    expect(items.map((n) => n.label)).toEqual(NAMES);
    for (const n of items) { expect(n.about.length).toBeGreaterThan(30); expect(n.off).toBeFalsy(); }
  });
  it("result sections say why they are not there yet", () => {
    const off = dcfNav(false, true).filter((n) => n.off).map((n) => n.id);
    expect(off).toEqual(["value", "sens", "cases", "save"]);
    expect(dcfNav(false, true)[4].off).toMatch(/Fix the inputs/);
    expect(dcfNav(false, false)[4].off).toMatch(/once the inputs give a value/);
  });
  it("every button has its (i); a click scrolls to its section and opens a closed group, never hiding anything", () => {
    const scroll = vi.fn(); window.scrollTo = scroll as never;
    render(<div className="dcf"><SectionNav scope=".dcf" items={dcfNav(false, false)} />
      <section data-snav="company">Company</section><details data-snav="cash"><summary>Cash</summary>body</details></div>);
    expect(screen.getAllByRole("button", { name: /^What is / }).length).toBe(8);
    const cash = document.querySelector("details") as HTMLDetailsElement;
    expect(cash.open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Cash Flow & Growth" }));
    expect(cash.open).toBe(true);
    expect(scroll).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cash Flow & Growth" }).getAttribute("aria-current")).toBe("true");
    expect(document.querySelector('[data-snav="company"]')).toBeTruthy();   // nothing removed
  });
  it("a section that is not there yet is greyed out and does nothing", () => {
    const scroll = vi.fn(); window.scrollTo = scroll as never;
    render(<div className="dcf"><SectionNav scope=".dcf" items={dcfNav(false, false)} /></div>);
    const b = screen.getByRole("button", { name: "Sensitivity Analysis" });
    expect(b.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(b);
    expect(scroll).not.toHaveBeenCalled();
  });
  it("the DCF page no longer has the bar (task #302); the bar's styles stay sticky under the header for the pages that keep it", () => {
    const page = readFileSync(join(process.cwd(), "src/pages/Dcf.tsx"), "utf8"), css = readFileSync(join(process.cwd(), "src/styles/section-nav.css"), "utf8");
    expect(page).not.toMatch(/SectionNav|data-snav/);
    expect(css).toMatch(/\.jumpbar \{ display: block; position: sticky; top: 64px;/);
    expect(css).toMatch(/\.jumpbar-i\.on \{ background: var\(--ui-on-bg\);/);   // task #310 part D: the ui-tab selected colour, not emerald
  });
});

describe("its class names are its own (task #189 hotfix: .snav and .secnav are the company report bar's)", () => {
  it("every selector in section-nav.css starts with .jumpbar, and no other file uses that prefix; the company report keeps .snav and .secnav for its own bar", () => {
    const css = readFileSync(join(process.cwd(), "src/styles/section-nav.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const sels = [...css.matchAll(/(^|[},]\s*)([^{}@]+)\{/g)].flatMap((m) => m[2].split(",").map((x) => x.trim())).filter((x) => x && !/^(from|to|\d+%)$/.test(x));
    expect(sels.length).toBeGreaterThan(10);
    for (const s of sels) expect(s, s).toMatch(/^\.jumpbar/);
    expect(css).not.toMatch(/\.snav\b|\.secnav\b/);
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : /\.(css|tsx)$/.test(n) && !/\.test\./.test(n) ? [p] : []; });
    const others = walk(join(process.cwd(), "src")).filter((f) => !/section-nav\.css$|SectionNav\.tsx$/.test(f) && readFileSync(f, "utf8").includes("jumpbar"));
    expect(others).toEqual([]);
  });
});
