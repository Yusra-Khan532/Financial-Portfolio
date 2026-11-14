// The Sector Pulse figures and sentences against the "FinLit final pages" pack (13 Nov 2026), on the live board of 6 Nov 2026 (the close the pack was drawn from).
import { describe, expect, it } from "vitest";
import board from "./__fixtures__/pulse-board-6nov.json";
import type { Board, GroupRow } from "./sectors";
import { BOX, byState, headline, isEarly, keyOf, matrix, matrixCards, meansForYou, risingOf, short, tableCards, toCsv, todayCards } from "./pulsePack";

const b = board as unknown as Board;
const rows = b.rows as GroupRow[];
const row = (name: string) => rows.find((r) => r.name === name)!;
const week = { crash: 1, bouncing: 0, rising: 0, losing: 3, sold_off: 34, no_signal: 0 };      // the 30 Oct Friday close, pack "See the count, week by week"

describe("Today in one minute (pack 05)", () => {
  it("says the headline, the line under it and the state counts as the pack does", () => {
    const h = headline(rows, null, week);
    expect(h.lead).toBe("The sell-off is easing.");
    expect(h.rest).toBe(" 15 of 38 industries are bouncing back; a week ago just 1 was. None has most of its stocks rising together yet.");
    expect(h.sub).toBe("Sold off: 34 industries a week ago, 21 today.");
    expect(["crash", "bouncing", "rising", "losing", "sold_off"].map((k) => rows.filter((r) => keyOf(r) === k).length)).toEqual([8, 7, 0, 2, 21]);
  });
  it("writes the four cards with the pack's words and figures", () => {
    const c = todayCards(rows);
    expect(c.map((x) => x.kind)).toEqual(["good", "watch", "insight", "warning"]);
    expect(c[0].title).toBe("15 industries are bouncing back");
    expect(c[0].text).toBe("Finance, Construction, Ferrous Metals and 12 more: most of their stocks turned up together within days. 8 of them bounced after a crash.");
    expect(c[1].title).toBe("No industry is rising together yet");
    expect(c[2].title).toBe("A bounce may be forming in 5 sold-off industries");
    expect(c[2].text).toBe("Banks (34 of 36); Cement (17 of 19); Capital Markets (26 of 31); Leisure Services (26 of 31); Transport Services (15 of 18): most of their stocks are already above their short trend.");
    expect(c[3]).toEqual({ kind: "warning", title: "2 industries are losing steam", text: "Media & Entertainment and Oil: fewer of their stocks are still rising." });
  });
});

describe("All 38 industries, by state (pack 05)", () => {
  it("groups in the pack's order, freshest bounce first, and marks the five early signs", () => {
    const g = byState(rows);
    expect(g.map((x) => [x.key, x.rows.length])).toEqual([["crash", 8], ["bouncing", 7], ["losing", 2], ["sold_off", 21]]);
    expect(g[0].rows.map((r) => short(r.name)).slice(0, 3)).toEqual(["Finance", "Construction", "Ferrous Metals"]);
    expect(g[0].rows[g[0].rows.length - 1].name).toBe("IT - Software");                       // 16 days ago, last
    expect(g[3].rows.map((r) => short(r.name)).slice(0, 2)).toEqual(["Banks", "Cement"]);      // most stocks rising first
    expect(rows.filter(isEarly).map((r) => short(r.name)).sort()).toEqual(["Banks", "Capital Markets", "Cement", "Leisure Services", "Transport Services"]);
    expect([risingOf(row("Finance")), row("Finance").stocks_counted]).toEqual([45, 67]);        // "45 of 67"
  });
});

describe("How your industries are doing (pack 05)", () => {
  it("says what each state and box mean for an owner, as the pack does", () => {
    expect(meansForYou(row("Petroleum Products")).text).toBe("Recovering, and already ahead of most industries.");
    expect(meansForYou(row("Aerospace & Defense")).text).toBe("Recovering; its lead over other industries has slowed.");
    expect(meansForYou(row("Banks")).text).toBe("Sold off and behind most industries, but most of its stocks have started rising again. An early sign.");
    expect(meansForYou(row("Pharmaceuticals & Biotechnology")).text).toBe("Sold off lately, though still ahead of most industries over the last few months.");
    expect(meansForYou(row("Media Entertainment & Publication")).text).toBe("Its recent rise is losing support.");
    expect(meansForYou(row("Industrial Products")).text).toBe("Sold off, and its lead over other industries is fading.");
  });
});

describe("Momentum and strength, side by side (pack 05)", () => {
  it("puts every industry in its cell and names the strongest and weakest mixes", () => {
    const m = matrix(rows);
    expect(m.states).toEqual(["crash", "bouncing", "sold_off", "losing"]);                         // the pack's row order
    expect(m.cells["crash:ahead_gaining"]).toEqual({ names: ["IT - Software"], mark: "strongest" });
    expect(m.cells["bouncing:ahead_gaining"].names.map(short).sort()).toEqual(["Automobiles", "Petroleum Products"]);
    expect(m.cells["sold_off:behind_slipping"].mark).toBe("weakest");
    const c = matrixCards(rows);
    expect(c[0].title).toBe("Both views agree: IT - Software, Petroleum Products, Automobiles");
    expect(c[1].title).toMatch(/^Both views are negative: Banks, Realty, Beverages, Retailing and \d+ more$/);
    expect(BOX.ahead_gaining.word).toBe("Ahead and gaining");
  });
});

describe("Full table (pack 06)", () => {
  it("writes the three cards above the table with the pack's figures", () => {
    const c = tableCards(rows, week);
    // the pack's card says 15 here; on the same 6 Nov figures 32 industries have more than half their stocks above the short trend (15 is the count of bouncing ones).
    // Numbers come first (CLAUDE.md), so the page says the true count in the pack's words.
    expect(c[0]).toEqual({ kind: "good", title: "Breadth is improving fast", text: "32 industries now have more than half their stocks above the short trend. A week ago the market was in a broad sell-off." });
    // the pack's 29 counts the four industries at exactly 50%, so the words say "half or fewer" (the pack's "fewer than half" would be 25)
    expect(c[1].text).toBe("In 29 of 38 industries half or fewer of the stocks are above their longer trend. Bounces need time to become uptrends.");
  });
  it("downloads every industry as a CSV with a header line", () => {
    const csv = toCsv(rows).split("\n");
    expect(csv.length).toBe(39); expect(csv[0]).toMatch(/^Industry,State,Stocks counted/);
    expect(csv.find((l) => l.startsWith("Finance,"))).toMatch(/^Finance,Bouncing back after a crash,67,86.6,67.2,44.8,10.1,/);
  });
});

describe("Six months of every industry (pack 06)", () => {
  // the 6 Nov Friday squares from the pack: 15 changed since 30 Oct, 14 turned to a bounce, FMCG sold off 17 Fridays before this week, last rising Friday 4 Sep
  const dates: string[] = [], weekEnds: number[] = [];
  for (let w = 0; w < 27; w++) { const d = new Date(Date.UTC(2026, 4, 8) + w * 7 * 86400000).toISOString().slice(0, 10); dates.push(d); weekEnds.push(w); }
  const g = (name: string, states: (import("./sectorHistory").StateKey | null)[]) => ({ name, slug: name.toLowerCase(), kind: "industry", states });
  const sold = (n: number) => new Array(n).fill("sold_off");
  const groups = [
    g("Fast Moving Consumer Goods", [...new Array(8).fill("no_signal"), ...sold(17), "sold_off", "bouncing"]),
    ...Array.from({ length: 13 }, (_, i) => g("B" + i, [...new Array(25).fill("losing"), "sold_off", "bouncing"])),
    g("C", [...new Array(25).fill("no_signal"), "sold_off", "losing"]),
    g("R", [...new Array(17).fill("no_signal"), "rising", ...new Array(9).fill("no_signal")]),
  ];
  const h = { dates, words: {}, groups, counts: {}, weeks: [], week_ends: weekEnds, insights: { mood: [], strip: [] }, changed_this_week: [] } as unknown as import("./sectorHistory").SectorHistory;
  it("writes the three cards as the pack does", async () => {
    const { fridayCards } = await import("./pulsePack");
    const c = fridayCards(h);
    expect(c[0]).toEqual({ kind: "good", title: "14 industries turned to a bounce this week", text: "15 of 16 changed state since 30 Oct; most of them came out of a long sell-off." });
    expect(c[1]).toEqual({ kind: "warning", title: "Longest sell-off: FMCG", text: "Sold off for 18 Fridays in a row before this week." });
    expect(c[2].text).toBe("The last blue square on the chart is 4 Sep: at no Friday close since then has an industry had most of its stocks rising together.");
  });
});

describe("How your industries are doing: the pack's order (pack 05)", () => {
  it("lists recovering industries first, then the early sign, then the rest by box, sold off before losing steam", async () => {
    const { yourOrder, yourCards } = await import("./pulsePack");
    const names = ["Petroleum Products", "IT - Software", "Aerospace & Defense", "Banks", "Pharmaceuticals & Biotechnology", "Consumer Durables", "Media Entertainment & Publication", "Industrial Products", "Industrial Manufacturing"];
    const mine = rows.filter((r) => names.includes(r.name)).sort(yourOrder).map((r) => short(r.name));
    expect(mine).toEqual(["Petroleum Products", "IT - Software", "Aerospace & Defense", "Banks", "Pharma & Biotech", "Consumer Durables", "Media & Entertainment", "Industrial Products", "Industrial Mfg"]);
    const held = names.map((n) => ({ symbol: n.slice(0, 3).toUpperCase(), slug: rows.find((r) => r.name === n)!.slug }));
    expect(yourCards(rows, held)[0].text).toBe("IT - Software, Petroleum Products, Aerospace & Defense. This is the strongest mix on the page.");
  });
});
