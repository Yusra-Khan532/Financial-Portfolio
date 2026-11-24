// Task #385 (developer file 33, Phone): on a phone the wide shares table becomes a list: code and name, quantity, value, gain or loss in ₹ and %, Prism
// tag, trend chip and today's move; tap a row for its details (Technical view, accounts, direction hints). Sort chips: Value, Today, Gain or loss, Prism.
// Above 22 shares, the first 20 and "Show all N shares". It shows the same rows as the table (after the filters and the search). Shown under 860px only
// (portfolio/pack/eq385.css). Classes: eqp-. Describes figures; never advice.
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { isReady, scoreOf, type Line, type Model } from "../../lib/portfolioOverview";
import { holdingFigs, type LotsProps } from "../HoldingCells";
import { PEER_WORD, type Share } from "../../lib/equityPack";
import { prismBandWord } from "../../lib/scoreBands";
import { titleOf } from "../../lib/companyLabel";
import { MINUS, Pct, RECORD_SALE, ShowAll, capRows, nameCase, pointsLine, rupees, rupeesSigned, signedNum, sortRows, trendReading, trendTone, type CapRule } from "../shared";

type Key = "value" | "today" | "gain" | "prism";
const CHIPS: [Key, string][] = [["value", "Value"], ["today", "Today"], ["gain", "Gain or loss"], ["prism", "Prism"]];

export function PhoneList({ lines, total, lots, peerOf, model, rule, onEdit, onSell, accounts }: { lines: Line[]; total: number; lots: LotsProps; peerOf?: (s: string) => Share | undefined; model: Model; rule: CapRule;
  onEdit: (s: string) => void; onSell: (s: string) => void; accounts: (s: string) => string | null }) {
  const [key, setKey] = useState<Key>("value"), [open, setOpen] = useState<string | null>(null), [all, setAll] = useState(false);
  const get = useMemo(() => ({
    value: (l: Line) => holdingFigs(lots, l.symbol).now, today: (l: Line) => (isReady(l.ov) ? l.ov.changePct : null),
    gain: (l: Line) => holdingFigs(lots, l.symbol).gainPct, prism: (l: Line) => scoreOf(l.ov, model).value,
  }), [lots, model]);
  const rows = useMemo(() => sortRows(lines, { kind: "num", get: get[key] }, -1), [lines, get, key]);
  const cap = capRows(rows, rule, all);
  const sum = lines.reduce((a, l) => a + (holdingFigs(lots, l.symbol).now ?? 0), 0);
  return (
    <div className="eqp">
      <div className="eqp-sort" role="group" aria-label="Sort the list"><span>Sort</span>{CHIPS.map(([k, l]) => <button key={k} type="button" aria-pressed={key === k} onClick={() => setKey(k)}>{l}</button>)}</div>
      <ul className="eqp-list" id="eqp-list" aria-label="Your shares">{cap.shown.map((l) => {
        const f = holdingFigs(lots, l.symbol), h = isReady(l.ov) ? l.ov : null, sc = scoreOf(l.ov, model).value, pk = peerOf?.(l.symbol), name = l.name || h?.name || "";
        const r = h ? trendReading(h.prism?.shortTerm?.score, h.prism?.longTerm?.score) : null, on = open === l.symbol, acc = accounts(l.symbol);
        return <li key={l.symbol} className={on ? "on" : undefined}>
          <button type="button" className="eqp-row" aria-expanded={on} aria-controls={`eqp-d-${l.symbol}`} onClick={() => setOpen(on ? null : l.symbol)}>
            <b className="eqp-sym">{titleOf({ symbol: l.symbol, name: l.name || null })}</b><span className="eqp-v">{f.now == null ? MINUS : rupees(f.now)}</span>
            <small className="eqp-nm">{nameCase(name) || l.symbol}{f.a?.qty != null ? ` · ${f.a.qty.toLocaleString("en-IN")} ${f.a.qty === 1 ? "share" : "shares"}` : ""}</small>
            <span className="eqp-g">{f.gain == null ? MINUS : <><span className={Math.round(f.gain) > 0 ? "up" : Math.round(f.gain) < 0 ? "dn" : "flat"}>{rupeesSigned(f.gain)}</span> · <Pct v={f.gainPct} /></>}</span>
            <span className="eqp-tags">{model === "prism" && sc != null && <span className={"eqp-chip b-" + (sc >= 65 ? "hi" : sc >= 50 ? "mid" : "lo")}><i aria-hidden="true" />Prism {Math.round(sc)} {prismBandWord(sc, h?.prism?.label)}</span>}
              {r && <span className={"eqp-chip t-" + trendTone(r)}><i aria-hidden="true" />{r}</span>}
              <span className="eqp-td">Today <Pct v={h?.changePct ?? null} d={2} /></span></span>
          </button>
          <div className="eqp-d" id={`eqp-d-${l.symbol}`} hidden={!on}>{on && <><dl>
            <div><dt>Invested</dt><dd>{f.a?.invested == null ? MINUS : rupees(f.a.invested)}</dd></div>
            {acc && <div><dt>Accounts</dt><dd>{acc}</dd></div>}
            <div><dt>Average buy price</dt><dd>{f.a?.avg == null ? MINUS : rupees(f.a.avg, 2)}</dd></div>
            <div><dt>Latest price</dt><dd>{h?.price == null ? MINUS : rupees(h.price, 2)}</dd></div>
            {pk?.peer && <div><dt>Against its peers</dt><dd>{PEER_WORD[pk.peer.label]}, {pk.peer.rank} of {pk.peer.of}{pk.peer.vs != null ? ` · ${pointsLine(pk.peer.vs, pk.peer.bench)}` : ""}{pk.peer.direction ? ` · ${pk.peer.direction === "gaining" ? "gaining" : "weakening"} lately` : ""}</dd></div>}
            {model === "prism" && h && <div><dt>Technical view</dt><dd>{r ?? MINUS}<small> · short {signedNum(h.prism?.shortTerm?.score, 0)}, long {signedNum(h.prism?.longTerm?.score, 0)}{pk?.below52 != null ? ` · ${pk.below52.toFixed(1)}% below its 1-year high` : ""}</small></dd></div>}
          </dl>
          <div className="eqp-a"><button type="button" onClick={() => onEdit(l.symbol)}>Edit buys</button><button type="button" onClick={() => onSell(l.symbol)}>{RECORD_SALE}</button><Link to={`/stocks/${encodeURIComponent(l.symbol)}`}>Open report</Link></div></>}</div>
        </li>; })}
        <li className="eqp-tot"><span>Total · {lines.length === total ? `${total} ${total === 1 ? "share" : "shares"}` : `${lines.length} of ${total} shares`}</span><span>{rupees(sum)}</span></li>
      </ul>
      {cap.capped && <ShowAll n={rows.length} open={all} onToggle={() => setAll(!all)} controls="eqp-list" />}
    </div>);
}
