// "The market on <day>: what it adds up to" as the final pages pack draws it (04): one sentence, then tabs. The market read: six readings (today's breadth, big moves,
// which sizes lead, the short and the bigger trend across the counted stocks, the industries), each saying which stocks it is based on, and what they add up to.
// Breadth, sizes and movers: the same day by company size, with the biggest moves. Figures from the screener table, the index feed and the Sector Pulse board.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { capBucket } from "../../lib/capBuckets";
import { pickIndices } from "../../lib/dashboard";
import { dayWord, marketRead, type Reading } from "../../lib/dashPack";
import { useIndices } from "../../lib/indices";
import { useLevels } from "../../lib/markets";
import { useSectorBoard } from "../../lib/sectors";
import type { Row } from "../../lib/screener";
import { MINUS, nf } from "../../lib/format";
import { Card, Rows, tone } from "./parts";

const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sgn = (v: number | null, d = 1) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? MINUS : ""}${nf(Math.abs(v), d)}%`);
type Tab = "read" | "breadth";
const SIZES = ["Large", "Mid", "Small"] as const;

export function MarketRead({ rows, loading }: { rows: Row[]; loading: boolean }) {
  const [tab, setTab] = useState<Tab>("read");
  const idx = useIndices(), board = useSectorBoard().data;
  const cards = useMemo(() => pickIndices(idx.data?.items ?? []), [idx.data]);
  const day = dayWord(new Date(), idx.data?.asOf ?? null);
  const data = useMemo(() => {
    const live = rows.filter((r) => r.change_pct != null && (r.price ?? 0) > 0);
    const adv = live.filter((r) => (r.change_pct as number) > 0).length, dec = live.filter((r) => (r.change_pct as number) < 0).length;
    const moves = live.filter((r) => Math.abs(r.change_pct as number) <= 40);   // a move past 40% in a day is a corporate action or a bad print, not a market move
    const big = { up: moves.filter((r) => (r.change_pct as number) >= 4).length, down: moves.filter((r) => (r.change_pct as number) <= -4).length, n: moves.length };
    const by = (k: (typeof SIZES)[number]) => rows.filter((r) => capBucket(r.market_cap)?.label.startsWith(k));
    const m1 = (xs: Row[]) => median(xs.map((r) => r.return_1m).filter((v): v is number => v != null && Math.abs(v) <= 200));
    const sized = rows.filter((r) => capBucket(r.market_cap) && r.return_1m != null);
    const sizes = SIZES.map((k) => { const xs = by(k), lv = xs.filter((r) => r.change_pct != null && (r.price ?? 0) > 0);
      return { k, n: xs.length, up: lv.filter((r) => (r.change_pct as number) > 0).length, down: lv.filter((r) => (r.change_pct as number) < 0).length, day: median(lv.map((r) => r.change_pct as number)), month: m1(xs) }; });
    return { adv, dec, total: live.length, big, sizes, size: { large: sizes[0].month, small: sizes[2].month, n: sized.length }, moves };
  }, [rows]);
  const niftyChg = useNiftyDay(cards[0]?.row?.changePct ?? null);
  const read = useMemo(() => marketRead({ day, adv: data.adv, dec: data.dec, total: data.total, niftyChg, midChg: cards[3]?.row?.changePct ?? null, smallChg: cards[4]?.row?.changePct ?? null, big: data.big, size: data.size, board }), [data, cards, board, day]);
  const title = `The market ${day === "Today" ? "today" : `on ${day}`}: what it adds up to`;
  const tabs: [Tab, string, string][] = [["read", "The market read", "Six readings: good signs, mixed and warnings"], ["breadth", "Breadth, sizes and movers", "How many stocks rose, and which sizes led"]];
  const tops = useMemo(() => { const m = data.moves.filter((r) => (r.market_cap ?? 0) >= 1000); return { up: [...m].sort((a, b) => (b.change_pct as number) - (a.change_pct as number)).slice(0, 5), down: [...m].sort((a, b) => (a.change_pct as number) - (b.change_pct as number)).slice(0, 5) }; }, [data.moves]);
  return (
    <Card id="marketread" title={title} sub="Each reading says which stocks it is based on." className="dsh-mr">
      {loading || !data.total ? <Rows n={4} h={60} /> : <>
        <p className="dsh-mr-lead"><b>{read.lead}</b>{read.rest}</p>
        {read.tail && <p className="dsh-note">{read.tail}</p>}
        <div className="dsh-mr-tabs" role="tablist" aria-label="Ways to read the market">{tabs.map(([k, t, s]) => <button key={k} type="button" role="tab" id={`dsh-mr-${k}`} aria-selected={tab === k} aria-controls="dsh-mr-panel" onClick={() => setTab(k)}><b>{t}</b><small>{s}</small></button>)}</div>
        <div id="dsh-mr-panel" role="tabpanel" aria-labelledby={`dsh-mr-${tab}`}>
          {tab === "read" ? <>
            <div className="dsh-mr-grid">{read.readings.map((r) => <ReadingCard key={r.k} r={r} />)}</div>
            <div className="dsh-mr-sum"><b>What it adds up to</b><span className="good">{read.sum.good} good {read.sum.good === 1 ? "sign" : "signs"}</span><span className="mixed">{read.sum.mixed} mixed</span><span className="warning">{read.sum.warning} {read.sum.warning === 1 ? "warning" : "warnings"}</span><p>{read.sum.text}</p></div>
          </> : <>
            <div className="dsh-breadth" role="img" aria-label={`${data.adv} rising, ${data.dec} falling, ${data.total - data.adv - data.dec} unchanged`}><i className="up" style={{ flex: data.adv || 0.01 }} /><i style={{ flex: Math.max(data.total - data.adv - data.dec, 0.01) }} /><i className="down" style={{ flex: data.dec || 0.01 }} /></div>
            <div className="dsh-bk"><span className="up">▲ {data.adv.toLocaleString("en-IN")} rising</span><span>{(data.total - data.adv - data.dec).toLocaleString("en-IN")} unchanged</span><span className="down">▼ {data.dec.toLocaleString("en-IN")} falling</span></div>
            <table className="dsh-mr-t"><caption>By company size</caption>
              <thead><tr><th scope="col">Size</th><th scope="col" className="r">Companies</th><th scope="col" className="r">Rose</th><th scope="col" className="r">Fell</th><th scope="col" className="r">Typical move {day === "Today" ? "today" : day}</th><th scope="col" className="r">Typical move, 1 month</th></tr></thead>
              <tbody>{data.sizes.map((s) => <tr key={s.k}><th scope="row">{s.k}</th><td className="r">{s.n.toLocaleString("en-IN")}</td><td className="r up">{s.up.toLocaleString("en-IN")}</td><td className="r down">{s.down.toLocaleString("en-IN")}</td><td className={"r " + tone(s.day)}>{sgn(s.day, 2)}</td><td className={"r " + tone(s.month)}>{sgn(s.month)}</td></tr>)}</tbody></table>
            <p className="dsh-foot">Sizes by FinLit's rule: Large above ₹50,000 Cr, Mid ₹10,000–50,000 Cr, Small below ₹10,000 Cr. "Typical" is the middle company of each size.</p>
            <div className="dsh-two"><div><div className="dsh-lh">Up 4% or more: {data.big.up.toLocaleString("en-IN")}</div>{tops.up.map((r) => <Link key={r.symbol} to={`/stocks/${r.symbol}`} className="dsh-mv"><b>{r.symbol}</b><span className="up">{sgn(r.change_pct, 2)}</span></Link>)}</div>
              <div><div className="dsh-lh">Down 4% or more: {data.big.down.toLocaleString("en-IN")}</div>{tops.down.map((r) => <Link key={r.symbol} to={`/stocks/${r.symbol}`} className="dsh-mv"><b>{r.symbol}</b><span className="down">{sgn(r.change_pct, 2)}</span></Link>)}</div></div>
            <p className="dsh-foot">The biggest moves among companies above ₹1,000 Cr.</p>
          </>}
        </div>
      </>}
    </Card>
  );
}
/** The Nifty 50's move on the latest day: the index feed's figure, or (when the feed carries none) the change between its last two daily closes, as the chart above shows it. */
export function useNiftyDay(feed: number | null): number | null {
  const lv = useLevels("NIF50", 1, feed == null).data?.rows ?? [];
  if (feed != null) return feed;
  const n = lv.length;
  return n >= 2 && lv[n - 2].c ? (lv[n - 1].c / lv[n - 2].c - 1) * 100 : null;
}
function ReadingCard({ r }: { r: Reading }) {
  return (
    <div className={"dsh-rd " + r.tone}>
      <p className="dsh-rd-h"><span>{r.k}</span><em>{r.badge}</em></p>
      <b className="dsh-rd-v">{r.head}</b>
      <p className="dsh-rd-x">{r.text}</p>
      <p className="dsh-rd-b"><b>Based on</b> {r.base}</p>
    </div>
  );
}
