// The IPOs page, first view: anchor lock-in ends in the next 45 days (from each issue's offer-document timetable, already stored with the IPO record),
// beside the bulk and block deals NSE published in those shares over the last 30 days (each trade once). No new data source. Describes; never advises.
import { Link } from "react-router";
import { nf } from "../../lib/format";
import { crIn, dayIn, useIpoDeals } from "../../lib/deals";
import "../../styles/deals.css";

export function LockinCalendar() {
  const q = useIpoDeals();
  const rows = q.data?.lockinsAhead;
  if (!rows) return null;
  return (
    <section className="ipo-sec p4-sec bbd bbd-lk" aria-label="Anchor lock-in ends ahead">
      <h2 className="ipo-sec-h">Anchor lock-in ends ahead <span>{rows.length}</span><small>next 45 days, with the bulk and block deals in each share over the last 30 days</small></h2>
      {rows.length ? <div className="card ia-tw bbd-cpt"><table className="ia-t"><caption className="sr-only">Anchor lock-in ends in the next 45 days</caption>
        <thead><tr><th scope="col">Ends</th><th scope="col">Company</th><th scope="col">Lock-in</th><th scope="col">Deals, last 30 days</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.id + r.what}>
          <td>{dayIn(r.date)}</td>
          <th scope="row"><Link to={`/ipo/${r.id}`}>{r.name}</Link><small>{r.symbol}</small></th>
          <td>{r.what}</td>
          <td>{r.recent ? <Link to={`/ipo?view=deals&q=${encodeURIComponent(r.symbol)}&period=30d`}>{nf(r.recent.deals, 0)} {r.recent.deals === 1 ? "trade" : "trades"}: {crIn(r.recent.buyCr)} bought, {crIn(r.recent.sellCr)} sold</Link>
            : <span className="muted">None{q.data?.historyFrom ? "" : " (no deals held yet)"}</span>}</td>
        </tr>)}</tbody></table></div>
        : <p className="muted p4-pad">No anchor lock-in ends in the next 45 days.</p>}
    </section>
  );
}
