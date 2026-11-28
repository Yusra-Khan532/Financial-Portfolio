// @vitest-environment jsdom
// Task #463 (team, 28 Nov 2026), the ETF list: "we see the issue in this we need to add it in disclamer box as we made in mutual fund pages". The notes under
// the table and the data note go into the Mutual fund pages' Disclaimer drop-down (.mfs-disc): closed at first, the disclaimer line in its closed row,
// every sentence kept. The ETF fund page and compare keep their open note.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { DataNote } from "./common";
import { DISCLAIMER } from "../lib/etf";

afterEach(cleanup);
const note = (fold: boolean) => render(<MemoryRouter><DataNote asOf="2026-11-27" updatedAt="2026-11-27T17:37:00Z" fold={fold} notes={fold ? <p>— means the figure is not available.</p> : undefined} /></MemoryRouter>).container;

describe("task #463: the Disclaimer drop-down under the ETF list", () => {
  it("with fold, a closed drop-down named Disclaimer, the disclaimer line in its closed row, as on the Mutual fund pages", () => {
    const d = note(true).querySelector("details.mfs-disc") as HTMLDetailsElement;
    expect(d).not.toBeNull(); expect(d.open).toBe(false);
    const s = d.querySelector("summary")!;
    expect(s.querySelector(".mfs-disc-k")!.textContent).toBe("Disclaimer");
    expect(s.querySelector(".mfs-disc-l")!.textContent).toBe(DISCLAIMER);
    expect(s.querySelector(".mfs-disc-chev")).not.toBeNull();
  });
  it("every earlier sentence is inside it: the notes, the price date and source, the price-return line and the glossary link", () => {
    const d = note(true).querySelector("details")!;
    for (const t of ["— means the figure is not available.", "Prices are NSE closing prices as of 27 Nov 2026", "Every return here is a price return", "glossary"]) expect(d.textContent).toContain(t);
    expect(d.querySelector('a[href="/glossary"]')).not.toBeNull();
  });
  it("without fold (an ETF's page, compare) the note stays open as before", () => {
    const c = note(false);
    expect(c.querySelector("details")).toBeNull();
    expect(c.querySelector(".etf-note")!.textContent).toContain(DISCLAIMER);
  });
  it("only the ETF list folds it, with both notes moved inside, and the box uses the Mutual fund drop-down's styles", () => {
    const list = readFileSync(join(process.cwd(), "src/etf/List.tsx"), "utf8");
    expect(list.match(/<DataNote [^>]*\bfold\b/g)?.length).toBe(1);
    expect(list).not.toMatch(/className="etf-foot faint">— means/);
    expect(list).not.toMatch(/className="etf-foot faint">Categories are read/);
    for (const f of ["Detail.tsx", "Compare.tsx"]) expect(readFileSync(join(process.cwd(), "src/etf", f), "utf8")).not.toMatch(/<DataNote [^>]*\bfold\b/);
    const common = readFileSync(join(process.cwd(), "src/etf/common.tsx"), "utf8");
    expect(common).toContain('import "../styles/task373.css";');
    expect(readFileSync(join(process.cwd(), "src/styles/task463.css"), "utf8")).toMatch(/^\.etf-disc463 \{/m);
  });
});
