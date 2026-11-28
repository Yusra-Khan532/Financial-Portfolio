import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Task #447: "the colours of graph are going wrong when zoomed in mutual fund screener". The enlarged view (components/ChartZoom) draws the chart
// at the end of the page, outside .mfs-glance, where the fund-type colours were defined, so every dot fell back to black and the legend swatches vanished.
// The colours must be defined on the element ChartZoom carries into the dialog (figure.mfs-fig), in light and both dark rules.
const css = readFileSync(join(__dirname, "..", "..", "styles", "mfscreen.css"), "utf8");
const tsx = readFileSync(join(__dirname, "Graphics.tsx"), "utf8");
const TYPES = ["equity", "hybrid", "debt", "other"];

describe("#447 the enlarged return-against-risk chart keeps its colours", () => {
  it("the figure is the direct child ChartZoom moves into the dialog", () => {
    expect(tsx).toMatch(/<ChartZoom label=\{"Fund return against risk"\}>\s*<figure className="mfs-fig">/);
  });

  it("every fund-type colour the dots and legend use is defined on .mfs-fig, light and dark", () => {
    const used = new Set([...css.matchAll(/var\(--t-(equity|hybrid|debt|other)\)/g)].map((m) => m[1]));
    expect([...used].sort()).toEqual([...TYPES].sort());
    const rules = [
      /\n\.mfs-glance, \.mfs-fig \{([^}]*)\}/,
      /:root\[data-theme="dark"\] \.mfs-fig \{([^}]*)\}/,
      /:root:not\(\[data-theme="light"\]\) \.mfs-fig \{([^}]*)\}/,
    ];
    for (const re of rules) {
      const m = css.match(re);
      expect(m, String(re)).toBeTruthy();
      for (const t of TYPES) expect(m![1]).toMatch(new RegExp(`--t-${t}:\\s*#[0-9A-Fa-f]{6}`));
    }
  });
});
