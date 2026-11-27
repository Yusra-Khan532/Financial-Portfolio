// @vitest-environment jsdom
// Task #378, reopened (team, 25 Nov 2026): "still the scores are not seen". Hovering P on a fund in the Mutual funds list showed a box "Performance:
// Weak" that (1) gave only the part's word, not its score, and (2) opened above the letters, over the fund's total score. Each letter now says
// "{Name} {figure} / 100 · {Word}" on hover, focus or tap and to a screen reader, and the box opens below the letters.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { partTip } from "../lib/mfScore";
import { Parts, ScoreCell } from "./ScoreCell";

afterEach(cleanup);
const css = readFileSync(join(process.cwd(), "src/styles/task371.css"), "utf8");
const item = { code: 122639, symbol: null, plan: "Direct", group: "EQ", final: 59.0, label: "Average", status: "RATED", reason: null, rank: null, rankOf: null, flags: [], confidence: null,
  pillars: { performance: "Weak", risk: "Strong", cost: "Fair", quality: "Not scored" },
  pillarScores: { performance: 42, risk: 81.46, cost: 55.5, quality: null } } as never;

describe("task #378 (reopened): each part shows its score and name, below the letters", () => {
  it("the label reads name, figure out of 100 and word", () => {
    expect(partTip("Performance", "Weak", 42)).toBe("Performance 42.0 / 100 · Weak");
    expect(partTip("Risk", "Strong", 81.46)).toBe("Risk 81.5 / 100 · Strong");
    expect(partTip("Quality", "Not scored", null)).toBe("Quality · Not scored");
    expect(partTip("Cost", "Fair", undefined)).toBe("Cost · Fair · figure not available");   // never a made-up figure
    expect(partTip("Cost", null, 12)).toBe("Cost 12.0 / 100 · Weak");                       // the word follows the stored figure when none is sent
  });
  it("every chip in the funds list's score cell carries the same text for hover, focus and screen readers", () => {
    render(<ScoreCell locked={false} why="" item={item} />);
    const chips = [...document.querySelectorAll(".mfs-cell .mfs-parts .mfs-part")];
    const say = ["Performance 42.0 / 100 · Weak", "Risk 81.5 / 100 · Strong", "Cost 55.5 / 100 · Fair", "Quality · Not scored"];
    expect(chips.map((c) => c.textContent)).toEqual(["P", "R", "C", "Q"]);
    // the box shows the same words on two lines (name and word, then the figure), so it never breaks inside "42.0 / 100"
    expect(chips.map((c) => c.getAttribute("data-tip"))).toEqual(["Performance · Weak\n42.0 / 100", "Risk · Strong\n81.5 / 100", "Cost · Fair\n55.5 / 100", "Quality · Not scored"]);
    expect(chips.map((c) => c.getAttribute("aria-label"))).toEqual(say);
    chips.forEach((c) => expect(c.getAttribute("tabindex")).toBe("0"));
    expect(document.querySelector(".mfs-parts")!.getAttribute("aria-label")).toBe(`The four parts. ${say.join("; ")}.`);
    expect(document.querySelector(".mfs-cell .mfs-pv")!.textContent).toBe("59.0");   // the total score is still drawn
  });
  it("the box opens below the letters, never over the total score, and wraps inside a phone screen", () => {
    render(<Parts parts={{ performance: "Weak" }} scores={{ performance: 42 }} />);
    expect(document.querySelector(".mfs-parts")!.classList.contains("mfs-tip-below")).toBe(true);
    const rule = css.slice(css.indexOf(".mfs-cell .mfs-tip-below .mfs-part[data-tip]:hover::after"));
    expect(rule).toMatch(/top: calc\(100% \+ 6px\); bottom: auto;/);
    expect(rule).not.toMatch(/bottom: calc\(100%/);
    expect(rule).toContain("box-sizing: border-box; max-width: min(156px, calc(100vw - 32px)); white-space: pre-line;");
    expect(css).toMatch(/@media \(max-width: 560px\) \{\s*[^}]*\{ max-width: 124px; \}/);   // inside the ~130px score column on a phone
    expect(css).toContain(".mfs-cell .mfs-parts.mfs-tip-below { position: relative; }");
    expect(css).not.toMatch(/bottom: calc\(100% \+ 8px\)/);   // the old box above the letter is gone
  });
  it("keeps the 25 Nov changes: 20px score, letters 8px apart", () => {
    expect(css).toContain(".mfs-cell .mfs-pv { font-size: var(--fs-20); }");
    expect(css).toContain(".mfs-cell .mfs-parts { gap: 8px;");
  });
  it("below Gold: no letters and no figure in the page", () => {
    const { container } = render(<ScoreCell locked={true} why="" item={item} />);
    expect(container.querySelector(".mfs-part")).toBeNull();
    expect(container.textContent).not.toMatch(/\d|Weak|Strong|Fair/);
  });
  it("describes, never advises", () => {
    const words = [partTip("Performance", "Weak", 42), partTip("Cost", "Fair", undefined), readFileSync(join(process.cwd(), "src/mf/ScoreCell.tsx"), "utf8")].join(" ");
    expect(words).not.toMatch(/\b(buy|sell|hold|avoid|accumulate|target|best|top pick)\b/i);
  });
});
