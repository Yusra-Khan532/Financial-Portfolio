// F&O Academy: the F&O costs calculator (lib/fnoCosts.ts): every charge on one round trip with its basis, the total, the gross and net result
// and the points needed just to cover the charges. Rates as announced, with their sources; the contract note is the final word.
import { useState } from "react";
import { RATES, roundTrip, type Instrument } from "../../lib/fnoCosts";
import { NumField, Switch, inr, num } from "./chart";

export function CostsCalculator() {
  const [inst, setInst] = useState<Instrument>("options");
  const [side, setSide] = useState<"long" | "short">("long");
  const [entry, setEntry] = useState(100);
  const [exit, setExit] = useState(120);
  const [lotSize, setLot] = useState(65);
  const [lots, setLots] = useState(1);
  const [brk, setBrk] = useState(20);
  const switchTo = (i: Instrument) => { setInst(i); if (i === "futures") { setEntry(24500); setExit(24560); } else { setEntry(100); setExit(120); } };
  const r = roundTrip({ instrument: inst, entry, exit, lotSize, lots, side, brokeragePerOrder: brk });
  const what = inst === "futures" ? "Price" : "Premium";
  return (
    <section className="fa-widget" aria-label="F&O costs calculator">
      <header className="fa-widget-h"><h2>F&O costs calculator</h2><p>The charges on one round trip: an opening trade and a closing trade.</p></header>
      <div className="fa-row">
        <Switch label="Contract" value={inst} onChange={switchTo} options={[["options", "Options"], ["futures", "Futures"]]} />
        <Switch label="Opening trade" value={side} onChange={setSide} options={[["long", "Long (the buyer opens)"], ["short", "Short (the seller or writer opens)"]]} />
      </div>
      <div className="fa-fields">
        <NumField id="fa-c-in" label={`${what} at the opening trade`} value={entry} min={0} step={0.05} onChange={setEntry} suffix="₹" />
        <NumField id="fa-c-out" label={`${what} at the closing trade`} value={exit} min={0} step={0.05} onChange={setExit} suffix="₹" />
        <NumField id="fa-c-lot" label="Lot size" value={lotSize} min={1} onChange={(n) => setLot(Math.max(1, Math.round(n)))} suffix="units" />
        <NumField id="fa-c-lots" label="Lots" value={lots} min={1} onChange={(n) => setLots(Math.max(1, Math.round(n)))} />
        <NumField id="fa-c-brk" label="Brokerage per order" value={brk} min={0} step={1} onChange={setBrk} suffix="₹, your broker's" />
      </div>
      <ul className="fa-costs" aria-label="Charges on this round trip">
        {r.lines.map((l) => <li key={l.key}><span><b>{l.label}</b><small>{l.basis}</small></span><span className="fa-amt">{inr(l.amount, 2)}</span></li>)}
        <li className="fa-costs-total"><span><b>Total charges</b><small>{num(r.qty, 0)} units; turnover {inr(r.turnover, 0)}</small></span><span className="fa-amt">{inr(r.total, 2)}</span></li>
      </ul>
      <dl className="fa-sum">
        <div><dt>Gross result</dt><dd className={r.gross >= 0 ? "fa-gain" : "fa-loss"}>{r.gross > 0 ? "+" : ""}{inr(r.gross, 2)}</dd></div>
        <div><dt>Net after charges</dt><dd className={r.net >= 0 ? "fa-gain" : "fa-loss"}>{r.net > 0 ? "+" : ""}{inr(r.net, 2)}</dd></div>
        <div><dt>Points to cover the charges</dt><dd>{num(r.breakevenPoints)}<small>₹ a unit</small></dd></div>
        <div><dt>Charges as a share of the gross</dt><dd>{r.gross > 0 ? `${num((r.total / r.gross) * 100, 1)}%` : "No gross gain"}</dd></div>
      </dl>
      <div className="fa-assume">
        <b>Rates, as announced</b>
        <ul>
          <li>STT ({RATES.stt.source}, from {RATES.stt.from}): futures 0.05% of the seller's value; options 0.15% of the seller's premium; an exercised option 0.15% of its intrinsic value, paid by the buyer.</li>
          <li>Exchange charges ({RATES.exchange.source}): ₹183 per crore (futures) and ₹3,553 per crore of premium (options), each side, from {RATES.exchange.from}.</li>
          <li>SEBI fee ₹10 per crore; stamp duty 0.002% (futures) and 0.003% (options) on the buyer's side; GST 18% on brokerage, exchange charges and the SEBI fee.</li>
          <li>Rates change: check the exchange's current circular. Brokers may add clearing or platform fees; the contract note is the final word.</li>
        </ul>
      </div>
    </section>
  );
}
