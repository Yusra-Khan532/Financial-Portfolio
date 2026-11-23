// @vitest-environment jsdom
// Task #351 (23 Nov 2026): the ETF page as the team's "refined, mobile-ready" design. Filters in a panel on the left (Type, Category, Ranges, each with
// an (i) and a count of what is on); "Hide filters" lets the table take the width and the toggle stays in the pinned toolbar; the ETF vs Index Fund card
// is gone and its header button is gold with a crown; the table is centred with column lines, a raised pinned header and a fade while more columns are hidden.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EtfItem, EtfList as ListOut } from "../lib/etf";
import { resolveLink } from "../lib/pageHeader";

vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
const hdr = vi.hoisted(() => ({ links: [] as unknown[] }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title, links }: { title: string; links: unknown[] }) => { hdr.links = links; return <h1>{title}</h1>; } }));
const listed: { data: ListOut | undefined } = { data: undefined };
vi.mock("../lib/etf", async (orig) => ({ ...(await orig<typeof import("../lib/etf")>()), useEtfList: () => ({ data: listed.data, isLoading: false, isError: false, isFetching: false, refetch: () => undefined }) }));
import { EtfListPage } from "./List";

const css = readFileSync(join(__dirname, "../styles/etf351.css"), "utf8");
afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* jsdom */ } });
const item = (o: Partial<EtfItem>): EtfItem => ({ isin: "INF0", fundHouse: "A", category: "gold", categoryLabel: "Gold", assetClass: "gold", previousClose: 100, priceDate: "2026-11-20", volume: 1,
  symbol: "GOLDBEES", name: "Nippon India ETF Gold BeES", price: 102.21, changePct: -3.85, ret1y: 0.65, ret5y: 139.87, avgTurnover: 5e9, premium: 0.18, why: {}, ter: 0.81, terDate: "2026-11-20", ...o } as EtfItem);
const LIST: ListOut = { items: [item({}), item({ symbol: "SILVERBEES", name: "Nippon India Silver ETF", assetClass: "silver" })], total: 359, universe: 359, hotCount: 0, offset: 0, limit: 40, excluded: 0,
  categories: [{ key: "gold", label: "Gold", group: "gold", count: 26 }], groups: [{ key: "equity", label: "Equity", count: 261 }, { key: "gold", label: "Gold", count: 26 }],
  asOf: "2026-11-20", updatedAt: "2026-11-20T17:00:00Z", source: "AMFI", disclaimer: "Information only." };
function Where() { return <output data-testid="where">{useLocation().search}</output>; }
const open = (at = "/etfs") => { listed.data = LIST; return render(<MemoryRouter initialEntries={[at]}><EtfListPage /><Where /></MemoryRouter>); };

describe("task #351: the ETF page", () => {
  it("puts Type, Category and Ranges in a Filters panel on the LEFT of the table, each with an (i)", () => {
    open();
    const panel = document.getElementById("etf-filters")!, layout = document.querySelector(".etf-layout")!;
    expect(panel.tagName).toBe("ASIDE");
    expect(layout.firstElementChild).toBe(panel);
    expect(layout.lastElementChild!.classList.contains("etf-main")).toBe(true);
    expect(layout.querySelector(".etf-main .etf-tw")).toBeTruthy();
    expect([...panel.querySelectorAll(".etf-fs-t > span:first-child")].map((x) => x.textContent)).toEqual(["Type", "Category", "Ranges"]);
    expect(within(panel).getAllByRole("button", { name: /^What is / }).map((b) => b.getAttribute("aria-label"))).toEqual(["What is Type?", "What is Category?", "What is Ranges?"]);
  });
  it("ticking a type asks the server for that type", () => {
    open("/etfs?q=gold");
    const panel = document.getElementById("etf-filters")!;
    fireEvent.click(within(panel).getByRole("checkbox", { name: /Equity/ }));
    expect(screen.getByTestId("where").textContent).toContain("asset=equity");
  });
  it("Reset all keeps the search and clears every filter", () => {
    open("/etfs?q=gold&asset=gold&category=gold");
    expect(document.querySelector(".etf-side-h .etf-fs-n")!.textContent).toBe("2 on");
    fireEvent.click(screen.getByRole("button", { name: "Reset all" }));
    const w = screen.getByTestId("where").textContent!;
    expect(w).toContain("q=gold"); expect(w).not.toContain("asset="); expect(w).not.toContain("category=");
  });
  it("a group folds from its heading and remembers it", () => {
    open();
    const t = screen.getByRole("button", { name: /^Category/ });
    expect(t.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(t);
    expect(t.getAttribute("aria-expanded")).toBe("false");
    expect((document.getElementById("etf-fs-category") as HTMLElement).hidden).toBe(true);
  });
  it("Hide filters removes the panel (the table takes the width, no empty column) and the same button, now Show filters, brings it back", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: /^Hide filters/ }));
    expect(document.getElementById("etf-filters")).toBeNull();
    expect(document.querySelector(".etf-layout")!.classList.contains("is-shut")).toBe(true);
    const show = screen.getByRole("button", { name: /^Show filters/ });
    expect(show.closest(".etf-tools")).toBeTruthy();                                  // in the toolbar above the table, which is pinned while scrolling
    expect(screen.getAllByRole("button", { name: /^Show filters/ })).toHaveLength(1);
    fireEvent.click(show);
    expect(document.getElementById("etf-filters")).toBeTruthy();
    expect(css).toMatch(/\.etf-list \.etf-tools \{ position: sticky; top: 64px;/);
    expect(css).toMatch(/\.etf-list \.etf-layout\.is-shut \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  });
  it("the ETF vs Index Fund card is gone; its header button stays, second, in gold with a crown", () => {
    open();
    expect(document.querySelector(".evi-promo")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Pick an index such as the Nifty 50/);
    expect(hdr.links).toEqual(["/etfs/compare", { to: "/etfs/compare-index-funds", gold: true }, "/funds"]);
    expect(resolveLink({ to: "/etfs/compare-index-funds", gold: true })?.gold).toBe(true);
    const ph = readFileSync(join(__dirname, "../components/PageHeader.tsx"), "utf8");
    expect(ph).toContain('buttonClass("secondary", "sm", "ph-lk ph-gold")}><Icon name="crown" className="ph-crown" />');
  });
  it("the table: numbers centred, a line between columns, the header raised and pinned, the name pinned left, 1080px at least, 680px tall, a fade at the right", () => {
    open();
    expect(css).toMatch(/\.etf-list \.etf-table \.num, \.etf-list \.etf-table thead \.num, \.etf-list \.etf-table \.etf-c-category \{ text-align: center; \}/);
    expect(css).toMatch(/\.etf-list \.etf-table th:not\(\.etf-first\), \.etf-list \.etf-table td \{ border-left: 1px solid var\(--border\); \}/);
    expect(css).toMatch(/\.etf-list \.etf-table thead th \{ height: 38px; padding: 0 14px; background: var\(--s2\)/);
    expect(css).toMatch(/\.etf-list \.etf-table \{ min-width: 1080px; \}/);
    expect(css).toMatch(/\.etf-list \.etf-tw \{ max-height: 680px;/);
    expect(css).toMatch(/height: 62px/);
    expect(css).toMatch(/\.etf-list \.etf-tw\.has-more \{/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Compare Nippon India Silver ETF" }));
    expect(screen.getByText("SILVERBEES", { selector: ".etf-sub .mono" }).closest("tr")!.classList.contains("is-picked")).toBe(true);
  });
  it("pagination sits right under the table, before the notes", () => {
    open();
    const pager = screen.getByRole("navigation", { name: "Pages" }), tw = document.querySelector(".etf-tw")!, note = screen.getByText(/means the figure is not available/);
    expect(tw.compareDocumentPosition(pager) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(pager.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("task #351: on a phone the filters are a drawer", () => {
  it("Filters opens a dialog drawer with the three groups, Reset and Show N ETFs; Escape and Show N ETFs close it", () => {
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
    try {
      open();
      const d = document.getElementById("etf-filters") as HTMLElement;
      expect(d.getAttribute("role")).toBe("dialog"); expect(d.hidden).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
      expect(d.hidden).toBe(false);
      expect(within(d).getByRole("checkbox", { name: /Equity/ })).toBeTruthy();
      expect(within(d).getByRole("button", { name: "Reset" })).toBeTruthy();
      fireEvent.click(within(d).getByRole("button", { name: "Show 359 ETFs" }));
      expect(d.hidden).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
      fireEvent.keyDown(window, { key: "Escape" });
      expect(d.hidden).toBe(true);
      expect(css).toMatch(/animation: etf-slide \.2s ease/);
    } finally { window.matchMedia = mm; }
  });
});
