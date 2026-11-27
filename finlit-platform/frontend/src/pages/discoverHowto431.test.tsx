// @vitest-environment jsdom
// Task #431 (team, 27 Nov 2026): "“What’s Inside & How to Use?” give this drop down at the start of discover page below the header", with the team's text
// (Themes, What Changed, Sectors, All Companies; what each card highlights; filters, sorting and watchlists), "use this content you can imrpovise on it".
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { HOWTO_WAYS, HowTo } from "./Discovery";
import { SOURCES } from "../discovery/model";

const src = readFileSync(join(process.cwd(), "src/pages/Discovery.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/discovery/discover.css"), "utf8");
afterEach(cleanup);

describe("task #431: What's inside & how to use, on Discover", () => {
  it("is a drop-down, closed at first, titled with the team's words; Show turns to Hide when it opens", () => {
    const { container } = render(<HowTo />);
    const d = container.querySelector("details.dsc-howto") as HTMLDetailsElement;
    expect(d).toBeTruthy();
    expect(d.open).toBe(false);
    expect(d.querySelector("summary b")!.textContent).toBe("What’s inside & how to use");
    expect(d.querySelector(".dsc-howto-s")!.textContent).toBe("Show");
    expect(d.querySelector(".dsc-howto-h")!.textContent).toBe("Hide");
    fireEvent.click(d.querySelector("summary")!);
    expect(d.open).toBe(true);
    expect(screen.getByRole("region")).toBeTruthy();
    expect(css).toMatch(/\.dsc-howto\[open\] \.dsc-howto-s \{ display: none; \}/);
  });

  it("sits at the start of the page, right below the header, before the figures line and the tabs", () => {
    const page = src.slice(src.indexOf("function Page()"));
    expect(page.indexOf("<Head />")).toBeGreaterThan(-1);
    expect(page.indexOf("<HowTo />")).toBe(page.indexOf("<Head />") + "<Head />\n    ".length);
    expect(page.indexOf("<HowTo />")).toBeLessThan(page.indexOf('className="dw-head"'));
  });

  it("names every tab by its real name, in the tab bar's order, each with its line", () => {
    const tabs = src.slice(src.indexOf("function Tabs()"), src.indexOf("function Body()"));
    const four = [...tabs.matchAll(/\["[a-z-]+", "([^"]+)",/g)].map((m) => m[1]);
    expect(four).toEqual(["Themes", "What changed", "Sectors", "All companies"]);
    expect(HOWTO_WAYS.map(([k]) => k)).toEqual([...four, SOURCES.calls.label]);
    const { container } = render(<HowTo />);
    const items = [...container.querySelectorAll(".dsc-howto-ways li")].map((li) => li.textContent);
    expect(items).toHaveLength(5);
    for (const [k, v] of HOWTO_WAYS) { expect(items).toContain(`${k}: ${v}`); expect(v.length).toBeGreaterThan(20); }
  });

  it("covers the team's points: what a card shows (count, moves over time, recent filings, leading names) and filters, sorting and watchlists", () => {
    const { container } = render(<HowTo />);
    const t = container.textContent!;
    for (const s of ["investor presentations", "earnings calls", "how many companies", "3 months and 1 year", "filings", "highest Prism reading",
      "filters", "sort", "watchlist", "Find a company in Discover"]) expect(t).toContain(s);
  });

  it("describes, never advises: no pick, opportunity or advice words, and it says it is not a recommendation", () => {
    const { container } = render(<HowTo />);
    const t = container.textContent!;
    expect(t).not.toMatch(/\b(buy|sell|hold|avoid|accumulate|target|best|top pick|multibagger|opportunit\w*|worth researching|identify)\b/i);
    expect(t).toContain("it is not a recommendation");
  });

  it("looks like the Mutual funds list's How to read this table: one card row, a short line, Show/Hide with a turning chevron, light and dark from the theme tokens", () => {
    const block = css.slice(css.lastIndexOf("/*", css.indexOf("Task #431")));
    expect(block).toMatch(/\.dsc-howto \{ margin: 0 0 16px; border: 1px solid var\(--border\); border-radius: var\(--r-card, var\(--r-ctl\)\); background: var\(--s1\); \}/);
    expect(block).toMatch(/\.dsc-howto\[open\] \.dsc-howto-chev \{[^}]*rotate\(-135deg\)/);
    expect(block).toMatch(/@media \(max-width: 760px\)/);
    expect(block.replace(/\/\*[\s\S]*?\*\//g, "")).not.toMatch(/#[0-9a-f]{3,6}\b/i);   // only theme tokens, so it follows light and dark
  });
});
