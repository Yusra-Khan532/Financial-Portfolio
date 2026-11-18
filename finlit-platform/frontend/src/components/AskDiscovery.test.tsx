// @vitest-environment jsdom
// Task #221: Discovery in the FinLit AI panel: the themes from companies' investor presentations, one theme's companies with keywords, the sentences
// with figures and the presentation's link, the caution on every screen, and the empty state before the first nightly read.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const CAUTION = "A keyword mention by itself is not proof of material business exposure: check the figures, orders, capacity and status in the presentation itself. Describes what the company says about itself; not a recommendation.";
const METHOD = "The newest investor presentation each company filed with NSE, first 80 pages, matched against 21 themes and their keywords.";
let empty = false;
const co = (symbol: string, company: string, primary: string, extra: Record<string, unknown> = {}) => ({
  symbol, company, primary, secondary: [], score: 12.5, keywords: ["Defence order", "Radar system"], hasFigures: true,
  evidence: ["Defence order inflow of Rs 1,250 crore in H1 FY27, led by radar system and electronic warfare programmes."],
  document: { title: "Investor Presentation", date: "2026-11-16", link: `https://nsearchives.nseindia.in/corporate/${symbol}.pdf`, pages: 35 }, readAt: "2026-11-18T00:10:00+00:00", ...extra });
vi.mock("../lib/api", () => ({ apiGet: vi.fn(async (path: string) => {
  const base = { companies: empty ? 0 : 3, read: empty ? 0 : 4, statuses: {}, updated: empty ? null : "2026-11-18T00:10:00+00:00", caution: CAUTION, method: METHOD };
  if (path === "/api/discovery") return { ...base, themes: [
    { name: "Solar Technology", primary: empty ? 0 : 1, secondary: 0, preview: empty ? [] : ["Acme Solar Ltd"] },
    { name: "Defence & Aerospace", primary: empty ? 0 : 2, secondary: empty ? 0 : 1, preview: empty ? [] : ["Bharat Shield Ltd", "Sky Avionics Ltd"] },
    { name: "Nuclear Energy", primary: 0, secondary: 0, preview: [] }] };
  if (path === "/api/discovery?theme=Defence%20%26%20Aerospace") return { ...base, themes: [{ name: "Defence & Aerospace", primary: 2, secondary: 1,
    companies: [co("BSHIELD", "Bharat Shield Ltd", "Defence & Aerospace", { secondary: ["Space & Drone Technology"] }),
                co("SKYAV", "Sky Avionics Ltd", "Defence & Aerospace", { hasFigures: false, evidence: [], document: { title: "x", date: "2026-11-10", link: "https://evil.example/x.pdf", pages: 12 } })],
    alsoMentions: [co("ACMESOLAR", "Acme Solar Ltd", "Solar Technology")] }] };
  throw new Error("not mocked: " + path);
}) }));
import { AskDiscovery } from "./AskDiscovery";

afterEach(() => { cleanup(); empty = false; });
const show = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><AskDiscovery /></MemoryRouter></QueryClientProvider>);

describe("Discovery (task #221)", () => {
  it("lists the themes, most companies first, with counts, first names and the caution", async () => {
    show();
    const list = await screen.findByRole("list", { name: "Discovery themes" });
    const names = within(list).getAllByRole("button").map((b) => b.querySelector("b")!.textContent);
    expect(names).toEqual(["Defence & Aerospace", "Solar Technology", "Nuclear Energy"]);
    expect(within(list).getByRole("button", { name: /Defence & Aerospace.*2 companies · 1 more mention it.*Bharat Shield Ltd, Sky Avionics Ltd/ })).toBeTruthy();
    expect((within(list).getByRole("button", { name: /Nuclear Energy/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/3 companies placed, updated 18 Nov 2026/)).toBeTruthy();
    expect(screen.getByText(/not proof of material business exposure/)).toBeTruthy();
  });

  it("a theme shows each company's keywords, the sentences with figures and the presentation link; back returns to the themes", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: /Defence & Aerospace/ }));
    const cos = await screen.findByRole("list", { name: "Companies: Defence & Aerospace" });
    const [first, second] = Array.from(cos.querySelectorAll<HTMLElement>(":scope > li"));
    expect(within(first).getByRole("link", { name: /Bharat Shield Ltd/ }).getAttribute("href")).toBe("/stocks/BSHIELD");
    expect(within(first).getByText("Radar system")).toBeTruthy();
    expect(within(first).getByText(/Defence order inflow of Rs 1,250 crore/)).toBeTruthy();
    expect(within(first).getByText(/Also talks about: Space & Drone Technology/)).toBeTruthy();
    const doc = within(first).getByRole("link", { name: /Investor presentation, 16 Nov 2026/ });
    expect(doc.getAttribute("href")).toBe("https://nsearchives.nseindia.in/corporate/BSHIELD.pdf");
    expect(doc.getAttribute("rel")).toContain("noopener");
    expect(within(second).getByText(/no sentence with a figure/)).toBeTruthy();
    expect(within(second).queryByRole("link", { name: /Investor presentation/ })).toBeNull();      // only the exchanges' own links are opened
    expect(screen.getByRole("link", { name: "Acme Solar Ltd" }).getAttribute("href")).toBe("/stocks/ACMESOLAR");
    expect(screen.getByText(/not proof of material business exposure/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /All themes/ }));
    await waitFor(() => expect(screen.getByRole("list", { name: "Discovery themes" })).toBeTruthy());
  });

  it("before the first nightly read it says so plainly", async () => {
    empty = true;
    show();
    expect(await screen.findByText(/No presentation has been read yet/)).toBeTruthy();
  });
});
