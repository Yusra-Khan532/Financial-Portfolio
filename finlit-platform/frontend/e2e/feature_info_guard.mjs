// FEATURE (i) GUARD (task #51): hovers and presses EVERY feature (i) on the Plans page and the home page, on a desktop, a laptop and a phone, and fails when
//   - an (i) is not visible, or hovering it shows no preview, or the preview is off screen, or it vanishes when the pointer moves onto it;
//   - pressing it opens nothing, the player has no media, the recording does not load, or Esc does not close it.
//
//   npm run build && npm run preview -- --port 4173      (a normal build: the Plans page needs no server)
//   npm run feature-info-guard -- http://127.0.0.1:4173
import { chromium } from "playwright";
const BASE = (process.argv[2] || "http://localhost:4173").replace(/\/$/, "");
const b = await chromium.launch({ args: ["--disable-webgl", "--autoplay-policy=no-user-gesture-required"] });
let bad = 0;
for (const [name, opts] of [["desktop", { viewport: { width: 1360, height: 900 } }], ["laptop", { viewport: { width: 1100, height: 700 } }], ["phone", { viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true }]]) {
  for (const path of ["/plans", "/"]) {
    const ctx = await b.newContext(opts); const p = await ctx.newPage(); const errs = [];
    p.on("pageerror", (e) => errs.push(String(e)));
    await p.goto(BASE + path, { waitUntil: "load" }); await p.waitForTimeout(3500);
    if (path === "/") { await p.locator(".plan-all").first().click().catch(() => {}); await p.waitForTimeout(500); }
    const n = await p.locator(".fd-trig").count(); let ok = 0; const fails = [];
    for (let k = 0; k < n; k++) {
      const i = p.locator(".fd-trig").nth(k);
      const label = await i.getAttribute("aria-label");
      try {
        await i.scrollIntoViewIfNeeded({ timeout: 2000 });
        if (!(await i.isVisible())) { fails.push(label + ": not visible"); continue; }
        if (name !== "phone") {
          const bb = await i.boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 5 });
          await p.waitForTimeout(450);
          const peek = p.locator(".fd-peek"); if (!(await peek.count())) { fails.push(label + ": no preview on hover"); await p.mouse.move(5, 5); continue; }
          const pb = await peek.boundingBox();
          if (pb.x < 0 || pb.y < 0 || pb.x + pb.width > opts.viewport.width + 1 || pb.y + pb.height > opts.viewport.height + 1) fails.push(label + ": preview off screen " + JSON.stringify(pb));
          // move onto the preview like a person does: it must still be there afterwards
          await p.mouse.move(pb.x + pb.width / 2, pb.y + pb.height / 2, { steps: 12 }); await p.waitForTimeout(700);
          if (!(await p.locator(".fd-peek").count())) fails.push(label + ": preview vanished when the pointer moved onto it");
          await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 5 }); await p.waitForTimeout(100);
        }
        await i.click(); await p.waitForTimeout(500);
        const dlg = p.locator(".fd-dlg");
        if (!(await dlg.count())) { fails.push(label + ": click opened nothing"); continue; }
        const media = await p.evaluate(() => { const v = document.querySelector(".fd-dlg video"), im = document.querySelector(".fd-dlg img"); if (v) return { kind: "video", ready: v.readyState, w: v.videoWidth, err: !!v.error, paused: v.paused }; if (im) return { kind: "img", ok: im.complete && im.naturalWidth > 0 }; return null; });
        await p.waitForTimeout(700);
        const m2 = await p.evaluate(() => { const v = document.querySelector(".fd-dlg video"); return v ? { ready: v.readyState, w: v.videoWidth, err: !!v.error } : null; });
        if (!media) fails.push(label + ": no media in the player");
        else if (media.kind === "video" && (m2.err || m2.w === 0)) fails.push(label + ": video did not load " + JSON.stringify(m2));
        else if (media.kind === "img" && !media.ok) fails.push(label + ": picture did not load");
        else ok++;
        await p.keyboard.press("Escape"); await p.waitForTimeout(150);
        if (await p.locator(".fd-dlg").count()) fails.push(label + ": Esc did not close");
      } catch (e) { fails.push(label + ": " + String(e).slice(0, 90)); }
    }
    bad += fails.length;
    console.log(name.padEnd(8), path.padEnd(7), "(i):", n, "ok:", ok, "problems:", fails.length, errs.slice(0, 1)); fails.slice(0, 8).forEach((f) => console.log("   -", f));
    await ctx.close();
  }
}
await b.close(); console.log(bad ? "PROBLEMS FOUND: " + bad : "ALL GOOD"); process.exit(bad ? 1 : 0);
