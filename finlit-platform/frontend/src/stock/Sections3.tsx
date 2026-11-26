import { HScroll } from "../components/HScroll";
import { scoreView, usePlanModel, usePlanPrism } from "../lib/planScore";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "../lib/icons";
import { Gate, TierChip } from "../components/Gate";
import { Info } from "../components/Info";
import { ChartHelp } from "../components/ChartHelp";
import { Plain } from "../components/Plain";
import { Spark } from "../charts/Small";
import { LineChart } from "../charts/LineChart";
import { MINUS, cr, fmtUnit, nf, num } from "../lib/format";
import { Fragment } from "react";
import { NotMeaningful, ReadingCell, ReadingFilter, ReadingMobileRow, useRatioReadings } from "./RatioReading";
import { prefetchStock, type Peers, type Ratios, type Segments, type Summary } from "../lib/api";
import { metric } from "./derive";
import { useClassification } from "../lib/taxonomy";
import { useUI } from "../lib/ui";
import { SectionHead } from "./Sections";
import { TabGroup } from "../components/TabGroup";
import { ProfitabilityRatios } from "./ProfitabilityRatios";
import { DuPont } from "./DuPont";
import { EarningsCash, useEarningsFindings } from "./EarningsCash";
import { SegmentCard } from "./Sections2";
import { PeerRanking } from "./Leadership";
import { useLeadership } from "../lib/leadership";
import { ChartZoom } from "../components/ChartZoom";
import { CoLogo } from "../components/CoLogo";
import { codeText, coTitle } from "../lib/companyLabel";

const v = (n: string) => `var(${n})`;

/* ================= Ratios ================= */
const GROUP_ICON: Record<string, string> = { valuation: "tag", returns: "quality", margins: "profit", growth: "growth", leverage: "balance", liquidity: "balance", efficiency: "activity", shareholder: "coins", quality: "quality" };
const GOLD_GROUPS = new Set(["leverage", "liquidity", "efficiency", "quality", "shareholder"]);
const DUPES: Record<string, string> = { sales_cagr: "revenue_cagr_5y", profit_cagr: "profit_cagr_5y", npm: "net_margin", opm: "operating_margin" };

/** Rule-of-thumb zones for the headline ratios. They are a starting point, not a verdict: compare within the same industry. */
const METERS: { key: string; max: number; cuts: [number, number]; words: [string, string, string]; good: "low" | "high" | "none"; say: (x: number) => string }[] = [
  { key: "pe", max: 60, cuts: [15, 30], words: ["Low", "Moderate", "High"], good: "low", say: (x) => `You pay ₹${nf(x, 1)} for every ₹1 the company earns in a year.` },
  { key: "pb", max: 8, cuts: [1.5, 4], words: ["Low", "Moderate", "High"], good: "low", say: (x) => `The price is ${nf(x, 1)} times what the company's books say it owns.` },
  { key: "roe", max: 30, cuts: [10, 15], words: ["Low", "Decent", "Strong"], good: "high", say: (x) => `It earns ₹${nf(x, 1)} a year for every ₹100 of shareholders' money.` },
  { key: "roce", max: 30, cuts: [10, 15], words: ["Low", "Decent", "Strong"], good: "high", say: (x) => `It earns ₹${nf(x, 1)} a year for every ₹100 of all capital used.` },
  { key: "debt_to_equity", max: 3, cuts: [0.5, 1.5], words: ["Low", "Moderate", "High"], good: "low", say: (x) => `It owes ₹${nf(x, 2)} for every ₹1 of owners' money.` },
  { key: "dividend_yield", max: 6, cuts: [1, 3], words: ["Low", "Moderate", "High"], good: "none", say: (x) => `About ₹${nf(x, 2)} a year in dividends for every ₹100 invested.` },
];

function Meter({ m, r, on, onSel }: { m: (typeof METERS)[number]; r: Ratios; on: boolean; onSel: () => void }) {
  const e = r.latest[m.key]; if (!e) return null;
  const x = e.value, zone = x < m.cuts[0] ? 0 : x < m.cuts[1] ? 1 : 2;
  const tone = m.good === "none" ? ["--info", "--info", "--info"][zone] : m.good === "low" ? ["--gain", "--warn", "--loss"][zone] : ["--loss", "--warn", "--gain"][zone];
  const pos = Math.min(100, Math.max(0, (x / m.max) * 100)), a = (m.cuts[0] / m.max) * 100, b = (m.cuts[1] / m.max) * 100;
  const zc = m.good === "none" ? ["--info", "--info", "--info"] : m.good === "low" ? ["--gain", "--warn", "--loss"] : ["--loss", "--warn", "--gain"];
  return (
    <div className={"mtr" + (on ? " on" : "")} tabIndex={0} onMouseEnter={onSel} onFocus={onSel} style={{ "--mc": v(tone) } as React.CSSProperties}>
      <div className="mtr-h"><span className="label"><LabelI text={e.label}><Info g={r.glossary[m.key]} /></LabelI></span><span className="mtr-pill">{m.words[zone]}</span></div>
      <div className="mtr-v">{fmtUnit(x, e.unit)}<em>{e.period === "latest" ? "" : e.period}</em></div>
      <div className="mtr-bar" role="img" aria-label={`${e.label} ${fmtUnit(x, e.unit)}, ${m.words[zone]}`}>
        <span style={{ left: 0, width: `${a}%`, background: v(zc[0]) }} /><span style={{ left: `${a}%`, width: `${b - a}%`, background: v(zc[1]) }} /><span style={{ left: `${b}%`, width: `${100 - b}%`, background: v(zc[2]) }} />
        <i style={{ left: `${pos}%` }} />
      </div>
    </div>
  );
}

/** The change of a ratio in its own unit (+31 days, +0.33 pts, +0.10×): a percent change of a ratio misleads. */
/** Task #230: a label with its "i" kept on the label's last line, right after the last word, so a narrow card wraps the words and never strands the "i" alone or lays it over the text. */
export function LabelI({ text, children }: { text: string; children: React.ReactNode }) {
  const k = text.lastIndexOf(" ");
  return <>{k > 0 ? text.slice(0, k + 1) : ""}<span className="li-nw">{k > 0 ? text.slice(k + 1) : text}{children}</span></>;
}

export function ratioChange(unit: string | null | undefined, last: number, prev: number): { text: string; delta: number } {
  const d = last - prev, sg = d > 0 ? "+" : d < 0 ? MINUS : "", a = Math.abs(d);
  return { delta: d, text: unit === "days" ? `${sg}${nf(a, 0)} days` : unit === "x" ? `${sg}${nf(a, 2)}×` : `${sg}${nf(a, 2)} pts` };
}

/** The ratios the history shows first (task #37): the rest are one tap away ("Show all"). */
const HEAD_RATIOS = ["roe", "roce", "net_margin", "debt_to_equity", "interest_coverage", "current_ratio", "asset_turnover", "debtor_days"];
const rank = (k: string) => { const i = HEAD_RATIOS.indexOf(k); return i < 0 ? 99 : i; };

export function HistoryTable({ r, profile }: { r: Ratios; profile?: unknown }) {
  const hist = r.history;
  const readings = useRatioReadings(r, profile);
  const [group, setGroup] = useState("all");
  const [all, setAll] = useState(false);
  const everyRow = Object.entries(hist.rows).filter(([k]) => r.glossary[k]?.label && (group === "all" || readings[k]?.group === group));
  // less text (task #37): the eight ratios people look at first, then "Show all N"; a filter always shows its whole group
  const rows = all || group !== "all" || everyRow.length <= HEAD_RATIOS.length + 1 ? everyRow : [...everyRow].sort(([a], [b]) => rank(a) - rank(b)).slice(0, HEAD_RATIOS.length).sort(([a], [b]) => rank(a) - rank(b));
  const hidden = everyRow.length - rows.length;
  const colSpan = hist.periods.length + 4;
  return (
    <>
    <ReadingFilter readings={readings} value={group} onChange={setGroup} />
    <HScroll className="" label="table"><table className="htab">
      <thead><tr><th>Ratio</th>{hist.periods.map((p, i) => <th key={p} className={i === hist.periods.length - 1 ? "latest" : ""}>{p}</th>)}<th>Change</th><th>Trend</th><th className="rr-col">What it tells you</th></tr></thead>
      <tbody>{rows.map(([k, vals]) => {
        const rd = readings[k];
        const nn = vals.filter((x, i): x is number => x != null && !rd?.nm?.[i]), lo = Math.min(...nn), hi = Math.max(...nn), better = r.glossary[k].better || r.latest[k]?.better;
        const lastI = vals.length - 1, last = vals[lastI], prev = vals[lastI - 1];
        const ch = last != null && prev != null && !rd?.nm?.[lastI] && !rd?.nm?.[lastI - 1] ? ratioChange(r.latest[k]?.unit, last, prev) : null;
        const up = (ch?.delta ?? 0) >= 0, good = better === "lower" ? !up : better === "higher" ? up : null;
        const sc = good == null ? "var(--c2)" : good ? "var(--gain)" : "var(--loss)";
        return (
          <Fragment key={k}>
          <tr className={rd?.group === "weak" ? "rr-weak-row" : undefined}><td>{r.glossary[k].label}</td>
            {vals.map((x, i) => {
              const bad = !!rd?.nm?.[i];
              let t = x == null || bad || hi === lo ? 0.5 : (x - lo) / (hi - lo); if (better === "lower") t = 1 - t;
              const n = Math.round(Math.abs(t - 0.5) * 44), heat = n === 0 ? 0 : Math.min(37, Math.round(6 + 1.4 * n));   // 7 to 37 per cent: the colours stay readable on the page, text keeps about 9:1 contrast
              const bg = x == null || bad ? "transparent" : t >= 0.5 ? `color-mix(in srgb, var(--gain) ${heat}%, transparent)` : `color-mix(in srgb, var(--loss) ${heat}%, transparent)`;
              return <td key={i} className={i === vals.length - 1 ? "latest" : ""} style={{ background: good == null ? undefined : bg }}>{x == null ? <span className="faint">—</span> : bad ? <NotMeaningful reason={rd.nm[i] as string} /> : num(x, r.latest[k]?.unit === "days" ? 0 : 2)}</td>;
            })}
            <td>{ch == null ? "—" : <span className={"dchip " + (good == null ? "" : good ? "up" : "down")}>{ch.delta === 0 ? "" : up ? "▲ " : "▼ "}{ch.text}</span>}</td>
            <td><Spark values={vals.map((x, i) => (rd?.nm?.[i] ? null : x))} color={sc} w={84} h={30} /></td>
            <td className="rr-col"><ReadingCell reading={rd} /></td></tr>
          <ReadingMobileRow reading={rd} colSpan={colSpan} />
          </Fragment>
        );
      })}</tbody>
    </table>{(hidden > 0 || (all && group === "all" && everyRow.length > HEAD_RATIOS.length + 1)) && <p className="rh-more" style={{ margin: "10px 0 0" }}><button type="button" className="mf-linkbtn" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show the main eight" : `Show all ${everyRow.length}`}</button></p>}<p className="faint" style={{ fontSize: "var(--fs-12)", margin: "10px 0 0" }}>Green cells are the most favourable years for that ratio, red the weakest. Where "better" depends on the business, cells stay uncoloured. n/m: the figure cannot be read that year (for example a negative base). They describe; they are not a recommendation.</p></HScroll>
    </>
  );
}

function ValuationHistory({ r }: { r: Ratios }) {
  const [k, setK] = useState<"pe" | "pb" | "ps">("pe");
  const vh = r.valuationHistory, vals = vh.rows[k] || [], nn = vals.filter((x): x is number => x != null);
  if (!nn.length) return null;
  const mean = nn.reduce((a, b) => a + b, 0) / nn.length, now = nn[nn.length - 1], diff = ((now - mean) / mean) * 100;
  const name = { pe: "P/E", pb: "P/B", ps: "P/S" }[k];
  return (
    <div className="vh">
      <ChartZoom label="Valuation history" className="cz-r">
      <div className="tools"><div><div className="label" style={{ display: "flex", alignItems: "center", gap: 8 }}>Valuation history<ChartHelp id="valuation-history" /></div><p className="faint" style={{ margin: "4px 0 0", fontSize: "var(--fs-13)" }}>How much investors paid over the years</p></div><div className="seg">{(["pe", "pb", "ps"] as const).map((x) => <button key={x} aria-pressed={k === x} onClick={() => setK(x)}>{x === "pe" ? "P/E" : x === "pb" ? "P/B" : "P/S"}</button>)}</div></div>
      <LineChart periods={vh.periods} series={[{ key: k, label: name, color: "var(--c1)", values: vals }]} fmt={(x) => nf(x, 1) + "×"} area avg={mean} avgColor="var(--cmp)" height={250} />
      {/* task #328 (developer file 27, change 5): the chart keeps its drawn size (720 × 250); the three figures are rows beside it, In simple words under them */}
      <div className="vh-side">
      <div className="vh-top">
        <div className="vh-k"><span className="label">{name} in {vh.periods[vh.periods.length - 1]}</span><b>{nf(now, 1)}×</b></div>
        <div className="vh-k"><span className="label">{vh.periods.length}-year average</span><b>{nf(mean, 1)}×</b></div>
        <div className={"vh-k " + (diff > 10 ? "hi" : diff < -10 ? "lo" : "")}><span className="label">Versus its history</span><b>{diff >= 0 ? "▲ " : "▼ "}{nf(Math.abs(diff), 0)}% {diff >= 0 ? "above" : "below"}</b></div>
      </div>
      <Plain tone={diff > 10 ? "warn" : diff < -10 ? "good" : "info"}>{diff > 10 ? `Investors are paying more than usual for each rupee of ${k === "pe" ? "profit" : k === "pb" ? "book value" : "sales"} — about ${nf(Math.abs(diff), 0)}% above this company's own average.` : diff < -10 ? `Investors are paying less than usual — about ${nf(Math.abs(diff), 0)}% below this company's own average.` : "The price is close to what investors have usually paid for this company."}</Plain>
      </div>
      </ChartZoom>
    </div>
  );
}

export function RatiosSection({ r, lender = false, sector, industry, labels }: { r?: Ratios; lender?: boolean; sector?: string | null; industry?: string | null; labels?: (string | null | undefined)[] }) {
  const { has, upgrade } = useUI();
  const [sel, setSel] = useState("pe");
  const ef = useEarningsFindings(r?.meta.symbol ?? "", lender, sector, industry, labels);
  if (!r) return <section className="block"><SectionHead id="ratios" no="Ratios" icon="gauge" tier="basic" title="Valuation, returns, margins and debt" /><div className="skeleton" style={{ height: 300 }} /></section>;
  const hist = r.history, meters = METERS.filter((m) => r.latest[m.key]);
  const cur = meters.find((m) => m.key === sel) || meters[0];
  return (
    <>
    <section className="block">
      <SectionHead id="ratios" no="Ratios" icon="gauge" tier="basic" title="Valuation, returns, margins and debt" sub="Latest value with its period. Select i for what it means and how to read it." />
      <Plain>Ratios turn big numbers into fair comparisons. The meters below show where each one sits against common rules of thumb. Zones are a starting point: always compare with companies in the same industry.</Plain>
      <div className="mtr-grid">{meters.map((m) => <Meter key={m.key} m={m} r={r} on={cur?.key === m.key} onSel={() => setSel(m.key)} />)}</div>
      {cur && <p className="mtr-say" aria-live="polite"><b>{r.latest[cur.key].label}</b> {cur.say(r.latest[cur.key].value)}</p>}
      {/* task #216 (README 3.9): the meters stay above; the rest is one tab group with the Key view badge. Task #222 (owner, 18 Nov: "in 09 swap 1st and 3rd tabs - bring ratio history to the front"): it opens on Ratio history */}
      <TabGroup label="Ratios" variant="key" hint="Ratio history shown here" views={[
        { key: "history", label: "Ratio history", content: <>
      <Gate tier="gold" title="Detailed ratio analysis" points={["Every ratio with its history", "Quality, growth, solvency and efficiency", "Full multi-year table"]}>
        <div className="card acc" style={{ marginTop: 16 } as React.CSSProperties}>
          <div className="card-h"><h3><span className="ci"><Icon name="table" /></span>Ratio history<ChartHelp id="ratio-history" /></h3><TierChip tier="gold" /></div>
          <HistoryTable r={r} profile={{ sector, industry, subIndustry: labels?.[2] }} />
          <ValuationHistory r={r} />
        </div>
      </Gate>
        </> },
        { key: "today", label: "All ratios today", content: <>
      <div className="grid g3">
        {r.groups.filter((g) => g.keys.length).map((g) => {
          const keys = g.keys.filter((k) => !(DUPES[k] && r.latest[DUPES[k]]));
          const gold = GOLD_GROUPS.has(g.id) && !has("gold");
          const rows = gold ? keys.slice(0, 2) : keys;
          return (
            <div className="card acc hover-lift rg" key={g.id}>{/* developer file 45: the ratio groups' cards are gold like every card (they had five edge colours) */}
              <div className="card-h"><h3><span className="ci"><Icon name={GROUP_ICON[g.id] || "info"} /></span>{g.label}</h3><span className="chip ghost">{rows.length} ratios</span></div>
              {rows.map((k) => {
                const e = r.latest[k], gl = r.glossary[k];
                return (
                  <div className="mrow" key={k}><span className="k"><i className={"bttr " + (e.better || "")} title={e.better ? `${e.better === "higher" ? "Higher" : "Lower"} is usually better` : ""}>{e.better === "higher" ? "▲" : e.better === "lower" ? "▼" : "•"}</i>{e.label} <Info g={gl} /></span><span className="v">{fmtUnit(e.value, e.unit)}<span className="unit" style={{ marginLeft: 6, fontSize: "var(--fs-12)" }}>{e.period === "latest" ? "" : e.period}</span></span></div>
                );
              })}
              {gold && keys.length > 2 && <div className="more-gold" role="button" tabIndex={0} onClick={() => upgrade("gold", "Detailed ratio analysis is a Gold feature.")} onKeyDown={(e) => e.key === "Enter" && upgrade("gold", "Detailed ratio analysis is a Gold feature.")}><Icon name="crown" /><span><b>+{keys.length - 2} more ratios</b> in detailed ratio analysis · Gold</span></div>}
            </div>
          );
        })}
      </div>
      <p className="faint" style={{ fontSize: "var(--fs-12)", margin: "10px 2px 0" }}>▲ higher is usually better · ▼ lower is usually better</p>
        </> },
        { key: "profit", label: "Profitability ratios", content: <>
      <div className="card acc" style={{ margin: "0 0 8px" } as React.CSSProperties}>
        <div className="card-h"><h3><span className="ci"><Icon name="gauge" /></span>Profitability ratios<ChartHelp id="profit-ratios" /></h3><span className="chip ghost">Annual · 8 years</span></div>
        <ProfitabilityRatios periods={hist.periods} rows={hist.rows as Record<string, (number | null)[]>} />
      </div>
        </> },
      ]} />
    </section>
      <DuPont symbol={r.meta.symbol} lender={lender}
        head={<SectionHead id="dupont" no="DuPont analysis" icon="layers" tier="basic" title="What drives return on equity" sub="ROE split into profit margin, asset turnover and leverage, then cleaned of one-off items and split further." />} />
      <section className="block">
        <SectionHead id="earnings" no="Earnings & cash quality" icon="shield" tier="gold" title="Is the profit real, and is it turning into cash?" sub="Profit against cash, collections and stock, and one-off items." counts={ef ? [{ n: ef.red, label: ef.red === 1 ? "red flag" : "red flags", tone: "red" }, { n: ef.watch, label: "to watch", tone: "amb" }, { n: ef.investigate, label: "to investigate", tone: "amb" }] : undefined} />
        <EarningsCash symbol={r.meta.symbol} lender={lender} sector={sector} industry={industry} labels={labels} />
      </section>
    </>
  );
}

/* ================= Peers ================= */
const HUES = ["#C1B7A1", "#D4B26A", "#E5E2D9", "#E8D29B", "#BAB5A8", "#B8934A", "#AFA48B", "#D7D1C4"];
const hue = (s: string) => HUES[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7) >>> 0 % HUES.length] || HUES[0];

export function PeersSection({ p, self, s }: { p?: Peers; self: string; s: Summary }) {
  const nav = useNavigate(); const qc = useQueryClient();
  const lead = useLeadership(self).data;
  const cls = useClassification(self).data;
  const [hv, setHv] = useState<string | null>(null);
  const items = (p?.items || p?.symbols.map((x) => ({ symbol: x, name: null })) || []) as NonNullable<Peers["items"]>;
  const peers = items.filter((i) => i.symbol !== self);
  // task #283: the score is FinLit Prism, for plans that have it; other plans see no score
  const model = usePlanModel();
  const pm = usePlanPrism(useMemo(() => [self, ...items.map((i) => i.symbol)], [self, items]), model);
  const sc = (sym: string) => (model === "prism" ? scoreView(pm[sym]).score : null);
  const scName = "Prism";
  if (!p || !peers.length) return null;
  const me = { score: sc(self), mcap: s.profile.marketCapCr, pe: metric(s, "pe")?.value ?? null, roe: metric(s, "roe")?.value ?? null };
  const hasData = peers.some((i) => sc(i.symbol) != null || i.market_cap != null || i.pe != null);
  const maxCap = Math.max(me.mcap || 0, ...peers.map((i) => i.market_cap || 0), 1);
  const rad = (cap: number | null | undefined) => (cap ? 20 + 18 * Math.sqrt(cap / maxCap) : 26);
  const go = (sym: string) => nav(`/stocks/${sym}`);
  const hov = hv ? peers.find((i) => i.symbol === hv) : null;
  const N = peers.length, CX = 190, CY = 190, RR = 128;
  return (
    <section className="block">
      <SectionHead id="peers" no="Peers" icon="layers" tier="basic" title={`How ${s.profile.name.split(" ")[0]} compares with its peers`} sub="Select a company to open its report." />
      <Plain>Comparing a company with its closest rivals is the quickest way to tell whether a number is good or just normal for the industry. {cls?.industry ? `${s.profile.name.split(" ")[0]} is in NSE's ${cls.industry} industry${cls.basic_industry ? ` (basic industry: ${cls.basic_industry})` : ""}; these ${N} are the companies the data provider lists as its peers.` : ""}</Plain>
      <div className="pr2">
        <div className="card acc orbit-card">
          <ChartZoom label="Peer map: companies in the same industry">
          <svg viewBox="0 0 380 380" role="group" aria-label="Map of companies in the same industry">
            <defs><radialGradient id="orb" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="var(--gold)" stopOpacity=".22" /><stop offset="1" stopColor="var(--gold)" stopOpacity="0" /></radialGradient>
              <linearGradient id="orbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--gold-2)" /><stop offset="1" stopColor="var(--gold-deep)" /></linearGradient></defs>
            <circle cx={CX} cy={CY} r="178" fill="url(#orb)" />
            <circle cx={CX} cy={CY} r={RR} fill="none" stroke="var(--border-strong)" strokeDasharray="2 7" /><circle cx={CX} cy={CY} r={RR * 0.62} fill="none" stroke="var(--border)" strokeDasharray="2 9" />
            {peers.map((i, k) => { const a = (k / N) * Math.PI * 2 - Math.PI / 2, x = CX + RR * Math.cos(a), y = CY + RR * Math.sin(a), c = hue(i.symbol), r = rad(i.market_cap), on = hv === i.symbol;
              return (
                <g key={i.symbol}>
                  <line x1={CX} y1={CY} x2={x} y2={y} stroke={c} strokeWidth={on ? 2.4 : 1.2} strokeOpacity={on ? 0.9 : 0.35} strokeDasharray={on ? "" : "4 5"} />
                  <g className="orb-n" tabIndex={0} role="link" aria-label={`Open ${i.name || i.symbol} (${i.symbol})`} transform={`translate(${x} ${y})`} onMouseEnter={() => { setHv(i.symbol); prefetchStock(qc, i.symbol, 150); }} onMouseLeave={() => setHv(null)} onFocus={() => setHv(i.symbol)} onBlur={() => setHv(null)} onClick={() => go(i.symbol)} onKeyDown={(e) => e.key === "Enter" && go(i.symbol)} style={{ cursor: "pointer" }}>
                    <circle r={r + 8} fill={c} opacity={on ? 0.28 : 0.12} /><circle r={r} fill={`color-mix(in srgb, ${c} 30%, var(--s1))`} stroke={c} strokeWidth={on ? 3 : 2} />
                    <text textAnchor="middle" dy=".35em" fontSize={11} fontWeight="700" fontFamily="Inter Variable, Inter, monospace" fill="var(--text)">{i.symbol.length > (r > 28 ? 7 : 5) ? i.symbol.slice(0, r > 28 ? 6 : 4) + "…" : i.symbol}</text>
                  </g>
                </g>
              ); })}
            <g transform={`translate(${CX} ${CY})`}><circle r="58" fill="var(--gold)" opacity=".16" /><circle r="46" fill="url(#orbg)" /><text textAnchor="middle" dy="-.15em" fontSize="12" fontWeight="700" fill="#2a1c00" fontFamily="Inter Variable, Inter, monospace">{self}</text><text textAnchor="middle" dy="1.5em" fontSize="11" fill="#2a1c00" opacity=".75">THIS COMPANY</text></g>
          </svg>
          <p className="orb-cap">{hov ? <><b>{hov.name || hov.symbol}</b> · click to open its report</> : hasData ? "Bubble size shows market value. Hover or click a company." : "Hover or click a company to open its report."}</p>
          </ChartZoom>
        </div>
        <div className="pr-list">
          <div className="pr-row me"><CoLogo symbol={s.profile.symbol} name={s.profile.name} size={32} /><span className="pr-nm"><b>{s.profile.name}</b><span className="tk">{codeText(self)} · this company</span></span>
            {model && <span className="pr-st"><span>{scName}</span><b>{me.score ?? "—"}</b></span>}<span className="pr-st"><span>P/E</span><b>{me.pe != null ? nf(me.pe, 1) + "×" : "—"}</b></span><span className="pr-st"><span>ROE</span><b>{me.roe != null ? nf(me.roe, 1) + "%" : "—"}</b></span><span className="pr-st"><span>Cap</span><b>{me.mcap ? "₹" + cr(me.mcap) : "—"}</b></span></div>
          {peers.map((i) => { const c = hue(i.symbol); return (
            <a key={i.symbol} className={"pr-row" + (hv === i.symbol ? " hot" : "")} href={`/stocks/${i.symbol}`} style={{ "--pc": c } as React.CSSProperties} onMouseEnter={() => { setHv(i.symbol); prefetchStock(qc, i.symbol, 150); }} onMouseLeave={() => setHv(null)} onClick={(e) => { e.preventDefault(); go(i.symbol); }}>
              <CoLogo symbol={i.symbol} name={i.name} size={32} />
              <span className="pr-nm"><b title={coTitle(i)}>{i.name || i.symbol}</b><span className="tk">{codeText(i.symbol)}</span></span>
              {hasData ? <>{model && <span className="pr-st"><span>{scName}</span><b>{sc(i.symbol) ?? "—"}</b></span>}<span className="pr-st"><span>P/E</span><b>{i.pe != null ? nf(i.pe, 1) + "×" : "—"}</b></span><span className="pr-st"><span>ROE</span><b>{i.roe != null ? nf(i.roe, 1) + "%" : "—"}</b></span><span className="pr-st"><span>Cap</span><b>{i.market_cap ? "₹" + cr(i.market_cap) : "—"}</b></span></> : <span className="pr-go">Open report <Icon name="arrow" /></span>}
            </a>); })}
        </div>
      </div>
      {lead?.available && <PeerRanking lead={lead} self={self} extras={items.map((i) => ({ symbol: i.symbol, name: i.name }))} />}
    </section>
  );
}

/* Gold insights (old section 15: "Triggers to watch and where the company fits") was removed in developer file 41 (founder, 25 Nov 2026). */

/** Segments: where the revenue comes from, by business segment (its own section since it left the old Gold insights). */
export function SegmentsSection({ seg }: { seg?: Segments }) {
  return (
    <section className="block">
      <SectionHead id="segments" no="Segments" icon="pie" tier="gold" title="Where the revenue comes from" sub="Each business segment's share of revenue, its growth and its profit, year by year." />
      <Gate tier="gold" title="Unlock revenue segmentation" points={["Revenue by business segment, year by year", "Each segment's share, growth and profit", "How dependent the company is on one segment"]}>
        <SegmentCard seg={seg} />
      </Gate>
    </section>
  );
}
