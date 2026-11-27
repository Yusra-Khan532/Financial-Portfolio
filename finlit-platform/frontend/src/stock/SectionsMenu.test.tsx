import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SectionsMenu } from "./SectionsMenu";
import { NAV, columnsOf, moveIndex, navFor, sectionNo } from "../lib/sectionNav";

describe("All sections panel", () => {
  it("lists every section with its icon, name and hint, and marks the current one", () => {
    const h = renderToStaticMarkup(<SectionsMenu items={navFor()} active="ratios" onPick={() => {}} />);
    for (const [id, label, , hint] of NAV) { expect(h).toContain(`data-s="${id}"`); expect(h).toContain(`<b>${sectionNo(id) ? `<span class="sn-no">${sectionNo(id)}</span>` : ""}${label.replace("&", "&amp;")}</b>`); expect(h).toContain(hint); }
    expect(h).toContain("All sections");
    expect(h.match(/aria-current="true"/g)).toHaveLength(1);
    expect(h).toMatch(/data-s="ratios"[^>]*aria-current|aria-current="true"[^>]*data-s="ratios"|class="smn-i on"[^>]*aria-current="true"[^>]*data-s="ratios"/);
  });
  it("is closed to start with, and lists Where it stands in place of Sector & peers and Leadership", () => {
    const h = renderToStaticMarkup(<SectionsMenu items={navFor()} active={null} onPick={() => {}} />);
    expect(h).toContain("hidden"); expect(h).toContain('aria-expanded="false"'); expect(h).not.toContain('data-s="leadership"'); expect(h).not.toContain('data-s="history"'); expect(h).toContain('data-s="ownership"'); expect(h).not.toContain('data-s="plans"');
    expect(navFor()).toHaveLength(20);   // task #216: live 17 Pros & cons is gone
    expect(h).toContain("<b><span class=\"sn-no\">14</span>Where it stands</b>");   // Key findings is merged into Strengths & watch-outs (task #37); Leadership went into Where it stands (pack board 17)
  });
});

describe("panel keyboard rule", () => {
  it("arrows step through a 3-column grid; Up and Down move a row; Home and End jump", () => {
    expect(moveIndex(0, "ArrowRight", 14, 3)).toBe(1); expect(moveIndex(13, "ArrowRight", 14, 3)).toBe(0); expect(moveIndex(0, "ArrowLeft", 14, 3)).toBe(13);
    expect(moveIndex(1, "ArrowDown", 14, 3)).toBe(4); expect(moveIndex(12, "ArrowDown", 14, 3)).toBe(12); expect(moveIndex(4, "ArrowUp", 14, 3)).toBe(1); expect(moveIndex(1, "ArrowUp", 14, 3)).toBe(1);
    expect(moveIndex(5, "Home", 14, 3)).toBe(0); expect(moveIndex(5, "End", 14, 3)).toBe(13); expect(moveIndex(5, "x", 14, 3)).toBe(5); expect(moveIndex(0, "ArrowDown", 0, 3)).toBe(-1);
    expect(moveIndex(0, "ArrowDown", 14, 1)).toBe(1);
  });
  it("reads the column count from the computed grid", () => { expect(columnsOf("250px 250px 250px")).toBe(3); expect(columnsOf("")).toBe(1); });
});

describe("sections bar numbers and the plan's Scores line (task #216, README 1.8)", () => {
  it("numbers every section 01 to 19; Scores has none; Announcements is gone, 18 is News & filings, 02 reads Economy (task #222, 19 Nov pack)", () => {
    expect(NAV.map(([id]) => sectionNo(id)).filter(Boolean)).toEqual(Array.from({ length: 19 }, (_, i) => String(i + 1).padStart(2, "0")));
    expect([sectionNo("prism"), sectionNo("announcements")]).toEqual([null, null]);
    expect(NAV.map(([id]) => id)).not.toContain("announcements");
    expect(NAV.filter(([id]) => ["macro", "dividends", "news", "community"].includes(id)).map(([id, l]) => `${sectionNo(id)} ${l}`)).toEqual(["02 Economy", "17 Dividends", "18 News & filings", "19 Discussions"]);
  });
  it("task #283: every plan reads only FinLit Prism on the Scores line", () => {
    for (const m of ["prism", null, undefined] as const) {
      expect(navFor(m)[0][3]).toBe("The FinLit Prism score: financial health and the technical view, side by side");
      expect(navFor(m)[0][3]).not.toMatch(/\bIQ\b/);
    }
  });
});
