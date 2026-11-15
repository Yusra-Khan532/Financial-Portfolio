// One ETF page, task #134 (the team's 14 Nov redesign, folder 05): the "At a glance" row under the header (C-1), the section links (C-2), and
// "How closely it follows the index" (C-3): tracking difference and tracking error over the last year, with their dates, and every ETF and Direct index
// fund on the same index. Every figure comes from the API (finlit/etf_vs_index.py and finlit/etf.py); a blank is a dash with its reason.
import { Link } from "react-router";
import { Icon } from "../lib/icons";
import { MINUS, nf } from "../lib/format";
import { day, pct, traded, type EtfDetail, type EtfTracking } from "../lib/etf";
import { Blank, GlossInfo, Tone } from "./common";

const pp = (v: number) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), 2)} pp`;
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), 2)}%`;

/** The sections the links jump to, in page order (C-2). The tracking link is left out when the index cannot be told. */
export const SECTIONS: { id: string; label: string }[] = [
  { id: "h-r3", label: "Returns" }, { id: "h-chart", label: "Price chart" }, { id: "etf-tracks", label: "How closely it tracks" }, { id: "hd-h", label: "What it invests in" },
  { id: "h-risk", label: "Risk" }, { id: "h-nav", label: "NAV and premium" }, { id: "h-facts", label: "Key facts" },
];

export function SectionLinks({ hasTracking }: { hasTracking: boolean }) {
  return (
    <nav className="etf-jump" aria-label="Sections of this page">
      {SECTIONS.filter((s) => hasTracking || s.id !== "etf-tracks").map((s) => <a key={s.id} href={`#${s.id}`}>{s.label}</a>)}
    </nav>);
}

/** C-1: six cells under the header: Tracks, Expense ratio, Price vs NAV, Traded a day, 1 year, 5 years. */
const FAILED = "The index and expense ratio could not be loaded right now; please try again.";
export function Glance({ d, t, failed = false }: { d: EtfDetail; t: EtfTracking | undefined; failed?: boolean }) {
  const y1 = d.headline.find((h) => h.key === "1y"), y5 = d.headline.find((h) => h.key === "5y");
  const turn = d.avgTurnover;
  const cell = (k: string, v: React.ReactNode, sub: React.ReactNode) => <div className="etf-g" role="listitem"><span className="k">{k}</span><b>{v}</b><small>{sub}</small></div>;
  return (
    <div className="card etf-glance" role="list" aria-label="At a glance">
      {cell("Tracks", t?.index ? t.index.label : t ? <Blank why={t.why ?? "Not known"} /> : failed ? <Blank why={FAILED} /> : "…", t?.index ? "the index it follows" : t ? "index not told" : failed ? "not loaded" : "")}
      {cell("Expense ratio", t?.terPct != null ? `${nf(t.terPct, 2)}%` : t ? <Blank why={t.ter?.why ?? "Not published in the sources loaded for this scheme."} /> : failed ? <Blank why={FAILED} /> : "…",
        t?.terPct != null ? `a year · ${t.ter?.source?.startsWith("AMFI") ? "AMFI" : t.ter?.source ?? "AMFI"}` : "a year")}
      {cell("Price vs NAV", d.nav?.premium != null ? <Tone v={d.nav.premium}>{signed(d.nav.premium)}</Tone> : <Blank why={d.nav?.premiumWhy ?? "No NAV for the day of the last close"} />,
        d.nav?.premium != null ? `${d.nav.premium < 0 ? "below" : d.nav.premium > 0 ? "above" : "at"} NAV on ${day(d.nav.date)}` : "exchange close against NAV")}
      {cell("Traded a day", turn != null ? traded(turn) : <Blank why="No traded value in the last 20 sessions" />, "average, 20 sessions")}
      {cell("1 year", y1?.value != null ? <Tone v={y1.value}>{pct(y1.value)}</Tone> : <Blank why={y1?.why ?? "Not enough price history"} />, "price return")}
      {cell("5 years", y5?.value != null ? <Tone v={y5.value}>{pct(y5.value)}</Tone> : <Blank why={y5?.why ?? "Not enough price history"} />,
        y5?.value != null ? <>total{y5.annualised != null ? ` · about ${pct(y5.annualised)} a year` : ""}</> : "price return")}
    </div>);
}

/** C-3: how closely it follows its index, and the others on the same index. */
export function TrackingSection({ d, t, loading }: { d: EtfDetail; t: EtfTracking | undefined; loading: boolean }) {
  if (loading && !t) return <section className="card etf-sec" aria-label="How closely it follows the index"><div className="skeleton" style={{ height: 160 }} /></section>;
  if (!t) return null;
  if (!t.index) return (
    <section className="card etf-sec" id="etf-tracks" aria-labelledby="etf-tracks-h">
      <div className="card-h"><h3 id="etf-tracks-h"><span className="ci"><Icon name="activity" /></span>How closely it follows its index</h3></div>
      <p className="etf-say">{t.why}</p>
    </section>);
  const tr = t.tracking!, peers = t.peers ?? [], n = (t.counts?.etfs ?? 0) + (t.counts?.funds ?? 0);
  const dates = tr.from && tr.to ? `${day(tr.from)} to ${day(tr.to)}` : null;
  return (
    <section className="card etf-sec" id="etf-tracks" aria-labelledby="etf-tracks-h">
      <div className="card-h"><h3 id="etf-tracks-h"><span className="ci"><Icon name="activity" /></span>How closely it follows the {t.index.label}</h3>{dates && <span className="s">{dates}</span>}</div>
      <div className="etf-tk">
        <div className="etf-g">
          <span className="k">Tracking difference, 1 year</span>
          <b>{tr.difference.value == null ? <Blank why={tr.difference.why ?? "Not enough history"} /> : pp(tr.difference.value)}</b>
          <small>{tr.difference.value != null && tr.difference.etfReturn != null && tr.difference.indexReturn != null
            ? `ETF ${pct(tr.difference.etfReturn)} against the index's ${pct(tr.difference.indexReturn)}${dates ? `, ${dates}` : ""}` : "the ETF's price return less the index's"}</small>
        </div>
        <div className="etf-g">
          <span className="k">Tracking error, 1 year <GlossInfo name="Tracking error" fallback="How much the daily gap between the ETF and its index moved about, per year. Lower means it follows the index more closely." /></span>
          <b>{tr.error.value == null ? <Blank why={tr.error.why ?? "Not enough history"} /> : `${nf(tr.error.value, 2)}%`}</b>
          <small>{tr.error.value != null ? `how much the daily gap moved about, from ${tr.error.days ?? "—"} days${dates ? `, ${dates}` : ""}` : "how much the gap moved about"}</small>
        </div>
      </div>
      <p className="faint etf-small">Worked out from the ETF's {tr.basis} against the {t.index.label}'s {tr.index}. Over the same days, a lower tracking error means the ETF followed its index more closely.</p>

      <h4 className="etf-h4">Others on the {t.index.label}</h4>
      <div className="tw"><table className="etf-ret etf-peers">
        <caption className="sr-only">Every ETF and Direct index fund that follows the {t.index.label}, with expense ratio, traded value and price against NAV</caption>
        <thead><tr><th scope="col">ETF or fund</th><th scope="col" className="num">Expense ratio</th><th scope="col" className="num">Traded a day</th><th scope="col" className="num">Price vs NAV</th></tr></thead>
        <tbody>{peers.map((p) => (
          <tr key={p.kind + p.id} className={p.self ? "is-self" : ""} aria-current={p.self ? "true" : undefined}>
            <th scope="row">{p.kind === "etf" && !p.self ? <Link to={`/etfs/${encodeURIComponent(p.id)}`}>{p.name}</Link> : p.name}
              <small className="faint">{p.kind === "etf" ? p.id : "Direct plan, index fund"}{p.self ? " · this ETF" : ""}</small></th>
            <td className="num">{p.terPct != null ? `${nf(p.terPct, 2)}%` : <Blank why={p.ter.why ?? "Not published"} />}</td>
            <td className="num">{p.traded != null ? traded(p.traded) : <Blank why={p.tradedWhy ?? "Not available"} />}</td>
            <td className="num">{p.premium != null ? <Tone v={p.premium}>{signed(p.premium)}</Tone> : <Blank why={p.premiumWhy ?? "Not available"} />}</td>
          </tr>))}</tbody>
      </table></div>
      {(t.counts?.funds ?? 0) > 0 && (t.counts?.etfs ?? 0) > 0 && <Link className="etf-link" to={`/etfs/compare-index-funds?index=${encodeURIComponent(t.index.key)}&etf=${encodeURIComponent(d.symbol)}`}>Compare all {n} {t.index.label} ETFs and index funds →</Link>}
      <p className="faint etf-small">{t.source}</p>
    </section>);
}
