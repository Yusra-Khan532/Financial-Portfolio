// @vitest-environment jsdom
// Developer file 40 (founder, 25 Nov 2026): "merge query builder and my baskets page in one". My baskets is a drop-down on the Query builder page,
// between the rules and the examples, closed at first; /baskets opens it there; the menus have one entry, Query builder.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Basket } from "../lib/query";

const st: { user: object | null; data: { baskets: Basket[]; max: number; plan: "basic" | "silver" | "gold" } | undefined } = { user: { id: "u1" }, data: undefined };
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: st.user }) }));
vi.mock("../lib/demo", () => ({ DEMO: false }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn() }), TIER: { basic: { n: "Free", ic: "sprout" }, silver: { n: "Silver", ic: "medal" }, gold: { n: "Gold", ic: "crown" } } }));
vi.mock("../lib/query", async (orig) => ({
  ...(await orig<typeof import("../lib/query")>()),
  useBaskets: () => ({ data: st.data, isLoading: false, isError: false, refetch: vi.fn() }),
  useBasketActions: () => ({ update: { mutate: vi.fn(), isPending: false }, duplicate: { mutate: vi.fn(), isPending: false }, remove: { mutate: vi.fn() } }),
}));
import { BasketsView, basketsLine } from "./BasketsView";
import { MENU, menuMatch } from "../lib/nav";
import { HUBS, toolsForPage } from "../lib/mobileNav";
import { faqForPath } from "../lib/pageFaqs";

const SRC = resolve(__dirname, "..");
const read = (p: string) => readFileSync(resolve(SRC, p), "utf8");
const bk = (id: string, name: string, query: string, count: number): Basket => ({ id, name, query, note: null, columns: [], sort: null, recent: false, createdAt: "2026-11-02T09:00:00Z", updatedAt: "2026-11-20T09:00:00Z", count, countedAt: null, status: "ok", stale: false });
const THREE = [bk("a", "Quality compounders", "ROCE > 20", 64), bk("b", "Cheap and profitable", "P/E < 15 AND P/B < 2", 118), bk("c", "Large and profitable", "Size = large\nROE > 15", 71)];
const view = (open: boolean, onOpen = vi.fn(), onToggle = vi.fn(), current: string | null = null) =>
  render(<MemoryRouter><BasketsView open={open} onToggle={onToggle} onOpen={onOpen} current={current} /></MemoryRouter>);
afterEach(() => { cleanup(); st.user = { id: "u1" }; st.data = undefined; });

describe("My baskets as a drop-down on the Query builder page", () => {
  it("closed at first: a bar with the count, no baskets shown; the bar opens it", () => {
    st.data = { baskets: THREE, max: 100, plan: "gold" };
    const toggle = vi.fn();
    view(false, vi.fn(), toggle);
    const bar = screen.getByRole("button", { name: /My baskets/ });
    expect(bar.getAttribute("aria-expanded")).toBe("false");
    expect(bar.textContent).toContain("3 of 100 saved");
    expect(document.querySelectorAll(".qb-bk")).toHaveLength(0);
    fireEvent.click(bar); expect(toggle).toHaveBeenCalledOnce();
  });

  it("open: every basket with its count, and Open hands the basket to the page (its query goes into the box)", () => {
    st.data = { baskets: THREE, max: 100, plan: "gold" };
    const onOpen = vi.fn();
    view(true, onOpen, vi.fn(), "b");
    expect(document.querySelectorAll(".qb-bk")).toHaveLength(3);
    expect(screen.getByText("118")).toBeTruthy();
    expect(screen.getByText("In the query box")).toBeTruthy();              // the basket that is in the box now is marked
    fireEvent.click(screen.getByRole("button", { name: "Open Cheap and profitable in the query box" }));
    expect(onOpen).toHaveBeenCalledWith(THREE[1]);
    for (const b of ["Rename", "Duplicate", "Delete"]) expect(screen.getAllByRole("button", { name: new RegExp(b) })).toHaveLength(3);
  });

  it("no baskets: says how to make one; signed out: what signing in gives (3 with a free account)", () => {
    st.data = { baskets: [], max: 3, plan: "basic" };
    view(true);
    expect(screen.getByText("No baskets yet")).toBeTruthy();
    expect(document.querySelector(".qb-bkbar")).toBeNull();
    cleanup(); st.user = null;
    view(true);
    expect(screen.getByText("Sign in to keep baskets")).toBeTruthy();
    expect(basketsLine(false, undefined)).toBe("Sign in to keep your queries");
  });

  it("all used: the limit and the next plan", () => {
    st.data = { baskets: THREE, max: 3, plan: "basic" };
    view(true);
    expect(document.querySelector(".qb-bkbar")!.textContent).toContain("All 3 baskets used · More with Silver");
  });
});

describe("one page, one menu entry", () => {
  it("the page puts My baskets between the rules and the examples, and its save card and foot line open it", () => {
    const qb = read("pages/QueryBuilder.tsx");
    const r = qb.indexOf("<QueryRules "), b = qb.indexOf("<BasketsView "), e = qb.indexOf('className="qb-examples"');
    expect(r).toBeGreaterThan(0); expect(b).toBeGreaterThan(r); expect(e).toBeGreaterThan(b);
    expect(qb).not.toMatch(/to="\/baskets"/);
    expect(qb).toContain('links={["/screener", "/advanced-score-screener"]}');
    expect(qb.match(/onClick=\{showBaskets\}/g)).toHaveLength(2);
  });
  it("/baskets opens the drop-down on the Query builder page (old links and bookmarks keep working)", () => {
    expect(read("App.tsx")).toContain('<Route path="baskets" element={<Navigate to="/query-builder?view=baskets" replace />} />');
    expect(read("App.tsx")).not.toContain("pages/Baskets");
  });
  it("the menus: My baskets is no longer its own entry; Query builder says it holds the baskets, and Find a page finds it by 'baskets'", () => {
    const all = MENU.flatMap((g) => g.items.map((it) => ({ it, g })));
    expect(all.map(({ it }) => it.to)).not.toContain("/baskets");
    const qb = all.find(({ it }) => it.to === "/query-builder")!;
    expect(qb.it.sub).toContain("your baskets on the same page");
    for (const q of ["baskets", "my baskets", "saved queries"]) expect(menuMatch(q, qb.it, qb.g), q).toBe(true);
  });
  it("the phone: no Baskets tab among the portfolio tabs; the screeners' shortcut opens My baskets on the Query builder page", () => {
    expect(HUBS.folio.map((t) => t.to)).not.toContain("/baskets");
    expect(toolsForPage("/screener").map((r) => r.to)).toContain("/query-builder?view=baskets");
  });
  it("the page's questions: the Query builder's and My baskets' as one list; the basket limits are the plans' own", () => {
    const f = faqForPath("/query-builder")!;
    expect(f.items).toHaveLength(12);
    expect(faqForPath("/baskets")).toBeNull();
    const ent = readFileSync(resolve(SRC, "../../backend/finlit/auth/entitlements.py"), "utf8");
    const lim = (plan: string) => Number(new RegExp(`"${plan}": \\{[^}]*"baskets": (\\d+)`).exec(ent)![1]);
    expect(f.items.find((i) => i.q === "How many baskets can I keep?")!.a).toBe(`${lim("basic")} with a free account, ${lim("silver")} on Mutual Fund + ETF, Equity Portfolio and the combined plan, and ${lim("gold")} on Gold and Platinum.`);
    expect(f.items.map((i) => i.q)).not.toContain("How do I create a basket?");
  });
});
