// @vitest-environment jsdom
// Task #389 PR B (MF portfolio, developer file 32, Mix & overlap 1 to 10, Update 25 Nov rows 6 and 7, Phone, faults 7, 9, 10 (page side) and 11, Words W15–W17,
// W22, W23): one test per point that can be tested in code. The browser proof (1440/390, light/dark) is in the task's after screenshots.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { BiggestSection, Cell, MixTab, MoneySection, MoveSection, SharedSection, gridCount, gridRows, noneLine, pairWords, readingTiles, sharedPairs, sliceLabel, type Big } from "./MfMix";
import { holdingName, holdingShort } from "../../lib/holdingName";
import type { MfSpread } from "../../lib/mfPortfolio";

afterEach(() => { cleanup(); localStorage.clear(); });
const css = (p: string) => readFileSync(resolve(__dirname, p), "utf8");
const MF_CSS = css("./mf-pack.css"), MP_CSS = css("../../styles/mfportfolio.css"), TOKENS = css("../../styles/ui-tokens.css");
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

const fund = (code: number, name: string, category = "Flexi Cap", amc = "AMC " + code) => ({ code, name, amc, category, weight: 100 / 8, assetSplit: { equity: 95, cash: 5 } });
const FUNDS = [fund(1, "Nippon India Large Cap Fund", "Large Cap"), fund(2, "HDFC Balanced Advantage Fund", "Balanced Advantage"), fund(3, "UTI Nifty 50 Index Fund", "Index Funds"),
  fund(4, "SBI Small Cap Fund", "Small Cap"), fund(5, "Parag Parikh Flexi Cap Fund"), fund(6, "Mirae Asset ELSS Tax Saver Fund", "ELSS")];
const pairs = (zero: [number, number][]) => { const out: { a: number; b: number; pct: number; n: number }[] = [];
  for (let a = 1; a <= 6; a++) for (let b = a + 1; b <= 6; b++) out.push(zero.some(([x, y]) => x === a && y === b) ? { a, b, pct: 0, n: 0 } : { a, b, pct: 60 - out.length * 3, n: 27 - out.length }); return out; };
const C = [1, 2, 3, 4, 5, 6].map((a) => [1, 2, 3, 4, 5, 6].map((b) => (a === b ? 1 : a + b === 3 ? 0.99 : a + b === 7 ? 0.15 : 0.45)));
const stock = (name: string, symbol: string | null, w: number) => ({ name, symbol, w });
const SP = {
  count: 6, basis: "value", knownShares: 0.75,
  readings: { together: { word: "Move as one", independent: 1.2, of: 6, range: [0.68, 0.99] }, underneath: { word: "Concentrated", stocks: 266, inTwoOrMore: 76 },
    overlap: { word: "High", top: { a: 1, b: 3, pct: 60.87, n: 27 } }, theme: { word: "None", theme: null, funds: [] }, houses: { word: "Spread", top: "HDFC Mutual Fund", count: 2 },
    assets: { word: "Mostly equity", equityShare: 0.93 } },
  mix: { shares: 0.75, sharesUnknown: 0.18, debt: 0.05, other: 0.02 }, size: { Large: 0.5, Mid: 0.11, Small: 0.09, Micro: 0.03 },
  lookThrough: {
    macro: {
      "Financial Services|Large": { w: 0.17, n: 26, stocks: [stock("HDFC Bank Limited", "HDFCBANK", 0.043), stock("ICICI Bank Limited", "ICICIBANK", 0.035), stock("EQ - KOTAK MAHINDRA BANK LTD.", "KOTAKBANK", 0.017),
        stock("Bajaj Holdings & Investment Limited", "BAJAJHLDNG", 0.009), stock("State Bank of India", "SBIN", 0.009), stock("Axis Bank Limited", "AXISBANK", 0.008)] },
      "Fast Moving Consumer Goods|Large": { w: 0.02, n: 1, stocks: [stock("ITC LTD", "ITC", 0.02)] },
      "Energy|Large": { w: 0.03, n: 3, stocks: [stock("OIL AND NATURAL GAS CORPORATION LTD", "ONGC", 0.01), stock("Ntpc Limited", "NTPC", 0.01), stock("EQ - ADANI PORTS AND SPECIAL ECONO", "ADANIPORTS", 0.01)] },
      ...Object.fromEntries(["Healthcare", "Industrials", "Information Technology", "Consumer Discretionary", "Commodities", "Services", "Telecommunication", "Utilities", "Diversified"].map((n, i) =>
        [`${n}|Mid`, { w: 0.02 - i * 0.001, n: 1, stocks: [stock(`Co ${i} Ltd`, `CO${i}`, 0.01)] }])),
      "Listed abroad|Unsized": { w: 0.01, n: 2, stocks: [stock("Alphabet Inc A", null, 0.006), stock("Microsoft Corp", null, 0.004)] },
    },
    sector: {},
  },
  sectorMacro: {}, perFund: {}, industries: [], topStocks: [], overall: "Concentrated", disclaimer: "",
  together: { codes: [1, 2, 3, 4, 5, 6], C, weeks: 52, from: null, to: null },
  overlap: pairs([[3, 4], [4, 6]]), coverage: { funds: 6, disclosed: 6, missing: [], notMatched: 0 }, funds: FUNDS,
} as unknown as MfSpread;

describe("Company names (Mix 2 and 9, W22, W23; fault 10 on the page side): one helper", () => {
  it("cleans the fund file's text and the master's name the same way, abbreviations in capitals", () => {
    expect(["ITC LTD", "Itc Limited", "ITC Ltd"].map((n) => holdingShort(n))).toEqual(["ITC", "ITC", "ITC"]);
    expect(["Ntpc Limited", "NHPC LTD", "SRF LTD", "Nhpc Limited", "Srf Limited"].map((n) => holdingShort(n))).toEqual(["NTPC", "NHPC", "SRF", "NHPC", "SRF"]);
    expect(holdingShort("EQ - BHARTI AIRTEL LTD.")).toBe("Bharti Airtel");
    expect(holdingName("EQ - BHARTI AIRTEL LTD.")).toBe("Bharti Airtel Ltd");
    expect(holdingShort("HDFC Bank Limited")).toBe("HDFC Bank");
    expect(holdingShort("OIL AND NATURAL GAS CORPORATION LTD")).toBe("ONGC");
    expect(holdingShort("Oil & Natural Gas Corporation Ltd")).toBe("ONGC");
    expect(holdingShort("STEEL AUTHORITY OF INDIA LTD")).toBe("SAIL");
    expect(holdingShort("Tata Consultancy Services Limited")).toBe("TCS");
    expect(holdingShort("Hindustan Petroleum Corporation Ltd")).toBe("HPCL");
    expect(holdingShort("Krishna Institute Of Medical Sciences Ltd")).toBe("KIMS");
    expect(holdingShort("EQ - ADANI PORTS AND SPECIAL ECONO")).toBe("Adani Ports");     // cut at the source: never ends on "and"
    expect(holdingShort("Adani Ports & Special Economic Zone Ltd")).toBe("Adani Ports");
    expect(holdingShort("Bajaj Holdings & Investment Limited")).toBe("Bajaj Holdings");
    expect(holdingName("Bank Of Baroda")).toBe("Bank of Baroda");
    expect(holdingShort("DR. REDDY'S LABORATORIES LTD")).toBe("Dr. Reddy's");
    expect(holdingShort("Alphabet Inc A")).toBe("Alphabet");
    expect(holdingName("LARSEN & TOUBRO LTD")).toBe("Larsen & Toubro Ltd");
    expect(holdingShort("", "HDFCBANK")).toBe("HDFCBANK");
  });
});

describe("What they own: the sector and size grid (Mix 2, 3, 4; fault 7; Phone; Update row 7)", () => {
  it("each chip shows the short name with the full name as its title; long names end in … in CSS", () => {
    wrap(<MixTab sp={SP} readingOf={() => null} gold big={[]} />);
    const chip = screen.getByText("HDFC Bank").closest(".mfm-chip")!;
    expect(chip.getAttribute("title")).toMatch(/^HDFC Bank Limited: 4\.3% of your list/);
    expect(screen.getByText("Kotak Mahindra Bank").closest(".mfm-chip")!.getAttribute("title")).toMatch(/^Kotak Mahindra Bank Ltd:/);
    for (const n of ["ITC", "ONGC", "NTPC", "Adani Ports"]) expect(screen.getByText(n, { selector: ".mfm-cn" })).toBeTruthy();
    expect(document.querySelectorAll(".mfm-g .mfm-chip .mfm-cn").length).toBeGreaterThan(5);
    expect([...document.querySelectorAll(".mfm-g .mfm-cn")].map((x) => x.textContent)).not.toContain("HDFCBANK");
    expect(MF_CSS).toMatch(/\.mfm-chip \.mfm-cn \{[^}]*text-overflow: ellipsis/);
  });
  it("counts read “26 companies” and “1 company”; every +N more is one dashed 12 px 600 pill", () => {
    wrap(<MixTab sp={SP} readingOf={() => null} gold big={[]} />);
    const cws = [...document.querySelectorAll(".mfm-cw")].map((x) => x.textContent);
    expect(cws).toContain("17.0% · 26 companies");
    expect(cws).toContain("2.0% · 1 company");
    expect(cws.join(" ")).not.toMatch(/\bcos?\b/);
    const more = screen.getByRole("button", { name: "+2 more ▾" });
    expect(more.className).toBe("mfm-more");
    expect(document.querySelectorAll(".mfm-g .eq-more")).toHaveLength(0);
    expect(MF_CSS).toMatch(/\.mfm-more \{[^}]*border: 1px dashed[^}]*font: 600 var\(--fs-12\)/);
  });
  it("sector names wrap; the footer says “12 macro sectors and shares listed abroad” (fault 7)", () => {
    expect(gridCount(gridRows(SP, "macro"), "macro")).toBe("12 macro sectors and shares listed abroad");
    expect(gridCount([{ name: "A" }], "sector")).toBe("1 sector");
    wrap(<MixTab sp={SP} readingOf={() => null} gold big={[]} />);
    expect(document.querySelector(".mfm-g tfoot th")!.textContent).toBe("12 macro sectors and shares listed abroad");
    expect(screen.getAllByRole("button", { name: /^Macro sector · 12/ }).length).toBeGreaterThan(0);
    expect(MF_CSS).toMatch(/\.mfp \.mfm-gn tbody th \{ white-space: normal;/);
    expect(MF_CSS).toMatch(/\.mfp \.mfm-gn tfoot th \{ white-space: normal; text-transform: none;/);
  });
  it("phone: cells at least 150 px, sector name 118 px, the grid scrolls sideways in its box", () => {
    const m = MF_CSS.slice(MF_CSS.indexOf("Phone: the sector and size grid"));
    expect(m).toMatch(/max-width: 760px/);
    expect(m).toMatch(/tbody th \{ width: 118px; min-width: 118px/);
    expect(m).toMatch(/td\.mfm-c[^{]*\{ min-width: 150px/);
    wrap(<MixTab sp={SP} readingOf={() => null} gold big={[]} />);
    expect(document.querySelector(".mfm-gn")!.closest(".sp-scroll")).toBeTruthy();
  });
  it("dark mode: the cell figures read #eef3ee (Update row 7), from a token", () => {
    expect(TOKENS).toMatch(/:root\[data-theme="dark"\],\n:root:not\(\[data-theme="light"\]\) \{\n {2}--ui-mfm-cell-fig: #eef3ee;/);
    expect(MF_CSS).toMatch(/\.mfm-gn \.mfm-cw \{ color: var\(--ui-mfm-cell-fig, var\(--sp-mute\)\); \}/);
  });
  it("the ETF page's cells keep their codes and words until its own task (Cell without `names`)", () => {
    const c = { w: 0.1, n: 1, stocks: [stock("HDFC Bank Limited", "HDFCBANK", 0.1)] };
    wrap(<table><tbody><tr><Cell c={c} max={0.1} readingOf={() => null} /></tr></tbody></table>);
    expect(document.querySelector(".mfm-chip")!.textContent).toBe("HDFCBANK");
    expect(document.querySelector(".mfm-cw")!.textContent).toBe("10.0% · 1 co");
  });
});

describe("The sub-view tabs at the top of the view (Mix 1)", () => {
  it("come first in the view, before What they own; the selected tab's second line is white at 78%", () => {
    wrap(<MixTab sp={SP} readingOf={() => null} gold big={[]} />);
    const bar = screen.getByRole("tablist", { name: "Mix and overlap views" }), own = document.getElementById("mfp-own")!;
    expect(bar.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar.compareDocumentPosition(document.getElementById("mfp-spread")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(MF_CSS).toMatch(/\.mfm-subtabs button\[aria-selected="true"\] small \{ color: color-mix\(in srgb, var\(--ui-on-fg\) 78%, transparent\); \}/);
    fireEvent.click(screen.getByRole("tab", { name: /How funds move together/ }));
    expect(screen.getByText("How your funds move together")).toBeTruthy();
    act(() => { dispatchEvent(new CustomEvent("eq-jump", { detail: "mfp-sizes" })); });
    expect(screen.getByRole("tab", { name: /Large, mid, small and micro/ }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("What your money is in (Mix 5)", () => {
  it("slices under 14% keep the % and drop the word; under 4% drop both", () => {
    expect([0.75, 0.14, 0.139, 0.05, 0.04, 0.039, 0.02].map(sliceLabel)).toEqual([{ pct: true, word: true }, { pct: true, word: true }, { pct: true, word: false }, { pct: true, word: false },
      { pct: true, word: false }, { pct: false, word: false }, { pct: false, word: false }]);
    wrap(<MoneySection sp={SP} />);
    const big = document.querySelector(".mfm-stack.big")!;
    expect([...big.querySelectorAll("i")].map((i) => i.textContent)).toEqual(["75%Shares", "5%", "", "18%Not loaded"]);
    expect(big.getAttribute("aria-label")).toBe("Shares 75%, Debt and money market 5%, Gold and other 2%, Not loaded 18%");
    expect(MF_CSS).toMatch(/:is\(i\.mfm-d, i\.mfm-o, i\.mfm-zM, i\.mfm-zS\) \{ color: var\(--ui-mfm-on-light\); \}/);   // dark ink on the light slices (4.5:1)
  });
});

describe("Sectors inside each fund: headers and the scroll control (Mix 6, fault 9)", () => {
  it("headers in plain case at 12 px, at least 96 px, wrapping; the slider row is one row inside .mp", () => {
    expect(MF_CSS).toMatch(/\.mfm-heat thead th \{ min-width: 96px; text-transform: none; letter-spacing: 0; font-size: var\(--fs-12\); white-space: normal;/);
    expect(MP_CSS).toMatch(/\.mp label\.eqd-slide \{ display: flex; \}/);
    expect(MP_CSS.indexOf(".mp label.eqd-slide")).toBeGreaterThan(MP_CSS.indexOf(".mp label {"));
  });
});

describe("How your funds move together (Mix 7, Update 25 Nov row 6)", () => {
  it("the reader says the pair's figure in words and the part of their weekly moves in common", () => {
    expect(pairWords(0.99)).toBe("Closely linked: about 98% of their weekly moves in common.");
    expect([0.19, 0.2, 0.39, 0.4, 0.59, 0.6].map((v) => pairWords(v).split(":")[0])).toEqual(["Barely linked", "Loosely linked", "Loosely linked", "Partly linked", "Partly linked", "Closely linked"]);
    expect(pairWords(0.986)).toBe("Closely linked: about 98% of their weekly moves in common.");   // squares the figure as shown (0.99), not 0.986
    expect(pairWords(0.45)).toBe("Partly linked: about 20% of their weekly moves in common.");
    wrap(<MoveSection sp={SP} />);
    const r = document.querySelector(".mfm-pair .mfm-reader")!;
    expect(r.querySelector(".mfm-rn")!.textContent).toBe("Nippon India Large Cap and HDFC Balanced Advantage");
    expect(r.querySelector(".mfm-rv")!.textContent).toBe("0.99 Closely linked: about 98% of their weekly moves in common.");
    fireEvent.click(screen.getByRole("button", { name: "UTI Nifty 50 Index and SBI Small Cap: 0.15, barely linked" }));
    expect(r.querySelector(".mfm-rv")!.textContent).toBe("0.15 Barely linked: about 2% of their weekly moves in common.");
    expect(r.querySelector(".mfm-rm")!.textContent).toMatch(/^They hold none of the same stocks\./);
  });
  it("opens at any size; Expand ⤢ shows it on its own screen with its title and line; Close × and Esc close it; the reader stays beside it", { timeout: 30000 }, () => {
    const big30 = { ...SP, together: { ...SP.together, codes: Array.from({ length: 30 }, (_, i) => i + 1), C: Array.from({ length: 30 }, (_, i) => Array.from({ length: 30 }, (_, j) => (i === j ? 1 : 0.5))) },
      funds: Array.from({ length: 30 }, (_, i) => fund(i + 1, `Made Up Fund ${i + 1}`)) } as MfSpread;
    wrap(<MoveSection sp={big30} />);
    expect(document.querySelectorAll(".mfm-pair table.mfm-cg tbody tr")).toHaveLength(30);        // open at 30 funds, no fold
    expect(screen.queryByText(/Show the grid/)).toBeNull();
    const ex = screen.getByRole("button", { name: "Expand" });
    fireEvent.click(ex);
    const dlg = screen.getByRole("dialog", { name: "How your funds move together" });
    expect(within(dlg).getByText("Every pair of your 30 funds · darker cells move together more")).toBeTruthy();
    expect(dlg.querySelectorAll("table.mfm-cg-big tbody tr")).toHaveLength(30);
    expect(dlg.querySelector(".mfm-reader")).toBeTruthy();
    fireEvent.click(within(dlg).getAllByRole("button", { name: /Made Up Fund 3 and Made Up Fund 9/ })[0]);
    expect(dlg.querySelector(".mfm-reader .mfm-rn")!.textContent).toBe("Made Up Fund 3 and Made Up Fund 9");
    fireEvent.click(within(dlg).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector(".mfm-pair .mfm-reader .mfm-rn")!.textContent).toBe("Made Up Fund 3 and Made Up Fund 9");   // the page's reader follows
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(MF_CSS).toMatch(/\.wrap\.mfp \.mfm-pair > \.mfm-reader \{ position: sticky;/);   // task #390: .wrap.mfp (as specific as the old rule that left the ETF page out) now takes the ETF page too
  });
});

describe("Stocks they share (Mix 8)", () => {
  it("plain-case 13 px titles; pairs with no stock in common in one line; above 10 pairs, 8 then Show all", () => {
    const { cards, none } = sharedPairs(SP);
    expect([cards.length, none.length]).toEqual([13, 2]);
    expect(noneLine(["A · B", "C · D"])).toBe("2 pairs of funds share no stocks: A · B and C · D.");
    expect(noneLine(["A · B"])).toBe("1 pair of funds shares no stocks: A · B.");
    wrap(<SharedSection sp={SP} />);
    expect(document.querySelectorAll(".mfm-cards .mfm-card")).toHaveLength(8);
    expect(document.querySelector(".mfm-card .sp-cap")).toBeNull();
    expect(document.querySelector(".mfm-card .mfm-pt")!.textContent).toBe("Nippon India Large Cap · HDFC Balanced Advantage");
    expect(MF_CSS).toMatch(/\.mfm-card \.mfm-pt \{ margin: 0 0 4px; font: 600 var\(--fs-13\)/);
    expect(screen.getByText("2 pairs of funds share no stocks: UTI Nifty 50 Index · SBI Small Cap and SBI Small Cap · Mirae Asset ELSS Tax Saver.")).toBeTruthy();
    expect([...document.querySelectorAll(".mfm-rw b")].map((b) => b.textContent)).not.toContain("0%");
    fireEvent.click(screen.getByRole("button", { name: "Show all 13 pairs" }));
    expect(document.querySelectorAll(".mfm-cards .mfm-card")).toHaveLength(13);
    expect(screen.getByRole("button", { name: "Show fewer" })).toBeTruthy();
  });
  it("10 pairs or fewer show in full, with no button", () => {
    wrap(<SharedSection sp={{ ...SP, overlap: SP.overlap.slice(0, 10) } as MfSpread} />);
    expect(document.querySelectorAll(".mfm-cards .mfm-card").length).toBe(9);    // 10 pairs, one shares nothing
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });
});

describe("Biggest stocks underneath (Mix 9, W22)", () => {
  it("name first, share code under it", () => {
    const big: Big[] = [{ name: "HDFC Bank Limited", symbol: "HDFCBANK", macro: "Financial Services", size: "Large", w: 0.043, funds: [1, 3] },
      { name: "ITC LTD", symbol: "ITC", macro: "Fast Moving Consumer Goods", size: "Large", w: 0.018, funds: [1] },
      { name: "Alphabet Inc A", symbol: null, macro: null, size: null, w: 0.006, funds: [5] }];
    wrap(<BiggestSection rows={big} sp={SP} readingOf={() => null} gold />);
    const ths = [...document.querySelectorAll(".mfm-big tbody th")];
    expect(ths.map((t) => [t.firstChild!.textContent, t.querySelector("small")!.textContent])).toEqual([["HDFC Bank", "HDFCBANK"], ["ITC", "ITC"], ["Alphabet", "Not matched to a listed company"]]);
    expect(ths[0].querySelector("a")!.getAttribute("href")).toBe("/stocks/HDFCBANK");
    expect(ths[0].querySelector("a")!.getAttribute("title")).toBe("HDFC Bank Limited. Open the company report");
  });
});

describe("Words (fault 11, W17)", () => {
  it("no “most two” on the view", () => {
    expect(readingTiles(SP).find((t) => t.k === "overlap")!.line).toBe("What the two most alike funds hold in common.");
    wrap(<MixTab sp={SP} readingOf={() => null} gold big={[]} />);
    expect(document.body.textContent).not.toMatch(/most two/);
  });
});
