// @vitest-environment jsdom
// Task #278 (Concall Monitor): the heading and subtitle; All / Portfolio / Watchlist, the search icon and Latest / Upcoming; one card per call with its
// logo or initial, name, ticker, date and time; four independent buttons (Listen plays the recording on the page, Transcript shows the full text, PPT
// shows the presentation, AI Summary writes the summary); a button with nothing to open says why, never a dead click; opening one card never changes
// another; the menu lists the page.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Call, CallList } from "../lib/concalls";

const st = vi.hoisted(() => ({ asked: [] as string[], summary: [] as string[], user: null as unknown, plan: "basic" }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title, description }: { title: string; description: string }) => <header><h1>{title}</h1><p>{description}</p></header> }));
vi.mock("../components/CoLogo", () => ({ CoLogo: ({ name }: { name: string }) => <span className="logo">{name[0]}</span> }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: st.user, plan: st.plan }) }));

const mk = (o: Partial<Call>): Call => ({
  id: "ACME|2026-11-19", symbol: "ACME", name: "Acme Ltd", date: "2026-11-19", time: "16:00", timeLabel: "04:00 PM", dateNote: null, timeNote: null, kind: "Earnings call",
  quarter: "Q2 FY27", upcoming: false, schedule: null,
  listen: { audio: "https://acme.in/q2.mp3", letter: { link: "https://nsearchives.nseindia.com/a.pdf", title: "Link of Recording", filed: "2026-11-19", pages: 1 } },
  transcript: { doc: { link: "https://nsearchives.nseindia.com/t.pdf", title: "Transcript", filed: "2026-11-21", pages: 2 } },
  ppt: { doc: { link: "https://nsearchives.nseindia.com/p.pdf", title: "Investor Presentation", filed: "2026-11-18", pages: 20 } },
  summary: { source: "transcript", link: "https://nsearchives.nseindia.com/t.pdf" }, ...o });
const BETA = mk({ id: "BETA|2026-11-18", symbol: "BETA", name: "Beta Industries", time: null, timeLabel: null, timeNote: "Time not stated in the filings", date: "2026-11-18",
  listen: { why: "No recording link filed with the exchange for this call." }, transcript: { why: "Not filed yet. Companies file the transcript within 5 working days of the call (SEBI LODR)." },
  ppt: { why: "No investor presentation filed with this call." }, summary: { why: "An AI summary is written from the call's transcript or presentation; neither is filed yet." } });
const list = (items: Call[], o: Partial<CallList> = {}): CallList => ({ items, total: items.length, counts: { latest: 2, upcoming: 1 }, scope: "all", tab: "latest", readAt: "2026-11-20T10:00:00+00:00",
  source: "The company's own filings with NSE", disclaimer: "Describes what the company said on its call, from its own filings; not a recommendation. Information only, not investment advice.",
  scopeNote: null, signIn: false, ...o });

beforeEach(() => {
  st.asked = []; st.summary = []; st.user = null; st.plan = "basic";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    st.asked.push(u);
    if (u.includes("/api/concalls/transcript")) return new Response(JSON.stringify({ symbol: "ACME", link: "x", filed: "2026-11-21", pages: ["Moderator: welcome to the call.", "CFO: revenue grew 12%."] }));
    if (u.includes("/api/concalls/summary")) { st.summary.push(String(init?.body)); return new Response(JSON.stringify({ text: "**What the quarter looked like**\n- Revenue grew **12%** (p. 2)", source: "transcript", link: "x", written: null, cached: false, limit: 10, used: 1, left: 9, resets: "2026-12-01", disclaimer: "Not advice." })); }
    if (u.includes("scope=portfolio")) return new Response(JSON.stringify(list([], { scope: "portfolio", signIn: true, scopeNote: "Sign in to see the calls of the companies in your equity portfolio." })));
    if (u.includes("tab=upcoming")) return new Response(JSON.stringify(list([mk({ id: "UPC|2026-11-24", symbol: "UPC", name: "Upcoming Co", date: "2026-11-24", upcoming: true, listen: { why: "The call is on 24 Nov 2026." } })], { tab: "upcoming" })));
    return new Response(JSON.stringify(list([mk({}), BETA])));
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

import { ConcallMonitorPage } from "./ConcallMonitor";
const open = (path = "/concalls") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><ConcallMonitorPage /></MemoryRouter></QueryClientProvider>);
const card = (name: string) => screen.getByRole("link", { name }).closest("article") as HTMLElement;

describe("Concall Monitor", () => {
  it("has the heading, the subtitle, one toolbar (Latest / Upcoming, a search box always there, Companies, Has, Quarter, Type)", async () => {
    open();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Concall Monitor");
    expect(screen.getByText("Listen to earnings call recordings, read transcripts & investor presentations, and track upcoming result meets.")).toBeTruthy();
    expect(screen.getByRole("searchbox", { name: "Search a company" }).getAttribute("placeholder")).toBe("Search a company or symbol");   // task #306
    for (const l of ["Companies", "Has", "Quarter", "Type"]) expect(screen.getByRole("button", { name: new RegExp("^" + l) }).getAttribute("aria-haspopup")).toBe("dialog");
    await screen.findByText("Acme Ltd");
    expect(within(screen.getByRole("tablist", { name: "Latest or upcoming calls" })).getAllByRole("tab").map((t) => t.textContent)).toEqual(["Latest2", "Upcoming1"]);
  });

  it("each row shows the logo or initial, the name, the ticker, the call's time (its day as the heading), and four buttons", async () => {
    open();
    await screen.findByText("Acme Ltd");
    const a = card("Acme Ltd");
    expect(within(a).getByText("A")).toBeTruthy();                                   // the logo (initials tile)
    expect(a.textContent).toContain("ACME");
    expect(a.textContent).not.toContain("Nov 19, 2026");                             // task #306: no US date on every row; the day is the heading
    expect(a.closest("section")!.querySelector("h3")!.textContent).toMatch(/^Thu, 19 Nov1 call$/);
    expect(a.textContent).toContain("4:00 PM IST");
    expect(within(a).getAllByRole("button").map((b) => b.textContent)).toEqual(["Listen", "Transcript", "PPT", "AI Summary"]);
    expect(card("Beta Industries").textContent).toContain("Time not stated in the filings");      // never a made-up time
  });

  it("Listen plays the recording on the page, and opening one card never opens or moves another", async () => {
    open();
    await screen.findByText("Acme Ltd");
    fireEvent.click(within(card("Acme Ltd")).getByRole("button", { name: "Listen" }));
    const audio = card("Acme Ltd").querySelector("audio")!;
    expect(audio.getAttribute("src")).toBe("https://acme.in/q2.mp3");
    expect(card("Beta Industries").querySelector(".ccm-panel")).toBeNull();
    expect(within(card("Beta Industries")).getByRole("button", { name: /^Listen/ }).getAttribute("aria-expanded")).toBe("false");
  });

  it("a button with nothing to open is greyed and says why when pressed (never a dead click)", async () => {
    open();
    await screen.findByText("Beta Industries");
    const b = card("Beta Industries");
    const ppt = within(b).getByRole("button", { name: /^PPT/ });
    expect(ppt.getAttribute("aria-disabled")).toBe("true");
    expect(ppt.className).toContain("off");                                          // task #306: a dashed icon, the reason in its tooltip
    expect(ppt.getAttribute("title")).toBe("No investor presentation filed with this call.");
    fireEvent.click(ppt);
    expect(b.textContent).toContain("No investor presentation filed with this call.");
    fireEvent.click(within(b).getByRole("button", { name: /^Transcript/ }));
    expect(b.textContent).toContain("within 5 working days");
  });

  it("Transcript shows the full text page by page; PPT shows the presentation in place with the original PDF", async () => {
    open();
    await screen.findByText("Acme Ltd");
    const a = card("Acme Ltd");
    fireEvent.click(within(a).getByRole("button", { name: "Transcript" }));
    await waitFor(() => expect(a.textContent).toContain("CFO: revenue grew 12%."));
    expect(within(a).getByText("Page 2")).toBeTruthy();
    fireEvent.click(within(a).getByRole("button", { name: "PPT" }));
    const f = a.querySelector("iframe")!;
    expect(f.getAttribute("src")).toContain("/api/concalls/file?link=" + encodeURIComponent("https://nsearchives.nseindia.com/p.pdf"));
    expect(within(a).getByRole("link", { name: /Open the PDF/ }).getAttribute("href")).toBe("https://nsearchives.nseindia.com/p.pdf");
  });

  it("AI Summary: a visitor is asked to sign in; a Silver member gets the summary written from the transcript", async () => {
    open();
    await screen.findByText("Acme Ltd");
    fireEvent.click(within(card("Acme Ltd")).getByRole("button", { name: "AI Summary" }));
    expect(card("Acme Ltd").textContent).toContain("Sign in");
    expect(st.summary).toEqual([]);
    cleanup();
    st.user = { id: "u" }; st.plan = "silver";
    open();
    await screen.findByText("Acme Ltd");
    fireEvent.click(within(card("Acme Ltd")).getByRole("button", { name: "AI Summary" }));
    await waitFor(() => expect(card("Acme Ltd").textContent).toContain("What the quarter looked like"));
    expect(card("Acme Ltd").querySelector(".ccm-li b")!.textContent).toBe("12%");
    expect(st.summary).toEqual([JSON.stringify({ link: "https://nsearchives.nseindia.com/t.pdf" })]);
    expect(card("Acme Ltd").textContent).toContain("1 of 10 AI summaries used this month");
  });

  it("Upcoming, Portfolio and search ask the server for exactly that", async () => {
    open();
    await screen.findByText("Acme Ltd");
    fireEvent.click(screen.getByRole("tab", { name: /Upcoming/ }));
    await screen.findByText("Upcoming Co");
    expect(st.asked.some((u) => u.includes("tab=upcoming"))).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Companies/ }));             // task #306: the Companies dropdown keeps the server's scope=
    fireEvent.click(screen.getByRole("option", { name: /My portfolio/ }));
    await screen.findByText(/Sign in to see the calls of the companies in your equity portfolio/);
    expect(st.asked.some((u) => u.includes("scope=portfolio"))).toBe(true);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search a company" }), { target: { value: "acme" } });
    await waitFor(() => expect(st.asked.some((u) => u.includes("q=acme"))).toBe(true));
  });

  it("the menu lists the page under News & events, after Latest results, marked new", async () => {
    const { SECTIONS, isNew } = await import("../lib/nav");
    const items = SECTIONS.find((s) => s.id === "news")!.groups.flatMap((g) => g.items);
    const at = items.findIndex((x) => x.to === "/concalls");
    expect(items[at - 1].to).toBe("/results/quarter");
    expect(items[at].label).toBe("Concall Monitor");
    expect(isNew(items[at], Date.parse("2026-11-21T10:00:00+05:30"))).toBe(true);
    expect(readFileSync(resolve(process.cwd(), "src/App.tsx"), "utf8")).toMatch(/path="concalls" element=\{<ConcallMonitorPage \/>\}/);
  });

  it("never advises and keeps the disclaimer", async () => {
    open();
    await screen.findByText("Acme Ltd");
    expect(document.body.textContent).toContain("not a recommendation");
    expect(document.body.textContent).not.toMatch(/\b(buy|sell|hold|target price|best|multibagger|top pick)\b/i);
  });
});
