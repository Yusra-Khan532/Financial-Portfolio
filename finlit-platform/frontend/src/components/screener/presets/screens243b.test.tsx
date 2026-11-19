// @vitest-environment jsdom
// Task #243 (screeners update pack v4, 18 Nov 2026), round 2: the open screen's parts (P3 date bar, P4 filters, P5 columns, P6 selection bar, P8 Left the
// list, P10 Expand table). The whole view is covered in Presets.test.tsx.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { DateBar, ExpandLayer, FilterChips, FilterMenus, LeftDrop, SelectionBar, statusLine } from "./ScreenParts";
import { COLS_DEFAULT, TechPill, emptyColumns, shownColumns } from "./ScreenView";
import { NO_BAR, type BarFilter, type HistorySession, type PresetColumn, type PresetDetail } from "../../../lib/presets";

afterEach(cleanup);
const SESSIONS: HistorySession[] = [
  { date: "2026-11-17", count: 145, joined: 9, left: 14, prev: "2026-11-16", rulesUpdated: false, status: "latest", saved: true },
  { date: "2026-11-16", count: 150, joined: 7, left: 12, prev: "2026-11-13", rulesUpdated: false, status: "saved", saved: true },
  { date: "2026-11-13", count: 155, joined: 50, left: 3, prev: "2026-11-11", rulesUpdated: true, status: "rules", saved: true },
  { date: "2026-11-12", count: null, rulesUpdated: false, status: "not_saved", saved: false },
  { date: "2026-11-11", count: 108, joined: null, left: null, prev: null, rulesUpdated: false, status: "first", saved: true },
];
const LIST16 = { date: "2026-11-16", latest: "2026-11-17", count: 150, joined: 7, left: 12, prev: "2026-11-13", first: "2026-11-11", rulesUpdated: false };

describe("P3: List as on", () => {
  function Bar() { const [a, setA] = useState<string | null>(null); return <DateBar sessions={SESSIONS} asOn={a} setAsOn={setA} list={a ? LIST16 : { ...LIST16, date: "2026-11-17", count: 145, joined: 9, left: 14, prev: "2026-11-16" }} />; }
  it("lists every saved list with its count and status, 12 Nov greyed as not saved, 13 Nov 'Rules updated this day'", () => {
    render(<Bar />);
    fireEvent.click(screen.getByRole("button", { name: /Latest · 17 Nov/ }));
    const opts = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(opts.map((o) => o.textContent)).toEqual(["Latest · 17 Nov145Latest list · built after the 17 Nov close", "16 Nov150Saved after the 16 Nov close",
      "13 Nov155Rules updated this day", "12 Nov−Not saved", "11 Nov108First saved list"]);
    expect(opts[3].getAttribute("aria-disabled")).toBe("true");
    expect(statusLine(SESSIONS[0])).toBe("Latest list · built after the 17 Nov close");
  });
  it("↓ skips the day not saved, Enter picks; a past date gives the gold pill, the day's figures and Back to the latest list; Esc closes", () => {
    render(<Bar />);
    expect(document.querySelector(".psx3-pill")!.textContent).toBe("Latest list · after the 17 Nov close");
    expect(document.querySelector(".psx3-figs")!.textContent).toBe("145 companies · +9 joined · 14 left since 16 Nov");
    fireEvent.click(screen.getByRole("button", { name: /Latest · 17 Nov/ }));
    const box = screen.getByRole("listbox");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(document.querySelector(".psx3-date")!.className).toContain("is-past");
    expect(document.querySelector(".psx3-pill")!.textContent).toBe("Past list · as it stood after the 16 Nov close");
    expect(document.querySelector(".psx3-figs")!.textContent).toBe("150 companies · +7 joined · 12 left since 13 Nov");
    fireEvent.click(screen.getByRole("button", { name: /16 Nov/ }));
    const b2 = screen.getByRole("listbox");
    fireEvent.keyDown(b2, { key: "ArrowDown" }); fireEvent.keyDown(b2, { key: "ArrowDown" });    // 13 Nov, then past 12 Nov (not saved) to 11 Nov
    expect(b2.querySelector(".is-act")!.textContent).toMatch(/^11 Nov/);
    fireEvent.keyDown(b2, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back to the latest list" }));
    expect(document.querySelector(".psx3-pill")!.textContent).toBe("Latest list · after the 17 Nov close");
  });
});

describe("P4: filters", () => {
  const D = { facets: { sizes: { Large: 40, Mid: 60, Small: 45 }, sectors: [["Banks", 20], ["IT", 12]], strong: 49, strongOnly: 20, anyRating: 145, new: 9, ahead: 70, nse: 140, bse: 5 } } as unknown as PresetDetail;
  function F({ basic = false }: { basic?: boolean }) { const [b, setB] = useState<BarFilter>(NO_BAR); return <MemoryRouter><FilterMenus d={D} f={{ bar: b, set: setB }} basic={basic} onAddRule={() => {}} /><FilterChips f={{ bar: b, set: setB }} basic={basic} /></MemoryRouter>; }
  it("Market cap ▾ · Sector ▾ · Prism rating ▾ · More filters ▾, each option with its count; ticking keeps it open and the label says what is on", () => {
    render(<F />);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Market cap ▾", "Sector ▾", "Prism rating ▾", "More filters ▾"]);
    fireEvent.click(screen.getByRole("button", { name: /Market cap/ }));
    expect(screen.getAllByRole("checkbox").map((c) => c.closest("label")!.textContent)).toEqual(["Large cap40", "Mid cap60", "Small cap45"]);
    fireEvent.click(screen.getByRole("checkbox", { name: /Small cap/ }));
    expect(screen.getByRole("checkbox", { name: /Small cap/ })).toBeTruthy();            // still open
    expect(screen.getByRole("button", { name: /Market cap · Small/ }).className).toContain("is-on");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /More filters/ }));
    expect(screen.getAllByRole("checkbox").map((c) => c.closest("label")!.querySelector("b")!.textContent)).toEqual(["New on this list", "Ahead of NIFTY 500 since added", "F&O stocks only", "Liquid only",
      "Industry ahead and gaining", "Peer leaders only", "NSE-listed only"]);   // round 3a (pack v4) adds F&O and Liquid; round 3b the two sector filters (Advanced)
    expect(screen.getByRole("button", { name: "+ Add a rule on any figure" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: /New on this list/ }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: /Prism rating/ }));
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")!.textContent)).toEqual(["Any rating145", "Strong or Healthy49", "Strong only20"]);
  });
  it("the filters that are on show as chips with × and Clear all; Basic has no 'Strong only' and calls it IQ rating", () => {
    render(<F />);
    fireEvent.click(screen.getByRole("button", { name: /Sector/ }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Find a sector" }), { target: { value: "ban" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    fireEvent.click(screen.getByRole("checkbox", { name: /Banks/ }));
    const chips = screen.getByRole("group", { name: "Filters on" });
    expect(chips.textContent).toContain("Banks");
    fireEvent.click(within(chips).getByRole("button", { name: "Clear all" }));
    expect(screen.queryByRole("group", { name: "Filters on" })).toBeNull();
    cleanup();
    render(<F basic />);
    fireEvent.click(screen.getByRole("button", { name: /IQ rating/ }));
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });
});

describe("P5: columns", () => {
  const C = (key: string, band: string, format = "score"): PresetColumn => ({ key, label: key, format: format as PresetColumn["format"], band });
  const cols = [C("price", "Price & size", "num2"), C("market_cap", "Price & size", "cr"), C("prism_final", "FinLit Prism"), C("prism_quality", "FinLit Prism"), C("prism_st_score", "Technical views"),
    C("ret_3m", "Returns", "pct"), C("added_on", "On this list", "date"), C("since_added_pct", "On this list", "since"), C("since_then_pct", "After this list", "since"), C("momentum", "This screen", "num1")];
  it("the Columns switches: Market cap, the pillars and Returns; a past date can add Latest price after Since then; nothing else is ever dropped", () => {
    expect(shownColumns(cols, COLS_DEFAULT, true).map((c) => c.key)).toEqual(["price", "market_cap", "prism_final", "prism_quality", "prism_st_score", "added_on", "since_added_pct", "since_then_pct", "momentum"]);
    expect(shownColumns(cols, { ...COLS_DEFAULT, cap: false, fund: false, tech: false, returns: true, latest: true }, true).map((c) => c.key))
      .toEqual(["price", "prism_final", "ret_3m", "added_on", "since_added_pct", "since_then_pct", "price_latest", "momentum"]);
  });
  it("a column with no figure on the date is named (NOT SAVED), never dropped; the dates' own columns never count", () => {
    expect(emptyColumns(cols, [{ symbol: "A", price: 10, prism_quality: null, since_then_pct: null }, { symbol: "B", price: 11 }] as never))
      .toEqual(["market_cap", "prism_final", "prism_quality", "prism_st_score", "ret_3m", "momentum"]);
  });
  it("a technical pillar is ▲ ► ▼ with its number and the site's word", () => {
    const { container } = render(<><TechPill v={38} /><TechPill v={-2} /><TechPill v={-62} /></>);
    expect([...container.querySelectorAll(".psx3-tp")].map((t) => t.textContent)).toEqual(["▲ +38Uptrend", "► −2Sideways", "▼ −62Strong downtrend"]);
  });
});

describe("P6, P8, P10", () => {
  it("the selection bar shows only with a selection; Compare needs 2 to 4", () => {
    const { rerender } = render(<SelectionBar n={0} maxCompare={4} onCompare={() => {}} onWatch={() => {}} onClear={() => {}} />);
    expect(screen.queryByRole("toolbar")).toBeNull();
    rerender(<SelectionBar n={1} maxCompare={4} onCompare={() => {}} onWatch={() => {}} onClear={() => {}} />);
    expect(screen.getByRole("toolbar", { name: "Selected companies" }).textContent).toContain("1 selected");
    expect((screen.getByRole("button", { name: "Compare" }) as HTMLButtonElement).disabled).toBe(true);
    rerender(<SelectionBar n={3} maxCompare={4} onCompare={() => {}} onWatch={() => {}} onClear={() => {}} />);
    expect((screen.getByRole("button", { name: "Compare" }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("Left the list: closed, a summary, On / Up to on the latest, On / Up to / After on a past date, After only on the first list", () => {
    const rows = [{ symbol: "MENONBE", added_on: "2026-11-13", left_on: "2026-11-17", sessions: 2, lists_on: 2, change_pct: -3.148, reason: "Momentum below the cut-off" }];
    const counts = { on: 1, upto: 36, after: 0 };
    const { rerender } = render(<MemoryRouter><LeftDrop rows={rows} counts={counts} asOn={null} latest="2026-11-17" first="2026-11-11" mode="on" setMode={() => {}} /></MemoryRouter>);
    const det = document.querySelector("details.psx3-left")! as HTMLDetailsElement;
    expect(det.open).toBe(false);
    expect(det.querySelector("summary")!.textContent).toBe("Left the list1 left on 17 Nov · 36 since 11 Nov");
    expect([...det.querySelectorAll(".psx3-seg button")].map((b) => b.textContent)).toEqual(["On 17 Nov 1", "Up to 17 Nov 36"]);
    expect([...det.querySelectorAll("thead th")].map((t) => t.textContent)).toEqual(["Company", "Joined", "Left", "Lists it was on", "From joining to leaving", "Why it left"]);
    expect(det.querySelector("tbody tr")!.textContent).toBe("MENONBE13 Nov17 Nov2−3.1%Momentum below the cut-off");
    rerender(<MemoryRouter><LeftDrop rows={[]} counts={{ on: 12, upto: 22, after: 14 }} asOn="2026-11-16" latest="2026-11-17" first="2026-11-11" mode="on" setMode={() => {}} /></MemoryRouter>);
    expect(document.querySelector("details.psx3-left summary")!.textContent).toBe("Left the list12 left on 16 Nov · 22 since 11 Nov · 14 of its companies left after 16 Nov");
    expect([...document.querySelectorAll(".psx3-seg button")].map((b) => b.textContent)).toEqual(["On 16 Nov 12", "Up to 16 Nov 22", "After 16 Nov 14"]);
    rerender(<MemoryRouter><LeftDrop rows={[]} counts={{ on: 0, upto: 0, after: 42 }} asOn="2026-11-11" latest="2026-11-17" first="2026-11-11" mode="on" setMode={() => {}} /></MemoryRouter>);
    expect([...document.querySelectorAll(".psx3-seg button")].map((b) => b.textContent)).toEqual(["After 11 Nov 42"]);
  });
  it("Expand table fills the window as a dialog with the crown, name and line; Esc closes it and the page scrolls again", () => {
    const close = vi.fn();
    render(<ExpandLayer title="Momentum leaders" crown line="Latest · 17 Nov · 145 companies · every column" onClose={close}><table><tbody><tr><td>x</td></tr></tbody></table></ExpandLayer>);
    const dlg = screen.getByRole("dialog", { name: "Momentum leaders: full table" });
    expect(dlg.querySelector(".rms-shine")).toBeTruthy();
    expect(dlg.textContent).toContain("Latest · 17 Nov · 145 companies · every column");
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).toHaveBeenCalled();
    cleanup();
    expect(document.body.style.overflow).toBe("");
  });
  it("sticky heading rows at 0, 30 and 52 px; the Company column stays in view; no advice in the parts", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/screens243.css"), "utf8");
    expect(css).toMatch(/tr\.psx3-g th \{ top: 0;/); expect(css).toMatch(/tr\.psx3-k th \{ top: 30px;/); expect(css).toMatch(/tr\.psx3-c th \{ top: 52px; \}/);
    expect(css).toMatch(/\.psx3-t \.psx3-stk \{ position: sticky; left: 0;/);
    for (const f of ["ScreenParts.tsx", "ScreenView.tsx"]) {
      const src = readFileSync(resolve(process.cwd(), "src/components/screener/presets/" + f), "utf8").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
      expect(src, f).not.toMatch(/\b(buy|sell|best|top picks?|target price)\b/i);
    }
  });
});
