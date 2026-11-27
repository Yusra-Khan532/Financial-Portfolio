// SIP calculator: the formula sheet's example, typed input, step-up, the share link and phone width.
//   node e2e/sip.mjs http://localhost:4173
import { chromium } from "playwright";
const B = process.argv[2] || "http://localhost:4173";
let fails = 0; const check = (n, ok, x = "") => { if (!ok) fails++; console.log((ok ? "PASS " : "FAIL ") + n + (x ? " — " + x : "")); };
const b = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(String(e).slice(0, 160)));
await p.goto(B + "/sip-calculator", { waitUntil: "networkidle" });
await p.waitForTimeout(700);
const big = async () => (await p.locator(".sip-big b").innerText()).trim();
check("₹2,500 a month, 10 years, 12%: ₹5,75,097 (formula sheet)", (await big()) === "₹5,75,097", await big());
check("invested ₹3,00,000", (await p.locator(".sip-kv").first().locator("b").innerText()) === "₹3,00,000");
const box = p.locator(".sip-f").first().locator(".sip-box input");
await box.fill("10,000"); await box.press("Enter"); await p.waitForTimeout(700);
check("typed ₹10,000 a month gives ₹23,00,387", (await big()) === "₹23,00,387", await big());
await p.click("text=More options"); await p.click("role=radio[name='By %']"); await p.waitForTimeout(700);
check("10% yearly step-up changes the result", (await big()) !== "₹23,00,387", await big());
await p.waitForTimeout(400);
check("the address carries the plan", /p=10000/.test(p.url()) && /sk=pct/.test(p.url()), p.url());
const again = await b.newPage(); await again.goto(p.url(), { waitUntil: "networkidle" }); await again.waitForTimeout(700);
check("the link reopens the same result", (await again.locator(".sip-big b").innerText()).trim() === (await big()));
await p.click("text=Goal planner"); check("goal planner shows a monthly amount", /a month/.test(await p.locator(".sip-gc").first().innerText()));
// task #424: the disclaimer is a drop-down; closed, it still reads "Disclaimer" and "Information only, not investment advice."
const dsc = p.locator("details.sip-dsc");
check("disclaimer starts closed", (await dsc.evaluate((d) => d.open)) === false);
check("closed row reads as a disclaimer", /^Disclaimer\s+Information only, not investment advice\.\s+Show$/.test((await dsc.locator("summary").innerText()).trim()), await dsc.locator("summary").innerText());
await dsc.locator("summary").focus(); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
check("Enter on the row opens it (keyboard)", (await dsc.evaluate((d) => d.open)) === true);
check("the full wording is there once open", /A SIP calculator assumes the same return every month; real funds go up and down, and past returns do not guarantee future returns\. Mutual fund investments are subject to market risks; read all scheme-related documents carefully\./.test(await dsc.innerText()));
const m = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
await m.goto(B + "/sip-calculator", { waitUntil: "networkidle" });
check("no sideways scroll at 390 px", (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
check("no page errors", p.errs.length === 0, p.errs.join(" | "));
await b.close(); console.log(fails ? `${fails} FAILED` : "ALL PASSED"); process.exit(fails ? 1 : 0);
