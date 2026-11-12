import { Link } from "react-router";
import { CoLogo } from "../components/CoLogo";
import { Hideable } from "../components/Hideable";
import type { MfSpread, MfTrend, TrendRead } from "../lib/mfPortfolio";
import { dateIN } from "../lib/format";

/* The Diversification section of /mf-portfolio. Every word and figure is worked out on the server (backend mfportfolio/spread.py);
   this file only lays them out. The server sends no levels, weights or cut-offs. Information only, not investment advice. */

const GOOD = new Set(["Move on their own", "Widely spread", "Low", "None", "Spread", "Balanced"]);
const BAD = new Set(["Move as one", "Concentrated", "High", "Repeated"]);
const pill = (w: string) => (GOOD.has(w) ? "good" : BAD.has(w) ? "warn" : "mid");
const p0 = (x: number) => `${Math.round(x * 100)}%`;
const short = (n: string) => n.replace(/\s*-\s*(direct|regular)\s+plan.*$/i, "").replace(/\s*-\s*(growth|idcw).*$/i, "").replace(/\s+fund$/i, "").trim();
const oCls = (p: number) => (p < 5 ? "o0" : p < 15 ? "o1" : p < 30 ? "o2" : "o3");
const cCls = (c: number) => (c < 0.2 ? "c0" : c < 0.4 ? "c1" : c < 0.6 ? "c2" : c < 0.8 ? "c3" : "c4");
const trCls = (w: string | null | undefined) => (!w ? "na" : /strong uptrend/i.test(w) ? "t4" : /uptrend/i.test(w) ? "t3" : /strong downtrend/i.test(w) ? "t0" : /downtrend/i.test(w) ? "t1" : "t2");
const Tr = ({ w }: { w: string | null | undefined }) => <span className={"x-tr " + trCls(w)}>{w || "Not rated"}</span>;
const GRID_ROWS = [["1", "Long term up"], ["0", "Long term sideways"], ["-1", "Long term down"]] as const;
const GRID_COLS = [["-1", "Short term down"], ["0", "Short term sideways"], ["1", "Short term up"]] as const;
const list = (a: string[]) => (a.length < 3 ? a.join(" and ") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

export function SpreadSection({ d }: { d: MfSpread }) {
  const nm = new Map(d.funds.map((f) => [f.code, short(f.name)]));
  const n = (c: number) => nm.get(c) || `Scheme ${c}`;
  const r = d.readings;
  const missing = d.coverage.missing;
  const cats = Object.entries(d.funds.reduce<Record<string, number>>((m, f) => ({ ...m, [f.category || "Other"]: (m[f.category || "Other"] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const amcs = Object.entries(d.funds.reduce<Record<string, number>>((m, f) => ({ ...m, [f.amc]: (m[f.amc] || 0) + 1 }), {})).sort((a, b) => b[1] - a[1]);
  const top = r.overlap.top;
  const sentences: { tag: string; cls: string; text: string }[] = [];
  if (r.together.of > 1) sentences.push({ tag: "Moves together", cls: "t-move", text: `Your ${r.together.of} equity-type funds move like ${r.together.independent.toFixed(1)} independent fund${r.together.independent >= 1.05 ? "s" : ""}${r.together.range ? `; their weekly changes line up between ${r.together.range[0].toFixed(2)} and ${r.together.range[1].toFixed(2)} (1.00 is in step).` : "."}` });
  if (r.theme.theme) sentences.push({ tag: "Same theme", cls: "t-theme", text: `${r.theme.funds.length} of your funds share the "${r.theme.theme}" theme: ${list(r.theme.funds.map(n))}.` });
  if (top && top.n > 0) sentences.push({ tag: "Overlap", cls: "t-ov", text: `${n(top.a)} and ${n(top.b)} keep ${top.pct.toFixed(0)}% of their money in the same ${top.n} stock${top.n === 1 ? "" : "s"}.` });
  if (d.count > 1) sentences.push({ tag: "Fund house", cls: "t-amc", text: `${r.houses.top} runs ${r.houses.count} of your ${d.count} funds.` });
  if (r.underneath.stocks) sentences.push({ tag: "Underneath", cls: "t-under", text: `${r.underneath.stocks} different stocks sit underneath your funds; ${r.underneath.inTwoOrMore} of them are held through two or more funds (${p0(r.underneath.inTwoOrMoreShare / (d.knownShares || 1))} of the shares).` });
  if (missing.length) sentences.push({ tag: "Data", cls: "", text: `The fund house's monthly holdings are not loaded yet for ${list(missing.map(n))}. They are left out of the stock and overlap readings.` });
  const sizeRows = ([["Large", "Large cap", "var(--k1)"], ["Mid", "Mid cap", "var(--k3)"], ["Small", "Small cap", "var(--k7)"], ["Other", "Not ranked", "var(--s3)"]] as const).filter(([k]) => d.size[k] > 0.0005);
  const mixRows = ([["shares", "Shares", "var(--k1)"], ["debt", "Debt and money market", "var(--k3)"], ["other", "Gold and other", "var(--k7)"], ["sharesUnknown", "Holdings not loaded", "var(--s3)"]] as const).filter(([k]) => d.mix[k] > 0.0005);
  const stockFunds = d.together.codes;
  const withShares = Array.from(new Set(d.overlap.flatMap((o) => [o.a, o.b])));
  const ov = new Map(d.overlap.map((o) => [`${o.a}-${o.b}`, o]));

  return (
    <div className="x-div" id="diversification">
      <div className="x-sec-h"><span className="x-eyebrow">Diversification</span><h2>How spread your funds are</h2><p>Worked out from the funds' published NAVs and monthly portfolio files. It describes the list; it is not a suggestion to change it.</p></div>

      <section className="card x-dv" aria-label="Diversification of your funds">
        <div className="x-dv-main">
          <span className="x-eyebrow">Overall reading</span>
          <h2>{d.overall}</h2>
          <p>{d.count === 1 ? "With one fund there is nothing to compare, so the readings describe that fund alone." : `Six readings across your ${d.count} funds, from how their NAVs move to what sits inside them.`}</p>
          <p className="x-dv-basis">{d.basis === "value" ? "Funds are weighted by the value of your units." : "Until units are added for every fund, each fund counts the same: the figures describe the list, not your actual money."}</p>
        </div>
        <ul className="x-dv-parts">
          <li><span className="x-k">Funds that move together</span><span className={"x-pill " + pill(r.together.word)}>{r.together.word}</span>{r.together.of ? <b>{r.together.independent.toFixed(1)}</b> : <b>–</b>}<small>{r.together.of ? `${r.together.of} equity-type funds move like ${r.together.independent.toFixed(1)} independent funds (weekly NAV changes, ${d.together.weeks} weeks).` : "Needs a year of NAV history for two or more funds."}</small></li>
          <li><span className="x-k">Stocks underneath</span><span className={"x-pill " + pill(r.underneath.word)}>{r.underneath.word}</span><b>{r.underneath.stocks || "–"}</b><small>{r.underneath.stocks ? `${r.underneath.stocks} different stocks; ${r.underneath.inTwoOrMore} are in two or more funds.` : "No fund's share holdings are loaded yet."}</small></li>
          <li><span className="x-k">Overlap between funds</span><span className={"x-pill " + pill(r.overlap.word)}>{r.overlap.word}</span><b>{top ? `${top.pct.toFixed(0)}%` : "–"}</b><small>{top ? `Highest share of money two funds keep in the same stocks (${top.n} stocks).` : "Needs share holdings of two or more funds."}</small></li>
          <li><span className="x-k">Same theme</span><span className={"x-pill " + pill(r.theme.word)}>{r.theme.word}</span><b>{r.theme.theme || "–"}</b><small>{r.theme.theme ? `${r.theme.funds.length} sectoral or thematic funds share this theme.` : "No two sectoral or thematic funds share a theme."}</small></li>
          <li><span className="x-k">Fund houses</span><span className={"x-pill " + pill(r.houses.word)}>{r.houses.word}</span><b>{r.houses.count} of {d.count}</b><small>{r.houses.top} runs the most of your funds.</small></li>
          <li><span className="x-k">Asset mix</span><span className={"x-pill " + pill(r.assets.word)}>{r.assets.word}</span><b>{p0(r.assets.equityShare)}</b><small>Share in shares (including funds whose split is not loaded).</small></li>
        </ul>
      </section>

      <section className="card x-means" aria-label="What this means">
        <div className="card-h"><h3>What this means</h3></div>
        <ul className="x-reads">{sentences.map((s) => <li key={s.tag}><span className={"x-tag " + s.cls}>{s.tag}</span><span>{s.text}</span></li>)}</ul>
      </section>

      <div className="x-row">
        <section className="card" aria-label="What your money is in">
          <div className="card-h"><h3>What your money is in</h3></div>
          <h4>Asset mix</h4>
          <div className="x-stack" role="img" aria-label={mixRows.map(([k, l]) => `${l} ${p0(d.mix[k])}`).join(", ")}>{mixRows.map(([k, l, c]) => <i key={k} style={{ width: `${d.mix[k] * 100}%`, background: c }} title={l} />)}</div>
          <ul className="x-key">{mixRows.map(([k, l, c]) => <li key={k}><i style={{ background: c }} /><span>{l}</span> <b>{p0(d.mix[k])}</b></li>)}</ul>
          {d.knownShares > 0 && <>
            <h4>Company size of the shares</h4>
            <div className="x-stack" role="img" aria-label={sizeRows.map(([k, l]) => `${l} ${p0(d.size[k])}`).join(", ")}>{sizeRows.map(([k, l, c]) => <i key={k} style={{ width: `${d.size[k] * 100}%`, background: c }} title={l} />)}</div>
            <ul className="x-key">{sizeRows.map(([k, l, c]) => <li key={k}><i style={{ background: c }} /><span>{l}</span> <b>{p0(d.size[k])}</b></li>)}</ul>
            <p className="x-fine">Large cap is the 100 biggest listed companies by market value, mid cap the next 150, small cap the rest.</p>
          </>}
          {d.sectors.length > 0 && <>
            <h4>Largest sectors ({d.sectors.length} in all)</h4>
            <ul className="x-sect">{d.sectors.slice(0, 8).map((s) => <li key={s.name}><span title={s.name}>{s.name}</span><i><u style={{ width: `${Math.min(100, s.share * 100)}%` }} /></i><b>{p0(s.share)}</b></li>)}</ul>
          </>}
        </section>

        <section className="card" aria-label="Fund types and fund houses">
          <div className="card-h"><h3>Fund types and fund houses</h3></div>
          <h4>By fund type</h4>
          <ul className="x-cnt">{cats.map(([c, k]) => <li key={c}><span>{c}</span><i>{Array.from({ length: k }, (_, j) => <u key={j} />)}</i><b>{k}</b>{r.theme.theme && /sectoral|thematic/i.test(c) && <em>Repeated theme: {r.theme.theme}</em>}</li>)}</ul>
          <h4>By fund house</h4>
          <ul className="x-cnt">{amcs.map(([c, k]) => <li key={c}><span>{c}</span><i>{Array.from({ length: k }, (_, j) => <u key={j} />)}</i><b>{k}</b></li>)}</ul>
        </section>
      </div>

      <div className="x-row">
        <Hideable id="mf.overlap" title="Overlap between funds">
        <section className="card" aria-label="Overlap between funds">
          <div className="card-h"><h3>Overlap between funds</h3></div>
          {withShares.length > 1 ? <>
            <div className="x-tw"><table className="x-mx"><thead><tr><th><span className="sr-only">Fund</span></th>{withShares.map((c) => <th key={c} scope="col"><span>{n(c)}</span></th>)}</tr></thead>
              <tbody>{withShares.map((a) => <tr key={a}><th scope="row">{n(a)}</th>{withShares.map((b) => {
                if (a === b) return <td key={b} className="x-self">–</td>;
                const o = ov.get(`${a}-${b}`) || ov.get(`${b}-${a}`);
                return <td key={b} className={o ? oCls(o.pct) : "o0"}>{o ? <><b>{o.pct.toFixed(0)}%</b><small>{o.n} stocks</small></> : "–"}</td>;
              })}</tr>)}</tbody></table></div>
            <p className="x-legend"><span><i className="o0" /> under 5%</span><span><i className="o1" /> 5 to 15%</span><span><i className="o2" /> 15 to 30%</span><span><i className="o3" /> 30% or more</span></p>
            <p className="x-fine">Share of money two funds keep in the same stocks: for each stock in both, the smaller of the two weights, added up.</p>
          </> : <p className="faint">Needs the share holdings of at least two funds. {missing.length ? `Not loaded yet: ${list(missing.map(n))}.` : ""}</p>}
        </section>
        </Hideable>

        <Hideable id="mf.together" title="Funds that move together">
        <section className="card" aria-label="Funds that move together">
          <div className="card-h"><h3>Funds that move together</h3></div>
          {stockFunds.length > 1 ? <>
            <div className="x-tw"><table className="x-mx"><thead><tr><th><span className="sr-only">Fund</span></th>{stockFunds.map((c) => <th key={c} scope="col"><span>{n(c)}</span></th>)}</tr></thead>
              <tbody>{stockFunds.map((a, i) => <tr key={a}><th scope="row">{n(a)}</th>{stockFunds.map((b, j) => i === j ? <td key={b} className="x-self">–</td> : <td key={b} className={cCls(d.together.C[i][j])}><b>{d.together.C[i][j].toFixed(2)}</b></td>)}</tr>)}</tbody></table></div>
            <p className="x-legend"><span><i className="c0" /> under 0.2</span><span><i className="c1" /> 0.2 to 0.4</span><span><i className="c2" /> 0.4 to 0.6</span><span><i className="c3" /> 0.6 to 0.8</span><span><i className="c4" /> 0.8 or more</span></p>
            <p className="x-fine">Weekly NAV changes of each fund's Growth option, {d.together.weeks} weeks{d.together.from && d.together.to ? ` (${dateIN(d.together.from)} to ${dateIN(d.together.to)})` : ""}. 1.00 means the two rise and fall in step. Liquid and overnight funds are left out: their weekly change is noise.</p>
          </> : <p className="faint">Needs a year of NAV history for at least two equity-type funds.</p>}
        </section>
        </Hideable>
      </div>


      {d.trendLocked && <section className="card x-trend" aria-label="Short- and long-term trend underneath"><div className="card-h"><h3>Short- and long-term trend underneath</h3></div><p className="faint">How the stocks inside your funds are trending, short and long term, is part of the Gold plan. <Link to="/plans">See plans</Link></p></section>}
      {d.trend && <TrendCard t={d.trend} nm={n} />}
      {d.topStocks.length > 0 && <section className="card" aria-label="Largest stocks underneath">
        <div className="card-h"><h3>Largest stocks underneath</h3><span className="s">{d.topStocks.length} of {r.underneath.stocks}</span></div>
        <table className="x-st"><thead><tr><th scope="col">Stock</th><th scope="col">Sector</th><th scope="col" className="r">Share of your list</th>{d.trend && <><th scope="col" className="c">Prism</th><th scope="col" className="c">Short term</th><th scope="col" className="c">Long term</th></>}<th scope="col">Held by</th></tr></thead>
          <tbody>{d.topStocks.map((s) => <tr key={s.name}>
            <td className="l">{s.symbol ? <Link to={`/stocks/${s.symbol}`} className="pfx-co"><CoLogo symbol={s.symbol} name={s.name} size={22} inline /><b>{s.name}</b></Link> : <b>{s.name}</b>}</td>
            <td>{s.sector || "–"}</td>
            <td className="r"><b>{(s.w / (d.knownShares || 1) * 100).toFixed(1)}%</b></td>
            {d.trend && <><td className="c">{s.prism?.score != null ? <span className={"x-ps " + (s.prism.score >= 70 ? "hi" : s.prism.score >= 50 ? "mid" : "lo")}>{Math.round(s.prism.score)}</span> : <span className="x-ps na">Not rated</span>}</td><td className="c"><Tr w={s.prism?.st} /></td><td className="c"><Tr w={s.prism?.lt} /></td></>}
            <td><span className="x-fwrap">{s.funds.map((c) => <span key={c} className="x-fchip">{n(c)}</span>)}</span></td>
          </tr>)}</tbody></table>
        <p className="x-fine">Share of the shares held through all your funds together.</p>
      </section>}

      <aside className="x-disc" aria-label="Disclaimer"><b>Disclaimer</b><p>This page describes your mutual funds using the funds' published NAVs and the fund houses' monthly portfolio files. Holdings are published once a month and may have changed since; NAVs can be delayed. Until you add units, every fund counts the same, so the figures describe the list, not your actual investment. Past performance does not guarantee future returns. Nothing here is investment advice or a recommendation about any fund or share. Mutual fund investments are subject to market risks; read all scheme-related documents carefully.</p></aside>
    </div>
  );
}

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
