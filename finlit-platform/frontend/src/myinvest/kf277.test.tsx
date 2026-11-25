// @vitest-environment jsdom
// Task #277 (All my investments pack of 20 Nov 2026, change 9; live number fixes 7 and 8): Key figures. Three cards per view, each a full sentence with the
// numbers; a card with nothing to say is skipped and the next one moves up; the ETF price card is labelled by its sign; "None in liquid funds" only at 0%;
// "No two the same" only when no two ETFs follow one index.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import demo from "../../public/demo/my-investments.json";
import type { AllInvestments } from "../lib/myInvest";
import { KeyFiguresSection, keyFiguresOf } from "./KeyFigures277";

afterEach(cleanup);
const D = () => structuredClone(demo) as unknown as AllInvestments;
const keys = (t: Parameters<typeof keyFiguresOf>[0], d: AllInvestments) => keyFiguresOf(t, d, () => {}).map((c) => c.k);

describe("the cards of each view", () => {
  it("All together: held more than one way, the biggest company, where the risk comes from", () => {
    expect(keys("all", D())).toEqual(["Held more than one way", "Biggest single company", "Where the market risk comes from"]);
  });
  it("Equity, Mutual funds, ETFs: their own three", () => {
    expect(keys("equity", D())).toEqual(["Against their peers", "How they are spread", "How risky"]);
    expect(keys("mf", D())).toEqual(["How healthy", "Its weakest part", "Money kept ready"]);
    expect(keys("etf", D())).toEqual(["What they cost", "Furthest above its value", "No two the same"]);
  });
  it("a card with nothing to say is skipped, never an empty card", () => {
    const d = D(); d.companies = d.companies.map((c) => ({ ...c, held: [c.held[0]] }));
    expect(keys("all", d)).toEqual(["Biggest single company", "Where the market risk comes from"]);
    const e = D(); e.etfs = e.etfs.map((x) => ({ ...x, premium: 0.05 }));
    expect(keys("etf", e)).toEqual(["What they cost", "No two the same"]);
  });
});

describe("the words", () => {
  it("the price card is labelled by its sign (live number fix 7)", () => {
    const d = D(); d.etfs = d.etfs.map((x) => ({ ...x, premium: x.symbol === "MON100" ? -1.9 : x.premium }));
    render(<KeyFiguresSection d={d} view="etf" go={() => {}} />);
    expect(screen.getByText("Furthest below its value")).toBeTruthy();
    expect(screen.getByText(/MON100 traded 1\.90% below its value/)).toBeTruthy();
  });
  it("the same index twice is named; no repeats with two or more ETFs says each follows a different index (live number fix 8)", () => {
    const d = D(); (d.cards.etfs as { repeats: unknown[] }).repeats = [{ label: "Nifty 50", symbols: ["NIFTYBEES", "SETFNIF50"] }];
    expect(keys("etf", d)).toContain("The same index twice");
    expect(keys("etf", d)).not.toContain("No two the same");
    const one = D(); one.etfs = one.etfs.slice(0, 1);
    expect(keys("etf", one)).not.toContain("No two the same");
  });
  it("None in liquid funds only when no fund is liquid; a liquid fund gives its share", () => {
    const d = D();
    render(<KeyFiguresSection d={d} view="mf" go={() => {}} />);
    expect(screen.getByText("None in liquid funds")).toBeTruthy();
    cleanup();
    const l = D(); l.funds = l.funds.map((f, i) => i === 0 ? { ...f, type: "Liquid", short: "PP Liquid" } : f);
    render(<KeyFiguresSection d={l} view="mf" go={() => {}} />);
    expect(screen.queryByText("None in liquid funds")).toBeNull();
    expect(document.querySelector(".mi7-kfc:last-child .mi7-kfsay")!.textContent).toMatch(/^\d+\.\d% of everything in a liquid fund\.$/);
  });
  it("the section: heading, three cards, each link goes where it says", () => {
    const go = vi.fn();
    render(<KeyFiguresSection d={D()} view="all" go={go} />);
    expect(screen.getByRole("heading", { name: "Key figures" })).toBeTruthy();
    expect(document.querySelectorAll(".mi7-kfc")).toHaveLength(3);
    const multi = (demo as unknown as AllInvestments).companies.filter((c) => c.held.length > 1).length;
    fireEvent.click(screen.getByRole("button", { name: `Show the ${multi} →` }));
    fireEvent.click(screen.getByRole("button", { name: "See Step 7 →" }));
    expect(go.mock.calls).toEqual([["held"], ["mi-risk"]]);
  });
  it("never advises", () => {
    for (const v of ["all", "equity", "mf", "etf"] as const) { render(<KeyFiguresSection d={D()} view={v} go={() => {}} />); }
    expect(document.body.textContent).not.toMatch(/\b(buy|sell|hold on|reduce|avoid|accumulate|target|best)\b/i);
  });
});

describe("small words", () => {
  it("one leader leads its peers; the risk legend is in percent", () => {
    render(<KeyFiguresSection d={D()} view="equity" go={() => {}} />);
    expect(document.querySelector(".mi7-kfsay")!.textContent).toBe("1 of your 6 shares leads its peers; 2 lag.");
    cleanup();
    render(<KeyFiguresSection d={D()} view="all" go={() => {}} />);
    expect(document.querySelectorAll(".mi7-kfc")[2].querySelector(".mi7-kfkey")!.textContent).toMatch(/^Shares [\d.]+%Mutual funds [\d.]+%ETFs [\d.]+%$/);
  });
});
