// Blocks 3 and 4: Market snapshot (breadth, and gainers / decliners for Nifty 50, Nifty 500 or all stocks) and Sectors today (top 5 and bottom 5 by
// cap-weighted move, the middle behind "Show N more", and the Sector Pulse counts under them).
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { titleOf } from "../../lib/companyLabel";
import { MINUS, dateIN, nf } from "../../lib/format";
import { gainers, losers, sectorBoard, useMembers, weightedMove, MAX_MOVE } from "../../lib/markets";
import { scopeStocks, type Scope } from "../../lib/dashboard";
import type { Row } from "../../lib/screener";
import { useSectorBoard, type Board } from "../../lib/sectors";
import { Card, Rows, Seg, tone, useIsPhone } from "./parts";
import { CoLogo } from "../CoLogo";

const sgn = (v: number | null | undefined, d = 2) => (v == null ? MINUS : (v > 0 ? "+" : v < 0 ? MINUS : "") + nf(Math.abs(v), d) + "%");
const SCOPES = [["n50", "Nifty 50"], ["n500", "Nifty 500"], ["all", "All stocks"]] as const;
const SCOPE_WORD: Record<Scope, string> = { n50: "Nifty 50", n500: "Nifty 500", all: "All stocks" };

export function Snapshot({ rows, loading }: { rows: Row[]; loading: boolean }) {
  const [scope, setScope] = useState<Scope>("n50");
  const phone = useIsPhone(), take = phone ? 4 : 5;
  const members = useMembers().data?.indices;
  const m = useMemo(() => {
    const live = rows.filter((r) => r.change_pct != null && (r.price ?? 0) > 0);          // suspended or delisted companies carry no price and a −100% "change"
    const adv = live.filter((r) => (r.change_pct as number) > 0).length, dec = live.filter((r) => (r.change_pct as number) < 0).length;
    const big = live.filter((r) => (r.market_cap ?? 0) >= 100 && Math.abs(r.change_pct as number) <= MAX_MOVE);
    return { n: live.length, adv, dec, flat: live.length - adv - dec, all: weightedMove(big) };
  }, [rows]);
  const pick = useMemo(() => scopeStocks(scope, rows, members), [scope, rows, members]);
  const up = gainers(pick.stocks, take), down = losers(pick.stocks, take);
  const col = (title: string, list: Row[], cls: string) => (
    <div><div className="dsh-lh">{SCOPE_WORD[scope]} {title}</div>
      {list.length ? list.map((r) => <Link key={r.symbol} to={`/stocks/${r.symbol}`} className="dsh-mv"><b><CoLogo symbol={r.symbol} name={r.name} size={20} inline />{titleOf(r)}</b><span className={cls}>{sgn(r.change_pct)}</span></Link>) : <p className="dsh-note">{pick.note ?? `No ${title} in this group today.`}</p>}</div>
  );
  return (
    <Card id="snapshot" title="Market snapshot" sub={m.n ? <>{m.n.toLocaleString("en-IN")} companies{m.all != null ? <> · cap-weighted move <b className={tone(m.all)}>{sgn(m.all)}</b></> : null}</> : undefined}>
      {loading || !m.n ? <Rows n={4} h={34} /> : <>
        <div className="dsh-lh first">Breadth</div>
        <div className="dsh-breadth" role="img" aria-label={`${m.adv} rising, ${m.dec} falling, ${m.flat} unchanged`}><i className="up" style={{ flex: m.adv || 0.01 }} /><i style={{ flex: Math.max(m.flat, 0.01) }} /><i className="down" style={{ flex: m.dec || 0.01 }} /></div>
        <div className="dsh-bk"><span className="up">▲ {m.adv.toLocaleString("en-IN")} rising</span><span>{m.flat.toLocaleString("en-IN")} <span className="long">unchanged</span><span className="short">flat</span></span><span className="down">▼ {m.dec.toLocaleString("en-IN")} <span className="long">falling</span></span></div>
        <div className="dsh-scope"><Seg label="Stocks to rank" value={scope} options={SCOPES} onChange={setScope} /></div>
        <div className="dsh-two">{col("gainers", up, "up")}{col("decliners", down, "down")}</div>
        {pick.note && (up.length || down.length) ? <p className="dsh-foot">{pick.note}</p> : null}
      </>}
    </Card>
  );
}

/** The Sector Pulse counts for the line under "Sectors today": null while loading, on an error or with no reading; `locked` when the plan does not include it. */
export function pulseLine(b: Board | undefined): { locked: true } | { locked: false; date: string; thrust: number; confirmed: number; fading: number; washout: number } | null {
  if (!b || !b.counts) return null;
  if (b.locked && Object.keys(b.locked).length) return { locked: true };
  const c = b.counts as Record<string, number>;
  return { locked: false, date: b.date, thrust: (c["Thrust C"] || 0) + (c["Thrust CAP"] || 0), confirmed: c.Confirmed || 0, fading: c.Fading || 0, washout: c.Washout || 0 };
}

const EDGE = 5;
export function Sectors({ rows, loading }: { rows: Row[]; loading: boolean }) {
  const [open, setOpen] = useState(false);
  const board = useMemo(() => [...sectorBoard(rows)].sort((a, b) => b.move - a.move), [rows]);
  const pulse = pulseLine(useSectorBoard().data);
  const max = Math.max(0.01, ...board.map((s) => Math.abs(s.move)));
  const middle = Math.max(0, board.length - EDGE * 2);
  const top = open || !middle ? board : board.slice(0, EDGE), bottom = open || !middle ? [] : board.slice(board.length - EDGE);
  const row = (s: (typeof board)[number]) => (
    <div key={s.sector} className="dsh-sec-r" title={`${s.n} companies`}><span className="nm">{s.sector}</span>
      <span className="bar" aria-hidden="true"><span className="neg">{s.move < 0 && <i style={{ width: `${(Math.abs(s.move) / max) * 100}%` }} />}</span><span className="pos">{s.move > 0 && <i style={{ width: `${(s.move / max) * 100}%` }} />}</span></span>
      <span className={"v " + tone(s.move)}>{Math.abs(s.move) < 0.005 ? "0.00%" : sgn(s.move)}</span></div>
  );
  return (
    <Card id="sectors" title="Sectors today" sub={middle ? `Top ${EDGE} and bottom ${EDGE} by cap-weighted move · companies above ₹100 crore` : "Cap-weighted move, ranked · companies above ₹100 crore"}>
      {loading || !board.length ? <Rows n={8} h={26} /> : <>
        <div className="dsh-sec" id="dsh-sec-list">
          {top.map(row)}
          {middle > 0 && <button type="button" className="dsh-sec-more" aria-expanded={open} aria-controls="dsh-sec-list" onClick={() => setOpen(!open)}>{open ? "Show fewer sectors" : `Show ${middle} more sector${middle === 1 ? "" : "s"}`}</button>}
          {bottom.map(row)}
        </div>
        {pulse && (pulse.locked
          ? <p className="dsh-callout dsh-pulse"><b>Sector Pulse</b> shows which NSE industries are sold off, bouncing back or losing steam. <Link to="/plans">See plans →</Link></p>
          : <p className="dsh-callout dsh-pulse"><b>Sector Pulse, {dateIN(pulse.date, { day: "numeric", month: "short" })}:</b> {pulse.thrust} {pulse.thrust === 1 ? "industry" : "industries"} bouncing back · {pulse.confirmed} rising together · {pulse.fading} losing steam · {pulse.washout} sold off. <Link to="/sectors">Open Sector Pulse →</Link></p>)}
      </>}
    </Card>
  );
}
