// @vitest-environment jsdom
// Developer file 44, the founder's points of 27 Nov 2026 (2 am) on the company report:
//  1 "remove company brief"
//  2 Profit and loss in charts: "let's first show Growth by line"
//  3 What drives return on equity: "remove How it is calculated and make a crown over the What if calculator tab"
//  4 Community discussions: "not able to see anything" (three empty boxes)
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ meFails: true, calls: [] as string[] }));
vi.mock("../lib/api", async (orig) => {
  const real = await orig<typeof import("../lib/api")>();
  return { ...real, apiGet: vi.fn(async (url: string) => {
    st.calls.push(url);
    if (url.startsWith("/api/forum/me")) {
      if (st.meFails) throw new real.ApiError(404, { detail: "Not in this preview." });
      return { signedIn: true, plan: "gold", board: "gold", handle: "member", canPost: false, banned: false, moderator: false };
    }
    if (url.startsWith("/api/forum/threads")) return { threads: [{ id: 7, title: "Jio listing and the O2C margin", symbol: "RELIANCE", author: { handle: "member", staff: false }, upvotes: 3, replies: 1, createdAt: "2026-11-08T10:00:00Z", lastActivityAt: "2026-11-08T10:00:00Z", status: "visible", body: "A question on the segment table.", mine: false, voted: false, canEdit: false }], total: 1, page: 1, pages: 1 };
    return {};
  }) };
});
import { ThreadList } from "../components/forum/ForumParts";
import { TabGroup } from "../components/TabGroup";

afterEach(cleanup);
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");

describe("1 · the Company brief is not in the report", () => {
  it("the report draws no Company brief section and asks for no brief; the component, its server answer and Discover's use of it stay", () => {
    const page = read("stock/StockPage.tsx");
    expect(page).not.toContain('foldOf("company-brief")');
    expect(page).not.toContain("CompanyBriefSection");
    expect(page).not.toContain('"company-brief": [');
    expect(existsSync(resolve(__dirname, "CompanyBrief.tsx"))).toBe(true);
    expect(read("discovery/CompanyTable.tsx")).toContain("useCompanyBrief(r.s)");
  });
});

describe("2 · Profit and loss in charts opens on Growth by line", () => {
  it("Growth by line is the first tab (a tab group opens on its first view); the ₹100 note no longer says 'the walk above'", () => {
    const more = read("stock/MoreCharts.tsx"), pl = more.slice(more.indexOf("export function PlCharts"), more.indexOf("/* ---------------------------------------------------------------- balance sheet */"));
    expect([...pl.matchAll(/\{ key: "([a-z]+)", label: "([^"]+)"/g)].map((m) => m[1])).toEqual(["growth", "walk", "hundred"]);
    expect(pl).not.toContain("in the walk above");
    render(<TabGroup label="t" views={[{ key: "growth", label: "Growth by line", content: <p>g</p> }, { key: "walk", label: "Revenue to net profit", content: <p>w</p> }]} />);
    expect(screen.getByRole("tab", { selected: true }).textContent).toContain("Growth by line");
  });
});

describe("3 · What drives return on equity: no How it is calculated, a crown over the What-if calculator", () => {
  it("the tab and its year picker, formulas and notes are gone; their styles too", () => {
    const roe = read("stock/DecodeRoe.tsx");
    for (const gone of ['label: "How it is calculated"', "dp-howbody", "setPick", "explain(", "thresholdNotes"]) expect(roe, gone).not.toContain(gone);
    expect(read("styles/dupont.css")).not.toMatch(/\.dp-how(body|-t)?\b/);
    expect(roe).toContain('{ key: "whatif", label: "What-if calculator", crown: "Key view", content:');
  });
  it("a crowned tab has a crown over its top edge, its words read out after the name; the list leaves room above the tabs", () => {
    const { container } = render(<TabGroup label="Decoding ROE" views={[{ key: "a", label: "Extended DuPont", content: <p>a</p> }, { key: "whatif", label: "What-if calculator", crown: "Key view", content: <p>b</p> }]} />);
    expect(container.querySelector(".ct-list")!.className).toBe("ct-list crowned");
    const tab = screen.getByRole("tab", { name: /What-if calculator/ });
    expect(tab.querySelector(".ct-tcrown")!.getAttribute("title")).toBe("Key view");
    expect(tab.textContent).toBe("2What-if calculator, Key view");
    expect(screen.getByRole("tab", { name: /Extended DuPont/ }).querySelector(".ct-tcrown")).toBeNull();
    const css = read("styles/tabgroup.css");
    expect(css).toContain(".ct-list.crowned { padding-top: 14px; }");
    expect(css).toMatch(/\.ct-tcrown \{ position: absolute; top: -14px; left: 50%;[^}]*background: var\(--ui-on-bg\); color: var\(--ui-on-fg\)/);   // the bar's one ink colour (task #310)
    cleanup();
    expect(render(<TabGroup label="x" views={[{ key: "a", label: "A", content: <p>a</p> }]} />).container.querySelector(".ct-list")!.className).toBe("ct-list");
  });
});

describe("4 · Community discussions never stay as empty boxes", () => {
  const view = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><ThreadList symbol="RELIANCE" local per={5} /></MemoryRouter></QueryClientProvider>);
  it("when the sign-in check fails, the list says so with its reason and Try again (it showed three grey boxes for good)", async () => {
    st.meFails = true; st.calls = [];
    const { container } = view();
    const err = await screen.findByRole("alert");
    expect(err.textContent).toContain("The discussions could not be loaded: the sign-in check did not answer (Not in this preview.)");
    expect(container.querySelector(".skeleton")).toBeNull();
    expect(st.calls.some((u) => u.startsWith("/api/forum/threads"))).toBe(false);
    st.meFails = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByText("Jio listing and the O2C margin")).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("the forum's front page lists companies with the same rule", () => {
    const forum = read("pages/Forum.tsx");
    expect(forum).toContain("{me && !me.signedIn ? null : !me && meQ.isError ? <MeFailed q={meQ} /> : list.isPending ?");
  });
});
