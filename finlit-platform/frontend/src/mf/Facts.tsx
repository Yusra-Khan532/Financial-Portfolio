// Fund facts (size, costs, exit load, benchmark, managers, risk-o-meter, launch date, minimum investment, category, fund house).
// Each shows its value with the date and source. The facts we do not have yet sit together in one "Not in our data yet" box (task #132: they were rows of
// dashes with long notes), with one line on where to find them; each one's own reason is a click away. Nothing is estimated.
import { Icon } from "../lib/icons";
import { dateIN } from "../lib/format";
import { FACT_LABELS, factKeys, factValueText, type FundFacts } from "../lib/mf";

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const listOf = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

export function FactsCard({ facts, loading, failed }: { facts?: FundFacts; loading: boolean; failed: boolean }) {
  const keys = facts ? factKeys(facts) : [];
  const missing = facts ? keys.filter((k) => !factValueText(facts.facts[k])) : [];
  const shown = keys.filter((k) => !missing.includes(k));
  const label = (k: string) => FACT_LABELS[k] || k;
  return (
    <section className="card mf-card" aria-labelledby="mf-facts-h">
      <div className="card-h"><h3 id="mf-facts-h"><span className="ci"><Icon name="notes" /></span>Fund facts</h3></div>
      {loading && !facts ? <div className="skeleton" style={{ height: 180 }} aria-busy="true" /> : failed && !facts ? <p className="muted">The fund facts could not be loaded right now. Please try again in a moment.</p> : facts && (
        <>
        <dl className="mf-factlist">
          {shown.map((k) => {
            const f = facts.facts[k];
            const text = factValueText(f);
            const why = "unavailable" in f ? f.unavailable : text ? "" : "The source gives no value.";
            return (
              <div key={k}>
                <dt>{FACT_LABELS[k] || k}</dt>
                <dd>
                  {text ? <b>{text}</b> : <span className="mf-bigna" aria-label={`No figure. ${why}`}>—</span>}
                  <small className={text ? "faint" : "mf-why"}>
                    {text && !("unavailable" in f) ? [f.asOf ? `As of ${dateIN(f.asOf)}` : "", f.source || ""].filter(Boolean).join(" · ") : why}
                  </small>
                  {text && !("unavailable" in f) && f.note ? <small className="faint">{f.note}</small> : null}
                </dd>
              </div>);
          })}
        </dl>
        {missing.length > 0 && (
          <div className="mf-notyet" role="note" aria-label="Facts not in our data yet">
            <span className="label">Not in our data yet</span>
            <p>{listOf(missing.map((k, i) => (i ? lower(label(k)) : label(k))))}. {missing.length === 1 ? "It is" : "Each is"} in the scheme's own documents on the fund house's site.</p>
            <details><summary>Why each is missing</summary>
              <ul>{missing.map((k) => { const f = facts.facts[k]; return <li key={k}><b>{label(k)}:</b> {"unavailable" in f ? f.unavailable : "The source gives no value."}</li>; })}</ul></details>
          </div>)}
        </>)}
    </section>
  );
}
