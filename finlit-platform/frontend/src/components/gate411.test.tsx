// @vitest-environment jsdom
// Task #411 (the team's 27 Nov list of live-site bugs, bug 1): the company report's section 03 "What's going well and what to watch" showed a Silver plan
// badge beside its label, and the Silver plan was removed on 21 Nov. A Silver gate reads as Gold (lib/planNames) and is now drawn as Gold too (its colour
// and crown), on the section badge and on the lock card; every report section badge is checked for "Silver".
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ({ has: () => false, upgrade: vi.fn() }) }));
import { Gate, TierChip, shownTier } from "./Gate";
import { SectionHead } from "../stock/Sections";

afterEach(cleanup);
const STOCK = join(__dirname, "../stock");

describe("task #411 bug 1: no Silver badge on the company report", () => {
  it("section 03's heading shows the Gold badge, drawn as Gold (no silver class, no Silver text)", () => {
    const { container } = render(<SectionHead id="notes" no="03 · What's going well and what to watch" icon="notes" tier="silver" title="What's going well and what to watch" color="--gold-deep" />);
    const chip = container.querySelector(".no .tier")!;
    expect(chip.textContent).toBe("Gold");
    expect(chip.className).toBe("tier gold");
    expect(container.querySelector(".tier.silver")).toBeNull();
    expect(container.textContent).not.toMatch(/silver/i);
  });
  it("every section badge of the report reads Free or Gold, never Silver, whatever tier its source names", () => {
    const tiers = new Set<string>();
    for (const f of readdirSync(STOCK, { recursive: true }) as string[]) {
      if (!/\.tsx$/.test(f) || /\.test\./.test(f)) continue;
      for (const m of readFileSync(join(STOCK, f), "utf8").matchAll(/<SectionHead [^>]*?tier=(?:"(\w+)"|\{(\w+)\})/g)) tiers.add(m[1] ?? m[2]);
    }
    expect(tiers.size).toBeGreaterThan(1);
    const named: Record<string, "basic" | "silver" | "gold"> = { basic: "basic", gold: "gold", silver: "silver", PLAN_FOR_REPORT_EXTRAS: "silver" };
    for (const t of tiers) {
      expect(named[t], `a section badge names tier ${t}`).toBeTruthy();
      const { container } = render(<TierChip tier={named[t]} />);
      expect(container.textContent, t).toMatch(/^(Free|Gold)$/);
      expect(container.querySelector(".tier")!.className, t).not.toMatch(/silver/);
      cleanup();
    }
  });
  it("the lock card of a Silver gate (section 03, price statistics) reads Gold with Gold's crown; the gate still asks for the same tier", () => {
    const { container } = render(<MemoryRouter><Gate tier="silver" title="See the full scorecard notes" points={["Red flags, items to watch and strengths together"]}><p>notes</p></Gate></MemoryRouter>);
    const t = container.querySelector(".lock-card .tier")!;
    expect(t.className).toBe("tier gold");
    expect(t.textContent).toBe("Gold plan");
    expect(container.querySelector(".lock-card button")!.textContent).toBe("Unlock with Gold ");
    expect((container.querySelector(".lock") as HTMLElement).style.getPropertyValue("--tc")).toBe("var(--t-gold)");
    expect(container.textContent).not.toMatch(/silver/i);
    expect(shownTier("silver")).toBe("gold");
    for (const k of ["basic", "gold", "platinum", "equity", "mfetf", "combined"] as const) expect(shownTier(k)).toBe(k);
  });
});
