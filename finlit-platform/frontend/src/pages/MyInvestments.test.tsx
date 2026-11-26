// @vitest-environment jsdom
// Task #137 (the team's 15 Nov 2026 pack "finlit-all-my-investments-15nov"): the All my investments page. Each test names the pack point it proves:
// B = a live bug of START-HERE, D = a "Done when" line of the README, L = a layout line. The answers are sample answers built with the server's own calc
// module (myinvest/sample-*.json: sample lists, not real data).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AllInvestments } from "../lib/myInvest";
import QTY from "../myinvest/sample-qty.json";
import NOQTY from "../myinvest/sample-noqty.json";

const st = vi.hoisted(() => ({ plan: "gold" as "basic" | "silver" | "gold", body: null as unknown, answer: null as unknown, sends: [] as [string, string, unknown][] }));
vi.mock("../lib/auth", async (orig) => ({ ...(await orig<typeof import("../lib/auth")>()), useAuth: () => ({ user: null }) }));   // task #277: What changed asks for the last visit only when signed in
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()),
  apiSend: vi.fn(async (m: string, p: string, body: unknown) => { st.sends.push([m, p, body]); if (p === "/api/me/all-investments") { st.body = body; return st.answer; } return {}; }),
  apiGet: vi.fn(async () => ({ holdings: [] })) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ has: (p: string) => (p === "silver" ? st.plan !== "basic" : p === "gold" ? st.plan === "gold" : true), upgrade: vi.fn(), toast: vi.fn() }), TIER: { silver: { name: "Silver" }, gold: { name: "Gold" } } }));
vi.mock("../components/Gate", () => ({ Gate: ({ children, title }: { children: React.ReactNode; title: string }) => (st.plan === "basic" ? <div data-testid="gate">{title}</div> : <>{children}</>) }));
import { portfolio } from "../lib/portfolio";
import { MyInvestmentsPage } from "./MyInvestments";
import { filterRows } from "../myinvest/AllTogether";
import { halfDone } from "../myinvest/QtyDialog";
import { rupees } from "../lib/myInvest";

vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
Element.prototype.scrollIntoView = vi.fn();
const withQty = () => structuredClone(QTY) as unknown as AllInvestments;
const noQty = () => structuredClone(NOQTY) as unknown as AllInvestments;
const mount = (path = "/my-investments") => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[path]}><MyInvestmentsPage /></MemoryRouter></QueryClientProvider>);
const text = () => document.body.textContent ?? "";
beforeEach(() => { st.plan = "gold"; st.answer = withQty(); st.sends = []; localStorage.clear(); portfolio.reset(); portfolio.add({ symbol: "HDFCBANK", qty: 40, price: 0, owned: true }); portfolio.add({ symbol: "INFY", qty: 0, price: 0 }); });
afterEach(cleanup);

describe("task #137: All my investments (15 Nov pack)", () => {
  it("D1, L1, L3: reads the Equity list (symbol and quantity only); header links, counts of the three lists and quantities, nothing sent to a broker", async () => {
    mount(); await screen.findByText("Where your money sits");
    expect(st.body).toEqual({ shares: [{ symbol: "HDFCBANK", qty: 40 }, { symbol: "INFY", qty: null }] });
    expect(screen.getByRole("heading", { level: 1, name: "All my investments" })).toBeTruthy();
    expect(text()).toContain("6 shares · 3 funds · 3 ETFs");                    // task #277 (change 2): the title row counts the three lists
    expect(text()).toContain("Money figures cover 0 of 12 holdings.");          // and the money box says what it covers (here: no buy price yet)
    expect(text()).toContain("Nothing is sent to a broker");
    fireEvent.click(screen.getByRole("button", { name: /^More: the three portfolio pages/ }));   // task #277: the page links sit in ⋯
    for (const name of ["Equity portfolio", "MF portfolio", "ETF portfolio", "How it is counted"]) expect(screen.getAllByRole("menuitem", { name }).length).toBeGreaterThan(0);
  });
  it("B8: before the lists load, the header says it is reading them, never \"0 shares · …\"", () => {
    st.answer = new Promise(() => {});
    mount();
    expect(text()).toContain("Reading your three lists…");
    expect(text()).not.toMatch(/0 shares|…\s*mutual funds/);
  });
  it("B6: ETFs are counted, never \"coming\"", async () => {
    mount(); await screen.findByText("Where your money sits");
    expect(text()).not.toMatch(/ETF portfolio · coming|ETFs join once/);
    expect(screen.getAllByText("ETFs").length).toBeGreaterThan(0);
  });
  it("D2: with quantities, the dark box gives the total, the 1-year change and each kind's share and ₹", async () => {
    mount(); await screen.findByText("Where your money sits");
    const d = withQty();
    expect(text()).toContain(rupees(d.total!));
    expect(text()).toContain("value now");                                     // task #277: the money box (it replaces the dark box)
    expect(screen.getByRole("button", { name: "Edit quantities" })).toBeTruthy();
  });
  it("B1, B2, D8, D9: without quantities each kind counts the same (⅓), the split is not your money, and no ₹ value appears anywhere", async () => {
    st.answer = noQty();
    mount(); await screen.findByText("Where your money sits");
    expect(text()).toContain("Each kind counts the same (⅓ each) until you add quantities, so this split is not your money.");
    expect(text()).toContain("12 holdings");
    const money = text().replace(/₹75,000 Cr|₹25,000–75,000 Cr|₹10,000(–25,000)? Cr|₹[\d,]+ a year on ₹1 lakh|₹1 lakh/g, "")   // the four size lines (task #262) are not money;
    expect(money).not.toMatch(/₹/);                                           // no rupee value of the member's money anywhere
    expect(screen.getAllByRole("button", { name: "Add quantities" }).length).toBeGreaterThan(1);
  });
  it("D3, D4: four views; each card opens its view in the page (task #391: calm cards, Open → keeps switching the view)", async () => {
    mount(); await screen.findByText("Where your money sits");
    const strip = document.getElementById("mi-tabs")!;
    expect([...strip.querySelectorAll(".mi391-k")].map((k) => k.firstChild!.textContent)).toEqual(["All together", "Equity", "Mutual funds", "ETFs"]);
    fireEvent.click(screen.getByRole("button", { name: /^Mutual funds: .*Open this view$/ }));
    await screen.findByRole("heading", { name: /^Your funds/ });
    expect(screen.getByRole("button", { name: /^Mutual funds: .*You are here$/ }).getAttribute("aria-pressed")).toBe("true");
  });
  it("D5, D6: the sections bar numbers the open tab's sections; All sections lists every tab's", async () => {
    mount(); await screen.findByText("Where your money sits");
    const bar = screen.getByRole("navigation", { name: "Sections of All together" });
    // task #391 (developer file 35, Section bar, fault 5): every stop numbered 1 to 7, Key figures inside stop 1, no dots
    expect([...bar.querySelectorAll(".stb-chip")].map((c) => c.textContent)).toEqual(["1Your money", "2Made of", "3Sectors and sizes", "4Every company", "5What changed", "6Health", "7Risk"]);
    expect(bar.querySelector(".stb-n0")).toBeNull();
    cleanup(); mount("/my-investments?tab=mf"); await screen.findByRole("heading", { name: /^Your funds/ });
    // task #391 (with PR B): the other views are one step at a time too, every step numbered, Key figures inside step 1
    const bar2 = screen.getByRole("navigation", { name: "Sections of Mutual funds" });
    expect([...bar2.querySelectorAll(".stb-chip")].map((c) => c.textContent)).toEqual(["1Your funds", "2Inside", "3Risk"]);
    expect(screen.getByRole("heading", { name: "Key figures" })).toBeTruthy();
    expect(document.getElementById("mi-mf-risk")).toBeNull();
    fireEvent.click(within(bar2).getByRole("button", { name: "Risk" }));
    await waitFor(() => expect(document.getElementById("mi-mf-risk")).toBeTruthy());
    expect(document.getElementById("mi-mf-list")).toBeNull();
    fireEvent.click(within(bar2).getByRole("button", { name: /All sections/ }));
    await waitFor(() => expect(document.getElementById("mi-mf-list")).toBeTruthy());
  });
  it("D7 (task #391, Update 25 Nov row 1): All sections shows the seven stops in order, Key figures inside stop 1 right after Where your money sits", async () => {
    mount("/my-investments?step=all"); await screen.findByText("Where your money sits");
    const order = ["Where your money sits", "Key figures", "What it is made of", "Sectors and company sizes, counted through everything", "Every company you own, counted once", "What changed at the companies you own", "How healthy it is", "How risky it is, all together"];
    const pos = order.map((t) => text().indexOf(t));
    expect(pos.every((p, i) => p >= 0 && (i === 0 || p > pos[i - 1]))).toBe(true);
    expect(text()).toMatch(/How many companies do you hold more than one way\?.*Which company is the biggest part of everything\?.*Which kind brings the most market risk\?/);
  });
  it("D10-D12, L10: the company table: All together second, Held third, filters with counts, Leader / In line / Laggard, never raw codes", async () => {
    mount("/my-investments?step=all"); await screen.findByText("Every company you own, counted once");
    const table = document.querySelector(".mi-co")!;
    expect([...table.querySelectorAll("thead th")].slice(0, 3).map((t) => t.textContent)).toEqual(["Company", "All together", "Held"]);
    const d = withQty();
    // task #277 (change 18): the four "Show" buttons are one row of filters; Held's choices say how many each leaves
    expect(document.querySelector(".mi7-fcount")!.textContent).toBe(`${d.companies.length} companies`);
    fireEvent.click(screen.getByRole("button", { name: /^Held: All/ }));
    expect([...document.querySelectorAll(".mi7-fm label")].map((l) => l.textContent)).toEqual([`More than one way${d.filters.twice}`, `Only direct${d.filters.direct}`, `Only through funds and ETFs${d.filters.through}`]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(text()).not.toMatch(/\b(leader|laggard|in_line)\b/);
    expect(table.textContent).toMatch(/Leader|Laggard|In line/);
    expect(table.textContent).toContain("Not on your list");
  });
  it("L6: \"Held more than one way\" sets the company filter", async () => {
    mount("/my-investments?step=all"); await screen.findByText("Every company you own, counted once");
    fireEvent.click(screen.getByRole("button", { name: /^Show the \d+ →$/ }));   // task #277 (change 9): the Key figures card's link
    expect(screen.getByRole("button", { name: /^Held: More than one way/ }).className).toContain("on");   // task #277: the Held filter, set and named
    const rows = document.querySelectorAll(".mi-co tbody tr");
    expect(rows.length).toBe(withQty().filters.twice);
  });
  it("D15: names the fund whose file is not loaded", async () => {
    mount("/my-investments?step=all"); await screen.findByText("What it is made of");
    // task #391 (Update 25 Nov row 2): the notes open from the pill at the heading
    fireEvent.click(document.getElementById("mi-made")!.querySelector(".eq8k-btn")!);
    fireEvent.click(within(screen.getByRole("dialog", { name: "Two things to know" })).getByRole("button", { name: /Open all/ }));
    expect(text()).toMatch(/No monthly portfolio file is loaded yet for HDFC Mid-Cap Opportunities/);
  });
  it("B5: sectors are NSE macro sectors, not basic industries", async () => {
    mount("/my-investments?step=all"); await screen.findByText("Sectors and company sizes, counted through everything");
    expect(text()).toMatch(/Macro sectors · \d+|\d+ macro sectors and shares listed abroad/);
    expect(text()).toContain("Financial Services");
    expect(text()).not.toMatch(/Computers - Software|Private Sector Bank/);
  });
  it("B3, D18, B9: Health shows each kind with its own measure; one fund carries its own band label", async () => {
    mount("/my-investments?step=all"); await screen.findByText("How healthy it is");
    for (const c of document.querySelectorAll(".mi-hc .mi-hv")) expect(c.textContent).not.toMatch(/\d+\s*·\s*\d+/);    // never two scores in one number
    expect(text()).toContain("Shares · FinLit Prism");
    expect(text()).toContain("Funds · Mutual Fund Score");
    const one = withQty(); one.funds = [one.funds[2]]; one.counts.funds = 1; one.cards.funds.count = 1;
    cleanup(); st.answer = one; mount("/my-investments?step=all"); await screen.findByText("How healthy it is");
    expect(text()).toContain("Mutual Fund Score");
    expect(text()).not.toMatch(/average 2\d · Poor/i);
  });
  it("D16, D30, B7: risk together with Beta in words, never β; no \"same than\"", async () => {
    mount("/my-investments?step=all"); await screen.findByText("How risky it is, all together");
    expect(text()).not.toContain("β");
    expect(text()).not.toContain("same than");
    expect(text()).toContain("Beta vs Nifty 500");
    expect(text()).toContain("If the Nifty 500 fell 10%");
    expect(text()).toContain("Swing and worst fall are each kind’s own figure, as on its portfolio page.");
    expect(text()).not.toMatch(/\bpts\b|Defensive|Together Beta/);
  });
  it("D19, D20: Equity, Mutual funds and ETFs tabs, each ending with a link to its full portfolio page", async () => {
    for (const [tab, link, to] of [["equity", "Open the full Equity portfolio →", "/holdings"], ["mf", "Open the full MF portfolio →", "/mf-portfolio"], ["etf", "Open the full ETF portfolio →", "/etf-portfolio"]]) {
      cleanup(); mount(`/my-investments?tab=${tab}`);
      const a = await screen.findByRole("link", { name: new RegExp(link.replace(/[()+→]/g, ".")) });
      expect(a.getAttribute("href")).toBe(to);
    }
  });
  it("L15: with no ETFs the ETFs tab says so, with Add ETF", async () => {
    const d = withQty(); d.etfs = []; d.counts.etfs = 0; d.cards.etfs.count = 0;
    st.answer = d; mount("/my-investments?tab=etf");
    await screen.findByText("No ETFs yet");
    expect(screen.getByRole("link", { name: "Add ETF" }).getAttribute("href")).toBe("/etf-portfolio");
  });
  it("D22, L17: the quantities dialog opens, starts in the first box, refuses a half-done kind and closes on Escape", async () => {
    st.answer = noQty();
    mount(); await screen.findByText("Where your money sits");
    fireEvent.click(screen.getAllByRole("button", { name: "Add quantities" })[0]);
    const dlg = await screen.findByRole("dialog", { name: "Quantities" });
    expect(document.activeElement?.tagName).toBe("INPUT");
    expect(halfDone([{ kind: "shares", v: "10" }, { kind: "shares", v: "" }, { kind: "etfs", v: "" }])).toEqual(["shares"]);
    fireEvent.change(within(dlg).getAllByRole("textbox")[0], { target: { value: "12" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Save quantities" }));
    expect((await within(dlg).findByRole("alert")).textContent).toMatch(/Fill every box for your shares/);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Quantities" })).toBeNull());
  });
  it("D21: saving writes the quantities into the Equity list and the ETF portfolio, then reads the page again", async () => {
    st.answer = noQty();
    mount(); await screen.findByText("Where your money sits");
    fireEvent.click(screen.getAllByRole("button", { name: "Add quantities" })[0]);
    const dlg = await screen.findByRole("dialog", { name: "Quantities" });
    const boxes = within(dlg).getAllByRole("textbox");    // 2 shares, then 3 ETFs (no funds in this browser's MF answer)
    ["40", "30", "300", "400", "40"].forEach((v, i) => fireEvent.change(boxes[i], { target: { value: v } }));
    const before = st.sends.filter(([, p]) => p === "/api/me/all-investments").length;
    fireEvent.click(within(dlg).getByRole("button", { name: "Save quantities" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Quantities" })).toBeNull());
    expect(portfolio.get().holdings.map((h) => h.qty)).toEqual([40, 30]);
    expect(st.sends.find(([, p]) => p === "/api/me/etf-portfolio/quantities")?.[2]).toEqual({ items: [{ symbol: "NIFTYBEES", qty: "300" }, { symbol: "GOLDBEES", qty: "400" }, { symbol: "MON100", qty: "40" }] });
    await waitFor(() => expect(st.sends.filter(([, p]) => p === "/api/me/all-investments").length).toBeGreaterThan(before));
  });
  it("#217: a share with several buys is one line, showing their total, and is changed in its buy history on the Equity portfolio", async () => {
    portfolio.add({ symbol: "HDFCBANK", qty: 10, price: 1600, date: "2026-01-02", owned: true });
    portfolio.update(portfolio.get().holdings[0].id, { owned: true, price: 1500, date: "2025-05-01" });
    st.answer = noQty();
    mount(); await screen.findByText("Where your money sits");
    fireEvent.click(screen.getAllByRole("button", { name: "Add quantities" })[0]);
    const dlg = await screen.findByRole("dialog", { name: "Quantities" });
    expect(within(dlg).getAllByText("HDFCBANK")).toHaveLength(1);
    expect(within(dlg).getByText("2 buys and sales: change them in the buy history on the Equity portfolio")).toBeTruthy();
  });
  it("D24, D25 (task #283): Silver lists shares without a score, Gold reads them with FinLit Prism; Basic sees the plan gate", async () => {
    const s = withQty(); s.plan = "silver"; st.answer = s; st.plan = "silver";
    mount("/my-investments?step=all"); await screen.findByText("Every company you own, counted once");
    expect(document.querySelector(".mi-co thead")!.textContent).not.toMatch(/FinLit Prism|\bIQ\b/);
    expect(document.body.textContent).not.toMatch(/\bIQ\b/);
    cleanup(); st.plan = "gold"; st.answer = withQty(); mount("/my-investments?step=all"); await screen.findByText("Every company you own, counted once");
    expect(document.querySelector(".mi-co thead")!.textContent).toContain("FinLit Prism");
    cleanup(); st.plan = "basic"; mount();
    expect(screen.getByTestId("gate").textContent).toBe("See all your investments together");
  });
  it("D26, D27: things to know open from a pill by each heading (task #391); every section heading and tile label has an i button", async () => {
    mount("/my-investments?step=all"); await screen.findByText("Where your money sits");
    expect(document.querySelectorAll(".mi-step .eq8k-btn").length).toBeGreaterThan(3);
    expect(document.querySelector(".mi-notes")).toBeNull();
    for (const h of document.querySelectorAll(".mi-sh h2")) expect(h.querySelector("button.info")).toBeTruthy();
    for (const t of document.querySelectorAll(".mi-tile:not(.empty) > .mi-cap:first-child")) expect(t.querySelector("button.info")).toBeTruthy();
  });
  it("L16, L19, R2: In short, the disclaimer, eight questions incl. no profit or loss, sources; no downloads; no advice words", async () => {
    mount(); await screen.findByText("Where your money sits");
    expect(text()).toContain("What this means, in short");
    expect(text()).toContain("Questions about this page · 8");   // task #391 (file 41 v4, E2): the shared bottom's Questions fold, the same eight
    expect(text()).toContain("How is profit or loss worked out?");
    expect(text()).toContain("Information only, not investment advice.");
    expect(text()).toMatch(/NSE closing prices to/);
    expect(text()).not.toMatch(/download|CSV/i);
    expect(text().toLowerCase()).not.toMatch(/\b(buy(?! prices?\b)|sell|hold on|accumulate|add more|reduce|target price|top pick|multibagger)\b/);   // task #235: "buy price" names a cost, not advice
  });
  it("filters: the four company filters pick the right rows", () => {
    const c = withQty().companies;
    expect(filterRows(c, "twice").every((r) => r.held.length > 1)).toBe(true);
    expect(filterRows(c, "through").every((r) => r.direct === 0)).toBe(true);
    expect(filterRows(c, "direct").every((r) => r.direct > 0 && r.held.length === 1)).toBe(true);
  });
});
