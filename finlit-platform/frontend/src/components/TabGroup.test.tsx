// @vitest-environment jsdom
// Task #216 (company report handover, 17 Nov 2026, README 1.2): the one tab group. Numbered tabs, the chosen one selected; the nudge until the bar is first used;
// "Next view · 1 of 3 …" at the bottom of every panel and "Back to the first view · 3 of 3 … ↺" on the last; a link into a hidden panel opens it; the Key view
// badge sits inside the bar header; a bar that wraps an existing switch has no panels and no Next view.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabGroup } from "./TabGroup";

afterEach(() => { cleanup(); history.replaceState(null, "", "/"); });
const views = [
  { key: "a", label: "Profitability ratios", content: <p>panel A</p> },
  { key: "b", label: "All ratios today", content: <p id="deep-b">panel B</p> },
  { key: "c", label: "Ratio history", content: <p>panel C</p> },
];

describe("TabGroup", () => {
  it("numbers the tabs, selects the first, says how many views, and nudges until first used", () => {
    const { container } = render(<TabGroup label="Ratios" views={views} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["1Profitability ratios", "2All ratios today", "3Ratio history"]);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector(".ctabs-h")!.textContent).toContain("3 views");
    expect(container.querySelector(".ctabs")!.classList.contains("used")).toBe(false);   // the nudge runs
    fireEvent.click(tabs[1]);
    expect(container.querySelector(".ctabs")!.classList.contains("used")).toBe(true);    // and stops for good
    expect(screen.getByText("panel B").closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(false);
    expect(screen.getByText("panel A").closest("[role=tabpanel]")!.hasAttribute("hidden")).toBe(true);
  });
  it("ends every panel with Next view, and the last with Back to the first view", () => {
    render(<TabGroup label="Ratios" views={views} />);
    const next = (t: string) => screen.getByText(t).closest("[role=tabpanel]")!.querySelector(".ct-next") as HTMLButtonElement;
    expect(next("panel A").textContent).toBe("Next view · 1 of 3All ratios today→");
    fireEvent.click(next("panel A"));
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
    expect(next("panel C").textContent).toBe("Back to the first view · 3 of 3Profitability ratios↺");
  });
  it("opens the hidden panel a link points into", () => {
    render(<><a href="#deep-b">jump</a><TabGroup label="Ratios" views={views} /></>);
    fireEvent.click(screen.getByText("jump"));
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
  });
  it("opens the panel an address (#id) points into when the page loads", () => {
    history.replaceState(null, "", "/#deep-b");
    Element.prototype.scrollIntoView = vi.fn();
    render(<TabGroup label="Ratios" views={views} />);
    expect(screen.getAllByRole("tab")[1].getAttribute("aria-selected")).toBe("true");
  });
  it("moves with the arrow keys", () => {
    render(<TabGroup label="Ratios" views={views} />);
    fireEvent.keyDown(screen.getAllByRole("tab")[0], { key: "ArrowLeft" });
    expect(screen.getAllByRole("tab")[2].getAttribute("aria-selected")).toBe("true");
  });
  it("Key view: the badge with the crown sits inside the bar header", () => {
    const { container } = render(<TabGroup label="Ratios" views={views} variant="key" />);
    expect(container.querySelector(".ctabs .ctabs-h .ct-crown")!.textContent).toBe("KEY VIEW");
  });
  it("wrapping an existing switch: no panels, no Next view, the parent decides", () => {
    const pick = vi.fn();
    const { container } = render(<TabGroup label="Statement" value="pl" onChange={pick} numbered views={[{ key: "pl", label: "Profit & loss" }, { key: "bs", label: "Balance sheet" }]} hint="Profit & loss shown here" />);
    expect(container.querySelector(".ct-panels")).toBeNull(); expect(container.querySelector(".ct-next")).toBeNull();
    fireEvent.click(screen.getAllByRole("tab")[1]); expect(pick).toHaveBeenCalledWith("bs");
  });
  it("uses one blue for the chosen tab, no navy and no gold", () => {
    const css = readFileSync(join(__dirname, "../styles/tabgroup.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(css).not.toMatch(/--c1\s*:/);   // the site's own token (#2a78d6 in light), never redefined: the charts use it too
    expect(readFileSync(join(__dirname, "../styles/finlit.css"), "utf8")).toMatch(/--k1: #2a78d6;[\s\S]*--c1: var\(--k1\)/);
    expect(css).toMatch(/\.ct-list button\[aria-selected="true"\] \{ background: var\(--c1\); border-color: var\(--c1\); color: #fff;/);
    expect(css).not.toMatch(/--gold|navy/);
  });
});
