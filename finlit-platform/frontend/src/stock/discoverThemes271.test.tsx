// @vitest-environment jsdom
// Task #271 (company report pack of 20 Nov 2026, change 20): Discover on the company report. The pack's checks: the main theme first with "Main theme" and
// Discover's count, then the other themes by their card label; each opens /discover/themes/<slug>?q=<company>; the stage and the presentation's date; the
// card's sentence, five words then "+N more", the first passage about the business (not a signature or a biography), the theme's four figures from the
// same rows as the theme page; a company Discover has not placed (404) gets the Not placed line and no card.
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
const plan = vi.hoisted(() => ({ gold: true }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUIMaybe: () => ({ has: (t: string) => t !== "gold" || plan.gold }) }));
import { BuildCard, ThemeChips, businessPassage, possessive, themeLink, type DiscoverCompany } from "./DiscoverThemes";
import type { Board } from "../discovery/model";

afterEach(cleanup);
const T = (name: string, label: string, n: number, also: number, verify: string[] = []) => ({ name, label, short: label, broad: false, n, also, news: { filings: 0, positive: 0, negative: 0 }, verify, merged: [] });
const R = (s: string, th: string, st = "Operating", sec: string[] = ["Corporate Catalysts & Growth Signals"]) => ({ s, n: s + " Ltd", th, sec, st, tone: 0, fc: 0, ev: {}, mac: null, ind: null, dd: "2026-10-15", pg: 61, grp: null });
const BOARD = { updated: "2026-11-19", companies: 4, read: 4, days: 90, events: [], eventsTracked: [], caution: "", method: "", efil: {},
  themes: [T("AI & GenAI", "AI & GenAI", 3, 24, ["Look for quantified revenue contribution, order value and management commentary."]), T("Corporate Catalysts & Growth Signals", "Corporate developments", 95, 382)],
  rows: [{ ...R("TECHM", "AI & GenAI"), n: "Tech Mahindra Ltd" }, R("A1", "AI & GenAI", "Planned", []), R("A2", "AI & GenAI", "Planned", [])] } as unknown as Board;
const UNI = { rows: [{ symbol: "TECHM", ret_3m: 8.9, return_1y: 20, prism_lt: "Uptrend" }, { symbol: "A1", ret_3m: -4.1, return_1y: -8.7, prism_lt: "Downtrend" }, { symbol: "A2", ret_3m: -10, return_1y: -20, prism_lt: "Strong uptrend" }], asOf: "2026-11-19" };
const TECHM: DiscoverCompany = { symbol: "TECHM", theme: "AI & GenAI", words: ["Generative AI", "Large language models", "Artificial intelligence", "a", "b", "c", "d", "e"],
  passages: [{ t: "Tech Mahindra Q2 FY27 EBIT rises to ₹2,387 crores, up 40.5% YoY; Board recommends Bonus Share Issue", kind: "slide" },
    { t: "A key element of this expansion is ‘Build with Gemini’, a Google Cloud hands-on workshop", kind: "slide" }],
  document: { date: "2026-10-15", pages: 61, link: "https://example.com/p.pdf" } };

function mount(ui: React.ReactNode, company: DiscoverCompany | null, uni: object | null = UNI, gold = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(["discovery", "company", "TECHM"], company); qc.setQueryData(["discovery", "board"], BOARD);
  if (uni) qc.setQueryData(["universe"], uni);
  plan.gold = gold;
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

describe("which passage, which link", () => {
  it("the first passage about the business: not a results headline, a signature block or a director's biography", () => {
    expect(businessPassage(TECHM.passages)?.t).toMatch(/^A key element/);
    const apollo = [{ t: "Baddam Karunakar Reddy (Managing Director) He founded Apollo Micro Systems in 1985 and has been instrumental", kind: "sentence" },
      { t: "End-to-End Capabilities 1 Explosives 2 Critical Sub-systems / Systems 3 Platforms", kind: "slide" },
      { t: "Yours sincerely, For Apollo Micro Systems Limited Seshadri Vasan Gollur Company Secretary & Compliance Officer M.No.F11842", kind: "slide" }];
    expect(businessPassage(apollo)?.t).toMatch(/^End-to-End/);
    expect(businessPassage([{ t: "x", about: false }, { t: "y", about: true }])?.t).toBe("y");      // Discover's own mark wins when it sends one
    expect(businessPassage([])).toBeNull();
  });
  it("a name ending in s takes only the apostrophe", () => { expect(possessive("Tech Mahindra")).toBe("Tech Mahindra’s"); expect(possessive("Apollo Micro Systems")).toBe("Apollo Micro Systems’"); });
  it("a theme opens in Discover with the company found", () => {
    expect(themeLink("AI & GenAI", "Tech Mahindra")).toBe("/discover/themes/ai-and-genai?q=Tech+Mahindra");
    expect(themeLink("Corporate Catalysts & Growth Signals", "Tech Mahindra")).toBe("/discover/themes/corporate-catalysts-and-growth-signals?q=Tech+Mahindra");
  });
});

describe("20a: the header's themes", () => {
  it("task #312: one line: Discover, the main theme with its tag (its count in the tooltip), also the others, the stage, What it says, (i)", () => {
    mount(<ThemeChips symbol="TECHM" name="Tech Mahindra Ltd" />, TECHM);
    const nav = screen.getByRole("navigation", { name: "Discover themes featuring Tech Mahindra" });
    expect(nav.className).toBe("dth dtx");
    const links = within(nav).getAllByRole("link");
    expect(links.slice(0, 2).map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["AI & GenAIMain theme", "/discover/themes/ai-and-genai?q=Tech+Mahindra"],
      ["Corporate developments", "/discover/themes/corporate-catalysts-and-growth-signals?q=Tech+Mahindra"]]);
    expect(links[0].getAttribute("title")).toContain("3 companies in Discover");                 // the count moves to the tooltip
    expect(links[1].getAttribute("title")).toBe("Corporate developments in Discover (95 companies)");
    expect(nav.textContent).toBe("DiscoverAI & GenAIMain themealso Corporate developmentsOperatingWhat it says ↓i");
    expect(within(nav).getByRole("link", { name: "What it says ↓" }).getAttribute("href")).toBe("#dth-card");
    expect(within(nav).getByRole("button", { name: "About Discover themes" })).toBeTruthy();
  });
  it("a company Discover has not placed: the Not placed line and a link to Discover; no card", () => {
    mount(<><ThemeChips symbol="TECHM" name="Infosys Ltd" /><BuildCard symbol="TECHM" name="Infosys Ltd" /></>, null);
    expect(screen.getByRole("navigation", { name: "Discover themes" }).textContent)
      .toBe("Discover themesInfosys is not in a Discover theme yet. Discover places a company from the words of its newest investor presentation. Open Discover ↗");
    expect(document.getElementById("dth-card")).toBeNull();
  });
});

describe("20b: What it is building", () => {
  it("task #312: compact: the header with the stage, one sentence with its words, the four figures in one strip, what to check, the actions", () => {
    mount(<BuildCard symbol="TECHM" name="Tech Mahindra Ltd" />, TECHM);
    const card = document.getElementById("dth-card")!;
    expect(card.className).toBe("card dth-card dtc");
    expect(card.querySelector(".dtc-h")!.textContent).toBe("From DiscoverWhat it is buildingOperating");
    expect(card.querySelector(".dtc-lede")!.textContent).toBe("AI & GenAI is the theme Tech Mahindra’s newest investor presentation talks about most (15 Oct 2026, 61 pages). Its words: Generative AILarge language modelsArtificial intelligenceab+3 more");
    expect(card.querySelector(".dth-more")!.getAttribute("title")).toBe("c, d, e");
    expect(card.querySelector(".dth-q")).toBeNull();                                               // the passage goes
    expect(card.querySelector(".dth-also")).toBeNull();                                            // "also mentions" is in the header line
    const ctx = within(card.querySelector("dl.dtc-ctx") as HTMLElement);
    expect(card.querySelector("dl.dtc-ctx")!.getAttribute("aria-label")).toBe("AI & GenAI on Discover");
    expect(ctx.getByText("Companies in the theme").parentElement!.textContent).toBe("Companies in the theme324 more mention it");
    expect(ctx.getByText("3-month median").parentElement!.textContent).toBe("3-month median−4.1%Tech Mahindra +8.9%");
    expect(ctx.getByText("1-year median").parentElement!.textContent).toBe("1-year median−8.7%of the theme");
    expect(ctx.getByText("In a long-term uptrend").parentElement!.textContent).toBe("In a long-term uptrend2of 3");
    expect(card.querySelector(".dtc-check")!.textContent).toBe("What to check: Look for quantified revenue contribution, order value and management commentary. A theme word alone is not proof of real business.");
    expect(screen.getByRole("link", { name: /See the theme in Discover/ }).getAttribute("href")).toBe("/discover/themes/ai-and-genai?q=Tech+Mahindra");
    expect(screen.getByRole("link", { name: "Open the presentation ↗" }).getAttribute("href")).toBe("https://example.com/p.pdf");
    expect(card.querySelector(".dth-fine")!.textContent).toMatch(/^Theme figures as on Discover/);
    expect(card.textContent).not.toContain("Information only, not a recommendation.");   // task #311: said once, at the Prism card
  });
  it("below Gold the uptrend figure is a Gold lock, as on Discover's theme card, never a wrong 0", () => {
    mount(<BuildCard symbol="TECHM" name="Tech Mahindra Ltd" />, TECHM, UNI, false);
    expect(within(document.querySelector("dl.dtc-ctx") as HTMLElement).getByText("In a long-term uptrend").parentElement!.textContent).toBe("In a long-term uptrendGold");
  });
});
