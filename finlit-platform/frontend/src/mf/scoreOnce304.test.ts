// Task #304 (the team, 22 Nov 2026: "in this we are giving 2 times score which is of no need; we need to remove that from the left red box … in the mutual
// fund list"): the fund list shows each fund's Mutual Fund Score once, in its column, and no score chip beside the fund's name.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const table = readFileSync(join(process.cwd(), "src/mf/FundTable.tsx"), "utf8");

describe("task #304: the fund list gives the score once", () => {
  it("has no score chip beside the fund name", () => {
    expect(table).not.toMatch(/<ScoreChip\b/);
    expect(table).not.toMatch(/import \{[^}]*\bScoreChip\b[^}]*\} from "\.\/ScoreCell"/);
  });
  it("keeps the Mutual Fund Score column", () => {
    expect(table).toMatch(/case "score": return <ScoreCell /);
  });
});
