// @vitest-environment jsdom
// Task #224 (results update pack of 18 Nov): A1 sorting by any heading, A2 Industries rows that show they open, A3 the three view cards.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { compareVals, nextSort, rankOf, sortRows } from "../../../lib/tableSort";
import { SortTh } from "../../SortTh";
import { ResultsHead } from "./ResultsPack";

afterEach(cleanup);
const src = (f: string) => readFileSync(join(__dirname, "../../..", f), "utf8");

describe("A1: sort by any heading", () => {
  it("three clicks: high to low (A to Z for words), the other way, back to the page's own order", () => {
    expect(nextSort(null, "x")).toEqual({ key: "x", dir: "desc" });
    expect(nextSort({ key: "x", dir: "desc" }, "x")).toEqual({ key: "x", dir: "asc" });
    expect(nextSort({ key: "x", dir: "asc" }, "x")).toBeNull();
    expect(nextSort({ key: "x", dir: "asc" }, "y")).toEqual({ key: "y", dir: "desc" });
    const rows = [{ n: 2, s: "b" }, { n: 9, s: "a" }, { n: 5, s: "c" }];
    expect(sortRows(rows, (r, k) => (k === "n" ? r.n : r.s), { key: "n", dir: "desc" }).map((r) => r.n)).toEqual([9, 5, 2]);
    expect(sortRows(rows, (r, k) => (k === "n" ? r.n : r.s), { key: "s", dir: "desc" }).map((r) => r.s)).toEqual(["a", "b", "c"]);
    expect(sortRows(rows, () => null, null)).toBe(rows);
  });
  it("words sort by rank (Strong > Good > Ahead > Agree > In line > Mixed > Weak > Behind > Poor); blanks and Not declared go last either way", () => {
    const words = ["Weak", "Agree", "Poor", "Strong", "In line", "Behind", "Good", "Mixed", "Ahead"];
    expect([...words].sort((a, b) => compareVals(a, b, "desc"))).toEqual(["Strong", "Good", "Ahead", "Agree", "In line", "Mixed", "Weak", "Behind", "Poor"]);
    expect(rankOf("in line")).toBe(5);
    for (const dir of ["desc", "asc"] as const) expect([3, "—", 1, "Not declared", null, 2].sort((a, b) => compareVals(a, b, dir)).slice(-3)).toEqual(["—", "Not declared", null]);
  });
  it("a heading shows ↕ at rest and ▼ / ▲ while sorting, carries aria-sort, and works by keyboard (a button)", () => {
    const seen: string[] = [];
    const { rerender } = render(<table><thead><tr><SortTh k="rev" label="Revenue" sort={null} onSort={(k) => seen.push(k)} /></tr></thead></table>);
    const th = screen.getByRole("columnheader");
    expect(th.getAttribute("aria-sort")).toBe("none"); expect(th.textContent).toBe("Revenue↕");
    fireEvent.click(screen.getByRole("button", { name: /Revenue/ })); expect(seen).toEqual(["rev"]);
    rerender(<table><thead><tr><SortTh k="rev" label="Revenue" sort={{ key: "rev", dir: "desc" }} onSort={() => undefined} /></tr></thead></table>);
    expect(screen.getByRole("columnheader").getAttribute("aria-sort")).toBe("descending"); expect(screen.getByRole("columnheader").textContent).toBe("Revenue▼");
  });
  it("every table on the three views sorts: calendar lists, the week, Industries and its drawer tables, Companies on the server", () => {
    const rp = src("components/results/pack/ResultsPack.tsx"), iv = src("components/results/pack/IndustriesView.tsx"), qr = src("pages/QuarterResults.tsx");
    expect(rp).toContain("const { sorted, sort, toggle } = useTableSort(rows, RT_GET);");
    expect(rp).toContain("const { sorted: weekRows, sort, toggle } = useTableSort(shown,");
    expect(iv).toContain("const { sorted: sortedRows, sort, toggle } = useTableSort(rows,");
    expect(iv).toMatch(/const big = useTableSort\(rows,[\s\S]*const typ = useTableSort\(/);
    expect(iv).toMatch(/\{sortedRows\.map\(\(\{ i, agree \}\) => \{[\s\S]*<Fragment key=\{i\.name\}>[\s\S]*rs-drawer/);   // the drawer travels with its row
    expect(qr).toMatch(/QH\("company", "Company"[\s\S]*QH\("verdict", "Verdict"/);
    expect(qr).toContain('if (!nx) return set({ sort: "date", dir: "desc" });');
  });
});

describe("A2 and A3", () => {
  it("A2: each Industries row starts with a chevron; the hint above the table says every row opens", () => {
    const iv = src("components/results/pack/IndustriesView.tsx");
    expect(iv).toMatch(/<span className="rs-iname"><span className="rs-chev" aria-hidden="true">/);
    expect(iv).toContain("<b>Every row opens.</b> Click an industry to see how its companies did, the typical company against the market, and its biggest results. Click a heading to sort.");
    expect(src("styles/results224.css")).toMatch(/tr\.rs-ir\[aria-expanded="true"\] \.rs-chev \{ transform: rotate\(180deg\); background: #2a78d6;/);
  });
  it("A3: three view cards under Choose a view, each in its colour with its description; the current one is the page; they stay links", () => {
    render(<MemoryRouter><ResultsHead title="Latest results" desc="" links={[]} view="industries" /></MemoryRouter>);
    expect(screen.getByText("Choose a view").textContent).toBe("Choose a view · 3 views · tap one");
    const cards = screen.getAllByRole("link").filter((a) => a.classList.contains("sp-vbtn"));
    expect(cards.map((a) => [a.querySelector("b")!.textContent, a.querySelector("small")!.textContent, a.getAttribute("href"), (a as HTMLElement).style.getPropertyValue("--va")])).toEqual([
      ["Calendar", "Who declares when, day by day", "/results?view=calendar", "#0e6471"],
      ["Industries", "How each industry did this quarter", "/results?view=industries", "#4b4fc4"],
      ["Companies", "Every company's results, newest first", "/results?view=companies", "#b5541c"]]);
    expect(cards.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null]);
    const css = src("styles/results224.css");
    expect(css).toMatch(/@media \(max-width: 700px\) \{[\s\S]*grid-template-columns: minmax\(0, 1fr\); justify-items: center;[\s\S]*> small, \.sp-view\.xvr a\.sp-vbtn::after \{ display: none; \}/);
    expect(css).toContain("a.sp-vbtn:focus-visible { outline: 3px solid var(--gold);");
  });
});
