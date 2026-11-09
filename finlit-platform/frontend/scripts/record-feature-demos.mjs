// Feature walkthrough clips for the (i) on the Plans page (task #51): real pages of the demo build, a visible cursor, a highlight ring on what is pressed,
// and a numbered caption for every step. Run: node clips.mjs [id ...]. Output: OUT/<id>.mp4 + <id>.jpg (constant 30 fps, 1280x800).
import { chromium } from "playwright"; import fs from "fs";
import { newClip, cap, nocap, hit, moveTo, scrollBy, toId, unring, sleep as realSleep, nap, finish, go } from "./record-kit.mjs";
const sleep = nap;   // pauses inside a walkthrough follow the clip pace
const OUT = process.env.OUT || "/tmp/finlit-demo-out/"; fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4174";
const S = "/stocks/RELIANCE";
const tab = (id) => `#secnav a[data-s="${id}"]`;

const CLIPS = {
  overview: { url: S, run: async (p) => {
    await cap(p, 1, "One page for any listed company", "Price, scores, notes and every statement"); await moveTo(p, 400, 300, 900); await sleep(1500);
    await scrollBy(p, 520, 1800); await sleep(900);
    await cap(p, 2, "Jump to any section from the bar"); await hit(p, tab("price"), { wait: 2200 });
    await hit(p, tab("financials"), { wait: 2200 });
    await cap(p, 3, "Every section explains itself", "Each figure says what it means"); await scrollBy(p, 700, 2600); await sleep(1200); } },
  iq: { url: S, run: async (p) => {
    await cap(p, 1, "The FinLit IQ: one score out of 100", "Built from five pillars"); await hit(p, ".dial, .score-ring, [aria-label^='FinLit IQ']", { click: false, wait: 2600 });
    await cap(p, 2, "Quality, Growth, Profitability, Balance sheet, Technical", "Each pillar is scored on its own"); await scrollBy(p, 360, 1800); await sleep(2000);
    await cap(p, 3, "Strengths and watch-outs in plain words"); await hit(p, tab("notes"), { wait: 1500 }); await scrollBy(p, 300, 1600); await sleep(2200); } },
  price: { url: S, prep: async (p) => { await toId(p, "price"); }, run: async (p) => {
    await cap(p, 1, "Pick a time range"); await hit(p, '[aria-label=Range] button:text-is("1M")', { wait: 1800 }); await hit(p, '[aria-label=Range] button:text-is("3Y")', { wait: 2000 });
    await cap(p, 2, "Switch the averages and volume on or off"); await hit(p, 'button:text-is("EMA 200")', { wait: 1800 }); await hit(p, 'button:text-is("EMA 50")', { wait: 1800 });
    await cap(p, 3, "Trend and momentum readings sit beside the chart"); await scrollBy(p, 260, 1400); await sleep(2000); } },
  quarter: { url: S, prep: async (p) => { await toId(p, "quarter"); }, run: async (p) => {
    await cap(p, 1, "The newest quarter at a glance"); await sleep(2000);
    await cap(p, 2, "Against last quarter (QoQ) and a year ago (YoY)"); await scrollBy(p, 360, 1800); await sleep(2600);
    await cap(p, 3, "Plus how sales, profit and cash have moved"); await scrollBy(p, 520, 2200); await sleep(1800); } },
  financials: { url: S, prep: async (p) => { await toId(p, "financials"); }, run: async (p) => {
    await cap(p, 1, "Profit and loss, year by year"); await sleep(2300);
    await cap(p, 2, "Switch to the balance sheet"); await hit(p, 'button:text-is("Balance sheet")', { wait: 2400 });
    await cap(p, 3, "Then cash flow"); await hit(p, 'button:text-is("Cash flow")', { wait: 2400 });
    await cap(p, 4, "Quarterly view too"); await hit(p, 'button:text-is("Quarterly")', { wait: 2400 }); } },
  ratios: { url: S, prep: async (p) => { await toId(p, "ratios"); }, run: async (p) => {
    await cap(p, 1, "Valuation, returns, margins and debt in six meters"); await sleep(2400);
    await cap(p, 2, "Every ratio over the years, best years in green"); await scrollBy(p, 620, 2400); await sleep(2600);
    await cap(p, 3, "Each row explains what the change means"); await scrollBy(p, 520, 2200); await sleep(2000); } },
  ownership: { url: S, prep: async (p) => { await toId(p, "ownership"); }, run: async (p) => {
    await cap(p, 1, "Who owns the company"); await sleep(2300);
    await cap(p, 2, "Promoters, institutions and the public, quarter by quarter"); await scrollBy(p, 440, 2200); await sleep(2400);
    await cap(p, 3, "See who bought or sold"); await scrollBy(p, 520, 2200); await sleep(2000); } },
  peers: { url: S, prep: async (p) => { await toId(p, "peers"); }, run: async (p) => {
    await cap(p, 1, "Companies in the same industry, side by side"); await sleep(2500);
    await cap(p, 2, "Size, growth, returns and valuation"); await scrollBy(p, 400, 2200); await sleep(2600);
    await cap(p, 3, "Where it stands inside its industry"); await scrollBy(p, 480, 2200); await sleep(2000); } },
  screener: { url: "/screener", run: async (p) => {
    await cap(p, 1, "Start from a ready-made screen"); await hit(p, '[role=tab]:has-text("Quick screens")', { wait: 1500 }); await hit(p, 'text=Large, established companies', { wait: 2600 });
    await cap(p, 2, "Or set your own filters", "Size, valuation, growth and more"); await hit(p, 'button:has-text("Filters"), [role=tab]:has-text("Filters")', { wait: 1500 }); await hit(p, 'input[placeholder="Min"]', { click: true, wait: 600 }); await p.keyboard.type("50000", { delay: 120 }); await sleep(1800);
    await cap(p, 3, "The matches update at once"); await scrollBy(p, 360, 1800); await sleep(2400); } },
  glossary: { url: "/glossary", run: async (p) => {
    await cap(p, 1, "Type any finance word"); const s = p.locator('input[type="search"], input[placeholder*="earch"]').first(); await hit(p, s, { wait: 300 }); await p.keyboard.type("return on equity", { delay: 120 }); await sleep(1600);
    await cap(p, 2, "Get the meaning, why it matters and how to use it"); await scrollBy(p, 260, 1500); await sleep(2800);
    await cap(p, 3, "With the formula where there is one"); await scrollBy(p, 280, 1600); await sleep(2200); } },
  flows: { url: "/fii-dii", run: async (p) => {
    await cap(p, 1, "What foreign and domestic institutions did today"); await sleep(2600);
    await cap(p, 2, "Streaks and totals over 30 sessions"); await scrollBy(p, 560, 2200); await sleep(2600);
    await cap(p, 3, "Years of history, month by month"); await scrollBy(p, 820, 2600); await sleep(2200); } },
  dcf: { url: "/dcf", prep: async (p) => { await toId(p, "dcf-in-h", 90); }, run: async (p) => {
    await cap(p, 1, "Change an assumption", "Here: growth for the first five years"); const b = p.locator(".dcf-sl-box input").nth(1); await hit(p, b, { click: true, wait: 400 }); await p.keyboard.press("Control+A"); await p.keyboard.type("16", { delay: 160 }); await sleep(1800);
    await cap(p, 2, "The intrinsic value updates at once"); await hit(p, ".dcf-live", { click: false, wait: 2600 });
    await cap(p, 3, "Pick a margin of safety"); await hit(p, '.dcf-chips button:has-text("High")', { wait: 1800 });
    await cap(p, 4, "Every step of the working is shown below"); await scrollBy(p, 900, 2600); await sleep(1500); } },
  "adv-screener": { url: "/advanced-score-screener", run: async (p) => {
    await cap(p, 1, "Ready-made screens on the Prism rating"); await sleep(1500); await hit(p, 'text=Highest-rated mid caps', { wait: 2400 });
    await cap(p, 2, "Each company's score, rating and technical views"); await hit(p, 'text=Highest-rated small caps', { wait: 2800 });
    await cap(p, 3, "Plus screens by trend, growth and theme"); await hit(p, 'text=Themes', { wait: 2400 }); } },
  prism: { url: S, prep: async (p) => { await toId(p, "prism", 120); }, run: async (p) => {
    await cap(p, 1, "FinLit Prism: financial health in four parts"); await sleep(3000);
    await cap(p, 2, "Growth & Profitability, Valuation, Quality and Risk"); await scrollBy(p, 240, 1600); await sleep(2500);
    await cap(p, 3, "Short and long-term technical views, kept apart"); await scrollBy(p, 380, 2000); await sleep(2800); } },
  portfolio: { url: "/holdings", run: async (p) => {
    await cap(p, 1, "Add your shares by name"); await hit(p, 'input[placeholder*="Add a share"]', { wait: 300 }); await p.keyboard.type("RELIANCE", { delay: 140 }); await sleep(900); await hit(p, 'button:text-is("Add")', { wait: 2200 });
    await cap(p, 2, "Each share's score, and your list's average"); await scrollBy(p, 400, 2000); await sleep(2600);
    await cap(p, 3, "Sector and size mix, and how spread your list is"); await scrollBy(p, 700, 2400); await sleep(2000); } },
  compare: { url: "/compare?symbols=RELIANCE,SMP-ENE2", run: async (p) => {
    await cap(p, 1, "Pick two companies (four on Gold)"); await sleep(2800);
    await cap(p, 2, "Financials, valuation and a spider view of the scores"); await hit(p, '[role=tab]:has-text("Spider"), button:has-text("Spider")', { wait: 2600 });
    await hit(p, '[role=tab]:has-text("Valuation"), button:has-text("Valuation")', { wait: 2400 });
    await cap(p, 3, "Quality, growth and technical tabs"); await hit(p, '[role=tab]:has-text("Growth"), button:has-text("Growth")', { wait: 2200 }); } },
  alerts: { url: "/alerts", run: async (p) => {
    await cap(p, 1, "Your alerts and what they watch"); await sleep(2500);
    await cap(p, 2, "Create one: a price, a ratio, a score or a new filing"); await hit(p, 'button:has-text("Create alert")', { wait: 2600 });
    await cap(p, 3, "Choose the condition and where to be told", "In the app, by email or in your browser"); await sleep(2800); } },
  watchlists: { url: "/watchlist", run: async (p) => {
    await cap(p, 1, "Your lists, with each company's score"); await sleep(2500);
    await cap(p, 2, "Group by industry or size"); await hit(p, 'select >> nth=0', { click: false, wait: 800 }); await sleep(1800);
    await cap(p, 3, "Add notes and price levels to any stock"); await scrollBy(p, 520, 2200); await sleep(2400); } },
  calendars: { url: "/results", run: async (p) => {
    await cap(p, 1, "When companies report results"); await sleep(2600);
    await cap(p, 2, "Open IPOs and upcoming issues"); await go(p, BASE + "/ipo"); await cap(p, 2, "Open IPOs and upcoming issues"); await sleep(2600);
    await cap(p, 3, "And company filings as they land"); await go(p, BASE + "/news"); await cap(p, 3, "And company filings as they land"); await sleep(2600); } },
  "iq-table": { url: "/score-screener", run: async (p) => {
    await cap(p, 1, "Every listed company with its FinLit IQ"); await sleep(2400);
    await cap(p, 2, "Sort by any pillar"); await hit(p, 'th button:has-text("Growth")', { wait: 2200 });
    await cap(p, 3, "Filter by size, sector and score"); await hit(p, 'button:has-text("Sector")', { wait: 2200 }); } },
  outlook: { url: "/outlook/RELIANCE", run: async (p) => {
    await cap(p, 1, "Estimates from the company's own history and its sector"); await sleep(2600);
    await cap(p, 2, "Choose a horizon: short, mid or long term"); await hit(p, 'button:has-text("Mid-term")', { wait: 2600 }); await hit(p, 'button:has-text("Long-term")', { wait: 2400 });
    await cap(p, 3, "Two models side by side, with the reasons"); await scrollBy(p, 620, 2400); await sleep(2000); } },
  downloads: { url: S, run: async (p) => {
    await cap(p, 1, "Save a company report"); await hit(p, 'button:has-text("Download"), a:has-text("Download")', { wait: 2800 });
    await cap(p, 2, "A PDF note, an offline copy or a CSV"); await sleep(2800);
    await cap(p, 3, "Tables have their own CSV button"); await p.keyboard.press("Escape"); await toId(p, "ratios", 120); await sleep(2800); } },
  segments: { url: S, prep: async (p) => { await toId(p, "segments"); }, run: async (p) => {
    await cap(p, 1, "Where the revenue and profit come from"); await sleep(2800);
    await cap(p, 2, "Segment by segment, over the years"); await scrollBy(p, 440, 2200); await sleep(2800);
    await cap(p, 3, "How the mix has shifted"); await scrollBy(p, 520, 2200); await sleep(2000); } },
  "gold-dash": { url: "/premium", run: async (p) => {
    await cap(p, 1, "Gold dashboards: four tools for serious investors", "Fast to open, always up to date"); await sleep(2600);
    await cap(p, 2, "FinLit Prism, company financials, market events and the option chain"); await hit(p, '.pm-card >> nth=0', { click: false, wait: 1600 }); await hit(p, '.pm-card >> nth=1', { click: false, wait: 1800 });
    await cap(p, 3, "Each one opens with a short guide to reading it"); await scrollBy(p, 520, 2200); await sleep(2200);
    await scrollBy(p, 520, 2200); await sleep(1500); } },
  options: { url: "/premium/options", run: async (p) => {
    await cap(p, 1, "Pick an index or an F&O stock"); await sleep(3200);
    await cap(p, 2, "Open interest, volume and implied volatility by strike"); await scrollBy(p, 520, 2200); await sleep(2600);
    await cap(p, 3, "Put-call ratio and max pain, worked out for you"); await scrollBy(p, 620, 2200); await sleep(2000); } },
};
const want = process.argv.slice(2);
const b = await chromium.launch({ args: ["--disable-webgl"] });
for (const [id, c] of Object.entries(CLIPS)) {
  if (want.length && !want.includes(id)) continue;
  try {
    const k = await newClip(b, id, { url: BASE + c.url, out: OUT });
    if (c.prep) await c.prep(k.p); await realSleep(700); k.begin();
    await c.run(k.p); await nocap(k.p); await realSleep(500);
    const r = await finish(k); console.log(id.padEnd(14), r.secs.toFixed(1) + "s", r.frames + " frames", r.fps.toFixed(0) + " fps");
  } catch (e) { console.log(id, "FAILED", String(e).slice(0, 120)); }
}
await b.close();
