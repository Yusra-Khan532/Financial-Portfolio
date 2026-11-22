// @vitest-environment jsdom
// Task #316 (dashboard file 22, 22 Nov 2026): the shorter dashboard. One test (or more) per point of the pack that can be checked without the server.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { Card, ShowMoreButton, useShowMore } from "./parts";
import { Dd, DxProvider, PaneCtx, SegDd } from "./dx";
import { SectionFilter, SectionHead } from "./Today";
import { WatchBand, BAND_COLOUR } from "./Watch";
import { cellsOf } from "../../pages/Dashboard";
import { sortInv } from "../../lib/dashInvest";
import { DASH_STEPS, normaliseDashUi, prefs, type WidgetPref } from "../../lib/prefs";
import type { Row } from "../../lib/screener";

beforeEach(() => { localStorage.clear(); prefs.set({ dashUi: normaliseDashUi(null) }); });
afterEach(cleanup);
const wrap = (el: React.ReactNode) => render(<MemoryRouter><DxProvider>{el}</DxProvider></MemoryRouter>);

describe("the one dropdown (Building it, 1)", () => {
  function Pick() { const [v, set] = useState<"a" | "b" | "c">("a"); return <><Dd k="Sort" value={v} onChange={set} options={[{ v: "a", label: "Alpha" }, { v: "b", label: "Beta" }, { v: "c", label: "Gamma" }]} /><output>{v}</output></>; }
  it("is a listbox button; Enter opens it, the arrows, Home and End move, Enter picks, focus returns to the button", () => {
    wrap(<Pick />);
    const b = screen.getByRole("button", { name: "Sort: Alpha" });
    expect(b.getAttribute("aria-haspopup")).toBe("listbox");
    fireEvent.click(b);
    const list = screen.getByRole("listbox");
    expect(document.activeElement?.textContent).toBe("Alpha");   // the chosen option has focus
    fireEvent.keyDown(list, { key: "ArrowDown" }); expect(document.activeElement?.textContent).toBe("Beta");
    fireEvent.keyDown(list, { key: "End" }); expect(document.activeElement?.textContent).toBe("Gamma");
    fireEvent.keyDown(list, { key: "Home" }); expect(document.activeElement?.textContent).toBe("Alpha");
    fireEvent.keyDown(list, { key: "ArrowUp" }); expect(document.activeElement?.textContent).toBe("Gamma");   // wraps
    fireEvent.keyDown(list, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByText("c", { selector: "output" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sort: Gamma" }));
  });
  it("Escape closes it without a change and returns focus; a press outside closes it", () => {
    wrap(<Pick />);
    fireEvent.click(screen.getByRole("button", { name: "Sort: Alpha" }));
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Sort: Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Sort: Alpha" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
  it("one choice, two controls: the wide-screen buttons and the phone dropdown read and write the same state (Building it, 2)", () => {
    function Two() { const [v, set] = useState<"x" | "y">("x"); return <SegDd k="Show" label="Which" value={v} onChange={set} options={[{ v: "x", label: "Ex" }, { v: "y", label: "Why" }]} />; }
    wrap(<Two />);
    fireEvent.click(screen.getByRole("button", { name: "Why" }));
    expect(screen.getByRole("button", { name: "Which: Why" })).toBeTruthy();   // the dropdown follows the buttons
    fireEvent.click(screen.getByRole("button", { name: "Which: Why" }));
    fireEvent.click(screen.getByRole("option", { name: "Ex" }));
    expect(screen.getByRole("button", { name: "Ex" }).getAttribute("aria-pressed")).toBe("true");   // and the buttons follow the dropdown
  });
});

describe("the expanded view (point 15)", () => {
  function List() { const items = Array.from({ length: 9 }, (_, i) => `row ${i + 1}`); const m = useShowMore(items, 3); return <><ul>{m.visible.map((x) => <li key={x}>{x}</li>)}</ul><ShowMoreButton more={m} noun="row" /></>; }
  it("every card has an expand button; it opens the card as a dialog with Close, focus on Close, and folded lists open", () => {
    wrap(<Card id="flows" title="FII / DII flows"><List /></Card>);
    expect(screen.getAllByRole("listitem").length).toBe(3);
    fireEvent.click(screen.getByRole("button", { name: "Expand: FII / DII flows" }));
    const dlg = screen.getByRole("dialog");
    expect(dlg.className).toContain("dx-xp");
    expect(within(dlg).getByText(/Expanded view · FII \/ DII flows/)).toBeTruthy();
    expect(document.activeElement).toBe(within(dlg).getByRole("button", { name: /Close/ }));
    expect(screen.getAllByRole("listitem").length).toBe(9);   // "Show … more" is open in the expanded view
    expect(document.querySelector(".dx-hold")).toBeTruthy();   // a box of the card's height keeps its place
    expect(document.body.style.overflow).toBe("hidden");
  });
  it("Escape closes an open dropdown first, then the expanded view; focus returns to the expand button", async () => {
    function In() { const [v, set] = useState("a"); return <Card id="market" title="Market today" right={<Dd k="Chart" value={v} onChange={set} options={[{ v: "a", label: "Nifty 50" }, { v: "b", label: "Sensex" }]} />}><p>chart</p></Card>; }
    wrap(<In />);
    const ex = screen.getByRole("button", { name: "Expand: Market today" });
    fireEvent.click(ex);
    fireEvent.click(screen.getByRole("button", { name: "Chart: Nifty 50" }));
    fireEvent.keyDown(screen.getByRole("listbox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("dialog")).toBeTruthy();   // still open
    await act(async () => { fireEvent.keyDown(document, { key: "Escape" }); await new Promise((r) => requestAnimationFrame(() => r(null))); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Expand: Market today" }));
  });
  it("a choice made in the expanded view is still chosen on the page after closing (nothing is copied)", () => {
    function In() { const [v, set] = useState("6M"); return <Card id="market" title="Market today"><Dd k="Period" value={v} onChange={set} options={["1M", "6M", "1Y"].map((x) => ({ v: x, label: x }))} /></Card>; }
    wrap(<In />);
    fireEvent.click(screen.getByRole("button", { name: "Expand: Market today" }));
    fireEvent.click(screen.getByRole("button", { name: "Period: 6M" }));
    fireEvent.click(screen.getByRole("option", { name: "1Y" }));
    fireEvent.click(screen.getByRole("button", { name: /Close/ }));
    expect(screen.getByRole("button", { name: "Period: 1Y" })).toBeTruthy();
  });
  it("a press outside the panel closes it", () => {
    wrap(<Card id="flows" title="FII / DII flows"><p>x</p></Card>);
    fireEvent.click(screen.getByRole("button", { name: "Expand: FII / DII flows" }));
    fireEvent.click(document.querySelector(".dx-x")!);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("one card for the three portfolios (point 5)", () => {
  it("shows the chosen pane, the others hidden; each pane carries its heading for the expanded view", () => {
    wrap(<Card id="glance" title="Your portfolios at a glance"><PaneCtx.Provider value={{ active: "mfglance", label: (id) => id === "mfglance" ? "Mutual funds (3 funds)" : "Equity (14 shares)" }}>
      <Card id="portfolio" title="Your equity at a glance"><p>equity body</p></Card><Card id="mfglance" title="Your mutual funds at a glance"><p>funds body</p></Card></PaneCtx.Provider></Card>);
    const panes = document.querySelectorAll<HTMLElement>("[data-pane='glance']");
    expect(panes.length).toBe(2);
    expect(panes[0].hidden).toBe(true); expect(panes[1].hidden).toBe(false);
    expect(panes[1].dataset.label).toBe("Mutual funds (3 funds)");
    expect(screen.getAllByRole("button", { name: /^Expand:/ }).length).toBe(1);   // the panes have no tools of their own
  });
});

describe("the page's cells (points 5, 6, 10, 12)", () => {
  const blk = (id: string, size: WidgetPref["size"] = "half"): WidgetPref => ({ id, on: true, size });
  it("merges the three glance cards and the three watchlist cards into one full cell each", () => {
    expect(cellsOf([blk("mystocks", "full"), blk("portfolio"), blk("mfglance"), blk("etfglance", "full")]).map((c) => c.key)).toEqual(["mystocks", "glance"]);
    expect(cellsOf([blk("movers"), blk("second"), blk("buckets", "full")])).toEqual([{ key: "watch", ids: ["movers", "second", "buckets"], size: "full" }]);
  });
  it("stacks Results today and IPOs in one half cell beside Filings; the quarter table is full width", () => {
    const c = cellsOf([blk("resultstoday"), blk("filings"), blk("results", "full"), blk("ipos", "full")]);
    expect(c.map((x) => [x.key, x.size])).toEqual([["stack", "half"], ["filings", "half"], ["results", "full"]]);
    expect(c[0].ids).toEqual(["resultstoday", "ipos"]);
  });
  it("puts FII / DII flows and Global markets side by side, half each; alone, either is full width", () => {
    expect(cellsOf([blk("globalmarkets", "full"), blk("marketread", "full"), blk("flows", "full")]).map((x) => [x.key, x.size])).toEqual([["flows", "half"], ["globalmarkets", "half"], ["marketread", "full"]]);
    expect(cellsOf([blk("flows", "full")]).map((x) => x.size)).toEqual(["full"]);
  });
});

describe("the section bar is a filter (point 3); headings are sections, not steps", () => {
  it("All sections or one section alone, kept on the account; a Section dropdown for the phone", () => {
    wrap(<SectionFilter sections={[{ id: "money", title: "Your money" }, { id: "market", title: "The market" }]} />);
    expect(screen.getByRole("button", { name: "All sections" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "The market" }));
    expect(prefs.get().dashUi.sec).toBe("market");
    expect(screen.getByRole("button", { name: "Section: The market" })).toBeTruthy();
  });
  it("a section heading has no number and no 'Step n:'", () => {
    wrap(<SectionHead id="dsh-s-market" title="The market" line="Prices first." />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("The market");
    expect(document.body.textContent).not.toMatch(/Step \d/);
  });
  it("the watchlist section says what it lists: the stocks you follow", () => {
    expect(DASH_STEPS.find((s) => s.id === "watch")!.line).toBe("The stocks you follow.");
  });
});

describe("Your investments: Sort (point 4)", () => {
  const rows = [{ name: "B", day: -6 }, { name: "a", day: 2 }, { name: "C", day: null }, { name: "D", day: 4 }];
  it("biggest move, biggest gain, biggest fall, A to Z; a row without the figure goes last", () => {
    expect(sortInv(rows, "move").map((r) => r.name)).toEqual(["B", "D", "a", "C"]);
    expect(sortInv(rows, "gain").map((r) => r.name)).toEqual(["D", "a", "B", "C"]);
    expect(sortInv(rows, "fall").map((r) => r.name)).toEqual(["B", "a", "D", "C"]);
    expect(sortInv(rows, "az").map((r) => r.name)).toEqual(["a", "B", "C", "D"]);
    expect(sortInv(rows, "reading", (r) => (r.name === "C" ? 80 : r.name === "a" ? 55 : null)).map((r) => r.name)).toEqual(["C", "a", "B", "D"]);
  });
});

describe("Watchlist today: the band bar (point 6, and the Healthy colour)", () => {
  const row = (symbol: string, prism_final: number) => ({ symbol, name: symbol, prism_final } as unknown as Row);
  it("draws four count boxes, Strong 1, Healthy 2, Average 1, Weak 1, and Healthy is the pill's green, not --v-healthy", () => {
    wrap(<WatchBand items={[row("A", 85), row("B", 70), row("C", 66), row("D", 55), row("E", 30)]} />);
    const boxes = [...document.querySelectorAll(".bandk li > b")].map((b) => b.textContent);
    expect(boxes.length).toBe(4);
    expect(boxes).toEqual(["1", "2", "1", "1"]);
    expect(BAND_COLOUR.healthy).toBe("var(--dx-healthy)");
    expect(BAND_COLOUR.healthy).not.toContain("--v-healthy");
  });
});

describe("the account keeps the dashboard's choices (Building it, 3)", () => {
  it("normalises what it reads: unknown values fall back, hidden ids are checked and capped", () => {
    const u = normaliseDashUi({ sec: "nope" as never, glance: "mf", region: "asia", invSort: "az", who: "mine", hidden: ["flows", "flows", "BAD id", 3 as never, ...Array.from({ length: 40 }, (_, i) => `c${i}`)] });
    expect(u.sec).toBe("all"); expect(u.glance).toBe("mf"); expect(u.region).toBe("asia"); expect(u.invSort).toBe("az"); expect(u.who).toBe("mine");
    expect(u.hidden[0]).toBe("flows"); expect(u.hidden).not.toContain("BAD id"); expect(u.hidden.length).toBe(30);
  });
});
