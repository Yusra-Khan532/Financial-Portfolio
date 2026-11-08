// Re-shoots the feature clips behind the (i) on the Plans page (task #51), from the demo build, so they always show the real pages.
//   1. VITE_DEMO=1 npx vite build --outDir /tmp/finlit-demo && npx vite preview --outDir /tmp/finlit-demo --port 4174
//   2. node scripts/record-feature-demos.mjs [id ...]     (writes /tmp/finlit-demo-raw/<id>.webm and <id>.json)
//   3. for each id: ffmpeg -ss <start> -t <len, at most 13.5> -i <id>.webm -vf "scale=960:-2,fps=24" -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart -an public/plans/demos/<id>.mp4
//      and a poster: ffmpeg -ss <start+1.5> -i <id>.webm -frames:v 1 -vf scale=960:-2 -q:v 5 public/plans/demos/<id>.jpg
// The Gold clips adv-screener, prism, fund-health and portfolio are cut from public/landing/finlit-tour-720p.mp4 (seconds 0.3-7.7, 14-19.8, 30.1-33.9, 34.2-39.8, slowed to about 10 s).
import { chromium } from "playwright"; import fs from "fs";
const OUT = "/tmp/finlit-demo-raw/"; fs.mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:4174";
const W = 1280, H = 800, LEN = 12000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const glide = async (p, px, ms) => { const steps = Math.max(1, Math.round(ms / 40)); for (let i = 0; i < steps; i++) { await p.evaluate((d) => window.scrollBy(0, d), px / steps); await sleep(40); } };
const toId = async (p, id, off = 150) => { await p.evaluate(([i, o]) => { const e = document.getElementById(i); if (e) window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - o, behavior: "instant" }); }, [id, off]); };
const click = async (p, sel) => { try { await p.locator(sel).first().click({ timeout: 1500 }); } catch {} };
const CLIPS = {
  overview: { url: "/stocks/RELIANCE", run: async (p) => { await sleep(2500); await glide(p, 1100, 8500); } },
  iq: { url: "/stocks/RELIANCE", prep: async (p) => { await toId(p, "prism", 120); }, run: async (p) => { await sleep(2500); await glide(p, 250, 2500); await sleep(1500); await glide(p, 600, 5500); } },
  price: { url: "/stocks/RELIANCE", prep: async (p) => { await toId(p, "price"); }, run: async (p) => { await sleep(1500); for (const r of ["1M", "6M", "3Y", "1Y"]) { await click(p, `#price button:text-is("${r}")`); await sleep(1700); } await glide(p, 400, 3000); } },
  quarter: { url: "/stocks/RELIANCE", prep: async (p) => { await toId(p, "quarter"); }, run: async (p) => { await sleep(1500); await glide(p, 1300, 10000); } },
  financials: { url: "/stocks/RELIANCE", prep: async (p) => { await toId(p, "financials"); }, run: async (p) => { await sleep(1500); await click(p, '#financials button:has-text("Balance sheet")'); await sleep(2500); await click(p, '#financials button:has-text("Cash flow")'); await sleep(2500); await glide(p, 600, 5000); } },
  ratios: { url: "/stocks/RELIANCE", prep: async (p) => { await toId(p, "ratios"); }, run: async (p) => { await sleep(1500); await glide(p, 1500, 10000); } },
  ownership: { url: "/stocks/RELIANCE", prep: async (p) => { await toId(p, "ownership"); }, run: async (p) => { await sleep(1500); await glide(p, 1200, 10000); } },
  peers: { url: "/stocks/RELIANCE", prep: async (p) => { await toId(p, "peers"); }, run: async (p) => { await sleep(1500); await glide(p, 1000, 10000); } },
  screener: { url: "/screener", run: async (p) => { await sleep(2500); await glide(p, 500, 4000); await glide(p, -300, 2000); await sleep(3000); } },
  glossary: { url: "/glossary", run: async (p) => { await sleep(1500); const s = p.locator('input[type="search"], input[placeholder*="earch"]').first(); try { await s.click({ timeout: 1500 }); for (const ch of "price to earnings") { await s.type(ch); await sleep(110); } } catch {} await sleep(2000); await glide(p, 500, 5000); } },
  flows: { url: "/fii-dii", run: async (p) => { await sleep(2500); await glide(p, 1200, 9000); } },
  dcf: { url: "/dcf", prep: async (p) => { await toId(p, "dcf-in-h", 90); }, run: async (p) => { await sleep(1500); const box = p.locator(".dcf-sl-box input").nth(1); try { for (const v of ["12", "15", "18"]) { await box.fill(v, { timeout: 1500 }); await sleep(1500); } } catch {} await glide(p, 900, 5500); } },
};
const want = process.argv.slice(2);
const b = await chromium.launch({ args: ["--disable-webgl"] });
for (const [id, c] of Object.entries(CLIPS)) {
  if (want.length && !want.includes(id)) continue;
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: "light", recordVideo: { dir: OUT + id, size: { width: W, height: H } } });
  const t0 = Date.now(); const p = await ctx.newPage();
  await p.addInitScript(() => { try { localStorage.setItem("finlit-plan", "gold"); } catch {} });
  await p.goto(BASE + c.url, { waitUntil: "load" }); await sleep(3500);
  await p.addStyleTag({ content: "*{scroll-behavior:auto!important} .prep-toast,.toast,.demo-banner,.alx-toasts,.alx-toast{display:none!important}" });
  if (c.prep) await c.prep(p); await sleep(800);
  const start = (Date.now() - t0) / 1000;
  await c.run(p); const end = (Date.now() - t0) / 1000;
  const v = p.video(); await ctx.close(); const path = await v.path();
  fs.renameSync(path, OUT + id + ".webm"); fs.writeFileSync(OUT + id + ".json", JSON.stringify({ start, len: Math.min(LEN / 1000 + 1, end - start) }));
  console.log(id, start.toFixed(1), (end - start).toFixed(1));
}
await b.close();
