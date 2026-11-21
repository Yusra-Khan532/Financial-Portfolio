// @vitest-environment jsdom
// Task #267: Discover's "Earnings calls" and "Results filings" views (discovery/Sources.tsx): the strip of their own under the four ways, a card per
// bucket with its company count (an empty bucket says why), a bucket's page with each company's keywords, its sentences with figures (or why none is
// quoted), the document's date and exchange link, and the bucket's What to verify; the directory's caution and the disclaimer stay on every view.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Board } from "../discovery/model";

const BOARD: Board = { updated: "2026-11-19T02:00:00", companies: 0, read: 0, days: 90, rows: [], themes: [], efil: {}, events: [], eventsTracked: [],
  caution: "A keyword mention by itself is not proof of material business exposure: check the figures, orders, capacity and status in the presentation itself.",
  method: "Presentations method." };
const CAUTION = "A keyword mention by itself is not proof of material business exposure: check the figures in the filing itself. Describes what the company said and filed; not a recommendation.";
const CAPEX = "Call: Capex, Capacity & Execution", GUIDE = "Call: Management Guidance & Outlook", RISK = "Call: Risks, Headwinds & Cautionary Language";
const bucket = (name: string, companies: number, extra = {}) => ({ name, label: name.replace(/^(Call|Results): /, ""), keywords: ["Capex plan and outlay", "Capacity addition timeline"],
  companies, withEvidence: companies ? 1 : 0, verify: ["Track announced versus achieved dates for previous projects."],
  reason: companies ? null : "None of the 2 call transcripts read names 2 of this bucket's keywords, or one of them 5 times.", ...extra });
const LIST = [
  { symbol: "ACME", company: "Acme Industries Ltd", score: 7.5, distinct: 3, mentions: 3, keywords: ["Capex plan and outlay", "Ramp-up and utilisation"],
    evidence: ["Capex guidance for FY27 is Rs 1,200 crore, mostly growth capex for the new Dahej line."], verify: ["Split growth and maintenance capex."],
    document: { title: "Transcript", date: "2026-11-18", link: "https://nsearchives.nseindia.com/corporate/ACME_T.pdf", pages: 4 }, tone: { score: 0.5, label: "Positive" } },
  { symbol: "QUIETCO", company: "Quiet Co Ltd", score: 4, distinct: 2, mentions: 2, keywords: ["Capex plan and outlay", "Backward integration"], evidence: [], verify: [],
    document: { title: "Transcript", date: "2026-11-10", link: null, pages: 3 }, tone: { score: null, label: null } },
];
const CALLS = { source: "calls", label: "Earnings calls", document: "call transcript", days: 400, read: 2, statuses: { ok: 1, keyword_only_no_figures: 1 }, companies: 2,
  updated: "2026-11-20T21:00:00", newest: "2026-11-18", caution: CAUTION, method: "Calls method: the newest earnings-call transcript each company filed.",
  buckets: [bucket(GUIDE, 1, { preview: ["Acme Industries Ltd"] }), bucket(CAPEX, 2, { preview: ["Acme Industries Ltd", "Quiet Co Ltd"] }), bucket(RISK, 0, { preview: [] })] };
const RESULTS = { ...CALLS, source: "results", label: "Results filings", document: "results filing", read: 0, statuses: {}, companies: 0, newest: null,
  buckets: [{ ...bucket("Results: Income Statement Line Items", 0), reason: "No results filing has been read yet: the nightly job reads each company's newest results filing filed with NSE in the last 400 days, newest first.", preview: [] }] };
const seen: string[] = [];
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiGet: vi.fn(async (p: string) => {
    seen.push(p);
    if (p === "/api/discovery/board") return JSON.parse(JSON.stringify(BOARD));
    if (p === "/api/discovery/sources?source=calls") return JSON.parse(JSON.stringify(CALLS));
    if (p === `/api/discovery/sources?source=calls&bucket=${encodeURIComponent(CAPEX)}`)
      return { ...JSON.parse(JSON.stringify(CALLS)), buckets: CALLS.buckets.map((b) => (b.name === CAPEX ? { ...b, preview: undefined, list: LIST } : b)) };
    if (p === "/api/discovery/sources?source=results") return JSON.parse(JSON.stringify(RESULTS));
    if (p === "/api/screener/universe") return { rows: [], as_of: "2026-11-19" };
    throw Object.assign(new Error("not stood in: " + p), { status: 503 });
  }) }));
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()),
  useUI: () => ({ plan: "basic", has: (t: string) => t === "basic", toast: () => undefined, upgrade: vi.fn() }) }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: null }) }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { DiscoveryPage } from "./Discovery";
import { bucketPath, parseRoute, pathOf } from "../discovery/model";

let loc = "";
function Where() { const l = useLocation(); loc = l.pathname; return null; }
const show = async (path: string) => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><Routes><Route path="/discover/*" element={<><DiscoveryPage /><Where /></>} /></Routes></MemoryRouter></QueryClientProvider>);
  await screen.findByRole("navigation", { name: "Discover views from calls and results" });
};
const strip = () => screen.getByRole("navigation", { name: "Discover views from calls and results" });
afterEach(() => { cleanup(); seen.length = 0; });

describe("#267: Earnings calls and Results filings in Discover", () => {
  it("adds two views in their own strip; the four ways stay as they are", async () => {
    await show("/discover");
    const ways = [...strip().querySelectorAll("a")].map((a) => [a.querySelector(".dsc-wl")!.textContent, a.getAttribute("href"), a.querySelector(".dsc-wd")!.textContent]);
    expect(ways).toEqual([["Earnings calls8", "/discover/calls", "What management says on results calls"], ["Results filings7", "/discover/results", "What quarterly results filings report"]]);
    expect(screen.getByRole("navigation", { name: "Discover views" }).querySelectorAll("a")).toHaveLength(4);
    expect(seen.some((p) => p.startsWith("/api/discovery/sources"))).toBe(false);          // the Themes view does not load the new views' data
    fireEvent.click(within(strip()).getByRole("link", { name: /Earnings calls/ }));
    expect(loc).toBe("/discover/calls");
  });

  it("Earnings calls: a card per bucket with its company count; an empty bucket says why; the caution, the disclaimer and the method", async () => {
    await show("/discover/calls");
    expect(strip().querySelector("[aria-current=page]")!.textContent).toMatch(/^Earnings calls/);
    const cards = await screen.findAllByRole("link", { name: /Capex, Capacity & Execution|Management Guidance & Outlook|Risks, Headwinds/ });
    expect(cards.map((c) => c.querySelector("h3")!.textContent)).toEqual(["Management Guidance & Outlook", "Capex, Capacity & Execution", "Risks, Headwinds & Cautionary Language"]);
    const capex = cards[1];
    expect(capex.getAttribute("href")).toBe("/discover/calls/capex-capacity-and-execution");
    expect(capex.querySelector(".n")!.textContent).toBe("2companies");
    expect(capex.textContent).toMatch(/1 with a sentence that holds a figure/);
    expect(capex.querySelector(".dsc-ex")!.textContent).toBe("Acme Industries, Quiet Co");
    expect(cards[2].textContent).toMatch(/None of the 2 call transcripts read names 2 of this bucket's keywords, or one of them 5 times\./);
    expect(document.querySelector(".dsc-toolbar")).toBeNull();                                          // task #291: the method paragraph above the buckets is removed
    expect(document.body.textContent).not.toMatch(/buckets of FinLit’s keyword directory/);
    const caution = document.querySelector(".dsc-caution")!.textContent!;
    expect(caution).toMatch(/A keyword mention by itself is not proof of material business exposure/);
    expect(caution).toMatch(/Information only, not investment advice\./);
    expect(caution).not.toMatch(/presentation itself/);                                    // the calls view's own caution
    expect(document.querySelector(".dsc-how p")!.textContent).toMatch(/^Calls method/);
  });

  it("a bucket's page: each company with its keywords, the sentence with a figure, the date, the exchange link and what to verify", async () => {
    await show("/discover/calls/capex-capacity-and-execution");
    expect(within(await screen.findByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Earnings calls" }).getAttribute("href")).toBe("/discover/calls");
    expect(screen.getByRole("heading", { level: 2, name: "Capex, Capacity & Execution" })).toBeTruthy();
    const rows = await screen.findAllByRole("listitem", { name: (_n, el) => el.hasAttribute("data-src-co") });
    expect(rows.map((r) => r.getAttribute("data-src-co"))).toEqual(["ACME", "QUIETCO"]);
    const acme = rows[0];
    expect(within(acme).getByRole("link", { name: "Acme Industries" }).getAttribute("href")).toBe("/stocks/ACME");
    expect(acme.querySelector(".dsc-kd-ev")!.textContent).toBe("“Capex guidance for FY27 is Rs 1,200 crore, mostly growth capex for the new Dahej line.”");
    expect([...acme.querySelectorAll(".dsc-kd-kw .dsc-ev")].map((e) => e.textContent)).toEqual(["Capex plan and outlay", "Ramp-up and utilisation"]);
    expect(acme.querySelector(".dsc-kd-doc")!.textContent).toBe("Call transcript of 18 Nov 2026 · Open the filing ↗ · Tone of its wording: Positive");
    const a = within(acme).getByRole("link", { name: "Open the filing ↗" });
    expect([a.getAttribute("href"), a.getAttribute("target"), a.getAttribute("rel")]).toEqual(["https://nsearchives.nseindia.com/corporate/ACME_T.pdf", "_blank", "noopener noreferrer"]);
    expect(acme.querySelector(".dsc-kd-vf")!.textContent).toBe("What to verify Split growth and maintenance capex.");
    const quiet = rows[1];                                                                  // a keyword alone is not evidence: said, not quoted
    expect(quiet.querySelector(".dsc-kd-ev")).toBeNull();
    expect(quiet.textContent).toMatch(/No sentence names one of these keywords with a figure, so there is nothing to quote: the mention alone is not evidence\./);
    expect(quiet.textContent).toMatch(/the exchange link is not held/);
    expect(document.body.textContent).toMatch(/Track announced versus achieved dates for previous projects\./);   // the bucket's What to verify
    expect(document.body.textContent).toMatch(/A keyword mention by itself is not proof of material business exposure\. Check the figures in the filing itself\./);
    fireEvent.change(screen.getByPlaceholderText("Name or symbol"), { target: { value: "quiet" } });
    expect(document.querySelectorAll("[data-src-co]")).toHaveLength(1);
  });

  it("Results filings before any read: every bucket says why it is empty; an unknown bucket says so", async () => {
    await show("/discover/results");
    const card = (await screen.findAllByRole("link", { name: /Income Statement Line Items/ }))[0];
    expect(card.querySelector(".n")!.textContent).toBe("0companies");
    expect(card.textContent).toMatch(/No results filing has been read yet: the nightly job reads each company's newest results filing filed with NSE in the last 400 days/);
    cleanup(); await show("/discover/results/tulips");
    expect(await screen.findByText(/There is no such bucket\./)).toBeTruthy();
  });

  it("the addresses: /discover/calls[/<bucket>] and /discover/results[/<bucket>]", () => {
    const n = { themes: [], macros: [], sectors: [], industries: [] };
    expect(parseRoute("/discover/calls", n)).toEqual({ view: "calls" });
    expect(parseRoute("/discover/results/income-statement-line-items", n)).toEqual({ view: "results", bucket: "income-statement-line-items" });
    expect(pathOf({ view: "calls", bucket: "capex-capacity-and-execution" })).toBe("/discover/calls/capex-capacity-and-execution");
    expect(bucketPath("results", "Results: Regulatory Filings & Corporate Actions (SEBI LODR)")).toBe("/discover/results/regulatory-filings-and-corporate-actions-sebi-lodr");
  });
});
