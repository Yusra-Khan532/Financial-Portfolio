// @vitest-environment jsdom
// Task #458 (28 Nov 2026): a range filter whose bars are all 0 (no fund passes the other filters, or none here has the figure) left a blank
// gap where the bars go. It now says why in one line. And with no fund left in the result, the category kept its bare key ("fixed-term").
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RangeFilter } from "./RangeFilter";
import { flowRows } from "./Graphics";
import { NUM_BY } from "../../lib/mfScreenDefs";

afterEach(cleanup);
const edges = [0, 1, 2, 5, 10];
const props = { lo: null, hi: null, nodata: false, onRange: () => {}, onNodata: () => {} };

describe("range filter with nothing to draw (#458)", () => {
  it("says no fund passes the other filters instead of a blank bar area", () => {
    const { container } = render(<RangeFilter def={NUM_BY.worst_m} hist={{ edges, bins: [0, 0, 0, 0], n: 0, m: 0 }} {...props} />);
    expect(screen.getByText(/no fund passes the other filters/i)).toBeTruthy();
    expect(container.querySelector(".mfs-hist")).toBeNull();
    expect(container.querySelector(".mfs-sl")).toBeNull();
    expect(screen.getByLabelText(/minimum/i)).toBeTruthy(); // the typed boxes stay
  });
  it("says no fund here has the figure when funds pass but none has it", () => {
    render(<RangeFilter def={NUM_BY.down_cap} hist={{ edges, bins: [0, 0, 0, 0], n: 0, m: 4583 }} {...props} />);
    expect(screen.getByText(/no fund here has this figure/i)).toBeTruthy();
  });
  it("still draws the bars and the slider when there is something to draw", () => {
    const { container } = render(<RangeFilter def={NUM_BY.ter} hist={{ edges, bins: [4, 3, 2, 1], n: 10, m: 14 }} {...props} />);
    expect(container.querySelectorAll(".mfs-hist i").length).toBe(4);
    expect(container.querySelector(".mfs-sl")).not.toBeNull();
    expect(screen.queryByText(/No bars to draw/)).toBeNull();
  });
});

describe("category names with no fund left in the result (#458)", () => {
  it("a flow sent with its bare key reads as the category's name", () => {
    const rows = flowRows([{ key: "fixed-term", label: "fixed-term", months: ["2026-10"], net: [518] }]);
    expect(rows[0].label).toBe("Fixed Term & Interval");
  });
  it("the no-fund chips use the name and wrap as a spaced row", () => {
    const page = readFileSync(resolve(__dirname, "../../pages/MfScreener.tsx"), "utf8");
    expect(page).toMatch(/\?\? keyLabel\(k\)/);
    expect(page).toContain('className="mfs-empty-chips"');
    const css = readFileSync(resolve(__dirname, "../../styles/task458.css"), "utf8");
    expect(css).toMatch(/\.mfs-empty \.mfs-empty-chips \{[^}]*gap: 8px/);
  });
});
