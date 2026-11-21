// @vitest-environment jsdom
// Task #212: superinvestor portfolios. The All named holders list is open to everyone; a portfolio (picks, weightings, sectors, the year's changes) is Gold
// since task #289 (the Silver plan is being removed), and a filed name's own portfolio is at /superinvestors/name/<key>.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

let PLAN = "basic";
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: (t: string) => ({ basic: 0, silver: 1, gold: 2 } as Record<string, number>)[PLAN] >= ({ basic: 0, silver: 1, gold: 2 } as Record<string, number>)[t], upgrade: vi.fn(), toast: vi.fn() }),
  TIER: { silver: { n: "Silver", ic: "medal", tc: "--silver" }, gold: { n: "Gold", ic: "crown", tc: "--gold" }, basic: { n: "Free", ic: "sprout", tc: "--text" } } }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title, description }: { title: string; description?: React.ReactNode }) => <header><h1>{title}</h1><div>{description}</div></header> }));

const META = { asOf: "Sep 2026", fetchedFrom: "2026-11-09", fetchedTo: "2026-11-11", pricesAt: "2026-11-17T10:00:00Z", source: "Each company's shareholding filing (named public shareholders of 1% or more), via FinEdge; values at today's market capitalisation.",
  disclaimer: "Information only, not investment advice. Holdings below 1% are not named in filings, so a portfolio here shows only stakes of 1% or more.", noteNames: "Names are matched as the filings write them.", rule: "Named public shareholders who hold 1% or more of at least 2 listed companies today." };
const KEDIA = { key: "vijay-kedia", name: "Vijay Kedia", kind: "person", companies: 2, valueCr: 72, valueNote: null, top: [{ symbol: "BBB", name: "Bbb Tech Ltd", weightPct: 83.33 }, { symbol: "AAA", name: "Aaa Industries Ltd", weightPct: 16.67 }], changes: { new: 1, added: 0, reduced: 0, exited: 0 } };
const KACH = { key: "ashish-kacholia", name: "Ashish Kacholia", kind: "person", tracked: { key: "ashish-kacholia", name: "Ashish Kacholia" }, companies: 3, valueCr: 47, valueNote: "1 holding without a market value today, left out of the total.", top: [{ symbol: "AAA", name: "Aaa Industries Ltd", weightPct: 53.19 }], changes: { new: 1, added: 1, reduced: 1, exited: 1 } };
const FIRM = { key: "some-holdings-pvt-ltd", name: "Some Holdings Pvt Ltd", kind: "firm", companies: 2, valueCr: 900, valueNote: null, top: [{ symbol: "AAA", name: "Aaa Industries Ltd", weightPct: 60 }], changes: { new: 0, added: 0, reduced: 0, exited: 0 } };
const LIST = { ...META, investors: [FIRM, KEDIA, KACH], count: 3, people: 2, firms: 1, emptyWhy: null, covered: 4, companies: 5839 };
const h = (o: object) => ({ industry: "IT - Software", sector: "Information Technology", asOf: "Sep 2026", fetched: "2026-11-10", status: "unchanged", statusText: "No change", ...o });
const PORT = { ...KACH, ...META,
  holdings: [h({ symbol: "AAA", name: "Aaa Industries Ltd", stakeNow: 2.5, stakeYearAgo: 1.5, changePts: 1, status: "added", valueCr: 25, valueWhy: null, weightPct: 53.19, industry: "Auto Components", sector: "Automobile and Auto Components" }),
    h({ symbol: "BBB", name: "Bbb Tech Ltd", stakeNow: 1.1, stakeYearAgo: 1.4, changePts: -0.3, status: "reduced", valueCr: 22, valueWhy: null, weightPct: 46.81 }),
    h({ symbol: "DDD", name: "Ddd Ltd", stakeNow: 1, stakeYearAgo: null, changePts: null, status: "new", valueCr: null, valueWhy: "No market capitalisation in today's quote list for this company.", weightPct: null, industry: null, sector: null, sectorWhy: "Not classified by NSE's sector list." })],
  sectors: [{ sector: "Automobile and Auto Components", valueCr: 25, weightPct: 53.19, companies: 1 }, { sector: "Information Technology", valueCr: 22, weightPct: 46.81, companies: 1 }],
  history: [] as object[] };
PORT.history = [PORT.holdings[2], PORT.holdings[0], PORT.holdings[1], h({ symbol: "CCC", name: "Ccc Foods Ltd", stakeNow: 0, stakeYearAgo: 2, changePts: -2, status: "exited", statusText: "No longer named (sold, or below 1%)" })];

const get = vi.fn(async (path: string) => {
  if (path === "/api/superinvestors") return LIST;
  if (path === "/api/superinvestors/name/ashish-kacholia") return { ...PORT, kind_of_page: "name", tracked: { key: "ashish-kacholia", name: "Ashish Kacholia" } };
  throw Object.assign(new Error("x"), { status: 404, body: { detail: "No investor by that name in the stored filings." } });
});
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: (p: string) => get(p) }));
import { SuperinvestorNamePage, SuperinvestorPage, SuperinvestorsPage, changesLine, crore, pts } from "./Superinvestors";

afterEach(() => { cleanup(); get.mockClear(); });
const open = (path: string) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>
  <Routes><Route path="/superinvestors" element={<SuperinvestorsPage />} /><Route path="/superinvestors/name/:key" element={<SuperinvestorNamePage />} /><Route path="/superinvestors/:key" element={<SuperinvestorPage />} /></Routes></MemoryRouter></QueryClientProvider>);

describe("Superinvestor portfolios (#212)", () => {
  it("lists every investor, largest value first, with picks, the year's changes, the source and the disclaimer", async () => {
    PLAN = "basic"; open("/superinvestors?tab=all");
    await screen.findByRole("link", { name: "Vijay Kedia" });
    const rows = screen.getAllByRole("listitem").filter((li) => li.className === "si-row");
    expect(rows.map((r) => within(r).getAllByRole("link")[0].textContent)).toEqual(["Vijay Kedia", "Ashish Kacholia"]);
    expect(rows[1].textContent).toMatch(/3 companies · 1 newly named · 1 up · 1 down · 1 no longer named/);
    expect(within(rows[1]).getAllByRole("link")[0].getAttribute("href")).toBe("/superinvestors/name/ashish-kacholia");     // the filed name's own page
    expect(within(rows[1]).getByRole("link", { name: "Tracked: Ashish Kacholia" }).getAttribute("href")).toBe("/superinvestors/ashish-kacholia");
    expect(document.body.textContent).toMatch(/This list is as the filings write it: it includes company insiders, strategic holders and family members/);
    expect(rows[1].textContent).toMatch(/₹47 cr/);
    expect(rows[1].textContent).toMatch(/1 holding without a market value today/);
    expect(document.body.textContent).toMatch(/via FinEdge/);
    expect(document.body.textContent).toMatch(/Built from the filings of 4 of 5,839 listed companies. Latest quarter Sep 2026/);
    expect(document.body.textContent).toMatch(/not investment advice/);
  });
  it("finds an investor by name or by a company they hold", async () => {
    PLAN = "basic"; open("/superinvestors?tab=all");
    const box = await screen.findByRole("searchbox", { name: /Find an investor/ });
    fireEvent.change(box, { target: { value: "bbb" } });
    expect(screen.getByText("1 of 2")).toBeTruthy();
    fireEvent.change(box, { target: { value: "nobody" } });
    expect(document.querySelector(".si-empty")!.textContent).toBe("No person matches “nobody”.");
  });
  it("opens on people; companies and funds are one tab away, kept in the address", async () => {
    PLAN = "basic"; open("/superinvestors?tab=all");
    await screen.findByRole("link", { name: "Vijay Kedia" });
    expect(screen.queryByRole("link", { name: "Some Holdings Pvt Ltd" })).toBeNull();
    expect(screen.getByRole("tab", { name: /People 2/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("2 people")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Companies and funds 1/ }));
    expect(screen.getByRole("link", { name: "Some Holdings Pvt Ltd" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Vijay Kedia" })).toBeNull();
    expect(screen.getByText("1 companies and funds")).toBeTruthy();
    const box = screen.getByRole("searchbox", { name: /Find an investor/ });
    fireEvent.change(box, { target: { value: "kedia" } });
    expect(document.querySelector(".si-empty")!.textContent).toMatch(/No company or fund matches “kedia” here; try People/);
    fireEvent.click(screen.getByRole("button", { name: "People" }));
    expect(screen.getByRole("link", { name: "Vijay Kedia" })).toBeTruthy();
  });
  it("a portfolio is locked for Basic, and the server is not asked for it", async () => {
    PLAN = "basic"; open("/superinvestors/ashish-kacholia");
    await screen.findByRole("heading", { name: "Superinvestor portfolios", level: 2 });
    expect(get).not.toHaveBeenCalledWith("/api/superinvestors/ashish-kacholia");
    expect(document.querySelector(".gate.is-locked")).toBeTruthy();
  });
  it("silver no longer opens a portfolio: it is Gold since task #289, and the server is not asked", async () => {
    PLAN = "silver"; open("/superinvestors/name/ashish-kacholia");
    await screen.findByRole("heading", { name: "Superinvestor portfolios", level: 2 });
    expect(document.querySelector(".gate.is-locked")!.textContent).toMatch(/Gold plan/);
    expect(document.body.textContent).not.toMatch(/Silver/);
    expect(get).not.toHaveBeenCalledWith("/api/superinvestors/name/ashish-kacholia");
  });
  it("gold sees a filed name's picks, weightings, sectors and the year's changes, with every blank's reason", async () => {
    PLAN = "gold"; open("/superinvestors/name/ashish-kacholia");
    const table = await screen.findByRole("table");
    expect(document.querySelector(".gate.is-locked")).toBeNull();
    const body = within(table).getAllByRole("row").slice(1).map((r) => r.textContent);
    expect(body[0]).toMatch(/Aaa Industries.*Auto Components.*2\.50%.*1\.50%.*\+1\.00 pts.*₹25 cr.*53\.2%/);
    expect(body[2]).toMatch(/Ddd.*Not classified.*1\.00%.*not named.*new.*no price/);
    expect(document.body.textContent).toMatch(/“no price”: No market capitalisation in today's quote list/);
    expect(screen.getByRole("heading", { name: "Sector allocation" })).toBeTruthy();
    expect(document.querySelector(".si-secs")!.textContent).toMatch(/Automobile and Auto Components.*53\.2%.*Information Technology.*46\.8%/);
    const hist = document.querySelector(".si-hist")!.textContent!;
    expect(hist).toMatch(/Newly named.*Ddd.*1\.00% now.*Stake up.*Aaa.*1\.50% → 2\.50%.*Stake down.*Bbb.*No longer named.*Ccc.*2\.00% a year ago/);
    expect(document.body.textContent).toMatch(/sold or now holds under 1%; the filing does not say which/);
    expect(screen.getByRole("link", { name: "Ashish Kacholia" }).getAttribute("href")).toBe("/superinvestors/ashish-kacholia");   // the grouped page
  });
  it("an unknown investor says so and links back to the list", async () => {
    PLAN = "gold"; open("/superinvestors/nobody-at-all");
    await waitFor(() => expect(document.body.textContent).toMatch(/No investor by that name in the stored filings/));
    expect(screen.getByRole("link", { name: /See every investor/ }).getAttribute("href")).toBe("/superinvestors");
  });
  it("formats", () => {
    expect(crore(1234.4)).toBe("₹1,234 cr"); expect(crore(22)).toBe("₹22 cr"); expect(crore(null)).toBe("—");
    expect(pts(-0.3)).toBe("−0.30 pts"); expect(pts(1)).toBe("+1.00 pts");
    expect(changesLine({ new: 0, added: 0, reduced: 0, exited: 0 })).toBe("No changes in the year");
  });
});
