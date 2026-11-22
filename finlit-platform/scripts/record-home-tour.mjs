// Records the landing page's product tour in the LIGHT theme (task #310 part H): frontend/public/landing/finlit-tour-light-720p.mp4 and its poster,
// finlit-tour-light-poster.webp (the FinLit Prism report card), plus the dark poster, finlit-tour-dark-poster.webp (the same card in the dark theme).
// The dark recording (finlit-tour-dark-720p.mp4) is kept as it is.
//
//   cd frontend && npm run build && npx vite preview --port 4710 --strictPort &
//   NODE_PATH=$(npm root -g) node ../scripts/record-home-tour.mjs http://localhost:4710 [work-dir]
//
// How it records: Playwright's chromium at 1440 x 900 (recordVideo), light theme, signed in as a Gold member who is NOT an administrator
// (GET /api/auth/me is answered here), so no admin controls, job alerts or "new version" notices appear (the version check is not answered either).
// Every other /api call goes to https://finlitventures.com, so the figures are the live site's. Answers that need a member session are filled from
// the repo's saved figures unless FINLIT_COOKIE is set (a member's session cookie, read from the environment, never stored): then they go live too.
//   - the FinLit Prism report for RELIANCE: frontend/src/lib/__fixtures__/prismReliance.json
//   - the portfolio (12 shares, buy prices about 10% under the day's close): the pack's sample, frontend/src/portfolio/__fixtures__/sample_12.json
// A drawn cursor and a caption per section are added on top of the page (the headless browser draws no cursor). Each section is cut from the raw
// recording without its loading time, cropped to 16:9 (the top 1440 x 810, so the header stays), scaled to 1280 x 720 and joined with short cross-fades,
// then encoded as H.264 (High, yuv420p, 30 fps, no sound, faststart) at about the dark file's bitrate. Needs ffmpeg on PATH (or FFMPEG=/path).
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");
const BASE = (process.argv[2] || "http://localhost:4710").replace(/\/$/, "");
const WORK = path.resolve(process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), "finlit-tour-")));
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const FE = path.join(ROOT, "frontend");
const OUT = path.join(FE, "public/landing");
const FFMPEG = process.env.FFMPEG || "ffmpeg";
const LIVE = "https://finlitventures.com";
const COOKIE = process.env.FINLIT_COOKIE || "";
const W = 1440, H = 900, CROP_H = 810;   // recorded size, and the 16:9 part that is kept
fs.mkdirSync(path.join(WORK, "cache"), { recursive: true });
fs.mkdirSync(path.join(WORK, "raw"), { recursive: true });

// ------------------------------------------------------------------------------------------------ the API answers
const ME = { user: { id: "u-tour", email: "member@example.com", name: "Member", role: "investor", plan: "gold", verified: true, mfa: false, mfaOk: false },
  plan: "gold", limits: { watchlist_lists: 50, watchlist_symbols: 1000, screens: 100, baskets: 100, compare: 4, holdings: 500, mf_holdings: 500, etf_holdings: 15, earnings_calls_per_month: 5 },
  csrf: "c", showcase: ["RELIANCE"], prismReportsPerDay: null };
const PRISM = JSON.parse(fs.readFileSync(path.join(FE, "src/lib/__fixtures__/prismReliance.json"), "utf8"));
const SAMPLE = JSON.parse(fs.readFileSync(path.join(FE, "src/portfolio/__fixtures__/sample_12.json"), "utf8"));
const META = SAMPLE.inputs.meta, SYMS = Object.keys(META);
const keyFile = (k) => path.join(WORK, "cache", Buffer.from(k).toString("base64url").slice(0, 200) + ".json");

async function live(route, key) {
  const f = keyFile(key);
  if (fs.existsSync(f)) { const c = JSON.parse(fs.readFileSync(f, "utf8")); return { status: c.status, ct: c.ct, body: Buffer.from(c.b64, "base64") }; }
  const req = route.request();
  const r = await route.fetch({ url: LIVE + key, timeout: 90000, headers: COOKIE ? { ...req.headers(), cookie: COOKIE } : undefined });
  const body = await r.body();
  const c = { status: r.status(), ct: r.headers()["content-type"] || "application/json", b64: body.toString("base64") };
  if (r.status() < 500 && req.method() === "GET") fs.writeFileSync(f, JSON.stringify(c));
  return { status: c.status, ct: c.ct, body };
}
let UNI = null;
async function universe(route) { if (!UNI) { const r = await live(route, "/api/screener/universe"); UNI = new Map(JSON.parse(r.body.toString()).rows.map((x) => [x.symbol, x])); } return UNI; }
const fig = (v) => ({ value: v ?? null });
const band = (v) => (v >= 80 ? "STRONG" : v >= 65 ? "HEALTHY" : v >= 50 ? "AVERAGE" : v >= 35 ? "WEAK" : "POOR");
const notLoaded = { available: false, why: "Not loaded for this view.", period: null, periodEnd: null };
function ready(s, u) {
  const m = META[s] || {}, x = u.get(s) || {}, p = m.prism;
  return { symbol: s, status: "ready", name: x.name || m.name, sector: x.sector || m.sector, industry: x.nse_industry || m.sector, isBank: false, basis: "consolidated", reportAt: x.scored_at || null,
    price: x.price ?? null, changePct: x.change_pct ?? null, priceAsOf: null, marketCapCr: x.market_cap ?? m.mcap_cr,
    ratios: { pe: fig(x.pe), pb: fig(x.pb), roe: fig(x.roe), dividend_yield: fig(x.dividend_yield), debt_to_equity: fig(x.debt_to_equity) },
    financials: { year: notLoaded, quarter: notLoaded },
    prism: p ? { state: "rated", final: p.final, label: band(p.final), status: "RATED", parts: { fundamental: p.growth_profitability, valuation: p.valuation, quality: p.quality, risk: p.risk }, shortTerm: null, longTerm: null, at: SAMPLE.page.to, reason: null }
      : { state: "not_rated", final: null, label: null, status: null, parts: null, shortTerm: null, longTerm: null, at: null, reason: "Not rated yet." } };
}
let STATE = null;
async function memberState(route) {
  if (STATE) return STATE;
  const u = await universe(route), qty = [40, 25, 30, 18, 22, 12, 15, 35, 20, 10, 8, 30];
  STATE = { portfolio: { holdings: SYMS.map((s, i) => ({ id: "h" + i, symbol: s, qty: qty[i % qty.length], price: u.get(s)?.price ? Math.round(u.get(s).price * 0.9) : 0, date: "2025-11-20", owned: true })) },
    watchlist: { lists: [] }, screens: [], prefs: {} };
  return STATE;
}
const json = (route, o, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(o) });

async function prepare(ctx, theme) {
  await ctx.addInitScript((t) => { try { localStorage.setItem("finlit-theme", t); localStorage.setItem("finlit-cookie", "1"); sessionStorage.setItem("finlit-splash", "1"); } catch { /* none */ } }, theme);
  await ctx.route("**/version.json*", (r) => r.fulfill({ status: 404, body: "" }));   // no "new version" bar
  await ctx.route("**/api/**", async (route) => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname;
    try {
      if (p === "/api/auth/me") return json(route, ME);
      if (p.startsWith("/api/visits/")) return route.fulfill({ status: 204, body: "" });
      if (!COOKIE) {
        if (p === "/api/me/state") return json(route, req.method() === "GET" ? await memberState(route) : { ok: true });
        if (p === "/api/me/companies") return json(route, { companies: [] });
        if (p === "/api/alerts") return json(route, { alerts: [], limit: 100 });
        if (p.startsWith("/api/notifications")) return json(route, { notifications: [], unread: 0 });
        if (p === "/api/prism/reports/latest" && u.searchParams.get("symbol") === "RELIANCE") return json(route, u.searchParams.get("view") === "summary" ? { summary: null } : PRISM);
        if (p === "/api/prism/history") return json(route, { symbol: u.searchParams.get("symbol"), statement: u.searchParams.get("statement"), points: [] });
        if (p === "/api/portfolio/overview") { const b = JSON.parse(req.postData() || "{}"), uni = await universe(route);
          return json(route, { model: "prism", plan: "gold", count: b.symbols.length, holdings: b.symbols.map((s) => ready(s, uni)), disclaimer: "Information only, not investment advice." }); }
        if (p === "/api/portfolio/page") return json(route, { week: SAMPLE.page.to, symbols: SYMS, unknown: [], noPrices: [], page: SAMPLE.page,
          meta: Object.fromEntries(SYMS.map((s) => [s, { name: META[s].name, sector: META[s].sector, size: META[s].size, mcap_cr: META[s].mcap_cr }])), styleTilt: null });
      }
      if (req.method() !== "GET" && !COOKIE) return json(route, { detail: { status: "auth_required" } }, 401);
      const r = await live(route, p + u.search);
      return route.fulfill({ status: r.status, contentType: r.ct, body: r.body });
    } catch { return route.fulfill({ status: 503, body: "" }); }
  });
}

// ------------------------------------------------------------------------------------------------ the cursor and the captions, drawn in the page
const OVERLAY = () => {
  const css = `
  .upd, .toast, .toasts { display: none !important; }
  #tour-cur { position: fixed; left: 0; top: 0; width: 22px; height: 22px; z-index: 2147483647; pointer-events: none; transform: translate(-100px, -100px); transition: none; }
  #tour-cur svg { display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
  .tour-ring { position: fixed; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%; border: 2px solid var(--gold, #7a5b16); z-index: 2147483646; pointer-events: none; animation: tour-ring .6s ease-out forwards; }
  @keyframes tour-ring { from { transform: scale(.4); opacity: .9; } to { transform: scale(1.4); opacity: 0; } }
  #tour-cap { position: fixed; left: 24px; top: ${810 - 24 - 74}px; z-index: 2147483645; pointer-events: none; display: flex; align-items: center; gap: 14px; padding: 12px 20px 12px 12px; min-height: 74px; box-sizing: border-box;
    background: var(--s1); border: 1px solid var(--border); border-radius: var(--r-card, 18px); box-shadow: 0 18px 40px -22px rgba(35, 32, 24, .45); color: var(--text); font-family: var(--sans, Inter, sans-serif); }
  #tour-cap i { font-style: normal; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--ui-on-bg, #1c1a15); color: var(--ui-on-fg, #fdfbf6); font-weight: 600; font-size: 15px; }
  #tour-cap b { display: block; font: 500 22px/1.2 var(--serif, Georgia, serif); }
  #tour-cap span { display: block; font-size: 14px; color: var(--muted); margin-top: 2px; }
  #tour-end { position: fixed; left: 0; top: 0; width: 100vw; height: 810px; z-index: 2147483640; background: var(--bg); display: grid; place-content: center; justify-items: center; text-align: center; gap: 18px; }
  #tour-end img { height: 64px; width: auto; }
  #tour-end h2 { margin: 0; color: var(--text); }
  #tour-end h2 em { color: var(--gold); }
  #tour-end p { margin: 0; color: var(--muted); font-size: var(--fs-16, 16px); }`;
  const add = () => {
    const s = document.createElement("style"); s.textContent = css; document.head.appendChild(s);
    const c = document.createElement("div"); c.id = "tour-cur";
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l15 11.2-6.6.9 3.9 7.4-2.6 1.4-3.9-7.5L4 20z" fill="#fff" stroke="#1c1a15" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 2}px)`; }, true);
    addEventListener("mousedown", (e) => { const r = document.createElement("div"); r.className = "tour-ring"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px"; document.body.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
  };
  if (document.body) add(); else document.addEventListener("DOMContentLoaded", add);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mouse = { x: 720, y: 450 };
async function moveTo(page, x, y, ms = 650) {
  const from = { ...mouse }, t0 = Date.now();   // timed by the clock, so a slow step never stretches the move
  for (;;) { const t = Math.min(1, (Date.now() - t0) / ms), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(from.x + (x - from.x) * e, from.y + (y - from.y) * e); if (t >= 1) break; await sleep(14); }
  mouse = { x, y };
}
async function hover(page, loc, ms = 650, dx = 0.5, dy = 0.5) {
  const b = await loc.boundingBox({ timeout: 3000 }).catch(() => null);
  if (!b) { console.warn("not found on " + page.url() + ": " + loc); return false; } await moveTo(page, b.x + b.width * dx, b.y + b.height * dy, ms); return true; }
async function click(page, loc, ms = 650) { if (await hover(page, loc, ms)) { await page.mouse.down(); await sleep(90); await page.mouse.up(); } }
/** Eased scroll of the window to y (or by dy when rel), over ms. */
async function scrollTo(page, y, ms = 1100, rel = false) {
  await page.evaluate(async ([y, ms, rel]) => {
    const y0 = scrollY, y1 = Math.max(0, rel ? y0 + y : y), t0 = performance.now();
    await new Promise((done) => { const f = (now) => { const t = Math.min(1, (now - t0) / ms), e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; scrollTo(0, y0 + (y1 - y0) * e); t < 1 ? requestAnimationFrame(f) : done(); }; requestAnimationFrame(f); });
  }, [y, ms, rel]);
}
const topOf = (page, loc) => loc.evaluate((e) => e.getBoundingClientRect().top + scrollY);
async function caption(page, n, title, sub) {
  await page.evaluate(([n, title, sub]) => { document.getElementById("tour-cap")?.remove(); const d = document.createElement("div"); d.id = "tour-cap"; d.innerHTML = `<i>${n}</i><div><b>${title}</b><span>${sub}</span></div>`; document.body.appendChild(d); }, [n, title, sub]);
}
async function open(page, url, settle = 1800) {
  await page.goto(BASE + url);
  try { await page.waitForLoadState("networkidle", { timeout: 30000 }); } catch { /* long polls */ }
  await sleep(settle);
  await page.mouse.move(mouse.x, mouse.y);
}

// ------------------------------------------------------------------------------------------------ the tour: seven sections, then the end card
const SECTIONS = [
  ["/advanced-score-screener", "Advanced screener", "Every company on the FinLit Prism rating and its four parts", async (p) => {
    // the search is filled before the cut, so the section opens on the company's row with its rating and its four parts
    const box = p.getByPlaceholder("Company name or symbol").first();
    await box.fill("Reliance Industries"); await sleep(900);
    await p.evaluate((y) => scrollTo(0, y), (await topOf(p, box)) - 70); await sleep(400);
    return async () => {
      await sleep(250); await hover(p, p.locator("tbody tr").first().locator("td").nth(5), 800); await sleep(500);
      await hover(p, p.locator("tbody tr").first().locator("td").nth(6), 450); await sleep(300);
      await hover(p, p.locator("tbody tr").first().locator("td").nth(7), 450); await sleep(300);
      await click(p, p.getByRole("button", { name: /^Columns/ }).first(), 700); await sleep(1500);
      await p.keyboard.press("Escape"); await sleep(150);
    };
  }],
  ["/stocks/RELIANCE", "Company report", "Every listed company, scored and explained", async (p) => async () => {
    await sleep(250); await hover(p, p.getByText("58.4").first(), 700); await sleep(500);
    await click(p, p.getByText("Trading details").first(), 650); await sleep(900);
    await scrollTo(p, 640, 1200); await sleep(200);
    await moveTo(p, 640, 560, 600); await sleep(800);
  }],
  ["/prism/RELIANCE", "FinLit Prism", "Financial health in four parts, plus two technical views", async (p) => async () => {
    await sleep(250); await hover(p, p.getByText("Every factor").first(), 600); await sleep(200);
    const card = p.getByText("Fundamental analysis", { exact: true }).first();
    await scrollTo(p, (await topOf(p, card)) - 110, 1100); await sleep(150);
    await hover(p, p.getByText("Valuation", { exact: true }).first(), 550); await sleep(450);
    await hover(p, p.getByText("Quality", { exact: true }).first(), 550); await sleep(450);
    await hover(p, p.getByText("Risk", { exact: true }).first(), 500); await sleep(700);
  }],
  ["/sectors", "Sector Pulse", "Which industries are being sold, bouncing back or rising together", async (p) => async () => {
    await sleep(250); await hover(p, p.getByText("Market backdrop", { exact: false }).first(), 650); await sleep(300);
    await click(p, p.locator("button.sp-vbtn").filter({ hasText: "Full table" }).first(), 650); await sleep(700);
    const table = p.getByText("Every industry, every number").first();
    await scrollTo(p, (await topOf(p, table)) - 90, 1100); await sleep(150);
    await moveTo(p, 760, 560, 600); await sleep(800);
  }],
  ["/sectors/rotation", "Sector Rotation", "Which industries are pulling ahead of the average, and which are falling behind", async (p) => async () => {
    await sleep(250); await hover(p, p.getByText("The average group").first(), 650); await sleep(400);
    await click(p, p.locator("a.sp-secbar-c").filter({ hasText: /Map/ }).first(), 650); await sleep(1000);
    await moveTo(p, 820, 470, 600); await sleep(800);
  }],
  ["/funds/122639", "Mutual Fund Score", "Every mutual fund scored 0 to 100, with the reasons", async (p) => async () => {
    await sleep(250); await hover(p, p.getByText("Mutual fund score", { exact: false }).first(), 650); await sleep(400);
    await click(p, p.getByRole("link", { name: "Mutual Fund Score", exact: true }).filter({ visible: true }).first(), 650); await sleep(1300);
    await moveTo(p, 700, 520, 650); await sleep(1000);
  }],
  ["/holdings", "Portfolio", "FinLit Prism and a diversification score for what you hold", async (p) => async () => {
    await sleep(250); await hover(p, p.getByText("value now").first(), 650); await sleep(350);
    await click(p, p.getByText("Fairly spread").first(), 650); await sleep(500);
    await scrollTo(p, 520, 1000, true); await sleep(100);
    await moveTo(p, 760, 480, 600); await sleep(800);
  }],
];

async function record() {
  const browser = await chromium.launch();
  // warm-up: load each page once so the live answers are cached and the recording does not wait on the network
  { const ctx = await browser.newContext({ viewport: { width: W, height: H } }); await prepare(ctx, "light"); const p = await ctx.newPage();
    for (const [url] of SECTIONS) await open(p, url, 500); await ctx.close(); }
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, recordVideo: { dir: path.join(WORK, "raw"), size: { width: W, height: H } } });
  await prepare(ctx, "light"); await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage(); const t0 = Date.now(), at = () => (Date.now() - t0) / 1000;
  const cuts = [];
  for (const [i, [url, title, sub, setup]] of SECTIONS.entries()) {
    await open(page, url); const run = await setup(page);
    await caption(page, i + 1, title, sub); await sleep(120);
    const a = at(); await run(); cuts.push({ url, title, from: a, to: at() });
  }
  // the end card: the site's own logo, title and main button, on the page background
  await page.evaluate(() => { const d = document.createElement("div"); d.id = "tour-end"; document.getElementById("tour-cap")?.remove();
    d.innerHTML = '<img src="/brand/finlit-logo-on-light.png" alt=""><h2 class="ui-title ui-title--marketing">Research deeper.<br><em>Invest with clarity.</em></h2><p>Every listed Indian company, scored and explained.</p><a class="ui-btn ui-btn--primary">Start free at finlitventures.com</a>';
    document.body.appendChild(d); });
  await sleep(300); const e0 = at(); await moveTo(page, 1500, 1000, 10); await sleep(3400); cuts.push({ url: "end", title: "End", from: e0, to: at() });
  const video = page.video(); await ctx.close(); const raw = await video.path(); await browser.close();
  fs.writeFileSync(path.join(WORK, "cuts.json"), JSON.stringify({ raw, cuts }, null, 1));
  return { raw, cuts };
}

function encode({ raw, cuts }, out) {
  const FADE = 0.4, vf = `crop=${W}:${CROP_H}:0:0,scale=1280:720:flags=lanczos,fps=30,format=yuv420p,setsar=1`;
  const parts = cuts.map((c, i) => `[0:v]trim=start=${c.from.toFixed(3)}:end=${c.to.toFixed(3)},setpts=PTS-STARTPTS,${vf}[s${i}]`);
  let last = "s0", off = 0;
  for (let i = 1; i < cuts.length; i++) { off += (cuts[i - 1].to - cuts[i - 1].from) - FADE; parts.push(`[${last}][s${i}]xfade=transition=fade:duration=${FADE}:offset=${off.toFixed(3)}[x${i}]`); last = `x${i}`; }
  execFileSync(FFMPEG, ["-y", "-v", "error", "-i", raw, "-filter_complex", parts.join(";"), "-map", `[${last}]`, "-an", "-c:v", "libx264", "-profile:v", "high", "-preset", "veryslow", "-tune", "stillimage",
    "-crf", process.env.CRF || "28", "-maxrate", "900k", "-bufsize", "1800k", "-g", "60", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out], { stdio: "inherit" });
}

// the poster: the FinLit Prism report card (the fundamental part) of RELIANCE, in a 16:9 picture, for each theme
async function posters() {
  const browser = await chromium.launch();
  for (const theme of ["light", "dark"]) {
    const PW = 1760;   // wide enough for a 16:9 frame round the whole card (the page keeps its own width)
    const ctx = await browser.newContext({ viewport: { width: PW, height: 1500 }, deviceScaleFactor: 1 }); await prepare(ctx, theme);
    const p = await ctx.newPage(); await open(p, "/prism/RELIANCE", 1500);
    await p.mouse.move(2, 1490);   // no hover state, no tooltip
    await p.addStyleTag({ content: ".upd,.toast,.toasts{display:none!important}" });
    const card = p.getByText("Fundamental analysis", { exact: true }).first();
    // the report card: the box that holds the fundamental part and the technical part, with the page around it, in a 16:9 frame below the sticky bars
    await p.evaluate((y) => scrollTo(0, y), (await topOf(p, card)) - 260); await sleep(800);
    // the outer card: the first box round the heading that is wide (both parts) and has rounded corners
    const shell = await card.evaluate((e) => { let x = e; while (x.parentElement && !(x.getBoundingClientRect().width >= 1000 && parseFloat(getComputedStyle(x).borderTopLeftRadius) > 0)) x = x.parentElement;
      const r = x.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    let h = Math.round(shell.h + 40), w = Math.round(Math.max(shell.w + 40, h * 16 / 9)); h = Math.round(w * 9 / 16);
    // the card in the middle of the picture, with only the page background beside it (the side rail is left out of the poster)
    await p.evaluate((left) => { for (const e of document.querySelectorAll("body *")) { const r = e.getBoundingClientRect(); if (r.width && r.right <= left + 1 && /fixed|sticky/.test(getComputedStyle(e).position)) e.style.visibility = "hidden"; } }, shell.x);
    const x = Math.max(0, Math.min(PW - w, Math.round(shell.x + shell.w / 2 - w / 2))), y = Math.max(0, Math.round(shell.y - (h - shell.h) / 2));
    const png = path.join(WORK, `poster-${theme}.png`); await p.screenshot({ path: png, clip: { x, y, width: w, height: h } });
    execFileSync(FFMPEG, ["-y", "-v", "error", "-i", png, "-vf", "scale=1280:720:flags=lanczos", "-c:v", "libwebp", "-quality", "82", "-compression_level", "6", path.join(OUT, `finlit-tour-${theme}-poster.webp`)]);
    await ctx.close();
  }
  await browser.close();
}

const only = process.env.ONLY || "all";
if (only === "all" || only === "video") { const r = await record(); encode(r, path.join(OUT, "finlit-tour-light-720p.mp4")); }
if (only === "encode") encode(JSON.parse(fs.readFileSync(path.join(WORK, "cuts.json"), "utf8")), path.join(OUT, "finlit-tour-light-720p.mp4"));
if (only === "all" || only === "posters") await posters();
console.log("done; work files in", WORK);
