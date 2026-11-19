// @vitest-environment jsdom
// Task #245 ("make the UI like this for discovery tab", three screenshots): the /discovery page as theme cards, one theme's company cards and sector cards.
// Each test names the screenshot point it proves. The API answers are stood in for, in the shape GET /api/discovery returns (with the theme tone, #245).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

const tone = (label: string | null, positive: number, rated: number, negative = 0) => ({ label, positive, mixed: rated - positive - negative, negative, rated });
const T = (name: string, primary: number, t: ReturnType<typeof tone>, filings = 0, extra: object = {}) => ({
  name, primary, secondary: 2, sectors: { Industrials: Math.ceil(primary / 2), Commodities: Math.floor(primary / 2) },
  stages: { Operating: Math.ceil(primary / 2), "Under execution": Math.floor(primary / 2) }, news: { filings, positive: filings ? 1 : 0, negative: 0 },
  preview: ["Alpha Ltd"], tone: t, ...extra });
const THEMES = [
  T("Industrial Manufacturing & Capex", 436, tone("Positive", 396, 434, 2), 29), T("AI & GenAI", 176, tone("Positive", 168, 176), 39),
  T("Corporate Catalysts & Growth Signals", 96, tone("Mixed", 80, 96, 5), 190), T("EV & Automotive Technology", 43, tone("Positive", 40, 43), 2),
  T("Healthcare & Life Sciences", 42, tone("Positive", 40, 42)), T("Renewable Energy & Power", 31, tone("Positive", 30, 31), 9),
  T("Battery & Energy Storage", 22, tone("Positive", 21, 22), 10), T("Solar Technology", 22, tone("Positive", 20, 22), 7),
  T("Marine & Shipbuilding", 7, tone("Mixed", 4, 7), 2), T("Nuclear Energy", 0, tone(null, 0, 0), 0, { secondary: 1 }),
];
const ALL = { themes: THEMES, companies: 877, read: 1537, statuses: {}, updated: "2026-11-19T04:40:42+00:00", sector: null, caution: "A keyword mention by itself is not proof of material business exposure.", method: "The newest investor presentation.",
  bySector: { Industrials: { "Industrial Manufacturing & Capex": 151, "Corporate Catalysts & Growth Signals": 24, "Renewable Energy & Power": 20, "Solar Technology": 16, "AI & GenAI": 5 },
    Healthcare: { "Healthcare & Life Sciences": 37, "Industrial Manufacturing & Capex": 36 } } };
const CO = (symbol: string, company: string, stageLabel: string, score: number | null, extra: object = {}) => ({
  symbol, company, primary: "Industrial Manufacturing & Capex", secondary: ["Defence & Aerospace"], score: 10, keywords: ["Capacity expansion", "Capital expenditure", "Precision engineering", "Forgings", "Order book"],
  verify: [], evidence: ["Order book of Rs 2,400 crore."], hasFigures: true, stage: null, stageLabel, tone: { score, label: score == null ? null : score >= 0.4 ? "Positive" : "Mixed" },
  sector: { macro: "Industrials", sector: "Capital Goods", industry: "Industrial Products" }, filings: { count: 28, positive: 3, negative: 0, events: {} },
  document: { title: "Investor presentation", date: "2026-11-14", link: "https://nsearchives.nseindia.com/a.pdf", pages: 53 }, readAt: "2026-11-15T01:00:00", ...extra });
const ONE = (sector: string | null) => ({ ...ALL, sector, themes: THEMES.map((t) => t.name !== "Industrial Manufacturing & Capex" ? t : { ...t,
  stages: { Operating: 1, "Under execution": 1, "Not stated": 1 },
  companies: [CO("BALUFORGE", "Balu Forge Industries Ltd", "Operating", 0.72), CO("ADISOFT", "Adisoft Technologies Ltd", "Under execution", 0.66),
    CO("EPACKPEB", "EPack Prefab Technologies Ltd", "Not stated", null, { filings: { count: 0, positive: 0, negative: 0, events: {} }, document: { title: null, date: null, link: "http://evil.example/x.pdf", pages: null }, keywords: ["Capacity expansion"], evidence: [] })],
  alsoMentions: [], recentFilings: [], verify: ["Look for capacity figures"] }) });
const asked: string[] = [];
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: vi.fn(async (p: string) => {
  asked.push(p); const u = new URL(p, "http://x");
  return JSON.parse(JSON.stringify(u.searchParams.get("theme") ? ONE(u.searchParams.get("sector")) : ALL)); }) }));
import { DiscoveryPage } from "./Discovery";

window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
afterEach(() => { cleanup(); asked.length = 0; });
function Where() { const l = useLocation(); return <output data-testid="at">{l.search}</output>; }
const open = async (path = "/discovery") => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}>
    <Routes><Route path="/discovery" element={<><DiscoveryPage /><Where /></>} /><Route path="*" element={<Where />} /></Routes></MemoryRouter></QueryClientProvider>);
  await waitFor(() => expect(document.querySelector(".dsb")).toBeTruthy());
};
const at = () => decodeURIComponent(screen.getByTestId("at").textContent!.replace(/\+/g, " "));

describe("Discovery themes (screenshot 1)", () => {
  it("header, the bar, the chips with counts, 'Showing 8 of 10 themes' and 'Show all'", async () => {
    await open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Discovery");
    expect(document.body.textContent).toContain("See which themes listed companies talk about most in their latest investor presentations.");
    expect(screen.getByRole("tab", { name: "By theme" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByLabelText("Find a theme")).toBeTruthy();
    expect([...document.querySelectorAll(".dsb-chips button")].map((b) => b.textContent)).toEqual(["All themes (10)", "Positive tone (7)", "Recent filings (8)"]);
    expect(document.querySelector(".dsb-count")!.textContent).toBe("Showing 8 of 10 themes");
    fireEvent.click(screen.getByRole("button", { name: "Show all 10 themes" }));
    expect(document.querySelectorAll(".dsb-tc")).toHaveLength(10);
  });
  it("a theme card: name, one line, the count, the tone chip, View companies and Details", async () => {
    await open();
    const c = document.querySelector(".dsb-tc")!;
    expect(c.querySelector("h3")!.textContent).toBe("Industrial Manufacturing & Capex");
    expect(c.querySelector(".dsb-about")!.textContent).toBe("Factories, engineering, forgings and capacity expansion.");
    expect(c.querySelector(".dsb-big")!.textContent).toBe("436 companies");
    expect(c.querySelector(".dsb-tone")!.textContent).toBe("Positive tone");
    fireEvent.click(within(c as HTMLElement).getByRole("button", { name: /Details/ }));
    expect(c.querySelector(".dsb-dl")!.textContent).toMatch(/396 of 434 presentations read positive, 2 negative.*Operating 218 · Under execution 218.*29 filings · 1 positive · 0 negative/);
    expect(document.querySelectorAll(".dsb-tc")[2].querySelector(".dsb-tone")!.textContent).toBe("Mixed tone");
  });
  it("Positive tone and Recent filings filter the cards; a search finds by name; a theme without a tone says so", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Positive tone (7)" }));
    expect(document.querySelector(".dsb-count")!.textContent).toBe("Showing 7 of 7 themes");
    fireEvent.click(screen.getByRole("button", { name: "All themes (10)" }));
    fireEvent.change(screen.getByLabelText("Find a theme"), { target: { value: "nuclear" } });
    const c = document.querySelector(".dsb-tc")!;
    expect(c.querySelector(".dsb-tone")!.textContent).toBe("No tone yet");
    expect(c.textContent).toContain("None has it as the main theme yet; 1 more mention it.");
  });
  it("Sort: Name, A to Z", async () => {
    await open();
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "name" } });
    expect(document.querySelector(".dsb-tc h3")!.textContent).toBe("AI & GenAI");
  });
});

describe("Discovery by sector (screenshot 3)", () => {
  it("sector cards: line, count, top three themes, All themes, View companies opens the top theme in that sector", async () => {
    await open();
    fireEvent.click(screen.getByRole("tab", { name: "By sector" }));
    expect(at()).toBe("?view=sectors");
    expect(document.querySelector(".dsb-lead")!.textContent).toBe("Each company sits in its NSE sector. Pick a sector to see which themes its companies talk about.");
    const c = document.querySelector(".dsb-sc") as HTMLElement;
    expect(c.querySelector(".dsb-about")!.textContent).toBe("Machinery, engineering, infrastructure and capital goods makers.");
    expect(c.querySelector(".dsb-big")!.textContent).toBe("216 companies");
    expect(c.querySelectorAll(".dsb-tops li")).toHaveLength(3);
    fireEvent.click(within(c).getByRole("button", { name: /All themes \(5\)/ }));
    expect(c.querySelectorAll(".dsb-tops li")).toHaveLength(5);
    fireEvent.click(within(c).getByRole("button", { name: "View companies" }));
    await waitFor(() => expect(document.querySelector(".dsb-co")).toBeTruthy());
    expect(at()).toBe("?theme=Industrial Manufacturing & Capex&sector=Industrials&view=sectors");
    expect(asked.at(-1)).toBe("/api/discovery?theme=Industrial%20Manufacturing%20%26%20Capex&sector=Industrials");
  });
});

describe("Discovery, one theme (screenshot 2)", () => {
  it("header, Find a company, Sector with counts, Sort, stage chips, 'Showing N of M companies'", async () => {
    await open("/discovery?theme=Industrial+Manufacturing+%26+Capex&sector=Industrials");
    await waitFor(() => expect(document.querySelector(".dsb-co")).toBeTruthy());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Industrial Manufacturing & Capex");
    expect(document.body.textContent).toContain("Factories, engineering, forgings and capacity expansion. 218 of its 436 companies are in Industrials.");
    expect(screen.getByRole("button", { name: /All themes/ })).toBeTruthy();
    const sel = document.querySelector(".dsb-panel .dsb-sel select") as HTMLSelectElement;
    expect(sel.options[sel.selectedIndex].text).toBe("Industrials (218)");
    expect([...document.querySelectorAll(".dsb-stg .dsb-chips button")].map((b) => b.textContent)).toEqual(["All stages (3)", "Operating (1)", "Under execution (1)", "Not stated (1)"]);
    expect(document.querySelector(".dsb-count")!.textContent).toBe("Showing 3 of 3 companies");
    fireEvent.click(screen.getByRole("button", { name: "What do these mean?" }));
    expect(document.querySelector(".dsb-why")!.textContent).toContain("MoU / pilot");
    fireEvent.click(screen.getByRole("button", { name: "Operating (1)" }));
    expect(document.querySelector(".dsb-count")!.textContent).toBe("Showing 1 of 1 company");
  });
  it("a company card: stage pill, the three columns, main topics +N more, Read presentation, Company report, What they say", async () => {
    await open("/discovery?theme=Industrial+Manufacturing+%26+Capex");
    await waitFor(() => expect(document.querySelector(".dsb-co")).toBeTruthy());
    const c = document.querySelector(".dsb-co") as HTMLElement;   // sorted by Most positive tone: Balu Forge first
    expect(c.querySelector("h3")!.textContent).toBe("Balu Forge Industries Ltd BALUFORGE");
    expect(c.querySelector(".dsb-path")!.textContent).toBe("Industrials › Capital Goods › Industrial Products");
    expect(c.querySelector(".dsb-st")!.textContent).toBe("Operating");
    expect([...c.querySelectorAll(".dsb-cols dd")].map((d) => d.textContent)).toEqual(["Positive (+0.72)", "28 filings · 3 positive · 0 negative", "14 Nov 2026 · 53 pages"]);
    expect([...c.querySelectorAll(".dsb-tags span")].map((s) => s.textContent)).toEqual(["Capacity expansion", "Capital expenditure", "Precision engineering"]);
    fireEvent.click(within(c).getByRole("button", { name: "+2 more" }));
    expect(c.querySelectorAll(".dsb-tags span")).toHaveLength(5);
    expect(within(c).getByRole("link", { name: "Read presentation" }).getAttribute("href")).toBe("https://nsearchives.nseindia.com/a.pdf");
    expect(within(c).getByRole("link", { name: "Company report" }).getAttribute("href")).toBe("/stocks/BALUFORGE");
    fireEvent.click(within(c).getByRole("button", { name: /What they say/ }));
    expect(c.querySelector(".dsb-say")!.textContent).toContain("“Order book of Rs 2,400 crore.”");
  });
  it("never a placeholder: a missing tone, filing count, date or link each says why (screenshot 2's [TONE] / [FILINGS])", async () => {
    await open("/discovery?theme=Industrial+Manufacturing+%26+Capex");
    await waitFor(() => expect(document.querySelector(".dsb-co")).toBeTruthy());
    const c = [...document.querySelectorAll(".dsb-co")].find((x) => x.textContent!.includes("EPACKPEB")) as HTMLElement;
    expect([...c.querySelectorAll(".dsb-cols dd")].map((d) => d.textContent)).toEqual(["Not read yet", "None in 90 days", "Date not given"]);
    expect(within(c).queryByRole("link", { name: "Read presentation" })).toBeNull();   // not an exchange link: never opened
    expect(c.querySelector(".dsb-btn.off")!.getAttribute("title")).toBe("The exchange link for this presentation is not available");
    expect(document.querySelector(".dsb")!.textContent).not.toMatch(/\[[A-Z]+\]|undefined|NaN/);
    fireEvent.click(within(c).getByRole("button", { name: /What they say/ }));
    expect(c.querySelector(".dsb-say")!.textContent).toContain("no sentence with a figure");
  });
  it("All themes goes back; the caution stays on every view", async () => {
    await open("/discovery?theme=Industrial+Manufacturing+%26+Capex");
    await waitFor(() => expect(document.querySelector(".dsb-co")).toBeTruthy());
    expect(document.querySelector(".dsb-note")!.textContent).toContain("not proof of material business exposure");
    fireEvent.click(screen.getByRole("button", { name: /All themes/ }));
    await waitFor(() => expect(document.querySelector(".dsb-tc")).toBeTruthy());
    expect(at()).toBe("");
    expect(document.querySelector(".dsb-note")!.textContent).toContain("not proof of material business exposure");
  });
});
