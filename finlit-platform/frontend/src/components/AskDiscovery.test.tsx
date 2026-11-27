// @vitest-environment jsdom
// Task #221: Discovery in the FinLit AI panel: the themes from companies' investor presentations (bucketed as the keyword directory), one theme's
// companies with keywords, the sentences with figures, the stage, the tone, the NSE sector, recent exchange filings and the presentation's link,
// "By sector", a sector filter, the directory's "what to verify", the caution on every screen, and the empty state before the first nightly read.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const CAUTION = "A keyword mention by itself is not proof of material business exposure: check the figures, orders, capacity and status in the presentation itself. Describes what the company says about itself; not a recommendation.";
const METHOD = "The newest investor presentation each company filed with NSE, first 80 pages, matched against the 21 themes of FinLit's keyword directory.";
let empty = false;
const asked: string[] = [];
const co = (symbol: string, company: string, primary: string, extra: Record<string, unknown> = {}) => ({
  symbol, company, primary, secondary: [], score: 12.5, keywords: ["Defence orders", "Radar systems"], verify: [], hasFigures: true,
  evidence: ["Defence order inflow of Rs 1,250 crore in H1 FY27, led by radar system and electronic warfare programmes."],
  stage: "operating", stageLabel: "Operating", tone: { score: 0.6, label: "Positive" },
  sector: { macro: "Industrials", sector: "Capital Goods", industry: "Aerospace & Defense" }, filings: { count: 3, positive: 1, negative: 1, events: { order: 1 } },
  document: { title: "Investor Presentation", date: "2026-11-16", link: `https://nsearchives.nseindia.in/corporate/${symbol}.pdf`, pages: 35 }, readAt: "2026-11-18T00:10:00+00:00", ...extra });
const theme = (name: string, primary: number, extra: Record<string, unknown> = {}) => ({
  name, primary, secondary: 0, preview: [], sectors: {}, stages: {}, news: { filings: 0, positive: 0, negative: 0 }, ...extra });
const DEF = {
  name: "Defence & Aerospace", primary: 2, secondary: 1, sectors: { Industrials: 1, "Information Technology": 1 }, stages: { Operating: 1, Planned: 1 },
  news: { filings: 4, positive: 3, negative: 1 },
  companies: [co("BSHIELD", "Bharat Shield Ltd", "Defence & Aerospace", { secondary: ["Space & Drone Technology"] }),
              co("SKYAV", "Sky Avionics Ltd", "Defence & Aerospace", { hasFigures: false, evidence: [], stage: "planned", stageLabel: "Planned", tone: { score: null, label: "Too few words to tell" },
                sector: { macro: "Information Technology", sector: "Information Technology", industry: "IT - Software" }, filings: { count: 0, positive: 0, negative: 0, events: {} },
                document: { title: "x", date: "2026-11-10", link: "https://evil.example/x.pdf", pages: 12 } })],
  alsoMentions: [co("ACMESOLAR", "Acme Solar Ltd", "Solar Technology")],
  verify: ["Verify procurement stage, trials, orders and regulatory approvals.", "Look for quantified revenue contribution, order value, capacity."],
  recentFilings: [{ symbol: "BSHIELD", company: "Bharat Shield Ltd", date: "2026-11-17", event: "order", eventLabel: "Order win", tone: 1, themes: ["Defence & Aerospace"], stage: null,
                    title: "Bharat Shield has received orders worth Rs 400 crore for radar systems", link: "https://nsearchives.nseindia.com/corporate/o.pdf" }],
};
vi.mock("../lib/api", () => ({ apiGet: vi.fn(async (path: string) => {
  asked.push(path);
  const base = { companies: empty ? 0 : 3, read: empty ? 0 : 4, statuses: {}, updated: empty ? null : "2026-11-18T00:10:00+00:00", caution: CAUTION, method: METHOD, sector: null,
                 bySector: empty ? {} : { Industrials: { "Defence & Aerospace": 1 }, Power: { "Solar Technology": 1 } } };
  if (path === "/api/discovery") return { ...base, themes: [
    theme("Solar Technology", empty ? 0 : 1, { preview: empty ? [] : ["Acme Solar Ltd"], sectors: empty ? {} : { Power: 1 } }),
    theme("Defence & Aerospace", empty ? 0 : 2, empty ? {} : { secondary: 1, preview: ["Bharat Shield Ltd", "Sky Avionics Ltd"], sectors: DEF.sectors, news: DEF.news }),
    theme("Nuclear Energy", 0)] };
  if (path === "/api/discovery?theme=Defence%20%26%20Aerospace") return { ...base, themes: [DEF] };
  if (path === "/api/discovery?theme=Defence%20%26%20Aerospace&sector=Industrials") return { ...base, sector: "Industrials", themes: [{ ...DEF, companies: [DEF.companies[0]] }] };
  throw new Error("not mocked: " + path);
}) }));
import { AskDiscovery } from "./AskDiscovery";

afterEach(() => { cleanup(); empty = false; asked.length = 0; });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AskDiscovery /></MemoryRouter></QueryClientProvider>);

describe("Discovery (task #221)", () => {
  it("lists the themes, most companies first, with counts, first names, the filings' tone and the caution", async () => {
    show();
    const list = await screen.findByRole("list", { name: "Discovery themes" });
    const names = within(list).getAllByRole("button").map((b) => b.querySelector("b")!.textContent);
    expect(names).toEqual(["Defence & Aerospace", "Solar Technology", "Nuclear Energy"]);
    expect(within(list).getByRole("button", { name: /Defence & Aerospace.*2 companies · 1 more mention it.*Bharat Shield Ltd, Sky Avionics Ltd.*4 filings in 90 days: 3 positive, 1 negative tone/ })).toBeTruthy();
    expect((within(list).getByRole("button", { name: /Nuclear Energy/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/3 companies placed, updated 18 Nov 2026/)).toBeTruthy();
    expect(screen.getByText(/not proof of material business exposure/)).toBeTruthy();
  });

  it("a theme shows each company's stage, sector, keywords, figures, tone, filings and the presentation link; back returns to the themes", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Defence & Aerospace/ }));
    const cos = await screen.findByRole("list", { name: "Companies: Defence & Aerospace" });
    const [first, second] = Array.from(cos.querySelectorAll<HTMLElement>(":scope > li"));
    expect(within(first).getByRole("link", { name: /Bharat Shield Ltd/ }).getAttribute("href")).toBe("/stocks/BSHIELD");
    expect(within(first).getByText("Operating")).toBeTruthy();
    expect(within(first).getByText("Industrials › Capital Goods › Aerospace & Defense")).toBeTruthy();
    expect(within(first).getByText("Radar systems")).toBeTruthy();
    expect(within(first).getByText(/Defence order inflow of Rs 1,250 crore/)).toBeTruthy();
    expect(within(first).getByText(/Tone of the presentation:/).textContent).toBe("Tone of the presentation: Positive (+0.60)");
    expect(within(first).getByText("3 filings in 90 days: 1 positive, 1 negative tone")).toBeTruthy();
    expect(within(first).getByText(/Also talks about: Space & Drone Technology/)).toBeTruthy();
    const doc = within(first).getByRole("link", { name: /Investor presentation, 16 Nov 2026/ });
    expect(doc.getAttribute("href")).toBe("https://nsearchives.nseindia.in/corporate/BSHIELD.pdf");
    expect(doc.getAttribute("rel")).toContain("noopener");
    expect(within(second).getByText("Planned")).toBeTruthy();
    expect(within(second).getByText(/no sentence with a figure/)).toBeTruthy();
    expect(within(second).getByText("No exchange filing in 90 days")).toBeTruthy();
    expect(within(second).queryByRole("link", { name: /Investor presentation/ })).toBeNull();      // only the exchanges' own links are opened
    expect(screen.getByRole("link", { name: "Acme Solar Ltd" }).getAttribute("href")).toBe("/stocks/ACMESOLAR");
    // task #250: the list of every exchange filing that names the theme is not shown (it ignored the sector picked; the team: "no need to show this list")
    expect(screen.queryByRole("list", { name: "Filings: Defence & Aerospace" })).toBeNull();
    expect(screen.queryByText(/Exchange filings that name/)).toBeNull();
    expect(screen.queryByText(/received orders worth Rs 400 crore/)).toBeNull();
    expect(screen.getByText("What to verify in the presentation")).toBeTruthy();
    expect(screen.getByText(/Verify procurement stage, trials, orders/)).toBeTruthy();
    expect(screen.getByText(/not proof of material business exposure/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /All themes/ }));
    await waitFor(() => expect(screen.getByRole("list", { name: "Discovery themes" })).toBeTruthy());
  });

  it("a sector filter narrows a theme to one NSE macro sector", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Defence & Aerospace/ }));
    const chips = await screen.findByRole("group", { name: "Sector" });
    fireEvent.click(within(chips).getByRole("button", { name: /Industrials/ }));
    await waitFor(() => expect(asked).toContain("/api/discovery?theme=Defence%20%26%20Aerospace&sector=Industrials"));
    await waitFor(() => expect(within(screen.getByRole("list", { name: "Companies: Defence & Aerospace" })).queryByText("Sky Avionics Ltd")).toBeNull());
    expect(within(chips).getByRole("button", { name: /Industrials/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("By sector lists each NSE macro sector with its themes; a theme opens filtered to that sector", async () => {
    show();
    fireEvent.click(await screen.findByRole("tab", { name: "By sector" }));
    const secs = screen.getByRole("list", { name: "Discovery by sector" });
    expect(within(secs).getAllByRole("listitem").map((li) => li.querySelector("b")!.textContent)).toEqual(["Industrials", "Power"]);
    fireEvent.click(within(secs).getByRole("button", { name: /Defence & Aerospace 1/ }));
    await waitFor(() => expect(asked).toContain("/api/discovery?theme=Defence%20%26%20Aerospace&sector=Industrials"));
  });

  it("before the first nightly read it says so plainly", async () => {
    empty = true;
    show();
    expect(await screen.findByText(/No presentation has been read yet/)).toBeTruthy();
  });
});
