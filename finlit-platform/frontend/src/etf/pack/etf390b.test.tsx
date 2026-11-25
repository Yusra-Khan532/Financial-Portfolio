// @vitest-environment jsdom
// Task #390 PR B (developer file 34, What's inside and Risk analytics, Update 25 Nov rows 3 to 7, Build these too, Words, faults 2, 4, 8, 9, 10) on a MADE-UP
// list: seven ETFs that are not the member's (NIF100BEES, JUNIORBEES, BANKBEES, ITBEES, HDFCGOLD, SILVERIETF, MON100) with invented quantities, the same
// list with a liquid ETF (LIQUIDBEES), a 15-ETF list, and the 7-ETF list with every quantity in. The figures are the backend's own functions on live
// public data (prices, fund-house files, the Nifty 500); no member's list, quantity or figure is in this file or its fixtures.
import LIST from "../../lib/__fixtures__/etfp390-made-list.json";
import INSIDE from "../../lib/__fixtures__/etfp390-made-inside.json";
import RISK from "../../lib/__fixtures__/etfp390-made-risk.json";
import LIQ_LIST from "../../lib/__fixtures__/etfp390-liquid-list.json";
import LIQ_RISK from "../../lib/__fixtures__/etfp390-liquid-risk.json";
import LONG_LIST from "../../lib/__fixtures__/etfp390-long-list.json";
import LONG_INSIDE from "../../lib/__fixtures__/etfp390-long-inside.json";
import LONG_RISK from "../../lib/__fixtures__/etfp390-long-risk.json";
import VALUED_RISK from "../../lib/__fixtures__/etfp390-valued-risk.json";
import { readFileSync } from "node:fs";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
import { InsideTab, noneLine, pairText, pairWords, sharedPairs } from "./EtfInside";
import { RiskTab, buildSteps, overallEtf, sumLine } from "./EtfRisk";
import { shortLines } from "./EtfShort";
import { LevelSwitch } from "../../mf/pack/MfMix";
import { StepCtx } from "../../portfolio/pack/EqSteps385";
import type { EtfPortfolio, EtfRisk, Inside } from "../../lib/etfPortfolio";

afterEach(() => { cleanup(); localStorage.clear(); });
const d = LIST as unknown as EtfPortfolio, ins = INSIDE as unknown as Inside, rk = RISK as unknown as EtfRisk;
const dL = LIQ_LIST as unknown as EtfPortfolio, rkL = LIQ_RISK as unknown as EtfRisk;
const d15 = LONG_LIST as unknown as EtfPortfolio, ins15 = LONG_INSIDE as unknown as Inside, rk15 = LONG_RISK as unknown as EtfRisk, rkV = VALUED_RISK as unknown as EtfRisk;
const wrap = (ui: React.ReactNode) => render(<MemoryRouter>{ui}</MemoryRouter>);
const text = () => document.body.textContent ?? "";
const tab = (name: RegExp) => fireEvent.click(screen.getByRole("tab", { name }));

describe("What's inside (file 34, I1 to I8, Update row 6, fault 9 on the page)", () => {
  it("I1: the three sub-view tabs sit at the top of the view, above What they own", () => {
    wrap(<InsideTab d={d} ins={ins} rk={rk} />);
    const bar = screen.getByRole("tablist", { name: "What's inside views" }), own = document.getElementById("etp-own")!;
    expect(bar.compareDocumentPosition(own) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(document.body.firstElementChild!.firstElementChild).toBe(bar);
    expect(screen.getAllByRole("tab").map((t) => t.querySelector("b")!.textContent)).toEqual(["What your money is in", "How ETFs move together", "Large, mid, small and micro"]);
  });
  it("I1: with one step chosen, the tab that holds it is selected and a tab opens its sub-view's first step", () => {
    const got: string[] = [], on = (e: Event) => got.push((e as CustomEvent).detail);
    addEventListener("eq-step", on);
    wrap(<StepCtx.Provider value={{ step: "etp-shared", firstStep: "etp-own" }}><InsideTab d={d} ins={ins} rk={rk} /></StepCtx.Provider>);
    expect(screen.getByRole("tab", { name: /How ETFs move together/ }).getAttribute("aria-selected")).toBe("true");
    tab(/Large, mid, small and micro/);
    removeEventListener("eq-step", on);
    expect(got).toEqual(["etp-sizes"]);
  });
  it("I2, I3, W16, W21: chips show the company's short name (abbreviations in capitals), the full name in the title, \"N companies\", one dashed +N more", () => {
    wrap(<InsideTab d={d} ins={ins} rk={rk} />);
    const names = [...document.querySelectorAll(".mfm-g .mfm-chip .mfm-cn")].map((c) => c.textContent);
    expect(names).toContain("HDFC Bank"); expect(names).toContain("Infosys"); expect(names).toContain("TCS");
    expect(names.some((n) => /^[A-Z0-9&]{6,}$/.test(n!) && n !== "HDFC Bank")).toBe(false);               // no share code as a chip's text
    const hdfc = screen.getByText("HDFC Bank", { selector: ".mfm-cn" }).closest(".mfm-chip")!;
    expect(hdfc.getAttribute("title")).toMatch(/^HDFC Bank Ltd: [\d.]+% of your list/);
    const counts = [...document.querySelectorAll(".mfm-g .mfm-cw")].map((c) => c.textContent!);
    expect(counts.every((c) => /· [\d,]+ compan(y|ies)$/.test(c))).toBe(true);
    expect(counts.some((c) => /· 1 company$/.test(c))).toBe(true);
    expect(text()).not.toMatch(/\d cos\b|\b1 co\b/);
    expect(document.querySelectorAll(".mfm-g button.eq-more")).toHaveLength(0);
    expect(document.querySelectorAll(".mfm-g button.mfm-more").length).toBeGreaterThan(0);
    expect(document.querySelector(".mfm-g")!.classList.contains("mfm-gn")).toBe(true);
  });
  it("nearby (a): the level switch says \"in your ETFs\" on the ETF page and \"in your funds\" on the MF page", () => {
    wrap(<InsideTab d={d} ins={ins} rk={rk} />);
    expect(screen.getAllByRole("button", { name: /^Macro sector · 12/ })[0].textContent).toMatch(/\(\d+ in your ETFs\)$/);
    expect(text()).not.toMatch(/in your funds/);
    cleanup();
    render(<LevelSwitch level="macro" onLevel={() => {}} sp={{ lookThrough: ins.lookThrough }} />);
    expect(screen.getByRole("button", { name: /^Macro sector · 12/ }).textContent).toMatch(/in your funds\)$/);
  });
  it("I4, F7: Sectors inside each share ETF keeps its heat table (the plain-case, 96 px headers come from the shared .wrap.mfp rule)", () => {
    const css = readFileSync("src/mf/pack/mf-pack.css", "utf8");
    expect(css).toMatch(/\.wrap\.mfp \.mfm-heat thead th \{ min-width: 96px; text-transform: none; letter-spacing: 0; font-size: var\(--fs-12\); white-space: normal;/);
    expect(css).toMatch(/\.wrap\.mfp \.mfm-subtabs button\[aria-selected="true"\] small \{ color: color-mix\(in srgb, var\(--ui-on-fg\) 78%, transparent\); \}/);
    expect(css).not.toMatch(/:not\(\.efp\)/);
    wrap(<InsideTab d={d} ins={ins} rk={rk} />);
    expect([...document.querySelectorAll(".mfm-heat thead th span")].map((s) => s.textContent)).toContain("Information Technology");
  });
  it("I5: the pair's figure in words, then the part of their weekly moves in common; real minus signs", () => {
    expect(pairWords(0.81)).toBe("Closely linked: about 66% of their weekly moves in common.");
    expect(pairWords(0.5)).toBe("Partly linked: about 25% of their weekly moves in common.");
    expect(pairWords(0.3)).toBe("Loosely linked: about 9% of their weekly moves in common.");
    expect(pairWords(0.1)).toBe("Barely linked: about 1% of their weekly moves in common.");
    expect(pairText(d, ins, rk, "BANKBEES", "JUNIORBEES")).toBe("BANKBEES and JUNIORBEES: 0.78. Closely linked: about 61% of their weekly moves in common. They keep 6.8% of their money in the same 4 stocks. The same kind of asset, different indexes, the same fund house.");
    expect(pairText(d, ins, rk, "BANKBEES", "HDFCGOLD")).toMatch(/^BANKBEES and HDFCGOLD: −0\.16\. Barely linked: about 3% of their weekly moves in common\./);
    wrap(<InsideTab d={d} ins={ins} rk={rk} />);
    tab(/How ETFs move together/);
    expect(document.querySelector(".mfm-reader .mfm-cwd")!.textContent).toMatch(/linked: about \d+% of their weekly moves in common\.$/);
    expect([...document.querySelectorAll(".mfm-cg td button")].some((b) => b.textContent!.startsWith("−"))).toBe(true);
    expect([...document.querySelectorAll(".mfm-cg td button")].some((b) => b.textContent!.startsWith("-"))).toBe(false);
  });
  it("U6, B3: the grid opens at any list size; Expand ⤢ shows it on its own screen with its title and line; Close × and Esc close it", () => {
    wrap(<InsideTab d={d} ins={ins} rk={rk} />);
    tab(/How ETFs move together/);
    const n = rk.together.symbols.length;
    expect(document.querySelectorAll(".mfm-pair .mfm-cg tbody tr")).toHaveLength(n);
    fireEvent.click(screen.getByRole("button", { name: /Expand/ }));
    const dlg = screen.getByRole("dialog", { name: "How your ETFs move together" });
    expect(dlg.textContent).toMatch(new RegExp(`Every pair of your ${n} ETFs · darker cells move together more`));
    fireEvent.click(within(dlg).getByRole("button", { name: /Close/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Expand/ }));
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("I6: plain-case card titles; pairs that share no stocks leave the cards for one line under them", () => {
    const { cards, none } = sharedPairs(ins);
    expect(cards.every((o) => o.n > 0 && o.pct > 0)).toBe(true); expect(none.every((o) => o.n === 0)).toBe(true);
    wrap(<InsideTab d={d} ins={ins} rk={rk} />);
    tab(/How ETFs move together/);
    const titles = [...document.querySelectorAll("#etp-pairs .mfm-card .mfm-pt")].map((t) => t.textContent);
    expect(titles[0]).toBe("BANKBEES · NIF100BEES");
    expect(titles).toHaveLength(cards.length);
    expect(document.querySelectorAll("#etp-pairs .sp-cap")).toHaveLength(0);
    expect(text()).not.toMatch(/0\.0%No shared stocks|No shared stocks/);
    expect(document.querySelector(".mfm-none")!.textContent).toBe(noneLine(none.map((o) => `${o.a} · ${o.b}`)));
    expect(noneLine(["A · B", "C · D", "E · F"])).toBe("3 pairs of share ETFs share no stocks: A · B, C · D and E · F.");
    expect(noneLine(["A · B"])).toBe("1 pair of share ETFs shares no stocks: A · B.");
  });
  it("I6c: above 10 pairs, 8 show, then Show all N pairs (the 15-ETF list)", () => {
    const n = sharedPairs(ins15).cards.length;
    expect(n).toBeGreaterThan(10);
    wrap(<InsideTab d={d15} ins={ins15} rk={rk15} />);
    tab(/How ETFs move together/);
    expect(document.querySelectorAll("#etp-pairs .mfm-card:not(.dashed):not(.theme)")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`Show all ${n} pairs`) }));
    expect(document.querySelectorAll("#etp-pairs .mfm-card:not(.dashed):not(.theme)")).toHaveLength(n);
  });
  it("I7: Largest stocks underneath, the name first and the share code under it", () => {
    wrap(<InsideTab d={d} ins={ins} rk={rk} />);
    const first = document.querySelector(".mfm-big tbody th")!;
    expect(first.querySelector("a")!.textContent).toBe("Infosys");
    expect(first.querySelector("a")!.getAttribute("title")).toBe("Infosys Ltd. Open the company report");
    expect(first.querySelector("small")!.textContent).toBe("INFY");
  });
  it("F4: no list in the ETF view files is joined as \"A and B and C\"", () => {
    for (const f of ["EtfInside.tsx", "EtfRisk.tsx", "EtfShort.tsx"]) expect(readFileSync(`src/etf/pack/${f}`, "utf8")).not.toMatch(/join\(["'`][^"'`]*and /);
    wrap(<InsideTab d={d15} ins={ins15} rk={rk15} />);
    expect(text()).not.toMatch(/\b[A-Z0-9]{4,} and [A-Z0-9]{4,} and\b/);
  });
  it("IB1: every i on the view has its own label", () => {
    wrap(<InsideTab d={d} ins={ins} rk={rk} />);
    const labels = [...document.querySelectorAll("button.sp-i")].map((b) => b.getAttribute("aria-label"));
    expect(labels.length).toBeGreaterThan(0); expect(labels).not.toContain("What does this mean?"); expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("Risk analytics (file 34, R1 to R7, O1 to O6, Update rows 3 to 5, faults 2, 8, 10)", () => {
  it("R1, F8, W7 to W10, U4c: the six range names from their keys, in one pass; no second description line", () => {
    wrap(<RiskTab rk={rk} d={d} ins={ins} />);
    expect(text()).not.toMatch(/Defensive|Relatively defensive|than its market/);
    expect([...document.querySelectorAll(".mfr-ranges .eqr-range > .eqr-chip")].map((c) => c.textContent)).toEqual(["Much less sensitive", "Less sensitive", "Similar", "More sensitive", "High", "Very high"]);
    expect(document.querySelector(".eqr-sum .eqr-chip")!.textContent).toBe("Much less sensitive");       // the list's 0.58 (the server's key "less")
    expect([...document.querySelectorAll(".eqr-bands span")].map((s) => s.textContent)).toEqual(["Much less sensitive", "Less sensitive", "Similar", "More sensitive", "High", "Very high"]);
  });
  it("R2, F10, W5, W11 to W13, W15, R7: \"Moves with the Nifty 500\", \"0.58×\", \"Your ETFs move 0.58× as much as the Nifty 500\", \"points\"; no β, no pts", () => {
    wrap(<RiskTab rk={rk} d={d} ins={ins} />);
    expect(text()).not.toMatch(/β|Beta, Nifty 500|Your ETFs' beta|\bpts\b|Average beta|Adds to the list's beta/);
    expect(screen.getAllByText("Moves with the Nifty 500").length).toBeGreaterThanOrEqual(2);                   // the tile and the Each ETF's risk header
    expect(document.querySelector(".fx-src, .fx-note")).toBeTruthy();
    expect(text()).toMatch(/Your ETFs move 0\.58× as much as the Nifty 500, past year of weekly prices/);
    expect(text()).toMatch(/\d\.\d points? less than the Nifty 500’s 10%/);
  });
  it("F2, R3, B7: no \"Without the liquid ETF\" box and no \"Liquid counts as 0\" on a list without a liquid ETF; both on a list with one", () => {
    wrap(<RiskTab rk={rk} d={d} ins={ins} />);
    expect(text()).not.toMatch(/Without the liquid ETF|Liquid counts as 0|liquid ETFs as 0/);
    expect(document.querySelectorAll(".eqr-b3 .eqr-tile")).toHaveLength(2);
    expect(document.querySelector(".eqr-b3")!.classList.contains("etp-b2")).toBe(true);
    cleanup();
    wrap(<RiskTab rk={rkL} d={dL} />);
    expect(screen.getByText("Without the liquid ETF")).toBeTruthy();
    expect(text()).toMatch(/Liquid counts as 0: it follows no share index\. The headline reading\./);
    expect(document.querySelectorAll(".eqr-b3 .eqr-tile")).toHaveLength(3);
  });
  it("U3: the figures are labels on the scale itself, the list's filled", () => {
    wrap(<RiskTab rk={rk} d={d} ins={ins} />);
    const labs = [...document.querySelectorAll(".mfr .eqb-lab")];
    expect(labs.map((l) => l.textContent)).toEqual(["0.58Your list", "0.91Indian share ETFs"]);
    expect(labs[0].classList.contains("list")).toBe(true);
    expect(document.querySelectorAll(".eqr-pin")).toHaveLength(0);
  });
  it("U4, R5: six boxes of one size: 3 ETFs then +N more (a pop-up listing all; a name placed on the scale closes it); an empty range says None of your ETFs", () => {
    wrap(<RiskTab rk={rk} d={d} ins={ins} />);
    const boxes = [...document.querySelectorAll(".mfr-ranges .eqr-range")];
    expect(boxes).toHaveLength(6);
    const less = boxes[0];
    expect(less.querySelectorAll("ul > li")).toHaveLength(3);
    expect(less.querySelector(".eqr-n")!.textContent).toBe("4 ETFs · 57%");
    fireEvent.click(within(less as HTMLElement).getByRole("button", { name: "+1 more" }));
    const pop = screen.getByRole("dialog", { name: "Much less sensitive · 4 ETFs · 57%" });
    expect(pop.querySelectorAll("li")).toHaveLength(4);
    fireEvent.click(within(pop).getByRole("button", { name: "SILVERIETF" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect([...document.querySelectorAll(".eqb-lab.pick")].map((l) => l.textContent)).toEqual(["−0.02SILVERIETF"]);
    expect(boxes[3].querySelector("li.mfr-none")!.textContent).toBe("None of your ETFs");
    expect(less.querySelector(".etp-badge")).toBeTruthy();
  });
  it("U5: \"Moves, on average 0.91×\", \"Adds to the list's figure\", real minus signs in the cards", () => {
    wrap(<RiskTab rk={rk} d={d} ins={ins} />);
    const dts = [...document.querySelectorAll(".eqr-card dl dt")].map((t) => t.textContent);
    expect(dts).toContain("Moves, on average"); expect(dts).toContain("Adds to the list's figure");
    expect(document.querySelector(".eqr-card dl dd")!.textContent).toMatch(/^\d\.\d\d×$/);
    expect(sumLine([0.59, -0.01, 0])).toBe("0.59 − 0.01 + 0.00");
    expect(text()).not.toMatch(/\+ -\d|(^|\s)-0\.\d\d/);
  });
  it("R4, O1 to O6: \"ETF +x%\" and \"Nifty 500 +y%\" on one line each, and the Overall column", () => {
    expect(overallEtf({ downPer100: 97, upPer100: 111, betaPast: 1 } as EtfRisk["etfs"][number])).toEqual({ word: "Rises more, falls less", tone: "g" });
    expect(overallEtf({ downPer100: 104, upPer100: 92, betaPast: 1 } as EtfRisk["etfs"][number])).toEqual({ word: "Rises less, falls more", tone: "r" });
    expect(overallEtf({ downPer100: 102, upPer100: 106, betaPast: 1 } as EtfRisk["etfs"][number])!.word).toBe("Moves more both ways");
    expect(overallEtf({ downPer100: 95, upPer100: 92, betaPast: 1 } as EtfRisk["etfs"][number])!.word).toBe("Moves less both ways");
    expect(overallEtf({ downPer100: null, upPer100: null, betaPast: 0.02 } as EtfRisk["etfs"][number])).toEqual({ word: "Moves on its own market", tone: "x" });
    wrap(<RiskTab rk={rk} d={d} ins={ins} />);
    const row = (s: string) => [...document.querySelectorAll("#etp-n500-t tbody tr")].find((r) => r.querySelector("th")!.firstChild!.textContent === s)!;
    expect(row("BANKBEES").querySelector(".mfr-ov")!.textContent).toBe("Rises more, falls less");
    expect(row("JUNIORBEES").querySelector(".mfr-ov")!.textContent).toBe("Moves more both ways");
    expect(row("NIF100BEES").querySelector(".mfr-ov")!.textContent).toBe("Moves less both ways");
    expect(row("HDFCGOLD").querySelector(".mfr-ov")!.textContent).toBe("Moves on its own market");
    expect([...row("BANKBEES").querySelectorAll(".mfr-yi")].map((x) => x.textContent)).toEqual(["ETF +10.3%", "Nifty 500 +1.3%"]);
  });
  it("R6a: every column of the risk tables sorts (Overall by rank, a blank last both ways)", () => {
    wrap(<RiskTab rk={rk} d={d} ins={ins} />);
    const t = document.getElementById("etp-n500-t")!;
    expect(t.querySelectorAll("thead th button.eqs-sort")).toHaveLength(6);
    fireEvent.click(within(t).getByRole("button", { name: /^Overall/ }));
    const ov = () => [...t.querySelectorAll("tbody tr td:last-child")].map((c) => c.textContent);
    expect(ov().slice(0, 3)).toEqual(["Rises more, falls less", "Moves more both ways", "Moves less both ways"]);
    fireEvent.click(within(t).getByRole("button", { name: /^Overall/ }));
    expect(ov()[0]).toBe("Moves less both ways");
    expect(document.querySelectorAll("#etp-each-t thead th button.eqs-sort")).toHaveLength(7);
    expect(document.querySelectorAll("#etp-rs-t thead th button.eqs-sort")).toHaveLength(3);
  });
  it("R6b, B4, B5: above 12 ETFs, 10 rows then Show all 15 ETFs; the fall bars the 10 deepest", () => {
    wrap(<RiskTab rk={rk15} d={d15} ins={ins15} />);
    for (const id of ["etp-n500-t", "etp-each-t", "etp-rs-t"]) expect(document.querySelectorAll(`#${id} tbody tr`)).toHaveLength(10);
    const all = screen.getAllByRole("button", { name: /Show all 15 ETFs/ });
    expect(all.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(all[0]);
    expect(document.querySelectorAll("#etp-n500-t tbody tr")).toHaveLength(15);
    cleanup();
    // B4: with every compared ETF in the fall (none left out), 14 parts: the 10 deepest show, then Show all 14 ETFs; the market and Your ETFs stay first
    const rkF = { ...rk15, own: { ...rk15.own!, list: { ...rk15.own!.list, leftOutOfFall: [] } } } as EtfRisk;
    expect(rkF.etfs.filter((e) => e.betaPast != null && e.compared !== false)).toHaveLength(14);
    wrap(<RiskTab rk={rkF} d={d15} ins={ins15} />);
    const fall = document.getElementById("etp-fall")!.closest("section")!;
    expect(within(fall).getByRole("button", { name: /Show all 14 ETFs/ })).toBeTruthy();
    const bars = fall.querySelector(".fx-ch")!.getAttribute("aria-label")!;
    expect(bars).toMatch(/^If the Nifty 500 fell 10%: Nifty 500 −10\.0%; Your ETFs −[\d.]+%;/);
    expect(bars.split("; ")).toHaveLength(12);
    cleanup();
    wrap(<RiskTab rk={rk} d={d} ins={ins} />);
    expect(screen.queryByRole("button", { name: /Show all \d+ ETFs/ })).toBeNull();
  });
  it("W22, B6: step 5 says \"By count now; by money once quantities are in\" while an ETF has no quantity, \"By what you hold now\" once all have", () => {
    expect(buildSteps(rk)[4]).toEqual(["Weight by the list", "By count now; by money once quantities are in"]);
    expect(rkV.basis).toBe("value");
    expect(buildSteps(rkV)[4]).toEqual(["Weight by the list", "By what you hold now"]);
  });
  it("In short: the risk line in the new words; lists as \"A, B and C\"", () => {
    const risk = shortLines(d, ins, rk).find(([k]) => k === "Risk")![1];
    expect(risk).toMatch(/^The four Indian share ETFs move almost as one with the market\. Gold, shares abroad and silver bring the list down: it moves 0\.58× as much as the Nifty 500\.$/);
    expect(risk).not.toMatch(/beta/);
  });
  it("IB1: every i on the view has its own label, none twice", () => {
    wrap(<RiskTab rk={rk} d={d} ins={ins} />);
    const labels = [...document.querySelectorAll("button.sp-i")].map((b) => b.getAttribute("aria-label"));
    expect(labels).not.toContain("What does this mean?"); expect(new Set(labels).size).toBe(labels.length);
  });
});
