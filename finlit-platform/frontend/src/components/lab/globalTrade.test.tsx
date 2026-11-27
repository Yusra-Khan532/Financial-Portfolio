// @vitest-environment jsdom
// Trading Lab > Order Flow (Global) > Global trade: India's trade with the world from UN Comtrade (a real load of 27 Nov 2026): the month in one
// line, 13 months, the largest partners and products each way, a card on every bar and month; the world map of partners (a hover card per country,
// a tap picks it, a ranked list under the map for a phone), the partner and product drill-down, and the WTO's world totals with India's share
// (WTO-shaped figures; without a key the panel says so). Facts only.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TipLayer } from "./FlowTips";
import { GlobalTrade, tradeLine, usdBn, type Trade } from "./GlobalTrade";
import { step } from "./TradeMap";
import { usdM } from "./WorldTrade";
import SAMPLE from "./__fixtures__/trade.json";
import DRILL from "./__fixtures__/trade-drill.json";

const T = SAMPLE as unknown as Extract<Trade, { ready: true }>;
const D = DRILL as Record<string, unknown>;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const urls: string[] = [];
let page: unknown = T;
beforeEach(() => {
  urls.length = 0; page = T;
  vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    urls.push(String(u));
    const m = String(u).match(/\/api\/lab\/trade\/drill\?(partner|product)=(\d+)/);
    if (m) return D[`${m[1]}:${m[2]}`] ? json(D[`${m[1]}:${m[2]}`]) : json({ detail: "This partner is not in the detail read from UN Comtrade." }, 404);
    return json(page);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
let where = "";
function Where() { where = useLocation().search; return null; }
const wrap = (at = "/lab/flow?view=trade&m=global") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
  <MemoryRouter initialEntries={[at]}><TipLayer><GlobalTrade /><Where /></TipLayer></MemoryRouter></QueryClientProvider>);
const settle = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise((r) => setTimeout(r, 25)); }); };
const point = (el: Element) => { const e = new MouseEvent("pointermove", { bubbles: true, clientX: 10, clientY: 10 }); Object.defineProperty(e, "pointerType", { value: "mouse" }); fireEvent(el, e); };
const mapReady = async () => { for (let i = 0; i < 40 && !document.querySelector("svg.trd-map"); i++) await settle(1); };
const ADVICE = /\b(buy|sell|hold|target|best|top pick|recommend\w*|forecast\w*|likely|will (rise|fall)|bullish|bearish|signals?)\b/i;

describe("Global trade", () => {
  it("writes dollars in billions and the month in one line", () => {
    expect(usdBn(43_722_286_821)).toBe("$43.7 bn"); expect(usdBn(-2_356_111_676, true)).toBe("−$2.36 bn"); expect(usdBn(256_126_795)).toBe("$256 mn");
    expect(tradeLine(T)).toBe("India, Aug 2026: exports $43.7 bn (+25.2% on Aug 2025) · imports $71.0 bn (+15.3%) · trade balance −$27.3 bn");
    expect(usdM(26_386_782.4)).toBe("$26.39 tn"); expect(usdM(445_278)).toBe("$445.3 bn");
    expect([step(19.07), step(5), step(2.1), step(1), step(0.3), step(0.01), step(null)]).toEqual([0, 1, 2, 3, 4, 5, -1]);
  });
  it("reads the Lab's trade route and shows 13 months, partners and products", async () => {
    wrap(); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/trade"))).toBe(true);
    expect(document.querySelectorAll(".trd-m")).toHaveLength(13);
    expect(within(screen.getByRole("list", { name: "Largest export partners" })).getAllByRole("listitem")[0].textContent).toContain("USA");
    expect(within(screen.getByRole("list", { name: "Largest imports by product" })).getAllByRole("listitem")[0].textContent).toContain("Mineral fuels and oils");
  });
  it("pointing at a month or a bar shows its detail", async () => {
    wrap(); await settle();
    point(document.querySelectorAll(".trd-m")[12]);
    expect(within(screen.getByRole("tooltip")).getByText("Aug 2026")).toBeTruthy();
    point(within(screen.getByRole("list", { name: "Largest export partners" })).getAllByRole("listitem")[0]);
    const pop = screen.getByRole("tooltip");
    expect(within(pop).getByText("USA")).toBeTruthy(); expect(within(pop).getByText("+21.2%")).toBeTruthy();
  });
  it("draws every partner on the world map, shaded by its share, with a card per country", async () => {
    wrap(); await mapReady();
    const svg = document.querySelector("svg.trd-map")!;
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.querySelectorAll("path.trd-c").length).toBeGreaterThan(170);
    expect(svg.querySelector('path[data-iso="USA"]')!.getAttribute("class")).toContain("b0");          // 19.1% of India's exports
    expect(svg.querySelector('path[data-iso="IND"]')!.getAttribute("class")).toContain("in");
    expect(svg.closest(".cz")).toBeTruthy();                                                             // inside ChartZoom
    point(svg.querySelector('path[data-iso="USA"]')!);
    const pop = screen.getByRole("tooltip").textContent ?? "";
    expect(pop).toContain("USA"); expect(pop).toContain("$8.34 bn"); expect(pop).toContain("19.1%");
    expect(pop).toContain("Change on Jul 2026"); expect(pop).toContain("−7.7%"); expect(pop).toContain("Change on Aug 2025"); expect(pop).toContain("+21.2%");
    expect(pop).toContain("India's imports from it"); expect(pop).toContain("India's trade balance with it");
    // imports: China holds a fifth of India's imports
    fireEvent.click(screen.getByRole("button", { name: "Imports" }));
    expect(screen.getByRole("button", { name: "Imports" }).getAttribute("aria-pressed")).toBe("true");
    expect(svg.querySelector('path[data-iso="CHN"]')!.getAttribute("class")).toContain("b0");
    point(svg.querySelector('path[data-iso="CHN"]')!);
    expect(screen.getByRole("tooltip").textContent).toContain("20.6%");
  });
  it("a tap on a country picks it: its card under the map and its products below", async () => {
    wrap(); await mapReady();
    fireEvent.click(document.querySelector('svg.trd-map path[data-iso="ARE"]')!);
    await settle();
    expect(where).toContain("pt=784");
    const card = screen.getByRole("status");
    expect(card.textContent).toContain("United Arab Emirates"); expect(card.textContent).toContain("India's exports to it");
    expect(document.querySelector('path[data-iso="ARE"]')!.getAttribute("class")).toContain("sel");
  });
  it("lists every partner under the map for a phone: 15, then the rest on request", async () => {
    wrap(); await settle();
    const list = screen.getByRole("list", { name: "Partner countries by India's exports, Aug 2026" });
    expect(within(list).getAllByRole("button")).toHaveLength(15);
    expect(within(list).getAllByRole("button")[0].textContent).toContain("USA");
    fireEvent.click(screen.getByRole("button", { name: "Show 195 more" }));
    expect(within(list).getAllByRole("button")).toHaveLength(210);
    const italy = within(list).getAllByRole("button").find((b) => b.textContent?.includes("Italy"))!;
    fireEvent.click(italy);
    await settle();
    expect(italy.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("Italy");
    // Italy is not among the 25 partners whose products are read: said plainly, nothing asked of the server
    expect(document.body.textContent).toContain("Italy is not one of them");
    expect(urls.some((u) => u.includes("partner=380"))).toBe(false);
  });
  it("drills from a partner to its products and from a product to its partners", async () => {
    wrap(); await settle();
    expect(urls.some((u) => u.endsWith("/api/lab/trade/drill?partner=842"))).toBe(true);    // the largest partner by default
    const out = screen.getByRole("list", { name: "Exported to USA, Aug 2026" });
    const first = within(out).getAllByRole("listitem")[0];
    expect(first.textContent).toContain("Electrical machinery and electronics"); expect(first.textContent).toContain("$1.94 bn"); expect(first.textContent).toContain("+27.8%");
    point(first);
    const pop = screen.getByRole("tooltip").textContent ?? "";
    expect(pop).toContain("Share of exports to USA"); expect(pop).toContain("23.3%"); expect(pop).toContain("Change on Aug 2025");
    expect(screen.getByRole("list", { name: "Imported from USA, Aug 2026" })).toBeTruthy();
    expect(out.closest(".cz")).toBeTruthy();
    // a chapter's name opens the chapter: the countries India sells it to and buys it from
    fireEvent.click(within(out).getByRole("button", { name: "Gems, jewellery, gold" }));
    await settle();
    expect(where).toContain("hs=71");
    expect(screen.getByRole("button", { name: "By product" }).getAttribute("aria-pressed")).toBe("true");
    const gems = screen.getByRole("list", { name: "Exported to (Gems, jewellery, gold), Aug 2026" });
    expect(within(gems).getAllByRole("listitem")[0].textContent).toContain("United Arab Emirates");
    expect(within(gems).getAllByRole("listitem")[0].textContent).toContain("−18.1%");
    fireEvent.click(within(gems).getByRole("button", { name: "USA" }));
    await settle();
    expect(where).toContain("pt=842");
    expect(screen.getByRole("list", { name: "Exported to USA, Aug 2026" })).toBeTruthy();
    // the choice box lists the partners read
    const box = screen.getByRole("combobox");
    expect(within(box).getAllByRole("option").length).toBe(T.drill!.partners.length);
  });
  it("shows the WTO's world totals and India's share, and says so plainly without the key", async () => {
    wrap(); await settle();
    expect(document.body.textContent).toContain("World exports, 2025");
    expect(document.body.textContent).toContain("$26.39 tn");
    expect(document.body.textContent).toContain("1.69%");
    const chart = screen.getByRole("img", { name: /India's share of world merchandise exports and imports, 20\d\d to 2025/ });
    expect(chart.closest(".cz")).toBeTruthy();
    point(chart.querySelectorAll(".trd-yr")[chart.querySelectorAll(".trd-yr").length - 1]);
    expect(screen.getByRole("tooltip").textContent).toContain("India's share of world imports");
    cleanup();
    page = { ...T, world: { ready: false, reason: "The WTO's world trade totals need a free WTO API key on the server (the setting WTO_API_KEY). It is not set here, so this part is skipped; India's trade above is unaffected." } };
    wrap(); await settle();
    expect(document.body.textContent).toContain("need a free WTO API key on the server");
    expect(document.body.textContent).not.toContain("World exports, 2025");
  });
  it("says when the first load has not run, and never advises", async () => {
    wrap(); await mapReady(); await settle();
    expect(ADVICE.test(document.body.textContent ?? "")).toBe(false);
    cleanup();
    vi.stubGlobal("fetch", vi.fn(async () => json({ ready: false, reason: "India's trade loads from UN Comtrade twice a day; the first load has not run yet." })));
    wrap(); await settle();
    expect(document.body.textContent).toContain("the first load has not run yet");
    expect(ADVICE.test(document.body.textContent ?? "")).toBe(false);
  });
  it("no advice words in the source strings", () => {
    for (const f of ["GlobalTrade.tsx", "TradeMap.tsx", "TradeDrill.tsx", "WorldTrade.tsx", "tradeWorld.ts"]) {
      const src = readFileSync(join(process.cwd(), "src/components/lab", f), "utf8");
      const strings = [...src.matchAll(/"([^"\n]{6,})"|`([^`\n]{6,})`|>([^<>{}\n]{6,})</g)].map((m) => m[1] ?? m[2] ?? m[3]).join(" ");
      expect(ADVICE.exec(strings), f).toBeNull();
    }
  });
});
