// @vitest-environment jsdom
// Task #195: "Your mutual funds at a glance" draws the shared Prism ring with one arc per fund, each filled to its FundPulse (29 / 100 POOR with one fund),
// and the link to the MF portfolio sits at the bottom; "Your ETFs at a glance" is a one-line strip with an empty ring until ETFs are added.
import { cleanup, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const fund = (code: number, score: number, label: string) => ({ id: "f" + code, code, name: `Fund ${code} - Direct Growth`, weight: null, returns: { r1y: 12.7 }, score: { final: score, label, locked: false, parts: null, reason: null } });
let holdings = [fund(101, 29, "Poor")];
let etfCount = 0;
vi.mock("../../lib/ui", async (orig) => ({ ...(await orig<typeof import("../../lib/ui")>()), useUI: () => ({ has: () => true, plan: "gold" }) }));
vi.mock("../../lib/mfPortfolio", () => ({
  useMfPortfolio: () => ({ isLoading: false, isError: false, data: { count: holdings.length, dataDate: "2026-11-15", holdings, summary: { score: { value: holdings.length === 1 ? 29 : 58, label: holdings.length === 1 ? "Poor" : "Average", locked: false } } } }),
  useMfSpread: () => ({ isLoading: false, data: null }),
}));
vi.mock("../../lib/etfPortfolio", () => ({ useEtfPortfolio: () => ({ data: { count: etfCount } }) }));

const { FundsGlance, EtfsGlance } = await import("./FundsGlance");
const show = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { enabled: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>).container;
afterEach(cleanup);

describe("Your mutual funds at a glance on the Prism ring", () => {
  it("one fund: one arc filled to its score, 29 / 100 POOR, the link at the bottom", () => {
    holdings = [fund(101, 29, "Poor")];
    const c = show(<FundsGlance />);
    expect(c.querySelectorAll(".srg-fill")).toHaveLength(1);
    expect([...c.querySelectorAll(".srg text")].map((t) => t.textContent)).toEqual(["29", "/ 100", "POOR"]);
    const card = c.querySelector("section.dsh-card")!;
    expect(card.lastElementChild!.textContent).toBe("Open the MF portfolio →");
  });
  it("three funds: three arcs, each in its own band colour", () => {
    holdings = [fund(1, 82, "Strong"), fund(2, 55, "Average"), fund(3, 30, "Poor")];
    const c = show(<FundsGlance />);
    const arcs = [...c.querySelectorAll(".srg-fill")].map((p) => (p.parentElement as HTMLElement).style.getPropertyValue("--pc"));
    expect(arcs).toEqual(["var(--band-hi)", "var(--band-mid)", "var(--band-lo)"]);
  });
});

describe("Your ETFs at a glance as a one-line strip", () => {
  it("no ETFs: an empty ring, the title, one line and the button", () => {
    etfCount = 0;
    const c = show(<EtfsGlance />);
    const strip = c.querySelector("section.dsh-strip1")!;
    expect(strip.querySelector(".srg")).toBeTruthy(); expect(strip.querySelectorAll(".srg-fill")).toHaveLength(0);
    expect(strip.querySelector("h2")!.textContent).toBe("Your ETFs at a glance");
    expect(strip.querySelector(".m")!.textContent).toMatch(/^No ETFs added yet\./);
  });
  it("with ETFs it says how many, never 'No ETFs added yet'", () => {
    etfCount = 3;
    const c = show(<EtfsGlance />);
    expect(c.textContent).toContain("3 ETFs in your ETF portfolio"); expect(c.textContent).not.toContain("No ETFs added yet");
  });
});
