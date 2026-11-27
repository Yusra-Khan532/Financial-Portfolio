// @vitest-environment jsdom
// Task #266 "Sentimental analysis for 3 filings": three separate sections (investor presentation, earnings call transcript, results filing) inside Section 18,
// each broken into key points with a numerical score; three colour ranges (green 65–100, yellow 40–64, red 0–39); scores and colours only, never the words
// positive, neutral or negative; the method PDF linked. The sample is Tech Mahindra's Q2 FY27 filing scored by the real scorer (backend/finlit/docscore).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import SAMPLE from "../../public/demo/filing-scores.json";
const answer = vi.hoisted(() => ({ v: null as unknown }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), apiGet: vi.fn(async () => answer.v) }));
import { FilingScores } from "./FilingScores";
import { band } from "../lib/filingScores";

afterEach(cleanup);
function mount(v: unknown) {
  answer.v = v;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><FilingScores symbol="TECHM" name="Tech Mahindra" /></QueryClientProvider>);
}

describe("the three filings, point by point", () => {
  it("three separate cards, one per source, each with its score, its colour range, key points and the PDF", async () => {
    mount(SAMPLE);
    const cards = await screen.findAllByRole("article");
    expect(cards.map((c) => c.querySelector(".fs-h")!.textContent)).toEqual(["Investor presentation", "Earnings call transcript", "Results filing"]);
    for (const c of cards) {
      const big = c.querySelector(".fs-dot.big")!;
      expect(big.className).toMatch(/b-(green|yellow|red)/);
      expect(Number(big.textContent)).toBeGreaterThanOrEqual(0);
      expect(c.querySelectorAll(".fs-pts > li").length).toBeGreaterThan(0);
    }
    expect(cards[0].querySelector(".fs-dot.big")!.textContent).toBe("67");                 // Tech Mahindra's presentation pages: 67.3
    expect(cards[2].querySelector(".fs-dot.big")!.className).toContain("b-yellow");          // its results pages: 60.7
    expect(within(cards[0]).getByRole("link", { name: "PDF ↗" }).getAttribute("href")).toContain("nsearchives.nseindia.com");
    // task #328 (developer file 27, C): the scoring rules stay off the page: no method PDF link, no theme weights, no "How the … is made"
    expect(screen.queryByRole("link", { name: /How the scores work/ })).toBeNull();
    expect(document.body.textContent).not.toMatch(/weight \d|is made|method PDF/);
    // change 8: the key points sit behind a closed "Key points N" drop-down, with Every point inside it
    for (const c of cards) { const kp = c.querySelector("details.fs-kp")!; expect(kp.hasAttribute("open")).toBe(false); expect(kp.querySelector("summary")!.textContent).toMatch(/^Key points \d+▾$/); }
    expect(document.querySelector(".fs-legend")!.textContent).toContain("65–100");
    expect(document.querySelector(".fs-co")!.textContent).toMatch(/All three together · results filing 40% · earnings call transcript 35% · investor presentation 25%/);
  });
  it("never the words positive, neutral or negative as a label", async () => {
    mount(SAMPLE);
    await screen.findAllByRole("article");
    // developer file 47 (founder, 27 Nov 2026): the block's own name is "Sentiment analysis", the one place the word appears; no score is ever called
    // positive, neutral or negative, and no other line says "sentiment"
    expect(screen.getByRole("heading", { name: "Sentiment analysis" })).toBeTruthy();
    const text = document.body.textContent!.toLowerCase().replace("sentiment analysis", "");
    expect(text).not.toMatch(/\b(positive|neutral|negative|sentiment)\b/);
  });
  it("why a point scored as it did, and every point on demand", async () => {
    mount(SAMPLE);
    const card = (await screen.findAllByRole("article"))[0];
    fireEvent.click(within(card).getAllByRole("button", { name: "Why this score" })[0]);
    expect(card.querySelector(".fs-pt-r")!.textContent).toMatch(/^50 · /);
    fireEvent.click(within(card).getByRole("button", { name: /^Every point/ }));
    expect(card.querySelectorAll(".fs-pts.all > li").length).toBe((SAMPLE as { docs: { P: { points: unknown[] } } }).docs.P.points.length);
  });
  it("reading, none and unreadable say so plainly", async () => {
    mount({ ...SAMPLE, reading: true, company: { score: null, band: null, weights: {} }, docs: { P: { name: "Investor presentation", status: "reading", doc: { title: "x", date: "2026-10-15", link: "https://nsearchives.nseindia.com/a.pdf", source: "section18" } },
      C: { name: "Earnings call transcript", status: "none" }, R: { name: "Results filing", status: "unreadable", why: "The exchange did not send a readable copy of this file. FinLit tries again tomorrow.", doc: { title: "y", date: "2026-10-15", link: "https://nsearchives.nseindia.com/b.pdf", source: "section18" } } } });
    const cards = await screen.findAllByRole("article");
    expect(cards[0].textContent).toContain("Reading the file from the exchange");
    expect(cards[1].textContent).toContain("No earnings call transcript in Section 16 or in the company's stored filings of the last 400 days.");   // News and filings, its number from the report's order (developer file 41)
    expect(cards[2].textContent).toContain("The exchange did not send a readable copy");
    expect(document.querySelector(".fs-co")).toBeNull();
  });
  it("the three ranges", () => {
    expect([100, 65, 64.9, 40, 39.9, 0].map(band)).toEqual(["green", "green", "yellow", "yellow", "red", "red"]);
  });
});
