// The page's markup: the sections the script fills by id (reference: the design team's stress-lab handover, build_page.py). The title, breadcrumb and plan tag come from the site's page header.
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const ib = (text: string, pos = "lt", label = "About this") =>
  `<span class="ib" tabindex="0" role="button" aria-expanded="false" aria-label="${esc(label)}"><span class="ibi" aria-hidden="true">i</span><span class="tip ${pos}" role="tooltip">${text}</span></span>`;

/** The rupee source the numbers really came from (backend page.py FX_SOURCE_WORDS): never one they did not. */
export function fxSourceWords(src?: string | null): string {
  if (src === "usdinr argument") return "monthly averages from x-rates.com for the base window (until FinLit's own FBIL series is filled), then the FBIL reference rate";
  return "FBIL reference rate, published by the RBI";
}

const HOW = (fx: string, basis: string) => `<details class="fold" style="border-top:0;margin-top:0;padding-top:0"><summary style="font:600 20px/1.3 'Source Serif 4',Georgia,serif;color:var(--ink)">How the model works, and what it leaves out</summary>
<div class="how" style="margin-top:12px">
<h3>What it does</h3>
<p>Stress Lab starts from the company's last four reported quarters. It applies one shock, held for 12 months, and works through what it does to volumes, costs, prices, interest and tax, then to earnings per share, interest cover and an earnings-based value.</p>
<ul>
<li><b>Volumes</b> move with demand, scaled by how strongly this company's volumes have followed the economy.</li>
<li><b>Input costs</b> move with crude in rupees, the rupee for imported materials, metals and farm prices, and wholesale inflation for materials bought in India. Wages and services follow consumer inflation.</li>
<li><b>Prices</b> recover part of any cost rise within the year. The share is estimated from the company's own past shock years and pulled towards its industry when there are few of them. Export sales earn more when the rupee is weaker.</li>
<li><b>Interest</b> on floating-rate debt and income on cash move with rates. Tax is at the rate the company paid over the four quarters.</li>
<li class="vmove"><b>Value</b> discounts earnings at a cost of equity that rises with long-term rates and investor caution. It is a rough guide to how the shock reaches value, not a price estimate.</li>
</ul>
<h3>Today</h3>
<p>The company earned its last four quarters under that year's conditions. So the Today shock is the gap between conditions now and their average over the same 12 months, held for a year. "Crude eases" swaps today's crude price for the U.S. EIA outlook.</p>
<h3>What it leaves out</h3>
<ul>
<li>Competitors' reactions, changes in product mix, hedging, and second-round effects on the whole economy. Demand is an input, not an outcome of the other shocks.</li>
<li>Timing: costs reach the income statement with a delay, and prices follow later, so a hit tends to show over several quarters.</li>
<li>The company settings are estimates; each one shows where it came from, and you can try your own.</li>
<li>Not covered yet: banks, NBFCs and insurers, and companies with fewer than three years of results. Loss-making companies get a score from EBITDA only.</li>
</ul>
<h3>Sources</h3>
<p>Company figures: reported quarterly and annual results, ${esc(basis)}. Brent crude: U.S. Energy Information Administration. Inflation and GDP: MoSPI and the Office of the Economic Adviser. Repo rate: RBI. Rupee: ${esc(fx)}. Share prices in past shocks: NSE.</p>
</div></details>`;

/** "2026-11-13" -> "13 Nov 2026" (anything that is not an ISO date is kept as it is). */
const sayDate = (iso: string): string => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${+m[3]} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m[2] - 1]} ${m[1]}` : String(iso || ""); };
export function skeleton(plan: "silver" | "gold", disclaimer: string, model: string, asOf: string, more: { fxSource?: string | null; statement?: string | null } = {}): string {
  const gold = plan === "gold";
  const compare = gold ? `<button type="button" data-view="compare" aria-pressed="false">Compare two</button>`
    : `<button type="button" data-locked="compare" aria-disabled="true" aria-describedby="upnote" style="color:var(--muted)">Compare two<span class="gtag">GOLD</span></button>`;
  return `<div class="sl-root"><main class="wrap" id="main">
<section class="ptop" data-v="both"><p class="lead" style="margin:0">See how a shock to crude, the rupee, inflation, interest rates or demand would move a company's earnings over the next 12 months, under assumptions you can see${gold ? " and change" : ""}.</p>
<div class="r" data-find="company"><span class="seg" role="group" aria-label="View"><button type="button" data-view="single" aria-pressed="true">One company</button>${compare}</span>
<label class="find"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/></svg><input type="search" placeholder="Search another company" aria-label="Find a company"></label></div></section>
<div id="guide"></div><nav class="secbar" id="secbar" aria-label="Steps on this page"></nav>
<div class="step" id="st-1" data-v="both" data-step="Company"><span class="sn" aria-hidden="true">1</span><div><h2 class="stt">Company</h2><p>The company and the four quarters the model starts from.</p></div></div>
<section class="card" data-v="both" id="sx-company" data-sub="Company"><div class="costrip" id="costrip"></div></section>
<div class="step" id="st-2" data-v="both" data-step="Choose a shock"><span class="sn" aria-hidden="true">2</span><div><h2 class="stt">Choose a shock</h2><p>Pick a ready scenario, or set your own numbers.</p></div></div>
<section class="card" data-v="both" aria-labelledby="scen-h" id="sx-scen" data-sub="Scenarios and sliders"><h2 id="scen-h">Choose a shock${ib("Today measures how far conditions now are from those in which the company earned its last four quarters. The presets replay past shocks or test one driver at a time. Custom lets you set your own.", "lt", "About the scenarios")}</h2>
<div class="chips" id="chips" role="group" aria-label="Scenario"></div><div class="based" id="based"></div><div id="todayinputs"></div><div class="sliders" id="sliders" hidden></div><div class="upnote" id="upnote" role="note" hidden></div></section>
<div class="step" id="st-3" data-v="both" data-step="The result"><span class="sn" aria-hidden="true">3</span><div><h2 class="stt">The result</h2><p>What the shock does to earnings, and how sure it is.</p></div></div>
<section class="card" data-v="single" aria-label="Result" id="sx-result" data-sub="Score and figures"><div id="head"></div></section>
<section class="card" data-v="compare" aria-label="Comparison" id="sx-cmp" data-sub="The two companies"><div id="cmpsum"></div></section>
<section data-v="both" aria-label="Insights and warnings" id="sx-calls" data-sub="Good sign, insight, watch out"><div class="calls" id="calls"></div></section>
<div class="step" id="st-4" data-v="both" data-step="Why it moves"><span class="sn" aria-hidden="true">4</span><div><h2 class="stt">Why it moves</h2><p>From costs to profit, line by line.</p></div></div>
<section class="card" data-v="single" aria-labelledby="ana-h" id="sx-ana" data-sub="What the numbers say"><h2 id="ana-h">What the numbers say${ib("A plain reading of this result: what changes, where the cost comes from, and what to keep in mind about timing. It describes the numbers under these assumptions.", "lt", "About this reading")}</h2><div class="ana" id="ana" style="margin-top:12px"></div></section>
<section class="cmp2" id="cols" data-v="compare" aria-label="The two companies" data-sub="Side by side"></section>
<div class="two" id="grid2" data-v="both">
<section class="card" data-v="single" id="sx-tbl" data-sub="The numbers, before and after"><div id="tbl"></div></section>
<section class="card" id="sx-drv" data-sub="What drives it"><div id="drv"></div></section>
<section class="card senscard" id="sx-sens" data-sub="What moves it most · breaking points"><div id="sens"></div></section>
</div>
<div class="step" id="st-5" data-v="both" data-step="Every scenario"><span class="sn" aria-hidden="true">5</span><div><h2 class="stt">Every scenario</h2><p>All ready scenarios side by side.</p></div></div>
<section class="card" data-v="both" id="sx-every" data-sub="Every scenario at a glance"><div id="every"></div></section>
<div class="step" id="st-6" data-v="both" data-step="History"><span class="sn" aria-hidden="true">6</span><div><h2 class="stt">History</h2><p>Real shocks, and how well the model did before.</p></div></div>
<section class="card" data-v="both" id="sx-hist" data-sub="What happened in real shocks"><div id="hist"></div></section>
<section class="card" data-v="single" id="sx-bt" data-sub="How the model did"><div id="bt"></div></section>
<div class="step" id="st-7" data-v="both" data-step="Assumptions"><span class="sn" aria-hidden="true">7</span><div><h2 class="stt">Assumptions</h2><p>Every number the model uses; change the ones in boxes.</p></div></div>
<section class="card" data-v="single" id="sx-asm" data-sub="The assumptions behind it"><div id="asm"></div></section>
<section class="card" data-v="both" id="sx-how" data-sub="How the model works">${HOW(fxSourceWords(more.fxSource), String(more.statement || "consolidated").toLowerCase())}</section>
<section class="disc" data-v="both" role="note"><span aria-hidden="true" style="flex:none;display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:var(--muted);color:var(--card);font:italic 700 14px/1 Georgia,serif">i</span><div><b>${esc(disclaimer)}</b> Stress Lab describes what happens to the numbers under the assumptions shown; it does not say what to do with any security.<div class="src">Model ${esc(model)} · data to ${esc(sayDate(asOf))} · Brent: U.S. Energy Information Administration</div></div></section>
</main></div>`;
}
