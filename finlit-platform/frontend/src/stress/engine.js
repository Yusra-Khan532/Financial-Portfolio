// @ts-nocheck
/* Stress Lab engine, JavaScript port of finlit_technicals/stress.py (_engine, run, sensitivities, breaking_points).
 * Python stays the reference: test_engine.js checks every scenario against golden.json (exported by the Python
 * engine) and fails if any number differs by more than 0.01%. Pure functions, no dependencies.
 *
 *   const r = StressEngine.run(company, scenario)   // company = /api/stress/SYM "company"; scenario = one of "scenarios"
 *
 * Shocks are in the units people talk in: crude 45 = Brent 45% higher than in the base window; usdinr 8.7 = 8.7% more
 * rupees per dollar (rupee weaker); cpi / wpi / agri = extra percentage points; rate_bp / erp_bp = basis points;
 * demand = % change in volumes for the average company. wpi, agri and metals default as in Python (null = follow).
 */
const G = {};
(function (root) {
  'use strict';
  var RF = 7.0, ERP = 6.0, LONG_RATE_SHARE = 0.5, COVER_FLOOR = 1.5;
  var RANGES = { crude: [-90, 300], usdinr: [-30, 50], cpi: [-5, 15], wpi: [-10, 25], agri: [-10, 25], metals: [-50, 100],
                 rate_bp: [-500, 1000], demand: [-60, 30], erp_bp: [-300, 600] };
  var DRIVER_NAMES = { demand: 'Demand / volumes', crude: 'Crude oil', rupee: 'Rupee', inflation: 'Wages and general inflation',
                       commodities: 'Metals and farm prices', interest: 'Interest rates' };

  function clip(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
  function num(v, d) { return v === null || v === undefined || v === '' || isNaN(v) ? d : +v; }

  function scenario(s) {
    var o = {};
    for (var k in s) o[k] = s[k];
    ['crude', 'usdinr', 'cpi', 'rate_bp', 'demand', 'erp_bp'].forEach(function (k) { o[k] = num(o[k], 0); });
    ['wpi', 'agri', 'metals'].forEach(function (k) { o[k] = num(o[k], null); });
    o.persistence = o.persistence || 'one_year';
    return o;
  }
  /** Clip custom values to the plausible ranges (spec 7.3); the API does the same. */
  function clipScenario(s) {
    var o = scenario(s);
    for (var k in RANGES) if (o[k] !== null) o[k] = clip(o[k], RANGES[k][0], RANGES[k][1]);
    return o;
  }

  function domesticRm(e) { return Math.max(0, 1 - e.crude_rm - e.import_rm - e.metal_rm - e.agri_rm); }
  function domesticRev(e) { return Math.max(0, 1 - e.export_rev - e.crude_rev); }
  function ebitda(co) { return co.revenue - co.rm - co.emp - co.opex; }
  function pbt(co) { return ebitda(co) + co.other_income - co.dep - co.interest; }
  function eps(co) { return co.shares ? pbt(co) * (1 - co.tax_rate) / co.shares : NaN; }

  function engine(co, s0) {
    var sc = scenario(s0), e = co.exposure;
    var c = sc.crude / 100, f = sc.usdinr / 100, cpi = sc.cpi / 100;
    var wpi = (sc.wpi === null ? sc.cpi : sc.wpi) / 100;
    var agri = sc.agri === null ? wpi : sc.agri / 100;
    var met = sc.metals === null ? wpi : sc.metals / 100;
    var q = e.demand_beta * sc.demand / 100;
    var cInr = (1 + c) * (1 + f) - 1, crPart = c * (1 + f), fxPart = f;
    var R = co.revenue, RM = co.rm, EMP = co.emp, OPX = co.opex, v = e.var_opex;
    var opexVol = OPX * ((1 - v) + v * (1 + q));
    var dC = {
      crude: RM * (1 + q) * e.crude_rm * e.crude_beta * crPart + opexVol * e.energy_opex * e.energy_beta * crPart,
      rupee: RM * (1 + q) * (e.crude_rm * e.crude_beta + e.import_rm) * fxPart + opexVol * e.energy_opex * e.energy_beta * fxPart,
      commodities: RM * (1 + q) * (e.metal_rm * met + e.agri_rm * agri),
      inflation: RM * (1 + q) * domesticRm(e) * wpi + opexVol * (1 - e.energy_opex) * cpi + EMP * cpi
    };
    var dCt = dC.crude + dC.rupee + dC.commodities + dC.inflation;
    var passShare = e.pass_through * domesticRev(e);
    var priceGain = passShare * dCt;
    var revFx = R * (1 + q) * (e.export_rev * f + e.crude_rev * e.crude_rev_beta * fxPart);
    var revCrude = R * (1 + q) * e.crude_rev * e.crude_rev_beta * crPart;
    var R1 = R * (1 + q) + revFx + revCrude + priceGain;
    var RM1 = RM * (1 + q) + RM * (1 + q) * (e.crude_rm * e.crude_beta * cInr + e.import_rm * f + e.metal_rm * met + e.agri_rm * agri + domesticRm(e) * wpi);
    var OPX1 = opexVol * (1 + e.energy_opex * e.energy_beta * cInr + (1 - e.energy_opex) * cpi);
    var EMP1 = EMP * (1 + cpi);
    var E1 = R1 - RM1 - OPX1 - EMP1;
    var dr = sc.rate_bp / 10000;
    var I1 = Math.max(0, co.interest + co.debt * e.floating_debt * dr);
    var OI1 = co.other_income + co.cash * dr * 0.5;          // half of liquid funds reprice within the year
    var PBT1 = E1 + OI1 - co.dep - I1;
    var eps0 = eps(co), eps1 = PBT1 * (1 - co.tax_rate) / co.shares;
    var volume = q * (R - RM - v * OPX);                    // contribution margin on the extra / lost volume
    return {
      R1: R1, RM1: RM1, OPX1: OPX1, EMP1: EMP1, E1: E1, I1: I1, OI1: OI1, PBT1: PBT1, eps0: eps0, eps1: eps1, q: q, c_inr: cInr,
      dC: dC, dC_total: dCt, price_gain: priceGain, pass_share: passShare,
      drivers_rs: {
        demand: volume,
        crude: revCrude - dC.crude * (1 - passShare),
        rupee: revFx - dC.rupee * (1 - passShare),
        inflation: -dC.inflation * (1 - passShare),
        commodities: -dC.commodities * (1 - passShare),
        interest: -(I1 - co.interest) + (OI1 - co.other_income)
      }
    };
  }

  function cover(eb, oi, dep, interest) { return interest <= 0.005 * Math.max(1, Math.abs(eb)) ? null : (eb + oi - dep) / interest; }

  function valueMove(co, sc, eps0, eps1) {
    if (!(eps0 > 0)) return null;
    var k = (RF + co.beta * ERP) / 100, g = Math.min(co.growth / 100, k - 0.03);
    var k1 = k + LONG_RATE_SHARE * sc.rate_bp / 10000 + co.beta * sc.erp_bp / 10000, g1 = Math.min(g, k1 - 0.03);
    var base = eps0 / (k - g), nw;
    if (sc.persistence === 'permanent') nw = eps1 > 0 ? eps1 / (k1 - g1) : 0;
    else nw = eps1 / (1 + k1) + eps0 * (1 + g1) / ((k1 - g1) * (1 + k1));
    return { move_pct: (nw / base - 1) * 100, k_pct: k * 100, k_new_pct: k1 * 100, g_pct: g * 100 };
  }

  var LABELS = {
    'Debt cover at risk': 'Operating profit would cover interest less than 1.5 times',
    'Not comparable': 'Loss in the base period, so a percentage change in EPS is not meaningful',
    'Hit hard': 'Earnings per share fall by 30% or more',
    'Takes a clear hit': 'Earnings per share fall by 10% to 30%',
    'Gains under this shock': 'Earnings per share rise by 10% or more',
    'Holds up well': 'Earnings per share move by less than 10%'
  };
  function label(epsChg, cov1, hasDebt) {
    var l;
    if (hasDebt && cov1 !== null && cov1 < COVER_FLOOR) l = 'Debt cover at risk';
    else if (epsChg === null) l = 'Not comparable';
    else if (epsChg <= -30) l = 'Hit hard';
    else if (epsChg <= -10) l = 'Takes a clear hit';
    else if (epsChg >= 10) l = 'Gains under this shock';
    else l = 'Holds up well';
    return [l, LABELS[l]];
  }

  function run(co, s0) {
    var sc = scenario(s0), x = engine(co, sc);
    var e0 = ebitda(co), e1 = x.E1, eps0 = x.eps0, eps1 = x.eps1;
    var epsChg = eps0 > 0 ? (eps1 / eps0 - 1) * 100 : null;
    var cov0 = cover(e0, co.other_income, co.dep, co.interest), cov1 = cover(e1, x.OI1, co.dep, x.I1);
    var hasDebt = co.debt > 0 && co.interest > 0;
    var lb = label(epsChg, cov1, hasDebt), score = null;
    if (epsChg !== null) score = clip(100 + 1.25 * epsChg, 0, 100);
    else if (e0 > 0) score = clip(100 + 1.25 * (e1 / e0 - 1) * 100, 0, 100);
    if (score !== null && hasDebt && cov1 !== null && cov1 < COVER_FLOOR) score = Math.min(score, 30);
    var perShare = (1 - co.tax_rate) / co.shares;
    var drivers = Object.keys(x.drivers_rs).map(function (k) {
      var v = x.drivers_rs[k];
      return { key: k, name: DRIVER_NAMES[k], rs_cr: v, eps_pct: eps0 > 0 ? v * perShare / eps0 * 100 : null };
    }).sort(function (a, b) { return a.rs_cr - b.rs_cr; });
    var val = valueMove(co, sc, eps0, eps1);
    var valPerm = valueMove(co, Object.assign({}, sc, { persistence: sc.persistence === 'permanent' ? 'one_year' : 'permanent' }), eps0, eps1);
    return {
      scenario: sc,
      base: { revenue: co.revenue, ebitda: e0, ebitda_margin_pct: e0 / co.revenue * 100, other_income: co.other_income, depreciation: co.dep,
              interest: co.interest, pbt: pbt(co), eps: eps0, interest_cover: cov0 },
      stressed: { revenue: x.R1, ebitda: e1, ebitda_margin_pct: e1 / x.R1 * 100, other_income: x.OI1, depreciation: co.dep, interest: x.I1,
                  pbt: x.PBT1, eps: eps1, interest_cover: cov1 },
      change_pct: { revenue: (x.R1 / co.revenue - 1) * 100, ebitda: e0 > 0 ? (e1 / e0 - 1) * 100 : null, eps: epsChg,
                    margin_pts: (e1 / x.R1 - e0 / co.revenue) * 100 },
      value: val, value_other_persistence: valPerm,
      score: score === null ? null : Math.round(score), label: lb[0], label_reason: lb[1], drivers: drivers,
      working: { volume_change_pct: x.q * 100, crude_in_rupees_pct: x.c_inr * 100, cost_increase_rs_cr: x.dC,
                 cost_increase_total_rs_cr: x.dC_total, recovered_through_prices_rs_cr: x.price_gain, share_recovered: x.pass_share },
      raw: x
    };
  }

  function solve(f, lo, hi, target) {
    var flo = f(lo) - target, fhi = f(hi) - target;
    if (flo * fhi > 0) return null;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2, fm = f(mid) - target;
      if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** The single shock, others at zero, that halves EPS (crude rise, demand fall) or takes interest cover below 1.5x (rate rise). */
  function breakingPoints(co) {
    if (!(eps(co) > 0)) return { crude_pct: null, demand_pct: null, rate_bp: null, note: 'Loss in the base period' };
    var e1 = function (s) { return engine(co, s).eps1; }, half = eps(co) / 2;
    var crude = solve(function (x) { return e1({ crude: x }); }, 0, 500, half);
    if (crude === null && e1({ crude: -60 }) <= half) crude = solve(function (x) { return e1({ crude: x }); }, -95, 0, half);
    var demand = solve(function (x) { return e1({ demand: x }); }, -95, 0, half);
    var coverAt = function (bp) { var x = engine(co, { rate_bp: bp }); var c = cover(x.E1, x.OI1, co.dep, x.I1); return c === null ? 1e9 : c; };
    var rate = co.debt * co.exposure.floating_debt > 0 ? solve(coverAt, 0, 3000, COVER_FLOOR) : null;
    return { crude_pct: crude, demand_pct: demand, rate_bp: rate };
  }

  /** EPS change (%) for one standard step in each driver, alone. */
  function sensitivities(co) {
    var steps = [['crude', 'Crude oil 10% higher', { crude: 10 }], ['rupee', 'Rupee 5% weaker', { usdinr: 5.26 }],
                 ['inflation', 'Inflation 1 point higher', { cpi: 1 }], ['rates', 'Rates 100 bp higher', { rate_bp: 100 }],
                 ['demand', 'Volumes 5% lower', { demand: -5 }]];
    return steps.map(function (s) {
      var x = engine(co, s[2]);
      return { key: s[0], name: s[1], eps_pct: x.eps0 > 0 ? (x.eps1 / x.eps0 - 1) * 100 : null };
    });
  }

  /** Rupee value (the prototype's slider: -8 = 8% weaker) <-> USD/INR change (+8.7 = 8.7% more rupees a dollar). */
  function usdinrFromRupee(rv) { return (1 / (1 + rv / 100) - 1) * 100; }
  function rupeeFromUsdinr(u) { return (1 / (1 + u / 100) - 1) * 100; }

  function withExposure(co, patch) {
    var o = Object.assign({}, co); o.exposure = Object.assign({}, co.exposure, patch); return o;
  }

  root.StressEngine = { run: run, engine: engine, breakingPoints: breakingPoints, sensitivities: sensitivities, scenario: scenario,
                        clipScenario: clipScenario, RANGES: RANGES, LABELS: LABELS, usdinrFromRupee: usdinrFromRupee,
                        rupeeFromUsdinr: rupeeFromUsdinr, withExposure: withExposure, eps: eps, ebitda: ebitda, COVER_FLOOR: COVER_FLOOR };
  })(G);

export default G.StressEngine;
