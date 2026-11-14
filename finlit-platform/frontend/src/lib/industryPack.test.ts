// An industry page as the final pages pack draws it (docs/design/finlit-final-pages/07), on Finance at the 6 Nov 2026 close: each expectation is the pack's text,
// or, where the pack's own figures disagree with the data, the data's.
import { describe, expect, it } from "vitest";
import page from "./__fixtures__/industry-6nov/finance.json";
import year from "./__fixtures__/industry-6nov/finance-year.json";
import rot from "./__fixtures__/industry-6nov/finance-rot.json";
import type { IndustryPage } from "./sectors";
import type { IndustryYear } from "./sectorExtra";
import type { RotationCard } from "./rotation";
import { cycleNotes, happening, rotationTiles, story, tiles, topCards, twoPages, yearCards } from "./industryPack";

const P = page as unknown as IndustryPage, Y = year as unknown as IndustryYear, R = rot as unknown as RotationCard;

describe("Finance, 6 Nov 2026", () => {
  it("says what is happening and shows the four tiles", () => {
    const h = happening(P);
    expect(h.lead + h.rest).toBe("Finance bounced back after a crash on 5 Nov. In the sell-off almost every finance stock kept falling; then most of them turned up together within days.");
    expect(h.watch).toBe("Watch whether the bounce holds for a few weeks and more stocks climb above their longer trend.");
    expect(tiles(P).map((t) => [t.v, t.sub])).toEqual([["58 of 67", "above their short trend"], ["45 of 67", "the main reading"], ["30 of 67", "not there yet"], ["10.1%", "the typical finance stock"]]);
  });
  it("has the three cards at the top", () => {
    const c = topCards(P, Y, R);
    expect(c[0]).toEqual({ kind: "good", title: "The bounce is broad", text: "58 of the 67 counted stocks are above their short trend: almost the whole industry turned up." });
    expect(c[1]).toEqual({ kind: "watch", title: "Earlier bounces faded", text: "Finance bounced in April and June too. Both times the rise lost support within five weeks." });
    expect(c[2]).toEqual({ kind: "warning", title: "Still behind other industries", text: "Over the longer run Finance is behind the average industry and ranks 27 of 37. The bounce has not changed that yet." });
  });
  it("places it in the cycle", () => {
    expect(cycleNotes(P)).toEqual({ bouncing: "FINANCE IS HERE", rising: "next in the cycle", losing: "if the bounce breaks" });
  });
  it("tells the year in the pack's six moments", () => {
    expect(story(Y).map((m) => `${m.label}. ${m.text}`)).toEqual([
      "Nov 2025. A short rise lost steam: within a few weeks fewer than 1 in 3 stocks were rising.",
      "Dec to Mar. Four months sold off. On 2 Mar only 1 stock in 100 was rising: almost the whole industry was falling.",
      "Apr. A bounce after a crash: by 17 Apr, 97 in 100 were rising. It lost steam in May.",
      "Jun. A second bounce on 15 Jun; it was sold off again in mid-July, then lost steam.",
      "Aug to Oct. Sold off again for about 11 weeks.",
      "5 Nov. A third bounce after a crash: 75 in 100 were rising that day, and 67 at the latest close (6 Nov).",
    ]);
  });
  it("has the year's cards", () => {
    const c = yearCards(P, Y);
    expect(c.top[0].text).toBe("Finance has bounced three times this year. The first two bounces faded within four to five weeks, so this one is still an early sign.");
    expect(c.bottom[0]).toEqual({ kind: "warning", title: "Sold off on 146 of 260 days", text: "Finance spent more of the year sold off than in any other state; it was rising together on only 2 days." });
    expect(c.bottom[1].text).toBe("Both earlier bounces ran for about a month before the industry lost steam or was sold off again.");
  });
  it("compares it with other industries", () => {
    expect(rotationTiles(R, P.stocks_counted).map((t) => [t.v, t.sub])).toEqual([["27 of 37", "▲3 on the week · ▲3 in 4 weeks"], ["−4.1", "points behind the average industry"], ["+2.1", "points ahead last month"], ["Some", "30 of 67 in an uptrend"]]);
    expect(twoPages(P, R).text).toBe("Sector Pulse says Finance stocks have just bounced; Sector Rotation says the industry is still behind. A bounce that also lifts its rank would be the sign of a real turn.");
  });
});
