// Task #183 part 2 (MF portfolio), M1 live fixes: the badge shows the account's real plan (Gold no longer reads SILVER), Export CSV is gone from the page and
// the FAQ, IDCW options say in one line why their returns are blank, and the FAQ says that a liquid fund counts as a full share until units are added.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MF_PORTFOLIO_FAQ } from "../../content/mfPortfolioFaqs";
import { TIER } from "../../lib/ui";

const page = readFileSync(resolve(__dirname, "../../pages/MfPortfolio.tsx"), "utf8");

describe("MF portfolio live fixes (M1)", () => {
  it("writes the account's plan on the badge, never a fixed word", () => {
    expect(page).toContain('<p className="ptk-plan mfp-plan"><span>{TIER[plan].n}</span></p>');   // task #275: the badge sits in the compact top's title row
    expect(page).not.toMatch(/mfp-plan"><span>Silver</);
    expect([TIER.silver.n, TIER.gold.n].map((w) => w.toLowerCase())).toEqual(["silver", "gold"]);
  });
  it("has no download control, and the FAQ says so", () => {
    expect(page).not.toMatch(/Export CSV|saveFile|toCsv/);
    const all = MF_PORTFOLIO_FAQ.items.map((i) => `${i.q} ${i.a}`).join(" ");
    expect(all).not.toContain("Export CSV");
    expect(MF_PORTFOLIO_FAQ.items.find((i) => i.q === "How many funds can I add?")!.a).toMatch(/The portfolio pages have no download\./);
    expect(MF_PORTFOLIO_FAQ.items.map((i) => i.q)).toEqual(["How does FinLit see inside my funds?", "Why is each fund compared with a different benchmark?", "How are company sizes decided here?", "How do I add my mutual funds?",
      "What does the Mutual Fund Score show here?", "Why are the 1, 3 and 5 year returns blank for some funds?", "Why does the liquid fund lower every risk figure?", "What happens when the same fund appears twice?", "How many funds can I add?"]);   // the pack's nine
  });
  it("says why IDCW returns are blank, and that a liquid fund counts as a full share until units are added", () => {
    expect(readFileSync(resolve(__dirname, "./MfFunds.tsx"), "utf8")).toContain("The fund's Growth plan shows the full return.");   // inside Your funds since M5
    expect(MF_PORTFOLIO_FAQ.items.find((i) => /liquid fund/.test(i.q))!.a).toMatch(/each fund counts the same, so a liquid fund is a full share of the list/);
  });
});

describe("MF portfolio ISIN (M2)", () => {
  it("searches by name or ISIN, says each fund is read by its ISIN, and shows the ISIN under each fund", () => {
    expect(page).toContain('placeholder = "Search a fund by name or ISIN…"');
    expect(page).toContain("Each fund is read by its ISIN, which names the exact plan and option");
    const pack = readFileSync(resolve(__dirname, "./MfFunds.tsx"), "utf8");   // the table moved there in M5
    expect(pack).toContain('<small className="mfp-isin"');
  });
});
