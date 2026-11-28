// Task #448 (developer file 42, 02 §1.2, §2, 05 §4, §7, 06): the figures behind "For you this week" and the short "Your sectors" view, on made-up shares.
import { describe, expect, it } from "vitest";
import type { SectorHistory } from "./sectorHistory";
import type { GroupRow } from "./sectors";
import { forYou, join, pct, shares, stayLine, timeInState, typicalWeeks, yourGroups, yourLead, type HeldShare } from "./yourSectors";

const row = (slug: string, state_code: GroupRow["state_code"]) => ({ slug, name: slug[0].toUpperCase() + slug.slice(1), state_code, stocks_counted: 10, breadth: { above_20: 50 } } as unknown as GroupRow);
const hist = (states: Record<string, (string | null)[]>): SectorHistory => ({ dates: ["a", "b", "c", "d"], week_ends: [0, 1, 2, 3], words: {} as never, counts: {} as never, weeks: [], insights: { mood: [], strip: [] }, changed_this_week: [],
  groups: Object.entries(states).map(([slug, s]) => ({ name: slug, slug, kind: "sector", states: s as never })) });

describe("task #448: rounding, weeks and words", () => {
  it("shares add up to 100 by the largest remainder; one decimal below 10%, whole numbers above", () => {
    const p = shares([88.04, 8.03, 0.96, 2.97]);
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    expect([pct(88.04), pct(8.03), pct(0.5)]).toEqual(["88%", "8.0%", "0.5%"]);
  });
  it("time in a state is the run of identical weekly states; a run over the whole history reads 'N+ weeks'; a long stay is twice the usual and 4 weeks or more", () => {
    const h = hist({ a: ["rising", "sold_off", "sold_off", "sold_off"], b: ["sold_off", "sold_off", "sold_off", "sold_off"] });
    expect(timeInState(h, "a")).toEqual({ weeks: 3, whole: false });
    expect(timeInState(h, "b")).toEqual({ weeks: 3, whole: true });
    expect(stayLine({ weeks: 3, whole: false }, 2)).toEqual({ text: "3 weeks in this state; usually about 2 weeks", long: false });
    expect(stayLine({ weeks: 4, whole: false }, 2)!.long).toBe(true);
    expect(stayLine({ weeks: 1, whole: false }, 4)!.text).toBe("1 week in this state; usually about 4 weeks");
    expect(stayLine({ weeks: 51, whole: true }, 2)!.text).toBe("51+ weeks in this state; usually about 2 weeks");
    expect(typicalWeeks([{ state: "washout", typical_weeks: 2 }, { state: "fading", typical_weeks: 3.5 }])).toEqual({ sold_off: 2, losing: 4 });
    expect(join(["A"])).toBe("A"); expect(join(["A", "B"])).toBe("A and B"); expect(join(["A", "B", "C"])).toBe("A, B and C");
  });
});

describe("task #448: For you this week and the Your-sectors lead", () => {
  const rows = [row("power", "thrust_cap"), row("metals", "fading"), row("health", "washout"), row("autos", "washout")];
  const h = hist({ power: ["sold_off", "sold_off", "sold_off", "crash"], metals: ["crash", "crash", "crash", "losing"], health: ["sold_off", "sold_off", "sold_off", "sold_off"], autos: ["sold_off", "sold_off", "sold_off", "sold_off"] });
  const held: HeldShare[] = [
    { symbol: "PA", qty: 10, price: 5, slug: "power" }, { symbol: "MA", qty: 10, price: 80, slug: "metals" },
    { symbol: "HA", qty: 10, price: 400, slug: "health" }, { symbol: "AA", qty: 10, price: 480, slug: "autos" }, { symbol: "XX", qty: 1, price: 30, slug: null },
  ];
  const g = yourGroups(rows, held, h);
  it("says how many of the member's sectors changed state, and where the largest share of their value is now and a week ago", () => {
    const f = forYou(g, held, "sector");
    expect(f.head).toEqual({ b: "2 of your 4 sectors changed state this week.", rest: " 2 stayed where they were." });
    expect(f.value).toBe("91% of your portfolio is in sold-off sectors, against 91% a week ago.");   // 8,800 of 9,680 now; 8,850 a week ago (Power was sold off)
    expect(f.changed.map((x) => x.row.slug)).toEqual(["metals", "power"]);   // largest value first
    const none = forYou(g.map((x) => ({ ...x, was: x.key })), held, "industry");
    expect(none.head).toEqual({ b: "None of your 4 industries changed state this week.", rest: " Each is where it was a week ago." });
  });
  it("leads by value (with the shares that have no NSE sector) or by number", () => {
    expect(yourLead(g, held, "value", "sector")).toEqual({ b: "91% of your portfolio value is in sold-off sectors.", rest: " The rest: 8.3% losing steam, 0.5% bouncing back after a crash and 0.3% with no NSE sector." });
    expect(yourLead(g, held, "count", "sector")).toEqual({ b: "2 of your 4 sectors are sold off.", rest: " 1 is bouncing back after a crash and 1 is losing steam." });
  });
});
