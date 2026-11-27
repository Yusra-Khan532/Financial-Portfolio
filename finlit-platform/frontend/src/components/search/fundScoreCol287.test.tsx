// @vitest-environment jsdom
// Task #287: in the search box a fund's score has a column of its own (Gold), captioned like the 1Y return, not glued to the end of the fund's name.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/screener", () => ({ useUniverse: () => ({ data: undefined }) }));
import { FundScoreCol } from "./SearchOverlay";

afterEach(cleanup);
const src = readFileSync(join(process.cwd(), "src/components/search/SearchOverlay.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/styles/search.css"), "utf8");
const item = (final: number | null, reason: string | null = null) => ({ code: 1, symbol: null, plan: "Direct", group: null, final, label: final == null ? null : "Healthy", status: final == null ? "NOT SCORED" : "RATED", reason }) as never;

describe("task #287: a proper score column in the search box", () => {
  it("shows the score in a band-coloured chip with the caption MF Score", () => {
    const { container } = render(<FundScoreCol item={item(72)} busy={false} />);
    const col = container.querySelector(".gs-score.gs-fsc")!;
    expect(col.querySelector(".mfs-chip.b-hi")!.firstChild!.textContent).toBe("72");
    expect(col.querySelector(".gs-band")!.textContent).toBe("MF Score");
  });
  it("keeps the column with a dash and 'No score' (the reason on hover) when the plan has no score, and a wait mark while loading", () => {
    const { container, rerender } = render(<FundScoreCol item={item(null, "Younger than a year")} busy={false} />);
    const col = container.querySelector(".gs-fsc")!;
    expect(col.textContent).toBe("−No score");
    expect(col.getAttribute("title")).toBe("Younger than a year");
    rerender(<FundScoreCol item={undefined} busy />);
    expect(container.querySelector(".gs-fsc")!.getAttribute("aria-label")).toBe("Loading the score");
  });
  it("no longer puts the score after the fund's name, gives fund rows the extra column, and loads the chip's colours", () => {
    expect(src).toMatch(/<span className="gs-t"><Hl text=\{it\.title\} q=\{q\} \/><\/span>/);
    expect(src).toMatch(/gold && it\.kind === "mf" && <FundScoreCol/);
    expect(css).toMatch(/\.gs-row\.k-mf\.fsc \{ grid-template-columns: auto minmax\(0, 1fr\) auto 64px 92px 58px; \}/);
    expect(src).toMatch(/import "\.\.\/\.\.\/styles\/mfup\.css";/);
    // follow-up: the chip's own rule (task #286) starts it at the left of its box; in this column it is centred over its caption
    expect(css).toMatch(/\.gs-fsc \.mfs-chip \{ justify-self: center;/);
  });
});
