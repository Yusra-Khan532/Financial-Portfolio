// @vitest-environment jsdom
// Developer file 42, the founder's points of 26 Nov 2026 on the company report:
//  1 "What's going well and what to watch" is too long: each column shows 3 findings and a "Show N more" drop-down.
//  3 DuPont: too much blank space beside "From FY19 to FY26, ROE was broadly stable".
//  5 "Revenue by business segment" revamped: ranked rows in place of the coloured strip and the tiles.
//  27 Nov: "too much empty space" under Market cap and Listed as in the header strip.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FindingsColumn, KF_FIRST } from "./KeyFindings";

afterEach(cleanup);
const read = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const items = (n: number) => Array.from({ length: n }, (_, i) => ({ key: "k" + i, title: "Finding " + (i + 1), text: "Text " + (i + 1), to: "ratios" }));

describe("1 · each findings column shows three, the rest behind a drop-down", () => {
  it("three findings and a \"Show 4 more\" button; pressing it shows all seven, pressing again shows three", () => {
    render(<FindingsColumn kind="w" tag="Watch" icon="info" items={items(7)} empty="Nothing to watch right now." />);
    expect(KF_FIRST).toBe(3);
    expect(screen.getAllByText(/^Finding \d$/)).toHaveLength(3);
    const more = screen.getByRole("button", { name: /Show 4 more/ });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(more);
    expect(screen.getAllByText(/^Finding \d$/)).toHaveLength(7);
    expect(screen.getByRole("button", { name: /Show fewer/ }).getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: /Show fewer/ }));
    expect(screen.getAllByText(/^Finding \d$/)).toHaveLength(3);
  });
  it("a column of three or fewer has no button; the count beside the heading is still the full count", () => {
    const { container } = render(<FindingsColumn kind="s" tag="Strength" icon="check" items={items(3)} empty="-" />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(container.querySelector(".kf-n")?.textContent).toBe("3");
    cleanup();
    const c2 = render(<FindingsColumn kind="f" tag="Red flag" icon="alert" items={items(5)} empty="-" />).container;
    expect(c2.querySelector(".kf-n")?.textContent).toBe("5");
  });
  it("the button looks like the report's other drop-downs and turns its arrow when open", () => {
    const css = read("styles/insights.css");
    expect(css).toMatch(/\.kf-more \{[^}]*width: 100%/);
    expect(css).toContain(".kf-more.open .xdd-chev { transform: rotate(180deg); }");
  });
});

describe("3 · DuPont's summary and notes use the card's width", () => {
  it("the summary line is not held to 68 characters (the .card p rule left the right half of the card empty), and the two notes sit side by side", () => {
    const css = read("styles/dupont.css");
    expect(css).toContain(".card p.dp-sum1 { max-width: none; }");
    expect(css).toMatch(/\.dp-foot2 \{ display: grid; grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 320px\), 1fr\)\)/);
    expect(read("stock/DuPont.tsx")).toContain('<div className="dp-foot2">');
    expect(css).toContain(".card .dp-title p { max-width: none; }");              // the intro line above the figures, the same cause
  });
});

describe("5 · Revenue by business segment: one ranked row a segment", () => {
  const card = read("stock/Sections2.tsx"), css = read("styles/stock2.css");
  it("each row has the segment's colour, its share as a bar out of 100%, its revenue, its growth and its margin; the strip and the tiles are gone", () => {
    expect(card).toContain('<div className="sgr" role="table"');
    expect(card).toContain("Share of all segments' revenue");
    expect(card).not.toContain('className="rib"');
    expect(card).not.toContain('className="seg-l2"');
    expect(css).not.toMatch(/^\.rib |^\.seg-l2 |\.sl-h em/m);                    // the gradient strip, the tiles and their glowing numbers
  });
  it("a phone stacks each row: the name, the bar and its share, then revenue, growth and margin with their words", () => {
    expect(css).toContain('grid-template-areas: "n n n" "s s s" "v g m"');
    expect(css).toContain(".sgr-r.sgr-hd { display: none; }");
  });
});

describe("27 Nov · the header strip has no half-empty cells", () => {
  it("Against peers takes the top row beside the rating; Market cap and Listed as share the row under it (desktop), and stack under the rating on a phone", () => {
    const css = read("styles/report216.css"), hero = read("stock/Hero.tsx");
    expect(css).toContain('grid-template-areas: "rate peer peer" "rate cap list";');
    expect(css).toContain('grid-template-areas: "rate rate" "peer peer" "cap list";');
    expect(hero).toContain('<div className="hx-cap"><span className="hx-k">Market cap</span>');
    expect(hero).toContain('<div className="hx-list"><span className="hx-k">Listed as</span>');
  });
});
