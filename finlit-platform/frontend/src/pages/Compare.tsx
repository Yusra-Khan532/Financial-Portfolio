import { PageHeader } from "../components/PageHeader";
import { titleOf, subOf, codeNote, isBseCode } from "../lib/companyLabel";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Icon } from "../lib/icons";
import { Plain } from "../components/Plain";
import { Gate } from "../components/Gate";
import { useUI } from "../lib/ui";
import { useDocTitle } from "../lib/title";
import { nf } from "../lib/format";
import { Radar } from "../charts/Radar";
import { CompareBar } from "../components/CompareBar";
import { BAND_LABEL, METRICS, distOf, fmt, percentile, useUniverse, type Dist, type NumKey, type Row } from "../lib/screener";
import { ChartHelp } from "../components/ChartHelp";
import { CompareCustom } from "../components/CompareCustom";
import { decodeKeys, encodeKeys } from "../lib/compareSets";
import { DiversificationCard } from "../components/diversification/DiversificationCard";
import { LABEL_WORD, PRISM_PARTS, hasPrism, toneOf, type PrismLabel } from "../lib/scorePrism";
import { CoLogo } from "../components/CoLogo";
import { useHoverTip } from "../components/HoverTip";

type TabDef = { id: string; label: string; model?: boolean; blurb: string; groups: { title: string; keys: NumKey[] }[] };
const TABS: TabDef[] = [
  { id: "overview", label: "Overview", blurb: "Who they are and how the FinLit model scores them.", groups: [] },
  { id: "fundamentals", label: "Financials", blurb: "Size, profit margin, returns on money and debt.", groups: [{ title: "Size and market", keys: ["market_cap", "price"] }, { title: "Profitability", keys: ["roe", "roce", "operating_margin"] }, { title: "Solvency and financial strength", keys: ["debt_to_equity"] }, { title: "Income for shareholders", keys: ["dividend_yield"] }] },
  { id: "spider", label: "Spider", blurb: "Eight measures on one chart. Further from the centre is better.", groups: [] },
  { id: "valuation", label: "Valuation", blurb: "How much the market is paying for each company.", groups: [{ title: "Price against earnings and assets", keys: ["pe", "pb"] }, { title: "Cash return on the price", keys: ["dividend_yield"] }] },
  { id: "quality", label: "Quality & Risk", model: true, blurb: "How well the business earns, and how much debt it carries.", groups: [{ title: "Returns on money", keys: ["roe", "roce"] }, { title: "Safety", keys: ["debt_to_equity", "pillar_balance"] }, { title: "FinLit quality", keys: ["pillar_quality"] }] },
  { id: "growth", label: "Growth", model: true, blurb: "How fast sales and profit have grown.", groups: [{ title: "Business growth", keys: ["sales_cagr", "profit_cagr", "pillar_growth"] }, { title: "The market's verdict", keys: ["return_1y"] }] },
  { id: "technical", label: "Technical", model: true, blurb: "How the share price has been behaving.", groups: [{ title: "Price moves", keys: ["change_pct", "return_1m", "return_1y"] }, { title: "FinLit technical", keys: ["pillar_technical"] }] },
  { id: "stress", label: "Stress test", blurb: "How a shock to crude, the rupee, rates or demand would move both companies' earnings, side by side (Gold).", groups: [] },
  { id: "custom", label: "Build your own", blurb: "Pick from every measure the screener offers, save your sets and share the link.", groups: [] },
];
const SPIDER: { label: string; key: NumKey }[] = [{ label: "ROE", key: "roe" }, { label: "ROCE", key: "roce" }, { label: "Margin", key: "operating_margin" }, { label: "Sales growth", key: "sales_cagr" }, { label: "Profit growth", key: "profit_cagr" }, { label: "Low debt", key: "debt_to_equity" }, { label: "Low P/E", key: "pe" }, { label: "Dividend", key: "dividend_yield" }];
const PILLARS: NumKey[] = ["pillar_quality", "pillar_growth", "pillar_profitability", "pillar_balance", "pillar_technical"];
const LETTER = ["A", "B", "C", "D"];
const KEY_WHY = { good: "Green: the company beats 67% or more of companies on this measure, so it is among the stronger third. Better means lower for debt and P/E, higher for everything else.",
  mid: "Amber: the company beats 34 to 66% of companies on this measure, around the middle.", poor: "Red: the company beats 33% or fewer of companies on this measure, so it is among the weaker third." };
const NO_FIGURE = "No figure (grey): this company has not reported this measure, so it is left out of the chart and not counted as zero.";

function Ring({ v, band }: { v: number | null; band: string | null }) {
  const C = 2 * Math.PI * 34;
  return <div className={"cr " + (band || "")}><svg viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="34" fill="none" stroke="var(--s3)" strokeWidth="8" /><circle className="ring-in" cx="42" cy="42" r="34" fill="none" stroke="var(--gold)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(C * (v ?? 0)) / 100} ${C}`} transform="rotate(-90 42 42)" /></svg><b>{v ?? "—"}</b></div>;
}

export function Compare() {
  useDocTitle("Compare companies", "Put companies side by side on size, valuation, quality, growth and price behaviour. Choose exactly which measures to compare.");
  const { has, upgrade, toast } = useUI();
  const tip = useHoverTip();
  const nav = useNavigate();
  const { data, isLoading, isError } = useUniverse();
  const [sp, setSp] = useSearchParams();
  const [tab, setTab] = useState(() => (sp.has("m") ? "custom" : "overview"));
  const [off, setOff] = useState<Record<string, NumKey[]>>({});
  // One score per plan (founder, 13 Nov 2026, task #100): the Overview shows FinLit Prism for Gold and the FinLit IQ for Silver, never both.
  const gold = has("gold");
  const showIq = !gold, showPrism = gold;
  const rows = data?.rows || [];
  const max = has("gold") ? 4 : 2;
  const bySym = useMemo(() => new Map(rows.map((r) => [r.symbol, r])), [rows]);
  const ids = useMemo(() => (sp.get("c") || "").split(",").filter((s) => bySym.has(s)).slice(0, max), [sp, bySym, max]);

  // sensible default: Reliance against the best-scoring company in its sector
  useEffect(() => {
    if (!rows.length || sp.has("c")) return;   // only when the page is opened with nothing chosen; a member who clears or removes keeps their choice
    const a = bySym.get(ids[0] || "RELIANCE") || rows[0];
    const b = [...rows].filter((r) => r.symbol !== a.symbol && r.sector === a.sector).sort((x, y) => ((gold ? y.prism_final : y.overall) ?? 0) - ((gold ? x.prism_final : x.overall) ?? 0))[0] || rows.find((r) => r.symbol !== a.symbol);
    if (b) setSp((p) => { const n = new URLSearchParams(p); n.set("c", [a.symbol, b.symbol].join(",")); return n; }, { replace: true });
  }, [rows, sp, bySym, setSp]);

  const picked = ids.map((s) => bySym.get(s)!).filter(Boolean);
  const setIds = (n: string[]) => setSp((p) => { const q = new URLSearchParams(p); q.set("c", n.join(",")); return q; }, { replace: true });
  const customKeys = useMemo(() => (sp.has("m") ? decodeKeys(sp.get("m")) : null), [sp]);   // no link parameter = the default set; an empty one = the member cleared it
  const setCustomKeys = (k: string[]) => setSp((p) => { const q = new URLSearchParams(p); if (k.length) q.set("m", encodeKeys(k)); else q.set("m", ""); return q; }, { replace: true });
  const T = TABS.find((t) => t.id === tab)!;
  /** "Stress test" is the Gold compare view of Stress Lab for the two companies picked here: Gold go straight there, everyone else is told what Gold adds. The other tabs stay on this page. */
  const pickTab = (id: string) => {
    if (id !== "stress") { setTab(id); return; }
    if (picked.length < 2) { setTab("stress"); return; }                                  // the panel below says to pick two companies first
    if (!gold) { setTab("stress"); upgrade("gold", "Comparing two companies under a stress is part of the Gold plan."); return; }
    nav(`/research/stress-lab/${encodeURIComponent(picked[0].symbol)}?with=${encodeURIComponent(picked[1].symbol)}#compare`);
  };
  const locked = T.model && !has("silver");
  const dists = useMemo(() => { const m = new Map<NumKey, Dist | null>(); (Object.keys(METRICS) as NumKey[]).forEach((k) => m.set(k, distOf(rows, k))); return m; }, [rows]);
  const off0 = off[tab] || [];
  const iqOnly = (k: NumKey) => gold && (k === "overall" || String(k).startsWith("pillar_"));   // task #100: no FinLit IQ figure for Gold
  const groups = T.groups.map((g) => ({ ...g, keys: g.keys.filter((k) => !off0.includes(k) && !iqOnly(k)) })).filter((g) => g.keys.length);
  const keys: NumKey[] = groups.flatMap((g) => g.keys);
  const pool: NumKey[] = T.groups.flatMap((g) => g.keys).filter((k) => !iqOnly(k));
  const toggleKey = (k: NumKey) => setOff((o) => ({ ...o, [tab]: (o[tab] || []).includes(k) ? (o[tab] || []).filter((x) => x !== k) : [...(o[tab] || []), k] }));
  const win = (k: NumKey): string | null => {
    const m = METRICS[k]; if (m.better === "none") return null;
    const v = picked.map((r) => r[k]); if (v.filter((x) => x != null).length < 2) return null;
    const best = m.better === "higher" ? Math.max(...(v.filter((x) => x != null) as number[])) : Math.min(...(v.filter((x) => x != null) as number[]));
    const w = picked.filter((r) => r[k] === best); return w.length === 1 ? w[0].symbol : null;
  };
  const tally = picked.map((r) => keys.filter((k) => win(k) === r.symbol).length);
  const scored = keys.filter((k) => METRICS[k].better !== "none" && win(k)).length;
  const pc = (r: Row, k: NumKey) => percentile(dists.get(k) || null, k, r[k]);
  const dotWhy = (p: number): string => (p >= 67 ? `Green: better than ${p}% of companies, so among the stronger third.` : p <= 33 ? `Red: better than only ${p}% of companies, so among the weaker third.` : `Amber: better than ${p}% of companies, around the middle.`);
  const dot = (p: number | null) => (p == null ? "" : p >= 67 ? "good" : p <= 33 ? "poor" : "mid");

  // task #81: the company-name row of every tab sticks right under the site bar (its height changes with the screen width), so no row of the table
  // shows in a gap above it
  // task #116: the Peer Comparison header sticks under the site bar too, and the names row sticks under it (--cmp-peer, its measured height; 0 without it)
  const wrapRef = useRef<HTMLDivElement>(null), peerRef = useRef<HTMLDivElement>(null);
  const showPeer = picked.length >= 2;
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".top"), w = wrapRef.current, peer = peerRef.current;
    if (!w) return;
    const set = () => {
      w.style.setProperty("--cmp-top", `${bar ? Math.round(bar.getBoundingClientRect().height) : 0}px`);
      w.style.setProperty("--cmp-peer", `${peer ? Math.round(peer.getBoundingClientRect().height) : 0}px`);
    };
    set();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(set); if (bar) ro.observe(bar); if (peer) ro.observe(peer); return () => ro.disconnect();
  }, [isError, showPeer]);

  if (isError) return <div className="wrap state"><h2>Comparison is unavailable right now</h2><p>Please try again in a moment.</p></div>;
  return (
    <>
      <PageHeader wrap plan="free" title="Compare companies" art="compare" links={["/research", "/prism", "/screener"]}
        description={<>Compare <b>size, valuation, quality, growth</b> and price behaviour across listed Indian companies, and choose exactly what to compare.</>}
        stats={[{ icon: "compare", value: max > 0 ? max : null, label: "Companies at once" }]} />
      <div className="wrap cmpw" ref={wrapRef}>
        {data?.sample && <div className="sample-note" role="note"><Icon name="info" /><span><b>Sample data.</b> Reliance is a real report; the other companies in this demo are fictional (symbols start with SMP-). The live site compares any listed companies.</span></div>}
        <div className="card cmp-setup">
          <div className="card-h"><h3><span className="ci"><Icon name="layers" /></span>Choose companies</h3>
            {picked.length >= 2 && <div className="cmp-acts"><button className="btn" onClick={() => { navigator.clipboard?.writeText(location.href).then(() => toast("Link to this comparison copied."), () => toast(location.href)); }}><Icon name="spark" />Copy link</button></div>}</div>
          {isLoading ? <div className="skeleton" style={{ height: 90 }} /> : (
            <>
              <CompareBar rows={rows} ids={ids} max={max} onChange={setIds} onLimit={() => { if (!has("gold")) upgrade("gold", "Comparing up to four companies comes with the Gold plan."); else toast("You are comparing the most companies this page can show."); }} />
              {!has("gold") && <p className="cb-gold"><Icon name="lock" /> Compare up to 4 companies at once with <button className="alx-link" onClick={() => upgrade("gold", "Comparing up to four companies comes with the Gold plan.")}>Gold</button>.</p>}
            </>)}
        </div>

        {showPeer && (
          <div className="cmp-peer" ref={peerRef} role="region" aria-label="Companies being compared">
            <div className="cmp-peer-t">
              <span className="cmp-peer-ic" aria-hidden="true"><Icon name="bars" /></span>
              <div><b>Peer Comparison</b><small>Compare key financial &amp; valuation metrics across companies</small></div>
            </div>
            <ul className="cmp-peer-cos">{picked.map((r, i) => (
              <li key={r.symbol} className={"cmp-chip c" + i}>
                <i className={"mk k" + i} aria-hidden="true" /><span title={r.name || r.symbol}>{r.name || r.symbol}</span>
                <button type="button" aria-label={`Remove ${r.name || r.symbol} from the comparison`} title="Remove" onClick={() => setIds(ids.filter((x) => x !== r.symbol))}>×</button>
              </li>))}
            </ul>
          </div>
        )}
        <div className="cmp-tabs" role="tablist" aria-label="Comparison areas">{TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? "on" : ""} onClick={() => pickTab(t.id)}>{t.label}{(t.model && !has("silver") || t.id === "stress" && !gold) && <Icon name="lock" />}</button>)}</div>
        <p className="cmp-blurb">{T.blurb}</p>

        {picked.length >= 2 && !locked && tab !== "overview" && tab !== "custom" && scored > 0 && (
          <Plain tone="info">{picked.map((r, i) => `${r.name} leads on ${tally[i]}`).join(" · ")} of {scored} measures. “Leads” means the better value: lower for P/E and debt, higher for returns and growth.</Plain>
        )}

        {picked.length < 2 && !isLoading && <div className="pm-empty" style={{ margin: "18px 0" }}><b>Pick at least two companies to compare.</b><p>Use the search box above: open it to browse every company, or try a popular comparison.</p></div>}
        {picked.length >= 2 && tab === "overview" && (
          <>
            <div className={"cmp-cards n" + picked.length}>{picked.map((r, i) => (
              <div className="cc" key={r.symbol}>
                <div className="cc-h"><CoLogo symbol={r.symbol} name={r.name} size={44} /><div><span className="tk">Company {LETTER[i]}{isBseCode(r.symbol) ? "" : ` · ${r.symbol}`}</span><b>{r.name || r.symbol}</b><small>{r.sector}</small></div></div>
                <div className="cc-p"><b>{fmt(METRICS.price, r.price)}</b><span className={(r.change_pct ?? 0) >= 0 ? "pos" : "neg"}>{fmt(METRICS.change_pct, r.change_pct)}</span></div>
                <div className="cc-g"><div><span>Market cap</span><b>{fmt(METRICS.market_cap, r.market_cap)}</b></div><div><span>P/E</span><b>{fmt(METRICS.pe, r.pe)}</b></div><div><span>ROE</span><b>{fmt(METRICS.roe, r.roe)}</b></div><div><span>Debt/Equity</span><b>{fmt(METRICS.debt_to_equity, r.debt_to_equity)}</b></div></div>
                {showIq && <Gate tier="silver" title="See the FinLit IQ" points={["Overall research score", "Five-pillar scorecard"]}>
                  <div className="cc-s"><Ring v={r.overall} band={r.band} /><div><span className="label">FinLit IQ</span><b>{r.overall ?? "—"}<small>/100</small></b>{r.band && <span className={"vd " + r.band}>{BAND_LABEL[r.band]}</span>}</div></div>
                </Gate>}
                {showPrism && (hasPrism(r)
                  ? <div className="cc-s cc-prism"><Ring v={Math.round(r.prism_final as number)} band={toneOf(r.prism_final)} /><div><span className="label">FinLit Prism</span><b>{Math.round(r.prism_final as number)}<small>/100</small></b>{r.prism_label && <span className={"vd " + toneOf(r.prism_final)}>{LABEL_WORD[r.prism_label as PrismLabel] ?? r.prism_label}</span>}{r.prism_status && r.prism_status !== "RATED" && <small className="faint"> {r.prism_status.toLowerCase()}</small>}</div></div>
                  : <div className="cc-s cc-prism"><div><span className="label">FinLit Prism</span><b>{"—"}</b><small className="faint">{r.prism_state === "none" ? "Not rated yet" : "No stored Prism rating"} · <Link to={`/prism/${encodeURIComponent(r.symbol)}`}>Open Prism</Link></small></div></div>)}
              </div>))}</div>
            {showPrism && (
              <div className="card cmp-pil"><div className="card-h"><h3><span className="ci"><Icon name="layers" /></span>The FinLit Prism parts</h3><span className="s">0–100, higher is better (a higher Risk score means lower risk)</span></div>
                <div className="pil-grid">
                  <Radar axes={PRISM_PARTS.map((x) => x.label)} series={picked.map((r, i) => ({ key: r.symbol, label: r.name || r.symbol, cls: "k" + i, values: PRISM_PARTS.map((x) => r[x.col] ?? null), tips: PRISM_PARTS.map((x) => r[x.col] == null ? null : `${r.name || r.symbol}\n${x.label}: ${r[x.col]} / 100`) }))} />
                  <div>{PRISM_PARTS.map((x) => { const v = picked.map((r) => r[x.col]), top = Math.max(...v.map((n) => n ?? -1)); return (
                    <div className="pil-r" key={x.col}><span className="pil-l">{x.label}</span>
                      <div className="pil-bars">{picked.map((r, i) => <div key={r.symbol} className={"pb k" + i + (picked.filter((q) => q[x.col] === top).length === 1 && r[x.col] === top ? " win" : "")} tabIndex={0} {...tip.bind(r[x.col] == null ? `${r.name || r.symbol}\n${x.label}: no score` : `${r.name || r.symbol}\n${x.label}: ${r[x.col]} / 100`)}><i style={{ width: `${r[x.col] ?? 0}%` }} /><b>{r[x.col] ?? "—"}</b></div>)}</div></div>); })}</div>
                </div>
                <div className="pil-key">{picked.map((r, i) => <span key={r.symbol}><i className={"mk k" + i} />{r.name}</span>)}</div>
                <p className="faint cmp-foot">Describes each company's financial health from its filings and prices. Not a recommendation. A company with no stored rating shows a dash.</p>
              </div>
            )}
            {showIq && <Gate tier="silver" title="Compare the five FinLit pillars" points={["Quality, Growth, Profitability, Balance sheet, Technical", "See where each company is stronger"]}>
              <div className="card cmp-pil"><div className="card-h"><h3><span className="ci"><Icon name="quality" /></span>The five FinLit pillars<ChartHelp id="cmp-pillars" /></h3><span className="s">0–100, higher is better</span></div>
                <div className="pil-grid">
                  <Radar axes={PILLARS.map((k) => METRICS[k].short)} series={picked.map((r, i) => ({ key: r.symbol, label: r.name || r.symbol, cls: "k" + i, values: PILLARS.map((k) => r[k]), tips: PILLARS.map((k) => r[k] == null ? null : `${r.name || r.symbol}\n${METRICS[k].short}: ${r[k]} / 100`) }))} />
                  <div>{PILLARS.map((k) => { const w = win(k); return (
                    <div className="pil-r" key={k}><span className="pil-l">{METRICS[k].short}</span>
                      <div className="pil-bars">{picked.map((r, i) => <div key={r.symbol} className={"pb k" + i + (w === r.symbol ? " win" : "")} tabIndex={0} {...tip.bind(r[k] == null ? `${r.name || r.symbol}\n${METRICS[k].short}: no score` : `${r.name || r.symbol}\n${METRICS[k].short}: ${r[k]} / 100`)}><i style={{ width: `${r[k] ?? 0}%` }} /><b>{r[k] ?? "—"}</b></div>)}</div></div>); })}</div>
                </div>
                <div className="pil-key">{picked.map((r, i) => <span key={r.symbol}><i className={"mk k" + i} />{r.name}</span>)}</div>
              </div>
            </Gate>}
          </>
        )}

        {picked.length >= 2 && tab === "spider" && (
          <div className="card cmp-pil"><div className="card-h"><h3><span className="ci"><Icon name="gauge" /></span>Eight measures, against every company<ChartHelp id="cmp-fundamentals" /></h3><span className="s">Each axis: % of all companies beaten</span></div>
            <div className="pil-grid sp-grid">
              <div className="sp-chart">
                <Radar unit="%" scale="Each axis is a percentile score from 0 to 100: the share of companies beaten" axes={SPIDER.map((x) => x.label)} series={picked.map((r, i) => ({ key: r.symbol, label: r.name || r.symbol, cls: "k" + i, values: SPIDER.map((x) => pc(r, x.key)),
                  tips: SPIDER.map((x) => { const p = pc(r, x.key); return p == null ? null : `${r.name || r.symbol}\n${x.label}: ${fmt(METRICS[x.key], r[x.key])}\nPercentile score: ${p} (beats ${p}% of companies)`; }) }))} />
                <div className="pil-key sp-legend" aria-label="Companies">{picked.map((r, i) => <span key={r.symbol}><i className={"mk k" + i} />{r.name}</span>)}</div>
                <p className="sp-axis" role="note"><b>Every axis is a percentile score from 0 to 100, not the ratio itself.</b> It is the share of companies this one beats on that measure: 100 means it beats every company. Hover or tap a marker for the actual figure.</p>
                {picked.some((r) => SPIDER.some((x) => pc(r, x.key) == null)) && <p className="sp-axis sp-gap" role="note">Where a company has no figure for a measure, its line stops at that axis (a cross just outside the chart marks the gap) instead of dropping to zero: {picked.map((r) => ({ n: r.name || r.symbol, m: SPIDER.filter((x) => pc(r, x.key) == null).map((x) => x.label) })).filter((x) => x.m.length).map((x) => `${x.n}: ${x.m.join(", ")}`).join("; ")}.</p>}
              </div>
              <div className={"sp-t n" + picked.length} style={{ "--n": picked.length } as React.CSSProperties}><div className="sp-h" role="row"><span />{picked.map((r, i) => <span key={r.symbol} title={r.name || r.symbol}><i className={"mk k" + i} /><b title={codeNote(r)}>{titleOf(r)}</b>{subOf(r) && <small>{subOf(r)}</small>}</span>)}</div>{SPIDER.map((x) => (
                <div className="sp-r" key={x.key}><span className="pil-l">{x.label}</span>{picked.map((r, i) => { const p = pc(r, x.key); return <span key={r.symbol} className={"sp-v k" + i}>{p == null ? <span className="sp-na" tabIndex={0} aria-label={NO_FIGURE} {...tip.bind(NO_FIGURE)}><i className="dt none" />{"—"}</span> : <><i className={"dt " + dot(p)} tabIndex={0} aria-label={dotWhy(p)} {...tip.bind(dotWhy(p))} />{fmt(METRICS[x.key], r[x.key])}<small>{`beats ${p}%`}</small></>}</span>; })}</div>))}
                <div className="sp-key" aria-label="What the dots mean"><span tabIndex={0} {...tip.bind(KEY_WHY.good)}><i className="dt good" />Beats 67% or more</span><span tabIndex={0} {...tip.bind(KEY_WHY.mid)}><i className="dt mid" />Beats 34 to 66%</span><span tabIndex={0} {...tip.bind(KEY_WHY.poor)}><i className="dt poor" />Beats 33% or fewer</span><span tabIndex={0} {...tip.bind(NO_FIGURE)}><i className="dt none" />— No figure</span></div></div>
            </div>
            <p className="faint cmp-foot">“Beats 82%” means the company's value is better than 82% of companies in the list, where better is lower for debt and P/E and higher for everything else.</p>
          </div>
        )}
        {picked.length >= 2 && tab === "custom" && (
          <div className="card cmp-t"><CompareCustom companies={picked.map((r) => ({ symbol: r.symbol, name: r.name || r.symbol }))} keysParam={customKeys} onKeys={setCustomKeys} /></div>
        )}
        {tab === "stress" && (picked.length < 2
          ? null
          : <Gate tier="gold" title="Unlock Stress test" points={["How a shock to crude, the rupee, rates or demand moves both companies' earnings", "Both companies side by side, each against its own last four quarters", "Every assumption shown, information only"]}>
            <div className="card cmp-t"><p><Link className="btn primary" to={`/research/stress-lab/${encodeURIComponent(picked[0].symbol)}?with=${encodeURIComponent(picked[1].symbol)}#compare`}><Icon name="gauge" /> Open the Stress test for {picked[0].symbol} and {picked[1].symbol}</Link></p></div>
          </Gate>)}
        {picked.length >= 2 && !["overview", "spider", "custom", "stress"].includes(tab) && (
          <Gate tier="silver" title={`Unlock ${T.label}`} points={["Model-based pillar scores", "Quality, growth and price behaviour side by side"]}>
            <div className="card cmp-t">
              <div className="cmp-pick"><span className="label">Compare on</span>{pool.map((k) => <button key={k} className={"mchip" + (keys.includes(k) ? " on" : "")} aria-pressed={keys.includes(k)} onClick={() => toggleKey(k)}>{METRICS[k].short}</button>)}</div>
              {!keys.length ? <p className="muted" style={{ padding: 16 }}>Pick at least one measure above.</p> : (
                <div className="mt" style={{ "--n": picked.length } as React.CSSProperties}>
                  <div className="mt-h"><span />{picked.map((r, i) => <span key={r.symbol}><i className={"mk k" + i} />{r.name}</span>)}</div>
                  {groups.map((g) => (
                    <div className="mt-g" key={g.title}>
                      <h4>{g.title}</h4>
                      {g.keys.map((k) => { const m = METRICS[k], w = win(k), d = dists.get(k) || null;
                        const vals = picked.map((r) => r[k]).filter((x): x is number => x != null);
                        const lo = d ? Math.min(d.p10, ...vals) : 0, hi = d ? Math.max(d.p90, ...vals) : 1, sp = hi - lo || 1, at = (v: number) => Math.max(0, Math.min(100, ((v - lo) / sp) * 100));
                        return (
                          <div className="mt-r" key={k}>
                            <div className="mt-n"><b>{m.label}</b><small>{m.say}</small>{m.better !== "none" && <em>{m.better === "higher" ? "Higher is better" : "Lower is better"}</em>}</div>
                            {picked.map((r, i) => { const v = r[k], p = pc(r, k); return (
                              <div key={r.symbol} className={"mt-c k" + i + (w === r.symbol ? " win" : "")}>
                                <b>{v == null ? <span className="mt-na" tabIndex={0} title="No figure: this company has not reported this measure, so no marker is drawn.">—</span> : <>{p != null && <i className={"dt " + dot(p)} title={dotWhy(p)} />}{fmt(m, v)}</>}</b>
                                {w === r.symbol ? <span className="bt-badge">Better</span> : null}
                                {p != null && <small>beats {p}% of companies</small>}
                              </div>); })}
                            {d && (
                              <div className="strip" role="img" aria-label={`Where each company sits among all companies on ${m.label}: ${picked.map((r) => `${r.name || r.symbol} ${r[k] == null ? "no figure" : fmt(m, r[k])}`).join(", ")}; lowest ${fmt(m, lo)}, typical ${fmt(m, d.p50)}, highest ${fmt(m, hi)}`}>
                                <span className="st-band" style={{ left: `${at(d.p10)}%`, width: `${at(d.p90) - at(d.p10)}%` }} title="The range most companies fall in" /><span className="st-med" style={{ left: `${at(d.p50)}%` }} title={`Typical: ${fmt(m, d.p50)}`} />
                                {picked.map((r, i) => r[k] != null && <span key={r.symbol} className={"st-m k" + i} style={{ left: `${at(r[k] as number)}%` }} title={`${r.name || r.symbol}: ${fmt(m, r[k])}`}><i className={"mk k" + i} /></span>)}
                                <em className="st-l lo">{fmt(m, lo)}</em><em className="st-l hi">{fmt(m, hi)}</em>
                                <em className="st-l mid" style={{ "--at": `${at(d.p50)}%` } as React.CSSProperties}>typical {fmt(m, d.p50)}</em>
                              </div>)}
                          </div>); })}
                    </div>))}
                  <div className="mt-key"><span><i className="dt good" />Better than most companies</span><span><i className="dt mid" />Around the middle</span><span><i className="dt poor" />Weaker than most</span><span><i className="st-sw" />Range most companies fall in</span></div>
                </div>)}
              {picked.length === 2 && keys.length > 0 && <p className="faint cmp-foot">Gap shown as A minus B: {keys.slice(0, 3).map((k) => { const a = picked[0][k], b = picked[1][k]; return a != null && b != null ? `${METRICS[k].short} ${a - b >= 0 ? "+" : "−"}${nf(Math.abs(a - b), METRICS[k].digits ?? 2)}` : null; }).filter(Boolean).join(" · ")}</p>}
            </div>
          </Gate>
        )}
        {picked.length >= 2 && !data?.sample && <DiversificationCard symbols={picked.map((r) => r.symbol)} listLabel="Compared companies" candidates={rows.map((r) => [r.symbol, r.name || r.symbol] as [string, string])} />}
        <p className="faint cmp-foot">A comparison shows differences; it is not advice to buy or sell. For the full story behind any number, open the company's report{picked[0] && !picked[0].sample ? <> — start with <Link to={`/stocks/${picked[0].symbol}`}>{picked[0].name}</Link></> : null}.</p>
      </div>
      {tip.node}
    </>
  );
}
