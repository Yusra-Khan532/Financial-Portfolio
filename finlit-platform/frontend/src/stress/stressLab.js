// @ts-nocheck
/* Adapted from the design team's reference page (stress-lab handover, 11 Nov 2026): mounted in a shadow root, listeners removed on destroy, the second company a real peer. */
/* Stress Lab page (task 79). Draws into a ShadowRoot from the payload of GET /api/stress/SYM/page with StressEngine (the JavaScript port of
   finlit_technicals/stress.py). Every number on the page is computed by the engine from the data; nothing is typed in. */
export function mountStressLab(root, E, D, opts) {
  'use strict';
  /* root: the ShadowRoot the page is drawn in. opts: { view, peer, logoUrl(symbol), search(q), onCompany(symbol), onPeer(symbol), requestPeer(), upgradeUrl }. */
  var VIEW = opts.view || 'single', HOST = root.querySelector('.sl-root'), OFF = [];
  function listen(t, ty, fn, o) { t.addEventListener(ty, fn, o); OFF.push(function () { t.removeEventListener(ty, fn, o); }); }
  /* Plan: Silver gets Today (and Crude eases) plus the 2022 and 2020 presets, read-only; Gold gets everything.
     The server enforces it: a Silver payload carries only the Silver scenarios (plus the names of the locked ones). */
  var PLAN = D.plan || 'gold', GOLD = PLAN === 'gold';
  /* Value-move switch: one flag hides the value move everywhere (KPI, table row, column, insights, its slider and toggle). */
  var FLAGS = Object.assign({ showValue: true }, D.flags || {}, {});
  if (/[?&]value=off/.test(location.search)) FLAGS.showValue = false;
  var SHOWV = FLAGS.showValue;
  if (/^#compare/.test(location.hash)) VIEW = 'compare'; else if (/^#one/.test(location.hash)) VIEW = 'single';
  var $ = function (id) { return root.getElementById(id); };
  var M = '−';

  /* ------------------------------------------------------------------ formatting */
  function sgn(v, d) { if (v === null || v === undefined || isNaN(v)) return '–'; d = d === undefined ? 1 : d; var t = Math.abs(v).toFixed(d); if (+t === 0) return (0).toFixed(d); return (v > 0 ? '+' : M) + t; }
  function pct(v, d) { return v === null || v === undefined ? '–' : sgn(v, d) + '%'; }
  function pt(v, d) { return v === null || v === undefined ? '–' : sgn(v, d) + ' pt'; }
  function bps(v) { return sgn(v, 0) + ' bp'; }
  function cr(v) { if (v === null || v === undefined) return '–'; var r = Math.round(Math.abs(v)); return (v < 0 && r > 0 ? M : '') + '₹' + r.toLocaleString('en-IN') + ' Cr'; }
  function crn(v) { var r = Math.round(Math.abs(v)); return (v < 0 && r > 0 ? M : '') + r.toLocaleString('en-IN'); }
  function rs(v) { return (v < 0 ? M : '') + '₹' + Math.abs(v).toFixed(2); }
  function xx(v) { if (v === null || v === undefined) return 'no interest'; return (v < 1.5 && v.toFixed(1) === '1.5' ? v.toFixed(2) : v.toFixed(1)) + '×'; }
  var PHR = { demand: 'volumes', crude: 'crude oil', rupee: 'the rupee', inflation: 'wages and general inflation', commodities: 'metals and farm prices', interest: 'interest rates' };
  var PLURAL = { demand: 1, inflation: 1, commodities: 1, interest: 1 };
  function verb(k, one, many) { return PLURAL[k] ? many : one; }
  function pc(v, d) { return v.toFixed(d === undefined ? 1 : d) + '%'; }
  function share(v) { return Math.round(v * 100) + '%'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function short(co) { return co.short || co.name.replace(/ Ltd\.?$/, ''); }
  function poss(co) { var n = typeof co === 'string' ? co : short(co); return n + (/s$/.test(n) ? '’' : '’s'); }
  function dt(iso) { if (!iso) return ''; var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']; var p = iso.split('-'); return (+p[2]) + ' ' + m[+p[1] - 1] + ' ' + p[0]; }
  function ib(text, pos, label) { return '<span class="ib" tabindex="0" role="button" aria-label="' + esc(label || 'About this') + '"><span class="ibi" aria-hidden="true">i</span><span class="tip ' + (pos || '') + '" role="tooltip">' + text + '</span></span>'; }

  var ICON = {
    ins: '<path d="M10 2.5a5 5 0 0 0-3 9v2.2h6v-2.2a5 5 0 0 0-3-9z"/><path d="M8 16.5h4"/>',
    good: '<path d="M3 14l5-5 3 3 6-6"/><path d="M12 6h5v5"/>',
    watch: '<path d="M10 3l8 14H2z"/><path d="M10 8.5v3.5"/><path d="M10 14.6v.1"/>',
    warn: '<circle cx="10" cy="10" r="7.5"/><path d="M10 6v4.6"/><path d="M10 13.6v.1"/>'
  };
  var KIND = { ins: 'INSIGHT', good: 'GOOD SIGN', watch: 'WATCH OUT', warn: 'WARNING' };
  function svg(p, w) { return '<svg viewBox="0 0 20 20" width="' + (w || 16) + '" height="' + (w || 16) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  function call(c) { return '<div class="call ' + c.k + '"><span class="ic">' + svg(ICON[c.k]) + '</span><div class="tx"><span class="k">' + KIND[c.k] + '</span><b>' + c.t + '</b><span class="d">' + c.d + '</span></div></div>'; }
  var LCLS = { 'Holds up well': 'g', 'Gains under this shock': 'g', 'Takes a clear hit': 'a', 'Hit hard': 'r', 'Debt cover at risk': 'r', 'Not comparable': 'n' };
  var LICON = { g: ICON.good, a: ICON.watch, r: ICON.warn, n: ICON.ins };
  var RING = { g: 'var(--h0f6b3a)', a: 'var(--hb7791f)', r: 'var(--ha8342b)', n: 'var(--h8d8571)' };
  function labPill(l, big) { var c = LCLS[l] || 'n'; return big ? '<span class="lab ' + c + '">' + svg(LICON[c]) + esc(l) + '</span>' : '<span class="pill ' + c + '">' + esc(l) + '</span>'; }
  function ring(score, l) {
    var c = LCLS[l] || 'n', r = 44, C = 2 * Math.PI * r, f = score === null ? 0 : score / 100;
    return '<div class="ring" role="img" aria-label="Resilience score ' + (score === null ? 'not available' : score + ' out of 100') + '"><svg viewBox="0 0 104 104"><circle cx="52" cy="52" r="' + r + '" fill="none" style="stroke:var(--hefe8da)" stroke-width="10"/>' +
      (f > 0.005 ? '<circle cx="52" cy="52" r="' + r + '" fill="none" style="stroke:' + RING[c] + '" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (C * f).toFixed(1) + ' ' + C.toFixed(1) + '"/>' : '') + '</svg>' +
      '<div class="n"><b>' + (score === null ? '–' : score) + '</b><small>out of 100</small></div></div>';
  }

  /* ------------------------------------------------------------------ state */
  var S = { scen: 'today', todayCrude: 'level', custom: null, persistence: 'one_year', edits: {}, open: false, unit: 'eps' };
  var SC = {}; D.scenarios.forEach(function (s) { SC[s.id] = s; });
  var A = D.company, B = opts.peer ? opts.peer.company : null, PEER_SC = {};
  if (opts.peer) opts.peer.scenarios.forEach(function (s) { PEER_SC[s.id] = s; });
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function my(iso) { if (!iso) return ''; var p = String(iso).split('-'); return MON[+p[1] - 1] + ' ' + p[0]; }
  var SAMEQ = !!(opts.peer && opts.peer.same_quarter);
  function shortName(co) { return co.name.replace(/ (Ltd|Limited)\.?$/i, ''); }
  A.short = shortName(A); if (B) B.short = shortName(B);
  var CHIPS = ['today', '2022', '2020', 'oil', 'rupee', 'rates', 'slowdown', 'custom'];
  var LOCKED = {}; (D.locked_scenarios || []).forEach(function (x) { LOCKED[x.id] = x.name; }); if (!GOLD) LOCKED.custom = 'Custom';
  var ALL_IDS = ['today', 'today_eia', '2022', '2020', 'oil', 'rupee', 'rates', 'slowdown'].filter(function (id) { return SC[id]; });
  var LOCKI = '<svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4.5" y="9" width="11" height="8" rx="2"/><path d="M7 9V6.5a3 3 0 0 1 6 0V9"/></svg>';
  function gtag() { return '<span class="gtag">' + LOCKI + 'GOLD</span>'; }

  function cur() {
    var s;
    if (S.scen === 'custom') s = S.custom;
    else if (S.scen === 'today') s = SC[S.todayCrude === 'eia' ? 'today_eia' : 'today'];
    else s = SC[S.scen];
    return Object.assign({}, s, { persistence: S.persistence });
  }
  function scenOf(id) { return Object.assign({}, SC[id], { persistence: S.persistence }); }
  function coA() { return E.withExposure(A, S.edits); }
  function coB() { return B; }
  /* each company's Today is measured against its own four quarters; the presets are the same for both */
  function forB(s) { var p = PEER_SC[s.id]; return p ? Object.assign({}, p, { persistence: s.persistence }) : s; }
  function scName(s) { return s.id === 'custom' ? 'your custom shock' : '‘' + s.name + '’'; }

  /* ------------------------------------------------------------------ scenario picker + sliders */
  var DEFS = [
    { k: 'crude', label: 'Crude oil (Brent)', min: -90, max: 300, step: 1, f: function (v) { return pct(v); }, hint: 'Change in the Brent price in US dollars, against the base-window average', tip: 'Crude reaches costs through materials made from oil (for example monomers and solvents in paints) and through fuel and freight. A share of each rise is recovered through higher prices.' },
    { k: 'rupee', label: 'Rupee against the dollar', min: -33, max: 40, step: 0.5, f: function (v) { return Math.abs(v) < 0.05 ? 'no change' : Math.abs(v).toFixed(1) + '% ' + (v < 0 ? 'weaker' : 'stronger'); }, hint: 'A weaker rupee makes imports dearer and lifts export earnings', tip: 'Set as the rupee’s value against the dollar: 8% weaker means about 8.7% more rupees for each dollar.' },
    { k: 'cpi', label: 'Consumer inflation', min: -5, max: 15, step: 0.1, f: function (v) { return pt(v); }, hint: 'Extra CPI inflation over the year: wages and services', tip: 'Percentage points above the inflation of the base window. Moves employee costs and the non-energy part of other expenses.' },
    { k: 'wpi', label: 'Wholesale inflation', min: -10, max: 25, step: 0.1, f: function (v) { return pt(v); }, hint: 'Extra inflation on materials bought in India', tip: 'Percentage points above the base window, for manufactured products. Metal prices follow it unless set separately.' },
    { k: 'rate_bp', label: 'Interest rates', min: -500, max: 1000, step: 5, f: bps, hint: '100 bp is one percentage point', tip: 'Moves interest on floating-rate debt and what cash and investments earn. Long-term rates, which affect the value move, move less than the policy rate.' },
    { k: 'demand', label: 'Demand', min: -60, max: 30, step: 0.5, f: function (v) { return pct(v); }, hint: 'Change in volumes for the average company', tip: '' },
    { k: 'erp_bp', label: 'Investor caution', min: -300, max: 600, step: 5, f: bps, hint: 'Extra return investors ask for to own shares', tip: 'The equity risk premium. It changes only the value move, not earnings.' }
  ];
  function sliderVal(s, k) {
    if (k === 'rupee') return E.rupeeFromUsdinr(s.usdinr || 0);
    if (k === 'wpi') return s.wpi === null || s.wpi === undefined ? s.cpi : s.wpi;
    return s[k] || 0;
  }
  function shockPills(s, co) {
    var q = co.exposure.demand_beta;
    var items = [
      ['Crude oil', pct(s.crude), s.crude],
      ['Rupee', Math.abs(E.rupeeFromUsdinr(s.usdinr)) < 0.05 ? 'no change' : Math.abs(E.rupeeFromUsdinr(s.usdinr)).toFixed(1) + '% ' + (s.usdinr > 0 ? 'weaker' : 'stronger'), s.usdinr],
      ['Consumer inflation', pt(s.cpi), s.cpi],
      ['Wholesale inflation', pt(s.wpi === null ? s.cpi : s.wpi), s.wpi === null ? s.cpi : s.wpi]
    ];
    if (s.agri !== null && s.agri !== undefined) items.push(['Farm prices', pt(s.agri), s.agri]);
    items.push(['Interest rates', bps(s.rate_bp), s.rate_bp], ['Demand', pct(s.demand), s.demand], ['Investor caution', bps(s.erp_bp), s.erp_bp]);
    return items.map(function (i) { return '<span class="shock' + (Math.abs(i[2]) < 0.005 ? ' z' : '') + '">' + i[0] + ' <b>' + i[1] + '</b></span>'; }).join('');
  }
  function todayTable() {
    var rows = D.today_rows.map(function (r) {
      var sh = r.shock[0] === 'pct' ? pct(r.shock[1]) : r.shock[0] === 'pt' ? pt(r.shock[1]) : bps(r.shock[1]);
      return '<tr><td class="l">' + r.driver + '</td><td class="r">' + r.now + (r.now_date ? ' <small>' + r.now_date + '</small>' : '') + '</td><td class="r">' + r.base + '</td><td class="r"><b>' + sh + '</b>' + (r.extra ? '<br><small>' + r.extra + '</small>' : '') + '</td><td><small>' + r.source + '</small></td></tr>';
    }).join('');
    var eo = D.eia_outlook;
    return '<details class="fold"><summary>See today’s inputs: now against the base window</summary>' +
      '<div class="tw"><table class="t"><thead><tr><th>Driver</th><th class="r">Now</th><th class="r">Average, ' + D.base_window[0] + ' to ' + D.base_window[1] + '</th><th class="r">Shock</th><th>Source</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<p class="note">Prices are measured as today’s level against the window average; inflation, rates and growth as the latest reading minus the window average. ' + (eo && eo.brent ? '<b>Crude eases</b> uses the U.S. EIA outlook instead of today’s level: US$' + eo.brent.map(function (b) { return b.toFixed(2); }).join(', ') + ' over the next four quarters, an average of US$' + eo.avg.toFixed(2) + '. ' : '') + 'Data to ' + dt(D.as_of) + '.</p></details>';
  }
  function renderScen() {
    var co = coA();
    $('chips').innerHTML = CHIPS.map(function (id) {
      if (LOCKED[id]) return '<button type="button" class="chip lock' + (id === 'custom' ? ' cust' : '') + '" aria-disabled="true" data-locked="' + id + '" aria-describedby="upnote">' + esc(LOCKED[id]) + gtag() + '</button>';
      if (!SC[id] && id !== 'custom') return '';
      var nm = id === 'custom' ? 'Custom' : SC[id].name;
      return '<button type="button" class="chip' + (id === 'custom' ? ' cust' : '') + '" aria-pressed="' + (S.scen === id) + '" data-scen="' + id + '">' + nm + '</button>';
    }).join('');
    var s = cur();
    var based = s.id === 'custom' ? 'Your own mix of shocks, starting from ' + esc(S.customFrom || 'Today') + '. Move any slider; everything below updates at once.' : esc(s.based_on);
    var todaySeg = S.scen === 'today' && SC.today_eia ? '<div class="seg sm" role="group" aria-label="Crude in the Today scenario"><button type="button" data-tc="level" aria-pressed="' + (S.todayCrude === 'level') + '">Crude stays at today’s level</button><button type="button" data-tc="eia" aria-pressed="' + (S.todayCrude === 'eia') + '">Crude eases (EIA outlook)</button></div>' : '';
    $('based').innerHTML = '<div><p>' + based + '</p><div class="shocks">' + shockPills(s, co) + '</div></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' + todaySeg +
      (GOLD ? '<button type="button" class="btn" id="adj" aria-expanded="' + (S.open || S.scen === 'custom') + '" aria-controls="sliders">' + svg('<path d="M4 6h12M4 14h12"/><circle cx="8" cy="6" r="2"/><circle cx="13" cy="14" r="2"/>', 14) + (S.open || S.scen === 'custom' ? 'Hide the sliders' : 'Adjust these shocks') + '</button>'
             : '<button type="button" class="btn lock" data-locked="sliders" aria-disabled="true" aria-describedby="upnote">' + svg('<path d="M4 6h12M4 14h12"/><circle cx="8" cy="6" r="2"/><circle cx="13" cy="14" r="2"/>', 14) + 'Adjust these shocks' + gtag() + '</button>') + '</div>';
    var up = $('upnote'); if (up) { up.hidden = GOLD; if (!GOLD) up.innerHTML = '<span>' + svg(ICON.ins) + '<span><b>Silver shows Today and two past shocks.</b> Gold adds the oil, rupee, rates and demand scenarios, your own shocks with the sliders, your own company settings, and Compare two.</span></span><a class="btn" href="#">See what Gold adds</a>'; }
    $('todayinputs').innerHTML = S.scen === 'today' ? todayTable() : '';
    var show = S.open || S.scen === 'custom';
    var sl = $('sliders'); sl.hidden = !show;
    if (show) {
      var q = co.exposure.demand_beta;
      sl.innerHTML = DEFS.filter(function (d) { return SHOWV || d.k !== 'erp_bp'; }).map(function (d) {
        var v = sliderVal(s, d.k), hint = d.k === 'demand' ? 'Change in volumes for the average company; ' + poss(A) + ' move ' + q.toFixed(2) + ' times as much' : d.hint;
        var tip = d.k === 'demand' ? 'An input, not an outcome of the other shocks. ' + poss(A) + ' volumes have moved about ' + q.toFixed(2) + ' times the average company’s, estimated from its own history.' : d.tip;
        return '<div class="sl"><div class="t"><label for="s-' + d.k + '">' + d.label + ib(tip, 'lt', 'About ' + d.label) + '</label><output id="o-' + d.k + '" for="s-' + d.k + '">' + d.f(v) + '</output></div>' +
          '<input type="range" id="s-' + d.k + '" data-k="' + d.k + '" min="' + d.min + '" max="' + d.max + '" step="' + d.step + '" value="' + v + '" aria-describedby="h-' + d.k + '">' +
          '<div class="ends"><span>' + d.f(d.min) + '</span><span>' + d.f(d.max) + '</span></div><span class="h" id="h-' + d.k + '">' + hint + '</span></div>';
      }).join('') +
        '<div class="slfoot">' + (SHOWV ? '<span class="l">How long the hit lasts' + ib('<b>A year:</b> earnings return to their path after 12 months. <b>For good:</b> the lower earnings last. Changes only the value move.', 'lt', 'About how long the hit lasts') +
        '<span class="seg sm" role="group" aria-label="How long the hit lasts"><button type="button" data-pers="one_year" aria-pressed="' + (S.persistence === 'one_year') + '">A year</button><button type="button" data-pers="permanent" aria-pressed="' + (S.persistence === 'permanent') + '">For good</button></span></span>' : '<span></span>') +
        '<span style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" class="btn" data-reset="1">Back to Today</button></span></div>';
    }
  }
  function onSlide(k, raw) {
    if (S.scen !== 'custom') {
      var base = cur();
      S.customFrom = base.name;
      S.custom = Object.assign({}, base, { id: 'custom', name: 'Custom', based_on: '', wpi: base.wpi === null ? base.cpi : base.wpi });
      S.scen = 'custom';
    }
    var v = +raw;
    if (k === 'rupee') S.custom.usdinr = E.usdinrFromRupee(v); else S.custom[k] = v;
    S.custom = E.clipScenario(S.custom); S.custom.id = 'custom'; S.custom.name = 'Custom';
    var d = DEFS.filter(function (x) { return x.k === k; })[0];
    var o = $('o-' + k); if (o) o.textContent = d.f(v);
    // re-render everything except the slider panel (keeps focus and drag)
    var keep = S.open; S.open = true; renderScenLight(); S.open = keep; renderResults();
  }
  function renderScenLight() {
    $('chips').querySelectorAll('.chip').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-scen') === S.scen); });
    var s = cur(), co = coA();
    var p = $('based').querySelector('p'); if (p) p.textContent = 'Your own mix of shocks, starting from ' + (S.customFrom || 'Today') + '. Move any slider; everything below updates at once.';
    var sh = $('based').querySelector('.shocks'); if (sh) sh.innerHTML = shockPills(s, co);
    var seg = $('based').querySelector('.seg'); if (seg) seg.remove();
    $('todayinputs').innerHTML = '';
  }

  /* ------------------------------------------------------------------ headline + how sure */
  function moveWord(r) {
    var e = r.change_pct.eps;
    if (e === null) return 'cannot be compared, because the base period was a loss';
    if (r.stressed.eps < 0) return 'turn into a loss, from ' + rs(r.base.eps) + ' to ' + rs(r.stressed.eps);
    if (Math.abs(e) < 0.5) return 'barely change (' + rs(r.base.eps) + ' to ' + rs(r.stressed.eps) + ')';
    return (e < 0 ? 'fall ' : 'rise ') + Math.abs(e).toFixed(1) + '%, from ' + rs(r.base.eps) + ' to ' + rs(r.stressed.eps);
  }
  var SURE = [
    { k: 'pass_through', name: 'the share of cost rises passed on to customers', f: share, vals: function (v) { return [0.4, v, 0.8]; } },
    { k: 'demand_beta', name: 'how strongly its volumes follow demand', f: function (v) { return v.toFixed(2) + '×'; }, vals: function (v) { return [Math.max(0.2, v - 0.3), v, v + 0.3]; } },
    { k: 'crude_rm', name: 'the crude-linked share of materials', f: share, vals: function (v) { return [Math.max(0, v - 0.15), v, Math.min(0.95, v + 0.15)]; } },
    { k: 'floating_debt', name: 'the share of debt at floating rates', f: share, vals: function () { return [0.3, 0.6, 0.9]; } }
  ];
  function sureRows(co, sc) {
    return SURE.map(function (d) {
      var base = A.exposure[d.k];
      var vals = d.vals(base).map(function (v) { return Math.round(v * 1000) / 1000; });
      var res = vals.map(function (v) { var p = {}; p[d.k] = v; var r = E.run(E.withExposure(co, p), sc); return r.change_pct.eps; });
      var lo = Math.min.apply(null, res), hi = Math.max.apply(null, res);
      return { d: d, base: base, vals: vals, res: res, width: hi - lo };
    }).filter(function (x) { return x.res.every(function (v) { return v !== null; }); }).sort(function (a, b) { return b.width - a.width; });
  }
  function renderHead(r, co, sc) {
    var cp = r.change_pct, b = r.base, s = r.stressed;
    var valTip = 'How much an earnings-based value moves under these assumptions, as earnings, interest rates and investor caution change. A rough guide to how the shock reaches value, <b>not a price estimate</b>, and never applied to the share price.';
    var other = r.value_other_persistence;
    $('head').innerHTML =
      '<div class="hero"><div><div class="verdict">' + ring(r.score, r.label) + '<div>' + labPill(r.label, true) +
      ib('<b>Holds up well:</b> EPS moves less than 10%. <b>Takes a clear hit:</b> EPS falls 10% to 30%. <b>Hit hard:</b> EPS falls 30% or more. <b>Gains under this shock:</b> EPS rises 10% or more. <b>Debt cover at risk:</b> operating profit would cover interest less than 1.5 times, whatever happens to EPS.', 'lt', 'About the label') +
      '<p class="why">' + esc(r.label_reason) + '.</p><p class="why" style="margin-top:2px">Resilience score' + ib('A score out of 100 for how well earnings withstand this shock: near 100 when earnings barely move, lower the more they fall. It is held low when operating profit would barely cover interest.', 'lt', 'About the resilience score') + '</p></div></div>' +
      '<p class="sentence">Under ' + scName(sc) + ', ' + poss(co) + ' earnings per share ' + moveWord(r) + ' over the next 12 months.</p></div>' +
      '<div><div class="kpis' + (SHOWV ? '' : ' k4') + '">' +
      kpi('EPS', pct(cp.eps), cp.eps, rs(b.eps) + ' → ' + rs(s.eps), 'Earnings per share. Model EPS on the last four quarters: ' + rs(b.eps) + '. Reported EPS for the same quarters is ' + rs(co.reported_eps || b.eps) + '; the model leaves out exceptional items and minority interests.') +
      kpi('EBITDA', pct(cp.ebitda), cp.ebitda, cr(b.ebitda) + ' → ' + cr(s.ebitda), 'Operating profit before depreciation, interest and tax.') +
      kpi('EBITDA margin', pc(s.ebitda_margin_pct), cp.margin_pts, 'from ' + pc(b.ebitda_margin_pct) + ' · ' + pt(cp.margin_pts), 'EBITDA as a share of revenue. Revenue rises when prices go up to recover costs, so the margin can fall even when revenue grows.') +
      kpi('Interest cover', xx(s.interest_cover), s.interest_cover !== null && s.interest_cover < 1.5 ? -1 : 0, 'from ' + xx(b.interest_cover), 'How many times operating profit (EBITDA plus other income, less depreciation) covers interest. Under 1.5× is labelled <b>Debt cover at risk</b>.') +
      (SHOWV ? kpi('Value move', r.value ? pct(r.value.move_pct) : '–', r.value ? r.value.move_pct : 0, other ? (S.persistence === 'one_year' ? 'if the hit lasts: ' : 'if it lasts a year: ') + pct(other.move_pct) : '', valTip, 'rt') : '') +
      '</div>' + sureHtml(co, sc, r) + editedHtml() + '</div></div>';
  }
  function kpi(l, v, sign, s, tip, pos) {
    var cls = sign === null || sign === undefined ? '' : sign < -0.05 ? ' dn' : sign > 0.05 ? ' up' : '';
    return '<div class="kpi"><span class="l">' + l + ib(tip, pos || 'lt', 'About ' + l) + '</span><span class="v' + cls + '">' + v + '</span><span class="s">' + s + '</span></div>';
  }
  function sureHtml(co, sc, r) {
    var rows = sureRows(co, sc); if (!rows.length) return '';
    var top = rows[0], d = top.d, nxt = rows[1];
    var curV = co.exposure[d.k];
    if (top.width < 1) return '<div class="sure"><div class="t"><b>How sure is this?</b> The result barely depends on the company settings here: ' + d.name + ' between ' + d.f(top.vals[0]) + ' and ' + d.f(top.vals[2]) + ' moves EPS by less than a point.</div></div>';
    var lo = Math.min.apply(null, top.res), hi = Math.max.apply(null, top.res), now = r.change_pct.eps;
    var mn = Math.min(lo, now), mx = Math.max(hi, now), pad = Math.max(2, (mx - mn) * 0.15); mn -= pad; mx += pad;
    var X = function (v) { return ((v - mn) / (mx - mn) * 100).toFixed(2) + '%'; };
    var lines = [-30, -10, 10].filter(function (v) { return v > mn && v < mx; }).map(function (v) { return '<span class="tick" style="left:' + X(v) + '"></span><span class="tl" style="left:' + X(v) + '">' + (v < 0 ? M : '+') + Math.abs(v) + '% line</span>'; }).join('');
    var btns = top.vals.map(function (v, i) {
      var on = Math.abs(curV - v) < 1e-6;
      return '<button type="button" data-sure="' + d.k + '" data-v="' + v + '" aria-pressed="' + on + '">' + d.f(v) + (i === 1 ? ' estimated' : '') + '</button>';
    }).join('');
    var lessLine = nxt ? ' ' + cap(nxt.d.name) + ' matters less: ' + nxt.d.f(nxt.vals[0]) + ' gives ' + pct(nxt.res[0]) + ', ' + nxt.d.f(nxt.vals[2]) + ' gives ' + pct(nxt.res[2]) + '.' : '';
    var altLabel = top.res.map(function (v, i) { var p = {}; p[d.k] = top.vals[i]; return E.run(E.withExposure(co, p), sc).label; });
    return '<div class="sure"><div class="t"><b>How sure is this?</b>' + ib('The company settings are estimates. This shows the one that moves this result most, at a lower and a higher value, so the result reads as a range rather than one exact number.', 'lt', 'About how sure') +
      ' The setting that moves it most is ' + d.name + ': at ' + d.f(top.vals[0]) + ' EPS moves ' + pct(top.res[0]) + ' (' + altLabel[0] + '), at ' + d.f(top.vals[2]) + ' it moves ' + pct(top.res[2]) + ' (' + altLabel[2] + ').' + lessLine +
      (GOLD ? '<div style="margin-top:8px"><span class="seg sm" role="group" aria-label="Try another value">' + btns + '</span></div>' : '<p class="note" style="margin-top:8px">' + LOCKI + ' Trying other values comes with Gold.</p>') + '</div>' +
      '<div class="rangebar" aria-hidden="true"><span class="track"></span><span class="band" style="left:' + X(lo) + ';width:calc(' + X(hi) + ' - ' + X(lo) + ')"></span>' + lines +
      '<span class="mk" style="left:' + X(now) + '" title="This result: ' + pct(now) + '"></span><span class="bl" style="left:' + X(lo) + '">' + pct(lo) + '</span><span class="bl" style="left:' + X(hi) + '">' + pct(hi) + '</span></div></div>';
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function editedHtml() {
    var n = Object.keys(S.edits).length;
    return n ? '<div class="edited"><span><b>' + n + ' company setting' + (n > 1 ? 's' : '') + ' changed by you.</b> Every result on this page uses your value' + (n > 1 ? 's' : '') + '.</span><button type="button" class="btn" data-resetedits="1">Use the estimates again</button></div>' : '';
  }

  /* ------------------------------------------------------------------ insights, warnings, analysis */
  function insights(r, co, sc) {
    var out = [], cp = r.change_pct, w = r.working, e = cp.eps;
    var negs = r.drivers.filter(function (d) { return d.eps_pct !== null && d.eps_pct < -0.05; });
    var poss = r.drivers.filter(function (d) { return d.eps_pct !== null && d.eps_pct > 0.5; });
    var hasDebt = co.debt > 0 && co.interest > 0, cov = r.stressed.interest_cover;
    if (r.label === 'Debt cover at risk') out.push({ k: 'warn', p: 0, t: 'Interest cover falls to ' + xx(cov), d: 'Operating profit would cover interest only ' + xx(cov) + ' after this shock, from ' + xx(r.base.interest_cover) + '. Under 1.5× the label reads Debt cover at risk, whatever happens to EPS.' });
    if (r.stressed.eps < 0) out.push({ k: 'warn', p: 0, t: 'Earnings turn into a loss', d: 'Under these assumptions EPS goes from ' + rs(r.base.eps) + ' to ' + rs(r.stressed.eps) + '.' });
    else if (e !== null && e <= -50) out.push({ k: 'warn', p: 1, t: 'Earnings more than halve', d: 'EPS falls ' + Math.abs(e).toFixed(1) + '%, from ' + rs(r.base.eps) + ' to ' + rs(r.stressed.eps) + '.' });
    // near a label line
    if (e !== null && r.label !== 'Debt cover at risk') {
      [-10, -30, 10].forEach(function (L) {
        if (Math.abs(e - L) <= 2) {
          var alt = sureRows(co, sc)[0], other = null;
          if (alt) alt.vals.forEach(function (v, i) { var p = {}; p[alt.d.k] = v; var l2 = E.run(E.withExposure(co, p), sc).label; if (!other && l2 !== r.label) other = [alt.d, v, l2]; });
          out.push({ k: 'watch', p: 2, t: 'Close to the ' + (L < 0 ? M : '+') + Math.abs(L) + '% line', d: 'EPS moves ' + pct(e) + ', so a small change in the assumptions changes the label.' + (other ? ' With ' + other[0].name + ' at ' + other[0].f(other[1]) + ' it reads <b>' + other[2] + '</b>.' : '') });
        }
      });
    }
    if (negs.length && e !== null && e < -1) {
      var top = negs[0], tot = negs.reduce(function (a, d) { return a + d.eps_pct; }, 0);
      var tShare = top.eps_pct / tot, back = poss[0];
      out.push({ k: 'ins', p: 3, t: cap(PHR[top.key]) + verb(top.key, ' is', ' are') + (tShare > 0.5 ? ' the main drag' : ' the biggest drag'),
                 d: cap(PHR[top.key]) + verb(top.key, ' takes ', ' take ') + Math.abs(top.eps_pct).toFixed(1) + ' points off EPS, out of a total change of ' + sgn(e) + (back && back.eps_pct > 1 ? '; ' + PHR[back.key] + verb(back.key, ' adds', ' add') + ' back ' + back.eps_pct.toFixed(1) + '.' : negs[1] ? '; next ' + verb(negs[1].key, 'is ', 'are ') + PHR[negs[1].key] + ' at ' + Math.abs(negs[1].eps_pct).toFixed(1) + '.' : '.') });
    }
    if (w.cost_increase_total_rs_cr > 1) out.push({ k: 'ins', p: 4, t: 'Prices recover ' + share(w.share_recovered) + ' of the cost rise', d: 'Input costs rise ' + cr(w.cost_increase_total_rs_cr) + '; about ' + cr(w.recovered_through_prices_rs_cr) + ' comes back through higher prices within the year and ' + cr(w.cost_increase_total_rs_cr - w.recovered_through_prices_rs_cr) + ' is absorbed.' });
    else if (w.cost_increase_total_rs_cr < -1) out.push({ k: 'good', p: 4, t: 'Costs fall by ' + cr(-w.cost_increase_total_rs_cr), d: 'About ' + share(w.share_recovered) + ' of the saving is passed on to customers as lower prices; the rest stays in profit.' });
    var netCash = co.cash - co.debt;
    if (!hasDebt || (cov !== null && cov >= 8)) out.push({ k: 'good', p: 5, t: 'Debt is not a pressure point', d: (netCash > 0 ? 'Cash and investments exceed debt by ' + cr(netCash) + ', and o' : 'O') + 'perating profit covers interest ' + xx(cov) + ' after the shock.' });
    else if (hasDebt && cov !== null && cov >= 1.5 && cov < 3) out.push({ k: 'watch', p: 2, t: 'Interest cover gets thin: ' + xx(cov), d: 'Operating profit would cover interest ' + xx(cov) + ', from ' + xx(r.base.interest_cover) + '. Under 1.5× it would read <b>Debt cover at risk</b>.' });
    if (poss.length) out.push({ k: 'good', p: 6, t: cap(PHR[poss[0].key]) + verb(poss[0].key, ' helps', ' help'), d: sgn(poss[0].eps_pct) + ' points of EPS' + (poss[0].key === 'interest' && netCash > 0 ? ': with more cash than debt, higher rates add more to interest earned than to interest paid.' : poss[0].key === 'demand' ? ' from higher volumes.' : '.') });
    var o = r.value_other_persistence;
    if (SHOWV && r.value && o && Math.abs(o.move_pct - r.value.move_pct) >= 5 && S.persistence === 'one_year') out.push({ k: 'watch', p: 7, t: 'If the hit lasts, value moves ' + pct(o.move_pct), d: 'The value move of ' + pct(r.value.move_pct) + ' assumes earnings get back on their path after a year. If the lower earnings last, it is ' + pct(o.move_pct) + '.' });
    if (SHOWV && r.value && sc.rate_bp >= 100 && Math.abs(e) < 3 && r.value.move_pct < -5) out.push({ k: 'ins', p: 3, t: 'Earnings barely move; value falls', d: 'Higher rates barely touch earnings here, but they raise the return investors ask for, so the value move is ' + pct(r.value.move_pct) + '.' });
    out.sort(function (a, b) { return a.p - b.p; });
    var g = 0; out = out.filter(function (c) { return c.k !== 'good' || ++g <= (e !== null && e <= -10 ? 1 : 2); });
    return out.slice(0, 4);
  }
  function renderCalls(r, co, sc) { var c = insights(r, co, sc); $('calls').innerHTML = c.map(call).join(''); $('calls').hidden = !c.length; }

  function renderAna(r, co, sc) {
    var cp = r.change_pct, w = r.working, b = r.base, s = r.stressed, P = [];
    var costs = w.cost_increase_total_rs_cr;
    if (Math.abs(cp.revenue) >= 0.05 || Math.abs(cp.ebitda || 0) >= 0.05) {
      var why = w.volume_change_pct <= -0.5 ? 'volumes fall ' + Math.abs(w.volume_change_pct).toFixed(1) + '%' : w.volume_change_pct >= 0.5 ? 'volumes rise ' + w.volume_change_pct.toFixed(1) + '%' : '';
      var pr = w.recovered_through_prices_rs_cr > 1 ? short(co) + ' raises prices to recover part of higher costs' : w.recovered_through_prices_rs_cr < -1 ? 'it passes part of lower costs on as lower prices' : '';
      P.push('<b>What changes.</b> Revenue moves ' + pct(cp.revenue) + (why || pr ? ' as ' + [why, pr].filter(Boolean).join(' and ') : '') + '. EBITDA moves ' + pct(cp.ebitda) + ', so the margin goes from ' + pc(b.ebitda_margin_pct) + ' to ' + pc(s.ebitda_margin_pct) + ' (' + pt(cp.margin_pts) + '). After depreciation, interest and tax, earnings per share move ' + pct(cp.eps) + '.');
    } else P.push('<b>What changes.</b> Revenue and operating profit do not move under this shock; only interest and the value step do.');
    if (Math.abs(costs) > 1) {
      var parts = ['crude', 'inflation', 'rupee', 'commodities'].map(function (k) { return [k, w.cost_increase_rs_cr[k]]; }).filter(function (x) { return Math.abs(x[1]) >= 1; }).sort(function (a, b) { return Math.abs(b[1]) - Math.abs(a[1]); });
      var nm = { crude: 'crude', inflation: 'wages and general inflation', rupee: 'the rupee', commodities: 'metals and farm prices' };
      P.push('<b>Where the cost comes from.</b> Input costs ' + (costs > 0 ? 'rise ' : 'fall ') + cr(Math.abs(costs)) + ': ' + parts.map(function (x) { return nm[x[0]] + ' ' + cr(x[1]); }).join(', ') + '. About ' + share(w.share_recovered) + ' of it is recovered through prices within the year' + (co.exposure.export_rev > 0 ? ' (export sales, ' + share(co.exposure.export_rev) + ' of revenue, are priced abroad)' : '') + '.');
    }
    var dl = [];
    if (co.debt > 0 && co.interest > 0) dl.push('operating profit covers interest ' + xx(s.interest_cover) + ', from ' + xx(b.interest_cover));
    if (co.cash > co.debt) dl.push('cash and investments of ' + cr(co.cash) + ' exceed debt of ' + cr(co.debt));
    if (SHOWV && r.value) dl.push('the value move under these assumptions is ' + pct(r.value.move_pct) + (r.value_other_persistence ? ' (' + pct(r.value_other_persistence.move_pct) + ' ' + (S.persistence === 'one_year' ? 'if the hit lasts' : 'if it lasts only a year') + ')' : ''));
    if (dl.length) P.push('<b>' + (SHOWV ? 'Debt and value' : 'Debt') + '.</b> ' + cap(dl.join('; ')) + '.');
    var lq = D.backtest.latest_quarter;
    var care = '';
    if (co === A || co.symbol === A.symbol) {
      var inv = A.inventory_days_fy26 ? ' (' + short(A) + ' held about ' + A.inventory_days_fy26 + ' days of inventory in its latest year)' : '';
      var lqs = '';
      if (lq && lq.predicted != null && lq.reported != null && lq.margin_before != null) {
        var dp = lq.predicted - lq.margin_before, dr = lq.reported - lq.margin_before, right = (dp >= 0) === (dr >= 0);
        lqs = ' In the latest quarter the model put the margin at ' + pc(lq.predicted) + ' and ' + short(A) + ' reported ' + pc(lq.reported) + ' (from ' + pc(lq.margin_before) + '): ' + (right ? 'the right direction' + (Math.abs(dp) > Math.abs(dr) ? ', with the move over-stated' : Math.abs(dp) < Math.abs(dr) ? ', with the move under-stated' : '') : 'the wrong direction') + '.';
      }
      care = '<div class="care"><b>Read with care.</b> Costs reach the income statement with a delay set by how much stock a company holds' + inv + ', and prices follow later still, so a hit like this tends to show over several quarters.' + lqs + '</div>';
    }
    $('ana').innerHTML = '<div class="p">' + P.map(function (p) { return '<p>' + p + '</p>'; }).join('') + care + '</div><div>' + walkHtml(r) + '</div>';
  }
  function walkHtml(r) {
    var w = r.working, rows = [];
    var dC = w.cost_increase_total_rs_cr, rec = w.recovered_through_prices_rs_cr;
    var vol = r.drivers.filter(function (d) { return d.key === 'demand'; })[0].rs_cr;
    var intr = r.drivers.filter(function (d) { return d.key === 'interest'; })[0].rs_cr;
    var fx = r.drivers.filter(function (d) { return d.key === 'rupee'; })[0].rs_cr + (w.cost_increase_rs_cr.rupee * (1 - w.share_recovered));
    rows.push(['Input costs change', -dC], ['Recovered through prices', rec]);
    if (Math.abs(fx) >= 1) rows.push(['Export earnings from the rupee', fx]);
    if (Math.abs(vol) >= 1) rows.push(['Volumes', vol]);
    if (Math.abs(intr) >= 1) rows.push(['Interest paid and earned', intr]);
    var tot = rows.reduce(function (a, x) { return a + x[1]; }, 0);
    var mx = Math.max.apply(null, rows.map(function (x) { return Math.abs(x[1]); }).concat([Math.abs(tot), 1]));
    var bar = function (v) { var wd = Math.abs(v) / mx * 50; return '<i style="left:' + (v < 0 ? 50 - wd : 50) + '%;width:' + wd.toFixed(2) + '%;background:' + (v < 0 ? 'var(--dn)' : 'var(--up)') + '"></i><i style="left:50%;width:1px;top:0;height:22px;background:#b4a788"></i>'; };
    return '<h3>From costs to profit, before tax' + ib('How the shock reaches profit before tax, in ₹ Cr over the next 12 months. Red lowers profit, green adds to it. The last line equals the change in profit before tax in the table below.', 'rt', 'About this chart') + '</h3><div class="walk" style="margin-top:10px">' +
      rows.map(function (x) { return '<div class="row" data-tip="' + esc(x[0] + ': ' + cr(x[1])) + '" tabindex="0"><div class="lbl"><span>' + x[0] + '</span><span class="val">' + cr(x[1]) + '</span></div><div class="bw">' + bar(x[1]) + '</div></div>'; }).join('') +
      '<div class="row tot"><div class="lbl"><span><b>Change in profit before tax</b></span><span class="val">' + cr(tot) + '</span></div><div class="bw">' + bar(tot) + '</div></div></div>';
  }

  /* ------------------------------------------------------------------ tables and bars */
  function renderTable(r, co) {
    var b = r.base, s = r.stressed, cp = r.change_pct;
    var rows = [
      ['Revenue', cr(b.revenue), cr(s.revenue), pct(cp.revenue), cp.revenue, ''],
      ['EBITDA', cr(b.ebitda), cr(s.ebitda), pct(cp.ebitda), cp.ebitda, ''],
      ['EBITDA margin', pc(b.ebitda_margin_pct), pc(s.ebitda_margin_pct), pt(cp.margin_pts), cp.margin_pts, ''],
      ['Other income', cr(b.other_income), cr(s.other_income), pct((s.other_income / b.other_income - 1) * 100), s.other_income - b.other_income, 'Interest and dividends on cash and investments, which earn more when rates rise.'],
      ['Depreciation', cr(b.depreciation), cr(s.depreciation), '0.0%', 0, 'Held at the base level for the year.'],
      ['Interest', cr(b.interest), cr(s.interest), b.interest > 0 ? pct((s.interest / b.interest - 1) * 100) : '–', -(s.interest - b.interest), share(co.exposure.floating_debt) + ' of debt is assumed to reset to the new rate within the year.'],
      ['Profit before tax', cr(b.pbt), cr(s.pbt), pct((s.pbt / b.pbt - 1) * 100), s.pbt - b.pbt, ''],
      ['Earnings per share', rs(b.eps), rs(s.eps), pct(cp.eps), cp.eps, 'After tax at ' + pc(co.tax_rate * 100) + ', the rate the company paid over the last four quarters, on ' + co.shares.toFixed(2) + ' Cr shares.'],
      ['Interest cover', xx(b.interest_cover), xx(s.interest_cover), s.interest_cover !== null && b.interest_cover !== null ? sgn(s.interest_cover - b.interest_cover) + '×' : '–', (s.interest_cover || 0) - (b.interest_cover || 0), '']
    ];
    var body = rows.map(function (x, i) {
      var cls = Math.abs(x[4]) < 0.005 ? '' : x[4] < 0 ? ' dn' : ' up';
      return '<tr' + (i === 7 ? ' class="hl"' : '') + '><td class="l">' + x[0] + (x[5] ? ib(x[5], 'lt', 'About ' + x[0]) : '') + '</td><td class="r">' + x[1] + '</td><td class="r"><b>' + x[2] + '</b></td><td class="r' + cls + '">' + x[3] + '</td></tr>';
    }).join('');
    var v = SHOWV && r.value ? '<tr><td class="l">Value move under these assumptions' + ib('An earnings-based value, not a price estimate, and never applied to the share price. ' + (S.persistence === 'one_year' ? 'Assumes earnings get back on their path after a year.' : 'Assumes the lower earnings last.'), 'lt', 'About the value move') + '</td><td class="r">–</td><td class="r">–</td><td class="r' + (r.value.move_pct < -0.05 ? ' dn' : r.value.move_pct > 0.05 ? ' up' : '') + '">' + pct(r.value.move_pct) + '</td></tr>' : '';
    $('tbl').innerHTML = '<h2>The numbers, before and after' + ib('The last four quarters as reported (' + D.base_window[0] + ' to ' + D.base_window[1] + '), and the same 12 months with the shock applied. ₹ Cr unless shown.', 'lt', 'About this table') + '</h2>' +
      '<p class="sub">Last four quarters against the next 12 months under ' + scName(cur()) + '</p>' +
      '<div class="tw"><table class="t"><thead><tr><th>Line</th><th class="r">Last four quarters</th><th class="r">After the shock</th><th class="r">Change</th></tr></thead><tbody>' + body + v + '</tbody></table></div>';
  }
  function niceMax(v) { var s = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]; var p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 0.1)))); for (var i = 0; i < s.length; i++) if (s[i] * p >= v) return s[i] * p; return 10 * p; }
  function barsHtml(items, unit, opts) {
    opts = opts || {};
    var vals = items.map(function (d) { return d.v; }).concat(opts.total !== undefined ? [opts.total] : []);
    var sc = axisOf(vals), lo = sc[0], hi = sc[1];
    var X = function (v) { return (v - lo) / (hi - lo) * 100; };
    var row = function (d, tot) {
      var a = X(Math.min(0, d.v)), b = X(Math.max(0, d.v)), cls = Math.abs(d.v) < 0.005 ? 'nil' : d.v < 0 ? 'neg' : 'pos';
      return '<div class="bar' + (tot ? ' tot' : '') + '" tabindex="0" data-tip="' + esc(d.tip || (d.n + ': ' + d.f)) + '"><span class="n">' + d.n + '</span><span class="p"><span class="z" style="left:' + X(0) + '%"></span><i class="' + cls + '" style="left:' + a.toFixed(2) + '%;width:' + Math.max(0.4, b - a).toFixed(2) + '%"></i></span><span class="v">' + d.f + '</span></div>';
    };
    var f = function (v) { return unit === 'cr' ? crn(v) : sgn(v, Math.abs(v) >= 10 || v === Math.round(v) ? 0 : 1); };
    var ax = '<span>' + (sc[2] ? '' : f(lo)) + '</span>' + (lo < 0 && hi > 0 ? '<span style="position:absolute;left:' + X(0) + '%;transform:translateX(-50%)">0</span>' : '') + '<span>' + (sc[3] ? '' : f(hi)) + '</span>';
    return '<div class="bars">' + items.map(function (d) { return row(d); }).join('') + (opts.total !== undefined ? row({ n: opts.totalName, v: opts.total, f: opts.totalF, tip: opts.totalTip }, true) : '') +
      '<div class="axis"><span></span><div style="position:relative">' + ax + '</div><span></span></div></div>';
  }
  /** Axis from the data: each side only as long as its values need (a nice number), a short stub kept for a tiny other side. */
  function axisOf(vals) {
    var mn = 0, mp = 0; vals.forEach(function (v) { if (v < mn) mn = v; if (v > mp) mp = v; });
    var lo = mn < -1e-9 ? -niceMax(-mn) : 0, hi = mp > 1e-9 ? niceMax(mp) : 0, fl = false, fh = false;
    if (!lo && !hi) return [-1, 1, false, false];
    if (lo && hi && hi < 0.12 * -lo) { hi = 0.12 * -lo; fh = true; }
    if (lo && hi && -lo < 0.12 * hi) { lo = -0.12 * hi; fl = true; }
    return [lo, hi, fl, fh];
  }
  function renderDrivers(r, co) {
    var eps = S.unit === 'eps';
    var items = r.drivers.map(function (d) {
      var v = eps ? d.eps_pct : d.rs_cr; d = Object.assign({}, d, { name: d.key === 'demand' ? 'Volumes' : d.name });
      var c = r.working.cost_increase_rs_cr[d.key];
      return { n: d.name, v: v, f: eps ? sgn(v) + ' pt' : cr(v), tip: d.name + ': ' + sgn(d.eps_pct) + ' points of EPS, ' + cr(d.rs_cr) + ' of profit before tax' + (c && Math.abs(c) >= 1 ? '. Costs change ' + cr(c) + ' before price rises.' : '.') };
    });
    var tot = eps ? r.change_pct.eps : r.stressed.pbt - r.base.pbt;
    $('drv').innerHTML = '<div class="ptop" style="align-items:center"><div><h2>What drives it' + ib('Each bar is one driver’s effect, after any cost it recovers through prices. In <b>EPS points</b> they add up to the change in earnings per share; in <b>₹ Cr</b> to the change in profit before tax.', 'lt', 'About what drives it') + '</h2><p class="sub">Sorted from the biggest drag</p></div>' +
      '<span class="seg sm" role="group" aria-label="Units"><button type="button" data-unit="eps" aria-pressed="' + eps + '">EPS points</button><button type="button" data-unit="cr" aria-pressed="' + !eps + '">₹ Cr</button></span></div>' +
      barsHtml(items, eps ? 'pt' : 'cr', { total: tot, totalName: eps ? 'Change in EPS' : 'Change in profit before tax', totalF: eps ? pct(tot) : cr(tot), totalTip: 'Total: ' + (eps ? pct(tot) + ' change in EPS' : cr(tot) + ' change in profit before tax') }) +
      '<div class="legend"><span><i style="background:var(--dn)"></i>Lowers earnings</span><span><i style="background:var(--up)"></i>Adds to earnings</span></div>';
  }
  function renderSens(co) {
    var sv = E.sensitivities(co).slice().sort(function (a, b) { return Math.abs(b.eps_pct) - Math.abs(a.eps_pct); });
    var bp = E.breakingPoints(co), baseBrent = D.today_inputs.brent_base;
    var items = sv.map(function (d) { return { n: d.name, v: d.eps_pct, f: pct(d.eps_pct), tip: d.name + ', on its own: EPS ' + pct(d.eps_pct) }; });
    var top = sv[0], crude = sv.filter(function (x) { return x.key === 'crude'; })[0];
    var tile = function (l, v, s) { return '<div class="bp"><span class="l">' + l + '</span><span class="v">' + v + '</span><span class="s">' + s + '</span></div>'; };
    var netCash = co.cash > co.debt;
    $('sens').innerHTML = '<h2>What moves ' + short(co) + ' most' + ib('Each driver moved by one step on its own, with every other shock at zero, from the last four quarters. Shows which shocks this business is most sensitive to.', 'lt', 'About this chart') + '</h2><p class="sub">EPS change for one step in each driver, alone</p>' +
      barsHtml(items, 'pct') +
      (top.key !== 'crude' && crude ? '<p class="note"><b>' + top.name + '</b> cuts EPS ' + Math.abs(top.eps_pct).toFixed(1) + '%, more than crude oil 10% higher (' + pct(crude.eps_pct) + ').</p>' : '') +
      '<h3 style="margin-top:18px">Breaking points' + ib('The size of one shock, on its own, that would halve earnings per share or take interest cover below 1.5×.', 'lt', 'About breaking points') + '</h3>' +
      '<div class="bps">' +
      tile('Crude rise that halves EPS', bp.crude_pct === null ? 'None found' : pct(bp.crude_pct, 0), bp.crude_pct === null ? 'within the range tested' : 'Brent at about US$' + Math.round(baseBrent * (1 + bp.crude_pct / 100)) + ', from US$' + baseBrent.toFixed(2)) +
      tile('Volume fall that halves EPS', bp.demand_pct === null ? 'None found' : pct(bp.demand_pct, 0), bp.demand_pct === null ? 'within the range tested' : 'for ' + short(co) + ', on its own') +
      tile('Rate rise that takes cover under 1.5×', bp.rate_bp === null ? 'None' : '+' + Math.round(bp.rate_bp).toLocaleString('en-IN') + ' bp', bp.rate_bp === null ? (netCash ? 'more cash than debt' : 'within the range tested') : 'from ' + xx(E.run(co, { crude: 0 }).base.interest_cover) + ' today') +
      '</div>';
  }
  function renderEvery(co) {
    var ids = ALL_IDS.concat(S.scen === 'custom' ? ['custom'] : []);
    var curId = S.scen === 'today' ? (S.todayCrude === 'eia' ? 'today_eia' : 'today') : S.scen;
    var body = ids.map(function (id) {
      var sc = id === 'custom' ? Object.assign({}, S.custom, { persistence: S.persistence }) : scenOf(id), r = E.run(co, sc), e = r.change_pct.eps;
      return '<tr class="click' + (id === curId ? ' on' : '') + '" data-pick="' + id + '" tabindex="0"><td class="l">' + (id === 'custom' ? 'Custom' : esc(SC[id].name)) + '</td><td class="r' + (e < -0.05 ? ' dn' : e > 0.05 ? ' up' : '') + '">' + pct(e) + '</td><td class="r">' + pc(r.stressed.ebitda_margin_pct) + '</td><td class="r">' + xx(r.stressed.interest_cover) + '</td>' + (SHOWV ? '<td class="r">' + (r.value ? pct(r.value.move_pct) : '–') + '</td>' : '') + '<td class="r"><b>' + (r.score === null ? '–' : r.score) + '</b></td><td>' + labPill(r.label) + '</td></tr>';
    }).join('') + Object.keys(LOCKED).filter(function (id) { return id !== 'custom'; }).map(function (id) {
      return '<tr class="lockrow"><td class="l">' + esc(LOCKED[id]) + '</td><td colspan="' + (SHOWV ? 6 : 5) + '">' + gtag() + ' <small>Included with Gold</small></td></tr>';
    }).join('');
    var worst = ids.map(function (id) { var sc = id === 'custom' ? S.custom : scenOf(id); return [id, E.run(co, sc).change_pct.eps]; }).sort(function (a, b) { return a[1] - b[1]; })[0];
    $('every').innerHTML = '<h2>Every scenario at a glance' + ib('The same company under each scenario, with today’s settings. Pick a row to see it in full.', 'lt', 'About this table') + '</h2><p class="sub">Pick a row to open it. The hardest for ' + short(co) + ' is ' + (worst[0] === 'custom' ? 'your custom shock' : '‘' + SC[worst[0]].name + '’') + ' (EPS ' + pct(worst[1]) + ').</p>' +
      '<div class="tw"><table class="t"><thead><tr><th>Scenario</th><th class="r">EPS change</th><th class="r">EBITDA margin after</th><th class="r">Interest cover after</th>' + (SHOWV ? '<th class="r">Value move</th>' : '') + '<th class="r">Score</th><th>Label</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }
  function renderHist(cos) {
    var H = D.history, last = D.as_of || '2026-10-29', NO = { fall_pct: null, back: null };
    var rows = H.map(function (h) {
      var so = h.to > last, nf = h.nifty || NO, rng = dt(h.from).replace(/ \d{4}$/, '') + ' to ' + (so ? dt(last) : dt(h.to));
      var back = function (x) { return x.fall_pct === null ? '–' : x.back ? dt(x.back) : 'Not yet, by ' + dt(last); };
      var cells = cos.map(function (c) {
        var x = h[c.symbol];
        return x ? '<td class="r' + (x.fall_pct < 0 ? ' dn' : '') + '">' + pct(x.fall_pct) + '</td><td class="r"><small>' + back(x) + '</small></td>' : '<td class="r" colspan="2"><small>' + 'Listed later' + '</small></td>';
      }).join('');
      return '<tr><td class="l">' + esc(h.episode.replace('2026 so far', '2026 oil spike, so far')) + '<br><small>' + rng + '</small></td><td class="r">' + pct(nf.fall_pct) + '</td><td class="r"><small>' + back(nf) + '</small></td>' + cells + '</tr>';
    }).join('');
    var a = cos[0], less = [], more = [], faster = 0, both = 0;
    H.forEach(function (h) { var x = h[a.symbol]; if (!x || !h.nifty || h.nifty.fall_pct === null) return; var y = h.episode.slice(0, 4); (x.fall_pct > h.nifty.fall_pct ? less : more).push(y); if (x.back && h.nifty.back) { both++; if (x.back < h.nifty.back) faster++; } });
    var line = short(a) + ' fell less than the Nifty 50 in ' + (less.length ? less.join(' and ') : 'none of these episodes') + (more.length ? ' and more in ' + more.join(', ').replace(/, (\d+)$/, ' and $1') : '') + '.' + (both && faster === both ? ' Each time both recovered, it was back at its high first.' : '');
    $('hist').innerHTML = '<h2>What happened in real shocks' + ib('Share prices, not earnings. For each episode: the largest fall from a closing high to a later closing low inside the window, and the first close back at that high. From weekly closes; the 2026 row runs to the latest close.', 'lt', 'About this table') + '</h2><p class="sub">Largest fall from a closing high inside each episode, and when the price first closed back at that high</p>' +
      '<div class="tw"><table class="t"><thead><tr><th>Episode</th><th class="r">Nifty 50</th><th class="r">Back at its high</th>' + cos.map(function (c) { return '<th class="r">' + esc(short(c)) + '</th><th class="r">Back at its high</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="calls" style="margin-top:12px;grid-template-columns:1fr">' + call({ k: 'ins', t: (more.length >= less.length ? 'Fell more than the Nifty 50 in ' + more.length : 'Fell less than the Nifty 50 in ' + less.length) + ' of ' + (more.length + less.length) + ' episodes', d: line + ' Past falls show how the shares behaved, not what happens next.' }) + '</div>';
  }
  function renderBT() {
    var bt = D.backtest, sm = bt.summary && bt.summary.all_years, lq = bt.latest_quarter;
    if (!bt.years || !bt.years.length || !sm) { $('bt').innerHTML = '<h2>How the model did on ' + poss(A) + ' past years</h2><p class="sub">There are not enough past years of results to test the model on this company yet.</p>'; return; }
    var rows = bt.years.map(function (y) {
      var right = (y.change_predicted_pts >= 0) === (y.change_reported_pts >= 0);
      return '<tr><td class="l">' + y.from + ' to ' + y.to + '</td><td class="r">' + pct(y.input_inflation_pct) + '</td><td class="r">' + pc(y.margin_before) + '</td><td class="r">' + pt(y.change_predicted_pts) + '</td><td class="r">' + pt(y.change_reported_pts) + '</td><td class="r">' + sgn(y.error_pts) + '</td><td>' + (right ? '<span class="pill g">Right direction</span>' : '<span class="pill a">Wrong direction</span>') + '</td></tr>';
    }).join('');
    var miss = bt.years.slice().sort(function (a, b) { return Math.abs(b.error_pts) - Math.abs(a.error_pts); })[0];
    var cy = (D.calibration_years || []).filter(function (y) { return y.year === miss.to; })[0];
    var tile = function (l, v, s) { return '<div class="bp"><span class="l">' + l + '</span><span class="v">' + v + '</span><span class="s">' + s + '</span></div>'; };
    $('bt').innerHTML = '<h2>How the model did on ' + poss(A) + ' past years' + ib('Each year starts from the figures as reported and applies what actually happened to crude, the rupee and prices over the next year. It uses the ' + (A.industry || 'industry') + ' pass-through, not ' + poss(A) + ' own estimate, so the test is not tuned to the company.', 'lt', 'About the back-test') + '</h2><p class="sub">Predicted against reported change in the EBITDA margin, FY19 to FY26</p>' +
      '<div class="sumt">' + tile('Direction right', sm.direction_right + ' of ' + sm.years + ' years', 'whether the margin rose or fell') + tile('Average gap', sm.mean_abs_error_pts.toFixed(1) + ' pt', 'against an average move of ' + sm.mean_abs_change_reported_pts.toFixed(1) + ' pt') +
      (lq && lq.predicted != null ? tile('Latest quarter, not used to build it', pc(lq.predicted) + ' vs ' + pc(lq.reported), 'margin predicted vs reported, ' + lq.to + ', from ' + pc(lq.margin_before)) : '') + '</div>' +
      '<div class="calls" style="margin-top:12px;grid-template-columns:1fr">' + call({ k: 'watch', t: miss.to + ' is the biggest miss: ' + sgn(miss.error_pts) + ' pt', d: (cy && cy.catch_up_year ? 'Prices kept rising after input costs had stopped, as ' + short(A) + ' caught up on the year before. A 12-month model with no memory of last year cannot see that. ' : 'The model’s 12-month view missed the size of this move. ') + 'The big shock year, FY22, is called in the right direction but under-stated.' }) + '</div>' +
      '<details class="fold"><summary>See every year</summary><div class="tw"><table class="t"><thead><tr><th>Year</th><th class="r">Input cost inflation</th><th class="r">Margin before</th><th class="r">Predicted change</th><th class="r">Reported change</th><th class="r">Gap, pt</th><th>Direction</th></tr></thead><tbody>' + rows + '</tbody></table></div></details>';
  }
  var FIELD = {
    pass_through: ['Cost rises passed on to customers', share, 'Share of a rise in input costs recovered through higher prices within 12 months'],
    crude_rm: ['Materials linked to crude', share, 'Share of raw materials whose price follows crude (for example monomers and solvents in paints)'],
    crude_beta: ['How far a crude move reaches them', function (v) { return v.toFixed(2) + '×'; }, 'Move in those materials for a 1% move in crude priced in rupees'],
    import_rm: ['Imported materials', share, 'Share of raw materials imported and priced in dollars, apart from the crude-linked ones'],
    metal_rm: ['Metal-linked materials', share, 'Share of raw materials priced off steel, aluminium or copper'],
    agri_rm: ['Farm-linked materials', share, 'Share of raw materials priced off farm commodities'],
    energy_opex: ['Fuel, power and freight', share, 'Share of other expenses that is energy and freight'],
    energy_beta: ['How far a crude move reaches energy costs', function (v) { return v.toFixed(2) + '×'; }, 'Move in energy costs for a 1% move in crude priced in rupees'],
    var_opex: ['Other expenses that move with volume', share, 'Share of other expenses that rises and falls with sales volume within a year'],
    export_rev: ['Export sales', share, 'Share of revenue earned in foreign currency'],
    crude_rev: ['Revenue linked to crude', share, 'Share of revenue whose price follows crude (refiners, oil producers)'],
    crude_rev_beta: ['How far crude moves that revenue', function (v) { return v.toFixed(2) + '×'; }, 'Move in that revenue for a 1% move in crude'],
    demand_beta: ['How strongly volumes follow demand', function (v) { return v.toFixed(2) + '×'; }, 'Change in this company’s volumes for a 1% change in the average company’s'],
    floating_debt: ['Debt at floating rates', share, 'Share of borrowings whose rate resets within 12 months']
  };
  var EDITABLE = { pass_through: [0, 100, 1], crude_rm: [0, 95, 1], import_rm: [0, 95, 1], export_rev: [0, 100, 1], demand_beta: [0.2, 2.5, 0.05], floating_debt: [0, 100, 5] };
  function srcText(co, k) {
    var c = co.calibration && co.calibration[k];
    if (c && c.from_history) return 'Estimated from its own history' + (k === 'pass_through' ? ' of cost shocks' : '') + ' and the ' + (co.sector || 'industry') + ' industry';
    return String(co.field_source[k] || '').replace('FinLit default for all companies', 'Default for all companies');
  }
  function renderAsm() {
    var co = A, base = co, eb = E.ebitda(co);
    var line = function (l, v, s) { return '<tr><td class="l">' + l + '</td><td class="r">' + v + '</td><td><small>' + (s || '') + '</small></td></tr>'; };
    var t1 = line('Revenue', cr(co.revenue)) + line('Raw materials', cr(co.rm), pc(co.rm / co.revenue * 100) + ' of revenue') + line('Employee costs', cr(co.emp), pc(co.emp / co.revenue * 100)) + line('Other expenses', cr(co.opex), pc(co.opex / co.revenue * 100)) +
      line('EBITDA', cr(eb), pc(eb / co.revenue * 100) + ' margin') + line('Other income', cr(co.other_income)) + line('Depreciation', cr(co.dep)) + line('Interest', cr(co.interest)) +
      line('Tax rate', pc(co.tax_rate * 100), 'tax paid over the four quarters') + line('Shares', co.shares.toFixed(2) + ' Cr') + line('Debt', cr(co.debt), 'latest balance sheet') + line('Cash and investments', cr(co.cash), 'latest balance sheet') +
      line('EPS, model', rs(E.eps(co)), 'what the model starts from') + line('EPS, reported', rs(co.reported_eps), 'the model leaves out exceptional items and minority interests');
    var keys = ['pass_through', 'crude_rm', 'crude_beta', 'import_rm', 'metal_rm', 'agri_rm', 'energy_opex', 'energy_beta', 'var_opex', 'export_rev', 'crude_rev', 'demand_beta', 'floating_debt'];
    var t2 = keys.map(function (k) {
      var F = FIELD[k], v0 = co.exposure[k], v = S.edits[k] !== undefined ? S.edits[k] : v0, ed = EDITABLE[k];
      var inp = ed ? '<input class="edit' + (S.edits[k] !== undefined ? ' ch' : '') + '" type="number" inputmode="decimal" data-edit="' + k + '" min="' + ed[0] + '" max="' + ed[1] + '" step="' + ed[2] + '" value="' + (k === 'demand_beta' ? v.toFixed(2) : Math.round(v * 100)) + '" aria-label="Your value for ' + F[0] + (k === 'demand_beta' ? '' : ', in %') + '">' + (k === 'demand_beta' ? '×' : '%') : '';
      return '<tr' + (S.edits[k] !== undefined ? ' class="hl"' : '') + '><td class="l">' + F[0] + ib(F[2], 'lt', 'About ' + F[0]) + '</td><td class="r"><b>' + F[1](v0) + '</b></td><td><small>' + esc(srcText(co, k)) + '</small></td>' + (GOLD ? '<td class="r" style="white-space:nowrap">' + inp + '</td>' : '') + '</tr>';
    }).join('');
    $('asm').innerHTML = '<h2>The assumptions behind it' + ib('Every number the model uses for ' + short(co) + ', and where it came from. You can try your own value for the six settings with a box; everything on the page updates.', 'lt', 'About the assumptions') + '</h2><p class="sub">' + esc(co.name) + ', consolidated, four quarters ' + D.base_window[0] + ' to ' + D.base_window[1] + '. Data to ' + dt(D.as_of) + '.</p>' +
      '<div class="asmgrid" style="margin-top:4px"><div><h3 style="margin-top:12px">The base: the last four quarters</h3><div class="tw"><table class="t"><tbody>' + t1 + '</tbody></table></div></div>' +
      '<div><h3 style="margin-top:12px">How the business is exposed</h3><div class="tw"><table class="t"><thead><tr><th>Setting</th><th class="r">Estimate</th><th>Where it comes from</th>' + (GOLD ? '<th class="r">Your value</th>' : '') + '</tr></thead><tbody>' + t2 + '</tbody></table></div>' +
      (SHOWV ? '<p class="note">The value move also uses the company’s sensitivity to the market (the market average until a measured one is available) and its long-run growth.</p>' : '') + (GOLD ? '' : '<p class="note">' + LOCKI + ' With Gold you can try your own value for six of these settings.</p>') + '</div></div>' +
      '<p class="note">The pass-through is estimated from the years when ' + poss(co) + ' input costs moved most, and pulled towards the ' + (co.sector || '') + ' industry’s value because there are only a few such years.</p>';
  }

  /* ------------------------------------------------------------------ compare view */
  function compareSummary(ra, rb, a, b) {
    var ea = ra.change_pct.eps, eb = rb.change_pct.eps;
    if (ea === null || eb === null) return 'One of the two made a loss in the base period, so the EPS changes cannot be compared.';
    if (Math.abs(ea - eb) < 3) return 'Both are affected about equally: EPS ' + pct(ea) + ' for ' + short(a) + ' and ' + pct(eb) + ' for ' + short(b) + '.';
    var lo = ea < eb ? [ra, a, ea] : [rb, b, eb], hi = ea < eb ? [rb, b, eb] : [ra, a, ea];
    return short(lo[1]) + ' is more exposed to this shock: EPS ' + pct(lo[2]) + ' against ' + pct(hi[2]) + ' for ' + short(hi[1]) + ', mainly through ' + PHR[lo[0].drivers[0].key] + '.';
  }
  function cmpInsights(ra, rb, a, b, sc) {
    var out = [], ids = ALL_IDS.slice(), n = ids.length;
    var bWorse = ids.filter(function (id) { var s = scenOf(id); return E.run(b, s).change_pct.eps < E.run(a, s).change_pct.eps; }).length;
    [[ra, a], [rb, b]].forEach(function (x) {
      var r = x[0], c = x[1];
      if (r.label === 'Debt cover at risk') out.push({ k: 'warn', p: 0, t: short(c) + ': interest cover falls to ' + xx(r.stressed.interest_cover), d: 'From ' + xx(r.base.interest_cover) + '. Under 1.5× the label reads Debt cover at risk, whatever happens to EPS.' });
      else if (r.stressed.eps < 0) out.push({ k: 'warn', p: 0, t: short(c) + ': earnings turn into a loss', d: 'EPS goes from ' + rs(r.base.eps) + ' to ' + rs(r.stressed.eps) + '.' });
      else if (c.debt > 0 && r.stressed.interest_cover !== null && r.stressed.interest_cover < 3) out.push({ k: 'watch', p: 2, t: short(c) + ': interest cover gets thin', d: xx(r.stressed.interest_cover) + ' after the shock, from ' + xx(r.base.interest_cover) + ', with ' + share(c.exposure.floating_debt) + ' of its debt at floating rates.' });
    });
    var ea = ra.change_pct.eps, eb = rb.change_pct.eps;
    if (ea !== null && eb !== null && Math.abs(ea - eb) >= 3) {
      var lo = ea < eb ? [ra, a] : [rb, b], hi = ea < eb ? [rb, b] : [ra, a];
      var gaps = lo[0].drivers.map(function (d) { var o = hi[0].drivers.filter(function (x) { return x.key === d.key; })[0]; return [d.key, d.eps_pct - o.eps_pct]; }).sort(function (x, y) { return x[1] - y[1]; });
      out.push({ k: 'ins', p: 3, t: 'The gap comes mostly from ' + PHR[gaps[0][0]], d: cap(PHR[gaps[0][0]]) + verb(gaps[0][0], ' takes ', ' take ') + Math.abs(gaps[0][1]).toFixed(1) + ' points more off ' + poss(lo[1]) + ' EPS than off ' + poss(hi[1]) + (gaps[1] && gaps[1][1] < -1 ? ', and ' + PHR[gaps[1][0]] + ' ' + Math.abs(gaps[1][1]).toFixed(1) + ' more.' : '.') });
    }
    var nda = a.debt - a.cash, ndb = b.debt - b.cash;
    if ((nda < 0) !== (ndb < 0)) { var nc = nda < 0 ? a : b, nd = nda < 0 ? b : a; out.push({ k: 'ins', p: 4, t: 'Debt sets them apart when rates move', d: short(nc) + ' has more cash than debt; ' + short(nd) + ' has net debt of ' + cr(Math.abs(nd.debt - nd.cash)) + ', ' + share(nd.exposure.floating_debt) + ' of it at floating rates. Rates 100 bp higher move their EPS ' + pct(E.sensitivities(nc)[3].eps_pct) + ' and ' + pct(E.sensitivities(nd)[3].eps_pct) + '.' }); }
    var pa = a.exposure.pass_through, pb = b.exposure.pass_through;
    if (Math.abs(pa - pb) >= 0.05) out.push({ k: 'ins', p: 4, t: 'Pricing power differs', d: short(a) + ' passes on about ' + share(pa) + ' of cost rises, ' + short(b) + ' about ' + share(pb) + '. The higher the share, the less a cost shock reaches profit.' });
    out.push({ k: bWorse >= n * 0.75 || bWorse <= n * 0.25 ? 'ins' : 'watch', p: 5, t: bWorse >= n * 0.75 ? short(b) + ' takes the bigger hit in ' + bWorse + ' of ' + n + ' scenarios' : bWorse <= n * 0.25 ? short(a) + ' takes the bigger hit in ' + (n - bWorse) + ' of ' + n + ' scenarios' : 'Which one is hit harder depends on the shock', d: 'Across ' + (SC.today_eia ? 'Today, Crude eases and the six presets' : 'Today and the six presets') + ', with today’s settings.' });
    out.sort(function (x, y) { return x.p - y.p; });
    return out.slice(0, 4);
  }
  function colHtml(r, co) {
    var cp = r.change_pct;
    return '<div class="card cmphead"><div class="co">' + logoHtml(co) + '<div><b>' + esc(co.name) + '</b><small>' + co.symbol + ' · ' + esc(co.sector || '') + ' · ' + esc(co.size || '') + '</small></div></div>' +
      '<div class="verdict">' + ring(r.score, r.label) + '<div>' + labPill(r.label, true) + '<p class="why">' + esc(r.label_reason) + '.</p></div></div>' +
      '<div class="kpis">' + kpi('EPS', pct(cp.eps), cp.eps, rs(r.base.eps) + ' → ' + rs(r.stressed.eps), 'Model EPS on the last four quarters, and after the shock.') + kpi('EBITDA margin', pc(r.stressed.ebitda_margin_pct), cp.margin_pts, 'from ' + pc(r.base.ebitda_margin_pct) + ' · ' + pt(cp.margin_pts), 'EBITDA as a share of revenue.') +
      kpi('Interest cover', xx(r.stressed.interest_cover), r.stressed.interest_cover !== null && r.stressed.interest_cover < 1.5 ? -1 : 0, 'from ' + xx(r.base.interest_cover), 'How many times operating profit covers interest. Under 1.5× reads Debt cover at risk.') + (SHOWV ? kpi('Value move', r.value ? pct(r.value.move_pct) : '–', r.value ? r.value.move_pct : 0, r.value_other_persistence ? (S.persistence === 'one_year' ? 'if the hit lasts: ' : 'if it lasts a year: ') + pct(r.value_other_persistence.move_pct) : '', 'An earnings-based value under these assumptions, not a price estimate, and never applied to the share price.', 'rt') : '') + '</div>' +
      '<div class="tw" style="margin-top:4px"><table class="t"><thead><tr><th>Line</th><th class="r">Last four quarters</th><th class="r">After</th><th class="r">Change</th></tr></thead><tbody>' +
      [['Revenue', cr(r.base.revenue), cr(r.stressed.revenue), pct(cp.revenue), cp.revenue], ['EBITDA', cr(r.base.ebitda), cr(r.stressed.ebitda), pct(cp.ebitda), cp.ebitda], ['Interest', cr(r.base.interest), cr(r.stressed.interest), r.base.interest > 0 ? pct((r.stressed.interest / r.base.interest - 1) * 100) : '–', r.base.interest - r.stressed.interest], ['Profit before tax', cr(r.base.pbt), cr(r.stressed.pbt), pct((r.stressed.pbt / r.base.pbt - 1) * 100), r.stressed.pbt - r.base.pbt]].map(function (x) {
        return '<tr><td class="l">' + x[0] + '</td><td class="r">' + x[1] + '</td><td class="r"><b>' + x[2] + '</b></td><td class="r' + (Math.abs(x[4]) < 0.005 ? '' : x[4] < 0 ? ' dn' : ' up') + '">' + x[3] + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  }
  function sizeText(z) { z = String(z || ''); return /cap$/i.test(z) ? z : z + ' cap'; }   // the server already says "Large cap"
  function logoHtml(co) { var u = opts.logoUrl ? opts.logoUrl(co.symbol) : ''; return u ? '<span class="logo" data-i="' + esc(co.symbol.slice(0, 1)) + '"><img src="' + esc(u) + '" alt="" loading="lazy" onerror="var p=this.parentNode;p.classList.add(\'ph\');p.textContent=p.getAttribute(\'data-i\')"></span>' : '<span class="logo ph" aria-hidden="true">' + esc(co.symbol.slice(0, 1)) + '</span>'; }
  function groupedHtml(rows, f) {
    var sc = axisOf(rows.reduce(function (a, r) { return a.concat([r[1], r[2]]); }, [])), lo = sc[0], hi = sc[1];
    var X = function (v) { return (v - lo) / (hi - lo) * 100; };
    var b = function (v, c) { var x0 = X(Math.min(0, v)), x1 = X(Math.max(0, v)); return '<span class="p"><span class="z" style="left:' + X(0) + '%"></span><i class="' + c + '" style="left:' + x0.toFixed(2) + '%;width:' + Math.max(0.4, x1 - x0).toFixed(2) + '%"></i></span>'; };
    return rows.map(function (r) {
      return '<div class="cgroup" tabindex="0" data-tip="' + esc(r[0] + ': ' + short(A) + ' ' + f(r[1]) + ', ' + short(B) + ' ' + f(r[2])) + '"><div class="gn">' + r[0] + '</div>' +
        '<div class="cbar"><span>' + short(A) + '</span>' + b(r[1], 'a') + '<span class="v">' + f(r[1]) + '</span></div><div class="cbar"><span>' + short(B) + '</span>' + b(r[2], 'b') + '<span class="v">' + f(r[2]) + '</span></div></div>';
    }).join('') + '<div class="legend"><span><i style="background:var(--teal)"></i>' + short(A) + '</span><span><i style="background:var(--hc59b3b)"></i>' + short(B) + '</span></div>';
  }
  function renderCompare() {
    var a = coA(), b = coB(), sc = cur(), ra = E.run(a, sc), rb = E.run(b, forB(sc));
    $('cmpsum').innerHTML = '<h2>Side by side under ' + scName(sc) + ib('The same shock for both companies, each measured against its own last four quarters. ' + (SAMEQ ? 'Both report to ' + my(A.base_end) + ', so ‘Today’ is the same shock for both here.' : 'The two companies report to different quarters, so each ‘Today’ is measured against its own last four quarters.') + '', 'lt', 'About the comparison') + '</h2><p class="sentence" style="margin-top:8px">' + compareSummary(ra, rb, a, b) + '</p>';
    var c = cmpInsights(ra, rb, a, b, sc); $('calls').innerHTML = c.map(call).join('');
    $('cols').innerHTML = colHtml(ra, a) + colHtml(rb, b);
    var drows = ra.drivers.map(function (d) { var o = rb.drivers.filter(function (x) { return x.key === d.key; })[0]; return [d.key === 'demand' ? 'Volumes' : d.name, d.eps_pct, o.eps_pct]; });
    drows.push(['Change in EPS', ra.change_pct.eps, rb.change_pct.eps]);
    $('drv').innerHTML = '<h2>What drives it, side by side' + ib('Each driver’s effect in points of EPS, for both companies on one scale. The last pair is the total.', 'lt', 'About this chart') + '</h2><p class="sub">Points of EPS change</p><div style="margin-top:12px">' + groupedHtml(drows, function (v) { return sgn(v) + ' pt'; }) + '</div>';
    var sa = E.sensitivities(a), sb = E.sensitivities(b);
    var srows = sa.map(function (d, i) { return [d.name, d.eps_pct, sb[i].eps_pct]; });
    var ba = E.breakingPoints(a), bb = E.breakingPoints(b);
    var bpv = function (x, k) { return x[k] === null ? 'None found' : k === 'rate_bp' ? '+' + Math.round(x[k]).toLocaleString('en-IN') + ' bp' : pct(x[k], 0); };
    $('sens').innerHTML = '<h2>What moves each most' + ib('One step in each driver on its own, every other shock at zero.', 'lt', 'About this chart') + '</h2><p class="sub">EPS change for one step in each driver, alone</p><div style="margin-top:12px">' + groupedHtml(srows, function (v) { return pct(v); }) + '</div>' +
      '<h3 style="margin-top:18px">Breaking points' + ib('One shock on its own that halves EPS, or takes interest cover below 1.5×.', 'lt', 'About breaking points') + '</h3><div class="tw"><table class="t"><thead><tr><th>Shock, on its own</th><th class="r">' + short(A) + '</th><th class="r">Sample B</th></tr></thead><tbody>' +
      '<tr><td class="l">Crude rise that halves EPS</td><td class="r">' + bpv(ba, 'crude_pct') + '</td><td class="r">' + bpv(bb, 'crude_pct') + '</td></tr><tr><td class="l">Volume fall that halves EPS</td><td class="r">' + bpv(ba, 'demand_pct') + '</td><td class="r">' + bpv(bb, 'demand_pct') + '</td></tr><tr><td class="l">Rate rise that takes cover under 1.5×</td><td class="r">' + bpv(ba, 'rate_bp') + '</td><td class="r">' + bpv(bb, 'rate_bp') + '</td></tr></tbody></table></div>';
    var ids = ALL_IDS.concat(S.scen === 'custom' ? ['custom'] : []);
    var curId = S.scen === 'today' ? (S.todayCrude === 'eia' ? 'today_eia' : 'today') : S.scen;
    $('every').innerHTML = '<h2>Every scenario at a glance' + ib('Both companies under each scenario. Pick a row to open it.', 'lt', 'About this table') + '</h2><div class="tw"><table class="t"><thead><tr><th>Scenario</th><th class="r">' + short(A) + ', EPS</th><th>Label</th><th class="r">' + short(B) + ', EPS</th><th>Label</th><th>More exposed</th></tr></thead><tbody>' + ids.map(function (id) {
      var s = id === 'custom' ? Object.assign({}, S.custom, { persistence: S.persistence }) : scenOf(id), x = E.run(a, s), y = E.run(b, forB(s)), d = x.change_pct.eps - y.change_pct.eps;
      return '<tr class="click' + (id === curId ? ' on' : '') + '" data-pick="' + id + '" tabindex="0"><td class="l">' + (id === 'custom' ? 'Custom' : esc(SC[id].name)) + '</td><td class="r' + (x.change_pct.eps < -0.05 ? ' dn' : '') + '">' + pct(x.change_pct.eps) + '</td><td>' + labPill(x.label) + '</td><td class="r' + (y.change_pct.eps < -0.05 ? ' dn' : '') + '">' + pct(y.change_pct.eps) + '</td><td>' + labPill(y.label) + '</td><td>' + (Math.abs(d) < 3 ? '<small>About equal</small>' : d < 0 ? short(A) : short(B)) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  /* ------------------------------------------------------------------ render + events */
  function renderResults() {
    if (VIEW === 'compare') { renderCompare(); return; }
    var co = coA(), sc = cur(), r = E.run(co, sc);
    renderHead(r, co, sc); renderCalls(r, co, sc); renderAna(r, co, sc); renderTable(r, co); renderDrivers(r, co); renderSens(co); renderEvery(co);
  }
  function renderStrip() {
    var a = A, fact = function (l, v, t) { return '<span class="fact"><span class="l">' + l + (t ? ib(t, 'lt', 'About ' + l) : '') + '</span><span class="v">' + v + '</span></span>'; };
    var baseTip = 'Every shock is applied to the company’s last four reported quarters, ' + D.base_window[0] + ' to ' + D.base_window[1] + '. A shock of zero gives back those quarters exactly.';
    var coA_ = '<div class="co">' + logoHtml(a) + '<div><b>' + esc(a.name) + '</b><small>' + a.symbol + ' · ' + a.sector + ' · ' + sizeText(a.size) + '</small></div></div>';
    if (VIEW === 'compare') {
      $('costrip').innerHTML = coA_ + '<span class="vs">vs</span><div class="co">' + logoHtml(B) + '<div><b>' + esc(B.name) + '</b><small>' + B.symbol + ' · ' + esc(B.sector || '') + ' · ' + esc(B.size || '') + (SAMEQ ? '' : ' · four quarters to ' + my(B.base_end)) + '</small></div></div>' +
        '<div class="facts" style="margin-left:auto">' + fact('Base', 'Four quarters to ' + my(A.base_end), baseTip) + fact('Data to', dt(D.as_of)) + '</div>' +
        '<div class="pickrow" data-find="peer"><label class="find">' + svg('<circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/>', 16) + '<input type="search" placeholder="Compare with another company" aria-label="Compare with another company"></label>' +
        '<span class="note" style="margin:0">' + (opts.peer.picked ? 'Picked for you: the first peer Stress Lab covers that has results to the same quarter (' + my(A.base_end) + ')' : 'You picked ' + esc(B.name)) + ib('So both companies face the same Today shock. If no peer has results to that quarter yet, the first covered peer is used and each company’s window is shown under its name.', 'lt', 'About how the second company is picked') + '</span></div>';
    } else {
      $('costrip').innerHTML = coA_ + '<div class="facts">' + fact('Market cap', cr(a.market_cap_cr)) + fact('Share price', (a.price == null ? '–' : '₹' + a.price.toLocaleString('en-IN')) + ' <small style="font-weight:400;color:var(--muted)">' + dt(a.price_as_of).replace(/ \d{4}$/, '') + '</small>') +
        fact('Base', 'Four quarters, ' + D.base_window[0] + ' to ' + D.base_window[1], baseTip) + fact('Accounts', 'Consolidated') + fact('Data to', dt(D.as_of)) + '</div>';
    }
  }
  function setView(v) {
    if (!GOLD && v === 'compare') v = 'single';
    if (v === 'compare' && !B) { if (opts.requestPeer) opts.requestPeer(); v = 'single'; }
    VIEW = v;
    HOST.classList.toggle('v-compare', v === 'compare');
    root.querySelectorAll('[data-v]').forEach(function (el) { var w = el.getAttribute('data-v'); el.hidden = !(w === 'both' || w === v); });
    root.querySelectorAll('[data-view]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view') === v); });
    renderAll();
  }
  function renderAll() {
    renderStrip(); renderScen(); renderResults();
    if (VIEW !== 'compare') { renderAsm(); renderBT(); renderHist([A]); } else renderHist([A, B]);
  }
  function pick(id) {
    if (id === 'today_eia') { S.scen = 'today'; S.todayCrude = 'eia'; }
    else if (id === 'today') { S.scen = 'today'; S.todayCrude = 'level'; }
    else S.scen = id;
    if (id === 'custom' && !S.custom) { var b = Object.assign({}, SC.today); S.customFrom = 'Today'; S.custom = Object.assign(b, { id: 'custom', name: 'Custom', wpi: b.wpi === null ? b.cpi : b.wpi }); }
    renderAll();
  }
  /* "Find a company" and "Compare with": the site's own search, results under the box; a click opens the company (or sets the second one). */
  function findResults(input) {
    var wrap = input.closest('.find').parentNode, box = wrap.querySelector('.sres'), forPeer = wrap.getAttribute('data-find') === 'peer';
    if (!box) { box = document.createElement('div'); box.className = 'sres'; box.setAttribute('role', 'listbox'); wrap.appendChild(box); }
    var q = input.value.trim(), hits = q && opts.search ? opts.search(q).slice(0, 6) : [];
    box.hidden = !hits.length;
    box.innerHTML = hits.map(function (h) { return '<button type="button" role="option" data-go="' + esc(h[0]) + '"' + (forPeer ? ' data-for="peer"' : '') + '><b>' + esc(h[1]) + '</b><small>' + esc(h[4] || h[0]) + '</small></button>'; }).join('');
  }
  listen(root, 'click', function (ev) {
    var go = ev.target.closest('[data-go]');
    if (go) { var sym = go.getAttribute('data-go'); if (go.getAttribute('data-for') === 'peer') { if (opts.onPeer) opts.onPeer(sym); } else if (opts.onCompany) opts.onCompany(sym); return; }
    var lk = ev.target.closest('[data-locked]');
    if (lk) { var up = $('upnote'); if (up) { up.classList.remove('pulse'); void up.offsetWidth; up.classList.add('pulse'); up.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } return; }
    var t = ev.target.closest('[data-scen],[data-tc],[data-pers],[data-reset],[data-sure],[data-unit],[data-pick],[data-resetedits],#adj,[data-view]');
    if (!t) return;
    if (t.hasAttribute('data-scen')) pick(t.getAttribute('data-scen'));
    else if (t.hasAttribute('data-tc')) { S.todayCrude = t.getAttribute('data-tc'); renderAll(); }
    else if (t.hasAttribute('data-pers')) { S.persistence = t.getAttribute('data-pers'); renderAll(); }
    else if (t.hasAttribute('data-reset')) { S.scen = 'today'; S.todayCrude = 'level'; S.custom = null; S.persistence = 'one_year'; renderAll(); }
    else if (t.hasAttribute('data-sure')) { var k = t.getAttribute('data-sure'), v = +t.getAttribute('data-v'); if (Math.abs(v - A.exposure[k]) < 1e-6) delete S.edits[k]; else S.edits[k] = v; renderAll(); }
    else if (t.hasAttribute('data-unit')) { S.unit = t.getAttribute('data-unit'); renderResults(); }
    else if (t.hasAttribute('data-pick')) pick(t.getAttribute('data-pick'));
    else if (t.hasAttribute('data-resetedits')) { S.edits = {}; renderAll(); }
    else if (t.hasAttribute('data-view')) { setView(t.getAttribute('data-view')); try { history.replaceState(null, '', t.getAttribute('data-view') === 'compare' ? '#compare' : '#one'); } catch (e) {} }
    else if (t.id === 'adj') { S.open = !(S.open || S.scen === 'custom'); if (!S.open && S.scen === 'custom') { S.scen = 'today'; } renderScen(); if (!S.open) renderResults(); }
  });
  listen(root, 'keydown', function (ev) { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.hasAttribute && ev.target.hasAttribute('data-pick')) { ev.preventDefault(); pick(ev.target.getAttribute('data-pick')); } });
  listen(root, 'input', function (ev) {
    var t = ev.target;
    if (t.matches('.find input')) { findResults(t); return; }
    if (t.matches('input[type=range][data-k]')) onSlide(t.getAttribute('data-k'), t.value);
  });
  listen(root, 'change', function (ev) {
    var t = ev.target;
    if (t.matches('input[data-edit]')) {
      var k = t.getAttribute('data-edit'), ed = EDITABLE[k], v = parseFloat(t.value);
      if (isNaN(v)) { delete S.edits[k]; } else {
        v = Math.max(ed[0], Math.min(ed[1], v)); v = k === 'demand_beta' ? v : v / 100;
        var trial = Object.assign({}, A.exposure, S.edits); trial[k] = v;
        if (trial.crude_rm + trial.import_rm + trial.metal_rm + trial.agri_rm > 1 || trial.export_rev + trial.crude_rev > 1) { t.value = k === 'demand_beta' ? A.exposure[k] : Math.round((S.edits[k] !== undefined ? S.edits[k] : A.exposure[k]) * 100); t.setCustomValidity('The material shares cannot add up to more than 100%'); t.reportValidity(); return; }
        t.setCustomValidity('');
        if (Math.abs(v - A.exposure[k]) < 1e-9) delete S.edits[k]; else S.edits[k] = v;
      }
      renderAll();
    }
  });
  // an i button's text opens on hover, focus or tap: keep it inside the screen (on a phone it would run off the right edge)
  function fitInfo(ev) {
    var ib = ev.target.closest && ev.target.closest('.ib'); if (!ib) return;
    var t = ib.querySelector('.tip'); if (!t) return;
    t.style.translate = '';
    var r = t.getBoundingClientRect(), vw = document.documentElement.clientWidth, dx = 0;
    if (r.right > vw - 8) dx = vw - 8 - r.right;
    if (r.left + dx < 8) dx = 8 - r.left;
    if (dx) t.style.translate = Math.round(dx) + 'px 0';
  }
  listen(root, 'focusin', fitInfo); listen(root, 'mouseover', fitInfo);
  // hover tooltip for bars and rows with data-tip
  var tip = document.createElement('div'); tip.className = 'hovtip'; tip.setAttribute('role', 'status'); HOST.appendChild(tip); OFF.push(function () { tip.remove(); });
  function showTip(el, x, y) { tip.innerHTML = esc(el.getAttribute('data-tip')); tip.style.display = 'block'; var w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = Math.min(window.innerWidth - w - 8, Math.max(8, x + 12)) + 'px'; tip.style.top = Math.max(8, y - h - 12) + 'px'; }
  listen(root, 'mousemove', function (ev) { var el = ev.target.closest && ev.target.closest('[data-tip]'); if (el) showTip(el, ev.clientX, ev.clientY); else tip.style.display = 'none'; });
  listen(root, 'focusin', function (ev) { var el = ev.target.closest && ev.target.closest('[data-tip]'); if (el) { var b = el.getBoundingClientRect(); showTip(el, b.left + b.width / 2, b.top); } else tip.style.display = 'none'; });
  listen(window, 'scroll', function () { tip.style.display = 'none'; }, { passive: true });

  if (!SHOWV) root.querySelectorAll('.vmove').forEach(function (el) { el.remove(); });
  setView(VIEW);
  return { destroy: function () { OFF.forEach(function (f) { f(); }); OFF.length = 0; }, state: S, render: renderAll, pick: pick, setView: setView };
}
