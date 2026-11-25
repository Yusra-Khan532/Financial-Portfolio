// @vitest-environment jsdom
// Task #183 part 3 (ETF portfolio, pack 03 §3, §4 and "Changes of 15 Nov (afternoon)"): What's inside (the macro sector · 12 | sector · 22 × size look-through
// adding up to the list's share in Indian shares, "+N more", the three sub-tabs opened by the sections bar, the pair reader, Same index twice, sizes with the ₹
// note, largest stocks 5 then 8) and Risk analytics (every ETF against the Nifty 500, the beta build by type adding up to the list's beta with liquid as 0,
// the three figures, "Different asset" where R² < 0.2, risk shares adding to 100%, a 10% fall with gold and shares abroad left out, each ETF's risk).
// Figures: the new server code on live public data of 18 Nov for the pack's seven ETFs.
import LIST from "../../lib/__fixtures__/etfp-list.json";
import RISK from "../../lib/__fixtures__/etfp-risk.json";
import INSIDE from "../../lib/__fixtures__/etfp-inside.json";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { InsideTab, assetBar, etfSplit, pairText, restLine } from "./EtfInside";
import { RiskTab, byType, glanceTiles, riskLede } from "./EtfRisk";
import { listBox, movesLike, yearlyCost } from "../../lib/etfTop";
import type { EtfPortfolio, EtfRisk, Inside } from "../../lib/etfPortfolio";

afterEach(() => { cleanup(); localStorage.clear(); });
const d = LIST as unknown as EtfPortfolio, ins = INSIDE as unknown as Inside, rk = RISK as unknown as EtfRisk;
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe("the top of the page's sums", () => {
  it("counts by type, averages the cost and works out how many independent ETFs the list moves like", () => {
    expect(listBox(d)).toEqual({ n: 7, line: "4 Indian shares · 1 gold · 1 shares abroad · 1 liquid.", weights: "Every ETF counts the same until you add quantities.", valued: false });
    expect(yearlyCost(d).avg).toBeCloseTo((0.05 + 0.05 + 0.28 + 0.31 + 0.81 + 0.6 + 0.28) / 7, 3);
    const mv = movesLike(rk)!;
    const C = rk.together.pairs.reduce((a, p) => a + 2 * (p.r as number) ** 2, 6);
    expect(mv.of).toBe(6); expect(mv.independent).toBeCloseTo(36 / C, 6);
  });
});

describe("What's inside (pack 03 §3)", () => {
  it("adds the grid up to the list's share in Indian shares at both levels, opens a cell, and keeps the level", () => {
    wrap(<InsideTab d={d} ins={ins} rk={rk} />);
    expect(document.querySelector(".mfm-g tfoot")!.textContent).toMatch(/All macro sectors · 12.*42\.7% in Indian shares/);
    const first = document.querySelector(".mfm-g tbody tr th")!.textContent;
    expect(first).toBe("Financial Services");
    // task #390 (file 34, I2): chips show the company's short name; the "+N more" pill is the dashed one (.mfm-more)
    const cell = screen.getByText("HDFC Bank", { selector: ".mfm-cn" }).closest("td")!;
    expect(cell.querySelectorAll(".mfm-chip")).toHaveLength(4);
    fireEvent.click(cell.querySelector("button.mfm-more")!);
    expect(cell.querySelectorAll(".mfm-chip")).toHaveLength(35);
    expect(screen.getByText(/The rest: HDFCSML250, not loaded \(14%\), gold, shares abroad and liquid \(43%\)\./)).toBeTruthy();
    expect(restLine(d, ins)).toBe("The rest: HDFCSML250, not loaded (14%), gold, shares abroad and liquid (43%).");
    fireEvent.click(screen.getAllByRole("button", { name: /^Sector · 22/ })[0]);
    expect(localStorage.getItem("finlit-etf-level")).toBe("sector");
    expect(document.querySelectorAll(".mfm-g tbody tr")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Show all 19 sectors ▾" }));
    expect(document.querySelectorAll(".mfm-g tbody tr")).toHaveLength(19);
    expect(document.querySelector(".mfm-g tfoot")!.textContent).toMatch(/42\.7% in Indian shares/);
  });
  it("splits the money by asset, opens the sub-tab a section sits in, reads a pair and names the same index twice", () => {
    wrap(<InsideTab d={d} ins={ins} rk={rk} />);
    const bar = assetBar(d, ins);
    expect([bar.indian, bar.notLoaded, bar.abroad, bar.gold, bar.debt].map((x) => Math.round(x))).toEqual([43, 14, 14, 14, 15]);
    expect(etfSplit(ins, "GOLDBEES")!.map((x) => [x.k, Math.round(x.v)])).toEqual([["Gold", 98], ["Cash and other", 2]]);   // gold sits on the file's "other" line
    expect(etfSplit(ins, "NIFTYBEES")!.map((x) => [x.k, Math.round(x.v)])).toEqual([["Indian shares", 100]]);
    expect(etfSplit(ins, "LIQUIDCASE")).toEqual([{ k: "Overnight lending", v: 100, c: "etp-zD" }]);
    expect(etfSplit(ins, "HDFCSML250")).toBeNull();
    expect(screen.getByText(/MON100's five largest holdings · listed abroad/)).toBeTruthy();
    expect(screen.getByText("Not compared with FinLit readings: listed abroad.")).toBeTruthy();
    act(() => { dispatchEvent(new CustomEvent("eq-jump", { detail: "etp-move" })); });
    expect(screen.getByRole("tab", { name: /How ETFs move together/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText(/LIQUIDCASE is left out\./)).toBeTruthy();
    // task #390 (file 34, I5): the figure in words, then the part of their weekly moves in common
    expect(pairText(d, ins, rk, "NIFTYBEES", "SBINIFTY50")).toBe("NIFTYBEES and SBINIFTY50: 1.00. Closely linked: about 100% of their weekly moves in common. They keep 100.0% of their money in the same 50 stocks. The same index, different fund houses.");
    expect(pairText(d, ins, rk, "NIFTYBEES", "GOLDBEES")).toBe("NIFTYBEES and GOLDBEES: 0.03. Barely linked: about 0% of their weekly moves in common. Different kinds of asset, the same fund house.");
    expect(document.querySelector(".etp-twicecard")!.textContent).toMatch(/NIFTYBEES \(Nippon India\) and SBINIFTY50 \(SBI\) · same 50 stocks · move together 1\.00 · costs and trading differ: NIFTYBEES trades ₹[\d,.]+ Cr a day, SBINIFTY50 ₹[\d,.]+ Cr\./);
    expect(screen.getByText("HDFCSML250 and the others")).toBeTruthy();
    act(() => { dispatchEvent(new CustomEvent("eq-jump", { detail: "etp-sizes" })); });
    expect(screen.getByText("The midcap ETF is mostly large here")).toBeTruthy();
    expect(screen.getByText(/MID150BEES reads 74% large and 25% mid on FinLit's ₹ sizes/)).toBeTruthy();
    expect(screen.getByText(/SEBI's fund categories rank companies instead/)).toBeTruthy();
  });
  it("shows the largest Indian stocks, 5 then all 8, with who holds them and the plan's reading", () => {
    wrap(<InsideTab d={d} ins={ins} rk={rk} />);
    expect(document.querySelectorAll(".mfm-big tbody tr")).toHaveLength(5);
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toContain("FinLit Prism");
    fireEvent.click(screen.getByRole("button", { name: "Show all 8 ▾" }));
    // task #390 (file 34, I7): the company's short name first, its share code under it
    expect([...document.querySelectorAll(".mfm-big tbody th a")].map((a) => a.textContent)).toEqual(["HDFC Bank", "ICICI Bank", "Reliance Industries", "Bharti Airtel", "Larsen & Toubro", "Infosys", "State Bank of India", "Axis Bank"]);
    expect([...document.querySelectorAll(".mfm-big tbody th small")].map((a) => a.textContent).slice(0, 2)).toEqual(["HDFCBANK", "ICICIBANK"]);
    expect(document.querySelector(".mfm-big tbody tr")!.textContent).toMatch(/Financial Services.*2\.84%.*NIFTYBEESSBINIFTY50/);
  });
});

describe("Risk analytics (pack 03 §4)", () => {
  it("leads against the Nifty 500, with the window of each figure", () => {
    expect(riskLede(rk)).toEqual({ lead: "Your list moves less than the Indian market.", rest: "It has moved 0.63% for every 1% move in the Nifty 500, and over 3 years it has swung 10.6% in a typical year against 14.6% for the Nifty 500 (3 yrs, daily)." });
    expect(glanceTiles(rk).map((t) => [t.k, t.v, t.vs])).toEqual([["Typical swing in a year · 3 yrs", "10.6%", "Nifty 500: 14.6% (3 yrs, daily)"], ["Worst fall from a high · 3 yrs", "−8.8%", "Nifty 500: −18.8%"],
      ["In the 10 worst weeks · past year", "−1.6%", "Nifty 500: −2.8%"], ["Moves with the Nifty 500", "0.63×", "market: 1.00×"]]);   // task #390 (file 34, R2a, W11)
  });
  it("builds the list's beta by type, liquid as 0, and shows the three figures and the readings", () => {
    const g = byType(rk);
    expect(g.map((x) => [x.word, x.n, x.adds])).toEqual([["Indian shares", 4, 0.56], ["Gold", 1, 0], ["Shares abroad", 1, 0.07], ["Liquid", 1, 0]]);
    expect(g.reduce((a, x) => a + (x.adds ?? 0), 0)).toBeCloseTo(rk.own!.list.betaOwn!, 1);
    wrap(<RiskTab rk={rk} d={d} ins={ins} />);
    expect(screen.getByText(/An index ETF copies its own index, so its beta against that index is about 1 by design/)).toBeTruthy();
    expect([...document.querySelectorAll(".eqr-b3 .eqr-v b")].map((b) => b.textContent)).toEqual(["0.63", "0.74", "0.98"]);
    // task #390 (file 34, Update row 3): the figures are labels on the scale itself (RiskPack BetaScale)
    expect([...document.querySelectorAll(".eqb-lab")].map((p) => p.textContent)).toEqual(["0.63Your list", "0.98Indian share ETFs"]);
    expect(screen.queryByRole("button", { name: "LIQUIDCASE" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "GOLDBEES" }));
    expect(screen.getByText(/GOLDBEES: 0\.02 against the Nifty 500, much less sensitive; 0% of its moves explained by it\. A different asset: the beta says little\./)).toBeTruthy();
    expect(screen.getByText("A low beta is not a calm ride")).toBeTruthy();
  });
  it("tags different assets, adds the risk to 100%, and leaves gold and shares abroad out of the 10% fall", () => {
    wrap(<RiskTab rk={rk} d={d} ins={ins} />);
    const tr = (s: string) => [...document.querySelectorAll(".eqr-sb tbody tr")].find((r) => r.querySelector("th")!.firstChild!.textContent === s)!;
    expect(tr("GOLDBEES").textContent).toMatch(/Different asset/); expect(tr("MON100").textContent).toMatch(/Different asset/);
    expect(tr("NIFTYBEES").textContent).not.toMatch(/Different asset/);
    expect(tr("GOLDBEES").querySelectorAll("td.r")[1].textContent).toBe("–");
    const risk = [...document.querySelectorAll(".eqr-rs tbody td:last-child")].map((t) => parseFloat(t.textContent!));
    expect(Math.round(risk.reduce((a, b) => a + b, 0))).toBe(100);
    // task #235 (pack C4): the fall as the Equity page's picture, against the Nifty 500
    expect(document.querySelector(".fx-big b")!.textContent).toBe("−6.3%");
    expect(document.querySelector(".fx-rs")!.textContent).toBe("In rupees−₹63,000on ₹10 lakh");
    fireEvent.click(screen.getByRole("button", { name: "Indian share ETFs only" }));
    expect(document.querySelector(".fx-big b")!.textContent).toBe("−9.8%");
    expect(document.querySelector(".fx-note")!.textContent).toMatch(/GOLDBEES and MON100 are left out: the Nifty 500 explains too little of their moves to size a fall\./);
    expect(document.querySelector(".fx-note")!.textContent).toMatch(/Gold and silver ETFs do not follow the index closely/);
    expect(screen.getByRole("heading", { name: /If the Nifty 500 fell 10%/ })).toBeTruthy();
    const each = [...document.querySelectorAll(".eqr-each tbody tr")];
    expect(each.find((r) => r.textContent!.startsWith("MON100"))!.textContent).toMatch(/\+20\.8% against its NAV · Moves on its own market · More risk than its share$/);
    expect(each.find((r) => r.textContent!.startsWith("HDFCSML250"))!.textContent).toMatch(/Holdings file not loaded/);
    expect(each.find((r) => r.textContent!.startsWith("NIFTYBEES"))!.textContent).toMatch(/Same index as another ETF/);
  });
});
