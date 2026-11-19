// @vitest-environment jsdom
// Task #243 (screeners update pack v4, 18 Nov 2026), round A: the site's page header on the three screeners (H), the Stock screener's three-tab left panel (S)
// and its results table's named column groups (T1). The pages' own behaviour is covered in ScreenerPro, ScoreScreener and AdvancedScoreScreener tests.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const gold = vi.hoisted(() => ({ on: false }));
vi.mock("../../lib/planGate", () => ({ useIsGold: () => gold.on }));
import { ScreenerHead, whichAnchor } from "./ScreenerHead";
import { PanelTabs, ReadyOn, type PanelTab } from "./ReadyScreens";
import { bandsOf } from "../../pages/ScreenerPro";
import { useState } from "react";

afterEach(() => { cleanup(); gold.on = false; });
const at = (path: string, node: React.ReactNode) => render(<MemoryRouter initialEntries={[path]}>{node}</MemoryRouter>);

describe("H: the page header", () => {
  it("eyebrow, title with its pill, description, four plain boxes with the current page filled, date chip, How it works and Which screener", () => {
    const open = vi.fn();
    at("/advanced-score-screener", <ScreenerHead title="Advanced stock screener" tier="gold" desc="The advanced model." date="Prism: 18 Nov 2026" how={{ label: "How FinLit Prism works", open }} />);
    const head = screen.getByRole("banner");
    expect(head.className).toContain("sp-head");
    expect(head.querySelector(".sp-eyebrow")!.textContent).toBe("Research · Find stocks");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Advanced stock screener");
    expect(head.querySelector(".tier")!.textContent).toMatch(/gold/i);
    expect(head.querySelector(".sp-desc")!.textContent).toBe("The advanced model.");
    const boxes = screen.getByRole("navigation", { name: "Screeners" });
    const links = within(boxes).getAllByRole("link");
    expect(links.map((a) => a.textContent)).toEqual(["Stock screener", "Basic stock screener", "Advanced stock screener", "Query builder"]);   // no tier tags, no icons
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, null, "page", null]);
    expect(boxes.querySelector("svg, .tier, i")).toBeNull();
    expect(head.querySelector(".xsh-date")!.textContent).toBe("Prism: 18 Nov 2026");
    fireEvent.click(screen.getByRole("button", { name: "How FinLit Prism works →" }));
    expect(open).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Which screener should I use? →" }).getAttribute("href")).toBe("/advanced-score-screener#" + whichAnchor("/advanced-score-screener"));
  });
  it("a Gold member is not offered the Basic stock screener (task #100): three boxes", () => {
    gold.on = true;
    at("/screener", <ScreenerHead title="Stock screener" desc="x" />);
    expect(within(screen.getByRole("navigation", { name: "Screeners" })).getAllByRole("link").map((a) => a.textContent)).toEqual(["Stock screener", "Advanced stock screener", "Query builder"]);
  });
  it("the Stock screener has no tier pill; every page's 'Which screener should I use?' opens a real question", () => {
    at("/screener", <ScreenerHead title="Stock screener" desc="x" />);
    expect(document.querySelector(".tier")).toBeNull();
    for (const p of ["/screener", "/score-screener", "/advanced-score-screener"]) expect(whichAnchor(p), p).toMatch(/^faq-.+-\d+$/);
  });
  it("the boxes sit two by two at 560 px and below; the old tab strip and head cards are gone from the pages", () => {
    const css = readFileSync(resolve(__dirname, "../../styles/screeners243.css"), "utf8");
    expect(css).toMatch(/@media \(max-width: 560px\) \{\s*\.xsh-nav \{ display: grid; grid-template-columns: 1fr 1fr;/);
    expect(css).toMatch(/\.xsh-box \{[^}]*min-height: 36px/);
    for (const f of ["../../pages/ScreenerPro.tsx", "./ScreenerFrame.tsx", "./presets/PresetPage.tsx"]) {
      const src = readFileSync(resolve(__dirname, f), "utf8");
      expect(src, f).not.toMatch(/<FindStocksTabs|ssw-head|className="card sx-head"/);
      expect(src, f).toMatch(/<ScreenerHead/);
    }
  });
});

describe("S: the Stock screener's three tabs", () => {
  function Tabs({ start = "rules" as PanelTab, nOn = 0 }) { const [t, setT] = useState<PanelTab>(start); return <PanelTabs tab={t} setTab={setT} nOn={nOn} nReady={26} />; }
  it("Your rules · Ready-made · ✦ Custom ratio; the arrow keys, Home and End move and select", () => {
    render(<Tabs />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["Your rules", "Ready-made", "✦Custom ratio"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("title")).toBe("26 ready-made screens");
    expect(tabs[2].className).toContain("xsp-t-ratio");
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" }); expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[1], { key: "End" }); expect(screen.getAllByRole("tab")[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[2], { key: "ArrowRight" }); expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");   // wraps
    fireEvent.keyDown(tabs[0], { key: "ArrowLeft" }); expect(screen.getAllByRole("tab")[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[2], { key: "Home" }); expect(screen.getAllByRole("tab")[0].getAttribute("aria-selected")).toBe("true");
  });
  it("the Ready-made tab reads 'N on' in a gold pill while any are on", () => {
    render(<Tabs nOn={2} />);
    expect(screen.getAllByRole("tab")[1].querySelector(".xsp-on")!.textContent).toBe("2 on");
  });
  it("'Ready-made screens on · N' lists each screen with × to turn it off", () => {
    const off = vi.fn();
    render(<ReadyOn screens={[{ id: "a", label: "Low debt" }, { id: "b", label: "Value picks" }]} onOff={off} />);
    expect(screen.getByRole("heading").textContent).toBe("Ready-made screens on · 2");
    fireEvent.click(screen.getByRole("button", { name: "Turn off the Value picks screen" }));
    expect(off).toHaveBeenCalledWith("b");
  });
});

describe("T1: the Stock screener's results table on a grid", () => {
  it("names neighbouring columns as one group: Market cap, the score, the technical pillars", () => {
    expect(bandsOf(["market_cap", "prism_st_score", "prism_lt_score"])).toEqual([{ kind: "size", n: 1 }, { kind: "tech", n: 2 }]);
    expect(bandsOf(["price", "market_cap", "overall", "pe", "roe"])).toEqual([{ kind: "other", n: 1 }, { kind: "size", n: 1 }, { kind: "score", n: 1 }, { kind: "other", n: 2 }]);
  });
  it("fixed widths, right-aligned market caps, one chip width, thin rules between groups, amber middling scores, banded rows", () => {
    const css = readFileSync(resolve(__dirname, "../../styles/screeners243.css"), "utf8");
    expect(css).toMatch(/th\.xst-c-size, \.ssw-t\.scr-t td\.xst-c-size \{ width: 132px; min-width: 132px; text-align: right;/);
    expect(css).toMatch(/th\.xst-c-tech, \.ssw-t\.scr-t td\.xst-c-tech \{ width: 178px; min-width: 178px; text-align: left; \}/);
    expect(css).toMatch(/\.ssw-iq \.ssw-sc \{ display: inline-block; width: 46px;/);
    expect(css).toMatch(/border-left: 1px solid var\(--border\)/);
    expect(css).toMatch(/middling: amber/);
    expect(css).toMatch(/tbody tr:nth-child\(even\) td/);
  });
});
