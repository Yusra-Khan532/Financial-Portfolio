// @vitest-environment jsdom
// Task #388 reopened (developer file 38, the Equity portfolio checked live on 25 Nov): E1 and S3 (nothing shows between the site header, the section bar
// and the tools row, nor round the bar's rounded ends, on the equity, MF and ETF pages), E3 (no date until the prices behind it have loaded), E4 (the
// whole view card is a link: role, Tab, Enter and Space, pointer) and E5 (on a phone, All sections folds every step after the first, through the bar's
// own button and when a laptop window is narrowed). Sample data only (made up).
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../../lib/auth", async (orig) => ({ ...(await orig<typeof import("../../lib/auth")>()), useAuth: () => ({ user: { id: "u-sample" }, plan: "gold", limits: null, seesAll: false }) }));
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never;
import { EqTitle } from "./EqTop";
import { ScoreCards, type CardsInput } from "./EqTop385";
import { Step, StepCtx } from "./EqSteps385";
import { HSTRIP, SectionsBar, headerBottom, useHeaderHeight, type Sec } from "./PageTop";
import { PHONE_Q } from "../../components/PhoneFold";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); document.documentElement.className = ""; document.body.innerHTML = ""; });
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
/** A matchMedia whose phone query can change after the page has drawn (a laptop window narrowed to 390 px). */
function media(on: boolean) {
  const subs = new Set<() => void>(); const m = { on };
  vi.stubGlobal("matchMedia", (q: string) => ({ get matches() { return m.on && q === PHONE_Q; }, media: q, addEventListener: (_: string, f: () => void) => subs.add(f), removeEventListener: (_: string, f: () => void) => subs.delete(f), addListener() {}, removeListener() {} }));
  return (v: boolean) => act(() => { m.on = v; subs.forEach((f) => f()); });
}

// ------------------------------------------------------------------------------------------------ E3
describe("E3: no date until the prices behind it have loaded", () => {
  it("while the shares' prices load the title says Loading prices… and prints no date; once loaded it names their time", () => {
    const { rerender } = wrap(<EqTitle plan="Gold" asOf={null} loading add={null} clear={null} />);
    expect(document.querySelector(".eqx-asof")!.textContent).toBe("Loading prices…");
    expect(document.body.textContent).not.toMatch(/Prices at/);
    rerender(<QueryClientProvider client={new QueryClient()}><MemoryRouter><EqTitle plan="Gold" asOf="2026-11-25T10:16:00+05:30" add={null} clear={null} /></MemoryRouter></QueryClientProvider>);
    expect(document.querySelector(".eqx-asof")!.textContent).toBe("Prices at 10:16 · 25 Nov");
  });
  it("no prices (an empty list, or an error): no date at all", () => {
    wrap(<EqTitle plan="Gold" asOf={null} add={null} clear={null} />);
    expect(document.querySelector(".eqx-asof")).toBeNull();
  });
  it("the page passes only the shares' own price date, never the index's last close, and says it is loading while the prices are pending", () => {
    const h = src("../../pages/Holdings.tsx");
    expect(h).toMatch(/<EqTitle plan=\{TIER\[plan\]\.n\} asOf=\{priceDay\} loading=\{!!model && !DEMO && symbols\.length > 0 && ov\.isPending\}/);
    expect(h).not.toMatch(/asOf=\{priceDay \?\? idxQ/);   // the bug: "Prices at close · 23 Nov" (the index's date) for about 5 seconds
  });
});

// ------------------------------------------------------------------------------------------------ E4
const CARDS: CardsInput = { locked: false, score: { total: 61, band: "Average" }, strength: { avg: 64, word: "Average", byValue: true, counts: [["Strong", 1], ["Average", 2]] },
  spread: { score: 58, word: "Fairly spread", byCount: 63 }, risk: { beta: 1.08, swing: 21.2, swingIndex: 14.3, bench: "NIFTY 50", byValue: true, to: "2026-11-20" } };
describe("E4: the whole view card opens its view", () => {
  it("each other view's card is a link with a Tab stop; the open view's card is not", () => {
    wrap(<ScoreCards c={CARDS} view="portfolio" onView={() => {}} sixOpen={false} onSix={() => {}} />);
    const links = screen.getAllByRole("link", { name: /^Open the .* view \(/ });
    expect(links.map((l) => l.getAttribute("aria-label"))).toEqual(["Open the Diversification view (Diversification card)", "Open the Risk view (Risk card)"]);
    expect(links.every((l) => l.tabIndex === 0 && l.classList.contains("eqc-v"))).toBe(true);
    const here = document.querySelectorAll(".eqc-v")[0];
    expect(here.getAttribute("role")).toBeNull(); expect(here.getAttribute("tabindex")).toBeNull(); expect(here.textContent).toContain("You are here");
  });
  it("click anywhere on the card, Enter and Space open the view; its i, and a key pressed on the i, keep their own action", () => {
    const onView = vi.fn();
    wrap(<ScoreCards c={CARDS} view="portfolio" onView={onView} sixOpen={false} onSix={() => {}} />);
    const [div, risk] = screen.getAllByRole("link", { name: /^Open the .* view \(/ });
    fireEvent.click(div.querySelector(".eqc-v1")!); expect(onView).toHaveBeenLastCalledWith("diversification");
    fireEvent.keyDown(risk, { key: "Enter" }); expect(onView).toHaveBeenLastCalledWith("risk");
    onView.mockClear(); fireEvent.keyDown(div, { key: " " }); expect(onView).toHaveBeenLastCalledWith("diversification");
    onView.mockClear(); const i = div.querySelector(".sp-i") as HTMLElement;
    fireEvent.click(i); fireEvent.keyDown(i, { key: "Enter" }); fireEvent.keyDown(div, { key: "a" });
    expect(onView).not.toHaveBeenCalled();
  });
  it("Open → stays (for the mouse) and leaves the Tab order to the card, so each card is met once", () => {
    const onView = vi.fn();
    wrap(<ScoreCards c={CARDS} view="diversification" onView={onView} sixOpen={false} onSix={() => {}} />);
    const open = screen.getByRole("button", { name: "Open the Risk view" });
    expect(open.textContent).toBe("Open →"); expect(open.tabIndex).toBe(-1);
    fireEvent.click(open); expect(onView).toHaveBeenCalledTimes(1);
    expect(screen.getByText("You are here").closest(".eqc-v")!.textContent).toMatch(/Diversification/);
  });
  it("the card shows a pointer, a hover edge and a focus ring (scoped to .eq)", () => {
    const css = src("./eq385.css");
    expect(css).toMatch(/\.eq \.eqc-v\.eqc-go \{ cursor: pointer;/);
    expect(css).toMatch(/\.eq \.eqc-v\.eqc-go:focus-visible \{ outline: 2px solid var\(--gold\)/);
  });
});

// ------------------------------------------------------------------------------------------------ E5
const SECS: Sec[] = [["s1", "First"], ["s2", "Second"], ["s3", "Third"], ["s4", "Fourth"]];
const ALL = { portfolio: { label: "Portfolio", secs: SECS }, diversification: { label: "D", secs: [] as Sec[] }, risk: { label: "R", secs: [] as Sec[] } };
/** The page's own wiring (pages/Holdings.tsx): the bar's step and All sections set one state that StepCtx hands to every Step. */
function Page() {
  const [step, setStep] = useState("s1");
  return <><SectionsBar tab="portfolio" all={ALL} steps onAll={() => setStep("all")} step={step} onStep={setStep} onTab={() => {}} />
    <StepCtx.Provider value={{ step, firstStep: "s1" }}>{SECS.map(([id, label]) => <Step key={id} id={id} title={label} line={`${label} in one line`}><section id={id}><h2>{label}</h2><p>{label} body</p></section></Step>)}</StepCtx.Provider></>;
}
describe("E5: on a phone, All sections folds every step after the first", () => {
  it("the bar's All sections button: step 1 open, every later step its heading, one line and Open ▾; the page carries no open body after step 1", () => {
    media(true); wrap(<Page />);
    expect(document.querySelectorAll(".eqf")).toHaveLength(0);   // one step at a time before
    fireEvent.click(screen.getByRole("button", { name: "All sections" }));
    expect(screen.getByRole("button", { name: "All sections" }).getAttribute("aria-pressed")).toBe("true");
    const folds = [...document.querySelectorAll<HTMLElement>(".eqf")];
    expect(folds.map((f) => f.dataset.fold)).toEqual(["s2", "s3", "s4"]);
    expect(folds.map((f) => f.querySelector(".eqf-sum")!.textContent)).toEqual(["Second in one lineOpen ▾", "Third in one lineOpen ▾", "Fourth in one lineOpen ▾"]);
    expect(folds.every((f) => f.querySelector("[hidden]")!.textContent!.includes("body"))).toBe(true);
    expect(screen.getByText("First body").closest("[hidden]")).toBeNull();
    fireEvent.click(folds[1].querySelector(".eqf-sum")!); expect(document.querySelectorAll(".eqf")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /^4\s*Fourth/ }));   // a step from the bar shows that section open
    expect(document.querySelectorAll(".eqf")).toHaveLength(0); expect(screen.getByText("Fourth body")).toBeTruthy();
  });
  it("a laptop window narrowed to a phone after All sections: the steps fold as soon as the width crosses; widened again, they open", () => {
    const set = media(false); wrap(<Page />);
    fireEvent.click(screen.getByRole("button", { name: "All sections" }));
    expect(document.querySelectorAll(".eqf")).toHaveLength(0);
    set(true); expect(document.querySelectorAll(".eqf")).toHaveLength(3);
    set(false); expect(document.querySelectorAll(".eqf")).toHaveLength(0);
  });
});

// ------------------------------------------------------------------------------------------------ E1 and S3
function Bar({ strip }: { strip: string }) { useHeaderHeight(strip); return null; }
describe("E1 and S3: nothing shows above, below or round the floating bar", () => {
  it("<html> carries x-hstrip only while the page's floating bar is stuck under the header (not at the top of the page), and loses it with the bar", () => {
    document.body.innerHTML = '<header class="top"></header><nav class="fbar" style="position: sticky; top: 70px"></nav>';
    const bar = document.querySelector<HTMLElement>(".fbar")!; Object.defineProperty(bar, "offsetHeight", { value: 52 });
    let at = 400; bar.getBoundingClientRect = () => ({ top: at }) as DOMRect;
    const has = () => document.documentElement.classList.contains(HSTRIP);
    const a = render(<Bar strip=".fbar" />);
    expect(has()).toBe(false);   // the top of the page: the bar is in its place in the page
    act(() => { vi.stubGlobal("scrollY", 900); at = 70; dispatchEvent(new Event("scroll")); }); expect(has()).toBe(true);
    act(() => { at = 300; dispatchEvent(new Event("scroll")); }); expect(has()).toBe(false);
    act(() => { at = 70; dispatchEvent(new Event("scroll")); }); expect(has()).toBe(true);
    a.unmount(); expect(has()).toBe(false);
    act(() => { dispatchEvent(new Event("scroll")); }); render(<Bar strip="" />); expect(has()).toBe(false);   // a page without a floating bar never gets it
  });
  it("--top-h counts the phone's sticky section chips under the header, so the bar's first line (the account switcher) is not hidden under them", () => {
    const h = document.createElement("header"), hub = document.createElement("nav");
    h.getBoundingClientRect = () => ({ height: 56 }) as DOMRect; hub.getBoundingClientRect = () => ({ height: 51 }) as DOMRect;
    Object.defineProperty(hub, "offsetHeight", { value: 51 }); hub.style.position = "sticky"; document.body.append(h, hub);
    expect(headerBottom(h, hub)).toBe(107);
    hub.style.position = "static"; expect(headerBottom(h, hub)).toBe(56);   // a laptop: the chips are not shown
    expect(headerBottom(h, null)).toBe(56);
  });
  it("the CSS: the header (and the phone's chips) paint the 8px strip without touching their own shadows, the tools row paints the 6px gap, the bars' rounded ends are backed", () => {
    const top = src("./pagetop.css"), kit = src("../kit/kit.css"), r = src("./round388.css");
    expect(top).toMatch(/:root\.x-hstrip \.top::before, :root\.x-hstrip \.ma-hub::before \{ content: ""; position: absolute; left: 0; right: 0; top: 100%; height: 8px; background: var\(--bg\); \}/);   // task #388 (file 38, F5): a real cover, no pointer-events: none
    expect(top).not.toMatch(/x-hstrip[^{]*\{[^}]*box-shadow/);
    expect(r).toMatch(/\.eq #pf-shares \.pfx-tools\.pfh\.stuck \{ box-shadow: 0 -6px 0 var\(--bg\), var\(--ui-row-shadow\); \}/);
    expect(src("../add-shares.css")).toMatch(/\.pfx-tools\.pfh\.stuck \{[^}]*box-shadow: 0 10px 18px -16px rgba\(0, 0, 0, \.45\);/);   // the token is the row's own shadow
    expect(src("../../styles/ui-tokens.css")).toMatch(/--ui-row-shadow: 0 10px 18px -16px rgba\(0, 0, 0, \.45\);/);
    expect(top).toMatch(/\.eq \.eqt-bar\.eqt-scr\.stuck::before \{ background: var\(--bg\); \}/);
    expect(top).toMatch(/\.eq \.eqt-bar\.eqt-scr\.stuck::after \{ background: inherit; border: inherit; border-radius: inherit; \}/);
    expect(kit).toMatch(/\.ptk-bar::before, \.ptk-frow\.stuck::before \{ background: var\(--bg\); \}/);
    expect(kit).toMatch(/\.ptk-bar::after, \.ptk-frow\.stuck::after \{ background: inherit; border: inherit; border-radius: inherit; \}/);
    expect(top + kit).not.toMatch(/body:has\(/);   // scoped by the bar being on the page, not a global :has()
  });
  it("same cause in Against their peers: its stuck column and group headings paint the 6px above them; each is the first row of a clipping box, so nothing shows at rest", () => {
    const r = src("./round388.css");
    expect(r).toMatch(/\.eq \.eq8p-rh, \.eq \.eq8p-gh \{ box-shadow: 0 -6px 0 var\(--bg\); \}/);
    expect(r).toMatch(/\.eq8p-rh \{ position: sticky; top: var\(--eq-bar-b, 128px\);/);   // the headings stick 6px under the bar (--eq-bar-b = bar bottom + 6)
    expect(r).toMatch(/\.eq8p-tab \{[^}]*overflow: clip;/); expect(r).toMatch(/\.eq \.eq8p-g \{ overflow: clip; \}/);
    const t = src("./Round388.tsx");   // the column headings open the table and each group heading opens its group: their shadow at rest is clipped
    expect(t).toMatch(/<div className="eq8p-tab"[^>]*>\s*<div className="eq8p-r eq8p-rh"/);
    expect(t).toMatch(/className=\{"eq8p-g " \+ g\.tone\} role="rowgroup">\s*<p className="eq8p-gh"/);
  });
  it("the equity bar (steps mode) and the MF and ETF view bar ask for the strip", () => {
    expect(src("./PageTop.tsx")).toMatch(/useHeaderHeight\(scr \? "\.eq \.eqt-bar\.eqt-scr" : ""\);/);
    expect(src("../kit/ViewBar.tsx")).toMatch(/useHeaderHeight\("\.ptk-bar:not\(\.away\), \.ptk-frow\.stuck"\);/);
  });
});
