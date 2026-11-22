import { PageHeader } from "../components/PageHeader";
import { prismBandOf, rowScore, rowView, usePlanModel } from "../lib/planScore";
import { titleOf, subOf, codeNote } from "../lib/companyLabel";
import { Link } from "react-router";
import { useMemo, useState } from "react";
import { useUniverse, type Row } from "../lib/screener";
import { PLAN_FOR_PRISM } from "../lib/planGates";
import { useUI } from "../lib/ui";
import { Icon } from "../lib/icons";
import { useDocTitle } from "../lib/title";
import { Reveal } from "../components/Reveal";
import { nf } from "../lib/format";
import { CoLogo } from "../components/CoLogo";

const FEATURED = ["RELIANCE", "TCS", "HDFCBANK", "INFY", "BPCL", "ITC"];
const TABS = [["score", "Highest FinLit Prism", "prism"], ["size", "Largest companies", ""], ["up", "Top gainers today", ""], ["down", "Top decliners today", ""]] as const;

/** The market view lives at the top of the dashboard; Stock research points there. */
function MarketLink() {
  return (
    <section className="sec" style={{ paddingBlock: "22px 0" }}><div className="wrap">
      <p className="muted" style={{ margin: 0 }}>Index levels, the daily Nifty 50 and Sensex chart, heatmaps and FII/DII flows are now at the top of your <Link to="/dashboard">dashboard</Link>.</p>
    </div></section>
  );
}

export function Research({ onSearch }: { onSearch: () => void }) {
  useDocTitle("Company report", "A FinLit research report for every listed Indian stock: the FinLit Prism score, financials, ratios, ownership and peers.");
  const { data, isLoading } = useUniverse();
  const { upgrade } = useUI();
  const rows = data?.rows || [];
  const model = usePlanModel();   // task #283: plans with FinLit Prism rank and read by it; other plans see no score
  const scored = !!model && rows.some((r) => rowScore(r) != null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("size");
  const traded = useMemo(() => rows.filter((r) => r.price != null && (r.market_cap ?? 0) >= 100), [rows]);
  const list = useMemo(() => {
    const val = (r: Row, k: "market_cap" | "change_pct" | "overall") => (k === "overall" ? (model ? rowScore(r) : null) : r[k]);
    const by = (k: "market_cap" | "change_pct" | "overall", dir: 1 | -1) => [...traded].filter((r) => val(r, k) != null).sort((x, y) => dir * ((val(y, k) as number) - (val(x, k) as number)));
    return (tab === "score" ? by("overall", 1) : tab === "up" ? by("change_pct", 1) : tab === "down" ? by("change_pct", -1) : by("market_cap", 1)).slice(0, 12);
  }, [traded, tab, model]);
  return (
    <>
      <PageHeader wrap plan="free" title="Company report" art="report" links={["/screener", "/compare", "/prism"]}
        description={<>Prism score, statements, ratios, ownership and peers for {rows.length > 0 ? <><b>{nf(rows.length, 0)}</b> listed Indian companies</> : "every listed Indian company"}.</>}
        stats={[{ icon: "building", value: rows.length > 0 ? nf(rows.length, 0) : null, label: "Companies" }, { icon: "quality", value: scored ? nf(rows.filter((r) => rowScore(r) != null).length, 0) : null, label: "Rated by Prism" }]}>
        <button className="bigsearch" onClick={onSearch}><Icon name="table" /><span>Search any company or ticker</span><span className="kbd">Ctrl K</span></button>
      </PageHeader>
      <MarketLink />
      <section className="sec" style={{ paddingTop: 28 }}><div className="wrap">
        <Reveal className="sec-h"><div className="eyebrow">Start exploring</div><h2>{rows.length ? "Where to look today" : "Popular reports"}</h2></Reveal>
        {rows.length > 0 && (
          <div className="seg" role="group" aria-label="List" style={{ marginBottom: 16, flexWrap: "wrap" }}>
            {TABS.map(([k, l, tier]) => <button key={k} aria-pressed={tab === k} onClick={() => (k === "score" && !model ? upgrade(PLAN_FOR_PRISM, "Ranking by FinLit Prism comes with a plan that has FinLit Prism.") : setTab(k))}>{l}{tier && !model ? <Icon name="lock" /> : null}</button>)}
          </div>)}
        {tab === "score" && !scored && rows.length > 0 && <p className="muted">Scores appear here once your plan includes them.</p>}
        {isLoading && <div className="skeleton" style={{ height: 160 }} />}
        <div className="sgrid">
          {(rows.length ? list : FEATURED.map((s) => ({ symbol: s, name: s, band: null, overall: null, price: null, sector: null, change_pct: null, market_cap: null } as unknown as Row))).map((r) => (
            <Link className="scard" key={r.symbol} to={`/stocks/${r.symbol}`}><b title={codeNote(r)}><CoLogo symbol={r.symbol} name={r.name} size={24} inline />{titleOf(r)}</b><span>{subOf(r) && subOf(r) !== r.symbol ? subOf(r) : r.sector || "Open the report"}</span>
              <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {model === "prism" ? (() => { const v = rowView(r), b = prismBandOf(v.score); return v.score != null && <span className={"vd " + (b === "strong" ? "strong" : b === "healthy" ? "healthy" : b === "average" ? "mixed" : "weak")} title={`FinLit Prism ${v.score} out of 100`}>Prism {v.word} {v.score}</span>; })()
                  : null}
                {r.price != null && <span className="mono">₹{nf(r.price)}</span>}
                {r.change_pct != null && <span className={"mono " + (r.change_pct >= 0 ? "up" : "down")}>{(r.change_pct >= 0 ? "▲ +" : "▼ −") + nf(Math.abs(r.change_pct), 2)}%</span>}
              </span></Link>
          ))}
        </div>
        <p style={{ marginTop: 20 }}><Link className="btn" to="/screener">Open the screener <Icon name="arrow" /></Link></p>
      </div></section>
    </>
  );
}
