// @vitest-environment jsdom
// Task #407 (26 Nov 2026): the landing page from the team's go-live pack (finlit-landing-golive-26nov.zip). These tests hold the page to the pack:
// its sections in order, its data (six areas, 40 tools, five plans and their prices), links that all lead to real pages, the interactive parts working
// on the site's own data, and nothing left behind when the visitor leaves the page.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { GoLiveMarkup } from "./GoLiveMarkup";
import { initGoLive } from "./golive";
import { AREAS, PLANS, CLIPS } from "./goliveData";
import { checkText } from "../../scripts/check-ui.mjs";

const src = (p: string) => readFileSync(join(__dirname, p), "utf8");
const TOUR = { src: "/landing/finlit-tour-dark-720p.mp4", poster: "/landing/golive/tour-dark-poster.jpg" };

// the app's routes, read from App.tsx, as patterns
const ROUTES = [...src("../App.tsx").matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
const routeRe = ROUTES.map((r) => new RegExp("^/?" + r.replace(/^\//, "").replace(/:[^/]+/g, "[^/]+").replace(/\*/g, ".*") + "/?$"));
const isRoute = (href: string) => { const p = href.split(/[?#]/)[0]; return p === "/" || routeRe.some((re) => re.test(p.replace(/^\//, "")) || re.test(p)); };

beforeAll(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
  // jsdom has no IntersectionObserver or media playback
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () {};
  window.scrollTo = (() => {}) as typeof window.scrollTo;
});
afterEach(() => cleanup());

describe("task #407: the pack's data", () => {
  it("six areas and 40 tools, each with a name, a plan, a line and a page", () => {
    expect(AREAS.map((a) => a.name)).toEqual(["Discover", "Company 360", "Quant Lab", "Track & manage", "Follow the market", "Learn & connect"]);
    const tools = AREAS.flatMap((a) => a.tools);
    expect(tools).toHaveLength(40);
    for (const t of tools) { expect(t[1], "name").toBeTruthy(); expect(t[2], t[1]).toMatch(/^(Free|Gold|Platinum|MF \+ ETF|Equity Portfolio)$/); expect(t[3], t[1]).toBeTruthy(); expect(t[6], t[1]).toMatch(/^\//); }
  });
  it("five plans with the pack's yearly prices, and every recording file named after a tool", () => {
    expect(PLANS.P.map((p) => [p[0], p[4]?.y ?? 0])).toEqual([["Free", 0], ["Mutual Fund + ETF", 1700], ["Equity Portfolio", 3300], ["Gold", 5500], ["Platinum", 10000]]);
    expect(PLANS.n).toBe(40);
    const names = new Set(AREAS.flatMap((a) => a.tools.map((t) => t[1])));
    for (const [n, f] of Object.entries(CLIPS)) { expect(names.has(n) || n === "Discover" || n === "Query builder", n).toBe(true); expect(f).toMatch(/^\/landing\/golive\/clips\/[a-z0-9-]+\.mp4$/); }
  });
  it("every page a tool or a button points to is a real page of the site", () => {
    const tools = AREAS.flatMap((a) => a.tools.map((t) => t[6]));
    const inMarkup = [...src("GoLiveMarkup.tsx").matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1]);
    const inScript = [...src("golive.js").matchAll(/href="(\/[^"'+]*)"/g)].map((m) => m[1]);
    const bad = [...tools, ...inMarkup, ...inScript].filter((h) => !isRoute(h));
    expect(bad).toEqual([]);
    expect(inMarkup.length + inScript.length).toBeGreaterThan(3);
  });
  it("links to the site are relative (routed by the app); only the WhatsApp share carries the full address", () => {
    expect(src("GoLiveMarkup.tsx")).not.toMatch(/href="https:\/\/finlitventures\.com/);
    const abs = [...src("golive.js").matchAll(/https:\/\/finlitventures\.com[^'"]*/g)].map((m) => m[0]);
    expect(abs.every((a) => /\/stocks\/'?$|\/stocks\/$/.test(a) || a === "https://finlitventures.com/stocks/")).toBe(true);
  });
});

describe("task #407: the markup", () => {
  it("one h1, the pack's sections in order, the disclaimer, and the tour with its poster and label", () => {
    const { container } = render(<GoLiveMarkup tour={TOUR} />);
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(container.querySelector("h1")!.textContent).toBe("Research deeper.Invest with clarity.");
    const tops = [...container.querySelectorAll("section")].filter((s) => !s.parentElement!.closest("section")).map((s) => s.id || [...s.classList].pop());
    expect(tops).toEqual(["hh-top", "platform", "scores", "begin", "compare", "lp-cta"]);
    expect([...container.querySelectorAll("h2")].map((h) => h.textContent)).toEqual(expect.arrayContaining(["Six areas. 40 tools. One score underneath.", "Where would you like to begin?", "Start free. Add Prism when you need it."]));
    expect(container.textContent).toMatch(/Information only, not investment advice\./);
    const v = container.querySelector("video.lp-tour") as HTMLVideoElement;
    expect(v.getAttribute("preload")).toBe("metadata"); expect(v.getAttribute("poster")).toBe(TOUR.poster); expect(v.getAttribute("aria-label")).toMatch(/A tour of FinLit/);
    for (const img of container.querySelectorAll("img")) expect(img.hasAttribute("alt"), img.getAttribute("src") ?? "").toBe(true);
  });
  it("shows the phone doors at the top of the hero when given", () => {
    const { container } = render(<GoLiveMarkup tour={TOUR} doors={<nav className="ma-doors">doors</nav>} />);
    expect(container.querySelector(".hh-top .wrap")!.firstElementChild!.className).toBe("ma-doors");
  });
});

describe("task #407: the interactive parts on the site's data", () => {
  const index = { rows: [["RELIANCE", "Reliance Industries Ltd"], ["INFY", "Infosys Ltd"], ["ITC", "ITC Ltd"]] as [string, string][], sectors: ["Energy", "Information Technology", "FMCG"], sec: [0, 1, 2], mc: [1860860, 479729, 500000] };
  const start = () => {
    const navigate = vi.fn(), quote = vi.fn(async (s: string) => ({ price: s === "INFY" ? 1183 : 400, changePct: 0.82, priceDate: "2026-11-26" }));
    const { container } = render(<GoLiveMarkup tour={TOUR} />);
    let stop = () => {};
    act(() => { stop = initGoLive({ navigate, searchIndex: async () => index, quote }); });
    return { container, navigate, quote, stop: () => stop() };
  };
  it("draws the six areas, the tour's seven chapters and the plan table with every plan and its monthly price", () => {
    const { container, stop } = start();
    expect(container.querySelectorAll(".lp-ex-a button")).toHaveLength(6);
    expect([...container.querySelectorAll(".lp-vid-c button")].map((b) => b.textContent)).toEqual(["Screener", "Company report", "FinLit Prism", "Sector Pulse", "Sector Rotation", "Mutual Fund Score", "Portfolio"]);
    const cq = container.querySelector("#lp-cq")!.textContent!;
    for (const t of ["Free", "Gold", "Platinum", "Mutual Fund + ETF", "Equity Portfolio", "₹458", "₹833", "₹142", "₹275", "40 tools in 6 areas", "Payments open soon. Start on Free today."]) expect(cq, t).toContain(t);
    expect(container.querySelector(".lq-bun")!.textContent).toMatch(/₹375/);
    stop();
  });
  it("an area opens its tools; an area of the plan table opens its rows; Open all areas opens all six", () => {
    const { container, stop } = start();
    act(() => { (container.querySelectorAll(".lp-ex-a button")[2] as HTMLElement).click(); });
    expect(container.querySelector(".lp-ex-a [aria-selected=true] b")!.textContent).toBe("Quant Lab");
    act(() => { (container.querySelector(".lq-gh") as HTMLElement).click(); });
    expect(container.querySelectorAll(".lq-row").length).toBeGreaterThan(0);
    act(() => { (container.querySelector("[data-cq=groups]") as HTMLElement).click(); });
    expect(container.querySelectorAll(".lq-g.on")).toHaveLength(6);
    stop();
  });
  it("picking a company shows its card with the latest close and that close's date (the site's quotes, not a frozen list)", async () => {
    const { container, quote, stop } = start();
    await act(async () => { (container.querySelector('[data-co="INFY"]') as HTMLElement).click(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0)); });
    const card = container.querySelector("figure.lp-card")!.textContent!;
    expect(quote).toHaveBeenCalledWith("INFY");
    expect(card).toMatch(/Infosys/); expect(card).toMatch(/₹1,183/); expect(card).toMatch(/close, 26 Nov 2026/); expect(card).toMatch(/Shown as an example, not a recommendation/);
    expect((container.querySelector("#lp-vid") as HTMLElement).hidden).toBe(true);
    stop();
  });
  it("links to the site go through the app's router", () => {
    const { container, navigate, stop } = start();
    act(() => { (container.querySelector('a[href="/stocks/RELIANCE"]') as HTMLElement).click(); });
    expect(navigate).toHaveBeenCalledWith("/stocks/RELIANCE");
    stop();
  });
  it("leaves nothing behind: the recording window and the hover preview go, and the page's classes come off", () => {
    const { stop } = start();
    expect(document.querySelectorAll("body > .lp-rec").length).toBe(1);
    stop();
    expect(document.querySelectorAll("body > .lp-rec, body > .lp-pop")).toHaveLength(0);
    expect(document.documentElement.classList.contains("lp-rec-on")).toBe(false);
  });
});

describe("task #407: the styles", () => {
  it("are on the site's tokens (no raw colours, font sizes or radii outside custom properties) and style only the landing page", () => {
    const css = src("golive.css");
    expect(checkText(css, { css: true })).toEqual([]);
    const sels = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/^\s*([^@{}\n][^{}\n]*)\{/gm)].map((m) => m[1].trim()).filter((s) => s !== ":root");
    const global = sels.filter((s) => !/\.(lp|lq)-|\.hh\b|\.hh-|#platform|\.xt-|\.hpz|\.hmf|#prism|#mf-score|#lp-/.test(s));
    expect(global).toEqual([]);
  });
});
