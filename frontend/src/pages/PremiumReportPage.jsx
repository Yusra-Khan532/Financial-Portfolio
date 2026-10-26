import { useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, RefreshCcw } from "lucide-react";
import CompanyBrowser from "@/components/CompanyBrowser";
import PremiumReportDetail from "@/components/PremiumReportDetail";
import AdminShell from "@/components/cms/AdminShell";
import usePremiumReport from "@/hooks/usePremiumReport";

const field = "mt-2 h-12 w-full rounded-lg border border-[#2B3B51] bg-[#081322] px-3 text-sm text-white outline-none focus:border-[#D6AE62]";
const panel = "rounded-xl border border-[#26374D] bg-[#0A1626] p-5 sm:p-6";

export default function PremiumReportPage() {
  const navigate = useNavigate();
  const companyInput = useRef(null);
  const { reportId } = useParams();
  const {
    query, setQuery, basis, setBasis, suggestions, report, loading,
    submitting, downloading, error, setError, connectionIssue,
    busy, retryLoading, generate, download,
  } = usePremiumReport({ reportId, navigate });
  return <AdminShell><div className="mx-auto mt-7 max-w-6xl text-white"><Link to="/blog/admin" className="inline-flex items-center gap-2 text-sm text-[#D6AE62]"><ArrowLeft size={15} />Back to CMS</Link><header className="mb-7 mt-6"><p className="text-[10px] uppercase tracking-[.25em] text-[#D6AE62]">Research on demand</p><h1 className="mt-3 font-serif-display text-4xl text-white sm:text-5xl">Premium Report</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-[#93A4B9]">Review a company’s financial health, strengths and concerns, and download the report as a PDF.</p></header>
    <div className="mb-5"><CompanyBrowser profile={report?.company} actionLabel="Select" description="Find companies by sector or industry, then select one for your premium report." selectionDisabled={busy} onOpen={(company) => { setQuery(company.symbol); setError(""); companyInput.current?.focus(); }} onAuthError={() => navigate("/blog/admin/login", { replace: true })} /></div>
    <form className={panel} onSubmit={(e) => { e.preventDefault(); generate(); }}><div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_200px_auto] md:items-end"><label className="text-xs text-[#B6C5D8]">Company<input ref={companyInput} className={field} list="premium-company-suggestions" placeholder="Company name, symbol or ISIN" value={query} onChange={(e) => setQuery(e.target.value)} required minLength={2} maxLength={80} /><datalist id="premium-company-suggestions">{suggestions.map((row) => <option key={row.instrumentKey || row.symbol} value={row.symbol}>{row.name}</option>)}</datalist></label><label className="text-xs text-[#B6C5D8]">Statement basis<select className={field} value={basis} onChange={(e) => setBasis(e.target.value)}><option value="consolidated">Consolidated</option><option value="standalone">Standalone</option></select></label><button disabled={busy || query.trim().length < 2} className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-[#D6AE62] px-5 text-sm font-semibold text-[#081322] disabled:opacity-40"><FileText size={16} />{busy ? "Generating…" : "Generate Report"}</button></div><p className="mt-4 text-xs leading-5 text-[#71839A]">Your report may take a few minutes to prepare. Keep this tab open until it is ready.</p></form>
    {error ? <div role="alert" className="mt-5 rounded-lg border border-[#A16666] bg-[#3A2026] p-4 text-sm text-[#F0C2C2]">{error}{reportId ? <Link to="/blog/admin/premium-reports" className="ml-3 underline">Generate a new report</Link> : null}{reportId ? <button className="ml-3 underline" onClick={retryLoading}>Retry loading</button> : null}</div> : null}
    {submitting ? <p role="status" className="mt-5 text-sm text-[#93A4B9]">Preparing your company report. This can take a few minutes; keep this tab open…</p> : null}
    {connectionIssue ? <p role="status" className="mt-5 rounded-lg border border-[#62748E] p-4 text-sm text-[#D6AE62]">{connectionIssue}</p> : null}
    {loading ? <p role="status" className="py-10 text-center text-[#93A4B9]">Loading report…</p> : null}
    {report?.state === "generating" ? <section role="status" className={`${panel} mt-6`}><div className="flex items-center gap-3"><RefreshCcw size={20} className="animate-spin text-[#D6AE62]" /><h2 className="text-xl">Preparing {report.company.name}</h2></div><p className="mt-3 text-sm leading-6 text-[#93A4B9]">Reviewing financial results and market information. Keep this page open until your report is ready.</p></section> : null}
    {report?.state === "failed" ? <section role="alert" className={`${panel} mt-6`}><h2 className="text-xl">Report generation interrupted</h2><p className="mt-3 text-sm text-[#93A4B9]">{report.error}</p><button disabled={submitting} onClick={() => generate(report.company.symbol, report.statementType)} className="mt-4 rounded border border-[#D6AE62] px-4 py-2 text-sm text-[#D6AE62]">Generate again</button></section> : null}
    {report?.state === "ready" ? <PremiumReportDetail key={report.id} report={report} onDownload={download} downloading={downloading} onRefresh={() => generate(report.company.symbol, report.statementType)} refreshing={submitting} /> : null}

  </div></AdminShell>;
}
