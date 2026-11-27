// @vitest-environment jsdom
// Developer file 48, the founder's five points of 27 Nov 2026 (1:08 pm): white space, vague headings, the overlap in Against its industry, the industry's
// biggest companies, and nothing lost between 13 and 14.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SectionHead } from "./Sections";
import { HEADING, NAV } from "../lib/sectionNav";
import { peerValueCard } from "../lib/standsPack";

afterEach(cleanup);
const SRC = resolve(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const files = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(n) && !/\.test\./.test(n) ? [p] : []; });

describe("1 · less white space", () => {
  it("the report's notes and descriptions take the card's width (the site's .card p { max-width: 68ch } left 400 to 570 px empty beside them)", () => {
    expect(read("styles/report48.css")).toContain("section.block .card p, section.block .sh p, section.block .dp-head p, section.block p.faint, section.block p.cl-note { max-width: none; }");
    expect(read("stock/StockPage.tsx").indexOf("report48.css")).toBeGreaterThan(read("stock/StockPage.tsx").indexOf("report47.css"));
  });
  it("09: the formula and what ROE means are one line (a four-line box stood beside a one-line formula); the four figures put the icon beside the name", () => {
    const d = read("stock/DuPont.tsx");
    expect(d).not.toContain('<aside className="dp-info"');
    expect(d).toContain('<p className="faint dp-formula"><Icon name="info" /><span>ROE shows how efficiently a company turns equity into profit: <b>Net profit margin × Asset turnover × Equity multiplier</b></span></p>');
    expect(read("styles/report48.css")).toContain("section.block .dp-sc > .dp-sci { grid-column: 1; grid-row: 1 / span 2; margin: 0; align-self: start; }");
  });
  it("12: Owners today's enlarge button sits on its title row, not on a strip of its own", () => {
    expect(read("styles/report48.css")).toContain("section.block .ow-card .cz-strip > .cz-slot { padding-top: 0; }");
  });
});

describe("2 · each section's heading says what it shows", () => {
  it("every report section has one plain heading, without the company's name", () => {
    for (const [id] of NAV) if (id !== "prism") expect(HEADING[id], id).toMatch(/^[A-Z][^.]+$/);
    expect(Object.values(HEADING).join(" ")).not.toMatch(/Reliance|\{name\}|company's name/);
    expect(HEADING.financials).toBe("Profit & loss, balance sheet and cash flow");
    expect(HEADING.ratios).toBe("Valuation, returns, margins and debt");
    expect(HEADING.dupont).toBe("DuPont analysis: what drives return on equity");   // the analysis is named where readers look for it
  });
  it("a report section's head shows its heading; the section bar keeps the short names", () => {
    const { container } = render(<SectionHead id="trends" no="Trends" icon="line" />);
    expect(container.querySelector("h2")!.textContent).toBe("Sales, profit and cash over the years");
    expect(NAV.find(([id]) => id === "trends")![1]).toBe("Trends");
    const { container: c2 } = render(<SectionHead id="other" no="07 · Something else" icon="line" />);   // outside the report: unchanged
    expect(c2.querySelector("h2")!.textContent).toBe("Something else");
  });
  it("on a phone a head's switches share one row", () => {
    expect(read("styles/report48.css")).toMatch(/@media \(max-width: 760px\) \{\s*section\.block \.sh-r \{ flex-direction: row; flex-wrap: wrap;/);
  });
});

describe("3 · the overlap: the report no longer uses class names other pages style", () => {
  it("04's ticks and key are tk-ind and tk-mkt (Markets today owns .mkt: 24 px top padding grew the tick and dropped its label onto the key line)", () => {
    const c = read("stock/IndustryCard.tsx"), css = read("styles/industry-card.css");
    expect(c).toContain('<span className={"tk tk-mkt " + edge(pos(mktV))}');
    expect(c).toContain('<i className="tk-mkt" />Typical company, all industries');
    expect(css).toContain("#aiq .aiq-bul .tk.tk-mkt em { top: calc(100% + 3px); color: var(--muted); }");
    expect(css).not.toMatch(/\.tk\.mkt\b|i\.mkt\b/);
  });
  it("the chart cards are clc (the callout cards own .cl)", () => {
    expect(read("stock/MoreCharts.tsx")).toContain('<div className={"card acc clc" + (full ? " full" : "")}>');
    expect(read("styles/account.css")).toContain(".clc .mb { margin-top: 6px; }");
  });
  it("no report file uses a class that markets-today.css or callout.css styles at the top level", () => {
    const owned = new Set<string>();
    for (const f of ["styles/markets-today.css", "styles/callout.css"]) for (const m of read(f).matchAll(/(?:^|[},]\s*)\.([a-z][a-z0-9]*)(?=[\s{,:.])/gm)) owned.add(m[1]);
    expect(owned.has("mkt") && owned.has("cl")).toBe(true);
    for (const f of files(__dirname)) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/className=(?:"([^"]+)"|\{"([^"]+)")/g)) for (const c of (m[1] ?? m[2]).split(/\s+/)) expect(owned.has(c), `${f}: class "${c}"`).toBe(false);
    }
  });
  it("the score screener's slider rules do not resize the report's table slider", () => {
    expect(read("styles/report48.css")).toContain("section.block .hs-bar .hs-end, section.block .hs-bar .hs-now { font-size: var(--fs-14); line-height: 1.6; }");
  });
});

describe("5 · 13 and 14 lose nothing", () => {
  it("the P/E against the peers' range and the return on equity against their average (14's peers tab said it) open 13's plain words", () => {
    expect(peerValueCard("Reliance", { pe: 22.6, roe: 8.7, peers: [{ pe: 4.4, roe: 20.3 }, { pe: 57.6, roe: 2.7 }, { pe: 7, roe: 25.9 }] })!.text)
      .toBe("Reliance trades at 22.6 times profit, within the range of the other companies in its industry (4 to 58 times), with a lower return on equity (8.7%) than their average (16.3%).");
    expect(peerValueCard("X", { pe: null, roe: 5, peers: [] })).toBeNull();
    expect(read("stock/Sections3.tsx")).toContain('<Plain>{peerValueCard(s.profile.name.split(" ")[0], { pe: me.pe, roe: me.roe, peers: peers.map((i) => ({ pe: i.pe ?? null, roe: i.roe ?? null })) })?.text ??');
  });
});
