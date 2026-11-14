// The MF portfolio as the final pages pack draws it (board 15): the five tiles, the three views, Your funds with its risk figures, and the largest
// stocks underneath. Figures are the server's (/api/me/mf-portfolio, /diversification, /risk) and each stock's peer reading; words from lib/mfPack.
// Describes; never advice. Information only, not investment advice.
import { Link } from "react-router";
import { CoLogo } from "../../components/CoLogo";
import { Cards, Scroll, Section, Tip } from "../../components/sectors/pack/Common";
import { dateIN } from "../../lib/format";
import { fundCards, fundTag, shortFund, underCards, type MfRisk, type Tile, type Under } from "../../lib/mfPack";
import type { Holding, MfSpread } from "../../lib/mfPortfolio";

/** "Parag Parikh Flexi Cap Fund - Direct Plan - Growth" -> "Parag Parikh Flexi Cap Fund"; a fund named in capitals reads in normal case. */
const fundName = (n: string | null) => { const s = shortFund(n); return s ? (/\b(fund|scheme)$/i.test((n || "").split(" - ")[0].replace(/\s*\([^)]*\)/g, "").trim()) ? `${s} Fund` : s) : ""; };
/** "HDFC Bank Limited" -> "HDFC Bank", as the pack writes company names. */
const coName = (n: string) => n.replace(/\s+(limited|ltd\.?)$/i, "");
const pc = (x: number | null | undefined, dp = 1) => (x == null ? "–" : `${x < 0 ? "−" : ""}${Math.abs(x).toFixed(dp)}%`);
const TONE: Record<Tile["tone"], string> = { info: "mfp-info", good: "mfp-good", watch: "mfp-watch", warn: "mfp-bad", mute: "mfp-mute" };

export function MfTiles({ tiles, onGo }: { tiles: Tile[]; onGo: (to: Tile["to"]) => void }) {
  return (
    <section className="mfp-tiles" aria-label="Your funds at a glance">
      {tiles.map((t) => <div key={t.k} className={"mfp-tile " + TONE[t.tone]}>
        <p className="mfp-tile-k">{t.k}{t.help && <Tip text={t.help} label={`About “${t.k}”`} />}</p>
        <p className="mfp-tile-v">{t.v}</p><p className="mfp-tile-x">{t.sub}</p>
        <button type="button" className="mfp-tile-go" onClick={() => onGo(t.to)}>{t.link} →</button></div>)}
    </section>
  );
}

export type MfView = "funds" | "mix" | "risk";
export function MfTabs({ view, onView }: { view: MfView; onView: (v: MfView) => void }) {
  const tabs: [MfView, string, string][] = [["funds", "Your funds", "Health, risk and the biggest stocks underneath"], ["mix", "Mix & overlap", "How alike your funds are, and what they have in common"], ["risk", "Risk analytics", "How much the funds swing together"]];
  return <div className="mfp-tabs" role="tablist" aria-label="MF portfolio views">{tabs.map(([k, t, s]) => <button key={k} type="button" role="tab" id={`mfp-tab-${k}`} aria-selected={view === k} aria-controls="mfp-panel" onClick={() => onView(k)}><b>{t}</b><small>{s}</small></button>)}</div>;
}

/** "AVERAGE" -> "Average": the stored Prism labels are in capitals; the pack writes them in normal case. */
export const wordCase = (w: string | null | undefined) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : "");
const HEALTH_TONE = (w: string | null) => (/strong|healthy/i.test(w || "") ? "sp-good" : /average/i.test(w || "") ? "mfp-amber" : /weak|poor/i.test(w || "") ? "sp-red" : "");

/** Your funds: three cards, then each fund's category, Health Score and risk figures (or, on the second view, its NAV, returns and costs). */
export function FundsSection({ hs, rk, rkErr, sp, locked, onUnlock, cols, onCols, extra, actions, tools }: {
  hs: Holding[]; rk: MfRisk | undefined; rkErr: string | null; sp: MfSpread | undefined; locked: boolean; onUnlock: () => void; cols: "risk" | "returns"; onCols: (c: "risk" | "returns") => void;
  extra: (h: Holding) => React.ReactNode; actions: (h: Holding) => React.ReactNode; tools: React.ReactNode;
}) {
  const by = new Map((rk?.funds ?? []).map((f) => [f.code, f]));
  return (
    <Section id="mfp-funds" title="Your funds" sub={rk?.bench ? `Risk figures from each fund's daily NAV over 3 years, to ${dateIN(rk.bench.to)}. The market is the Nifty 500.` : "Risk figures from each fund's daily NAV over 3 years."}
      right={<div className="mfp-tools"><div className="sp-view" role="group" aria-label="Columns"><button type="button" className={"sp-vbtn" + (cols === "risk" ? " on" : "")} aria-pressed={cols === "risk"} onClick={() => onCols("risk")}>Risk</button><button type="button" className={"sp-vbtn" + (cols === "returns" ? " on" : "")} aria-pressed={cols === "returns"} onClick={() => onCols("returns")}>Returns &amp; costs</button></div>{tools}</div>}>
      <Cards items={fundCards(rk, hs, locked, sp)} />
      {rkErr && <p className="sp-note" role="status">{rkErr}</p>}
      <Scroll label="your funds"><table className="sp-tb mfp-ft">
        <thead><tr><th scope="col">Fund</th><th scope="col">Category<Tip text="The fund's SEBI category, as the fund house files it." /></th><th scope="col">Health<Tip text="The FinLit Mutual Fund Health Score, 0 to 100, from the fund's performance, risk, cost and quality. Part of the Gold plan." /></th>
          {cols === "risk" ? <>
            <th scope="col" className="r">Swing a year<Tip text="How much the fund's NAV rises and falls in a typical year: the spread of its daily changes over 3 years, scaled to a year." /></th>
            <th scope="col" className="r">Worst fall<Tip text="The deepest drop of the NAV from a high to a later low over the 3 years." /></th>
            <th scope="col" className="r">Beta<Tip text="How much the fund has tended to move when the Nifty 500 moved 1%, from daily changes over 3 years. 1 means in step." /></th>
            <th scope="col" className="r">Falls taken<Tip text="Of the Nifty 500's falls, the share the fund took: its average change on the days the index fell, against the index's. Below 100% means it fell less." /></th>
          </> : <><th scope="col" className="r">Latest NAV</th><th scope="col" className="r">1Y</th><th scope="col" className="r">3Y</th><th scope="col" className="r">5Y</th><th scope="col" className="r">Expense ratio</th><th scope="col" className="r">Fund size</th></>}
          <th scope="col"><span className="sr-only">Remove</span></th></tr></thead>
        <tbody>{hs.map((h) => { const f = by.get(h.code), s = h.score; return (
          <tr key={h.id}>
            <th scope="row"><Link to={`/funds/${h.code}`} className="mfp-fund">{fundName(h.name) || `Scheme ${h.code}`}</Link>{h.folio && <small className="mfp-sub">folio {h.folio}</small>}</th>
            <td>{h.categoryLabel || "–"}</td>
            <td>{locked ? <button type="button" className="mfp-lock" onClick={onUnlock}>Gold plan</button> : s.final == null ? <span className="sp-note" title={s.reason || undefined}>{s.status === "NOT RATED" ? "Not rated" : "No score"}</span> : <span className="mfp-h"><b>{Math.round(s.final)}</b> <span className={HEALTH_TONE(s.label)}>{s.label}</span></span>}</td>
            {cols === "risk" ? (f && f.swing != null ? <>
              <td className="r">{pc(f.swing)}</td><td className="r sp-red">{pc(f.worstFall)}</td><td className="r">{f.beta == null ? "–" : f.beta.toFixed(2)}</td><td className="r">{f.fallsTaken == null ? "–" : `${f.fallsTaken}%`}</td>
            </> : <td colSpan={4} className="sp-note">{f?.why ?? (rk ? "No risk figures for this fund." : "Working out the risk figures…")}</td>) : extra(h)}
            <td className="mfp-act">{actions(h)}</td>
          </tr>); })}</tbody>
      </table></Scroll>
      {rk && rk.funds.some((f) => f.why && f.swing != null) && <p className="sp-note">{rk.funds.filter((f) => f.why && f.swing != null).map((f) => `${f.short}: ${f.why}`).join(" ")}</p>}
    </Section>
  );
}

const PEER: Record<string, string> = { leader: "Leader", in_line: "In line", laggard: "Laggard" };
const trCls = (w: string | null | undefined) => (!w ? "na" : /strong uptrend/i.test(w) ? "t4" : /uptrend/i.test(w) ? "t3" : /strong downtrend/i.test(w) ? "t0" : /downtrend/i.test(w) ? "t1" : "t2");

/** Largest stocks underneath: the ten biggest stocks across the funds, with how each did against its peers and which funds hold it. */
export function UnderSection({ under, sp, n }: { under: Under[]; sp: MfSpread; n: number }) {
  const fund = new Map(sp.funds.map((f) => [f.code, f])), gold = !sp.trendLocked, pr = new Map(sp.topStocks.map((s) => [s.name, s.prism]));
  return (
    <Section id="mfp-under" title="Largest stocks underneath" sub={`The ${under.length} biggest stocks across your ${n} ${n === 1 ? "fund" : "funds"}, with how each did against its peers.`}>
      <Cards items={underCards(under)} />
      <Scroll label="largest stocks underneath"><table className="sp-tb mfp-ut">
        <thead><tr><th scope="col">Stock</th><th scope="col">Size<Tip text="FinLit's three sizes, by market value: Large above ₹50,000 Cr, Mid ₹10,000 to 50,000 Cr, Small below ₹10,000 Cr." /></th>
          <th scope="col" className="r">Of your funds<Tip text="The share of your fund money that sits in this stock, through all your funds together, from the fund houses' latest monthly holdings." /></th>
          {gold && <><th scope="col">Prism<Tip text="The stock's FinLit Prism score, 0 to 100, with its word." /></th><th scope="col">Short term</th><th scope="col">Long term</th></>}
          <th scope="col">Against peers<Tip text="How the stock did against similar companies over the last 12 months: Leader, In line or Laggard, with its place in the group." /></th><th scope="col">Held by</th></tr></thead>
        <tbody>{under.map((u) => { const p = pr.get(u.name); return (
          <tr key={u.name}>
            <th scope="row">{u.symbol ? <Link to={`/stocks/${u.symbol}`} className="ip-sym"><CoLogo symbol={u.symbol} name={u.name} size={22} inline /><span><b>{coName(u.name)}</b><small>{u.industry ?? "–"}</small></span></Link> : <span className="ip-sym"><span><b>{coName(u.name)}</b><small>{u.industry ?? "–"}</small></span></span>}</th>
            <td>{u.size ?? "–"}</td><td className="r">{pc(u.w * 100)}</td>
            {gold && <><td>{p?.score != null ? <span className="mfp-h"><b>{Math.round(p.score)}</b> <span className={HEALTH_TONE(p.label)}>{wordCase(p.label)}</span></span> : <span className="sp-note">Not rated</span>}</td>
              <td><span className={"x-tr " + trCls(p?.st)}>{p?.st || "Not rated"}</span></td><td><span className={"x-tr " + trCls(p?.lt)}>{p?.lt || "Not rated"}</span></td></>}
            <td>{u.peer ? <><span className={"mfp-peer " + u.peer.label}>{PEER[u.peer.label]}</span><small className="mfp-sub">{u.peer.rank} of {u.peer.of} {u.peer.group}</small>
              {u.peer.raw && u.peer.raw !== u.peer.label && <small className="mfp-next">may become {PEER[u.peer.raw] ?? u.peer.raw} next week</small>}</> : <small className="sp-note">{u.notCompared ? `Not compared: ${u.notCompared}` : "Not compared"}</small>}</td>
            <td><span className="mfp-held">{u.funds.map((c) => { const f = fund.get(c); return <abbr key={c} title={f?.name}>{fundTag(f?.name ?? null, f?.amc ?? null, f?.category ?? null)}</abbr>; })}</span></td>
          </tr>); })}</tbody>
      </table></Scroll>
      {!gold && <p className="sp-note">Each stock's Prism score and its short- and long-term trend are part of the Gold plan. <Link to="/plans">See plans</Link>.</p>}
    </Section>
  );
}

/** Risk analytics: the whole list against the Nifty 500, from the funds' daily NAVs. */
export function ListRisk({ rk }: { rk: MfRisk }) {
  const l = rk.list, b = rk.bench, lv = l.level;
  return (
    <Section id="mfp-risk" title="Your funds against the Nifty 500" help="The whole list as one line, from each fund's daily NAV over 3 years, set against the Nifty 500 over the same days."
      sub={`${rk.basis === "value" ? "Funds weighted by the value of your units" : "Each fund counts the same until units are added for every fund"} · daily NAVs, ${dateIN(b.from)} to ${dateIN(b.to)}`}>
      {l.why && <p className="sp-note">{l.why}</p>}
      {lv && <p className="sp-lead"><b>Risk level: {lv.word.toLowerCase()}</b> {lv.word === "About the same" ? "as" : "than"} {lv.vs}{lv.because ? `, ${lv.because}` : ""}.</p>}
      <div className="mfp-rtiles">
        <div className="ip-tile"><p className="sp-cap">Swing a year<Tip text="How much the list rises and falls in a typical year, from its daily changes over 3 years." /></p><b>{pc(l.swing)}</b><small>Nifty 500: {pc(b.swing)}</small></div>
        <div className="ip-tile"><p className="sp-cap">Worst fall<Tip text="The deepest drop of the list from a high to a later low over the 3 years." /></p><b className="sp-red">{pc(l.worstFall)}</b><small>Nifty 500: {pc(b.worstFall)}</small></div>
      </div>
    </Section>
  );
}
