import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileText, RefreshCcw, ShieldCheck } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PremiumCalculationTrace from "@/components/PremiumCalculationTrace";
import AdminShell from "@/components/cms/AdminShell";
import { cmsRequest } from "@/lib/cms";

const field = "mt-2 h-12 w-full rounded-lg border border-[#2B3B51] bg-[#081322] px-3 text-sm text-white outline-none focus:border-[#D6AE62]";
const panel = "rounded-xl border border-[#26374D] bg-[#0A1626] p-5 sm:p-6";
const format = (value, digits = 1) => value == null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: digits });
const dateText = (value) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Unavailable";
const stateColor = (severity) => severity === "RED" ? "text-[#E0A0A0]" : severity === "AMBER" ? "text-[#D6AE62]" : severity === "GREEN" ? "text-[#84C8AD]" : "text-[#93A4B9]";

function DriverCard({ title, rows, loss }) {
  return <section className={panel}><h3 className="text-lg font-medium text-white">{title}</h3>{rows.length ? <div className="mt-4 space-y-4">{rows.map((row) => <div key={row.metric} className="border-t border-[#26374D] pt-3"><div className="flex justify-between gap-3"><span className="text-sm text-[#D0D9E5]">{row.label}</span><span className={`whitespace-nowrap text-sm ${loss ? "text-[#E0A0A0]" : "text-[#84C8AD]"}`}>{loss ? "−" : "+"}{format(loss ? row.pointsLost : row.pointsEarned, 2)} pts</span></div><p className="mt-1 text-xs text-[#93A4B9]">Metric score {format(row.points)}/100{row.details?.note ? ` · ${row.details.note}` : ""}</p></div>)}</div> : <p className="mt-4 text-sm text-[#93A4B9]">No qualifying {loss ? "red-level concerns" : "strengths"} identified from actual or substituted data.</p>}</section>;
}

function ReportDetail({ report, onDownload, downloading, onRefresh, refreshing }) {
  const rating = report.rating;
  const rated = rating.status !== "NOT RATED";
  const [part, setPart] = useState("all");
  const [audit, setAudit] = useState(false);
  const rows = rating.metrics.filter((row) => part === "all" || row.part === part);
  const missing = rating.metrics.filter((row) => ["F", "L"].includes(row.status));
  return <div className="mt-8 space-y-5" aria-label="Premium company report">
    <section className="relative overflow-hidden rounded-2xl border border-[#6A5635] bg-gradient-to-br from-[#172A43] via-[#0B1B30] to-[#07111F] p-6 sm:p-9">
      <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-[#D6AE62]/5 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-6"><div className="max-w-xl"><p className="text-[10px] uppercase tracking-[.25em] text-[#D6AE62]">FinLit Ventures · Premium equity research</p><h2 className="mt-4 font-serif-display text-3xl leading-tight text-white sm:text-4xl">{report.company.name}</h2><p className="mt-3 text-sm text-[#B1C0D3]">{report.company.symbol} · {report.company.industry || "Industry unavailable"}</p><p className="mt-2 text-xs text-[#93A4B9]">{report.statementType} statements · Model {rating.modelVersion} · Group {rating.group}</p></div>
      <div className="flex flex-wrap gap-3"><button type="button" onClick={onDownload} disabled={downloading} className="inline-flex items-center gap-2 rounded-lg bg-[#D6AE62] px-5 py-3 text-sm font-semibold text-[#0A1423] disabled:opacity-50"><Download size={16} />{downloading ? "Preparing PDF…" : "Download PDF"}</button><button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-[#62748E] px-4 py-3 text-sm text-[#D0D9E5] disabled:opacity-50"><RefreshCcw size={15} />Recalculate</button></div></div>
      <div className="relative mt-8 grid gap-7 md:grid-cols-[160px_minmax(0,1fr)] md:items-center">
        <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full border-4 border-[#D6AE62]/65 bg-[#07111F]/50"><strong className={`${rated ? "text-4xl" : "text-lg"} text-white`}>{rated ? format(rating.final) : "NOT RATED"}</strong><span className="mt-2 text-[10px] uppercase tracking-[.15em] text-[#A7B6C9]">{rated ? "Health score / 100" : "Insufficient evidence"}</span></div>
        <div><div className="flex flex-wrap items-center gap-3"><span className="text-xl font-medium text-[#E7CA92]">{rating.label}</span><span className="rounded-full border border-[#62748E] px-3 py-1 text-[10px] tracking-widest text-[#D0D9E5]">{rating.status}</span></div><p className="mt-4 max-w-2xl text-sm leading-6 text-[#CFD9E7]">{rating.headline}</p><div className="mt-5 flex items-center gap-2 text-sm text-[#84C8AD]"><ShieldCheck size={16} />{format(rating.confidence * 100, 0)}% input coverage · {rating.judgedQuarters} comparable quarters</div><p className="mt-2 text-xs text-[#93A4B9]">Input coverage measures available data; it does not establish predictive accuracy.</p></div>
      </div>
      <p className="mt-7 border-t border-[#384960] pt-4 text-xs text-[#93A4B9]">Generated {dateText(report.createdAt)} IST · Calculation {report.id.slice(0, 12)} · Downloading uses this exact report.</p>
    </section>

    <section aria-label="Score components" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(rating.partWeights).map(([key, weight]) => <div key={key} className={panel}><div className="flex justify-between text-xs uppercase tracking-wider text-[#93A4B9]"><h3>{key}</h3><span>{Math.round(weight * 100)}% weight</span></div><p className="mt-4 text-3xl text-white">{rated ? format(rating.parts[key]) : "—"}<span className="ml-1 text-xs text-[#93A4B9]">/ 100</span></p><div className="mt-4 h-1.5 overflow-hidden rounded bg-[#26374D]"><div className="h-full bg-[#D6AE62]" style={{ width: `${rated ? rating.parts[key] || 0 : 0}%` }} /></div><p className="mt-3 text-xs text-[#93A4B9]">{format(rating.coverage[key] * 100, 0)}% real-data coverage</p></div>)}</section>
    <section className={panel}><h3 className="text-lg text-white">Data freshness</h3><div className="mt-4 grid gap-4 sm:grid-cols-3 xl:grid-cols-5">{[["quarterlyAsOf", "Quarterly results"], ["annualAsOf", "Annual results"], ["balanceAsOf", "Balance sheet"], ["ownershipAsOf", "Ownership"], ["priceAsOf", "Market price"]].map(([key, label]) => <div key={key}><p className="text-xs text-[#93A4B9]">{label}</p><p className="mt-2 text-sm text-[#D0D9E5]">{report.inputMeta[key] || "Unavailable"}</p></div>)}</div></section>
    {report.trends.length ? <section className={panel}><h3 className="text-xl text-white">Business performance</h3><p className="mt-2 text-xs text-[#93A4B9]">Annual revenue{["BANK", "NBFC"].includes(rating.group) ? " (net interest income)" : rating.group === "INSURANCE" ? " (net premium)" : ""} and net profit in ₹ crore; EPS in ₹ per share.</p><div className="mt-6 h-72 min-w-0"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={report.trends} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}><CartesianGrid stroke="#26374D" vertical={false} /><XAxis dataKey="period" stroke="#93A4B9" fontSize={11} /><YAxis yAxisId="amount" stroke="#93A4B9" fontSize={10} width={55} tickFormatter={(v) => format(v, 0)} /><YAxis yAxisId="eps" orientation="right" stroke="#8DAEF1" fontSize={10} width={40} /><Tooltip contentStyle={{ background: "#0B1B30", border: "1px solid #384960", color: "white" }} formatter={(value, name) => [`${format(value, 2)} ${name === "EPS" ? "₹/share" : "Cr"}`, name]} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar yAxisId="amount" dataKey="revenue" name="Revenue / NII" fill="#D6AE62" radius={[3,3,0,0]} /><Bar yAxisId="amount" dataKey="profit" name="Net profit" fill="#68BDA4" radius={[3,3,0,0]} /><Line yAxisId="eps" dataKey="eps" name="EPS" stroke="#8DAEF1" strokeWidth={2} connectNulls={false} /></ComposedChart></ResponsiveContainer></div></section> : null}
    <div className="grid gap-5 lg:grid-cols-2"><DriverCard title="What supports the score" rows={rating.strengths} /><DriverCard title="What holds the score back" rows={rating.weaknesses} loss /></div>
    <section className={panel}><h3 className="text-lg text-white">Alerts & data limitations</h3><div className="mt-4 space-y-3">{[...rating.alerts, ...report.warnings].map((alert, i) => <p key={i} className="border-l-2 border-[#8B7148] pl-3 text-sm leading-6 text-[#B6C5D8]">{alert}</p>)}</div><p className="mt-4 text-xs text-[#93A4B9]">{missing.length} weighted metrics use a group fill or have no supplied pledge. Filled metrics are excluded from the strengths and concerns lists.</p></section>
    <section className={panel}><div className="flex flex-wrap items-center justify-between gap-4"><div><h3 className="text-xl text-white">Detailed scorecard</h3><p className="mt-2 text-xs text-[#93A4B9]">Inspect each value, model points and data status. Expand a metric for its calculation context.</p></div><label className="text-xs text-[#93A4B9]">Component<select className={`${field} min-w-40`} value={part} onChange={(e) => setPart(e.target.value)}><option value="all">All components</option>{Object.keys(rating.parts).map((key) => <option key={key} value={key}>{key}</option>)}</select></label></div>
    <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="text-[10px] uppercase tracking-widest text-[#D6AE62]"><tr>{["Metric", "Value", "Points / 100", "Status", "Weight in part"].map((value) => <th key={value} className="p-3 font-medium">{value}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.metric} className="border-t border-[#26374D] align-top"><td className="p-3"><details><summary className="cursor-pointer text-[#D0D9E5]">{row.label}</summary><div className="mt-3 max-w-sm space-y-2 text-xs leading-5 text-[#93A4B9]"><p>{row.details?.note || row.details?.basis || "Calculated from the available reported inputs using the selected group’s model rules."}</p>{row.worst != null ? <p>Scale: {format(row.worst, 2)} → 0 points; {format(row.best, 2)} → 100 points.</p> : null}{row.details?.current != null ? <p>Current {format(row.details.current,2)} · Comparison {format(row.details.previous,2)}</p> : null}{row.details?.judged != null ? <p>{row.details.good} good quarters · {row.details.slips} slips · {row.details.judged} judged</p> : null}{row.status === "F" ? <p>Assumption from group-fill snapshot {rating.fillVersion}; counts as missing in confidence.</p> : null}<p>Final-score contribution: {format(row.pointsEarned,2)} points. Shortfall: {format(row.pointsLost,2)} points.</p></div></details></td><td className="p-3 tabular-nums text-[#B6C5D8]">{format(row.value,2)}{row.value != null && row.unit ? ` ${row.unit}` : ""}</td><td className="p-3 tabular-nums text-white">{format(row.points)}</td><td className={`p-3 text-xs ${stateColor(row.severity)}`}>{row.statusLabel}<div className="mt-1 text-[10px]">{row.severity}</div></td><td className="p-3 text-[#93A4B9]">{row.weight}</td></tr>)}</tbody></table></div>
    {rating.valuationCapped ? <p className="mt-4 text-xs text-[#D6AE62]">Weak-business cap applied: −{format(rating.capPointsLost,2)} final-score points.</p> : null}</section>
    <PremiumCalculationTrace report={report} />
    <section className={panel}><h3 className="text-lg text-white">Methodology & source audit</h3><p className="mt-3 text-sm leading-6 text-[#B6C5D8]">Supplied FinLit {rating.baselineVersion} model, engine {rating.modelVersion}. The engine checks reporting-period alignment, reconciles share counts and valuation ratios, and handles missing histories, valid zero inputs and loss cases. Data-quality warnings are shown separately; scoring thresholds and weights follow the supplied model. Financials and EPS use one statement basis throughout. The model rating is independent of dashboard chart settings.</p><p className="mt-3 text-sm leading-6 text-[#93A4B9]">Industry benchmark: {report.benchmark.source} · {report.benchmark.fetchedCount}/{report.benchmark.universeCount} current peer observations · as of {report.benchmark.asOf}. {report.benchmark.note}</p><button type="button" className="mt-4 text-sm text-[#D6AE62] underline" aria-expanded={audit} onClick={() => setAudit(!audit)}>{audit ? "Hide source details" : "Show source details"}</button>{audit ? <div className="mt-4 space-y-2">{report.sources.map((source) => <p key={source.section} className="break-words text-xs text-[#93A4B9]">{source.section} · {source.available ? "Retrieved" : "Unavailable"} · {dateText(source.retrievedAt)} IST</p>)}<p className="break-all text-[10px] text-[#71839A]">Input hash: {report.inputHash}</p></div> : null}<p className="mt-5 border-t border-[#26374D] pt-4 text-xs leading-6 text-[#93A4B9]">This report assesses financial health using reported and model-filled data. It is not a target price or investment recommendation. Reports are temporary and expire after 30 minutes or a server restart. Download the PDF to keep a copy.</p></section>
  </div>;
}

export default function PremiumReportPage() {
  const navigate = useNavigate();
  const { reportId } = useParams();
  const [query, setQuery] = useState("");
  const [basis, setBasis] = useState("consolidated");
  const [suggestions, setSuggestions] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const authError = (err) => { if (err.status === 401) navigate("/blog/admin/login", { replace: true }); else setError(err.message); };
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (query.trim().length < 2) { setSuggestions([]); return; }
      cmsRequest(`/stocks/admin/fundamentals/search?query=${encodeURIComponent(query.trim())}`, { signal: controller.signal }).then((data) => { if (!controller.signal.aborted) setSuggestions(data.items); }).catch((err) => { if (!controller.signal.aborted && err.status === 401) navigate("/blog/admin/login", { replace: true }); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, navigate]);
  useEffect(() => {
    setReport(null); setError("");
    if (!reportId) { setLoading(false); return undefined; }
    const controller = new AbortController();
    let timer;
    setLoading(true);
    const poll = async () => {
      try {
        const data = await cmsRequest(`/premium-reports/${reportId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setReport(data); setLoading(false);
        if (data.state === "generating") timer = setTimeout(poll, 2500);
      } catch (err) {
        if (!controller.signal.aborted) { setLoading(false); if (err.status === 401) navigate("/blog/admin/login", { replace: true }); else setError(err.message); }
      }
    };
    poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [reportId, retry, navigate]);
  const generate = async (symbol = query, statement = basis) => {
    setSubmitting(true); setError("");
    try { const data = await cmsRequest("/premium-reports", { method: "POST", body: JSON.stringify({ query: symbol.trim(), statement_type: statement }) }); navigate(`/blog/admin/premium-reports/${data.id}`); }
    catch (err) { authError(err); }
    finally { setSubmitting(false); }
  };
  const download = async () => {
    setDownloading(true); setError("");
    try {
      const link = await cmsRequest(`/premium-reports/${reportId}/download-link`, { method: "POST" });
      const anchor = document.createElement("a");
      anchor.href = `${process.env.REACT_APP_BACKEND_URL || ""}${link.url}`;
      anchor.download = `FinLit-Premium-${report.company.symbol}-${reportId.slice(0,8)}.pdf`;
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
    } catch (err) { authError(err); } finally { setDownloading(false); }
  };
  const busy = submitting || report?.state === "generating";
  return <AdminShell><div className="mx-auto mt-7 max-w-6xl text-white"><Link to="/blog/admin" className="inline-flex items-center gap-2 text-sm text-[#D6AE62]"><ArrowLeft size={15} />Back to CMS</Link><header className="mb-7 mt-6"><p className="text-[10px] uppercase tracking-[.25em] text-[#D6AE62]">Research on demand</p><h1 className="mt-3 font-serif-display text-4xl text-white sm:text-5xl">Premium Report</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-[#93A4B9]">Generate an explainable company health assessment, inspect the data behind it and download the report as a PDF.</p></header>
    <form className={panel} onSubmit={(e) => { e.preventDefault(); generate(); }}><div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_200px_auto] md:items-end"><label className="text-xs text-[#B6C5D8]">Company<input className={field} list="premium-company-suggestions" placeholder="Company name, symbol or ISIN" value={query} onChange={(e) => setQuery(e.target.value)} required minLength={2} maxLength={80} /><datalist id="premium-company-suggestions">{suggestions.map((row) => <option key={row.instrumentKey || row.symbol} value={row.symbol}>{row.name}</option>)}</datalist></label><label className="text-xs text-[#B6C5D8]">Statement basis<select className={field} value={basis} onChange={(e) => setBasis(e.target.value)}><option value="consolidated">Consolidated</option><option value="standalone">Standalone</option></select></label><button disabled={busy || query.trim().length < 2} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#D6AE62] px-5 text-sm font-semibold text-[#081322] disabled:opacity-40"><FileText size={16} />{busy ? "Generating…" : "Generate Report"}</button></div><p className="mt-4 text-xs leading-5 text-[#71839A]">Generation can take a few minutes while financial history and peer benchmarks load. Reports are generated on demand and are not saved to a report history.</p></form>
    {error ? <div role="alert" className="mt-5 rounded-lg border border-[#A16666] bg-[#3A2026] p-4 text-sm text-[#F0C2C2]">{error}{reportId ? <Link to="/blog/admin/premium-reports" className="ml-3 underline">Generate a new report</Link> : null}{reportId ? <button className="ml-3 underline" onClick={() => setRetry(retry + 1)}>Retry loading</button> : null}</div> : null}
    {loading ? <p role="status" className="py-10 text-center text-[#93A4B9]">Loading report…</p> : null}
    {report?.state === "generating" ? <section role="status" className={`${panel} mt-6`}><div className="flex items-center gap-3"><RefreshCcw size={20} className="animate-spin text-[#D6AE62]" /><h2 className="text-xl">Preparing {report.company.name}</h2></div><p className="mt-3 text-sm leading-6 text-[#93A4B9]">Fetching the selected statement basis, checking date coverage and calculating the model. Keep this page open until generation finishes.</p></section> : null}
    {report?.state === "failed" ? <section role="alert" className={`${panel} mt-6`}><h2 className="text-xl">Report generation interrupted</h2><p className="mt-3 text-sm text-[#93A4B9]">{report.error}</p><button disabled={submitting} onClick={() => generate(report.company.symbol, report.statementType)} className="mt-4 rounded border border-[#D6AE62] px-4 py-2 text-sm text-[#D6AE62]">Generate again</button></section> : null}
    {report?.state === "ready" ? <ReportDetail key={report.id} report={report} onDownload={download} downloading={downloading} onRefresh={() => generate(report.company.symbol, report.statementType)} refreshing={submitting} /> : null}

  </div></AdminShell>;
}
