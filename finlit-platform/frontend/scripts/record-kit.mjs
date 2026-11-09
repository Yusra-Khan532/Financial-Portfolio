// Toolkit for the feature walkthrough clips: a visible cursor with a click ripple, a pulsing highlight ring, and a numbered step caption, drawn on top of the
// real page while Playwright records it. Used by record-feature-demos.mjs.
import fs from "fs"; import { execFileSync } from "node:child_process";
export const PACE = 0.62;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** A pause that follows the clip pace (shorter for a snappier clip). */
export const nap = (ms) => sleep(ms * PACE);
export const W = 1280, H = 800;

export const OVERLAY = `(() => {
  if (window.__kit) return; window.__kit = true;
  const css = document.createElement("style");
  css.textContent = \`
  .kit-cur{position:fixed;z-index:2147483646;left:-40px;top:-40px;width:26px;height:26px;pointer-events:none;transition:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45))}
  .kit-rip{position:fixed;z-index:2147483645;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:3px solid #d9a63a;pointer-events:none;animation:kitrip .6s ease-out forwards}
  @keyframes kitrip{from{transform:scale(.6);opacity:.95}to{transform:scale(4.2);opacity:0}}
  .kit-ring{position:fixed;z-index:2147483644;pointer-events:none;border:3px solid #d9a63a;border-radius:12px;box-shadow:0 0 0 4px rgba(217,166,58,.28);animation:kitpulse 1.1s ease-in-out infinite}
  @keyframes kitpulse{50%{box-shadow:0 0 0 9px rgba(217,166,58,.1)}}
  .kit-cap{position:fixed;z-index:2147483647;left:50%;bottom:26px;transform:translateX(-50%);display:flex;align-items:center;gap:14px;max-width:min(1040px,92vw);padding:13px 22px 13px 14px;border-radius:16px;background:rgba(18,22,18,.94);color:#fff;font:600 21px/1.3 Inter,system-ui,sans-serif;box-shadow:0 18px 40px -12px rgba(0,0,0,.6);transition:opacity .25s,transform .25s}
  .kit-cap i{flex:none;display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#d9a63a;color:#1a1405;font:800 18px/1 Inter,system-ui,sans-serif;font-style:normal}
  .kit-cap.hide{opacity:0;transform:translateX(-50%) translateY(10px)}
  .kit-cap small{display:block;margin-top:2px;font:500 15px/1.35 Inter,system-ui,sans-serif;color:#d6d2c4}
  \`;
  document.documentElement.appendChild(css);
  const cur = document.createElement("div"); cur.className = "kit-cur";
  cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 9-6.5 1.6L9 19z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  document.documentElement.appendChild(cur);
  addEventListener("mousemove", (e) => { cur.style.left = e.clientX - 3 + "px"; cur.style.top = e.clientY - 2 + "px"; }, true);
  addEventListener("mousedown", (e) => { const r = document.createElement("div"); r.className = "kit-rip"; r.style.left = e.clientX + "px"; r.style.top = e.clientY + "px"; document.documentElement.appendChild(r); setTimeout(() => r.remove(), 700); }, true);
  const cap = document.createElement("div"); cap.className = "kit-cap hide"; document.documentElement.appendChild(cap);
  window.__cap = (n, text, sub) => { cap.classList.add("hide"); setTimeout(() => { cap.innerHTML = (n ? "<i>" + n + "</i>" : "") + "<div>" + text + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; cap.classList.remove("hide"); }, 200); };
  window.__nocap = () => cap.classList.add("hide");
  let ring = null;
  window.__ring = (x, y, w, h) => { window.__unring(); ring = document.createElement("div"); ring.className = "kit-ring"; Object.assign(ring.style, { left: x - 6 + "px", top: y - 6 + "px", width: w + 12 + "px", height: h + 12 + "px" }); document.documentElement.appendChild(ring); };
  window.__unring = () => { if (ring) ring.remove(); ring = null; };
})();`;


/** Opens the page and starts capturing frames from Chrome's own screencast (each with its real timestamp), so the clip can be built at a constant frame rate. */
export async function newClip(browser, id, { url, plan = "gold", mock, out }) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, colorScheme: "light" });
  const p = await ctx.newPage();
  await p.addInitScript((pl) => { try { localStorage.setItem("finlit-plan", pl); localStorage.setItem("finlit-theme", "light"); } catch {} }, plan);
  if (mock) await mock(p);
  await p.goto(url, { waitUntil: "load" }); await sleep(3200); await p.evaluate(OVERLAY);
  await p.addStyleTag({ content: "*{scroll-behavior:auto!important} .prep-toast,.toast,.demo-bar,.planseg,.alx-toasts,.alx-toast,.ai-fab{display:none!important} ::-webkit-scrollbar{width:0!important;height:0!important}" });
  const cdp = await ctx.newCDPSession(p); const frames = []; let on = false;
  cdp.on("Page.screencastFrame", (f) => { if (on) frames.push({ t: f.metadata.timestamp, data: f.data }); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 90, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  return { ctx, p, cdp, frames, id, out, begin: () => { on = true; frames.length = 0; } };
}
export const cap = async (p, n, text, sub) => { await p.evaluate(([a, b, c]) => window.__cap(a, b, c), [n, text, sub]); await sleep(500); };
export const nocap = (p) => p.evaluate(() => window.__nocap());
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let cx = 640, cy = 400;
/** Move the cursor along a smooth path at about 60 moves a second (so it never jumps). */
export async function moveTo(p, x, y, ms = 750) {
  const n = Math.max(8, Math.round(ms / 16)), x0 = cx, y0 = cy;
  for (let i = 1; i <= n; i++) { const t = ease(i / n); await p.mouse.move(x0 + (x - x0) * t, y0 + (y - y0) * t); await sleep(16); }
  cx = x; cy = y;
}
/** Scroll the page by px over ms, eased, one move per display frame. */
export const scrollBy = (p, px, ms = 1400) => p.evaluate(([d, t]) => new Promise((res) => {
  const s = scrollY, t0 = performance.now(), e = (v) => (v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2);
  const step = (now) => { const k = Math.min(1, (now - t0) / t); scrollTo(0, s + d * e(k)); k < 1 ? requestAnimationFrame(step) : res(); }; requestAnimationFrame(step);
}), [px, ms]);
const box = async (p, loc) => { const l = typeof loc === "string" ? p.locator(loc).first() : loc; const ok = await l.evaluate((el) => { const r = el.getBoundingClientRect(); if (r.top < 90 || r.bottom > innerHeight - 110) { window.scrollTo(0, scrollY + r.top - innerHeight / 2 + r.height / 2); } return true; }, null, { timeout: 2500 }).catch(() => false); if (!ok) return null; await sleep(350); return l.boundingBox(); };
/** Glide to an element, highlight it, optionally click it. Returns false when the element is not on the page. */
export async function hit(p, loc, { click = true, wait = 1300, at = [0.5, 0.5], ring = true } = {}) {
  const l = typeof loc === "string" ? p.locator(loc).first() : loc;
  const b = await box(p, l);
  if (!b) { console.log("   missing:", String(loc).slice(0, 70)); return false; }
  await moveTo(p, b.x + b.width * at[0], b.y + b.height * at[1]);
  if (ring) await p.evaluate(([a, b2, c, d]) => window.__ring(a, b2, c, d), [b.x, b.y, b.width, b.height]);
  await sleep(520);
  if (click) { await p.mouse.down(); await sleep(70); await p.mouse.up(); await p.evaluate(() => window.__unring()); }
  await nap(wait);
  return true;
}
export const unring = (p) => p.evaluate(() => window.__unring());
export const toId = async (p, id, off = 130) => { await p.evaluate(([i, o]) => { const e = document.getElementById(i); if (e) window.scrollTo({ top: e.getBoundingClientRect().top + scrollY - o, behavior: "instant" }); }, [id, off]); await sleep(600); };

/** Stop, and build <out>/<id>.mp4 (constant 30 fps, from the frames' own timestamps) and <id>.jpg (a poster from the middle). */
export async function finish(c) {
  await c.cdp.send("Page.stopScreencast").catch(() => {}); const fr = c.frames; await c.ctx.close();
  if (fr.length < 5) throw new Error("no frames for " + c.id);
  const dir = c.out + c.id + "_frames/"; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let list = "";
  fr.forEach((f, i) => { const name = `f${String(i).padStart(5, "0")}.jpg`; fs.writeFileSync(dir + name, Buffer.from(f.data, "base64")); const next = i + 1 < fr.length ? fr[i + 1].t : f.t + 0.4; list += `file '${name}'\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`; });
  list += `file 'f${String(fr.length - 1).padStart(5, "0")}.jpg'\n`;
  fs.writeFileSync(dir + "list.txt", list);
  const secs = fr[fr.length - 1].t - fr[0].t + 0.4;
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", dir + "list.txt", "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "24", "-preset", "slow", "-movflags", "+faststart", "-an", c.out + c.id + ".mp4"]);
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(Math.min(secs * 0.45, secs - 1)), "-i", c.out + c.id + ".mp4", "-frames:v", "1", "-q:v", "4", c.out + c.id + ".jpg"]);
  fs.rmSync(dir, { recursive: true, force: true });
  return { secs, frames: fr.length, fps: fr.length / secs };
}

/** Open another page inside the clip without a reload (so the cursor and captions stay, and there is no blank flash). */
export async function go(p, url) { await p.evaluate((u) => { history.pushState({}, "", u); dispatchEvent(new PopStateEvent("popstate")); window.scrollTo(0, 0); }, new URL(url).pathname); await sleep(1600); }
