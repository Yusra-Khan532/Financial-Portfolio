// The page's markup: the sections the script fills by id (reference: the design team's stress-lab handover, build_page.py). The title, breadcrumb and plan tag come from the site's page header.
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const ib = (text: string, pos = "lt", label = "About this") =>
  `<span class="ib" tabindex="0" role="button" aria-label="${esc(label)}"><span class="ibi" aria-hidden="true">i</span><span class="tip ${pos}" role="tooltip">${text}</span></span>`;

const HOW = `<details class="fold" style="border-top:0;margin-top:0;padding-top:0"><summary style="font:600 20px/1.3 'Source Serif 4',Georgia,serif;color:var(--ink)">How the model works, and what it leaves out</summary>
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
<p>Company figures: reported quarterly and annual results, consolidated. Brent crude: U.S. Energy Information Administration. Inflation and GDP: MoSPI and the Office of the Economic Adviser. Repo rate: RBI. Rupee: FBIL. Share prices in past shocks: NSE.</p>
</div></details>`;

export function skeleton(plan: "silver" | "gold", disclaimer: string, model: string, asOf: string): string {
  const gold = plan === "gold";
  const compare = gold ? `<button type="button" data-view="compare" aria-pressed="false">Compare two</button>`
    : `<button type="button" data-locked="compare" aria-disabled="true" aria-describedby="upnote" style="color:#6b665a">Compare two<span class="gtag">GOLD</span></button>`;
  return `<div class="sl-root"><main class="wrap" id="main">
<section class="ptop" data-v="both"><p class="lead" style="margin:0">See how a shock to crude, the rupee, inflation, interest rates or demand would move a company's earnings over the next 12 months, under assumptions you can see${gold ? " and change" : ""}.</p>
<div class="r" data-find="company"><span class="seg" role="group" aria-label="View"><button type="button" data-view="single" aria-pressed="true">One company</button>${compare}</span>
<label class="find"><svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="#6b665a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/></svg><input type="search" placeholder="Search another company" aria-label="Find a company"></label></div></section>
<section class="card" data-v="both"><div class="costrip" id="costrip"></div></section>
<section class="card" data-v="both" aria-labelledby="scen-h"><h2 id="scen-h">Choose a shock${ib("Today measures how far conditions now are from those in which the company earned its last four quarters. The presets replay past shocks or test one driver at a time. Custom lets you set your own.", "lt", "About the scenarios")}</h2>
<div class="chips" id="chips" role="group" aria-label="Scenario"></div><div class="based" id="based"></div><div id="todayinputs"></div><div class="sliders" id="sliders" hidden></div><div class="upnote" id="upnote" role="note" hidden></div></section>
<section class="card" data-v="single" aria-label="Result"><div id="head"></div></section>
<section class="card" data-v="compare" aria-label="Comparison"><div id="cmpsum"></div></section>
<section data-v="both" aria-label="Insights and warnings"><div class="calls" id="calls"></div></section>
<section class="card" data-v="single" aria-labelledby="ana-h"><h2 id="ana-h">What the numbers say${ib("A plain reading of this result: what changes, where the cost comes from, and what to keep in mind about timing. It describes the numbers under these assumptions.", "lt", "About this reading")}</h2><div class="ana" id="ana" style="margin-top:12px"></div></section>
<section class="cmp2" id="cols" data-v="compare" aria-label="The two companies"></section>
<div class="two" id="grid2" data-v="both">
<section class="card" data-v="single"><div id="tbl"></div></section>
<section class="card"><div id="drv"></div></section>
<section class="card senscard"><div id="sens"></div></section>
</div>
<section class="card" data-v="both"><div id="every"></div></section>
<section class="card" data-v="both"><div id="hist"></div></section>
<section class="card" data-v="single"><div id="bt"></div></section>
<section class="card" data-v="single"><div id="asm"></div></section>
<section class="card" data-v="both">${HOW}</section>
<section class="disc" data-v="both" role="note"><span aria-hidden="true" style="flex:none;display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;background:#6b665a;color:#fff;font:italic 700 14px/1 Georgia,serif">i</span><div><b>${esc(disclaimer)}</b> Stress Lab describes what happens to the numbers under the assumptions shown; it does not say what to do with any security.<div class="src">Model ${esc(model)} · data to ${esc(asOf)} · Brent: U.S. Energy Information Administration</div></div></section>
</main></div>`;
}
