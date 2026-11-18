// @vitest-environment jsdom
// Task #183 part 2 (MF portfolio), M3: Clear portfolio replaces Remove all (the shared component; the server holds the list for the 10-second Undo), the
// empty state names how to add a fund, and Add units saves every fund's units together, or says how many boxes are still empty.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
const sent: { method: string; path: string; body: unknown }[] = [];
vi.mock("../../lib/api", () => ({ apiGet: vi.fn(), apiSend: vi.fn((method: string, path: string, body: unknown) => { sent.push({ method, path, body }); return Promise.resolve({}); }) }));
import { UnitsDialog, unitsCheck } from "./UnitsDialog";
import type { Holding } from "../../lib/mfPortfolio";

afterEach(() => { cleanup(); sent.length = 0; });
const page = readFileSync(resolve(__dirname, "../../pages/MfPortfolio.tsx"), "utf8");
const H = (id: string, name: string, nav: number, lots = 0): Holding => ({ id, code: 1, folio: "", units: null, name, nav, lots: Array.from({ length: lots }, (_, i) => ({ id: `${id}${i}`, units: 5, invested: 100, boughtOn: "2024-01-01" })), current: lots ? 900 : null } as unknown as Holding);
const view = (hs: Holding[], onDone = vi.fn(), onClose = vi.fn()) => render(<QueryClientProvider client={new QueryClient()}><UnitsDialog hs={hs} onDone={onDone} onClose={onClose} /></QueryClientProvider>);

describe("Clear portfolio and the empty state (M3)", () => {
  it("uses the shared Clear portfolio with the server's clear and undo, not Remove all", () => {
    expect(page).toContain("<ClearPortfolio count={d?.count ?? 0} noun=\"fund\" kind=\"MF\"");
    expect(page).not.toMatch(/RemoveAll|Remove all/);
    const lib = readFileSync(resolve(__dirname, "../../lib/mfPortfolio.ts"), "utf8");
    expect(lib).toContain('apiSend<{ status: string; removed: number; undoSeconds: number }>("POST", "/api/me/mf-portfolio/clear")');
    expect(lib).toContain('"/api/me/mf-portfolio/undo-clear"');
  });
  it("shows an empty state with one line on adding by name or ISIN, and Add / Import buttons", () => {
    expect(page).toContain("Your MF portfolio is empty");
    expect(page).toContain("Add a fund by its name or ISIN, or import a statement");
    expect(page).toMatch(/>Add a fund<\/button>[\s\S]*>Import a statement<\/button>/);
  });
});

describe("Add units (M3)", () => {
  it("saves only when every fund has units (or none has), and never changes a fund bought in several purchases", () => {
    expect(unitsCheck([{ v: "10", locked: false }, { v: "", locked: false }])).toEqual({ ready: false, empty: 1 });
    expect(unitsCheck([{ v: "10", locked: false }, { v: "2.5", locked: false }, { v: "", locked: true }])).toEqual({ ready: true, empty: 0 });
    expect(unitsCheck([{ v: "", locked: false }]).ready).toBe(false);
  });
  it("shows each fund's value as you type and the total, says what is missing, then saves every fund", async () => {
    const onDone = vi.fn();
    view([H("a", "Quant Small Cap Fund", 100), H("b", "Kotak MNC Fund", 20), H("c", "ICICI Prudential MNC Fund", 10, 2)], onDone);
    expect(document.activeElement).toBe(screen.getByLabelText("Units of Quant Small Cap Fund"));
    fireEvent.change(screen.getByLabelText("Units of Quant Small Cap Fund"), { target: { value: "10" } });
    expect(screen.getByText("₹1,000")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save units" }));
    expect(screen.getByRole("alert").textContent).toMatch(/1 box is empty/);
    fireEvent.change(screen.getByLabelText("Units of Kotak MNC Fund"), { target: { value: "50" } });
    expect(document.querySelector(".mfu-t tfoot td")!.textContent).toBe("₹2,900");     // 1,000 + 1,000 + the 900 already held in two purchases
    fireEvent.click(screen.getByRole("button", { name: "Save units" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(sent.map((s) => [s.method, s.path, (s.body as { lots: { units: string }[] }).lots[0].units])).toEqual([["PUT", "/api/me/mf-portfolio/a", "10"], ["PUT", "/api/me/mf-portfolio/b", "50"]]);
    expect(screen.getByText("2 buys and sales: kept as they are")).toBeTruthy();
  });
});
