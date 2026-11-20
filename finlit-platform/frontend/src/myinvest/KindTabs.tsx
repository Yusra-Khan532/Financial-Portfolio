// All my investments, tabs 2-4 (task #137, README "Tab 2: Equity", "Tab 3: Mutual funds", "Tab 4: ETFs"): each kind sums up its own portfolio page, from the
// same answer as All together, and ends with a link to that page. Every figure comes from the server; the words here only describe them. Descriptive only.
import { useState } from "react";
import { Link } from "react-router";
import { HScroll } from "../components/HScroll";
import { nf } from "../lib/format";
import { MODEL_NAME, betaTxt, betaWindowTxt, chg, joinWords, pctOf, rupees, type AllInvestments, type Kind } from "../lib/myInvest";
import { GoLink, Notes, ScoreWord, SecHead, ShowAll, Stack, type Note } from "./parts";
import { coTitle, subLine, titleOf } from "../lib/companyLabel";
import { KeyFiguresSection } from "./KeyFigures277";

export const EQ_SECTIONS = [{ id: "mi-eq-list", label: "Your shares" }, { id: "mi-eq-spread", label: "Spread" }, { id: "mi-eq-risk", label: "Risk" }, { id: "mi-eq-also", label: "Also in funds and ETFs" }];
export const MF_SECTIONS = [{ id: "mi-mf-list", label: "Your funds" }, { id: "mi-mf-inside", label: "Inside" }, { id: "mi-mf-risk", label: "Risk" }];
export const ETF_SECTIONS = [{ id: "mi-etf-list", label: "Your ETFs" }, { id: "mi-etf-inside", label: "Inside" }, { id: "mi-etf-risk", label: "Risk" }];
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
const TOP = 10;
const tone = (v: number | null | undefined) => (v == null ? "" : v > 0 ? "mi-up" : v < 0 ? "mi-down" : "");
const MIX_CLS: Record<string, string> = { indian: "m-in", abroad: "m-ab", gold: "m-au", debt: "m-dc", other: "m-ot", notLoaded: "m-nl" };

/** A kind's risk block: beta and its band word, swing and worst fall against the Nifty 500, and the kind's part of all market risk. */
function KindRisk({ d, kind, id, n, extra }: { d: AllInvestments; kind: Kind; id: string; n: number; extra?: React.ReactNode }) {
  const x = d.risk.kinds[kind], p = d.risk.parts.find((q) => q.kind === kind), b = d.risk.bench;
  const name = { shares: "your shares", funds: "your funds", etfs: "your ETFs" }[kind];
  return (
    <section className="card mi-step">
      <SecHead id={id} n={n} title={`How risky ${name} are`} line={kind === "shares" ? "The Equity portfolio's own figures against the Nifty 500, from weekly prices." : "Daily NAVs and prices over three years, against the Nifty 500, as on the portfolio page."}
        info={[`How ${name} have moved with the market: beta, the yearly swing and the worst fall from a high.`, "Beta above 1 moved more than the Nifty 500, below 1 less. Past moves only."]} />
      <div className="mi-three">
        <article className="mi-hc"><p className="mi-cap">Beta vs Nifty 500</p><p className="mi-hv"><b>{betaTxt(x?.beta)}</b>{p?.band ? <span className="mi-chip">{p.band}</span> : null}</p><p className="mi-small">{x?.beta == null ? x?.why ?? "No figure yet." : <>{betaWindowTxt(x.betaWindow)}. The same figure as the {kind === "shares" ? "Equity" : kind === "funds" ? "MF" : "ETF"} portfolio page{x.cover != null && x.cover < 100 ? ` (${pctOf(x.cover, 0)} of them have a year of prices)` : ""}.</>}</p></article>
        <article className="mi-hc"><p className="mi-cap">Swing a year</p><p className="mi-hv"><b>{pctOf(x?.swing)}</b></p><p className="mi-small">{kind === "shares" ? `Nifty 500: ${pctOf(x?.benchSwing)}` : `Nifty 500: ${pctOf(b?.swing)}`}. Worst fall from a high: <b className="mi-down">{pctOf(x?.worstFall)}</b>{kind === "shares" ? ` (Nifty 500 ${pctOf(x?.benchWorstFall)})` : ` (Nifty 500 ${pctOf(b?.worstFall)})`}.</p></article>
        <article className="mi-hc"><p className="mi-cap">Part of all market risk</p><p className="mi-hv"><b className={p?.red ? "mi-down" : ""}>{pctOf(p?.riskShare)}</b></p><p className="mi-small">On {pctOf(p?.money)} of the money{d.byValue ? "" : " (each kind counts the same until you add quantities)"}.</p></article>
      </div>
      {extra}
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ Equity
export function EquityTab({ d }: { d: AllInvestments }) {
  const [all, setAll] = useState(false);
  const s = d.shares, model = MODEL_NAME[d.plan === "gold" ? "prism" : "iq"], peers = d.cards.shares.peers ?? {};
  const byMacro = Object.entries(s.reduce<Record<string, number>>((a, x) => { a[x.macro] = (a[x.macro] ?? 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]);
  const also = s.filter((x) => x.alsoIn);
  const risky = [...s].filter((x) => x.beta != null).sort((a, b) => (b.beta! * b.of) - (a.beta! * a.of)).slice(0, 5);
  const shown = all ? s : s.slice(0, TOP);
  const notes: Note[] = [
    { kind: (peers.Laggard ?? 0) > (peers.Leader ?? 0) ? "watch" : "insight", title: `${peers.Leader ?? 0} ${peers.Leader === 1 ? "leads" : "lead"} their peers, ${peers.Laggard ?? 0} ${peers.Laggard === 1 ? "lags" : "lag"}`, text: <>Against peers compares each company's past year of price with its own industry group. {peers["Not compared"] ? `${peers["Not compared"]} ${peers["Not compared"] === 1 ? "is" : "are"} not compared this week.` : ""}</> },
    ...(byMacro[0] ? [{ kind: "insight" as const, title: `${byMacro[0][0]} has the most shares: ${byMacro[0][1]} of ${s.length}`, text: <>Your shares sit in {byMacro.length} macro sectors.</> }] : []),
    { kind: also.length ? "insight" : "good", title: also.length ? `${also.length} of your shares are also inside your funds or ETFs` : "None of your shares is inside your funds or ETFs", text: also.length ? <>{joinWords(also.slice(0, 4).map((x) => x.symbol))}{also.length > 4 ? " and more" : ""}: see "Also inside your funds and ETFs" below.</> : "Each company you hold directly is held only once." },
  ];
  return (
    <>
      <section className="card mi-step">
        <SecHead id="mi-eq-list" n={1} title="Your shares" line={`${s.length} shares from your Equity portfolio, read with ${model}.`} info={["Each share on your Equity portfolio with its score, peers, moves and part of everything.", "Of everything is the share's direct part only; step 4 of All together adds what your funds and ETFs hold."]} />
        <HScroll label="Your shares" className="mi-freeze">
          <table className="mi-tb">
            <thead><tr><th scope="col">Share</th><th scope="col">Macro sector</th><th scope="col">Size</th><th scope="col">{model}</th><th scope="col">Against peers</th><th scope="col" className="r">1 day</th><th scope="col" className="r">1 year</th>{d.byValue && <th scope="col" className="r">Value</th>}<th scope="col" className="r">Of everything</th></tr></thead>
            <tbody>{shown.map((x) => <tr key={x.symbol}><th scope="row"><Link to={`/stocks/${encodeURIComponent(x.symbol)}`}><b title={coTitle(x)}>{titleOf(x)}</b></Link><small>{subLine(x, x.name)}</small>{x.alsoIn && <span className="mi-tag">Also in funds/ETFs</span>}</th>
              <td>{x.macro}</td><td>{x.size ?? <span className="mi-muted">Not sized</span>}</td><td><ScoreWord v={x.score} label={x.label} /></td><td><span className={"mi-peer p-" + x.peer.replace(/\s/g, "").toLowerCase()}>{x.peer}</span></td>
              <td className={"r " + tone(x.chg1d)}>{chg(x.chg1d, 2)}</td><td className={"r " + tone(x.chg1y)}>{chg(x.chg1y)}</td>{d.byValue && <td className="r">{x.value != null ? rupees(x.value) : "—"}</td>}<td className="r">{pctOf(x.of, 2)}</td></tr>)}</tbody>
          </table>
        </HScroll>
        <ShowAll n={s.length} shown={shown.length} noun="shares" onClick={() => setAll(true)} />
        <Notes scope="eq" items={notes} />
      </section>
      {/* task #277 (change 9): Key figures after Step 1 */}
      <KeyFiguresSection d={d} view="equity" go={go} />
      <section className="card mi-step">
        <SecHead id="mi-eq-spread" n={2} title="How your shares are spread" line="By macro sector and by company size, your shares only (by count)." info={["How your own shares split across NSE's macro sectors and company sizes.", "Counted by number of shares; All together step 3 counts through funds and ETFs too."]} />
        <div className="mi-two">
          <ul className="mi-hbars">{byMacro.map(([k, n]) => <li key={k}><span className="mi-hb-l">{k}</span><span className="mi-hb-b"><i className="k-shares" style={{ width: `${(n / byMacro[0][1]) * 100}%` }} /></span><b>{n}</b></li>)}</ul>
          <ul className="mi-hbars">{(["Large", "Mid", "Small", "Micro"] as const).map((z) => { const n = s.filter((x) => x.size === z).length; return <li key={z}><span className="mi-hb-l">{z}</span><span className="mi-hb-b"><i className="k-shares" style={{ width: `${(n / Math.max(1, s.length)) * 100}%` }} /></span><b>{n}</b></li>; })}
            {s.some((x) => !x.size) && <li><span className="mi-hb-l">Not sized</span><span className="mi-hb-b" /><b>{s.filter((x) => !x.size).length}</b></li>}</ul>
        </div>
      </section>
      <KindRisk d={d} kind="shares" id="mi-eq-risk" n={3} extra={risky.length > 0 && <>
        <p className="mi-cap">The 5 largest parts of the shares' market risk</p>
        <ul className="mi-pills">{risky.map((x) => <li key={x.symbol}>{x.symbol} · Beta {betaTxt(x.beta)} · {pctOf(x.of, 1)} of everything</li>)}</ul>
        <p className="mi-small"><Link to="/holdings?view=risk">Open Risk analytics on the Equity portfolio →</Link></p></>} />
      <section className="card mi-step">
        <SecHead id="mi-eq-also" n={4} title="Also inside your funds and ETFs" line="Shares you hold directly that a fund or ETF holds too: your real part of each, all ways added." info={["Each share you hold directly that also sits inside one of your funds or ETFs.", "All together adds the direct part and what comes through funds and ETFs."]} />
        {also.length ? <HScroll label="Also inside your funds and ETFs"><table className="mi-tb">
          <thead><tr><th scope="col">Share</th><th scope="col" className="r">Direct</th><th scope="col" className="r">Through funds</th><th scope="col" className="r">Through ETFs</th><th scope="col" className="r">All together</th><th scope="col">Held by</th></tr></thead>
          <tbody>{also.map((x) => <tr key={x.symbol}><th scope="row"><b title={coTitle(x)}>{titleOf(x)}</b><small>{subLine(x, x.name)}</small></th><td className="r">{pctOf(x.of, 2)}</td><td className="r">{x.alsoIn!.funds ? pctOf(x.alsoIn!.funds, 2) : "—"}</td><td className="r">{x.alsoIn!.etfs ? pctOf(x.alsoIn!.etfs, 2) : "—"}</td>
            <td className="r"><b>{pctOf(x.alsoIn!.all, 2)}</b>{x.of > 0 ? <small> ({nf(x.alsoIn!.all / x.of, 2)}× direct)</small> : null}</td><td><span className="mi-chips">{x.alsoIn!.via.map((v) => <i key={v}>{v}</i>)}</span></td></tr>)}</tbody></table></HScroll>
          : <p className="mi-small">None of your shares sits inside your funds or ETFs.</p>}
      </section>
      <GoLink to="/holdings" title="Open the full Equity portfolio" line="Scores, peers, diversification and risk analytics of each share" />
    </>
  );
}

// ------------------------------------------------------------------------------------------------ Mutual funds
export function MfTab({ d }: { d: AllInvestments }) {
  const f = d.funds, card = d.cards.funds;
  const types = Object.entries(f.reduce<Record<string, string[]>>((a, x) => { if (x.type) (a[x.type] ??= []).push(x.short); return a; }, {})).filter(([, v]) => v.length > 1);
  const notes: Note[] = [
    card.overlap ? { kind: "insight", title: `${card.overlap.a} and ${card.overlap.b} overlap ${pctOf(card.overlap.pct, 0)}`, text: <>{card.overlap.n} companies sit in both; the overlap is the part of each fund's money in the same companies.</> } : { kind: "good", title: "No two funds hold the same companies", text: "Or there is only one fund with a loaded file." },
    d.plan === "gold" && f.some((x) => x.score != null) ? { kind: "insight", title: `Lowest Mutual Fund Score: ${[...f].filter((x) => x.score != null).sort((a, b) => a.score! - b.score!)[0].short}`, text: "Mutual Fund Score reads performance, risk, cost and quality against the fund's own category." } : { kind: "insight", title: "Mutual Fund Score is part of Gold", text: <>It reads each fund's performance, risk, cost and quality. <Link to="/plans">Compare plans</Link></> },
    { kind: types.length ? "watch" : "good", title: types.length ? `${types.length} ${types.length === 1 ? "type is" : "types are"} held twice` : "No fund type is held twice", text: types.length ? joinWords(types.map(([t, v]) => `${t}: ${joinWords(v)}`)) + "." : "Each fund is of a different type." },
  ];
  return (
    <>
      <section className="card mi-step">
        <SecHead id="mi-mf-list" n={1} title="Your funds" line={`${f.length} funds from your MF portfolio.`} info={["Each fund on your MF portfolio with its type, Mutual Fund Score, 1-year change, cost and beta.", "Mutual Fund Score carries the fund's own band word; beta is against the Nifty 500."]} />
        <HScroll label="Your funds" className="mi-freeze"><table className="mi-tb">
          <thead><tr><th scope="col">Fund</th><th scope="col">Type</th><th scope="col">Mutual Fund Score</th><th scope="col" className="r">1 year</th><th scope="col" className="r">Cost a year</th><th scope="col" className="r">Beta vs Nifty 500</th>{d.byValue && <th scope="col" className="r">Value</th>}<th scope="col" className="r">Of everything</th></tr></thead>
          <tbody>{f.map((x) => { const tw = types.find(([t]) => t === x.type); return <tr key={x.code}><th scope="row"><Link to={`/funds/${x.code}`}><b>{x.short}</b></Link>{tw && <span className="mi-tag">{x.type} ×{tw[1].length}</span>}</th><td>{x.type ?? "—"}</td>
            <td>{d.plan === "gold" ? <ScoreWord v={x.score} label={x.label} why={x.scoreWhy} /> : <span className="mi-muted">Gold</span>}</td><td className={"r " + tone(x.chg1y)}>{chg(x.chg1y)}</td><td className="r">{x.ter != null ? pctOf(x.ter, 2) : "—"}</td><td className="r">{betaTxt(x.beta)}</td>
            {d.byValue && <td className="r">{x.value != null ? rupees(x.value) : "—"}</td>}<td className="r">{pctOf(x.of, 2)}</td></tr>; })}</tbody></table></HScroll>
        <Notes scope="mf" items={notes} />
      </section>
      {/* task #277 (change 9): Key figures after Step 1 */}
      <KeyFiguresSection d={d} view="mf" go={go} />
      <Inside d={d} kind="funds" id="mi-mf-inside" title="What is inside your funds" />
      <KindRisk d={d} kind="funds" id="mi-mf-risk" n={3} />
      <GoLink to="/mf-portfolio" title="Open the full MF portfolio" line="Gains, Mutual Fund Score parts, mix, overlap and risk of each fund" />
    </>
  );
}

/** What sits inside a kind: one split bar per fund or ETF (marked when its file is not loaded), and the stocks inside. */
function Inside({ d, kind, id, title }: { d: AllInvestments; kind: "funds" | "etfs"; id: string; title: string }) {
  const each = d.madeOf.each.filter((x) => x.kind === kind);
  const inside = d.companies.filter((c) => (kind === "funds" ? c.funds : c.etfs) > 0);
  const shared = inside.filter((c) => c.via.filter((v) => (kind === "funds" ? d.funds.some((f) => f.short === v) : d.etfs.some((e) => e.symbol === v))).length > 1);
  return (
    <section className="card mi-step">
      <SecHead id={id} n={2} title={title} line="Each one's latest monthly file: where its money sits." info={["How each one's money splits: Indian shares, shares abroad, gold and silver, debt and cash.", "A grey bar means its file is not loaded yet."]} />
      <ul className="mi-each">{each.map((x) => <li key={x.name}><span className="mi-each-n"><b>{x.name}</b><small>{x.how === "file" ? `file of ${x.asOf ?? "—"}` : x.how === "type" ? "by its type" : "file not loaded yet"}</small></span>
        <Stack label={x.name} keyed={false} segs={d.madeOf.rows.map((r) => ({ key: r.key, label: r.label, v: x.mix[r.key] ?? 0, cls: MIX_CLS[r.key] }))} /></li>)}</ul>
      <ul className="mi-key">{d.madeOf.rows.map((r) => <li key={r.key}><i className={MIX_CLS[r.key]} aria-hidden="true" />{r.label}</li>)}</ul>
      <div className="mi-three">
        <article className="mi-hc"><p className="mi-cap">Stocks inside</p><p className="mi-hv"><b>{inside.length}</b></p><p className="mi-small">{shared.length} held by two or more of your {kind === "funds" ? "funds" : "ETFs"}.</p></article>
        {kind === "funds" ? <article className="mi-hc"><p className="mi-cap">Most overlapping pair</p><p className="mi-hv"><b>{d.cards.funds.overlap ? pctOf(d.cards.funds.overlap.pct, 0) : "—"}</b></p><p className="mi-small">{d.cards.funds.overlap ? `${d.cards.funds.overlap.a} and ${d.cards.funds.overlap.b}` : "Needs two funds with files."}</p></article>
          : <article className="mi-hc"><p className="mi-cap">Same index twice</p><p className="mi-hv"><b>{d.cards.etfs.repeats?.length ?? 0}</b></p><p className="mi-small">{d.cards.etfs.repeats?.length ? joinWords(d.cards.etfs.repeats.map((r) => `${r.label}: ${r.symbols.join(", ")}`)) : "Each ETF follows a different index."}</p></article>}
        <article className="mi-hc"><p className="mi-cap">Largest inside</p><p className="mi-small">{inside.slice(0, 3).map((c) => `${c.symbol ?? c.name} ${pctOf(kind === "funds" ? c.funds : c.etfs, 2)}`).join(" · ") || "—"}</p></article>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------------------------ ETFs
export function EtfTab({ d }: { d: AllInvestments }) {
  const e = d.etfs, rep = d.cards.etfs.repeats ?? [];
  if (!e.length) return (
    <section className="card mi-step mi-empty-k" id="mi-etf-list"><h2>No ETFs yet</h2><p>Your ETF portfolio is empty, so the other tabs leave ETFs out. Add an ETF there and it is counted here after a refresh.</p><Link className="btn primary" to="/etf-portfolio">Add ETF</Link></section>);
  const far = [...e].filter((x) => x.premium != null).sort((a, b) => Math.abs(b.premium!) - Math.abs(a.premium!))[0];
  const h = d.health.etfs;
  const notes: Note[] = [
    { kind: rep.length ? "watch" : "good", title: rep.length ? `${rep.length} ${rep.length === 1 ? "index is" : "indices are"} followed twice` : "No index is followed twice", text: rep.length ? joinWords(rep.map((r) => `${r.label}: ${r.symbols.join(" and ")}`)) + "." : "Each ETF follows a different index or price." },
    far ? { kind: Math.abs(far.premium!) >= 1 ? "watch" : "good", title: `${far.symbol} trades ${chg(far.premium, 2)} against its value`, text: "Price against value compares the last price with the NAV of the same day; 1% or more is shown in red." } : { kind: "insight", title: "No price against value yet", text: "No NAV was published for the day of the last close." },
    { kind: "insight", title: h?.ter != null ? `Yearly cost ${pctOf(h.ter, 2)}` : "Yearly cost not published", text: h?.costPerLakh != null ? `About ₹${nf(h.costPerLakh, 0)} a year on ₹1 lakh, weighted across your ETFs.` : "The fund houses have not published a yearly cost for these ETFs in the files loaded." },
  ];
  return (
    <>
      <section className="card mi-step">
        <SecHead id="mi-etf-list" n={1} title="Your ETFs" line={`${e.length} ETFs from your ETF portfolio.`} info={["Each ETF on your ETF portfolio: what it tracks, its price, moves, cost and price against value.", "Price against value in red at 1% or more."]} />
        <HScroll label="Your ETFs" className="mi-freeze"><table className="mi-tb">
          <thead><tr><th scope="col">ETF</th><th scope="col">Tracks</th><th scope="col" className="r">Price</th><th scope="col" className="r">1 day</th><th scope="col" className="r">1 year</th><th scope="col" className="r">Cost a year</th><th scope="col" className="r">Price vs value</th>{d.byValue && <th scope="col" className="r">Value</th>}<th scope="col" className="r">Of everything</th></tr></thead>
          <tbody>{e.map((x) => <tr key={x.symbol}><th scope="row"><Link to={`/etfs/${encodeURIComponent(x.symbol)}`}><b>{x.symbol}</b></Link><small>{x.name}</small></th><td>{x.tracks ?? x.categoryLabel ?? "—"}{x.twice && <span className="mi-tag">Twice</span>}</td>
            <td className="r">{x.price != null ? "₹" + nf(x.price, 2) : "—"}</td><td className={"r " + tone(x.chg1d)}>{chg(x.chg1d, 2)}</td><td className={"r " + tone(x.chg1y)}>{chg(x.chg1y)}</td><td className="r">{x.ter != null ? pctOf(x.ter, 2) : "—"}</td>
            <td className={"r" + (x.premium != null && Math.abs(x.premium) >= 1 ? " mi-down" : "")}>{chg(x.premium, 2)}</td>{d.byValue && <td className="r">{x.value != null ? rupees(x.value) : "—"}</td>}<td className="r">{pctOf(x.of, 2)}</td></tr>)}</tbody></table></HScroll>
        <Notes scope="etf" items={notes} />
      </section>
      {/* task #277 (change 9): Key figures after Step 1 */}
      <KeyFiguresSection d={d} view="etf" go={go} />
      <Inside d={d} kind="etfs" id="mi-etf-inside" title="What is inside your ETFs" />
      <KindRisk d={d} kind="etfs" id="mi-etf-risk" n={3} />
      <GoLink to="/etf-portfolio" title="Open the full ETF portfolio" line="Trading against value, tracking, overlap, company sizes and risk of each ETF" />
    </>
  );
}
