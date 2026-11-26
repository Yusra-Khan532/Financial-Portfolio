// @vitest-environment jsdom
// Developer file 43, the founder's points of 27 Nov 2026 on the company report:
//  1 "put profit and loss in charts into 3 tabs so that it reduces the length of the page"
//  2 "better suitable graph for How the mix has changed"
//  3 "the three boxes: can we add them as 3 dots like we did in the equity portfolio page, and see where we can save space"
//  4 Where it stands' "Share price, last 12 months": "remove this as we are already showing this above section" (03 Price & technicals)
//  5 "Inside its industry: 6-month return": "reduce the size - use drop down or whatever suitable"
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { placeLabels, shortName } from "./SegmentMix";
import { IndustryList } from "./pack/WhereStands";
import { stripDots } from "../lib/standsList";

afterEach(cleanup);

const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("1 · Profit and loss in charts: three view tabs, one chart at a time", () => {
  it("the walk, the ₹100 chart and the growth grid are the report's view tabs (they stood one under the other)", () => {
    const more = read("stock/MoreCharts.tsx"), pl = more.slice(more.indexOf("export function PlCharts"), more.indexOf("/* ---------------------------------------------------------------- balance sheet */"));
    expect(pl).toContain('<TabGroup label="Profit and loss in charts" views={[');
    expect([...pl.matchAll(/\{ key: "([a-z]+)", label: "([^"]+)"/g)].map((m) => [m[1], m[2]])).toEqual([["walk", "Revenue to net profit"], ["hundred", "Where each ₹100 goes"], ["growth", "Growth by line"]]);
    expect(pl).not.toContain('className="cl-grid"');
    for (const h of ['help="pl-waterfall"', 'help="pl-margin-split"', 'help="yoy-growth"']) expect(pl).toContain(h);   // the three cards, each with its ? help
  });
});

describe("2 · How the mix has changed: one line a segment", () => {
  it("a line's end label is the segment's short form when its name ends with one, else the name cut at 16 letters", () => {
    expect(shortName("Oil to Chemicals (O2C)")).toBe("O2C");
    expect(shortName("Retail")).toBe("Retail");
    expect(shortName("Digital Services")).toBe("Digital Services");
    expect(shortName("Exploration and Production")).toBe("Exploration and…");
  });
  it("end labels never overlap: each at least the gap below the one above, pushed up together when they run off the bottom", () => {
    expect(placeLabels([100, 104, 300], 15, 10, 400)).toEqual([100, 115, 300]);
    expect(placeLabels([398, 395, 390], 15, 10, 400)).toEqual([400, 385, 370]);
    const ys = placeLabels([50, 52, 54, 56], 15, 0, 1000); for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(15);
  });
  it("it opens on the share (the mix), labels each line at its end on a desktop, and the key picks out a line; a stopped segment shows its last year", () => {
    const src = read("stock/SegmentMix.tsx");
    expect(src).toContain('const [mode, setMode] = useState<Mode>("share");');
    expect(src).toContain("<MixLines model={model} mode={mode} hl={hl} />");
    expect(src).toContain("<MixKey model={model} mode={mode} hl={hl} setHl={setHl} />");
    expect(src).not.toContain("function MixChart");
    expect(src).toContain('<small className="mx-until">until {model.years[l]}</small>');
    expect(read("styles/stock2.css")).toContain(".mx-key-h, .mx-key em, .mx-key span { display: none; }");   // a desktop's key is one row of names
  });
});

describe("3 · Where it stands: each tab's notes as a ●●● pill, as on the equity portfolio", () => {
  it("the tabs' rows of boxes are the things-to-know pill (KnowButton) at the tab's top right; the two one-off notes beside a chart stay", () => {
    const ws = read("stock/pack/WhereStands.tsx");
    for (const sc of ["ws-industry", "ws-peers", "ws-risk"]) expect(ws).toContain(`<Know scope="${sc}"`);
    expect(ws).toContain('import { KnowButton } from "../../portfolio/pack/Round388";');
    expect(ws).toContain('<div className="ws-know"><KnowButton items={items} scope={scope} inline /></div>');
    expect(ws.match(/<Cards items=/g)).toHaveLength(2);                          // "May change box next week", "Not a like-for-like swap"
    expect(read("stock/pack/stands.css")).toContain(".ws-know { display: flex; justify-content: flex-end; margin: 0 0 10px; }");
  });
});

describe("4 · Where it stands has no price chart of its own: 03 Price & technicals draws the price", () => {
  it("three tabs (Its industry, Against peers, Risk); no 12-month chart, no trend and return tiles, no price notes; the trend reading links to 03", () => {
    const ws = read("stock/pack/WhereStands.tsx");
    expect(ws).toContain('type Tab = "industry" | "peers" | "risk";');
    for (const gone of ["function ChartTab", "Share price, last 12 months", "ws-tiles", "usePrice(", "priceCards", 'open("chart")']) expect(ws, gone).not.toContain(gone);
    expect(ws).toContain('<a className="ws-go" href="#price" onClick={toPrice}>{sectionNo("price")} Price &amp; technicals ↑</a>');
    expect(ws).toContain('revealAndScroll(document.getElementById("price")');                 // a phone opens 03's row first
    expect(ws).toContain('sub="Its industry, its peers and its risk: one question per tab."');
    expect(read("lib/sectionNav.ts")).toContain('"Its industry, its peers and its risk, one question per tab"');
    expect(read("lib/standsPack.ts")).not.toContain("export function priceCards");
    expect(read("stock/pack/stands.css")).not.toMatch(/\.ws-(px|tiles)\b/);
    expect(read("stock/pack/stands.css")).toContain(".ws-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }");
  });
});

describe("5 · Inside its industry: one strip of dots, the ranked list in a drop-down", () => {
  // the 12 counted Petroleum Products stocks' 6-month returns as the live site sent them on 27 Nov 2026 (best first); RELIANCE is 10th
  const R: [string, number][] = [["GANDHAR", 53.2], ["CHENNPETRO", 41], ["SOTL", 39.6], ["GULFOILLUB", 28.2], ["PANAMAPET", 25.8], ["MRPL", 16.9], ["IOC", 7.1], ["BPCL", 6], ["CASTROLIND", 4.5], ["RELIANCE", 2.1], ["HINDPETRO", 1.9], ["VEEDOL", -6.8]];
  const stocks = R.map(([symbol, v]) => ({ symbol, name: symbol, return_6m_pct: v }) as never);
  const draw = () => render(<MemoryRouter><IndustryList stocks={stocks} symbol="RELIANCE" name="Reliance" ind="Petroleum Products" max={60} /></MemoryRouter>).container;

  it("places every return along one strip with 0% inside it, and stacks dots closer than a dot's width", () => {
    const s = stripDots([10, 10.2, 10.4, -5, null, 30], 2);
    const pos = s.dots.map((d) => d?.pos ?? null);
    expect(s.at(0)).toBeGreaterThan(0); expect(s.at(0)).toBeLessThan(100);
    expect(pos[3]!).toBeLessThan(pos[0]!); expect(pos[5]!).toBeGreaterThan(pos[2]!);
    expect(s.dots[4]).toBeNull();                                                     // no return: no dot
    expect(new Set([s.dots[0]!.lane, s.dots[1]!.lane, s.dots[2]!.lane]).size).toBe(3);    // three returns 0.2 apart: three lanes
    expect(stripDots([1, 50, 99]).dots.every((d) => d!.lane === 0)).toBe(true);
    expect(Math.max(...stripDots(Array.from({ length: 40 }, () => 5), 2, 4).dots.map((d) => d!.lane))).toBe(3);   // never more lanes than asked
    const allUp = stripDots([5, 20]); expect(allUp.at(0)).toBeLessThan(allUp.at(5));   // a strip of gains still starts at 0
  });

  it("12 dots, the company's ringed and named above it with its rank; the lowest and the highest named at the ends; the median and 0% marked; no 'best'", () => {
    const c = draw();
    expect(c.querySelectorAll(".ws6-dot").length).toBe(12);
    const me = c.querySelector(".ws6-dot.me")!;
    expect(me.getAttribute("aria-label")).toBe("10. RELIANCE +2.1%");
    expect(c.querySelector(".ws6-lab")!.textContent).toBe("RELIANCE +2.1% 10th of 12");
    expect(c.querySelector(".ws6-ends")!.textContent).toBe("Lowest VEEDOL −6.8%Highest GANDHAR +53.2%");
    expect(c.querySelector(".ws-sum")!.textContent).toBe("RELIANCE 10th of 12 · +2.1% · industry median +12.0%");
    expect(c.querySelector(".ws6")!.getAttribute("aria-label")).toBe("6-month returns of the 12 counted Petroleum Products stocks, from −6.8% to +53.2%; Reliance +2.1%, 10th");
    expect(c.querySelector(".ws6-med")).not.toBeNull(); expect(c.querySelector(".ws6-zero")).not.toBeNull();
    expect(c.textContent!.toLowerCase()).not.toMatch(/\bbest\b/);
  });

  it("pointing at, focusing or tapping a dot names that stock in the label; leaving it names the company again", () => {
    const c = draw(), dots = c.querySelectorAll(".ws6-dot");
    fireEvent.focus(dots[2]);
    expect(c.querySelector(".ws6-lab")!.textContent).toBe("SOTL +39.6% 3rd of 12");
    expect(dots[2].classList.contains("on")).toBe(true);
    fireEvent.blur(dots[2]);
    expect(c.querySelector(".ws6-lab")!.textContent).toBe("RELIANCE +2.1% 10th of 12");
    fireEvent.click(dots[0]);
    expect(c.querySelector(".ws6-lab")!.textContent).toBe("GANDHAR +53.2% 1st of 12");
  });

  it("the ranked list of bars is the report's drop-down, closed at first, with all 12 rows inside", () => {
    const c = draw(), dd = c.querySelector("details.xdd.notes.ws6-dd") as HTMLDetailsElement;
    expect(dd).not.toBeNull(); expect(dd.open).toBe(false);
    expect(dd.querySelector("summary")!.textContent).toBe("All 12 stocks, ranked");
    expect(dd.querySelector(".xdd-chev")).not.toBeNull();
    expect(dd.querySelectorAll(".ws-bars li").length).toBe(12);
    expect(dd.querySelector(".ws-bars li.me .ws-rk")!.textContent).toBe("10");
  });

  it("a dot is a 22 px target for a finger; a large industry draws smaller dots", () => {
    const css = read("stock/pack/stands.css");
    expect(css).toContain('.ws6-dot::before { content: ""; position: absolute; inset: -6px; border-radius: 50%; }');
    expect(css).toContain(".ws6.dense .ws6-dot { width: 8px; height: 8px; margin-left: -4px; }");
    const big = Array.from({ length: 120 }, (_, i) => ({ symbol: `S${i}`, name: `S${i}`, return_6m_pct: 60 - i }) as never);
    const c = render(<MemoryRouter><IndustryList stocks={big} symbol="S5" name="S5" ind="Pharmaceuticals" max={60} /></MemoryRouter>).container;
    expect(c.querySelector(".ws6")!.className).toBe("ws6 dense");
    expect(c.querySelectorAll(".ws6-dot").length).toBe(120);
  });
});
