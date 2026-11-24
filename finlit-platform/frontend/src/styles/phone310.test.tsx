// @vitest-environment jsdom
// Task #310 part E (the 22 Nov pack, 05-phone.md): the phone rules, locked in. Under 860px, the width at which the left menu becomes a sheet:
// - the header holds the logo, search, Ask FinLit AI, notifications and the account (44px each); the Dashboard button, the theme switch and the
//   system controls are not in it (theme and system controls are in the Menu sheet);
// - what stays on screen is the header, the bottom bar (Dashboard, Research, Search, Screener, Menu) and a section bar; the floating Menu button and
//   the report's edge tab are gone; toasts sit above the bar and close after 6 seconds;
// - tap targets are 44px; body text is 14px;
// - long pages open on tap: the company report's sections, the dashboard's steps after the second, Sector Pulse's sections after the second and
//   the funds table's notes are closed rows on a phone, remembered for the session; the funds list shows 5 schemes, then Show all.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ui = { theme: "light" as "light" | "dark", toggleTheme: vi.fn() };
let admin = false;
vi.mock("../lib/ui", async (orig) => ({ ...(await orig<typeof import("../lib/ui")>()), useUI: () => ui }));
vi.mock("../lib/auth", () => ({ useAuth: () => ({ user: { email: "a@b.c" }, isAdmin: admin }) }));
vi.mock("../components/SystemControl", () => ({ SystemControl: () => <button type="button" aria-label="System controls">s</button> }));

import { PhoneFold, PHONE_Q, PHONE_ROWS, foldAnchor, revealFold } from "../components/PhoneFold";
import { SheetTools } from "../components/SheetTools";
import { TOAST_MS } from "../components/Notifications";
import { NAV } from "../lib/sectionNav";
import { foldText } from "../stock/StockPage";

const SRC = join(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const files = (dir: string, ext: RegExp): string[] => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p, ext) : ext.test(f) && !/\.test\./.test(f) ? [p] : []; });
/** The body of the one `@media (max-width: 860px)` block of a sheet. */
const phoneBlock = (css: string) => { const at = css.indexOf("@media (max-width: 860px) {"); expect(at, "an @media (max-width: 860px) block").toBeGreaterThan(-1); let d = 0, i = css.indexOf("{", at); const s = i; for (; i < css.length; i++) { if (css[i] === "{") d++; else if (css[i] === "}" && --d === 0) break; } return css.slice(s, i); };
const phone = strip(read("styles/phone310.css")), block = phoneBlock(phone);

let phoneWide = true;
beforeEach(() => {
  phoneWide = true;
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q === PHONE_Q ? phoneWide : false, media: q, addEventListener: () => {}, removeEventListener: () => {} }));
  sessionStorage.clear();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); admin = false; ui.theme = "light"; });

describe("one phone width: 860px", () => {
  it("the phone layer is one sheet loaded after the shared pieces, and the bar height is a token", () => {
    const main = read("main.tsx");
    const at = (s: string) => main.indexOf(s);
    expect(at('import "./styles/phone310.css"')).toBeGreaterThan(at('import "./styles/ui.css"'));
    expect(at('import "./styles/phone310.css"')).toBeLessThan(at('import "./styles/overlay.css"'));
    expect(read("styles/ui-tokens.css")).toMatch(/--ui-bar-h: 56px;/);
  });
  it("the header, the bottom bar and the admin's View switch all change at 860px, where the left menu becomes a sheet (no 760px step left)", () => {
    expect(strip(read("styles/luxe.css"))).not.toMatch(/\.mtabs|\.mt-i|\.top \.burger|\.av-btn/);
    expect(strip(read("styles/adminView.css"))).toMatch(/@media \(max-width: 860px\) \{ \.avw:not\(\.avw-mob\) \{ display: none; \}/);
    expect(strip(read("styles/ai-top.css"))).toMatch(/@media \(max-width: 860px\) \{ \.top \.ai-top \{ width: 44px; height: 44px;/);
    expect(strip(read("styles/headerlinks.css"))).toMatch(/@media \(max-width: 860px\) \{\s*\.mob-only\.mob-cta \{[^}]*min-height: var\(--ui-ctl-h\)/);
    expect(read("components/AppShell.tsx")).toContain('DESKTOP_Q = "(min-width: 861px)"');
  });
});

describe("fixes 1 and 2: the header", () => {
  it("under 860px: no Dashboard button, no theme switch, no system controls, no burger; search, Ask FinLit AI, bell and account are 44px", () => {
    expect(block).toMatch(/:root \.top > \.wrap > :is\(\.burger, \.planseg, \.theme-btn, \.sys-dd, \.signin, \.signin-ghost\) \{ display: none !important; \}/);
    expect(block).toMatch(/:root \.top > \.wrap > a\.mob-cta\[href="\/dashboard"\] \{ display: none !important; \}/);
    expect(block).toMatch(/:root \.top \.search, :root \.top\.top--tool \.search \{ flex: 0 0 var\(--ui-ctl-h\); width: var\(--ui-ctl-h\);[^}]*height: var\(--ui-ctl-h\)/);
    expect(block).toMatch(/:root \.top :is\(\.icon-btn, \.ai-top, \.wod-top\) \{ width: var\(--ui-ctl-h\); height: var\(--ui-ctl-h\);/);
    expect(block).toMatch(/\.top \.wrap \{ min-height: 62px; gap: 8px;/);                 // the 8px gaps stay with the Word of the Day book in the row
    const wod = strip(read("styles/word-of-day.css"));
    expect(wod).not.toMatch(/max-width: 500px|gap: 2px; \}\s*\.top \.wrap:has\(> \.wod-top\) > \.grow/);   // no phone rule shrinks the book or closes the gaps
    expect(wod).toMatch(/@media \(max-width: 860px\) \{\s*\.top \.wod-top \{ width: 44px; height: 44px;/);
    expect(read("components/WordOfDay.tsx")).toContain('matchMedia("(max-width: 860px)").matches');   // the desktop fit logic runs from 861px up
    expect(block).toMatch(/:root \.top \.av-btn \{ height: var\(--ui-ctl-h\);/);
    expect(read("components/Layout.tsx")).toContain('className="icon-btn theme-btn" onClick={toggleTheme}');
  });
  it("the theme switch and the system controls are in both Menu sheets: the site menu and the left-menu sheet", () => {
    expect(read("components/Layout.tsx")).toMatch(/<HelpActions onPick=\{\(\) => setMenu\(false\)\} \/><\/div>\s*<SheetTools \/>/);
    expect(read("components/AppShell.tsx")).toContain('<SheetTools className="side-tools" />');
    expect(phone).toMatch(/^\.mtabs, \.sheet-tools \{ display: none; \}/m);   // wider screens keep both in the header
    expect(block).toMatch(/\.sheet-tools \{ display: grid;/);
  });
  it("SheetTools: Dark theme as a switch for everyone, System controls for an admin only", () => {
    render(<SheetTools />);
    const t = screen.getByRole("button", { name: /Dark theme/ });
    expect(t.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(t);
    expect(ui.toggleTheme).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("System controls")).toBeNull();
    cleanup(); admin = true; ui.theme = "dark";
    render(<SheetTools />);
    expect(screen.getByRole("button", { name: /Dark theme/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("System controls")).toBeTruthy();
  });
});

describe("fix 3: what stays on screen", () => {
  it("the bottom bar is now the phone app's five tabs (owner, 25 Nov 2026: docs/MOBILE-APP.md; locked in by styles/mobileApp.test.tsx); 56px; the bar never covers the end of a page", () => {
    const layout = read("components/Layout.tsx");
    expect(layout).not.toContain('<nav className="mtabs"');
    expect(layout).toContain("<MobileTabs /><MobileMenu /><ToolsButton />");
    const app = strip(read("styles/mobile-app.css"));
    expect(app).toMatch(/\.ma-tabs \{ display: grid; grid-template-columns: repeat\(5, minmax\(0, 1fr\)\); position: fixed; left: 0; right: 0; bottom: 0;/);
    expect(app).toMatch(/\.ma-tab \{[^}]*min-height: var\(--ui-bar-h\);[^}]*font: var\(--ui-fw-medium\) var\(--fs-12\)/);
    expect(block).toMatch(/main \{ padding-bottom: calc\(var\(--ui-bar-h\) \+ 16px/);
  });
  it("nothing else floats: no floating Menu button anywhere, and the report's edge tab is off on a phone", () => {
    for (const p of files(SRC, /\.(css|tsx?)$/)) expect(readFileSync(p, "utf8"), p).not.toMatch(/shell-fab/);
    expect(block).toMatch(/:root \.plf-edge \{ display: none; \}/);
  });
  it("toasts sit above the bottom bar and close after 6 seconds", () => {
    expect(TOAST_MS).toBe(6000);
    expect(read("components/Notifications.tsx")).toContain("setShown((s) => s.filter((x) => x.id !== n.id)), TOAST_MS)");
    expect(block).toMatch(/:root:root :is\(\.toast, \.prep-toast, \.cpf-toast\) \{ bottom: calc\(var\(--ui-bar-h\) \+ 12px/);
    expect(block).toMatch(/:root:root \.alx-toasts \{ bottom: calc\(var\(--ui-bar-h\) \+ 12px/);
  });
});

describe("fixes 4 and 5: 44px taps, 14px body", () => {
  it("the older buttons grow to 44px, and the small i buttons get a 44px tap area without growing", () => {
    expect(block).toMatch(/:root \.btn \{ min-height: var\(--ui-ctl-h\); \}/);
    expect(block).toMatch(/:root \.info::after \{ inset: -12px; \}/);                  // 20px + 2 x 12px
    expect(block).toMatch(/:root \.sp-i::after \{ content: ""; position: absolute; inset: -11px; \}/);   // 22px + 2 x 11px
    expect(block).toMatch(/body \{ font-size: var\(--fs-14\); \}/);
    expect(block).toMatch(/:root \.icon-btn \{ width: var\(--ui-ctl-h\); height: var\(--ui-ctl-h\); \}/);
    expect(block).toMatch(/:root div:has\(> table\.rp-counts\) \{ max-width: 100%; overflow-x: auto;/);   // a table scrolls in its box, not the page
    expect(strip(read("styles/ui.css"))).toMatch(/@media \(max-width: 860px\) \{\s*\.ui-btn, \.ui-btn--sm, \.ui-tab, \.ui-input \{ min-height: var\(--ui-ctl-h\); \}/);
  });
});

describe("fix 6: long pages open on tap", () => {
  const Two = () => <><PhoneFold page="t" id="a" title="Alpha" line="The first one"><p id="in-a">A body</p></PhoneFold><PhoneFold page="t" id="b" title="Beta" line="The second one"><p>B body</p></PhoneFold></>;
  it("on a phone a section is a closed row with its name and one line; a tap opens it; opening one does not close another; remembered for the session", () => {
    render(<Two />);
    const a = screen.getByRole("button", { name: /Alpha/ }), b = screen.getByRole("button", { name: /Beta/ });
    expect(a.textContent).toContain("The first one");
    expect(a.getAttribute("aria-expanded")).toBe("false");
    expect((document.getElementById(a.getAttribute("aria-controls")!) as HTMLElement).hidden).toBe(true);
    fireEvent.click(a); fireEvent.click(b);
    expect(a.getAttribute("aria-expanded")).toBe("true");
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(JSON.parse(sessionStorage.getItem("finlit:fold:t")!)).toEqual(["a", "b"]);
    cleanup();
    render(<Two />);
    expect(screen.getByRole("button", { name: /Alpha/ }).getAttribute("aria-expanded")).toBe("true");
  });
  it("a jump to something inside a closed section opens it, and a section bar reads a closed section by its row", () => {
    render(<Two />);
    const inside = document.getElementById("in-a")!;
    expect(foldAnchor(inside)?.classList.contains("pfold-row")).toBe(true);
    act(() => revealFold(inside));
    expect(screen.getByRole("button", { name: /Alpha/ }).getAttribute("aria-expanded")).toBe("true");
    expect(foldAnchor(inside)).toBe(inside);
  });
  it("from 861px up nothing changes: no row, no wrapper", () => {
    phoneWide = false;
    const { container } = render(<Two />);
    expect(container.querySelector(".pfold, .pfold-row")).toBeNull();
    expect(container.innerHTML).toBe('<p id="in-a">A body</p><p>B body</p>');
  });
  it("the company report: every section under the header card and the Prism card is folded on a phone, each named from the section bar", () => {
    const page = read("stock/StockPage.tsx");
    const ids = [...page.matchAll(/<PhoneFold page="stock" \{\.\.\.foldOf\("([a-z-]+)"\)\}>/g)].map((m) => m[1]);
    expect(ids).toEqual(["business", "company-brief", "macro", "notes", "price", "quarter", "financials", "trends", "charts", "ratios", "ownership", "peers", "sector", "insights", "segments", "dividends", "news", "community"]);
    expect(page.indexOf("<Hero ")).toBeLessThan(page.indexOf('<PhoneFold page="stock"'));   // the header card and the Prism card stay open
    for (const id of ids) { const [t, line] = foldText(id); expect(t.length, id).toBeGreaterThan(2); expect(line.length, id).toBeGreaterThan(10); }
    expect(foldText("price")).toEqual([NAV.find((n) => n[0] === "price")![1], NAV.find((n) => n[0] === "price")![3]]);
    expect(page).toContain("if (t && tries === 0) revealFold(t);");
  });
  it("the dashboard's steps after the second, Sector Pulse's sections after the second, and the funds table's notes start closed on a phone", () => {
    expect(read("pages/Dashboard.tsx")).toMatch(/return ui\.sec !== "all" \|\| gi < 2 \? cells : <PhoneFold key=\{"fold-" \+ g\.step\.id\} page="dashboard"/);   // task #316: one section picked in the filter is drawn open
    // task #333 (file 30) replaces Sector Pulse's phone folds: the page is shorter on every width (two boxes with a switch, three closed rows)
    const sp = read("pages/SectorPulse.tsx");
    expect(sp.indexOf("<TodayMinute")).toBeLessThan(sp.indexOf("<SxBox"));
    expect(sp.match(/<SxFold id=/g)?.length).toBe(3);
    // task #333 follow-up: on a phone the sections after the second (the two boxes and Inside a sector) start closed again
    expect(sp.match(/<PhoneFold page="sectors" id="(all|chk|inside)"/g)?.length).toBe(3);
    expect(sp.indexOf("<YourIndustries")).toBeLessThan(sp.indexOf("<PhoneFold"));   // Simple: Standout stocks, Stocks counted; Full table: Too small for a reading
    expect(read("pages/Funds.tsx")).toContain('<PhoneFold page="funds" id="legend"');
    for (const f of ["components/StepsBar.tsx", "components/sectors/pack/Guide.tsx"]) expect(read(f), f).toMatch(/revealAndScroll\(/);
  });
  it("the funds list shows its first 5 schemes on a phone, then Show all", () => {
    expect(PHONE_ROWS).toBe(5);
    const t = read("mf/FundTable.tsx");
    expect(t).toContain("const cut = phone && !all && rows.length > PHONE_ROWS;");
    expect(t).toContain("{shown.map((r) => (");
    expect(t).toMatch(/\{cut && <button type="button" className="ui-btn ui-btn--secondary mf-showall" onClick=\{\(\) => setAll\(true\)\}>Show all \{rows\.length\} schemes<\/button>\}/);
  });
});
