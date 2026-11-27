// @vitest-environment jsdom
// Task #289 (the superinvestors developer file of 21 Nov 2026): the Tracked investors tab, the tracked investor page, old name links moving to it,
// and the whole feature on Gold (no Silver anywhere on these pages).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

let PLAN = "gold";
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: (t: string) => ({ basic: 0, silver: 1, gold: 2, mfetf: 1, equity: 1, combined: 1, platinum: 2 } as Record<string, number>)[PLAN] >= ({ basic: 0, silver: 1, gold: 2, mfetf: 1, equity: 1, combined: 1, platinum: 2 } as Record<string, number>)[t], upgrade: vi.fn(), toast: vi.fn() }),
  TIER: { silver: { n: "Silver", ic: "medal", tc: "--silver" }, gold: { n: "Gold", ic: "crown", tc: "--gold" }, basic: { n: "Free", ic: "sprout", tc: "--text" } } }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: PLAN === "basic" ? null : { id: "u", email: "m@example.com", plan: PLAN } }) }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title, description, plan, eyebrow }: { title: string; description?: React.ReactNode; plan?: string; eyebrow?: React.ReactNode }) => <header data-plan={plan}><div>{eyebrow}</div><h1>{title}</h1><div>{description}</div></header> }));

const META = { asOf: "Sep 2026", fetchedFrom: "2026-11-05", fetchedTo: "2026-11-21", pricesAt: "2026-11-20T10:00:00Z", source: "Each company's shareholding filing, via FinEdge.", disclaimer: "Information only, not investment advice.", noteNames: "n", rule: "r" };
const P = (label: string | null, score: number | null) => ({ label, score });
const card = (key: string, name: string, o: object = {}) => ({ key, name, names: [{ key, name, kind: "person", companies: 2 }], groupedNames: 1, companies: 2, valueCr: 100, moves: { new: 1, added: 0, reduced: 1, exited: 0 }, movesTotal: 2,
  namedStakes1y: { pct: 10.5, coverPct: 100, why: null }, sameSizeMarketPct: -3.2, sizes: [], sectors: [], top: [{ symbol: "AAA", name: "Aaa Ltd", weightPct: 60 }], ...o });
const KACH = card("ashish-kacholia", "Ashish Kacholia", { names: [{ key: "ashish-kacholia", name: "Ashish Kacholia", kind: "person", companies: 30 }, { key: "bengal-finance-and-investment-pvt-ltd", name: "Bengal Finance & Investment Pvt. Ltd", kind: "firm", companies: 14 }, { key: "suryavanshi-commotrade-pvt-ltd", name: "Suryavanshi Commotrade Private Limited", kind: "firm", companies: 4 }],
  groupedNames: 3, companies: 39, valueCr: 2919.8, moves: { new: 13, added: 4, reduced: 13, exited: 10 }, movesTotal: 40, namedStakes1y: { pct: 24.0, coverPct: 78, why: null }, sameSizeMarketPct: -12.8,
  sizes: [{ size: "Micro", text: "below ₹10,000 cr", pct: 66.5, companies: 37 }, { size: "Small", text: "₹10,000–25,000 cr", pct: 33.5, companies: 2 }], sectors: [{ sector: "Information Technology", valueCr: 300, pct: 10.3, companies: 2 }] });
const DAMANI = card("radhakishan-damani", "Radhakishan Damani", { groupedNames: 3, valueCr: 10120, namedStakes1y: { pct: null, coverPct: 13, why: "Only 13% of the value has a 1-year price, under 60%." } });
const mv = (investor: string, investorName: string, symbol: string, move: string, o: object = {}) => ({ investor, investorName, symbol, name: symbol + " Ltd", asOf: "Sep 2026", move, moveText: move, stakeThen: 1.5, stakeNow: 2.5, changePts: 1, changeValueCr: 50, changeAbout: false, size: "Small", prism: P("Healthy", 65.2), ...o });
const MOVES = [mv("radhakishan-damani", "Radhakishan Damani", "NSE", "new", { stakeThen: null, stakeNow: 1.58, changePts: 1.58, changeValueCr: 6697, size: "Large", prism: P("Not rated", null) }),
  mv("ashish-kacholia", "Ashish Kacholia", "ESDS", "new", { stakeThen: null, stakeNow: 2.05, changeValueCr: 272 }),
  mv("ashish-kacholia", "Ashish Kacholia", "QPOWER", "exited", { stakeThen: 1.67, stakeNow: null, changePts: -1.67, changeValueCr: 199.1, changeAbout: true, size: "Small" }),
  ...Array.from({ length: 20 }, (_, i) => mv("ashish-kacholia", "Ashish Kacholia", `S${i}`, "reduced", { changeValueCr: 10 - i / 10, size: "Micro" }))];
const ag = (symbol: string, heldBy: string[], o: object = {}) => ({ symbol, name: symbol + " Ltd", size: "Small", heldBy, addedBy: [], cutBy: [], stake: 11.65, valueCr: 300, prism: P("Not rated", null), technical: { short: "Downtrend", long: "Uptrend" }, peers: { chip: "Leader", text: "8th of 19 Chemicals: Specialty peers" }, return1y: 42, ...o });
const TRACKED = { ...META, tiles: { tracked: 26, companies: 325, moves: 279, heldBy2: 27 }, moveCounts: { new: 76, added: 68, reduced: 84, exited: 51 }, sourceErrors: 2, medians: { Large: 3.75, Mid: -0.67, Small: -2.67, Micro: -17.87 },
  investors: [DAMANI, KACH], moves: MOVES, agree: { held: [ag("ESDS", ["mukul-agrawal", "ashish-kacholia", "vanaja-sundar-iyer"], { addedBy: ["ashish-kacholia"] })], added: [], cut: [ag("PTC", ["x"], { cutBy: ["ashish-kacholia", "radhakishan-damani"] })] },
  allCount: { names: 1315, people: 802, firms: 513 }, since: "year", sinceText: "Since a year ago", trackedSource: "Tracked investors. A list kept by FinLit's editors: individuals widely followed as market investors.", namedStakesNote: "It is not the investor's own return." };
const hold = (symbol: string, o: object = {}) => ({ symbol, name: symbol + " Ltd", isin: null, asOf: "Sep 2026", stakeNow: 4.94, stakeThen: 5.21, changePts: -0.27, move: "reduced", moveText: "Stake cut", sourceError: false, names: 2,
  by: [], valueCr: 705.5, changeValueCr: 38.6, changeAbout: false, weightPct: 24.2, size: "Micro", mcapCr: 1000, return1y: 30, sector: "Chemicals", prism: P("Average", 50.1), technical: { short: "Sideways", long: "Uptrend" },
  peers: { chip: "In line", text: "8th of 19 Chemicals: Specialty peers" }, alsoHeldBy: [], ...o });
const PAGE = { ...KACH, ...META, kind_of_page: "tracked", medians: TRACKED.medians, trackedSource: TRACKED.trackedSource, namedStakesNote: "The 12-month price move of each stock named today. It is not the investor's own return.",
  holdings: [hold("SHAILY"), hold("ESDS", { move: "new", stakeThen: null, changePts: 2.05, stakeNow: 2.05, names: 1, prism: P("Strong", 80.3), peers: { chip: "Leader", text: "1st of 9 IT peers" }, alsoHeldBy: ["mukul-agrawal"] }),
    hold("TIRUMALCHM", { move: "unchanged", sourceError: true, changePts: null, names: 1, return1y: -12 }), hold("QPOWER", { move: "exited", stakeNow: null, valueCr: null })],
  moveList: [hold("ESDS", { move: "new", stakeThen: null, stakeNow: 2.05 }), hold("QPOWER", { move: "exited", stakeNow: null, stakeThen: 1.67, changeAbout: true, changeValueCr: 199.1 })] };
const LIST = { ...META, investors: [{ key: "bengal-finance-and-investment-pvt-ltd", name: "Bengal Finance", kind: "firm", tracked: { key: "ashish-kacholia", name: "Ashish Kacholia" }, companies: 14, valueCr: 1, valueNote: null, top: [], changes: { new: 0, added: 0, reduced: 0, exited: 0 } }],
  count: 1315, people: 802, firms: 513, emptyWhy: null, covered: 3771, companies: 5844 };

let FOLLOW = { follows: ["ashish-kacholia"], prefs: { new: true, added: true, reduced: true, exited: true }, note: "Alerts arrive in the bell, the browser and email as your alert settings allow, once per investor, company and filing quarter.",
  feed: [{ title: "Ashish Kacholia: new stake in ESDS Software Solution, 2.05% (filing Sep 2026)", body: "b", link: "/superinvestors/ashish-kacholia", at: "2026-11-21T03:00:00Z" }] };
let OVERLAP: object = { empty: false, emptyWhy: null, rows: [
  { symbol: "TITAN", name: "Titan Company", in: ["Portfolio"], investors: [{ key: "rekha-jhunjhunwala", name: "Rekha Jhunjhunwala", move: "reduced", moveText: "Stake cut", sourceError: false }], prism: P("Strong", 80.3), return1y: 19.2 },
  { symbol: "INFY", name: "Infosys", in: ["Portfolio"], investors: [], prism: P("Healthy", 70.1), return1y: -3.1 },
  { symbol: "CANBK", name: "Canara Bank", in: ["Watchlist"], investors: [{ key: "rekha-jhunjhunwala", name: "Rekha Jhunjhunwala", move: "new", moveText: "New stake", sourceError: false }], prism: P("Healthy", 65.2), return1y: -10.1 }] };
const send = vi.fn(async (method: string, path: string, body?: { new: boolean; added: boolean; reduced: boolean; exited: boolean }) => {
  if (path.endsWith("/alert-prefs")) FOLLOW = { ...FOLLOW, prefs: body! };
  else { const k = path.split("/").pop()!; FOLLOW = { ...FOLLOW, follows: method === "PUT" ? [...FOLLOW.follows, k] : FOLLOW.follows.filter((x) => x !== k) }; }
  return FOLLOW;
});
const get = vi.fn(async (path: string) => {
  if (path === "/api/me/superinvestors/follows") return FOLLOW;
  if (path === "/api/me/superinvestors/overlap") return OVERLAP;
  if (path === "/api/superinvestors") return LIST;
  if (path === "/api/superinvestors/tracked") return TRACKED;
  if (path === "/api/superinvestors/tracked?since=quarter") return { ...TRACKED, since: "quarter", sinceText: "Since last quarter", quarterAvailable: true, quarterReady: false, quarterCover: 40, tiles: { ...TRACKED.tiles, moves: 64 } };
  if (path === "/api/superinvestors/ashish-kacholia") return PAGE;
  if (path === "/api/superinvestors/bengal-finance-and-investment-pvt-ltd") return { status: "moved", to: "ashish-kacholia", name: "Ashish Kacholia" };
  throw Object.assign(new Error("x"), { status: 404, body: { detail: "No investor by that name in the stored filings." } });
});
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: (p: string) => get(p), apiSend: (m: string, p: string, b?: never) => send(m, p, b) }));
import { SuperinvestorNamePage, SuperinvestorPage, SuperinvestorsPage } from "./Superinvestors";

afterEach(() => { cleanup(); get.mockClear(); });
const open = (path: string) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>
  <Routes><Route path="/superinvestors" element={<SuperinvestorsPage />} /><Route path="/superinvestors/name/:key" element={<SuperinvestorNamePage />} /><Route path="/superinvestors/:key" element={<SuperinvestorPage />} /></Routes></MemoryRouter></QueryClientProvider>);
const text = () => document.body.textContent!;

describe("task #289: Tracked investors tab", () => {
  it("opens on Tracked investors with the Gold badge, the new description, the two tabs and the four tiles", async () => {
    PLAN = "gold"; open("/superinvestors");
    await screen.findByRole("heading", { name: "Latest moves" });
    expect(document.querySelector("header")!.getAttribute("data-plan")).toBe("gold");
    expect(text()).toContain("What well-known investors own and changed, from shareholding filings (holders of 1% or more).");   // the one-line header (founder, 22 Nov 2026)
    expect(screen.getByRole("tab", { name: /Tracked investors 26/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: /All named holders 1,315/ })).toBeTruthy();
    const tiles = [...document.querySelectorAll(".sx-stats .si-stat")].map((t) => t.textContent);
    expect(tiles).toEqual([expect.stringMatching(/^Tracked investors26/), expect.stringMatching(/^Companies named325/), expect.stringMatching(/^Moves since a year ago279/), expect.stringMatching(/^Held by 2 or more27/)]);
    expect(text()).not.toMatch(/Silver/);
  });
  it("latest moves: largest first, 15 rows then 15 more, kind chips with counts, size and investor filters, 'about' for no longer named", async () => {
    PLAN = "gold"; open("/superinvestors");
    const sec = (await screen.findByRole("heading", { name: "Latest moves" })).closest("section")!;
    const rows = () => within(sec).getAllByRole("row").slice(1);
    expect(rows()).toHaveLength(15);
    expect(rows()[0].textContent).toMatch(/Radhakishan Damani.*New stake.*NSE.*filing Sep 2026.*not named → 1\.58%.*₹6,697 cr.*Not rated.*Large/);
    expect(rows()[2].textContent).toMatch(/No longer named.*1\.67% → under 1%.*about ₹199 cr/);
    fireEvent.click(within(sec).getByRole("button", { name: /Show 8 more/ }));
    expect(rows()).toHaveLength(23);
    expect(within(sec).getByRole("button", { name: "New stakes 2" })).toBeTruthy();
    fireEvent.click(within(sec).getByRole("button", { name: "New stakes 2" }));
    expect(rows()).toHaveLength(2);
    fireEvent.change(within(sec).getByRole("combobox", { name: /Investor/ }), { target: { value: "ashish-kacholia" } });
    expect(rows().map((r) => r.textContent)).toEqual([expect.stringMatching(/Ashish Kacholia.*ESDS/)]);
    expect(sec.textContent).toMatch(/“No longer named” means the stake is now under 1% or gone; the filing does not say which/);
    expect((within(sec).getByRole("button", { name: "Since last quarter" }) as HTMLButtonElement).disabled).toBe(true);      // until each quarter is stored
  });
  it("stocks they agree on: three views, names linked, FinLit's view beside each", async () => {
    PLAN = "gold"; open("/superinvestors");
    const sec = (await screen.findByRole("heading", { name: "Stocks they agree on" })).closest("section")!;
    const row = within(sec).getAllByRole("row")[1];
    expect(row.textContent).toMatch(/ESDS.*ESDS · Small.*11\.65%.*1 new or up.*Not rated.*Short Downtrend.*Long Uptrend.*Leader.*\+42\.0%/);
    expect(within(row).getByText("Leader").getAttribute("title")).toBe("8th of 19 Chemicals: Specialty peers");
    fireEvent.click(within(sec).getByRole("button", { name: "Added by most this year" }));
    expect(sec.textContent).toMatch(/No company has two or more tracked investors in this view/);
    fireEvent.click(within(sec).getByRole("button", { name: "Cut by most this year" }));
    expect(within(sec).getAllByRole("columnheader")[1].textContent).toBe("Cut or out for");
  });
  it("one card per investor, sorted by value; named stakes show '—' under 60% cover; the sort changes the order", async () => {
    PLAN = "gold"; open("/superinvestors");
    const sec = (await screen.findByRole("heading", { name: "Tracked investors", level: 2 })).closest("section")!;
    const cards = () => [...sec.querySelectorAll(".sx-card")].map((c) => c.textContent!);
    expect(cards()[0]).toMatch(/Radhakishan Damani.*3 filed names grouped · 2 companies.*₹10,120 cr.*—.*13% of the value has a 1-year price/);
    expect(cards()[1]).toMatch(/Ashish Kacholia.*39 companies.*₹2,920 cr.*\+24\.0%.*same-size market −12\.8%.*13 new.*4 up.*13 cut.*10 out/);
    fireEvent.change(within(sec).getByRole("combobox", { name: /Sort by/ }), { target: { value: "name" } });
    expect(cards()[0]).toMatch(/^Ashish Kacholia/);
    expect(sec.textContent).toMatch(/It is not the investor's own return/);
  });
  it("below Gold: the Gold lock card with the four points, and the server is not asked", async () => {
    for (const plan of ["basic", "silver"]) {
      PLAN = plan; open("/superinvestors");
      const lock = await screen.findByRole("heading", { name: "Superinvestor portfolios", level: 2 });
      expect(lock.closest(".gate")!.className).toMatch(/is-locked/);
      expect(lock.closest(".lock-card")!.textContent).toMatch(/Gold plan.*Each tracked investor's stocks, under every name they file with.*Moves in the latest filings.*FinLit Prism, technical scores and peer labels.*an alert when they file a change.*Unlock with Gold/);
      expect(get).not.toHaveBeenCalledWith("/api/superinvestors/tracked");
      expect(text()).not.toMatch(/Silver/);
      cleanup(); get.mockClear();
    }
  });
});

describe("task #289: a tracked investor's page", () => {
  it("names grouped, four tiles, stock picks with FinLit's view, filters, how the stakes have done, moves, sector and size", async () => {
    PLAN = "gold"; open("/superinvestors/ashish-kacholia");
    await screen.findByRole("heading", { name: "Names grouped here" });
    expect(text()).toMatch(/Named with 1% or more in 39 listed companies under 3 names, worth ₹2,920 cr at today's prices/);
    expect(document.querySelector(".sx-names")!.textContent).toMatch(/Ashish Kacholia · person · 30 companies.*Bengal Finance & Investment Pvt\. Ltd · company · 14 companies.*Suryavanshi.*4 companies/);
    const tiles = [...document.querySelectorAll(".sx-stats .si-stat")].map((t) => t.textContent);
    expect(tiles[2]).toMatch(/Moves since a year ago40.*13 new · 4 up · 13 cut · 10 no longer named/);
    expect(tiles[3]).toMatch(/Named stakes, 1 year\+24\.0%same-size market −12\.8%/);
    const sec = screen.getByRole("heading", { name: "Stock picks and weightings" }).closest("section")!;
    const rows = () => within(sec).getAllByRole("row").slice(1).map((r) => r.textContent!);
    expect(rows()).toHaveLength(3);                                          // QPOWER is no longer named: not a holding today
    expect(rows()[0]).toMatch(/SHAILY.*SHAILY · Micro · filing Sep 2026 · 2 names.*4\.94%.*−0\.27 pts in the year.*₹706 cr.*24\.2% of the value.*Average.*50\.1.*Short Sideways.*Long Uptrend.*In line.*\+30\.0%/);
    expect(rows()[1]).toMatch(/ESDS.*new this year.*Strong.*80\.3.*Leader.*Mukul Agrawal|ESDS.*new this year.*Strong.*80\.3.*Leader/);
    expect(rows()[2]).toMatch(/TIRUMALCHM.*year-ago figure: source error/);
    fireEvent.click(within(sec).getByRole("button", { name: /Prism Strong or Healthy 1/ }));
    expect(rows()).toHaveLength(1);
    fireEvent.click(within(sec).getByRole("button", { name: /Leaders among peers 1/ }));
    expect(rows()[0]).toMatch(/ESDS/);
    fireEvent.click(within(sec).getByRole("button", { name: /Changed this year 2/ }));     // the source error is not a change
    expect(rows()).toHaveLength(2);
    const perf = screen.getByRole("heading", { name: "How the named stakes have done" }).closest("section")!;
    expect(perf.textContent).toMatch(/Named stakes, 1-year price move\+24\.0%Same-size market−12\.8%Share of the value with a 1-year price78%/);
    expect(perf.textContent).toMatch(/It is not the investor's own return/);
    const moves = screen.getByRole("heading", { name: "Moves" }).closest("section")!;
    expect(moves.textContent).toMatch(/New stake.*ESDS.*not named → 2\.05%.*No longer named.*QPOWER.*1\.67% → under 1%.*about ₹199 cr/);
    const mix = screen.getByRole("heading", { name: "Sector and size" }).closest("section")!;
    expect(mix.textContent).toMatch(/By sector.*Information Technology.*10\.3%.*By company size.*Micro.*below ₹10,000 cr · 37 companies.*66\.5%.*Small.*33\.5%/);
    expect(text()).toMatch(/Tracked investors\. A list kept by FinLit's editors/);
    expect(text()).not.toMatch(/Silver/);
  });
  it("an old link to a name grouped into a tracked investor opens the tracked page", async () => {
    PLAN = "gold"; open("/superinvestors/bengal-finance-and-investment-pvt-ltd");
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/superinvestors/ashish-kacholia"));
    await screen.findByRole("heading", { name: "Names grouped here" });
  });
  it("below Gold: locked, the server is not asked, and a tracked key is not 'unknown'", async () => {
    PLAN = "silver"; open("/superinvestors/ashish-kacholia");
    const lock = await screen.findByRole("heading", { name: "Superinvestor portfolios", level: 2 });
    expect(lock.closest(".gate")!.className).toMatch(/is-locked/);
    expect(get).not.toHaveBeenCalledWith("/api/superinvestors/ashish-kacholia");
    expect(text()).not.toMatch(/No investor by that name/);
  });
});

describe("task #289: following, alerts and your stocks", () => {
  it("each card has Follow; following counts; your stocks they hold; alert choices, follow chips and the latest alerts", async () => {
    PLAN = "gold"; open("/superinvestors");
    const cards = (await screen.findByRole("heading", { name: "Tracked investors", level: 2 })).closest("section")!;
    await within(cards).findByText("Following 1");
    expect(within(cards).getByRole("button", { name: "Stop following Ashish Kacholia" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(within(cards).getByRole("button", { name: "Follow Radhakishan Damani" }));
    await within(cards).findByText("Following 2");
    expect(send).toHaveBeenCalledWith("PUT", "/api/me/superinvestors/follows/radhakishan-damani", undefined);
    const yours = (await screen.findByRole("heading", { name: "Your stocks they hold" })).closest("section")!;
    await waitFor(() => expect(within(yours).getAllByRole("row")).toHaveLength(4));
    const rows = within(yours).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(rows[0]).toMatch(/Titan Company.*TITAN.*Portfolio.*Rekha Jhunjhunwala.*Stake cut.*Strong.*80\.3.*\+19\.2%/);
    expect(rows[1]).toMatch(/Infosys.*Portfolio.*No tracked investor named/);
    expect(rows[2]).toMatch(/Canara Bank.*Watchlist.*New stake/);
    const fol = screen.getByRole("heading", { name: "Following and alerts" }).closest("section")!;
    expect(fol.textContent).toMatch(/once per investor, company and filing quarter/);
    const box = within(fol).getByRole("checkbox", { name: "Stake cut" }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() => expect(send).toHaveBeenCalledWith("PUT", "/api/me/superinvestors/alert-prefs", { new: true, added: true, reduced: false, exited: true }));
    expect(within(fol).getByRole("link", { name: /Ashish Kacholia: new stake in ESDS Software Solution, 2\.05% \(filing Sep 2026\)/ }).getAttribute("href")).toBe("/superinvestors/ashish-kacholia");
    fireEvent.click(within(fol).getByRole("button", { name: "Stop following Ashish Kacholia" }));
    await waitFor(() => expect(send).toHaveBeenCalledWith("DELETE", "/api/me/superinvestors/follows/ashish-kacholia", undefined));
  });
  it("with no portfolio and no watchlist it says how to start; the investor page has Follow beside the eyebrow", async () => {
    OVERLAP = { empty: true, emptyWhy: "x", rows: [] };
    PLAN = "gold"; open("/superinvestors");
    const yours = (await screen.findByRole("heading", { name: "Your stocks they hold" })).closest("section")!;
    await within(yours).findByText(/to see who else holds them/);
    expect(within(yours).getByRole("link", { name: "portfolio" }).getAttribute("href")).toBe("/holdings");
    cleanup();
    open("/superinvestors/ashish-kacholia");
    await screen.findByRole("heading", { name: "Names grouped here" });
    expect(document.querySelector("header .sx-eye .sx-fol")).toBeTruthy();
  });
});

describe("task #289: since last quarter, once each quarter's filings are stored", () => {
  it("'Since last quarter' is off until quarters are stored; once some are, choosing it asks the server and the tiles say so", async () => {
    PLAN = "gold"; open("/superinvestors");
    const sec = (await screen.findByRole("heading", { name: "Latest moves" })).closest("section")!;
    expect((within(sec).getByRole("button", { name: "Since last quarter" }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    Object.assign(TRACKED, { quarterAvailable: true, quarterCover: 40 });
    open("/superinvestors");
    const sec2 = (await screen.findByRole("heading", { name: "Latest moves" })).closest("section")!;
    const q = within(sec2).getByRole("button", { name: "Since last quarter" }) as HTMLButtonElement;
    expect(q.disabled).toBe(false);
    expect(q.getAttribute("title")).toMatch(/stored for 40% of these holdings so far/);
    fireEvent.click(q);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/superinvestors/tracked?since=quarter"));
    await waitFor(() => expect(document.querySelector(".sx-stats")!.textContent).toMatch(/Moves since last quarter64/));
    Object.assign(TRACKED, { quarterAvailable: false });
  });
  it("the investor page adds 'Since first named' and the 8-quarter stake line when quarters are stored", async () => {
    const saved = PAGE.holdings;
    PAGE.holdings = [{ ...saved[0], quarters: [["Dec 2025", 0.5], ["Mar 2026", 1.2], ["Jun 2026", 5.21], ["Sep 2026", 4.94]], sinceFirstNamed: { from: "Mar 2026", pct: 18.4 } }, ...saved.slice(1)] as unknown as typeof saved;
    PLAN = "gold"; open("/superinvestors/ashish-kacholia");
    const sec = (await screen.findByRole("heading", { name: "Stock picks and weightings" })).closest("section")!;
    const heads = within(sec).getAllByRole("columnheader").map((h) => h.textContent);
    expect(heads).toContain("Since first named"); expect(heads).toContain("Stake, 8 quarters");
    const row = within(sec).getAllByRole("row")[1];
    expect(row.textContent).toMatch(/\+18\.4%from Mar 2026/);
    expect(within(row).getByRole("img").getAttribute("aria-label")).toBe("Dec 2025 0.50%, Mar 2026 1.20%, Jun 2026 5.21%, Sep 2026 4.94%");
    PAGE.holdings = saved;
  });
});
