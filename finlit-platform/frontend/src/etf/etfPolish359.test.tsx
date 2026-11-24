// @vitest-environment jsdom
// Task #359 (team, 23 Nov 2026), the ETF page: (1) named just "ETFs"; (2) Hide filters inside the Filters box (Show filters in the toolbar as before);
// (3) the panel's scrollbar inside the rounded box; (4) the toolbar band, which read as a black strip, a card like the rest.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EtfList as ListOut } from "../lib/etf";

vi.mock("../lib/title", () => ({ useDocTitle: () => undefined }));
vi.mock("../components/PageHeader", () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
const LIST: ListOut = { items: [], total: 0, universe: 359, hotCount: 0, offset: 0, limit: 40, excluded: 0, categories: [], groups: [{ key: "equity", label: "Equity", count: 261 }], asOf: "2026-11-20", updatedAt: "2026-11-20T17:00:00Z", source: "AMFI", disclaimer: "Information only." };
vi.mock("../lib/etf", async (orig) => ({ ...(await orig<typeof import("../lib/etf")>()), useEtfList: () => ({ data: LIST, isLoading: false, isError: false, isFetching: false, refetch: () => undefined }) }));
import { EtfListPage } from "./List";

const css = readFileSync(join(__dirname, "../styles/task359.css"), "utf8");
afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* jsdom */ } });
const open = () => render(<MemoryRouter><EtfListPage /></MemoryRouter>);

describe("task #359: the ETF page", () => {
  it("is named just ETFs", () => { open(); expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("ETFs"); });
  it("has Hide filters inside the Filters box, and Show filters in the toolbar once hidden", () => {
    open();
    const panel = document.getElementById("etf-filters")!;
    const hide = within(panel).getByRole("button", { name: "Hide filters" });
    expect(document.querySelector(".etf-tools .etf-ftog")).toBeNull();
    fireEvent.click(hide);
    expect(document.getElementById("etf-filters")).toBeNull();
    expect(document.querySelector(".etf-tools .etf-ftog")!.textContent).toBe("Show filters");
  });
  it("keeps the panel's scrollbar inside the rounded box and the toolbar is a card", () => {
    open();
    expect(document.querySelector("#etf-filters > .etf-side-in")).toBeTruthy();
    expect(css).toMatch(/\.etf-list \.etf-side:not\(\.etf-drawer\) \{ padding: 0; overflow: hidden; max-height: none; \}/);
    expect(css).toMatch(/\.etf-list \.etf-side-in::-webkit-scrollbar-track \{ background: none; margin: 14px 0; \}/);
    expect(css).toMatch(/\.wrap\.etf-list \.etf-tools \{ padding: 8px; background: var\(--s1\); border: 1px solid var\(--border\); border-radius: var\(--r-card\); \}/);
  });
});
