// @vitest-environment jsdom
// Task #377 (team, 24 Nov 2026), the Mutual funds list: "give this box name: disclamer and drop down for it and it shall be intially closed". The box at
// the foot of /funds is named Disclaimer and is a closed drop-down; the statutory mutual fund line stays in view in the closed row (as task #373 on the
// screener); the other fund pages keep their open footer.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Foot } from "./Bits";
import { AMFI_RISK_LINE, DISCLAIMER } from "../lib/mf";

afterEach(cleanup);
const facts = { source: "AMFI", dataDate: "2026-11-24", excludedAmcs: ["ASK", "Zerodha"] } as never;

describe("task #377: the Disclaimer drop-down at the foot of the Mutual funds list", () => {
  it("with fold, the box is a closed drop-down named Disclaimer, the statutory line in its closed row", () => {
    const { container } = render(<Foot facts={facts} fold />);
    const d = container.querySelector("details.mfs-disc") as HTMLDetailsElement;
    expect(d).not.toBeNull(); expect(d.open).toBe(false);
    const s = d.querySelector("summary")!;
    expect(s.querySelector(".mfs-disc-k")!.textContent).toBe("Disclaimer");
    expect(s.textContent).toContain(AMFI_RISK_LINE);
  });
  it("every earlier note is inside it: Information only, the source, the data date and the fund houses not listed", () => {
    const body = render(<Foot facts={facts} fold />).container.querySelector("details")!.textContent!;
    for (const t of [DISCLAIMER, "Source: AMFI", "Data date: 24 Nov 2026", "Some fund houses are not listed here (list: ASK, Zerodha)"]) expect(body).toContain(t);
  });
  it("without fold (fund page, compare, head to head) the footer stays open as before", () => {
    const { container } = render(<Foot facts={facts} />);
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector(".mf-amfi")!.textContent).toBe(AMFI_RISK_LINE);
  });
  it("only /funds folds it, and the folded footer drops its own box for the drop-down's", () => {
    const page = readFileSync(join(process.cwd(), "src/pages/Funds.tsx"), "utf8");
    expect(page.match(/<Foot [^>]*\bfold\b/g)?.length).toBe(1);
    expect(page).toContain("<Foot facts={facts} fold />");
    const css = readFileSync(join(process.cwd(), "src/styles/task377.css"), "utf8");
    expect(css).toMatch(/\.mf-list \.mf-foot\.mf-foot-fold \{ padding: 0; border: 0; background: none; \}/);
    expect(readFileSync(join(process.cwd(), "src/mf/Bits.tsx"), "utf8")).toContain('import "../styles/task373.css";');
  });
});
