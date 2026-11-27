// @vitest-environment jsdom
// Task #371 (team, 24 Nov 2026): "increase the size of total score and also the pillar : P R C Q and when we hover on P R C Q then we can see the name of
// pillar and their score", in the Mutual funds list and the Mutual Fund Screener (both use ScoreCell).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ScoreCell } from "./ScoreCell";

afterEach(cleanup);
const css = readFileSync(join(process.cwd(), "src/styles/task371.css"), "utf8");
const item = { code: 1, symbol: null, plan: "Direct", group: "EQ", final: 72.4, label: "Healthy", status: "RATED", reason: null, rank: null, rankOf: null,
  flags: [], confidence: null, pillars: { performance: "Strong", risk: "Fair", cost: "Weak", quality: null } } as never;

describe("task #371: a bigger score and parts that name themselves", () => {
  it("each letter carries its part's name and word for hover, focus and screen readers (task #378: no figure sent, so none is shown)", () => {
    render(<ScoreCell locked={false} why="" item={item} />);
    const chips = [...document.querySelectorAll(".mfs-cell .mfs-part")];
    const say = ["Performance · Strong · figure not available", "Risk · Fair · figure not available", "Cost · Weak · figure not available", "Quality · Not scored"];
    expect(chips.map((c) => c.getAttribute("data-tip"))).toEqual(say);
    expect(chips.map((c) => c.getAttribute("aria-label"))).toEqual(say);
    chips.forEach((c) => { expect(c.getAttribute("tabindex")).toBe("0"); expect(c.getAttribute("title")).toBe(""); expect(c.getAttribute("aria-hidden")).toBeNull(); });
  });
  it("never makes up a figure: with no part figures sent, no number is in the tips", () => {
    render(<ScoreCell locked={false} why="" item={item} />);
    document.querySelectorAll(".mfs-part").forEach((c) => expect(c.getAttribute("data-tip")).not.toMatch(/\d/));
  });
  it("is loaded with the cell and makes the score and the letters bigger", () => {
    expect(readFileSync(join(process.cwd(), "src/mf/ScoreCell.tsx"), "utf8")).toContain('import "../styles/task371.css";');
    expect(css).toContain(".mfs-cell .mfs-pv { font-size: var(--fs-20); }");   // task #378: larger again (18 -> 20px)
    expect(css).toContain(":root .mfs-table td.mfs-hs .mfs-pv { font-size: var(--fs-20);");     // the screener's pill was 13px
    expect(css).toMatch(/\.mfs-cell \.mfs-part \{ position: static; width: 22px; height: 22px; font-size: var\(--fs-13\);/);   // were 16px, 12px (task #378: static, the box anchors to the row)
  });
  it("shows the tip on hover and on focus (keyboard, or a tap on a phone)", () => {
    expect(css).toMatch(/\.mfs-tip-below \.mfs-part\[data-tip\]:hover::after, \.mfs-cell \.mfs-tip-below \.mfs-part\[data-tip\]:focus::after \{\s*content: attr\(data-tip\);/);
  });
  it("still locks below Gold: no letters, no words in the page", () => {
    const { container } = render(<ScoreCell locked={true} why="" item={item} />);
    expect(container.querySelector(".mfs-part")).toBeNull();
    expect(container.textContent).not.toMatch(/Strong|Fair|Weak/);
  });
});
