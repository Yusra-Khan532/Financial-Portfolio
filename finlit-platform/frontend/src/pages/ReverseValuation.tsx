// Reverse valuation (task #69): "What must happen for today's price to be justified?" Pick a company, choose what to solve for (revenue growth, final margin, exit multiple or the
// implied return), set the other assumptions, and read the headline answer, how it compares with the company's own history, the miss scenarios and a growth x margin grid.
// Every number is worked out in the browser by lib/reverseVal.ts from the company's reported figures, with every assumption on screen. Describes what the price assumes; not a forecast, not a rating.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { Gate } from "../components/Gate";
import { FilterNote, SearchFilters, useIndexFilter } from "../components/SearchFilters";
import { Icon } from "../lib/icons";
import { useUI } from "../lib/ui";
import { useDocTitle } from "../lib/title";
import { apiGet, useSection, type ApiError, type Financials } from "../lib/api";
import { nf } from "../lib/format";
import { around, enterpriseValue, expectedValue, fairValue, growthMarginGrid, marketEv, missScenarios, priceOf, scenario, solve, terminalShare, tornado, upsideScenarios, validateInputs, type Miss, type RvInputs, type SolveMode } from "../lib/reverseVal";
import "../styles/reverse.css";

type Company = { symbol: string; name: string | null; sector: string | null; price: number | null; priceAsOf: string | null; marketCap: number | null; shares: { diluted: number | null; implied: number | null }; netDebt: { value: number | null; period: string | null } };
const MODES: { id: SolveMode; label: string; field: keyof RvInputs }[] = [
  { id: "growth", label: "Revenue growth", field: "g" }, { id: "margin", label: "Margin", field: "marginN" }, { id: "multiple", label: "Exit multiple", field: "exitMultiple" }, { id: "return", label: "Implied return", field: "r" },
];
const num = (s: string) => { const t = s.replace(/[,\s%x]/g, ""); return t === "" ? NaN : Number(t); };
const f1 = (v: number | null | undefined, d = 1) => (v == null || !Number.isFinite(v) ? "—" : (v < 0 ? "−" : "") + nf(Math.abs(v), d));
const rs = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "—" : (v < 0 ? "−₹" : "₹") + nf(Math.abs(v), d));
const cagr = (a: number, b: number, n: number) => (a > 0 && b > 0 && n > 0 ? (Math.pow(b / a, 1 / n) - 1) * 100 : null);
const last = (xs: (number | null)[]) => { for (let i = xs.length - 1; i >= 0; i--) if (xs[i] != null) return i; return -1; };

type Hist = { rev0: number; margin0: number; margin3: number | null; cagr5: number | null; period: string; years: number };
function historyOf(f: Financials | undefined): Hist | null {
  const pl = f?.yearly.pl; if (!pl) return null;
  const rev = pl.rows.revenue as (number | null)[] | undefined, op = pl.rows.operating_profit as (number | null)[] | undefined; if (!rev || !op) return null;
  const k = last(rev); if (k < 0 || !rev[k]) return null;
  const m = (i: number) => (rev[i] && op[i] != null ? ((op[i] as number) / (rev[i] as number)) * 100 : null);
  const ms = [k, k - 1, k - 2].map((i) => (i >= 0 ? m(i) : null)).filter((x): x is number => x != null);
  const span = Math.min(5, k), first = k - span;
  return { rev0: rev[k] as number, margin0: m(k) ?? 15, margin3: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null, cagr5: first >= 0 && rev[first] ? cagr(rev[first] as number, rev[k] as number, span) : null, period: pl.periods[k], years: span };
}

const STEP: Record<string, number> = { "%": 0.5, x: 0.5, Cr: 100 };
function Field({ label, hint, value, onChange, unit, solved, error }: { label: string; hint?: string; value: string; onChange: (v: string) => void; unit: string; solved?: boolean; error?: string }) {
  const bump = (d: number) => { const n = num(value); if (Number.isFinite(n)) onChange(String(Math.round((n + d * (STEP[unit] ?? 1)) * 100) / 100)); };
  return (
    <div className={"rv-f" + (solved ? " solved" : "")}><label><span>{label}{hint && <small>{hint}</small>}</span>
      <span className="rv-in"><input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} readOnly={solved} aria-invalid={!!error} /><em>{unit}</em></span></label>
      {!solved && <span className="rv-step"><button type="button" onClick={() => bump(-1)} aria-label={`Lower ${label}`}>−</button><button type="button" onClick={() => bump(1)} aria-label={`Raise ${label}`}>+</button></span>}
      {solved && <i className="rv-lock"><Icon name="lock" /> solved</i>}{error && <small className="rv-err" role="alert">{error}</small>}</div>
  );
}

const HOW = ["Pick what to solve for: the revenue growth, the final-year margin, the exit multiple or the return. The other assumptions stay as you set them.", "The tool projects revenue, margin and free cash flow for 5 or 10 years, adds the value after the last year, and discounts it all to today.", "It then finds the one number that makes that value equal what the market is paying now, and shows it next to what the company has done."];
const WHY = ["Whether a share is cheap or expensive has no testable answer. What the price needs to come true does: you can check it against the company's history.", "It shows how much of today's price rests on each assumption, and what a miss would do to the value and the return."];
const METHOD = ["Revenue grows at the rate you set (or fades towards a long-run rate); the EBITDA margin moves from today's level to the target in a straight line or an S-curve.", "Free cash flow is EBITDA less tax on operating profit, capital spending and working capital, each set as a share of revenue.", "The value after the last year is the exit multiple times final-year EBITDA, or growth in perpetuity if you choose it. The value is divided by shares after taking away net debt.", "The solver is a bracketed bisection: value rises with growth, margin and multiple and falls with the discount rate, so each solve has one answer or says plainly that none exists.", "Net debt is the latest reported borrowings less cash. Revenue and operating profit are the company's reported figures. The result describes what the price assumes. It is not a forecast, a target price or a recommendation."];

export function ReverseValuationPage() {
  useDocTitle("Reverse valuation", "What must happen for today's price to be justified? Solve for the revenue growth, margin, exit multiple or return a company's share price already assumes.");
  const { has } = useUI();
  const [sp, setSp] = useSearchParams();
  const [sym, setSym] = useState<string | null>(sp.get("sym"));
  const [q, setQ] = useState("");
  const sf = useIndexFilter(true), hits = useMemo(() => sf.search(q, 8), [sf.search, q]);
  const co = useQuery<Company, ApiError>({ queryKey: ["dcf-company", sym], queryFn: () => apiGet(`/api/dcf/company/${encodeURIComponent(sym as string)}`), enabled: !!sym && has("gold"), retry: false, staleTime: 300_000 });
  const fin = useSection<Financials>(sym ?? "", "financials", !!sym && has("gold"));
  const hist = useMemo(() => historyOf(fin.data), [fin.data]);
  const c = co.data;

  const [mode, setMode] = useState<SolveMode>("growth");
  const [info, setInfo] = useState<"how" | "why" | "method" | null>(null);
  const [opt, setOpt] = useState<{ terminal: "multiple" | "perpetuity"; growthPath: "steady" | "fade"; marginPath: "straight" | "scurve" }>({ terminal: "multiple", growthPath: "steady", marginPath: "straight" });
  const [termG, setTermG] = useState("5");
  const [side, setSide] = useState<"miss" | "upside">("miss");
  const [wt, setWt] = useState({ base: 50, miss: 30, severe: 20 });
  const [mine, setMine] = useState({ dg: "", dm: "", mult: "", dr: "" });
  const [copied, setCopied] = useState(false);
  const restored = useRef<Record<string, string> | null>(null);
  const [v, setV] = useState({ marginN: "", exitMultiple: "", r: "12", g: "", years: "10", margin0: "", rev0: "", taxPct: "25", depPct: "3", capexPct: "4", nwcPct: "10" });
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  useEffect(() => { setSp((p) => { const n = new URLSearchParams(p); if (sym) n.set("sym", sym); else n.delete("sym"); return n; }, { replace: true }); }, [sym]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {      // a shared link brings the assumptions back
    const a = sp.get("a"), m = sp.get("mode");
    if (m && ["growth", "margin", "multiple", "return"].includes(m)) setMode(m as SolveMode);
    if (a) { try { const o = JSON.parse(atob(a)); if (o?.v) { restored.current = o.v; setV((x) => ({ ...x, ...o.v })); } if (o?.opt) setOpt(o.opt); if (o?.termG) setTermG(String(o.termG)); } catch { /* a damaged link: start from the company's own figures */ } }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  // when a company loads its own figures fill the fields (every field stays editable)
  useEffect(() => {
    if (!c || !hist) return;
    if (restored.current) { restored.current = null; return; }      // the first load after a shared link keeps the link's own assumptions
    const ev = (c.marketCap ?? 0) + (c.netDebt.value ?? 0), ebitda = hist.rev0 * (hist.margin0 / 100);
    setV((s) => ({ ...s, rev0: String(Math.round(hist.rev0)), margin0: f1(hist.margin0, 1).replace("−", "-"), marginN: f1(hist.margin3 ?? hist.margin0, 1).replace("−", "-"), exitMultiple: ebitda > 0 && ev > 0 ? f1(Math.min(60, Math.max(3, ev / ebitda)), 1) : "12", g: f1(hist.cagr5 ?? 10, 1).replace("−", "-") }));
  }, [c?.symbol, hist?.period]);   // eslint-disable-line react-hooks/exhaustive-deps

  const shares = c ? (c.shares.diluted ?? c.shares.implied ?? NaN) : NaN;
  const inputs: RvInputs | null = c && hist ? { rev0: num(v.rev0), margin0: num(v.margin0), marginN: num(v.marginN), g: num(v.g), exitMultiple: num(v.exitMultiple), r: num(v.r), years: num(v.years), taxPct: num(v.taxPct), depPct: num(v.depPct), capexPct: num(v.capexPct), nwcPct: num(v.nwcPct), terminal: opt.terminal, termG: num(termG), growthPath: opt.growthPath, marginPath: opt.marginPath, netDebt: c.netDebt.value ?? 0, marketCap: c.marketCap ?? NaN, shares } : null;
  const field = MODES.find((m) => m.id === mode)!.field;
  const problems = inputs ? validateInputs({ ...inputs, [field]: mode === "growth" ? 10 : mode === "margin" ? 20 : mode === "multiple" ? 10 : 12 }).filter((p) => p.field !== field) : [];
  const out = useMemo(() => (inputs && !problems.length ? solve(inputs, mode) : null), [inputs && JSON.stringify(inputs), mode]);   // eslint-disable-line react-hooks/exhaustive-deps
  const solvedInputs: RvInputs | null = inputs && out?.value != null ? { ...inputs, [field]: out.value } : null;
  const price = inputs ? priceOf(inputs) : NaN;
  const miss = useMemo(() => (solvedInputs ? missScenarios(solvedInputs) : []), [solvedInputs && JSON.stringify(solvedInputs)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const gridRows = solvedInputs ? around(Math.round(solvedInputs.g * 10) / 10, 2) : [], gridCols = solvedInputs ? around(Math.round(solvedInputs.marginN * 10) / 10, 2) : [];
  const grid = useMemo(() => (solvedInputs ? growthMarginGrid(solvedInputs, gridRows, gridCols) : []), [solvedInputs && JSON.stringify(solvedInputs)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const N = inputs?.years ?? 10;
  const headline = !solvedInputs || out?.value == null ? "" : mode === "growth" ? `At this price, revenue must grow ${f1(out.value)}% a year for ${N} years while the EBITDA margin reaches ${f1(solvedInputs.marginN)}%, with an exit multiple of ${f1(solvedInputs.exitMultiple)}x and a discount rate of ${f1(solvedInputs.r)}%.`
    : mode === "margin" ? `At this price, the EBITDA margin must reach ${f1(out.value)}% by year ${N}, with revenue growing ${f1(solvedInputs.g)}% a year, an exit multiple of ${f1(solvedInputs.exitMultiple)}x and a discount rate of ${f1(solvedInputs.r)}%.`
      : mode === "multiple" ? `At this price, the market must still pay ${f1(out.value)}x EBITDA in year ${N}, with revenue growing ${f1(solvedInputs.g)}% a year and the margin reaching ${f1(solvedInputs.marginN)}%, at a discount rate of ${f1(solvedInputs.r)}%.`
        : `If revenue grows ${f1(solvedInputs.g)}% a year, the margin reaches ${f1(solvedInputs.marginN)}% and the exit multiple is ${f1(solvedInputs.exitMultiple)}x, the return implied by today's price is ${f1(out.value)}% a year.`;
  const need = out?.value ?? null;
  const reqLabel = mode === "growth" ? "Required revenue CAGR" : mode === "margin" ? "Required final EBITDA margin" : mode === "multiple" ? "Required exit multiple" : "Implied annual return";
  const reqUnit = mode === "multiple" ? "x" : "%";
  const histRef = mode === "growth" ? hist?.cagr5 : mode === "margin" ? hist?.margin3 : null;
  const pen = (x: number | null, d = 0) => (x == null ? "—" : rs(x, d));
  const up = useMemo(() => (solvedInputs ? upsideScenarios(solvedInputs) : []), [solvedInputs && JSON.stringify(solvedInputs)]);   // eslint-disable-line react-hooks/exhaustive-deps
  const torn = useMemo(() => tornado(miss), [miss]);
  const termShare = solvedInputs ? terminalShare(solvedInputs) : null;
  const ev8 = solvedInputs ? expectedValue(solvedInputs, wt) : { value: null, pct: null };
  const mineRow: Miss | null = solvedInputs && Object.values(mine).some((x) => x !== "") ? scenario(solvedInputs, "mine", "Your own scenario", "yours", { dg: Number.isFinite(num(mine.dg)) ? num(mine.dg) : 0, dm: Number.isFinite(num(mine.dm)) ? num(mine.dm) : 0, mult: Number.isFinite(num(mine.mult)) ? num(mine.mult) / 100 : 0, dr: Number.isFinite(num(mine.dr)) ? num(mine.dr) : 0 }) : null;
  const list = side === "miss" ? miss : up;
  const signed = (x: number | null) => (x == null ? "—" : `${x < 0 ? "−" : "+"}${f1(Math.abs(x))}%`);
  const shareUrl = () => { const u = new URL(window.location.href); u.searchParams.set("sym", sym ?? ""); u.searchParams.set("mode", mode); u.searchParams.set("a", btoa(JSON.stringify({ v, opt, termG }))); return u.toString(); };
  const copy = async () => { try { await navigator.clipboard.writeText(shareUrl()); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { window.prompt("Copy this link", shareUrl()); } };
  const exportCsv = () => {
    if (!solvedInputs || !c) return;
    const rows: (string | number)[][] = [["Reverse valuation", c.name ?? c.symbol], ["Solve for", MODES.find((m) => m.id === mode)!.label], ["Price (Rs)", price], ["Market cap (Rs Cr)", c.marketCap ?? ""], ["Net debt (Rs Cr)", solvedInputs.netDebt], ["Shares (crore)", solvedInputs.shares],
      ...Object.entries({ "Revenue growth %": solvedInputs.g, "Final EBITDA margin %": solvedInputs.marginN, "Exit multiple x": solvedInputs.exitMultiple, "Discount rate %": solvedInputs.r, "Years": solvedInputs.years, "Revenue today (Rs Cr)": solvedInputs.rev0, "EBITDA margin today %": solvedInputs.margin0 }), [], ["Scenario", "Change", "Value per share", "Against today %", "Implied return %"],
      ...[...miss, ...up, ...(mineRow ? [mineRow] : [])].map((m) => [m.label, m.change, m.fair ?? "", m.downside ?? "", m.irr ?? ""])];
    const blob = new Blob(["\uFEFF" + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `reverse-valuation-${c.symbol}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader wrap plan="gold" title="Reverse valuation" art="report" links={["/dcf", "/outlook", "/stocks"]} learn={false}
        description={<>What must happen for today's price to be justified? Choose what to solve for and see the growth, margin, exit multiple or return the market already assumes. It describes what the price assumes; it does not predict prices or rate any share.</>} />
      <div className="wrap rv">
        <nav className="rv-tools" aria-label="Valuation tools"><span>Valuation tools</span><Link to="/dcf">DCF valuation</Link><Link to="/reverse-valuation" aria-current="page" className="on">Reverse valuation</Link><Link to="/compare">Compare companies</Link>
          <span className="rv-info" role="group" aria-label="About this tool">{([["how", "How it works"], ["why", "Why use it?"], ["method", "Methodology"]] as const).map(([k, l]) => <button key={k} type="button" aria-expanded={info === k} className={info === k ? "on" : ""} onClick={() => setInfo(info === k ? null : k)}>{l}</button>)}</span></nav>
        {info && <section className="card rv-ip" aria-label={info === "how" ? "How it works" : info === "why" ? "Why use it" : "Methodology"}><ul>{(info === "how" ? HOW : info === "why" ? WHY : METHOD).map((t) => <li key={t}>{t}</li>)}</ul></section>}
        <Gate tier="gold" title="Reverse valuation" points={["Solve for the growth, margin, exit multiple or return a price assumes", "Miss scenarios and a growth × margin grid", "Every assumption on screen"]}>
          <section className="card rv-co" aria-label="Choose a company">
            <label className="dcf-search"><Icon name="search" /><span className="sr-only">Search a company</span>
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Company name or NSE symbol" autoComplete="off" spellCheck={false} maxLength={60} onKeyDown={(e) => { if (e.key === "Enter" && hits[0]) { e.preventDefault(); setSym(hits[0][0]); setQ(""); } }} /></label>
            <SearchFilters variant="panel" facets={sf.facets} value={sf.filter} onChange={sf.setFilter} count={sf.count} />
            {(q.trim() || sf.on) && hits.length > 0 && <ul className="dcf-hits" aria-label="Matching companies">{hits.map((h) => <li key={h[0]}><button onClick={() => { setSym(h[0]); setQ(""); }}><b>{h[1]}</b><span className="mono faint">{h[0]}</span></button></li>)}</ul>}
            {sf.idx.data && hits.length === 0 && (sf.on ? <FilterNote filter={sf.filter} q={q.trim()} onChange={sf.setFilter} hidden={sf.hidden(q)} /> : q.trim() && <p className="faint">No listed company matches “{q.trim()}”.</p>)}
            {!sym && <p className="muted rv-empty">Choose a listed company to start. Its price, market value, net debt, shares and the last years of revenue and operating profit are loaded for you; every field stays editable.</p>}
            {(co.isFetching || fin.isFetching) && <p className="muted" aria-live="polite">Loading {sym}…</p>}
            {co.isError && <p className="formerr" role="alert">{(co.error?.body?.detail as string) || "Could not load this company's figures."}</p>}
            {c && <div className="rv-head"><div><b>{c.name ?? c.symbol}</b> <span className="mono faint">{c.symbol}</span>{c.sector && <small>{c.sector}</small>}</div><div className="rv-px"><b>{rs(c.price, 2)}</b><small>Mkt cap {rs(c.marketCap)} Cr · EV {rs(inputs ? marketEv(inputs) : null)} Cr{c.priceAsOf ? ` · ${c.priceAsOf.slice(0, 10)}` : ""}</small></div></div>}
            {c && !fin.isFetching && !hist && <p className="formerr" role="alert">This company has no yearly revenue and operating profit in our data, so a reverse valuation cannot be built. Banks, insurers and companies without a profit history need other models.</p>}
          </section>

          {inputs && hist && (
            <>
              <div className="rv-grid">
                <section className="card rv-as" aria-labelledby="rv-as-h">
                  <div className="rv-ash"><h2 id="rv-as-h">Your assumptions</h2><button type="button" className="rv-def" onClick={() => { setSym((x) => x); setV((o) => ({ ...o, taxPct: "25", depPct: "3", capexPct: "4", nwcPct: "10", r: "12", years: "10" })); setOpt({ terminal: "multiple", growthPath: "steady", marginPath: "straight" }); setTermG("5"); if (hist && c) { const ev = (c.marketCap ?? 0) + (c.netDebt.value ?? 0), ebitda = hist.rev0 * (hist.margin0 / 100); setV((o) => ({ ...o, rev0: String(Math.round(hist.rev0)), margin0: f1(hist.margin0, 1).replace("−", "-"), marginN: f1(hist.margin3 ?? hist.margin0, 1).replace("−", "-"), exitMultiple: ebitda > 0 && ev > 0 ? f1(ev / ebitda, 1) : o.exitMultiple, g: hist.cagr5 != null ? f1(hist.cagr5, 1).replace("−", "-") : o.g })); } }}>Use default</button></div>
                  <div className="rv-modes" role="group" aria-label="Solve for">{MODES.map((m) => <button key={m.id} type="button" aria-pressed={mode === m.id} className={mode === m.id ? "on" : ""} onClick={() => setMode(m.id)}>{m.label}</button>)}</div>
                  <Field label="Revenue growth (CAGR)" hint={hist.cagr5 != null ? `last ${hist.years}Y ${f1(hist.cagr5)}%` : undefined} unit="%" value={mode === "growth" ? f1(need) : v.g} onChange={set("g")} solved={mode === "growth"} />
                  <Field label="EBITDA margin, final year" hint={hist.margin3 != null ? `3Y avg ${f1(hist.margin3)}%` : undefined} unit="%" value={mode === "margin" ? f1(need) : v.marginN} onChange={set("marginN")} solved={mode === "margin"} error={problems.find((p) => p.field === "marginN")?.text} />
                  <Field label="Exit multiple (EV/EBITDA)" unit="x" value={mode === "multiple" ? f1(need) : v.exitMultiple} onChange={set("exitMultiple")} solved={mode === "multiple"} error={problems.find((p) => p.field === "exitMultiple")?.text} />
                  <Field label="Discount rate (required return)" unit="%" value={mode === "return" ? f1(need) : v.r} onChange={set("r")} solved={mode === "return"} error={problems.find((p) => p.field === "r")?.text} />
                  <label className="rv-f"><span>Forecast window</span><span className="rv-in"><select value={v.years} onChange={(e) => set("years")(e.target.value)} aria-label="Forecast window"><option value="5">5 years</option><option value="10">10 years</option></select></span></label>
                  <button type="button" className="btn primary rv-calc" onClick={() => document.getElementById("rv-res-h")?.scrollIntoView({ behavior: "smooth", block: "start" })}><Icon name="gauge" /> Calculate reverse valuation</button>
                  <p className="rv-note">Results update as you change a field. Every field starts from the company's own reported figures.</p>
                  <details className="rv-adv"><summary>Shape of the forecast</summary>
                    <label className="rv-f"><span>Growth path</span><span className="rv-in"><select value={opt.growthPath} onChange={(e) => setOpt((o) => ({ ...o, growthPath: e.target.value as "steady" | "fade" }))}><option value="steady">Steady every year</option><option value="fade">Fades towards the long-run rate</option></select></span></label>
                    <label className="rv-f"><span>Margin path</span><span className="rv-in"><select value={opt.marginPath} onChange={(e) => setOpt((o) => ({ ...o, marginPath: e.target.value as "straight" | "scurve" }))}><option value="straight">Straight line</option><option value="scurve">S-curve (slow, quick, slow)</option></select></span></label>
                    <label className="rv-f"><span>Value after the last year</span><span className="rv-in"><select value={opt.terminal} onChange={(e) => setOpt((o) => ({ ...o, terminal: e.target.value as "multiple" | "perpetuity" }))}><option value="multiple">Exit multiple</option><option value="perpetuity">Growth in perpetuity</option></select></span></label>
                    <Field label="Long-run growth" hint="used by the fade and the perpetuity" unit="%" value={termG} onChange={setTermG} />
                  </details>
                  <details className="rv-adv"><summary>Other assumptions and sources</summary>
                    <Field label={`Revenue, ${hist.period} (₹ Cr)`} unit="Cr" value={v.rev0} onChange={set("rev0")} />
                    <Field label="EBITDA margin today" unit="%" value={v.margin0} onChange={set("margin0")} />
                    <Field label="Tax on operating profit" unit="%" value={v.taxPct} onChange={set("taxPct")} />
                    <Field label="Depreciation, % of revenue" unit="%" value={v.depPct} onChange={set("depPct")} />
                    <Field label="Capital spending, % of revenue" unit="%" value={v.capexPct} onChange={set("capexPct")} />
                    <Field label="Working capital per ₹ of extra revenue" unit="%" value={v.nwcPct} onChange={set("nwcPct")} />
                    <p className="rv-note">Net debt {rs(inputs.netDebt)} Cr{c?.netDebt.period ? ` (${c.netDebt.period})` : ""}; shares {f1(inputs.shares, 2)} crore. Revenue and operating profit are the company's reported yearly figures (EBITDA is taken as operating profit before depreciation). Free cash flow = EBITDA − tax − capital spending − working capital, as a share of revenue. The margin moves in a straight line from today's level to the final-year level.</p>
                  </details>
                </section>

                <section className="card rv-res" aria-labelledby="rv-res-h" aria-live="polite">
                  <h2 id="rv-res-h">Result: <em>{reqLabel}</em></h2>
                  {out?.value != null ? <><p className="rv-head-s">{headline}</p>
                    <div className="rv-tiles">
                      <div className="hl"><b>{f1(need)}{reqUnit}</b><small>{reqLabel}</small></div>
                      <div><b>{f1(solvedInputs!.marginN)}%</b><small>EBITDA margin (year {N})</small></div>
                      <div><b>{f1(solvedInputs!.exitMultiple)}x</b><small>Exit multiple (EV/EBITDA)</small></div>
                      <div><b>{f1(solvedInputs!.r)}%</b><small>Discount rate</small></div>
                      <div><b>{N} years</b><small>Forecast window</small></div>
                    </div></> : <p className="rv-none" role="status">{out?.why ?? (problems.length ? problems.map((p) => p.text).join(" ") : "Fill in the assumptions to see the result.")}</p>}
                </section>

                {solvedInputs && (
                  <>
                    <section className="card rv-real" aria-labelledby="rv-real-h">
                      <h3 id="rv-real-h">Is it realistic?</h3>
                      <p className="rv-sub">The value the price needs, against what the company has done.</p>
                      {histRef != null && need != null ? (() => { const mx = Math.max(Math.abs(histRef), Math.abs(need), 1) * 1.15; const bar = (x: number, cls: string, lab: string, tip: string) => <div className={"rv-bar " + cls} key={lab}><i style={{ height: `${Math.max(3, (Math.abs(x) / mx) * 100)}%` }} /><b>{f1(x)}%</b><span>{lab}</span><u>{tip}</u></div>;
                        return <div className="rv-bars" role="img" aria-label={`Required ${f1(need)} percent against the company's own ${f1(histRef)} percent`}>{bar(histRef, "h", mode === "growth" ? `Company (last ${hist.years}Y CAGR)` : "Company (3Y average)", "history")}{bar(need, "n", "Required", "what the price needs")}</div>; })()
                        : <p className="rv-sub">{mode === "multiple" ? `The company trades today at ${f1(marketEv(inputs) / (hist.rev0 * hist.margin0 / 100))}x its latest EBITDA.` : "No history to compare this value with."}</p>}
                      {histRef != null && need != null && <p className="rv-sub">{need > histRef + 2 ? `The price needs ${f1(need - histRef)} points more than the company has delivered.` : need < histRef - 2 ? `The price needs ${f1(histRef - need)} points less than the company has delivered.` : "The price needs about what the company has delivered."}</p>}
                    </section>
                    <section className="card rv-irr" aria-labelledby="rv-irr-h">
                      <h3 id="rv-irr-h">Implied return (IRR)</h3>
                      {(() => { const r = mode === "return" ? { value: need, why: null } : solve(solvedInputs, "return"); return r.value != null ? <p className="rv-big">{f1(r.value)}% <small>a year</small></p> : <p className="rv-sub">{r.why}</p>; })()}
                      <p className="rv-sub">If these assumptions ({f1(solvedInputs.g)}% growth, {f1(solvedInputs.marginN)}% margin, {f1(solvedInputs.exitMultiple)}x multiple) play out, the annual return the current price implies. An answer, not a forecast.</p>
                    </section>
                    <section className="card rv-miss" aria-labelledby="rv-miss-h">
                      <div className="rv-mh"><h3 id="rv-miss-h">{side === "miss" ? "Miss scenarios" : "Upside scenarios"}</h3>
                        <span className="rv-seg" role="group" aria-label="Misses or beats"><button type="button" className={side === "miss" ? "on" : ""} aria-pressed={side === "miss"} onClick={() => setSide("miss")}>If it falls short</button><button type="button" className={side === "upside" ? "on" : ""} aria-pressed={side === "upside"} onClick={() => setSide("upside")}>If it beats</button></span></div>
                      <p className="rv-sub">How the value per share and the return change if an assumption moves from the bar the price needs. Today's price {rs(price, 2)}. The shock sizes are starting points, not forecasts.</p>
                      <div className="tw"><table><thead><tr><th>Scenario</th><th>Change in assumption</th><th className="r">Value per share</th><th className="r">Against today</th><th className="r">Implied return</th>{side === "miss" && <th className="r">Years to recover</th>}</tr></thead>
                        <tbody>{[...list, ...(mineRow ? [mineRow] : [])].map((m) => <tr key={m.key}><th scope="row"><span className={m.group === "upside" || (m.downside ?? 0) > 0 ? "rv-up" : "rv-dn"} aria-hidden="true">{(m.downside ?? 0) > 0 ? "▲" : "▼"}</span> {m.label}</th><td>{m.change || "—"}</td><td className="r">{pen(m.fair)}</td><td className={"r " + ((m.downside ?? 0) < 0 ? "neg" : "pos")}>{signed(m.downside)}</td><td className="r">{m.irr == null ? "—" : `${f1(m.irr)}%`}</td>{side === "miss" && <td className="r">{m.recover == null ? "—" : `${f1(m.recover)} yrs`}</td>}</tr>)}</tbody></table></div>
                      <details className="rv-adv"><summary>Try your own scenario</summary>
                        <div className="rv-own">{([["dg", "Growth change (points)"], ["dm", "Margin change (points)"], ["mult", "Exit multiple change (%)"], ["dr", "Discount rate change (points)"]] as const).map(([k, l]) => <label key={k}><span>{l}</span><input inputMode="decimal" value={mine[k]} onChange={(e) => setMine((o) => ({ ...o, [k]: e.target.value }))} placeholder="0" /></label>)}</div>
                        <p className="rv-note">Use a minus sign for a fall. Your scenario appears as the last row of the table.</p></details>
                    </section>
                    <section className="card rv-torn" aria-labelledby="rv-torn-h">
                      <h3 id="rv-torn-h">Which assumption the price depends on most</h3>
                      <p className="rv-sub">One shock at a time, ranked by how far it moves the value per share.</p>
                      <ol className="rv-tor">{torn.map((m) => { const mx = Math.max(...torn.map((x) => Math.abs(x.downside as number)), 1); return <li key={m.key}><span>{m.label.replace(", larger", "")} <small>{m.change}</small></span><i style={{ width: `${(Math.abs(m.downside as number) / mx) * 100}%` }} /><b>{signed(m.downside)}</b></li>; })}</ol>
                      {termShare != null && <p className="rv-sub">{f1(termShare * 100, 0)}% of the value sits after year {N}{termShare > 0.7 ? ", so small changes in the exit assumption move the answer a lot" : ""}. {opt.terminal === "multiple" ? "Switch the value after the last year to growth in perpetuity under Shape of the forecast to cross-check it." : "This uses growth in perpetuity; switch back to the exit multiple to compare."}</p>}
                    </section>
                    <section className="card rv-ev" aria-labelledby="rv-ev-h">
                      <h3 id="rv-ev-h">Weighted outcome <small>your judgment</small></h3>
                      <p className="rv-sub">Set how likely you think each case is. The weights are yours: the tool does not know the odds.</p>
                      <div className="rv-wt">{([["base", "Assumptions hold"], ["miss", "A miss"], ["severe", "A severe miss"]] as const).map(([k, l]) => <label key={k}><span>{l}</span><input type="number" min={0} max={100} value={wt[k]} onChange={(e) => setWt((o) => ({ ...o, [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))} /><em>%</em></label>)}</div>
                      <p className="rv-big sm">{ev8.value == null ? "—" : rs(ev8.value, 0)} <small>{ev8.pct == null ? "" : `${signed(ev8.pct)} against today's price`}{wt.base + wt.miss + wt.severe !== 100 ? " · the weights do not add to 100, so they are scaled" : ""}</small></p>
                    </section>
                    <section className="card rv-gr" aria-labelledby="rv-gr-h">
                      <h3 id="rv-gr-h">Two-way grid: value per share (₹)</h3>
                      <p className="rv-sub">Revenue growth down the side, final EBITDA margin across the top. The outlined cell is the one the price needs. Brighter cells are worth more than today's price; dimmer ones less.</p>
                      <div className="tw"><table className="rv-heat"><thead><tr><th scope="col" className="corner">Growth ↓ / Margin →</th>{gridCols.map((m) => <th key={m} scope="col">{f1(m)}%</th>)}</tr></thead>
                        <tbody>{gridRows.map((g, ri) => <tr key={g}><th scope="row">{f1(g)}%</th>{gridCols.map((m, ci) => { const x = grid[ri]?.[ci] ?? null, rel = x == null ? 0 : x / price; return <td key={m} className={(ri === 2 && ci === 2 ? "mid " : "") + (x == null ? "" : rel >= 1.05 ? "hi" : rel <= 0.95 ? "lo" : "eq") + (x != null && x >= price && ((grid[ri - 1]?.[ci] ?? Infinity) < price || (grid[ri]?.[ci - 1] ?? Infinity) < price) ? " edge" : "")} title={x == null ? "no value" : `${rel >= 1 ? "above" : "below"} today's price`}>{x == null ? "—" : nf(x, 0)}{ri === 2 && ci === 2 ? <span className="sr-only"> (the price needs this)</span> : null}</td>; })}</tr>)}</tbody></table></div>
                    </section>
                  </>
                )}
              </div>
              <section className="card rv-dr" aria-label="Assumptions, sources and sharing">
                <details><summary>Every assumption, its source and the date</summary>
                  <table><thead><tr><th>Input</th><th className="r">Value</th><th>Source</th></tr></thead><tbody>
                    <tr><th scope="row">Price</th><td className="r">{rs(price, 2)}</td><td>Latest price{c?.priceAsOf ? `, ${c.priceAsOf.slice(0, 10)}` : ""}</td></tr>
                    <tr><th scope="row">Market value</th><td className="r">{rs(c?.marketCap ?? null)} Cr</td><td>Price times shares</td></tr>
                    <tr><th scope="row">Net debt</th><td className="r">{rs(inputs.netDebt)} Cr</td><td>Borrowings less cash{c?.netDebt.period ? `, ${c.netDebt.period}` : ""}; leases are not added</td></tr>
                    <tr><th scope="row">Shares</th><td className="r">{f1(inputs.shares, 2)} crore</td><td>Diluted where reported</td></tr>
                    <tr><th scope="row">Revenue today</th><td className="r">{rs(inputs.rev0)} Cr</td><td>Reported, {hist.period}</td></tr>
                    <tr><th scope="row">EBITDA margin today</th><td className="r">{f1(inputs.margin0)}%</td><td>Operating profit over revenue, {hist.period}; before stock-based pay</td></tr>
                    <tr><th scope="row">Tax, depreciation, capex, working capital</th><td className="r">{f1(inputs.taxPct, 0)}% · {f1(inputs.depPct, 0)}% · {f1(inputs.capexPct, 0)}% · {f1(inputs.nwcPct, 0)}%</td><td>Defaults, editable above</td></tr>
                    <tr><th scope="row">Growth, margin, value after the last year</th><td className="r">{opt.growthPath === "fade" ? "fading" : "steady"} · {opt.marginPath === "scurve" ? "S-curve" : "straight"} · {opt.terminal === "multiple" ? "exit multiple" : `perpetuity ${termG}%`}</td><td>Your choice</td></tr></tbody></table></details>
                <div className="rv-share"><button type="button" className="btn" onClick={copy}>{copied ? "Link copied" : "Copy a link to this view"}</button><button type="button" className="btn" onClick={exportCsv}>Download the working (CSV)</button></div>
              </section>
              <p className="faint rv-foot">Reverse valuation shows what a price assumes from the company's reported figures and the assumptions on this page. It is not a forecast, a target price or a recommendation. Information only, not investment advice. Check: the projected value at the solved inputs is {solvedInputs ? `${rs(fairValue(solvedInputs), 2)} per share, equal to today's ${rs(price, 2)}` : "shown when a solution exists"}; enterprise value {solvedInputs ? `${rs(enterpriseValue(solvedInputs))} Cr` : "—"}.</p>
            </>
          )}
        </Gate>
      </div>
    </>
  );
}
