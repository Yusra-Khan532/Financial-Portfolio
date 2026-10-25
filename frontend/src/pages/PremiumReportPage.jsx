import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Download, FileText, RefreshCcw, ShieldCheck } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import CompanyBrowser from "@/components/CompanyBrowser";
import PremiumFinancialHistory from "@/components/PremiumFinancialHistory";
import PremiumInputCompleteness from "@/components/PremiumInputCompleteness";
import { premiumReportReview } from "@/lib/premiumReportReview";
import AdminShell from "@/components/cms/AdminShell";
import { cmsRequest } from "@/lib/cms";
import { startPremiumReportPolling } from "@/lib/premiumReportPolling";
import { rememberPremiumReport, currentPremiumReport, snapshotPDFRequest } from "@/lib/currentPremiumReport";

const field = "mt-2 h-12 w-full rounded-lg border border-[#2B3B51] bg-[#081322] px-3 text-sm text-white outline-none focus:border-[#D6AE62]";
const panel = "rounded-xl border border-[#26374D] bg-[#0A1626] p-5 sm:p-6";
const format = (value, digits = 1) => value == null ? "—" : Number(value).toLocaleString("en-IN", { maximumFractionDigits: digits });
const dateText = (value) => value ? new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Unavailable";
function FactorList({ title, rows, color, empty }) {
  return <div><h4 className={`text-sm font-semibold ${color}`}>{title}</h4>{rows.length ? <ul className="mt-3 space-y-4">{rows.map((row) => <li key={row.metric} className="border-t border-[#26374D] pt-3"><p className="text-sm text-[#D0D9E5]">{row.label} <span className="text-[#E7CA92]">· {row.valueText}</span></p>{row.summary ? <p className="mt-1 text-xs leading-5 text-[#93A4B9]">{row.summary}</p> : null}{row.comparisonText ? <p className="mt-2 text-xs leading-5 text-[#B6C5D8]">{row.comparisonText}</p> : null}</li>)}</ul> : <p className="mt-3 text-sm text-[#93A4B9]">{empty}</p>}</div>;
}

function CategoryReview({ part }) {
  return <section className={panel} aria-label={`${part.name} factors`}><div className="flex items-center justify-between gap-3"><h3 className="text-xl text-white">{part.name}</h3><p className="text-xl text-[#E7CA92]">{format(part.score)}<span className="ml-1 text-xs text-[#93A4B9]">/ 100</span></p></div>{part.notes?.map((note, i) => <p key={i} className="mt-4 border-l-2 border-[#8B7148] pl-3 text-sm leading-6 text-[#B6C5D8]">{note}</p>)}<div className="mt-6 grid gap-6 md:grid-cols-2"><FactorList title="Pros" rows={part.pros} color="text-[#84C8AD]" empty="No clear strengths identified." /><FactorList title="Cons" rows={part.cons} color="text-[#E0A0A0]" empty="No major concerns identified." /></div>{part.mixed.length ? <div className="mt-6 border-t border-[#26374D] pt-5"><FactorList title="Mixed factors" rows={part.mixed} color="text-[#D6AE62]" /></div> : null}{part.unavailable.length ? <div className="mt-6 border-t border-[#26374D] pt-5"><FactorList title="Unavailable information" rows={part.unavailable} color="text-[#93A4B9]" /></div> : null}</section>;
}

export function ReportDetail({ report, onDownload, downloading, onRefresh, refreshing }) {
  const rating = report.rating;
  const rated = rating.status !== "NOT RATED";
  const review = premiumReportReview(report);
  return <div className="mt-8 space-y-5" aria-label="Premium company report">
    <section className="relative overflow-hidden rounded-2xl border border-[#6A5635] bg-gradient-to-br from-[#172A43] via-[#0B1B30] to-[#07111F] p-6 sm:p-9">
      <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-[#D6AE62]/5 blur-3xl" />
      <div className="relative flex flex-wrap items-start justify-between gap-6"><div className="max-w-xl"><p className="text-[10px] uppercase tracking-[.25em] text-[#D6AE62]">FinLit Ventures · Premium equity research</p><h2 className="mt-4 font-serif-display text-3xl leading-tight text-white sm:text-4xl">{report.company.name}</h2><p className="mt-3 text-sm text-[#B1C0D3]">{report.company.symbol} · {report.company.industry || "Industry unavailable"}</p><p className="mt-2 text-xs text-[#93A4B9]">{report.statementType} statements</p></div>
      <div className="flex flex-wrap gap-3"><button type="button" onClick={onDownload} disabled={downloading} className="inline-flex items-center gap-2 rounded-lg bg-[#D6AE62] px-5 py-3 text-sm font-semibold text-[#0A1423] disabled:opacity-50"><Download size={16} />{downloading ? "Preparing PDF…" : "Download PDF"}</button><button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-[#62748E] px-4 py-3 text-sm text-[#D0D9E5] disabled:opacity-50"><RefreshCcw size={15} />Recalculate</button></div></div>
      <div className="relative mt-8 grid gap-7 md:grid-cols-[160px_minmax(0,1fr)] md:items-center">
        <div className="flex h-36 w-36 flex-col items-center justify-center rounded-full border-4 border-[#D6AE62]/65 bg-[#07111F]/50"><strong className={`${rated ? "text-4xl" : "text-lg"} text-white`}>{rated ? format(rating.final) : "NOT RATED"}</strong><span className="mt-2 text-[10px] uppercase tracking-[.15em] text-[#A7B6C9]">{rated ? "Health score / 100" : "Insufficient evidence"}</span></div>
        <div><div className="flex flex-wrap items-center gap-3"><span className="text-xl font-medium text-[#E7CA92]">{rating.label}</span><span className="rounded-full border border-[#62748E] px-3 py-1 text-[10px] tracking-widest text-[#D0D9E5]">{rating.status}</span></div><p className="mt-4 max-w-2xl text-sm leading-6 text-[#CFD9E7]">Financial health assessment across business performance, valuation, financial quality and market risk.</p><div className="mt-5 flex items-center gap-2 text-sm text-[#84C8AD]"><ShieldCheck size={16} />{format(rating.confidence * 100, 0)}% data coverage · {rating.judgedQuarters} comparable quarters</div><p className="mt-2 text-xs text-[#93A4B9]">Data coverage shows how much of the required information is available.</p></div>
      </div>
      <p className="mt-7 border-t border-[#384960] pt-4 text-xs text-[#93A4B9]">Generated {dateText(report.createdAt)} IST</p>
    </section>

    <section aria-label="Score components" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{["fundamental", "valuation", "quality", "risk"].map((key) => <div key={key} className={panel}><div className="flex justify-between text-xs uppercase tracking-wider text-[#93A4B9]"><h3>{key}</h3></div><p className="mt-4 text-3xl text-white">{rated ? format(rating.parts[key]) : "—"}<span className="ml-1 text-xs text-[#93A4B9]">/ 100</span></p><div className="mt-4 h-1.5 overflow-hidden rounded bg-[#26374D]"><div className="h-full bg-[#D6AE62]" style={{ width: `${rated ? rating.parts[key] || 0 : 0}%` }} /></div><p className="mt-3 text-xs text-[#93A4B9]">{format(rating.coverage[key] * 100, 0)}% data coverage</p></div>)}</section>
    <PremiumInputCompleteness completeness={review.completeness} className={panel} />
    <section className={panel}><h3 className="text-lg text-white">Data freshness</h3><div className="mt-4 grid gap-4 sm:grid-cols-3 xl:grid-cols-5">{[["quarterlyAsOf", "Quarterly results"], ["annualAsOf", "Annual results"], ["balanceAsOf", "Balance sheet"], ["ownershipAsOf", "Ownership"], ["priceAsOf", "Market price"]].map(([key, label]) => <div key={key}><p className="text-xs text-[#93A4B9]">{label}</p><p className="mt-2 text-sm text-[#D0D9E5]">{report.inputMeta[key] || "Unavailable"}</p></div>)}</div></section>
    {report.trends.length ? <section className={panel}><h3 className="text-xl text-white">Business performance</h3><p className="mt-2 text-xs text-[#93A4B9]">Annual revenue{["BANK", "NBFC"].includes(rating.group) ? " (net interest income)" : rating.group === "INSURANCE" ? " (net premium)" : ""} and net profit in ₹ crore; EPS in ₹ per share.</p><div className="mt-6 h-72 min-w-0"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={report.trends} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}><CartesianGrid stroke="#26374D" vertical={false} /><XAxis dataKey="period" stroke="#93A4B9" fontSize={11} /><YAxis yAxisId="amount" stroke="#93A4B9" fontSize={10} width={55} tickFormatter={(v) => format(v, 0)} /><YAxis yAxisId="eps" orientation="right" stroke="#8DAEF1" fontSize={10} width={40} /><Tooltip contentStyle={{ background: "#0B1B30", border: "1px solid #384960", color: "white" }} formatter={(value, name) => [`${format(value, 2)} ${name === "EPS" ? "₹/share" : "Cr"}`, name]} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar yAxisId="amount" dataKey="revenue" name="Revenue / NII" fill="#D6AE62" radius={[3,3,0,0]} /><Bar yAxisId="amount" dataKey="profit" name="Net profit" fill="#68BDA4" radius={[3,3,0,0]} /><Line yAxisId="eps" dataKey="eps" name="EPS" stroke="#8DAEF1" strokeWidth={2} connectNulls={false} /></ComposedChart></ResponsiveContainer></div></section> : null}
    <section className="space-y-5" aria-label="Category pros and cons"><div><h2 className="text-2xl text-white">What supports the assessment and what needs attention</h2><p className="mt-3 text-sm leading-6 text-[#93A4B9]">Pros and cons reflect the company's assessment for its industry. Mixed results and unavailable information are shown separately. A higher Risk score indicates lower assessed risk.</p></div>{review.parts.map((part) => <CategoryReview key={part.key} part={part} />)}</section>
    {review.notes.length ? <section className={panel}><h3 className="text-lg text-white">Review notes</h3><ul className="mt-4 space-y-3">{review.notes.map((note, i) => <li key={i} className="border-l-2 border-[#8B7148] pl-3 text-sm leading-6 text-[#B6C5D8]">{note}</li>)}</ul></section> : null}
    <PremiumFinancialHistory report={report} />
    <section className={panel}><p className="text-xs leading-6 text-[#93A4B9]">This report assesses financial health using available financial and market information, with estimates where information is missing. It is not an investment recommendation or a prediction of future returns. The report is available for 30 minutes. Download the PDF to keep a copy.</p></section>
  </div>;
}

export default function PremiumReportPage() {
  const navigate = useNavigate();
  const companyInput = useRef(null);
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
  const [connectionIssue, setConnectionIssue] = useState("");
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
    setReport(null); setError(""); setConnectionIssue("");
    if (!reportId) { setLoading(false); return undefined; }
    const snapshot = currentPremiumReport(reportId);
    if (snapshot) { setReport(snapshot); setLoading(false); return undefined; }
    setLoading(true);
    return startPremiumReportPolling({
      load: (signal) => cmsRequest(`/premium-reports/${reportId}`, { signal }),
      onData: (data) => { setReport(data); setLoading(false); setConnectionIssue(""); },
      onRetry: (delay) => { setLoading(false); setConnectionIssue(`The connection was interrupted. Retrying automatically in ${Math.ceil(delay / 1000)} seconds. Your report may still be generating.`); },
      onError: (err) => { setLoading(false); setConnectionIssue(""); if (err.status === 404) setReport(null); if (err.status === 401) navigate("/blog/admin/login", { replace: true }); else setError(err.message); },
    });
  }, [reportId, retry, navigate]);
  const generate = async (symbol = query, statement = basis) => {
    setSubmitting(true); setError("");
    try {
      const data = await cmsRequest("/premium-reports", { method: "POST", body: JSON.stringify({ query: symbol.trim(), statement_type: statement, delivery: "inline" }) });
      if (data.state === "ready" && data.snapshotReceipt) rememberPremiumReport(data);
      navigate(`/blog/admin/premium-reports/${data.id}`);
    }
    catch (err) { authError(err); }
    finally { setSubmitting(false); }
  };
  const download = async () => {
    setDownloading(true); setError("");
    try {
      let downloadUrl;
      let objectUrl;
      if (report.snapshotReceipt) {
        const pdf = await cmsRequest("/premium-reports/pdf", { method: "POST", body: JSON.stringify(snapshotPDFRequest(report)), responseType: "blob" });
        objectUrl = URL.createObjectURL(pdf);
        downloadUrl = objectUrl;
      } else {
        const link = await cmsRequest(`/premium-reports/${reportId}/download-link`, { method: "POST" });
        downloadUrl = `${process.env.REACT_APP_BACKEND_URL || ""}${link.url}`;
      }
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      anchor.download = `FinLit-Premium-${report.company.symbol}-${reportId.slice(0,8)}.pdf`;
      anchor.rel = "noreferrer";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
    } catch (err) { authError(err); } finally { setDownloading(false); }
  };
  const busy = submitting || report?.state === "generating";
  return <AdminShell><div className="mx-auto mt-7 max-w-6xl text-white"><Link to="/blog/admin" className="inline-flex items-center gap-2 text-sm text-[#D6AE62]"><ArrowLeft size={15} />Back to CMS</Link><header className="mb-7 mt-6"><p className="text-[10px] uppercase tracking-[.25em] text-[#D6AE62]">Research on demand</p><h1 className="mt-3 font-serif-display text-4xl text-white sm:text-5xl">Premium Report</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-[#93A4B9]">Review a company’s financial health, strengths and concerns, and download the report as a PDF.</p></header>
    <div className="mb-5"><CompanyBrowser profile={report?.company} actionLabel="Select" description="Find companies by sector or industry, then select one for your premium report." selectionDisabled={busy} onOpen={(company) => { setQuery(company.symbol); setError(""); companyInput.current?.focus(); }} onAuthError={() => navigate("/blog/admin/login", { replace: true })} /></div>
    <form className={panel} onSubmit={(e) => { e.preventDefault(); generate(); }}><div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_200px_auto] md:items-end"><label className="text-xs text-[#B6C5D8]">Company<input ref={companyInput} className={field} list="premium-company-suggestions" placeholder="Company name, symbol or ISIN" value={query} onChange={(e) => setQuery(e.target.value)} required minLength={2} maxLength={80} /><datalist id="premium-company-suggestions">{suggestions.map((row) => <option key={row.instrumentKey || row.symbol} value={row.symbol}>{row.name}</option>)}</datalist></label><label className="text-xs text-[#B6C5D8]">Statement basis<select className={field} value={basis} onChange={(e) => setBasis(e.target.value)}><option value="consolidated">Consolidated</option><option value="standalone">Standalone</option></select></label><button disabled={busy || query.trim().length < 2} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#D6AE62] px-5 text-sm font-semibold text-[#081322] disabled:opacity-40"><FileText size={16} />{busy ? "Generating…" : "Generate Report"}</button></div><p className="mt-4 text-xs leading-5 text-[#71839A]">Your report may take a few minutes to prepare. Keep this tab open until it is ready.</p></form>
    {error ? <div role="alert" className="mt-5 rounded-lg border border-[#A16666] bg-[#3A2026] p-4 text-sm text-[#F0C2C2]">{error}{reportId ? <Link to="/blog/admin/premium-reports" className="ml-3 underline">Generate a new report</Link> : null}{reportId ? <button className="ml-3 underline" onClick={() => setRetry(retry + 1)}>Retry loading</button> : null}</div> : null}
    {submitting ? <p role="status" className="mt-5 text-sm text-[#93A4B9]">Preparing your company report. This can take a few minutes; keep this tab open…</p> : null}
    {connectionIssue ? <p role="status" className="mt-5 rounded-lg border border-[#62748E] p-4 text-sm text-[#D6AE62]">{connectionIssue}</p> : null}
    {loading ? <p role="status" className="py-10 text-center text-[#93A4B9]">Loading report…</p> : null}
    {report?.state === "generating" ? <section role="status" className={`${panel} mt-6`}><div className="flex items-center gap-3"><RefreshCcw size={20} className="animate-spin text-[#D6AE62]" /><h2 className="text-xl">Preparing {report.company.name}</h2></div><p className="mt-3 text-sm leading-6 text-[#93A4B9]">Reviewing financial results and market information. Keep this page open until your report is ready.</p></section> : null}
    {report?.state === "failed" ? <section role="alert" className={`${panel} mt-6`}><h2 className="text-xl">Report generation interrupted</h2><p className="mt-3 text-sm text-[#93A4B9]">{report.error}</p><button disabled={submitting} onClick={() => generate(report.company.symbol, report.statementType)} className="mt-4 rounded border border-[#D6AE62] px-4 py-2 text-sm text-[#D6AE62]">Generate again</button></section> : null}
    {report?.state === "ready" ? <ReportDetail key={report.id} report={report} onDownload={download} downloading={downloading} onRefresh={() => generate(report.company.symbol, report.statementType)} refreshing={submitting} /> : null}

  </div></AdminShell>;
}
