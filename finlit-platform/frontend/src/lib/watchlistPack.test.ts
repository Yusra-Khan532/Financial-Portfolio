// The Watchlists page's words (board 16 of the "FinLit final pages" pack) come out of the real figures: the pack's own sample list (WHEELS, SSWL, LOTUSDEV,
// 6 Nov 2026) must give the pack's sentences, word for word, except where the pack's words cannot be derived from data (listed in the PR).
import { describe, expect, it } from "vitest";
import { concentrationTile, dayName, dayTile, disagree, groups, listCards, peerCell, peersTile, rankSentence, scoreTile, stocksTile, type Item, type ListLead } from "./watchlistPack";

const L = (rank: number, fr: number, rel52: number): ListLead => ({ available: true, label: "leader", rank, ranked: 20, group: "Auto Parts: OEM", sector: "Nifty Auto", sectorKind: "index", rel52,
  fundamentalRank: fr, fundamentalOf: 20, fundamentalNote: "below_peers" });
const PACK: Item[] = [
  { symbol: "WHEELS", name: "Wheels India Ltd", sector: "Auto Components & Equipments", marketCap: 6235, change: -3.49, score: 73, word: "Healthy", lead: L(2, 16, 1.524679) },
  { symbol: "SSWL", name: "Steel Strips Wheels Ltd", sector: "Auto Components & Equipments", marketCap: 8475, change: 1.48, score: 70, word: "Healthy", lead: L(3, 18, 1.424434) },
  { symbol: "LOTUSDEV", name: "Sri Lotus Developers & Realty Ltd", sector: "Realty", marketCap: 11412, change: -0.09, score: 69, word: "Healthy", lead: { available: false, reason: "history", text: "Under a year of prices" } },
];

describe("the five tiles", () => {
  it("say what the pack's tiles say", () => {
    expect(stocksTile(PACK)).toEqual({ value: "3", sub: "2 small · 1 mid company" });
    expect(dayTile(PACK)).toEqual({ value: "1 up · 2 down", sub: "WHEELS −3.5%, LOTUSDEV −0.1%, SSWL +1.5%" });
    expect(dayName("2026-11-06", false)).toBe("On Friday");
    expect(dayName("2026-11-06", true)).toBe("Today");
    expect(scoreTile(PACK)).toEqual({ value: "71", sub: "All three Healthy" });
    expect(peersTile(PACK)).toEqual({ value: "2 lead", sub: "1 not compared (under a year of prices)" });
    expect(concentrationTile(PACK)).toMatchObject({ value: "67%", sub: "in one industry: auto components & equipments" });
  });
  it("handle mixed words, missing scores and an empty list without inventing figures", () => {
    const mixed = [{ ...PACK[0], word: "Mixed" }, PACK[1], { ...PACK[2], score: null, word: null }];
    expect(scoreTile(mixed)).toEqual({ value: "72", sub: "1 Mixed · 1 Healthy · 1 not scored yet" });
    expect(scoreTile([{ ...PACK[0], score: null }])).toEqual({ value: "—", sub: "Not scored yet" });
    expect(scoreTile([PACK[0], PACK[1]]).sub).toBe("Both Healthy");
    expect(stocksTile([PACK[0]]).sub).toBe("1 small company");
    expect(stocksTile([PACK[0], PACK[1]]).sub).toBe("2 small companies");
    expect(dayTile([]).sub).toBe("No price change yet");
    expect(peersTile([{ ...PACK[0], lead: null }]).sub).toBe("1 not compared (not checked yet)");
    expect(concentrationTile([]).value).toBe("—");
  });
});

describe("the insight cards", () => {
  it("are the pack's three, from the ranks and the industry mix", () => {
    const cards = listCards(PACK);
    expect(cards.map((c) => [c.kind, c.title])).toEqual([["watch", "Price leads, the business lags"], ["warning", "Two of three stocks in one industry"], ["insight", "LOTUSDEV has under a year of prices"]]);
    expect(cards[0].text).toBe("WHEELS and SSWL are 2nd and 3rd of 20 Auto Parts: OEM companies on price, but 16th and 18th on the business score. Worth reading their reports to see why.");
    expect(cards[1].text).toBe("A downturn in auto components & equipments would hit most of this list at once.");
    expect(cards[2].text).toBe("With less than a year of share prices, it has no peer tag yet. It gets one once it has a full year of prices.");
  });
  it("name a business ahead of its price, and stocks in different groups one by one", () => {
    const b: Item = { ...PACK[0], lead: { ...(PACK[0].lead as Extract<ListLead, { available: true }>), label: "laggard", rank: 17, fundamentalRank: 3, fundamentalNote: "stronger_than_price" } };
    expect(listCards([b]).map((c) => c.title)).toEqual(["The business leads, the price lags"]);
    expect(listCards([b])[0].text).toBe("WHEELS is 3rd of 20 Auto Parts: OEM companies on business score, but 17th on the price. Worth reading its report to see why.");
    const other: Item = { ...PACK[1], lead: { ...(PACK[1].lead as Extract<ListLead, { available: true }>), group: "Tyres", ranked: 9 } };
    expect(rankSentence([PACK[0], other], "price", "business score")).toBe("WHEELS is 2nd of 20 Auto Parts: OEM companies on price, but 16th on the business score. SSWL is 3rd of 9 Tyres companies on price, but 18th on the business score.");
    expect(listCards([PACK[0], PACK[0]]).some((c) => c.title === "Both stocks in one industry")).toBe(true);
  });
});

describe("price and business disagree", () => {
  it("gives the pack's two cards", () => {
    expect(disagree(PACK)).toEqual([
      { symbol: "WHEELS", price: "2 of 20", business: "16 of 20", priceAhead: true, line: "Price +152.5 pts vs Nifty Auto over 12 months." },
      { symbol: "SSWL", price: "3 of 20", business: "18 of 20", priceAhead: true, line: "Price +142.4 pts vs Nifty Auto over 12 months." },
    ]);
  });
});

describe("the table", () => {
  it("shows the peer cell and groups in the pack's order", () => {
    expect(peerCell(PACK[0].lead)).toEqual({ chip: "Leader", tone: "good", line: "2 of 20 Auto Parts: OEM" });
    expect(peerCell(PACK[2].lead)).toEqual({ chip: "Not compared", tone: "none", line: "Under a year of prices" });
    expect(groups("peers", PACK).map(([k, v]) => [k, v.length])).toEqual([["Leaders", 2], ["Not compared", 1]]);
    expect(groups("size", PACK).map(([k]) => k)).toEqual(["Mid", "Small"]);
    expect(groups("industry", PACK).map(([k]) => k)).toEqual(["Auto Components & Equipments", "Realty"]);
  });
});
