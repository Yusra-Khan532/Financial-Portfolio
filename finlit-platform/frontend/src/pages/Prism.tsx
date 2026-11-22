// FinLit Prism (Gold): /prism finds a company, /prism/:symbol shows its stored rating or calculates one.
// Replaces the upstream admin "Premium Report" page: no CMS token, no browser-held snapshot. A calculation runs behind the page (POST with
// background: true, then GET /api/prism/jobs) and the page shows the stored rating when it is ready.
// The research API keeps the signed snapshot; the browser gets a PrismReport (task #220: no PDF and no download anywhere on the page).
import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Icon } from "../lib/icons";
import { Gate } from "../components/Gate";
import { PrismReportView, ReportSkeleton } from "../components/prism/ReportView";
import { LandingBody, PRISM_WHAT, Picker } from "../components/prism/pzr/Landing";
import { useAuth } from "../lib/auth";
import { PageFaqs } from "../components/PageFaqs";
import { PrismSecNav } from "../components/prism/pzr/Shell";
import { useGold } from "../lib/premium";
import {
  PRISM_NAME, PRISM_NOTE, cleanSymbol, prismProblem, progressFraction, pushPrismRecent, statementWord,
  useLatestPrism, usePrismCalculation, usePrismStatus, type PrismReport, type Problem, type Statement,
} from "../lib/prism";
import { useDocTitle } from "../lib/title";
import { PremiumHead } from "./Premium";
import { LogoLoader } from "../components/LogoLoader";
import { buttonClass } from "../components/ui";
import example from "../lib/__fixtures__/prismReport.json";

function Head({ children }: { children?: React.ReactNode }) {
  return <PremiumHead title={PRISM_NAME} art="rating" links={["/advanced-score-screener", "/research", "/compare"]}>{children ?? <>A company's <b>financial health</b>, split into four parts the way a prism splits light. {PRISM_NOTE}</>}</PremiumHead>;
}

function Locked({ symbol }: { symbol?: string }) {
  return (
    <>
      <Head />
      <div className="wrap" style={{ paddingBottom: 56 }}>
        <Gate tier="gold" title={`${PRISM_NAME} is part of Gold`} points={PRISM_WHAT}>
          <p className="pzr-small" style={{ margin: "0 0 12px" }}>Example only: a fictional company{symbol ? `, not ${symbol}` : ""}.</p>
          <div className="pzr-preview"><PrismReportView example report={example as unknown as PrismReport} /></div>
        </Gate>
      </div>
    </>
  );
}

function Landing() {
  useDocTitle(PRISM_NAME, "FinLit Prism: a company's financial health in four parts. For Gold members.");
  const [statement, setStatement] = useState<Statement>("consolidated");
  return <><Head /><LandingBody statement={statement} setStatement={setStatement} /></>;
}

/* ------------------------------------------------------------------ one company */
/** A problem in words. Not signed in (`p.signIn`): "Sign in (free)" and "Create a free account", each coming back to `back`, instead of a retry that cannot help (task #207). */
const Problem_ = ({ p, onRetry, retryLabel = "Try again", back }: { p: Problem; onRetry?: () => void; retryLabel?: string; back?: string }) => (
  <div className={"pzr-problem " + p.kind} role="alert"><Icon name="alert" /><div><b>{p.title}</b><p>{p.text}</p>
    {p.signIn && back ? <div className="pzr-signin">
      <Link className="btn primary" to={`/login?next=${encodeURIComponent(back)}`}>Sign in (free)</Link>
      <Link className="btn" to={`/login?mode=signup&next=${encodeURIComponent(back)}`}>Create a free account</Link></div>
      : onRetry && <button type="button" className="btn" onClick={onRetry}>{retryLabel}</button>}</div></div>
);

/** The honest wait: the seconds that have really passed and a bar that follows the usual time. Nothing moves in a loop. */
function Working({ since, expected }: { since: number; expected: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.round((now - since) / 1000));
  const pct = Math.round(progressFraction(s, expected) * 100);
  return (
    <div className="card pzr-card pzr-work">
      <div className="pzr-workbody">
        <LogoLoader size="md" label="Calculating the rating" />
        <b>Calculating the rating…</b>
        <p>Reading the financial statements, prices and the industry's valuations, and checking the inputs. This usually takes about {Math.max(5, Math.round(expected))} seconds. You can keep this page open: the rating appears here by itself.</p>
        <div className="pzr-prog" role="progressbar" aria-label="Calculation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
        <p className="pzr-small">{s} second{s === 1 ? "" : "s"} so far</p>
      </div>
    </div>
  );
}

function CompanyView({ symbol, statement, picker }: { symbol: string; statement: Statement; picker: React.ReactNode }) {
  const latest = useLatestPrism(symbol, statement), status = usePrismStatus(), { calc, start } = usePrismCalculation(symbol, statement);
  useEffect(() => { pushPrismRecent(symbol); }, [symbol]);
  const report = latest.data ?? null;
  const down = status.data && !status.data.available;
  const run = (refresh: boolean) => { void start(refresh); };
  // A company opened with no rating starts calculating by itself, once, so the next visit is instant (and this one shows it as soon as it is ready).
  const autoStarted = useRef("");
  useEffect(() => {
    const key = `${symbol}:${statement}`;
    if (latest.isLoading || latest.isError || latest.data !== null || down || calc.phase !== "idle" || autoStarted.current === key) return;
    autoStarted.current = key;
    void start(false);
  }, [latest.isLoading, latest.isError, latest.data, down, calc.phase, symbol, statement, start]);
  useDocTitle(report ? `${report.company.name} ${PRISM_NAME}` : `${symbol} ${PRISM_NAME}`, `FinLit Prism financial-health rating for ${symbol}.`);
  const busy = calc.phase === "working";
  // No stored rating: calculate it as soon as the page opens (once per company; a failure shows its message and a retry button).
  const autoRan = useRef("");
  useEffect(() => {
    if (!latest.isLoading && !latest.isError && !report && calc.phase === "idle" && !down && autoRan.current !== `${symbol}|${statement}`) { autoRan.current = `${symbol}|${statement}`; run(false); }
  }, [latest.isLoading, latest.isError, report, calc.phase, down, symbol, statement]);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="pzr-shell" aria-busy={busy || latest.isLoading}>
      {report && <PrismSecNav report={report} />}
      <div className="pzr-pagebar">
        {picker}
      </div>
      {down && <div className="pzr-problem unavailable" role="note"><Icon name="alert" /><div><b>{PRISM_NAME} is not connected right now</b><p>{status.data?.reason || "The rating service is unavailable."} Stored ratings may still open.</p></div></div>}
      {latest.isLoading && <ReportSkeleton />}
      {latest.isError && !busy && <Problem_ p={prismProblem(latest.error)} onRetry={() => latest.refetch()} back={`/prism/${encodeURIComponent(symbol)}`} />}
      {calc.phase === "failed" && <Problem_ p={calc.problem} onRetry={calc.retryable ? () => run(!!report) : undefined} retryLabel="Retry" />}
      {calc.phase === "working" && <Working since={calc.startedAt} expected={calc.expectedSeconds} />}
      {!latest.isLoading && !latest.isError && !report && calc.phase === "idle" && (
        <div className="card pzr-card pzr-empty-card">
          <div className="pzr-ico"><Icon name="prism" /></div>
          <h3>No {PRISM_NAME} rating for {symbol} yet</h3>
          <p>It is calculated from the company's latest filings and prices; this usually takes under half a minute. {statementWord(statement)} statements.</p>
          <button type="button" className={buttonClass("prism", "md")} disabled={!!down} onClick={() => run(false)}><Icon name="prism" />Generate the Prism rating</button>
          <p className="pzr-note">{PRISM_NOTE}</p>
        </div>
      )}
      {report && <PrismReportView key={report.id} report={report} actions={{ onRecalculate: () => run(true), recalculating: busy, }} />}
      {/* task #220 (README 1.2): the questions sit inside the report's container, so the sections bar stays on screen through them */}
      <PageFaqs inline />
    </div>
  );
}

export function PrismPage() {
  const { symbol: raw } = useParams();
  const gold = useGold(), { showcase, ready } = useAuth();
  const symbol = cleanSymbol(raw);
  const statement: Statement = "consolidated";   // FinLit Prism is requested on consolidated statements: there is no standalone choice (an old ?statement=standalone link opens the consolidated report)
  // The report itself may use the standalone statements (consolidated history too short or out of date, model 3.6.16+): the header names the basis
  // the shown report really uses, read from the same cached query the report view loads (no extra request).
  const shown = useLatestPrism(symbol || "", statement, !!symbol && (gold || showcase.includes(symbol))).data;
  const basis: Statement = shown?.statementType === "standalone" ? "standalone" : statement;
  if (!raw) return gold ? <Landing /> : <Locked />;
  // Task #207: until the account check answers, the showcase list is empty; showing <Locked> (a fictional sample) for that moment flashed the sample
  // before the showcase company's own report. Wait for the answer instead.
  if (!ready) return <><Head /><div className="wrap pzr-page" style={{ paddingBottom: 56 }}><ReportSkeleton /></div></>;
  if (!symbol) return <><Head /><div className="wrap" style={{ paddingBottom: 56 }}><div className="pm-empty"><b>That is not a company symbol.</b><p><Link to="/prism">Search for a company</Link></p></div></div></>;
  if (!gold && !showcase.includes(symbol)) return <Locked symbol={symbol} />;
  return (
    <>
      <Head>{symbol} · {statementWord(basis)} statements. <Link to="/prism">Another company</Link></Head>
      <div className="wrap pzr-page" style={{ paddingBottom: 56 }}>
        <CompanyView key={symbol + statement} symbol={symbol} statement={statement}
          picker={<Picker statement={statement} />} />
      </div>
    </>
  );
}
