// @vitest-environment jsdom
// Stress Lab page: the plan gate, the messages for a company outside the coverage, and the model drawn into the page for a covered one.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "../../public/demo/stress-page.json";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
const st = vi.hoisted(() => ({ gold: true, silver: true, status: 200, body: null as unknown, hang: false, draw: false, picks: [] as { symbol: string; name: string }[], peerStatus: 200, hits: [] as string[][], plan: "", covered: null as string[] | null, bodyStatus: "" }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: (t: string) => (t === "gold" ? st.gold : st.silver), upgrade: vi.fn(), toast: vi.fn() }), TIER: { gold: { n: "Gold" }, silver: { n: "Silver" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children }: { children: React.ReactNode }) => <>{children}</>, TierChip: () => null }));
vi.mock("../components/OutlookPicker", () => ({ OutlookPicker: ({ picks, recents }: { picks?: { symbol: string }[] | null; recents?: boolean }) => <ul aria-label="picker" data-recents={String(recents)}>{(picks ?? []).map((p) => <li key={p.symbol}>{p.symbol}</li>)}</ul> }));
vi.mock("../stress/stressLab", async (orig) => { const m = await orig<typeof import("../stress/stressLab")>(); return { ...m, mountStressLab: (...a: Parameters<typeof m.mountStressLab>) => { if (st.draw) throw new Error("boom"); return m.mountStressLab(...a); } }; });
vi.mock("../components/PageHeader", () => ({ PageHeader: () => <header /> }));
vi.mock("../components/SearchFilters", () => ({ useIndexFilter: () => ({ search: () => st.hits }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: vi.fn(async (path: string) => {
  const { ApiError } = await orig<typeof import("../lib/api")>();
  if (st.hang) return new Promise(() => {});
  if (path.endsWith("/covered")) { if (!st.covered) throw new ApiError(500, {}); return { symbols: st.covered }; }
  if (st.status !== 200) throw new ApiError(st.status, { detail: st.body, ...(st.bodyStatus ? { status: st.bodyStatus } : {}) } as never);
  if (path.endsWith("/quick-picks")) return { picks: st.picks };
  if (path.endsWith("/peer")) return { peer: null, peers: [] };
  const other = path.match(/\/api\/stress\/([^/]+)\/page/)?.[1];
  if (other && other !== "ASIANPAINT") {   // a second company: its own name, and its history rows in another order (they must be matched by episode)
    if (st.peerStatus !== 200) throw new ApiError(st.peerStatus, { detail: "being built" } as never);
    const d = JSON.parse(JSON.stringify(fixture)); d.company.symbol = other; d.company.name = "Peer X Ltd";
    d.history = d.history.map((h: any, i: number) => ({ episode: h.episode, from: h.from, to: h.to, nifty: null, [other]: { fall_pct: -(i + 1) * 11, peak: null, trough: null, back: null } })).reverse();
    return d;
  }
  return st.plan ? { ...fixture, plan: st.plan } : fixture;
}) }));
import { StressLabIndexPage, StressLabPage } from "./StressLab";

afterEach(() => { cleanup(); st.hang = false; st.draw = false; st.status = 200; st.peerStatus = 200; st.hits = []; st.covered = null; st.bodyStatus = ""; location.hash = ""; });
const Loc = () => <output data-testid="loc">{useLocation().search}</output>;
const openAt = (url: string) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[url]}><Routes><Route path="/research/stress-lab/:symbol" element={<><StressLabPage /><Loc /></>} /></Routes></MemoryRouter></QueryClientProvider>);
const shadow = () => document.querySelector(".sl-host")?.shadowRoot ?? null;
const open = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/research/stress-lab/ASIANPAINT"]}><Routes><Route path="/research/stress-lab/:symbol" element={<StressLabPage />} /></Routes></MemoryRouter></QueryClientProvider>);

describe("Stress Lab page", () => {
  it("while the page is being prepared it says it checks again by itself, and shows the page as soon as the server has it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      st.status = 503; st.body = "being built"; open();
      expect(await screen.findByRole("heading", { name: "Stress Lab for this company is being prepared" })).toBeTruthy();
      expect(screen.getByText(/checks again by itself every 20 seconds/)).toBeTruthy();
      st.status = 200;                                                          // the background build has stored the page
      await vi.advanceTimersByTimeAsync(20_500);
      await waitFor(() => expect(document.querySelector(".sl-host")?.shadowRoot?.getElementById("head")?.textContent).toMatch(/Asian Paints/));
      expect(screen.queryByRole("heading", { name: "Stress Lab for this company is being prepared" })).toBeNull();
    } finally { vi.useRealTimers(); }
  });
  it("draws the model into a shadow root: Today's result and eight scenario chips, from the engine", async () => {
    st.status = 200; open();
    await waitFor(() => expect(document.querySelector(".sl-host")?.shadowRoot?.getElementById("head")?.textContent).toMatch(/Asian Paints’ earnings per share fall 10\.5%, from ₹52\.77 to ₹47\.25/));
    const root = document.querySelector(".sl-host")!.shadowRoot!;
    expect(root.querySelectorAll(".chip").length).toBe(8);
    expect(root.textContent).toMatch(/illustrative stress test/i);
    expect(root.textContent).not.toMatch(/\b(buy|sell)\b/i);
  });
  it("says why a company is not covered, in the server's own words", async () => {
    st.status = 404; st.body = "Stress Lab does not cover financial companies yet."; open();
    expect(await screen.findByText("Stress Lab does not cover financial companies yet.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /does not cover this company/ })).toBeTruthy();
  });
  it("tells the member in plain words when the page is being prepared, with a way back, and never prints the server's reason (SL-3, SL-4)", async () => {
    st.status = 503; st.body = "Macro data has not been loaded yet."; open();
    expect(await screen.findByRole("heading", { name: "Stress Lab for this company is being prepared" })).toBeTruthy();
    expect(screen.getByText("Please check back later.")).toBeTruthy();
    expect(screen.queryByText(/Macro data/)).toBeNull();
    expect(screen.getByRole("link", { name: "Company report" }).getAttribute("href")).toBe("/stocks/ASIANPAINT");
  });
  it("any other fault is the same plain card, not a blank page and not a technical message", async () => {
    st.status = 500; st.body = "Traceback: KeyError usdinr="; open();
    expect(await screen.findByRole("heading", { name: "Stress Lab for this company is being prepared" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Traceback|usdinr=|KeyError/);
  });
  it("shows a visible loading state while the page is fetched, never an empty body (SL-3)", async () => {
    st.hang = true; open();
    expect((await screen.findByRole("status")).textContent).toContain("Loading Stress Lab for ASIANPAINT");
    expect(document.querySelector(".ol-skel i")).toBeTruthy();
  });
  it("a page whose data arrived but could not be drawn says so, offers a reload and logs the fault: it is not 'being prepared' (SL-3, task 79)", async () => {
    st.draw = true; const err = vi.spyOn(console, "error").mockImplementation(() => {}); open();
    expect(await screen.findByRole("heading", { name: "Stress Lab could not show this page" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: /being prepared/ })).toBeNull();
    expect(screen.getByText(/arrived, but the page could not be drawn/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reload the page" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Company report" }).getAttribute("href")).toBe("/stocks/ASIANPAINT");
    expect(screen.getByRole("link", { name: "Outlook" }).getAttribute("href")).toBe("/outlook/ASIANPAINT");
    expect(err).toHaveBeenCalledWith(expect.stringMatching(/Stress Lab could not be drawn for ASIANPAINT/), expect.any(Error));
    expect(document.querySelector(".sl-host")).toBeNull();                       // no half-drawn page under the card
    err.mockRestore();
  });
  it("a server fault is still 'being prepared', never the draw-failure card", async () => {
    st.status = 503; st.body = "x"; open();
    expect(await screen.findByRole("heading", { name: "Stress Lab for this company is being prepared" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Stress Lab could not show this page" })).toBeNull();
  });
  it("the start page offers only the quick picks the server sends, and not the Outlook page's own list (SL-5)", async () => {
    st.picks = [{ symbol: "RELIANCE", name: "Reliance Industries Ltd" }, { symbol: "TCS", name: "Tata Consultancy Services Ltd" }];
    render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><StressLabIndexPage /></MemoryRouter></QueryClientProvider>);
    const list = await screen.findByRole("list", { name: "picker" });
    await waitFor(() => expect(within(list).getAllByRole("listitem").map((x) => x.textContent)).toEqual(["RELIANCE", "TCS"]));
    expect(list.getAttribute("data-recents")).toBe("false");
    expect(document.body.textContent).not.toMatch(/HDFC|ICICI/);
  });
  it("shows the latest-quarter check and the inventory days, and the size once (task 79)", async () => {
    st.status = 200; open();
    await waitFor(() => expect(document.querySelector(".sl-host")?.shadowRoot?.getElementById("head")?.textContent).toMatch(/earnings per share/));
    const root = document.querySelector(".sl-host")!.shadowRoot!;
    expect(root.textContent).toMatch(/In the latest quarter the model put the margin at 13\.9% and Asian Paints reported 15\.6% \(from 17\.6%\)/);
    expect(root.textContent).toMatch(/about 120 days of inventory/);
    expect(root.querySelector(".costrip small")?.textContent).toBe("ASIANPAINT · Paints · Large cap");
    expect(root.querySelector(".costrip .logo")?.textContent).toBe("A");   // no logo on file: the initial shows
  });
  it("?with= the same company is ignored: the page is not set against itself (task 79)", async () => {
    openAt("/research/stress-lab/ASIANPAINT?with=ASIANPAINT");
    await waitFor(() => expect(shadow()?.getElementById("head")?.textContent).toMatch(/earnings per share/));
    expect(shadow()!.getElementById("costrip")!.textContent).not.toMatch(/vs/);
  });
  it("?with= another company draws the two side by side, its past falls matched to the same episodes (task 79)", async () => {
    location.hash = "#compare";
    openAt("/research/stress-lab/ASIANPAINT?with=PEERX");
    await waitFor(() => expect(shadow()?.getElementById("costrip")?.textContent).toMatch(/Peer X Ltd/));
    const rows = [...shadow()!.querySelectorAll("#hist tbody tr")].map((r) => r.textContent || "");
    expect(rows[0]).toMatch(/^2018 credit scare/); expect(rows[0]).toMatch(/−11\.0%/);   // the peer's 2018 row, though its rows came in reverse order
    expect(rows[3]).toMatch(/−44\.0%/);
  });
  it("Gold, Compare two, no covered peer: the reason and the 'Compare with' box are at the top of the page, and a pick is kept in the address (task 79)", async () => {
    location.hash = "#compare"; st.hits = [["PEERX", "Peer X Ltd", "", "", "PEERX"]];
    openAt("/research/stress-lab/ASIANPAINT");
    await waitFor(() => expect(shadow()?.getElementById("peerbox")?.textContent).toMatch(/No peer of this company is covered by Stress Lab yet/));
    expect(document.body.textContent).not.toMatch(/Use “Compare with”/);           // not a note under the whole page any more
    const input = shadow()!.querySelector<HTMLInputElement>("#peerbox input[type=search]")!;
    input.value = "peer"; input.dispatchEvent(new Event("input", { bubbles: true }));
    shadow()!.querySelector<HTMLElement>("#peerbox [data-go=PEERX]")!.click();
    await waitFor(() => expect(screen.getByTestId("loc").textContent).toBe("?with=PEERX"));
    await waitFor(() => expect(shadow()?.getElementById("costrip")?.textContent).toMatch(/Peer X Ltd/));
  });
  it("the search boxes offer only companies Stress Lab covers: a bank is not listed, and a covered company is (A4.7)", async () => {
    location.hash = "#compare"; st.covered = ["PIDILITIND", "BERGEPAINT"];
    st.hits = [["HDFCBANK", "HDFC Bank Ltd", "", "", "HDFCBANK"], ["IDFCFIRSTB", "IDFC First Bank Ltd", "", "", "IDFCFIRSTB"], ["PIDILITIND", "Pidilite Industries Ltd", "", "", "PIDILITIND"]];
    openAt("/research/stress-lab/ASIANPAINT");
    await waitFor(() => expect(shadow()?.getElementById("peerbox")).toBeTruthy());
    const input = shadow()!.querySelector<HTMLInputElement>("#peerbox input[type=search]")!;
    // until the list of covered companies has arrived the box offers everything: keep typing until it has filtered
    await waitFor(() => {
      input.value = "bank"; input.dispatchEvent(new Event("input", { bubbles: true }));
      expect(shadow()!.querySelector("#peerbox [data-go=PIDILITIND]")).toBeTruthy();
      expect(shadow()!.querySelector("#peerbox [data-go=HDFCBANK]")).toBeNull();
      expect(shadow()!.querySelector("#peerbox [data-go=IDFCFIRSTB]")).toBeNull();
    });
  });
  it("a symbol that is not a company says so, with one way on (A6)", async () => {
    st.status = 404; st.bodyStatus = "unknown_symbol"; st.body = "We could not find a listed company with that symbol."; open();
    expect(await screen.findByRole("heading", { name: "We could not find that company" })).toBeTruthy();
    expect(screen.getByText("We could not find a listed company with that symbol.")).toBeTruthy();
    expect(screen.queryByText("Company report")).toBeNull(); expect(screen.queryByText("Outlook")).toBeNull();
    expect(screen.getByRole("link", { name: "Pick a company" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/describe this company in the meantime/);
  });
  it("a second company being prepared says so at the top and appears by itself when it is ready (task 79)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      location.hash = "#compare"; st.peerStatus = 503;
      openAt("/research/stress-lab/ASIANPAINT?with=PEERX");
      await waitFor(() => expect(shadow()?.getElementById("peerbox")?.textContent).toMatch(/being prepared\. This page checks again by itself every 20 seconds/));
      st.peerStatus = 200;
      await vi.advanceTimersByTimeAsync(20_500);
      await waitFor(() => expect(shadow()?.getElementById("costrip")?.textContent).toMatch(/Peer X Ltd/));
    } finally { vi.useRealTimers(); }
  });
  it("Silver: 'See what Gold adds' goes to the plans (task 79)", async () => {
    st.gold = false; st.plan = "silver";
    try {
      openAt("/research/stress-lab/ASIANPAINT");
      await waitFor(() => expect(shadow()?.querySelector("[data-upgrade]")).toBeTruthy());
      expect(shadow()!.querySelector("[data-upgrade]")!.getAttribute("href")).toBe("/plans");
    } finally { st.gold = true; st.plan = ""; }
  });
});
