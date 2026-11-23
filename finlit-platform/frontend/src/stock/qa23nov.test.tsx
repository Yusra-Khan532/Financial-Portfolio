// @vitest-environment jsdom
// QA of 23 Nov 2026 (Gold, company report, task #328), items 8 to 12.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { togetherLabel, weighNote } from "./FilingScores";
import { GROUP, GROUPS } from "../lib/filings";
import { KQ_RISK_TITLE } from "./Sections4";
import { prismCalcLabel } from "./PrismCompare";

describe("item 8: the Prism card's date says what it is", () => {
  it("names the day the company's report was calculated, not a bare 'Updated'", () => {
    expect(prismCalcLabel("2026-11-22T12:10:00Z")).toBe("Prism report calculated 22 Nov 2026");
    expect(prismCalcLabel(null)).toBe("Prism report");
  });
});

describe("item 9: the earnings alert in its own section sits in the page, never over it", () => {
  const css = readFileSync(resolve(__dirname, "../styles/plflags.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  it("the in-place card is in the flow (position relative, no z-index layer); only the card opened from the edge tab floats", () => {
    const m = css.match(/:root:root \.plf-note:not\(\.plf-floating\)\s*\{([^}]*)\}/);
    expect(m, "in-place rule").not.toBeNull();
    expect(m![1]).toMatch(/position:\s*relative/);
    expect(m![1]).toMatch(/z-index:\s*auto/);
    expect(m![1]).toMatch(/top:\s*auto/);
  });
});

describe("item 10: the filings summary names how many filings it weighs", () => {
  it("three, two or one", () => {
    expect(togetherLabel(3)).toBe("All three together");
    expect(togetherLabel(2)).toBe("Both available filings together");
    expect(togetherLabel(1)).toBe("The one available filing");
  });
  it("the weights note is only shown where it is true", () => {
    const txt = (ks: Parameters<typeof weighNote>[0]) => { const n = weighNote(ks); return n ? render(<>{n}</>).container.textContent : null; };
    expect(txt(["R", "C", "P"])).toBe(" (audited results carry the most, the presentation the least)");
    expect(txt(["R", "P"])).toBe(" (audited results carry the most, the presentation the least)");
    expect(txt(["R", "C"])).toBe(" (audited results carry the most)");
    expect(txt(["C", "P"])).toBeNull();
    expect(txt(["R"])).toBeNull();
  });
});

describe("item 11: every filing row's group label fits one line", () => {
  it("each long group has a short row label; the full label stays for the chips and the title", () => {
    for (const g of GROUPS) expect((g.short ?? g.label).length, g.key).toBeLessThanOrEqual(21);
    expect(GROUP.inv.label).toBe("Investor calls & presentations");
    expect(GROUP.inv.short).toBe("Calls & presentations");
  });
  it("the label never wraps: no wrap, ellipsis as a last resort", () => {
    const css = readFileSync(resolve(__dirname, "../styles/company-report-layout.css"), "utf8");
    expect(css).toMatch(/\.nf-card \.nf-cl\{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/);
  });
});

describe("item 12: section 05 does not call the quarter's movements red flags", () => {
  it("the risks row is 'to watch'; red flags are only those of section 03's profit and loss checks", () => {
    expect(KQ_RISK_TITLE).toBe("Key risks to watch this quarter");
    expect(KQ_RISK_TITLE).not.toMatch(/red flag/i);
  });
});
