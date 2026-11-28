// @vitest-environment jsdom
// Task #448 (Sector Pulse, developer file 42, 28 Nov 2026), part 1: the shared parts and the words. The wallet mark for "in your portfolio" (04 §1), the header's
// lines and wallet key (01 §2), the ⋯ menu (01 §3), things to know (01 §4), Why it matters in the title row (01 §5), plain counts on filter pills (03 §7) and the
// tile wording (05 §5). A member with made-up shares (two Finance stocks, one Power) and one with none. Describes, never advises.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import board from "../lib/__fixtures__/pulse-board-6nov.json";
import history from "../../public/demo/sector-history.json";
import type { Board } from "../lib/sectors";

const st = vi.hoisted(() => ({ holdings: [] as { id: string; symbol: string; qty: number; price: number; owned?: boolean }[] }));
const q = (d: unknown) => ({ data: d, isLoading: false, isError: false, error: null, refetch: () => {} });
vi.mock("../lib/sectors", async (orig) => ({ ...(await orig<typeof import("../lib/sectors")>()), useSectorBoard: () => q(board) }));
vi.mock("../lib/sectorHistory", async (orig) => ({ ...(await orig<typeof import("../lib/sectorHistory")>()), useSectorHistory: () => ({ data: history }) }));
vi.mock("../lib/sectorExtra", async (orig) => ({ ...(await orig<typeof import("../lib/sectorExtra")>()), useIndustryMap: () => ({ data: undefined }) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("../lib/portfolio", async (orig) => ({ ...(await orig<typeof import("../lib/portfolio")>()), usePortfolio: () => ({ holdings: st.holdings }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), useSearchIndex: () => ({ data: undefined }),
  apiGet: vi.fn((url: string) => url.startsWith("/api/sectors/membership")
    ? Promise.resolve({ groups: { FINA: { slug: "finance", name: "Finance" }, FINB: { slug: "finance", name: "Finance" }, PWRA: { slug: "power", name: "Power" } } })
    : new Promise(() => {})) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "gold", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { SectorPulsePage } from "./SectorPulse";

const B = board as unknown as Board;
const SHARES = [{ id: "1", symbol: "FINA", qty: 10, price: 100 }, { id: "2", symbol: "FINB", qty: 5, price: 50 }, { id: "3", symbol: "PWRA", qty: 1, price: 10 }, { id: "4", symbol: "SOLD", qty: 1, price: 1, owned: false }];
beforeEach(() => { sessionStorage.clear(); for (const v of ["industries", "sectors"]) sessionStorage.setItem(`finlit:steps:sp:${v}`, JSON.stringify({ mode: "all" }));   /* task #448: every step on the page (the step bar's "All sections") */ localStorage.clear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); st.holdings = []; });
afterEach(cleanup);
const at = (path = "/sectors") => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={[path]}><SectorPulsePage /></MemoryRouter></QueryClientProvider>);
const text = () => (document.body.textContent ?? "").replace(/\s+/g, " ");

describe("task #448, the wallet mark (04 §1)", () => {
  it("a member with shares: the key line under the facts, and a 20 px wallet after each of their groups, spoken and titled 'In your portfolio'", async () => {
    st.holdings = SHARES;
    at();
    // task #448 (02 §3): one state at a time, opening on the largest (Sold off); "My industries" shows the member's own
    const mineBtn = await waitFor(() => within(screen.getAllByRole("group", { name: "Show" })[0]).getByRole("button", { name: /My industries/ }));
    fireEvent.click(mineBtn);
    await waitFor(() => expect(document.querySelectorAll(".sp-grp-t .sp-wal").length).toBeGreaterThan(0));
    const key = document.querySelector(".sx-walkey")!;
    expect(key.textContent).toBe(" marks an industry or a stock you hold shares in");
    expect(within(key as HTMLElement).getByRole("img", { name: "The wallet mark" })).toBeTruthy();   // mid-sentence it is "the wallet mark"
    const marks = [...document.querySelectorAll(".sp-grp-t .sp-wal")];
    expect(marks.every((m) => m.getAttribute("role") === "img" && m.getAttribute("aria-label") === "In your portfolio" && m.getAttribute("title") === "In your portfolio")).toBe(true);
    const rows = marks.map((m) => m.closest("tr")!.querySelector("a.sp-ind")!.textContent);
    expect(new Set(rows)).toEqual(new Set(["Finance", "Power"]));
    // no YOURS / (yours) / ★ outside the Inside-a-sector list, whose native options become the custom list with the wallet in part 3 (04 §5)
    const outside = [...document.body.querySelectorAll("*")].filter((e) => !e.closest("select") && !e.children.length).map((e) => e.textContent ?? "").join(" ");
    const hit = outside.match(/.{0,60}(\bYOURS\b|\(yours\)|★|bold with a gold edge).{0,40}/i); expect(hit?.[0] ?? null).toBeNull();
    // the filter pill: the small wallet before "My industries", its count a plain number
    const pill = within(screen.getAllByRole("group", { name: "Show" })[0]).getByRole("button", { name: /My industries/ });
    expect(pill.querySelector(".sp-wal-s")).toBeTruthy();
    expect(pill.textContent).toBe("My industries 2");
    expect(pill.getAttribute("aria-pressed")).toBe("true");
  });
  it("a member with no shares sees no wallet and no key line; a share marked not owned does not count", () => {
    st.holdings = [{ id: "4", symbol: "SOLD", qty: 1, price: 1, owned: false }];
    at();
    expect(document.querySelector(".sx-walkey")).toBeNull();
    expect(document.querySelectorAll(".sp-wal").length).toBe(0);
  });
});

describe("task #448, header, menu and things to know (01 §2 to §5)", () => {
  it("the facts are lines; the backdrop is one line with its i; no fact line starts with ' · '", () => {
    at();
    const lines = [...document.querySelectorAll(".sp-meta .sx-ml")].map((p) => (p.textContent ?? "").replace(/i$/, ""));
    expect(lines[0]).toMatch(/^Updated every weekend, to the close of Fri 6 Nov 2026 · 1,202 actively traded stocks$/);
    expect(lines.some((l) => l.startsWith("Market backdrop: +4.6% Nifty 50 above its long-term average"))).toBe(true);
    expect(lines.every((l) => !l.startsWith(" ·") && !l.startsWith("·"))).toBe(true);
    expect(screen.getByRole("button", { name: "About “Market backdrop”" })).toBeTruthy();
  });
  it("the ⋯ menu: arrow keys move, Esc closes and gives focus back; an item's panel keeps focus inside and the page does not scroll", () => {
    at();
    const more = screen.getByRole("button", { name: /^More on this page/ });
    fireEvent.click(more);
    const menu = screen.getByRole("menu", { name: "More on this page" });
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["How to read and use this page", "What the labels mean", "Which stocks are counted", "Words on this page"]);
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items[3]);
    fireEvent.click(items[3]);
    const panel = screen.getByRole("dialog", { name: "Words on this page" });
    expect(panel.textContent).toContain("their average price over about the last two and a half months");   // 05 §3: no "last few months"
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(within(panel).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
    expect(document.activeElement).toBe(more);
  });
  it("a section's cards become one pill in its title row, outside any tab list, that opens a popover list; Why it matters is a title-row button", () => {
    at();
    fireEvent.click(screen.getByRole("tab", { name: /Against other industries/ }));
    const sec = document.getElementById("sp-momentum")!.closest("section")!;
    const head = sec.querySelector(".sp-sec-h")!;
    const pill = within(head as HTMLElement).getByRole("button", { name: "1 thing to know" });
    expect(pill.closest("[role=tablist]")).toBeNull();
    fireEvent.click(pill);
    const pop = screen.getByRole("dialog", { name: "One thing to know" });
    expect(pop.querySelectorAll(".sx-ql-r").length).toBe(1);
    const why = within(head as HTMLElement).getByRole("button", { name: /^Why it matters/ });
    const order = [...head.querySelectorAll(".sx-tools > *")].map((e) => e.className.split(" ")[0]);
    expect(order.indexOf("sx-whyb")).toBeLessThan(order.indexOf("sx-ttk-slot"));
    fireEvent.click(why);
    expect(why.getAttribute("aria-expanded")).toBe("false");   // first visit: open; pressed: closed
  });
});

describe("task #448, words and counts (03 §7, 05 §5)", () => {
  it("the tiles say 'N more / fewer than last week' and 'same as last week'; no '▲ 2 vs last week'", () => {
    at();
    const tiles = [...document.querySelectorAll(".sx-tile small")].map((s) => s.textContent);
    expect(tiles.every((t) => /^(\d+ (more|fewer) than last week|same as last week|–)$/.test(t ?? ""))).toBe(true);
    expect(text()).not.toMatch(/vs last week|no change/);
  });
  it("no filter pill or heading carries a '· N' count, in either view", async () => {
    st.holdings = SHARES;
    for (const path of ["/sectors", "/sectors?view=full"]) {
      at(path);
      await waitFor(() => expect(document.querySelectorAll(".sx-fl button, .sp-filters button").length).toBeGreaterThan(0));
      const pills = [...document.querySelectorAll(".sx-fl button, .sp-filters button")].map((b) => b.textContent ?? "");
      expect(pills.length).toBeGreaterThan(0);
      expect(pills.filter((p) => /·\s*\d/.test(p))).toEqual([]);
      expect([...document.querySelectorAll("h2, h3")].map((h) => h.textContent ?? "").filter((h) => /·\s*\d/.test(h))).toEqual([]);
      cleanup();
    }
  });
});
void B;
