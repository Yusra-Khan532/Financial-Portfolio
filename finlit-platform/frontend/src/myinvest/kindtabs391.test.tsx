// @vitest-environment jsdom
// Task #391 PR B (developer file 35): the Equity, Mutual funds and ETFs tabs of All my investments. Page-wide words ("moves 0.91×", the range words by
// the server's key, never "Defensive" or "Beta 1.40"), names first with the code under them, "A, B and C" lists, a holding without a quantity said as
// such (fault 1: it weighs 0), each kind's swing window (fault 12), and one section at a time when the page gives a step. Made-up figures only.
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: null }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ has: () => true, toast: vi.fn(), upgrade: vi.fn(), plan: "gold" }) }));
const phone = vi.hoisted(() => ({ on: false }));
vi.mock("../components/PhoneFold", async (orig) => ({ ...(await orig<typeof import("../components/PhoneFold")>()), useIsPhone: () => phone.on }));
import demo from "../../public/demo/my-investments.json";
import type { AllInvestments } from "../lib/myInvest";
import { StepCtx } from "../portfolio/pack/EqSteps385";
import { EQ_STEPS, ETF_STEPS, EquityTab, EtfTab, MF_STEPS, MfTab, coCode, coName, movesTxt, noQtyLine, rangeWord } from "./KindTabs";

afterEach(cleanup);
vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
const D = () => structuredClone(demo) as unknown as AllInvestments;
const wrap = (ui: ReactNode, step = "all", first = "", provide = true) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{provide ? <StepCtx.Provider value={{ step, firstStep: first }}>{ui}</StepCtx.Provider> : ui}</MemoryRouter></QueryClientProvider>);
};
const text = () => document.body.textContent ?? "";
/** The tab's own text, without Key figures (KeyFigures277, PR A's file: its words change there). */
const own = () => { const c = document.body.cloneNode(true) as HTMLElement; c.querySelector("#mi-kf")?.remove(); return c.textContent ?? ""; };

describe("the words", () => {
  it("range words come from the server's key; an old answer's stored word reads the new word", () => {
    expect(rangeWord("less", "Less sensitive")).toBe("Much less sensitive");
    expect(rangeWord("defensive", "Defensive")).toBe("Less sensitive");
    expect(rangeWord(null, "Defensive")).toBe("Less sensitive");
    expect(rangeWord(null, "Less sensitive")).toBe("Much less sensitive");      // the old scale's word below 0.65
    expect(rangeWord(undefined, "Similar")).toBe("Similar");
    expect(movesTxt(1.4)).toBe("moves 1.40×");
    expect(movesTxt(null)).toBe("—");
  });
  it("names first, the code under them", () => {
    expect(coName({ symbol: "ZZBANK", name: "Zed Bank Of Somewhere Ltd" })).toBe("Zed Bank of Somewhere");
    expect(coCode({ symbol: "ZZBANK" })).toBe("ZZBANK");
    expect(coCode({ symbol: "526433", name: "Asm Co" })).toBe("BSE 526433");
  });
  it("how many are counted", () => {
    expect(noQtyLine(0, 9, "fund", "units")).toBe("");
    expect(noQtyLine(1, 9, "fund", "units")).toBe(" 8 of 9 counted in the money split; 1 fund has no units yet and is still listed.");
    expect(noQtyLine(2, 5, "ETF")).toBe(" 3 of 5 counted in the money split; 2 ETFs have no quantity yet and are still listed.");
  });
});

describe("Equity tab", () => {
  it("names first, moves N×, the range word from the key, the window and no old words", () => {
    const d = D();
    d.risk.parts = d.risk.parts.map((p) => (p.kind === "shares" ? { ...p, band: "Defensive", bandKey: "defensive" } : p)) as typeof d.risk.parts;
    (d.risk.kinds.shares as Record<string, unknown>).swingWindow = { grain: "weekly", years: 2, label: "weekly prices, 2 years" };
    wrap(<EquityTab d={d} />);
    const first = d.shares[0];
    const th = screen.getAllByRole("rowheader")[0];
    expect(within(th).getByRole("link").textContent).toBe(coName(first));
    expect(th.querySelector("small")!.textContent).toBe(first.symbol);
    expect(text()).toContain("Moves with the Nifty 500");
    expect(text()).toContain("Less sensitive");
    expect(own()).not.toMatch(/Defensive|Beta \d|Beta vs/);
    expect(text()).toContain("Swing and worst fall: weekly prices, 2 years");
    expect(text()).toMatch(/· moves \d\.\d\d× ·/);                                      // the 5 largest parts of the shares' market risk
  });
  it("a share without a quantity weighs 0: said in the list, never 0.00%", () => {
    const d = D();
    d.shares[1] = { ...d.shares[1], qty: null, value: null, of: 0 };
    wrap(<EquityTab d={d} />);
    const th = screen.getAllByRole("rowheader").find((x) => x.textContent?.includes(coName(d.shares[1])))!;
    expect(th.closest("tr")!.textContent).toContain("No quantity");
    expect(text()).toContain(`${d.shares.length - 1} of ${d.shares.length} counted in the money split; 1 share has no quantity yet and is still listed.`);
  });
  it("step mode: one step at a time, Key figures in step 1; no step shows every section as before", () => {
    const d = D();
    wrap(<EquityTab d={d} />, "mi-eq-risk", EQ_STEPS[0].id);
    expect(document.getElementById("mi-eq-risk")).not.toBeNull();
    expect(document.getElementById("mi-eq-list")).toBeNull();
    expect(document.getElementById("mi-kf")).toBeNull();
    cleanup();
    wrap(<EquityTab d={d} />, "mi-eq-list", EQ_STEPS[0].id);
    expect(document.getElementById("mi-eq-list")).not.toBeNull();
    expect(document.getElementById("mi-kf")).not.toBeNull();
    expect(document.getElementById("mi-eq-spread")).toBeNull();
    cleanup();
    wrap(<EquityTab d={d} />);
    for (const id of ["mi-eq-list", "mi-kf", "mi-eq-spread", "mi-eq-risk", "mi-eq-also"]) expect(document.getElementById(id)).not.toBeNull();
    expect(EQ_STEPS[0].secs).toEqual(["mi-eq-list", "mi-kf"]);
    expect(MF_STEPS.map((s) => s.id)).toEqual(["mi-mf-list", "mi-mf-inside", "mi-mf-risk"]);
    expect(ETF_STEPS.map((s) => s.id)).toEqual(["mi-etf-list", "mi-etf-inside", "mi-etf-risk"]);
  });
});

describe("phone", () => {
  it("without a step from the page nothing folds (every section open, as before); with All sections from the page, the later steps fold", () => {
    phone.on = true;
    try {
      const d = D();
      wrap(<MfTab d={d} />, "all", "", false);
      expect(document.querySelectorAll("[data-fold]").length).toBe(0);
      for (const id of ["mi-mf-list", "mi-kf", "mi-mf-inside", "mi-mf-risk"]) expect(document.getElementById(id)).not.toBeNull();
      cleanup();
      wrap(<MfTab d={d} />, "all", MF_STEPS[0].id);
      expect([...document.querySelectorAll("[data-fold]")].map((x) => x.getAttribute("data-fold"))).toEqual(["mi-mf-inside", "mi-mf-risk"]);
    } finally { phone.on = false; }
  });
});

describe("Mutual funds and ETFs tabs", () => {
  it("funds: moves N× column, no units said, Mutual Fund Score", () => {
    const d = D();
    d.funds[0] = { ...d.funds[0], units: null, value: null, of: 0 };
    wrap(<MfTab d={d} />);
    expect(screen.getByRole("columnheader", { name: "Moves with the Nifty 500" })).toBeTruthy();
    expect(text()).toContain("Mutual Fund Score");
    expect(text()).toContain(`1 fund has no units yet and is still listed.`);
    const f = d.funds.find((x) => x.beta != null)!;
    expect(text()).toContain(`${f.beta!.toFixed(2)}×`);
    expect(own()).not.toMatch(/Beta vs|Defensive/);
  });
  it("ETFs: the same index twice is one list, A, B and C", () => {
    const d = D();
    d.cards.etfs.repeats = [{ label: "Nifty 50", symbols: d.etfs.map((e) => e.symbol) }] as typeof d.cards.etfs.repeats;
    wrap(<EtfTab d={d} />);
    const syms = d.etfs.map((e) => e.symbol);
    const list = `${syms.slice(0, -1).join(", ")} and ${syms[syms.length - 1]}`;
    expect(text()).toContain(`Nifty 50: ${list}`);
    expect(own()).not.toMatch(/ and [A-Z]+ and /);
  });
});
