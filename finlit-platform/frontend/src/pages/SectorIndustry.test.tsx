// @vitest-environment jsdom
// An industry page as the "FinLit final pages" pack draws it (docs/design/finlit-final-pages/07), on Finance at the 6 Nov 2026 close: the header with its state, box
// and rank, What is happening, the cycle, the year's story, Against other industries, the locked stock list for Basic, Not counted, and Add to watch.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import page from "../lib/__fixtures__/industry-6nov/finance.json";
import year from "../lib/__fixtures__/industry-6nov/finance-year.json";
import rot from "../lib/__fixtures__/industry-6nov/finance-rot.json";
import { ApiError } from "../lib/api";
import { prefs } from "../lib/prefs";

const st = vi.hoisted(() => ({ page: null as unknown, user: null as unknown }));
const q = (d: unknown) => (d instanceof Error ? { data: undefined, isLoading: false, isError: true, error: d, refetch: () => {} } : { data: d, isLoading: false, isError: false, error: null, refetch: () => {} });
vi.mock("../lib/sectors", async (orig) => ({ ...(await orig<typeof import("../lib/sectors")>()), useSectorPage: () => q(st.page) }));
vi.mock("../lib/sectorExtra", async (orig) => ({ ...(await orig<typeof import("../lib/sectorExtra")>()), useIndustryYear: () => q(year) }));
vi.mock("../lib/rotation", async (orig) => ({ ...(await orig<typeof import("../lib/rotation")>()), useRotationCard: () => q(rot) }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: st.user }) }));
vi.mock("../lib/api", async (orig) => ({ ...(await orig<typeof import("../lib/api")>()), useSearchIndex: () => ({ data: undefined }) }));
vi.mock("../lib/ui", () => ({ useUI: () => ({ toast: vi.fn(), plan: "basic", upgrade: vi.fn(), has: () => true }), TIER: { basic: { n: "Basic", ic: "sprout", tc: "--t-basic" }, silver: { n: "Silver", ic: "medal", tc: "--t-silver" }, gold: { n: "Gold", ic: "crown", tc: "--t-gold" } } }));
vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
import { SectorIndustryPage } from "./SectorIndustry";

beforeEach(() => { localStorage.clear(); prefs.set({ sectorWatch: [] }, true); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); st.page = page; st.user = { id: "u" }; });
afterEach(cleanup);
const at = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={["/sectors/finance"]}><Routes><Route path="/sectors/:slug" element={<SectorIndustryPage />} /></Routes></MemoryRouter></QueryClientProvider>);
const h2 = () => screen.getAllByRole("heading", { level: 2 }).map((h) => (h.textContent ?? "").replace(/i$/, ""));
const BANNED = /\b(buy|sell(?!-off)|hold|reduce|avoid|accumulate|target|best|multibagger|top pick)\b/i;
const said = () => (document.body.textContent ?? "").replace(document.querySelector(".sp-disclaimer")?.textContent ?? "", "");

describe("an industry page (pack 07)", () => {
  it("has the header with the state, the box and the rank, and the counts", () => {
    at();
    expect(screen.getByRole("heading", { level: 1, name: "Finance" })).toBeTruthy();
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Sector Pulse" }).getAttribute("href")).toBe("/sectors");
    const head = document.querySelector(".ip-head")!.textContent!;
    expect(head).toContain("Bouncing back after a crash"); expect(head).toContain("since 5 Nov"); expect(head).toContain("Behind and slipping"); expect(head).toContain("rank 27 of 37");
    expect(head).toContain("NSE industry in Financial Services · 67 stocks counted, 105 not counted · data as of 6 Nov 2026");
  });
  it("shows the sections in the pack's order and never advises", () => {
    at();
    const want = ["What is happening in Finance", "Where Finance is in the cycle", "A year of Finance", "Against other industries", "The 67 counted stocks, strongest 6 months first"], got = h2(), idx = want.map((t) => got.indexOf(t));
    expect(idx.every((v, i) => v >= 0 && (i === 0 || v > idx[i - 1]))).toBe(true);
    expect(document.body.textContent).toContain("Finance bounced back after a crash on 5 Nov.");
    expect(document.body.textContent).toContain("FINANCE IS HERE");
    expect(document.querySelectorAll(".ip-moments li").length).toBe(6);
    expect(document.querySelectorAll(".ip-year .ip-mk").length).toBe(6);
    expect(said()).not.toMatch(BANNED);
  });
  it("for Basic the stock list and the not-counted names are locked in words; the counts stay", () => {
    at();
    expect(screen.getByText("The stocks of each industry are part of the Silver plan")).toBeTruthy();
    expect(document.body.textContent).toContain("Not counted: 105 Finance stocks");
  });
  it("Add to watch saves the industry for its alerts, and again removes it", () => {
    at();
    const b = screen.getByRole("button", { name: "Add to watch" });
    fireEvent.click(b);
    expect(prefs.get().sectorWatch).toEqual(["finance"]);
    expect(screen.getByRole("button", { name: "Watching ✓" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Watching ✓" }));
    expect(prefs.get().sectorWatch).toEqual([]);
  });
  it("signed out, Add to watch leads to sign in", () => {
    st.user = null;
    at();
    expect(screen.getByRole("link", { name: "Add to watch" }).getAttribute("href")).toBe("/login?next=/sectors/finance");
  });
  it("shows the short and longer trends when asked", () => {
    at();
    expect(document.querySelector(".ip-l9")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Show the short and longer trends as well/ }));
    expect(document.querySelector(".ip-l9")).not.toBeNull();
  });
  it("says why when the industry is not there", () => {
    st.page = new ApiError(404, { detail: "There is no industry with this address." } as never);
    at();
    expect(screen.getByText("No such industry")).toBeTruthy();
  });
});
