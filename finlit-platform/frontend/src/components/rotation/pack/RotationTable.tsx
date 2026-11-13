// Sector Rotation, Full table view, as the "FinLit final pages" pack draws it (docs/design/finlit-final-pages/09): three cards, the ranking of every industry grouped by box
// (filters, CSV, an opened industry with its best and weakest 6-month stocks), Six months of ranks, How the ranking changed over 12 weeks. Describes the past; never advice.
import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { ApiError, apiGet } from "../../../lib/api";
import { Hideable } from "../../Hideable";
import { Cards, Scroll, Section, StateChip, Tip, BoxChip } from "../../sectors/pack/Common";
import { LockedBlock } from "../../sectors/Parts";
import { BOX, keyOf, short } from "../../../lib/pulsePack";
import type { RotationMap, RotationRow } from "../../../lib/rotation";
import type { GroupRow, IndustryPage, RankedStock } from "../../../lib/sectors";
import { BOXES, BOX_HELP, BOX_MEANING, breadthWord, byBox, climbers26, fullCards, inRotFilter, lastMonth, move, nextBox, pc, rankAgo, rotationCsv, rowSummary, sixMonthRankCards, sixMonths, threeMonths, twelveWeekCards, type Box, type RotFilter } from "../../../lib/rotationPack";
import { RankLine } from "./RotationSimple";

export const FullCardsRot = ({ m }: { m: RotationMap }) => <Cards items={fullCards(m)} />;

const signed = (v: number | null | undefined) => (v == null ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`);
function Opened({ r }: { r: RotationRow }) {
  const q = useQuery<IndustryPage, ApiError>({ queryKey: ["sector", r.slug], queryFn: () => apiGet<IndustryPage>(`/api/sectors/${encodeURIComponent(r.slug)}`), staleTime: 300_000, retry: false });
  const stocks = ((q.data?.stocks as RankedStock[] | null) ?? []).filter((s) => s.return_6m_pct != null);
  const best = stocks.slice(0, 5), weak = stocks.length > 5 ? stocks.slice(-3).filter((s) => !best.includes(s)) : [];
  const li = (s: RankedStock) => <li key={s.symbol}><Link to={`/stocks/${s.symbol}`}><b>{s.symbol}</b> <span>{s.name}</span></Link><b className={(s.return_6m_pct ?? 0) >= 0 ? "sp-good" : "sp-red"}>{signed(s.return_6m_pct)}</b></li>;
  return (
    <div className="rp-open">
      <p>{rowSummary(r)} <Link to={`/sectors/${r.slug}`} className="sp-link">Open the {short(r.name)} page →</Link></p>
      {q.isLoading ? <div className="sx-skel" style={{ height: 80 }} role="status" aria-label={`Loading the stocks of ${short(r.name)}`} />
        : q.data && q.data.stocks == null ? <LockedBlock plan="silver" title="The stocks of each industry are part of the Silver plan">The boxes and ranks are open to everyone. Silver lists each industry's stocks, strongest 6 months first.</LockedBlock>
        : stocks.length ? <div className="rp-open-l"><div><p className="sp-cap sp-good">Strongest 6-month stocks</p><ul>{best.map(li)}</ul></div>{weak.length > 0 && <div><p className="sp-cap sp-red">Weakest</p><ul>{weak.map(li)}</ul></div>}</div>
        : <p className="sp-nil">No stock list for this industry right now.</p>}
    </div>
  );
}

export function RankingRot({ m, mine, pulse }: { m: RotationMap; mine: Set<string>; pulse: Map<string, GroupRow> }) {
  const [f, setF] = useState<RotFilter>("all"), [open, setOpen] = useState<string | null>(null);
  const rows = useMemo(() => m.rows.filter((r) => inRotFilter(r, f, mine)), [m, f, mine]);
  const groups = byBox(rows);
  const n = (x: RotFilter) => m.rows.filter((r) => inRotFilter(r, x, mine)).length;
  const filters: [RotFilter, string][] = [["all", `All ${m.rows.length}`], ...BOXES.map((b) => [b, `${BOX[b].word} · ${n(b)}`] as [RotFilter, string]), ["next", `May change next week · ${n("next")}`], ...(mine.size ? [["yours", `Your industries · ${n("yours")}`] as [RotFilter, string]] : [])];
  const csv = () => { const blob = new Blob([rotationCsv(rows)], { type: "text/csv" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `sector-rotation-${m.date}.csv`; a.click(); URL.revokeObjectURL(a.href); };
  const cls = (v: number | null) => (v == null ? "" : v > 0 ? "sp-good" : v < 0 ? "sp-red" : "");
  return (
    <Section id="rp-rank" title="Ranking of every industry" sub="Grouped by box, strongest rank first. Click an industry for its summary and its strongest and weakest stocks." right={<button type="button" className="sp-dl" onClick={csv}>Download CSV</button>}>
      <div className="sp-filters" role="group" aria-label="Show">{filters.map(([k, label]) => <button key={k} type="button" className={"sp-fbtn" + (f === k ? " on" : "")} aria-pressed={f === k} onClick={() => setF(k)}>{label}</button>)}</div>
      <Scroll label="ranking of every industry"><table className="sp-tb rp-full">
        <thead>
          <tr className="rp-bands"><th colSpan={3} className="rp-band"><span>Ranking<Tip text="Its place among all ranked industries this week, 1 the strongest, and the places moved in 1 and 4 weeks." /></span></th><th colSpan={2} className="rp-band rp-band-box"><span>Box<Tip text="Its box and how many weekly closes it has been there." /></span></th>
            <th colSpan={3} className="rp-band rp-band-vs"><span>Vs the average industry<Tip text="How much better (+) or worse (−) the industry did than the average industry over 1, 3 and 6 months." /></span></th><th colSpan={2} className="rp-band rp-band-br"><span>Breadth<Tip text="Taking part: how many of its stocks are above their 50-day average (Most, Some, Few). Sector Pulse: its state there today." /></span></th>
            <th className="rp-band rp-band-26"><span>26 weeks<Tip text="Its rank at each of the last 26 weekly closes, with its highest and lowest." /></span></th></tr>
          <tr><th scope="col" className="rp-w">Now</th><th scope="col">1W / 4W</th><th scope="col">Industry</th><th scope="col">Box now</th><th scope="col" className="r">Weeks</th><th scope="col" className="r">1 month</th><th scope="col" className="r">3 months</th><th scope="col" className="r">6 months</th><th scope="col">Taking part</th><th scope="col">Sector Pulse</th><th scope="col">Rank line</th></tr>
        </thead>
        <tbody>{groups.map((g) => (
          <Fragment key={g.box}>
            <tr className={"rp-gh rp-gh-" + BOX[g.box].tone}><td colSpan={11}><span className="rp-gh-in"><BoxChip corner={g.box} /><Tip text={BOX_HELP[g.box]} label={`About “${BOX[g.box].word}”`} /><b>{g.rows.length} {g.rows.length === 1 ? "industry" : "industries"}</b><span>{BOX_MEANING[g.box]}</span></span></td></tr>
            {g.rows.map((r) => { const on = open === r.slug, bw = breadthWord(r), nb = nextBox(r), pg = pulse.get(r.slug); return (
              <Fragment key={r.slug}>
                <tr className={"rp-row" + (on ? " on" : "")}>
                  <td><button type="button" className="sp-exp" aria-expanded={on} aria-controls={"rp-x-" + r.slug} onClick={() => setOpen(on ? null : r.slug)}><span aria-hidden="true">{on ? "▼" : "▶"}</span><b className="rp-now">{r.rank ?? "–"}</b></button></td>
                  <td className="rp-mv2"><span className={(r.rank_change_1w ?? 0) > 0 ? "up" : (r.rank_change_1w ?? 0) < 0 ? "dn" : ""}>{move(r.rank_change_1w)}</span> / <span className={(r.rank_change_4w ?? 0) > 0 ? "up" : (r.rank_change_4w ?? 0) < 0 ? "dn" : ""}>{move(r.rank_change_4w)}</span></td>
                  <td><span className="rp-name"><b>{short(r.name)}</b>{mine.has(r.slug) && <em className="rp-yours"> · Yours</em>}<small>{r.stocks_counted} stocks</small></span></td>
                  <td><BoxChip corner={r.corner} />{nb && <small className={"rp-maymove rp-t-" + BOX[nb].tone}>may move to {BOX[nb].word}</small>}</td>
                  <td className="r">{r.weeks_in_corner}</td>
                  <td className={"r " + cls(lastMonth(r))}>{pc(lastMonth(r))}</td><td className={"r " + cls(threeMonths(r))}>{pc(threeMonths(r))}</td><td className={"r " + cls(sixMonths(r))}>{pc(sixMonths(r))}</td>
                  <td>{bw.w ? <span className="rp-bw"><b className={"rp-bw-" + bw.w.toLowerCase()}>{bw.w}</b> · {bw.pct}%</span> : "–"}</td>
                  <td>{pg?.state_code ? <span className="rp-pulse"><i className={"rp-pd rp-pd-" + keyOf(pg)} aria-hidden="true" />{StateWord(pg)}</span> : "–"}</td>
                  <td><span className="rp-rl26">{r.rank != null ? <RankLine r={r} w={70} h={24} /> : <span className="sp-nil">too new</span>}<small>{r.rank_best_26w != null ? <>highest {r.rank_best_26w}<br />lowest {r.rank_worst_26w}</> : null}</small></span></td>
                </tr>
                {on && <tr className="rp-xrow" id={"rp-x-" + r.slug}><td colSpan={11}><Opened r={r} /></td></tr>}
              </Fragment>); })}
          </Fragment>))}</tbody>
      </table></Scroll>
    </Section>
  );
}
const StateWord = (g: GroupRow) => { const k = keyOf(g); return ({ crash: "Bouncing back after a crash", bouncing: "Bouncing back", rising: "Rising together", losing: "Losing steam", sold_off: "Sold off", no_signal: "No clear signal" } as const)[k]; };
void StateChip;

// ------------------------------------------------------------------------------------------------ Six months of ranks
const HEAT = (rank: number | null, n: number) => {
  if (rank == null) return "transparent";
  const t = (rank - 1) / Math.max(1, n - 1);   // 0 best .. 1 worst: dark green → pale → dark red
  const g = [46, 125, 87], p = [236, 232, 222], r = [184, 58, 58];
  const mix = (a: number[], b: number[], u: number) => a.map((v, i) => Math.round(v + (b[i] - v) * u));
  const c = t < 0.5 ? mix(g, p, t / 0.5) : mix(p, r, (t - 0.5) / 0.5);
  return `rgb(${c.join(",")})`;
};
const dm = (d: string) => { const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return `${+d.slice(8, 10)} ${M[+d.slice(5, 7) - 1]}`; };
export function SixMonthRanks({ m }: { m: RotationMap }) {
  const rows = m.rows.filter((r) => r.rank != null).sort((a, b) => a.rank! - b.rank!), weeks = m.rank_weeks, n = rows[0]?.ranked ?? 37, cols = weeks.length;
  const FX = 160, FS = 22, FR = 15, FT = 22, W = FX + cols * FS + 70, H = FT + rows.length * FR + 4;
  const c26 = climbers26(m);
  return (
    <Hideable id="pack.rp-six" title="Six months of ranks">
      <section className="sp-sec" aria-labelledby="rp-six">
        <div className="sp-sec-h"><div><h2 id="rp-six">Six months of ranks<Tip text="Each industry's rank at every weekly close for six months. Dark green is near the top of the ranking, dark red near the bottom." /></h2>
          <p className="sp-sub">Each row is an industry, each square a week. Dark green is near the top of the ranking, dark red near the bottom. Sorted by this week's rank.</p></div></div>
        <p className="rp-heatkey"><span>Rank 1 (strongest)</span><i aria-hidden="true" /><span>Rank {n} (weakest)</span></p>
        <Scroll label="six months of ranks"><svg className="rp-heat" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Ranks of ${rows.length} industries at ${cols} weekly closes`}>
          {weeks.map((d, j) => (cols - 1 - j) % 4 === 0 && <text key={d} x={FX + j * FS + 10} y={14} className="rp-hd" textAnchor="middle">{dm(d)}</text>)}
          <text x={FX + cols * FS + 40} y={14} className="rp-hd" textAnchor="middle">4 wks</text>
          {rows.map((r, k) => { const y = FT + k * FR, by = new Map(r.rank_history.map((p) => [p.date, p.rank])); return (
            <g key={r.slug}>
              <text x={FX - 8} y={y + 10} className="rp-hn" textAnchor="end">{short(r.name)}</text>
              {weeks.map((d, j) => { const v = by.get(d) ?? null; return <rect key={d} x={FX + j * FS} y={y} width={20} height={13} rx={2} fill={HEAT(v, n)}><title>{`${short(r.name)}, ${dm(d)}: ${v == null ? "not ranked" : "rank " + v}`}</title></rect>; })}
              <rect x={FX + cols * FS + 4} y={y} width={20} height={13} rx={2} fill={HEAT(r.rank, n)} /><text x={FX + cols * FS + 14} y={y + 10} className={"rp-hr" + (r.rank! <= n * 0.3 || r.rank! >= n * 0.7 ? " on" : "")} textAnchor="middle">{r.rank}</text>
              <text x={FX + cols * FS + 40} y={y + 10} className={"rp-hm " + ((r.rank_change_4w ?? 0) > 0 ? "up" : (r.rank_change_4w ?? 0) < 0 ? "dn" : "")} textAnchor="middle">{r.rank_change_4w ? move(r.rank_change_4w) : "·"}</text>
            </g>); })}
        </svg></Scroll>
        <p className="sp-note">A row turning from red to green is an industry climbing the ranking; the right-hand arrow is the change over the last 4 weeks.</p>
        <Cards items={sixMonthRankCards(m)} />
        <details className="sp-more"><summary>Biggest climbers and fallers over {cols} weeks ▾</summary>
          <ul className="sp-changed">{c26.up.map((x) => <li key={x.r.slug}><Link to={`/sectors/${x.r.slug}`}>{short(x.r.name)}</Link>: from rank {x.from} to rank {x.r.rank} (▲{x.d})</li>)}
            {c26.down.map((x) => <li key={x.r.slug}><Link to={`/sectors/${x.r.slug}`}>{short(x.r.name)}</Link>: from rank {x.from} to rank {x.r.rank} (▼{-x.d})</li>)}</ul></details>
      </section>
    </Hideable>
  );
}

// ------------------------------------------------------------------------------------------------ How the ranking changed over 12 weeks
const TEAL = (rank: number | null, n: number) => { if (rank == null) return { bg: "transparent", fg: "inherit" }; const t = (rank - 1) / Math.max(1, n - 1); const a = [14, 100, 113], b = [232, 238, 236]; const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.min(1, t * 1.15))); return { bg: `rgb(${c.join(",")})`, fg: t < 0.45 ? "#fff" : "#17262e" }; };
export function TwelveWeeks({ m, mine }: { m: RotationMap; mine: Set<string> }) {
  const rows = m.rows.filter((r) => r.rank != null).sort((a, b) => a.rank! - b.rank!), weeks = m.rank_weeks.slice(-12), n = rows[0]?.ranked ?? 37;
  return (
    <Section id="rp-twelve" hide title="How the ranking changed over 12 weeks" help="How the ranking changed. Each industry's rank at the last 12 weekly closes, in today's order. The last column is the places gained or lost over the 12 weeks."
      sub="Each industry's rank at the last 12 weekly closes, in today's order. The last column is the places gained or lost.">
      <div className="sp-ckey rp-tkey"><span><b>How to read it:</b> rank 1 <i className="rp-tgrad" aria-hidden="true" /> rank {n}</span><span>Each row is one industry; each column one week. A row getting <b>darker</b> towards the right is climbing; one getting <b>lighter</b> is falling back.</span></div>
      <Cards items={twelveWeekCards(m)} />
      <Scroll label="ranks over 12 weeks"><table className="sp-tb rp-12">
        <thead><tr><th scope="col">Industry · rank now</th>{weeks.map((d) => <th key={d} scope="col" className="c">{dm(d)}</th>)}<th scope="col" className="r">12 weeks</th></tr></thead>
        <tbody>{rows.map((r) => { const by = new Map(r.rank_history.map((p) => [p.date, p.rank])), first = by.get(weeks[0]) ?? null, d = first == null ? null : first - r.rank!, big = d != null && Math.abs(d) >= 12; return (
          <tr key={r.slug} className={big ? "big" : ""}><th scope="row">{r.rank}. {short(r.name)}{mine.has(r.slug) && " ★"}</th>
            {weeks.map((w) => { const v = by.get(w) ?? null, c = TEAL(v, n); return <td key={w} className="c"><span className="rp-cell" style={{ background: c.bg, color: c.fg }}>{v ?? ""}</span></td>; })}
            <td className={"r rp-12d" + (big ? " hl" : "") + (d == null ? "" : d > 0 ? " up" : d < 0 ? " dn" : "")}>{d == null ? "–" : d === 0 ? "same" : move(d)}</td></tr>); })}</tbody>
      </table></Scroll>
    </Section>
  );
}
export { rankAgo };
export type { Box };
