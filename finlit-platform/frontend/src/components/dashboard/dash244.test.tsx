// @vitest-environment jsdom
// Task #244: "in this make mutual fund center aligned why is it leaving white spaces" (Your investments today, the MUTUAL FUND type label).
// Cause: the label's colour class was the bare "mf", and the fund pages' wrapper rule `.mf { padding-bottom: 72px }` (styles/mf.css) reached it once those
// styles were loaded, so MUTUAL FUND became a tall box with its text at the top. The label's classes now carry their own prefix (dsh-ty-mf, -share, -etf).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const read = (...p: string[]) => readFileSync(join(__dirname, "..", "..", ...p), "utf8");
afterEach(() => { document.head.innerHTML = ""; document.body.innerHTML = ""; });

/** The label as the dashboard draws it, with the fund pages' styles loaded AFTER the dashboard's (as on live, after visiting any fund page: the lazy chunk arrives later and wins a tie). */
function label(cls: string) {
  for (const f of ["dashboard.css", "mf.css"]) { const s = document.createElement("style"); s.textContent = read("styles", f).replace(/@media[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, ""); document.head.appendChild(s); }
  document.body.innerHTML = `<div class="dsh-st-r"><div class="ty"><span class="${cls}">Mutual fund</span></div></div>`;
  return getComputedStyle(document.querySelector("span")!);
}

describe("task #244: the MUTUAL FUND label is a compact, centred pill like SHARE", () => {
  it("the old bare class picked up the fund pages' 72 px padding (the bug); the new class does not", () => {
    expect(label("dsh-ty mf").paddingBottom).toBe("72px");                 // what the team saw
    const s = label("dsh-ty dsh-ty-mf");
    expect(s.paddingBottom).toBe("3px"); expect(s.paddingTop).toBe("3px"); expect(s.display).toBe("inline-block");
  });
  it("the dashboard draws the prefixed classes and styles them; no bare kind class is left", () => {
    expect(read("components", "dashboard", "MyStocks.tsx")).toContain('<span className={"dsh-ty dsh-ty-" + r.kind}>');
    const css = read("styles", "dashboard.css");
    for (const k of ["share", "mf", "etf"]) { expect(css).toContain(`.dsh-ty.dsh-ty-${k} {`); expect(css).not.toMatch(new RegExp(`\\.dsh-ty\\.${k}\\b`)); }
  });
  it("no stylesheet styles a bare .share or .etf class page-wide either (the same cause cannot hit the other two labels)", () => {
    const all = ["styles/dashboard.css", "styles/mf.css", "styles/etf.css", "styles/finlit.css"].map((f) => read(...f.split("/"))).join("\n");
    expect(all).not.toMatch(/(^|[\s,}])\.(share|etf)\s*[{,:]/m);
  });
});
