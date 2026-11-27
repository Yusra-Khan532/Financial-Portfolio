// @vitest-environment jsdom
// Task #235 phase 2 (the 18 Nov portfolios pack): the view tabs (B2), the Analysing bar (B10), the sticky switcher with its menus (B12) and the
// Key figures drop-downs (B15). The spread cards (B3), the beta tabs (B4) and the size of the fall (B8) are in pack/riskPack183 and pack/divPack183.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalysingBar } from "./Portfolios";
import { StickySwitch } from "./ViewKit";
import { ViewTabs, eqViews } from "./pack/EquityPack";
import { KeyFigures } from "./pack/PageTop";
import { keyDrop } from "./pack/KeyDrops";
import type { Share } from "../lib/equityPack";

vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: null }) }));
afterEach(cleanup);
const PFS = [{ id: "dhan", name: "Dhan" }, { id: "upstox", name: "Upstox" }];
const figs = (id: string) => (id === "all" ? { n: 9, now: 389_000, withQty: 9, gainPct: 21.4 } : id === "dhan" ? { n: 6, now: 274_000, withQty: 6, gainPct: 34.2 } : { n: 3, now: 115_000, withQty: 3, gainPct: -2.1 });

describe("view tabs (B2)", () => {
  it("label above, a colour and icon per view, the selected one marked; arrow keys move", () => {
    const on = vi.fn();
    render(<ViewTabs view="portfolio" onView={on} n={9} />);
    expect(screen.getByText("Choose a view").textContent).toBe("Choose a view 3 views of your list · tap one");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => [t.querySelector("b")!.textContent, t.getAttribute("aria-selected"), (t as HTMLElement).style.getPropertyValue("--va")])).toEqual([
      ["Portfolio", "true", "#0e6471"], ["Diversification analytics", "false", "#4b4fc4"], ["Risk analytics", "false", "#a24a17"]]);   // task #274 (change 11): the darker orange, 4.5:1 or more on the bar
    expect(tabs[0].querySelector(".eqv-ic svg")).toBeTruthy();
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" });
    expect(on).toHaveBeenCalledWith("risk");
  });
});

describe("Analysing bar (B10)", () => {
  it("is the same choice as the portfolios bar: chips with aria-pressed, the count, and only with two or more portfolios", () => {
    const pick = vi.fn();
    const { rerender } = render(<AnalysingBar list={PFS} cur="dhan" onPick={pick} n={6} />);
    const g = screen.getByRole("group", { name: "Portfolio being analysed" });
    expect(g.textContent).toBe("AnalysingAll accountsDhanUpstox6 shares · every figure on this tab follows the portfolio you pick");
    expect(within(g).getByRole("button", { name: "Dhan" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(g).getByRole("button", { name: "Upstox" }));
    expect(pick).toHaveBeenCalledWith("upstox");
    rerender(<AnalysingBar list={[PFS[0]]} cur="dhan" onPick={pick} n={6} />);
    expect(screen.queryByRole("group", { name: "Portfolio being analysed" })).toBeNull();
  });
});

describe("sticky switcher (B12)", () => {
  const setup = (view: "portfolio" | "risk" = "portfolio") => {
    const pick = vi.fn(), onView = vi.fn();
    render(<StickySwitch list={PFS} cur="dhan" onPick={pick} figs={figs} defs={eqViews(6)} view={view} onView={onView} tabsId="eq-tabs" />);
    return { pick, onView };
  };
  it("the portfolio menu lists All accounts and each portfolio with count, value and gain, ✓ on the current one; picking switches", () => {
    vi.useFakeTimers();
    const { pick } = setup();
    const b = screen.getByRole("button", { name: "Portfolio: Dhan. Switch portfolio" });
    expect(b.getAttribute("aria-haspopup")).toBe("menu"); expect(b.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
    const m = screen.getByRole("menu", { name: "Portfolio" }), items = within(m).getAllByRole("menuitemradio");
    expect(items.map((i) => [i.textContent, i.getAttribute("aria-checked")])).toEqual([["∑All accounts9 shares · ₹3.89 L · +21.4%", "false"], ["DDhan6 shares · ₹2.74 L · +34.2%", "true"], ["UUpstox3 shares · ₹1.15 L · −2.1%", "false"]]);
    expect(document.activeElement).toBe(items[1]);   // focus lands on the current one
    fireEvent.keyDown(m, { key: "ArrowDown" }); expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(m, { key: "ArrowDown" }); expect(document.activeElement).toBe(items[0]);
    fireEvent.click(items[2]);
    expect(pick).toHaveBeenCalledWith("upstox"); expect(screen.queryByRole("menu")).toBeNull();
    vi.useRealTimers();
  });
  it("Esc closes and returns focus to the button; the view switch is segmented and also a menu", () => {
    const { onView } = setup("risk");
    const b = screen.getByRole("button", { name: "Portfolio: Dhan. Switch portfolio" });
    fireEvent.click(b); fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull(); expect(document.activeElement).toBe(b);
    const seg = screen.getByRole("group", { name: "View" });
    expect(within(seg).getAllByRole("button").map((x) => `${x.textContent}${x.getAttribute("aria-pressed") === "true" ? "*" : ""}`)).toEqual(["Portfolio", "Diversification", "Risk*"]);
    const vm = screen.getByRole("button", { name: "View: Risk analytics. Switch view" });
    fireEvent.click(vm);
    const items = within(screen.getByRole("menu", { name: "View" })).getAllByRole("menuitemradio");
    expect(items.map((i) => `${i.textContent}${i.getAttribute("aria-checked") === "true" ? "*" : ""}`)).toEqual(["Portfolio", "Diversification analytics", "Risk analytics*"]);
    fireEvent.click(items[1]);
    expect(onView).toHaveBeenCalledWith("diversification");
  });
});

const sh = (symbol: string, o: Partial<Share> = {}): Share => ({ symbol, industry: "Banks", size: "Large", chg: 0, prism: 60, prismWord: "Average", valuation: 50, risk: 50, st: 10, lt: 20, below52: 5, m1: 1, peer: null, notCompared: null, ...o });
const peer = (label: "leader" | "in_line" | "laggard", rank: number, of: number, raw: "leader" | "in_line" | "laggard" | null = null) => ({ label, raw: raw ?? label, rank, of, group: "g", vs: 0, bench: "b", direction: null });

describe("Key figures drop-downs (B15)", () => {
  const S = [
    sh("TECHM", { peer: peer("leader", 1, 13), lt: 70, st: 40, ltWord: "Strong uptrend", stWord: "Uptrend", valuation: 30, prism: 58 }),
    sh("INFY", { peer: peer("leader", 3, 13), lt: 45, st: 50, ltWord: "Uptrend", stWord: "Uptrend", valuation: 80, prism: 74 }),
    sh("ITC", { peer: peer("in_line", 5, 10, "leader"), lt: 0, st: 0, ltWord: "Sideways", stWord: "Sideways", valuation: 60, prism: 66 }),
    sh("YESBANK", { peer: peer("laggard", 9, 10), lt: -60, st: -70, ltWord: "Downtrend", stWord: "Strong downtrend", valuation: 20, prism: 41 }),
    sh("TINY", { peer: null, lt: null, st: null, valuation: null, prism: null }),
  ];
  const cards = [{ tone: "watch" as const, k: "Against peers", v: "2 lead · 1 lag", text: "", go: "See peers", to: "eq-peers" },
    { tone: "info" as const, k: "Price trend", v: "Mostly rising", text: "", go: "See trends", to: "eq-trend" },
    { tone: "warn" as const, k: "Valuation", v: "Weak", text: "", go: "Show weak shares", to: "pf-shares" }];
  it("each card opens and closes on its own, with aria-expanded and the count of shares", () => {
    localStorage.clear();
    render(<KeyFigures tab="portfolio" sub="" cards={cards} drop={(k) => keyDrop(k, S)} n={S.length} />);
    const bs = screen.getAllByRole("button", { name: /the 5 shares/ });
    expect(bs.map((b) => [b.textContent, b.getAttribute("aria-expanded")])).toEqual([["Show the 5 shares ▾", "false"], ["Show the 5 shares ▾", "false"], ["Show the 5 shares ▾", "false"]]);
    fireEvent.click(bs[0]);
    expect(bs[0].textContent).toBe("Hide the 5 shares ▾"); expect(bs[1].getAttribute("aria-expanded")).toBe("false");
    const p = document.getElementById(bs[0].getAttribute("aria-controls")!)!;
    expect(Array.from(p.querySelectorAll(".x-kd-g")).map((g) => g.textContent)).toEqual([
      "Lead 2TECHM1 of 13INFY3 of 13", "In line 1ITC5 of 10 · may lead next week", "Lag 1YESBANK9 of 10", "Not compared 1They trade too thinly to rank fairly, or are not ranked yet.TINY"]);
    expect(p.querySelector(".x-kd-c.up b")!.textContent).toBe("TECHM"); expect(p.querySelector(".x-kd-c.dn b")!.textContent).toBe("YESBANK");
  });
  it("Price trend groups by the long-term trend with words and marks a short term that is behind; Valuation lists Weak, Fair, Strong by Prism", () => {
    localStorage.clear();
    render(<KeyFigures tab="portfolio" sub="" cards={cards} drop={(k) => keyDrop(k, S)} n={S.length} />);
    const bs = screen.getAllByRole("button", { name: /the 5 shares/ });
    fireEvent.click(bs[1]); fireEvent.click(bs[2]);
    const t = document.getElementById(bs[1].getAttribute("aria-controls")!)!;
    expect(Array.from(t.querySelectorAll("tr.x-kd-th")).map((r) => r.textContent)).toEqual(["Long-term uptrend 2", "Sideways 1", "Long-term downtrend 1", "Not rated yet 1"]);
    expect(Array.from(t.querySelectorAll("tbody tr:not(.x-kd-th)")).map((r) => r.textContent)).toEqual([
      "TECHM+70Strong uptrend+40Uptrend · behind", "INFY+45Uptrend+50Uptrend", "ITC0Sideways0Sideways", "YESBANK−60Downtrend−70Strong downtrend · behind", "TINY——"]);
    const v = document.getElementById(bs[2].getAttribute("aria-controls")!)!;
    expect(Array.from(v.querySelectorAll(".x-kd-g")).map((g) => g.textContent)).toEqual([
      "Weak 2You pay above-typical prices.YESBANKPrism 41TECHMPrism 58", "Fair 1Prices close to typical.ITCPrism 66", "Strong 1You pay below-typical prices.INFYPrism 74", "Not scored 1TINY"]);
  });
  it("a chip scrolls to the share's row in Your shares and highlights it", () => {
    vi.useFakeTimers();
    document.body.insertAdjacentHTML("beforeend", '<section id="pf-shares"><table><tbody><tr data-sym="ITC"><td>ITC</td></tr></tbody></table></section>');
    window.scrollTo = vi.fn() as never;
    render(<KeyFigures tab="portfolio" sub="" cards={cards} drop={(k) => keyDrop(k, S)} n={S.length} />);
    fireEvent.click(screen.getAllByRole("button", { name: /the 5 shares/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "ITC 5 of 10 · may lead next week" }));
    const tr = document.querySelector('#pf-shares tr[data-sym="ITC"]')!;
    expect(tr.classList.contains("x-flash")).toBe(true); expect(window.scrollTo).toHaveBeenCalled();
    vi.advanceTimersByTime(2300); expect(tr.classList.contains("x-flash")).toBe(false);
    vi.useRealTimers(); document.getElementById("pf-shares")!.remove();
  });
  it("Silver cards and an empty list get no drop-down", () => {
    expect(keyDrop("Mixed FinLit IQ", S)).toBeNull(); expect(keyDrop("Against peers", [])).toBeNull();
  });
});

// B3: the spread score as three cards, from the stored 12-share sample
import s12 from "./__fixtures__/sample_12.json";
import { SpreadPack, type DivInput } from "./pack/DivPack";
import type { PageObject } from "./types";
import { MemoryRouter } from "react-router";
describe("How spread out is the list? (B3)", () => {
  it("a ring with the score and its word, a line from one bet to widely spread, the chips; the two readings; Moves like as squares → circles", () => {
    const page = s12.page as unknown as PageObject, sc = page.score;
    const d: DivInput = { page, symbols: page.order, levelOf: (x, l) => (l === "macro" ? (page.order.indexOf(x) % 3 ? "Financial Services" : "Energy") : x), sizeOf: () => "Large", band: () => "g", gold: true, nameOf: (x) => x };
    render(<MemoryRouter><SpreadPack d={d} /></MemoryRouter>);
    expect(screen.getByRole("img", { name: `Spread score ${sc.score} out of 100, ${sc.band}` })).toBeTruthy();
    expect(document.querySelector(".spx-word")!.textContent).toBe(sc.band);
    expect((document.querySelector(".spx-line i") as HTMLElement).style.left).toBe(`${sc.score}%`);
    expect(document.querySelector(".spx-ends")!.textContent).toBe("All in one betWidely spread");
    expect(document.querySelector(".spx-chips")!.textContent).toBe("2 macro sectors12 sectors12 industries1 size");
    expect(Array.from(document.querySelectorAll(".spx-ph")).map((x) => x.textContent)).toEqual([`Across sectors${Math.round(sc.sector_spread)}`, `How independently they move${Math.round(sc.comovement)}`]);
    expect(document.querySelector(".spx-big")!.textContent).toBe(`${sc.effective_stocks.toFixed(1)} of 12 shares`);
    expect(document.querySelectorAll(".spx-dots .r1 i")).toHaveLength(12);
    expect(document.querySelectorAll(".spx-dots .r2 i")).toHaveLength(Math.ceil(sc.effective_stocks));
    expect(document.querySelector(".eq-dials")).toBeNull();   // the two loose dials are gone
  });
});
