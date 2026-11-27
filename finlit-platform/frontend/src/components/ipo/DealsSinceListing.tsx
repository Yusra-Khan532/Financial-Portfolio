// "Deals since listing" on the IPO report (/ipo/:id): every bulk and block deal NSE published in the share since it listed (each trade once), and the
// deals that fell within five trading days after a lock-in ended: the anchor lock-ins (30 and 90 days, from the offer document's timetable) and the
// pre-issue shareholders' 6-month and 1-year lock-ins (counted from the allotment date). Describes what was traded; never advises.
import { Link } from "react-router";
import { MINUS, nf } from "../../lib/format";
import { crIn, dayIn, useStockDeals, type Deal } from "../../lib/deals";
import "../../styles/deals.css";

export type LockIn = { key: string; label: string; date: string };
const AFTER_DAYS = 5;                               // trading days after a lock-in ends that a deal is marked in

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusMonths = (s: string, m: number) => { const d = new Date(s + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + m); return iso(d); };

/** The lock-in ends of an issue, oldest first: anchors (50% after 30 days, the rest after 90) and pre-issue shareholders (6 months and 1 year from allotment). */
export function lockIns(tt: Partial<Record<string, string | null>> | null | undefined): LockIn[] {
  const out: LockIn[] = [];
  if (tt?.anchorLockin30) out.push({ key: "a30", label: "the 30-day anchor lock-in (50% of the anchor shares)", date: tt.anchorLockin30 });
  if (tt?.anchorLockin90) out.push({ key: "a90", label: "the 90-day anchor lock-in (the rest)", date: tt.anchorLockin90 });
  if (tt?.allotment) {
    out.push({ key: "p6", label: "the 6-month lock-in of pre-issue shareholders (from allotment)", date: plusMonths(tt.allotment, 6) });
    out.push({ key: "p12", label: "the 1-year lock-in (from allotment)", date: plusMonths(tt.allotment, 12) });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** The last day of the window: `AFTER_DAYS` weekdays after the lock-in end (the end day itself included when it is a weekday). */
export function windowEnd(date: string, n = AFTER_DAYS): string {
  const d = new Date(date + "T00:00:00Z");
  let left = n;
  while (true) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) { left -= 1; if (left === 0) return iso(d); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
}

/** For each lock-in end that has passed: the deals (each trade once) within the window after it, and a sentence that says so. */
export function nearLockIns(rows: Deal[], locks: LockIn[], today: string): { lock: LockIn; deals: Deal[]; text: string }[] {
  const once = rows.filter((r) => (r.kind === "bulk" || r.kind === "block") && !r.alsoBlock);
  return locks.filter((l) => l.date <= today).map((lock) => {
    const end = windowEnd(lock.date);
    const deals = once.filter((r) => r.day >= lock.date && r.day <= end);
    const sold = deals.filter((r) => r.side === "sell").reduce((a, r) => a + (r.valueCr ?? 0), 0);
    const bought = deals.filter((r) => r.side === "buy").reduce((a, r) => a + (r.valueCr ?? 0), 0);
    const kinds = [...new Set(deals.map((r) => r.kind))];
    const what = kinds.length === 1 ? `${kinds[0]} deal${deals.length === 1 ? "" : "s"}` : `deal${deals.length === 1 ? "" : "s"}`;
    const money = [sold ? `${crIn(sold)} sold` : "", bought ? `${crIn(bought)} bought` : ""].filter(Boolean).join(", ");
    const text = deals.length ? `${deals.length} ${what} in the ${AFTER_DAYS} trading days after ${lock.label} ended on ${dayIn(lock.date)}${money ? ` (${money})` : ""}.`
      : `No bulk or block deal in the ${AFTER_DAYS} trading days after ${lock.label} ended on ${dayIn(lock.date)}.`;
    return { lock, deals, text };
  });
}

export function DealsSinceListing({ symbol, listingDate, timetable }: { symbol: string; listingDate: string; timetable: Partial<Record<string, string | null>> | null | undefined }) {
  const q = useStockDeals(symbol, listingDate);
  const today = new Date().toISOString().slice(0, 10);
  const locks = lockIns(timetable);
  const ahead = locks.filter((l) => l.date > today);
  return (
    <section className="card ir-sec bbd bbd-ir" aria-labelledby="ir-deals"><h2 id="ir-deals">Deals since listing</h2>
      {q.isLoading && <div className="skeleton" style={{ height: 120 }} role="status" aria-label="Loading the deals" />}
      {q.isError && <p className="muted">The deals could not be loaded. Please try again shortly.</p>}
      {q.data && (() => {
        const d = q.data, once = d.rows.filter((r) => r.kind !== "short" && !r.alsoBlock), first = d.coverage.first_day;
        const near = nearLockIns(d.rows, locks, today);
        const marked = new Map<number, string>();
        near.forEach((n) => n.deals.forEach((r) => marked.set(r.id, `after ${n.lock.label.replace(/^the /, "").replace(/ \(.*\)$/, "")} ended`)));
        return <>
          <p className="ir-lead">{once.length
            ? <><b>{nf(once.length, 0)}</b> bulk and block {once.length === 1 ? "trade" : "trades"} since listing on {dayIn(listingDate)}: {[d.buyCr ? <span key="b"><span className="up">{crIn(d.buyCr)}</span> bought</span> : null,
                d.sellCr ? <span key="s"><span className="down">{crIn(d.sellCr)}</span> sold</span> : null].filter(Boolean).reduce<React.ReactNode[]>((a, x, i) => (i ? [...a, ", ", x] : [x]), [])}.</>
            : <>No bulk or block deal in this share since it listed on {dayIn(listingDate)}.</>}
            {first && first > listingDate ? <> Deals are held from {dayIn(first)}; earlier days are not covered yet.</> : null}</p>
          {near.length > 0 && <ul className="ir-list bbd-irl">{near.map((n) => <li key={n.lock.key}><span>{n.text}</span></li>)}</ul>}
          {ahead.length > 0 && <p className="muted bbd-irn">Ahead: {ahead.map((l) => `${l.label.replace(/^the /, "")} ends ${dayIn(l.date)}`).join("; ")}.</p>}
          {once.length > 0 && <div className="bbd-cpt"><table className="ia-t"><caption className="sr-only">Bulk and block deals since listing</caption>
            <thead><tr><th scope="col">Date</th><th scope="col">Client</th><th scope="col">Action</th><th scope="col" className="r">Qty</th><th scope="col" className="r">Price</th><th scope="col" className="r">Value</th><th scope="col">Note</th></tr></thead>
            <tbody>{once.slice(0, 50).map((r) => <tr key={r.id}><td>{dayIn(r.day)}<small>{r.kind === "block" ? "Block" : "Bulk"}</small></td>
              <td className="bbd-ct">{r.clientKey ? <Link to={`/ipo?view=deals&client=${encodeURIComponent(r.clientKey)}`}>{r.client}</Link> : MINUS}</td>
              <td><span className={"bbd-b " + (r.side ?? "")}>{r.side === "buy" ? "Buy" : "Sell"}</span></td><td className="r">{nf(r.qty, 0)}</td>
              <td className="r">{r.price != null ? "₹" + nf(r.price, 2) : MINUS}</td><td className="r">{crIn(r.valueCr)}</td><td>{marked.get(r.id) ?? ""}</td></tr>)}</tbody></table></div>}
          <p className="muted bbd-irn">Source: NSE's bulk and block deal files. A block deal NSE also lists as a bulk deal is counted once. <Link to={`/ipo?view=deals&q=${encodeURIComponent(symbol)}&period=1y`}>Every deal in {symbol} →</Link></p>
        </>;
      })()}
    </section>
  );
}
