// @vitest-environment jsdom
// Task #306 (developer file 16, the compact Concall Monitor): "Show more" adds the next 30 by offset and never asks past the server's cap of 60 (it asked
// for limit=90, got 422 and the list disappeared); the Has, Quarter and Type filters and Sort go to the server; the dropdowns show the server's counts;
// the filters on show as chips with Clear all; the count line; the calls grouped by day ("Today · …", "Fri, 20 Nov · 2 calls"); A–Z shows the date in
// the row; the Portfolio / Watchlist tags.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Call, CallList } from "../lib/concalls";
import { dayLabel } from "../lib/concalls";

const st = vi.hoisted(() => ({ asked: [] as string[] }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <header><h1>{title}</h1></header> }));
vi.mock("../components/CoLogo", () => ({ CoLogo: ({ name }: { name: string }) => <span className="logo">{name[0]}</span> }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { id: "u" }, plan: "silver" }) }));

const day = (i: number) => `2026-11-${String(20 - Math.floor(i / 10)).padStart(2, "0")}`;
const mk = (i: number): Call => ({ id: `C${i}|${day(i)}`, symbol: `C${String(i).padStart(3, "0")}`, name: `Company ${String(i).padStart(3, "0")}`, date: day(i), time: "16:00",
  timeLabel: "04:00 PM", dateNote: null, timeNote: null, kind: "Earnings call", quarter: i % 2 ? "Q2 FY27" : null, upcoming: false, schedule: null,
  listen: i % 3 ? { why: "No recording link filed with the exchange for this call." } : { audio: "https://x.in/a.mp3" },
  transcript: { why: "Not filed yet." }, ppt: i % 3 ? { why: "No investor presentation filed with this call." } : { doc: { link: "https://x.in/p.pdf", title: "Presentation", filed: "2026-11-20", pages: 3 } }, summary: { why: "Neither is filed yet." },
  mine: i === 0 ? "portfolio" : i === 1 ? "watchlist" : null });
const ALL = Array.from({ length: 75 }, (_, i) => mk(i));
const FACETS = { scope: { all: 75, portfolio: 1, watchlist: 2 }, has: { listen: 0, transcript: 0, ppt: 25, summary: 0 },
  quarter: [{ v: "Q2 FY27", n: 37 }, { v: "none", n: 38 }], kind: [{ v: "Earnings call", n: 75 }] };
const page = (u: URL): CallList => {
  const off = +(u.searchParams.get("offset") || 0), lim = +(u.searchParams.get("limit") || 30);
  let rows = ALL;
  if (u.searchParams.get("has") === "ppt") rows = rows.filter((c) => !!c.ppt.doc);   // task #339: Presentation in place of Recording
  if (u.searchParams.get("sort") === "az") rows = [...rows].sort((a, b) => a.name.localeCompare(b.name));
  const days: Record<string, number> = {};
  rows.forEach((c) => { days[c.date!] = (days[c.date!] || 0) + 1; });
  return { items: rows.slice(off, off + lim), total: rows.length, offset: off, counts: { latest: 75, upcoming: 0 }, scope: "all", tab: "latest", readAt: null,
    source: "The company's own filings with NSE", disclaimer: "Describes what the company said on its call, from its own filings; not a recommendation. Information only, not investment advice.",
    scopeNote: null, signIn: false, facets: FACETS, have: { listen: 0, transcript: 0, ppt: rows.filter((c) => !!c.ppt.doc).length, summary: 0 }, days };
};

beforeEach(() => {
  st.asked = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = new URL(String(url), "https://finlitventures.com");
    st.asked.push(u.pathname + u.search);
    if (+(u.searchParams.get("limit") || 30) > 60) return new Response(JSON.stringify({ detail: "limit" }), { status: 422 });
    return new Response(JSON.stringify(page(u)));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

import { ConcallMonitorPage } from "./ConcallMonitor";
const open = (path = "/concalls") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><ConcallMonitorPage /></MemoryRouter></QueryClientProvider>);
const rows = () => document.querySelectorAll("article.ccm-card").length;

describe("task #306: the compact Concall Monitor", () => {
  it("Show more adds the next 30 by offset, twice and more, and never asks past the cap of 60", async () => {
    open();
    await screen.findByText("Company 000");
    expect(rows()).toBe(30);
    fireEvent.click(screen.getByRole("button", { name: "Show more (45 left)" }));
    await waitFor(() => expect(rows()).toBe(60));
    fireEvent.click(screen.getByRole("button", { name: "Show more (15 left)" }));      // the second Show more: the list used to disappear here
    await waitFor(() => expect(rows()).toBe(75));
    expect(screen.queryByRole("button", { name: /Show more/ })).toBeNull();
    expect(screen.getByText("Company 074")).toBeTruthy();                              // every call can be reached
    const asked = st.asked.filter((u) => u.startsWith("/api/concalls?"));
    expect(asked.map((u) => new URL(u, "https://x").searchParams.get("offset"))).toEqual(["0", "30", "60"]);
    expect(asked.every((u) => +(new URL(u, "https://x").searchParams.get("limit") || 0) <= 60)).toBe(true);
  });

  it("groups the calls by day with each day's count, and names today, yesterday and tomorrow", async () => {
    open();
    await screen.findByText("Company 000");
    const heads = [...document.querySelectorAll("h3.p4-dh")].map((h) => h.textContent);
    expect(heads).toEqual(["Fri, 20 Nov10 calls", "Thu, 19 Nov10 calls", "Wed, 18 Nov10 calls"]);
    const now = new Date(2026, 10, 22, 10);
    expect(dayLabel("2026-11-22", now)).toBe("Today · Sun, 22 Nov");
    expect(dayLabel("2026-11-21", now)).toBe("Yesterday · Sat, 21 Nov");
    expect(dayLabel("2026-11-23", now)).toBe("Tomorrow · Mon, 23 Nov");
    expect(dayLabel(null, now)).toBe("Date not stated in the filings");
  });

  it("the count line, and the Has switches with their counts send the filter to the server; chips with × and Clear all", async () => {
    open();
    await screen.findByText("Company 000");
    expect(document.querySelector(".dbx-cnt")!.textContent).toBe("75 calls · showing the newest 3025 presentations · 0 with an AI summary possible");   // task #339: no recordings or transcripts
    fireEvent.click(screen.getByRole("button", { name: /^Has/ }));
    const pop = screen.getByRole("dialog", { name: "Calls that have" });
    expect(pop.textContent).toContain("Presentation: the deck the company filed with NSE.");
    expect(within(pop).getAllByRole("checkbox").map((x) => x.closest("label")!.textContent)).toEqual(["Presentation25", "AI summary possible0"]);   // task #339: no Recording or Transcript
    const rec = within(pop).getByRole("checkbox", { name: /Presentation/ });
    expect((within(pop).getByRole("checkbox", { name: /AI summary/ }) as HTMLInputElement).disabled).toBe(true);   // it would leave no call
    fireEvent.click(rec);
    await waitFor(() => expect(st.asked.some((u) => u.includes("has=ppt"))).toBe(true));
    await waitFor(() => expect(document.querySelector(".dbx-cnt")!.textContent).toMatch(/^25 calls match/));
    const chips = screen.getByRole("group", { name: "Filters on" });
    expect(within(chips).getByRole("button", { name: "Remove filter Has presentation" })).toBeTruthy();
    fireEvent.click(within(chips).getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Filters on" })).toBeNull());
  });

  it("Companies, Quarter and Type list the server's counts; Quarter can pick 'Not stated in the filing'", async () => {
    open();
    await screen.findByText("Company 000");
    fireEvent.click(screen.getByRole("button", { name: /^Companies/ }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["All companies75", "My portfolio1", "My watchlist2"]);
    fireEvent.click(screen.getByRole("button", { name: /^Quarter/ }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Any quarter", "Q2 FY2737", "Not stated in the filing38"]);
    fireEvent.click(screen.getByRole("option", { name: /Not stated in the filing/ }));
    await waitFor(() => expect(st.asked.some((u) => u.includes("quarter=none"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /^Type/ }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Any type", "Earnings call75"]);
  });

  it("Sort: Company A–Z asks the server and shows the date in each row instead of day headings", async () => {
    open();
    await screen.findByText("Company 000");
    fireEvent.click(screen.getByRole("button", { name: /^Newest first/ }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Newest first", "Oldest first", "Company A–Z"]);
    fireEvent.click(screen.getByRole("option", { name: "Company A–Z" }));
    await waitFor(() => expect(st.asked.some((u) => u.includes("sort=az"))).toBe(true));
    await waitFor(() => expect(document.querySelectorAll("h3.p4-dh").length).toBe(0));
    const first = screen.getByRole("link", { name: "Company 000" }).closest("article")!;
    expect(first.querySelector(".p4-when b")!.textContent).toBe("20 Nov 2026");
  });

  it("the Portfolio and Watchlist tags; the two actions (task #339) in fixed columns; the stylesheet keeps to the pack", async () => {
    open();
    await screen.findByText("Company 000");
    expect(screen.getByRole("link", { name: "Company 000" }).closest("article")!.querySelector(".p4-tag.pf")!.textContent).toBe("Portfolio");
    expect(screen.getByRole("link", { name: "Company 001" }).closest("article")!.querySelector(".p4-tag.wl")!.textContent).toBe("Watchlist");
    const css = readFileSync(join(__dirname, "..", "styles", "concall-compact.css"), "utf8");
    expect(css).toMatch(/\.p4-acts \{ display: grid; grid-template-columns: 72px 120px;/);
    expect(css).toMatch(/\.p4-ab\.off \{ justify-content: center; width: 32px; padding: 0; border-style: dashed;/);
    expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*\.p4-tools \.dbx-dds \{ flex-wrap: nowrap; overflow-x: auto;/);
  });
});
