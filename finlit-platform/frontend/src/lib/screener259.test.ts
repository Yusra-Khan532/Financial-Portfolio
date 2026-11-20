// Task #259 (pack 03 Stock screener): the linked lists' rule, the header CSS, and the Sector Pulse words of the menu and the screeners' boards.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { linkLevels, takenOffLine, toBody, norm, encodeState, decodeState } from "./proscreen";

const cat = {
  nseSectors: [{ name: "Financial Services", macro: "Financial Services", n: 6 }, { name: "Capital Goods", macro: "Industrials", n: 4 }],
  industries: [{ name: "Banks", sector: "Financial Services", nseSector: "Financial Services", n: 4 }, { name: "Electrical Equipment", sector: "Industrials", nseSector: "Capital Goods", n: 4 }],
};

describe("linked lists (SHARED §1)", () => {
  it("a macro sector takes off the sectors and industries outside it, and says which", () => {
    const r = linkLevels({ macros: ["Industrials"], nsectors: ["Financial Services"], industries: ["Banks", "Electrical Equipment"] }, cat);
    expect(r).toEqual({ macros: ["Industrials"], nsectors: [], industries: ["Electrical Equipment"], removed: ["Financial Services", "Banks"] });
    expect(takenOffLine(["Banks"])).toBe("Banks was taken off: not inside your other choice.");
    expect(takenOffLine(["A", "B"])).toBe("A, B were taken off: not inside your other choice.");
  });
  it("a sector narrows industries; nothing picked means nothing is taken off; an older-link label stays", () => {
    expect(linkLevels({ macros: [], nsectors: ["Capital Goods"], industries: ["Banks"] }, cat).industries).toEqual([]);
    expect(linkLevels({ macros: [], nsectors: [], industries: ["Banks", "Electrical Equipment"] }, cat).removed).toEqual([]);
    expect(linkLevels({ macros: ["Industrials"], nsectors: [], industries: ["Auto Ancillaries"] }, cat).industries).toEqual(["Auto Ancillaries"]);
  });
  it("the request carries each level, and the link keeps the picks", () => {
    const s = { ...norm({}), macros: ["Industrials"], nsectors: ["Capital Goods"], industries: ["Electrical Equipment"] };
    expect(toBody(s, { key: "market_cap", dir: "desc" }, ["market_cap"], "", 0, 25).cats).toMatchObject({ macro: ["Industrials"], nsector: ["Capital Goods"], industry: ["Electrical Equipment"] });
    expect(decodeState(encodeState(s, "market_cap", "desc")).state).toMatchObject({ macros: ["Industrials"], nsectors: ["Capital Goods"], industries: ["Electrical Equipment"] });
    expect(norm(undefined)).toMatchObject({ macros: [], nsectors: [] });    // a screen saved before the lists opens with none picked
  });
});

describe("the header stays in place (pack 03 §1, SHARED §5)", () => {
  const css = readFileSync(resolve(process.cwd(), "src/styles/stockscreener.css"), "utf8");
  it("header cells sit above body cells and the pinned Company header above all, scoped to the stock screener's table", () => {
    expect(css).toContain(".ssw-tw.tw-tall table thead th { z-index: 4; }");
    expect(css).toContain(".ssw-tw.tw-tall table thead th.stick { z-index: 6; }");
    expect(css).toContain(".ssw-tw.tw-tall table tbody td.stick { z-index: 2; }");
  });
});

describe("Sector Pulse words (pack 03 §4, SHARED §3)", () => {
  it("Research › Sector Pulse reads in plain words", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/nav.ts"), "utf8");
    expect(src).toContain('"Which NSE industries are sold off, bouncing back or losing steam"');
    expect(src).not.toMatch(/washout, a rebound or fading/);
  });
});
