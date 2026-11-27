// @vitest-environment jsdom
// Task #328 (developer file 27): the company report's layout changes that carry logic: the three ROE drivers (6), the closed takeaway rows (4),
// the overbought trigger's own lines and the style scale's words (C), and the pack's CSS (1, 2, 5, 6b, 7, 8) on the page.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Table } from "../lib/api";
import { deepYears, driverRows, move, type DeepYear } from "../lib/dupontDeep";
import reliance from "../lib/__fixtures__/relianceYearly.json";
import { KqRow } from "./Sections4";

const RIL = reliance.yearly as { pl: Table; bs: Table };
const src = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

describe("6 · ROE driven by: the three drivers", () => {
  it("lists all three from the table, first and last value, the direction, the stored share, the largest first", () => {
    const m = move(deepYears(RIL.pl, RIL.bs, false, "year-end"))!;
    const rows = driverRows(m);
    expect(rows.map((r) => r.key).sort()).toEqual(["multiplier", "netMargin", "turnover"]);
    for (const r of rows) {
      expect(r.first).toMatch(r.key === "netMargin" ? /%$/ : /×$/);
      const f = m.first[r.key] as number, l = m.last[r.key] as number;
      expect(r.dir).toBe(l > f ? 1 : l < f ? -1 : 0);
      expect(r.effect).toMatch(r.dir > 0 ? /^▲ pushed ROE up/ : r.dir < 0 ? /^▼ pulled ROE down/ : /no change/);
      expect(r.share).toBe(m.shares[r.key]);
    }
    expect(rows[0].top).toBe(true); expect(rows.slice(1).every((r) => !r.top)).toBe(true);
    expect(rows[0].effect).toMatch(/ most( ·|$)/);
    const size = (k: DriverKey) => Math.abs((m.shares[k] ?? 0) as number);
    expect(size(rows[0].key)).toBeGreaterThanOrEqual(size(rows[1].key)); expect(size(rows[1].key)).toBeGreaterThanOrEqual(size(rows[2].key));
  });
  it("Reliance as the pack shows it: turnover 0.58× → 0.49× pulled ROE down most, the margin pushed it up", () => {
    const y = (label: string, netMargin: number, turnover: number, multiplier: number) => ({ label, period: label, netMargin, turnover, multiplier, roe: netMargin * turnover * multiplier }) as unknown as DeepYear;
    const rows = driverRows(move([y("Mar 2019", 6.81, 0.58, 2.59), y("Mar 2026", 7.51, 0.49, 2.41)]));
    expect(rows.map((r) => [r.name, `${r.first} → ${r.last}`, r.effect.split(" · ")[0]])).toEqual([
      ["Asset turnover", "0.58× → 0.49×", "▼ pulled ROE down most"],
      ["Net profit margin", "6.81% → 7.51%", "▲ pushed ROE up"],
      ["Equity multiplier", "2.59× → 2.41×", "▼ pulled ROE down"]]);
    expect(rows[0].effect).toMatch(/· \d+% of the move$/);
    expect(rows[1].effect).toMatch(/· offset \d+% of the move$/);   // it pushed against the fall
    expect(driverRows(null)).toEqual([]);
  });
});
type DriverKey = "netMargin" | "turnover" | "multiplier";

describe("4 · Key takeaways and risks: closed rows with the count and first line", () => {
  it("is closed, shows the count and the first line, and opens on a press", () => {
    const { container: c } = render(<KqRow tone="var(--gain)" icon="check" title="Key takeaways" items={["Sales grew 28.6% from a year ago.", "Net profit grew 40.6% from a year ago."]} empty="Nothing" />);
    const d = c.querySelector("details")!;
    expect(d.hasAttribute("open")).toBe(false);
    expect(c.querySelector("summary .n")!.textContent).toBe("2");
    expect(c.querySelector("summary .lead")!.textContent).toBe("Sales grew 28.6% from a year ago.");
    fireEvent.click(c.querySelector("summary")!);
    expect(d.hasAttribute("open")).toBe(true);
    expect(c.querySelectorAll("li").length).toBe(2);
  });
  it("an empty side says so with a count of 0", () => {
    const { container: c } = render(<KqRow tone="var(--loss)" icon="alert" title="Key risks and red flags" items={[]} empty="No red flags in the reported numbers this quarter." />);
    expect(c.querySelector("summary .n")!.textContent).toBe("0");
    expect(c.querySelector("summary .lead")!.textContent).toBe("No red flags in the reported numbers this quarter.");
  });
  it("sits under the quarter's table, not between the industry card and the table", () => {
    const s4 = src("./Sections4.tsx"), q = s4.slice(s4.indexOf("export function QuarterSection"));
    expect(q.indexOf('className="kq2"')).toBeGreaterThan(q.indexOf("Profit and loss for the quarter"));
    expect(q).not.toContain('className="kq"');
  });
});

describe("C · the overbought trigger and the style scale", () => {
  const s3 = src("./Sections3.tsx");
  it("Heavy recent buying has its own two lines, not the heavy-selling ones, and no advice words", () => {
    expect(s3).toMatch(/rsi14_high: \["Heavy recent buying has lifted the price fast/);
    expect(s3).toMatch(/n\.key === "rsi14" && \/buying\|overbought\/i\.test/);
    const line = s3.slice(s3.indexOf("rsi14_high"), s3.indexOf("\n", s3.indexOf("rsi14_high")));
    expect(line).not.toMatch(/\b(buy now|sell|hold|target|accumulate|avoid)\b/i);
  });
  it("the style scale reads 'Between the value and growth groups', never cheap or expensive", () => {
    expect(s3).toContain('"Between the value and growth groups"');
    expect(s3).not.toContain("Neither cheap nor expensive");
  });
});

describe("C · the lazy sections' placeholders have their section's usual height", () => {
  it("every deferred section passes its own height, wide and narrow", async () => {
    const { usualHeight, USUAL_HEIGHT } = await import("./Defer");
    const page = src("./StockPage.tsx");
    const ids = [...page.matchAll(/<Defer all=\{openAll\} height=\{usualHeight\("([a-z]+)"\)\}/g)].map((m) => m[1]);
    expect(ids.length).toBe((page.match(/<Defer /g) ?? []).length);
    for (const id of ids) { expect(USUAL_HEIGHT[id]).toBeDefined(); expect(usualHeight(id, 1440)).toBe(USUAL_HEIGHT[id][0]); expect(usualHeight(id, 1024)).toBe(USUAL_HEIGHT[id][1]); }
    expect(usualHeight("quarter", 1440)).toBeGreaterThan(700); expect(usualHeight("community", 1440)).toBeLessThan(700);
  });
});

describe("the pack's rules are on the page", () => {
  const css = src("../styles/company-report-layout.css");
  it("loads after the report's own sheets and carries rules 1 to 8", () => {
    const page = src("./StockPage.tsx");
    expect(page.indexOf('import "../styles/company-report-layout.css"')).toBeGreaterThan(page.indexOf('import "../styles/report216.css"'));
    for (const sel of [".pcx-sec.tech .dk-cta", ".mo-gl>.mo-panel:first-child>.mo-grp", ".aiq-tabs button[aria-selected=true]", ".kq2 summary", ".vh .vh-side",
      ".dp-drv li", ".dp-roe .dp-roe-g", ".nf-card .nf-r.nf-hid", ".nf-card.all .nf-list{max-height:560px", ".fs-kp>summary"]) expect(css).toContain(sel);
  });
  it("1 · the date and the report button close the technical panel", () => {
    const pc = src("./PrismCompare.tsx");
    expect(pc).toContain('foot={<div className="dk-cta"><span className="pcx-upd"');   // QA of 23 Nov: the label now says "Prism report calculated …" (prismCalcLabel)
    expect(pc.match(/className="dk-cta"/g)!.length).toBe(1);   // no second row of its own under both panels
  });
});
