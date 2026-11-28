// @vitest-environment jsdom
// Task #333 part C (developer file 30, additions 1 to 3): the fixed "Read together" sentences, the results groups behind a sector, the What happened next cards and the
// Inside a sector table (12 strongest by 6-month return, 5 then Show all 12, stored Prism scores, filters).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Board, GroupRow } from "../../../lib/sectors";

const st = vi.hoisted(() => ({ page: null as unknown, next: null as unknown }));
vi.mock("../../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../../lib/api")>()), apiGet: vi.fn((url: string) => url.startsWith("/api/sector-next") ? Promise.resolve(st.next) : new Promise(() => {})) }));
vi.mock("../../../lib/sectors", async (orig) => ({ ...(await orig<typeof import("../../../lib/sectors")>()), useSectorPage: () => ({ data: st.page, isLoading: false }) }));
vi.mock("../../../lib/prismScores", async (orig) => ({ ...(await orig<typeof import("../../../lib/prismScores")>()), usePrismScores: (syms: string[]) => Object.fromEntries(syms.map((s, i) => [s, { rated: true, final: 80 - i * 7, label: i < 2 ? "Strong" : i < 4 ? "Healthy" : "Weak", status: "RATED", parts: null, shortTerm: i < 3 ? { score: 30, word: "Uptrend" } : { score: -25, word: "Downtrend" }, longTerm: { score: 60, word: "Strong uptrend" } }])) }));
vi.mock("../../../lib/ui", () => ({ useUI: () => ({ plan: "gold" }) }));
vi.mock("../../../lib/auth", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("../../../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [{ id: "m", name: "w", symbols: [] }], meta: {} }) }));
import { InsideSector, WhatNext, readTogether, resultsFor, weeksWord } from "./PulseChecks";

afterEach(cleanup);
const row = (o: Partial<GroupRow>) => ({ name: "Power", slug: "power", kind: "sector", industries: [], state_code: "washout", breadth: { above_9: 50, above_20: 60, above_50: 40 }, stocks_counted: 20, ...o } as GroupRow);
const wrap = (el: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{el}</MemoryRouter></QueryClientProvider>);

describe("Read together: one fixed sentence from the price side and the results (file 30, addition 3)", () => {
  const g = (vsMarket: "Ahead" | "Behind" | "In line") => ({ name: "x" + Math.random(), companies: 10, declared: 10, vsMarket });
  it("covers the six cases of the file's table", () => {
    expect(readTogether("weak", [g("Ahead"), g("Ahead"), g("Behind")])!.text).toBe("Price is weak while results are ahead of the market.");
    expect(readTogether("weak", [g("Behind")])!.text).toBe("Price and results are both behind.");
    expect(readTogether("strong", [g("Ahead")])!.text).toBe("Price and results are both ahead.");
    expect(readTogether("strong", [g("Behind"), g("Behind")])!.text).toBe("Price is strong while results are behind the market.");
    expect(readTogether("weak", [g("Ahead"), g("Behind")])!.text).toBe("Results are mixed across its industries.");
    expect(readTogether("strong", [g("In line")])!.text).toBe("Results are in line with the market.");
    expect(readTogether("strong", [{ name: "y", companies: 1, declared: 0, vsMarket: null }])).toBeNull();
    for (const s of ["weak", "strong"] as const) for (const set of [[g("Ahead")], [g("Behind")]]) expect(readTogether(s, set)!.text).not.toMatch(/\b(buy|sell|hold|avoid|should)\b/i);
  });
  it("in the Sectors view: its industries with their own results group, largest first, up to three, then 'Other <sector>' for the smaller ones read together", () => {
    const r = row({ name: "Services", slug: "services", industries: ["Engineering Services", "Transport Services", "Transport Infrastructure", "Commercial Services & Supplies", "Public Services"] });
    const all = [{ name: "Transport Services", companies: 40, declared: 40 }, { name: "Commercial Services & Supplies", companies: 90, declared: 90 }, { name: "Transport Infrastructure", companies: 30, declared: 30 },
      { name: "Engineering Services", companies: 12, declared: 12 }, { name: "Services", companies: 9, declared: 9 }, { name: "Banks", companies: 40, declared: 40 }];
    const x = resultsFor(r, all, true);
    expect(x.shown.map((s) => s.label)).toEqual(["Commercial Services & Supplies", "Transport Services", "Transport Infrastructure"]);
    expect(x.more).toBe(2);
    const y = resultsFor(row({ name: "Power", industries: ["Power"] }), [{ name: "Power", companies: 70, declared: 70 }], false);
    expect(y.shown.map((s) => s.label)).toEqual(["Power"]);
  });
  it("says '1 week', never '1 weeks'", () => {
    expect(weeksWord(1)).toBe("1 week"); expect(weeksWord(3.5)).toBe("3½ weeks"); expect(weeksWord(null)).toBe("–");
  });
});

describe("What happened next (task #448, 02 §4: one state at a time, one sentence)", () => {
  it("state tabs with 'N now', opening on the state with the most groups now; the sentence in the pack's words; the bars of where it went next", async () => {
    st.next = { window_from: "2025-11-21", window_to: "2026-11-20", groups: 18, rows: [
      { state: "confirmed", entered: 27, ended: 27, next: [{ state: "washout", n: 1 }], typical_weeks: 1, now: 0 },
      { state: "washout", entered: 72, ended: 56, next: [{ state: "fading", n: 17 }, { state: "thrust_c", n: 12 }, { state: "thrust_cap", n: 11 }, { state: "confirmed", n: 8 }], typical_weeks: 2.4, now: 16 }] };
    wrap(<WhatNext />);
    const tabs = await waitFor(() => screen.getByRole("group", { name: "State" }));
    expect(within(tabs).getAllByRole("button").map((b) => b.textContent)).toEqual(["Rising together 0 now", "Sold off 16 now"]);
    expect(within(tabs).getByRole("button", { name: /Sold off/ }).getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector(".sx-nx-sent")!.textContent).toBe("Sold off: a group moved into it 72 times over this period. It usually stayed about 2 weeks. Of the 56 that left, it went to Losing steam 17 times, Bouncing back 12 times and Bouncing back after a crash 11 times.");
    expect(document.querySelectorAll(".sx-nxl2 li")).toHaveLength(4);
    fireEvent.click(within(tabs).getByRole("button", { name: /Rising together/ }));
    expect(document.querySelector(".sx-nx-sent")!.textContent).toBe("Rising together: a group moved into it 27 times over this period. It usually stayed about 1 week. Of the 27 that left, it went to Sold off once.");
    expect(document.body.textContent).toContain("Counted at every weekly close from 21 Nov 2025 to 20 Nov 2026, 18 industries. It shows what did happen, not what will.");
    expect(document.body.textContent).not.toMatch(/chance|likely|will (rise|fall)|~|wks/i);
  });
});

describe("Inside a sector (addition 2; task #448 02 §5 and 04 §3, §5)", () => {
  const setup = () => {
    const stocks = Array.from({ length: 15 }, (_, i) => ({ symbol: "S" + i, name: "Stock " + i, return_6m_pct: 60 - i * 5, rank_6m: i + 1, peer_label: i % 3 === 0 ? "Leader" : i % 3 === 1 ? "In line" : "Laggard" }));
    st.page = { stocks };
    const b = { rows: [row({ name: "Realty", slug: "realty" }), row({ name: "Power", slug: "power", stocks_counted: 15 }), row({ name: "Pharma", slug: "pharma" })] } as unknown as Board;
    wrap(<InsideSector b={b} mine={new Set(["power"])} symbols={["S1"]} />);
  };
  const body = () => [...document.querySelectorAll(".sx-t tbody tr")];
  it("opens on the member's first group, lists the 12 strongest by 6-month return (5, then Show all 12), with Prism and the technical chips, and filters", () => {
    setup();
    expect((document.querySelector(".sx-slb select") as HTMLSelectElement).value).toBe("power");
    expect(document.body.textContent).toContain("A list to start research from, not a recommendation.");
    expect(document.body.textContent).toContain("15 counted stocks · 5 Leaders · 5 In line · 5 Laggards");
    expect(document.body.textContent).not.toContain("(yours)");
    expect(body()).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Show all 12 ▾ Show the other 7 ▾" }));
    expect(body()).toHaveLength(12);
    expect(body()[0].textContent).toContain("+60.0%"); expect(body()[0].textContent).toContain("Strong 80");
    const heads = [...document.querySelectorAll(".sx-t thead th")].map((h) => h.textContent);
    expect(heads).toEqual(["Stock", "6-month return", "Against its peers", "FinLit Prism", "Short-term technical", "Long-term technical"]);
    const chips = body()[0].querySelectorAll(".sx-tech");
    expect(chips[0].className).toContain("sx-tech-pos"); expect(chips[0].textContent).toContain("▲ Uptrend +30");
    expect(chips[1].className).toContain("sx-tech-strongpos"); expect(chips[1].textContent).toContain("▲▲ Strong uptrend +60");
    expect(chips[0].getAttribute("title")).toBe("Short term technical score +30 on a scale from minus 100 to plus 100: uptrend. It describes past prices only.");
    expect(body()[4].querySelector(".sx-tech")!.textContent).toContain("▼ Downtrend −25");
    expect(body()[1].className).toContain("sx-mine");                          // the member's own share
    const show = screen.getByRole("group", { name: "Show" });
    fireEvent.click(within(show).getByRole("button", { name: "Leaders" }));
    expect(body().every((r) => r.textContent!.includes("Leader"))).toBe(true);
    fireEvent.click(within(show).getByRole("button", { name: "Prism: Healthy or Strong" }));
    expect(body()).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Alert me about Power" })).toBeTruthy();
  });
  it("Technical: rising on both counts over all 12, opens the list, shows only those, and closes again", () => {
    setup();
    const show = screen.getByRole("group", { name: "Show" });
    const tech = within(show).getByRole("button", { name: "Technical: rising on both 3" });
    expect(body()).toHaveLength(5);
    fireEvent.click(tech);
    expect(tech.getAttribute("aria-pressed")).toBe("true");
    expect(body()).toHaveLength(3);
    fireEvent.click(tech);
    expect(tech.getAttribute("aria-pressed")).toBe("false");
    expect(body()).toHaveLength(5);                                            // pressing it again closes the list it opened
    fireEvent.click(tech); fireEvent.click(within(show).getByRole("button", { name: "Leaders" }));
    expect(tech.getAttribute("aria-pressed")).toBe("false");                   // any of the site's own pills turns it off
  });
  it("the sector list is a list box with the wallet: named by its label, keys move, Enter chooses and fires change on the hidden select", () => {
    setup();
    const btn = screen.getByRole("button", { name: "Industry Power In your portfolio" });
    expect(btn.getAttribute("aria-haspopup")).toBe("listbox");
    const sel = document.querySelector(".sx-slb select") as HTMLSelectElement;
    const changed = vi.fn(); sel.addEventListener("change", changed);
    fireEvent.click(btn);
    const lb = screen.getByRole("listbox");
    const opts = within(lb).getAllByRole("option");
    expect(opts.map((o) => o.getAttribute("aria-selected"))).toEqual(["false", "true", "false"]);
    expect(opts[1].textContent).toContain("✓");
    expect(opts[1].querySelector(".sp-wal")).toBeTruthy();
    fireEvent.keyDown(lb, { key: "End" });
    expect(lb.getAttribute("aria-activedescendant")).toBe(opts[2].id);
    fireEvent.keyDown(lb, { key: "Home" }); fireEvent.keyDown(lb, { key: "p" });
    expect(lb.getAttribute("aria-activedescendant")).toBe(opts[1].id);        // typing jumps to the first name that starts with it
    fireEvent.keyDown(lb, { key: "ArrowDown" }); fireEvent.keyDown(lb, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(sel.value).toBe("pharma"); expect(changed).toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Industry Pharma" }));
    fireEvent.click(document.activeElement!); fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
