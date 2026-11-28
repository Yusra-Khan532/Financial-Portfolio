// @vitest-environment jsdom
// Task #448 (Sector Pulse, developer file 42), part 4: the tables (03). Even gaps, the full table's captions over the columns showing, every column
// sorting (and back to the site's order exactly), the Held up note only with its column, the name cell, the header that stays in view.
// The 6 Nov board; made-up figures only. Describes, never advises.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import board from "../../../lib/__fixtures__/pulse-board-6nov.json";
import type { Board, GroupRow } from "../../../lib/sectors";
import { byState, short } from "../../../lib/pulsePack";
import { evenGap, MAX_GAP } from "../../../lib/evenGaps";
import { pinOffset } from "../../../lib/pinnedHead";

vi.mock("../../../lib/api", async (orig) => ({ ...(await orig<typeof import("../../../lib/api")>()), apiGet: vi.fn(() => new Promise(() => {})), useSearchIndex: () => ({ data: undefined }) }));
vi.mock("../../../lib/ui", () => ({ useUI: () => ({ plan: "gold" }) }));
vi.mock("../../../lib/auth", () => ({ useAuth: () => ({ user: { id: "u" } }) }));
vi.mock("../../../lib/watchlist", () => ({ useWatchlist: () => ({ lists: [], meta: {} }) }));
import { PulseTable, captions, sortRows, textWidth } from "./PulseTable";

const B = board as unknown as Board;
beforeEach(() => { localStorage.clear(); });
afterEach(cleanup);
const wrap = () => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><PulseTable b={B} h={undefined} mine={new Set([B.rows[0].slug])} /></MemoryRouter></QueryClientProvider>);
const names = () => [...document.querySelectorAll(".sx-ft > tbody > tr.sp-row .sx-ftn-t > b")].map((x) => x.textContent);

describe("03 §1 even gaps", () => {
  it("shares the room left over as one gap up to 128 px; a tight table uses 28 px (8+ columns) or 36 px", () => {
    expect(evenGap(1000, 600, 5)).toEqual({ gap: 92, tight: false });             // (1000 - 600 - 32) / 4
    expect(evenGap(3000, 600, 5)).toEqual({ gap: MAX_GAP, tight: false });
    expect(evenGap(700, 600, 5)).toEqual({ gap: 36, tight: true });
    expect(evenGap(700, 600, 9)).toEqual({ gap: 28, tight: true });
    expect(evenGap(1000, 600, 1).gap).toBe(0);
  });
  it("the six-month chart is sized from its longest name (no empty band on the left)", () => {
    expect(textWidth("Power", 16)).toBeLessThan(textWidth("Automobile and Auto Components", 16));
  });
});

describe("03 §3 the full table", () => {
  it("captions span the columns showing; a group left with one column has no caption, and its i sits beside the column's own name", () => {
    expect(captions("all")).toEqual([{ cap: null, span: 2 }, { cap: "trend", span: 3 }, { cap: "fall", span: 2 }, { cap: null, span: 2 }, { cap: "vs", span: 2 }, { cap: null, span: 1 }]);
    expect(captions("key")).toEqual([{ cap: null, span: 5 }, { cap: "vs", span: 2 }, { cap: null, span: 1 }]);
    wrap();
    const g = () => [...document.querySelectorAll(".sp-full-g > *")].map((c) => `${(c.textContent ?? "").replace(/i$/, "")}:${(c as HTMLTableCellElement).colSpan}`);
    expect(g()).toEqual([":5", "Vs other industries:2", ":1"]);
    expect(document.querySelector(".sp-full-g td")!.getAttribute("role")).toBe("none");            // 07 M13: empty header cells are not headers
    expect(screen.getByRole("button", { name: "About “Stocks rising”" })).toBeTruthy();
    expect(screen.queryByText(/Red in "Held up"/)).toBeNull();                                      // the note shows only with the Held up column
    fireEvent.click(screen.getByRole("button", { name: "All columns" }));
    expect(g()).toEqual([":2", "Above their trend:3", "Depth of fall:2", ":2", "Vs other industries:2", ":1"]);
    expect(screen.getByText(/Red in "Held up"/)).toBeTruthy();
  });
  it("the name cell: the name, the wallet straight after it, the stock count on its own line, the full name on hover", () => {
    wrap();
    const cell = document.querySelector(".sx-ft .sp-row.sx-mine .sx-ftn")!;
    expect(cell.querySelector(".sp-exp")!.getAttribute("title")).toBe(B.rows[0].name);
    const t = cell.querySelector(".sx-ftn-t")!;
    expect([...t.children].map((x) => x.tagName + (x.className ? "." + x.className : ""))).toEqual(["B", "SPAN.sp-wal", "SMALL"]);
    expect(t.textContent).toContain("⁠");                                                        // a word joiner: the wallet never sits alone
  });
});

describe("03 §5 sorting the full table", () => {
  it("first press the natural order, second the reverse, third the site's order exactly; groups hide while sorted", () => {
    wrap();
    const site = names();
    const btn = screen.getByRole("button", { name: "Sort by Stocks rising" });
    expect(btn.closest("th")!.getAttribute("aria-sort")).toBe("none");
    fireEvent.click(btn);
    const up = (r: GroupRow) => r.breadth.above_20 ?? -1;
    const want = [...B.rows].sort((a, c) => up(c) - up(a)).map((r) => up(r));
    expect(names().map((n) => up(B.rows.find((r) => short(r.name) === n)!))).toEqual(want);
    expect(btn.closest("th")!.getAttribute("aria-sort")).toBe("descending");
    expect(document.querySelectorAll(".sx-ft .sp-gh")).toHaveLength(0);
    expect(screen.getByRole("status").textContent).toBe("Sorted by Stocks rising, high to low. Groups are hidden while sorted. Back to groups");
    fireEvent.click(btn);
    expect(btn.closest("th")!.getAttribute("aria-sort")).toBe("ascending");
    fireEvent.click(btn);
    expect(names()).toEqual(site);
    expect(document.querySelectorAll(".sx-ft .sp-gh").length).toBe(byState(B.rows).length);
    fireEvent.click(screen.getByRole("button", { name: "Sort by Industry" }));
    fireEvent.click(within(screen.getByRole("status")).getByRole("button", { name: "Back to groups" }));
    expect(names()).toEqual(site);
  });
  it("box sorts Ahead and gaining first; missing values always go last; ties keep the site's order", () => {
    const rows = B.rows.slice(0, 6);
    const box = sortRows(rows, { col: "box", dir: "first" }).map((r) => r.rotation?.corner);
    const order = ["ahead_gaining", "ahead_slowing", "middle", "behind_gaining", "behind_slipping"];
    expect(box.map((c) => order.indexOf(c!))).toEqual([...box.map((c) => order.indexOf(c!))].sort((a, c) => a - c));
    const withGap = [{ ...rows[0], rotation: null }, ...rows.slice(1)] as GroupRow[];
    expect(sortRows(withGap, { col: "rank", dir: "first" }).at(-1)!.slug).toBe(rows[0].slug);
    expect(sortRows(withGap, { col: "rank", dir: "rev" }).at(-1)!.slug).toBe(rows[0].slug);
  });
});

describe("03 §4 the header that stays in view", () => {
  it("moves only while the table passes under the bars, and never past the table's end", () => {
    expect(pinOffset(200, 40, 900, 62)).toBe(0);
    expect(pinOffset(-100, 40, 900, 62)).toBe(162);
    expect(pinOffset(-800, 40, 80, 62)).toBe(840);                                                  // stops with the table's last row
  });
});
