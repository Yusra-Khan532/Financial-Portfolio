// Latest results, Companies view: "The list at a glance" (task #194, pack finlit-latest-results-15nov), one card in place of the three boxes (growth donut, sector
// donut, size donut) that each had their own Hide and Expand buttons. By size: one full-width bar and four count cards with the ₹ size rule. By macro sector: one
// full-width bar and a two-column legend with full names. Meeting your growth conditions: the count, or a dash with three quick fills. Counts are the server's
// (`distribution` and `growth` of GET /api/results/quarter) and cover every matching company, not just the page shown. Names and counts only; never advice.
import type { GrowthSummary, QDistribution } from "../../../lib/qresults";
import { useHideable } from "../../Hideable";

const n0 = (v: number) => v.toLocaleString("en-IN");
const share = (n: number, of: number) => (of ? `${((n / of) * 100).toFixed(1)}%` : "–");
/** Size colours as the pack draws them: Large bronze, Mid blue, Small green, Micro violet (the site's --k7 chart token, task #262), Not classified grey. */
const SIZE_C: Record<string, string> = { Large: "#8A6A25", Mid: "#2A78D6", Small: "#1F6B49", Micro: "var(--k7)", "Not classified": "#B5AC98" };
/** Seven macro sectors and "Others", in the pack's order of colours. */
const SECTOR_C = ["#2A78D6", "#1FA37A", "#E0662E", "#6B4FD0", "#D9719B", "#E3A008", "#127A80"], OTHERS_C = "#B5AC98";

export type QuickFill = { id: string; label: string; hint: string; on: boolean; apply: () => void };

function Stack({ parts, label }: { parts: { name: string; n: number; c: string }[]; label: string }) {
  const total = parts.reduce((a, p) => a + p.n, 0);
  return <div className="rs-gstack" role="img" aria-label={`${label}: ${parts.map((p) => `${p.name} ${n0(p.n)}`).join(", ")}`}>
    {parts.filter((p) => p.n > 0).map((p) => <i key={p.name} title={`${p.name}: ${n0(p.n)}`} style={{ flexGrow: p.n / Math.max(1, total), background: p.c }} />)}</div>;
}

export function GlanceCard({ dist, growth, locked, fills }: { dist: QDistribution | undefined; growth: GrowthSummary | null | undefined; locked: boolean; fills: QuickFill[] }) {
  const [hidden, setHidden] = useHideable("results.glance");
  const title = "The list at a glance";
  if (hidden) return (
    <section className="hz hz-off rs-glance-off" aria-label={title}>
      <span className="hz-t">{title}</span><span className="hz-tag">Hidden</span>
      <button type="button" className="hz-btn" aria-expanded="false" aria-label={`Show: ${title}`} onClick={() => setHidden(false)}>Show</button>
    </section>);
  const total = dist?.total ?? 0;
  const sizes = (dist?.caps ?? []).map((c) => ({ name: c.name, n: c.n, c: SIZE_C[c.name] ?? OTHERS_C }));
  const secs = (dist?.sectors ?? []).map((s, i) => ({ name: s.name, n: s.n, c: s.name === "Others" ? OTHERS_C : SECTOR_C[i % SECTOR_C.length] }));
  return (
    <section className="card rs-glance" aria-labelledby="rs-glance-h">
      <div className="rs-gh">
        <div><h3 id="rs-glance-h">{title}</h3><p className="muted">{dist ? `${n0(total)} ${total === 1 ? "company" : "companies"} in this list. Counts cover every matching company, not just this page.` : "Counting the companies in this list…"}</p></div>
        <button type="button" className="btn rs-ghide" aria-expanded="true" aria-label={`Hide: ${title}`} onClick={() => setHidden(true)}>Hide</button>
      </div>
      {!total ? <p className="muted rs-gnone">{dist ? "No companies in this view." : ""}</p> : <div className="rs-gbody">
        <div className="rs-gblock">
          <p className="rs-glab">By size <span>· Large above ₹75,000 Cr · Mid ₹25,000–75,000 Cr · Small ₹10,000–25,000 Cr · Micro below</span></p>
          <Stack parts={sizes} label="Companies by size" />
          <ul className="rs-gsz">{sizes.map((s) => <li key={s.name}><span className="d" style={{ background: s.c }} aria-hidden="true" /><span className="n">{s.name}</span><b>{n0(s.n)}</b><small>{share(s.n, total)}</small></li>)}</ul>
        </div>
        <div className="rs-g2">
          <div className="rs-gblock">
            <p className="rs-glab">By macro sector</p>
            <Stack parts={secs} label="Companies by macro sector" />
            <ul className="rs-gleg">{secs.map((s) => <li key={s.name}><span className="d" style={{ background: s.c }} aria-hidden="true" /><span className="n">{s.name}</span><b>{n0(s.n)}</b><small>{share(s.n, total)}</small></li>)}</ul>
          </div>
          <div className="rs-gblock rs-ggrow">
            <p className="rs-glab">Meeting your growth conditions</p>
            {growth ? <><p className="big on">{n0(growth.matching)}</p><p className="muted">of the {n0(growth.withFigures)} companies with figures meet {growth.k === 1 ? "your condition" : growth.join === "and" ? `all ${growth.k} of your conditions` : `at least one of your ${growth.k} conditions`}. Change them in Filters.</p></>
              : <><p className="big" aria-label="No count yet">—</p><p className="muted">{locked ? "Growth filters and their counts are part of the Silver plan." : "No growth filter is on yet. Start from a quick fill, or set your own in Filters."}</p></>}
            <div className="rs-gqf" role="group" aria-label="Quick fills">{fills.map((f) => <button key={f.id} type="button" className={"rs-gqfb" + (f.on ? " on" : "")} aria-pressed={f.on} title={f.hint} onClick={f.apply}>{f.label}</button>)}</div>
          </div>
        </div>
      </div>}
      <p className="muted rs-gfoot">Sizes are the site's own Large, Mid, Small and Micro bands; a company without a band is Not classified. Macro sectors are NSE's. Informational only, not a recommendation.</p>
    </section>
  );
}
