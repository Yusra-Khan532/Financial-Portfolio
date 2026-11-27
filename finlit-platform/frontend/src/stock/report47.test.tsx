// @vitest-environment jsdom
// Developer file 47, the founder's 13 points on the company report (27 Nov 2026, 11:23) and "see the spacing everywhere ... so the page length reduces".
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RiskLine, niceTicks } from "../charts/RiskLine";
import { toLast } from "./MoreCharts";
import { SectionHead } from "./Sections";
import { IndustryCard, type IndustryRead } from "./IndustryCard";
import { MIN_ROWS, headShift, installStickyHeads, stickyTop } from "../lib/stickyHeads";
import fx from "../lib/__fixtures__/industryCard-18nov.json";
import type { VRow } from "../lib/resultsPack";
import type { Ind } from "../components/results/pack/IndustriesView";

vi.mock("../lib/rotation", async (orig) => ({ ...(await orig<typeof import("../lib/rotation")>()), useRotationMap: () => ({ data: { rows: [] } }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const SRC = resolve(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const css47 = () => read("styles/report47.css");

describe("1 · no Discover figures box in the report", () => {
  it("the theme card no longer draws its four figures or the 'as on Discover' line", () => {
    const s = read("stock/DiscoverThemes.tsx");
    expect(s).not.toContain('className="dtc-ctx"');
    expect(s).not.toContain("Theme figures as on Discover");
    expect(read("styles/dth.css")).not.toContain(".dtc-ctx");
  });
});

describe("2 · price statistics: Distance from high and How bumpy", () => {
  it("ticks are round numbers that cover the data (they were −22% and −44%, 40% and 79%)", () => {
    expect(niceTicks(-44.1, 0, 5)).toEqual([-50, -40, -30, -20, -10, 0]);
    expect(niceTicks(0, 79, 5)).toEqual([0, 20, 40, 60, 80]);
    expect(niceTicks(0, 79, 4)).toEqual([0, 20, 40, 60, 80]);
  });
  it("a line stored before the server kept the last session ends on that session's own value, so the line and the figure above agree", () => {
    expect(toLast(["2026-11-19"], [-16], "2026-11-27", -14.3)).toEqual({ t: ["2026-11-19", "2026-11-27"], v: [-16, -14.3] });
    expect(toLast(["2026-11-27"], [-14.3], "2026-11-27", -14.3)).toEqual({ t: ["2026-11-27"], v: [-14.3] });
    expect(toLast(["2026-11-19"], [-16], "2026-11-27", null).t).toEqual(["2026-11-19"]);
  });
  it("the chart: the facts above it, the marks on it, a label for the screen reader, a dashed swatch tying 'Usual' to the dashed line", () => {
    const t = Array.from({ length: 30 }, (_, i) => `2025-${String(1 + Math.floor(i / 3)).padStart(2, "0")}-${String(1 + (i % 3) * 9).padStart(2, "0")}`);
    const v = t.map((_, i) => 20 + (i % 7) * 3);
    const { container } = render(<RiskLine t={t} v={v} fmt={(x) => `${x}%`} color="var(--c1)" floor={0} label="Volatility, 2025" usual={{ y: 23, text: "usual 23%" }}
      marks={[{ i: 29, text: "Now 35%" }]} facts={[{ k: "Now", v: "35% a year" }, { k: "Usual", v: "23%", dash: true }]} />);
    expect([...container.querySelectorAll(".rl-facts dt")].map((d) => d.textContent)).toEqual(["Now", "Usual"]);
    expect(container.querySelector(".rl-facts .rl-dash")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Volatility, 2025" })).toBeTruthy();
    expect(container.querySelectorAll(".rl-mark circle")).toHaveLength(1);
    expect(container.querySelector(".rl-usual line")).toBeTruthy();
  });
  it("both views use it; the old fixed-width AreaSeries is gone; the facts replace the notes under the charts", () => {
    const m = read("stock/MoreCharts.tsx");
    expect(m).toContain("<DrawdownChart s={stats} />"); expect(m).toContain("<VolatilityChart s={stats} />");
    expect(m).not.toContain("AreaSeries");
    expect(read("charts/Atlas.tsx")).not.toContain("export function AreaSeries");
    expect(m).not.toContain("Deepest fall from a high: ${");
  });
});

const rows = fx.rows as unknown as VRow[];
const reliance = (over: Partial<IndustryRead> = {}): IndustryRead => {
  const row = rows.find((r) => r.symbol === "RELIANCE")!;
  return { state: "ready", row, ind: (fx.industries as unknown as Ind[]).find((i) => i.name === row.industry)!, name: "Reliance", declared: true, quarter: fx.base.quarter as IndustryRead["quarter"], ...over };
};
describe("3 · Against its industry this quarter: smaller, calmer, and the biggest companies never wait for ever", () => {
  it("a failed list of the biggest companies says why, with Try again and the link to Results; the tab marks it (it read 'Loading…' for good)", () => {
    const retry = vi.fn();
    render(<MemoryRouter><IndustryCard read={reliance({ peers: undefined, peersError: "Not in this preview.", retryPeers: retry })} /></MemoryRouter>);
    fireEvent.click(screen.getByRole("tab", { name: /biggest in Petroleum Products/ }));
    expect(screen.getByRole("alert").textContent).toContain("could not be loaded (Not in this preview.)");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: /All \d+ companies in Petroleum Products on Results/ })).toBeTruthy();
  });
  it("no eyebrow, no fact icons; the card has no tinted band, gradient or glow", () => {
    const { container } = render(<MemoryRouter><IndustryCard read={reliance({ peers: [] })} /></MemoryRouter>);
    expect(container.querySelector(".aiq-eye")).toBeNull();
    expect(container.querySelector(".aiq-fi")).toBeNull();
    const css = read("styles/industry-card.css");
    expect(css).not.toMatch(/#aiq::before|#aiq \.aiq-hd \{[^}]*gradient|#aiq \{[^}]*box-shadow/);
    expect(css).toContain("#aiq { --aq: var(--c1);");
    expect(css).toContain("#aiq .sz { color: var(--muted);");
  });
});

describe("4 · table headers stay in view while the table scrolls past", () => {
  it("the header row moves down under the stuck bars, never before the table's top reaches them and never past its last row", () => {
    expect(headShift(300, 800, 40, 125)).toBe(0);            // the table's top is still below the bars
    expect(headShift(-200, 800, 40, 125, 30)).toBe(325);     // 325 px into the table: the row follows
    expect(headShift(-700, 800, 40, 125, 30)).toBe(730);     // near its end: it stops above the last row
  });
  it("the stuck bars are the site header, the phone's tools row and the section bar; a bar not yet at the top does not count", () => {
    document.body.innerHTML = '<header class="top"></header><nav class="ma-hub"></nav><div class="secnav"></div>';
    const box = (sel: string, top: number, bottom: number, position = "sticky") => {
      const el = document.querySelector<HTMLElement>(sel)!; el.style.position = position;
      el.getBoundingClientRect = () => ({ top, bottom, height: bottom - top, left: 0, right: 100, width: 100, x: 0, y: top, toJSON() {} });
    };
    box("header.top", 0, 56); box(".ma-hub", 56, 107); box(".secnav", 62, 125);
    expect(stickyTop()).toBe(125);
    box(".secnav", 900, 963);
    expect(stickyTop()).toBe(107);
    document.body.innerHTML = "";
  });
  it("only long tables, and the report starts it once its summary is in", () => {
    expect(MIN_ROWS).toBe(6);
    expect(read("stock/StockPage.tsx")).toContain("useEffect(() => (s ? installStickyHeads(document.body) : undefined), [s]);");
    expect(css47()).toContain("table.th-float thead th, table.th-float thead td { z-index: 3; transform: translateY(var(--thy, 0px));");
    const stop = installStickyHeads(document.body); expect(typeof stop).toBe("function"); stop();
  });
});

describe("6 · 05: the forecast stands out; the four figures are one compact strip, and their trend lines draw", () => {
  it("the forecast band and the strip", () => {
    const s = read("stock/Sections.tsx");
    expect(s).toContain('<div className="fin-top"><ForecastCard f={f} />');
    expect(s).toContain('<div className="fstrip" role="list" aria-label="Key figures, latest year">');
    expect(css47()).toMatch(/\.fin-top \.fcst \{[^}]*border-left: 5px solid var\(--gold\)/);
  });
  it("the Sector pages' .sp padding no longer reaches the sparklines (it squeezed every report sparkline to 0 to 19 px of its height)", () => {
    const sp = read("styles/sectors-pack.css");
    expect(sp).toContain(".sp:not(svg) { padding-bottom: 32px; }");
    expect(sp).not.toMatch(/^\.sp \{ padding-bottom: 32px; \}/m);
  });
});

describe("7 · no Balance sheet in charts", () => {
  it("the statements' charts are for profit and loss, the quarter and cash flow only", () => {
    expect(read("stock/Sections.tsx")).toContain('{kind !== "bs" && <div className="rp-more">');
    expect(read("stock/MoreCharts.tsx")).not.toContain("export function BsCharts");
  });
});

describe("8 · the notes under the ratio history and at the foot of 10 are one line", () => {
  it("a row of keys with swatches; one paragraph at full width with the disclaimer kept", () => {
    expect(read("stock/Sections3.tsx")).toContain('<p className="faint tkey"><span><i className="tk-g" />Most favourable year</span><span><i className="tk-r" />Weakest</span>');
    const ec = read("stock/EarningsCash.tsx");
    expect(ec).toContain('<p className="faint ec-note ec-foot">');
    expect(ec).toContain("{DISCLAIMER}</p>");
    expect(css47()).toMatch(/section\.block p\.ec-foot \{ max-width: none;/);
  });
});

describe("9 and 11 · 11's four figures and 16's four newest filings, in the report's colours", () => {
  it("the dividend figures carry no colour of their own; the strip is ink and gold", () => {
    const s = read("stock/Sections2.tsx");
    expect(s).not.toMatch(/className="dk" style=\{\{ "--dc"/);
    expect(css47()).toContain("section.block .dvk .dk { --dc: var(--gold);");
    expect(css47()).toContain("section.block .dvk .dk-v { font: var(--ui-fw-semibold) var(--fs-20)/1.2 var(--sans); margin: 2px 0; color: var(--text); background: none;");
  });
  it("the news cards are plain; the group keeps only a dot in its colour", () => {
    expect(css47()).toContain("section.block .nf-h { gap: 6px; padding: 10px 12px; border: 1px solid var(--border); border-top: 1px solid var(--border); background: var(--s1);");
    expect(css47()).toContain("section.block .nf-hk::before { content: \"\"; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--gc); }");
  });
});

describe("10 · 13 Peers and 14 Industry repeat nothing; no Risk tab", () => {
  it("14 is the industry only: no tabs, no peer or risk reading, the summary without the peers' rank", () => {
    const w = read("stock/pack/WhereStands.tsx");
    expect(w).toContain('<SectionHead id="sector" no="Industry"');
    expect(w).not.toMatch(/role="tab"|RiskTab|PeersTab|HeadToHead|Prism Risk <b/);
    expect(w).toContain("headline(short1, ind, key ? WORD[key] : null, sec, rot, null)");
    expect(read("lib/sectionNav.ts")).toContain('["sector", "Industry", "activity",');
  });
  it("13 Peers has the one view 14 had of its own, the group leader what-if; its amounts are green or red by their own direction", () => {
    expect(read("stock/Sections3.tsx")).toContain('<div className="sp ws-wi13"><LeaderWhatIf symbol={self}');
    const w = read("stock/pack/WhereStands.tsx");
    expect(w).toContain('className={m[m.length - 1] >= 100 ? "sp-good" : "sp-red"}');
    expect(w).not.toContain('<b className="sp-red">{lakh(m[m.length - 1])}</b>');
  });
});

describe("12 · one plain heading per section, smaller, without the company's name", () => {
  it("a section head has its number, one title and its plan chip on one line; the line under it is the section's description", () => {
    const { container } = render(<SectionHead id="ratios" no="Ratios" icon="gauge" tier="gold" sub="Valuation, returns, margins and debt." />);
    expect(container.querySelectorAll("h2")).toHaveLength(1);
    expect(container.querySelector(".sh-tl h2")!.textContent).toBe("Valuation, returns, margins and debt");   // developer file 48: the heading says what it shows
    expect(container.querySelector(".sh-tl + .sh-desc")!.textContent).toBe("Valuation, returns, margins and debt.");
  });
  it("no section passes a second title; 24 px numbers, 20 px titles (18 on a phone), 32 px between sections", () => {
    for (const f of ["Sections.tsx", "Sections2.tsx", "Sections3.tsx", "Sections4.tsx", "pack/WhereStands.tsx"]) expect(read("stock/" + f), f).not.toMatch(/<SectionHead[^>]* title=/);
    expect(css47()).toContain(":root { --fs-num: var(--fs-24); --section-gap: 32px; }");
    expect(css47()).toContain("section.block .sh { --ui-fs-h2: var(--fs-20); }");
    expect(css47()).toMatch(/section\.block \.sh h2, section\.block \.sh-l:has\(\.sh-n\) h2 \{[^}]*var\(--ui-fs-h2\)/);
    expect(css47()).toContain("@media (max-width: 760px) { section.block .sh { --ui-fs-h2: var(--fs-18); } }");
  });
});

describe("13 · Sentiment analysis", () => {
  it("the filings block is named for what it does; scores stay numbers and colours", () => {
    const s = read("stock/FilingScores.tsx");
    expect(s).toContain('<h3 id="fs-title" className="fs-title">Sentiment analysis</h3>');
    expect(s).not.toContain("The three filings, point by point</h3>");
  });
});

describe("14 · spacing", () => {
  it("the plain-words notes, cards, tab bars and Next view rows are tighter inside the report", () => {
    const c = css47();
    expect(c).toContain("section.block .plain { gap: 10px; margin: 0 0 12px; padding: 10px 14px;");
    expect(c).toContain("section.block .card { padding: 16px 18px; }");
    expect(c).toContain("section.block .ct-next { margin-top: 10px; padding: 8px 14px; }");
  });
});
