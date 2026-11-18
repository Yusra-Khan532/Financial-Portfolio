import type { MfTrend, TrendRead } from "../lib/mfPortfolio";

/* The trend card underneath the MF portfolio (Mix & overlap, Gold). The rest of the old Diversification section was rebuilt from the 15 Nov pack in
   mf/pack/MfMix.tsx (task #183 part 2). Every word and figure is the server's. Information only, not investment advice. */

const trCls = (w: string | null | undefined) => (!w ? "na" : /strong uptrend/i.test(w) ? "t4" : /uptrend/i.test(w) ? "t3" : /strong downtrend/i.test(w) ? "t0" : /downtrend/i.test(w) ? "t1" : "t2");
const Tr = ({ w }: { w: string | null | undefined }) => <span className={"x-tr " + trCls(w)}>{w || "Not rated"}</span>;
const GRID_ROWS = [["1", "Long term up"], ["0", "Long term sideways"], ["-1", "Long term down"]] as const;
const GRID_COLS = [["-1", "Short term down"], ["0", "Short term sideways"], ["1", "Short term up"]] as const;

/** The trend card, shared by the MF and the equity portfolio pages. `perFund` and `sharedWeakSpots` exist for funds only. */
export function TrendCard({ t, nm, what = "stocks inside your funds" }: { t: MfTrend; nm: (c: number) => string; what?: string }) {
  const a: TrendRead = t.all;
  if (!a.rated) return <section className="card x-trend" aria-label="Short- and long-term trend underneath"><div className="card-h"><h3>Short- and long-term trend underneath</h3></div><p className="faint">None of the {what} has a stored FinLit Prism trend reading yet, so there is nothing to show.</p></section>;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const biz = [["strong_up", "g", "Business and price agree (strong)"], ["strong_down", "m", "Price behind the business"], ["weak_up", "m", "Price ahead of the business"], ["weak_down", "b", "Business and price agree (weak)"]] as const;
  const funds = Object.entries(t.perFund || {});
  const lines: { tag: string; cls: string; text: string }[] = [
    { tag: "Long term", cls: a.words.longTerm === "Mostly rising" ? "tg-up" : a.words.longTerm === "Mostly falling" ? "tg-dn" : "tg-mx", text: `${pct(a.breadth.up)} of the rated stocks are in a long-term uptrend and ${pct(a.breadth.down)} in a downtrend.` },
    { tag: "Short vs long", cls: a.words.shortAgainstLong === "Improving" ? "tg-up" : a.words.shortAgainstLong === "Fading" ? "tg-dn" : "tg-mx", text: `The short-term trend is ahead of the long-term trend for ${pct(a.direction.improving)} and behind it for ${pct(a.direction.weakening)}.` },
  ];
  const sw = t.sharedWeakSpots;
  if (sw && sw.n) lines.push({ tag: "Shared", cls: "tg-dn", text: `${sw.n} stock${sw.n === 1 ? " is" : "s are"} held through two or more funds and in a long-term downtrend (${pct(sw.share)} of the rated list)${sw.symbols.length ? `, the largest: ${sw.symbols.slice(0, 3).join(", ")}` : ""}.` });
  return (
    <section className="card x-trend" aria-label="Short- and long-term trend underneath">
      <div className="card-h"><h3>Short- and long-term trend{what.includes("fund") ? " underneath" : ""}</h3><span className="s">{a.rated} of {a.n} stocks rated</span></div>
      <ul className="x-trd">
        <li><span className="x-k">Long-term trend</span><span className={"x-pill " + (a.words.longTerm === "Mostly rising" ? "good" : a.words.longTerm === "Mostly falling" ? "warn" : "mid")}>{a.words.longTerm}</span><b>{a.average?.ltLabel}</b><small>Average of the rated stocks.</small></li>
        <li><span className="x-k">Short against long</span><span className={"x-pill " + (a.words.shortAgainstLong === "Improving" ? "good" : a.words.shortAgainstLong === "Fading" ? "warn" : "mid")}>{a.words.shortAgainstLong}</span><b>{a.average?.stLabel}</b><small>Average short-term trend.</small></li>
        <li><span className="x-k">Business and price</span><span className={"x-pill " + (a.words.businessAndPrice === "In step" ? "good" : a.words.businessAndPrice === "Out of step" ? "warn" : "mid")}>{a.words.businessAndPrice}</span><b>{pct(a.business.strong_down.share + a.business.weak_up.share)}</b><small>Share where the Prism business reading and the price trend point different ways.</small></li>
      </ul>
      <div className="x-trend-row">
        <div className="x-tw"><table className="x-tg"><thead><tr><th><span className="sr-only">Long term</span></th>{GRID_COLS.map(([k, l]) => <th key={k} scope="col">{l}</th>)}</tr></thead>
          <tbody>{GRID_ROWS.map(([r, rl]) => <tr key={r}><th scope="row">{rl}</th>{GRID_COLS.map(([c]) => { const g = a.grid[`${r},${c}`]; const tone = +r + +c >= 2 ? "g3" : +r + +c === 1 ? "g2" : +r + +c === 0 ? "g0" : +r + +c === -1 ? "b2" : "b3"; return <td key={c} className={g.n ? tone : "x-empty"}><span className="x-cn">{g.name}</span><span className="x-cp">{pct(g.share)}</span><span className="x-cc">{g.n} stock{g.n === 1 ? "" : "s"}</span>{g.symbols.length > 0 && <em className="x-cnm">{g.symbols.slice(0, 3).join(", ")}</em>}</td>; })}</tr>)}</tbody></table></div>
        <div><h4>Business and price</h4><div className="x-bzg">{biz.map(([k, c, l]) => <div key={k} className={"x-bz " + c}><span className="x-bz-t">{l}</span><b>{pct(a.business[k].share)}</b><small>{a.business[k].n} stock{a.business[k].n === 1 ? "" : "s"}</small>{a.business[k].symbols.length > 0 && <em>{a.business[k].symbols.slice(0, 4).join(", ")}</em>}</div>)}</div></div>
      </div>
      {funds.length > 0 && <><h4>Each fund's stocks</h4><div className="x-tw"><table className="x-ft"><thead><tr><th scope="col">Fund</th><th scope="col">Long term</th><th scope="col">Short term</th><th scope="col">Up / sideways / down</th></tr></thead>
        <tbody>{funds.map(([code, f]) => { const up = f.breadth.up, dn = f.breadth.down, mid = Math.max(0, 1 - up - dn); return <tr key={code}><td className="l"><b>{nm(+code)}</b></td><td>{f.average ? <Tr w={f.average.ltLabel} /> : <Tr w={null} />}</td><td>{f.average ? <Tr w={f.average.stLabel} /> : <Tr w={null} />}</td><td><div className="x-ud" role="img" aria-label={`Long term: ${pct(up)} up, ${pct(mid)} sideways, ${pct(dn)} down`}><i className="u" style={{ width: `${up * 100}%` }} /><i className="s" style={{ width: `${mid * 100}%` }} /><i className="d" style={{ width: `${dn * 100}%` }} /></div><span className="x-udl">{pct(up)} up · {pct(dn)} down</span></td></tr>; })}</tbody></table></div></>}
      <h4>What the trends say</h4>
      <ul className="x-trs">{lines.map((l) => <li key={l.tag}><span className={"x-tag " + l.cls}>{l.tag}</span><span>{l.text}</span></li>)}</ul>
      <p className="x-fine">A reading of price trends from FinLit Prism's technical scores, not a call to buy or sell. Coverage: {pct(a.coverage)} of the list by weight has a stored reading.</p>
    </section>
  );
}
