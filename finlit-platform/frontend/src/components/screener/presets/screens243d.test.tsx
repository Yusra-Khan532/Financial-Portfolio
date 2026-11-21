// @vitest-environment jsdom
// Task #243 round 3b (screeners pack v4, sections 2 to 4): the Sectors tab (Advanced only) with its intro and i, the Sector reading columns behind their switch,
// "Industry ahead and gaining" and "Peer leaders only" in More filters, and the industry board (its counts add up to the list; a chip narrows it).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { FilterChips, FilterMenus, IndustryBoard } from "./ScreenParts";
import { COLS_DEFAULT, shownColumns } from "./ScreenView";
import { ScreensStrip } from "./ScreensStrip";
import { INFO, INFO_BAND_SECTOR, INFO_BOARD } from "./PsxInfo";
import { NO_BAR, barCount, barParams, type BarFilter, type BoardChip, type PresetColumn, type PresetDetail, type PresetGroup } from "../../../lib/presets";

vi.mock("../../../lib/ui", () => ({ useUI: () => ({ upgrade: vi.fn(), has: () => true, toast: vi.fn() }) }));
afterEach(cleanup);

const BOARD: BoardChip[] = [
  { slug: "banks", name: "Banks", n: 3, corner: "ahead_gaining", rotation: "Ahead and gaining", pulse: "Rising together", pulseCode: "confirmed" },
  { slug: "power", name: "Power", n: 2, corner: "behind_gaining", rotation: "Behind but gaining", pulse: "Sold off", pulseCode: "washout" },
  { slug: null, name: "No sector reading", n: 1, corner: null, rotation: null, pulse: null, pulseCode: null },
];
const D = { facets: { sizes: {}, sectors: [], strong: 0, strongOnly: 0, anyRating: 6, new: 0, ahead: 0, nse: 6, bse: 0, fno: 2, liquid: 4, sag: 3, plead: 4 } } as unknown as PresetDetail;

describe("More filters: Industry ahead and gaining, Peer leaders only (Advanced only)", () => {
  function F() {
    const [b, setB] = useState<BarFilter>(NO_BAR);
    return <MemoryRouter><FilterMenus d={D} f={{ bar: b, set: setB }} onAddRule={() => {}} /><FilterChips f={{ bar: b, set: setB }} /><output data-testid="p">{barParams(b).join("&")}</output></MemoryRouter>;
  }
  it("both sit after Liquid only with their counts; each shows as a chip and goes in the address", () => {
    render(<F />);
    fireEvent.click(screen.getByRole("button", { name: /More filters/ }));
    const names = screen.getAllByRole("checkbox").map((c) => c.closest("label")!.querySelector("b")!.textContent);
    expect(names.slice(2, 6)).toEqual(["F&O stocks only", "Liquid only", "Industry ahead and gaining", "Peer leaders only"]);
    expect(screen.getByRole("checkbox", { name: /Industry ahead and gaining/ }).closest("label")!.textContent).toContain("3");
    fireEvent.click(screen.getByRole("checkbox", { name: /Industry ahead and gaining/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Peer leaders only/ }));
    const chips = screen.getByRole("group", { name: "Filters on" });
    expect(within(chips).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Remove Industry ahead and gaining", "Remove Peer leaders only", null]);
    expect(screen.getByTestId("p").textContent).toBe("sag=1&plead=1");
    fireEvent.click(within(chips).getByRole("button", { name: "Remove Peer leaders only" }));
    expect(screen.getByTestId("p").textContent).toBe("sag=1");
  });
});

describe("The industry board", () => {
  function B() {
    const [b, setB] = useState<BarFilter>(NO_BAR);
    return <><IndustryBoard board={BOARD} on={b.ind?.slug ?? null} onPick={(c) => setB({ ...b, ind: !c.slug || b.ind?.slug === c.slug ? null : { slug: c.slug, name: c.name } })} />
      <FilterChips f={{ bar: b, set: setB }} /><output data-testid="p">{barParams(b).join("&")}</output><output data-testid="n">{barCount(b)}</output></>;
  }
  it("one chip per industry with its count, corner and Pulse state; the counts add up to the list; an i explains it", () => {
    render(<B />);
    const g = screen.getByRole("group", { name: "Industries on this list: 3, 6 companies" });
    expect(g.querySelector(".psx3-bh")!.textContent).toContain("3 · 6 companies");
    const chips = within(g).getAllByRole("button").filter((b) => b.classList.contains("psx3-ind"));
    expect(chips.map((c) => c.textContent)).toEqual(["Banks3Ahead and gainingRising together", "Power2Behind but gainingSold off", "No sector reading1"]);
    expect((chips[2] as HTMLButtonElement).disabled).toBe(true);
    expect(within(g).getByRole("button", { name: "About the industry board" })).toBeTruthy();
    expect(INFO_BOARD).toMatch(/Ahead and gaining.*Behind and slipping.*Sold off.*Bouncing back.*Bouncing back after a crash.*Rising together.*Losing steam/);
  });
  it("picking a chip narrows the list and shows a filter chip; picking it again or Clear all removes it", () => {
    render(<B />);
    fireEvent.click(screen.getByRole("button", { name: /^Power/ }));
    expect(screen.getByRole("button", { name: /^Power/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("p").textContent).toBe("ind=power");
    expect(screen.getByRole("group", { name: "Filters on" }).textContent).toContain("Industry: Power");
    fireEvent.click(screen.getByRole("button", { name: /^Power/ }));
    expect(screen.getByTestId("p").textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: /^Banks/ }));
    fireEvent.click(within(screen.getByRole("group", { name: "Filters on" })).getByRole("button", { name: "Clear all" }));
    expect(screen.getByTestId("n").textContent).toBe("0");
  });
});

describe("Sector reading columns", () => {
  const C = (key: string, band: string, format = "text"): PresetColumn => ({ key, label: key, format: format as PresetColumn["format"], band });
  const cols = [C("price", "Price & size", "num2"), C("prism_final", "FinLit Prism", "score"), C("sr_industry", "Sector reading"), C("sr_rotation", "Sector reading"),
    C("sr_pulse", "Sector reading"), C("sr_peer", "Sector reading"), C("sr_tailwinds", "Sector reading"), C("momentum", "This screen", "num1")];
  it("off by default; Columns → Sector reading adds the five; each has an i; Tailwinds' i says it counts facts", () => {
    expect(shownColumns(cols, COLS_DEFAULT, false).map((c) => c.key)).toEqual(["price", "prism_final", "momentum"]);
    expect(shownColumns(cols, { ...COLS_DEFAULT, sector: true }, false).map((c) => c.key)).toEqual(["price", "prism_final", "sr_industry", "sr_rotation", "sr_pulse", "sr_peer", "sr_tailwinds", "momentum"]);
    for (const k of ["sr_industry", "sr_rotation", "sr_pulse", "sr_peer", "sr_tailwinds", "sr_flag", "sr_q6m_name", "sr_rank_4w", "sr_setups"]) expect(INFO[k], k).toBeTruthy();
    expect(INFO.sr_tailwinds).toMatch(/counts facts; it is not a score and not a view/);
    expect(INFO_BAND_SECTOR).toMatch(/weekly sector run/);
  });
  it("the band heading is blue (both themes) and names its date; no advice in any of the new words", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles/screens243.css"), "utf8");
    expect(css).toMatch(/\.psx3-g-sector \{ color: #1F5FA8;/);
    expect(css).toMatch(/:root\[data-theme="dark"\] \.psx3-g-sector/);
    const view = readFileSync(resolve(process.cwd(), "src/components/screener/presets/ScreenView.tsx"), "utf8");
    expect(view).toContain('case "sector": return sectorDay ? `Sector reading · ${sectorDay}` : "Sector reading";');
    const words = [INFO_BAND_SECTOR, INFO_BOARD, ...["sr_industry", "sr_rotation", "sr_pulse", "sr_peer", "sr_tailwinds", "sr_flag", "sr_setups"].map((k) => INFO[k])].join(" ");
    expect(words).not.toMatch(/\b(buy|sell(?!-off)|hold|avoid|best|target|accumulate|reduce|top pick)\b/i);   // "a sell-off" (the pack Pulse words, task 258) describes a fall, not advice
  });
});

describe("The Sectors tab", () => {
  const P = (id: string, name: string) => ({ id, name, group: "sectors", cardText: "", count: 4, status: "live", chips: [], howItWorks: [], locked: false, tab: "advanced" as const });
  const SECTORS: PresetGroup = { id: "sectors", name: "Sectors", featured: true, isNew: true, intro: "Screens that read each company's industry.",
    about: { shows: "Sector Rotation places each industry against the average industry.", use: ["One", "Two", "Three"] }, presets: [P("sector-leaders-leading", "Leaders in leading sectors")] as never };
  const TOP: PresetGroup = { id: "top-rated", name: "Top rated", featured: true, presets: [P("highest-rated-large", "Highest-rated large caps")] as never };
  const route = (groups: PresetGroup[]) => ({ id: null, tab: "advanced", groups, list: { data: { asOf: "2026-11-19" }, isError: false, isLoading: false }, choose: vi.fn() }) as never;
  it("is the fifth featured tab, crowned and marked New; its intro shows over its cards with an i", () => {
    render(<ScreensStrip route={route([TOP, SECTORS])} />);
    const tab = screen.getByRole("tab", { name: /Sectors/ });
    expect(tab.className).toContain("is-feat");
    expect(tab.querySelector(".rms-newtab")!.textContent).toBe("New");
    expect(tab.querySelector(".rms-shine, svg")).toBeTruthy();
    fireEvent.click(tab);
    expect(document.querySelector(".rms-intro")!.textContent).toContain("Screens that read each company's industry.");
    fireEvent.click(screen.getByRole("button", { name: "About Sectors" }));
    expect(screen.getByRole("note").textContent).toContain("What it shows");
    fireEvent.click(screen.getByRole("tab", { name: /Top rated/ }));
    expect(document.querySelector(".rms-intro")).toBeNull();
  });
});
